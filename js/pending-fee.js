/* ============================================================
   PHASE 12 — PENDING FEE SECTION (#11)
   • All active students with outstanding balance (remainingBalance > 0)
   • Terminated students with outstanding balance
   • Block / Class / Section / Time-range filters (session-persistent)
   • Chart rendered BEFORE export buttons activate (visualisation-first)
   • PDF + XLSX export — block name in header + every row
   • Admin: sees active + terminated (own block) — same data as Principal
     EXCEPT Hidden section dues require Principal-password unlock
     (Hidden section collection is /hiddenStudents/ — out of scope until
      Phase 9 Hidden Section feature is built; gate is ready for wiring)
   ============================================================ */

// Session-persistent filter state for Due Fee  // [CHG-009]
// ARC-012: Separate filter states for each sub-section
let _pfFilters     = { block:'', cls:'', sections:[], range:'all', dateFrom:'', dateTo:'', search:'' }; // Current Year
let _pfPrevFilters = { block:'', cls:'', sections:[], range:'all', dateFrom:'', dateTo:'', search:'' }; // Previous Year
let _pfHiddenUnlocked = false; // set true when Admin enters Principal password on this page
let _pfActiveTab   = 'current'; // ARC-012: track which sub-section tab is active

// ARC-012: Academic year helper
function _getAcademicYear() {
  const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  const yearStart = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const yearEnd   = yearStart + 1;
  return { yearStart, yearEnd, label: yearStart + '\u2013' + yearEnd };
}

// Returns the current academic year as a compact short string e.g. "2025-26".
// Matches the short format students type when importing (2024-25, 2025-26).
// ARC-FIX: Changed from "2025-2026" to "2025-26" to match stored academicYear values.
function _getCurrentAcademicYearStr() {
  const { yearStart, yearEnd } = _getAcademicYear();
  const shortEnd = String(yearEnd).slice(2); // "2026" → "26"
  return yearStart + '-' + shortEnd;         // "2025-26"
}

// ✦ POINT 2: DYNAMIC YEAR FETCHER — replaces all hardcoded year loops
// Scans Firestore data to build the year list from actual records only
async function getDynamicAcademicYears() {
  if (window._cachedDynamicYears && window._cachedDynamicYears.length > 0) {
    return window._cachedDynamicYears;
  }
  const yearsSet = new Set();
  try {
    const studentSnap = await schoolCol('students').get();
    studentSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.academicYear) yearsSet.add(_normaliseAcademicYear(d.academicYear.trim()));
      if (d.openingOutstandingYear) yearsSet.add(_normaliseAcademicYear(d.openingOutstandingYear.trim()));
    });
    const txSnap = await schoolCol('feeTransactions').get();
    txSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.academicYear) yearsSet.add(_normaliseAcademicYear(d.academicYear.trim()));
    });
  } catch (err) {
    console.warn('getDynamicAcademicYears: failed to fetch:', err);
  }
  // Sort descending: "2025-26" > "2024-25"
  window._cachedDynamicYears = Array.from(yearsSet).filter(Boolean).sort((a, b) => b.localeCompare(a));
  return window._cachedDynamicYears;
}

// ✦ POINT 2: DROP-IN YEAR DROPDOWN POPULATOR
async function populateYearDropdown(selectElementId, activeSelection = '') {
  const yearSel = document.getElementById(selectElementId);
  if (!yearSel) return;
  const dynamicYears = await getDynamicAcademicYears();
  yearSel.innerHTML = '<option value="">— select year —</option>';
  dynamicYears.forEach(year => {
    const opt = document.createElement('option');
    opt.value = year;
    opt.textContent = year;
    if (year === activeSelection) opt.selected = true;
    yearSel.appendChild(opt);
  });
}

// Normalise any academicYear string to short format "YYYY-YY" for reliable comparison.
// Accepts: "2025-26", "2025-2026", "2025–2026", "2025–26" → "2025-26"
function _normaliseAcademicYear(ay) {
  if (!ay) return '';
  const s = String(ay).trim().replace(/–|—/g, '-'); // en-dash/em-dash → hyphen
  const m = s.match(/^(\d{4})-(\d{2,4})$/);
  if (!m) return s;
  const shortEnd = m[2].length === 4 ? m[2].slice(2) : m[2];
  return m[1] + '-' + shortEnd;
}

// ════════════════════════════════════════════════════════════════
// ITEM-10 FIX — ROOT CAUSE: CROSS-MODULE SYNCHRONIZATION LAYER
// ════════════════════════════════════════════════════════════════
// Shared, single-definition resolver for "what class was this student in during
// academic year X". Previously each module (Record Previous Year Dues, Student
// Profile, Due Fee) computed this independently with slightly different logic —
// which is exactly the kind of drift that produced Item 9(a) and similar bugs.
// Every module should call THIS function rather than re-deriving it locally.
function _resolveClassForYear(s, selectedYear) {
  const currentCls = s.class || s.cls || '';
  if (!selectedYear) return s.openingOutstandingClass || currentCls;

  const selYearNorm = _normaliseAcademicYear(selectedYear);
  if (s.openingOutstandingClass && s.openingOutstandingYear &&
      _normaliseAcademicYear(s.openingOutstandingYear) === selYearNorm) {
    return s.openingOutstandingClass;
  }
  if (s.classPrev && s.previousAcademicYear &&
      _normaliseAcademicYear(s.previousAcademicYear) === selYearNorm) {
    return s.classPrev;
  }
  // BUG-CLS-REPEAT FIX: multi-year manual onboarding stores its OWN class per
  // year inside openingOutstandingDues[] (see Due Fee page, which reads
  // d.class directly and is correct). Check that FIRST — before falling back
  // to naive backward-classList arithmetic below, which assumes the student
  // was promoted exactly one class every year and gives the wrong class for
  // any student who repeated / stayed back in the same class.
  if (Array.isArray(s.openingOutstandingDues)) {
    const _arrClsEntry = s.openingOutstandingDues.find(
      d => d.class && _normaliseAcademicYear(d.year || '') === selYearNorm
    );
    if (_arrClsEntry) return _arrClsEntry.class;
  }

  const classList = getClassList();
  const idx = classList.indexOf(currentCls);
  if (idx < 0) return currentCls;

  const _startYr = ay => { const m = String(ay || '').match(/^(\d{4})/); return m ? parseInt(m[1], 10) : NaN; };
  const curStart = _startYr(_getCurrentAcademicYearStr());
  const selStart = _startYr(selYearNorm);
  const yearsBack = (!isNaN(curStart) && !isNaN(selStart)) ? (curStart - selStart) : 1;

  if (yearsBack <= 0) return currentCls;
  const targetIdx = idx - yearsBack;
  return classList[Math.max(0, targetIdx)] || currentCls;
}

const _fullToShortSync = {June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec',January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May'};

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-004 — CANONICAL feeLedger MODEL (single source of truth)
// Replaces the fragile four-field per-year grid tangle (monthStatus /
// previousYearMonthStatus / prevYearMonthStatus / openingOutstandingDues[]) that was
// routed by a drift-prone academicYear and mutated read-modify-write by every recompute
// — the root cause of the recurring paid/due inversion and grid⇄outstanding desync.
//
//   s.feeLedger = {
//     "<AY>": {
//       class:      "<class that year>",
//       monthlyFee: <number>,
//       base: { Jun:'PAID'|'DUE'|'EXCUSED'|'PARTIAL', ... }   // IMMUTABLE onboarding baseline
//     }, ...
//   }
//
// PRINCIPLE: `base` is written ONCE (import / onboarding / migration) and NEVER mutated
// by recompute. Live status is DERIVED fresh from base + the transaction ledger every
// time, so read-modify-write corruption can no longer accumulate.
// ════════════════════════════════════════════════════════════════════════════
const _FL_MONTHS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
const _FL_S2F = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};
const _FL_F2S = {June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec',January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May'};
function _flShort(m){ return _FL_F2S[m] || m; }

// ── ROLLOUT FLAG ──────────────────────────────────────────────────────────────
// dualWrite : build + persist feeLedger + shadow report alongside the (unchanged)
//             authoritative legacy fields.
// shadowCompare : record old-model vs new-model per-year outstanding diffs.
// read : when TRUE, consumers switch to reading feeLedger. STAYS FALSE until the
//        shadow-compare is clean across a full billing cycle. No read path may key
//        off feeLedger while this is false — every repointed consumer must gate on it.
const FEATURE_FEELEDGER = { dualWrite: true, shadowCompare: true,
  // read is PER-SURFACE (hybrid rollout): flip a surface true only after its contract
  // tests pass. recordPayment is on because the reopen-partial netting is contract-tested
  // and only affects months that carry a partial allocation (no effect on any other data).
  read: { recordPayment: true, profile: false, pastDue: false, dueFee: false, receipts: false } };

// dueForMonth = rate − alreadyApplied — quotes a reopened PARTIAL month's remainder, not the
// flat rate. Pure + contract-tested (record_payment_quote_reopen_partial_is_100).
function _flRecordPaymentMonthQuote(rate, appliedThisMonth) {
  return Math.max(0, (Number(rate) || 0) - (Number(appliedThisMonth) || 0));
}

// PAYABLE TOTAL for a set of months — the ONE function used by BOTH the Record Payment quote
// (calcLockedFee) and the save path (saveFeePayment), so the amount displayed and the amount
// RECORDED can never disagree. Nets a reopened PARTIAL month to its remainder when the flag
// is on. (Regression this closes: the quote showed ₹200 while the tx saved — and the receipt
// therefore printed — the flat ₹1,800.)
function _flPayableForMonths(months, rateForMonth, appliedByMonth) {
  const on = FEATURE_FEELEDGER.read && FEATURE_FEELEDGER.read.recordPayment;
  return (months || []).reduce((sum, m) => {
    const r = Number(rateForMonth(m)) || 0;
    return sum + (on ? _flRecordPaymentMonthQuote(r, (appliedByMonth && appliedByMonth[m]) || 0) : r);
  }, 0);
}

// BUG 2 (past-due balance drift): a prior-year openingOutstandingDues[] entry's LIVE
// outstanding, derived from its monthStatus grid — never the stored `amount` scalar (which
// _pastDueSave decrements only in the grid, leaving `amount` stale, so trusting it re-inflated
// the balance to its onboarding value on every payment/view). Falls back to `entry.amount` only
// when the entry carries no grid at all. Single source of truth for the Record-Previous-Year-Dues
// banner (icons.js Source 3/4).
//   DUE month      → full rate
//   PARTIAL month  → its REMAINDER (rate − amount already applied), read from entry.monthShortage
//                    which _syncStudentFinancials writes alongside the 'PARTIAL' status; if that
//                    shortfall is somehow missing, fall back to the full rate so a partial month is
//                    never silently dropped to 0. (Foundation for past-due partial payments — until
//                    partials exist in prior-year grids this branch never fires, so behaviour for
//                    all existing DUE/N-A-PAID grids is byte-identical to the c04b59e expression.)
//   N/A-PAID / PAID / EXCUSED → 0
function _flOpeningDuesOutstanding(entry, rate) {
  const grid = (entry && entry.monthStatus) || {};
  const keys = Object.keys(grid);
  if (keys.length === 0) return (entry && entry.amount) || 0;   // no grid at all → scalar fallback
  const r = Number(rate) || 0;
  const shortByMonth = (entry && entry.monthShortage) || {};
  let out = 0;
  keys.forEach(m => {
    const st = (grid[m] || '').toUpperCase();
    if (st === 'DUE') {
      out += r;
    } else if (st === 'PARTIAL') {
      const sh = Number(shortByMonth[m] != null ? shortByMonth[m] : shortByMonth[_FL_S2F[m]]);
      out += (Number.isFinite(sh) && sh > 0) ? Math.min(sh, r) : r;
    }
  });
  return out;
}

// Partial-shortfall map for a prior year, derived LIVE from the tx allocation ledger — no stored
// field. For each PARTIAL month in `grid`, shortfall = rate − (amount applied to that month across
// `yearTxs`, via monthAllocations). Feeds _flOpeningDuesOutstanding so the past-due banner's
// top-level-grid sources (Source 1/2/4 — the academicYear / previousYearMonthStatus /
// prevYearMonthStatus paths, which carry NO stored monthShortage) can still count a partial
// month's remainder. Keyed by short month, matching the grid keys _flOpeningDuesOutstanding reads.
function _flPartialShortFromTxs(grid, yearTxs, rate) {
  const applied = {};
  (yearTxs || []).forEach(t => {
    if (t.type === 'excused_waiver' || !t.monthAllocations || typeof t.monthAllocations !== 'object') return;
    Object.entries(t.monthAllocations).forEach(([m, amt]) => {
      const sm = _flShort(m); applied[sm] = (applied[sm] || 0) + (Number(amt) || 0);
    });
  });
  const out = {};
  Object.keys(grid || {}).forEach(m => {
    if ((grid[m] || '').toUpperCase() === 'PARTIAL') {
      const sm = _flShort(m);
      out[sm] = Math.max(0, (Number(rate) || 0) - (applied[sm] || 0));
    }
  });
  return out;
}

// BUG 1 (partial-payment rate resolution): resolve the class-rate `info` for the save
// path — classSection first, then the student's stored class — the SAME resolution the
// full-payment lockedAmount path uses, so partial and full can never diverge on the rate.
// Pure; the Firestore fetch that supplies `docClass` stays at the call site.
function _flResolveClassInfo(cs, docClass, getRate) {
  let info = cs ? getRate(cs) : null;
  if (!info && docClass) info = getRate(`${docClass}`);
  return info || null;
}

// BUG 1 ROOT (partial reopen for New-Admission / Bulk-Admit students): given the current-AY
// tx allocation ledger (amount applied per month, dual-keyed short+full) and a per-month rate
// resolver, return the months that are PARTIAL — a non-zero allocation strictly less than that
// month's full rate. Derived from the LEDGER (the source Profile/Due Fee already read), NOT the
// academicYear-gated monthStatus grid, so it is correct for every creation path. Result is
// dual-keyed (full AND short) so a caller can delete by either key. Used by Record Payment's
// reopen de-lock (record-payment.js) to keep a partial month selectable.
function _flPartialMonthsFromLedger(appliedByMonth, rateForMonth) {
  const A = appliedByMonth || {};
  const partial = new Set();
  _FL_MONTHS.forEach(shortM => {
    const fullM = _FL_S2F[shortM];
    const a = Number(A[fullM] != null ? A[fullM] : A[shortM]) || 0;
    if (a <= 0) return;                       // untouched — not partial
    const rate = Number(rateForMonth(fullM)) || 0;
    if (rate > 0 && a < rate) { partial.add(fullM); partial.add(shortM); }  // 0 < applied < rate → PARTIAL
  });
  return partial;
}

