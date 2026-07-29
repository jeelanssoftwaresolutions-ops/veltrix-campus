/* ============================================================
   RECORD FEE PAYMENT
   ============================================================ */
function renderRecordFee(params={}) {
  const prefilled = params.studentId ? true : false;
  setContent(`
    <div class="page-head flex-between">
      <div>
        <div class="page-title">Record Fee Payment</div>
        <div class="page-sub">One-tap payment recording — instantly synced to Firebase.</div>
      </div>

    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:20px;max-width:560px">
      <div class="card">
        <div class="card-hdr"><span class="card-title">Payment Details</span></div>
        <div class="card-body">
          <div id="feeAlert"></div>
          <!-- CHG-006: Fee S.No removed as search parameter platform-wide -->
          <div class="form-group">
            <label class="form-label">Search Student *</label>
            <input class="form-control" id="feeStudentSearch" placeholder="Name / Admission No" oninput="searchStudentForFee(this.value)" value="${params.studentName||''}">

            <div id="feeStudentResults" style="background:var(--lifted);border:1px solid var(--border);border-radius:8px;margin-top:4px;display:none;max-height:180px;overflow-y:auto"></div>
          </div>
          <div id="selectedStudentInfo" style="${prefilled?'':'display:none'}" class="alert alert-success" data-id="${params.studentId||''}">
            ${prefilled?`Student: <strong>${params.studentName||''}</strong>`:''}
          </div>
          <!-- Year Balance Banner (Fix #2) -->
          <!-- Point 10: Context-aware dues banner — current year only -->
          <div id="_ctxDuesBanner" style="margin-bottom:10px;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border-lt);font-size:12px;display:${prefilled?'block':'none'}"></div>
          <!-- ARC-013: feeWorkflowBody — target for shared _workflowLock utility -->
          <div id="feeWorkflowBody">
          <div class="form-group">
            <!-- COLONEL'S CHANGE #4: Only Monthly Tuition Fee kept -->
            <label class="form-label">Fee Head *</label>
            <select class="form-control" id="feeFeeHead">
              <option value="">Select fee head</option>
              <option>Monthly Tuition Fee</option>
            </select>
          </div>
          <!-- PHASE 6 #10 — MONTH-WISE PAYMENT RECORDING
               Multi-select month picker: Jun–May academic year cycle.
               User taps the month(s) being paid — each selected month gets its own
               entry in the feeTransactions sub-collection (via monthsSelected array).
               Amount is auto-calculated as rate × number of selected months.
               Historical payments without monthsSelected are preserved as-is. -->
          <div class="form-group">
            <label class="form-label">Select Month(s) Being Paid *
              <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;margin-left:6px">Tap to select · multiple months allowed</span>
            </label>
            <div id="monthPickerGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px">
              ${['June','July','August','September','October','November','December','January','February','March','April','May'].map(m=>`
                <button type="button" class="month-pill" data-month="${m}" onclick="toggleMonthPill(this)" style="
                  padding:8px 4px; border-radius:8px; border:1px solid var(--glass-border);
                  background:rgba(0,0,0,0.30); backdrop-filter:blur(4px);
                  color:var(--muted); font-size:12px; font-weight:600; font-family:'DM Sans',sans-serif;
                  cursor:pointer; transition:all 0.15s ease; text-align:center;">
                  ${m.slice(0,3)}
                </button>`).join('')}
            </div>
            <div id="monthPickerHint" style="font-size:11px;color:var(--muted);margin-top:7px">No months selected — select at least one month.</div>
          </div>
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              Amount Paid (₹)
              <span style="font-size:10px;font-weight:400;color:var(--warn);text-transform:none;background:rgba(212,150,42,0.12);padding:2px 8px;border-radius:4px;letter-spacing:0">🔒 Auto-calculated · Read-only</span>
            </label>
            <input type="number" class="form-control" id="feeAmount" placeholder="Select student first" readonly
              style="background:var(--depth);color:var(--gold-lt);font-weight:700;cursor:not-allowed;border-color:rgba(212,150,42,0.3)">
            <div style="font-size:11px;color:var(--muted);margin-top:5px" id="feeLockHint">Select a student to auto-fill amount from class fee schedule.</div>
          </div>
          <div class="form-group" id="amtWordsWrap" style="display:none">
            <div class="alert alert-info" id="amtWords" style="font-size:12px"></div>
          </div>
          <!-- JSS-REF-VELTRIX-2026-004 ITEM 06: opt-in partial payment. Off by default →
               normal full payment. On → the collected amount may be short; it is allocated
               sequentially across the selected months (older / already-partial first). -->
          <div class="form-group" style="margin-top:-2px">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--silver-lt);cursor:pointer;font-weight:600">
              <input type="checkbox" id="feePartialToggle" onchange="_feePartialToggleChanged()" style="width:15px;height:15px;accent-color:var(--warn);cursor:pointer">
              Accept a partial (short) payment
            </label>
            <div style="font-size:10px;color:var(--muted);margin-top:3px;line-height:1.5">Leave unchecked for a normal full payment. When checked, enter the <strong>amount actually collected</strong> below — earlier months are cleared first and the boundary month is recorded as <span style="color:var(--warn);font-weight:700">PARTIAL</span> with its balance shown (it stays payable and is topped up first next time).</div>
            <div id="feeCollectedWrap" style="display:none;margin-top:8px">
              <label class="form-label" style="font-size:12px;display:flex;align-items:center;gap:8px">Amount Collected (₹)
                <span style="font-size:10px;font-weight:400;color:var(--warn);text-transform:none">may be less than the total payable</span></label>
              <input type="number" class="form-control" id="feeCollectedAmount" min="0" step="1" oninput="_feeUpdatePartialHint(); if(typeof _updateSplitPaymentSummary==='function')_updateSplitPaymentSummary()" style="font-weight:700;color:var(--warn);border-color:rgba(212,150,42,0.4)">
              <div id="feePartialHint" style="font-size:11px;color:var(--muted);margin-top:5px"></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              Remaining Balance (₹)
              <span style="font-size:10px;font-weight:400;color:var(--warn);text-transform:none;background:rgba(212,150,42,0.12);padding:2px 8px;border-radius:4px;letter-spacing:0">🔒 Auto-calculated · Read-only</span>
            </label>
            <!-- BUG-H07 FIX: Read-only — value set by calcLockedFee() after fetching last tx balance -->
            <input type="number" class="form-control" id="feeBalance" placeholder="Select student first" readonly
              style="background:var(--depth);color:var(--gold-lt);font-weight:700;cursor:not-allowed;border-color:rgba(212,150,42,0.3)">
            <div id="feeBalanceHint" style="margin-top:5px"></div>
          </div>
          <!-- JSS-REF-002 ITEM 1 FIX: Split Payment Support (Multi-Mode Single Transaction)
               Replaces the single Payment Mode dropdown with a mode-wise breakup grid.
               User can add multiple rows (mode + amount) that must sum exactly to the
               locked total amount. Single-row case behaves exactly like before. -->
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:8px">
              Payment Mode *
              <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;margin-left:0">Split across multiple modes if needed</span>
            </label>
            <div id="splitPaymentRows"></div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="_addSplitPaymentRow()" style="margin-top:4px;font-size:11px">+ Add Payment Mode</button>
            <div id="splitPaymentHint" style="font-size:11px;margin-top:7px"></div>
          </div>
          <div class="form-group">
            <!-- COLONEL'S CHANGE #5: Only 'Paid' status allowed -->
            <label class="form-label">Payment Status</label>
            <select class="form-control" id="feeStatus">
              <option value="Paid">Paid</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Date of Payment *</label>
            <input type="date" class="form-control" id="feeDate" value="${(()=>{const _d=nowIST();return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;})() /* BUG-TS-001 FIX */}" readonly style="background:var(--depth);cursor:not-allowed;color:var(--gold-lt);font-weight:600;border-color:rgba(212,150,42,0.3)">
            <div style="font-size:11px;color:var(--muted);margin-top:4px">🔒 Auto-set to today's date — read-only</div>
          </div>
          <button class="btn btn-primary btn-full" id="saveReceiptBtn" onclick="saveFeePayment('${params.studentId||''}')">
            ${iconFee} Save & Generate Receipt
          </button>
          </div><!-- /feeWorkflowBody ARC-013 -->
        </div>
      </div>
    </div>
  `);

  // BUG-002 FIX: Reset explicit-selection flag on every form render.
  window._feeStudentExplicitlySelected = false;
  // JSS-REF-002 ITEM 1 FIX: initialize split payment rows (starts with a single row).
  window._splitPayAmountFieldId = 'feeAmount';
  _resetSplitPaymentRows();
  if (prefilled) {
    // BUG-P03 FIX: Route through selectFeeStudent() to fetch paid months and lock pills.
    _resetMonthPills();
    selectFeeStudent(params.studentId, params.studentName, params.classSection||'');
  } else {
    // No prefill — lock the workflow until a student is explicitly selected.
    setTimeout(() => _setFeeWorkflowLock(true), 0);
  }
  // COLONEL'S LOCK: Re-enforce all read-only fields after DOM render.
  // Runs for colonels-high-school only — other tenants unaffected.
  enforceColonelLocks();

  // BUG-M09 FIX: If navigated here via viewReceipt(), the receipt data is passed as a param.
  // showReceipt() is called synchronously after render completes — no setTimeout race condition.
  if (params.preloadReceipt) {
    showReceipt(params.preloadReceipt);
  }
}

// ════════════════════════════════════════════════════════════════
// ARC-013 FIX — UNIVERSAL PROCESS LOCK (Framework-Level)
// Single shared utility enforced at the component/framework layer.
// Every module that needs a student-selection guard calls this instead
// of rolling its own lock — so the pattern can never be skipped in
// any future module.
//
// Usage:
//   _workflowLock(containerId, true)   — lock everything inside container
//   _workflowLock(containerId, false)  — unlock
//
// The function disables all interactive elements inside the named
// container: inputs, selects, textareas, buttons (except the search
// input itself, identified by data-search-input="true"), and any
// element with data-workflow-action="true".
// ════════════════════════════════════════════════════════════════
function _workflowLock(containerId, locked) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // FIX: also toggle the container's own inline style — the div may have been
  // rendered with pointer-events:none;opacity:0.4 hardcoded and _workflowLock
  // was only touching children, leaving the container itself permanently blocked.
  container.style.pointerEvents = locked ? 'none' : '';
  container.style.opacity       = locked ? '0.4'  : '';
  const selectors = 'input:not([data-search-input="true"]), select, textarea, button:not([data-search-trigger="true"])';
  container.querySelectorAll(selectors).forEach(el => {
    el.disabled = locked;
    el.style.opacity = locked ? '0.4' : '';
    el.style.pointerEvents = locked ? 'none' : '';
    if (el.tagName === 'BUTTON') el.style.cursor = locked ? 'not-allowed' : '';
  });
  // Also lock any month-pill buttons (custom elements, not standard <button>)
  container.querySelectorAll('.month-pill').forEach(p => {
    if (p.dataset.paid !== 'true') {
      p.disabled = locked;
      p.style.opacity = locked ? '0.4' : '';
      p.style.cursor = locked ? 'not-allowed' : 'pointer';
      p.style.pointerEvents = locked ? 'none' : '';
    }
  });
  // Show/hide the lock notice if present (data-lock-notice="true")
  const notice = container.querySelector('[data-lock-notice="true"]');
  if (notice) notice.style.display = locked ? '' : 'none';
}
// END ARC-013 — Universal Process Lock utility

// BUG-002 / ARC-013 FIX: Fee payment workflow lock.
// Fully delegates to the shared framework-level _workflowLock utility.
// No module-specific element lists — the container boundary enforces the lock.
window._feeStudentExplicitlySelected = false;
function _setFeeWorkflowLock(locked) {
  _workflowLock('feeWorkflowBody', locked);
}

let _feeSearchDebounce = null;
function searchStudentForFee(q) {
  clearTimeout(_feeSearchDebounce);
  // BUG-002: any keystroke re-locks the workflow until a student is explicitly selected
  if (!window._feeStudentExplicitlySelected) {
    window._selectedFeeStudent = null;
    _setFeeWorkflowLock(true);
  }
  if (!q.trim()) { document.getElementById('feeStudentResults').style.display='none'; return; }
  _feeSearchDebounce = setTimeout(async () => {
    // BUG-⑤ FIX: Restore the two variables that were lost in a refactor.
    // Without these, every keystroke throws a silent ReferenceError and the search is dead.
    const all = await getStudentCache();
    const lq  = q.toLowerCase();
    // CHG-006: Search by name + admission number only (Fee S.No removed platform-wide)
    const results = all.filter(s =>
      s.status === 'active' && (
        s.name?.toLowerCase().includes(lq)||
        s.admissionNumber?.toLowerCase().includes(lq)
      )).slice(0,8);
    const el = document.getElementById('feeStudentResults');
    if (!results.length) { el.style.display='none'; return; }
    el.style.display='block';
    el.innerHTML = results.map(s=>{
      return `<div class="s-item" onclick="selectFeeStudent('${s.id}','${(s.name||'').replace(/'/g,"\\'")}','${s.class} ${s.section}')">
        <div class="s-name">${sanitizeHTML(s.name)}</div>
        <div class="s-meta">Adm# ${sanitizeHTML(s.admissionNumber)} · ${sanitizeHTML(s.class)} · Sec ${sanitizeHTML(s.section)}</div>
      </div>`;
    }).join('');
  }, 300);
}

