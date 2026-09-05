/* ============================================================
   STUDENT PROMOTIONS (Phase 7 / BUG-H06 FIX)
   renderPromotions() was called from renderView() but never implemented.
   BUG-H06 FIX: runBulkPromotion() now writes Grade 10 graduates to the
   terminatedStudents collection using the exact same schema as terminateStudent(),
   so they appear correctly in the Terminated section, Reports, and fee checks.
   ============================================================ */

// BUG-H02 FIX: PROMOTION_CHAIN is now derived from the tenant's class list.
// Colonel's 13-class order is the fallback if no Firestore config is found.
function getPromotionChain() { return getClassList(); }
// Legacy alias for code that references PROMOTION_CHAIN directly:
const PROMOTION_CHAIN = new Proxy([], {
  get(_, key) {
    const chain = getClassList();
    if (key === 'length')   return chain.length;
    if (key === 'indexOf')  return chain.indexOf.bind(chain);
    if (key === Symbol.iterator) return chain[Symbol.iterator].bind(chain);
    const idx = parseInt(key, 10);
    return isNaN(idx) ? chain[key] : chain[idx];
  }
});

async function renderPromotions() {
  if (currentRole !== 'principal') {
    setContent('<div class="alert alert-danger" style="margin:24px">Access denied. Only the Principal can run promotions.</div>');
    return;
  }
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    const allStudents = await getStudentCache();
    const active = allStudents.filter(s => s.status === 'active');

    // Build per-class counts for preview table
    const classCounts = {};
    PROMOTION_CHAIN.forEach(c => { classCounts[c] = 0; });
    active.forEach(s => { if (classCounts[s.class] !== undefined) classCounts[s.class]++; });

    const rows = PROMOTION_CHAIN.map((cls, i) => {
      const count   = classCounts[cls] || 0;
      const nextCls = i < PROMOTION_CHAIN.length - 1 ? PROMOTION_CHAIN[i + 1] : null;
      const isLast  = cls === PROMOTION_CHAIN[PROMOTION_CHAIN.length - 1]; // BUG-O03 FIX: use dynamic terminal class, not hardcoded 'Grade 10'
      const arrow   = isLast
        ? `<span style="color:var(--danger);font-weight:700">→ Terminated</span>`
        : nextCls
          ? `<span style="color:var(--gold-lt)">→ ${nextCls}</span>`
          : '—';
      return `
        <tr>
          <td style="font-weight:600">${cls}</td>
          <td style="text-align:center">${count}</td>
          <td>${arrow}</td>
          <td style="text-align:center">
            ${isLast
              ? `<span style="font-size:11px;background:rgba(224,82,82,0.15);color:var(--danger);padding:2px 8px;border-radius:4px;font-weight:700">GRADUATE → TERMINATE</span>`
              : `<span style="font-size:11px;background:rgba(26,92,56,0.2);color:var(--gold-lt);padding:2px 8px;border-radius:4px;">PROMOTE</span>`
            }
          </td>
        </tr>`;
    }).join('');

    const totalActive  = active.length;
    const terminalClass = PROMOTION_CHAIN[PROMOTION_CHAIN.length - 1]; // BUG-O03 FIX: derive terminal class from tenant's chain
    const grade10Count = classCounts[terminalClass] || 0;

    setContent(`
      <div style="padding:24px;max-width:780px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px">
          <div>
            <div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--silver-lt);margin-bottom:4px">Annual Student Promotions</div>
            <div style="font-size:13px;color:var(--muted)">Promote all active students to their next class. ${terminalClass} graduates will be moved to Terminated Students.</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" style="white-space:nowrap" onclick="renderPromotionHistory()">
              📋 Promotion History
            </button>
            <button class="btn btn-secondary btn-sm" style="white-space:nowrap" onclick="renderIndividualPromotion()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Individual Promotion
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
          <div class="stat-card"><div class="stat-num">${totalActive}</div><div class="stat-label">Active Students</div></div>
          <div class="stat-card"><div class="stat-num">${totalActive - grade10Count}</div><div class="stat-label">Will Be Promoted</div></div>
          <div class="stat-card" style="border-color:rgba(224,82,82,0.3)"><div class="stat-num" style="color:var(--danger)">${grade10Count}</div><div class="stat-label">${terminalClass} → Terminated</div></div>
        </div>

        <div class="card" style="margin-bottom:24px">
          <div style="font-size:12px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin-bottom:14px">Promotion Map</div>
          <table class="data-table">
            <thead><tr><th>Current Class</th><th style="text-align:center">Students</th><th>Moves To</th><th style="text-align:center">Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div class="alert alert-warning" style="margin-bottom:20px;font-size:13px">
          ⚠️ <strong>This action cannot be undone.</strong> All ${totalActive} active students will be promoted simultaneously.
          ${grade10Count > 0 ? `<br><strong>${grade10Count} Grade 10 student(s)</strong> will be marked as graduated and moved to Terminated Students.` : ''}
          <br>Students with pending dues will still be promoted — outstanding balances are preserved.
        </div>

        <div id="promotionAlert"></div>

        <div style="display:flex;gap:12px">
          <button class="btn btn-primary" id="promotionBtn" onclick="confirmAndPromote()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="17 11 21 7 17 3"/><line x1="21" y1="7" x2="9" y2="7"/><polyline points="7 21 3 17 7 13"/><line x1="15" y1="17" x2="3" y2="17"/></svg>
            Run Annual Promotion
          </button>
          <button class="btn btn-ghost" onclick="navigate('dashboard')">Cancel</button>
        </div>
      </div>
    `);
  } catch(e) {
    setContent(`<div class="alert alert-danger" style="margin:24px">Error loading promotion data: ${e.message}</div>`);
  }
}

async function confirmAndPromote() {
  showConfirm(
    'Confirm Annual Promotion',
    'This will promote ALL active students to their next class. Grade 10 students will be graduated and moved to Terminated Students. <strong>This cannot be undone.</strong> Proceed?',
    async () => { await runBulkPromotion(); }
  );
}

