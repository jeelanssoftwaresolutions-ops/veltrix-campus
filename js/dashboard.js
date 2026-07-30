/* ============================================================
   DASHBOARD — ADMIN
   CHG-013: All stat card counters replaced with onSnapshot()
   real-time listeners. Detached when navigating away.
   ============================================================ */
async function renderAdminDash() {
  if (!currentSchoolId) {
    setContent(`<div class="alert alert-danger" style="margin:24px">⚠ Dashboard cannot load: No school is assigned to this account. Please contact your system administrator to link a school to your login.</div>`);
    return;
  }

  // Detach any existing listeners from previous dashboard mount
  _detachDashListeners();

  // Initial recent-tx fetch (still cached to avoid unbounded read)
  // BUG-P02 FIX: Dashboard uses _dashRecentTx for display only; never sets _financeData
  // so exports always get a fresh full fetch from ensureExportData().
  let _dashRecentTx = [];
  try {
    const txSnap = await schoolCol('feeTransactions').orderBy('date','desc').limit(100).get();
    // ITEM 05.2: hidden-student payments now live in this same collection —
    // Admin must never see them, on the dashboard or anywhere else.
    _dashRecentTx = txSnap.docs.map(d=>({id:d.id,...d.data()})).filter(t => !t.isHiddenPayment);
  } catch(_) { _dashRecentTx = []; }
  const recentTx = _dashRecentTx.slice(0,8);

  setContent(`
    <div class="page-head flex-between">
      <div>
        <div class="page-title">Admin Dashboard</div>
        <div class="page-sub">Welcome back, ${currentProfile?.name||'Admin'}. Here's today's overview.</div>
      </div>
      <div class="page-actions">
        <div id="digitalClock">
          <div id="clockTime">--:--:--</div>
          <div id="clockDate">Loading…</div>
        </div>
        <button class="btn btn-primary" onclick="pushNav('addStudent',{type:'new'})">
          ${iconPlus} New Admission
        </button>
        <button class="btn btn-secondary" onclick="pushNav('recordFee')">
          ${iconFee} Record Payment
        </button>
      </div>
    </div>

    <!-- CHG-013: Real-time stat cards — values updated via onSnapshot -->
    <!-- CHG-007: All cards clickable with gold hover -->
    <div class="stats-grid">
      <div class="stat-card" style="cursor:pointer" title="View all students"
        onclick="navigate('students')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Active Students <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="sc_activeStudents">—</div>
        <div class="stat-sub">Click to view all →</div>
      </div>
      <div class="stat-card red" style="cursor:pointer" title="View terminated students"
        onclick="navigate('terminated')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Terminated <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="sc_terminated">—</div>
        <div class="stat-sub">Click to view records →</div>
      </div>
      <!-- [CHG-002] Pending Fees stat card removed from Admin dashboard — Due Fee is Principal-only per Blueprint v3.0 -->
      <!-- [CHG-002] Total Outstanding Due stat card removed — it navigated to pendingFee section, now Admin-inaccessible -->
      <div class="stat-card" style="cursor:pointer" title="View all transactions"
        onclick="navigate('finance')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Total Fee Collected <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="sc_totalCollected">—</div>
        <div class="stat-sub">Click to view finance →</div>
      </div>
      <!-- [CHG-010] Hidden Students stat card — Admin dashboard -->
      <div class="stat-card gold" style="cursor:pointer" title="View hidden student records"
        onclick="navigate('hidden')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Hidden Students <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="sc_hiddenStudents">—</div>
        <div class="stat-sub">Click to view hidden records →</div>
      </div>
    </div>

    <div class="card">
      <div class="card-hdr">
        <span class="card-title">Recent Fee Transactions</span>
        <button class="btn btn-primary" onclick="pushNav('finance')" style="padding:11px 28px;font-size:14px;font-weight:700;letter-spacing:1px;box-shadow:0 4px 18px rgba(201,168,76,0.45)"><!-- [CHG-017] View All button — fully prominent gold-primary per Blueprint v3.0 -->VIEW ALL →</button>
      </div>
      <div class="card-body" style="padding:0">
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Receipt #</th><th>Student</th><th>Class</th><th>Fee Head</th><th>Amount</th><th>Mode</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              ${recentTx.length===0?`<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted)">No transactions recorded yet.</td></tr>`:
                recentTx.map(t=>`
                <tr ${_studentRowAttrs(t)}>
                  <td class="muted">${sanitizeHTML(t.receiptNumber||'—')}</td>
                  <td>${_studentNameLink(t.studentName, t)}</td>
                  <td>${sanitizeHTML(t.classSection||'—')}</td>
                  <td>${sanitizeHTML(t.feeHead||'—')}</td>
                  <td><strong>₹${fmtNum(t.amountPaid||0)}</strong></td>
                  <td>${sanitizeHTML(t.paymentMode||'—')}</td>
                  <td>${fmtDate(t.date)}</td>
                  <td>${statusBadge(t.paymentStatus)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
  renderDigitalClock();

  // ── CHG-013: Wire up real-time onSnapshot listeners ───────────────────────
  // Helper: safe DOM update — only writes if element still in the document
  const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // 1) Active students count
  const unsubActive = schoolCol('students')
    .where('status','==','active')
    .onSnapshot(snap => { _set('sc_activeStudents', snap.size); }, err => console.warn('CHG-013 activeStudents:', err));
  window._dashListeners.push(unsubActive);

  // 2) Terminated count (derived from students collection — Admin safe)
  const unsubTerm = schoolCol('students')
    .where('status','==','terminated')
    .onSnapshot(snap => { _set('sc_terminated', snap.size); }, err => console.warn('CHG-013 terminated:', err));
  window._dashListeners.push(unsubTerm);

  // [CHG-002] sc_pendingFees listener removed — Pending Fee section removed from Admin per Blueprint v3.0
  // [CHG-002] sc_totalDue listener block removed — stat card navigated to Admin-inaccessible pendingFee section

  // [CHG-001] New Admissions stat card removed from Admin dashboard per Blueprint v3.0

  // [CHG-010] Hidden Students count — live onSnapshot listener
  const unsubHidden = schoolCol('hiddenStudents')
    .onSnapshot(snap => { _set('sc_hiddenStudents', snap.size); }, err => { _set('sc_hiddenStudents', '—'); console.warn('CHG-010 sc_hiddenStudents:', err); });
  window._dashListeners.push(unsubHidden);

  // 5) BUG-P15 FIX: Total fee collected — live sum directly from feeTransactions collection.
  //    The /stats/fees doc was never maintained so it was always stale/missing.
  //    onSnapshot here reacts to every new payment in real-time.
  const unsubFees = schoolCol('feeTransactions')
    .onSnapshot(snap => {
      // ITEM 05.2: exclude hidden-student payments — Admin total must never include them.
      // Shared definition (_txCollectedAmount) so this can never drift from Paid Fee.
      const total = snap.docs.reduce((s,d) => { const dd=d.data(); return dd.isHiddenPayment ? s : s + _txCollectedAmount(dd); }, 0);
      _set('sc_totalCollected', '₹' + fmtNum(total));
    }, err => {
      _set('sc_totalCollected', '—');
      console.warn('BUG-P15 sc_totalCollected:', err);
    });
  window._dashListeners.push(unsubFees);
}

/* ============================================================
   DASHBOARD — PRINCIPAL
   CHG-013: All stat card counters replaced with onSnapshot()
   real-time listeners. Detached when navigating away.
   ============================================================ */
async function renderPrincipalDash() {
  if (!currentSchoolId) {
    setContent(`<div class="alert alert-danger" style="margin:24px">⚠ Dashboard cannot load: No school is assigned to this account. Please contact your system administrator to link a school to your login.</div>`);
    return;
  }

  // Detach any existing listeners from previous dashboard mount
  _detachDashListeners();

  // Fetch recent transactions (cached)
  // BUG-P02 FIX: Dashboard uses _dashRecentTx for display only; never sets _financeData
  // so exports always get a fresh full fetch from ensureExportData().
  let _dashRecentTx = [];
  try {
    // Use date desc (indexed) — same as Paid Fee and all other tx queries.
    // For same-date entries (e.g. excused + payment recorded in the same session),
    // do a secondary client-side sort by createdAt so the most-recently-saved doc
    // always floats to the top, regardless of user-picked date field.
    const txSnap = await schoolCol('feeTransactions').orderBy('date','desc').limit(200).get();
    const _raw = txSnap.docs.map(d => _normalizeTx({id:d.id,...d.data()}));
    // Secondary sort: among docs with identical date-seconds, newer createdAt wins
    _raw.sort((a, b) => {
      const da = a.date?.toMillis ? a.date.toMillis() : (a.date ? new Date(a.date).getTime() : 0);
      const db = b.date?.toMillis ? b.date.toMillis() : (b.date ? new Date(b.date).getTime() : 0);
      if (db !== da) return db - da; // primary: date desc
      const ca = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const cb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return cb - ca; // secondary: createdAt desc (most recently saved on top)
    });
    _dashRecentTx = _raw;
  } catch(_) { _dashRecentTx = []; }
  const recentTx = _dashRecentTx.slice(0,10);

  // [EVICTED] pendCount / deletionRequests fetch removed — Pending Approvals section purged

  setContent(`
    <div class="page-head flex-between">
      <div>
        <div class="page-title">Principal Dashboard</div>
        <div class="page-sub">Full financial and student overview — ${new Date().toLocaleDateString('en-IN', {timeZone:IST_TZ,weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
      <div class="page-actions">
        <div id="digitalClock">
          <div id="clockTime">--:--:--</div>
          <div id="clockDate">Loading…</div>
        </div>
      </div>
    </div>

    <!-- CHG-013: Real-time stat cards with live-dot indicators — 4-panel clean layout -->
    <!-- CHG-007: All cards clickable with gold hover glow -->
    <!-- Removed: psc_totalDue, psc_pendingFees, psc_pendingApprovals, psc_accumulatedDues -->
    <!-- Due Fee data now surfaces in the stacked inline ledger card below the transactions table -->
    <div class="stats-grid">
      <div class="stat-card" style="cursor:pointer" title="View all students"
        onclick="navigate('students')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Total Students <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="psc_totalStudents">—</div>
        <div class="stat-sub" id="psc_activeSubtitle">Click to view →</div>
      </div>
      <div class="stat-card blue" style="cursor:pointer" title="View terminated students"
        onclick="navigate('terminated')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Total Terminated <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="psc_terminated">—</div>
        <div class="stat-sub">Historical records · Click to view →</div>
      </div>
      <div class="stat-card gold" style="cursor:pointer" title="View fee transactions"
        onclick="navigate('finance')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Total Collected <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="psc_totalCollected">—</div>
        <div class="stat-sub">All transactions · Click to view →</div>
      </div>
      <div class="stat-card gold" style="cursor:pointer" title="View hidden student records"
        onclick="navigate('hidden')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--warn)'" onmouseleave="this.style.boxShadow=''">
        <div class="stat-label">Hidden Students <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="psc_hiddenStudents">—</div>
        <div class="stat-sub">Confidential · Click to view →</div>
      </div>
      <!-- Point 9: Concession stat card on dashboard -->
      <div class="stat-card" style="cursor:pointer;
            background: rgba(82,200,122,0.05);
            backdrop-filter: blur(var(--glass-blur));
            -webkit-backdrop-filter: blur(var(--glass-blur));
            border: 1px solid rgba(82,200,122,0.20);
            border-left: 4px solid var(--success, #52c87a) !important;
            box-shadow: 0 8px 32px rgba(82,200,122,0.08), inset 0 1px 0 rgba(255,255,255,0.05);"
        title="Students with active fee concessions"
        onclick="navigate('concessions')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--success), 0 8px 32px rgba(82,200,122,0.18)'"
        onmouseleave="this.style.boxShadow='0 8px 32px rgba(82,200,122,0.08), inset 0 1px 0 rgba(255,255,255,0.05)'">
        <div class="stat-label" style="color:rgba(82,200,122,0.9)">Concession Students <span class="live-dot" title="Live data"></span></div>
        <div class="stat-value" id="psc_concessionCount" style="color:var(--success)">—</div>
        <div class="stat-sub" style="color:rgba(82,200,122,0.7)">Active concessions · Click to view →</div>
      </div>
      <!-- [ROLLING] Accumulated Rolling Dues — current academic year only -->
      <div class="stat-card red" style="cursor:pointer;
            background: rgba(224,82,82,0.05);
            backdrop-filter: blur(var(--glass-blur));
            -webkit-backdrop-filter: blur(var(--glass-blur));
            border: 1px solid rgba(224,82,82,0.20);
            border-left: 4px solid var(--danger, #e05252) !important;
            box-shadow: 0 8px 32px rgba(224,82,82,0.08), inset 0 1px 0 rgba(255,255,255,0.05);"
        title="Current Academic Year Dues Only — excludes previous-year carry-forward balances"
        onclick="navigate('pendingFee')"
        onmouseenter="this.style.boxShadow='0 0 0 2px var(--danger), 0 8px 32px rgba(224,82,82,0.18)'"
        onmouseleave="this.style.boxShadow='0 8px 32px rgba(224,82,82,0.08), inset 0 1px 0 rgba(255,255,255,0.05)'">
        <div class="stat-label" style="color:rgba(224,130,130,0.9)">
          Accumulated Rolling Dues <span class="live-dot" title="Live real-time ledger synced"></span>
        </div>
        <div class="stat-value" id="psc_rollingDues" style="color:#e09090">—</div>
        <div class="stat-sub" id="psc_rollingDuesSub" style="color:rgba(224,130,130,0.7)">
          Loading real-time month metrics…
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <div class="card-hdr">
        <span class="card-title">Recent 10 Transactions</span>
        <button class="btn btn-primary" onclick="pushNav('finance')" style="padding:11px 28px;font-size:14px;font-weight:700;letter-spacing:1px;box-shadow:0 4px 18px rgba(201,168,76,0.45)">VIEW ALL →</button>
      </div>
      <div class="card-body" style="padding:0">
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Receipt #</th><th>Student</th><th>Class</th><th>Fee Head</th><th>Amount</th><th>Mode</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              ${recentTx.length===0?`<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted)">No transactions yet.</td></tr>`:
                recentTx.map(t=>`
                <tr ${_studentRowAttrs(t)}>
                  <td class="muted">${sanitizeHTML(t.receiptNumber||'—')}</td>
                  <td>${_studentNameLink(t.studentName, t)}</td>
                  <td>${sanitizeHTML(t.classSection||'—')}</td>
                  <td>${sanitizeHTML(t.feeHead||'—')}</td>
                  <td><strong>₹${fmtNum(t.amountPaid||0)}</strong></td>
                  <td>${sanitizeHTML(t.paymentMode||'—')}</td>
                  <td>${fmtDate(t.date)}</td>
                  <td>${statusBadge(t.paymentStatus)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── INLINE DUE FEE LEDGER moved to Due Fee module (Point 5) ── -->
  `);
  renderDigitalClock();

  // ── CHG-013: Wire up Principal real-time listeners ────────────────────────
  const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // 1) Total active students + sub-label — BUG-P15 FIX: listen only to active students
  //    so the main KPI card shows the real active count, not including terminated.
  const unsubAllStudents = schoolCol('students')
    .where('status','==','active')
    .onSnapshot(snap => {
      _set('psc_totalStudents', snap.size);
      _set('psc_activeSubtitle', `${snap.size} active · Click to view →`);
    }, err => console.warn('BUG-P15 psc_totalStudents:', err));
  window._dashListeners.push(unsubAllStudents);

  // 2) Terminated students (from terminatedStudents collection — principal has access)
  const unsubTerm = schoolCol('terminatedStudents')
    .onSnapshot(snap => { _set('psc_terminated', snap.size); },
    err => console.warn('CHG-013 psc_terminated:', err));
  window._dashListeners.push(unsubTerm);

  // 3) BUG-P15 FIX: Total collected — live sum directly from feeTransactions.
  //    The /stats/fees doc was never maintained so it was always stale/missing.
  const unsubFees = schoolCol('feeTransactions')
    .onSnapshot(snap => {
      // Shared definition. Principal intentionally INCLUDES hidden-student payments —
      // Principal is the confidential-access tier and must see the complete picture.
      const total = snap.docs.reduce((s,d) => s + _txCollectedAmount(d.data()), 0);
      _set('psc_totalCollected', '₹' + fmtNum(total));
    }, err => {
      _set('psc_totalCollected', '—');
      console.warn('BUG-P15 psc_totalCollected:', err);
    });
  window._dashListeners.push(unsubFees);

  // ── RECONFIGURED DUE RECOMPUTE ENGINE ────────────────────────────────────
  // Targets inline_psc_totalDue + inline_psc_pendingFeesCount (stacked ledger card).
  // Removed: _psc_termSnap (terminated no longer folded in), CHG-018 psc_pendingFees card,
  //          psc_pendingApprovals listener — all evicted with the old stats-grid cards.
  let _psc_txSnap  = null;
  let _psc_stuSnap = null;

  function _psc_recomputeTotalDue() {
    if (!_psc_stuSnap) return;
    try {
      // ── EXACT MIRROR of renderPendingFee() balance logic ─────────────────────
      // Step 1: build latest remainingBalance per student from transactions
      // (sort by date desc, isDuePayment wins ties — identical to renderPendingFee)
      const balMap = {};
      if (_psc_txSnap) {
        const txsByStudent = {};
        _psc_txSnap.docs.forEach(d => {
          const tx = d.data();
          if (!tx.studentId) return;
          if (!txsByStudent[tx.studentId]) txsByStudent[tx.studentId] = [];
          txsByStudent[tx.studentId].push(tx);
        });
        Object.entries(txsByStudent).forEach(([sid, txs]) => {
          txs.sort((a, b) => {
            const diff = (b.date?.seconds || 0) - (a.date?.seconds || 0);
            if (diff !== 0) return diff;
            if (a.isDuePayment && !b.isDuePayment) return -1;
            if (!a.isDuePayment && b.isDuePayment) return 1;
            return 0;
          });
          balMap[sid] = { balance: txs[0].remainingBalance ?? 0, found: true };
        });
      }

      // Step 2: accumulate active students with dues — NO outstandingBalance fallback
      // for students who have at least one transaction; use doc balance only when
      // truly no transaction exists. This matches renderPendingFee exactly.
      let aggregateDueSum               = 0;
      let targetDelinquentAccountsCount = 0;

      _psc_stuSnap.docs.forEach(d => {
        const s   = d.data();
        const sid = d.id;
        // JSS-REF-VELTRIX-2026-005 ITEM 1: hidden students must not contribute to any dues total.
        // moveStudentToHidden() only sets status:'hidden' and LEAVES the doc in /students, so every
        // aggregate has to exclude it explicitly — same guard Due Fee already uses (pending-fee.js).
        if (s.status === 'terminated' || s.status === 'hidden') return;
        const bal = balMap[sid];
        const outstanding = bal?.found ? bal.balance : (s.outstandingBalance || 0);
        if (outstanding > 0) {
          aggregateDueSum += outstanding;
          targetDelinquentAccountsCount++;
        }
      });

      // Inject into stacked inline Due Fee Ledger card
      const dueAmountNode = document.getElementById('inline_psc_totalDue');
      const dueCountNode  = document.getElementById('inline_psc_pendingFeesCount');
      if (dueAmountNode) dueAmountNode.textContent = '₹' + fmtNum(aggregateDueSum);
      if (dueCountNode)  dueCountNode.textContent  = `${targetDelinquentAccountsCount} Account${targetDelinquentAccountsCount!==1?'s':''} Outstanding`;

    } catch(e) {
      console.warn('[Recompute] Stacked Dues Section error:', e);
    }
  }

  const unsubTotalDueTx = schoolCol('feeTransactions').onSnapshot(snap => {
    _psc_txSnap = snap; _psc_recomputeTotalDue();
  }, err => console.warn('[Recompute] feeTransactions sync warning:', err));
  window._dashListeners.push(unsubTotalDueTx);

  const unsubTotalDueStu = schoolCol('students').onSnapshot(snap => {
    _psc_stuSnap = snap; _psc_recomputeTotalDue();
  }, err => console.warn('[Recompute] students sync warning:', err));
  window._dashListeners.push(unsubTotalDueStu);
  // ── [END RECONFIGURED DUE RECOMPUTE ENGINE] ──────────────────────────────

  // [CHG-010] Hidden Students count — Principal dashboard live listener
  const unsubHiddenP = schoolCol('hiddenStudents')
    .onSnapshot(snap => { _set('psc_hiddenStudents', snap.size); }, err => { _set('psc_hiddenStudents', '—'); console.warn('CHG-010 psc_hiddenStudents:', err); });
  window._dashListeners.push(unsubHiddenP);

  // [Point 9] Concession Students count — live listener
  const unsubConcession = schoolCol('concessionFees')
    .onSnapshot(snap => { _set('psc_concessionCount', snap.size); }, err => { _set('psc_concessionCount', '—'); console.warn('psc_concessionCount:', err); });
  window._dashListeners.push(unsubConcession);

  // [CHG-ACC] Accumulated Dues — live dual-listener on feeTransactions + students.
  // Recomputes whenever either collection changes. Unsubscribed via _dashListeners on nav away.
  let _acc_txSnap  = null;
  let _acc_stuSnap = null;

  async function _acc_recompute() {
    if (!_acc_txSnap || !_acc_stuSnap) return;
    try {
      const now             = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
      const currentYear     = now.getFullYear();
      const currentMonthIdx = now.getMonth();   // 0=Jan … 11=Dec
      const monthNames      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

      // Build per-student latest-qualifying-transaction balance map
      // "Qualifying" = transaction date is in a year < current year,
      //                OR same year AND month index ≤ currentMonthIdx
      const txsByStudent = {};
      _acc_txSnap.docs.forEach(d => {
        const tx  = d.data();
        const sid = tx.studentId;
        if (!sid) return;

        // Date guard — resolve Firestore Timestamp or plain JS Date
        let txDate = null;
        if (tx.date && typeof tx.date.toDate === 'function') {
          txDate = tx.date.toDate();
        } else if (tx.date instanceof Date) {
          txDate = tx.date;
        } else if (tx.date?.seconds) {
          txDate = new Date(tx.date.seconds * 1000);
        }
        if (!txDate) return; // skip undated transactions

        const txYear  = txDate.getFullYear();
        const txMonth = txDate.getMonth();

        // CHG-ACC filter: only include months up to and including current calendar month
        const qualifies =
          txYear < currentYear ||
          (txYear === currentYear && txMonth <= currentMonthIdx);
        if (!qualifies) return;

        if (!txsByStudent[sid]) txsByStudent[sid] = [];
        txsByStudent[sid].push({ ...tx, _txDate: txDate });
      });

      // Pick latest-date tx per student (isDuePayment wins on ties — same as _psc_recomputeTotalDue)
      const accBalMap = {};
      Object.entries(txsByStudent).forEach(([sid, txs]) => {
        txs.sort((a, b) => {
          const diff = b._txDate - a._txDate;
          if (diff !== 0) return diff;
          if (a.isDuePayment && !b.isDuePayment) return -1;
          if (!a.isDuePayment && b.isDuePayment) return 1;
          return 0;
        });
        const bal = txs[0].remainingBalance ?? 0;
        if (bal > 0) accBalMap[sid] = bal;
      });

      // Accumulate from active students
      let totalAccDues = 0;
      _acc_stuSnap.docs.forEach(d => {
        const s = d.data();
        // JSS-REF-VELTRIX-2026-005 ITEM 1: hidden students must not contribute to any dues total.
        // moveStudentToHidden() only sets status:'hidden' and LEAVES the doc in /students, so every
        // aggregate has to exclude it explicitly — same guard Due Fee already uses (pending-fee.js).
        if (s.status === 'terminated' || s.status === 'hidden') return;
        // If a qualifying transaction exists — use it; else fall back to student doc balance
        const bal = d.id in accBalMap
          ? accBalMap[d.id]
          : (s.outstandingBalance || 0);
        if (bal > 0) totalAccDues += bal;
      });

      // Also pull terminated students with dues (fire-and-forget, best-effort)
      try {
        const termSnap = await schoolCol('terminatedStudents').get();
        termSnap.docs.forEach(d => {
          const outstanding = d.data().outstandingBalance || 0;
          if (outstanding > 0) totalAccDues += outstanding;
        });
      } catch (_) { /* Admin may not have access — silently skip */ }

      // Format ₹ in Indian locale
      const formatted = new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
      }).format(totalAccDues);

      // DOM updates
      const valEl = document.getElementById('psc_accumulatedDues');
      const subEl = document.getElementById('psc_accumulatedDuesSub');
      if (valEl) valEl.textContent = formatted;
      if (subEl) subEl.textContent = `All dues ≤ ${monthNames[currentMonthIdx]} ${currentYear} · Click to view →`;

      // Expose for external sync (e.g. chart or reports)
      window._accumulatedDuesTotal = totalAccDues;

    } catch (err) {
      console.error('[CHG-ACC] calculateAccumulatedDues error:', err);
      const valEl = document.getElementById('psc_accumulatedDues');
      if (valEl) valEl.textContent = '₹ Err';
    }
  }

  const unsubAccTx = schoolCol('feeTransactions').onSnapshot(snap => {
    _acc_txSnap = snap; _acc_recompute();
  }, err => { console.warn('[CHG-ACC] feeTransactions listener:', err); });
  window._dashListeners.push(unsubAccTx);

  const unsubAccStu = schoolCol('students').onSnapshot(snap => {
    _acc_stuSnap = snap; _acc_recompute();
  }, err => { console.warn('[CHG-ACC] students listener:', err); });
  window._dashListeners.push(unsubAccStu);

  // ── [ROLLING] Cumulative Rolling Due Integration ───────────────────────────
  // Admission-date gated: rolls previous months' outstanding into the current cycle.
  // Key distinction from CHG-ACC: filters on student.admissionDate/createdAt (when the student
  // JOINED), not on transaction date (when money last moved). Catches students enrolled in
  // prior months whose dues rolled forward even if they've never made a single payment.
  let _rolling_txSnap  = null;
  let _rolling_stuSnap = null;

  function _executeRollingDuesRecompute() {
    if (!_rolling_stuSnap) return;
    try {
      // ── EXACT MIRROR of renderPendingFee() — current-year slice only ─────────
      // Uses the same balance-map logic and _classifyDueYear classifier so this
      // card always matches the "Current Year Dues" stat card on the Due Fee page.
      //
      // JSS-REF-002 ITEM 4 FIX — ACCUMULATED ROLLING DUES NOT REFLECTING CURRENT YEAR:
      // Despite the comment above claiming an "exact mirror" of renderPendingFee(),
      // this function was actually summing each student's latest transaction
      // `remainingBalance` (or the stale `outstandingBalance` doc field) — a totally
      // different formula from what the Due Fee page's Current Year Dues figure
      // actually uses (monthlyRate × 12 − amount paid this academic year, per
      // VLX-REF-006). Those two numbers only matched by coincidence. This card now
      // computes outstanding the same way renderPendingFee's activePending does:
      // full annual fee minus what's actually been paid THIS academic year — so it
      // is a true mirror, not just a comment claiming to be one.
      const feeSchedule = getFeeSchedule();
      const curYearStrRolling = _getCurrentAcademicYearStr();
      const normCurYearRolling = _normaliseAcademicYear(curYearStrRolling);

      const txsByStudent = {};
      if (_rolling_txSnap) {
        _rolling_txSnap.docs.forEach(d => {
          const tx = d.data();
          if (!tx.studentId) return;
          if (!txsByStudent[tx.studentId]) txsByStudent[tx.studentId] = [];
          txsByStudent[tx.studentId].push(tx);
        });
      }

      // Step 2: build pending entries for active students using the fee×12−paid formula.
      let dynamicAccumulatedDuesSum = 0;
      let totalOverdueStudentsCount = 0;

      _rolling_stuSnap.docs.forEach(d => {
        // JSS-REF-017 FIX: renderPendingFee() (Due Fee page) normalizes every
        // student through _fixStudentFeeRates() before computing outstanding
        // dues — this card was skipping that step, so its fallback balance
        // (used when a class has no fee-schedule rate) could disagree with
        // the Due Fee page's number for the same student. Same normalization
        // now applied here so both cards always agree.
        const s   = _fixStudentFeeRates(d.data());
        const sid = d.id;
        // JSS-REF-VELTRIX-2026-005 ITEM 1: hidden students must not contribute to any dues total.
        // moveStudentToHidden() only sets status:'hidden' and LEAVES the doc in /students, so every
        // aggregate has to exclude it explicitly — same guard Due Fee already uses (pending-fee.js).
        if (s.status === 'terminated' || s.status === 'hidden') return;

        const txs = txsByStudent[sid] || [];
        const monthlyRate   = feeSchedule[s.class] || s.monthlyFee || 0;
        const fullAnnualFee = monthlyRate * 12;
        const paidThisYear  = txs
          .filter(t => _normaliseAcademicYear(t.academicYear || '') === normCurYearRolling || !t.academicYear)
          .reduce((sum, t) => sum + (t.amountPaid || 0), 0);

        let outstanding;
        if (monthlyRate) {
          outstanding = Math.max(0, fullAnnualFee - paidThisYear);
        } else {
          // No fee-schedule rate for this class — fall back to the latest known balance.
          const txsSorted = [...txs].sort((a, b) => {
            const diff = (b.date?.seconds || 0) - (a.date?.seconds || 0);
            if (diff !== 0) return diff;
            if (a.isDuePayment && !b.isDuePayment) return -1;
            if (!a.isDuePayment && b.isDuePayment) return 1;
            return 0;
          });
          outstanding = txsSorted.length ? Math.max(0, txsSorted[0].remainingBalance ?? 0) : Math.max(0, s.outstandingBalance || 0);
        }

        if (outstanding > 0) {
          dynamicAccumulatedDuesSum += outstanding;
          totalOverdueStudentsCount++;
        }
      });

      // Format in Indian locale
      const formattedCurrency = new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
      }).format(dynamicAccumulatedDuesSum);

      const acYear = _getAcademicYear();
      const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const currentMonthIdx = nowIST().getMonth();

      const kpiValueNode   = document.getElementById('psc_rollingDues');
      const kpiSubtextNode = document.getElementById('psc_rollingDuesSub');
      if (kpiValueNode)   kpiValueNode.textContent   = formattedCurrency;
      if (kpiSubtextNode) kpiSubtextNode.textContent =
        `${totalOverdueStudentsCount} student${totalOverdueStudentsCount!==1?'s':''} · ${acYear.label} dues up to ${shortMonths[currentMonthIdx]} →`;

      window._rollingDuesTotal = dynamicAccumulatedDuesSum;

    } catch (e) {
      console.error('[ROLLING] Dues recompute error:', e);
      const kpiValueNode = document.getElementById('psc_rollingDues');
      if (kpiValueNode) kpiValueNode.textContent = '₹ Err';
    }
  }

  const unsubRollingTx = schoolCol('feeTransactions').onSnapshot(snap => {
    _rolling_txSnap = snap; _executeRollingDuesRecompute();
  }, err => console.warn('[ROLLING] feeTransactions listener:', err));
  window._dashListeners.push(unsubRollingTx);

  const unsubRollingStu = schoolCol('students').onSnapshot(snap => {
    _rolling_stuSnap = snap; _executeRollingDuesRecompute();
  }, err => console.warn('[ROLLING] students listener:', err));
  window._dashListeners.push(unsubRollingStu);
  // ── [END ROLLING] Cumulative Rolling Due Integration ──────────────────────
}

/* ============================================================
   P-J #02 #03 #04 — DASHBOARD ANALYTICS PANELS
   #02 Admission Analytics · #03 Terminated Analytics · #04 Fee Collection Analytics
   • Slide-in side panel with time-range filters + month/year selectors
   • Chart (bar) renders first — PDF/XLSX export buttons activate only after animation completes
   • Fee Collection excludes Hidden section data (hiddenFeeTransactions not included)
   • Real-time filter updates without closing the panel
   ============================================================ */


