/* ============================================================
   P-F #01 — HIDDEN SECTION (Confidential Student Module)
   • Principal only — Admin is completely locked out (UI + Firestore Rules)
   • Firestore paths: /hiddenStudents/  /hiddenFeeTransactions/
   • Independent fee recording with month-wise picker (same as main fee system)
   • Excluded from ALL global dashboard totals and exports
   • Students moved here via "Move to Hidden" in their profile
   ============================================================ */

// ── Session unlock helpers (same pattern as Terminated) ────────────────────
const _HIDDEN_UNLOCK_KEY    = 'sfms_hidden_unlocked';
const _HIDDEN_UNLOCK_EXPIRY = 30 * 60 * 1000; // 30 minutes

function _isHiddenUnlocked() {
  try {
    const raw = sessionStorage.getItem(_HIDDEN_UNLOCK_KEY);
    if (!raw) return false;
    const { at } = JSON.parse(raw);
    if (Date.now() - at > _HIDDEN_UNLOCK_EXPIRY) { sessionStorage.removeItem(_HIDDEN_UNLOCK_KEY); return false; }
    return true;
  } catch { return false; }
}
function _setHiddenUnlocked(val) {
  if (val) sessionStorage.setItem(_HIDDEN_UNLOCK_KEY, JSON.stringify({ at: Date.now() }));
  else sessionStorage.removeItem(_HIDDEN_UNLOCK_KEY);
}