async function selectFeeStudent(id, name, cs) {
  window._selectedFeeStudent = { id, name, cs, prevBalance: null, prevBalanceLoading: true };
  // BUG-002 FIX: Mark explicit selection and unlock the workflow
  window._feeStudentExplicitlySelected = true;
  _setFeeWorkflowLock(false);
  document.getElementById('feeStudentSearch').value = name; // CHG-006: feeSno hidden
  document.getElementById('feeStudentResults').style.display = 'none';
  const info = document.getElementById('selectedStudentInfo');
  info.style.display = 'block';
  info.innerHTML = `Student: <strong>${sanitizeHTML(name)}</strong> · ${sanitizeHTML(cs)}`; // BUG-I03 FIX
  info.dataset.id = id;

  // Fix #2: Show remaining balance by academic year

  // Point 10: Show context-aware dues banner — current year ONLY in Record Payment
  const ctxDuesEl = document.getElementById('_ctxDuesBanner');
  if (ctxDuesEl) {
    ctxDuesEl.style.display = 'block';
    ctxDuesEl.innerHTML = `<span style="color:var(--muted);font-size:12px">📅 Fetching current year dues…</span>`;
  }

  // Reset month pills first (switching students should clear prior state)
  _resetMonthPills();

  // ARC-016 FIX: prevBalance scoped to CURRENT ACADEMIC YEAR only.
  // Prior year balances suppressed at query level — not just in UI.
  {
    const _arc016CurYearNorm = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const balEl16 = document.getElementById('feeBalance');
    if (balEl16) { balEl16.value = ''; balEl16.placeholder = 'Calculating…'; }
    try {
      // FORMAT-FIX: Fetch all student transactions then filter with _normaliseAcademicYear
      // so "2025-26" and "2025-2026" both match regardless of how the year was typed.
      const allBalSnap = await schoolCol('feeTransactions')
        .where('studentId', '==', id)
        .orderBy('date', 'desc')
        .get();
      const curYearTxs = allBalSnap.docs
        .map(d => d.data())
        .filter(t => _normaliseAcademicYear(t.academicYear) === _arc016CurYearNorm);
      if (curYearTxs.length > 0) {
        window._selectedFeeStudent.prevBalance = curYearTxs[0].remainingBalance || 0;
      } else {
        // ARC-016: No current-year transaction — balance starts at 0 for this year.
        window._selectedFeeStudent.prevBalance = 0;
      }
    } catch(e) {
      try {
        const fallback = await schoolCol('feeTransactions').where('studentId', '==', id).get();
        const curYearTxs = fallback.docs
          .map(d => d.data())
          .filter(t => _normaliseAcademicYear(t.academicYear) === _arc016CurYearNorm)
          .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
        window._selectedFeeStudent.prevBalance = curYearTxs.length > 0
          ? (curYearTxs[0].remainingBalance || 0) : 0;
      } catch(_) { window._selectedFeeStudent.prevBalance = 0; }
      console.warn('[ARC-016] Balance fetch fallback used:', e.message);
    }
    window._selectedFeeStudent.prevBalanceLoading = false;

  // ── Fetch concession fee override FIRST — before any calcLockedFee() or banner ──
  // CRITICAL ORDER: concessionRate must be loaded before calcLockedFee() runs,
  // otherwise the balance renders at standard rate (₹1800) instead of operative rate.
  try {
    const sDoc2 = await schoolCol('students').doc(id).get();
    const admNo = sDoc2.data()?.admissionNumber || '';
    window._selectedFeeStudent.admissionNumber = admNo;
    if (admNo) {
      const cSnap = await schoolCol('concessionFees')
        .where('admissionNo', '==', admNo)
        .limit(1)
        .get();
      if (!cSnap.empty) {
        const cData = cSnap.docs[0].data();
        const overrideFee = cData.concessionFee;
        if (typeof overrideFee === 'number' && overrideFee >= 0) {
          window._selectedFeeStudent.concessionRate = overrideFee;
          window._selectedFeeStudent.concessionActiveMonths =
            Array.isArray(cData.activeMonths) ? cData.activeMonths : [];
          // [ITEM-02] Per-month corrections, if any, so billing uses the
          // edited amount for that specific month instead of the default rate.
          window._selectedFeeStudent.concessionMonthlyBreakdown =
            (cData.monthlyBreakdown && typeof cData.monthlyBreakdown === 'object') ? cData.monthlyBreakdown : {};
          const infoEl = document.getElementById('selectedStudentInfo');
          if (infoEl) {
            infoEl.innerHTML += ` <span style="display:inline-flex;align-items:center;gap:5px;
              background:rgba(201,168,76,0.18);border:1px solid rgba(201,168,76,0.40);
              border-radius:6px;padding:2px 10px;font-size:11px;font-weight:700;color:var(--gold-lt)">
              🏷️ Concession: ₹${fmtNum(overrideFee)}/month</span>`;
          }
        }
      } else {
        window._selectedFeeStudent.concessionRate = null;
        window._selectedFeeStudent.concessionActiveMonths = [];
        window._selectedFeeStudent.concessionMonthlyBreakdown = {};
      }
    }
  } catch(e) {
    window._selectedFeeStudent.concessionRate = null;
    window._selectedFeeStudent.concessionMonthlyBreakdown = {};
    console.warn('[CONCESSION FIX] Could not fetch concession for student:', id, e.message);
  }

  // Now concessionRate is loaded — label pills and calculate balance correctly
  _markConcessionMonths();
  calcLockedFee();

    // Context-aware dues banner — concession already loaded above so rates are correct
    const _ctxEl = document.getElementById('_ctxDuesBanner');
    if (_ctxEl) {
      setTimeout(() => {
        const ACAD_M = ['June','July','August','September','October','November','December',
                        'January','February','March','April','May'];
        // VLX-REF-006 FIX: Banner must show FULL annual outstanding — all 12 unpaid months.
        // Elapsed filter removed so banner count matches the Remaining Balance field.
        const _unpaidPills = Array.from(document.querySelectorAll('#monthPickerGrid .month-pill'))
          .filter(b => b.dataset.paid !== 'true' && !b.disabled);
        const _sInfo = getClassRate(window._selectedFeeStudent?.cs || '');
        const _stdRate = _sInfo?.rate || 0;
        const _totalDue = _unpaidPills.reduce(
          (sum, b) => sum + _concessionRateForMonth(b.dataset.month, _stdRate), 0
        );
        _ctxEl.style.display = 'block';
        _ctxEl.innerHTML = _totalDue > 0
          ? `<span style="color:var(--danger);font-size:12px">⚠️ Total Outstanding: <strong>₹${fmtNum(_totalDue)}</strong> — <span style="color:var(--muted)">${_unpaidPills.length} unpaid month${_unpaidPills.length !== 1 ? 's' : ''}</span></span>`
          : `<span style="color:var(--success);font-size:12px">✅ No outstanding dues for the current academic year (${_getCurrentAcademicYearStr()})</span>`;
        calcLockedFee();
        // LIVE-DUE-WIRE: Store pill-derived outstanding so renderStudentProfile can use it
        if (window._selectedFeeStudent) {
          window._selectedFeeStudent.liveDue = _totalDue;
        }
      }, 150);
    }
  } // ARC-016 fix: close bare block

  // ── Fetch paid months and lock pills — sources: feeTransactions + student monthStatus ──
  // SOURCE 1: feeTransactions (payments recorded via Record Payment OR Past Due Recording)
  // SOURCE 2: student doc monthStatus (imported from Excel — N/A-PAID means already paid)
  // GUARD: if the student's academicYear is a PREVIOUS year, block ALL months in Record
  //        Payment and redirect staff to Past Due Recording instead.
  try {
    const _curYrNorm = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const _shortToFull = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};

    // Use already-cached student data — no extra Firestore fetch needed.
    // getStudentCache() is already loaded; find this student by id.
    let sData = {};
    try {
      const _allStudents = await getStudentCache();
      sData = _allStudents.find(s => s.id === id) || {};
    } catch(e2) { console.warn('[MONTH-LOCK] Could not read student from cache:', e2.message); }

    const studentYearNorm = _normaliseAcademicYear(sData.academicYear || '');

    // ── PREVIOUS YEAR ADVISORY (not a hard lock) ────────────────────────────
    // Fetch ALL transactions for this student upfront — single Firestore read
    // reused for both the advisory check and current-year month locking below.
    const allTxSnap = await schoolCol('feeTransactions')
      .where('studentId', '==', id)
      .get();
    const allTxDocs = allTxSnap.docs.map(d => d.data());

    // JSS-REF-VELTRIX-2026-004: per-month amount already applied to the CURRENT AY via the
    // tx allocation ledger (single source of truth). calcLockedFee nets a reopened PARTIAL
    // month's quote against this (dueForMonth = rate − applied) when read.recordPayment is on.
    (() => {
      const _applied = {};
      allTxDocs.forEach(t => {
        if (_normaliseAcademicYear(t.academicYear) !== _curYrNorm) return;
        if (t.type === 'excused_waiver' || !t.monthAllocations || typeof t.monthAllocations !== 'object') return;
        Object.entries(t.monthAllocations).forEach(([m, amt]) => {
          const sm = _flShort(m), full = _FL_S2F[sm] || m;
          _applied[sm] = (_applied[sm] || 0) + (Number(amt) || 0);
          _applied[full] = _applied[sm];
        });
      });
      if (window._selectedFeeStudent) window._selectedFeeStudent._appliedByMonth = _applied;
    })();

    // GUARD-FIX v4 — ADVISORY ONLY, never a hard lock.
    // Past dues and current year fees are INDEPENDENT workflows. Schools routinely
    // collect current-year fees even when a student carries prior-year arrears.
    // Locking Record Payment when past dues exist is wrong UX — staff should be
    // redirected via a hint, not blocked from doing their job.
    // Only show the advisory hint; month pills remain fully selectable.
    if (studentYearNorm && studentYearNorm !== _curYrNorm) {
      const mHint = document.getElementById('monthPickerHint');
      if (mHint) {
        mHint.innerHTML = `ℹ️ This student also has <strong style="color:var(--warn)">${studentYearNorm}</strong> outstanding dues. Use <a href="#" onclick="navigate('pastDue');return false;" style="color:var(--gold-lt);text-decoration:underline;font-weight:700">Record Previous Year Dues</a> to clear them separately. You can still record <strong style="color:var(--success)">${_getCurrentAcademicYearStr()}</strong> payment below.`;
        mHint.style.color = 'var(--warn)';
      }
      // DO NOT return — fall through to normal month locking for current year
    }

    // ── CURRENT YEAR: normal month locking ──────────────────────────────────
    const paidMonths = new Set();

    // Source 1: feeTransactions matching current year (reuse allTxDocs — no extra Firestore read)
    allTxDocs.forEach(data => {
      if (_normaliseAcademicYear(data.academicYear) !== _curYrNorm) return;
      if (Array.isArray(data.monthsSelected)) {
        data.monthsSelected.forEach(m => paidMonths.add(m));
      }
    });

    // Source 2: student doc monthStatus (Excel N/A-PAID).
    // monthStatus stores which months the student already paid at the time of Excel import.
    // MONTHSTATUS-FIX: Only apply monthStatus to current-year locking when the student's
    // academicYear IS the current year — meaning they were enrolled/imported fresh into
    // this year and their monthStatus reflects actual 2025-26 pre-payments.
    // For carry-over students (academicYear = previous year), monthStatus reflects
    // previous-year data and MUST NOT lock current-year month pills.
    // The old comment "always read it regardless" was wrong — it caused previous-year
    // Excel import data to ghost into the current-year payment grid.
    const _studentIsCurrentYear = !studentYearNorm || studentYearNorm === _curYrNorm;
    if (_studentIsCurrentYear && sData.monthStatus && typeof sData.monthStatus === 'object') {
      Object.entries(sData.monthStatus).forEach(([month, status]) => {
        if (status === 'N/A-PAID' || status === 'PAID') {
          paidMonths.add(_shortToFull[month] || month);
        }
      });
    }

    // Source 3: currentYearPaidMonths (JSS-REF-VELTRIX-2026-003 ITEM 08.2 FIX).
    // Months explicitly marked PAID on the onboarding grid for the current year —
    // these are distinct from currentYearDueMonths (the unpaid side) and were
    // previously not persisted anywhere, so they never reached this lookup.
    if (Array.isArray(sData.currentYearPaidMonths) &&
        _normaliseAcademicYear(sData.currentYearDueYear) === _curYrNorm) {
      sData.currentYearPaidMonths.forEach(m => paidMonths.add(m));
    }

    // JSS-REF-VELTRIX-2026-004 ITEM 06: PARTIAL months are NOT fully paid — keep them in the
    // payable pool (topped up first on the next payment) by removing them from the locked set.
    // ROOT-FIX (partial reopen broken for New-Admission / Bulk-Admit students): derive PARTIAL
    // from the tx allocation LEDGER (_appliedByMonth, built above at ~L411-423 and already scoped
    // to the current AY) via the shared _flPartialMonthsFromLedger helper — the SAME authoritative
    // source Profile & Due Fee read. The old check keyed off sData.monthStatus, whose 'PARTIAL'
    // write is gated on academicYear==current in _syncStudentFinancials and so never lands for
    // students created without a current-year academicYear tag. Runs UNCONDITIONALLY (not under
    // _studentIsCurrentYear) so a Bulk-Admit student carrying a prior-year academicYear is
    // un-locked too — their current-year partial still lives in the ledger.
    (() => {
      const _appliedDL = (window._selectedFeeStudent && window._selectedFeeStudent._appliedByMonth) || {};
      const _infoDL = sData.class ? getClassRate(sData.class) : null;
      const _stdDL  = _infoDL ? _infoDL.rate : (sData.monthlyFee || 0);
      _flPartialMonthsFromLedger(_appliedDL, m => _concessionRateForMonth(m, _stdDL))
        .forEach(m => paidMonths.delete(m));
    })();

    _markPaidMonths(paidMonths);

    // JSS-REF-VELTRIX-2026-004: label PARTIAL months with the balance STILL DUE and keep them
    // selectable (a partial month is not closed). Reads the same _appliedByMonth allocation
    // map the quote nets against, so tile and quote can never disagree.
    (() => {
      const applied = (window._selectedFeeStudent && window._selectedFeeStudent._appliedByMonth) || {};
      const _info = sData.class ? getClassRate(sData.class) : null;
      const _std  = _info ? _info.rate : (sData.monthlyFee || 0);
      document.querySelectorAll('#monthPickerGrid .month-pill').forEach(p => {
        const m = p.dataset.month;
        const a = applied[m] || 0;
        if (a <= 0 || p.dataset.paid === 'true') return;          // untouched or already closed
        const left = Math.max(0, _concessionRateForMonth(m, _std) - a);
        if (left <= 0) return;
        // JSS-REF-VELTRIX-2026-004: stamp the live PARTIAL state onto the pill so
        // toggleMonthPill's deselect branch can repaint this amber styling from live data
        // instead of the hardcoded red DUE reset (the UI-state desync being fixed here).
        p.dataset.partial        = 'true';
        p.dataset.partialLeft    = left;
        p.dataset.partialApplied = a;
        p.style.background  = 'rgba(212,150,42,0.18)';
        p.style.borderColor = 'rgba(212,150,42,0.60)';
        p.style.color       = 'var(--warn)';
        p.style.opacity     = '1';
        p.title = `${m} — PARTIAL: ₹${fmtNum(a)} paid, ₹${fmtNum(left)} still due`;
        p.innerHTML = `${m.slice(0,3)}<br><span style="font-size:8px;font-weight:700;letter-spacing:0.3px">PARTIAL ₹${fmtNum(left)}</span>`;
      });
    })();

    // ── NEW: Mark EXCUSED months (type===excused_waiver) so they show ✓ EXCUSED
    // and are excluded from the outstanding balance calculation.
    const excusedMonths = new Set();
    allTxDocs.forEach(data => {
      if (_normaliseAcademicYear(data.academicYear) !== _curYrNorm) return;
      if (data.type === 'excused_waiver' && Array.isArray(data.monthsExcused)) {
        // monthsExcused stores full month names e.g. ["September","October"]
        data.monthsExcused.forEach(m => excusedMonths.add(m));
      }
      // also handle monthsSelected on excused_waiver docs (some legacy records use that key)
      if (data.type === 'excused_waiver' && Array.isArray(data.monthsSelected)) {
        data.monthsSelected.forEach(m => excusedMonths.add(m));
      }
    });
    // Store on student object so calcLockedFee() can exclude them from outstanding count
    window._selectedFeeStudent.excusedMonths = excusedMonths;
    _markExcusedMonths(excusedMonths);

    // ── NEW: Mark months with recorded dues as RED (unpaid) in the payment grid ──
    // If this student was imported with currentYearDueMonths, highlight those
    // months RED so the clerk knows which ones still need payment.
    // Already-paid months (in paidMonths) will be green/locked regardless.
    if (Array.isArray(sData.currentYearDueMonths) && sData.currentYearDueMonths.length > 0) {
      _markDueMonthsRed(sData.currentYearDueMonths, paidMonths);
    }

    // JSS-REF-013: Individual Promotion carry-forward — months left unpaid in the
    // student's PRIOR grade (before a mid-year promotion) are billed at the old
    // class's rate and labelled distinctly, so staff don't mistake them for
    // current-class dues.
    if (sData.midYearPromotion && _normaliseAcademicYear(sData.midYearPromotion.academicYear) === _curYrNorm
        && Array.isArray(sData.midYearPromotion.priorGradeDueMonths) && sData.midYearPromotion.priorGradeDueMonths.length) {
      window._selectedFeeStudent.priorGradeDueMonths = new Set(sData.midYearPromotion.priorGradeDueMonths);
      window._selectedFeeStudent.priorGradeRate = sData.midYearPromotion.priorGradeRate || 0;
      _markPriorGradeDueMonths(sData.midYearPromotion.priorGradeDueMonths, sData.midYearPromotion.fromClass, paidMonths);
    } else {
      window._selectedFeeStudent.priorGradeDueMonths = null;
    }
  } catch(e) {
    console.warn('[ARC-016] Paid months fetch failed:', e.message);
  }
}