// SHARED CLOSED-MONTH GUARD (pure, contract-tested). Returns { 'YYYY-MM': 'PAID'|'EXCUSED' }
// for every CURRENT-AY month already settled, across all THREE entry points:
//   1. Record Payment  → txs (legacy monthsSelected, or monthAllocations reaching the rate)
//   2. Excel import    → s.monthStatus N/A-PAID / PAID / EXCUSED
//   3. Existing-Student enrollment → s.currentYearPaidMonths (paid AT enrolment)
// A month listed here is CLOSED: it must never be selectable for a concession. An OPEN
// partial (money applied but below the rate) is deliberately NOT closed — it still owes.
function _flClosedMonthsForAY(txs, s, rate, curYrNorm, yearStart, yearEnd) {
  const S2F  = _FL_S2F;
  const N2MM = {January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12'};
  const paid = new Set(), excused = new Set(), applied = {};
  (txs || []).forEach(d => {
    if (_normaliseAcademicYear(d.academicYear) !== curYrNorm) return;
    if (d.type === 'excused_waiver') {
      (d.monthsExcused  || []).forEach(m => excused.add(S2F[m] || m));
      (d.monthsSelected || []).forEach(m => excused.add(S2F[m] || m));
      return;
    }
    if (d.monthAllocations && typeof d.monthAllocations === 'object') {
      Object.entries(d.monthAllocations).forEach(([m, amt]) => {
        const f = S2F[m] || m; applied[f] = (applied[f] || 0) + (Number(amt) || 0);
      });
    } else if (Array.isArray(d.monthsSelected)) {
      d.monthsSelected.forEach(m => paid.add(S2F[m] || m));   // legacy tx = fully paid
    }
  });
  Object.entries(applied).forEach(([f, amt]) => { if (rate > 0 && amt >= rate) paid.add(f); });

  const sy = _normaliseAcademicYear((s && s.academicYear) || '');
  if ((!sy || sy === curYrNorm) && s && s.monthStatus && typeof s.monthStatus === 'object') {
    Object.entries(s.monthStatus).forEach(([m, st]) => {
      const f = S2F[m] || m;
      if (st === 'N/A-PAID' || st === 'PAID') paid.add(f);
      else if (st === 'EXCUSED') excused.add(f);
    });
  }
  if (s && Array.isArray(s.currentYearPaidMonths) &&
      (!s.currentYearDueYear || _normaliseAcademicYear(s.currentYearDueYear) === curYrNorm)) {
    s.currentYearPaidMonths.forEach(m => paid.add(S2F[m] || m));
  }

  const out = {};
  const mark = (f, reason) => { const mm = N2MM[f]; if (mm) out[(parseInt(mm,10) >= 6 ? yearStart : yearEnd) + '-' + mm] = reason; };
  excused.forEach(f => mark(f, 'EXCUSED'));
  paid.forEach(f => { if (!excused.has(f)) mark(f, 'PAID'); });
  return out;
}

// Build one year's IMMUTABLE baseline from a legacy grid, with a corruption guard:
// when a reliable paid COUNT is supplied and the grid's paid total disagrees (the
// read-modify-write corruption signature, e.g. a grid gone all-PAID while the count
// says 7), fall back to "first N months paid" — students pay from the start of the
// academic year. Any EXCUSED/PARTIAL base month means the grid is genuinely mixed, so
// the count fallback is disabled and the grid is trusted as-is.
function _flBaseFromGrid(grid, paidCount) {
  const base = {};
  let gridPaid = 0, hasMixed = false;
  _FL_MONTHS.forEach(m => {
    const raw = (grid && (grid[m] || grid[_FL_S2F[m]]) || '').toString().toUpperCase();
    if (raw === 'EXCUSED')      { base[m] = 'EXCUSED'; hasMixed = true; }
    else if (raw === 'PARTIAL') { base[m] = 'PARTIAL'; hasMixed = true; }
    else if (raw === 'N/A-PAID' || raw === 'PAID') { base[m] = 'PAID'; gridPaid++; }
    else base[m] = 'DUE';
  });
  if (typeof paidCount === 'number' && paidCount >= 0 && paidCount <= 12 && !hasMixed && gridPaid !== paidCount) {
    _FL_MONTHS.forEach((m, i) => { base[m] = i < paidCount ? 'PAID' : 'DUE'; });
  }
  return base;
}

// MIGRATION: fold the legacy per-year fields into feeLedger, keyed by NORMALISED year.
// Idempotent — an already-present year is never overwritten (baseline is immutable).
// Returns a NEW ledger object; does not mutate `s`.
function _buildFeeLedgerFromLegacy(s) {
  const norm = _normaliseAcademicYear;
  const ledger = (s.feeLedger && typeof s.feeLedger === 'object') ? { ...s.feeLedger } : {};
  const add = (yr, cls, fee, grid, count) => {
    const y = norm(yr); if (!y || ledger[y]) return;
    ledger[y] = { class: cls || '', monthlyFee: Number(fee) || 0, base: _flBaseFromGrid(grid, count) };
  };
  // studentDocYear (monthStatus); monthsPaidBeforePromotion/monthsCleared = its reliable paid count.
  add(s.academicYear, s.class, s.monthlyFee, s.monthStatus,
      (typeof s.monthsPaidBeforePromotion === 'number' ? s.monthsPaidBeforePromotion
       : (typeof s.monthsCleared === 'number' ? s.monthsCleared : undefined)));
  if (s.previousAcademicYear)  add(s.previousAcademicYear, s.classPrev,               s.monthlyFee, s.previousYearMonthStatus);
  if (s.openingOutstandingYear) add(s.openingOutstandingYear, s.openingOutstandingClass, s.monthlyFee, s.prevYearMonthStatus);
  if (Array.isArray(s.openingOutstandingDues)) {
    s.openingOutstandingDues.forEach(d => add(d.year, d.class, d.monthlyFee || s.monthlyFee, d.monthStatus));
  }
  return ledger;
}

// DERIVATION: the ONE function that computes a year's live per-month status from its
// IMMUTABLE baseline overlaid with the transaction ledger. base PAID/EXCUSED stay as-is;
// base DUE/PARTIAL months are topped up by transaction allocations (partial-aware, reusing
// the same tx.monthAllocations schema as Item 06). Pure + idempotent — never writes anything.
// Returns { months, paidAmt, shortfall, dueCount, outstanding }.
function _deriveYearMonths(entry, yearTxs, rate) {
  const base  = (entry && entry.base) || {};
  const _rate = Number(rate != null ? rate : (entry && entry.monthlyFee)) || 0;
  const txPaid = {}; const txExcused = new Set();
  (yearTxs || []).forEach(t => {
    if (t.type === 'excused_waiver') { (t.monthsSelected || []).forEach(m => txExcused.add(_flShort(m))); return; }
    if (t.monthAllocations && typeof t.monthAllocations === 'object') {
      Object.entries(t.monthAllocations).forEach(([m, amt]) => { const sm = _flShort(m); txPaid[sm] = (txPaid[sm] || 0) + (Number(amt) || 0); });
    } else if (Array.isArray(t.monthsSelected)) {
      t.monthsSelected.forEach(m => { const sm = _flShort(m); txPaid[sm] = Math.max(txPaid[sm] || 0, _rate); });
    }
  });
  const months = {}, paidAmt = {}, shortfall = {};
  let dueCount = 0, outstanding = 0;
  _FL_MONTHS.forEach(m => {
    const full = _FL_S2F[m];   // dual-key the output (Jul AND July) so no consumer can
                               // mis-read a partial month as untouched via a key-format mismatch.
    const b = (base[m] || 'DUE').toUpperCase();
    let st, pd, sh;
    if (b === 'EXCUSED' || txExcused.has(m)) { st = 'EXCUSED'; pd = 0; sh = 0; }
    else {
      const basePaid = b === 'PAID' ? _rate : 0;
      const paid = Math.min(_rate, basePaid + (txPaid[m] || 0)); // onboarding baseline + tx allocations, capped at rate
      pd = paid;
      if (_rate > 0 && paid >= _rate)      { st = 'PAID';    sh = 0; }
      else if (paid > 0)                   { st = 'PARTIAL'; sh = _rate - paid; outstanding += sh;    dueCount++; }
      else                                 { st = 'DUE';     sh = _rate;        outstanding += _rate; dueCount++; }
    }
    months[m] = st;      months[full] = st;
    paidAmt[m] = pd;     paidAmt[full] = pd;
    shortfall[m] = sh;   shortfall[full] = sh;
  });
  return { months, paidAmt, shortfall, dueCount, outstanding };
}

// ROLLBACK: strip the new-model fields, restoring the exact pre-migration doc shape.
// Because the dual-write NEVER modifies the authoritative legacy fields, deleting
// feeLedger + _flShadow is a complete, clean rollback. Idempotent (safe to re-run).
async function _feeLedgerRollback(studentId) {
  if (!studentId) return false;
  try {
    await schoolCol('students').doc(studentId).update({
      feeLedger: firebase.firestore.FieldValue.delete(),
      _flShadow: firebase.firestore.FieldValue.delete()
    });
    invalidateStudentCache();
    return true;
  } catch (e) { console.warn('feeLedger rollback failed for', studentId, e && e.message); return false; }
}
async function _feeLedgerRollbackAll() {
  if (currentRole !== 'principal') { showToast('Principal only.', 'danger'); return; }
  if (!confirm('Roll back the feeLedger dual-write for EVERY student (deletes feeLedger + _flShadow; legacy fields untouched)? Safe & idempotent.')) return;
  const snap = await schoolCol('students').get();
  let ok = 0; for (const d of snap.docs) { if (await _feeLedgerRollback(d.id)) ok++; }
  showToast(`Rolled back ${ok}/${snap.docs.length} students.`, 'success');
}

// ── CONTRACT TESTS (pure, model-level) — GATE the FEATURE_FEELEDGER.read flip ──────
// Each asserts an EXACT expected figure, not "doesn't crash". Run in console:
//   _flRunContractTests()   → { ALL_GREEN, passed, total, results }
// Must be ALL_GREEN before any consumer read path is switched to feeLedger.
function _flRunContractTests() {
  const R = [];
  const T = (name, fn) => { try { const r = fn(); R.push({ name, pass: !!r.pass, detail: r.detail }); } catch (e) { R.push({ name, pass: false, detail: 'threw: ' + (e && e.message) }); } };
  const allDue = () => { const b = {}; _FL_MONTHS.forEach(m => b[m] = 'DUE'); return b; };

  // 1) THE case you demanded: reopening a PARTIAL month quotes the REMAINDER, not the flat rate.
  T('reopen_partial_month_quotes_remainder', () => {
    const e = { class:'X', monthlyFee:1800, base: allDue() };
    const d = _deriveYearMonths(e, [{ monthAllocations:{ July:1700 } }], 1800);
    const closed = _deriveYearMonths(e, [{ monthAllocations:{ July:1700 } }, { monthAllocations:{ July:100 } }], 1800);
    const over = _deriveYearMonths(e, [{ monthAllocations:{ July:1700 } }, { monthAllocations:{ July:1800 } }], 1800);
    return { pass: d.shortfall.July === 100 && d.shortfall.Jul === 100 && d.months.July === 'PARTIAL'
                 && closed.months.July === 'PAID' && closed.shortfall.July === 0
                 && over.paidAmt.July === 1800,   // capped — never double-charges
             detail: { quote: d.shortfall.July, status: d.months.July, afterClose: closed.months.July } };
  });
  // 2) sequential fill: 4×1700, tender 6600 → first 3 FULL, 4th PARTIAL ₹200 (not equal split)
  T('sequential_fill_last_month_partial', () => {
    const a = _allocateFeePayment(['June','July','August','September'], 6600, () => 1700, () => 0);
    return { pass: a.allocations.slice(0,3).every(x => x.status==='paid') && a.allocations[3].status==='partial' && a.allocations[3].shortage===200,
             detail: a.allocations.map(x=>x.month.slice(0,3)+':'+x.status) };
  });
  // 3) top-up closes the partial and does NOT bleed into the next month
  T('topup_closes_partial_no_bleed', () => {
    const e = { class:'X', monthlyFee:1700, base: allDue() };
    const d = _deriveYearMonths(e, [{ monthAllocations:{ September:1500 } }, { monthAllocations:{ September:200 } }], 1700);
    return { pass: d.months.September==='PAID' && d.shortfall.September===0 && d.shortfall.October===1700, detail: { sep:d.months.September, octDue:d.shortfall.October } };
  });
  // 4) legacy full payment (no allocations) unaffected
  T('legacy_full_payment_unchanged', () => {
    const d = _deriveYearMonths({ class:'X', monthlyFee:1700, base: allDue() }, [{ monthsSelected:['June','July','August'] }], 1700);
    return { pass: d.months.June==='PAID' && d.months.August==='PAID' && d.months.September==='DUE', detail: { aug:d.months.August, sep:d.months.September } };
  });
  // 5) migration repairs the corruption signature (grid all-PAID but count=7 → first 7 paid)
  T('migration_repairs_corruption', () => {
    const g = {}; _FL_MONTHS.forEach(m => g[m]='N/A-PAID');
    const led = _buildFeeLedgerFromLegacy({ academicYear:'2025-26', class:'G', monthlyFee:1700, monthsPaidBeforePromotion:7, monthStatus:g });
    const b = led['2025-26'].base, paidCount = _FL_MONTHS.filter(m=>b[m]==='PAID').length;
    return { pass: paidCount===7 && b.Jun==='PAID' && b.Dec==='PAID' && b.Jan==='DUE' && b.May==='DUE', detail: { paidCount, grid: _FL_MONTHS.map(m=>b[m][0]).join('') } };
  });
  // 6) migration idempotent
  T('migration_idempotent', () => {
    const s = { academicYear:'2024-25', class:'G', monthlyFee:1700, previousYearMonthStatus:{Jun:'N/A-PAID',Mar:'DUE'} };
    const l1 = _buildFeeLedgerFromLegacy(s), l2 = _buildFeeLedgerFromLegacy({ ...s, feeLedger:l1 });
    return { pass: JSON.stringify(l1)===JSON.stringify(l2), detail: { years:Object.keys(l1) } };
  });
  // 7) excused base month stays excused (never charged)
  T('excused_month_stays_excused', () => {
    const b = allDue(); b.Aug = 'EXCUSED';
    const d = _deriveYearMonths({ class:'X', monthlyFee:1700, base:b }, [], 1700);
    return { pass: d.months.August==='EXCUSED' && d.shortfall.August===0, detail: { aug:d.months.August } };
  });
  // 8) Record Payment QUOTE nets a reopened partial: rate 1800, applied 1700 → quote 100.
  //    Untouched month still quotes full; fully-applied quotes 0.
  T('record_payment_quote_reopen_partial_is_100', () => {
    return { pass: _flRecordPaymentMonthQuote(1800, 1700) === 100
                 && _flRecordPaymentMonthQuote(1700, 0)    === 1700
                 && _flRecordPaymentMonthQuote(1700, 1700) === 0
                 && _flRecordPaymentMonthQuote(1700, 1800) === 0,   // never negative
             detail: { reopen: _flRecordPaymentMonthQuote(1800,1700), untouched: _flRecordPaymentMonthQuote(1700,0) } };
  });

  // 9) concession picker: a month settled via ANY of the three entry points is CLOSED;
  //    an OPEN partial (below rate) stays selectable.
  T('concession_closed_months_all_three_entry_points', () => {
    const cy = '2026-27';
    const txs = [
      { academicYear:cy, monthsSelected:['June'] },                                  // 1. Record Payment (legacy)
      { academicYear:cy, monthAllocations:{ July: 1700 } },                           //    partial that REACHED the rate → closed
      { academicYear:cy, monthAllocations:{ August: 500 } },                          //    OPEN partial → NOT closed
      { academicYear:cy, type:'excused_waiver', monthsSelected:['September'] }        //    excused
    ];
    const s = { academicYear:cy, monthStatus:{ Oct:'N/A-PAID' },                      // 2. Excel import
                currentYearPaidMonths:['November'], currentYearDueYear:cy };          // 3. Existing-Student entry
    const c = _flClosedMonthsForAY(txs, s, 1700, cy, 2026, 2027);
    return { pass: c['2026-06']==='PAID' && c['2026-07']==='PAID' && c['2026-09']==='EXCUSED'
                 && c['2026-10']==='PAID' && c['2026-11']==='PAID' && !c['2026-08'],
             detail: c };
  });

  // 10) THE regression: the quote and the SAVED amount must agree on a reopened partial.
  //     Month fee 1800 with 1600 already applied → both must be 200 (receipt printed 1800
  //     because saveFeePayment recomputed the flat rate instead of using this function).
  T('quote_and_save_agree_on_reopened_partial', () => {
    const rate = () => 1800;
    const applied = { July: 1600, Jul: 1600 };
    const reopen    = _flPayableForMonths(['July'], rate, applied);            // 200
    const mixed     = _flPayableForMonths(['June','July'], rate, applied);     // 1800 + 200
    const untouched = _flPayableForMonths(['June'], rate, {});                 // 1800
    return { pass: reopen === 200 && mixed === 2000 && untouched === 1800,
             detail: { reopen, mixed, untouched } };
  });

  // 11) BUG 2 (past-due balance drift): prior-year due of 2 months @ ₹1700, with a STALE
  //     amount scalar of 3400 that _pastDueSave never rewrites. Outstanding must track the
  //     monthStatus grid, NOT the scalar: 3400 → 1700 (month 1 cleared) → 0 (both cleared).
  T('past_due_outstanding_tracks_grid_not_stale_scalar', () => {
    const rate = 1700;
    const before  = { year:'2025-26', class:'Nursery', amount:3400, monthStatus:{ Jun:'DUE',       Jul:'DUE'       } };
    const afterM1 = { ...before,                                      monthStatus:{ Jun:'N/A-PAID', Jul:'DUE'       } };
    const afterM2 = { ...before,                                      monthStatus:{ Jun:'N/A-PAID', Jul:'N/A-PAID'  } };
    const o0 = _flOpeningDuesOutstanding(before,  rate);
    const o1 = _flOpeningDuesOutstanding(afterM1, rate);   // one partial payment covering month 1
    const o2 = _flOpeningDuesOutstanding(afterM2, rate);   // second payment covering month 2
    const staleScalar = before.amount;                     // 3400 — what the OLD code showed on every view
    return { pass: o0 === 3400 && o1 === 1700 && o2 === 0 && staleScalar === 3400 && o2 !== staleScalar,
             detail: { initial:o0, afterMonth1:o1, afterMonth2:o2, staleScalarWouldShow:staleScalar } };
  });

  // 12) BUG 1 (partial-payment rate resolution): with an invalid/empty classSection the
  //     save-path rate must still resolve via the student's stored class — and match EXACTLY
  //     what the full-payment lockedAmount path resolves (getClassRate(docClass)).
  T('save_rate_falls_back_to_doc_class_and_matches_locked', () => {
    const SCHED = { Nursery:1500, LKG:1700, UKG:1900 };
    // getClassRate stub: longest-prefix match — same contract as the app's getClassRate.
    const getRate = key => {
      if (!key) return null;
      const k = Object.keys(SCHED).sort((a,b)=>b.length-a.length).find(c => String(key).startsWith(c));
      return k ? { rate: SCHED[k] } : null;
    };
    const docClass = 'Nursery';
    const lockedFallback   = getRate(docClass);                                  // what lockedAmount resolves
    const emptyCs          = _flResolveClassInfo('',            docClass, getRate);
    const garbageCs        = _flResolveClassInfo('undefined A', docClass, getRate);
    const validCs          = _flResolveClassInfo('Nursery A',   null,     getRate); // primary path unaffected
    return { pass: !!emptyCs   && emptyCs.rate   === 1500
                 && !!garbageCs && garbageCs.rate === 1500
                 && emptyCs.rate === lockedFallback.rate    // partial == full resolution, exactly
                 && !!validCs   && validCs.rate   === 1500,
             detail: { emptyCs, garbageCs, lockedFallback, validCs } };
  });

  // 13) BUG 1 ROOT (partial reopen for New-Admission / Bulk-Admit): a student created with NO
  //     academicYear + NO monthStatus (the true new-admission shape) makes a partial payment.
  //     _syncStudentFinancials never writes 'PARTIAL' to the academicYear-gated monthStatus grid,
  //     so Record Payment's reopen MUST derive PARTIAL from the tx allocation LEDGER instead —
  //     this is the exact gap the fully-seeded synthetic objects in the tests above didn't cover.
  //     2 months @ ₹1900, paid ₹3600 → June FULL (1900), July PARTIAL (1700, ₹200 short). Reopen
  //     must un-lock July (still owes ₹200), keep June locked (fully paid), and never touch an
  //     untouched month (no ledger entry).
  T('reopen_unlocks_partial_month_from_ledger_without_academicYear', () => {
    const s = { class: 'X' };   // mirrors real New-Admission data: NO academicYear, NO monthStatus
    void s;
    const rate = 1900;
    // _appliedByMonth exactly as built at record-payment.js:411-423 (dual-keyed short + full).
    const appliedByMonth = { June:1900, Jun:1900, July:1700, Jul:1700 };
    const partial = _flPartialMonthsFromLedger(appliedByMonth, () => rate);
    return { pass: partial.has('July') && partial.has('Jul')      // partial month → un-locked
                 && !partial.has('June') && !partial.has('Jun')   // fully-paid month → stays locked
                 && !partial.has('August') && !partial.has('Aug'),// untouched (no ledger entry) → stays locked
             detail: { partialMonths: [...partial] } };
  });

  // 14) BUG-SRC4 robust variant (banner opening-year): a legacy single-year opening student with a
  //     genuinely UNPAID opening year — prevYearMonthStatus has real DUE months and NO
  //     openingOutstandingDues[] entry to answer from. Source 4 must show that year's REAL owing
  //     (grid DUE-count × opening-class rate), never the stale total scalar and never 0/hidden;
  //     and when there is genuinely no grid at all, it must still fall back to the scalar.
  T('opening_year_shows_grid_due_not_scalar_or_hidden', () => {
    const rate = 1700;
    const staleTotalScalar = 18000;   // s.outstandingBalance (mostly current-year) — must be IGNORED once the grid answers
    // prevYearMonthStatus: 4 DUE (Feb–May) + 8 already paid → owes 4 × 1700 = 6800
    const grid = { Jun:'N/A-PAID', Jul:'N/A-PAID', Aug:'N/A-PAID', Sep:'N/A-PAID', Oct:'N/A-PAID',
                   Nov:'N/A-PAID', Dec:'N/A-PAID', Jan:'N/A-PAID',
                   Feb:'DUE', Mar:'DUE', Apr:'DUE', May:'DUE' };
    const owed   = _flOpeningDuesOutstanding({ monthStatus: grid, amount: staleTotalScalar }, rate);
    const noGrid = _flOpeningDuesOutstanding({ monthStatus: {},   amount: staleTotalScalar }, rate);
    const paid   = _flOpeningDuesOutstanding({ monthStatus: { Jun:'N/A-PAID', Jul:'N/A-PAID' }, amount: staleTotalScalar }, rate);
    return { pass: owed === 6800 && owed !== 0 && owed !== staleTotalScalar  // real DUE shown — not hidden, not stale total
                 && noGrid === staleTotalScalar                             // genuinely no grid → scalar fallback preserved
                 && paid === 0,                                             // grid present & fully paid → 0 (bug this closes)
             detail: { owed, noGrid, paidYear: paid } };
  });

  // 15) Current-year Total Outstanding must NET a PARTIAL month to its remainder, not the full
  //     fee. Fee 1800; Jun/Jul fully PAID (excluded from the unpaid pills); Aug PARTIAL (₹200
  //     already applied → owes 1600); Sep–May = 9 months fully DUE. Outstanding must be
  //     9×1800 + (1800−200) = 17800, NOT 18000. Uses the same _flPayableForMonths the default
  //     calcLockedFee "Total Outstanding" now calls.
  T('current_year_outstanding_nets_partial_month', () => {
    const rate = 1800;
    const unpaidMonths = ['August','September','October','November','December',
                          'January','February','March','April','May'];      // Aug partial + 9 fully-due
    const appliedByMonth = { August: 200, Aug: 200 };                        // ₹200 already applied to Aug (tx ledger)
    const outstanding = _flPayableForMonths(unpaidMonths, () => rate, appliedByMonth);
    return { pass: outstanding === 17800 && outstanding !== 18000,
             detail: { outstanding, augRemainder: rate - 200, fullyDue: 9 * rate } };
  });

  // 16) Prior-year outstanding must be PARTIAL-aware (foundation for past-due partial payments):
  //     a prior year with 6 DUE months + 1 PARTIAL month (₹1600 still owed on an ₹1800 month) +
  //     5 settled. Total = 6×1800 + 1600 = 12400 — the PARTIAL month contributes its REMAINDER,
  //     never 0 (which would silently drop it) and never the full 1800.
  T('opening_year_outstanding_is_partial_aware', () => {
    const rate = 1800;
    const entry = {
      monthStatus: { Jun:'N/A-PAID', Jul:'N/A-PAID', Aug:'N/A-PAID', Sep:'N/A-PAID', Oct:'N/A-PAID',
                     Nov:'PARTIAL',                                             // ₹200 paid → ₹1600 owed
                     Dec:'DUE', Jan:'DUE', Feb:'DUE', Mar:'DUE', Apr:'DUE', May:'DUE' },  // 6 DUE
      monthShortage: { Nov: 1600 },
      amount: 999999   // stale scalar — must be IGNORED because the grid answers
    };
    const out     = _flOpeningDuesOutstanding(entry, rate);
    // a PARTIAL month with no recorded shortfall falls back to the full rate (never hidden):
    const noShort = _flOpeningDuesOutstanding({ monthStatus: { Jun:'PARTIAL', Jul:'DUE' } }, rate);
    // regression guard: a non-partial (all DUE / N/A-PAID) grid behaves exactly as before:
    const plain   = _flOpeningDuesOutstanding({ monthStatus: { Jun:'DUE', Jul:'N/A-PAID' } }, rate);
    return { pass: out === (6*1800 + 1600)   // 12400 — partial contributes its remainder
                 && out !== 6*1800           // not dropped
                 && out !== 7*1800           // not full-counted
                 && noShort === 2*1800       // missing shortfall → conservative full rate (both months)
                 && plain === 1800,          // unchanged for non-partial grids
             detail: { out, expected: 6*1800 + 1600, noShort, plain } };
  });

  // 17) Past-due PARTIAL end-to-end via the shared allocator: a prior year, 4 months due @ ₹1700
  //     (Feb–May), collect ₹5000. _allocateFeePayment fills oldest-first → Feb/Mar FULL, Apr
  //     PARTIAL (₹1600 applied, ₹100 short), May DUE. Carried into the openingOutstandingDues
  //     entry the way _pastDueSave + _syncStudentFinancials do, the year's outstanding must be the
  //     remainder: 4×1700 − 5000 = 1800 = DUE(May 1700) + PARTIAL-remainder(Apr 100).
  T('past_due_partial_allocation_end_to_end', () => {
    const rate = 1700;
    const months = ['February','March','April','May'];                 // academic order (oldest first)
    const alloc = _allocateFeePayment(months, 5000, () => rate, () => 0);
    const F2S = { February:'Feb', March:'Mar', April:'Apr', May:'May' };
    const monthStatus = {}, monthShortage = {};
    alloc.allocations.forEach(a => {                                   // same glue _pastDueSave/sync use
      monthStatus[F2S[a.month]] = a.status === 'paid' ? 'N/A-PAID' : a.status === 'partial' ? 'PARTIAL' : 'DUE';
      if (a.status === 'partial') monthShortage[F2S[a.month]] = a.shortage;
    });
    const outstanding = _flOpeningDuesOutstanding({ monthStatus, monthShortage }, rate);
    return { pass: alloc.applied === 5000
                 && monthStatus.Feb === 'N/A-PAID' && monthStatus.Mar === 'N/A-PAID'
                 && monthStatus.Apr === 'PARTIAL'  && monthShortage.Apr === 100
                 && monthStatus.May === 'DUE'
                 && outstanding === (4*1700 - 5000)   // 1800
                 && outstanding === (1700 + 100),     // DUE(May) + PARTIAL remainder(Apr)
             detail: { applied: alloc.applied, monthStatus, monthShortage, outstanding } };
  });

  // 18) BUG A.1 — past-due banner/outstanding must be PARTIAL-aware, deriving the shortfall from
  //     the tx monthAllocations (the academicYear/monthStatus path stores no monthShortage). Om
  //     Reddy: 2025-26 grid {Apr:PARTIAL, May:DUE, rest N/A-PAID}, one partial tx {April:1600} @
  //     ₹1800 → outstanding = 1×1800 (May) + (1800−1600) (Apr remainder) = 2000, NOT 1800.
  T('past_due_outstanding_partial_aware_from_tx_allocations', () => {
    const rate = 1800;
    const grid = { Jun:'N/A-PAID',Jul:'N/A-PAID',Aug:'N/A-PAID',Sep:'N/A-PAID',Oct:'N/A-PAID',
                   Nov:'N/A-PAID',Dec:'N/A-PAID',Jan:'N/A-PAID',Feb:'N/A-PAID',Mar:'N/A-PAID',
                   Apr:'PARTIAL', May:'DUE' };
    const yearTxs = [{ academicYear:'2025-26', monthAllocations:{ April:1600 } }];
    const short = _flPartialShortFromTxs(grid, yearTxs, rate);                       // { Apr: 200 }
    const outstanding = _flOpeningDuesOutstanding({ monthStatus: grid, monthShortage: short }, rate);
    return { pass: short.Apr === 200 && outstanding === 2000 && outstanding !== 1800,
             detail: { short, outstanding } };
  });

  // 19) BUG A.2 — past-due grid: a PARTIAL month (money applied but < rate) must stay SELECTABLE,
  //     not lock. April got ₹1600 of ₹1800 → partial → unlocked; a fully-paid month (₹1800) →
  //     locked; an untouched month → not partial. Same _flPartialMonthsFromLedger the current-year grid uses.
  T('past_due_grid_partial_month_stays_selectable', () => {
    const rate = 1800;
    const applied = { April:1600, Apr:1600, March:1800, Mar:1800 };   // April partial, March full
    const partial = _flPartialMonthsFromLedger(applied, () => rate);
    return { pass: partial.has('April') && !partial.has('March') && !partial.has('May'),
             detail: { partialMonths: [...partial] } };
  });

  // 20) BUG A.3 — tapping a PARTIAL month in Record Previous Year Dues must pre-fill only the
  //     remainder (rate − alreadyPaid), not a fresh full month. April PARTIAL: ₹1600 applied of
  //     ₹1800 → tapping April charges ₹200. A DUE month (0 applied) still charges the full ₹1800.
  //     Same netting _pastDueCalcAmount + _pastDueSave use (rate − appliedByMonth from monthAllocations).
  T('past_due_tap_partial_month_charges_remainder', () => {
    const rate = 1800;
    const applied = { April:1600, Apr:1600 };                              // from the tx ledger
    const aprCharge  = _flPayableForMonths(['April'],       () => rate, applied);   // 200
    const marCharge  = _flPayableForMonths(['March'],       () => rate, applied);   // 1800 (untouched DUE)
    const bothCharge = _flPayableForMonths(['April','May'], () => rate, applied);   // 200 + 1800
    return { pass: aprCharge === 200 && aprCharge !== 1800 && marCharge === 1800 && bothCharge === 2000,
             detail: { aprCharge, marCharge, bothCharge } };
  });

  // 21) The "2025-26 culprit" — Due Fee prior-year outstanding must be PARTIAL-aware, same as the
  //     past-due banner. studentDocYear/previousAcademicYear previously counted only DUE months ×
  //     rate, dropping a partial month's remainder (Om Reddy 2025-26 read ₹1,800 not ₹2,000) and
  //     leaving the year stat card "stuck". Uses the same helpers the Due Fee section now calls.
  T('due_fee_prior_year_outstanding_partial_aware', () => {
    const rate = 1800;
    const grid = { Jun:'N/A-PAID',Jul:'N/A-PAID',Aug:'N/A-PAID',Sep:'N/A-PAID',Oct:'N/A-PAID',
                   Nov:'N/A-PAID',Dec:'N/A-PAID',Jan:'N/A-PAID',Feb:'N/A-PAID',Mar:'N/A-PAID',
                   Apr:'PARTIAL', May:'DUE' };                       // 10 paid, Apr partial, May due
    const txs = [{ studentId:'x', academicYear:'2025-26', monthAllocations:{ April:1600 } }];
    const due = _flOpeningDuesOutstanding({ monthStatus: grid, monthShortage: _flPartialShortFromTxs(grid, txs, rate) }, rate);
    // regression: a fully-paid year (all N/A-PAID) still reads 0, never over-counts.
    const paidGrid = {}; Object.keys(grid).forEach(m => paidGrid[m] = 'N/A-PAID');
    const zero = _flOpeningDuesOutstanding({ monthStatus: paidGrid, monthShortage: {} }, rate);
    return { pass: due === 2000 && due !== 1800 && zero === 0, detail: { due, zero } };
  });

  // 22) Desync sweep — the LAST DUE-only counters (Due Fee openingOutstandingYear, profile
  //     Source A / _liveOutstanding). With a tx ledger a PARTIAL month contributes its exact
  //     remainder; with NO tx for that year (orphaned partial) it must fall back to the FULL rate
  //     — conservative, never silently ₹0. Both go through the one shared helper.
  T('all_prior_year_readers_never_drop_a_partial_month', () => {
    const rate = 1700;
    const grid = { Jun:'N/A-PAID', Jul:'PARTIAL', Aug:'DUE' };          // 1 paid, 1 partial, 1 due
    const withTx = _flOpeningDuesOutstanding(
      { monthStatus: grid, monthShortage: _flPartialShortFromTxs(grid, [{ monthAllocations:{ July:1500 } }], rate) }, rate);
    const noTx   = _flOpeningDuesOutstanding({ monthStatus: grid }, rate);   // orphaned partial
    return { pass: withTx === 1700 + 200      // Aug full + Jul remainder (1700−1500)
                 && withTx !== 1700           // partial not dropped
                 && noTx === 1700 + 1700      // no ledger → conservative full rate, never 0
                 && noTx !== 1700,
             detail: { withTx, noTx } };
  });

  const passed = R.filter(r=>r.pass).length;
  console.log('%c[feeLedger contract tests] ' + passed + '/' + R.length + (passed===R.length ? ' ALL GREEN' : ' — FAILURES'), 'font-weight:bold;color:' + (passed===R.length?'#2a2':'#c22'));
  if (typeof console.table === 'function') console.table(R.map(r => ({ test:r.name, pass:r.pass })));
  return { suite:'feeLedger contract tests', passed, total:R.length, ALL_GREEN: passed===R.length, results:R };
}

// Single source of truth for a student's ENTIRE fee-financial state. Every module
// that mutates fee data (Record Payment, Record Previous Year Dues, Excused
// Students, Concession Management) calls this as the LAST step of its save
// routine. It re-derives every per-year and aggregate field from feeTransactions
// (the only append-only, authoritative ledger for what has actually been paid /
// excused) and writes the result back atomically — so Dashboard, Due Fee,
// Student Profile, and Record Previous Year Dues can never disagree about a
// student's true fee state again, regardless of which module last touched it.
async function _syncStudentFinancials(studentId, opts = {}) {
  if (!studentId) return;
  // JSS-REF-VELTRIX-2026-004 ITEM 04: optional { revertTxMonths: { '<AY>': ['June',...] } }.
  // Months listed here had their paid-support removed by a just-deleted transaction and
  // must NOT be re-seeded as paid from the (now stale) stored grid below — only a
  // *remaining* transaction may re-establish them. Import-paid months (never present in
  // any transaction) are never in this list, so they are left untouched.
  const _revertTxMonths = opts.revertTxMonths || null;
  try {
    const sDocSnap = await schoolCol('students').doc(studentId).get();
    if (!sDocSnap.exists) return;
    const s = { id: studentId, ...sDocSnap.data() };

    const txSnap = await schoolCol('feeTransactions').where('studentId', '==', studentId).get();
    const txs = txSnap.docs.map(d => d.data());

    const currentYear = _getCurrentAcademicYearStr();

    // ── Collect every year we know anything about for this student ──
    const yearsSet = new Set();
    if (s.academicYear) yearsSet.add(_normaliseAcademicYear(s.academicYear));
    if (s.previousAcademicYear) yearsSet.add(_normaliseAcademicYear(s.previousAcademicYear));
    if (s.openingOutstandingYear) yearsSet.add(_normaliseAcademicYear(s.openingOutstandingYear));
    if (Array.isArray(s.openingOutstandingDues)) {
      s.openingOutstandingDues.forEach(d => { if (d.year) yearsSet.add(_normaliseAcademicYear(d.year)); });
    }
    txs.forEach(t => { if (t.academicYear) yearsSet.add(_normaliseAcademicYear(t.academicYear)); });
    yearsSet.add(currentYear);

    // Which legacy grid field holds a given year's month status. Computed here
    // (moved up from further below) so the seed step right below can use it.
    const _sDocYearSync = _normaliseAcademicYear(s.academicYear || '');
    const _prevYearSync = _normaliseAcademicYear(s.previousAcademicYear || '');
    const _openYearSync = _normaliseAcademicYear(s.openingOutstandingYear || '');
    const _fieldForYearSync = yr => {
      if (_sDocYearSync && yr === _sDocYearSync) return 'monthStatus';
      if (_prevYearSync && yr === _prevYearSync) return 'previousYearMonthStatus';
      if (_openYearSync && yr === _openYearSync) return 'prevYearMonthStatus';
      return null;
    };
    const _shortToFullSync = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};

    // ── Recompute paid/excused/due months + outstanding amount PER YEAR (AUTHORITATIVE) ──
    // NOTE: this legacy read-modify-write path remains the authoritative writer during the
    // feeLedger dual-write / shadow-compare rollout. It is UNCHANGED. The canonical model is
    // computed separately below and only observed until FEATURE_FEELEDGER.read flips.
    const perYear = {};
    yearsSet.forEach(yr => {
      const cls  = _resolveClassForYear(s, yr);
      const rate = _FEE_SCHEDULE[cls] || s.monthlyFee || 0;
      const paid = new Set(), excused = new Set();
      const _yrFieldSync = _fieldForYearSync(yr);
      const _arrEntrySync = Array.isArray(s.openingOutstandingDues)
        ? s.openingOutstandingDues.find(d => _normaliseAcademicYear(d.year || '') === yr)
        : null;
      if (_arrEntrySync && _arrEntrySync.monthStatus) {
        Object.entries(_arrEntrySync.monthStatus).forEach(([shortM, status]) => {
          const fullM = _shortToFullSync[shortM] || shortM;
          if (status === 'N/A-PAID' || status === 'PAID') paid.add(fullM);
          else if (status === 'EXCUSED') excused.add(fullM);
        });
      } else if (_yrFieldSync && s[_yrFieldSync]) {
        Object.entries(s[_yrFieldSync]).forEach(([shortM, status]) => {
          const fullM = _shortToFullSync[shortM] || shortM;
          if (status === 'N/A-PAID' || status === 'PAID') paid.add(fullM);
          else if (status === 'EXCUSED') excused.add(fullM);
        });
      }
      if (_revertTxMonths && Array.isArray(_revertTxMonths[yr])) {
        _revertTxMonths[yr].forEach(m => {
          const fullM = _shortToFullSync[m] || m;
          paid.delete(fullM);    paid.delete(m);
          excused.delete(fullM); excused.delete(m);
        });
      }
      const partialPaid = {};
      txs.forEach(t => {
        if (_normaliseAcademicYear(t.academicYear) !== yr) return;
        if (t.type === 'excused_waiver') { (t.monthsSelected || []).forEach(m => excused.add(m)); return; }
        if (t.monthAllocations && typeof t.monthAllocations === 'object') {
          Object.entries(t.monthAllocations).forEach(([m, amt]) => {
            if (excused.has(m)) return;
            const prior = (paid.has(m) ? rate : 0) + (partialPaid[m] || 0);
            const total = prior + (Number(amt) || 0);
            if (rate > 0 && total >= rate) { paid.add(m); delete partialPaid[m]; }
            else if (total > 0) { partialPaid[m] = total; }
          });
        } else {
          (t.monthsSelected || []).forEach(m => { paid.add(m); delete partialPaid[m]; });
        }
      });
      const _partialMonths = Object.keys(partialPaid).filter(m => !paid.has(m) && !excused.has(m));
      const dueCount   = Math.max(0, 12 - paid.size - excused.size);
      const _fullDue   = Math.max(0, dueCount - _partialMonths.length);
      const _partialShort = _partialMonths.reduce((sm, m) => sm + Math.max(0, rate - (partialPaid[m] || 0)), 0);
      perYear[yr] = { cls, rate, paid, excused, partialPaid, dueCount, outstanding: _fullDue * rate + _partialShort };
    });

    // ── Aggregate fields (AUTHORITATIVE — unchanged legacy model) ──
    let totalOutstanding = 0, prevYearsOutstanding = 0;
    Object.entries(perYear).forEach(([yr, info]) => {
      totalOutstanding += info.outstanding;
      if (yr !== currentYear) prevYearsOutstanding += info.outstanding;
    });
    const _anyPartial = Object.values(perYear).some(info =>
      info.partialPaid && Object.keys(info.partialPaid).some(m => (info.partialPaid[m] || 0) > 0 && !info.paid.has(m)));

    const updatePayload = {
      outstandingBalance: totalOutstanding,
      remainingBalance:   totalOutstanding,
      previousDues:       prevYearsOutstanding,
      fee_status:         totalOutstanding > 0 ? (_anyPartial ? 'partial' : 'pending') : 'paid',
      updatedAt:          firebase.firestore.FieldValue.serverTimestamp(),
    };

    // ── Write back per-year month grids to the correct legacy field (AUTHORITATIVE, dot-path) ──
    Object.entries(perYear).forEach(([yr, info]) => {
      if (yr === currentYear && yr !== _sDocYearSync) return;
      const field = _fieldForYearSync(yr);
      if (!field) return;
      ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'].forEach(shortM => {
        const fullM = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'}[shortM];
        if (info.paid.has(fullM) || info.paid.has(shortM)) {
          updatePayload[`${field}.${shortM}`] = 'N/A-PAID';
        } else if (info.excused.has(fullM) || info.excused.has(shortM)) {
          updatePayload[`${field}.${shortM}`] = 'EXCUSED';
        } else if (info.partialPaid && ((info.partialPaid[fullM] || 0) > 0 || (info.partialPaid[shortM] || 0) > 0)) {
          updatePayload[`${field}.${shortM}`] = 'PARTIAL';
        } else if (s[field] && s[field][shortM]) {
          updatePayload[`${field}.${shortM}`] = 'DUE';
        }
      });
      updatePayload[field === 'monthStatus' ? 'monthsDue' : (field === 'previousYearMonthStatus' ? '_prevMonthsDue' : '_openMonthsDue')] = info.dueCount;
    });

    if (Array.isArray(s.openingOutstandingDues) && s.openingOutstandingDues.length) {
      const newArr = s.openingOutstandingDues.map(entry => {
        const eyr = _normaliseAcademicYear(entry.year || '');
        const info = perYear[eyr];
        if (!info) return entry;
        const ms = { ...(entry.monthStatus || {}) };
        const msShort = {};   // per-month remainder for PARTIAL months → feeds _flOpeningDuesOutstanding
        Object.keys(_fullToShortSync).forEach(fullM => {
          const shortM = _fullToShortSync[fullM];
          if (info.paid.has(fullM) || info.paid.has(shortM)) ms[shortM] = 'N/A-PAID';
          else if (info.excused.has(fullM) || info.excused.has(shortM)) ms[shortM] = 'EXCUSED';
          else if (info.partialPaid && ((info.partialPaid[fullM] || 0) > 0 || (info.partialPaid[shortM] || 0) > 0)) {
            ms[shortM] = 'PARTIAL';
            const _pp = (info.partialPaid[fullM] || 0) || (info.partialPaid[shortM] || 0);
            msShort[shortM] = Math.max(0, (info.rate || 0) - _pp);   // rate − amount already applied
          }
          else if (ms[shortM] === 'N/A-PAID' || ms[shortM] === 'PARTIAL') ms[shortM] = 'DUE';
        });
        return { ...entry, monthStatus: ms, monthShortage: msShort, amount: info.outstanding };
      });
      updatePayload.openingOutstandingDues = newArr;
    }

    if (totalOutstanding <= 0 && _sDocYearSync && _sDocYearSync !== currentYear) {
      updatePayload.academicYear = currentYear;
    }

    // ════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-004 — feeLedger DUAL-WRITE + SHADOW-COMPARE (flagged).
    // The authoritative writes above (legacy fields) are UNCHANGED. Here we ALSO build the
    // canonical feeLedger and record a shadow-compare of old-vs-new per-year outstanding —
    // WITHOUT touching any field a consumer reads. No read path switches to feeLedger until
    // FEATURE_FEELEDGER.read is turned on after a clean shadow-compare over a full billing
    // cycle. Wrapped so a dual-write error can NEVER break the authoritative save.
    // ════════════════════════════════════════════════════════════════════════
    if (FEATURE_FEELEDGER.dualWrite) {
      try {
        const _fl = _buildFeeLedgerFromLegacy(s);
        const _blank = () => { const b = {}; _FL_MONTHS.forEach(m => b[m] = 'DUE'); return b; };
        yearsSet.forEach(yr => { if (!_fl[yr]) _fl[yr] = { class: _resolveClassForYear(s, yr) || s.class || '', monthlyFee: 0, base: _blank() }; });
        const _flPerYear = {};
        Object.keys(_fl).forEach(yr => {
          const e = _fl[yr];
          const r = e.monthlyFee || _FEE_SCHEDULE[_resolveClassForYear(s, yr)] || s.monthlyFee || 0;
          e.monthlyFee = e.monthlyFee || r; if (!e.class) e.class = _resolveClassForYear(s, yr) || s.class || '';
          const d = _deriveYearMonths(e, txs.filter(t => _normaliseAcademicYear(t.academicYear) === yr), r);
          e.months = d.months; _flPerYear[yr] = d;
        });
        updatePayload.feeLedger = _fl;   // DUAL-WRITE (persisted in parallel; NOT read while FEATURE_FEELEDGER.read === false)

        if (FEATURE_FEELEDGER.shadowCompare) {
          const diffs = [];
          new Set([...Object.keys(perYear), ...Object.keys(_flPerYear)]).forEach(yr => {
            const oldOut = perYear[yr] ? perYear[yr].outstanding : null;
            const newOut = _flPerYear[yr] ? _flPerYear[yr].outstanding : null;
            if (oldOut !== newOut) diffs.push({ yr, oldOut, newOut });
          });
          const _newTotal = Object.values(_flPerYear).reduce((a, d) => a + d.outstanding, 0);
          updatePayload._flShadow = {
            ranAt:    new Date().toISOString(),
            match:    diffs.length === 0 && totalOutstanding === _newTotal,
            oldTotal: totalOutstanding,
            newTotal: _newTotal,
            diffs
          };
        }
      } catch (_flErr) {
        console.warn('feeLedger dual-write/shadow failed (non-fatal):', _flErr && _flErr.message);
      }
    }

    await schoolCol('students').doc(studentId).update(updatePayload);
    invalidateStudentCache();
    invalidateFinanceCache();
  } catch (_syncErr) {
    console.error('ITEM-10: _syncStudentFinancials failed for', studentId, _syncErr);
  }
}