// ── Main Hidden list view ───────────────────────────────────────────────────
async function renderHidden() {
  if (currentRole !== 'principal') {
    setContent('<div class="alert alert-danger" style="margin:24px">🔒 Hidden section is restricted to Principal only.</div>');
    return;
  }
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    const snap = await schoolCol('hiddenStudents').orderBy('addedAt','desc').get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    window._allHidden = list;
    if (typeof _stampCache === 'function') _stampCache('hidden');   // see search.js: never stamped

    // ══════════════════════════════════════════════════════════════════════════
    // ONE HEAL PASS, THROUGH THE ONE MAPPING.
    //
    // ITEM 05.3 added a pass for totalDue; ITEM 05.2's follow-on added a second for
    // amountPaid/outstandingBalance and re-did totalDue on the way past. Two passes
    // over the same list meant TWO _computeAllYearsFeeSnapshot calls per hidden
    // student on every render -- each of them two Firestore reads -- and two writes
    // to the same document, the second racing the first for totalDue.
    //
    // The field mapping is _flSnapshotPatch, which is already what
    // _flSyncSnapshotForStudent uses when the engine pushes a reconcile into this
    // collection. Both copies of that mapping lived here inline; they agree today
    // and a third definition of "which snapshot field lands on which record field"
    // is exactly how they stop agreeing.
    //
    // This heal is a BACKSTOP, not the primary path: _syncStudentFinancials already
    // syncs the frozen doc on every reconcile. It catches records written before
    // that existed, and renders where the push was denied.
    // ══════════════════════════════════════════════════════════════════════════
    try {
      await Promise.all(list.map(async r => {
        if (!r.studentId) return;
        const s2 = await _computeAllYearsFeeSnapshot(r.studentId);
        // Student deleted: the recompute came back 0/0/0 from no data at all. Writing
        // that in would erase this record's stored figures on a mere page view.
        if (s2 && s2.studentMissing) return;
        const patch = (typeof _flSnapshotPatch === 'function')
          ? _flSnapshotPatch(r, s2)
          : {};
        if (Object.keys(patch).length) {
          Object.assign(r, patch);
          _flHealSnapshotDoc('hiddenStudents', r.id, patch);   // F2: reports failure
        }
      }));
      // Identity marker, not a timestamp: the export path re-healed this same array
      // on every Download, paying two Firestore reads per student to recompute
      // figures already sitting in memory. Holding the ARRAY tells the two apart
      // exactly — window._allHidden is replaced wholesale on refetch and nulled on
      // every mutation (lines 204/548/587, delete-student, logout, and the staleness
      // TTL in search.js), so a stale cache can never satisfy this check.
      window._allHiddenHealed = list;
    } catch(_) { /* non-fatal */ }

    setContent(`
      <div class="page-head flex-between">
        <div>
          <div class="page-title" style="display:flex;align-items:center;gap:10px">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="2" width="22" height="22"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Hidden Students
            <span style="font-size:11px;padding:3px 10px;border-radius:6px;background:rgba(212,150,42,0.15);color:var(--warn);font-weight:600;font-family:sans-serif">CONFIDENTIAL</span>
          </div>
          <div class="page-sub">${list.length} student${list.length!==1?'s':''} in confidential section — dues sync to Profile Card, visible only in the Principal account.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="exportHiddenExcel()">📊 Export Excel</button>
          <button class="btn btn-secondary btn-sm" onclick="exportHiddenPDF()">📄 Export PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="renderHiddenFeeHistory()">📋 Fee History</button>
        </div>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Adm#</th><th>Block</th><th>Class</th><th>Section</th>
                  <th>Parent</th><th>Contact</th><th>Total Due<br><span style="font-weight:400;font-size:9px;color:var(--muted);text-transform:none">all years</span></th><th>Total Paid<br><span style="font-weight:400;font-size:9px;color:var(--muted);text-transform:none">all years</span></th><th>Outstanding<br><span style="font-weight:400;font-size:9px;color:var(--muted);text-transform:none">this year</span></th><th>Status</th><th>Added</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${list.length === 0
                  ? `<tr><td colspan="13" style="text-align:center;padding:40px;color:var(--muted)">No students in Hidden section.</td></tr>`
                  : list.map(s => {
                      const outstanding   = s.outstandingBalance || 0;   // CURRENT year only
                      // "Does this student still owe anything" is an all-years question.
                      // outstandingBalance on this record is now the current-year slice,
                      // so a student carrying only prior-year arrears would badge as
                      // Cleared and lose the Pay Dues button if it were asked of that.
                      const duesAllYears  = Number(s.totalDue) || 0;
                      return `
                      <tr>
                        <td><strong>${s.studentName || '—'}</strong></td>
                        <td class="muted">${s.admissionNumber || '—'}</td>
                        <td>${s.block || '—'}</td>
                        <td>${s.class || '—'}</td>
                        <td>${s.section || '—'}</td>
                        <td>${s.parentName || '—'}</td>
                        <td>${s.contact || '—'}</td>
                        <td style="${duesAllYears > 0 ? 'color:#e09090;font-weight:700' : ''}">₹${fmtNum(duesAllYears)}</td>
                        <td style="color:var(--gold-lt);font-weight:600">₹${fmtNum(s.amountPaid || 0)}</td>
                        <td style="${outstanding > 0 ? 'color:var(--danger);font-weight:700' : ''}">₹${fmtNum(outstanding)}</td>
                        <td>${duesAllYears > 0 ? '<span class="badge badge-red">Dues Pending</span>' : '<span class="badge badge-green">Cleared</span>'}</td>
                        <td style="font-size:11px;color:var(--muted)">${s.addedAt ? fmtDate(s.addedAt) : '—'}</td>
                        <td style="display:flex;gap:6px;align-items:center;padding:10px 14px">
                          ${duesAllYears > 0 && s.studentId
                            ? `<button class="btn btn-primary btn-sm" onclick="pushNav('recordFee',{studentId:'${s.studentId}',studentName:'${jsAttr(s.studentName)}',classSection:'${(s.class||'')+'  –  Section '+(s.section||'')}'})">Pay Dues</button>`
                            : `<span style="color:var(--muted);font-size:12px">—</span>`}
                          <!-- VLX-REF-008 FIX: View Profile shows full per-year fee cards for hidden students -->
                          ${s.studentId ? `<button class="btn btn-ghost btn-sm" style="border-color:rgba(74,158,202,0.4);color:var(--info);font-size:11px" onclick="pushNav('studentProfile',{id:'${s.studentId}'})">📋 View Profile</button>` : ''}
                          <button class="btn btn-sm" style="background:rgba(82,200,122,0.12);color:var(--success);border:1px solid rgba(82,200,122,0.3);font-size:11px" onclick="undoHiddenStudent('${s.id}','${jsAttr(s.studentName)}')">↩ Undo Hidden</button>
                          <button class="btn btn-sm" style="background:rgba(224,82,82,0.12);color:var(--danger);border:1px solid rgba(224,82,82,0.3);font-size:11px" onclick="removeHiddenStudent('${s.id}','${jsAttr(s.studentName)}')">🗑 Remove</button>
                        </td>
                      </tr>`;
                    }).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error loading Hidden section: ${e.message}</div>`);
  }
}