/* ── Label months carried forward as due against a PRIOR grade (mid-year promotion) ──
   Pills stay red/selectable (fee still due) but show a "PRIOR GRADE" sub-label so
   staff know these bill at the old class's rate, not the student's current class. ── */
function _markPriorGradeDueMonths(dueMonths, fromClass, paidMonths) {
  document.querySelectorAll('#monthPickerGrid .month-pill').forEach(btn => {
    if (btn.dataset.paid === 'true') return; // already paid/excused — leave as-is
    const month = btn.dataset.month;
    if (paidMonths && paidMonths.has(month)) return;
    if (!dueMonths.includes(month)) return;
    btn.title = `${month} — due against prior grade (${fromClass}), tap to record payment`;
    btn.innerHTML = `${month.slice(0,3)}<br><span style="font-size:7px;letter-spacing:0.3px;font-weight:700;color:var(--danger)">PRIOR GRADE</span>`;
  });
}

/* ============================================================
   COLONEL'S CHANGE #12 — FEE LOCK LOGIC
   Nur-Grade5=1700 | Grade6-8=1800 | Grade9=1900 | Grade10=2100
   Amount = rate × months. Field is read-only.
   ============================================================ */
// BUG-H01 FIX: _FEE_SCHEDULE is now a dynamic accessor backed by getFeeSchedule().
// Real data comes from Firestore schools/{id}.config.feeSchedule (loaded at login).
// This getter keeps all existing code that reads _FEE_SCHEDULE working unchanged.
const _FEE_SCHEDULE = new Proxy({}, {
  get(_, key) { return getFeeSchedule()[key]; },
  ownKeys()   { return Object.keys(getFeeSchedule()); },
  has(_, key) { return key in getFeeSchedule(); },
  getOwnPropertyDescriptor(_, key) {
    return Object.prototype.hasOwnProperty.call(getFeeSchedule(), key)
      ? { value: getFeeSchedule()[key], writable:false, enumerable:true, configurable:true }
      : undefined;
  }
});

function getClassRate(classSection) {
  if (!classSection) return null;
  // classSection is like "Grade 10 B" or "Grade 6 – Section A"
  // BUGFIX: Sort keys longest-first so "Grade 10" is checked before "Grade 1".
  // Without this, "Grade 10 B".startsWith("Grade 1") matches Grade 1 (₹1700) instead of Grade 10 (₹2100).
  const sortedKeys = Object.keys(getFeeSchedule()).sort((a, b) => b.length - a.length);
  for (const cls of sortedKeys) {
    if (classSection.startsWith(cls)) return { cls, rate: getFeeSchedule()[cls] };
  }
  return null;
}

/* ============================================================
   BUG-FEE-AUTOFIX — Runtime fee-rate correction on student load
   Problem: Students onboarded/promoted to e.g. Grade 6 had their
   previous-year outstanding stored at Grade 6 rate (₹1800) instead
   of their actual class that year (e.g. Grade 5 = ₹1700).
   Fix: derive previous-year class from ordered class list + year gap.
   NO Firestore writes — purely in-memory correction before rendering.
   ============================================================ */
function _fixStudentFeeRates(s) {
  if (!s) return s;
  s = Object.assign({}, s); // shallow copy — never mutate Firestore snapshot

  const sched     = getFeeSchedule();
  const classList = getClassList(); // ordered: ['Nursery','LKG',...,'Grade 10']

  // ── Helper: rate for a class string (exact or prefix match) ──
  function _rateFor(cls) {
    if (!cls) return null;
    if (sched[cls]) return sched[cls];
    const sorted = Object.keys(sched).sort((a, b) => b.length - a.length);
    for (const k of sorted) { if (cls.startsWith(k)) return sched[k]; }
    return null;
  }

  // ── Helper: class N years BEFORE a given class ──
  // e.g. _classNYearsBefore('Grade 6', 1) → 'Grade 5'
  //      _classNYearsBefore('Grade 6', 2) → 'Grade 4'
  function _classNYearsBefore(cls, yearsBack) {
    if (!cls || yearsBack <= 0) return cls;
    // Find base class (strip section suffix like " A" or " – Section A")
    const sorted = Object.keys(sched).sort((a, b) => b.length - a.length);
    let baseClass = cls;
    for (const k of sorted) { if (cls.startsWith(k)) { baseClass = k; break; } }
    const idx = classList.indexOf(baseClass);
    if (idx < 0) return cls;
    const prevIdx = idx - yearsBack;
    return prevIdx >= 0 ? classList[prevIdx] : classList[0];
  }

  // ── Helper: year gap between two academic year strings ──
  // e.g. _yearGap('2025-26', '2026-27') → 1
  function _yearGap(fromYr, toYr) {
    const _startOf = yr => {
      const m = String(yr || '').match(/(\d{4})/);
      return m ? parseInt(m[1], 10) : null;
    };
    const a = _startOf(fromYr), b = _startOf(toYr);
    return (a !== null && b !== null) ? Math.max(0, b - a) : null;
  }

  const curAcadYr  = _getCurrentAcademicYearStr(); // e.g. "2026-27"
  const currentRate = _rateFor(s.class);

  // ── Fix 1: openingOutstandingDues[] (multi-year / manual onboarding) ──
  // Each due entry has { class, year, amount, unpaidMonths }.
  // If due.class is missing or same as current class (wrong), derive it from year gap.
  if (Array.isArray(s.openingOutstandingDues) && s.openingOutstandingDues.length > 0) {
    let correctedPrevTotal = 0;
    s.openingOutstandingDues = s.openingOutstandingDues.map(due => {
      // Determine how many years before current this due year is
      const gap = _yearGap(due.year, curAcadYr);
      // Derive the class the student was in during that year
      const derivedCls  = (gap !== null && gap > 0) ? _classNYearsBefore(s.class, gap) : (due.class || s.class);
      const correctRate = _rateFor(derivedCls);
      if (!correctRate) { correctedPrevTotal += (due.amount || 0); return due; }
      // Only correct if the rate would actually change
      if (correctRate === currentRate) { correctedPrevTotal += (due.amount || 0); return due; }
      // Reverse-engineer month count from stored amount (which used the wrong rate)
      const impliedMonths = currentRate ? Math.round((due.amount || 0) / currentRate) : 0;
      const correctedAmt  = (impliedMonths > 0 && impliedMonths <= 12)
        ? impliedMonths * correctRate
        : (due.amount || 0);
      correctedPrevTotal += correctedAmt;
      return Object.assign({}, due, { class: derivedCls, amount: correctedAmt });
    });
    // Rebuild combined outstanding = corrected prev dues + current year balance
    const curYearBal = s.currentYearDueBalance || 0;
    s.outstandingBalance = correctedPrevTotal + curYearBal;
  }

  // ── Fix 2: previousDues (Excel import — older of two rows stored as s.previousDues) ──
  // s.previousAcademicYear tells us which year this is. Derive the class from the gap.
  if ((s.previousDues || 0) > 0 && currentRate) {
    const prevYr  = s.previousAcademicYear || s.openingOutstandingYear || '';
    const gap     = prevYr ? _yearGap(prevYr, curAcadYr) : null;
    const prevCls = (gap !== null && gap > 0)
      ? _classNYearsBefore(s.class, gap)
      : (s.openingOutstandingClass || s.classPrev || s.class);
    const correctPrevRate = _rateFor(prevCls);
    if (correctPrevRate && correctPrevRate !== currentRate) {
      const impliedMonths = Math.round(s.previousDues / currentRate);
      if (impliedMonths > 0 && impliedMonths <= 12) {
        const correctedPrevDues = impliedMonths * correctPrevRate;
        const diff = correctedPrevDues - s.previousDues;
        s.previousDues       = correctedPrevDues;
        s.outstandingBalance = Math.max(0, (s.outstandingBalance || 0) + diff);
      }
    }
  }

  // ── Fix 3: studentDocYear card (Source A) — s.outstandingBalance used directly ──
  // When s.academicYear is a past year and no openingOutstandingDues exist,
  // the balance is taken straight from s.outstandingBalance which may include
  // previousDues already corrected above, so no extra action needed here.

  return s;
}

/* ============================================================
   COLONEL'S HIGH SCHOOL — FIELD LOCK ENFORCEMENT
   Applies ONLY when currentSchoolId === 'colonels-high-school'.
   Other tenants are completely unaffected.
   Locks: Amount Paid (read-only), Remaining Balance (read-only).
   Payment Mode remains a normal dropdown for all tenants.
   Called after every fee form render to prevent devtools bypass.
   ============================================================ */
function enforceColonelLocks() {
  if (currentSchoolId !== 'colonels-high-school') return;

  // --- Lock Amount Paid ---
  const amtEl = document.getElementById('feeAmount');
  if (amtEl) {
    amtEl.readOnly = true;
    amtEl.style.pointerEvents = 'none';
    amtEl.style.userSelect    = 'none';
    amtEl.style.background    = 'var(--depth)';
    amtEl.style.color         = 'var(--gold-lt)';
    amtEl.style.fontWeight    = '700';
    amtEl.style.cursor        = 'not-allowed';
    amtEl.style.borderColor   = 'rgba(212,150,42,0.3)';
    amtEl.setAttribute('tabindex', '-1');
    amtEl.addEventListener('keydown', e => e.preventDefault(), true);
    amtEl.addEventListener('paste',   e => e.preventDefault(), true);
  }

  // --- Lock Remaining Balance ---
  const balEl = document.getElementById('feeBalance');
  if (balEl) {
    balEl.readOnly = true;
    balEl.style.pointerEvents = 'none';
    balEl.style.cursor        = 'not-allowed';
    balEl.setAttribute('tabindex', '-1');
    balEl.addEventListener('keydown', e => e.preventDefault(), true);
  }
}

