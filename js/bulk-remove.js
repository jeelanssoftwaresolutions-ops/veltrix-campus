/* ============================================================
   PHASE 8 #01 — BULK STUDENT REMOVAL
   Moves selected students to Terminated Section with timestamp,
   reason log, and fee record preservation.
   Two-step confirmation: reason prompt → confirm dialog.
   Does NOT permanently delete any data.
   ============================================================ */
function renderBulkRemove() {
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  getStudentCache().then(all => {
    const active = all.filter(s => s.status === 'active');
    if (!active.length) {
      setContent(`<div class="alert alert-warning" style="margin:24px">No active students to remove.</div>`);
      return;
    }

    const rows = active.map(s => `
      <tr>
        <td style="width:36px;text-align:center">
          <input type="checkbox" class="bulk-remove-chk" data-id="${s.id}" style="width:16px;height:16px;cursor:pointer">
        </td>
        <td><strong>${sanitizeHTML(s.name||'—')}</strong></td>
        <td>${sanitizeHTML(s.admissionNumber||'—')}</td>
        <td>${sanitizeHTML(s.class||'—')}</td>
        <td>${sanitizeHTML(s.section||'—')}</td>
        <td><span style="font-size:11px;padding:2px 8px;border-radius:5px;font-weight:600;background:${s.block==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${s.block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'}">${sanitizeHTML(s.block||'—')}</span></td>
      </tr>`).join('');

    setContent(`
      <div class="page-head flex-between">
        <div>
          <div class="page-title">Bulk Student Removal</div>
          <div class="page-sub">Select students to move to Terminated section — data is never destroyed</div>
        </div>
        <button class="btn btn-ghost" onclick="navigate('students')">← Back</button>
      </div>

      <div style="max-width:860px">
        <div class="alert alert-warning" style="margin-bottom:18px;font-size:13px">
          ⚠️ <strong>Bulk removal is irreversible through the UI.</strong> Selected students will be moved to the Terminated Students section with a timestamp and reason log. All fee records are fully preserved.
        </div>

        <div class="card" style="margin-bottom:18px">
          <div class="card-hdr" style="flex-wrap:wrap;gap:8px">
            <span class="card-title" id="bulkRemoveTitle">${active.length} Active Students</span>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-ghost btn-sm" onclick="toggleAllBulkRemove(true)">Select All</button>
              <button class="btn btn-ghost btn-sm" onclick="toggleAllBulkRemove(false)">Clear All</button>
              <span id="bulkRemoveCount" style="font-size:12px;color:var(--muted)">0 selected</span>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="tbl-wrap">
              <table>
                <thead><tr><th style="width:36px"></th><th>Name</th><th>Adm#</th><th>Class</th><th>Section</th><th>Block</th></tr></thead>
                <tbody id="bulkRemoveTableBody">${rows}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card" id="bulkRemoveActionCard">
          <div class="card-hdr"><span class="card-title">Removal Reason</span></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Reason for Removal * <span style="font-size:10px;color:var(--muted);text-transform:none;font-weight:400">— applies to all selected students</span></label>
              <select class="form-control" id="bulkRemoveReasonSelect" onchange="toggleCustomReason(this.value)">
                <option value="">Select a reason…</option>
                <option>TC Issued</option>
                <option>Fee Default</option>
                <option>Transferred to Another School</option>
                <option>Disciplinary Action</option>
                <option>Parent Request</option>
                <option value="other">Other (specify below)</option>
              </select>
            </div>
            <div class="form-group" id="bulkRemoveCustomReasonWrap" style="display:none">
              <label class="form-label">Specify Reason *</label>
              <input type="text" class="form-control" id="bulkRemoveCustomReason" placeholder="Enter reason for removal">
            </div>
            <div id="bulkRemoveProgress" style="display:none;margin-bottom:14px">
              <div style="font-size:13px;color:var(--muted);margin-bottom:6px" id="bulkRemoveProgressText">Processing…</div>
              <div style="height:6px;background:rgba(0,0,0,0.30);border-radius:3px;overflow:hidden">
                <div id="bulkRemoveProgressBar" style="height:100%;background:var(--danger);border-radius:3px;width:0%;transition:width 0.3s ease"></div>
              </div>
            </div>
            <div id="bulkRemoveSummary"></div>
            <div style="display:flex;gap:12px;margin-top:8px" id="bulkRemoveBtnRow">
              <button class="btn btn-danger" id="bulkRemoveBtn" onclick="confirmBulkRemove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="10" x2="16" y2="10"/></svg>
                Remove Selected Students
              </button>
              <button class="btn btn-ghost" onclick="navigate('students')">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `);

    // Live count update on checkbox change
    document.getElementById('bulkRemoveTableBody').addEventListener('change', () => {
      const count = document.querySelectorAll('.bulk-remove-chk:checked').length;
      document.getElementById('bulkRemoveCount').textContent = `${count} selected`;
    });
  }).catch(e => setContent(`<div class="alert alert-danger">Error: ${e.message}</div>`));
}

function toggleAllBulkRemove(checked) {
  document.querySelectorAll('.bulk-remove-chk').forEach(c => { c.checked = checked; });
  const count = checked ? document.querySelectorAll('.bulk-remove-chk').length : 0;
  document.getElementById('bulkRemoveCount').textContent = `${count} selected`;
}

function toggleCustomReason(val) {
  document.getElementById('bulkRemoveCustomReasonWrap').style.display = val === 'other' ? 'block' : 'none';
}