// ── Move a student from active roster to Hidden ─────────────────────────────
async function moveStudentToHidden(id, name) {
  if (currentRole !== 'principal') { showToast('Only Principal can move students to Hidden.', 'danger'); return; }
  showConfirm(
    'Move to Hidden Section',
    `Move <strong>${name}</strong> to the confidential Hidden section?<br><br>
     They will be hidden from all reports, dashboard totals, and Admin views.<br>
     This action can be reversed by the Principal at any time.`,
    async () => {
      try {
        const sDoc = await schoolCol('students').doc(id).get();
        if (!sDoc.exists) { showToast('Student not found.', 'danger'); return; }
        const s = sDoc.data();

        // ITEM 17: reconcile BEFORE snapshotting — same reasoning as termination.
        // The figures below are frozen into a hiddenStudents document that nothing
        // recomputes afterwards, so a stale aggregate at this instant becomes
        // permanent. Hidden explicitly promises the Principal full visibility, which
        // makes a frozen wrong number worse here than almost anywhere else.
        if (typeof _flReconcile === 'function') await _flReconcile(id, 'hidden_snapshot');

        // Compute financials — ALL years, excused-aware. Was current-year-only, which froze a
        // ₹0 snapshot for any student whose dues are prior-year or who has no transactions.
        const { totalPaid, outstanding, totalDue } = await _computeAllYearsFeeSnapshot(id);

        // F8: reuse this student's existing hiddenStudents record if one survived a
        // failed un-hide. One student on the live roll went through six hide/undo cycles
        // in a single evening; every one of them relied on the delete landing.
        const _hidRef = await _flSnapshotRef('hiddenStudents', id, 'HIDE');
        await _hidRef.set({
          studentId:       id,
          studentName:     s.name,
          admissionNumber: s.admissionNumber,
          block:           s.block || '',
          class:           s.class || '',
          section:         s.section || '',
          parentName:      s.parentName || '',
          contact:         s.contact || '',
          gender:          s.gender || '',
          // [CHG-020] rollNumber removed
          totalDue:        totalDue,
          amountPaid:      totalPaid,
          outstandingBalance: outstanding,
          movedBy:         currentUser.uid,
          movedByName:     currentProfile?.name || 'Principal',
          addedAt:         firebase.firestore.Timestamp.now(),
        });

        // Mark original student record as hidden
        await schoolCol('students').doc(id).update({ status: 'hidden' });

        invalidateStudentCache();
        invalidateFinanceCache();
        window._allHidden = null;
        auditLog('student_moved_to_hidden', { studentId: id, studentName: name });
        showToast(`${name} moved to Hidden section.`, 'success');
        navigate('hidden');
      } catch(e) { showToast('Error: ' + e.message, 'danger'); }
    }
  );
}