/* ============================================================
   PHASE 6 #10 — MONTH PILL TOGGLE
   Tapping a pill toggles it selected/unselected.
   Selected = green glow background + white text.
   Calls calcLockedFee() to re-calculate amount.
   ============================================================ */
/* ── Reset month pills: elapsed months = RED (unpaid), future months = grey disabled ── */
function _resetMonthPills() {
  // JSS-REF-002 ITEM 1 FIX: a fresh student selection means a fresh payment allocation —
  // clear any split-payment rows left over from a previous student.
  if (typeof _resetSplitPaymentRows === 'function' && document.getElementById('splitPaymentRows')) {
    _resetSplitPaymentRows();
  }
  // Determine which months have elapsed in the current academic year (Jun→May)
  const ACAD_MONTHS = ['June','July','August','September','October','November','December',
                       'January','February','March','April','May'];
  const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  const calMonth = now.getMonth(); // 0=Jan…11=Dec
  // Academic index: Jun(cal5)=0 … Dec(cal11)=6, Jan(cal0)=7 … May(cal4)=11
  function toAcadIdx(c) { return c >= 5 ? c - 5 : c + 7; }
  const currentAcadIdx = toAcadIdx(calMonth);

  document.querySelectorAll('#monthPickerGrid .month-pill').forEach(btn => {
    const month    = btn.dataset.month;
    const acadIdx  = ACAD_MONTHS.indexOf(month);
    const elapsed  = acadIdx !== -1 && acadIdx <= currentAcadIdx;

    btn.dataset.paid     = 'false';
    btn.disabled         = false;
    btn.style.boxShadow  = 'none';
    btn.style.textDecoration = 'none';

    if (elapsed) {
      // Elapsed months → RED = unpaid by default
      btn.dataset.selected = 'false';
      btn.title            = `${month} — unpaid (tap to record payment)`;
      btn.style.background    = 'rgba(224,82,82,0.18)';
      btn.style.color         = 'var(--danger)';
      btn.style.borderColor   = 'rgba(224,82,82,0.55)';
      btn.style.cursor        = 'pointer';
      btn.style.opacity       = '1';
      // JSS-REF-VELTRIX-2026-004 ITEM 05: elapsed unpaid months are the ones genuinely
      // DUE (e.g. June/July once the academic year is underway) — they must carry the
      // "DUE" label, not just the month name. Previously only FUTURE/advance months showed
      // the label, so the actually-due months rendered with no label at all.
      btn.innerHTML           = `${month.slice(0,3)}<br><span style="font-size:8px;letter-spacing:0.5px;font-weight:700;color:var(--danger)">DUE</span>`;
    } else {
      // Future months → RED with "DUE" label, selectable for advance payment
      btn.dataset.selected = 'false';
      btn.title            = `${month} — advance payment (not yet due)`;
      btn.style.background    = 'rgba(224,82,82,0.12)';
      btn.style.color         = 'var(--danger)';
      btn.style.borderColor   = 'rgba(224,82,82,0.40)';
      btn.style.cursor        = 'pointer';
      btn.style.opacity       = '0.75';
      btn.disabled            = false;
      btn.innerHTML           = `${month.slice(0,3)}<br><span style="font-size:8px;letter-spacing:0.5px;font-weight:700;color:var(--danger)">DUE</span>`;
    }
  });
  const mHint = document.getElementById('monthPickerHint');
  if (mHint) mHint.innerHTML = '<span style="color:var(--danger)">🔴 Red = unpaid</span> · <span style="color:var(--success)">🟢 Green = paid</span> · Tap a red month to record payment. <span style="color:var(--muted);font-size:11px">(future months can be paid in advance)</span>';
}

/* ── Lock already-paid month pills (non-clickable, visually distinct) ── */
function _markPaidMonths(paidMonths) {
  document.querySelectorAll('#monthPickerGrid .month-pill').forEach(btn => {
    const month = btn.dataset.month;
    if (paidMonths.has(month)) {
      btn.dataset.paid     = 'true';
      btn.dataset.selected = 'false';
      btn.disabled         = true;
      btn.title            = `${month} already paid`;
      btn.style.background    = 'rgba(82,200,122,0.18)';
      btn.style.color         = 'var(--success)';
      btn.style.borderColor   = 'rgba(82,200,122,0.55)';
      btn.style.boxShadow     = 'none';
      btn.style.cursor        = 'not-allowed';
      btn.style.opacity       = '0.80';
      btn.style.textDecoration= 'none';
      btn.innerHTML = `${month.slice(0,3)}<br><span style="font-size:8px;letter-spacing:0.5px;font-weight:700">✓ PAID</span>`;
    }
  });
}

/* ── Lock excused month pills (non-clickable, visually distinct green with EXCUSED label) ── */
function _markExcusedMonths(excusedMonths) {
  document.querySelectorAll('#monthPickerGrid .month-pill').forEach(btn => {
    const month = btn.dataset.month;
    if (excusedMonths.has(month)) {
      btn.dataset.paid     = 'true';   // treat as "cleared" so it can't be selected
      btn.dataset.selected = 'false';
      btn.disabled         = true;
      btn.title            = `${month} — EXCUSED (waived by Principal)`;
      btn.style.background    = 'rgba(82,200,122,0.18)';
      btn.style.color         = 'var(--success)';
      btn.style.borderColor   = 'rgba(82,200,122,0.55)';
      btn.style.boxShadow     = 'none';
      btn.style.cursor        = 'not-allowed';
      btn.style.opacity       = '0.80';
      btn.style.textDecoration= 'none';
      btn.innerHTML = `${month.slice(0,3)}<br><span style="font-size:8px;letter-spacing:0.5px;font-weight:700">✓ EXCUSED</span>`;
    }
  });
}

/* ── Label concession months with a gold 🏷 CONCESSION sub-label ──────────
   Pills remain RED and selectable (fee still due), but show a gold badge
   so staff know a reduced concession rate applies for that month.
   Called after concessionRate + concessionActiveMonths are loaded.
   ─────────────────────────────────────────────────────────────────────── */
function _markConcessionMonths() {
  const student = window._selectedFeeStudent;
  if (!student) return;
  const concRate    = student.concessionRate;
  const activeMonths = student.concessionActiveMonths; // ['2026-07','2026-08',...] or []

  // No concession set → nothing to label
  if (typeof concRate !== 'number' || concRate < 0) return;

  // Month-name → numeric map (mirrors _concessionRateForMonth)
  const _MONTH_NUM = {
    January:'01', February:'02', March:'03', April:'04',
    May:'05', June:'06', July:'07', August:'08',
    September:'09', October:'10', November:'11', December:'12'
  };
  const _acadYrStr = _getCurrentAcademicYearStr();
  const _startYr   = parseInt(_acadYrStr.split('-')[0], 10);
  const _endYr     = _startYr + 1;

  document.querySelectorAll('#monthPickerGrid .month-pill').forEach(btn => {
    // Skip already-cleared pills (paid / excused)
    if (btn.dataset.paid === 'true') return;

    const month = btn.dataset.month; // full name e.g. "July"
    const mm    = _MONTH_NUM[month];
    if (!mm) return;

    const numMM        = parseInt(mm, 10);
    const yearForMonth = numMM >= 6 ? _startYr : _endYr;
    const key          = `${yearForMonth}-${mm}`; // e.g. "2026-07"

    // activeMonths [] = indefinite (applies to all months)
    const isConcessionMonth = !activeMonths || activeMonths.length === 0
      || activeMonths.includes(key);

    if (!isConcessionMonth) return; // standard rate for this month — no label

    // ITEM-8 FIX: literal "CONCESSION" label — same wording as the Excused
    // Section's concession-locked pills — instead of a 🏷 price tag, so every
    // module identifies a concession month the same way at a glance. The exact
    // rate is still surfaced via the pill's tooltip.
    // Keep the pill's existing colour (red = unpaid, gold = selected).
    const isSelected = btn.dataset.selected === 'true';
    const baseText   = month.slice(0, 3);
    // JSS-REF-VELTRIX-2026-005 ITEM 6: this used to overwrite the pill wholesale, so on a month
    // that is BOTH on a concession rate AND carrying a partial payment the "PARTIAL ₹X" label was
    // silently wiped (this runs after the partial labelling — see selectFeeStudent and
    // toggleMonthPill, which both call _markConcessionMonths last). Render BOTH labels, stacked
    // small inside the same pill, so neither state hides the other.
    const _isPartial = btn.dataset.partial === 'true';
    const _left      = Math.max(0, Number(btn.dataset.partialLeft) || 0);
    const _concSpan  = `<span style="font-size:7px;letter-spacing:0.3px;font-weight:700;color:var(--gold-lt)">CONCESSION</span>`;
    btn.innerHTML = _isPartial
      ? `${baseText}<br><span style="font-size:8px;font-weight:700;letter-spacing:0.3px;color:var(--warn)">PARTIAL ₹${fmtNum(_left)}</span><br>${_concSpan}`
      : `${baseText}<br>${_concSpan}`;

    // Update tooltip
    btn.title = _isPartial
      ? `${month} — PARTIAL: ₹${fmtNum(_left)} still due at the concession rate ₹${concRate}/month (tap to top up)`
      : `${month} — Concession rate ₹${concRate}/month (tap to record payment)`;
  });
}

/* ── Highlight unpaid due months RED (selectable) in Record Payment grid ── */
// Months in dueMonths that are NOT already paid → shown RED so clerk can tap to pay.
function _markDueMonthsRed(dueMonths, paidMonths) {
  document.querySelectorAll('#monthPickerGrid .month-pill').forEach(btn => {
    const month = btn.dataset.month;
    if (paidMonths && paidMonths.has(month)) return; // already green/locked
    if (dueMonths.includes(month)) {
      btn.dataset.selected = 'false';
      btn.dataset.paid     = 'false';
      btn.disabled         = false;
      btn.title            = `${month} — UNPAID (tap to record payment)`;
      btn.style.background    = 'rgba(224,82,82,0.18)';
      btn.style.color         = 'var(--danger)';
      btn.style.borderColor   = 'rgba(224,82,82,0.55)';
      btn.style.boxShadow     = 'none';
      btn.style.cursor        = 'pointer';
      btn.style.opacity       = '1';
      btn.textContent = month.slice(0, 3);
    }
  });
}

function toggleMonthPill(btn) {
  // Guard: paid months (green) and future months (disabled) are not clickable
  if (btn.dataset.paid === 'true' || btn.disabled) return;

  const isSelected = btn.dataset.selected === 'true';
  // Determine if this is a future (advance) month
  const _ACAD_MONTHS_TMP = ['June','July','August','September','October','November','December',
                             'January','February','March','April','May'];
  const _nowTmp = nowIST(); /* ITEM 01 FIX */
  const _curAcadIdxTmp = (_nowTmp.getMonth() >= 5) ? _nowTmp.getMonth() - 5 : _nowTmp.getMonth() + 7;
  const _btnAcadIdx = _ACAD_MONTHS_TMP.indexOf(btn.dataset.month);
  const _isFuture = _btnAcadIdx !== -1 && _btnAcadIdx > _curAcadIdxTmp;

  if (isSelected) {
    // Deselect → restore the pill's RESTING appearance from live pill state.
    btn.dataset.selected = 'false';
    btn.style.boxShadow  = 'none';
    if (btn.dataset.partial === 'true') {
      // JSS-REF-VELTRIX-2026-004: a PARTIAL month is NOT a plain red DUE month — restore its
      // amber styling + "PARTIAL ₹X" label from the live dataset stamped at render time,
      // instead of the hardcoded DUE reset that caused the visual desync.
      const _left = fmtNum(Number(btn.dataset.partialLeft) || 0);
      const _paid = fmtNum(Number(btn.dataset.partialApplied) || 0);
      btn.style.background    = 'rgba(212,150,42,0.18)';
      btn.style.color         = 'var(--warn)';
      btn.style.borderColor   = 'rgba(212,150,42,0.60)';
      btn.style.opacity       = '1';
      btn.title               = `${btn.dataset.month} — PARTIAL: ₹${_paid} paid, ₹${_left} still due`;
      btn.innerHTML           = `${btn.dataset.month.slice(0,3)}<br><span style="font-size:8px;font-weight:700;letter-spacing:0.3px">PARTIAL ₹${_left}</span>`;
    } else {
      // back to RED (still unpaid / advance DUE)
      btn.style.background    = _isFuture ? 'rgba(224,82,82,0.12)' : 'rgba(224,82,82,0.18)';
      btn.style.color         = 'var(--danger)';
      btn.style.borderColor   = _isFuture ? 'rgba(224,82,82,0.40)' : 'rgba(224,82,82,0.55)';
      btn.style.opacity       = _isFuture ? '0.75' : '1';
      btn.title               = _isFuture ? `${btn.dataset.month} — advance payment (not yet due)` : `${btn.dataset.month} — unpaid (tap to record payment)`;
      // Restore DUE label for future months, plain text for elapsed
      btn.innerHTML           = _isFuture
        ? `${btn.dataset.month.slice(0,3)}<br><span style="font-size:8px;letter-spacing:0.5px;font-weight:700;color:var(--danger)">DUE</span>`
        : btn.dataset.month.slice(0, 3);
    }
  } else {
    // Select → GOLD (being paid now)
    btn.dataset.selected = 'true';
    btn.style.background    = 'rgba(201,168,76,0.30)';
    btn.style.color         = 'var(--gold-lt)';
    btn.style.borderColor   = 'var(--gold)';
    btn.style.boxShadow     = '0 0 10px rgba(201,168,76,0.25)';
    btn.title               = `${btn.dataset.month} — selected for payment`;
    // Show concession rate in label while selected too
    btn.textContent         = btn.dataset.month.slice(0, 3);
  }
  // Re-apply concession badge (innerHTML was just reset to plain text above)
  _markConcessionMonths();
  calcLockedFee();
}

