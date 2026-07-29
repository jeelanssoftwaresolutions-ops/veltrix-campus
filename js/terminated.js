/* ============================================================
   TERMINATED STUDENTS
   ============================================================ */
/* ============================================================
   COLONEL'S CHANGE #8 — TERMINATED SECTION LOCK (Phase 5)
   Admin sees sidebar item but gets lock screen on click.
   Only Principal password unlocks access for that session.
   ============================================================ */
// BUG-M10 FIX: _terminatedUnlocked moved to sessionStorage with a 30-minute expiry.
// window-level boolean is shared across tabs in the same session and can be set via devtools.
// sessionStorage is tab-scoped and we validate the expiry timestamp on every access.
const _TERM_UNLOCK_KEY     = 'sfms_term_unlocked';
const _TERM_UNLOCK_EXPIRY  = 30 * 60 * 1000; // 30 minutes in ms

function _isTerminatedUnlocked() {
  try {
    const raw = sessionStorage.getItem(_TERM_UNLOCK_KEY);
    if (!raw) return false;
    const { at } = JSON.parse(raw);
    if (Date.now() - at > _TERM_UNLOCK_EXPIRY) {
      sessionStorage.removeItem(_TERM_UNLOCK_KEY);
      return false;
    }
    return true;
  } catch { return false; }
}

function _setTerminatedUnlocked(val) {
  if (val) {
    sessionStorage.setItem(_TERM_UNLOCK_KEY, JSON.stringify({ at: Date.now() }));
  } else {
    sessionStorage.removeItem(_TERM_UNLOCK_KEY);
  }
}

function showTerminatedLockScreen() {
  // If already unlocked this session, go straight through
  if (_isTerminatedUnlocked()) { navigate('terminated'); return; }

  setActiveNav('terminated');
  setContent(`
    <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
      <div style="max-width:400px;width:100%;text-align:center">
        <div style="width:72px;height:72px;border-radius:50%;background:rgba(224,82,82,0.1);border:2px solid rgba(224,82,82,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px">🔒</div>
        <div style="font-family:'Cinzel',serif;font-size:18px;color:var(--danger);font-weight:600;margin-bottom:8px">Restricted Section</div>
        <div style="font-size:13px;color:var(--silver-lt);margin-bottom:6px;line-height:1.6">The <strong>Terminated Students</strong> section is locked.</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:28px">Enter the Principal password to access this section.</div>
        <div class="card" style="text-align:left">
          <div class="card-body">
            <div id="termLockAlert"></div>
            <div class="form-group">
              <label class="form-label">Principal Password</label>
              <input type="password" class="form-control" id="termLockPass"
                placeholder="Enter Principal password"
                onkeydown="if(event.key==='Enter') attemptTerminatedUnlock()">
            </div>
            <div style="display:flex;gap:10px">
              <button class="btn btn-primary" style="flex:1" onclick="attemptTerminatedUnlock()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Unlock
              </button>
              <button class="btn btn-ghost" onclick="navigate('dashboard')">Cancel</button>
            </div>
          </div>
        </div>
        <div style="margin-top:16px;font-size:11px;color:var(--faint)">
          Access will be granted for this session only.
        </div>
      </div>
    </div>
  `);
  // Focus the password field
  setTimeout(() => document.getElementById('termLockPass')?.focus(), 100);
}

// BUG-C01 + BUG-C02 FIX: Secondary Firebase app instance for cross-user password
// verification. Reused across calls to avoid re-initialization errors.
let _sfmsVerifyApp = null;

async function attemptTerminatedUnlock() {
  const pass = document.getElementById('termLockPass')?.value || '';
  if (!pass) {
    showFormAlert('termLockAlert', 'Please enter the Principal password.', 'danger');
    return;
  }

  // Look up the Principal's email from Firestore users collection
  let principalEmail = null;
  try {
    const usersSnap = await db.collection('users')
      .where('role', '==', 'principal')
      .where('schoolId', '==', currentSchoolId)
      .limit(1).get();
    if (!usersSnap.empty) {
      principalEmail = usersSnap.docs[0].data().email;
    }
  } catch(e) {}

  if (!principalEmail) {
    showFormAlert('termLockAlert', 'No Principal account found for this school. Contact administrator.', 'danger');
    return;
  }

  // Verify via secondary Firebase app — does NOT disturb the current user's session
  try {
    if (!_sfmsVerifyApp) {
      _sfmsVerifyApp = firebase.initializeApp(firebaseConfig, 'sfms_verify');
    }
    await _sfmsVerifyApp.auth().signInWithEmailAndPassword(principalEmail, pass);
    await _sfmsVerifyApp.auth().signOut();
    _setTerminatedUnlocked(true);
    showToast('Access granted. Terminated section unlocked for this session.', 'success');
    navigate('terminated');
  } catch(e) {
    showFormAlert('termLockAlert', 'Incorrect password. Access denied.', 'danger');
    document.getElementById('termLockPass').value = '';
    document.getElementById('termLockPass')?.focus();
  }
}