// ── Hidden Fee History — all transactions for all hidden students ──────────
async function renderHiddenFeeHistory() {
  if (currentRole !== 'principal') { showToast('Restricted to Principal.','danger'); return; }
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    const snap = await schoolCol('feeTransactions').where('isHiddenPayment','==',true).orderBy('date','desc').get();
    const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    setContent(`
      <div class="page-head flex-between" style="margin-bottom:20px">
        <div>
          <div class="page-title" style="display:flex;align-items:center;gap:10px">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Hidden Students — Fee History
            <span style="font-size:11px;padding:3px 10px;border-radius:6px;background:rgba(212,150,42,0.15);color:var(--warn);font-weight:600;font-family:sans-serif">CONFIDENTIAL</span>
          </div>
          <div class="page-sub">${txs.length} transaction${txs.length!==1?'s':''} — hidden fee ledger only</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('hidden')">← Back to Hidden Students</button>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Receipt #</th><th>Student</th><th>Adm#</th><th>Class</th>
                  <th>Months Paid</th><th>Amount</th><th>Mode</th><th>Date</th><th>Recorded By</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${txs.length === 0
                  ? `<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--muted)">No fee transactions recorded for hidden students yet.</td></tr>`
                  : txs.map(t => `
                  <tr>
                    <td class="muted" style="font-size:11px">${sanitizeHTML(t.receiptNumber||'—')}</td>
                    <td><strong>${sanitizeHTML(t.studentName||'—')}</strong></td>
                    <td class="muted">${sanitizeHTML(t.admissionNumber||'—')}</td>
                    <td>${sanitizeHTML(t.studentClass||'—')}</td>
                    <td style="font-size:12px;color:var(--gold-lt)">${Array.isArray(t.monthsPaid) ? t.monthsPaid.join(', ') : (Array.isArray(t.monthsSelected) ? t.monthsSelected.join(', ') : (t.monthsDue ? t.monthsDue+' month(s)' : '—'))}</td>
                    <td><strong>₹${fmtNum(t.amountPaid||0)}</strong></td>
                    <td>${sanitizeHTML(t.paymentMode||'—')}</td>
                    <td>${fmtDate(t.date)}</td>
                    <td class="muted" style="font-size:11px">${sanitizeHTML(t.recordedByName||'—')}</td>
                    <td>
                      <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="viewHiddenReceipt(${JSON.stringify(t).replace(/"/g,'&quot;')})">🧾 Receipt</button>
                    </td>
                  </tr>`).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error loading hidden fee history: ${e.message}</div>`);
  }
}

function viewHiddenReceipt(tx) {
  if (typeof tx === 'string') { try { tx = JSON.parse(tx); } catch { return; } }

  const overlayId = 'hidReceiptOverlay';
  const existing  = document.getElementById(overlayId);
  if (existing) existing.remove();

  const _hMonths = Array.isArray(tx.monthsPaid) ? tx.monthsPaid : (Array.isArray(tx.monthsSelected) ? tx.monthsSelected : null);
  const monthsLabel = _hMonths ? _hMonths.join(', ') + ` (${_hMonths.length} month${_hMonths.length>1?'s':''})` : (tx.monthsDue ? tx.monthsDue + ' month(s)' : '—');

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--glass-border);border-radius:14px;max-width:480px;width:100%;padding:0;box-shadow:0 24px 60px rgba(0,0,0,0.65);overflow:hidden">
      <div class="receipt-box" style="display:block;margin:0;border-radius:0;border:none">
        <div class="receipt-hdr">
          <div class="receipt-logo">${currentProfile?.schoolName || currentSchoolId || 'School'}</div>
          <div class="receipt-sub">Powered by Veltrix Campus &middot; JSS</div>
          <div class="receipt-title">CONFIDENTIAL FEE RECEIPT</div>
        </div>
        <div style="margin-bottom:14px">
          <div class="r-row"><span class="r-lbl">Student Name</span><span class="r-val">${sanitizeHTML(tx.studentName||'—')}</span></div>
          <div class="r-row"><span class="r-lbl">Class</span><span class="r-val">${sanitizeHTML(tx.studentClass||'—')}</span></div>
          <div class="r-row"><span class="r-lbl">Admission No</span><span class="r-val">${sanitizeHTML(tx.admissionNumber||'—')}</span></div>
          <div class="r-row"><span class="r-lbl">Status</span><span class="r-val" style="color:var(--warn)">Confidential</span></div>
        </div>
        <div>
          <div class="r-row"><span class="r-lbl">Fee Head</span><span class="r-val">${sanitizeHTML(tx.feeHead||'Monthly Tuition Fee')}</span></div>
          <div class="r-row"><span class="r-lbl">Months Paid</span><span class="r-val" style="color:var(--gold-lt)">${sanitizeHTML(monthsLabel)}</span></div>
          <div class="r-row"><span class="r-lbl">Payment Mode</span><span class="r-val">${sanitizeHTML(tx.paymentMode||'—')}</span></div>
          <div class="r-row"><span class="r-lbl">Date</span><span class="r-val">${fmtDate(tx.date)}</span></div>
          <div class="r-row"><span class="r-lbl">Remaining Outstanding</span>
            <span class="r-val" style="${(tx.remainingBalance || 0) > 0 ? 'color:var(--danger)' : 'color:var(--success)'}">₹${fmtNum(tx.remainingBalance || 0)}</span>
          </div>
          <div class="r-row" style="font-size:11px;color:var(--muted)"><span>Amount in Words</span><span>${sanitizeHTML(tx.amountInWords||'')}</span></div>
        </div>
        <div class="receipt-total">Amount Paid: ₹${fmtNum(tx.amountPaid||0)}</div>
        <div style="margin-top:14px;text-align:center;font-size:11px;color:var(--muted)">
          Recorded by: ${sanitizeHTML(tx.recordedByName||'Principal')} · ${fmtDate(tx.date)}
        </div>
        <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border);text-align:center">
          <div style="font-size:10px;color:var(--muted);letter-spacing:0.5px">Powered by</div>
          <div style="font-size:11px;font-weight:600;color:var(--silver-lt);letter-spacing:0.8px;font-family:'Cinzel',serif">Jeelan's Software &amp; Solutions</div>
          <div style="font-size:9px;color:var(--faint);margin-top:1px">Digitalize · Innovate · Elevate</div>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;padding-bottom:4px">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('${overlayId}').remove();printReceipt()">🖨 Print</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('${overlayId}').remove()">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ── Hidden section exports (PDF + Excel) — NEVER included in global exports ─
// ════════════════════════════════════════════════════════════════════════════
// R3/R5 — THE HIDDEN EXPORT HANDED OUT A FROZEN OUTSTANDING.
//
// hiddenStudents.outstandingBalance is frozen at hide-time. The Hidden SCREEN
// heals it in memory on every render (see the two self-heal blocks at the top of
// this file), but the exports read window._allHidden straight from Firestore with
// no recompute — so a spreadsheet handed to an auditor could disagree with the
// same figure in the app, which is exactly the artefact people file and trust.
//
// The Terminated export already got this treatment (export.js). This mirrors it:
// recompute in memory from the authoritative snapshot before building the export.
// Read-only — the export must not write to Firestore as a side effect of Download;
// the screen's own heal persists the correction when it next renders.
// ════════════════════════════════════════════════════════════════════════════
async function _hiddenExportRows() {
  if (!window._allHidden) {
    const snap = await schoolCol('hiddenStudents').orderBy('addedAt','desc').get();
    window._allHidden = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (typeof _stampCache === 'function') _stampCache('hidden');
  }
  // renderHidden() heals these rows in memory and persists the patch. When the cache
  // it healed is still the live one, recomputing here reaches the same figures at a
  // cost of two Firestore reads per hidden student, every Download.
  const _healedAlready = window._allHiddenHealed === window._allHidden;

  if (!_healedAlready && typeof _computeAllYearsFeeSnapshot === 'function') {
    await Promise.all(window._allHidden.map(async r => {
      if (!r.studentId) return;
      try {
        const s2 = await _computeAllYearsFeeSnapshot(r.studentId);
        // Same rule as the render-time heals above and the Terminated export: a deleted
        // student yields 0/0/0 from no data, and the stored figure is the only record
        // left of what they owed. In-memory only here, so nothing is lost — but the
        // export would still print a zero that was never true.
        if (s2 && s2.studentMissing) return;
        // Through _flSnapshotPatch, the same mapping every other heal uses. In-memory
        // only here — the export must not write to the archive.
        if (typeof _flSnapshotPatch === 'function') Object.assign(r, _flSnapshotPatch(r, s2));
      } catch(_) { /* leave the stored figure for this one record */ }
    }));
  } else if (!_healedAlready) {
    console.warn('[HIDDEN EXPORT] _computeAllYearsFeeSnapshot unavailable — outstanding ' +
                 'figures in this export are the stored ones and may be stale.');
  }
  return window._allHidden;
}

async function exportHiddenPDF() {
  if (currentRole !== 'principal') { showToast('Export restricted to Principal.','danger'); return; }
  const list = await _hiddenExportRows();
  if (!list.length) { showToast('No hidden student records found.','warning'); return; }
  exportSimplePDF('Hidden Students — CONFIDENTIAL',
    ['Block','Name','Adm#','Class','Section','Parent','Contact','Total Due (all yrs)','Total Paid','Outstanding (this yr)','Status'],
    list.map(s=>[
      s.block||'—', s.studentName, s.admissionNumber, s.class, s.section,
      s.parentName||'—', s.contact||'—',
      // INR, not the rupee sign — jsPDF's Helvetica has no U+20B9 glyph. Same fix
      // as every other PDF export (cae6fc9); hidden.js has its own export functions
      // that the global sweep did not reach.
      'INR '+fmtNum(s.totalDue||0), 'INR '+fmtNum(s.amountPaid||0), 'INR '+fmtNum(s.outstandingBalance||0),
      (s.totalDue||0)>0?'Dues Pending':'Cleared'
    ]));
  showToast(`PDF exported — ${list.length} hidden student${list.length!==1?'s':''}.`, 'success');   // R4
}

async function exportHiddenExcel() {
  if (currentRole !== 'principal') { showToast('Export restricted to Principal.','danger'); return; }
  const list = await _hiddenExportRows();
  if (!list.length) { showToast('No hidden student records found.','warning'); return; }
  exportXLS([
    ['Block','Name','Adm#','Class','Section','Parent','Contact','Total Due (all yrs)','Total Paid','Outstanding (this yr)','Status','Added On'],
    ...list.map(s=>[
      s.block||'—', s.studentName, s.admissionNumber,
      s.class, s.section, s.parentName||'—', s.contact||'—',
      s.totalDue||0, s.amountPaid||0, s.outstandingBalance||0,
      (s.totalDue||0)>0?'Dues Pending':'Cleared',
      fmtDate(s.addedAt)
    ])
  ], 'Hidden_Students_CONFIDENTIAL');
  showToast(`Excel exported — ${list.length} hidden student${list.length!==1?'s':''}.`, 'success');   // R4
}
/* END P-F #01 — HIDDEN SECTION */

/* ============================================================
   P-H #06 — REMOVE FROM TERMINATED & HIDDEN (Principal Only)
   • Two-step confirmation: first warn → then type DELETE to proceed
   • Grade-10 legacy students in Terminated are read-only — cannot be removed
   • Hidden: removes student doc + all associated hiddenFeeTransactions via batch
   • Terminated: removes terminatedStudents doc (main feeTransactions preserved for audit)
   • Admin has zero access — no Remove button rendered anywhere
   ============================================================ */

function showRemoveConfirm(title, warningHtml, onConfirmed) {
  const overlayId = 'removeConfirmOverlay';
  const existing = document.getElementById(overlayId);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid rgba(224,82,82,0.35);border-radius:14px;max-width:440px;width:100%;padding:28px;box-shadow:0 24px 60px rgba(0,0,0,0.6)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="width:44px;height:44px;border-radius:50%;background:rgba(224,82,82,0.12);border:1.5px solid rgba(224,82,82,0.35);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">⚠️</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--danger)">${title}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">This action is irreversible</div>
        </div>
      </div>
      <div style="font-size:13px;color:var(--silver-lt);line-height:1.6;margin-bottom:20px">${warningHtml}</div>
      <div style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:8px;padding:14px;margin-bottom:20px">
        <div style="font-size:12px;color:var(--danger);font-weight:600;margin-bottom:8px">Type <strong>DELETE</strong> below to confirm permanent removal:</div>
        <input id="removeConfirmInput" type="text" placeholder="Type DELETE here" autocomplete="off"
          style="width:100%;background:var(--depth);border:1px solid rgba(224,82,82,0.3);border-radius:6px;padding:8px 12px;color:var(--text);font-size:13px;font-weight:600;letter-spacing:1px;outline:none;box-sizing:border-box"
          oninput="var btn=document.getElementById('removeConfirmProceedBtn');btn.disabled=this.value.trim()!=='DELETE';btn.style.opacity=this.value.trim()==='DELETE'?'1':'0.45';">
      </div>
      <div style="display:flex;gap:10px">
        <button id="removeConfirmProceedBtn" disabled
          style="flex:1;padding:10px;background:rgba(224,82,82,0.15);color:var(--danger);border:1px solid rgba(224,82,82,0.4);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;opacity:0.45;transition:opacity 0.2s"
          onclick="document.getElementById('removeConfirmOverlay').remove(); window._pendingRemoveFn && window._pendingRemoveFn();">
          🗑 Permanently Remove
        </button>
        <button onclick="document.getElementById('removeConfirmOverlay').remove();"
          style="padding:10px 20px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">
          Cancel
        </button>
      </div>
    </div>
  `;
  window._pendingRemoveFn = onConfirmed;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('removeConfirmInput')?.focus(), 80);
}