function getSelectedMonths() {
  const pills = document.querySelectorAll('#monthPickerGrid .month-pill[data-selected="true"]');
  return Array.from(pills).filter(p => p.dataset.paid !== 'true').map(p => p.dataset.month);
}

// _concessionRateForMonth(monthName, standardRate)
// Returns the concession rate if this month is covered by the student's activeMonths,
// otherwise returns the standard rate.
// monthName: full month name e.g. "July", "August" (from pill dataset.month)
// standardRate: the class standard fee
// activeMonths on _selectedFeeStudent: ['2026-07','2026-08',...] or [] = indefinite
function _concessionRateForMonth(monthName, standardRate) {
  const student = window._selectedFeeStudent;

  // JSS-REF-013: months carried forward as due against a PRIOR grade (from an
  // Individual Promotion mid-year) are billed at that prior grade's rate,
  // regardless of concession — the concession applies to the current class only.
  if (student?.priorGradeDueMonths && student.priorGradeDueMonths.has(monthName)) {
    return student.priorGradeRate;
  }

  const concRate = student?.concessionRate;
  if (typeof concRate !== 'number' || concRate < 0) return standardRate; // no concession

  const activeMonths = student.concessionActiveMonths;
  // If activeMonths is empty array → indefinite → always apply concession
  if (!activeMonths || activeMonths.length === 0) return concRate;

  // Map full month name → 2-digit month number
  const _MONTH_NUM = {
    January:'01', February:'02', March:'03', April:'04',
    May:'05', June:'06', July:'07', August:'08',
    September:'09', October:'10', November:'11', December:'12'
  };
  const mm = _MONTH_NUM[monthName];
  if (!mm) return standardRate; // unknown month name → safe fallback

  // Academic year span: derive year from current academic year string e.g. "2025-26"
  // Months Jun–Dec belong to the first year; Jan–May belong to the second year
  const _acadYrStr = _getCurrentAcademicYearStr(); // e.g. "2025-26"
  const _parts = _acadYrStr.split('-');
  const _startYr = parseInt(_parts[0], 10); // e.g. 2025
  const _endYr   = _startYr + 1;            // e.g. 2026
  // Jun(06)–Dec(12) → startYr; Jan(01)–May(05) → endYr
  const numericMM = parseInt(mm, 10);
  const yearForMonth = numericMM >= 6 ? _startYr : _endYr;
  const key = `${yearForMonth}-${mm}`; // e.g. "2026-07"

  if (!activeMonths.includes(key)) return standardRate;

  // [ITEM-02] A per-month correction (set via the concession's Edit modal)
  // overrides the default concession rate for that specific month only.
  const monthlyBreakdown = student.concessionMonthlyBreakdown;
  if (monthlyBreakdown && typeof monthlyBreakdown[key] === 'number') return monthlyBreakdown[key];

  return concRate;
}

function calcLockedFee() {
  const student  = window._selectedFeeStudent;
  const selected = getSelectedMonths();
  const months   = selected.length || 0;
  const amtEl    = document.getElementById('feeAmount');
  const hintEl   = document.getElementById('feeLockHint');
  const mHint    = document.getElementById('monthPickerHint');

  // Count ALL red (unpaid) pills — whether selected or not — to compute total outstanding
  const ACAD_MONTHS = ['June','July','August','September','October','November','December',
                       'January','February','March','April','May'];
  const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  function toAcadIdx(c) { return c >= 5 ? c - 5 : c + 7; }
  const currentAcadIdx = toAcadIdx(now.getMonth());
  const allPills = document.querySelectorAll('#monthPickerGrid .month-pill');
  // VLX-REF-006 FIX: Remaining Balance = FULL annual outstanding (all 12 unpaid months).
  // Elapsed-month filter removed — balance must count ALL unpaid months, not just those
  // that have 'arrived' on the calendar. monthlyFee × 12 minus paid = true annual due.
  // NOTE: excused pills have data-paid="true" so they are already excluded here.
  const totalUnpaidMonths = Array.from(allPills).filter(b =>
    b.dataset.paid !== 'true' && !b.disabled
  ).length;

  // Update month picker hint
  if (mHint) {
    if (months === 0) {
      mHint.innerHTML = '<span style="color:var(--danger)">🔴 Red = unpaid</span> · <span style="color:var(--success)">🟢 Green = paid</span> · Tap a red month to record payment.';
      mHint.style.color = '';
    } else {
      mHint.textContent = `${months} month${months > 1 ? 's' : ''} selected for payment: ${selected.join(', ')}`;
      mHint.style.color = 'var(--gold-lt)';
    }
  }

  if (!student || !student.cs) {
    if (amtEl) { amtEl.value = ''; amtEl.placeholder = 'Select student first'; }
    if (hintEl) hintEl.textContent = 'Select a student to auto-fill amount from class fee schedule.';
    document.getElementById('amtWordsWrap').style.display = 'none';
    if (typeof _updateSplitPaymentSummary === 'function') _updateSplitPaymentSummary();
    return;
  }

  if (months === 0) {
    if (amtEl) { amtEl.value = ''; amtEl.placeholder = 'Select month(s) first'; }
    if (hintEl) hintEl.textContent = 'Select months above to calculate amount.';
    document.getElementById('amtWordsWrap').style.display = 'none';

    // Even with no months selected, show correct outstanding balance based on unpaid pills
    const info2 = getClassRate(student.cs);
    if (info2) {
      // FIX: use _concessionRateForMonth per unpaid pill so activeMonths gating is respected.
      // Unpaid months NOT in activeMonths get the standard rate, not concession rate.
      // VLX-REF-006 FIX: Full annual balance — all 12 unpaid months, not just elapsed.
      const _unpaidPills = Array.from(allPills).filter(b => b.dataset.paid !== 'true' && !b.disabled);
      const unpaidPillMonths = _unpaidPills.map(b => b.dataset.month);
      // JSS-REF-VELTRIX-2026-004 ITEM 06: a PARTIAL month owes only its REMAINDER (rate − amount
      // already applied via the tx ledger), not the full fee. Use the shared _flPayableForMonths
      // helper — the SAME one the months-selected path and lockedAmount use — so the default
      // "Total Outstanding" nets partial months. Was: full _concessionRateForMonth per pill, which
      // counted e.g. a ₹200-paid ₹1800 Aug at the full ₹1800 (₹18,000 instead of ₹17,800).
      // Do NOT Math.max against prevBalance — that stale Firestore floor prevented concession
      // from lowering the balance correctly (floor was old standard-rate tx).
      const _appliedMap0 = (window._selectedFeeStudent && window._selectedFeeStudent._appliedByMonth) || {};
      const totalOutstanding = _flPayableForMonths(unpaidPillMonths, m => _concessionRateForMonth(m, info2.rate), _appliedMap0);
      // Count partial months separately so the label never equates a partial with a fully-unpaid month.
      const _partialCount0  = _unpaidPills.filter(b => b.dataset.partial === 'true').length;
      const _fullyDueCount0 = _unpaidPills.length - _partialCount0;
      const _cntLabel0 = _partialCount0 > 0
        ? `${_fullyDueCount0} unpaid + ${_partialCount0} partial`
        : `${_fullyDueCount0} unpaid month${_fullyDueCount0 !== 1 ? 's' : ''}`;
      // LIVE-WIRE: expose to profile card
      if (window._selectedFeeStudent) window._selectedFeeStudent.liveDue = totalOutstanding;
      const balEl2 = document.getElementById('feeBalance');
      const balHint2 = document.getElementById('feeBalanceHint');
      if (balEl2 && !window._selectedFeeStudent?.prevBalanceLoading) {
        balEl2.value = totalOutstanding;
        if (balHint2) balHint2.innerHTML = `<span style="color:var(--muted);font-size:11px">🔒 Auto-calculated · <span style="color:var(--danger)">${_cntLabel0}</span> = <strong style="color:var(--gold-lt)">₹${fmtNum(totalOutstanding)}</strong> outstanding</span>`;
      }
    }
    if (typeof _updateSplitPaymentSummary === 'function') _updateSplitPaymentSummary();
    return;
  }

  const info = getClassRate(student.cs);
  if (!info) {
    if (amtEl) { amtEl.value = ''; amtEl.placeholder = 'Class not in fee schedule'; }
    if (hintEl) hintEl.textContent = 'Class not found in fee schedule.';
    document.getElementById('amtWordsWrap').style.display = 'none';
    return;
  }

  // CONCESSION FIX: use _concessionRateForMonth per selected month so activeMonths gating
  // is fully respected — months outside activeMonths charge standard rate.
  // JSS-REF-VELTRIX-2026-004: when read.recordPayment is on, a reopened PARTIAL month quotes
  // only its remainder (rate − alreadyApplied), not the flat rate.
  const _flRP = FEATURE_FEELEDGER.read && FEATURE_FEELEDGER.read.recordPayment;
  const _appliedMap = (window._selectedFeeStudent && window._selectedFeeStudent._appliedByMonth) || {};
  const _quoteForMonth = m => {
    const r = _concessionRateForMonth(m, info.rate);
    return _flRP ? _flRecordPaymentMonthQuote(r, _appliedMap[m] || 0) : r;
  };
  const total = selected.reduce((sum, m) => sum + _quoteForMonth(m), 0);

  // For display hint: determine if any selected month has a concession rate
  const effectiveRate = (typeof student.concessionRate === 'number' && student.concessionRate >= 0)
    ? student.concessionRate
    : info.rate;
  const isConcession = effectiveRate !== info.rate &&
    selected.some(m => _concessionRateForMonth(m, info.rate) !== info.rate);

  // Total outstanding = per-month sum over ALL unpaid pills (respecting activeMonths).
  // Do NOT Math.max against prevBalance — stale Firestore balance floors the value at
  // the old standard-rate figure and prevents concession from reducing it correctly.
  // VLX-REF-006 FIX: Full annual balance — all 12 unpaid months, not just elapsed.
  const allUnpaidPillMonths = Array.from(allPills)
    .filter(b => b.dataset.paid !== 'true' && !b.disabled)
    .map(b => b.dataset.month);
  const totalOutstanding = allUnpaidPillMonths.reduce(
    (sum, m) => sum + _quoteForMonth(m), 0
  );
  // LIVE-WIRE: expose to profile card
  if (window._selectedFeeStudent) window._selectedFeeStudent.liveDue = totalOutstanding;

  // Deduct exactly what the student is paying now (concession or standard rate per month).
  // Old BUG-001 deducted standard-rate × months which overcorrected the balance.
  const newBalance = Math.max(0, totalOutstanding - total);

  if (amtEl) amtEl.value = total;
  if (typeof _updateSplitPaymentSummary === 'function') _updateSplitPaymentSummary();
  if (hintEl) hintEl.innerHTML = isConcession
    ? `<span style="color:var(--gold-lt);font-weight:600">${info.cls}</span> · <span style="color:var(--success)">🏷️ Concession ₹${fmtNum(effectiveRate)}/month</span> <span style="color:var(--muted);text-decoration:line-through;font-size:11px">std ₹${fmtNum(info.rate)}</span> × ${months} month${months > 1 ? 's' : ''} = <strong style="color:var(--gold-lt)">₹${fmtNum(total)}</strong> — locked`
    : `<span style="color:var(--gold-lt);font-weight:600">${info.cls}</span> · ₹${fmtNum(info.rate)}/month × ${months} month${months > 1 ? 's' : ''} = <strong style="color:var(--gold-lt)">₹${fmtNum(total)}</strong> — locked`;
  updateAmountInWords(total);

  // BUG-H07 FIX: Auto-fill remainingBalance — calculated, never manually entered.
  const balEl   = document.getElementById('feeBalance');
  const balHint = document.getElementById('feeBalanceHint');
  if (balEl) {
    if (window._selectedFeeStudent?.prevBalanceLoading) {
      balEl.value = ''; balEl.placeholder = 'Calculating…';
    } else {
      balEl.value       = newBalance;
      balEl.placeholder = '';
      if (balHint) {
        const unpaidAfter = totalUnpaidMonths - months;
        balHint.innerHTML = `<span style="color:var(--muted);font-size:11px">🔒 Auto-calculated · outstanding ₹${fmtNum(totalOutstanding)} − paying ₹${fmtNum(total)} now = <strong style="color:var(--gold-lt)">₹${fmtNum(newBalance)}</strong> remaining (<span style="color:var(--danger)">${unpaidAfter} month${unpaidAfter !== 1 ? 's' : ''} still unpaid</span>)</span>`;
      }
    }
  }
}

function updateAmountInWords(val) {
  const n = parseFloat(val);
  if (isNaN(n)) { document.getElementById('amtWordsWrap').style.display='none'; return; }
  document.getElementById('amtWordsWrap').style.display='block';
  document.getElementById('amtWords').textContent = 'In words: ' + numberToWords(n) + ' Rupees Only';
}

// ════════════════════════════════════════════════════════════════
// JSS-REF-002 ITEM 1 FIX — SPLIT PAYMENT SUPPORT (Multi-Mode Single Transaction)
// A fee payment can now be split across multiple modes (e.g. part Cash,
// part Card, part UPI) in ONE transaction. Each row captures a mode + the
// portion of the total amount paid via that mode. Rows must sum exactly
// to the locked total (feeAmount) before save is allowed. The receipt
// reflects the full mode-wise breakup.
// ════════════════════════════════════════════════════════════════
window._splitPayRowSeq = 0;
window._splitPayRows   = []; // array of row ids currently rendered