/* ============================================================
   TERMINATED STUDENTS HELPERS
   escapeName, getTerminatedCache
   (JSS-REF-VELTRIX-2026-004 ITEM 08: updateTCStatus / TC Management removed)
   ============================================================ */

// ✦ UTILITY: Safely escape names for inline JS function arguments
function escapeName(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ✦ SHARED CACHE: Ensures all tables sync from the exact same data
async function getTerminatedCache() {
  if (window._allTerminated) return window._allTerminated;
  const snap = await schoolCol('terminatedStudents').orderBy('terminationDate','desc').get();
  window._allTerminated = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return window._allTerminated;
}

// JSS-REF-VELTRIX-2026-004 ITEM 08: "Issue TC" (Transfer Certificate) feature scrapped.
// updateTCStatus() removed along with the Issue TC / Undo TC buttons, the TC Status
// badge + column, the redundant "TC Management" nav entry/route, and the tcStatus field.
// The Terminated Students view itself is unaffected.

/* BUG-O09 FIX: Restored missing opening /* delimiter — this block was bare JS text causing a latent syntax risk.
   • Admin: sees list only — "Record Payment" locked
   • Principal: can record outstanding fee payments
   • Same fee lock logic as Change #12
   ============================================================ */
async function renderTerminated() {
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    // ✦ POINT 15: Use shared cache for consistency between Terminated & TC Management views
    let list = await getTerminatedCache();

    // BUG-P13 FIX: Exclude orphaned records whose student was hard-deleted from Firestore.
    try {
      const stuCache = await getStudentCache();
      const allStudentIds = new Set(stuCache.map(s => s.id));
      list = list.filter(r => !r.studentId || allStudentIds.has(r.studentId));
    } catch(_) {
      // If cache fails, show all records rather than hiding valid ones
    }

    // Point 17: Grade 10 students must NEVER appear in Terminated — only in Legacy Student
    list = list.filter(r => !(r.class || '').toString().startsWith('10'));

    // JSS-REF-VELTRIX-2026-003 ITEM 05.3 FIX: records terminated before this fix carry a
    // stale totalDue (lifetime paid + latest-transaction balance, excused amount ignored).
    // Self-heal on load — recompute with the current-year-scoped snapshot and patch any
    // record whose stored totalDue disagrees, so existing data corrects itself in place.
    try {
      await Promise.all(list.map(async r => {
        if (!r.studentId) return; // nothing to recompute from without the source studentId
        const snap = await _computeCurrentYearFeeSnapshot(r.studentId);
        const patch = {};
        if (snap.totalDue !== (r.totalDue || 0)) patch.totalDue = snap.totalDue;
        // ITEM 05.2 FOLLOW-ON: amountPaid/outstandingBalance previously only ever moved
        // when saveTerminatedFeePayment() (now removed) wrote directly to this doc. The
        // unified engine writes feeTransactions + students/{id} only, so these two columns
        // must now self-heal from the same snapshot, the same way totalDue already does.
        if (snap.totalPaid !== (r.amountPaid || 0)) patch.amountPaid = snap.totalPaid;
        if (snap.outstanding !== (r.outstandingBalance || 0)) patch.outstandingBalance = snap.outstanding;
        if (Object.keys(patch).length) {
          Object.assign(r, patch);
          schoolCol('terminatedStudents').doc(r.id).update(patch).catch(()=>{});
        }
      }));
    } catch(_) { /* non-fatal — table still renders with whatever totalDue was stored */ }

    const isPrincipal = currentRole === 'principal';

    const tbodyHtml = list.map(s => {
      const isLegacy = (s.class||'').toString().startsWith('10');
      const legacyBadge = isLegacy ? `<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(212,150,42,0.15);color:var(--warn);font-weight:600;margin-left:6px">LEGACY</span>` : '';
      const safeStudentName = escapeName(s.studentName);
      const outstanding = Number(s.outstandingBalance) || 0;
      // JSS-REF-VELTRIX-2026-004 ITEM 08: TC status field, badge and Issue/Undo TC button removed.

      const actionCell = isPrincipal ? `<td style="display:flex;gap:6px;align-items:center;padding:10px 14px;flex-wrap:wrap">
        ${outstanding > 0 && s.studentId ? `<button class="btn btn-primary btn-sm" onclick="pushNav('recordFee',{studentId:'${s.studentId}',studentName:'${safeStudentName}',classSection:'${(s.class||'')+'  –  Section '+(s.section||'')}' })">Pay Dues</button>` : ``}
        <!-- VLX-REF-008 FIX: View Profile shows full per-year fee cards for terminated students -->
        ${s.studentId ? `<button class="btn btn-ghost btn-sm" style="border-color:rgba(74,158,202,0.4);color:var(--info);font-size:11px" onclick="renderStudentProfile('${s.studentId}')">📋 View Profile</button>` : ''}
        ${isLegacy
          ? `<span style="font-size:10px;color:var(--muted);padding:4px 8px;border:1px solid var(--border);border-radius:6px">🔒 Legacy</span>`
          : `<button class="btn btn-sm" style="background:rgba(82,200,122,0.12);color:var(--success);border:1px solid rgba(82,200,122,0.3);font-size:11px" onclick="undoTerminateStudent('${s.id}','${safeStudentName}')">↩ Undo Terminate</button>
             <button class="btn btn-sm" style="background:rgba(224,82,82,0.12);color:var(--danger);border:1px solid rgba(224,82,82,0.3);font-size:11px" onclick="removeTerminatedStudent('${s.id}','${safeStudentName}')">🗑 Remove</button>`}
      </td>` : '';

      return `<tr ${_studentRowAttrs(s)}>
        <!-- ITEM 2: was its own inline onclick — now the shared _studentNameLink handler
             (which also degrades to plain text when the row has no studentId) -->
        <td>${_studentNameLink(s.studentName, s)}${legacyBadge}</td>
        <td class="muted">${s.admissionNumber||'—'}</td>
        <td>${s.block||'—'}</td>
        <td>${s.class||''} ${s.section||''}</td>
        <td>${s.terminationDate||'—'}</td>
        <td>₹${fmtNum(s.totalDue||0)}</td>
        <td>₹${fmtNum(s.amountPaid||0)}</td>
        <td style="${outstanding>0?'color:var(--danger);font-weight:700':''}">${fmtNum(outstanding)}</td>
        <td>${outstanding>0?'<span class="badge badge-red">Dues Pending</span>':'<span class="badge badge-green">Cleared</span>'}</td>
        ${actionCell}
      </tr>`;
    }).join('');

    setContent(`
      <div class="page-head flex-between">
        <div>
          <div class="page-title">Terminated Students</div>
          <div class="page-sub">${list.length} students with financial records preserved.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="exportTerminatedExcel()">📊 Export Excel</button>
          <button class="btn btn-ghost btn-sm" onclick="renderTerminatedFeeHistory()">📋 Fee History</button>
          ${!isPrincipal ? `
            <button class="btn btn-ghost btn-sm" style="cursor:not-allowed;opacity:0.5" title="Only Principal can record terminated payments" disabled>
              🔒 Record Payment (Principal Only)
            </button>` : ``}
        </div>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Adm#</th><th>Block</th><th>Class</th><th>Termination Date</th><th>Total Due</th><th>Amount Paid</th><th>Outstanding</th><th>Status</th>${isPrincipal?'<th>Actions</th>':''}</tr></thead>
              <tbody>${list.length === 0 ? `<tr><td colspan="${isPrincipal?10:9}" style="text-align:center;padding:30px;color:var(--muted)">No terminated students.</td></tr>` : tbodyHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    `);
    window._terminatedData = list;
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error: ${e.message}</div>`);
  }
}


// JSS-REF-VELTRIX-2026-003 ITEM 05.3 FIX: terminateStudent() and moveStudentToHidden()
// previously snapshotted "Total Due" as (sum of amountPaid across EVERY feeTransaction
// ever, of any academic year) + (remainingBalance of whichever transaction happened to
// be most recent, INCLUDING excused_waiver docs). That produced a figure that neither
// matched the current academic year's true annual liability nor reconciled with the
// Profile Card (which correctly scopes to the current year and separates out excused/
// waived amounts). Terminated/Hidden students should only ever carry forward CURRENT
// academic year figures — mirror the same scoping and exclusions the Profile Card uses.
function _computeCurrentYearFeeSnapshot(studentId) {
  return schoolCol('feeTransactions').where('studentId', '==', studentId).get().then(txSnap => {
    const curYrNorm = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const curYearTxs = txSnap.docs
      .map(d => d.data())
      .filter(t => {
        const ty = _normaliseAcademicYear(t.academicYear || t.feeYear || '');
        return !ty || ty === curYrNorm; // untagged tx assumed current-year, same as Profile Card
      });

    const totalPaid = curYearTxs
      .filter(t => t.type !== 'excused_waiver')
      .reduce((sum, t) => sum + (t.amountPaid || 0), 0);
    const excusedTotal = curYearTxs
      .filter(t => t.type === 'excused_waiver')
      .reduce((sum, t) => sum + (t.amountWaived || 0), 0);

    const balanceTxs = curYearTxs
      .filter(t => t.type !== 'excused_waiver' && typeof t.remainingBalance === 'number')
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
    const outstanding = balanceTxs.length > 0 ? (balanceTxs[0].remainingBalance || 0) : 0;

    // Total Due = the current year's full annual liability: what's been paid,
    // what's been excused/waived, and what's still outstanding — the same three
    // numbers the Profile Card's fee-summary cards show, added together.
    const totalDue = totalPaid + excusedTotal + outstanding;

    return { totalPaid, excusedTotal, outstanding, totalDue };
  });
}

async function terminateStudent(id, name) {
  // Point 17: Grade 10 students must NEVER go to Terminated — only Legacy Student
  // Pre-check the student's class before showing confirmation
  try {
    const preCheck = await schoolCol('students').doc(id).get();
    const preData  = preCheck.data() || {};
    if ((preData.class || '').toString().startsWith('10')) {
      showToast(`⚠️ ${name} is a Grade 10 student and cannot be terminated. Grade 10 students belong in LEGACY STUDENT only. Use Student Promotions to move them.`, 'warning');
      return;
    }
  } catch(e) { /* non-fatal — allow confirmation to proceed */ }

  showConfirm(
    'Terminate Student',
    `Are you sure you want to terminate <strong>${name}</strong>? Their record will be moved to the Terminated Students section.`,
    async () => {
      try {
        const sDoc = await schoolCol('students').doc(id).get();
        const s = sDoc.data();

        // Point 17: Double-guard inside confirm — Grade 10 must never enter terminatedStudents
        if ((s.class || '').toString().startsWith('10')) {
          showToast(`⚠️ ${s.name || name} is a Grade 10 student. They belong in LEGACY STUDENT only and cannot be terminated.`, 'warning');
          return;
        }

        const { totalPaid, outstanding, totalDue } = await _computeCurrentYearFeeSnapshot(id);

        await schoolCol('terminatedStudents').add({
          studentId:id, studentName:s.name, admissionNumber:s.admissionNumber,
          class:s.class, section:s.section, block:s.block||'',
          terminationDate: (()=>{const _d=nowIST();return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;})() /* BUG-TS-001 FIX */, // ISO for consistent sorting
          totalDue: totalDue, amountPaid: totalPaid,
          outstandingBalance: outstanding,
          terminatedBy: currentUser.uid,
          terminationReason: 'Manual Termination' // BUG-N07 FIX: was missing — showed blank reason in Terminated Students view and exports
        });
        await schoolCol('students').doc(id).update({ status:'terminated' });
        auditLog('student_terminated', { studentId: id, studentName: name }); // BUG-I02 FIX
        invalidateStudentCache();
        invalidateFinanceCache();
        window._allTerminated = null;
        navigate('terminated');
      } catch(e) { showToast('Error: ' + e.message, 'danger'); }
    }
  );
}