// ════════════════════════════════════════════════════════════════
// ONE-TIME RECONCILIATION UTILITY (BUG-CLS-REPEAT / BUG-STALE-DUES FIX)
// Existing students onboarded before this fix have stale `amount`/`class`
// values baked into openingOutstandingDues[] — those only get corrected
// when _syncStudentFinancials() actually runs for that student (normally
// triggered by a payment). This button runs it once for every student so
// historical data is corrected WITHOUT needing to delete/reimport anyone.
// Principal-only; safe to re-run any time (idempotent).
// ════════════════════════════════════════════════════════════════
async function reconcileAllStudentDues() {
  if (currentRole !== 'principal') return;
  if (!confirm('This will recompute dues/class for every student using the latest fee logic. Recommended after a calculation fix. Continue?')) return;

  const btn = document.getElementById('reconcileDuesBtn');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Reconciling…'; }

  try {
    const snap = await schoolCol('students').get();
    const total = snap.docs.length;
    let done = 0, failed = 0;

    for (const doc of snap.docs) {
      try {
        await _syncStudentFinancials(doc.id);
        done++;
      } catch (e) {
        failed++;
        console.error('reconcileAllStudentDues: failed for', doc.id, e);
      }
      if (btn) btn.textContent = `🔄 Reconciling… ${done + failed}/${total}`;
    }

    showToast(`Reconciled ${done}/${total} students${failed ? ` (${failed} failed — see console)` : ''}.`, failed ? 'warning' : 'success');
  } catch (e) {
    showToast('Reconciliation failed: ' + e.message, 'danger');
    console.error('reconcileAllStudentDues:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Recalculate All Dues'; }
    renderPendingFee();
  }
}