const _SPLIT_PAY_MODES = ['Cash','Bank Transfer','Cheque','UPI'];

function _resetSplitPaymentRows() {
  window._splitPayRowSeq = 0;
  window._splitPayRows   = [];
  const wrap = document.getElementById('splitPaymentRows');
  if (wrap) wrap.innerHTML = '';
  _addSplitPaymentRow();
}

function _renderSplitPaymentRow(id) {
  return `<div class="split-pay-row" data-row-id="${id}" style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start">
    <select class="form-control" id="spMode_${id}" onchange="_updateSplitPaymentSummary()" style="flex:1.3">
      <option value="">Select mode</option>
      ${_SPLIT_PAY_MODES.map(m=>`<option>${m}</option>`).join('')}
    </select>
    <input type="number" class="form-control" id="spAmt_${id}" placeholder="Amount (₹)" min="0"
      oninput="_updateSplitPaymentSummary()" style="flex:1">
    <div id="spCheque_${id}" style="display:none;flex:1">
      <input type="text" class="form-control" id="spChequeNo_${id}" placeholder="Cheque No.">
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="_removeSplitPaymentRow(${id})"
      title="Remove this mode" style="padding:6px 10px;flex:0 0 auto">✕</button>
  </div>`;
}

function _addSplitPaymentRow() {
  const wrap = document.getElementById('splitPaymentRows');
  if (!wrap) return;
  const id = ++window._splitPayRowSeq;
  window._splitPayRows.push(id);
  wrap.insertAdjacentHTML('beforeend', _renderSplitPaymentRow(id));
  _updateSplitPaymentSummary();
}

function _removeSplitPaymentRow(id) {
  // Never allow removing the last remaining row — at least one mode is always required.
  if (window._splitPayRows.length <= 1) return;
  window._splitPayRows = window._splitPayRows.filter(r => r !== id);
  const el = document.querySelector(`.split-pay-row[data-row-id="${id}"]`);
  if (el) el.remove();
  _updateSplitPaymentSummary();
}

// Total amount currently locked for this transaction. Reads from window._splitPayAmountFieldId
// (defaults to 'feeAmount' — Record Payment) so other modules like Record Previous Year Dues
// can reuse this exact component by pointing it at their own amount field id.
function _splitPayTargetTotal() {
  // JSS-REF-VELTRIX-2026-004 ITEM 06: when the partial toggle is on the payment modes must
  // sum to the AMOUNT COLLECTED (which may be short of the full payable), not the full amount.
  // Past-due reuses this same split component (window._splitPayAmountFieldId === 'pastDueAmount');
  // pick that screen's partial toggle + collected field so the modes sum to the collected amount.
  const _isPD  = window._splitPayAmountFieldId === 'pastDueAmount';
  const _ptId  = _isPD ? 'pastDuePartialToggle'   : 'feePartialToggle';
  const _colId = _isPD ? 'pastDueCollectedAmount' : 'feeCollectedAmount';
  const _pt = document.getElementById(_ptId);
  if (_pt && _pt.checked) {
    const c = parseFloat(document.getElementById(_colId)?.value);
    if (!isNaN(c)) return c;
  }
  const fieldId = window._splitPayAmountFieldId || 'feeAmount';
  const v = parseFloat(document.getElementById(fieldId)?.value);
  return isNaN(v) ? 0 : v;
}

function _updateSplitPaymentSummary() {
  const target = _splitPayTargetTotal();
  let sum = 0;
  window._splitPayRows.forEach(id => {
    const amtEl = document.getElementById(`spAmt_${id}`);
    const modeEl = document.getElementById(`spMode_${id}`);
    const chequeWrap = document.getElementById(`spCheque_${id}`);
    // ITEM 2 will wire the cheque number field itself — visibility toggle lives here
    // since it depends directly on this row's selected mode.
    if (chequeWrap) chequeWrap.style.display = (modeEl && modeEl.value === 'Cheque') ? '' : 'none';
    const amt = parseFloat(amtEl?.value);
    if (!isNaN(amt) && amt > 0) sum += amt;
  });
  // If there's exactly one row, auto-fill it with the full target amount for convenience —
  // matches the previous single-mode behaviour exactly (no manual entry needed).
  if (window._splitPayRows.length === 1) {
    const onlyId = window._splitPayRows[0];
    const amtEl = document.getElementById(`spAmt_${onlyId}`);
    if (amtEl && document.activeElement !== amtEl && target > 0) {
      amtEl.value = target;
      sum = target;
    }
  }
  const hint = document.getElementById('splitPaymentHint');
  if (hint) {
    const remaining = +(target - sum).toFixed(2);
    if (target <= 0) {
      hint.textContent = 'Select month(s) to determine the total payable amount.';
      hint.style.color = 'var(--muted)';
    } else if (Math.abs(remaining) < 0.005) {
      hint.innerHTML = `<span style="color:var(--success)">✓ Fully allocated — ₹${fmtNum(target)} across ${window._splitPayRows.length} mode${window._splitPayRows.length>1?'s':''}</span>`;
    } else if (remaining > 0) {
      hint.innerHTML = `<span style="color:var(--warn)">₹${fmtNum(remaining)} still unallocated of ₹${fmtNum(target)} total</span>`;
    } else {
      hint.innerHTML = `<span style="color:var(--danger)">⚠ Allocated ₹${fmtNum(Math.abs(remaining))} more than the ₹${fmtNum(target)} total — reduce an amount</span>`;
    }
  }
}

// Returns { valid, breakup, error } where breakup = [{mode, amount, chequeNumber?}]
function _collectSplitPaymentBreakup() {
  const target = _splitPayTargetTotal();
  const breakup = [];
  for (const id of window._splitPayRows) {
    const mode = getVal(`spMode_${id}`);
    const amtRaw = document.getElementById(`spAmt_${id}`)?.value;
    const amt = parseFloat(amtRaw);
    if (!mode) return { valid:false, error:'Please select a payment mode for every row.' };
    if (isNaN(amt) || amt <= 0) return { valid:false, error:'Please enter a valid amount for every payment mode.' };
    const row = { mode, amount: amt };
    if (mode === 'Cheque') {
      const chequeNo = getVal(`spChequeNo_${id}`);
      row.chequeNumber = chequeNo || '';
    }
    breakup.push(row);
  }
  if (!breakup.length) return { valid:false, error:'Please add at least one payment mode.' };
  const sum = +breakup.reduce((s,r)=>s+r.amount,0).toFixed(2);
  // JSS-REF-VELTRIX-2026-004 ITEM 06: 'target' is the AMOUNT COLLECTED when the partial
  // toggle is on (see _splitPayTargetTotal), so the payment modes must still sum EXACTLY to
  // it — the shortfall vs the full payable is expressed by the collected amount itself, not
  // by an under-allocated split.
  if (Math.abs(sum - target) > 0.5) {
    return { valid:false, error:`Split amounts (₹${fmtNum(sum)}) must add up to the amount being paid (₹${fmtNum(target)}).` };
  }
  return { valid:true, breakup };
}
// END JSS-REF-002 ITEM 1 — Split Payment Support

// JSS-REF-VELTRIX-2026-004 ITEM 06 — partial-payment amount entry (Record Payment form).
// Shows/hides the editable "Amount Collected" field and keeps the split-payment summary and
// the live shortfall hint in sync. The collected amount drives the split target, so the
// modes still sum to it exactly while the shortfall vs the full payable creates the PARTIAL month.
function _feePartialToggleChanged() {
  const on   = !!document.getElementById('feePartialToggle')?.checked;
  const wrap = document.getElementById('feeCollectedWrap');
  const coll = document.getElementById('feeCollectedAmount');
  if (on) {
    if (wrap) wrap.style.display = '';
    // Seed the collected field with the full payable so the clerk just reduces it.
    if (coll && (!coll.value || parseFloat(coll.value) === 0)) {
      coll.value = parseFloat(document.getElementById('feeAmount')?.value) || 0;
    }
  } else if (wrap) {
    wrap.style.display = 'none';
  }
  if (typeof _updateSplitPaymentSummary === 'function') _updateSplitPaymentSummary();
  _feeUpdatePartialHint();
}
function _feeUpdatePartialHint() {
  const hint = document.getElementById('feePartialHint');
  if (!hint) return;
  if (!document.getElementById('feePartialToggle')?.checked) { hint.textContent = ''; return; }
  const full = parseFloat(document.getElementById('feeAmount')?.value) || 0;
  const coll = parseFloat(document.getElementById('feeCollectedAmount')?.value) || 0;
  const shortfall = +(full - coll).toFixed(2);
  if (coll <= 0)               hint.innerHTML = '<span style="color:var(--danger)">Enter the amount collected.</span>';
  else if (coll > full + 0.5)  hint.innerHTML = `<span style="color:var(--danger)">Collected ₹${fmtNum(coll)} exceeds the ₹${fmtNum(full)} payable.</span>`;
  else if (shortfall < 0.5)    hint.innerHTML = `<span style="color:var(--success)">✓ Covers the full ₹${fmtNum(full)} — no shortfall.</span>`;
  else                         hint.innerHTML = `<span style="color:var(--warn)">₹${fmtNum(shortfall)} short of ₹${fmtNum(full)} — the last covered month will be PARTIAL.</span>`;
}

// ============================================================================
// JSS-REF-VELTRIX-2026-004 ITEM 06 — PARTIAL PAYMENT ALLOCATION
// SINGLE SOURCE OF TRUTH. One allocation function, reused by every payment entry
// point — do NOT fork this into per-caller copies (that copy-paste pattern is what
// spread the "latest-transaction-wins" bug across six functions previously).
//
// Sequentially allocates `amountReceived` across `monthsInAcadOrder` (already in
// academic June→May order). Each month is filled up to what it still OWES
// (rate − anything already paid toward it). The month the money runs out on becomes
// PARTIAL; fully-covered months become PAID; untouched months stay DUE. PARTIAL
// months are deliberately NOT locked: on a later payment they are re-selected, and
// because they sort first (older) and carry a non-zero priorPaid, this same function
// tops them up FIRST before the money spills into newer months — identical logic for
// "first payment across N months" and "top-up on an existing partial".
//
//   monthsInAcadOrder   : string[]              full month names, June→May order
//   amountReceived      : number                cash received now
//   rateForMonth(m)     : number                full (concession-aware) fee for m
//   priorPaidForMonth(m): number                already paid toward m (0 if none)
// Returns { allocations, applied, leftover }; allocations entries are
//   { month, rate, priorPaid, nowPaid, totalPaid, status:'paid'|'partial'|'due', shortage }
// ============================================================================
function _allocateFeePayment(monthsInAcadOrder, amountReceived, rateForMonth, priorPaidForMonth) {
  let remaining = Math.max(0, Number(amountReceived) || 0);
  let applied   = 0;
  const allocations = (monthsInAcadOrder || []).map(m => {
    const rate  = Math.max(0, Number(rateForMonth      ? rateForMonth(m)      : 0) || 0);
    const prior = Math.max(0, Number(priorPaidForMonth ? priorPaidForMonth(m) : 0) || 0);
    const owed  = Math.max(0, rate - prior);
    const nowPaid = Math.min(remaining, owed);
    remaining -= nowPaid;
    applied   += nowPaid;
    const totalPaid = prior + nowPaid;
    const status = (rate > 0 && totalPaid >= rate) ? 'paid' : (totalPaid > 0 ? 'partial' : 'due');
    return { month: m, rate, priorPaid: prior, nowPaid, totalPaid, status, shortage: Math.max(0, rate - totalPaid) };
  });
  return { allocations, applied, leftover: remaining };
}

// JSS-REF-VELTRIX-2026-004 ITEM 06 — companion SINGLE SOURCE OF TRUTH for "how much
// has been paid toward month `monthName`" across a set of transactions. Reads the
// partial-aware tx.monthAllocations map when present; for legacy transactions (no
// allocation map) it falls back to the old rule — a month listed in monthsSelected
// counts as fully paid at its rate — so existing data behaves exactly as before.
function _paidTowardMonthFromTxs(txs, monthName, rateForMonth) {
  let paid = 0;
  (txs || []).forEach(t => {
    if (t.type === 'excused_waiver') return;
    if (t.monthAllocations && typeof t.monthAllocations === 'object') {
      const a = t.monthAllocations[monthName];
      if (typeof a === 'number') paid += a;
    } else if (Array.isArray(t.monthsSelected) && t.monthsSelected.includes(monthName)) {
      paid += rateForMonth ? (Number(rateForMonth(monthName)) || 0) : 0;
    }
  });
  return paid;
}