async function removeTerminatedStudent(id, name) {
  if (currentRole !== 'principal') { showToast('Only Principal can remove terminated students.','danger'); return; }
  const student = (window._terminatedData||[]).find(s=>s.id===id);
  if (student && (student.class||'').toString().startsWith('10')) {
    showToast('Grade-10 legacy students are preserved as school history and cannot be removed.','warning');
    return;
  }
  showRemoveConfirm(
    'Remove Terminated Student',
    `You are about to <strong style="color:var(--danger)">permanently delete</strong> the terminated record for:<br><br>
     <strong>${sanitizeHTML(name)}</strong><br><br>
     The record will be removed from Terminated Students. Fee transactions in the main ledger are preserved for audit.<br><br>
     <span style="color:var(--danger);font-weight:600">⚠ This cannot be undone.</span>`,
    async () => {
      try {
        await schoolCol('terminatedStudents').doc(id).delete();
        window._allTerminated = null;
        window._terminatedData = null;
        auditLog('terminated_student_removed', { studentId: id, studentName: name });
        showToast(`${name} permanently removed from Terminated section.`, 'success');
        navigate('terminated');
      } catch(e) { showToast('Error: ' + e.message, 'danger'); }
    }
  );
}

// ITEM 05.4: Undo Terminate — restores the student to the Active list in one action.
// The terminatedStudents tracking doc is removed (it only exists to drive this list view);
// the student's complete feeTransactions history is untouched and keyed by studentId
// regardless of status, so nothing historical is lost — same "preserved for audit"
// guarantee removeTerminatedStudent() already relies on.
async function undoTerminateStudent(id, name) {
  if (currentRole !== 'principal') { showToast('Only Principal can undo a termination.','danger'); return; }
  const record = (window._terminatedData||[]).find(s=>s.id===id);
  if (record && (record.class||'').toString().startsWith('10')) {
    showToast('Grade-10 legacy students are preserved as school history and cannot be restored this way.','warning');
    return;
  }
  showConfirm(
    'Undo Terminate',
    `Restore <strong>${sanitizeHTML(name)}</strong> to the Active student list?<br><br>
     Their complete fee and academic history is preserved intact — nothing is lost.`,
    async () => {
      try {
        const termDoc = await schoolCol('terminatedStudents').doc(id).get();
        if (!termDoc.exists) { showToast('Terminated record not found — may already be removed.', 'danger'); return; }
        const studentId = termDoc.data().studentId;
        if (!studentId) { showToast('Cannot restore — original student record link is missing.', 'danger'); return; }

        const batch = db.batch();
        batch.update(schoolCol('students').doc(studentId), { status: 'active' });
        batch.delete(schoolCol('terminatedStudents').doc(id));
        await batch.commit();

        // ITEM 17 names "undo" explicitly. A restored student re-enters every active
        // aggregate — Due Fee, Dashboard, Rolling Dues — and their stored figures may
        // be however stale they were when the termination snapshot was taken, or older
        // still if rates changed while they sat in Terminated. Recompute on the way
        // back in, so they rejoin the active roll with live numbers.
        if (typeof _flReconcile === 'function') await _flReconcile(studentId, 'undo_termination');

        invalidateStudentCache();
        invalidateFinanceCache();
        window._allTerminated = null;
        window._terminatedData = null;
        auditLog('student_undo_terminate', { studentId, studentName: name });
        showToast(`${name} restored to Active students.`, 'success');
        navigate('terminated');
      } catch(e) { showToast('Error: ' + e.message, 'danger'); }
    }
  );
}