// ARC-012 + VLX-REF-006 FIX: Classify a pending entry as 'current' or 'previous'.
// RULE: ALL students with dues appear in Current tab — terminated included.
// ONLY exception: Hidden students are excluded entirely (never fetched).
function _classifyDueYear(entry) {
  // Hidden students must never appear — but they are not fetched at all,
  // so this is a safety guard only.
  if ((entry.type || '').toLowerCase() === 'hidden') return 'previous';
  // Everyone else — active, terminated, legacy, existing, promoted — current tab.
  return 'current';
}
async function renderPendingFee() {
  setActiveNav('pendingFee');
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    // ── 1. Fetch active student transactions ──────────────────────────────
    let txQ = schoolCol('feeTransactions');
    const txSnap = await txQ.get();
    const allTxs = txSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    // ── 2. Fetch active students ───────────────────────────────────────────
    let stuQ = schoolCol('students');
    if (currentViewBlock) stuQ = stuQ.where('block','==',currentViewBlock);
    const stuSnap = await stuQ.get();
    const stuMap  = {};
    stuSnap.docs.forEach(d => { stuMap[d.id] = { id:d.id, ...d.data() }; });
    // BUG-FEE-AUTOFIX: correct previous-year fee rates in-memory before any calculations
    Object.keys(stuMap).forEach(k => { stuMap[k] = _fixStudentFeeRates(stuMap[k]); });

    // ── 3. Fetch terminated students ───────────────────────────────────────
    const termMap = {};
    try {
      const termSnap = await schoolCol('terminatedStudents').get();
      termSnap.docs.forEach(d => { termMap[d.id] = { id:d.id, ...d.data() }; });
    } catch(termErr) {
      if (termErr.code !== 'permission-denied') console.warn('renderPendingFee: terminatedStudents fetch failed:', termErr.message);
    }

    // ── 4. Build per-student balance map from transactions ─────────────────
    const txsByStudent = {};
    allTxs.forEach(tx => {
      if (!tx.studentId) return;
      if (!txsByStudent[tx.studentId]) txsByStudent[tx.studentId] = [];
      txsByStudent[tx.studentId].push(tx);
    });
    const balMap = {};
    Object.entries(txsByStudent).forEach(([sid, txs]) => {
      txs.sort((a, b) => {
        const tsA = a.date?.seconds || 0, tsB = b.date?.seconds || 0;
        if (tsB !== tsA) return tsB - tsA;
        if (a.isDuePayment && !b.isDuePayment) return -1;
        if (!a.isDuePayment && b.isDuePayment) return 1;
        return 0;
      });
      const latest = txs[0];
      balMap[sid] = {
        balance:    latest.remainingBalance ?? 0,
        found:      true,
        lastDate:   latest.date,
        lastDateTs: latest.date?.seconds || 0,
      };
    });

    // ── 5. Build pending-dues list for ACTIVE students ─────────────────────
    const activePending = [];
    const feeSchedule = getFeeSchedule();
    const curYearStr = _getCurrentAcademicYearStr();

    Object.values(stuMap).forEach(s => {
      if (s.status === 'terminated' || s.status === 'hidden') return; // ITEM 05.2: Pending Fee excludes hidden students — Hidden section is their dedicated view
      const bal = balMap[s.id];
      const txs = txsByStudent[s.id] || [];

      // VLX-REF-006: Current year dues = fee×12 minus what was paid this year.
      // ALL active students get this calculation regardless of their academicYear field,
      // because academicYear may be set to an old year for multi-year-dues students.
      const monthlyRate    = feeSchedule[s.class] || s.monthlyFee || 0;
      const fullAnnualFee  = monthlyRate * 12;
      const paidThisYear   = txs
        .filter(t => _normaliseAcademicYear(t.academicYear || '') === _normaliseAcademicYear(curYearStr) || !t.academicYear)
        .reduce((sum, t) => sum + (t.amountPaid || 0), 0);
      const outstanding = monthlyRate
        ? Math.max(0, fullAnnualFee - paidThisYear)
        : Math.max(0, bal?.found ? bal.balance : (s.outstandingBalance || 0));

      if (outstanding > 0) {
        activePending.push({
          studentId:    s.id,
          name:         s.name || '—',
          block:        s.block || '—',
          class:        s.class || '—',
          section:      s.section || '—',
          admissionNo:  s.admissionNumber || '—',
          lastPayDate:  bal?.lastDate || null,
          amountDue:    outstanding,
          type:         s.type || 'active',
          parentName:   s.parentName || '—',
          contact:      s.contact || '—',
          admissionDate: s.admissionDate || null,
          createdAt:    s.createdAt || null,
          academicYear: curYearStr,
        });
      }
    });

    // ── 5b. Build PREVIOUS YEAR dues — per-year from openingOutstandingDues[] ─
    // Each active student may have dues across multiple past years stored in
    // openingOutstandingDues[]. We build a year→students map for the accordion.
    // Terminated students also contribute their stored outstandingBalance.
    //
    // JSS-REF-002 ITEM 3 FIX — DUE FEE FRAGMENTING INTO PER-STUDENT BUCKETS:
    // Previously, up to five independent sources (openingOutstandingDues[], legacy
    // openingOutstandingYear, stale currentYearDueBalance, the monthStatus-derived
    // isStoredYearNowPast path, and previousAcademicYear) each pushed their own row
    // straight into prevYearMap, guarded only by a LOCAL "already added" check keyed
    // off whatever year-string THAT source happened to use. Some sources keyed by the
    // raw, un-normalized year string (e.g. "2024-2025") while others keyed by the
    // normalized short form (e.g. "2024-25") — so the very same student's due could
    // land in two differently-spelled keys for what is really one academic year,
    // surfacing as duplicate per-student "buckets" instead of one aggregated figure.
    // Fix: every source now resolves to a single dedup map keyed strictly by
    // `${studentId}::${normalizedYear}`, with an explicit source priority (never
    // summed — these sources describe the SAME underlying balance, not additive
    // amounts). prevYearMap is materialized from this dedup map only after every
    // source has been considered, guaranteeing at most one row per student per year.
    const prevYearMap = {}; // { "2024-25": [ {studentId,name,block,class,section,admissionNo,amountDue,parentName,contact}, … ] }
    const _prevDueDedup = {}; // key: `${studentId}::${normYear}` → { row, priority }  (lower priority number wins)
    function _pushPrevDue(yr, row, priority) {
      const normYr = _normaliseAcademicYear(yr);
      if (!normYr) return;
      const key = `${row.studentId}::${normYr}`;
      const existing = _prevDueDedup[key];
      if (!existing || priority < existing.priority) {
        _prevDueDedup[key] = { year: normYr, row, priority };
      }
    }

    Object.values(stuMap).forEach(s => {
      if (s.status === 'terminated' || s.status === 'hidden') return; // ITEM 05.2: same exclusion applied to the second pass below
      const multiDues = Array.isArray(s.openingOutstandingDues) ? s.openingOutstandingDues : [];
      if (multiDues.length > 0) {
        multiDues.forEach(d => {
          if (!d.year || !(d.amount > 0)) return;
          _pushPrevDue(d.year, {
            studentId:  s.id,
            name:       s.name || '—',
            block:      s.block || '—',
            class:      d.class || s.class || '—',
            section:    s.section || '—',
            admissionNo: s.admissionNumber || '—',
            amountDue:  d.amount,
            parentName: s.parentName || '—',
            contact:    s.contact || '—',
            type:       'active',
          }, 1);
        });
      } else if (s.openingOutstandingYear && (s.outstandingBalance || 0) > 0) {
        // Legacy single-year onboarding.
        // BUG-COMBINED-PREVDUES FIX: s.previousDues was assumed to be JUST the
        // opening/older year's balance, but verified against live student data
        // it is actually a COMBINED total across every past year the student has
        // (e.g. 8500 = 5100 owed for 2024-25 + 3400 owed for 2025-26, summed).
        // Using it directly here overstated this single year's due by however
        // much the OTHER past year owed. Derive this year's own amount from its
        // own month-status grid (previousYearMonthStatus DUE count × the class
        // rate for that year) first — same pattern as the isStoredYearNowPast
        // branch below — and only fall back to previousDues / outstandingBalance
        // if no grid exists at all (true single-year onboarding, nothing to
        // over-count against).
        const _openingCls = s.openingOutstandingClass || s.classPrev || s.class || '';
        const _openingRate = feeSchedule[_openingCls] || s.monthlyFee || 0;
        // BUG-ITEM9C-FALSEDUE FIX (Due Fee page counterpart): a grid that EXISTS
        // and confidently computes to zero DUE months (fully cleared, including
        // months paid directly at import with no feeTransactions doc) must not be
        // overridden by the stale outstandingBalance/previousDues fallback — that
        // fallback is only valid when there's no grid at all to answer from.
        // JSS-REF-VELTRIX-2026-004 ITEM 06: partial-aware (third sibling of the studentDocYear /
        // previousAcademicYear computations below) — DUE months at full rate PLUS each PARTIAL
        // month's remainder from this year's tx allocations. Was count(DUE)×rate, which silently
        // dropped a partial month's balance from the opening year's Due Fee row + stat card.
        const _openingGridExists = !!(s.previousYearMonthStatus && Object.keys(s.previousYearMonthStatus).length);
        const _openingYrNorm = _normaliseAcademicYear(s.openingOutstandingYear || '');
        const _openTx = allTxs.filter(t => t.studentId === s.id && _normaliseAcademicYear(t.academicYear) === _openingYrNorm);
        const _dueFromOpeningGrid = _flOpeningDuesOutstanding(
          { monthStatus: s.previousYearMonthStatus,
            monthShortage: _flPartialShortFromTxs(s.previousYearMonthStatus, _openTx, _openingRate) },
          _openingRate);
        const openingAmt = _openingGridExists
          ? _dueFromOpeningGrid
          : ((s.previousDues || 0) > 0 ? s.previousDues : s.outstandingBalance);
        if (openingAmt > 0) _pushPrevDue(s.openingOutstandingYear, {
          studentId:  s.id,
          name:       s.name || '—',
          block:      s.block || '—',
          class:      s.openingOutstandingClass || s.class || '—',
          section:    s.section || '—',
          admissionNo: s.admissionNumber || '—',
          amountDue:  openingAmt,
          parentName: s.parentName || '—',
          contact:    s.contact || '—',
          type:       'active',
        }, 1);
      }

      // ── STALE CURRENT-YEAR DUES ──────────────────────────────────────────────
      // When a student was onboarded in a previous year (e.g. 2025-26) with
      // currentYearDueMonths/currentYearDueBalance, those fields were stored as
      // "current year" at import time. If the student's academicYear is now a
      // past year (not 2026-27), those dues belong in the Previous Year accordion.
      // We use s.academicYear as the year label for these dues.
      const storedAcadYear = _normaliseAcademicYear(s.academicYear || '');
      const normCurYear    = _normaliseAcademicYear(curYearStr);
      const isStoredYearNowPast = storedAcadYear && storedAcadYear !== normCurYear;

      if ((s.currentYearDueBalance || 0) > 0) {
        // Determine which year label to use for these dues.
        // s.currentYearDueYear = explicitly saved year label (new students going forward)
        // s.academicYear = fallback (set to curAcadYear at save time for existing students)
        const explicitDueYear = _normaliseAcademicYear(s.currentYearDueYear || '');
        const fallbackDueYear = storedAcadYear;
        const resolvedDueYear = explicitDueYear || fallbackDueYear;

        // Only add to previous accordion if that year is now in the past
        const dueYearIsPast = resolvedDueYear && resolvedDueYear !== normCurYear;

        if (dueYearIsPast) {
          _pushPrevDue(resolvedDueYear, {
            studentId:  s.id,
            name:       s.name || '—',
            block:      s.block || '—',
            class:      s.class || '—',
            section:    s.section || '—',
            admissionNo: s.admissionNumber || '—',
            amountDue:  s.currentYearDueBalance,
            parentName: s.parentName || '—',
            contact:    s.contact || '—',
            type:       'active',
          }, 2);
        }
      }

      // ── PAST-YEAR DUES FROM academicYear / previousAcademicYear FIELDS ────────
      // Students imported in 2025-26 have s.academicYear = "2025-26".
      // Their DUE months are in s.monthStatus (the month grid for that year).
      // If that academicYear is now a past year (not curYearStr), we calculate
      // their 2025-26 outstanding and add them to prevYearMap for that year.
      // This covers ALL students who were onboarded before the current year,
      // including those whose existing paths above did not catch them.
      //
      // BUG-FIX (VLX012→VLX013): Previous priority list was WRONG:
      //   ❌ OLD Priority 1 was s.previousDues — but s.previousDues is the OLDER
      //      year's balance (e.g. 2024-25), NOT the storedAcadYear (e.g. 2025-26).
      //      Using it here filed 2024-25 amounts under the 2025-26 bucket.
      //
      // Correct priority of due-amount sources for storedAcadYear:
      //   1. DUE months in s.monthStatus × monthlyFee  (storedAcadYear's own month grid)
      //   2. s.outstandingBalance − s.previousDues     (net newer-year balance)
      //   3. s.outstandingBalance                       (last-resort fallback, single-year import)

      if (isStoredYearNowPast) {
        // Calculate due amount for storedAcadYear
        // BUG-FEE-DUEFEE-A FIX: Use the class the student was in during that year
        // (openingOutstandingClass or classPrev), not current class — otherwise Grade 6
        // rate (₹1800) gets applied to Grade 5 (₹1700) outstanding dues.
        const _storedYrCls = s.openingOutstandingClass || s.classPrev || s.class || '';
        const monthlyFeeForStu = feeSchedule[_storedYrCls] || feeSchedule[s.class] || s.monthlyFee || 0;
        let dueAmt = 0;
        // BUG-ITEM9C-FALSEDUE FIX: track whether the grid itself had real data to
        // answer from — a grid that exists and confidently counts zero DUE months
        // means this year is genuinely cleared (including months paid directly at
        // import with no feeTransactions doc) and must NOT fall through to the
        // balance-subtraction fallbacks below, which can reproduce a stale/combined
        // figure that contradicts what the grid (and the clerk, on screen) shows.
        const _monthStatusGridExists = !!(s.monthStatus && Object.keys(s.monthStatus).length);

        if (_monthStatusGridExists) {
          // JSS-REF-VELTRIX-2026-004 ITEM 06: partial-aware — DUE months at full rate PLUS each
          // PARTIAL month's remainder (rate − applied), derived from this year's tx allocations
          // (allTxs already loaded above) via the shared helpers. Was: count(DUE)×rate only, which
          // dropped a partial month's balance (e.g. Om Reddy 2025-26 read ₹1,800 instead of ₹2,000).
          const _pyTx  = allTxs.filter(t => t.studentId === s.id && _normaliseAcademicYear(t.academicYear) === storedAcadYear);
          const _short = _flPartialShortFromTxs(s.monthStatus, _pyTx, monthlyFeeForStu);
          dueAmt = _flOpeningDuesOutstanding({ monthStatus: s.monthStatus, monthShortage: _short }, monthlyFeeForStu);
        }

        // Secondary fallback: net balance = combined outstanding minus the opening/older year portion
        // — only when there's no grid at all to trust instead.
        if (!_monthStatusGridExists && dueAmt === 0 && (s.outstandingBalance || 0) > 0) {
          const olderYearAmt = s.previousDues || 0;
          dueAmt = Math.max(0, s.outstandingBalance - olderYearAmt);
        }

        // Last-resort fallback (single-year import, no previousDues): use outstandingBalance as-is
        if (!_monthStatusGridExists && dueAmt === 0 && (s.outstandingBalance || 0) > 0 && !(s.previousDues > 0)) {
          dueAmt = s.outstandingBalance;
        }

        if (dueAmt > 0) {
          _pushPrevDue(storedAcadYear, {
            studentId:   s.id,
            name:        s.name || '—',
            block:       s.block || '—',
            class:       s.class || '—',
            section:     s.section || '—',
            admissionNo: s.admissionNumber || '—',
            amountDue:   dueAmt,
            parentName:  s.parentName || '—',
            contact:     s.contact || '—',
            type:        'active',
          }, 3);
        }
      }

      // ── PREVIOUS-ACADEMIC-YEAR DUES (s.previousAcademicYear field) ────────────
      // For students with two-year import rows (e.g. 2024-25 row + 2025-26 row),
      // the older year is stored as s.previousAcademicYear with dues in s.previousDues
      // and month grid in s.previousYearMonthStatus / s.prevYearMonthStatus.
      const prevAcadYrNorm = _normaliseAcademicYear(s.previousAcademicYear || '');
      if (prevAcadYrNorm && prevAcadYrNorm !== normCurYear) {
        // BUG-FEE-DUEFEE-B FIX: Use the class from the OLDER year (openingOutstandingClass
        // or classPrev) for fee rate lookup — not current class (s.class).
        const _prevYrCls = s.openingOutstandingClass || s.classPrev || s.class || '';
        const monthlyFeeForStu = feeSchedule[_prevYrCls] || feeSchedule[s.class] || s.monthlyFee || 0;
        let prevDueAmt = 0;
        const prevGrid = s.previousYearMonthStatus || s.prevYearMonthStatus || {};
        // BUG-COMBINED-PREVDUES FIX: s.previousDues can be a COMBINED total across every past year,
        // not just this one — prefer this year's own grid and only fall back to previousDues when
        // there's no grid at all. JSS-REF-VELTRIX-2026-004 ITEM 06: partial-aware (same as
        // studentDocYear above) — DUE at full rate + each PARTIAL month's remainder from this
        // year's tx allocations, via the shared helpers.
        if (Object.keys(prevGrid).length > 0) {
          const _pyTx  = allTxs.filter(t => t.studentId === s.id && _normaliseAcademicYear(t.academicYear) === prevAcadYrNorm);
          const _short = _flPartialShortFromTxs(prevGrid, _pyTx, monthlyFeeForStu);
          prevDueAmt = _flOpeningDuesOutstanding({ monthStatus: prevGrid, monthShortage: _short }, monthlyFeeForStu);
        } else if ((s.previousDues || 0) > 0) {
          prevDueAmt = s.previousDues;
        }

        if (prevDueAmt > 0) {
          _pushPrevDue(prevAcadYrNorm, {
            studentId:   s.id,
            name:        s.name || '—',
            block:       s.block || '—',
            class:       s.class || '—',
            section:     s.section || '—',
            admissionNo: s.admissionNumber || '—',
            amountDue:   prevDueAmt,
            parentName:  s.parentName || '—',
            contact:     s.contact || '—',
            type:        'active',
          }, 4);
        }
      }
    });

    // ── 6. Build pending-dues list for TERMINATED students ────────────────
    const normCurYearTop = _normaliseAcademicYear(curYearStr);
    const termPending = [];
    Object.values(termMap).forEach(t => {
      const outstanding = t.outstandingBalance || 0;
      if (outstanding > 0) {
        const termRow = {
          studentId:   t.studentId || t.id,
          name:        t.studentName || '—',
          block:       t.block || currentViewBlock || '—',
          class:       t.class || '—',
          section:     t.section || '—',
          admissionNo: t.admissionNumber || '—',
          lastPayDate: null,
          amountDue:   outstanding,
          type:        'terminated',
          parentName:  t.parentName || '—',
          contact:     t.contact || '—',
          admissionDate: t.admissionDate || null,
          createdAt:   t.createdAt || t.terminationDate || null,
          academicYear: t.academicYear || t.openingOutstandingYear || '',
        };
        termPending.push(termRow);
        // Also feed into the same dedup map so a terminated student's stored balance
        // (highest-priority — it's their final settled figure) cannot double up with
        // any residual active-student-path entry for the same year.
        const termYr = t.academicYear || t.openingOutstandingYear || '';
        if (termYr && _normaliseAcademicYear(termYr) !== normCurYearTop) {
          _pushPrevDue(termYr, { ...termRow }, 0);
        }
      }
    });

    // Materialize prevYearMap from the consolidated dedup map — one row per student per year.
    Object.values(_prevDueDedup).forEach(({ year, row }) => {
      if (!prevYearMap[year]) prevYearMap[year] = [];
      prevYearMap[year].push(row);
    });

    // currentYearPending = activePending (all active students — fee×12-paid)
    // previousYearPending = flat list from prevYearMap for tab count badge + legacy table
    const previousYearPending = Object.values(prevYearMap).flat();
    const currentYearPending  = activePending;
    // allPending = union of both (for ledger total + export)
    const allPending = [...activePending, ...previousYearPending];

    // ── PER-ACADEMIC-YEAR BREAKDOWN for KPI stat cards ───────────────────────
    const curYrStr = curYearStr;
    const yearBreakdownMap = {};

    // Current year bucket
    if (activePending.length > 0) {
      yearBreakdownMap[curYrStr] = {
        count: activePending.length,
        total: activePending.reduce((s,r)=>s+r.amountDue,0),
        isCurrent: true,
      };
    }
    // Previous year buckets from prevYearMap
    Object.entries(prevYearMap).forEach(([yr, rows]) => {
      if (!rows.length) return;
      yearBreakdownMap[yr] = {
        count: rows.length,
        total: rows.reduce((s,r)=>s+r.amountDue,0),
        isCurrent: false,
      };
    });

    // Sort years reverse-chronological
    const yearBreakdownSorted = Object.entries(yearBreakdownMap).sort((a, b) => {
      const ya = parseInt((a[0]||'').split('-')[0] || '0');
      const yb = parseInt((b[0]||'').split('-')[0] || '0');
      return yb - ya;
    });

    window._pfAllPending     = allPending;
    window._pfCurrentPending = currentYearPending;
    window._pfPrevPending    = previousYearPending;
    window._pfPrevYearMap    = prevYearMap; // per-year accordion data

    // ── 7. Build select options ────────────────────────────────────────────
    const blockOpts   = ['', ...getBlocks()];
    const classOpts   = ['', ...getClassList()];
    const sectionOpts = ['', ...getSections()];

    const acYear = _getAcademicYear();

    function _mkSelectHtml(opts, selected) {
      return opts.map(v => `<option value="${v}" ${selected===v?'selected':''}>${v||'All'}</option>`).join('');
    }

    // Build filter HTML for each sub-section
    // ENH-017-UNIFIED: Section uses _mkSecDropdown (dropdown with checkboxes)
    function _filterHtml(prefix, fState) {
      const bo = _mkSelectHtml(blockOpts, fState.block).replace(/All/g,'All Blocks');
      const co = _mkSelectHtml(classOpts, fState.cls).replace(/All/g,'All Classes');
      // Pre-seed the dropdown state so it reflects existing fState.sections
      const activeSecs = Array.isArray(fState.sections) ? fState.sections : [];
      window['_secDdState_' + prefix] = activeSecs.slice();
      const secDd = _mkSecDropdown(prefix, getSections(), sel => {
        if (prefix === 'pfCur') {
          _pfFilters.sections = sel;
          pfCurApply();
        } else if (prefix === 'pfPrev') {
          _pfPrevFilters.sections = sel;
          pfPrevApply();
        }
      });
      return `
        <div class="card" style="margin-bottom:18px">
          <div class="filter-bar">
            <div class="filter-bar-row1">
              <div class="filter-bar-field">
                <div class="filter-bar-label">Block</div>
                <select id="${prefix}BlockF" class="filter-bar-select" style="min-width:130px" onchange="${prefix}Apply()">
                  ${bo}
                </select>
              </div>
              <div class="filter-bar-field">
                <div class="filter-bar-label">Class</div>
                <select id="${prefix}ClassF" class="filter-bar-select" style="min-width:140px" onchange="${prefix}Apply()">
                  ${co}
                </select>
              </div>
              <div class="filter-bar-field">
                <div class="filter-bar-label">Section</div>
                ${secDd.html}
              </div>
              <div class="filter-bar-field grow">
                <div class="filter-bar-label">Search</div>
                <input type="text" id="${prefix}SearchF" class="filter-bar-input" value="${fState.search||''}" placeholder="Student · Parent · Adm No" oninput="${prefix}Apply()">
              </div>
              <div class="filter-bar-field" style="align-self:flex-end">
                <div class="filter-bar-clear-spacer">-</div>
                <button class="btn btn-ghost btn-sm" onclick="${prefix}Reset()" style="padding:8px 14px;font-size:12px">Clear All</button>
              </div>
            </div>
          </div>
        </div>`;
    }

    // Build table HTML for a sub-section
    function _tableHtml(prefix, titleText, exportSuffix) {
      return `
        <div class="card" style="margin-bottom:18px" id="${prefix}ChartCard">
          <div class="card-hdr"><span class="card-title" id="${prefix}ChartTitle">Outstanding Dues by Class</span></div>
          <div class="card-body" style="padding:18px;overflow-x:auto">
            <canvas id="${prefix}Chart" height="90"></canvas>
            <div id="${prefix}ChartEmpty" style="display:none;text-align:center;padding:24px;color:var(--muted);font-size:13px">No pending dues found for current filters.</div>
          </div>
        </div>
        <div class="card">
          <div class="card-hdr">
            <span class="card-title" id="${prefix}TableTitle">${titleText}</span>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:11px;color:var(--muted)" id="${prefix}TotalDue"></span>
              <button class="btn btn-secondary btn-sm" onclick="${prefix}ExportXLSX()" title="Export as Excel">📊 XLSX</button>
              <button class="btn btn-secondary btn-sm" onclick="${prefix}ExportPDF()" title="Export as PDF">🖨️ PDF</button>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="tbl-wrap">
              <table id="${prefix}Table">
                <thead>
                  <tr>
                    <th>Block</th><th>Name</th><th>Adm#</th><th>Class / Sec</th>
                    <th>Parent</th><th>Contact</th><th>Amount Due</th><th>Last Payment</th><th>Type</th><th>Action</th>
                  </tr>
                </thead>
                <tbody id="${prefix}TableBody">
                  <tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted)">Loading…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
    }

    const blockLabel = currentViewBlock
      ? `<span style="font-size:12px;padding:2px 10px;border-radius:10px;font-weight:600;margin-left:8px;background:${currentViewBlock==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${currentViewBlock==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'}">${currentViewBlock}</span>`
      : '';

    const totalGrand = activePending.reduce((s,r)=>s+r.amountDue,0)
                     + previousYearPending.reduce((s,r)=>s+r.amountDue,0);
    const curCount   = currentYearPending.length;
    const prevCount  = previousYearPending.length;
    const curTotal   = currentYearPending.reduce((s,r)=>s+r.amountDue,0);
    const prevTotal  = previousYearPending.reduce((s,r)=>s+r.amountDue,0);
    const activeAy   = _pfActiveTab === 'prev' ? 'prev' : 'current';

    // ── DASH-SYNC: Push authoritative Due Fee numbers into dashboard cards ────
    // Both _executeRollingDuesRecompute and _psc_recomputeTotalDue compute
    // independently from Firestore and can diverge from the Due Fee page.
    // Overwrite their DOM targets here with the single source of truth.
    // "Accumulated Rolling Dues" card → current-year figures
    const _ds_rollingVal = document.getElementById('psc_rollingDues');
    const _ds_rollingSub = document.getElementById('psc_rollingDuesSub');
    if (_ds_rollingVal) {
      _ds_rollingVal.textContent = new Intl.NumberFormat('en-IN', {
        style:'currency', currency:'INR', maximumFractionDigits:0
      }).format(curTotal);
    }
    if (_ds_rollingSub) {
      const _acYear = _getAcademicYear();
      const _shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      _ds_rollingSub.textContent =
        `${curCount} student${curCount!==1?'s':''} · ${_acYear.label} dues up to ${_shortMonths[nowIST().getMonth()]} →`;
    }
    // "Active Institutional Due Fee Ledger" card → all-years total
    const _ds_ledgerVal   = document.getElementById('inline_psc_totalDue');
    const _ds_ledgerCount = document.getElementById('inline_psc_pendingFeesCount');
    if (_ds_ledgerVal)   _ds_ledgerVal.textContent   = '₹' + fmtNum(totalGrand);
    if (_ds_ledgerCount) _ds_ledgerCount.textContent = `${allPending.length} Account${allPending.length!==1?'s':''} Outstanding`;
    // ── END DASH-SYNC ──────────────────────────────────────────────────────────

    setContent(`
      <!-- ARC-012: Due Fee page with two sub-sections -->
      <div class="page-head flex-between">
        <div>
          <div class="page-title">Due Fee ${blockLabel}</div>
          <div class="page-sub">${yearBreakdownSorted.length > 1 ? yearBreakdownSorted.map(([yr])=>yr).join(', ') : acYear.label} — ${allPending.length} student${allPending.length!==1?'s':''} with outstanding dues · Total ₹${fmtNum(totalGrand)} <span style="font-size:11px;color:var(--warn);margin-left:8px">⚡ Full annual dues shown from Day 1 (monthly fee × 12)</span></div>
        </div>
      </div>

      <!-- ✦ POINT 5: Active Institutional Ledger — shifted into Due Fee module -->
      <div class="card" style="margin-bottom:18px;">
        <div class="card-hdr flex-between" style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <div>
            <span class="card-title" style="display:flex;align-items:center;gap:8px;color:#e05252;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Active Institutional Due Fee Ledger
            </span>
          </div>
          <span style="font-size:11px;font-weight:700;background:rgba(224,82,82,0.15);color:#e09090;padding:4px 12px;border-radius:20px;letter-spacing:0.5px;">SYSTEM AUTO-ROUNDS OVERDUE BALANCES</span>
        </div>
        <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;">
          <div>
            <div style="font-size:11px;text-transform:uppercase;color:var(--muted);letter-spacing:1px;margin-bottom:4px;">Cumulative Outstanding — All Years</div>
            <div id="inline_psc_totalDue" style="font-size:36px;font-weight:700;color:#fff;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;">₹${fmtNum(totalGrand)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:4px;" id="inline_psc_pendingFeesCount">${allPending.length} Account${allPending.length!==1?'s':''} Outstanding</div>
            <span class="btn btn-secondary btn-sm" style="border-color:rgba(255,255,255,0.15);">Full Due Sheet Below ↓</span>
          </div>
        </div>
      </div>

      <!-- ARC-012 KPI summary — per-academic-year breakdown -->
      <div class="stats-grid" id="pfStatsGrid" style="margin-bottom:18px">
        <div class="stat-card red" id="pfStatTotal">
          <div class="stat-label">🔴 Total Students with Dues</div>
          <div class="stat-value">${allPending.length}</div>
          <div class="stat-sub">All years combined</div>
        </div>
        ${yearBreakdownSorted.map(([yr, info]) => {
          const isCur = info.isCurrent;
          const accentColor = isCur ? 'var(--gold-lt)' : 'var(--info)';
          const borderStyle = isCur
            ? 'border-color:rgba(201,168,76,0.45)'
            : 'border-color:rgba(74,158,202,0.35)';
          const icon = isCur ? '📅' : '🕐';
          const label = isCur ? `Current Year (${yr})` : `Prev Year (${yr})`;
          const sub   = isCur
            ? `Fee × 12 minus paid · ${info.count} student${info.count!==1?'s':''}`
            : `Carried forward · ${info.count} student${info.count!==1?'s':''}`;
          return `
            <div class="stat-card" style="${borderStyle}">
              <div class="stat-label">${icon} ${label}</div>
              <div class="stat-value" style="color:${accentColor}">${info.count} · ₹${fmtNum(info.total)}</div>
              <div class="stat-sub">${sub}</div>
            </div>`;
        }).join('')}
      </div>

      <!-- ARC-012: Sub-section tabs -->
      <div class="due-fee-tabs" id="dueFeeTabs">
        <button class="due-fee-tab tab-current ${activeAy==='current'?'active':''}" onclick="pfSwitchTab('current')">
          📅 Current Academic Year Dues
          <span class="due-fee-tab-count" id="tabCountCurrent">${curCount}</span>
        </button>
        ${prevCount > 0 ? `<button class="due-fee-tab tab-prev ${activeAy==='prev'?'active':''}" onclick="pfSwitchTab('prev')">
          🕐 Previous Year Outstanding Dues
          <span class="due-fee-tab-count" id="tabCountPrev">${prevCount}</span>
        </button>` : ''}
      </div>

      <!-- ═══ SUB-SECTION: CURRENT ACADEMIC YEAR ═══ -->
      <div class="due-fee-subsection ${activeAy==='current'?'active':''}" id="pfSubCurrent">
        <div class="alert alert-success" style="margin-bottom:18px">
          <strong>📅 Current Academic Year Dues — ${acYear.label}</strong><br>
          All active students with outstanding dues for the current academic year (full annual fee × 12 minus paid).
        </div>
        ${_filterHtml('pfCur', _pfFilters)}
        ${_tableHtml('pfCur','Current Year Due Records','Current')}
      </div>

      <!-- ═══ SUB-SECTION: PREVIOUS YEAR OUTSTANDING ═══ -->
      <div class="due-fee-subsection ${activeAy==='prev'?'active':''}" id="pfSubPrev">
        <div class="alert alert-info" style="margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
          <div>
            <strong>🕐 Previous Year Outstanding Dues</strong><br>
            Balances carried forward from academic years prior to ${acYear.label}. Click a year card to expand and view the student list. Each year has its own search and filters.
          </div>
          <!-- JSS-REF-VELTRIX-2026-004 ITEM 01: "Recalculate All Dues" button
               (id="reconcileDuesBtn" → reconcileAllStudentDues()) removed from the
               Previous Year Outstanding Dues header. reconcileAllStudentDues() is
               intentionally retained as dead code — nothing else calls it, and deleting
               the function itself is a separate, less-reversible step. -->
        </div>
        <div id="pfPrevAccordion">
          ${(() => {
            // Store all rows per year globally so JS search can re-render
            window._pfPrevYearRows = window._pfPrevYearRows || {};
            const entries = Object.entries(prevYearMap).sort((a,b)=>b[0].localeCompare(a[0]));
            if (!entries.length) return '<div style="text-align:center;padding:40px;color:var(--muted)">No previous year dues found.</div>';

            // Collect unique blocks/classes across all years for filter dropdowns
            const allBlocks  = [...new Set(Object.values(prevYearMap).flat().map(r=>r.block).filter(Boolean))].sort();
            const allClasses = [...new Set(Object.values(prevYearMap).flat().map(r=>r.class).filter(Boolean))].sort((a,b)=>{
              const na=parseInt(a)||0, nb=parseInt(b)||0;
              return na!==nb ? na-nb : a.localeCompare(b);
            });

            return entries.map(([yr, rows]) => {
              const yrTotal = rows.reduce((s,r)=>s+r.amountDue,0);
              const yrId    = 'prevYr_' + yr.replace(/[^a-z0-9]/gi,'_');
              // Store rows so runtime search can filter them
              window._pfPrevYearRows[yrId] = rows;

              const blockOpts  = ['<option value="">All Blocks</option>',  ...allBlocks.map( b=>`<option value="${b}">${b}</option>`)].join('');
              const classOpts  = ['<option value="">All Classes</option>', ...allClasses.map(c=>`<option value="${c}">${c}</option>`)].join('');

              return `
              <div class="card" style="margin-bottom:14px;border-color:rgba(74,158,202,0.30)">
                <div class="card-hdr" style="cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center"
                     onclick="_pfTogglePrevYear('${yrId}',this)">
                  <div style="display:flex;align-items:center;gap:12px">
                    <span style="font-size:16px">🕐</span>
                    <div>
                      <div class="card-title" style="color:var(--info)">Academic Year ${yr}</div>
                      <div style="font-size:12px;color:var(--muted);margin-top:2px">
                        <span id="${yrId}_count">${rows.length}</span> student${rows.length!==1?'s':''} ·
                        <span id="${yrId}_total">₹${fmtNum(yrTotal)}</span> outstanding
                      </div>
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:14px">
                    <span id="${yrId}_headerTotal" style="font-size:22px;font-weight:700;color:var(--info)">₹${fmtNum(yrTotal)}</span>
                    <span id="${yrId}_chevron" style="font-size:18px;color:var(--muted);transition:transform 0.2s">▾</span>
                  </div>
                </div>
                <div id="${yrId}_body" style="display:none">
                  <!-- ── Per-year Search & Filter Bar ── -->
                  <div style="padding:14px 18px;border-bottom:1px solid var(--glass-border);background:rgba(0,0,0,0.18)">
                    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
                      <div style="display:flex;flex-direction:column;gap:4px">
                        <label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Block</label>
                        <select id="${yrId}_blockF" class="filter-bar-select" style="min-width:130px;padding:7px 10px;font-size:12px"
                          onchange="_pfPrevYrSearch('${yrId}')">
                          ${blockOpts}
                        </select>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:4px">
                        <label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Class</label>
                        <select id="${yrId}_classF" class="filter-bar-select" style="min-width:130px;padding:7px 10px;font-size:12px"
                          onchange="_pfPrevYrSearch('${yrId}')">
                          ${classOpts}
                        </select>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px">
                        <label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Search</label>
                        <div style="position:relative">
                          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--muted);pointer-events:none">🔍</span>
                          <input type="text" id="${yrId}_searchF" class="filter-bar-input"
                            style="padding:7px 10px 7px 30px;font-size:12px;width:100%"
                            placeholder="Student name · Adm# · Parent · Class"
                            oninput="_pfPrevYrSearch('${yrId}')">
                        </div>
                      </div>
                      <div style="display:flex;align-items:flex-end">
                        <button class="btn btn-ghost btn-sm" onclick="_pfPrevYrReset('${yrId}')"
                          style="padding:7px 14px;font-size:12px">✕ Clear</button>
                      </div>
                      <div style="display:flex;align-items:flex-end;margin-left:auto">
                        <span id="${yrId}_filterInfo" style="font-size:11px;color:var(--info);opacity:0.8"></span>
                      </div>
                    </div>
                  </div>
                  <!-- ── Table ── -->
                  <div class="card-body" style="padding:0">
                    <div class="tbl-wrap">
                      <table>
                        <thead>
                          <tr><th>Block</th><th>Name</th><th>Adm#</th><th>Class / Sec</th><th>Parent</th><th>Contact</th><th>Amount Due</th><th>Type</th><th>Action</th></tr>
                        </thead>
                        <tbody id="${yrId}_tbody">
                          ${rows.map(row => {
                            const blockBadge = row.block
                              ? `<span style="font-size:10px;background:${row.block==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${row.block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'};padding:2px 7px;border-radius:10px;font-weight:600">${row.block}</span>`
                              : '—';
                            const typeBadge = row.type === 'terminated'
                              ? `<span class="badge badge-red" style="font-size:10px">Terminated</span>`
                              : `<span class="badge badge-green" style="font-size:10px">Active</span>`;
                            const action = (currentRole==='principal' && row.type!=='terminated')
                              ? `<button class="btn btn-primary btn-sm" onclick="navigate('pastDue')">Record Dues</button>`
                              : `<span style="font-size:11px;color:var(--muted)">—</span>`;
                            return `<tr>
                              <td>${blockBadge}</td>
                              <td><strong>${row.name}</strong></td>
                              <td class="muted">${row.admissionNo}</td>
                              <td>${row.class} ${row.section}</td>
                              <td style="font-size:13px">${row.parentName||'—'}</td>
                              <td style="font-size:13px;color:var(--info)">${row.contact||'—'}</td>
                              <td style="color:var(--danger);font-weight:700">₹${fmtNum(row.amountDue)}</td>
                              <td>${typeBadge}</td>
                              <td>${action}</td>
                            </tr>`;
                          }).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>`;
            }).join('');
          })()}
        </div>
      </div>
    `);

    // ── 8. Render current sub-section (previous year uses inline accordion)
    pfCurApply();

  } catch(e) {
    setContent(`<div class="alert alert-danger" style="margin:24px">Error loading Due Fee: ${e.message}</div>`);
  }
}

// ARC-012: Tab switcher — Point 3: hide irrelevant stat cards when a year tray is selected
function pfSwitchTab(tab) {
  _pfActiveTab = tab;
  document.querySelectorAll('.due-fee-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.due-fee-subsection').forEach(s => s.classList.remove('active'));
  const tabBtn = document.querySelector(`.due-fee-tab.tab-${tab==='current'?'current':'prev'}`);
  const tabSec = document.getElementById(tab==='current'?'pfSubCurrent':'pfSubPrev');
  if (tabBtn) tabBtn.classList.add('active');
  if (tabSec) tabSec.classList.add('active');

  // ✦ POINT 3: Context-aware stat card visibility
  const statTotal    = document.getElementById('pfStatTotal');
  const statCurrent  = document.getElementById('pfStatCurrent');
  const statPrev     = document.getElementById('pfStatPrev');

  if (tab === 'current') {
    if (statTotal)   statTotal.style.display   = 'none';
    if (statCurrent) statCurrent.style.display = '';
    if (statPrev)    statPrev.style.display    = 'none';
  } else if (tab === 'prev') {
    if (statTotal)   statTotal.style.display   = 'none';
    if (statCurrent) statCurrent.style.display = 'none';
    if (statPrev)    statPrev.style.display    = '';
  }
}


// ═══════════════════════════════════════════════════════════════
// ARC-012: Per-subsection filter, chart, table, and export logic
// ═══════════════════════════════════════════════════════════════

// ENH-017: Multi-select section toggle helpers for Due Fee sub-sections
// ENH-017 pf toggle functions removed — now using _mkSecDropdown

// Shared helper: filter a pending list by a filter state object
function _pfFilterRows(rows, fState) {
  const f   = fState;
  const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  const sod = d => { const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
  const todayStart     = sod(now);
  const yesterdayStart = todayStart - 86400000;
  const weekStart = (() => {
    const d = new Date(now); d.setHours(0,0,0,0);
    const day = d.getDay(); const diff = day===0?-6:1-day;
    d.setDate(d.getDate()+diff); return d.getTime();
  })();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const ago15      = now.getTime() - 15*86400000;

  function _toMs(val) {
    if (!val) return null;
    if (typeof val === 'object' && val.seconds) return val.seconds * 1000;
    if (val instanceof Date) return val.getTime();
    const p = new Date(val); return isNaN(p.getTime()) ? null : p.getTime();
  }

  function inRange(entry) {
    const r = f.range;
    if (r === 'all') return true;
    if (r === 'custom') {
      if (!f.dateFrom && !f.dateTo) return true;
      const ts = _toMs(entry.lastPayDate) || _toMs(entry.admissionDate) || _toMs(entry.createdAt);
      if (!ts) return true;
      const d = new Date(ts); d.setHours(0,0,0,0);
      if (f.dateFrom && d < new Date(f.dateFrom)) return false;
      if (f.dateTo   && d > new Date(f.dateTo))   return false;
      return true;
    }
    const ts = _toMs(entry.admissionDate) || _toMs(entry.createdAt) || _toMs(entry.lastPayDate);
    if (!ts) return true;
    if (r === 'today')  return ts >= todayStart && ts < todayStart + 86400000;
    if (r === 'yest')   return ts >= yesterdayStart && ts < todayStart;
    if (r === 'week')   return ts >= weekStart;
    if (r === '15d')    return ts >= ago15;
    if (r === 'month')  return ts >= monthStart;
    if (r === 'import') { const cts = _toMs(entry.createdAt); return cts != null; }
    return true;
  }

  let filtered = rows.filter(row => {
    if (f.block && row.block !== f.block) return false;
    if (f.cls   && row.class !== f.cls)  return false;
    // ENH-017: multi-select sections (empty array = all)
    if (Array.isArray(f.sections) && f.sections.length > 0 && !f.sections.includes(row.section)) return false;
    // Legacy single-section fallback (safety)
    if (!Array.isArray(f.sections) && f.section && row.section !== f.section) return false;
    if (!inRange(row)) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!(
        (row.name||'').toLowerCase().includes(q) ||
        (row.admissionNo||'').toLowerCase().includes(q) ||
        (row.block||'').toLowerCase().includes(q) ||
        (row.class||'').toLowerCase().includes(q)
      )) return false;
    }
    return true;
  });

  function classOrder(cls) {
    if (!cls) return 9999;
    const m = cls.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : cls.charCodeAt(0);
  }
  filtered.sort((a, b) => {
    const co = classOrder(a.class) - classOrder(b.class);
    if (co !== 0) return co;
    const so = (a.section||'').localeCompare(b.section||'');
    if (so !== 0) return so;
    return (a.name||'').localeCompare(b.name||'');
  });
  return filtered;
}

// Shared helper: render rows into a table body
function _pfRenderRows(tbodyId, filtered) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted)">No pending dues found for the selected filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(row => {
    const blockBadge = row.block
      ? `<span style="font-size:10px;background:${row.block==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${row.block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'};padding:2px 7px;border-radius:10px;font-weight:600">${row.block}</span>`
      : '—';
    const typeBadge = row.type === 'terminated'
      ? `<span class="badge badge-red" style="font-size:10px">Terminated</span>`
      : `<span class="badge badge-green" style="font-size:10px">Active</span>`;
    const lastPay = row.lastPayDate ? fmtDate(row.lastPayDate) : '<span style="color:var(--muted);font-size:12px">No payments</span>';
    const action  = (currentRole==='principal' && row.type==='active')
      ? `<button class="btn btn-primary btn-sm" onclick="pushNav('recordFee',{studentId:'${row.studentId}',studentName:'${(row.name||'').replace(/'/g,"\\'")}',classSection:'${row.class} \u2013 Section ${row.section}'})" >Record Payment</button>`
      : (currentRole==='principal' && row.type==='terminated')
      ? `<button class="btn btn-secondary btn-sm" onclick="navigate('terminated')">View Terminated</button>`
      : `<span style="font-size:11px;color:var(--muted)">—</span>`;
    return `<tr>
      <td>${blockBadge}</td>
      <td><strong>${row.name}</strong></td>
      <td class="muted">${row.admissionNo}</td>
      <td>${row.class} ${row.section}</td>
      <td style="font-size:13px">${row.parentName||'—'}</td>
      <td style="font-size:13px;color:var(--info)">${row.contact||'—'}</td>
      <td style="color:var(--danger);font-weight:700">₹${fmtNum(row.amountDue)}</td>
      <td>${lastPay}</td>
      <td>${typeBadge}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
}

// Shared helper: render chart for a sub-section
let _pfCurChart  = null;
let _pfPrevChart = null;
function _pfRenderSubChart(canvasId, emptyId, titleId, filtered, filtersCls, accentColor) {
  const canvas   = document.getElementById(canvasId);
  const emptyDiv = document.getElementById(emptyId);
  const chartRef = canvasId.includes('Cur') ? '_pfCurChart' : '_pfPrevChart';

  if (window[chartRef]) { window[chartRef].destroy(); window[chartRef] = null; }
  if (!canvas) return;

  if (filtered.length === 0) {
    canvas.style.display = 'none';
    if (emptyDiv) emptyDiv.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyDiv) emptyDiv.style.display = 'none';

  const selectedClass = (filtersCls || '').trim();
  const isSectionMode = selectedClass !== '';

  let labels, data;
  if (isSectionMode) {
    const sectionMap = {};
    filtered.forEach(row => { const k = row.section||'Unknown'; sectionMap[k] = (sectionMap[k]||0) + row.amountDue; });
    labels = Object.keys(sectionMap).sort();
    data   = labels.map(l => sectionMap[l]);
    const titleEl = document.getElementById(titleId);
    if (titleEl) titleEl.textContent = `Records — ${selectedClass}`;
  } else {
    const classMap = {};
    filtered.forEach(row => { const k = row.class||'Unknown'; classMap[k] = (classMap[k]||0) + row.amountDue; });
    const canonicalOrder = getClassList();
    const canonicalSet   = new Set(canonicalOrder);
    const knownLabels    = canonicalOrder.filter(c => c in classMap);
    const unknownLabels  = Object.keys(classMap).filter(c => !canonicalSet.has(c)).sort();
    labels = [...knownLabels, ...unknownLabels];
    data   = labels.map(l => classMap[l]);
  }

  const ctx = canvas.getContext('2d');
  window[chartRef] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Outstanding (\u20B9)', data, backgroundColor: labels.map(() => accentColor), borderColor: accentColor.replace('0.7','0.9'), borderWidth:1, borderRadius:4 }]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{ label: ctx => '\u20B9'+fmtNum(ctx.parsed.y) } } },
      scales: {
        x: { ticks:{ color:'#6a8f73', font:{size:11} }, grid:{ color:'rgba(201,168,76,0.08)' } },
        y: { ticks:{ color:'#6a8f73', font:{size:11}, callback: v => '\u20B9'+fmtNum(v) }, grid:{ color:'rgba(201,168,76,0.12)' } }
      }
    }
  });
}

// ── CURRENT YEAR sub-section ─────────────────────────────────────────
function pfCurApply() {
  _pfFilters = {
    block:    (document.getElementById('pfCurBlockF')?.value  || '').trim(),
    cls:      (document.getElementById('pfCurClassF')?.value  || '').trim(),
    sections: _secDdGet('pfCur'),  // read from dropdown
    range:    _pfFilters?.range    || 'all',
    dateFrom: _pfFilters?.dateFrom || '',
    dateTo:   _pfFilters?.dateTo   || '',
    search:   (document.getElementById('pfCurSearchF')?.value || '').trim(),
  };
  const filtered = _pfFilterRows(window._pfCurrentPending || [], _pfFilters);
  const totalDue = filtered.reduce((s,r)=>s+r.amountDue,0);
  const totEl = document.getElementById('pfCurTotalDue');
  if (totEl) totEl.textContent = filtered.length > 0 ? `Total: \u20B9${fmtNum(totalDue)}` : '';
  window._pfCurFiltered = filtered;
  window._pfCurTotalDue = totalDue;
  _pfRenderSubChart('pfCurChart','pfCurChartEmpty','pfCurTableTitle', filtered, _pfFilters.cls, 'rgba(201,168,76,0.70)');
  _pfRenderRows('pfCurTableBody', filtered);
}
function pfCurReset() {
  _pfFilters = { block:'', cls:'', sections:[], range:'all', dateFrom:'', dateTo:'', search:'' };
  ['pfCurBlockF','pfCurClassF','pfCurSearchF'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  // Reset section dropdown
  window._secDdState_pfCur = [];
  window._secDdRegistry?.pfCur?.syncUI?.();
  pfCurApply();
}
function pfCurExportXLSX() {
  const rows = window._pfCurFiltered || [];
  if (!rows.length) { showToast('No data to export.','warning'); return; }
  const acYear = _getAcademicYear();
  const d_now = new Date(); const dateStr = d_now.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})+', '+d_now.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});
  const wsData = [
    [`CURRENT YEAR DUE FEE — ${acYear.label}`, `Block: ${currentViewBlock||'All'}`, `Date: ${dateStr}`, `Total: \u20B9${fmtNum(window._pfCurTotalDue||0)}`],
    [],
    ['Block','Name','Adm#','Class','Section','Parent','Contact','Amount Due','Last Payment','Type'],
    ...rows.map(r=>[r.block,r.name,r.admissionNo,r.class,r.section,r.parentName||'—',r.contact||'—',r.amountDue,r.lastPayDate?fmtDate(r.lastPayDate):'—',r.type])
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [14,22,14,12,10,20,14,14,16,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Current Year Dues');
  XLSX.writeFile(wb, `CurrentYearDues_${acYear.label}.xlsx`);
  showToast('Excel exported.','success');
}
async function pfCurExportPDF() {
  const rows = window._pfCurFiltered || [];
  if (!rows.length) { showToast('No data to export.','warning'); return; }
  const acYear = _getAcademicYear();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const dateStr = new Date().toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'});
  doc.setFontSize(14); doc.setTextColor(45,110,62);
  doc.text(`CURRENT YEAR DUE FEE — ${acYear.label}`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(100,143,115);
  doc.text(`Block: ${currentViewBlock||'All'}  |  Generated: ${dateStr}  |  Total: \u20B9${fmtNum(window._pfCurTotalDue||0)}`, 14, 23);
  doc.autoTable({
    startY:28,
    head:[['Block','Name','Adm#','Class','Section','Parent','Contact','Amount Due','Last Payment','Type']],
    body:rows.map(r=>[r.block,r.name,r.admissionNo,r.class,r.section,r.parentName||'—',r.contact||'—','\u20B9'+fmtNum(r.amountDue),r.lastPayDate?fmtDate(r.lastPayDate):'—',r.type]),
    headStyles:{fillColor:[45,110,62],textColor:255,fontSize:8},
    bodyStyles:{fontSize:8},
    alternateRowStyles:{fillColor:[245,252,247]}
  });
  doc.save(`CurrentYearDues_${acYear.label.replace(/[–\s]/g,'_')}.pdf`);
  showToast('PDF exported.','success');
}

// ── PREVIOUS YEAR sub-section ─────────────────────────────────────────
function pfPrevApply() {
  // ENH-017-UNIFIED: sections read from _mkSecDropdown state
  _pfPrevFilters = {
    block:    (document.getElementById('pfPrevBlockF')?.value  || '').trim(),
    cls:      (document.getElementById('pfPrevClassF')?.value  || '').trim(),
    sections: _secDdGet('pfPrev'),  // read from dropdown
    range:    _pfPrevFilters?.range    || 'all',
    dateFrom: _pfPrevFilters?.dateFrom || '',
    dateTo:   _pfPrevFilters?.dateTo   || '',
    search:   (document.getElementById('pfPrevSearchF')?.value || '').trim(),
  };
  const filtered = _pfFilterRows(window._pfPrevPending || [], _pfPrevFilters);
  const totalDue = filtered.reduce((s,r)=>s+r.amountDue,0);
  const totEl = document.getElementById('pfPrevTotalDue');
  if (totEl) totEl.textContent = filtered.length > 0 ? `Total: \u20B9${fmtNum(totalDue)}` : '';
  window._pfPrevFiltered = filtered;
  window._pfPrevTotalDue = totalDue;
  _pfRenderSubChart('pfPrevChart','pfPrevChartEmpty','pfPrevTableTitle', filtered, _pfPrevFilters.cls, 'rgba(74,158,202,0.70)');
  _pfRenderRows('pfPrevTableBody', filtered);
}
function pfPrevReset() {
  _pfPrevFilters = { block:'', cls:'', sections:[], range:'all', dateFrom:'', dateTo:'', search:'' };
  ['pfPrevBlockF','pfPrevClassF','pfPrevSearchF'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  // Reset section dropdown
  window._secDdState_pfPrev = [];
  window._secDdRegistry?.pfPrev?.syncUI?.();
  pfPrevApply();
}
function pfPrevExportXLSX() {
  const rows = window._pfPrevFiltered || [];
  if (!rows.length) { showToast('No data to export.','warning'); return; }
  const acYear = _getAcademicYear();
  const d_now = new Date(); const dateStr = d_now.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})+', '+d_now.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});
  const wsData = [
    [`PREVIOUS YEAR OUTSTANDING DUES (before ${acYear.label})`, `Block: ${currentViewBlock||'All'}`, `Date: ${dateStr}`, `Total: \u20B9${fmtNum(window._pfPrevTotalDue||0)}`],
    [],
    ['Block','Name','Adm#','Class','Section','Parent','Contact','Amount Due','Last Payment','Type'],
    ...rows.map(r=>[r.block,r.name,r.admissionNo,r.class,r.section,r.parentName||'—',r.contact||'—',r.amountDue,r.lastPayDate?fmtDate(r.lastPayDate):'—',r.type])
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [14,22,14,12,10,20,14,14,16,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Previous Year Dues');
  XLSX.writeFile(wb, `PreviousYearDues_before_${acYear.label.replace(/[–\s]/g,'_')}.xlsx`);
  showToast('Excel exported.','success');
}
async function pfPrevExportPDF() {
  const rows = window._pfPrevFiltered || [];
  if (!rows.length) { showToast('No data to export.','warning'); return; }
  const acYear = _getAcademicYear();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const dateStr = new Date().toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'});
  doc.setFontSize(14); doc.setTextColor(45,110,62);
  doc.text(`PREVIOUS YEAR OUTSTANDING DUES — before ${acYear.label}`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(100,143,115);
  doc.text(`Block: ${currentViewBlock||'All'}  |  Generated: ${dateStr}  |  Total: \u20B9${fmtNum(window._pfPrevTotalDue||0)}`, 14, 23);
  doc.autoTable({
    startY:28,
    head:[['Block','Name','Adm#','Class','Section','Parent','Contact','Amount Due','Last Payment','Type']],
    body:rows.map(r=>[r.block,r.name,r.admissionNo,r.class,r.section,r.parentName||'—',r.contact||'—','\u20B9'+fmtNum(r.amountDue),r.lastPayDate?fmtDate(r.lastPayDate):'—',r.type]),
    headStyles:{fillColor:[30,90,160],textColor:255,fontSize:8},
    bodyStyles:{fontSize:8},
    alternateRowStyles:{fillColor:[240,248,255]}
  });
  doc.save(`PreviousYearDues_before_${acYear.label.replace(/[–\s]/g,'_')}.pdf`);
  showToast('PDF exported.','success');
}

// Legacy stubs — keep for any external references
function pfApplyFilters() { pfCurApply(); }
function pfResetFilters()  { pfCurReset(); }

// Toggle a previous-year accordion card open/closed
function _pfTogglePrevYear(yrId, headerEl) {
  const body    = document.getElementById(yrId + '_body');
  const chevron = document.getElementById(yrId + '_chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display    = isOpen ? 'none'   : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  if (chevron) chevron.style.color     = isOpen ? 'var(--muted)' : 'var(--info)';
}

// ── Per-year accordion search/filter (Previous Year tab) ──────────────────
function _pfPrevYrSearch(yrId) {
  const allRows = (window._pfPrevYearRows || {})[yrId] || [];
  const block   = (document.getElementById(yrId + '_blockF')?.value  || '').trim();
  const cls     = (document.getElementById(yrId + '_classF')?.value  || '').trim();
  const q       = (document.getElementById(yrId + '_searchF')?.value || '').trim().toLowerCase();

  const filtered = allRows.filter(row => {
    if (block && row.block !== block) return false;
    if (cls   && row.class !== cls)   return false;
    if (q && !(
      (row.name       || '').toLowerCase().includes(q) ||
      (row.admissionNo|| '').toLowerCase().includes(q) ||
      (row.parentName || '').toLowerCase().includes(q) ||
      (row.class      || '').toLowerCase().includes(q) ||
      (row.contact    || '').toLowerCase().includes(q)
    )) return false;
    return true;
  });

  const tbody     = document.getElementById(yrId + '_tbody');
  const infoEl    = document.getElementById(yrId + '_filterInfo');
  const totalEl   = document.getElementById(yrId + '_headerTotal');
  const subEl     = document.getElementById(yrId + '_total');
  const countEl   = document.getElementById(yrId + '_count');
  const filteredTotal = filtered.reduce((s,r)=>s+r.amountDue,0);

  if (infoEl) {
    const isFiltered = block || cls || q;
    infoEl.textContent = isFiltered
      ? `Showing ${filtered.length} of ${allRows.length} · ₹${fmtNum(filteredTotal)}`
      : '';
  }
  if (totalEl) totalEl.textContent = '₹' + fmtNum(filteredTotal);
  if (subEl)   subEl.textContent   = '₹' + fmtNum(filteredTotal);
  if (countEl) countEl.textContent = filtered.length;

  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--muted)">No students match the selected filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(row => {
    const blockBadge = row.block
      ? `<span style="font-size:10px;background:${row.block==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${row.block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'};padding:2px 7px;border-radius:10px;font-weight:600">${row.block}</span>`
      : '—';
    const typeBadge = row.type === 'terminated'
      ? `<span class="badge badge-red" style="font-size:10px">Terminated</span>`
      : `<span class="badge badge-green" style="font-size:10px">Active</span>`;
    const action = (currentRole==='principal' && row.type!=='terminated')
      ? `<button class="btn btn-primary btn-sm" onclick="navigate('pastDue')">Record Dues</button>`
      : `<span style="font-size:11px;color:var(--muted)">—</span>`;
    return `<tr>
      <td>${blockBadge}</td>
      <td><strong>${row.name}</strong></td>
      <td class="muted">${row.admissionNo}</td>
      <td>${row.class} ${row.section}</td>
      <td style="font-size:13px">${row.parentName||'—'}</td>
      <td style="font-size:13px;color:var(--info)">${row.contact||'—'}</td>
      <td style="color:var(--danger);font-weight:700">₹${fmtNum(row.amountDue)}</td>
      <td>${typeBadge}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
}

function _pfPrevYrReset(yrId) {
  const blockF  = document.getElementById(yrId + '_blockF');
  const classF  = document.getElementById(yrId + '_classF');
  const searchF = document.getElementById(yrId + '_searchF');
  if (blockF)  blockF.value  = '';
  if (classF)  classF.value  = '';
  if (searchF) searchF.value = '';
  _pfPrevYrSearch(yrId);
}
// DEAD-CODE SWEEP: removed _pfRenderChart / _pfShowExports / _pfHideExports — empty no-op stubs
// with zero callers (chart rendering moved to _pfRenderSubChart; export controls are always visible).
function exportDueFeeXLSX()     { pfCurExportXLSX(); }
async function exportDueFeePDF(){ await pfCurExportPDF(); }
async function exportPendingFeePdf() { await pfCurExportPDF(); }
function exportPendingFeeXls()  { pfCurExportXLSX(); }