async function saveFeePayment(prefillId) {
  // VLX-REF-001 FIX: Duplicate Submission Lock — disable the button immediately on first click.
  // The button remains disabled until the receipt is fully generated or an error occurs.
  const _saveBtn = document.getElementById('saveReceiptBtn');
  if (_saveBtn) {
    if (_saveBtn.disabled) return; // already processing — block any further clicks
    _saveBtn.disabled = true;
    _saveBtn.innerHTML = '<span style="opacity:0.7">⏳ Processing…</span>';
  }

  const student = window._selectedFeeStudent || (prefillId ? { id:prefillId } : null);
  if (!student?.id) {
    showFormAlert('feeAlert','Please select a student.','danger');
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
    return;
  }

  // PREVIOUS YEAR SAVE GUARD: if all pills are locked as "PAST DUE", the student belongs
  // in Past Due Recording. Block the save entirely with a clear redirect message.
  const allPills = document.querySelectorAll('#monthPickerGrid .month-pill');
  const allPastDue = allPills.length > 0 && Array.from(allPills).every(p => p.dataset.paid === 'true' && (p.title || '').includes('Past Due Recording'));
  if (allPastDue) {
    showFormAlert('feeAlert', '⚠️ This student has previous year dues. Use <strong>Record Previous Year Dues</strong> to clear them — Record Payment is for the current year only.', 'danger');
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
    return;
  }

  // PHASE 6 #10: Get selected months from the pill grid.
  const monthsSelected = getSelectedMonths();
  const months         = monthsSelected.length;
  if (months === 0) {
    showFormAlert('feeAlert','Please select at least one month being paid.','danger');
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
    return;
  }

  // COLONEL'S CHANGE #12 + CONCESSION FIX:
  // Amount is auto-calculated and locked. Use concessionRate if set, else standard rate.
  let lockedAmount = null;
  if (student.cs) {
    const info = getClassRate(student.cs);
    if (info) {
      // Per-month concession check — only apply concession rate to months in activeMonths
      lockedAmount = _flPayableForMonths(monthsSelected, m => _concessionRateForMonth(m, info.rate),
                       window._selectedFeeStudent && window._selectedFeeStudent._appliedByMonth);
    }
  }
  // Fallback: if cs not in window._selectedFeeStudent, fetch from Firestore
  // Also check concessionFees in this fallback path
  if (!lockedAmount) {
    try {
      const sDoc = await schoolCol('students').doc(student.id).get();
      const sd = sDoc.data();
      const info = getClassRate(`${sd.class}`);
      if (info) {
        // Check concession override
        let fallbackRate = info.rate;
        if (sd.admissionNumber) {
          const cSnap = await schoolCol('concessionFees')
            .where('admissionNo', '==', sd.admissionNumber)
            .limit(1).get();
          if (!cSnap.empty) {
            const _fbCData = cSnap.docs[0].data();
            if (!window._selectedFeeStudent.concessionData) {
              window._selectedFeeStudent.concessionData = _fbCData;
            }
            const cf = _fbCData.concessionFee;
            if (typeof cf === 'number' && cf >= 0) {
              fallbackRate = cf;
              // Sync concessionRate and concessionActiveMonths so _concessionRateForMonth works
              window._selectedFeeStudent.concessionRate = cf;
              window._selectedFeeStudent.concessionActiveMonths =
                Array.isArray(_fbCData.activeMonths) ? _fbCData.activeMonths : [];
              // [ITEM-02] Per-month corrections, so this fallback path also
              // honours edited month amounts, not just the default rate.
              window._selectedFeeStudent.concessionMonthlyBreakdown =
                (_fbCData.monthlyBreakdown && typeof _fbCData.monthlyBreakdown === 'object') ? _fbCData.monthlyBreakdown : {};
            }
          }
        }
        // Per-month check — concession only applies to months in activeMonths
        lockedAmount = _flPayableForMonths(monthsSelected, m => _concessionRateForMonth(m, info.rate),
                       window._selectedFeeStudent && window._selectedFeeStudent._appliedByMonth);
        if (!lockedAmount) lockedAmount = fallbackRate * months;
      }
    } catch(_){}
  }
  if (!lockedAmount) {
    showFormAlert('feeAlert','Cannot determine fee amount. Please verify student class is in the fee schedule.','danger');
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
    return;
  }

  const feeHead = getVal('feeFeeHead');
  let   amount  = lockedAmount; // Full payable by default; ITEM 06 partial path may lower it below.
  const date    = getVal('feeDate');

  // JSS-REF-002 ITEM 1 FIX: collect and validate the split-payment breakup.
  // Replaces the old single `feeMode` dropdown value entirely.
  const _splitResult = _collectSplitPaymentBreakup();
  if (!_splitResult.valid) {
    showFormAlert('feeAlert', _splitResult.error, 'danger');
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
    return;
  }
  const paymentModeBreakup = _splitResult.breakup;
  // Backward-compatible single-string mode: exact mode name if only one, else "Split Payment".
  const mode = paymentModeBreakup.length === 1 ? paymentModeBreakup[0].mode : 'Split Payment';

  // BUG-H08 FIX: Whitelist paymentStatus — never trust DOM value directly.
  const ALLOWED_STATUSES = ['Paid'];
  const rawStatus = getVal('feeStatus');
  const status    = ALLOWED_STATUSES.includes(rawStatus) ? rawStatus : 'Paid';
  if (rawStatus !== status) {
    console.warn('BUG-H08: Rejected tampered paymentStatus value:', rawStatus, '→ coerced to Paid');
  }

  // BALANCE FIX: Remaining balance = what is still owed AFTER this payment.
  // Calculated purely from unpaid pills × their concession/standard rate.
  // Never seeded from a previous transaction's remainingBalance — that value
  // was written at the old standard rate and causes a stale floor that ignores concession.
  //
  // Strategy: count all pills that will still be unpaid after this save
  //   (elapsed, not paid, not excused, not in monthsSelected being paid now)
  //   and sum their per-month concession/standard rate.
  const _paidNowSet = new Set(monthsSelected);
  const ACAD_MONTHS_SAVE = ['June','July','August','September','October','November','December',
                             'January','February','March','April','May'];
  function _toAcadIdxSave(c) { return c >= 5 ? c - 5 : c + 7; }
  const _nowSave = nowIST(); /* ITEM 01 FIX */
  const _curAcadIdxSave = _toAcadIdxSave(_nowSave.getMonth());
  // BUG-INFOSAVE-FALLBACK (defensive — not a confirmed root cause): resolve the
  // per-month rate through the SAME path the full-payment lockedAmount uses
  // (~L1457-1496). If student.cs is missing or getClassRate(student.cs) returns
  // null, the partial allocator would see rate 0 and bail with "Enter an amount
  // greater than ₹0" even though a full payment still succeeds via lockedAmount's
  // direct sd.class fetch. Fetch the class from Firestore the same way so the
  // partial and full rate-resolution paths never diverge.
  // Shared rate resolver (_flResolveClassInfo, pending-fee.js) — contract-tested by
  // save_rate_falls_back_to_doc_class_and_matches_locked. cs first; on failure fetch the
  // student's stored class and resolve from that, matching lockedAmount's fallback exactly.
  let _infoSave = _flResolveClassInfo(student.cs, null, getClassRate);
  if (!_infoSave) {
    try {
      const _sDocRate = await schoolCol('students').doc(student.id).get();
      const _sdRate   = _sDocRate.data();
      _infoSave = _flResolveClassInfo(null, _sdRate && _sdRate.class, getClassRate);
    } catch(_){}
  }
  let balance = 0;
  if (_infoSave) {
    const _stillUnpaidMonths = Array.from(
      document.querySelectorAll('#monthPickerGrid .month-pill')
    ).filter(b =>
      b.dataset.paid !== 'true' &&         // not already paid/excused


      !_paidNowSet.has(b.dataset.month)     // not being paid in this transaction
    ).map(b => b.dataset.month);
    balance = _stillUnpaidMonths.reduce(
      (sum, m) => sum + _concessionRateForMonth(m, _infoSave.rate), 0
    );
  }

  if (!feeHead||!mode||!date) {
    showFormAlert('feeAlert','Please fill all required fields.','danger');
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
    return;
  }

  // Get student info
  const sDoc = await schoolCol('students').doc(student.id).get();
  const sData = sDoc.data();

  // ITEM 05.2 GUARD: this form now also serves the Terminated section's "Pay Dues"
  // action (unified engine). The row button is already hidden from Admin, but this
  // is a second line of defense — mirrors the check the removed legacy
  // saveTerminatedFeePayment() used to perform.
  if ((sData.status === 'terminated' || sData.status === 'hidden') && currentRole !== 'principal') {
    showFormAlert('feeAlert','Only Principal can record payments for terminated/hidden students.','danger');
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
    return;
  }

  // ============================================================================
  // JSS-REF-VELTRIX-2026-004 ITEM 06 — PARTIAL PAYMENT ALLOCATION (opt-in toggle).
  // Toggle OFF (default): amount stays the full payable and every selected month is paid
  // in full — byte-for-byte the pre-feature behaviour (no monthAllocations written, so
  // every downstream consumer keeps its legacy path). Toggle ON: the collected amount may
  // be short, and the single _allocateFeePayment() source of truth fills the selected
  // months sequentially (older / already-partial months first), leaving the boundary
  // month PARTIAL with its shortfall carried in the outstanding balance.
  // ============================================================================
  let monthAllocations = null, partialMonths = [], monthShortage = null;
  let monthsPaidList = monthsSelected.slice();
  let paymentStatusFinal = status;
  if (document.getElementById('feePartialToggle')?.checked) {
    const _rateForMonthSave = m => _concessionRateForMonth(m, _infoSave ? _infoSave.rate : 0);
    const _collectedAmount  = paymentModeBreakup.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (_collectedAmount > lockedAmount + 0.5) {
      showFormAlert('feeAlert', `Amount collected (₹${fmtNum(_collectedAmount)}) can't exceed the total payable (₹${fmtNum(lockedAmount)}). To pay ahead, select more months instead.`, 'danger');
      if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
      return;
    }
    let _curYearTxs = [];
    try {
      const _txSnap = await schoolCol('feeTransactions')
        .where('studentId', '==', student.id)
        .where('academicYear', '==', _getCurrentAcademicYearStr()).get();
      _curYearTxs = _txSnap.docs.map(d => d.data());
    } catch(_) { _curYearTxs = []; }
    const _priorPaidForMonth = m => _paidTowardMonthFromTxs(_curYearTxs, m, _rateForMonthSave);
    const _alloc = _allocateFeePayment(monthsSelected, _collectedAmount, _rateForMonthSave, _priorPaidForMonth);
    if (_alloc.applied <= 0) {
      showFormAlert('feeAlert', 'Enter an amount greater than ₹0 to record a partial payment.', 'danger');
      if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
      return;
    }
    monthAllocations = {}; monthShortage = {}; monthsPaidList = []; partialMonths = [];
    _alloc.allocations.forEach(a => {
      if (a.nowPaid > 0) { monthAllocations[a.month] = a.nowPaid; monthsPaidList.push(a.month); }
      if (a.status === 'partial') { partialMonths.push(a.month); monthShortage[a.month] = a.shortage; }
    });
    amount  = _alloc.applied;                                                              // actual cash applied now
    balance = balance + _alloc.allocations.reduce((s, a) => s + (a.shortage || 0), 0);     // + selected-month shortfalls
    paymentStatusFinal = partialMonths.length ? 'Partial' : 'Paid';
  }

  const _rcpUUID = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0,8).toUpperCase()
    : Math.random().toString(36).slice(2,10).toUpperCase();
  const receiptNumber = 'RCP-' + _rcpUUID + '-' + Date.now().toString(36).toUpperCase();

  const tx = {
    receiptNumber, studentId:student.id,
    admissionNumber: sData.admissionNumber||'',
    studentName: sData.name||'',
    parentName: sData.parentName||'',
    contactNo: sData.contact||'',
    classSection: `${sData.class||''} – Section ${sData.section||''}`,
    studentClass: sData.class||'',
    studentSection: sData.section||'',
    studentBlock: sData.block||'',
    feeHead, amountPaid:amount, amountInWords: numberToWords(amount) + ' Rupees Only',
    // PHASE 6 #10: Store both the count and the explicit month names.
    // monthsSelected wires directly into the Virtual Fee Profile Card (Phase 7).
    // Legacy transactions without monthsSelected are preserved as-is — no migration needed.
    monthsDue: months,
    monthsSelected: monthsPaidList,   // ITEM 06: months this payment actually touched (== all selected on a full payment)
    // ARC-016 FIX: Tag every fee transaction with the current academic year.
    // This is the key that makes all where('academicYear','==',curYear) queries work
    // correctly — both in Record Fee Payment (balance scoping) and Due Fee (month locking).
    // Without this field, prior-year tx remainingBalances could bleed into current-year views.
    academicYear: _getCurrentAcademicYearStr(),
    // VLX-REF-003 FIX: Use the exact moment of payment (date + current time) so receipts
    // carry the real timestamp, not a midnight-truncated date-only value.
    // BUG-TS-001 FIX: new Date("YYYY-MM-DD") parses as UTC midnight, which shifts the date
    // back by IST offset (5h30m). Instead, parse date parts locally and combine with current time.
    paymentMode:mode,
    // JSS-REF-002 ITEM 1 FIX: mode-wise breakup — [{mode, amount, chequeNumber?}, ...].
    // Single-mode payments still populate this with a one-element array for consistency,
    // so every consumer (receipt, print, finance exports) can rely on it being present.
    paymentModeBreakup, date: firebase.firestore.Timestamp.fromDate(
      (() => { const [yr,mo,dy] = date.split('-').map(Number); const n = nowIST(); /* ITEM 01 FIX: build the IST wall-clock instant, not device-local */ return new Date(Date.UTC(yr, mo-1, dy, n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds()) - 5.5*60*60*1000); })()
    ),
    remainingBalance:balance, paymentStatus:paymentStatusFinal,
    // JSS-REF-VELTRIX-2026-004 ITEM 06: per-month allocation map is the single source of
    // truth for partial payments; omitted entirely on full payments so legacy consumers
    // (and all existing data) keep their exact current behaviour.
    ...(monthAllocations ? { monthAllocations, partialMonths, monthShortage } : {}),
    recordedBy: currentUser.uid, recordedByName: currentProfile?.name||'Admin',
    // ITEM 05.2: preserves the isTerminatedPayment flag the Terminated Fee History
    // view filters on, now that terminated payments flow through this same function.
    ...(sData.status === 'terminated' ? { isTerminatedPayment: true } : {}),
    ...(sData.status === 'hidden' ? { isHiddenPayment: true } : {})
  };

  // CHG-006: Atomic writeBatch — write transaction + update student balance atomically.
  // Never use two independent .add()/.update() calls — race conditions corrupt data.
  try {
    const db      = firebase.firestore();
    const batch   = db.batch();

    // 1) Write the fee transaction document
    const txRef   = schoolCol('feeTransactions').doc();
    batch.set(txRef, tx);

    // 2) Atomically update student's outstandingBalance and fee_status
    const stuRef  = schoolCol('students').doc(student.id);
    // JSS-REF-VELTRIX-2026-004 ITEM 06: 'partial' re-enabled — a payment that leaves a
    // short (non-zero) amount on a selected month reports 'partial', not generic 'pending'.
    // _syncStudentFinancials recomputes this authoritatively immediately after the batch.
    const newFeeStatus = balance <= 0 ? 'paid' : (paymentStatusFinal === 'Partial' ? 'partial' : 'pending');
    batch.update(stuRef, {
      outstandingBalance: balance,
      fee_status:         newFeeStatus,
      lastPaymentDate:    firebase.firestore.Timestamp.fromDate((() => { const [yr,mo,dy] = date.split('-').map(Number); const n = nowIST(); /* ITEM 01 FIX: build the IST wall-clock instant, not device-local */ return new Date(Date.UTC(yr, mo-1, dy, n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds()) - 5.5*60*60*1000); })()),
      lastPaymentAmount:  amount
    });

    await batch.commit();

    // ITEM-10 FIX: canonical cross-module reconciliation as the final step.
    await _syncStudentFinancials(student.id);

    auditLog('fee_payment_recorded', {
      receiptNumber: tx.receiptNumber, studentId: tx.studentId,
      studentName: tx.studentName, amountPaid: tx.amountPaid,
      classSection: tx.classSection, monthsSelected: tx.monthsSelected,
      newOutstandingBalance: balance, newFeeStatus
    });

    showFormAlert('feeAlert','Payment recorded successfully!','success');
    showReceipt(tx);
    invalidateFinanceCache();
    invalidateStudentCache();

    // CHG-006 #4: Force-refresh Pending Fees if it is currently visible
    if (document.querySelector('[data-section="pendingFee"]') ||
        (typeof currentSection !== 'undefined' && currentSection === 'pendingFee')) {
      setTimeout(() => { if (typeof renderPendingFee === 'function') renderPendingFee(); }, 300);
    }

    // LOCK-FEE: Lock the entire form after successful payment.
    // Prevents accidental duplicate entries. User must navigate away and return to record another.
    _feeLockForm(tx);

  } catch(e) {
    showFormAlert('feeAlert','Error: '+e.message,'danger');
    // VLX-REF-001: Unlock button so user can retry after an error
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = iconFee + ' Save & Generate Receipt'; }
  }
}

