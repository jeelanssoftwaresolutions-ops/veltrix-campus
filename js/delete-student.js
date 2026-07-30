/* ============================================================
   P-I #12 — DELETE STUDENT (Principal Only)
   Hard delete: removes student doc + ALL feeTransactions from Firestore.
   Not to be confused with Terminate (soft) — this is permanent.
   Two-step confirm: warning dialog → must type the student's admission number.
   Admin sees no Delete button — enforced at UI level (Firestore Rules in P-N).
   ============================================================ */
async function deleteStudentPermanent(id, admNo, name) {
  if (currentRole !== 'principal') { showToast('Only Principal can permanently delete students.','danger'); return; }

  // Step 1 — build custom two-step modal (type admission number, not DELETE)
  const overlayId = 'deleteStudentOverlay';
  const existing = document.getElementById(overlayId);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid rgba(224,82,82,0.4);border-radius:14px;max-width:460px;width:100%;padding:30px;box-shadow:0 24px 60px rgba(0,0,0,0.65)">

      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(224,82,82,0.13);border:1.5px solid rgba(224,82,82,0.4);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🗑</div>
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--danger)">Delete Student — Permanent</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">This action cannot be undone</div>
        </div>
      </div>

      <div style="background:rgba(224,82,82,0.07);border:1px solid rgba(224,82,82,0.2);border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;color:var(--silver-lt);line-height:1.7">
        You are about to <strong style="color:var(--danger)">permanently delete</strong> the student:<br>
        <strong style="font-size:15px">${sanitizeHTML(name)}</strong> &nbsp;·&nbsp; Adm# <strong>${sanitizeHTML(admNo)}</strong><br><br>
        This will delete:
        <ul style="margin:6px 0 0 18px;padding:0;color:var(--silver-lt)">
          <li>The student's Firestore record</li>
          <li>All fee transaction history for this student</li>
        </ul>
      </div>

      <div style="background:rgba(224,82,82,0.05);border:1px solid rgba(224,82,82,0.15);border-radius:8px;padding:14px;margin-bottom:20px">
        <div style="font-size:12px;color:var(--danger);font-weight:600;margin-bottom:8px">
          Type the student's admission number <strong>${sanitizeHTML(admNo)}</strong> to confirm:
        </div>
        <input id="deleteStudentInput" type="text" placeholder="Admission number" autocomplete="off"
          style="width:100%;background:var(--depth);border:1px solid rgba(224,82,82,0.3);border-radius:6px;padding:9px 12px;color:var(--text);font-size:13px;font-weight:600;letter-spacing:0.5px;outline:none;box-sizing:border-box"
          oninput="
            var match = this.value.trim() === '${admNo.replace(/'/g,"\\'")}';
            var btn = document.getElementById('deleteStudentProceedBtn');
            btn.disabled = !match;
            btn.style.opacity = match ? '1' : '0.4';
          ">
      </div>

      <div style="display:flex;gap:10px">
        <button id="deleteStudentProceedBtn" disabled
          style="flex:1;padding:11px;background:rgba(224,82,82,0.18);color:var(--danger);border:1px solid rgba(224,82,82,0.45);border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;opacity:0.4;transition:opacity 0.2s"
          onclick="
            document.getElementById('${overlayId}').remove();
            _execDeleteStudent('${id}','${admNo.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}');
          ">
          🗑 Permanently Delete
        </button>
        <button onclick="document.getElementById('${overlayId}').remove();"
          style="padding:11px 20px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">
          Cancel
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('deleteStudentInput')?.focus(), 80);
}

async function _execDeleteStudent(id, admNo, name) {
  try {
    // Batch delete: student doc + all their feeTransactions
    const txSnap = await schoolCol('feeTransactions').where('studentId','==',id).get();
    const batch  = db.batch();
    txSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(schoolCol('students').doc(id));

    // BUG-P13 FIX: Also delete any terminatedStudents records for this studentId.
    // Without this, hard-deleted students kept appearing in the Terminated section
    // because their terminatedStudents doc was never cleaned up.
    const termSnap = await schoolCol('terminatedStudents').where('studentId','==',id).get();
    termSnap.docs.forEach(d => batch.delete(d.ref));

    await batch.commit();

    // Invalidate all caches that reference this student
    invalidateStudentCache();
    invalidateFinanceCache();
    window._allTerminated  = null;
    window._allHidden      = null;
    window._financeData    = null;
    window._allTxs         = null;

    auditLog('student_permanently_deleted', { studentId: id, admissionNumber: admNo, studentName: name });
    showToast(`${name} (Adm# ${admNo}) permanently deleted.`, 'success');
    navigate('students');
  } catch(e) {
    showToast('Error deleting student: ' + e.message, 'danger');
  }
}
/* END P-I #12 — DELETE STUDENT */

