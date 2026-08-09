/* ============================================================
   PENDING APPROVALS (Principal Only)
   ============================================================ */
async function renderApprovals() {
  if (currentRole !== 'principal') { setContent('<div class="alert alert-danger">Access denied.</div>'); return; }
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    const snap = await schoolCol('deletionRequests').where('status','==','pending').get();
    const reqs = snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0)); // client-side sort avoids composite index

    setContent(`
      <div class="page-head">
        <div class="page-title">Pending Approvals</div>
        <div class="page-sub">${reqs.length} request${reqs.length!==1?'s':''} awaiting your decision.</div>
      </div>
      ${reqs.length===0?`
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <p>All clear! No pending approval requests.</p>
        </div>
      `:reqs.map(r=>`
        <div class="approval-item">
          <div class="ap-info">
            <div class="ap-title">Delete ${r.recordType||'Record'}: ${r.recordDescription||r.recordId}</div>
            <div class="ap-meta">Requested by ${r.requestedByName||r.requestedBy} · ${fmtDate(r.timestamp)}</div>
          </div>
          <div class="ap-actions">
            <button class="btn btn-success btn-sm" onclick="handleApproval('${r.id}','${r.recordType}','${r.recordId}',true)">✓ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="handleApproval('${r.id}','${r.recordType}','${r.recordId}',false)">✗ Reject</button>
          </div>
        </div>
      `).join('')}
    `);
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error: ${e.message}</div>`);
  }
}

async function handleApproval(reqId, recordType, recordId, approve) {
  try {
    if (approve && recordType === 'transaction') {
      await schoolCol('feeTransactions').doc(recordId).delete();
      // BUG-H04 FIX: transaction deleted — Finance, Reports, dashboard all stale
      invalidateFinanceCache();
    }
    if (approve && recordType === 'student') {
      // BUG-L07 FIX: Delete all feeTransactions for this student before deleting the student doc.
      // Previously, only the students/{id} doc was deleted — orphaned feeTransactions remained,
      // inflating Finance totals and causing deleted students to appear in Reports.

      // BUG-N08 FIX: Fetch the student doc BEFORE deleting it so we can write an audit trail
      // to terminatedStudents. Without this, approved deletions leave no trace — the student
      // silently vanishes with no record in the Terminated Students section or exports.
      const sDoc = await schoolCol('students').doc(recordId).get();
      const sData = sDoc.exists ? sDoc.data() : {};

      const txSnap = await schoolCol('feeTransactions').where('studentId','==',recordId).get();

      // ══════════════════════════════════════════════════════════════════════════
      // JSS-REF-VELTRIX-2026-005 F3 — was a SIXTH definition of "what is owed":
      // "the latest transaction's remainingBalance". That value is frozen at the
      // instant its receipt was written and nothing ever updates it, so the figure
      // frozen into terminatedStudents here could be arbitrarily old — and this
      // record is the permanent one for a deleted student.
      //
      // Now the same _computeAllYearsFeeSnapshot every other termination path uses
      // (terminateStudent, moveStudentToHidden), so a deletion-approval snapshot and
      // a manual termination cannot produce different numbers for the same student.
      // ══════════════════════════════════════════════════════════════════════════
      const _snapF3 = (typeof _computeAllYearsFeeSnapshot === 'function')
        ? await _computeAllYearsFeeSnapshot(recordId)
        : null;
      const totalPaid = _snapF3
        ? _snapF3.totalPaid
        : txSnap.docs.reduce((sum, d) => sum + (d.data().amountPaid || 0), 0);
      const outstanding = _snapF3
        ? _snapF3.outstanding
        : Math.max(0, Number(sData.outstandingBalance) || 0);

      if (!txSnap.empty) {
        // Use Firestore batch (max 500 ops) to delete all transactions atomically
        const TX_BATCH_SIZE = 490;
        const txDocs = txSnap.docs;
        for (let i = 0; i < txDocs.length; i += TX_BATCH_SIZE) {
          const batchDel = db.batch();
          txDocs.slice(i, i + TX_BATCH_SIZE).forEach(d => batchDel.delete(d.ref));
          await batchDel.commit();
        }
      }
      await schoolCol('students').doc(recordId).delete();

      // BUG-N08 FIX: Write terminatedStudents record using the same schema as terminateStudent()
      // so the student appears in the Terminated Students view with a clear audit trail.
      // F8: one snapshot per student. This path runs AFTER the students/ document has
      // been deleted, so a leftover record from an earlier termination would otherwise
      // sit beside this one with no live student to reconcile either against.
      const _apprTermRef = await _flSnapshotRef('terminatedStudents', recordId, 'DELETE-APPROVAL');
      await _apprTermRef.set({
        studentId:         recordId,
        studentName:       sData.name            || '',
        admissionNumber:   sData.admissionNumber  || '',
        block:             sData.block            || '',
        class:             sData.class            || '',
        section:           sData.section          || '',
        terminationDate:   (()=>{const _d=nowIST();return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;})() /* BUG-TS-001 FIX */,
        totalDue:          totalPaid + outstanding,
        amountPaid:        totalPaid,
        outstandingBalance: outstanding,
        terminatedBy:      currentUser.uid,
        terminationReason: 'Deleted by Approval'  // BUG-N08 FIX: distinguishes approval-deletions from manual terminations
      });

      // BUG-H04 FIX: student + all their transactions deleted — both caches stale
      // BUG-N08 FIX: also invalidate terminatedStudents cache so new record shows immediately
      invalidateStudentCache();
      invalidateFinanceCache();
      window._allTerminated = null;
    }
    await schoolCol('deletionRequests').doc(reqId).update({ status: approve ? 'approved' : 'rejected', resolvedAt: firebase.firestore.FieldValue.serverTimestamp(), resolvedBy: currentUser.uid });
    auditLog(approve ? 'approval_granted' : 'approval_rejected', { requestId: reqId, recordType, recordId }); // BUG-I02 FIX
    loadPendingCount();
    renderApprovals();
  } catch(e) { showToast('Error: ' + e.message, 'danger'); }
}

async function requestDeleteTx(txId, receiptNo, studentId) {
  // PHASE 5 #06: Fee record deletion is Principal-only at the UI layer.
  // This function is no longer wired to any button — kept for legacy compatibility.
  // Firestore Security Rules (Phase 13) will enforce this at the server level.
  if (currentRole !== 'principal') {
    showToast('Only Principal can delete fee records.', 'danger');
    return;
  }
  showConfirm('Request Deletion', `Request deletion of receipt <strong>${receiptNo}</strong>? This will be sent to the Principal for approval.`,
    async () => {
      try {
        await schoolCol('deletionRequests').add({
          recordType:'transaction', recordId:txId,
          recordDescription:`Receipt ${receiptNo}`,
          requestedBy: currentUser.uid,
          requestedByName: currentProfile?.name||'Admin',
          status:'pending',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Deletion request submitted to Principal for approval.', 'success');
      } catch(e) { showToast('Error: ' + e.message, 'danger'); }
    }
  );
}

async function deleteTxDirectly(txId, studentId) {
  // VLX-REF-002 FIX: Only Principal can delete fee records. Admin is view-only.
  if (currentRole !== 'principal') {
    showToast('Only Principal can delete fee records.', 'danger');
    return;
  }

  showConfirm('Delete Transaction', 'Permanently delete this transaction record? This cannot be undone.',
    async () => {
      // P-D #07: Show loading state on confirm button so user knows it's working
      const confirmBtn = document.getElementById('confirmOkBtn');
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting…'; }

      try {
        // P-D #07 FIX 1: Force-refresh auth token before delete
        // Stale JWT tokens cause false PERMISSION_DENIED on Firestore deletes
        await currentUser.getIdToken(true);

        // JSS-REF-VELTRIX-2026-004 ITEM 04: read the transaction BEFORE deleting it so we
        // know which months (and which academic year) it covered. Those months must be
        // reverted to DUE unless another remaining transaction still covers them — the
        // previous logic never touched the per-month grid at all, so months stayed PAID
        // even after the balance was reset.
        const _txSnap    = await schoolCol('feeTransactions').doc(txId).get();
        const _deletedTx = _txSnap.exists ? _txSnap.data() : null;

        // P-D #07 FIX 2: Delete the transaction document
        await schoolCol('feeTransactions').doc(txId).delete();

        // ITEM 04: build the per-year "revert these months" hint for the reconciler.
        const revertTxMonths = {};
        if (_deletedTx && Array.isArray(_deletedTx.monthsSelected) && _deletedTx.monthsSelected.length) {
          const _txYr = _normaliseAcademicYear(_deletedTx.academicYear || '');
          if (_txYr) revertTxMonths[_txYr] = _deletedTx.monthsSelected.slice();
        }

        // P-D #07 FIX 3 / ITEM 04: recompute after the delete.
        if (studentId) {
          try {
            // (a) lastPaymentDate / lastPaymentAmount are NOT recomputed by
            // _syncStudentFinancials, so set them here from the most-recent REMAINING
            // transaction (or clear them when none remain). Written BEFORE the sync call,
            // alongside a conservative provisional fee_status, so no stale value can linger
            // if the sync step is interrupted — sync then finalises fee_status and the
            // balances authoritatively.
            const remaining = await schoolCol('feeTransactions')
              .where('studentId', '==', studentId)
              .get();
            let _lastDate = null, _lastAmt = 0;
            if (!remaining.empty) {
              const sorted = remaining.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                  const ta = a.date?.toMillis ? a.date.toMillis() : new Date(a.date).getTime();
                  const tb = b.date?.toMillis ? b.date.toMillis() : new Date(b.date).getTime();
                  return tb - ta; // descending
                });
              _lastDate = sorted[0].date       || null;
              _lastAmt  = sorted[0].amountPaid || 0;
            }
            await schoolCol('students').doc(studentId).update({
              fee_status:        'pending',   // provisional — _syncStudentFinancials finalises this from the cross-year total
              lastPaymentDate:   _lastDate,
              lastPaymentAmount: _lastAmt,
              updatedAt:         firebase.firestore.FieldValue.serverTimestamp()
            });

            // (b) Authoritative, academic-year-scoped reconciliation — the same canonical
            // reconciler every payment path already calls (see ~line 8373). With the
            // revertTxMonths hint it flips the deleted transaction's months back to DUE
            // inside monthStatus / previousYearMonthStatus / prevYearMonthStatus /
            // openingOutstandingDues[], and recomputes outstandingBalance, previousDues and
            // fee_status across EVERY tracked year — not just the single most-recent
            // remaining transaction. This delete path was the one write path that never
            // called it, which is what desynced the month tiles and dropped the previous
            // year's dues card.
            await _syncStudentFinancials(studentId, { revertTxMonths });
          } catch(balanceErr) {
            // Balance recalc failure is non-fatal — log it but don't block the UI
            console.warn('P-D: Balance recalculation failed after delete:', balanceErr.message);
          }
        }

        // P-D #07: Invalidate cache and re-render
        invalidateFinanceCache();
        invalidateStudentCache();
        showToast('Transaction deleted and balance updated.', 'success');
        if (studentId) renderStudentProfile(studentId);
        else renderFinance();
        // PILL-RESET: If Record Payment is open with same student, re-run selectFeeStudent
        // so month pills reflect the deletion immediately.
        const _selStu = window._selectedFeeStudent;
        if (_selStu && _selStu.id === studentId && currentView === 'recordFee') {
          setTimeout(() => selectFeeStudent(_selStu.id, _selStu.name||'', _selStu.cs||''), 300);
        }

      } catch(e) {
        // P-D #07: Actionable error — surface permission errors clearly
        const msg = e.code === 'permission-denied'
          ? '❌ Permission denied. Firestore Rules must allow Principal to delete feeTransactions.'
          : '❌ Delete failed: ' + e.message;
        showToast(msg, 'danger');
      } finally {
        // P-D #07: Always restore confirm button state
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm'; }
      }
    }
  );
}

// ════════════════════════════════════════════════
// CHG-004: Standalone Fee Structure section — dedicated sidebar entry
// Single source of truth for fee configuration (replaces embedded card in Academic Structure)
async function renderFeeStructure() {
  const isPrincipal = currentRole === 'principal';

  // [CHG-005] Fetch concession records from Firestore before rendering
  let concessionMap = {}; // admissionNo → { concessionFee, setBy, setAt, studentName, class, section, block }
  try {
    const snap = await schoolCol('concessionFees').get();
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.admissionNo) concessionMap[data.admissionNo] = { ...data, id: d.id };
    });
  } catch(e) {
    console.warn('[CHG-005] concessionFees fetch failed (non-fatal):', e.message);
  }
  const concessionList = Object.values(concessionMap);

  setContent(`
    <div class="page-head flex-between" style="margin-bottom:20px">
      <div>
        <div class="page-title">💰 Fee Structure</div>
        <div class="page-sub">Monthly tuition rates by class — ${isPrincipal ? 'Principal can edit rates & set concessions' : 'View only · Operative fee shown per student'}</div>
      </div>
      ${isPrincipal ? `<button class="btn btn-primary" id="feeStructEditBtn" onclick="toggleFeeStructEdit()">✏️ Edit Rates</button>` : ''}
    </div>

    <!-- ── Standard Rates Grid ── -->
    <div class="card">
      <div class="card-hdr flex-between">
        <span class="card-title">Standard Monthly Rates by Class</span>
        ${isPrincipal
          ? `<span style="font-size:11px;color:var(--gold-lt);background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.30);border-radius:6px;padding:3px 10px">Principal Access</span>`
          : `<span style="font-size:11px;color:var(--warn);background:rgba(212,150,42,0.12);border:1px solid rgba(212,150,42,0.25);border-radius:6px;padding:3px 10px;font-weight:600">🔒 View Only</span>`
        }
      </div>
      <div class="card-body">
        <div id="feeStructAlert"></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px" id="feeStructGrid">
          ${(() => {
            // ══════════════════════════════════════════════════════════════════
            // RENDER THE CLASS LIST, NOT THE SCHEDULE'S KEYS.
            //
            // This iterated Object.entries(getFeeSchedule()), so ANY stray key in
            // config.feeSchedule rendered as a class with an editable rate box.
            // The live school has one: 'monthly', at 1,700. Nobody is enrolled in
            // it so no student was mispriced — but it was editable, and sooner or
            // later someone types a number into a class that does not exist and
            // wonders why nothing changes.
            //
            // Filtering it out of the FORM also keeps it out of the save. Since
            // 8ad2271 writes per-class dot-paths, a key absent from the form is
            // left untouched in Firestore rather than deleted, so this hides the
            // junk without destroying anything.
            // ══════════════════════════════════════════════════════════════════
            const classList  = getClassList();
            const sched      = getFeeSchedule();
            const known      = new Set(classList);
            const substituted = (typeof getFeeScheduleSubstituted === 'function')
              ? new Set(getFeeScheduleSubstituted()) : new Set();
            const strays = Object.keys(sched).filter(k => !known.has(k));
            if (strays.length) {
              console.warn('[FEE STRUCTURE] config.feeSchedule holds ' + strays.length +
                ' key(s) that are not classes and are NOT shown or saved: ' + strays.join(', ') +
                '. Harmless — no student can match them — but worth clearing at the source.');
            }
            return classList.map(cls => {
              const rate = sched[cls];
              // A class showing a built-in default rather than a stored rate. Billing
              // uses it; saveFeeStructure will NOT write it back untouched (900f38d).
              const isGuess = substituted.has(cls);
              return `
            <div style="background:rgba(14,28,18,0.40);border:1px solid ${isGuess ? 'rgba(212,150,42,0.45)' : 'var(--glass-border)'};border-radius:10px;padding:14px 16px">
              <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:700">${cls}</div>
              <div class="fee-struct-display" data-class="${cls}" style="font-size:22px;font-weight:700;color:${isGuess ? 'var(--warn)' : 'var(--gold-lt)'};font-family:'Bebas Neue',sans-serif;letter-spacing:1px">₹${fmtNum(rate)}</div>
              ${isGuess ? `<div style="font-size:9px;color:var(--warn);letter-spacing:0.4px;margin-top:4px;font-weight:700">NOT SET · SHOWING DEFAULT</div>` : ''}
              ${isPrincipal ? `<input class="form-control fee-struct-input" data-class="${cls}" value="${rate}" type="number" min="0" step="50" style="display:none;margin-top:8px;font-size:14px;padding:8px 10px">` : ''}
            </div>`;
            }).join('');
          })()}
        </div>
        ${isPrincipal ? `
        <div id="feeStructButtons" style="display:none;margin-top:16px;gap:10px">
          <button class="btn btn-primary" onclick="saveFeeStructure()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save Fee Structure
          </button>
          <button class="btn btn-ghost" onclick="cancelFeeStructEdit()">Cancel</button>
        </div>` : ''}
      </div>
    </div>

        <!-- ── How Fee Structure Works ── -->
    <div class="card" style="margin-top:18px">
      <div class="card-hdr"><span class="card-title">ℹ️ How Fee Structure Works</span></div>
      <div class="card-body" style="color:var(--muted);font-size:14px;line-height:1.7">
        <p>• Monthly rates defined here are used by <strong>Due Fees</strong> to compute outstanding balances.</p>
        <p>• Changes take effect immediately for all future fee calculations.</p>
        ${isPrincipal ? `<p>• To modify standard rates, click <strong>Edit Rates</strong> above.</p>
        <p>• To set a student-level concession, use <strong>+ Set Concession</strong> or navigate to <strong>Concession Students</strong> in the sidebar.</p>` : `<p>• Contact the Principal to adjust rates or set student-level concessions.</p>`}
        <p>• Operative fee = concession fee (if set by Principal) or standard class fee — whichever applies.</p>
      </div>
    </div>
  `);
  setActiveNav('feeStructure');
}