function _feeLockForm(tx) {
  // Disable student search
  const _srch = document.getElementById('feeStudentSearch');
  if (_srch) { _srch.disabled = true; _srch.style.opacity = '0.5'; }

  // Disable fee head dropdown
  const _fh = document.getElementById('feeHead');
  if (_fh) { _fh.disabled = true; _fh.style.opacity = '0.5'; }

  // Disable all month pills
  document.querySelectorAll('#monthPickerGrid .month-pill').forEach(p => {
    p.disabled = true; p.style.pointerEvents = 'none'; p.style.opacity = '0.6';
  });

  // Disable payment mode and date
  // JSS-REF-002 ITEM 1 FIX: also disable every split-payment row's mode/amount/cheque
  // inputs and the "+ Add Payment Mode" button, not just the (legacy, unmatched) ids.
  ['paymentMode','paymentDate','feeDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.style.opacity = '0.5'; }
  });
  document.querySelectorAll('#splitPaymentRows input, #splitPaymentRows select, #splitPaymentRows button').forEach(el => {
    el.disabled = true; el.style.opacity = '0.5';
  });
  const _addModeBtn = document.querySelector('button[onclick="_addSplitPaymentRow()"]');
  if (_addModeBtn) { _addModeBtn.disabled = true; _addModeBtn.style.opacity = '0.5'; }

  // Replace save button with locked success banner
  const _btn = document.getElementById('saveReceiptBtn');
  if (_btn) {
    _btn.outerHTML = `<div style="
      background: rgba(34,197,94,0.08);
      border: 1.5px solid rgba(34,197,94,0.4);
      border-radius: 10px;
      padding: 14px 16px;
      text-align: center;
      margin-top: 4px;
    " id="feeLockBanner">
      <div style="font-size:15px;font-weight:700;color:#22c55e;margin-bottom:6px">✅ Payment Recorded Successfully</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
        Receipt: ${sanitizeHTML(tx.receiptNumber||'')} · ₹${fmtNum(tx.amountPaid)}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="navigate('recordFee')" style="width:100%;font-size:12px">
        🔄 Record Another Payment
      </button>
    </div>`;
  }
}

// JSS-REF-015 FIX: showReceipt() now pops up as a true overlay on top of
// whatever section the user is currently on (Record Payment, Paid Fee table,
// Dashboard, etc.) instead of writing into a static box embedded inside the
// Record Payment page — which previously meant the receipt could only ever
// be seen by being physically ON the Record Payment page. Mirrors the same
// fixed-overlay pattern already used by viewTerminatedReceipt().
function closeReceiptPopup() {
  const existing = document.getElementById('receiptPopupOverlay');
  if (existing) existing.remove();
}

function showReceipt(tx) {
  const overlayId = 'receiptPopupOverlay';
  const existing  = document.getElementById(overlayId);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReceiptPopup(); });
  overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--glass-border);border-radius:14px;max-width:480px;width:100%;padding:0;box-shadow:0 24px 60px rgba(0,0,0,0.65);overflow:hidden;max-height:90vh;overflow-y:auto">
      <div class="receipt-box" id="receiptBox" style="display:block;margin:0;border-radius:0;border:none;position:relative">
        <button onclick="closeReceiptPopup()" title="Close" style="position:absolute;top:10px;right:12px;background:none;border:none;color:var(--muted);font-size:22px;line-height:1;cursor:pointer">×</button>
        <div class="receipt-hdr">
          <div class="receipt-logo">${currentProfile?.schoolName || currentSchoolId || 'School'}</div>
          <div class="receipt-sub">Powered by Veltrix Campus &middot; JSS</div>
          <div class="receipt-title">FEE RECEIPT</div>
        </div>
        <div id="rc_student" style="margin-bottom:14px"></div>
        <div id="rc_details"></div>
        <div class="receipt-total" id="rc_total"></div>
        <div id="rc_recorded_by" style="margin-top:16px;text-align:center;font-size:11px;color:var(--muted)"></div>
        <div style="margin-top:14px;display:flex;gap:10px;justify-content:center">
          <button class="btn btn-secondary btn-sm" onclick="printReceipt()">🖨 Print</button>
          <button class="btn btn-ghost btn-sm" onclick="closeReceiptPopup()">Close</button>
        </div>
        <div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--border);text-align:center">
          <div style="font-size:10px;color:var(--muted);letter-spacing:0.5px">Powered by</div>
          <div style="font-size:11px;font-weight:600;color:var(--silver-lt);letter-spacing:0.8px;font-family:'Cinzel',serif">Jeelan's Software & Solutions</div>
          <div style="font-size:9px;color:var(--faint);margin-top:1px">Digitalize · Innovate · Elevate</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // BUG-P01: receipt ID removed from receipt display
  // BUG-PDR-DEFENSIVE: Normalize field names — old past_due_payment docs used 'admissionNo',
  // 'class' (not 'classSection'), and had no 'feeHead' or 'paymentStatus'. Handle both shapes.
  const _admNo    = tx.admissionNumber || tx.admissionNo || '—';
  const _classeSec = tx.classSection || (tx.class ? `${tx.class}${tx.section ? ' – Section ' + tx.section : ''}` : '—');
  const _feeHead   = tx.feeHead || (tx.type === 'past_due_payment' ? `Past Due — ${(tx.monthsSelected||[]).join(', ')} (${tx.academicYear||''})` : '—');
  const _status    = tx.paymentStatus || (tx.type === 'past_due_payment' ? 'Paid' : '—');
  document.getElementById('rc_student').innerHTML = `
    <div class="r-row"><span class="r-lbl">Student Name</span><span class="r-val">${tx.studentName || '—'}</span></div>
    <div class="r-row"><span class="r-lbl">Class & Section</span><span class="r-val">${_classeSec}</span></div>
    <div class="r-row"><span class="r-lbl">Admission No</span><span class="r-val">${_admNo}</span></div>
  `;
  // JSS-REF-VELTRIX-2026-004: a PARTIAL payment must read as PARTIAL on the receipt, stating
  // the shortfall for THIS transaction. That is a different figure from "Remaining Balance",
  // which is the student's TOTAL outstanding across all months — showing only the latter is
  // what made a ₹200 short payment print as ₹1,800.
  const _shortMap   = (tx.monthShortage && typeof tx.monthShortage === 'object') ? tx.monthShortage : null;
  const _partMonths = Array.isArray(tx.partialMonths) ? tx.partialMonths : [];
  const _shortTotal = _shortMap ? Object.values(_shortMap).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  const _partialRow = (_partMonths.length && _shortTotal > 0)
    ? `<div class="r-row" style="background:rgba(212,150,42,0.12);border-radius:6px;padding:5px 7px;margin:3px 0">
         <span class="r-lbl" style="color:var(--warn);font-weight:700">Partial — Short By</span>
         <span class="r-val" style="color:var(--warn);font-weight:700">₹${fmtNum(_shortTotal)} due · ${_partMonths.map(m => String(m).slice(0,3)).join(', ')}</span>
       </div>` : '';
  const _monthsLabel = (tx.monthsSelected && tx.monthsSelected.length > 0)
    ? tx.monthsSelected.map(m => _partMonths.includes(m) ? `${m} (partial)` : m).join(', ')
    : `${tx.monthsDue||1} month${(tx.monthsDue||1)>1?'s':''}`;

  document.getElementById('rc_details').innerHTML = `
    <div class="r-row"><span class="r-lbl">Fee Head</span><span class="r-val">${_feeHead}</span></div>
    <div class="r-row"><span class="r-lbl">Months Paid</span><span class="r-val">${_monthsLabel}</span></div>
    ${_partialRow}
    <div class="r-row"><span class="r-lbl">Payment Mode</span><span class="r-val">${
      // JSS-REF-002 ITEM 1 FIX: render the mode-wise breakup inline when more than one mode was used.
      (Array.isArray(tx.paymentModeBreakup) && tx.paymentModeBreakup.length > 1)
        ? tx.paymentModeBreakup.map(r => `${r.mode} ₹${fmtNum(r.amount)}${r.mode==='Cheque' && r.chequeNumber ? ' (Chq# '+sanitizeHTML(r.chequeNumber)+')' : ''}`).join(' + ')
        // JSS-REF-002 ITEM 2 FIX: show the cheque number inline for a single-mode cheque payment too.
        : `${tx.paymentMode || '—'}${_getChequeNoDisplay(tx) ? ' (Chq# '+sanitizeHTML(_getChequeNoDisplay(tx))+')' : ''}`
    }</span></div>
    <div class="r-row"><span class="r-lbl">Date &amp; Time</span><span class="r-val">${(()=>{const d=tx.date?.toDate?tx.date.toDate():new Date(tx.date);return d.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})+', '+d.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});})()}</span></div>
    <div class="r-row"><span class="r-lbl">Remaining Balance</span><span class="r-val">₹${fmtNum(tx.remainingBalance)}</span></div>
    <div class="r-row"><span class="r-lbl">Status</span><span class="r-val">${_status}</span></div>
    <div class="r-row" style="font-size:11px;color:var(--muted)"><span>Amount in Words</span><span>${tx.amountInWords || '—'}</span></div>
  `;
  document.getElementById('rc_total').innerHTML = `Amount Paid: ₹${fmtNum(tx.amountPaid)}`;
  // BUG-TIME-FIX: "Recorded by" time was baked into the template at page-load time,
  // causing it to show the time the page was opened, not when payment was saved.
  // Now derived from tx.date (the actual saved Firestore timestamp).
  const _rbEl = document.getElementById('rc_recorded_by');
  if (_rbEl) {
    const _rbD = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
    const _rbDateStr = _rbD.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})
      + ', ' + _rbD.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});
    _rbEl.textContent = `Recorded by: ${currentProfile?.name||'Admin'} · ${_rbDateStr}`;
  }
}

// BUG-L02 FIX: window.print() prints the entire app page (sidebar, header, nav).
// Instead, open the receipt HTML in a clean blank window and print only that.
function printReceipt() {
  // ── Extract data from the live receiptBox DOM ──────────────────────────
  const box = document.getElementById('receiptBox');
  if (!box) { window.print(); return; }

  // Helper: pull text content of the first element matching a label
  const val = (label) => {
    const rows = box.querySelectorAll('.r-row');
    for (const row of rows) {
      const lbl = row.querySelector('.r-lbl');
      const v   = row.querySelector('.r-val');
      if (lbl && v && lbl.textContent.trim().toLowerCase().includes(label.toLowerCase())) {
        return v.textContent.trim();
      }
    }
    return '—';
  };

  const txData = {
    receiptNumber  : val('receipt'),
    studentName    : val('student'),
    admissionNo    : val('adm'),
    classSection   : val('class'),
    date           : val('date'),
    paymentMode    : val('mode'),
    paymentStatus  : val('status') || 'COMPLETED',
    feeHead        : val('fee head') || 'Academic Operational Fees',
    amountPaid     : parseFloat((val('amount paid') || '0').replace(/[^\d.]/g, '')) || 0,
    remainingBalance: parseFloat((val('remaining') || val('balance') || '0').replace(/[^\d.]/g, '')) || 0,
  };

  generateIndustryStandardReceipt(txData);
}

// Placeholder — intentionally empty block preserved to avoid breaking
// the legacy CSS injection that was here previously.
/* LEGACY_PRINT_CSS_REMOVED */