async function runBulkPromotion() {
  const btn = document.getElementById('promotionBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Promoting…'; }

  // Timeout safety — re-enable button if Firestore stalls
  const timeout = setTimeout(() => {
    if (btn) { btn.disabled = false; btn.textContent = 'Run Annual Promotion'; }
    showFormAlert('promotionAlert', 'Promotion timed out. Please check your connection and try again.', 'danger');
  }, 30000);

  try {
    const allStudents = await getStudentCache();
    const active = allStudents.filter(s => s.status === 'active');
    if (active.length === 0) {
      clearTimeout(timeout);
      showFormAlert('promotionAlert', 'No active students found to promote.', 'warning');
      if (btn) { btn.disabled = false; btn.textContent = 'Run Annual Promotion'; }
      return;
    }

    const today      = (()=>{const _d=nowIST();return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;})() /* BUG-TS-001 FIX */;
    const curAcadYr  = _getCurrentAcademicYearStr();
    const batch      = db.batch();
    const toTerminate = []; // collect for terminatedStudents writes (outside batch — need doc refs)
    const alreadyDone = []; // F11: students already promoted for this academic year

    for (const s of active) {
      // ══════════════════════════════════════════════════════════════════════
      // F11 — RUNNING THIS TWICE PROMOTED EVERY STUDENT TWICE.
      //
      // The class advance is unconditional: class = PROMOTION_CHAIN[idx + 1]. Since
      // 3a77db4 a same-year re-run correctly leaves academicYear alone, because the
      // year has already crossed -- but the CLASS still moves. So a second run in the
      // same year sends Grade 5 to Grade 7, and a third to Grade 8. Nothing rejects
      // it, and the only visible trace is that everyone is suddenly a year ahead.
      //
      // promotionHistory grew with it. arrayUnion de-duplicates on exact value
      // equality, and every entry carries `promotedAt: new Date().toISOString()`, so
      // two runs are never equal and both are appended -- the unbounded growth F12
      // describes, with each entry attesting to a promotion that should not have
      // happened.
      //
      // A student is promoted ONCE per academic year. The history says whether that
      // has happened, so the history is what gets asked -- and it is asked through
      // _normaliseAcademicYear, since 2025-26 and 2025-2026 are the same year and
      // three students on this roll store the long form (F4).
      // ══════════════════════════════════════════════════════════════════════
      const _curYrNorm = _normaliseAcademicYear(curAcadYr);
      const _promotedThisYear = (s.promotionHistory || []).some(h =>
        h && h.source === 'annual' &&
        _normaliseAcademicYear(h.academicYear || '') === _curYrNorm);
      if (_promotedThisYear) {
        alreadyDone.push(s.admissionNumber || s.name || s.id);
        continue;
      }

      const idx     = PROMOTION_CHAIN.indexOf(s.class);
      const isGrade10 = s.class === PROMOTION_CHAIN[PROMOTION_CHAIN.length - 1]; // BUG-O03 FIX: dynamic terminal class
      const sRef    = schoolCol('students').doc(s.id);

      // JSS-REF-014: log every annual promotion into the same promotionHistory
      // array that Individual Promotion writes to, so the Promotion History
      // page shows one complete record regardless of how the student was promoted.
      const histEntry = {
        source:              'annual',
        fromClass:           s.class,
        toClass:             isGrade10 ? 'Graduated' : PROMOTION_CHAIN[idx + 1],
        promotionDate:       today,
        academicYear:        curAcadYr,
        priorGradeDueMonths: [],
        priorGradeRate:      0,
        effectiveMonth:      null,
        promotedBy:          currentUser.uid,
        promotedByName:      currentProfile?.name || currentUser.email || 'Unknown',
        promotedAt:          new Date().toISOString(),
        studentName:         s.name || '',
        admissionNumber:     s.admissionNumber || ''
      };

      // ══════════════════════════════════════════════════════════════════════
      // F11/F12 — arrayUnion DOES NOT DEDUPE THIS ENTRY.
      //
      // arrayUnion skips a value only when it is DEEPLY EQUAL to one already in the
      // array. histEntry carries promotedAt: new Date().toISOString(), which differs
      // by milliseconds on every run, so every re-run of Annual Promotion appends a
      // fresh near-identical record instead of being ignored.
      //
      // Re-running is not exotic: the button times out after 30 seconds and tells the
      // operator to try again. A second attempt after a partial commit re-appends for
      // every student already processed, and promotionHistory grows without bound.
      //
      // It is not cosmetic either. _flHistoricalRateForMonth walks this array to work
      // out which rate was in force for a given month, so duplicate entries feed
      // directly into rate resolution — the machinery item 5 depends on.
      //
      // A student is promoted once per academic year per source. Check for that
      // instead of trusting a timestamp to collide.
      // ══════════════════════════════════════════════════════════════════════
      const _alreadyLoggedBA = (typeof _flPromotionAlreadyLogged === 'function')
        ? _flPromotionAlreadyLogged(s, curAcadYr, 'annual')
        : (Array.isArray(s.promotionHistory) && s.promotionHistory.some(h =>
            h && h.source === 'annual'
            && _normaliseAcademicYear(h.academicYear || '') === _normaliseAcademicYear(curAcadYr)));
      if (_alreadyLoggedBA) {
        console.warn('[ANNUAL PROMOTION] ' + (s.admissionNumber || s.id) +
          ' already has an annual promotion logged for ' + curAcadYr +
          '. Not appending a second — promotionHistory feeds rate resolution.');
      }

      if (isGrade10) {
        // Graduate: mark as terminated in students collection
        batch.update(sRef, {
          status:            'terminated',
          terminationDate:   today,
          terminationReason: 'Graduated — Annual Promotion',
          ...(_alreadyLoggedBA ? {} : { promotionHistory: firebase.firestore.FieldValue.arrayUnion(histEntry) })
        });
        toTerminate.push(s); // handle terminatedStudents write separately
      } else if (idx >= 0 && idx < PROMOTION_CHAIN.length - 1) {
        // ══════════════════════════════════════════════════════════════════════
        // A PROMOTION CROSSES A YEAR BOUNDARY. THE YEAR HAS TO CROSS WITH IT.
        //
        // This advanced `class` and stopped. academicYear kept pointing at the year
        // the student had just left, and the year they had just ENTERED got no month
        // grid at all. Measured on the live roll: 145 of 158 active students carry
        // annual promotion history and 140 still read academicYear 2025-26.
        //
        // Money was not lost, only because 9558d03 bills a grid-less CURRENT year in
        // full for an active student. Everything else that trusts the field was
        // wrong — Record Payment showed the prior-year advisory to students sitting
        // in the current one.
        //
        // WHY THE GRID MOVES IN THE SAME WRITE. _flYearFieldMap binds monthStatus to
        // academicYear. Roll the year without moving the grid and last year's PAID
        // marks silently become THIS year's, wiping a full year of dues for every
        // promoted student. The two are one operation or they are a data loss.
        //
        // previousYearMonthStatus may already hold the year before that. Overwriting
        // it would destroy real billing history, so it is pushed into
        // openingOutstandingDues[] first — the same structure multi-year onboarding
        // uses, carrying its own year and rate so _flStudentYearOutstanding prices it
        // at what it cost THEN (54d9d88) rather than at today's schedule.
        // ══════════════════════════════════════════════════════════════════════
        const _oldYr     = _normaliseAcademicYear(s.academicYear || '');
        const _newYr     = _normaliseAcademicYear(curAcadYr);
        const _crosses   = !!_oldYr && _oldYr !== _newYr;
        const _upd       = {
          class:            PROMOTION_CHAIN[idx + 1],
          // Same F11 guard as the graduation branch above.
          ...(_alreadyLoggedBA ? {} : { promotionHistory: firebase.firestore.FieldValue.arrayUnion(histEntry) })
        };

        if (_crosses) {
          // ════════════════════════════════════════════════════════════════════
          // ARCHIVE BY THE YEAR THE GRID ACTUALLY DESCRIBES, NOT BY POSITION.
          //
          // The first version of this assumed a promotion always steps ONE year, so
          // monthStatus could just slide into previousYearMonthStatus. False on this
          // roll: 144 of 148 active students still carry academicYear 2025-26 after a
          // promotion that never rolled the field, so next June the step is 2025-26 ->
          // 2027-28 and that slide would relabel a two-year-old grid as last year's.
          // Losing history is bad; silently RENAMING it is worse, because every figure
          // downstream stays plausible.
          //
          // A grid is filed under the year it describes:
          //   monthStatus             describes _oldYr
          //   previousYearMonthStatus describes the year before _oldYr
          // If _oldYr is exactly one year back, previousYearMonthStatus is the right
          // home. Otherwise it goes into openingOutstandingDues[] under its real year,
          // carrying the rate in force then so 54d9d88 prices it correctly.
          // ════════════════════════════════════════════════════════════════════
          const _yrStart = y => parseInt(String(_normaliseAcademicYear(y || '')).slice(0, 4), 10);
          const _mkYr    = st => Number.isFinite(st) ? st + '-' + String(st + 1).slice(2) : '';
          const _newSt   = _yrStart(_newYr), _oldSt = _yrStart(_oldYr);
          const _gap     = (Number.isFinite(_newSt) && Number.isFinite(_oldSt)) ? (_newSt - _oldSt) : 1;

          const _oldGrid  = (s.monthStatus && Object.keys(s.monthStatus).length) ? s.monthStatus : null;
          const _prevGrid = (s.previousYearMonthStatus && Object.keys(s.previousYearMonthStatus).length)
                              ? s.previousYearMonthStatus
                              : ((s.prevYearMonthStatus && Object.keys(s.prevYearMonthStatus).length)
                                  ? s.prevYearMonthStatus : null);

          const _arr  = Array.isArray(s.openingOutstandingDues) ? s.openingOutstandingDues.slice() : [];
          const _rate = Number(s.monthlyFee) || 0;
          const _file = (grid, yr) => {
            if (!grid || !yr) return;
            if (_arr.some(e => e && _normaliseAcademicYear(e.year || '') === yr)) return; // already filed
            _arr.push({ year: yr, class: s.class || '', monthlyFee: _rate, monthStatus: { ...grid } });
          };

          _upd.academicYear         = _newYr;
          _upd.previousAcademicYear = _oldYr;

          // The grid one step back from the NEW year is the only one that belongs in
          // previousYearMonthStatus. Everything older is filed by name.
          if (_gap === 1) {
            _file(_prevGrid, _mkYr(_oldSt - 1));
            if (_oldGrid) _upd.previousYearMonthStatus = { ..._oldGrid };
          } else {
            _file(_oldGrid,  _normaliseAcademicYear(_oldYr));
            _file(_prevGrid, _mkYr(_oldSt - 1));
            // Nothing describes the year immediately before the new one, so leave that
            // slot EMPTY rather than filling it with a grid from a different year.
            _upd.previousYearMonthStatus = {};
          }
          if (_arr.length) _upd.openingOutstandingDues = _arr;

          // The year being entered starts clean.
          const _fresh = {};
          ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May']
            .forEach(m => _fresh[m] = 'DUE');
          _upd.monthStatus = _fresh;
        }

        batch.update(sRef, _upd);
      }
      // idx === -1 means unknown class — skip silently, don't corrupt data
    }

    // Commit all student doc updates atomically
    await batch.commit();

    // F11: say so rather than silently doing nothing. A Principal who re-runs this
    // needs to know it was refused, not assume it worked and wonder why no class moved.
    if (alreadyDone.length) {
      console.warn('[PROMOTION] ' + alreadyDone.length + ' student(s) were already promoted ' +
        'for ' + curAcadYr + ' and were SKIPPED. Re-running would have advanced them a ' +
        'second class:', alreadyDone);
      showToast(`${alreadyDone.length} student${alreadyDone.length !== 1 ? 's were' : ' was'} ` +
        `already promoted for ${curAcadYr} — skipped, not promoted twice.`, 'warning');
    }

    // BUG-H06 FIX: Write terminatedStudents records for all Grade 10 graduates.
    // renderTerminated() reads from terminatedStudents collection — without this,
    // promoted Grade 10 students were invisible in Terminated section and Reports.
    // Matches exact schema used by terminateStudent() for consistency.
    for (const s of toTerminate) {
      try {
        // ══════════════════════════════════════════════════════════════════════
        // THE GRADUATION SNAPSHOT WAS BUILT FROM A FROZEN RECEIPT FIELD.
        //
        // It read the newest transaction's remainingBalance -- the value F3
        // established that NOTHING ever updates: not a later payment, not a waiver,
        // not a concession, not a reconcile. Test Student One's transaction still carried
        // 17,000 long after his aggregate had moved.
        //
        // A termination snapshot is permanent. Nothing recomputes it afterwards, so
        // whatever is written here is what the school believes a graduate owed,
        // forever. Two ways it was wrong:
        //
        //   · A stale figure from whenever the last receipt happened to be printed.
        //   · Worse, `sortedTxs.length > 0 ? ... : 0` -- a student with NO
        //     transactions snapshotted as owing ZERO. A Grade 10 who never paid a
        //     rupee graduated with a permanent record saying they owed nothing, and
        //     the debt left the books entirely.
        //
        // terminateStudent and bulk-remove both compute this properly.  The comment
        // above says this block "matches exact schema used by terminateStudent()" --
        // it matched the schema and not the arithmetic, which is exactly how it went
        // unnoticed.
        // ══════════════════════════════════════════════════════════════════════
        let totalPaid = 0, outstanding = 0;
        if (typeof _computeAllYearsFeeSnapshot === 'function') {
          const _snap = await _computeAllYearsFeeSnapshot(s.id);
          totalPaid   = _snap.totalPaid   || 0;
          outstanding = _snap.outstanding || 0;
        } else {
          // Fallback only if the shared snapshot helper is unavailable. Sum the cash
          // rather than trust a frozen balance, and say so — an under-stated
          // graduation debt is money written off in silence.
          const txSnap = await schoolCol('feeTransactions').where('studentId','==',s.id).get();
          totalPaid = txSnap.docs.reduce((sum,d) => sum + (d.data().amountPaid||0), 0);
          console.warn('[GRADUATION] _computeAllYearsFeeSnapshot unavailable for ' +
            (s.admissionNumber || s.id) + '. Outstanding recorded as 0 — verify this ' +
            'graduate against Due Fee before trusting the Terminated record.');
        }

        // F8: one snapshot per student. Annual Promotion is the path most likely to
        // hit this — it runs across the whole school at once, and if it is re-run after
        // a partial failure every graduate already written gets a second record.
        const _gradTermRef = await _flSnapshotRef('terminatedStudents', s.id, 'GRADUATION');
        await _gradTermRef.set({
          studentId:          s.id,
          studentName:        s.name,
          admissionNumber:    s.admissionNumber  || '',
          class:              s.class,
          section:            s.section          || '',
          terminationDate:    today,
          terminationReason:  'Graduated — Annual Promotion',
          totalDue:           totalPaid + outstanding,
          amountPaid:         totalPaid,
          outstandingBalance: outstanding,
          terminatedBy:       currentUser.uid,
        });

        // BUG-P12 FIX: Also write to legacyStudents collection with promotionYear
        // so Grade 10 graduates have a dedicated archive queryable by year.
        await schoolCol('legacyStudents').add({
          studentId:          s.id,
          studentName:        s.name,
          admissionNumber:    s.admissionNumber  || '',
          class:              s.class,
          section:            s.section          || '',
          block:              s.block            || '',
          parentName:         s.parentName       || '',
          contact:            s.contact          || '',
          gender:             s.gender           || '',
          promotionYear:      nowIST().getFullYear(),
          promotionDate:      today,
          totalDue:           totalPaid + outstanding,
          amountPaid:         totalPaid,
          outstandingBalance: outstanding,
          promotedBy:         currentUser.uid,
          createdAt:          firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch(termErr) {
        // Non-fatal — student doc is already marked terminated; record can be created manually.
        // Which is exactly why this cannot be silenced: without an identifier the operator
        // cannot know WHICH record to create, and a terminatedStudents row goes missing
        // quietly. So the admission number — the operational key, and what they would type
        // to find the pupil — is always printed. The NAME adds nothing to that recovery and
        // is the part that reads as a child in a console, so it is gated behind
        // window.VELTRIX_DEBUG like the [PROFILE] warning.
        console.error('Failed to write terminatedStudents for admission no:',
          s.admissionNumber || s.id,
          (window.VELTRIX_DEBUG ? s.name : ''), termErr);
      }
    }

    clearTimeout(timeout);

    // ══════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-005 ITEMS 4 + 17 — reconcile everyone this re-priced.
    //
    // Annual Promotion changes the CLASS of every active student, and the class is
    // what every rate resolution starts from. It invalidated caches and stopped
    // there — but a cache bust makes the next read re-fetch the STORED aggregate,
    // it does not recompute it. So the entire school's outstandingBalance kept its
    // pre-promotion, old-class values, on every screen, until each student happened
    // to be touched by some other fee action.
    //
    // Bounded concurrency (_flReconcileMany): firing hundreds of unbounded
    // recomputes can get the client rate-limited, which would leave SOME students
    // reconciled and others not — a worse state than none, because the numbers
    // would then disagree with each other rather than being uniformly stale.
    //
    // Graduated students are excluded: their terminatedStudents/legacyStudents
    // records were snapshotted above and must not move afterwards.
    // ══════════════════════════════════════════════════════════════════════════
    const _gradIds = new Set(toTerminate.map(s => s.id));
    const _promotedIds = active
      .filter(s => !_gradIds.has(s.id) && PROMOTION_CHAIN.indexOf(s.class) >= 0)
      .map(s => s.id);
    if (_promotedIds.length && typeof _flReconcileMany === 'function') {
      if (btn) btn.textContent = `Reconciling 0/${_promotedIds.length}…`;
      const _rc = await _flReconcileMany(_promotedIds, 'annual_promotion', (done, total) => {
        if (btn) btn.textContent = `Reconciling ${done}/${total}…`;
      });
      if (_rc.failed > 0) {
        showToast(`⚠️ ${_rc.failed} of ${_promotedIds.length} students could not be reconciled — ` +
                  `run Reconcile All Dues from Due Fee to retry.`, 'warning');
      }
    }

    // Invalidate all caches so every page reflects promotion
    invalidateStudentCache();
    invalidateFinanceCache();
    window._allTerminated = null;
    window._promotionRows = null;

    const grade10Count = toTerminate.length;
    const promotedCount = active.length - grade10Count;
    showToast(`✅ Promotion complete — ${promotedCount} promoted, ${grade10Count} graduated.`, 'success');
    // Reload promotions page to show fresh counts
    await renderPromotions();

  } catch(e) {
    clearTimeout(timeout);
    if (btn) { btn.disabled = false; btn.textContent = 'Run Annual Promotion'; }
    showFormAlert('promotionAlert', 'Promotion failed: ' + e.message + ' — No data was changed.', 'danger');
  }
}

/* ============================================================
   JSS-REF-013 FEATURE — INDIVIDUAL STUDENT PROMOTION
   WITH CARRY-FORWARD FEE LOGIC
   ------------------------------------------------------------
   Lets the Principal promote ONE active student to their next
   class independently of the Annual Promotion batch run.

   Carry-forward rule
   (JSS-REF-VELTRIX-2026-005 ITEM 5, OPTION B — rewritten):

   ONE billing rate for the whole academic year: the NEW class's.
   Every month of the year, before or after the promotion date, is
   billed at the new class's monthly fee. There is no second rate
   anywhere in the system.

   - Months already PAID at the old class's rate keep their credit
     at what was actually paid, and owe the difference
     (new rate − old rate) so each month totals the new class fee.
     The credit side is resolved by _flHistoricalRateForMonth.
   - Months left UNPAID up to the promotion date are still tracked
     as priorGradeDueMonths, but that is now PROVENANCE ONLY — a
     label showing which months predate the promotion. They are
     billed at the new class's rate like everything else.
   - The new class's fee CYCLE still begins the month immediately
     following the promotion date; that is about which month starts
     the new schedule, not about what any month costs.

   WHY OPTION B. Charging unpaid pre-promotion months at the old
   rate while topping paid ones up to the new rate priced the same
   calendar month differently depending on whether it happened to be
   paid before the promotion. It also put Record Payment's quote in
   direct conflict with the fee engine, which has always billed the
   whole year at the current rate — the student paid the quoted old
   rate and the month stayed PARTIAL forever.
   ============================================================ */
// The ONLY top-level cross-module reference in the codebase, and therefore the
// only genuine LOAD-TIME dependency: this runs while promotions.js is being
// evaluated, not when a function is called, so ACAD_MONTHS_FULL must already
// exist. It does — core.js is first in index.html and cannot move (it creates
// `db` and `auth`) — but the constraint is real now where it was not before, and
// reversing the load order fails here and nowhere else. Every other use of the
// canonical month constants sits inside a function and binds at call time.
const _IP_ACAD_MONTHS = ACAD_MONTHS_FULL;

function _ipAcadIdx(monthName) { return _IP_ACAD_MONTHS.indexOf(monthName); }

// Index (0-11) of a given calendar date within the academic year (June start).
function _ipAcadIdxForDate(d) {
  const m = d.getMonth(); // 0=Jan..11=Dec
  return m >= 5 ? m - 5 : m + 7;
}

// JSS-REF-014: Dedicated Promotion History page — same visual pattern as
// "Terminated Students — Fee History" (renderTerminatedFeeHistory). Pulls every
// promotion (both Annual and Individual) recorded across all students'
// `promotionHistory` arrays into one flat, searchable table.
window._promotionHistoryRows = null;
async function renderPromotionHistory() {
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    const students = await getStudentCache();
    const rows = [];
    students.forEach(s => {
      if (Array.isArray(s.promotionHistory)) {
        s.promotionHistory.forEach(h => rows.push({
          ...h,
          studentName:     h.studentName     || s.name || '—',
          admissionNumber: h.admissionNumber || s.admissionNumber || '—'
        }));
      }
    });
    rows.sort((a, b) => new Date(b.promotionDate || 0) - new Date(a.promotionDate || 0));
    window._promotionHistoryRows = rows;

    setContent(`
      <div class="page-head flex-between" style="margin-bottom:20px">
        <div>
          <div class="page-title">Promotion History</div>
          <div class="page-sub">${rows.length} promotion${rows.length !== 1 ? 's' : ''} recorded (Annual + Individual)</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="renderPromotions()">← Back to Student Promotions</button>
      </div>

      <div style="position:relative;margin-bottom:16px;max-width:420px">
        <input type="text" id="promoHistorySearch" class="search-box" style="width:100%"
          placeholder="Search students by name, admission no..." oninput="_filterPromotionHistory(this.value)">
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th><th>Adm#</th><th>From</th><th>To</th>
                  <th>Date</th><th>Academic Year</th><th>Source</th><th>Dues Carried</th><th>Promoted By</th>
                </tr>
              </thead>
              <tbody id="promoHistoryTbody">
                ${_renderPromotionHistoryRows(rows)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);
  } catch (e) {
    setContent(`<div class="alert alert-danger">Error loading promotion history: ${e.message}</div>`);
  }
}

function _renderPromotionHistoryRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--muted)">No promotions recorded yet.</td></tr>`;
  }
  return rows.map(h => `
    <tr>
      <td><strong>${sanitizeHTML(h.studentName)}</strong></td>
      <td class="muted">${sanitizeHTML(h.admissionNumber)}</td>
      <td>${sanitizeHTML(h.fromClass || '—')}</td>
      <td style="color:var(--gold-lt);font-weight:600">${sanitizeHTML(h.toClass || '—')}</td>
      <td>${fmtDateOnly(h.promotionDate)}</td>
      <td class="muted">${sanitizeHTML(h.academicYear || '—')}</td>
      <td>${h.source === 'annual' ? '<span class="badge badge-gray">Annual</span>' : '<span class="badge badge-yellow">Individual</span>'}</td>
      <td>${Array.isArray(h.priorGradeDueMonths) && h.priorGradeDueMonths.length
            ? `<span style="color:var(--danger)">${h.priorGradeDueMonths.length} month(s)</span>`
            : `<span style="color:var(--success)">—</span>`}</td>
      <td class="muted" style="font-size:11px">${sanitizeHTML(h.promotedByName || '—')}</td>
    </tr>`).join('');
}

function _filterPromotionHistory(q) {
  const rows = window._promotionHistoryRows || [];
  const lq = q.toLowerCase().trim();
  const filtered = !lq ? rows : rows.filter(h =>
    (h.studentName || '').toLowerCase().includes(lq) ||
    (h.admissionNumber || '').toLowerCase().includes(lq) ||
    (h.fromClass || '').toLowerCase().includes(lq) ||
    (h.toClass || '').toLowerCase().includes(lq)
  );
  const tbody = document.getElementById('promoHistoryTbody');
  if (tbody) tbody.innerHTML = _renderPromotionHistoryRows(filtered);
}

async function renderIndividualPromotion() {
  if (currentRole !== 'principal') {
    setContent('<div class="alert alert-danger" style="margin:24px">Access denied. Only the Principal can run promotions.</div>');
    return;
  }
  window._ipSelected = null;
  setContent(`
    <div style="padding:24px;max-width:780px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px">
        <div>
          <div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:var(--silver-lt);margin-bottom:4px">Individual Student Promotion</div>
          <div style="font-size:13px;color:var(--muted)">Promote a single student to their next class, with carry-forward fee logic for the current academic year (${_getCurrentAcademicYearStr()}).</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="white-space:nowrap" onclick="renderPromotions()">← Back to Annual Promotion</button>
      </div>

      <div class="card ip-search-card" style="margin-bottom:18px">
        <div style="position:relative">
          <input class="form-control" id="ipStudentSearch" placeholder="Search by name or admission number…" oninput="_ipSearchStudent(this.value)" autocomplete="off">
          <div id="ipStudentResults" style="display:none;position:absolute;z-index:9999;top:100%;left:0;right:0;background:var(--panel,#1c1f24);backdrop-filter:none;-webkit-backdrop-filter:none;border:1px solid rgba(255,255,255,0.18);border-radius:8px;margin-top:4px;max-height:280px;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,0.55)"></div>
        </div>
      </div>

      <div id="ipPreviewWrap">
        <div class="card" style="text-align:center;padding:32px 20px;color:var(--muted);font-size:13px">
          🔍 Search a student above and select them from the dropdown to view their promotion preview &amp; full promotion history here.
        </div>
      </div>
    </div>
  `);
}

let _ipSearchDebounce = null;
function _ipSearchStudent(q) {
  clearTimeout(_ipSearchDebounce);
  if (!q.trim()) { const el = document.getElementById('ipStudentResults'); if (el) el.style.display = 'none'; return; }
  _ipSearchDebounce = setTimeout(async () => {
    const all = await getStudentCache();
    const lq  = q.toLowerCase();
    const results = all.filter(s =>
      s.status === 'active' && (
        s.name?.toLowerCase().includes(lq) ||
        s.admissionNumber?.toLowerCase().includes(lq)
      )).slice(0, 8);
    const el = document.getElementById('ipStudentResults');
    if (!el) return;
    if (!results.length) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = results.map(s => `
      <div class="s-item" style="padding:9px 14px;cursor:pointer" onclick="_ipSelectStudent('${s.id}')">
        <div class="s-name">${sanitizeHTML(s.name)}</div>
        <div class="s-meta" style="font-size:12px;color:var(--muted)">Adm# ${sanitizeHTML(s.admissionNumber)} · ${sanitizeHTML(s.class)} · Sec ${sanitizeHTML(s.section)}</div>
      </div>`).join('');
  }, 300);
}

// Computes the carry-forward split for a student given all their fee transactions.
// promotionDateStr: 'YYYY-MM-DD'
function _ipComputeCarryForward(sData, allTxDocs, promotionDateStr) {
  const curAcadYear = _getCurrentAcademicYearStr();
  const curYearNorm = _normaliseAcademicYear(curAcadYear);
  const _shortToFull = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};

  // Paid months this academic year — same two sources used by Record Payment's month-lock logic.
  // ══════════════════════════════════════════════════════════════════════════
  // SETTLED IS SETTLED — PAID OR WAIVED. THIS SET DECIDES WHAT IS CARRIED.
  //
  // priorGradeDueMonths below is `elapsedMonths.filter(m => !paidMonths.has(m))`,
  // so anything missing from this set is carried into the new grade as a debt at
  // the old rate. The grid branch added only N/A-PAID and PAID, so a month marked
  // EXCUSED — waived, nothing owed — was carried forward as owed. Promotion would
  // re-bill a fee the school had already forgiven.
  //
  // The transaction branch also read monthsSelected alone. An excused_waiver
  // carries its months there, so recent waivers were caught by accident; older
  // ones carry monthsExcused ONLY (the ITEM 9 shape) and were missed entirely.
  // Both keys are read now, the same way the engine reads them.
  //
  // Third place EXCUSED has been mishandled: the past-due grid offered waived
  // months for collection, and the profile card's stored-grid fallback counted
  // them as due. The pattern is always the same — a status test that lists the
  // two "paid" spellings and forgets the third state exists.
  // ══════════════════════════════════════════════════════════════════════════
  const paidMonths = new Set();
  allTxDocs.forEach(t => {
    if (_normaliseAcademicYear(t.academicYear) !== curYearNorm) return;
    if (Array.isArray(t.monthsSelected)) t.monthsSelected.forEach(m => paidMonths.add(m));
    if (Array.isArray(t.monthsExcused))  t.monthsExcused.forEach(m => paidMonths.add(m));
  });
  const studentYearNorm = _normaliseAcademicYear(sData.academicYear || '');
  if ((!studentYearNorm || studentYearNorm === curYearNorm) && sData.monthStatus && typeof sData.monthStatus === 'object') {
    Object.entries(sData.monthStatus).forEach(([m, status]) => {
      const st = String(status || '').toUpperCase();
      if (st === 'N/A-PAID' || st === 'PAID' || st === 'EXCUSED') paidMonths.add(_shortToFull[m] || m);
    });
  }

  const [py, pm, pd] = promotionDateStr.split('-').map(Number);
  const promoDate  = new Date(py, (pm || 1) - 1, pd || 1);
  const elapsedIdx = _ipAcadIdxForDate(promoDate); // index of the promotion month itself
  const elapsedMonths = _IP_ACAD_MONTHS.slice(0, elapsedIdx + 1); // June..promotion month, inclusive

  const priorGradeDueMonths = elapsedMonths.filter(m => !paidMonths.has(m));
  const effectiveIdx      = Math.min(elapsedIdx + 1, 11); // next calendar month after promotion; clamp to May
  const effectiveMonth    = _IP_ACAD_MONTHS[effectiveIdx];

  return { curAcadYear, paidMonths, elapsedMonths, priorGradeDueMonths, effectiveMonth };
}

// JSS-REF-014: Renders this student's full promotion history (every past
// promotion, not just the latest one in `midYearPromotion`) as a card shown
// right after they're picked from the same search box used to find them.
function _ipRenderHistory(s) {
  const history = Array.isArray(s.promotionHistory) ? s.promotionHistory.slice() : [];
  if (!history.length) {
    return `
      <div class="card" style="margin-bottom:18px">
        <div style="font-size:12px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Promotion History</div>
        <div style="font-size:13px;color:var(--muted)">No prior promotions on record for ${sanitizeHTML(s.name)}.</div>
      </div>`;
  }
  history.sort((a, b) => new Date(b.promotionDate || 0) - new Date(a.promotionDate || 0));
  const rows = history.map(h => `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px">
      <span style="padding:3px 10px;border-radius:5px;background:rgba(255,255,255,0.06)">${sanitizeHTML(h.fromClass||'—')}</span>
      <span style="color:var(--gold-lt)">→</span>
      <span style="padding:3px 10px;border-radius:5px;background:rgba(201,168,76,0.12);color:var(--gold-lt);font-weight:600">${sanitizeHTML(h.toClass||'—')}</span>
      <span style="color:var(--muted)">on ${fmtDateOnly(h.promotionDate)}</span>
      <span style="color:var(--muted)">· AY ${sanitizeHTML(h.academicYear||'—')}</span>
      ${Array.isArray(h.priorGradeDueMonths) && h.priorGradeDueMonths.length
        ? `<span style="color:var(--danger)">· ${h.priorGradeDueMonths.length} month(s) carried forward against ${sanitizeHTML(h.fromClass||'—')}</span>`
        : ''}
    </div>`).join('');
  return `
    <div class="card" style="margin-bottom:18px">
      <div style="font-size:12px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Promotion History (${history.length})</div>
      <div>${rows}</div>
    </div>`;
}

async function _ipSelectStudent(id) {
  const el = document.getElementById('ipStudentResults');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  const wrap = document.getElementById('ipPreviewWrap');
  wrap.innerHTML = `<div class="loader-wrap" style="padding:40px 0"><div class="spinner"></div></div>`;

  try {
    const all = await getStudentCache();
    const s   = all.find(x => x.id === id);
    if (!s) { wrap.innerHTML = `<div class="alert alert-danger">Student not found.</div>`; return; }

    // JSS-REF-VELTRIX-2026-003 ITEM 04 FIX: Grade 10 (the tenant's terminal class,
    // dynamically the last entry in the promotion chain) has no class above it to
    // promote into. The free-choice class dropdown introduced by JSS-REF-013 v2
    // technically let a Grade 10 student be "promoted" into any other class in the
    // list — sideways or backward — via this module, bypassing the graduate/leave
    // workflow that Annual Promotion already applies correctly to terminal-class
    // students. Lock the ceiling here: Individual Promotion refuses to proceed for
    // a terminal-class student and points to the correct workflow instead.
    const _ipChain = getPromotionChain();
    const _ipTerminalClass = _ipChain[_ipChain.length - 1];
    if (s.class === _ipTerminalClass) {
      window._ipSelected = { id, s, oldClass: s.class, newClass: s.class };
      const searchElT = document.getElementById('ipStudentSearch');
      if (searchElT) searchElT.value = s.name || '';
      wrap.innerHTML = `
        ${_ipRenderHistory(s)}
        <div class="card" style="margin-bottom:18px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:14px">
            <strong>${sanitizeHTML(s.name)}</strong>
            <span style="color:var(--muted)">Adm# ${sanitizeHTML(s.admissionNumber||'—')}</span>
            <span style="padding:4px 12px;border-radius:6px;background:rgba(255,255,255,0.06)">${sanitizeHTML(s.class)}</span>
          </div>
          <div class="alert alert-warning" style="font-size:13px">
            ⚠️ <strong>${sanitizeHTML(s.class)}</strong> is the school's terminal grade — there is no further class to promote into.
            This student can only be advanced via <a href="#" onclick="renderPromotions();return false;" style="color:var(--gold-lt);text-decoration:underline;font-weight:700">Annual Promotion</a>,
            which graduates ${sanitizeHTML(s.class)} students and moves them to Terminated Students, or through the standard leaving/graduation workflow.
          </div>
        </div>
      `;
      return;
    }

    // JSS-REF-013 v2: No forced "next class only" restriction — Principal can promote
    // a student into ANY class from the tenant's class list (skip grades, move across
    // sections/streams, etc.), not just the immediate next one in the chain.
    const classList = getClassList();
    const chain     = getPromotionChain();
    const idx       = chain.indexOf(s.class);
    const defaultNewClass = (idx >= 0 && idx < chain.length - 1) ? chain[idx + 1]
                           : (classList.find(c => c !== s.class) || s.class);

    const today = (() => { const d = nowIST(); /* ITEM 01 FIX */ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();

    window._ipSelected = { id, s, oldClass: s.class, newClass: defaultNewClass };

    const txSnap = await schoolCol('feeTransactions').where('studentId', '==', id).get();
    window._ipSelected.allTxDocs = txSnap.docs.map(d => d.data());

    // Reflect the chosen student in the search box and clear the results dropdown
    // so the UI doesn't look "stuck" mid-search once a student is picked.
    const searchEl = document.getElementById('ipStudentSearch');
    if (searchEl) searchEl.value = s.name || '';

    const classOptions = classList.map(c =>
      `<option value="${sanitizeHTML(c)}" ${c === defaultNewClass ? 'selected' : ''}>${sanitizeHTML(c)}</option>`).join('');

    wrap.innerHTML = `
      ${_ipRenderHistory(s)}
      <div class="card" style="margin-bottom:18px">
        <div style="font-size:12px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">Promotion Preview</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:14px">
          <strong>${sanitizeHTML(s.name)}</strong>
          <span style="color:var(--muted)">Adm# ${sanitizeHTML(s.admissionNumber||'—')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;font-size:15px;flex-wrap:wrap">
          <span style="padding:4px 12px;border-radius:6px;background:rgba(255,255,255,0.06)">${sanitizeHTML(s.class)}</span>
          <span style="color:var(--gold-lt)">→</span>
          <select class="form-control" id="ipTargetClass" style="max-width:220px;font-weight:700;color:var(--gold-lt)" onchange="_ipTargetClassChanged(this.value)">
            ${classOptions}
          </select>
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Promotion Date</label>
          <input type="date" class="form-control" id="ipPromoDate" value="${today}" readonly
            style="max-width:200px;background:var(--depth);cursor:not-allowed;color:var(--gold-lt);font-weight:600;border-color:rgba(212,150,42,0.3)">
          <div style="font-size:11px;color:var(--muted);margin-top:4px">🔒 Auto-set to today's date — read-only</div>
        </div>
        <div id="ipCarryForwardResult"></div>
        <div id="ipConfirmAlert"></div>
        <div style="display:flex;gap:12px;margin-top:16px">
          <button class="btn btn-primary" id="ipConfirmBtn" onclick="_ipConfirmPromotion()">Confirm Promotion</button>
          <button class="btn btn-ghost" onclick="renderIndividualPromotion()">Cancel</button>
        </div>
      </div>
    `;
    _ipRecompute();
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-danger">Error loading student: ${e.message}</div>`;
  }
}

function _ipTargetClassChanged(newClass) {
  const sel = window._ipSelected;
  if (!sel) return;
  sel.newClass = newClass;
  _ipRecompute();
}

function _ipRecompute() {
  const sel = window._ipSelected;
  if (!sel) return;
  const dateEl = document.getElementById('ipPromoDate');
  const promoDateStr = dateEl ? dateEl.value : (() => { const d = nowIST(); /* ITEM 01 FIX */ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();

  const resEl = document.getElementById('ipCarryForwardResult');
  const confirmBtn = document.getElementById('ipConfirmBtn');

  if (sel.newClass === sel.oldClass) {
    if (resEl) resEl.innerHTML = `<div class="alert alert-warning" style="font-size:13px">Target class is the same as the current class — pick a different class to promote into.</div>`;
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }
  if (confirmBtn) confirmBtn.disabled = false;

  const cf = _ipComputeCarryForward(sel.s, sel.allTxDocs, promoDateStr);
  sel.carryForward = cf;
  sel.promoDateStr = promoDateStr;

  const oldRateInfo = getClassRate(sel.oldClass);
  const oldRate = oldRateInfo?.rate || sel.s.monthlyFee || 0;
  const newRateInfo = getClassRate(sel.newClass);
  const newRate = newRateInfo?.rate || 0;

  if (!resEl) return;

  const paidPills = cf.elapsedMonths.filter(m => cf.paidMonths.has(m));
  const dueChips = cf.priorGradeDueMonths.map(m =>
    `<span style="padding:3px 9px;border-radius:5px;background:rgba(224,82,82,0.15);color:var(--danger);font-size:12px;font-weight:600">${m.slice(0,3)}</span>`).join(' ');
  const paidChips = paidPills.map(m =>
    `<span style="padding:3px 9px;border-radius:5px;background:rgba(82,200,122,0.15);color:var(--success);font-size:12px;font-weight:600">${m.slice(0,3)} ✓</span>`).join(' ');

  resEl.innerHTML = `
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px">
      Months paid so far this year (${sel.oldClass}): ${paidChips || '<span style="color:var(--muted)">none</span>'}
    </div>
    ${cf.priorGradeDueMonths.length ? `
      <div class="alert alert-warning" style="font-size:13px;margin-bottom:10px">
        <strong>${cf.priorGradeDueMonths.length} unpaid month${cf.priorGradeDueMonths.length !== 1 ? 's' : ''}</strong> carried over from <strong>${sanitizeHTML(sel.oldClass)}</strong>, now billed at the <strong>${sanitizeHTML(sel.newClass)}</strong> rate of ₹${fmtNum(newRate)}/month (₹${fmtNum(newRate * cf.priorGradeDueMonths.length)} total): ${dueChips}
      </div>` : `
      <div class="alert alert-success" style="font-size:13px;margin-bottom:10px">✅ All months up to the promotion date are paid — no unpaid months carried over.</div>`}
    ${paidPills.length ? `
      <div class="alert alert-warning" style="font-size:13px;margin-bottom:10px">
        <strong>${paidPills.length} month${paidPills.length !== 1 ? 's' : ''}</strong> already paid at the ${sanitizeHTML(sel.oldClass)} rate of ₹${fmtNum(oldRate)}/month will be topped up by the ₹${fmtNum(Math.max(0, newRate - oldRate))}/month difference (₹${fmtNum(Math.max(0, newRate - oldRate) * paidPills.length)} total), so every month totals the ${sanitizeHTML(sel.newClass)} fee.
      </div>` : ''}
    <div class="alert" style="font-size:13px;background:rgba(74,158,202,0.10);border-color:rgba(74,158,202,0.30);color:var(--info)">
      Every month of ${sanitizeHTML(cf.curAcadYear)} is billed at the ${sanitizeHTML(sel.newClass)} rate of ₹${fmtNum(newRate)}/month. The new fee cycle starts fresh from <strong>${cf.effectiveMonth}</strong>.
    </div>
  `;
}

async function _ipConfirmPromotion() {
  const sel = window._ipSelected;
  if (!sel || !sel.carryForward) return;
  // JSS-REF-VELTRIX-2026-003 ITEM 04 FIX: defensive ceiling check — the terminal-class
  // card in _ipSelectStudent already blocks reaching this point normally, but guard
  // here too in case of a stale window._ipSelected from before the class changed.
  const _ipChainC = getPromotionChain();
  if (sel.oldClass === _ipChainC[_ipChainC.length - 1]) {
    showFormAlert('ipConfirmAlert', `${sel.oldClass} is the terminal grade — use Annual Promotion to graduate this student instead.`, 'danger');
    return;
  }
  const btn = document.getElementById('ipConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Promoting…'; }

  try {
    const oldRateInfo = getClassRate(sel.oldClass);
    const oldRate = oldRateInfo?.rate || sel.s.monthlyFee || 0;
    const cf = sel.carryForward;

    // JSS-REF-014: keep a running, non-overwritten promotion history for this
    // student — `midYearPromotion` only ever holds the LATEST promotion (it's
    // what DueTracker reads), so a separate array is needed to look back at
    // every promotion the student has ever gone through.
    // NOTE: FieldValue.serverTimestamp() cannot be used inside an array
    // element (Firestore rejects it), so promotedAt here is a plain client
    // timestamp — fine for display purposes in the history list.
    const historyEntry = {
      source:              'individual',
      fromClass:           sel.oldClass,
      toClass:             sel.newClass,
      promotionDate:       sel.promoDateStr,
      academicYear:        cf.curAcadYear,
      priorGradeDueMonths: cf.priorGradeDueMonths,
      priorGradeRate:      oldRate,
      effectiveMonth:      cf.effectiveMonth,
      promotedBy:          currentUser.uid,
      promotedByName:      currentProfile?.name || currentUser.email || 'Unknown',
      promotedAt:          new Date().toISOString(),
      studentName:         sel.s.name || '',
      admissionNumber:     sel.s.admissionNumber || ''
    };

    const sRef = schoolCol('students').doc(sel.id);
    await sRef.update({
      class: sel.newClass,
      midYearPromotion: {
        ...historyEntry,
        promotedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      promotionHistory: firebase.firestore.FieldValue.arrayUnion(historyEntry)
    });

    // ══════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-005 ITEMS 5 + 7 — a promotion is a fee-affecting action,
    // so it must reconcile like every other one.
    //
    // This write changes the student's class, and the class is what every fee
    // calculation resolves the monthly rate from. Yet it was the ONE fee-affecting
    // path in the app that never called _syncStudentFinancials: outstandingBalance,
    // previousDues and the month grids all kept their pre-promotion values until
    // some unrelated payment happened to trigger a recompute. That is item 7's
    // "Accumulated Rolling Dues doesn't update after promotion", and it is also
    // what made item 5's rate difference invisible even once the engine could
    // compute it.
    //
    // Item 17 admits no exceptions, and this was the exception.
    // ══════════════════════════════════════════════════════════════════════════
    if (typeof _syncStudentFinancials === 'function') {
      try { await _syncStudentFinancials(sel.id); }
      catch (_syncErr) { console.warn('[PROMOTION] Post-promotion reconciliation failed:', _syncErr && _syncErr.message); }
    }

    auditLog('student_promoted_individual', {
      studentId: sel.id, studentName: sel.s.name, admissionNumber: sel.s.admissionNumber || '',
      fromClass: sel.oldClass, toClass: sel.newClass, promotionDate: sel.promoDateStr,
      priorGradeDueMonths: cf.priorGradeDueMonths.length
    });

    invalidateStudentCache();
    if (typeof invalidateFinanceCache === 'function') invalidateFinanceCache();

    showToast(`✅ ${sel.s.name} promoted from ${sel.oldClass} to ${sel.newClass}.`, 'success');
    renderIndividualPromotion();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Promotion'; }
    showFormAlert('ipConfirmAlert', 'Promotion failed: ' + e.message, 'danger');
  }
}

