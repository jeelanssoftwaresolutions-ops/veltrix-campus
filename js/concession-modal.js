/* ============================================================
   ADD CONCESSION MODAL  — Principal only
   Writes to schoolCol('concessionFees') with all fields
   matching what the rest of the app reads.
   ============================================================ */
window._acmSel   = null;   // selected student object
let   _acmTimer  = null;   // debounce handle

function openAddConcessionModal() {
  if (currentRole !== 'principal') { showToast('Only the Principal can add concessions.','danger'); return; }
  document.getElementById('_acmModal')?.remove();

  const el = document.createElement('div');
  el.id = '_acmModal';
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px';
  el.innerHTML = `
    <div style="background:var(--glass-bg);backdrop-filter:blur(var(--glass-blur-lg));border:1px solid var(--glass-border);border-radius:var(--rad-lg);width:100%;max-width:540px;max-height:92vh;overflow-y:auto;box-shadow:var(--glass-shadow);animation:modalIn .22s ease">
      <div style="padding:18px 22px;border-bottom:1px solid var(--glass-border);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;color:var(--text)">Add Concession</div>
          <div style="font-size:12px;color:var(--muted)">Set a custom monthly fee for a student</div>
        </div>
        <button onclick="document.getElementById('_acmModal').remove()" style="background:none;border:none;color:var(--muted);font-size:26px;cursor:pointer;line-height:1">&times;</button>
      </div>
      <div style="padding:22px">
        <!-- search -->
        <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">Step 1 — Search Student</div>
        <div style="position:relative">
          <input id="_acmQ" class="form-control" type="text" placeholder="Name or admission number…" oninput="_acmSearch(this.value)" autocomplete="off">
          <div id="_acmSpinner" style="display:none;position:absolute;right:12px;top:50%;transform:translateY(-50%)"><div class="spinner" style="width:16px;height:16px;border-width:2px"></div></div>
        </div>
        <div id="_acmDrop" style="display:none;border:1px solid var(--glass-border);border-top:none;border-radius:0 0 var(--rad) var(--rad);background:var(--panel);max-height:200px;overflow-y:auto"></div>
        <!-- selected student -->
        <div id="_acmCard" style="display:none;margin-top:14px;padding:14px;background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);border-radius:var(--rad)">
          <div style="display:flex;gap:12px;align-items:center">
            <div id="_acmAv" style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dim),var(--gold));display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div id="_acmName" style="font-size:14px;font-weight:700;color:var(--text)"></div>
              <div id="_acmMeta" style="font-size:11px;color:var(--muted);margin-top:2px"></div>
            </div>
            <button onclick="_acmClear()" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;flex-shrink:0">&times;</button>
          </div>
          <div style="margin-top:12px;display:flex;gap:24px;padding-top:10px;border-top:1px solid var(--glass-border-lt)">
            <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Standard Fee</div><div id="_acmStd" style="font-size:17px;font-weight:700;color:var(--silver-lt)">—</div></div>
            <div style="color:var(--muted);align-self:center">→</div>
            <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Fee After Concession</div><div id="_acmNew" style="font-size:17px;font-weight:700;color:var(--gold-lt)">—</div></div>
            <div id="_acmSave" style="align-self:center;font-size:12px;font-weight:600;color:var(--success);margin-left:auto"></div>
          </div>
          <div id="_acmExist" style="display:none;margin-top:10px;padding:8px 12px;background:rgba(224,140,42,0.12);border:1px solid rgba(224,140,42,0.3);border-radius:8px;font-size:12px;color:#e8a050"></div>
        </div>
        <!-- fee inputs -->
        <div id="_acmStep2" style="display:none;margin-top:18px">
          <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;padding-top:14px;border-top:1px solid var(--glass-border)">Step 2 — Set Concession</div>
          <div class="form-row" style="margin-bottom:8px">
            <div>
              <label class="form-label">Concession Amount (₹ discount) *</label>
              <div style="font-size:11px;color:var(--muted);margin-bottom:6px">Amount to waive — e.g. type ₹700 so ₹1,700 → operative ₹1,000</div>
              <input id="_acmFee" class="form-control" type="number" min="0" step="50" placeholder="e.g. 700" oninput="_acmCalc()">
            </div>
            <div>
              <label class="form-label">Effective From</label>
              <input id="_acmDate" class="form-control" type="date">
            </div>
          </div>
          <div id="_acmCalcPreview" style="display:none;margin-bottom:12px;padding:8px 12px;background:rgba(201,168,76,0.10);border:1px solid rgba(201,168,76,0.25);border-radius:8px;font-size:13px;color:var(--gold-lt)"></div>
          <div style="margin-bottom:14px">
            <label class="form-label">Reason / Remarks (optional)</label>
            <textarea id="_acmReason" class="form-control" rows="2" placeholder="e.g. Staff ward, scholarship…" style="resize:vertical"></textarea>
          </div>

          <!-- Step 3 — Active Months -->
          <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;padding-top:14px;border-top:1px solid var(--glass-border)">Step 3 — Active Months <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(optional — leave blank for indefinite)</span></div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Tick the months this concession applies to. Unticked months will charge the standard fee.</div>
          <!-- ITEM-6 FIX: "Select All" / "Clear All" controls removed above the month pill
               grid per refinement request — months must be ticked individually. -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span id="_acmAcYearLabel" style="font-size:12px;font-weight:600;color:var(--silver-lt)"></span>
          </div>
          <div id="_acmMonthGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:4px"></div>
          <div id="_acmMonthSummary" style="font-size:11px;color:var(--muted);margin-top:8px;min-height:16px"></div>
        </div>
      </div>
      <!-- footer — alert + buttons always visible -->
      <div id="_acmAlertBox" style="padding:0 22px 0"></div>
      <div style="padding:14px 22px;border-top:1px solid var(--glass-border);display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('_acmModal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="_acmDoSave()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Concession
        </button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', ev => { if (ev.target === el) el.remove(); });

  // set today
  const t = nowIST(); /* ITEM 01 FIX */ const mm = String(t.getMonth()+1).padStart(2,'0'); const dd = String(t.getDate()).padStart(2,'0');
  const todayStr = `${t.getFullYear()}-${mm}-${dd}`;
  document.getElementById('_acmDate').value = todayStr;

  // init month grid state — grid will be rendered after student is picked
  // so that locked months from existing concession are set BEFORE first render
  window._acmMonthSel     = {};
  window._acmLockedMonths = [];

  setTimeout(() => document.getElementById('_acmQ')?.focus(), 80);
}

function _acmAlert(msg, type) {
  const box = document.getElementById('_acmAlertBox');
  if (!box) { showToast(msg, type || 'danger'); return; }
  box.innerHTML = msg
    ? `<div class="alert alert-${type||'danger'}" style="margin:0 0 14px">${msg}</div>`
    : '';
}

async function _acmSearch(q) {
  const drop = document.getElementById('_acmDrop');
  const spin = document.getElementById('_acmSpinner');
  if (!drop) return;
  q = (q||'').trim();
  if (q.length < 2) { drop.style.display='none'; drop.innerHTML=''; return; }
  if (spin) spin.style.display='block';
  clearTimeout(_acmTimer);
  _acmTimer = setTimeout(async () => {
    try {
      // Primary: student cache (all students, no status filter in getStudentCache)
      let list = [];
      try { list = await getStudentCache(); } catch(_) {}
      // Fallback: direct fetch if cache empty
      if (!list.length) {
        try {
          const s = await schoolCol('students').get();
          list = s.docs.map(d => ({id:d.id,...d.data()}));
        } catch(_) {}
      }
      const lq = q.toLowerCase();
      // R6: terminated and hidden students are selectable — see the note on the
      // status guard below. The status is shown on each row so the Principal is
      // never choosing one by accident.
      const hits = list.filter(s =>
        (s.name||'').toLowerCase().includes(lq) ||
        (s.admissionNumber||'').toLowerCase().includes(lq)
      ).slice(0,12);

      drop.innerHTML = hits.length
        ? hits.map(s => {
            const adm = s.admissionNumber || '—';
            const cls = (s.class||s.cls||'') + (s.section ? ' '+s.section : '');
            // R6: the list now includes terminated/hidden students, so each row must
            // say so. Without this they look identical to an active student.
            const _st = String(s.status||'active').toLowerCase();
            const _stBadge = _st !== 'active'
              ? `<span style="font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:2px 6px;border-radius:4px;margin-left:6px;background:rgba(224,82,82,0.15);color:var(--danger);border:1px solid rgba(224,82,82,0.30)">${sanitizeHTML(_st)}</span>`
              : '';
            return `<div onclick="_acmPick('${s.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--glass-border-lt);display:flex;gap:10px;align-items:center;transition:background .12s"
              onmouseover="this.style.background='rgba(201,168,76,0.10)'" onmouseout="this.style.background=''">
              <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dim),var(--gold));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${(s.name||'?')[0].toUpperCase()}</div>
              <div><div style="font-size:13px;font-weight:600;color:var(--text)">${sanitizeHTML(s.name||'—')}${_stBadge}</div>
              <div style="font-size:11px;color:var(--muted)">${sanitizeHTML(adm)} · ${sanitizeHTML(cls)} ${s.block?'· '+s.block:''}</div></div>
            </div>`;
          }).join('')
        : `<div style="padding:14px;text-align:center;font-size:13px;color:var(--muted)">No students found</div>`;
      drop.style.display = 'block';
    } finally {
      if (spin) spin.style.display='none';
    }
  }, 300);
}

async function _acmPick(sid) {
  document.getElementById('_acmDrop').style.display = 'none';
  window._acmSel = null;

  let list = [];
  try { list = await getStudentCache(); } catch(_) {}
  if (!list.length) {
    try { const s=await schoolCol('students').get(); list=s.docs.map(d=>({id:d.id,...d.data()})); } catch(_) {}
  }
  const s = list.find(x => x.id === sid);
  if (!s) return;

  // R6: was a hard block. A departed student who still owes money is exactly who a
  // concession or write-off is for, and the app already lets you take their payment
  // from the Terminated and Hidden screens. Warn instead of refuse — the Principal
  // should know the student is not on the active roll, then decide.
  if (s.status && s.status !== 'active') {
    _acmAlert(`ℹ️ ${s.name || 'This student'} is ${s.status}, not on the active roll. ` +
              `A concession still applies to what they owe — their Due Fee, the ${s.status} ` +
              `section and its exports all update together.`, 'warning');
  }

  const admNo      = s.admissionNumber || '';
  const cls        = s.class || s.cls  || '';
  const sec        = s.section || '';
  const blk        = s.block   || '';
  const parentName = s.parentName || s.parent || s.fatherName || '';
  const stdFee     = getFeeSchedule()[cls] || 0;

  // check existing concession
  let existDocId = null, existFee = null, existActiveMonths = [];
  if (admNo) {
    try {
      const cs = await schoolCol('concessionFees').where('admissionNo','==',admNo).limit(1).get();
      if (!cs.empty) {
        const cData = cs.docs[0].data();
        existDocId     = cs.docs[0].id;
        existFee       = cData.concessionFee;
        existActiveMonths = Array.isArray(cData.activeMonths) ? cData.activeMonths : [];
      }
    } catch(_) {}
  }

  window._acmSel = { id:sid, name:s.name, admNo, cls, sec, blk, parentName, stdFee, existDocId };

  // Populate UI first so Step2 div is visible before month grid renders
  const qi = document.getElementById('_acmQ');
  if (qi) qi.value = s.name || '';

  document.getElementById('_acmAv').textContent   = (s.name||'?')[0].toUpperCase();
  document.getElementById('_acmName').textContent = s.name || '—';
  document.getElementById('_acmMeta').textContent =
    [admNo ? 'Adm# '+admNo : '', cls+(sec?' '+sec:''), blk ? 'Block: '+blk : ''].filter(Boolean).join(' · ');
  document.getElementById('_acmStd').textContent  = '₹'+fmtNum(stdFee);
  document.getElementById('_acmNew').textContent  = '—';
  document.getElementById('_acmSave').textContent = '';

  const ex = document.getElementById('_acmExist');
  if (existDocId) {
    ex.style.display='block';
    ex.innerHTML = `⚠️ Already has a concession of <strong>₹${fmtNum(existFee)}/month</strong> — saving will update it.`;
  } else { ex.style.display='none'; }

  const fi = document.getElementById('_acmFee');
  if (fi) fi.value = existFee != null ? existFee : '';

  document.getElementById('_acmCard').style.display  = 'block';
  document.getElementById('_acmStep2').style.display = 'block';
  _acmCalc();

  // SET LOCKS THEN RENDER — no setTimeout, direct synchronous call so there is
  // zero chance of _acmInitMonthYear() overwriting locks after the fact.
  window._acmMonthSel     = {};
  window._acmLockedMonths = [];
  window._acmClosedMonths = {};   // recomputed by the closed-month guard below, per student
  if (existActiveMonths.length > 0) {
    existActiveMonths.forEach(k => { window._acmMonthSel[k] = true; });
    window._acmLockedMonths = existActiveMonths.slice();
  }
  _acmInitMonthYear(); // renders grid with locks already in place

  // JSS-REF-VELTRIX-2026-004 — CLOSED-MONTH GUARD for the concession picker.
  // A month already settled in the CURRENT AY is CLOSED and must never be reachable by the
  // concession picker. ONE shared guard covering all THREE entry points:
  //   1. Record Payment      → feeTransactions (legacy monthsSelected OR monthAllocations)
  //   2. Excel import        → s.monthStatus N/A-PAID / PAID / EXCUSED
  //   3. Existing-Student enrollment → s.currentYearPaidMonths  (paid-at-entry; was MISSING)
  // The result is stored in window._acmClosedMonths and applied BY THE RENDERER, so a
  // re-render can no longer wipe the lock (the old code DOM-patched labels after render,
  // and every _acmRenderMonthGrid() call silently unlocked them again).
  try {
    const _curYrNorm = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const _rate      = (window._acmSel && Number(window._acmSel.stdFee)) || 0;
    const txSnap     = await schoolCol('feeTransactions').where('studentId','==',sid).get();
    const { yearStart, yearEnd } = _acmGetAcadYearBounds();
    // ONE shared guard for all three entry points — see _flClosedMonthsForAY (pure, contract-tested).
    const closed = _flClosedMonthsForAY(txSnap.docs.map(d => d.data()), s, _rate, _curYrNorm, yearStart, yearEnd);

    window._acmClosedMonths = closed;
    // A closed month can never remain selected, and never stays in the saved activeMonths.
    Object.keys(closed).forEach(k => { if (window._acmMonthSel) delete window._acmMonthSel[k]; });
    if (Array.isArray(window._acmLockedMonths)) {
      window._acmLockedMonths = window._acmLockedMonths.filter(k => !closed[k]);
    }
    _acmRenderMonthGrid();   // re-render so the lock is baked into the DOM, not patched on
  } catch(e) {
    console.warn('[concession] closed-month guard failed:', e.message);
  }
}

function _acmCalc() {
  const sel = window._acmSel;
  if (!sel) return;
  const discount = parseFloat(document.getElementById('_acmFee')?.value);
  const nd = document.getElementById('_acmNew');
  const sd = document.getElementById('_acmSave');
  const preview = document.getElementById('_acmCalcPreview');
  if (!isNaN(discount) && discount >= 0) {
    const operative = sel.stdFee - discount;
    if (nd) nd.textContent = operative >= 0 ? '₹'+fmtNum(operative) : '—';
    if (preview) {
      if (discount > sel.stdFee) {
        preview.style.display = 'block';
        preview.style.background = 'rgba(224,82,82,0.10)';
        preview.style.borderColor = 'rgba(224,82,82,0.30)';
        preview.style.color = 'var(--danger)';
        preview.innerHTML = '⚠️ Discount (₹'+fmtNum(discount)+') exceeds standard fee (₹'+fmtNum(sel.stdFee)+') — not allowed.';
      } else if (discount === 0) {
        preview.style.display = 'none';
      } else {
        preview.style.display = 'block';
        preview.style.background = 'rgba(201,168,76,0.10)';
        preview.style.borderColor = 'rgba(201,168,76,0.25)';
        preview.style.color = 'var(--gold-lt)';
        preview.innerHTML = 'Operative fee: <strong>₹'+fmtNum(operative)+'</strong>/month (₹'+fmtNum(sel.stdFee)+' − ₹'+fmtNum(discount)+' waived)';
      }
    }
    if (sd) {
      sd.textContent = discount > 0 && discount <= sel.stdFee ? 'Waiving ₹'+fmtNum(discount)+'/mo' : discount > sel.stdFee ? '⚠ Exceeds standard' : 'No discount';
      sd.style.color = discount > 0 && discount <= sel.stdFee ? 'var(--success)' : discount > sel.stdFee ? 'var(--danger)' : 'var(--muted)';
    }
  } else {
    if (nd) nd.textContent = '—';
    if (sd) sd.textContent = '';
    if (preview) preview.style.display = 'none';
  }
}

function _acmClear() {
  window._acmSel = null;
  const qi = document.getElementById('_acmQ'); if (qi) { qi.value=''; qi.focus(); }
  document.getElementById('_acmCard').style.display  = 'none';
  document.getElementById('_acmStep2').style.display = 'none';
  _acmAlert('');
}

async function _acmDoSave() {
  if (currentRole !== 'principal') { showToast('Principal only.','danger'); return; }
  _acmAlert('');

  const sel = window._acmSel;
  if (!sel) { _acmAlert('Please search and select a student first.','danger'); return; }

  // R6: the student must still EXIST — a deleted record cannot take a concession —
  // but terminated/hidden is no longer a refusal. _flReconcileByAdmissionNo below
  // recomputes the aggregate, and _flReconcile now syncs the terminated/hidden
  // snapshot with it, so every section moves together.
  try {
    const sDoc = await schoolCol('students').doc(sel.id).get();
    if (!sDoc.exists) {
      _acmAlert(`⚠️ ${sel.name} no longer exists in the student records. Concession not saved.`, 'danger');
      return;
    }
  } catch(_) { /* non-fatal — proceed */ }

  const discStr = (document.getElementById('_acmFee')?.value || '').trim();
  if (discStr === '') { _acmAlert('Enter the concession discount amount.','danger'); return; }
  const discount = parseFloat(discStr);
  if (isNaN(discount) || discount < 0) { _acmAlert('Enter a valid discount (0 or above).','danger'); return; }
  if (discount > sel.stdFee) { _acmAlert('⚠️ Discount cannot exceed the standard fee (₹'+fmtNum(sel.stdFee)+').','danger'); return; }
  const operativeFee = sel.stdFee - discount;
  const activeMonths = _acmGetSelectedMonths(); // [] = indefinite

  const dateVal  = document.getElementById('_acmDate')?.value   || '';
  const reason   = (document.getElementById('_acmReason')?.value || '').trim();
  const setByName = currentProfile?.name || currentUser?.email  || 'Principal';
  const setByUid  = currentUser?.uid || '';

  // Build payload — every field the rest of the app reads
  const payload = {
    studentName:        sel.name   || '',
    admissionNo:        sel.admNo  || '',
    class:              sel.cls    || '',
    cls:                sel.cls    || '',
    section:            sel.sec    || '',
    block:              sel.blk    || '',
    blockId:            sel.blk    || '',
    parentName:         sel.parentName || '',
    concessionFee:      operativeFee,        // operative fee (what student pays)
    concessionDiscount: discount,            // amount waived
    standardFee:        sel.stdFee,
    activeMonths:       activeMonths,        // [] = indefinite; else ['2026-06',...]
    reason:             reason,
    setBy:              setByName,
    principalName:      setByName,
    setByUid:           setByUid,
    setAt:              firebase.firestore.FieldValue.serverTimestamp(),
  };

  // effectiveFrom — separate from setAt to avoid any Firestore sentinel conflict
  if (dateVal) {
    // JSS-REF-VELTRIX-2026-005: was `new Date(dateVal + 'T00:00:00')` — that is the
    // DEVICE's local midnight, so the stored instant moved with whoever's machine set
    // the concession. Date-only fact: 12:00 IST via the shared converter.
    const d = istInstantFromDateInput(dateVal, 'noon');
    payload.effectiveFrom = d
      ? firebase.firestore.Timestamp.fromDate(d)
      : firebase.firestore.FieldValue.serverTimestamp();
  } else {
    payload.effectiveFrom = firebase.firestore.FieldValue.serverTimestamp();
  }

  try {
    if (sel.existDocId) {
      await schoolCol('concessionFees').doc(sel.existDocId).update(payload);
    } else {
      await schoolCol('concessionFees').add(payload);
    }

    // auditLog cannot throw — the guarantee is in the function itself (search.js),
    // so the local try/catch that used to sit here would only have hidden a
    // failure this call site could do nothing about anyway.
    auditLog('concession_set', { studentName:sel.name, admissionNo:sel.admNo, concessionFee:operativeFee, reason });

    // ITEMS 4 + 17: RECONCILE, then bust caches — in that order.
    // A concession changes the per-month RATE, so it changes what the student owes.
    // This path only invalidated caches, and a cache bust makes the next read
    // re-fetch the STORED aggregate — it does not recompute it. outstandingBalance
    // and the month grids therefore kept their pre-concession values and every
    // screen faithfully showed the same stale number.
    await _flReconcileByAdmissionNo(sel.admNo, 'concession_set');

    // ITEM-10 FIX: Concession Management previously invalidated NO shared caches at
    // all, so Dashboard / Due Fee / Student Profile kept showing pre-concession
    // amounts until an unrelated action happened to bust the cache. Bust both here.
    invalidateFinanceCache();
    invalidateStudentCache();

    document.getElementById('_acmModal')?.remove();
    window._acmSel = null;
    showToast(`✅ Concession saved — ${sel.name} pays ₹${fmtNum(operativeFee)}/month (₹${fmtNum(discount)} waived)`, 'success');
    renderConcessionStudents();

  } catch(err) {
    console.error('[ACM] save error:', err);
    _acmAlert(`Save failed: ${err.message}`, 'danger');
  }
}
/* ---- Month grid helpers for Add Concession modal ---- */
// Academic year runs Jun -> May. Each entry is [monthLabel, calendarMonth(1-12), yearOffset]
// yearOffset 0 = yearStart, 1 = yearEnd
const _ACM_MONTH_DEFS = [
  ['Jun',6,0],['Jul',7,0],['Aug',8,0],['Sep',9,0],['Oct',10,0],['Nov',11,0],['Dec',12,0],
  ['Jan',1,1],['Feb',2,1],['Mar',3,1],['Apr',4,1],['May',5,1]
];

function _acmGetAcadYearBounds() {
  const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  const yearStart = _getAcademicYear().yearStart;   // L3: one definition of the June boundary
  return { yearStart, yearEnd: yearStart + 1 };
}

function _acmInitMonthYear() {
  // No year dropdown needed — always use current academic year
  const { yearStart, yearEnd } = _acmGetAcadYearBounds();
  const lbl = document.getElementById('_acmAcYearLabel');
  if (lbl) lbl.textContent = 'Academic Year: Jun '+yearStart+' – May '+yearEnd;
  _acmRenderMonthGrid();
}

function _acmRenderMonthGrid() {
  const grid = document.getElementById('_acmMonthGrid');
  if (!grid) return;
  if (!window._acmMonthSel) window._acmMonthSel = {};
  const { yearStart, yearEnd } = _acmGetAcadYearBounds();
  // Locked keys = already-saved activeMonths from existing concession — cannot be unchecked
  const lockedKeys = new Set(window._acmLockedMonths || []);
  const closedMap  = window._acmClosedMonths || {};   // JSS-REF-VELTRIX-2026-004 closed-month guard
  grid.innerHTML = _ACM_MONTH_DEFS.map(([label, mo, yOff]) => {
    const yr = yOff === 0 ? yearStart : yearEnd;
    const key = yr+'-'+String(mo).padStart(2,'0');
    const on     = !!window._acmMonthSel[key];
    const locked = lockedKeys.has(key);
    const closedReason = closedMap[key];
    if (closedReason) {
      // Already PAID / EXCUSED this AY → CLOSED. Rendered unreachable HERE (not patched on
      // afterwards), so it stays locked across every re-render.
      return '<label data-mkey="'+key+'" title="'+label+' — already '+closedReason+' this academic year. A settled month cannot receive a concession." style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid rgba(82,200,122,0.30);cursor:not-allowed;font-size:12px;color:var(--success);background:rgba(82,200,122,0.08);opacity:0.65;pointer-events:none;">' +
        '<input type="checkbox" data-mkey="'+key+'" disabled style="width:13px;height:13px;cursor:not-allowed;flex-shrink:0">' +
        label+' <span style="font-size:9px;margin-left:auto">✓ '+closedReason+'</span></label>';
    }
    if (locked) {
      // Locked: checked, disabled, gold style with lock icon
      return '<label data-mkey="'+key+'" title="Already saved — cannot remove" style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid rgba(201,168,76,0.55);cursor:not-allowed;font-size:12px;color:var(--gold-lt);background:rgba(201,168,76,0.18);opacity:0.85;">' +
        '<input type="checkbox" data-mkey="'+key+'" checked disabled' +
        ' style="width:13px;height:13px;accent-color:var(--gold);cursor:not-allowed;flex-shrink:0">' +
        label+' <span style="font-size:9px;margin-left:auto;opacity:0.7">🔒</span></label>';
    }
    const activeStyle = on ? 'background:rgba(201,168,76,0.15);border-color:rgba(201,168,76,0.4);color:var(--gold-lt)' : '';
    return '<label data-mkey="'+key+'" style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;border:1px solid var(--glass-border);cursor:pointer;font-size:12px;color:var(--silver-lt);transition:background .12s;'+activeStyle+'"' +
      ' onmouseover="if(!this.querySelector(&apos;input&apos;).checked)this.style.background=&apos;rgba(255,255,255,0.05)&apos;"' +
      ' onmouseout="if(!this.querySelector(&apos;input&apos;).checked)this.style.background=&apos;&apos;">' +
      '<input type="checkbox" data-mkey="'+key+'" '+(on?'checked':'')+' onchange="_acmMonthToggle(this)"' +
      ' style="width:13px;height:13px;accent-color:var(--gold);cursor:pointer;flex-shrink:0">' +
      label+'</label>';
  }).join('');
  _acmUpdateMonthSummary();
}

function _acmMonthToggle(cb) {
  if (!window._acmMonthSel) window._acmMonthSel = {};
  // JSS-REF-VELTRIX-2026-004: a CLOSED month (already paid/excused this AY) is never selectable.
  if (window._acmClosedMonths && window._acmClosedMonths[cb.dataset.mkey]) {
    cb.checked = false; delete window._acmMonthSel[cb.dataset.mkey]; return;
  }
  // Guard: locked months cannot be unchecked
  if (window._acmLockedMonths && window._acmLockedMonths.includes(cb.dataset.mkey)) {
    cb.checked = true; return;
  }
  window._acmMonthSel[cb.dataset.mkey] = cb.checked;
  const lbl = cb.closest('label');
  if (lbl) {
    if (cb.checked) { lbl.style.background='rgba(201,168,76,0.15)'; lbl.style.borderColor='rgba(201,168,76,0.4)'; lbl.style.color='var(--gold-lt)'; }
    else { lbl.style.background=''; lbl.style.borderColor=''; lbl.style.color='var(--silver-lt)'; }
  }
  _acmUpdateMonthSummary();
}

// ITEM-6 FIX: _acmSelectAllMonths() / _acmClearAllMonths() removed — the
// Select All / Clear All controls were removed from the Set Concession UI,
// and these bulk-toggle handlers had no other callers.

function _acmGetSelectedMonths() {
  if (!window._acmMonthSel) return [];
  // Return in academic year order (Jun first)
  const { yearStart, yearEnd } = _acmGetAcadYearBounds();
  return _ACM_MONTH_DEFS
    .map(([,mo,yOff]) => { const yr=yOff===0?yearStart:yearEnd; return yr+'-'+String(mo).padStart(2,'0'); })
    // JSS-REF-VELTRIX-2026-004: final guard — a CLOSED (already paid/excused) month can never
    // reach the saved activeMonths, even if it somehow got selected before the guard resolved.
    .filter(k => window._acmMonthSel[k] && !(window._acmClosedMonths && window._acmClosedMonths[k]));
}

function _acmUpdateMonthSummary() {
  const el = document.getElementById('_acmMonthSummary');
  if (!el) return;
  const selected = _acmGetSelectedMonths();
  if (!selected.length) {
    el.textContent = 'No months selected — concession will apply indefinitely.';
  } else {
    const lookup = {}; _ACM_MONTH_DEFS.forEach(([lbl,mo,yOff])=>{ const{yearStart,yearEnd}=_acmGetAcadYearBounds(); const yr=yOff===0?yearStart:yearEnd; lookup[yr+'-'+String(mo).padStart(2,'0')]=lbl; });
    el.textContent = 'Active for '+selected.length+' month'+(selected.length!==1?'s':'')+': '+selected.map(k=>lookup[k]||k).join(', ');
  }
}
/* END ADD CONCESSION MODAL */

// Enter key on login
document.addEventListener('keydown', e => {
  if (e.key==='Enter' && document.getElementById('loginPass')===document.activeElement) {
    doLogin();
  }
});