async function removeHiddenStudent(id, name) {
  if (currentRole !== 'principal') { showToast('Only Principal can remove hidden students.','danger'); return; }
  showRemoveConfirm(
    'Remove Hidden Student',
    `You are about to <strong style="color:var(--danger)">permanently delete</strong> the hidden record for:<br><br>
     <strong>${sanitizeHTML(name)}</strong><br><br>
     This deletes the student record <strong>and all associated hidden fee transactions</strong> from Firestore. This data is gone completely — it is not recoverable.<br><br>
     <span style="color:var(--danger);font-weight:600">⚠ This cannot be undone.</span>`,
    async () => {
      try {
        const txSnap = await schoolCol('hiddenFeeTransactions').where('hiddenStudentId','==',id).get();
        const batch = db.batch();
        txSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(schoolCol('hiddenStudents').doc(id));
        await batch.commit();
        window._allHidden = null;
        auditLog('hidden_student_removed', { hiddenId: id, studentName: name });
        showToast(`${name} permanently removed from Hidden section.`, 'success');
        navigate('hidden');
      } catch(e) { showToast('Error: ' + e.message, 'danger'); }
    }
  );
}
// ITEM 05.4: Undo Hidden — restores the student to the Active list in one action.
// Only the hiddenStudents tracking doc is removed; feeTransactions history (including
// any isHiddenPayment-flagged past entries from their time in Hidden) is left exactly
// as-is for audit continuity — new transactions simply stop being flagged once
// students/{id}.status is back to 'active' (see the isHiddenPayment write-gate in
// the payment-recording engine).
async function undoHiddenStudent(id, name) {
  if (currentRole !== 'principal') { showToast('Only Principal can undo a Hidden move.','danger'); return; }
  showConfirm(
    'Undo Hidden',
    `Restore <strong>${sanitizeHTML(name)}</strong> to the Active student list?<br><br>
     They will re-appear in dashboard totals, reports, and Admin views. Their fee history is preserved intact.`,
    async () => {
      try {
        const hiddenDoc = await schoolCol('hiddenStudents').doc(id).get();
        if (!hiddenDoc.exists) { showToast('Hidden record not found — may already be removed.', 'danger'); return; }
        const studentId = hiddenDoc.data().studentId;
        if (!studentId) { showToast('Cannot restore — original student record link is missing.', 'danger'); return; }

        const batch = db.batch();
        batch.update(schoolCol('students').doc(studentId), { status: 'active' });
        batch.delete(schoolCol('hiddenStudents').doc(id));
        await batch.commit();

        // ITEM 17 ("undo"): same as undoTerminateStudent — the student rejoins every
        // active aggregate and must do so with live figures, not whatever was stored
        // when they were hidden.
        if (typeof _flReconcile === 'function') await _flReconcile(studentId, 'undo_hidden');

        invalidateStudentCache();
        invalidateFinanceCache();
        window._allHidden = null;
        auditLog('student_undo_hidden', { studentId, studentName: name });
        showToast(`${name} restored to Active students.`, 'success');
        navigate('hidden');
      } catch(e) { showToast('Error: ' + e.message, 'danger'); }
    }
  );
}
/* END P-H #06 — REMOVE FROM TERMINATED & HIDDEN */