async function confirmBulkRemove() {
  const checked = Array.from(document.querySelectorAll('.bulk-remove-chk:checked'));
  if (!checked.length) { showToast('Select at least one student to remove.', 'danger'); return; }

  const reasonSelect = document.getElementById('bulkRemoveReasonSelect').value;
  const customReason = document.getElementById('bulkRemoveCustomReason')?.value?.trim();
  const reason = reasonSelect === 'other' ? customReason : reasonSelect;
  if (!reason) { showToast('Please select or enter a removal reason.', 'danger'); return; }

  const ids  = checked.map(c => c.dataset.id);
  const n    = ids.length;

  // Two-step mandatory confirmation for destructive bulk action
  showConfirm(
    '⚠️ Confirm Bulk Removal',
    `You are about to move <strong>${n} student${n>1?'s':''}</strong> to the Terminated section.<br><br>
     Reason: <strong>${sanitizeHTML(reason)}</strong><br><br>
     Fee records and historical data are fully preserved. <strong>This cannot be undone through the UI.</strong>`,
    async () => {
      await executeBulkRemove(ids, reason);
    }
  );
}

async function executeBulkRemove(ids, reason) {
  const btn      = document.getElementById('bulkRemoveBtn');
  const progWrap = document.getElementById('bulkRemoveProgress');
  const progBar  = document.getElementById('bulkRemoveProgressBar');
  const progText = document.getElementById('bulkRemoveProgressText');
  const btnRow   = document.getElementById('bulkRemoveBtnRow');
  btn.disabled   = true;
  progWrap.style.display = 'block';

  const today  = (()=>{const _d=nowIST();return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;})() /* BUG-TS-001 FIX */;
  let removed = 0; let failed = 0; const failReasons = [];

  for (let i = 0; i < ids.length; i++) {
    const id  = ids[i];
    const pct = Math.round(((i+1) / ids.length) * 100);
    progBar.style.width  = pct + '%';
    progText.textContent = `Processing ${i+1} of ${ids.length}…`;

    try {
      const sDoc   = await schoolCol('students').doc(id).get();
      const s      = sDoc.data();
      // SYNC RULE — RECONCILE BEFORE YOU FREEZE. _computeAllYearsFeeSnapshot below
      // reads students/{id}.outstandingBalance and freezes it PERMANENTLY into the
      // terminatedStudents record. If that aggregate had drifted, the stale figure
      // becomes the student's forever-record. terminateStudent (the single path)
      // reconciles first for exactly this reason; bulk-remove was the one termination
      // path that skipped it, so a bulk run could freeze a wrong number that a manual
      // termination of the same student would not. Now it reconciles first too.
      if (typeof _flReconcile === 'function') await _flReconcile(id, 'bulk_remove_snapshot');
      const txSnap = await schoolCol('feeTransactions').where('studentId','==',id).get();
      // F3: was the latest transaction's frozen remainingBalance — a sixth definition
      // of what is owed, snapshotted permanently into terminatedStudents. Now the same
      // _computeAllYearsFeeSnapshot every other termination path uses, so a bulk
      // removal and a single termination cannot disagree about the same student.
      const _snapF3 = (typeof _computeAllYearsFeeSnapshot === 'function')
        ? await _computeAllYearsFeeSnapshot(id)
        : null;
      const totalPaid   = _snapF3
        ? _snapF3.totalPaid
        : txSnap.docs.reduce((sum,d)=>sum+(d.data().amountPaid||0),0);
      const outstanding = _snapF3
        ? _snapF3.outstanding
        : Math.max(0, Number(s.outstandingBalance) || 0);

      // Write terminatedStudents record — same schema as terminateStudent()
      // F8: one snapshot per student. A bulk sheet listing the same admission number
      // twice, or re-run after a partial failure, would otherwise write a second record
      // per pass and double that student's debt in every export.
      const _bulkTermRef = await _flSnapshotRef('terminatedStudents', id, 'BULK-REMOVE');
      await _bulkTermRef.set({
        studentId: id, studentName: s.name, admissionNumber: s.admissionNumber,
        class: s.class, section: s.section, block: s.block||'',
        terminationDate: today,
        terminationReason: reason,
        totalDue: totalPaid + outstanding,
        amountPaid: totalPaid,
        outstandingBalance: outstanding,
        terminatedBy: currentUser.uid,
        feeSno: ''
      });

      // Mark student as terminated (does NOT delete any data)
      await schoolCol('students').doc(id).update({ status:'terminated', terminationDate:today, terminationReason:reason });
      removed++;
    } catch(e) {
      failReasons.push(`ID ${id}: ${e.message}`); failed++;
    }
  }

  progBar.style.width  = '100%';
  progText.textContent = 'Done!';
  invalidateStudentCache(); invalidateFinanceCache();
  window._allTerminated = null;
  auditLog('bulk_remove', { removed, failed, total: ids.length, reason });

  // Summary report
  const sumEl = document.getElementById('bulkRemoveSummary');
  sumEl.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:${failed>0?14:0}px">
      <div style="background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.2);border-radius:8px;padding:12px 20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--gold-lt)">${removed}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Removed</div>
      </div>
      <div style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:8px;padding:12px 20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#e09090">${failed}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Failed</div>
      </div>
    </div>
    ${failReasons.length ? `<div class="alert alert-danger" style="font-size:12px"><strong>Errors:</strong><br>${failReasons.map(r=>`• ${sanitizeHTML(r)}`).join('<br>')}</div>` : ''}
    <button class="btn btn-secondary btn-sm" onclick="navigate('students')" style="margin-top:8px">← Back to Students</button>
    <button class="btn btn-secondary btn-sm" onclick="navigate('terminated')" style="margin-top:8px;margin-left:8px">View Terminated →</button>`;
  btnRow.style.display = 'none';
}

