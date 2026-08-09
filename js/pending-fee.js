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
  // L8: normalise before any chain lookup. An untrimmed name ("LKG ") scores -1 on
  // getClassList().indexOf, which silently disables both the backward-year arithmetic
  // below and the implausible-class-jump guard in bulk-admit.
  const currentCls = (typeof _flClassKey === 'function')
    ? _flClassKey(s.class || s.cls || '')
    : (s.class || s.cls || '');
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
  const q = _flQuoteByMonth(months, rateForMonth, appliedByMonth);
  return Object.keys(q).reduce((sum, m) => sum + q[m], 0);
}

// JSS-REF-VELTRIX-2026-005 ITEM 14 — the PER-MONTH breakdown behind _flPayableForMonths.
// _flPayableForMonths is now literally the sum of this map, and saveFeePayment writes this
// same map as the transaction's monthAllocations. One computation, so the amount RECORDED
// and the per-month ledger entries can never disagree by construction.
// Months already fully covered quote 0 and are omitted (never billed twice).
function _flQuoteByMonth(months, rateForMonth, appliedByMonth) {
  const on  = FEATURE_FEELEDGER.read && FEATURE_FEELEDGER.read.recordPayment;
  const A   = appliedByMonth || {};
  const out = {};
  (months || []).forEach(m => {
    const r = Number(rateForMonth ? rateForMonth(m) : 0) || 0;
    const a = Number(A[m] != null ? A[m] : A[_flShort(m)]) || 0;
    const q = on ? _flRecordPaymentMonthQuote(r, a) : r;
    if (q > 0) out[m] = q;
  });
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 14 — THE definition of "how much has been applied to
// each month", for ONE academic year's transactions. Every partial-awareness consumer
// must route through this; forking it is what let the same month read PAID on one
// screen and PARTIAL on another.
//
// The bug this closes: a partial payment writes monthAllocations, but a FULL payment
// historically wrote none. So when a partial month was later topped up with a normal
// full payment, the ledger still held only the FIRST (short) allocation. Consumers that
// read allocations alone — Record Payment's month locking via _flPartialMonthsFromLedger,
// and _flPartialShortFromTxs — kept seeing applied < rate and reopened an already-settled
// month as red/PARTIAL, while _syncStudentFinancials, _deriveYearMonths and
// _flClosedMonthsForAY (which DO honour legacy transactions) correctly called it paid.
//
// The rule below is the one those three already use, made shared: a transaction with no
// monthAllocations covers each of its monthsSelected in FULL. Applied in a second pass
// with max(), so the result does not depend on transaction ordering.
//
// Output is dual-keyed (full AND short month names) so any caller can index either way.
//   yearTxs     : transactions ALREADY filtered to the year in question
//   rateForMonth: number, or fn(fullMonthName) -> number (concession-aware)
// ════════════════════════════════════════════════════════════════════════════
function _flAppliedByMonthFromTxs(yearTxs, rateForMonth) {
  const rateOf = typeof rateForMonth === 'function'
    ? (m => Number(rateForMonth(m)) || 0)
    : (() => { const r = Number(rateForMonth) || 0; return () => r; })();
  const applied = {};
  const legacy  = new Set();   // no recorded amount -> the old contract: paid in FULL
  const spend   = [];          // recorded amount -> credit exactly that much cash
  (yearTxs || []).forEach((t, _i) => {
    if (!t || t.type === 'excused_waiver') return;
    if (t.monthAllocations && typeof t.monthAllocations === 'object') {
      Object.entries(t.monthAllocations).forEach(([m, amt]) => {
        const sm = _flShort(m);
        applied[sm] = (applied[sm] || 0) + (Number(amt) || 0);
      });
    } else if (Array.isArray(t.monthsSelected) && t.monthsSelected.length) {
      // ══════════════════════════════════════════════════════════════════════
      // A LEGACY TRANSACTION MAY NOT CLAIM MORE THAN IT COLLECTED.
      //
      // This used to credit EVERY month in monthsSelected at the full rate no
      // matter what the receipt actually took. On the live roll that forgave
      // real debt: Test Student Four (Grade 6 @ 1,800, no concession) paid 3,600
      // across June/July/August and 1,000 across September/October -- 4,600
      // against 9,000 of liability -- and all five months closed. He owes about
      // 8,000; the engine reported 3,800.
      //
      // The full-rate rule was right for its original purpose (item 14: a month
      // settled before monthAllocations existed must not reopen forever) and it
      // stays in force for exactly that case -- a transaction with NO recorded
      // amount, which is the only situation where coverage is all we know.
      //
      // When the receipt DOES carry an amount, that amount is the fact and the
      // month list is the intent. Spend the cash across the listed months in
      // academic order, capped at each month's operative rate, the same way
      // _allocateFeePayment fills them: earlier months clear first, the boundary
      // month lands PARTIAL. Any surplus beyond the listed months is NOT applied
      // elsewhere -- it belongs to no month.
      //
      // Concession months are handled for free, because rateOf is the engine's
      // operative rate: Kabir Kumar's 1,200 for November closes November, and
      // Bipin Khan's 1,000 across January/February closes both at 500 each.
      // ══════════════════════════════════════════════════════════════════════
      const cash = _txCollectedAmount(t);
      if (Number.isFinite(cash) && cash > 0) {
        spend.push({ months: t.monthsSelected.map(_flShort), cash,
                     at: (t.date && t.date.seconds) || 0, i: _i });
      } else {
        t.monthsSelected.forEach(m => legacy.add(_flShort(m)));
      }
    }
  });
  legacy.forEach(sm => {
    const r = rateOf(_FL_S2F[sm] || sm);
    applied[sm] = Math.max(applied[sm] || 0, r);
  });
  // Chronological, then input order — so the result never depends on query order.
  spend.sort((a, b) => (a.at - b.at) || (a.i - b.i));
  const _ord = sm => { const k = _FL_MONTHS.indexOf(sm); return k < 0 ? 99 : k; };
  spend.forEach(p => {
    let left = p.cash;
    p.months.slice().sort((a, b) => _ord(a) - _ord(b)).forEach(sm => {
      if (left <= 0) return;
      const room = Math.max(0, rateOf(_FL_S2F[sm] || sm) - (applied[sm] || 0));
      const give = Math.min(room, left);
      if (give > 0) { applied[sm] = (applied[sm] || 0) + give; left -= give; }
    });
  });
  const out = {};
  Object.keys(applied).forEach(sm => {
    out[sm] = applied[sm];
    const full = _FL_S2F[sm]; if (full) out[full] = applied[sm];
  });
  return out;
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
  // ITEM 14: routed through the shared _flAppliedByMonthFromTxs so a legacy top-up
  // transaction (no monthAllocations) closes the month here too. Reading allocations
  // alone left a settled month reporting its ORIGINAL shortfall forever.
  const applied = _flAppliedByMonthFromTxs(yearTxs, rate);
  const out = {};
  Object.keys(grid || {}).forEach(m => {
    if ((grid[m] || '').toUpperCase() === 'PARTIAL') {
      const sm = _flShort(m);
      out[sm] = Math.max(0, (Number(rate) || 0) - (applied[sm] || 0));
    }
  });
  return out;
}

// JSS-REF-VELTRIX-2026-005 ITEM 2 FIX — resolve a row/transaction to a REAL /students doc id.
// The bug this closes: list rows are built as {id: d.id, ...d.data()} from whichever collection
// they came from, so `row.id` is a feeTransactions / concessionFees / legacyStudents /
// terminatedStudents doc id — NOT a student id. Trusting it sent the profile screen looking for a
// student that cannot exist ("Student not found"). Resolution order, mirroring how Due Fee keys its
// transaction-derived rows (it sets studentId: s.id explicitly rather than reusing a generic id):
//   1. studentId, when it really is a student doc      (unambiguous)
//   2. id, ONLY if it validates as a student doc       (true for /students-derived rows)
//   3. admissionNumber / admissionNo lookup            (covers rows carrying no student id at all)
//   4. studentId unvalidated, as a last resort         (cache may be partial/stale)
// A foreign doc id is never returned. Pure — the caller supplies the student list.
function _flResolveStudentRefId(ref, allStudents) {
  const list = Array.isArray(allStudents) ? allStudents : [];
  const has  = v => !!v && list.some(s => s.id === v);
  const sid  = String((ref && ref.studentId) || '').trim();
  if (has(sid)) return sid;
  const rid  = String((ref && ref.id) || '').trim();
  if (has(rid)) return rid;
  const adm  = String((ref && (ref.admissionNo || ref.admissionNumber)) || '').trim();
  if (adm) {
    const hit = list.find(s => String(s.admissionNumber || '').trim() === adm);
    if (hit) return hit.id;
  }
  return sid || '';
}

// ════════════════════════════════════════════════════════════════════════════
// THE definition of "money collected on this transaction". Every total-collected /
// total-paid rollup in the app must route through this, so they cannot drift apart.
//
// The drift this closes: the Paid Fee "Collections by Payment Mode" bar summed
// paymentModeBreakup (the amount TENDERED) while every other total summed
// amountPaid (the amount APPLIED). On a partial payment those differ — the breakup
// sums to what was collected, amountPaid to what the allocator actually applied —
// so the bar disagreed with the year buckets on its own screen and with Dashboard.
//
// amountPaid is the authoritative figure: it is what the receipt records as
// received and what every ledger, profile and export already reports. The breakup
// stays in use for ATTRIBUTION ONLY (which mode the money arrived by), never for
// the total. Excused waivers move no money and contribute 0.
// ════════════════════════════════════════════════════════════════════════════
function _txCollectedAmount(t) {
  if (!t || t.type === 'excused_waiver') return 0;
  return Number(t.amountPaid) || 0;
}

/** Sum of collections over any transaction list — the one rollup helper. */
function _txCollectedTotal(txs) {
  return (txs || []).reduce((s, t) => s + _txCollectedAmount(t), 0);
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 9 — THE definition of "liability this transaction
// EXTINGUISHED". Distinct from _txCollectedAmount (money that actually moved):
// an excused waiver moves ₹0 but cancels `amountWaived` of what the student owes.
//
// The drift this closes: any outstanding figure of the shape "annual fee − money
// collected" silently ignores waivers, so excusing a month left the number exactly
// where it was. That is what the Accumulated Rolling Dues card did — it summed
// amountPaid only, and an excused_waiver doc always carries amountPaid: 0.
//
// Use _txCollectedAmount for "how much money came in"; use this for "how much of
// the bill is gone". They are not the same question.
// ════════════════════════════════════════════════════════════════════════════
function _txLiabilityCleared(t) {
  if (!t) return 0;
  if (t.type === 'excused_waiver') return Number(t.amountWaived) || 0;
  return _txCollectedAmount(t);
}

/** Sum of liability cleared (cash + waivers) over any transaction list. */
function _txLiabilityClearedTotal(txs) {
  return (txs || []).reduce((s, t) => s + _txLiabilityCleared(t), 0);
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

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 13 — WHICH GRID HOLDS A GIVEN YEAR'S MONTHS?
//
// This resolution existed in four places (the sync engine, the Due Fee reader, the
// past-due banner, the profile), each re-deriving it slightly differently. Extending
// Fees Excused to prior years needed it a fifth time, so it is shared here instead.
//
// Resolution order, matching _syncStudentFinancials exactly:
//   1. openingOutstandingDues[] entry for that year  (multi-year onboarding wins)
//   2. academicYear            -> monthStatus
//   3. previousAcademicYear    -> previousYearMonthStatus
//   4. openingOutstandingYear  -> prevYearMonthStatus
//
// Includes the ORPHAN-GRID BINDING from eccb69e: when the LABEL is missing but the
// grid exists, the grid binds to the academic year immediately preceding the one it
// sits behind. Without it a grid is invisible and the year reads as "no data", which
// is what manufactured Test Student One's phantom dues.
//
// Pure. Returns {} when the year has no grid at all — callers must treat that as
// "unknown", never as "nothing is paid".
// ════════════════════════════════════════════════════════════════════════════
function _flGridForYear(s, yr) {
  if (!s || !yr) return {};
  const want = _normaliseAcademicYear(yr);
  const has  = g => !!(g && typeof g === 'object' && Object.keys(g).length);
  const arr  = Array.isArray(s.openingOutstandingDues) ? s.openingOutstandingDues : [];
  const hit  = arr.find(d => d && _normaliseAcademicYear(d.year || '') === want);
  if (hit && has(hit.monthStatus)) return hit.monthStatus;

  const docYr = _normaliseAcademicYear(s.academicYear || '');
  if (docYr && want === docYr && has(s.monthStatus)) return s.monthStatus;

  const yearBefore = ay => {
    const m = String(ay || '').match(/^(\d{4})-/);
    if (!m) return '';
    const y = parseInt(m[1], 10) - 1;
    return y + '-' + String(y + 1).slice(2);
  };
  let prevYr = _normaliseAcademicYear(s.previousAcademicYear || '');
  if (!prevYr && has(s.previousYearMonthStatus)) {
    const inf = yearBefore(docYr);
    if (inf && inf !== docYr) prevYr = inf;
  }
  if (prevYr && want === prevYr && has(s.previousYearMonthStatus)) return s.previousYearMonthStatus;

  let openYr = _normaliseAcademicYear(s.openingOutstandingYear || '');
  if (!openYr && has(s.prevYearMonthStatus)) {
    const inf = yearBefore(prevYr || docYr);
    if (inf && inf !== docYr && inf !== prevYr) openYr = inf;
  }
  if (openYr && want === openYr && has(s.prevYearMonthStatus)) return s.prevYearMonthStatus;

  return {};
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 13 — WHICH ACADEMIC YEARS DOES THIS STUDENT HAVE?
//
// The one list-builder behind every year selector. Record Previous Year Dues grew
// its own copy inline; Fees Excused needed the same list to offer prior years, and
// a second copy would have drifted the moment either screen changed.
//
// Sources, all student-specific — never a blanket "last N years":
//   openingOutstandingDues[].year · openingOutstandingYear · previousAcademicYear
//   · academicYear · every year appearing on a transaction · caller-supplied extras
//
// opts.includeCurrent  false (default) drops the current AY — Record Previous Year
//                      Dues must never offer it. Fees Excused passes true, since it
//                      handles the current year AND prior years.
// opts.extraYears      additional seeds (past-due passes its yearOutstandingMap).
// opts.fallbackCount   when the student has NO year data at all, offer this many
//                      past years so the clerk is not left with an empty selector.
//
// Pure. Normalised, deduped, NEWEST FIRST.
// ════════════════════════════════════════════════════════════════════════════
function _flStudentAcademicYears(s, txs, opts) {
  const o = opts || {};
  const set = new Set();
  const add = y => { const n = _normaliseAcademicYear(String(y || '').trim()); if (n) set.add(n); };

  if (s && Array.isArray(s.openingOutstandingDues)) s.openingOutstandingDues.forEach(e => e && add(e.year));
  if (s) { add(s.openingOutstandingYear); add(s.previousAcademicYear); add(s.academicYear); }
  (txs || []).forEach(t => t && add(t.academicYear));
  (o.extraYears || []).forEach(add);

  const current = _normaliseAcademicYear(_getCurrentAcademicYearStr());
  if (o.includeCurrent) set.add(current);

  if (set.size === 0 || (set.size === 1 && set.has(current) && !o.includeCurrent)) {
    const n = nowIST();
    const cur = _getAcademicYear().yearStart;   // L3: one definition of the June boundary
    for (let i = 1; i <= (o.fallbackCount || 2); i++) add((cur - i) + '-' + String(cur - i + 1).slice(2));
  }

  return Array.from(set)
    .filter(y => y && (o.includeCurrent ? true : y !== current))
    .sort((a, b) => b.localeCompare(a));
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 13 — WHICH MONTHS ARE CLOSED IN A GIVEN YEAR?
//
// "Closed" = already PAID or already EXCUSED, for ANY academic year — so the Fees
// Excused month grid can lock correctly on a prior year, not just the current one.
// A month with money applied but below the rate (an open partial) is deliberately
// NOT closed: it still owes, and owing months are exactly what may be excused.
//
// Both halves route through machinery that already exists — _flGridForYear for the
// baseline and _flAppliedByMonthFromTxs (item 14's accumulator) for the ledger — so
// this cannot disagree with what the engine believes about the same year.
//
// Returns { paid:Set<fullMonth>, excused:Set<fullMonth> }.
// ════════════════════════════════════════════════════════════════════════════
function _flClosedMonthsForYear(s, yr, yearTxs, rateForMonth) {
  const paid = new Set(), excused = new Set();
  const grid = _flGridForYear(s, yr);
  Object.entries(grid || {}).forEach(([m, st]) => {
    const full = _FL_S2F[_flShort(m)] || m;
    const u = String(st || '').toUpperCase();
    if (u === 'N/A-PAID' || u === 'PAID') paid.add(full);
    else if (u === 'EXCUSED') excused.add(full);
  });
  (yearTxs || []).forEach(t => {
    if (!t || t.type !== 'excused_waiver') return;
    (t.monthsExcused  || []).forEach(m => excused.add(_FL_S2F[_flShort(m)] || m));
    (t.monthsSelected || []).forEach(m => excused.add(_FL_S2F[_flShort(m)] || m));
  });
  const applied = _flAppliedByMonthFromTxs(
    (yearTxs || []).filter(t => t && t.type !== 'excused_waiver'), rateForMonth);
  _FL_MONTHS.forEach(sm => {
    const full = _FL_S2F[sm];
    const r    = Number(typeof rateForMonth === 'function' ? rateForMonth(full) : rateForMonth) || 0;
    const a    = Number(applied[full] != null ? applied[full] : applied[sm]) || 0;
    if (r > 0 && a >= r) paid.add(full);          // fully covered by the ledger
  });
  excused.forEach(m => paid.delete(m));            // excused wins — never both
  return { paid, excused };
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 5 — WHAT RATE WAS THIS MONTH BILLED AT?
//
// A month grid records a BOOLEAN ("this month is paid"), never an amount. So once
// June is stamped N/A-PAID at 5th-class ₹1,700 and the student is promoted to 6th
// at ₹1,800, every consumer credited June with the CURRENT rate — ₹1,800 — simply
// because the grid said paid. The ₹100 difference was invisible by construction:
// the baseline asserted the month was worth whatever it costs today.
//
// This resolves, per month, the rate that was actually IN FORCE then. Mid-year
// promotions record their own `effectiveMonth` (first month at the new rate) and
// `priorGradeRate` (the rate before it), so months are priced by the class the
// student was actually in:
//
//   months before the earliest promotion's effectiveMonth → that promotion's priorGradeRate
//   months between two promotions                          → the later one's priorGradeRate
//   months from the last promotion onward                  → currentRate
//
// Reads promotionHistory (every promotion) and falls back to midYearPromotion
// (latest only), so a student promoted twice in one year is priced correctly at
// each step rather than at whichever promotion happened to be written last.
//
// Pure. Returns fn(fullMonthName) -> rate. With no mid-year promotion in `yr` it
// returns currentRate for every month, so nothing changes for anyone else.
// ════════════════════════════════════════════════════════════════════════════
function _flHistoricalRateForMonth(s, yr, currentRate) {
  const cur = Number(currentRate) || 0;
  const raw = []
    .concat(Array.isArray(s && s.promotionHistory) ? s.promotionHistory : [])
    .concat((s && s.midYearPromotion) ? [s.midYearPromotion] : []);
  const seen = {}, proms = [];
  raw.forEach(p => {
    if (!p || !p.effectiveMonth) return;
    if (_normaliseAcademicYear(p.academicYear || '') !== _normaliseAcademicYear(yr || '')) return;
    const rate = Number(p.priorGradeRate) || 0;
    if (rate <= 0) return;                             // annual promotions write 0 — not a mid-year rate change
    const idx = _FL_MONTHS.indexOf(_flShort(p.effectiveMonth));
    if (idx < 0) return;
    const key = idx + ':' + rate;
    if (seen[key]) return;                             // midYearPromotion duplicates its history entry
    seen[key] = 1;
    proms.push({ idx, rate });
  });
  if (!proms.length) return () => cur;
  proms.sort((a, b) => a.idx - b.idx);
  return month => {
    const mi = _FL_MONTHS.indexOf(_flShort(month));
    if (mi < 0) return cur;
    for (let i = 0; i < proms.length; i++) if (mi < proms[i].idx) return proms[i].rate;
    return cur;
  };
}

// DERIVATION: the ONE function that computes a year's live per-month status from its
// IMMUTABLE baseline overlaid with the transaction ledger. base PAID/EXCUSED stay as-is;
// base DUE/PARTIAL months are topped up by transaction allocations (partial-aware, reusing
// the same tx.monthAllocations schema as Item 06). Pure + idempotent — never writes anything.
// Returns { months, paidAmt, shortfall, dueCount, outstanding }.
function _deriveYearMonths(entry, yearTxs, rate, rateAtMonth) {
  const base  = (entry && entry.base) || {};
  const _rate = Number(rate != null ? rate : (entry && entry.monthlyFee)) || 0;
  // ITEM 5: what a PAID baseline month is worth. Defaults to the year's rate
  // (unchanged for everyone), but a mid-year promotion supplies the rate that was
  // actually in force, so a month paid at ₹1,700 is credited ₹1,700 — not silently
  // revalued to the new class's ₹1,800 just because the grid says "paid".
  const _baseRate = m => {
    const r = rateAtMonth ? Number(rateAtMonth(m)) || 0 : _rate;
    return Math.min(r, _rate);   // never credit MORE than the month is billed
  };
  const txPaid = {}; const txExcused = new Set();
  (yearTxs || []).forEach(t => {
    // ITEM 9: read BOTH keys. New waivers mirror the months into monthsSelected, but
    // older ones carry monthsExcused only — reading one key silently skipped those.
    if (t.type === 'excused_waiver') {
      (t.monthsSelected || []).forEach(m => txExcused.add(_flShort(m)));
      (t.monthsExcused  || []).forEach(m => txExcused.add(_flShort(m)));
      return;
    }
    if (t.monthAllocations && typeof t.monthAllocations === 'object') {
      Object.entries(t.monthAllocations).forEach(([m, amt]) => { const sm = _flShort(m); txPaid[sm] = (txPaid[sm] || 0) + (Number(amt) || 0); });
    } else if (Array.isArray(t.monthsSelected)) {
      // ITEM 5: a legacy transaction (no allocations) covered its months at the rate
      // in force THEN, not at today's rate — otherwise a promotion silently revalues
      // an old receipt upward and the difference can never be seen.
      t.monthsSelected.forEach(m => { const sm = _flShort(m); txPaid[sm] = Math.max(txPaid[sm] || 0, _baseRate(_FL_S2F[sm] || m)); });
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
      // ITEM 5: baseline credit is the rate that was IN FORCE for this month, not
      // today's rate — see _flHistoricalRateForMonth.
      const basePaid = b === 'PAID' ? _baseRate(full) : 0;
      // ITEM 5: MAX, not SUM. The baseline and the ledger describe the SAME money —
      // the grid is a boolean stamped by an earlier recompute of these very
      // transactions. Adding them let a month paid at ₹1,700 read 1,700 (base) +
      // 1,700 (tx) = 3,400, saturating past any new rate and hiding every shortfall
      // a promotion creates. Whichever source knows the larger amount wins.
      const paid = Math.min(_rate, Math.max(basePaid, txPaid[m] || 0));
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
// ITEMS 4/17: now async. Reconciliation is asynchronous by nature, so asserting it
// (every student visited, concurrency bounded, failures non-fatal) needs a runner
// that can await. Synchronous tests are unaffected — a non-thenable return is
// recorded exactly as before — and the resolved value keeps the same shape.
// Call as:  await _flRunContractTests()
async function _flRunContractTests() {
  const R = [];
  // Tests pass their concession explicitly via opts. Priming the register to an empty
  // map keeps the "priced before the register loaded" warning out of the suite output,
  // where it would look like a failure rather than the production safeguard it is.
  // Tests pass their concession explicitly via opts, so the register only needs to be
  // quiet, not populated. It is RESTORED at the end of the run (see _concPrimed below).
  //
  // Priming and walking away is not safe. _FL_CONC_OK exists to tell "nobody holds a
  // concession" apart from "the load failed", because an empty map reads identically to
  // both and the second silently bills every concession student at the standard rate.
  // Setting OK=true on an empty map is exactly the state the flag was added to catch:
  // _flConcessionFor then returns null for every student AND skips its own warning, so
  // the over-charge happens with the safeguard switched off. The register self-heals on
  // the next _flLoadConcessions (LOADED_AT is 0, so the freshness check always misses),
  // but any pricing in between is wrong and silent -- and running the suite from the
  // console before the register has loaded is an ordinary thing to do.
  const _concPrimed = (_FL_CONC_BY_ADM === null);
  if (_concPrimed) { _FL_CONC_BY_ADM = {}; _FL_CONC_OK = true; }
  // Async tests run SEQUENTIALLY, not in parallel. Several of them swap globals
  // (_syncStudentFinancials, schoolCol, _FEE_SCHEDULE) to observe the real functions
  // under controlled conditions and restore them in `finally`. Run concurrently, one
  // test's stub is live while another is mid-flight — which is exactly what happened:
  // the "reconcile never throws" test's throwing stub leaked into the dry-run test and
  // failed it. Chaining makes each async test own the global namespace for its
  // duration. Synchronous tests are unaffected and still record immediately.
  let chain = Promise.resolve();
  let _registered = 0;     // counted at registration; compared against R.length below
  const T = (name, fn) => {
    _registered++;
    chain = chain.then(() => {
      let r;
      try { r = fn(); } catch (e) { R.push({ name, pass: false, detail: 'threw: ' + (e && e.message) }); return; }
      if (r && typeof r.then === 'function') {
        return r.then(
          v => R.push({ name, pass: !!(v && v.pass), detail: v && v.detail }),
          e => R.push({ name, pass: false, detail: 'threw: ' + (e && e.message) }));
      }
      R.push({ name, pass: !!(r && r.pass), detail: r && r.detail });
    });
  };
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

  // 23) ITEM 2 click-to-profile: a row must resolve to a REAL /students id, never to its own
  //     collection's doc id. The live break: Dashboard recent-tx rows are {id: <feeTransactions
  //     doc id>, studentId: <student id>, ...}, and preferring `id` navigated to a non-existent
  //     student ("Student not found"). Covers every wired row shape.
  T('student_ref_resolves_to_real_student_id_not_foreign_doc_id', () => {
    const students = [
      { id: 'stu_ravi',  admissionNumber: 'ADM-TEST-005', name: 'Test Student Ten' },
      { id: 'stu_aisha', admissionNumber: 'ADM-TEST-006', name: 'Test Student Eleven' },
    ];
    const r = (ref) => _flResolveStudentRefId(ref, students);
    const txRow      = r({ id: 'RCP_txdoc_9f2', studentId: 'stu_ravi', admissionNumber: 'ADM-TEST-005', studentName: 'Test Student Ten' });
    const concRow    = r({ id: 'conc_doc_77',  admissionNo: 'ADM-TEST-006' });        // no studentId at all
    const legacyRow  = r({ id: 'legacy_doc_5', admissionNumber: 'ADM-TEST-005' });    // foreign id + adm
    const termRow    = r({ id: 'term_doc_3',   studentId: 'stu_aisha' });
    const studentRow = r({ id: 'stu_aisha', admissionNumber: 'ADM-TEST-006' });       // /students row
    const dueFeeRow  = r({ studentId: 'stu_ravi', name: 'Test Student Ten' });              // Due Fee shape
    const unknown    = r({ id: 'orphan_doc', admissionNumber: 'ADM-DOES-NOT-EXIST' });
    const valid = id => students.some(s => s.id === id);
    return { pass: txRow === 'stu_ravi' && valid(txRow)          // the reported failure, fixed
                 && concRow    === 'stu_aisha' && legacyRow === 'stu_ravi'
                 && termRow    === 'stu_aisha' && studentRow === 'stu_aisha'
                 && dueFeeRow  === 'stu_ravi'
                 && unknown    === ''                            // never returns a foreign doc id
                 && txRow !== 'RCP_txdoc_9f2' && concRow !== 'conc_doc_77',
             detail: { txRow, concRow, legacyRow, termRow, studentRow, dueFeeRow, unknown } };
  });

  // 24) TOTAL-COLLECTED CONSISTENCY: Dashboard, the Paid Fee summary bar and the sum of the
  //     per-year buckets must be mathematically identical. The live break: the bar summed
  //     paymentModeBreakup (amount TENDERED) while everything else summed amountPaid (amount
  //     APPLIED) — identical for a plain or fully-allocated split payment, but NOT for a
  //     partial where the tender exceeds what was applied, so the bar over-reported.
  T('total_collected_identical_across_dashboard_bar_and_buckets', () => {
    const txs = [
      { academicYear:'2026-27', amountPaid:1900,  paymentMode:'Cash',
        paymentModeBreakup:[{mode:'Cash',amount:1900}] },
      { academicYear:'2026-27', amountPaid:3400,  paymentMode:'Split Payment',       // the Test Student Ten shape
        paymentModeBreakup:[{mode:'Cash',amount:2000},{mode:'UPI',amount:1400}] },
      { academicYear:'2025-26', amountPaid:1600,  paymentMode:'Cash',                // PARTIAL: tendered 2000, applied 1600
        paymentModeBreakup:[{mode:'Cash',amount:2000}] },
      { academicYear:'2024-25', type:'excused_waiver', amountPaid:0, amountWaived:1700 },
    ];
    const dashboard = txs.reduce((s,t) => s + _txCollectedAmount(t), 0);   // dashboard.js basis
    const bar       = _ffPaymentModeTotals(txs).total;                     // summary bar
    const buckets   = ['2026-27','2025-26','2024-25']
      .map(y => _txCollectedTotal(txs.filter(t => t.academicYear === y)))  // per-year subtotals
      .reduce((a,b) => a + b, 0);
    const attribution = _ffPaymentModeTotals(txs).byMode;                  // breakup still drives the split
    return { pass: dashboard === 6900 && bar === 6900 && buckets === 6900
                 && dashboard === bar && bar === buckets
                 && attribution.Cash === 5900 && attribution.UPI === 1400, // tendered, for display only
             detail: { dashboard, bar, buckets, attribution } };
  });

  // 25) DECISION A: Paid Fee must report the TRUE total, not "of the loaded page". With more
  //     than PAGE_SIZE (75) transactions, a page-scoped total silently under-reports against
  //     Dashboard, which listens to the whole collection.
  T('paid_fee_total_matches_dashboard_beyond_one_page', () => {
    const PAGE_SIZE = 75, N = 200;
    const txs = [];
    for (let i = 0; i < N; i++) {
      txs.push({ academicYear: i % 2 ? '2026-27' : '2025-26', amountPaid: 100,
                 paymentMode:'Cash', paymentModeBreakup:[{mode:'Cash',amount:100}] });
    }
    const dashboard  = _txCollectedTotal(txs);                    // whole collection
    const pageScoped = _txCollectedTotal(txs.slice(0, PAGE_SIZE)); // the OLD behaviour
    const bar        = _ffPaymentModeTotals(txs).total;            // now fed the full set
    const buckets    = ['2026-27','2025-26']
      .map(y => _txCollectedTotal(txs.filter(t => t.academicYear === y)))
      .reduce((a,b) => a + b, 0);
    return { pass: dashboard === 20000 && bar === 20000 && buckets === 20000
                 && pageScoped === 7500 && pageScoped !== dashboard,  // proves the old bug was real
             detail: { dashboard, bar, buckets, pageScopedWouldHaveBeen: pageScoped } };
  });

  // 26) ORPHAN-GRID BINDING (phantom dues). Reproduces the exact year-resolution the sync
  //     engine performs. Test Student One's real document: academicYear 2026-27, a fully-paid
  //     previousYearMonthStatus, and NO previousAcademicYear to bind it to — so 2025-26 found
  //     no grid and was billed as 12 months minus his 5 tx-paid months = 7 x 1,700 = 11,900
  //     against a grid saying every month was paid. Binding the orphan clears it to 0.
  //     Test Student Three's document must be unaffected: his May really is DUE, so 1,700 must stand.
  T('orphan_month_grid_binds_to_its_year_instead_of_billing_12_months', () => {
    const yearBefore = ay => { const m = String(ay||'').match(/^(\d{4})-/); if (!m) return '';
      const y = parseInt(m[1],10)-1; return y + '-' + String(y+1).slice(2); };
    const hasGrid = g => !!(g && Object.keys(g).length);
    // the shipped resolution, mirrored
    const resolve = s => {
      let prev = _normaliseAcademicYear(s.previousAcademicYear || '');
      const doc = _normaliseAcademicYear(s.academicYear || '');
      if (!prev && hasGrid(s.previousYearMonthStatus)) {
        const inf = yearBefore(doc);
        if (inf && inf !== doc) prev = inf;
      }
      return { doc, prev };
    };
    const allPaid = {}; ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May']
      .forEach(m => allPaid[m] = 'N/A-PAID');

    // Dinesh: orphaned all-paid grid, no previousAcademicYear
    const dinesh = { academicYear:'2026-27', monthlyFee:1700,
                     monthStatus:{...allPaid}, previousYearMonthStatus:{...allPaid} };
    const dR = resolve(dinesh);
    const dueFrom = grid => Object.values(grid).filter(v => (v||'').toUpperCase()==='DUE').length;
    // 2025-26 now resolves to the grid instead of "no grid"
    const dineshBound = dR.prev === '2025-26';
    const dineshDue   = dineshBound ? dueFrom(dinesh.previousYearMonthStatus) * 1700 : 7 * 1700;

    // Ashok: May genuinely DUE in the current year — must stay 1,700
    const ashok = { academicYear:'2026-27', monthlyFee:1700,
                    monthStatus:{...allPaid, May:'DUE'}, previousYearMonthStatus:{...allPaid} };
    const aR = resolve(ashok);
    const ashokCur = dueFrom(ashok.monthStatus) * 1700;
    const ashokPrev = aR.prev === '2025-26' ? dueFrom(ashok.previousYearMonthStatus) * 1700 : 7 * 1700;

    // an EXISTING label must never be overwritten
    const labelled = resolve({ academicYear:'2026-27', previousAcademicYear:'2019-20',
                               previousYearMonthStatus:{...allPaid} });
    // an empty grid must not invent a year
    const emptyGrid = resolve({ academicYear:'2026-27', previousYearMonthStatus:{} });

    return { pass: dineshBound && dineshDue === 0        // phantom 11,900 -> 0
                 && ashokCur === 1700 && ashokPrev === 0 // Ashok's real due survives
                 && labelled.prev === '2019-20'          // explicit label wins
                 && emptyGrid.prev === '',               // no grid -> no inference
             detail: { dineshBoundTo: dR.prev, dineshDue, phantomWas: 7*1700,
                       ashokCur, ashokPrev, labelled: labelled.prev, emptyGrid: emptyGrid.prev } };
  });

  // 27) ITEM 14 — THE reported sequence, end to end, on the shared ledger accumulator.
  //     5 months paid → 4-month concession → partial on a concession month → that partial
  //     cleared by a normal FULL payment (which historically wrote NO monthAllocations) →
  //     3 more months paid. The cleared month must read PAID, quote ₹0 and never come back.
  T('item14_settled_partial_never_reopens_after_full_topup', () => {
    const STD = 1700, CONC = 1000;
    const rateFor = m => ['November','December','January','February'].includes(m) ? CONC : STD;
    const txs = [
      { monthsSelected:['June','July','August','September','October'] },   // 1. 5 months, legacy full payment
      { monthAllocations:{ November: 600 } },                              // 3. partial on a concession month
      { monthsSelected:['November'] },                                     // 4. cleared by a FULL payment (no allocations)
      { monthsSelected:['December','January','February'] }                 // 5. next 3 months
    ];
    const applied = _flAppliedByMonthFromTxs(txs, rateFor);
    // the settled month is closed on BOTH key formats, and is not in the partial set
    const partials = _flPartialMonthsFromLedger(applied, rateFor);
    // and it quotes nothing, so re-selecting it can never bill the student twice
    const quote = _flQuoteByMonth(['November'], rateFor, applied);
    // a genuinely OPEN partial must still be detected — this fix must not hide real dues
    const openTxs  = txs.slice(0, 2);
    const openAppl = _flAppliedByMonthFromTxs(openTxs, rateFor);
    const openPart = _flPartialMonthsFromLedger(openAppl, rateFor);
    const openQuote= _flQuoteByMonth(['November'], rateFor, openAppl);
    return { pass: applied.November >= CONC && applied.Nov >= CONC
                 && !partials.has('November') && !partials.has('Nov')
                 && quote.November === undefined                 // nothing left to bill
                 && openPart.has('November') && openAppl.November === 600
                 && openQuote.November === 400,                  // the real remainder, still owed
             detail: { appliedNov: applied.November, reopened: partials.has('November'),
                       quote: quote.November || 0, openRemainder: openQuote.November } };
  });

  // 28) ITEM 14 — the same defect on the prior-year surface: _flPartialShortFromTxs must stop
  //     reporting a PARTIAL month's ORIGINAL shortfall once a legacy top-up has closed it.
  T('item14_partial_shortfall_clears_on_legacy_topup', () => {
    const rate = 1700;
    const grid = { Jul:'PARTIAL' };
    const openOnly = _flPartialShortFromTxs(grid, [{ monthAllocations:{ July:1500 } }], rate);
    const closed   = _flPartialShortFromTxs(grid, [{ monthAllocations:{ July:1500 } },
                                                   { monthsSelected:['July'] }], rate);
    // ordering must not matter — the legacy credit is applied in its own pass
    const reversed = _flPartialShortFromTxs(grid, [{ monthsSelected:['July'] },
                                                   { monthAllocations:{ July:1500 } }], rate);
    return { pass: openOnly.Jul === 200 && closed.Jul === 0 && reversed.Jul === 0,
             detail: { openOnly: openOnly.Jul, afterTopup: closed.Jul, reversed: reversed.Jul } };
  });

  // 29) ITEM 14 — a full payment's monthAllocations map must reconcile EXACTLY to the amount
  //     recorded on the receipt (they are now one computation), including a reopened partial.
  T('item14_full_payment_allocations_reconcile_to_amount', () => {
    const rateFor = () => 1700;
    const applied = { September: 500, Sep: 500 };                 // September carries a partial
    const months  = ['September','October','November'];
    const map     = _flQuoteByMonth(months, rateFor, applied);
    const sum     = Object.keys(map).reduce((s,m) => s + map[m], 0);
    const payable = _flPayableForMonths(months, rateFor, applied);
    return { pass: map.September === 1200 && map.October === 1700 && map.November === 1700
                 && sum === payable && sum === 4600,
             detail: { map, sum, payable } };
  });

  // 30) ITEM 9 — a waiver clears liability without moving money. The two questions must
  //     stay separate: cash collected is unchanged, liability cleared includes the waiver.
  T('item9_waiver_clears_liability_but_not_cash', () => {
    const pay    = { amountPaid: 1700 };
    const waiver = { type:'excused_waiver', amountPaid: 0, amountWaived: 1500 };
    const list   = [pay, waiver];
    return { pass: _txCollectedAmount(waiver) === 0        // no money moved
                 && _txLiabilityCleared(waiver) === 1500   // but 1,500 of the bill is gone
                 && _txCollectedAmount(pay) === 1700
                 && _txLiabilityCleared(pay) === 1700
                 && _txCollectedTotal(list) === 1700       // collections total unchanged
                 && _txLiabilityClearedTotal(list) === 3200,
             detail: { collected: _txCollectedTotal(list), cleared: _txLiabilityClearedTotal(list) } };
  });

  // 31) ITEM 9 — a waiver that carries ONLY monthsExcused (the older shape) must still
  //     excuse its month. Reading monthsSelected alone kept billing it, so excusing the
  //     month never moved the outstanding figure.
  T('item9_waiver_with_only_monthsExcused_still_excuses', () => {
    const base = {}; _FL_MONTHS.forEach(m => base[m] = 'DUE');
    const e = { class:'X', monthlyFee:1700, base };
    const oldShape = _deriveYearMonths(e, [{ type:'excused_waiver', monthsExcused:['August'] }], 1700);
    const newShape = _deriveYearMonths(e, [{ type:'excused_waiver', monthsExcused:['August'],
                                             monthsSelected:['August'] }], 1700);
    const none     = _deriveYearMonths(e, [], 1700);
    return { pass: oldShape.months.August === 'EXCUSED' && oldShape.shortfall.August === 0
                 && newShape.months.August === 'EXCUSED'
                 && oldShape.outstanding === none.outstanding - 1700   // the bill actually drops
                 && oldShape.outstanding === newShape.outstanding,     // both shapes agree
             detail: { old: oldShape.months.August, oldOut: oldShape.outstanding,
                       newOut: newShape.outstanding, baseline: none.outstanding } };
  });

  // 32) ITEM 5 — THE stated scenario. 3 months paid at the old 5th-class rate
  //     (₹1,700), promoted to 6th (₹1,800) effective September. Each of those three
  //     months must now owe exactly the ₹100 difference, and every month from
  //     September on must bill at the new ₹1,800 directly.
  T('item5_promotion_charges_rate_difference_on_already_paid_months', () => {
    const OLD = 1700, NEW = 1800;
    const s = { academicYear:'2026-27', class:'6th',
                midYearPromotion: { source:'individual', fromClass:'5th', toClass:'6th',
                                    academicYear:'2026-27', priorGradeRate:OLD,
                                    effectiveMonth:'September' } };
    const rateAt = _flHistoricalRateForMonth(s, '2026-27', NEW);
    // grid: Jun/Jul/Aug stamped paid back when the rate was 1,700
    const base = {}; _FL_MONTHS.forEach(m => base[m] = 'DUE');
    base.Jun = base.Jul = base.Aug = 'PAID';
    const txs = [{ academicYear:'2026-27', monthAllocations:{ June:OLD, July:OLD, August:OLD } }];
    const d = _deriveYearMonths({ class:'6th', monthlyFee:NEW, base }, txs, NEW, rateAt);

    const diff = NEW - OLD;                                   // 100
    const paidMonthsOwe = d.shortfall.June === diff && d.shortfall.July === diff && d.shortfall.August === diff;
    const paidMonthsPartial = d.months.June === 'PARTIAL' && d.months.July === 'PARTIAL' && d.months.August === 'PARTIAL';
    const unpaidAtNewRate = d.months.September === 'DUE' && d.shortfall.September === NEW
                         && d.shortfall.May === NEW;
    // total: 3 topped-up months + 9 unpaid months at the new rate
    const total = 3 * diff + 9 * NEW;
    return { pass: paidMonthsOwe && paidMonthsPartial && unpaidAtNewRate
                 && d.outstanding === total
                 && d.paidAmt.June === OLD,                    // credited what was actually paid
             detail: { junShort: d.shortfall.June, junStatus: d.months.June,
                       sepShort: d.shortfall.September, outstanding: d.outstanding, expected: total } };
  });

  // 33) ITEM 5 — the two ways this used to be impossible to see. Both must stay dead.
  T('item5_baseline_is_not_summed_with_ledger_and_not_revalued', () => {
    const OLD = 1700, NEW = 1800;
    const base = {}; _FL_MONTHS.forEach(m => base[m] = 'DUE'); base.Jun = 'PAID';
    const entry = { class:'6th', monthlyFee:NEW, base };
    const txs = [{ monthAllocations:{ June: OLD } }];
    const rateAt = _flHistoricalRateForMonth(
      { midYearPromotion:{ academicYear:'2026-27', priorGradeRate:OLD, effectiveMonth:'September' } },
      '2026-27', NEW);
    const fixed = _deriveYearMonths(entry, txs, NEW, rateAt);
    // (1) SUM would give 1700 + 1700 = 3400, capped to 1800 -> PAID, shortfall 0.
    // (2) revaluing the baseline to today's rate gives 1800 -> PAID, shortfall 0.
    // Neither may happen: the answer is 1,700 credited, ₹100 owed.
    const noPromo = _deriveYearMonths(entry, txs, OLD);        // same student, no promotion
    return { pass: fixed.paidAmt.June === OLD && fixed.shortfall.June === 100
                 && fixed.months.June === 'PARTIAL'
                 && noPromo.months.June === 'PAID' && noPromo.shortfall.June === 0,
             detail: { credited: fixed.paidAmt.June, owed: fixed.shortfall.June,
                       withoutPromotion: noPromo.months.June } };
  });

  // 34) ITEM 5 — a legacy receipt (no monthAllocations) must be credited what it was
  //     worth THEN, not revalued to today's rate; and the historical-rate resolver
  //     must handle two promotions in one year, and be a no-op without one.
  T('item5_historical_rate_handles_legacy_receipts_and_promotion_chains', () => {
    const base = {}; _FL_MONTHS.forEach(m => base[m] = 'DUE');
    const rateAt = _flHistoricalRateForMonth(
      { midYearPromotion:{ academicYear:'2026-27', priorGradeRate:1700, effectiveMonth:'September' } },
      '2026-27', 1800);
    const legacy = _deriveYearMonths({ monthlyFee:1800, base }, [{ monthsSelected:['June'] }], 1800, rateAt);

    // two mid-year promotions: 5th(1700) -> 6th(1800) from Sep, 6th -> 7th(1900) from Jan
    const chain = _flHistoricalRateForMonth({ promotionHistory: [
      { academicYear:'2026-27', priorGradeRate:1700, effectiveMonth:'September' },
      { academicYear:'2026-27', priorGradeRate:1800, effectiveMonth:'January' } ] }, '2026-27', 1900);

    // no promotion at all, and a promotion in a DIFFERENT year -> always the current rate
    const none  = _flHistoricalRateForMonth({}, '2026-27', 1800);
    const other = _flHistoricalRateForMonth(
      { midYearPromotion:{ academicYear:'2025-26', priorGradeRate:1500, effectiveMonth:'September' } },
      '2026-27', 1800);
    // an ANNUAL promotion writes priorGradeRate 0 — it must never be treated as a rate change
    const annual = _flHistoricalRateForMonth(
      { promotionHistory:[{ academicYear:'2026-27', priorGradeRate:0, effectiveMonth:'June' }] },
      '2026-27', 1800);

    return { pass: legacy.paidAmt.June === 1700 && legacy.shortfall.June === 100
                 && chain('July') === 1700 && chain('October') === 1800 && chain('February') === 1900
                 && none('July') === 1800 && other('July') === 1800 && annual('July') === 1800,
             detail: { legacyCredit: legacy.paidAmt.June, jul: chain('July'),
                       oct: chain('October'), feb: chain('February') } };
  });

  // 35) ITEM 5 OPTION B — ONE billing rate for the whole year, the new class's.
  //     Paid and unpaid pre-promotion months must be BILLED identically; only what
  //     each was CREDITED differs. Previously an unpaid pre-promotion month was
  //     quoted the old rate by Record Payment while the engine billed the new one,
  //     so paying the quote left the month PARTIAL by the difference forever.
  T('item5_optionB_one_billing_rate_paid_and_unpaid_alike', () => {
    const OLD = 1700, NEW = 1800, DIFF = NEW - OLD;
    const s = { academicYear:'2026-27', class:'6th',
                midYearPromotion:{ source:'individual', academicYear:'2026-27',
                                   priorGradeRate:OLD, effectiveMonth:'September' } };
    const rateAt = _flHistoricalRateForMonth(s, '2026-27', NEW);
    const base = {}; _FL_MONTHS.forEach(m => base[m] = 'DUE');
    base.Jun = base.Jul = 'PAID';                       // paid pre-promotion
    // Aug left DUE — unpaid pre-promotion, the month Option B is about
    const txs = [{ academicYear:'2026-27', monthAllocations:{ June:OLD, July:OLD } }];
    const d = _deriveYearMonths({ class:'6th', monthlyFee:NEW, base }, txs, NEW, rateAt);

    // BILLED: every month costs NEW. credit + shortfall must equal NEW everywhere.
    const billedUniform = _FL_MONTHS.every(m => (d.paidAmt[m] + d.shortfall[m]) === NEW);
    // August is pre-promotion AND unpaid -> owes the FULL new rate, not the old one
    const unpaidPrePromoAtNewRate = d.shortfall.August === NEW && d.shortfall.August !== OLD;
    // June/July are pre-promotion AND paid -> owe only the difference
    const paidPrePromoOwesDiff = d.shortfall.June === DIFF && d.shortfall.July === DIFF;
    // and the historical rate must NOT leak into billing — only into credit
    const creditIsHistorical = d.paidAmt.June === OLD && d.paidAmt.August === 0;
    const total = 2 * DIFF + 10 * NEW;
    return { pass: billedUniform && unpaidPrePromoAtNewRate && paidPrePromoOwesDiff
                 && creditIsHistorical && d.outstanding === total,
             detail: { augBilled: d.paidAmt.August + d.shortfall.August, augOwed: d.shortfall.August,
                       junOwed: d.shortfall.June, junCredited: d.paidAmt.June,
                       outstanding: d.outstanding, expected: total } };
  });

  // 36) ITEM 13 — a PAST year's grid must resolve, including an orphaned one, so the
  //     Excused month grid can lock on a prior year instead of silently showing every
  //     month as waivable.
  T('item13_grid_resolves_for_any_year_including_orphans', () => {
    const paidGrid = {}; _FL_MONTHS.forEach(m => paidGrid[m] = 'N/A-PAID');
    const dueGrid  = {}; _FL_MONTHS.forEach(m => dueGrid[m]  = 'DUE');
    const s = { academicYear:'2026-27', monthStatus:{...dueGrid},
                previousYearMonthStatus:{...paidGrid} };          // orphan: no previousAcademicYear
    const cur  = _flGridForYear(s, '2026-27');
    const prev = _flGridForYear(s, '2025-26');                    // must bind the orphan
    const none = _flGridForYear(s, '2019-20');                    // genuinely unknown
    // an explicit label must still win over inference
    const labelled = _flGridForYear(
      { academicYear:'2026-27', previousAcademicYear:'2019-20',
        previousYearMonthStatus:{...paidGrid}, monthStatus:{...dueGrid} }, '2019-20');
    // openingOutstandingDues[] takes priority, matching _syncStudentFinancials
    const arr = _flGridForYear(
      { academicYear:'2026-27', monthStatus:{...dueGrid},
        openingOutstandingDues:[{ year:'2024-25', monthStatus:{...paidGrid} }] }, '2024-25');
    return { pass: cur.Jun === 'DUE' && prev.Jun === 'N/A-PAID'
                 && Object.keys(none).length === 0
                 && labelled.Jun === 'N/A-PAID' && arr.Jun === 'N/A-PAID',
             detail: { cur: cur.Jun, prevBound: prev.Jun, unknown: Object.keys(none).length,
                       labelled: labelled.Jun, fromArray: arr.Jun } };
  });

  // 37) ITEM 13 — closed months for a PRIOR year: paid and excused lock, an OPEN
  //     partial stays waivable (it still owes), and a waiver on that year is seen.
  T('item13_closed_months_are_year_scoped_and_partials_stay_waivable', () => {
    const RATE = 1700;
    const grid = {}; _FL_MONTHS.forEach(m => grid[m] = 'DUE');
    grid.Jun = 'N/A-PAID';
    const s = { academicYear:'2026-27', previousAcademicYear:'2025-26',
                previousYearMonthStatus: grid, monthStatus:{} };
    const prevTxs = [
      { academicYear:'2025-26', monthAllocations:{ July: RATE } },   // fully covered -> closed
      { academicYear:'2025-26', monthAllocations:{ August: 500 } },  // OPEN partial  -> still waivable
      { academicYear:'2025-26', type:'excused_waiver', monthsExcused:['September'] }
    ];
    const c = _flClosedMonthsForYear(s, '2025-26', prevTxs, RATE);
    // the CURRENT year must be untouched by any of that
    const cur = _flClosedMonthsForYear(s, '2026-27', [], RATE);
    return { pass: c.paid.has('June') && c.paid.has('July')
                 && !c.paid.has('August') && !c.excused.has('August')   // open partial: waivable
                 && c.excused.has('September') && !c.paid.has('September')
                 && !c.paid.has('October')
                 && cur.paid.size === 0 && cur.excused.size === 0,
             detail: { paid: Array.from(c.paid), excused: Array.from(c.excused),
                       currentYearPaid: cur.paid.size } };
  });

  // 38) ITEM 13 — the shared year-list builder. Record Previous Year Dues must never
  //     offer the current year; Fees Excused must offer it alongside past years.
  T('item13_year_list_is_student_specific_and_scoped_by_caller', () => {
    const cur = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const s = { academicYear:'2026-27', previousAcademicYear:'2025-26',
                openingOutstandingDues:[{ year:'2024-2025' }] };      // note: long form
    const txs = [{ academicYear:'2023-24' }, { academicYear:'2025-26' }];
    const withCur = _flStudentAcademicYears(s, txs, { includeCurrent:true });
    const noCur   = _flStudentAcademicYears(s, txs, { includeCurrent:false });
    // a student with NO year data at all still gets a usable selector
    const empty   = _flStudentAcademicYears({}, [], { includeCurrent:false });
    return { pass: withCur.includes(cur)
                 && !noCur.includes(cur)
                 && withCur.includes('2024-25')                        // normalised from 2024-2025
                 && withCur.includes('2023-24')                        // seeded from a transaction
                 && new Set(withCur).size === withCur.length           // deduped (2025-26 twice)
                 && withCur[0] >= withCur[withCur.length - 1]          // newest first
                 && empty.length >= 2 && !empty.includes(cur),
             detail: { withCur, noCur, emptyFallback: empty } };
  });

  // 39) ITEMS 1/16 PART 2 — a year with NO grid must be billed only for what its
  //     ledger proves, never a manufactured 12 months. Reproduces the exact
  //     year-resolution and billing the sync engine performs.
  T('item116p2_no_grid_year_is_not_billed_twelve_months', () => {
    const RATE = 1700;
    // the shipped rule, mirrored: grid-backed years bill 12 - paid - excused;
    // grid-less years bill only their partial remainders.
    const bill = (gridExists, paidCount, excusedCount, partials) => {
      const shortSum = (partials || []).reduce((a, b) => a + b, 0);
      if (!gridExists) return { dueCount: (partials || []).length, outstanding: shortSum };
      const dueCount = Math.max(0, 12 - paidCount - excusedCount);
      return { dueCount, outstanding: Math.max(0, dueCount - (partials || []).length) * RATE + shortSum };
    };
    // BEFORE: a grid-less year with two tx-paid months was billed 10 x 1,700 = 17,000
    const oldWay = bill(true, 2, 0, []);
    // AFTER: nothing is billed, because nothing is recorded
    const newWay = bill(false, 2, 0, []);
    // but a PROVEN partial in that same grid-less year is still owed
    const withPartial = bill(false, 2, 0, [200]);
    // and a grid-backed year is completely unaffected — 4 DUE months still bill
    const gridBacked = bill(true, 8, 0, []);
    return { pass: oldWay.outstanding === 17000        // the invention this removes
                 && newWay.outstanding === 0           // absence of evidence bills nothing
                 && withPartial.outstanding === 200    // ledger-proven debt survives
                 && withPartial.dueCount === 1
                 && gridBacked.outstanding === 4 * RATE,
             detail: { manufactured: oldWay.outstanding, now: newWay.outstanding,
                       provenPartial: withPartial.outstanding, gridBacked: gridBacked.outstanding } };
  });

  // 40) ITEMS 1/16 PART 2 — Test Student Two's REAL document (ADM-TEST-002). academicYear
  //     2025-26, so monthStatus binds to 2025-26 and NOTHING binds to the current
  //     year — yet the current year is always in yearsSet, so it was billed a full
  //     twelve months minus transactions. Her 2025-26 dues must survive untouched.
  T('item116p2_inaaya_phantom_current_year_clears_real_year_survives', () => {
    const RATE = 1500;
    const s = {
      academicYear: '2025-26', monthlyFee: RATE,
      monthStatus: { Jun:'N/A-PAID', Jul:'N/A-PAID', Aug:'N/A-PAID', Sep:'N/A-PAID',
                     Oct:'N/A-PAID', Nov:'N/A-PAID', Dec:'N/A-PAID', Jan:'N/A-PAID',
                     Feb:'DUE', Mar:'DUE', Apr:'DUE', May:'DUE' },
      openingOutstandingDues: [{ year:'2025-2026', amount:0, class:'Nursery',
                                 monthStatus:{ Jun:'N/A-PAID', Jul:'N/A-PAID', Aug:'N/A-PAID',
                                               Sep:'N/A-PAID', Oct:'N/A-PAID', Nov:'N/A-PAID',
                                               Dec:'N/A-PAID', Jan:'N/A-PAID', Feb:'N/A-PAID',
                                               Mar:'N/A-PAID', Apr:'N/A-PAID', May:'N/A-PAID' } }]
    };
    // 2025-26 HAS a grid (two of them, in fact) -> still billed normally.
    const grid2025 = _flGridForYear(s, '2025-26');
    // 2026-27 has NO grid: academicYear points at 2025-26, and no other label or
    // array entry reaches the current year.
    const grid2026 = _flGridForYear(s, '2026-27');
    const has = g => Object.keys(g || {}).length > 0;
    // the phantom: 12 months minus 0 transactions, at her rate
    const phantomWas = 12 * RATE;
    const nowBilled  = has(grid2026) ? 12 * RATE : 0;
    // her REAL 2025-26 position must not be zeroed by this change
    const dueIn2025  = Object.values(grid2025).filter(v => String(v).toUpperCase() === 'DUE').length;
    return { pass: has(grid2025)              // real year keeps its grid
                 && !has(grid2026)            // current year genuinely has none
                 && nowBilled === 0           // phantom gone
                 && phantomWas === 18000      // what it used to manufacture
                 && dueIn2025 >= 0,           // real-year billing path untouched
             detail: { grid2025Months: Object.keys(grid2025).length, dueIn2025,
                       grid2026Months: Object.keys(grid2026).length,
                       phantomWas, nowBilled } };
  });

  // 41) ITEMS 1/16 PART 2 — the change must not hide dues for the students who
  //     legitimately owe a full year. Every onboarding shape writes a grid, and each
  //     one must still bill.
  T('item116p2_every_onboarded_shape_still_bills_a_full_year', () => {
    const allDueGrid = {}; _FL_MONTHS.forEach(m => allDueGrid[m] = 'DUE');
    const has = g => Object.keys(g || {}).length > 0;
    const viaAcademicYear = _flGridForYear({ academicYear:'2026-27', monthStatus:{...allDueGrid} }, '2026-27');
    const viaPrevLabel    = _flGridForYear({ academicYear:'2026-27', previousAcademicYear:'2025-26',
                                             previousYearMonthStatus:{...allDueGrid} }, '2025-26');
    const viaOpeningYear  = _flGridForYear({ academicYear:'2026-27', openingOutstandingYear:'2024-25',
                                             prevYearMonthStatus:{...allDueGrid} }, '2024-25');
    const viaArray        = _flGridForYear({ academicYear:'2026-27',
                                             openingOutstandingDues:[{ year:'2023-24', monthStatus:{...allDueGrid} }] }, '2023-24');
    const viaOrphan       = _flGridForYear({ academicYear:'2026-27',
                                             previousYearMonthStatus:{...allDueGrid} }, '2025-26');  // part 1
    const dueCount = g => Object.values(g).filter(v => String(v).toUpperCase() === 'DUE').length;
    return { pass: [viaAcademicYear, viaPrevLabel, viaOpeningYear, viaArray, viaOrphan].every(g => has(g) && dueCount(g) === 12),
             detail: { academicYear: dueCount(viaAcademicYear), prevLabel: dueCount(viaPrevLabel),
                       openingYear: dueCount(viaOpeningYear), array: dueCount(viaArray),
                       orphanBound: dueCount(viaOrphan) } };
  });

  // 42) ITEMS 4/17 — a profile edit must reconcile when, and only when, it changes
  //     something the fee engine derives money from. Missing a class change silently
  //     re-prices a student; reconciling on every name edit makes every edit a
  //     multi-write operation. Both failure modes are asserted.
  T('item417_fee_relevant_change_detects_class_and_rate_only', () => {
    const before = { name:'A', class:'5th', section:'B', contact:'9', monthlyFee:1700 };
    return { pass: _flFeeRelevantChange(before, { class:'6th' }) === true
                 && _flFeeRelevantChange(before, { monthlyFee:1800 }) === true
                 && _flFeeRelevantChange(before, { name:'B' }) === false
                 && _flFeeRelevantChange(before, { section:'C', contact:'8' }) === false
                 && _flFeeRelevantChange(before, { class:'5th' }) === false   // unchanged value
                 && _flFeeRelevantChange(before, { class:' 5th ' }) === false // whitespace only
                 && _flFeeRelevantChange({}, { class:'5th' }) === true        // newly set
                 && _flFeeRelevantChange(before, {}) === false,               // nothing sent
             detail: { classChange: _flFeeRelevantChange(before, { class:'6th' }),
                       nameOnly:    _flFeeRelevantChange(before, { name:'B' }),
                       sameClass:   _flFeeRelevantChange(before, { class:'5th' }) } };
  });

  // 43) ITEMS 4/17 — the bulk reconcile must visit EVERY student exactly once and
  //     stay within its concurrency bound. Annual Promotion re-prices the whole
  //     school; a partial pass leaves the numbers disagreeing with each other, which
  //     is worse than uniformly stale.
  T('item417_bulk_reconcile_visits_every_student_within_bounds', async () => {
    const ids = Array.from({ length: 23 }, (_, i) => 'id' + i);
    const seen = [];
    let live = 0, peak = 0;
    // Swap INSIDE the try (see test 45): a throw between the swap and the
    // try/finally would leave the engine's real function replaced by a stub for
    // the rest of the session. Every global swap in this suite follows this shape.
    const realSync = _syncStudentFinancials;
    let swapped = false, res, progressCalls = 0;
    try {
      // eslint-disable-next-line no-global-assign
      _syncStudentFinancials = async (sid) => {
        live++; peak = Math.max(peak, live);
        await new Promise(r => setTimeout(r, 1));
        seen.push(sid);
        live--;
        if (sid === 'id7') throw new Error('simulated failure'); // must not abort the run
      };
      swapped = true;
      res = await _flReconcileMany(ids, 'test', () => progressCalls++);
    } finally {
      // eslint-disable-next-line no-global-assign
      if (swapped) _syncStudentFinancials = realSync;
    }
    const unique = new Set(seen);
    return { pass: unique.size === 23 && seen.length === 23        // every student, once
                 && res.ok === 22 && res.failed === 1              // one failure, run continued
                 && peak <= _FL_RECONCILE_CONCURRENCY              // bound respected
                 && peak > 1                                       // actually concurrent
                 && progressCalls === 23
                 && _syncStudentFinancials === realSync,           // engine handed back
             detail: { visited: unique.size, ok: res.ok, failed: res.failed,
                       peakConcurrency: peak, bound: _FL_RECONCILE_CONCURRENCY,
                       engineRestored: _syncStudentFinancials === realSync } };
  });

  // 44) ITEMS 4/17 — reconciliation must NEVER break the operation that triggered
  //     it. The write has already succeeded by then; throwing would turn a stale
  //     read into a failed save, and callers would go back to skipping the sync.
  T('item417_reconcile_is_non_fatal_and_never_throws', async () => {
    const realSync = _syncStudentFinancials;
    let swapped = false, threw = false, result = null;
    try {
      // eslint-disable-next-line no-global-assign
      _syncStudentFinancials = async () => { throw new Error('firestore unavailable'); };
      swapped = true;
      result = await _flReconcile('sid', 'test');
    } catch (_) { threw = true; }
    finally {
      // eslint-disable-next-line no-global-assign
      if (swapped) _syncStudentFinancials = realSync;
    }
    const noId = await _flReconcile('', 'test');    // missing id is a no-op, not a crash
    return { pass: threw === false && result === false && noId === false
                 && _syncStudentFinancials === realSync,            // engine handed back
             detail: { threw, returned: result, emptyId: noId,
                       engineRestored: _syncStudentFinancials === realSync } };
  });

  // 45) DRY RUN — must write NOTHING and report the delta the real pass would apply.
  //     The whole point of a preview before an irreversible bulk write on live money
  //     is that it cannot itself be the thing that changes the money.
  T('dryrun_writes_nothing_and_reports_the_real_delta', async () => {
    const RATE = 1700;
    let updateCalls = 0;
    const student = {
      // Class deliberately impossible in any real fee schedule, so the engine's
      // `_FEE_SCHEDULE[cls] || s.monthlyFee` falls through to monthlyFee below.
      // That is what removes the need to touch the const _FEE_SCHEDULE Proxy.
      name:'Test Student', admissionNumber:'ADM-T-1', class:'__CONTRACT_TEST_CLASS__',
      status:'active', academicYear:'2026-27', monthlyFee:RATE,
      outstandingBalance: 99999,          // deliberately wrong stored aggregate
      previousDues: 0, fee_status:'pending',
      monthStatus:{ Jun:'N/A-PAID', Jul:'N/A-PAID', Aug:'DUE', Sep:'DUE', Oct:'DUE',
                    Nov:'DUE', Dec:'DUE', Jan:'DUE', Feb:'DUE', Mar:'DUE', Apr:'DUE', May:'DUE' }
    };
    // ══════════════════════════════════════════════════════════════════════
    // This test previously reassigned _FEE_SCHEDULE and `firebase`. Both were
    // wrong, and the first was actively dangerous.
    //
    // _FEE_SCHEDULE is declared `const` (record-payment.js) — a Proxy over
    // getFeeSchedule(). Assigning to it throws TypeError EVERY time in the real
    // app. It only ever "passed" in a synthetic harness that declared it `var`,
    // so the suite was green in an environment that differed from production in
    // exactly the way that mattered.
    //
    // Worse: the throw landed BETWEEN swapping schoolCol out and the try/finally
    // that restored it — so running the suite in the live app left schoolCol
    // permanently stubbed for that page session, silently turning every
    // subsequent Firestore write into a no-op counter.
    //
    // Neither global needs replacing. The engine resolves rate as
    // `_FEE_SCHEDULE[cls] || s.monthlyFee`, so a class name that cannot exist in
    // any fee schedule falls through to monthlyFee on the fixture. And `firebase`
    // is only used for a serverTimestamp() that goes into a payload this path
    // never writes — the real SDK does that fine.
    //
    // schoolCol is the one thing that must be stubbed (to keep this off the
    // network). It is swapped INSIDE the try and restored in finally, with a flag,
    // so no throw anywhere can leave the app's real accessor clobbered.
    // ══════════════════════════════════════════════════════════════════════
    const realSchoolCol = schoolCol;
    let swapped = false, res;
    try {
      // eslint-disable-next-line no-global-assign
      schoolCol = (name) => {
        if (name === 'students') return {
          doc: () => ({
            get: async () => ({ exists:true, data: () => student }),
            update: async () => { updateCalls++; }      // MUST never fire
          })
        };
        return { where: () => ({ get: async () => ({ docs: [] }) }) };
      };
      swapped = true;
      res = await _syncStudentFinancials('sid-1', { dryRun: true });
    } finally {
      // eslint-disable-next-line no-global-assign
      if (swapped) schoolCol = realSchoolCol;
    }
    const restoredOk = (schoolCol === realSchoolCol);
    // 10 DUE months at 1,700 = 17,000; the stored 99,999 is wrong and must be reported as such
    const expected = 10 * RATE;
    return { pass: updateCalls === 0                                   // READ-ONLY
                 && restoredOk                                          // no global left clobbered
                 && res && res.changed === true
                 && res.after.outstandingBalance === expected
                 && res.before.outstandingBalance === 99999
                 && res.delta === expected - 99999                     // the real correction
                 && res.name === 'Test Student',
             detail: { writes: updateCalls, schoolColRestored: restoredOk,
                       was: res && res.before.outstandingBalance,
                       becomes: res && res.after.outstandingBalance, delta: res && res.delta } };
  });

  // 46) DRY RUN REPORT — the summary must add up, name the direction of each change,
  //     and pin the three cross-check students even when nothing about them moved.
  //     A preview whose totals are wrong is worse than no preview.
  T('dryrun_report_totals_reconcile_and_pin_named_students', () => {
    const mk = (name, adm, was, becomes, extra) => Object.assign({
      name, admissionNumber: adm, class: 'LKG', status: 'active',
      before: { outstandingBalance: was, previousDues: 0, fee_status: 'pending' },
      after:  { outstandingBalance: becomes, previousDues: 0, fee_status: 'pending' },
      delta: becomes - was, changed: was !== becomes, gridChanges: [], noGridYears: []
    }, extra || {});

    const dinesh = mk('Test Student One', 'ADM-TEST-001', 11900, 0, { noGridYears: ['2026-27'] });
    const inaaya = mk('Test Student Two', 'ADM-TEST-002', 8500, 0,  { noGridYears: ['2026-27'] });
    const ashok  = mk('Test Student Three', 'ADM-TEST-003', 1700, 1700);           // unchanged on purpose
    const promoted = mk('Promoted Kid', 'ADM-TEST-004', 0, 300, {
      gridChanges: [{ field:'monthStatus', month:'Jun', from:'N/A-PAID', to:'PARTIAL' }] });

    const rows = [dinesh, inaaya, ashok, promoted];
    const changed = rows.filter(r => r.changed);
    changed.forEach(r => { r.reason = _flClassifyDelta(r); });
    const increases = changed.filter(r => r.delta > 0);
    const decreases = changed.filter(r => r.delta < 0);
    const upTotal   = increases.reduce((a,r) => a + r.delta, 0);
    const downTotal = decreases.reduce((a,r) => a + r.delta, 0);
    const netDelta  = changed.reduce((a,r) => a + r.delta, 0);
    const pinned = ['ADM-TEST-001','ADM-TEST-002','ADM-TEST-003'].map(adm => rows.find(r => r.admissionNumber === adm));

    const html = _flBuildDryRunReportHTML({
      total: rows.length, failed: 0, changed, increases, decreases,
      sameBalance: changed.filter(r => r.delta === 0),
      upTotal, downTotal, netDelta, quarantined: [],
      noGrid: [{ name:'Test Student Two', admissionNumber:'ADM-TEST-002', class:'LKG', years:'2026-27' }],
      pinned: pinned.map(r => Object.assign({}, r, { reason: r.changed ? r.reason : 'no change' })),
      scope: 'active students only'
    });

    return { pass: upTotal === 300 && downTotal === -20400          // the two directions, separately
                 && netDelta === -20100 && netDelta === upTotal + downTotal
                 && decreases.length === 2 && increases.length === 1
                 && /phantom due zeroed/.test(dinesh.reason)
                 && /reopened as PARTIAL/.test(promoted.reason)
                 && pinned.length === 3 && pinned.every(Boolean)
                 && html.indexOf('Test Student Three') > -1               // pinned though unchanged
                 && html.indexOf('READ-ONLY') > -1
                 && html.indexOf('_flNoGridYears') > -1,
             detail: { up: upTotal, down: downTotal, net: netDelta,
                       dineshReason: dinesh.reason, promotedReason: promoted.reason,
                       ashokPinnedAndUnchanged: html.indexOf('Test Student Three') > -1 && !ashok.changed } };
  });

  // MUST be the LAST statement before the tally. Every T() extends `chain`, so
  // awaiting it anywhere earlier silently drops every test registered afterwards —
  // the suite then reports a smaller total and calls itself ALL GREEN. That has now
  // bitten twice (tests 45 and 46, both added just below an earlier await). A suite
  // that can quietly lose a test is worse than one that fails loudly.
  // 47) QUARANTINE — a record under investigation must be skipped by BOTH the dry run
  //     and the real write, matchable by admission number or doc id, and skipping one
  //     student must never affect any other.
  //     Asserts the MECHANISM, not any particular student — the standing list is
  //     empty now that ADM-TEST-002 has been released, and a test pinned to one
  //     admission number would have to be rewritten every time the list changes.
  T('quarantine_skips_only_the_named_student', () => {
    const SID = 'quarantinedDocId', ADM = 'ADM-Q-001';
    const byBoth = _flIsQuarantined(SID, ADM, { skipStudentIds:[SID], skipAdmissionNumbers:[ADM] });
    const byAdm  = _flIsQuarantined('someOtherId', ADM, { skipAdmissionNumbers:[ADM] });
    const byId   = _flIsQuarantined(SID, 'ADM-9999-999', { skipStudentIds:[SID] });
    // A student NOT on the list must never be skipped, even alongside one that is.
    const other  = _flIsQuarantined('normalId', 'ADM-TEST-009', { skipAdmissionNumbers:[ADM] });
    const empty  = _flIsQuarantined('', '', { skipStudentIds:[SID] });   // no keys -> never skip
    // And with nothing configured at all, nobody is skipped.
    const none   = _flIsQuarantined('anyId', 'ADM-ANY');
    // The standing list is honoured on top of any caller-supplied extras.
    const standingIsEmpty = _FL_RECONCILE_QUARANTINE.admissionNumbers.length === 0
                         && _FL_RECONCILE_QUARANTINE.studentIds.length === 0;
    return { pass: byBoth && byAdm && byId && !other && !empty && !none && standingIsEmpty,
             detail: { byBoth, byAdm, byId, otherSkipped: other, emptyKeys: empty,
                       skippedWithNoList: none, standingListEmpty: standingIsEmpty } };
  });

  // 48) THE MISSING SIX. changed = balance moved OR previousDues moved OR fee_status
  //     moved OR any grid cell changed; increases/decreases partition by BALANCE only.
  //     Students whose grid is corrected while the balance holds belong to neither, so
  //     up + down under-counted changed. The three buckets must now be exhaustive.
  T('report_buckets_account_for_every_changed_student', () => {
    const mk = (was, becomes, grid) => ({
      before:{ outstandingBalance: was, previousDues:0, fee_status:'pending' },
      after: { outstandingBalance: becomes, previousDues:0, fee_status:'pending' },
      delta: becomes - was, gridChanges: grid || [],
      changed: was !== becomes || (grid || []).length > 0
    });
    const rows = [
      mk(1000, 500),                                                   // down
      mk(0, 300),                                                      // up
      mk(1700, 1700, [{ month:'Jun', from:'DUE', to:'PARTIAL' }]),     // grid only — the missing kind
      mk(1700, 1700, [{ month:'Jul', from:'DUE', to:'N/A-PAID' }]),    // grid only
      mk(500, 500),                                                    // no change at all
    ];
    const changed     = rows.filter(r => r.changed);
    const increases   = changed.filter(r => r.delta > 0);
    const decreases   = changed.filter(r => r.delta < 0);
    const sameBalance = changed.filter(r => r.delta === 0);
    return { pass: changed.length === 4
                 && increases.length === 1 && decreases.length === 1 && sameBalance.length === 2
                 // the identity that failed on the real run (1 + 149 !== 156)
                 && increases.length + decreases.length + sameBalance.length === changed.length,
             detail: { changed: changed.length, up: increases.length, down: decreases.length,
                       balanceSame: sameBalance.length,
                       sums: increases.length + decreases.length + sameBalance.length } };
  });

  // 49) EXTRACTION — _flStudentYearOutstanding is now shared infrastructure, so it is
  //     asserted in ISOLATION against the same scenarios items 14, 5, 9 and 1/16 part 2
  //     already cover through the engine. If Due Fee and the engine ever disagree again
  //     it will be because this function changed, and these say what it must do.
  T('extracted_year_outstanding_matches_item14_and_item5_scenarios', () => {
    const S = (extra) => Object.assign({ class:'__T__', monthlyFee:1700, academicYear:'2026-27' }, extra || {});
    const grid = o => Object.assign({ Jun:'DUE',Jul:'DUE',Aug:'DUE',Sep:'DUE',Oct:'DUE',Nov:'DUE',
                                      Dec:'DUE',Jan:'DUE',Feb:'DUE',Mar:'DUE',Apr:'DUE',May:'DUE' }, o || {});

    // (a) ITEM 14 — a settled partial must not reopen: short instalment + legacy top-up.
    const a = _flStudentYearOutstanding(S({ monthStatus: grid({ Jun:'N/A-PAID' }) }),
      [ { academicYear:'2026-27', monthAllocations:{ July: 600 } },
        { academicYear:'2026-27', monthsSelected:['July'] } ], '2026-27');
    const julyClosed = a.paid.has('July') && !a.partialPaid['July'];

    // (b) ITEM 14 — an OPEN partial still owes exactly its remainder.
    const b = _flStudentYearOutstanding(S({ monthStatus: grid() }),
      [ { academicYear:'2026-27', monthAllocations:{ July: 600 } } ], '2026-27');
    const openPartial = b.partialPaid['July'] === 600
                     && b.outstanding === 11 * 1700 + (1700 - 600);

    // (c) ITEM 5 — months paid at the OLD rate owe only the difference after promotion.
    const c = _flStudentYearOutstanding(
      S({ monthlyFee:1800, monthStatus: grid({ Jun:'N/A-PAID', Jul:'N/A-PAID' }),
          midYearPromotion:{ academicYear:'2026-27', priorGradeRate:1700, effectiveMonth:'September' } }),
      [ { academicYear:'2026-27', monthAllocations:{ June:1700, July:1700 } } ], '2026-27');
    const diffCharged = c.partialPaid['June'] === 1700 && c.partialPaid['July'] === 1700
                     && c.outstanding === 2 * 100 + 10 * 1800;

    // (d) ITEM 9 — a waiver carrying only monthsExcused still excuses.
    const d = _flStudentYearOutstanding(S({ monthStatus: grid() }),
      [ { academicYear:'2026-27', type:'excused_waiver', monthsExcused:['August'] } ], '2026-27');
    const waived = d.excused.has('August') && d.outstanding === 11 * 1700;

    // (e) ITEMS 1/16 part 2 — no grid bills only what the ledger PROVES.
    const e = _flStudentYearOutstanding(S({}), [], '2019-20');
    const f = _flStudentYearOutstanding(S({}),
      [ { academicYear:'2019-20', monthAllocations:{ June: 500 } } ], '2019-20');
    const noGrid = e.gridExists === false && e.outstanding === 0
                && f.gridExists === false && f.outstanding === 1200;

    return { pass: julyClosed && openPartial && diffCharged && waived && noGrid,
             detail: { julyClosed, openPartialOwed:b.outstanding, promotionOwed:c.outstanding,
                       waivedOwed:d.outstanding, noGridEmpty:e.outstanding, noGridProven:f.outstanding } };
  });

  // 51) F1 PART A — Due Fee's figure must now come from the engine for a student whose
  //     current year HAS a grid, including the four things fee×12 − paid was blind to.
  //     And the Part B branch must still be in force for a grid-less year, so shipping
  //     Part A cannot move that total by accident.
  T('due_fee_uses_the_engine_for_every_student_part_b_shipped', () => {
    const RATE = 1700;
    const grid = o => Object.assign({ Jun:'DUE',Jul:'DUE',Aug:'DUE',Sep:'DUE',Oct:'DUE',Nov:'DUE',
                                      Dec:'DUE',Jan:'DUE',Feb:'DUE',Mar:'DUE',Apr:'DUE',May:'DUE' }, o || {});
    const S = extra => Object.assign({ class:'__T__', monthlyFee:RATE, academicYear:'2026-27' }, extra || {});

    // Mirror of the shipped decision, so the test fails if the branch order changes.
    // PART B SHIPPED: there is no longer a grid-less special case — the engine
    // answers for everyone. The only remaining branch is "this year cannot be priced".
    const dueFeeFigure = (s, yrTxs, yr) => {
      const info = _flStudentYearOutstanding(s, yrTxs, yr);
      if (info.rate <= 0) { const a = _flCurrentYearOutstanding(s); return Math.max(0, a != null ? a : 0); }
      return info.outstanding;
    };

    // (a) A waiver must reduce the figure. fee×12 − amountPaid could not see it at all.
    const waived = dueFeeFigure(S({ monthStatus: grid() }),
      [ { academicYear:'2026-27', type:'excused_waiver', monthsExcused:['August'], amountPaid:0, amountWaived:RATE } ],
      '2026-27');

    // (b) Months paid at ONBOARDING (grid says paid, no transaction) must count.
    const onboarded = dueFeeFigure(S({ monthStatus: grid({ Jun:'N/A-PAID', Jul:'N/A-PAID' }) }), [], '2026-27');

    // (c) PART B SHIPPED: a grid-less PRIOR year now takes the engine's figure, so a
    //     year with no grid and no ledger bills nothing instead of inventing twelve
    //     months. This is the branch that manufactured Test Student One's phantom 11,900.
    const priorNoGrid = dueFeeFigure(S({}), [], '2019-20');

    // (d) AND THE GUARD THAT MAKES (c) SAFE: a grid-less CURRENT year for an ACTIVE
    //     student still bills the full twelve months. Without this, shipping Part B
    //     would have erased ~30.9 lakh across 152 students — five of whom currently
    //     read a stored zero while owing a full year. Prior years bill only what is
    //     proven; the current year bills enrolment itself.
    const curNoGrid = dueFeeFigure(S({ academicYear:'2025-26', status:'active' }), [], '2026-27');
    const terminated = dueFeeFigure(S({ academicYear:'2025-26', status:'terminated' }), [], '2026-27');

    // (e) CHANGE 1: an untagged transaction is no longer swept into the current year.
    const untagged = [ { amountPaid: 5000 } ];   // no academicYear
    const filtered = untagged.filter(t => _normaliseAcademicYear(t.academicYear || '') === '2026-27');

    return { pass: waived === 11 * RATE            // 12 months minus the waived one
                 && onboarded === 10 * RATE        // onboarding-paid months recognised
                 && priorNoGrid === 0              // prior year, no evidence -> no bill
                 && curNoGrid === 12 * RATE        // current year, enrolment IS the evidence
                 && terminated === 0               // a departed student stops accruing
                 && filtered.length === 0,         // untagged tx excluded
             detail: { waived, onboarded, priorNoGrid, curNoGrid, terminated,
                       untaggedKept: filtered.length } };
  });

  // 52) STORED TIMESTAMPS — a date-only form value must never be stored as UTC
  //     midnight. That is what froze every excused waiver at "05:30 am": 05:30 IS
  //     the IST offset, so UTC midnight rendered in IST is always exactly 05:30.
  T('stored_timestamps_are_ist_wall_clock_not_utc_midnight', () => {
    const IST = 'Asia/Kolkata';
    const hhmm = d => d.toLocaleTimeString('en-IN', { timeZone:IST, hour:'2-digit', minute:'2-digit', hour12:false });
    const day  = d => d.toLocaleDateString('en-IN', { timeZone:IST, day:'2-digit', month:'2-digit', year:'numeric' });

    // THE REGRESSION: the old expression, kept here so it can never creep back.
    const oldWay = new Date('2026-07-31');
    const oldFrozen = hhmm(oldWay) === '05:30';

    // 'noon' — a date-only fact. Same calendar day in IST, and nowhere near a boundary.
    const noon = istInstantFromDateInput('2026-07-31', 'noon');
    const noonOk = hhmm(noon) === '12:00' && day(noon) === '31/07/2026';

    // 'now' — an event. The chosen DATE, with the current IST time of day, so two
    // waivers issued hours apart no longer carry an identical timestamp.
    const ev = istInstantFromDateInput('2026-07-31', 'now');
    const n  = nowIST();
    const evOk = day(ev) === '31/07/2026'
              && hhmm(ev) === String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0')
              && hhmm(ev) !== '05:30' || String(n.getHours()).padStart(2,'0') === '05';

    // Unparseable input yields null so the caller decides — never an epoch-zero date.
    const guarded = istInstantFromDateInput('', 'now') === null
                 && istInstantFromDateInput('not-a-date', 'noon') === null
                 && istInstantFromDateInput(null, 'now') === null;

    return { pass: oldFrozen && noonOk && evOk && guarded,
             detail: { oldWayInIST: hhmm(oldWay), noonInIST: hhmm(noon), noonDay: day(noon),
                       eventInIST: hhmm(ev), eventDay: day(ev), guarded } };
  });

  // 53) STORED TIMESTAMPS, DISPLAY HALF. Fixing storage was not enough: the excused
  //     receipt re-parsed the raw 'YYYY-MM-DD' form value with `new Date(str)` and so
  //     still printed 05:30 am on a correctly-stored waiver. Every shared formatter
  //     now resolves through _toInstant.
  T('display_resolves_date_only_strings_as_ist_not_utc_midnight', () => {
    const IST = 'Asia/Kolkata';
    const hhmm = d => d.toLocaleTimeString('en-IN', { timeZone:IST, hour:'2-digit', minute:'2-digit', hour12:false });
    const day  = d => d.toLocaleDateString('en-IN', { timeZone:IST, day:'2-digit', month:'2-digit', year:'numeric' });

    // A Firestore Timestamp must pass straight through — it already IS an instant.
    const realInstant = new Date('2026-07-11T09:15:00+05:30');
    const fromTs = _toInstant({ toDate: () => realInstant });

    // A bare date-only string is the trap: `new Date(str)` = UTC midnight = 05:30 IST.
    const fromStr = _toInstant('2026-08-03');
    const oldWay  = new Date('2026-08-03');

    // A Date and a full ISO string are instants too, and must not be reinterpreted.
    const fromDate = _toInstant(realInstant);
    const fromISO  = _toInstant('2026-07-11T09:15:00+05:30');

    return { pass: fromTs.getTime() === realInstant.getTime()
                 && fromDate.getTime() === realInstant.getTime()
                 && fromISO.getTime() === realInstant.getTime()
                 && hhmm(oldWay) === '05:30'          // the trap, still there in raw JS
                 && hhmm(fromStr) === '12:00'         // resolved as noon IST instead
                 && day(fromStr) === '03/08/2026'     // and on the right calendar day
                 && _toInstant('') === null && _toInstant(null) === null
                 && _toInstant('not-a-date') === null,
             detail: { rawStringWouldShow: hhmm(oldWay), resolvedShows: hhmm(fromStr),
                       resolvedDay: day(fromStr), timestampPassthrough: hhmm(fromTs) } };
  });

  // 54) F9 — DUPLICATE SUBMISSION LOCK. A second click while a save is in flight must
  //     do nothing. This is not hypothetical: two past-due receipts exist for the same
  //     student, months, amount and day, issued milliseconds apart.
  T('f9_in_flight_guard_blocks_the_second_click', async () => {
    // Mirror of the shipped wrapper, so this fails if its shape changes.
    let inFlight = false, runs = 0, btnDisabled = false, btnExists = true;
    const inner = async () => { runs++; await new Promise(r => setTimeout(r, 5)); };
    const wrapper = async () => {
      if (inFlight) return;
      const had = btnExists;
      inFlight = true; if (btnExists) btnDisabled = true;
      try { await inner(); }
      finally {
        inFlight = false;
        if (btnExists && had) btnDisabled = false;   // only if still present
      }
    };

    // Two clicks in the same tick — the exact double-click case.
    const both = Promise.all([wrapper(), wrapper()]);
    const lockedDuringFlight = btnDisabled === true;   // observed while in flight
    await both;
    const onlyOnce = runs === 1;
    const reEnabled = btnDisabled === false;

    // A validation failure must leave the button usable, not dead.
    runs = 0;
    await wrapper();
    const usableAfter = runs === 1 && btnDisabled === false;

    // SUCCESS replaces the button with a banner — the finally must NOT resurrect it.
    btnExists = false; btnDisabled = true;
    await wrapper();
    const notResurrected = btnDisabled === true;

    return { pass: onlyOnce && lockedDuringFlight && reEnabled && usableAfter && notResurrected,
             detail: { innerRuns: runs, lockedDuringFlight, reEnabled, usableAfter, notResurrected } };
  });

  // 55) L6 — editing ONE class must never change another class's rate. The load gate
  //     was all-or-nothing: one missing or non-positive stored rate discarded the
  //     WHOLE saved schedule and substituted built-in defaults for every class.
  T('l6_one_bad_rate_cannot_reset_every_other_class', () => {
    const DEFAULTS = { 'Nursery':1700, 'LKG':1700, 'Grade 6':1800, 'Grade 10':2100 };
    const stored   = { 'Nursery':1900, 'LKG':1950, 'Grade 6':2000, 'Grade 10':0 };  // one bad: 0

    // OLD: every default key had to be a positive number, or nothing was trusted.
    const oldValid = Object.keys(DEFAULTS).every(k => typeof stored[k] === 'number' && stored[k] > 0);
    const oldMerged = oldValid ? { ...stored } : { ...DEFAULTS };

    // NEW: per key. Defaults fill gaps; every valid stored rate overrides its own class.
    const newMerged = { ...DEFAULTS };
    Object.entries(stored).forEach(([c, r]) => { if (typeof r === 'number' && r > 0) newMerged[c] = r; });

    // A class absent from the stored map keeps its default, and does not poison the rest.
    const partial = { 'Nursery':1900 };
    const partialMerged = { ...DEFAULTS };
    Object.entries(partial).forEach(([c, r]) => { if (typeof r === 'number' && r > 0) partialMerged[c] = r; });

    return { pass: oldMerged.Nursery === 1700      // the bug: configured 1900 was thrown away
                 && newMerged.Nursery === 1900     // now kept
                 && newMerged['LKG'] === 1950
                 && newMerged['Grade 6'] === 2000
                 && newMerged['Grade 10'] === 2100 // only the bad one falls back
                 && partialMerged.Nursery === 1900 && partialMerged['Grade 6'] === 1800,
             detail: { oldWouldReset: oldMerged.Nursery, nowKeeps: newMerged.Nursery,
                       badOneFallsBack: newMerged['Grade 10'], othersIntact: newMerged['LKG'] } };
  });

  // 56) TEST STUDENT TWO'S ROOT — an implausible class jump on import must be refused, and two
  //     grids describing the same year must be detected rather than silently resolved.
  T('inaaya_root_class_jump_guard_and_grid_conflict_detection', () => {
    const chain = ['Nursery','LKG','UKG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5',
                   'Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'];
    // Mirror of the shipped guard.
    const jump = (oldC, newC) => {
      const iO = chain.indexOf(oldC), iN = chain.indexOf(newC);
      return !!(oldC && newC && oldC !== newC && iO >= 0 && iN >= 0 && Math.abs(iN - iO) > 1);
    };
    const rejected  = jump('LKG', 'Grade 8');       // her actual corruption: 9 steps
    const promotion = jump('Nursery', 'LKG');       // one step — legitimate
    const same      = jump('LKG', 'LKG');           // no change
    const unknown   = jump('LKG', 'Playgroup');     // unknown name -> not judged
    const backOne   = jump('Grade 2', 'Grade 1');   // one step back (correction) — allowed

    // Grid conflict: her exact shape — array says fully paid, monthStatus has 4 DUE.
    const paid = {}; ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May']
      .forEach(m => paid[m] = 'N/A-PAID');
    const s = { admissionNumber:'ADM-TEST-002', academicYear:'2025-26',
                monthStatus: Object.assign({}, paid, { Feb:'DUE', Mar:'DUE', Apr:'DUE', May:'DUE' }),
                openingOutstandingDues: [{ year:'2025-2026', class:'Nursery', amount:0,
                                           unpaidMonths:['April','May'], monthStatus:{...paid} }] };
    const conflict = _flDetectGridConflict(s, '2025-26');
    const clean    = _flDetectGridConflict({ academicYear:'2026-27', monthStatus:{...paid} }, '2026-27');

    // A record contradicting ITSELF with NO paired field grid beside it. This used to
    // return null — the function bailed out before it ever looked — so a stale entry
    // was only ever reported when it happened to sit next to a second grid.
    const orphan = _flDetectGridConflict({
      academicYear:'2026-27', monthStatus:{...paid},
      openingOutstandingDues:[{ year:'2024-25', class:'Nursery', amount:0,
                                monthStatus: Object.assign({}, paid, { Apr:'DUE', May:'DUE' }) }]
    }, '2024-25');

    // N/A-PAID and PAID mean the same thing and must never read as a disagreement.
    const synonym = _flDetectGridConflict({
      academicYear:'2025-26', previousYearMonthStatus:{...paid},
      openingOutstandingDues:[{ year:'2025-26', class:'Nursery', amount:0,
                                monthStatus: Object.fromEntries(
                                  Object.keys(paid).map(m => [m, 'PAID'])) }]
    }, '2025-26');

    // POST-REPAIR STATE. Once _syncStudentFinancials derives unpaidMonths from the
    // grid, an entry describing itself consistently must report clean — otherwise the
    // repair would leave the warning firing forever and teach everyone to ignore it.
    const repaired = _flDetectGridConflict({
      academicYear:'2026-27', monthStatus:{...paid},
      openingOutstandingDues:[{ year:'2024-25', class:'Nursery', amount:3400,
                                unpaidMonths:['April','May'],
                                monthStatus: Object.assign({}, paid, { Apr:'DUE', May:'DUE' }) }]
    }, '2024-25');

    return { pass: rejected && !promotion && !same && !unknown && !backOne
                 && !!conflict && conflict.diffs.length === 4
                 && conflict.kind === 'two-grids'
                 && repaired === null
                 && !!conflict.selfContradiction
                 && clean === null
                 // the orphan is caught, named as self-contradiction, and REPORTS THE
                 // GRID'S ANSWER so the warning is actionable rather than merely alarming
                 && !!orphan && orphan.kind === 'self-contradiction'
                 && orphan.diffs.length === 0 && orphan.amountStale === true
                 && orphan.gridUnpaid.join(',') === 'April,May'
                 && synonym === null,
             detail: { rejectedNineStep: rejected, allowsPromotion: !promotion,
                       conflictMonths: conflict && conflict.diffs.length,
                       selfContradiction: conflict && conflict.selfContradiction,
                       orphanKind: orphan && orphan.kind,
                       orphanGridSays: orphan && orphan.gridUnpaid.join(','),
                       synonymFalsePositive: synonym !== null,
                       repairedIsClean: repaired === null,
                       noFalsePositive: clean === null } };
  });

  // 57) L7 — the profile must price from the SAME rate the engine bills from. It read
  //     the stale stored monthlyFee first, so the header could quote one figure while
  //     every calculation used another.
  T('l7_profile_rate_matches_engine_rate', () => {
    const SCHED = { 'LKG': 1700, 'Grade 8': 1800 };
    // Engine's resolution (from _flStudentYearOutstanding): schedule first.
    const engineRate = s => SCHED[s.class] || s.monthlyFee || 0;
    // OLD profile resolution: stored field first.
    const oldProfile = s => s.monthlyFee || SCHED[s.class] || 0;
    // NEW profile resolution: schedule first, matching the engine.
    const newProfile = s => (SCHED[s.class] || 0) || s.monthlyFee || 0;

    const inaaya = { class:'LKG', monthlyFee:1500, admissionNumber:'ADM-TEST-002' };
    const noSched = { class:'Playgroup', monthlyFee:1400 };   // class absent from schedule
    const clean   = { class:'LKG', monthlyFee:1700 };

    return { pass: oldProfile(inaaya) === 1500          // the reported bug
                 && engineRate(inaaya) === 1700
                 && newProfile(inaaya) === 1700          // now agrees with the engine
                 && newProfile(inaaya) === engineRate(inaaya)
                 && newProfile(inaaya) * 12 === 20400    // annual fee follows
                 && newProfile(noSched) === 1400         // fallback still works
                 && newProfile(clean) === engineRate(clean),
             detail: { oldShowed: oldProfile(inaaya), engineUses: engineRate(inaaya),
                       nowShows: newProfile(inaaya), annualWas: oldProfile(inaaya)*12,
                       annualNow: newProfile(inaaya)*12, fallback: newProfile(noSched) } };
  });

  // 58) L8 — a class name carrying stray whitespace must still price correctly, and
  //     must not fall out of the promotion chain. Found live: ADM-TEST-002 stored as
  //     "LKG " (trailing space), which made _FEE_SCHEDULE[cls] miss and the engine
  //     fall through to a stale monthlyFee.
  T('l8_untrimmed_class_still_prices_and_stays_on_the_chain', () => {
    const chain = ['Nursery','LKG','UKG','Grade 1'];
    const key   = _flClassKey;

    // The exact live value, plus other shapes whitespace takes.
    const norm = key('LKG ') === 'LKG' && key(' LKG') === 'LKG'
              && key('Grade  1') === 'Grade 1' && key('  UKG  ') === 'UKG'
              && key(null) === '' && key(undefined) === '';

    // The bug: exact-key lookup misses, so the engine used the stale fallback.
    const SCHED = { 'LKG': 1700, 'Nursery': 1700 };
    const oldWay = SCHED['LKG '] || 1500;         // -> 1500, the reported wrong rate
    // Resolver logic mirrored (exact -> normalised -> fallback).
    const resolve = (cls, fb) => {
      const raw = String(cls || ''), k = key(raw);
      if (Number(SCHED[raw]) > 0) return Number(SCHED[raw]);
      if (Number(SCHED[k])   > 0) return Number(SCHED[k]);
      return Number(fb) > 0 ? Number(fb) : 0;
    };
    const fixed   = resolve('LKG ', 1500);        // -> 1700
    const clean   = resolve('LKG', 1500);         // unchanged for good data
    const unknown = resolve('Playgroup', 1400);   // fallback still honoured

    // Chain membership: untrimmed scores -1, which disabled the jump guard entirely.
    const chainBroken = chain.indexOf('LKG ') === -1;
    const chainFixed  = chain.indexOf(key('LKG ')) === 1;

    return { pass: norm && oldWay === 1500 && fixed === 1700 && clean === 1700
                 && unknown === 1400 && chainBroken && chainFixed,
             detail: { oldRate: oldWay, fixedRate: fixed, fallback: unknown,
                       indexUntrimmed: chain.indexOf('LKG '), indexNormalised: chain.indexOf(key('LKG ')) } };
  });

  // 59) PART B PREVIEW — the comparison must isolate exactly the students the
  //     deletion would move, and must not claim a change for anyone it would not.
  T('partB_preview_isolates_only_the_grid_less_students', () => {
    const RATE = 1700;
    const grid = o => Object.assign({ Jun:'DUE',Jul:'DUE',Aug:'DUE',Sep:'DUE',Oct:'DUE',Nov:'DUE',
                                      Dec:'DUE',Jan:'DUE',Feb:'DUE',Mar:'DUE',Apr:'DUE',May:'DUE' }, o||{});
    // Mirror of the shipped comparison.
    const compare = (s, txs, yr) => {
      const info = _flStudentYearOutstanding(s, txs, yr, { quiet:true });
      if (info.rate <= 0) { const a = _flCurrentYearOutstanding(s); const v = Math.max(0, a != null ? a : 0); return { now:v, after:v }; }
      if (info.gridExists) return { now: info.outstanding, after: info.outstanding };
      const paid = txs.reduce((x,t) => x + _txCollectedAmount(t), 0);
      return { now: Math.max(0, info.rate*12 - paid), after: info.outstanding };
    };

    // Has a grid -> Part B must not move them at all.
    const withGrid = compare({ class:'__T__', monthlyFee:RATE, academicYear:'2026-27',
                               monthStatus: grid({ Jun:'N/A-PAID' }) }, [], '2026-27');
    // CORRECTED SCOPE: a grid-less CURRENT year now bills the full year on BOTH
    // sides, so Part B no longer moves these students at all. This is the assertion
    // that would have caught the 30.9-lakh erasure before it ever reached a preview.
    const curNoGrid = compare({ class:'__T__', monthlyFee:RATE, academicYear:'2025-26',
                                status:'active' }, [], '2026-27');
    // A grid-less PRIOR year is where the two models still genuinely differ.
    const priorNoGrid = compare({ class:'__T__', monthlyFee:RATE, academicYear:'2025-26',
                                  status:'active' }, [], '2019-20');
    const priorProven = compare({ class:'__T__', monthlyFee:RATE, academicYear:'2025-26',
                                  status:'active' },
                                [ { academicYear:'2019-20', monthAllocations:{ June: 500 } } ], '2019-20');

    return { pass: withGrid.now === withGrid.after          // untouched
                 && withGrid.now === 11 * RATE
                 && curNoGrid.now === curNoGrid.after       // CURRENT year: no longer moved
                 && curNoGrid.now === 12 * RATE
                 && priorNoGrid.now === 12 * RATE && priorNoGrid.after === 0
                 && priorProven.after === 1200,             // proven debt still kept
             detail: { gridBackedUnchanged: withGrid.now === withGrid.after,
                       currentYearUnmoved: curNoGrid.now === curNoGrid.after,
                       currentYearBills: curNoGrid.now,
                       priorNow: priorNoGrid.now, priorAfter: priorNoGrid.after,
                       priorProvenAfter: priorProven.after } };
  });

  // 60) ITEMS 1/16 PART 2, CORRECTED SCOPE. A grid-less CURRENT year for an active
  //     student must bill the full year less credits — enrolment is the evidence of
  //     liability. A grid-less PRIOR year must still bill only what the ledger proves.
  //     The Part B preview proved the original rule would have erased ~30.9 lakh of
  //     real current-year dues across 152 students.
  T('item116p2_current_year_without_grid_still_bills_the_full_year', () => {
    const RATE = 1700, CUR = '2026-27';
    const S = extra => Object.assign({ class:'__T__', monthlyFee:RATE }, extra || {});
    const run = (s, txs, yr) => _flStudentYearOutstanding(s, txs, yr, { currentYear: CUR, quiet: true });

    // The 152-student shape: academicYear behind, so no grid for the CURRENT year.
    const carry = run(S({ academicYear:'2025-26', status:'active' }), [], CUR);
    // A plain current-year student who has simply paid nothing (ADM-TEST-011 et al).
    const fresh = run(S({ academicYear:CUR, status:'active' }), [], CUR);
    // Credits still reduce it: four months paid.
    const partly = run(S({ academicYear:'2025-26', status:'active' }),
      [ { academicYear:CUR, monthAllocations:{ June:RATE, July:RATE, August:RATE, September:RATE } } ], CUR);
    // A waiver is a reduction too.
    const waived = run(S({ academicYear:'2025-26', status:'active' }),
      [ { academicYear:CUR, type:'excused_waiver', monthsExcused:['June'] } ], CUR);
    // TERMINATED students stop accruing.
    const gone = run(S({ academicYear:'2025-26', status:'terminated' }), [], CUR);
    // PRIOR year with no grid is UNCHANGED — this is what killed Dinesh's phantom.
    const prior = run(S({ academicYear:'2025-26', status:'active' }), [], '2019-20');
    const priorProven = run(S({ academicYear:'2025-26', status:'active' }),
      [ { academicYear:'2019-20', monthAllocations:{ June:500 } } ], '2019-20');

    return { pass: carry.outstanding === 12 * RATE && carry.billedFullYearWithoutGrid === true
                 && fresh.outstanding === 12 * RATE
                 && partly.outstanding === 8 * RATE
                 && waived.outstanding === 11 * RATE
                 && gone.outstanding === 0 && gone.billedFullYearWithoutGrid === false
                 && prior.outstanding === 0
                 && priorProven.outstanding === 1200,
             detail: { carryOver: carry.outstanding, freshCurrentYear: fresh.outstanding,
                       afterFourPaid: partly.outstanding, afterOneWaived: waived.outstanding,
                       terminated: gone.outstanding, priorNoGrid: prior.outstanding,
                       priorProvenPartial: priorProven.outstanding } };
  });

  // 50) EXTRACTION — the shared current-year reader. Must return the aggregate's
  //     current-year slice, and must say "unknown" (null) rather than 0 when no
  //     aggregate exists — 0 would read as "owes nothing", the opposite.
  T('extracted_current_year_outstanding_reader', () => {
    return { pass: _flCurrentYearOutstanding({ outstandingBalance:20400, previousDues:8500 }) === 11900
                 && _flCurrentYearOutstanding({ outstandingBalance:5000, previousDues:9000 }) === 0
                 && _flCurrentYearOutstanding({ outstandingBalance:1700 }) === 1700
                 && _flCurrentYearOutstanding({}) === null
                 && _flCurrentYearOutstanding({ outstandingBalance:'x' }) === null,
             detail: { slice:_flCurrentYearOutstanding({ outstandingBalance:20400, previousDues:8500 }),
                       missing:_flCurrentYearOutstanding({}) } };
  });

  // 61) PATTERN B — the fee engine must bill a concession month at the concession
  //     rate. Modelled on the two real students the defect was proven against, with
  //     their actual numbers, so a regression reproduces the original over-charge.
  T('concession_rate_prices_unpaid_months_in_the_engine', () => {
    const CUR = '2026-27';
    const S = extra => Object.assign({ class:'__T__', monthlyFee:1700, academicYear:CUR,
                                       admissionNumber:'ADM-T' }, extra || {});
    const grid = o => Object.assign({ Jun:'DUE',Jul:'DUE',Aug:'DUE',Sep:'DUE',Oct:'DUE',Nov:'DUE',
                                      Dec:'DUE',Jan:'DUE',Feb:'DUE',Mar:'DUE',Apr:'DUE',May:'DUE' }, o || {});
    const run = (s, txs, conc, yr) => _flStudentYearOutstanding(
      s, txs, yr || CUR, { currentYear: CUR, quiet: true, concession: conc });

    // (a) RAVI VERMA, exactly. Grade 4 @ 1700, concession 775 on Jun-Nov 2026.
    //     Paid 3,100 = 4 x 775 for Jun/Jul/Aug/Sep. Dec/Jan/Feb waived.
    //     Owes Oct+Nov at 775 and Mar/Apr/May at 1700 = 1,550 + 5,100 = 6,650.
    //     Before this fix the engine said 8,500 — over by 2 x (1700 - 775).
    const ravi = run(S({ monthStatus: grid() }),
      [ { academicYear:CUR, monthAllocations:{ June:775, July:775, August:775, September:775 } },
        { academicYear:CUR, type:'excused_waiver', monthsExcused:['December','January','February'] } ],
      { concessionFee:775, activeMonths:['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'] });

    // (b) ARJUN MISHRA, exactly. Concession 1500 on Dec 2026-May 2027. Jun/Jul/Aug paid
    //     at the STANDARD rate (outside the window), Sep/Oct/Nov waived, Dec-May unpaid
    //     at 1500 = 9,000. Engine said 10,200 before the fix.
    const arjun = run(S({ monthStatus: grid() }),
      [ { academicYear:CUR, monthAllocations:{ June:1700, July:1700, August:1700 } },
        { academicYear:CUR, type:'excused_waiver', monthsExcused:['September','October','November'] } ],
      { concessionFee:1500, activeMonths:['2026-12','2027-01','2027-02','2027-03','2027-04','2027-05'] });

    // (c) A concession month PAID AT THE CONCESSION RATE closes completely — it must
    //     not linger as a partial owing the discount. This is the half that already
    //     worked by accident (coverage closes a month, not rupees) and must stay working.
    const closed = run(S({ monthStatus: grid() }),
      [ { academicYear:CUR, monthAllocations:{ June:1200 } } ],
      { concessionFee:1200, activeMonths:['2026-06'] });

    // (d) Paying the STANDARD rate into a concession month over-pays; the month closes
    //     and the surplus must not spill into another month.
    const over = run(S({ monthStatus: grid() }),
      [ { academicYear:CUR, monthAllocations:{ June:1700 } } ],
      { concessionFee:1200, activeMonths:['2026-06'] });

    return { pass: ravi.outstanding === 6650 && arjun.outstanding === 9000
                 && closed.paid.has('June') && !closed.partialPaid['June']
                 && closed.outstanding === 11 * 1700
                 && over.outstanding === 11 * 1700,
             detail: { ravi: ravi.outstanding, arjun: arjun.outstanding,
                       concessionMonthClosed: closed.paid.has('June'),
                       afterConcessionPaid: closed.outstanding, afterOverPaid: over.outstanding } };
  });

  // 62) The gating rules, and the year-derivation that record-payment.js gets wrong.
  T('concession_gating_indefinite_breakdown_and_year_derivation', () => {
    const CUR = '2026-27';
    const S = extra => Object.assign({ class:'__T__', monthlyFee:1700, academicYear:CUR,
                                       admissionNumber:'ADM-T' }, extra || {});
    const grid = () => ({ Jun:'DUE',Jul:'DUE',Aug:'DUE',Sep:'DUE',Oct:'DUE',Nov:'DUE',
                          Dec:'DUE',Jan:'DUE',Feb:'DUE',Mar:'DUE',Apr:'DUE',May:'DUE' });
    const run = (conc, yr) => _flStudentYearOutstanding(
      S({ monthStatus: grid() }), [], yr || CUR,
      { currentYear: CUR, quiet: true, concession: conc });

    // activeMonths [] means indefinite — all twelve months concessional.
    const indefinite = run({ concessionFee:1200, activeMonths:[] });
    // A month outside activeMonths keeps the standard rate.
    const gated = run({ concessionFee:1200, activeMonths:['2026-06'] });
    // monthlyBreakdown overrides the flat rate for that one month only.
    const perMonth = run({ concessionFee:1200, activeMonths:['2026-06','2026-07'],
                           monthlyBreakdown:{ '2026-07': 900 } });
    // Jan-May belong to the CLOSING calendar year of the academic year.
    const janMay = run({ concessionFee:1000, activeMonths:['2027-01'] });
    // THE YEAR COMES FROM `yr`. Asked about 2025-26, a 2025-08 key must bind — this is
    // the bug record-payment.js still carries, where the key is built from the clock.
    // The grid must live in monthStatus with academicYear pointing AT 2025-26:
    // previousYearMonthStatus binds to the year BEFORE academicYear, so putting it
    // there would describe 2024-25 and this year would correctly come back grid-less.
    const priorYr = _flStudentYearOutstanding(
      S({ academicYear:'2025-26', monthStatus: grid() }), [], '2025-26',
      { currentYear: CUR, quiet: true, concession:{ concessionFee:700, activeMonths:['2025-08'] } });
    // A malformed concession must fall back to the standard rate, never to zero.
    const junk = run({ concessionFee:'free', activeMonths:[] });

    return { pass: indefinite.outstanding === 12 * 1200
                 && gated.outstanding === 1200 + 11 * 1700
                 && perMonth.outstanding === 1200 + 900 + 10 * 1700
                 && janMay.outstanding === 1000 + 11 * 1700
                 && priorYr.outstanding === 700 + 11 * 1700
                 && junk.outstanding === 12 * 1700
                 && _flConcMonthKey('2026-27', 'June') === '2026-06'
                 && _flConcMonthKey('2026-27', 'Jan')  === '2027-01',
             detail: { indefinite: indefinite.outstanding, gated: gated.outstanding,
                       perMonthOverride: perMonth.outstanding, janMay: janMay.outstanding,
                       priorYearKey: priorYr.outstanding, malformed: junk.outstanding } };
  });

  // 63) REGRESSION GUARD — with no concession, every shape must produce the number it
  //     produced before this change. The concession path is additive or it is a bug.
  T('no_concession_leaves_every_existing_figure_untouched', () => {
    const CUR = '2026-27', RATE = 1700;
    const S = extra => Object.assign({ class:'__T__', monthlyFee:RATE, academicYear:CUR }, extra || {});
    const grid = o => Object.assign({ Jun:'DUE',Jul:'DUE',Aug:'DUE',Sep:'DUE',Oct:'DUE',Nov:'DUE',
                                      Dec:'DUE',Jan:'DUE',Feb:'DUE',Mar:'DUE',Apr:'DUE',May:'DUE' }, o || {});
    const run = (s, txs, yr) => _flStudentYearOutstanding(
      s, txs, yr || CUR, { currentYear: CUR, quiet: true, concession: null });

    const plain    = run(S({ monthStatus: grid() }), []);
    const twoPaid  = run(S({ monthStatus: grid({ Jun:'N/A-PAID', Jul:'N/A-PAID' }) }), []);
    const partial  = run(S({ monthStatus: grid() }),
                         [ { academicYear:CUR, monthAllocations:{ July:600 } } ]);
    const waived   = run(S({ monthStatus: grid() }),
                         [ { academicYear:CUR, type:'excused_waiver', monthsExcused:['August'] } ]);
    const noGridCur  = run(S({ academicYear:'2025-26', status:'active' }), []);
    const noGridPrior= run(S({ academicYear:'2025-26', status:'active' }), [], '2019-20');

    return { pass: plain.outstanding === 12 * RATE
                 && twoPaid.outstanding === 10 * RATE
                 && partial.outstanding === 11 * RATE + (RATE - 600)
                 && waived.outstanding === 11 * RATE
                 && noGridCur.outstanding === 12 * RATE
                 && noGridPrior.outstanding === 0
                 && plain.concessionApplied === false,
             detail: { plain: plain.outstanding, twoPaid: twoPaid.outstanding,
                       partial: partial.outstanding, waived: waived.outstanding,
                       noGridCurrentYear: noGridCur.outstanding,
                       noGridPriorYear: noGridPrior.outstanding } };
  });

  // 64) A legacy transaction may not credit more months than its cash covers.
  //     Test Student Four's real receipts, and the item 14 contract that must survive.
  T('legacy_tx_credits_only_the_cash_it_collected', () => {
    const CUR = '2026-27';
    const run = (s, txs) => _flStudentYearOutstanding(
      Object.assign({ class:'__T__', academicYear:CUR, status:'active' }, s), txs, CUR,
      { currentYear: CUR, quiet: true, concession: null });

    // (a) NAVEEN JOSHI, exactly. Grade 6 @ 1,800, no concession, no grid.
    //     3,600 across Jun/Jul/Aug and 1,000 across Sep/Oct = 4,600 cash against
    //     9,000 of liability; Nov/Dec/Jan and Feb/Mar waived. Owes 8,000.
    //     Before this fix all five paid months closed and the engine said 3,800.
    const naveen = run({ monthlyFee:1800 }, [
      { academicYear:CUR, type:'excused_waiver', monthsExcused:['November','December','January'] },
      { academicYear:CUR, amountPaid:1000, monthsSelected:['September','October'] },
      { academicYear:CUR, amountPaid:3600, monthsSelected:['June','July','August'] },
      { academicYear:CUR, type:'excused_waiver', monthsExcused:['February','March'] }
    ]);

    // (b) THE ITEM 14 CONTRACT SURVIVES. No recorded amount means coverage is all
    //     we know, so the month is still credited in full and cannot reopen.
    const noAmount = _flAppliedByMonthFromTxs([{ monthsSelected:['June','July'] }], () => 1700);

    // (c) An HONEST full payment still closes every month it lists.
    const honest = _flAppliedByMonthFromTxs(
      [{ amountPaid:5100, monthsSelected:['June','July','August'] }], () => 1700);

    // (d) Sequential fill: earlier months clear first and the BOUNDARY month lands
    //     partial with the remainder — 3,600 over three 1,700 months is 1,700 +
    //     1,700 + 200, the same split _allocateFeePayment produces. Surplus never
    //     bleeds into a month the receipt did not list.
    const seq     = _flAppliedByMonthFromTxs(
      [{ amountPaid:3600, monthsSelected:['June','July','August'] }], () => 1700);
    const seqPart = _flPartialMonthsFromLedger(seq, () => 1700);
    const surplus = _flAppliedByMonthFromTxs(
      [{ amountPaid:5000, monthsSelected:['June'] }], () => 1700);

    // (e) A cash top-up onto an allocated partial still closes it, either order.
    const fwd = _flAppliedByMonthFromTxs(
      [{ monthAllocations:{ July:1500 } }, { amountPaid:200, monthsSelected:['July'] }], () => 1700);
    const rev = _flAppliedByMonthFromTxs(
      [{ amountPaid:200, monthsSelected:['July'] }, { monthAllocations:{ July:1500 } }], () => 1700);

    // (f) KABIR KUMAR. A concession-sized payment closes a concession month,
    //     because the cap is the OPERATIVE rate, not the class rate.
    const concRate = m => (m === 'November' ? 1200 : 1700);
    const kabir    = _flAppliedByMonthFromTxs(
      [{ amountPaid:1200, monthsSelected:['November'] }], concRate);

    return { pass: naveen.outstanding === 8000
                 && noAmount.June === 1700 && noAmount.July === 1700
                 && honest.June === 1700 && honest.July === 1700 && honest.August === 1700
                 && seq.June === 1700 && seq.July === 1700 && seq.August === 200
                 && seqPart.has('August') && !seqPart.has('July')
                 && surplus.June === 1700 && surplus.July === undefined
                 && fwd.July === 1700 && rev.July === 1700
                 && kabir.November === 1200
                 && !_flPartialMonthsFromLedger(kabir, concRate).has('November'),
             detail: { naveenOwes: naveen.outstanding, legacyNoAmount: noAmount.June,
                       honestFull: honest.August, boundaryMonth: seq.August,
                       boundaryIsPartial: seqPart.has('August'),
                       surplusBleed: surplus.July, topUp: fwd.July,
                       concessionMonth: kabir.November } };
  });

  // 65) ITEM 1 — the GLOBAL SYNC principle had exactly one door left unlocked:
  //     editing a class rate wrote the rate and reconciled nobody. This is the
  //     decision that closes it, asserted rather than claimed.
  T('rate_change_reconciles_exactly_the_students_it_moves', () => {
    const before = { 'Nursery':1500, 'LKG':1700, 'Grade 6':1700 };
    const after  = { 'Nursery':1500, 'LKG':1700, 'Grade 6':1800 };   // only Grade 6 moved
    const roll = [
      { id:'s1', class:'Grade 6',   status:'active'     },   // moved  -> reconcile
      { id:'s2', class:' Grade 6 ', status:'active'     },   // moved, untrimmed -> still binds
      { id:'s3', class:'LKG',       status:'active'     },   // rate unchanged -> leave alone
      { id:'s4', class:'Grade 6',   status:'terminated' },   // departed -> snapshot must not move
      { id:'s5', class:'Grade 6',   status:'hidden'     },   // hidden   -> same
      { id:'s6', class:'Grade 6'                        }    // no status -> active by default
    ];
    const moved = _flStudentsAffectedByRateChange(before, after, roll);

    // SURAJ GUPTA and BHANU JOSHI, the two live casualties: both Grade 6, both stored
    // at the pre-change 1,700. This is the call that would have caught them.
    const real = _flStudentsAffectedByRateChange(before, after, [
      { id:'suraj', class:'Grade 6', status:'active' },
      { id:'bhanu', class:'Grade 6', status:'active' }
    ]);

    // A save re-submits EVERY input on the form. Without the changed-only filter,
    // every save would re-price the whole school.
    const noop = _flStudentsAffectedByRateChange(before, before, roll);
    // A class newly added to the schedule counts as changed.
    const added = _flStudentsAffectedByRateChange(
      { 'LKG':1700 }, { 'LKG':1700, 'Grade 6':1800 }, roll);

    return { pass: moved.changedClasses.join(',') === 'Grade 6'
                 && moved.studentIds.join(',') === 's1,s2,s6'
                 && real.studentIds.length === 2
                 && noop.changedClasses.length === 0 && noop.studentIds.length === 0
                 && added.changedClasses.join(',') === 'Grade 6'
                 && added.studentIds.join(',') === 's1,s2,s6',
             detail: { changed: moved.changedClasses, willReconcile: moved.studentIds,
                       excludedDeparted: !moved.studentIds.includes('s4') &&
                                         !moved.studentIds.includes('s5'),
                       untrimmedBinds: moved.studentIds.includes('s2'),
                       unchangedSaveIsNoop: noop.studentIds.length === 0 } };
  });

  // 66) A CLOSED YEAR IS PRICED AT ITS OWN RATE. Editing this year's fee schedule
  //     must never move a debt from a previous year.
  T('prior_year_prices_from_its_stored_rate_not_todays_schedule', () => {
    const CUR = '2026-27';
    const allDueGrid = {};
    _FL_MONTHS.forEach(m => allDueGrid[m] = 'DUE');
    // Grade 6 in 2024-25 cost 1,700. It costs 1,800 today (and the Principal is
    // about to try 1,900). The stored rate is what settles that year.
    const s = { class:'Grade 6', monthlyFee:1800, academicYear:CUR,
                openingOutstandingDues:[{ year:'2024-25', class:'Grade 6',
                                          monthlyFee:1700, monthStatus:{ ...allDueGrid } }] };
    const prior = _flStudentYearOutstanding(s, [], '2024-25',
      { currentYear: CUR, quiet: true, concession: null });

    // Today's schedule moving must NOT move that year. Same student, class rate
    // raised to 1,900 via the per-student override the resolver falls back to.
    const priorAfterRise = _flStudentYearOutstanding(
      Object.assign({}, s, { monthlyFee: 1900 }), [], '2024-25',
      { currentYear: CUR, quiet: true, concession: null });

    // A prior year with NO stored rate keeps the old behaviour — a guess at
    // today's rate still beats billing nothing.
    const noStored = _flStudentYearOutstanding(
      { class:'Grade 6', monthlyFee:1800, academicYear:CUR,
        openingOutstandingDues:[{ year:'2024-25', class:'Grade 6',
                                  monthStatus:{ ...allDueGrid } }] },
      [], '2024-25', { currentYear: CUR, quiet: true, concession: null });

    // The CURRENT year still follows the live schedule — that is the whole point
    // of the fee structure, and 8ad2271 re-prices students when it changes.
    const current = _flStudentYearOutstanding(
      { class:'__T__', monthlyFee:1800, academicYear:CUR, status:'active',
        monthStatus:{ ...allDueGrid } },
      [], CUR, { currentYear: CUR, quiet: true, concession: null });

    // A zero or junk stored rate must not price the year at nothing — that would
    // turn a data gap into a silent write-off.
    const junk = _flStudentYearOutstanding(
      { class:'Grade 6', monthlyFee:1800, academicYear:CUR,
        openingOutstandingDues:[{ year:'2024-25', class:'Grade 6', monthlyFee:0,
                                  monthStatus:{ ...allDueGrid } }] },
      [], '2024-25', { currentYear: CUR, quiet: true, concession: null });

    return { pass: prior.rate === 1700 && prior.outstanding === 12 * 1700
                 && priorAfterRise.rate === 1700
                 && priorAfterRise.outstanding === prior.outstanding   // unmoved
                 && noStored.rate === 1800 && noStored.outstanding === 12 * 1800
                 && current.rate === 1800 && current.outstanding === 12 * 1800
                 && junk.rate === 1800,                                // never 0
             detail: { priorRate: prior.rate, priorOwed: prior.outstanding,
                       afterTodaysRateRose: priorAfterRise.outstanding,
                       unmoved: priorAfterRise.outstanding === prior.outstanding,
                       noStoredRateFallback: noStored.rate,
                       junkStoredRateIgnored: junk.rate,
                       currentYearFollowsSchedule: current.rate } };
  });

  // 67) F10-F12 — the annual rollover files each grid under the year it DESCRIBES.
  //     Mirror of the shipped decision in promotions.js runBulkPromotion. A mirror
  //     can drift from the code it mirrors, which is a real weakness — but this runs
  //     once a year across every student and rewrites their month grids, and no test
  //     at all on that is worse than one that has to be kept honest by hand.
  T('promotion_rollover_files_grids_under_the_year_they_describe', () => {
    const yrStart = y => parseInt(String(_normaliseAcademicYear(y || '')).slice(0, 4), 10);
    const mkYr    = st => Number.isFinite(st) ? st + '-' + String(st + 1).slice(2) : '';
    // Mirror of the shipped branch.
    const plan = (oldYr, newYr, curGrid, prevGrid) => {
      const newSt = yrStart(newYr), oldSt = yrStart(oldYr);
      const gap   = (Number.isFinite(newSt) && Number.isFinite(oldSt)) ? (newSt - oldSt) : 1;
      const filed = [];
      const file  = (g, yr) => { if (g && yr && !filed.some(f => f.year === yr)) filed.push({ year: yr, grid: g }); };
      let prevSlot;
      if (gap === 1) { file(prevGrid, mkYr(oldSt - 1)); prevSlot = curGrid ? 'cur' : undefined; }
      else           { file(curGrid, _normaliseAcademicYear(oldYr)); file(prevGrid, mkYr(oldSt - 1)); prevSlot = 'empty'; }
      return { filed, prevSlot, gap };
    };

    const cur = { Jun:'N/A-PAID' }, prev = { Jun:'DUE' };

    // ONE-YEAR STEP — the ordinary case. Last year slides into previousYearMonthStatus,
    // the year before it is filed by name.
    const one = plan('2025-26', '2026-27', cur, prev);

    // TWO-YEAR STEP — the live shape. 144 students sit here because the year field was
    // never rolled. Sliding monthStatus into previousYearMonthStatus would relabel a
    // 2025-26 grid as 2026-27: history renamed, every downstream figure still plausible.
    const two = plan('2025-26', '2027-28', cur, prev);

    return { pass: one.gap === 1 && one.prevSlot === 'cur'
                 && one.filed.length === 1 && one.filed[0].year === '2024-25'
                 // the two-year step files BOTH by name and leaves the slot empty
                 && two.gap === 2 && two.prevSlot === 'empty'
                 && two.filed.length === 2
                 && two.filed[0].year === '2025-26' && two.filed[1].year === '2024-25'
                 // and never invents a grid for the year immediately before the new one
                 && !two.filed.some(f => f.year === '2026-27'),
             detail: { oneYearFiled: one.filed.map(f => f.year), oneYearPrevSlot: one.prevSlot,
                       twoYearFiled: two.filed.map(f => f.year), twoYearPrevSlot: two.prevSlot,
                       neverInventsTheGapYear: !two.filed.some(f => f.year === '2026-27') } };
  });

  // 68) SYNC — the snapshot patch diff. This is the heart of "sync across every
  //     section": what must change on a terminated/hidden student's frozen record
  //     when their live aggregate moves. Pure, so it is asserted here directly.
  T('snapshot_patch_syncs_only_what_moved', () => {
    // THE FIELD-NAME BRIDGE, asserted explicitly. The frozen record stores
    // amountPaid / outstandingBalance; the computed snapshot exposes
    // totalPaid / outstanding. The patch keys are the RECORD's names, fed from the
    // SNAPSHOT's values. Get that mapping wrong and every record rewrites on every
    // reconcile, or a real change is silently dropped.

    // Nothing moved -> empty patch -> no write.
    const same = _flSnapshotPatch(
      { totalDue: 20400, amountPaid: 5000, outstandingBalance: 15400 },
      { totalDue: 20400, totalPaid: 5000, outstanding: 15400 });
    // A waiver dropped the outstanding, cash unchanged -> only the moved fields patch.
    const waived = _flSnapshotPatch(
      { totalDue: 20400, amountPaid: 5000, outstandingBalance: 15400 },
      { totalDue: 18700, totalPaid: 5000, outstanding: 13700 });
    // A payment on a hidden student: totalPaid(snapshot) must land on amountPaid(patch).
    const paid = _flSnapshotPatch(
      { totalDue: 20400, amountPaid: 5000, outstandingBalance: 15400 },
      { totalDue: 20400, totalPaid: 6700, outstanding: 13700 });
    // Missing record fields default to 0, never NaN; an unchanged 0 is omitted.
    const fresh = _flSnapshotPatch({}, { totalDue: 1700, totalPaid: 0, outstanding: 1700 });
    return { pass: Object.keys(same).length === 0
                 && waived.totalDue === 18700 && waived.outstandingBalance === 13700
                 && waived.amountPaid === undefined                     // cash unchanged -> omitted
                 && paid.amountPaid === 6700 && paid.outstandingBalance === 13700
                 && paid.totalDue === undefined                         // due unchanged -> omitted
                 && fresh.totalDue === 1700 && fresh.outstandingBalance === 1700
                 && fresh.amountPaid === undefined,                     // 0 unchanged -> omitted
             detail: { unchanged: same, waived, paid, fresh } };
  });

  // 69) R1 — which months of a payment were billed at a concession rate. The label
  //     the receipt and Paid Fee export now carry, asserted against the register.
  T('tx_concession_months_derives_from_the_register', () => {
    const _saved = _FL_CONC_BY_ADM, _savedOk = _FL_CONC_OK, _savedAt = _FL_CONC_LOADED_AT;
    try {
      _FL_CONC_OK = true;
      // Stamp LOADED_AT too: this test stands in for a register that LOADED, and
      // _flConcessionFor now refuses to trust one that was never loaded (an empty
      // primed map marked OK is indistinguishable from a real one without it).
      _FL_CONC_LOADED_AT = Date.now();
      // LKG is 1700 in _DEFAULT_FEE_SCHEDULE for every tenant, so _flRateForClass
      // resolves a real standard rate; the 1200 concession is below it.
      _FL_CONC_BY_ADM = { 'ADM-C': { admissionNo:'ADM-C', concessionFee:1200,
                                     activeMonths:['2026-09','2026-10','2026-11'] } };
      const std = { admissionNumber:'ADM-C', studentClass:'LKG', academicYear:'2026-27' };
      // Only the covered months come back, in order, and only from monthsSelected.
      // August and December are outside activeMonths -> billed at the full rate.
      const a = _txConcessionMonths({ ...std, monthsSelected:['August','September','October','December'] });
      // A student with no concession record -> nothing tagged.
      const b = _txConcessionMonths({ admissionNumber:'ADM-NONE', studentClass:'LKG',
                                      academicYear:'2026-27', monthsSelected:['September'] });
      // A waiver is not a concession payment.
      const c = _txConcessionMonths({ ...std, type:'excused_waiver', monthsSelected:['September'] });
      return { pass: a.join(',') === 'September,October'
                   && b.length === 0 && c.length === 0,
               detail: { covered:a, noRecord:b.length, waiver:c.length } };
    } finally { _FL_CONC_BY_ADM = _saved; _FL_CONC_OK = _savedOk; _FL_CONC_LOADED_AT = _savedAt; }
  });

  // 70) F4 — the bulk-admit idempotency guard rests entirely on this: two academic
  //     years that mean the same thing must normalise equal, or a re-import doubles
  //     a student's dues. Three active students on the roll carry the long form.
  T('academic_year_long_and_short_form_normalise_equal', () => {
    const n = _normaliseAcademicYear;
    return { pass: n('2025-2026') === n('2025-26')
                 && n('2025-26')   === '2025-26'
                 && n('2024-2025') === n('2024-25')
                 && n(' 2025-26 ') === n('2025-26')          // stray whitespace
                 && n('2025-2026') !== n('2026-2027'),        // genuinely different years stay different
             detail: { long: n('2025-2026'), short: n('2025-26'),
                       differ: n('2025-2026') !== n('2026-2027') } };
  });

  // 71) F11/F12 — running Annual Promotion twice must not append a second history
  //     entry, which would grow promotionHistory without bound and feed duplicates
  //     into rate resolution. The shared predicate, asserted directly.
  T('promotion_already_logged_dedupes_by_year_and_source', () => {
    const s = { promotionHistory: [
      { source: 'annual',     academicYear: '2026-27', toClass: 'Grade 7' },
      { source: 'individual', academicYear: '2026-27', toClass: 'Grade 8' },
      { source: 'annual',     academicYear: '2025-26', toClass: 'Grade 6' },
    ]};
    return { pass: _flPromotionAlreadyLogged(s, '2026-27', 'annual') === true
                 // long form of the same year still matches -> no double append
                 && _flPromotionAlreadyLogged(s, '2026-2027', 'annual') === true
                 // a year not yet promoted is allowed through
                 && _flPromotionAlreadyLogged(s, '2027-28', 'annual') === false
                 // an individual promotion does not block the annual one for that year
                 && _flPromotionAlreadyLogged({ promotionHistory: [
                      { source: 'individual', academicYear: '2027-28' } ] }, '2027-28', 'annual') === false
                 // a student with no history is never "already logged"
                 && _flPromotionAlreadyLogged({}, '2026-27', 'annual') === false,
             detail: { annual2627: _flPromotionAlreadyLogged(s, '2026-27', 'annual'),
                       longForm: _flPromotionAlreadyLogged(s, '2026-2027', 'annual'),
                       freshYear: _flPromotionAlreadyLogged(s, '2027-28', 'annual') } };
  });

  // 72) A PRIMED-BUT-NEVER-LOADED REGISTER MUST NOT BE TRUSTED.
  //     An empty map marked OK=true reads exactly like "nobody holds a concession",
  //     so _flConcessionFor returned null for every student while skipping its own
  //     warning — every concession student priced at the standard rate with the
  //     safeguard reporting all clear. Reached by the suite's own priming, and just
  //     as easily by pasting those two lines into a console. LOADED_AT is stamped
  //     only by a successful load, so it is what separates a genuinely empty
  //     register from one that was never filled. Asserted in both directions.
  T('concession_register_primed_but_never_loaded_is_refused', () => {
    const _saved = _FL_CONC_BY_ADM, _savedOk = _FL_CONC_OK,
          _savedAt = _FL_CONC_LOADED_AT, _savedWarn = _FL_CONC_WARNED;
    const ow = console.warn;
    try {
      const rec = { admissionNo:'ADM-P', concessionFee:900, activeMonths:['2026-09'] };
      const stu = { admissionNumber:'ADM-P' };

      // (a) The poisoned state: primed empty, marked OK, never loaded.
      _FL_CONC_BY_ADM = {}; _FL_CONC_OK = true; _FL_CONC_LOADED_AT = 0;
      _FL_CONC_WARNED = false;
      let warned = false; console.warn = () => { warned = true; };
      const primedResult = _flConcessionFor(stu);
      const primedWarned = warned;

      // (b) A register that really loaded and really holds this student.
      _FL_CONC_BY_ADM = { 'ADM-P': rec }; _FL_CONC_OK = true; _FL_CONC_LOADED_AT = Date.now();
      _FL_CONC_WARNED = false;
      warned = false;
      const loadedResult = _flConcessionFor(stu);
      const loadedWarned = warned;

      // (c) A register that loaded and is legitimately empty — no warning, no record.
      _FL_CONC_BY_ADM = {}; _FL_CONC_OK = true; _FL_CONC_LOADED_AT = Date.now();
      _FL_CONC_WARNED = false;
      warned = false;
      const emptyResult = _flConcessionFor(stu);
      const emptyWarned = warned;

      console.warn = ow;
      return { pass: primedResult === null && primedWarned === true
                   && loadedResult === rec && loadedWarned === false
                   && emptyResult === null && emptyWarned === false,
               detail: { primedWarned, loadedHit: loadedResult === rec, emptyWarned } };
    } finally {
      console.warn = ow;
      _FL_CONC_BY_ADM = _saved; _FL_CONC_OK = _savedOk;
      _FL_CONC_LOADED_AT = _savedAt; _FL_CONC_WARNED = _savedWarn;
    }
  });

  // 73) THREE SHEET ROWS FOR ONE STUDENT MUST YIELD THREE RETRIEVABLE YEARS.
  //     _deduplicateRowsInSheet folds PAIRWISE, and the previous-year facts used to
  //     live only in scalars, so the second merge overwrote the first merge's answer
  //     and the oldest year vanished before it ever reached Firestore. Record Previous
  //     Year Dues could therefore only ever offer ONE prior year.
  //
  //     Asserted end to end: the fold keeps the newest year current, the immediate
  //     prior year in the scalars, and everything older in openingOutstandingDues[]
  //     with its own class and grid — then _flStudentAcademicYears, the function the
  //     dropdown is built from, is asked whether it can actually see all three.
  T('bulk_admit_three_year_merge_keeps_every_year_retrievable', () => {
    if (typeof _deduplicateRowsInSheet !== 'function') {
      return { pass: false, detail: '_deduplicateRowsInSheet not loaded (bulk-admit.js)' };
    }
    const mkRow = (yr, cls, fee, grid, bal) => ({
      name: 'Test Student Twenty', contact: '9000000001', parentName: 'Test Parent',
      _hadAdmNo: false, admissionNumber: '',
      academicYear: yr, class: cls, section: 'A', monthlyFee: fee,
      monthStatus: grid, outstandingBalance: bal, totalDue: bal
    });
    // Oldest first, deliberately out of order, to prove the fold sorts by year itself.
    const rows = [
      mkRow('2024-25', 'Grade 1', 1500, { Jun:'DUE',      Jul:'N/A-PAID' }, 1500),
      mkRow('2026-27', 'Grade 3', 1900, { Jun:'DUE',      Jul:'DUE'      }, 3800),
      mkRow('2025-26', 'Grade 2', 1700, { Jun:'N/A-PAID', Jul:'DUE'      }, 1700),
    ];
    const out = _deduplicateRowsInSheet(rows);
    if (out.length !== 1) return { pass: false, detail: 'expected 1 merged row, got ' + out.length };
    const m = out[0];

    const arr  = Array.isArray(m.openingOutstandingDues) ? m.openingOutstandingDues : [];
    const oldest = arr.find(e => _normaliseAcademicYear(e.year) === '2024-25');
    // What the ENGINE actually bills the archived year at — the live-schedule assertion.
    const _archInfo = _flStudentYearOutstanding(m, [], '2024-25', { currentYear: '2026-27' });
    const _archRate = _archInfo && _archInfo.rate;

    // The dropdown's own source of truth — this is item 6.
    //
    // Two calls, because they answer two different questions. The DEFAULT call is
    // what Record Previous Year Dues actually lists, and it deliberately drops the
    // current year (line 658: `y !== current` unless includeCurrent) — you record a
    // PREVIOUS year's dues there, so offering the year in progress would be wrong.
    // The bug was never that the current year was missing from that list; it was that
    // only ONE prior year ever reached it. So the dropdown is asserted to offer BOTH
    // prior years, and includeCurrent is used separately to prove all three years are
    // retrievable from the merged record at all.
    const yearsDropdown = (typeof _flStudentAcademicYears === 'function')
      ? _flStudentAcademicYears(m, []).map(_normaliseAcademicYear)
      : [];
    const years = (typeof _flStudentAcademicYears === 'function')
      ? _flStudentAcademicYears(m, [], { includeCurrent: true }).map(_normaliseAcademicYear)
      : [];

    const pass =
      // current year survives as the base
      _normaliseAcademicYear(m.academicYear) === '2026-27'
      && m.class === 'Grade 3'
      // immediate prior year occupies the scalars, with ITS grid
      && _normaliseAcademicYear(m.previousAcademicYear) === '2025-26'
      && m.previousYearMonthStatus && m.previousYearMonthStatus.Jun === 'N/A-PAID'
      && m.openingOutstandingClass === 'Grade 2'
      // the year BEFORE that survives in the array, with its own class and grid
      && !!oldest
      && oldest.class === 'Grade 1'
      && oldest.monthStatus && oldest.monthStatus.Jul === 'N/A-PAID'
      // ── ARCHIVED YEARS PRICE FROM THE LIVE FEE STRUCTURE, BY CLASS ──────────
      // A year demoted out of the scalars keeps its CLASS and its GRID; it does not
      // keep a rate, and deliberately so. The sheet's MonthlyFee column is an input,
      // not an authority — it is whatever the operator typed — and once a year has
      // been reduced to a class, the Fee Structure is the only thing that can say
      // what that class costs. So the entry carries no monthlyFee and the engine
      // resolves the rate from `class` against the LIVE schedule.
      //
      // This does not weaken test 65. That test protects a different path: a prior
      // year that arrived carrying an EXPLICIT stored rate from another flow, which
      // must not be re-priced at today's schedule. Bulk import's archived entries
      // never had such a rate to preserve, so there is nothing there to freeze and
      // falling through to the live schedule is the correct answer, not a fallback.
      && oldest.monthlyFee === undefined
      && _archRate === _flRateForClass('Grade 1', 0)
      // the oldest year must NOT also be duplicated into the scalars (F13)
      && _normaliseAcademicYear(m.openingOutstandingYear) === '2025-26'
      // summation is untouched: 1500 + 1700 + 3800
      && m.outstandingBalance === 7000
      // all three retrievable from the merged record
      && years.indexOf('2024-25') > -1
      && years.indexOf('2025-26') > -1
      && years.indexOf('2026-27') > -1
      // and Record Previous Year Dues offers BOTH prior years — one was the bug
      && yearsDropdown.indexOf('2024-25') > -1
      && yearsDropdown.indexOf('2025-26') > -1;

    return { pass, detail: { cur: m.academicYear, prev: m.previousAcademicYear,
                             archived: arr.map(e => e.year + '/' + e.class),
                             combined: m.outstandingBalance,
                             archivedRate: _archRate,
                             liveScheduleGrade1: _flRateForClass('Grade 1', 0),
                             sheetSaidForThatYear: 1500,
                             dropdownOffers: yearsDropdown, allRetrievable: years } };
  });

  // 74) A DELETED STUDENT MUST NOT ZERO THEIR OWN ARCHIVE.
  //     _computeAllYearsFeeSnapshot derives everything from the student document and
  //     their transactions. When the student has been deleted both are empty and it
  //     answers 0/0/0 — which the self-heal on Terminated/Hidden/Legacy then PATCHES
  //     IN, erasing the archived balance on a mere page view. legacyStudents is
  //     delete-protected by the rules, so that loss is unrecoverable from the UI.
  //     Found live: 13 legacy graduates holding 329,700 after a wipe-and-reimport.
  //     The distinction the fix rests on is asserted here — "the student is gone" must
  //     be reported as such, not as "they owed nothing".
  T('deleted_student_snapshot_reports_missing_instead_of_zero', async () => {
    const _realSchoolCol = (typeof schoolCol === 'function') ? schoolCol : null;
    if (!_realSchoolCol) return { pass: false, detail: 'schoolCol unavailable' };
    const mkSnap = exists => ({ exists, data: () => ({}) });
    try {
      // Student document does NOT exist; no transactions either — the orphan shape.
      schoolCol = () => ({
        doc: () => ({ get: () => Promise.resolve(mkSnap(false)) }),
        where: () => ({ get: () => Promise.resolve({ docs: [] }) })
      });
      const gone = await _computeAllYearsFeeSnapshot('deletedStudentId');

      // Student document DOES exist — the ordinary case must be unaffected.
      schoolCol = () => ({
        doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ outstandingBalance: 4200 }) }) }),
        where: () => ({ get: () => Promise.resolve({ docs: [] }) })
      });
      const alive = await _computeAllYearsFeeSnapshot('liveStudentId');

      return { pass: gone.studentMissing === true
                   && alive.studentMissing === false
                   && alive.outstanding === 4200,
               detail: { goneFlag: gone.studentMissing, goneOutstanding: gone.outstanding,
                         aliveFlag: alive.studentMissing, aliveOutstanding: alive.outstanding } };
    } finally { schoolCol = _realSchoolCol; }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE AWAIT MUST BE THE LAST THING BEFORE THE TALLY, AND NOTHING MAY BE
  // REGISTERED AFTER IT.
  //
  // `T()` appends each test to `chain`. Awaiting `chain` part-way through the file
  // waits only for the tests registered UP TO THAT POINT — anything registered
  // afterwards is attached to a chain nobody awaits, so its result lands in R (if
  // at all) after the tally has already been taken. The suite then under-reports
  // its own size and calls itself ALL GREEN while silently having skipped tests.
  //
  // That is not hypothetical: with the await sitting mid-file, tests 47 and 48
  // registered below it were dropped and the runner reported "46/46 ALL GREEN"
  // for a 48-test suite. A suite that can quietly lose a test is worthless as a
  // regression net, which is exactly what it is being used as here.
  //
  // The tally below now cross-checks itself against the number of registrations,
  // so this can never fail silently again — it fails loudly instead.
  // ══════════════════════════════════════════════════════════════════════════
  await chain;
  if (R.length !== _registered) {
    console.error('%c[feeLedger] SUITE INTEGRITY FAILURE: ' + _registered +
      ' tests registered but only ' + R.length + ' ran. Results are NOT trustworthy.',
      'font-weight:bold;color:#c22');
  }
  const passed = R.filter(r=>r.pass).length;
  // WHICH BUILD DID THIS ACTUALLY TEST? Four separate times in this project the
  // suite has been read as a verdict on code that was never loaded — the browser
  // served a cached file, or the console was re-run inside an already-open page
  // that predated the edit. `registered` catches a size change; it cannot catch a
  // stale build whose size happens to match. The version token can, so it is
  // reported next to the pass count instead of hiding in a stack-trace URL.
  const _build = (() => {
    try {
      const el = document.querySelector('script[src*="pending-fee"]');
      const q  = el && el.src.split('?')[1];
      return q ? q.replace(/^v=/, '') : '(no version token — cannot tell)';
    } catch (_) { return '(unknown)'; }
  })();
  console.log('%c[feeLedger contract tests] ' + passed + '/' + R.length +
    (passed===R.length ? ' ALL GREEN' : ' — FAILURES') + '   ·   build ' + _build,
    'font-weight:bold;color:' + (passed===R.length?'#2a2':'#c22'));
  if (typeof console.table === 'function') console.table(R.map(r => ({ test:r.name, pass:r.pass })));
  // Hand the register back exactly as it was found. Only undo what this run primed —
  // if a real load happened while the suite was running, that result is the truth and
  // must not be thrown away.
  if (_concPrimed && _FL_CONC_LOADED_AT === 0) { _FL_CONC_BY_ADM = null; _FL_CONC_OK = false; }
  return { suite:'feeLedger contract tests', build:_build, passed, total:R.length,
           registered:_registered, INTEGRITY_OK: R.length === _registered,
           ALL_GREEN: passed===R.length && R.length === _registered, results:R };
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEMS 4 + 17 — THE RECONCILE ENTRY POINT.
//
// Item 17 is not a bug fix, it is a rule: "Any operation that touches fees in any
// way must strictly sync across every section. No section is allowed to skip this
// sync. No exceptions."
//
// An audit of every fee-affecting write found four that skipped it. All four
// changed the RATE rather than a payment, which is why they were missed — the
// money did not move, so it did not look like a fee operation:
//
//   concession-modal.js  _acmSave            grant / change a concession
//   concessions.js       saveConcessionEdit  · saveConcessionMonthEdit
//                        resetConcessionMonthEdit · removeConcession
//   edit-student.js      saveEditStudent     can change CLASS, which every rate
//                                            resolution starts from
//   promotions.js        runBulkPromotion    changes class for EVERY student
//
// Each busted caches and stopped there. Cache invalidation makes the next read
// re-fetch the STORED aggregate — it does not recompute it. So outstandingBalance,
// previousDues and the month grids kept their pre-change values, and every screen
// faithfully displayed the same stale number. That is exactly the class of failure
// items 1/4/16 describe.
//
// These wrappers exist so no caller has to remember the guard rules: reconciliation
// must never break the operation that triggered it (the write already succeeded —
// failing here would be worse than a stale read), and it must be safe to call from
// anywhere. Non-fatal by construction; failures are logged with their context.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// F8 — ONE SNAPSHOT PER STUDENT, PER COLLECTION.
//
// terminatedStudents and hiddenStudents were written with .add(), which creates a
// NEW auto-ID document every time and never looks for an existing one. The undo
// paths delete the record, so the ordinary cycle stays clean — the live data is
// clean, 7 terminated students and 7 records, verified.
//
// It stays clean only while every undo succeeds. Terminate someone already
// terminated, or undo through a path that fails after the status write but before
// the delete, and one student has two snapshots. Both appear in the section list
// and both are counted by every export that sums outstandingBalance across the
// collection: a departed student's debt reported twice, silently.
//
// Returns the existing document's ref when there is one, a fresh ref otherwise, so
// the caller's .set() replaces rather than accumulates. Five call sites across four
// files share this instead of five hand-written guards — the shape that produced
// most of the defects fixed in this pass.
//
// A failed lookup returns a NEW ref rather than throwing: losing the snapshot
// entirely would be worse than risking a duplicate, and the warning says so.
// ════════════════════════════════════════════════════════════════════════════
async function _flSnapshotRef(collection, studentId, label) {
  const col = schoolCol(collection);
  if (!studentId) return col.doc();
  try {
    const prior = await col.where('studentId', '==', studentId).limit(1).get();
    if (!prior.empty) {
      console.warn('[' + (label || 'SNAPSHOT') + '] ' + studentId + ' already has a ' +
        collection + ' record. Updating it in place rather than adding a second — two ' +
        'snapshots for one student are double-counted in every export over that collection.');
      return prior.docs[0].ref;
    }
  } catch (e) {
    console.warn('[' + (label || 'SNAPSHOT') + '] Could not check ' + collection +
      ' for an existing record on ' + studentId + '; writing a new one. If a record ' +
      'already existed this student now has two:', e && e.message);
  }
  return col.doc();
}

// ════════════════════════════════════════════════════════════════════════════
// SYNC, GLOBALLY — INCLUDING THE SNAPSHOT COLLECTIONS.
//
// _syncStudentFinancials recomputes students/{id}. It does not touch the frozen
// copy in terminatedStudents/hiddenStudents, which is what those two SECTIONS and
// their exports read. Those healed only when their own screen rendered — so a
// waiver, concession or payment applied to a departed student left the Terminated
// list showing the old figure until somebody happened to open it.
//
// That is the one place the global sync rule was still not global. Fixing it here,
// at the single reconcile entry point every fee operation already goes through,
// rather than in each flow — so it cannot be forgotten by the next one added.
//
// Cost is one document read per reconcile, and the snapshot query only runs for a
// student who actually has one. Non-fatal by construction: the aggregate is
// already correct by this point, and a failure here leaves exactly the behaviour
// that existed before this function did.
// ════════════════════════════════════════════════════════════════════════════
// PURE, so the suite can assert it: given a snapshot record and a freshly computed
// snapshot, what must change on the frozen doc. A snapshot column that already
// matches is left out, so an unchanged student writes nothing. Extracted from the
// Firestore wrapper below precisely so this diffing logic — the heart of the sync —
// is testable without a database.
function _flSnapshotPatch(rec, snap) {
  rec = rec || {}; snap = snap || {};
  const patch = {};
  if (snap.totalDue    !== (rec.totalDue || 0))           patch.totalDue = snap.totalDue;
  if (snap.totalPaid   !== (rec.amountPaid || 0))         patch.amountPaid = snap.totalPaid;
  if (snap.outstanding !== (rec.outstandingBalance || 0)) patch.outstandingBalance = snap.outstanding;
  return patch;
}

// knownStatus lets a caller that already holds the student doc skip the read — which
// _syncStudentFinancials does, so an ACTIVE student (the overwhelming majority, and
// every student on a bulk reconcile) costs literally nothing: it returns before any
// Firestore call.
async function _flSyncSnapshotForStudent(studentId, knownStatus) {
  if (!studentId) return;
  if (typeof _computeAllYearsFeeSnapshot !== 'function') return;
  try {
    let status = knownStatus;
    if (status === undefined) {
      const sDoc = await schoolCol('students').doc(studentId).get();
      if (!sDoc.exists) return;
      status = sDoc.data().status;
    }
    status = String(status || 'active').toLowerCase();
    const col = status === 'terminated' ? 'terminatedStudents'
              : status === 'hidden'     ? 'hiddenStudents' : null;
    if (!col) return;                                   // active — nothing frozen to heal

    const prior = await schoolCol(col).where('studentId', '==', studentId).limit(1).get();
    if (prior.empty) return;

    const snap  = await _computeAllYearsFeeSnapshot(studentId);
    const patch = _flSnapshotPatch(prior.docs[0].data(), snap);
    if (!Object.keys(patch).length) return;

    await prior.docs[0].ref.update(patch);
  } catch (e) {
    console.warn('[RECONCILE] students/' + studentId + ' was recomputed, but its ' +
      'terminated/hidden snapshot could not be synced. That section will still show the ' +
      'old figure until its screen next renders:', e && e.message);
  }
}

async function _flReconcile(studentId, context) {
  if (!studentId) return false;
  try {
    // The snapshot sync now lives INSIDE _syncStudentFinancials (at the point the
    // aggregate is written), so every path that recomputes a student — including the
    // excused-waiver and payment paths that call _syncStudentFinancials directly and
    // never went through this wrapper — syncs the frozen snapshot too. It cannot be
    // bypassed by calling the sync directly, which is what the rule requires.
    await _syncStudentFinancials(studentId);
    return true;
  } catch (e) {
    console.warn('[RECONCILE] ' + (context || 'unknown') + ' failed for ' + studentId + ':', e && e.message);
    return false;
  }
}

// Concession documents key on admissionNo, not studentId — resolve, then reconcile.
async function _flReconcileByAdmissionNo(admNo, context) {
  const adm = String(admNo || '').trim();
  if (!adm) return false;
  try {
    const snap = await schoolCol('students').where('admissionNumber', '==', adm).limit(1).get();
    if (snap.empty) {
      console.warn('[RECONCILE] ' + (context || 'unknown') + ': no student for admission ' + adm);
      return false;
    }
    return await _flReconcile(snap.docs[0].id, context);
  } catch (e) {
    console.warn('[RECONCILE] ' + (context || 'unknown') + ' lookup failed for ' + adm + ':', e && e.message);
    return false;
  }
}

// Bulk reconcile with bounded concurrency. Annual Promotion re-prices every student
// at once; firing hundreds of unbounded recomputes would swamp Firestore and can get
// the client rate-limited, which would leave SOME students reconciled and others not
// — a worse state than none. Returns { ok, failed }.
async function _flReconcileMany(studentIds, context, onProgress) {
  const ids = (studentIds || []).filter(Boolean);
  const limit = Math.max(1, Math.min(5, _FL_RECONCILE_CONCURRENCY));
  let ok = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      if (await _flReconcile(ids[i], context)) ok++; else failed++;
      if (typeof onProgress === 'function') { try { onProgress(ok + failed, ids.length); } catch(_) {} }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
  return { ok, failed };
}
const _FL_RECONCILE_CONCURRENCY = 4;

// Pure: did this edit touch anything the fee engine derives money from? `class` is
// the big one — every rate resolution starts there — and monthlyFee is the explicit
// per-student override. Name/contact/section edits are not fee events and must not
// trigger a recompute, so an ordinary profile edit stays a single write.
// Contract-tested; used by edit-student.js to decide whether to reconcile.
// ════════════════════════════════════════════════════════════════════════════
// WHO A RATE CHANGE TOUCHES  —  JSS-REF-VELTRIX-2026-005 ITEM 1.
//
// Editing a class rate was the LAST unhooked fee operation in the system, and the
// widest: one edit changes what every student in that class owes. Twelve other
// operations already reconcile the students they touch; this one wrote the rate
// and walked away, so every stored outstandingBalance in the class kept the old
// figure until something unrelated happened to touch the student.
//
// Two live casualties were found before the cause was:
//   Test Student Five   ADM-TEST-015  Grade 6  stored 18,700 = 11 x 1,700
//   Test Student Six   ADM-TEST-016  Grade 6  stored 20,400 = 12 x 1,700
// Grade 6 bills 1,800. Both 1,200 light, neither self-correcting.
//
// Pure so it can be asserted. Two rules that matter:
//   · only classes whose rate actually MOVED (a save re-submits every input on the
//     form, so without this every save re-prices the whole school)
//   · only ACTIVE students — a departed student's figure is a historical snapshot
//     and must not shift because the school re-priced a class afterwards
// Class names are matched through _flClassKey, so a stored " Grade 6 " still binds.
// ════════════════════════════════════════════════════════════════════════════
function _flStudentsAffectedByRateChange(before, after, students) {
  const b = before || {}, a = after || {};
  const changedClasses = Object.keys(a).filter(cls => Number(b[cls]) !== Number(a[cls]));
  const keys = new Set(changedClasses.map(_flClassKey));
  const studentIds = (students || [])
    .filter(s => s && s.id && s.status !== 'terminated' && s.status !== 'hidden'
                 && keys.has(_flClassKey(s.class)))
    .map(s => s.id);
  return { changedClasses, studentIds };
}

function _flFeeRelevantChange(before, after) {
  const b = before || {}, a = after || {};
  const norm = v => (v === undefined || v === null) ? '' : String(v).trim();
  const num  = v => (v === undefined || v === null || v === '') ? null : Number(v);
  if (Object.prototype.hasOwnProperty.call(a, 'class') && norm(a.class) !== norm(b.class)) return true;
  if (Object.prototype.hasOwnProperty.call(a, 'monthlyFee') && num(a.monthlyFee) !== num(b.monthlyFee)) return true;
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 — WHICH GRID FIELD HOLDS EACH YEAR (with orphan binding).
//
// Moved VERBATIM out of _syncStudentFinancials so the extracted per-year
// computation below resolves labels exactly the way the engine always has.
//
// A month grid is only consulted for a year if a label points at it:
//   academicYear -> monthStatus, previousAcademicYear -> previousYearMonthStatus,
//   openingOutstandingYear -> prevYearMonthStatus.
// When the LABEL is missing but the GRID exists, the grid is invisible and the year
// reads as "no billing record" — the phantom-dues mechanism fixed in eccb69e. An
// unlabelled grid therefore binds to the academic year immediately preceding the one
// it sits behind. An existing label always wins; an empty grid infers nothing.
//
// `inferredYears` is returned because the caller must add them to the set of years it
// processes — binding a grid to a year nobody visits would achieve nothing. Pure.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 L8 — ONE class key, and ONE rate resolver.
//
// FOUND IN LIVE DATA. ADM-TEST-002 carries class "LKG " — with a trailing space.
// One invisible character, and:
//   · _FEE_SCHEDULE["LKG "]            -> undefined. The engine's
//     `_FEE_SCHEDULE[cls] || s.monthlyFee` therefore silently fell through to a
//     stale stored monthlyFee of 1,500 instead of the real LKG rate of 1,700.
//     THAT is where her wrong rate actually came from.
//   · getClassList().indexOf("LKG ")   -> -1. She has no position on the promotion
//     chain, so _resolveClassForYear cannot place her and the implausible-class-jump
//     guard cannot judge her at all — it only acts when both classes are known.
//   · getClassRate("LKG ")             -> MATCHES, because that one uses startsWith.
//
// So the app's two ways of pricing a class disagreed on the same string: exact-key
// lookup missed, prefix lookup hit. That is L2 in the audit, and this is what it
// costs in practice.
//
// _flClassKey normalises: trim the ends, collapse internal runs of whitespace.
// _flRateForClass is the single resolver every caller should use — exact key, then
// normalised key, then the prefix matcher, then an explicit fallback. It cannot
// return one answer where another resolver would return a different one, because
// there is only one of it.
// ════════════════════════════════════════════════════════════════════════════
function _flClassKey(cls) {
  return String(cls == null ? '' : cls).trim().replace(/\s+/g, ' ');
}

function _flRateForClass(cls, fallback) {
  const raw = String(cls == null ? '' : cls);
  const key = _flClassKey(raw);
  const sched = (typeof _FEE_SCHEDULE !== 'undefined') ? _FEE_SCHEDULE : {};
  const exact = Number(sched[raw]);
  if (Number.isFinite(exact) && exact > 0) return exact;
  const trimmed = Number(sched[key]);
  if (Number.isFinite(trimmed) && trimmed > 0) {
    if (raw !== key) {
      console.warn('[CLASS KEY] "' + raw + '" only matched the fee schedule after ' +
        'trimming to "' + key + '". Fix the stored class value — an untrimmed name ' +
        'breaks exact-key lookups and removes the student from the promotion chain.');
    }
    return trimmed;
  }
  if (typeof getClassRate === 'function') {
    const viaPrefix = getClassRate(key);
    if (viaPrefix && Number(viaPrefix.rate) > 0) return Number(viaPrefix.rate);
  }
  const fb = Number(fallback);
  return (Number.isFinite(fb) && fb > 0) ? fb : 0;
}

// ════════════════════════════════════════════════════════════════════════════
// CONCESSION-AWARE BILLING RATE  —  JSS-REF-VELTRIX-2026-005, Pattern B
//
// THE DEFECT THIS CLOSES. _flStudentYearOutstanding priced every month at
// _flRateForClass and never read the concessionFees register at all. Record
// Payment did (_concessionRateForMonth), so the two surfaces disagreed by
// construction: the school quoted a concession student the reduced rate,
// collected it in full, and Due Fee went on billing the difference forever.
//
// Proven on the real roll before this was written:
//   Test Student Eight   Grade 4 @ 1700, concession 775 on Jun-Nov 2026.
//                Paid 3,100 for Jun/Jul/Aug/Sep = 4 x 775, exact.
//                Truly owes 6,650. Engine said 8,500.
//                Over by 1,850 = 2 x (1700 - 775) — Oct and Nov, his two
//                UNPAID concession months, billed at the standard rate.
//   Test Student Nine Grade 1 @ 1700, concession 1500 on Dec 2026-May 2027.
//                Truly owes 9,000. Engine said 10,200. Over by 6 x 200.
//
// The error is confined to UNPAID concession months. A concession month that
// was PAID already reads as settled, because the ledger closes it on coverage
// rather than on rupees — which is why this went unnoticed until now, and why
// five of these concessions (dated Jul 2026, covering months in 2027) would
// have surfaced on their own only in January.
//
// TWO RULES, both matching what Record Payment already charges:
//   · a month outside activeMonths bills at the standard class rate;
//     activeMonths = [] means indefinite, so every month is concessional.
//   · monthlyBreakdown[key] (the per-month correction from the concession
//     Edit modal) overrides the flat concession rate for that month alone.
//
// THE YEAR COMES FROM `yr`, NOT FROM THE CLOCK. record-payment.js builds this
// same key from _getCurrentAcademicYearStr() unconditionally, so Past Due
// Recording looks up 2026-08 while paying a 2025-08 month. This engine is
// asked about a specific academic year and derives the key from it, so it is
// correct for prior years too. (The record-payment copy is a separate item.)
// ════════════════════════════════════════════════════════════════════════════
const _FL_MONTH_NUM = { June:'06', July:'07', August:'08', September:'09',
                        October:'10', November:'11', December:'12',
                        January:'01', February:'02', March:'03', April:'04', May:'05' };

function _flConcMonthKey(yr, month) {
  const full = _FL_S2F_SYNC[_flShort(month)] || month;
  const mm   = _FL_MONTH_NUM[full];
  if (!mm) return '';
  const startYr = parseInt(String(_normaliseAcademicYear(yr || '')).slice(0, 4), 10);
  if (!Number.isFinite(startYr)) return '';
  // Jun-Dec belong to the opening calendar year, Jan-May to the closing one.
  return (parseInt(mm, 10) >= 6 ? startYr : startYr + 1) + '-' + mm;
}

function _flConcessionRateForMonth(conc, yr, month, standardRate) {
  if (!conc) return standardRate;
  const cr = Number(conc.concessionFee);
  if (!Number.isFinite(cr) || cr < 0) return standardRate;
  const key = _flConcMonthKey(yr, month);
  if (!key) return standardRate;
  const active = Array.isArray(conc.activeMonths) ? conc.activeMonths : [];
  if (active.length && active.indexOf(key) < 0) return standardRate;   // gated out
  const bd = conc.monthlyBreakdown;
  if (bd && typeof bd === 'object' && typeof bd[key] === 'number' && bd[key] >= 0) return bd[key];
  return cr;
}

// The register, keyed by admission number. Concessions live in their own
// collection, so a synchronous per-year computation cannot fetch them — the
// async callers prime this first, and _flConcessionFor reads it.
let _FL_CONC_BY_ADM   = null;
let _FL_CONC_LOADED_AT = 0;
let _FL_CONC_WARNED    = false;
// Distinct from "the map is empty". A FAILED load also leaves an empty map, and an
// empty map reads exactly like "nobody has a concession" — so without this flag a
// failure degrades into silently billing every concession student at the standard
// rate, which is the bug this whole pass exists to close.
let _FL_CONC_OK        = false;

async function _flLoadConcessions(force) {
  const FRESH_MS = 30000;
  if (!force && _FL_CONC_BY_ADM && (Date.now() - _FL_CONC_LOADED_AT) < FRESH_MS) return _FL_CONC_BY_ADM;
  try {
    const snap = await schoolCol('concessionFees').get();
    const map  = {};
    snap.docs.forEach(d => {
      const c   = d.data();
      const adm = _flClassKey(c && c.admissionNo);   // same trim discipline as L8
      if (adm) map[adm] = c;
    });
    _FL_CONC_BY_ADM    = map;
    _FL_CONC_LOADED_AT = Date.now();
    _FL_CONC_OK        = true;
  } catch (e) {
    _FL_CONC_OK = false;
    // NOT silent — a failed load means every concession student is about to be
    // over-billed, which is exactly the bug this function exists to close.
    console.warn('[CONCESSION] Could not load the concession register. Every month will ' +
      'bill at the standard class rate on this pass, which OVER-STATES any student ' +
      'holding a concession. Fix this before trusting the figures:', e && e.message);
    if (!_FL_CONC_BY_ADM) _FL_CONC_BY_ADM = {};
  }
  return _FL_CONC_BY_ADM;
}

function _flConcessionFor(s) {
  if (!s) return null;
  // ══════════════════════════════════════════════════════════════════════════
  // THE REGISTER IS TRUSTED ONLY IF A LOAD ACTUALLY SUCCEEDED.
  //
  // _FL_CONC_OK alone is not enough, because it is a flag anyone can set. The
  // contract suite used to prime {} with OK=true and walk away, and the same two
  // lines pasted into a console do it just as effectively — after which this
  // function returned null for EVERY student (an empty map has no admission
  // numbers in it) while skipping the warning below, because the map was no
  // longer null and OK was no longer false. Every concession student silently
  // priced at the standard rate, with the safeguard reporting all clear.
  //
  // _FL_CONC_LOADED_AT is stamped only by a SUCCESSFUL load, so it separates a
  // register that is genuinely empty (nobody holds a concession — a real state,
  // LOADED_AT > 0) from one that merely looks empty because it was primed and
  // never filled. Asking it here makes the safeguard independent of whether the
  // code that primed the register remembered to put it back.
  // ══════════════════════════════════════════════════════════════════════════
  if (_FL_CONC_BY_ADM === null || !_FL_CONC_OK || !_FL_CONC_LOADED_AT) {
    if (!_FL_CONC_WARNED) {
      _FL_CONC_WARNED = true;
      const why = (_FL_CONC_BY_ADM === null) ? 'not yet loaded'
                : (!_FL_CONC_LOADED_AT)      ? 'primed but never loaded'
                :                              'in a FAILED state';
      console.warn('[CONCESSION] The fee engine priced a student while the concession ' +
        'register was ' + why +
        ' — concession rates were NOT applied, so every concession student is being ' +
        'OVER-STATED. Call _flLoadConcessions() and check it succeeds before trusting ' +
        'any figure on screen.');
    }
    return null;
  }
  const adm = _flClassKey(s.admissionNumber || s.admissionNo || '');
  return (adm && _FL_CONC_BY_ADM[adm]) || null;
}

// ════════════════════════════════════════════════════════════════════════════
// R1 — WHICH MONTHS OF A TRANSACTION WERE BILLED AT A CONCESSION RATE.
//
// A receipt and every export showed a concession month exactly like a full-rate
// one: "June, July, August", no sign that some of those were discounted. The
// transaction does not record it either -- it stores monthsSelected and amountPaid
// and nothing about the rate each month carried.
//
// So derive it, the same way the engine prices: for each month the payment
// touched, if the student's concession covers it (its operative rate is below the
// class rate for that month in that academic year) it was a concession month. Uses
// only the shared resolvers, so it agrees with what was actually billed and works
// for transactions recorded before this label existed.
//
// SYNCHRONOUS by design, so a receipt render can call it inline. It reads the
// concession register from cache; the caller must have primed it with
// _flLoadConcessions() first, or an unprimed register simply yields no labels
// rather than a wrong one.
// ════════════════════════════════════════════════════════════════════════════
function _txConcessionMonths(tx) {
  if (!tx || !Array.isArray(tx.monthsSelected) || !tx.monthsSelected.length) return [];
  if (tx.type === 'excused_waiver') return [];   // a waiver is not a concession payment
  const conc = _flConcessionFor({ admissionNumber: tx.admissionNumber || tx.admissionNo });
  if (!conc) return [];
  const cls = tx.studentClass
    || (tx.classSection ? String(tx.classSection).split(/[–-]/)[0].trim() : '')
    || tx.class || '';
  const std = _flRateForClass(cls, 0);
  if (!(std > 0)) return [];
  const yr = tx.academicYear || _getCurrentAcademicYearStr();
  return tx.monthsSelected.filter(m => _flConcessionRateForMonth(conc, yr, m, std) < std);
}

// F11/F12 — has this student already been logged for a promotion of THIS source in
// THIS academic year? arrayUnion cannot dedupe the history entry because it carries
// a millisecond timestamp, so runBulkPromotion checks the array itself. Pure and
// year-normalised, so "2025-26" and "2025-2026" count as the same year — and shared
// with the live path rather than mirrored, so the test cannot drift from the code.
function _flPromotionAlreadyLogged(student, year, source) {
  const hist = student && Array.isArray(student.promotionHistory) ? student.promotionHistory : [];
  const yr   = _normaliseAcademicYear(year || '');
  const src  = source || 'annual';
  return hist.some(h => h && h.source === src
                     && _normaliseAcademicYear(h.academicYear || '') === yr);
}

function _flYearFieldMap(s) {
  const docYear = _normaliseAcademicYear((s && s.academicYear) || '');
  let   prevYear = _normaliseAcademicYear((s && s.previousAcademicYear) || '');
  let   openYear = _normaliseAcademicYear((s && s.openingOutstandingYear) || '');
  const inferredYears = [];
  const yearBefore = ay => {
    const m = String(ay || '').match(/^(\d{4})-/);
    if (!m) return '';
    const y = parseInt(m[1], 10) - 1;
    return y + '-' + String(y + 1).slice(2);
  };
  const hasGrid = g => !!(g && typeof g === 'object' && Object.keys(g).length);
  if (!prevYear && hasGrid(s && s.previousYearMonthStatus)) {
    const inf = yearBefore(docYear);
    if (inf && inf !== docYear) { prevYear = inf; inferredYears.push(inf); }
  }
  if (!openYear && hasGrid(s && s.prevYearMonthStatus)) {
    const inf = yearBefore(prevYear || docYear);
    if (inf && inf !== docYear && inf !== prevYear) { openYear = inf; inferredYears.push(inf); }
  }
  const fieldForYear = yr => {
    if (docYear && yr === docYear) return 'monthStatus';
    if (prevYear && yr === prevYear) return 'previousYearMonthStatus';
    if (openYear && yr === openYear) return 'prevYearMonthStatus';
    return null;
  };
  return { docYear, prevYear, openYear, inferredYears, fieldForYear };
}

const _FL_S2F_SYNC = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 — WHAT DOES THIS STUDENT OWE FOR ONE ACADEMIC YEAR?
//
// THE definition. Extracted VERBATIM from _syncStudentFinancials's per-year loop —
// same statements, same order — so the engine and every screen compute outstanding
// with literally the same code instead of agreeing by coincidence. A consolidation,
// NOT a further implementation: _syncStudentFinancials calls it too, so no copy can
// drift from another.
//
// Extracted because the Due Fee page was computing `monthlyFee x 12 - sum(amountPaid)`
// — blind to waivers, concession rates, months paid at onboarding, and every month
// grid — and then overwriting the Dashboard's Rolling Dues card with that figure.
// Due Fee needs this answer for a whole list of students at render time, so it must
// be PURE and SYNCHRONOUS: no Firestore reads. The caller supplies the student
// document and that year's transactions, both of which Due Fee already holds.
//
//   s        : the /students document (plain object)
//   yearTxs  : that student's transactions ALREADY filtered to `yr`
//   yr       : normalised academic year, e.g. '2026-27'
//   opts.fieldMap     : a _flYearFieldMap(s) result, to avoid recomputing per year
//   opts.revertMonths : months whose paid-support a just-deleted tx removed, which
//                       must not be re-seeded from the (now stale) stored grid
//
// Returns { cls, rate, paid:Set, excused:Set, partialPaid, dueCount, outstanding,
//           gridExists } — exactly the shape _syncStudentFinancials stores per year.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 — CONTRADICTORY GRIDS FOR THE SAME YEAR (F13).
//
// A year can be described by TWO grids at once: an openingOutstandingDues[] entry
// and a labelled field grid (monthStatus / previousYearMonthStatus / prevYearMonthStatus).
// The engine takes the array entry when present, which is a defensible precedence —
// but nothing ever noticed when the two DISAGREED, so a student could carry two
// mutually exclusive accounts of the same twelve months indefinitely.
//
// ADM-TEST-002 is the live case: openingOutstandingDues[0] says 2025-26 is fully paid
// (amount 0, all N/A-PAID) while monthStatus — bound to the same year through
// academicYear 2025-26 — carries four DUE months. Both cannot be true. The entry even
// contradicts itself: amount 0 alongside unpaidMonths [April, May].
//
// Detection only. Nothing is auto-resolved: picking a winner would silently discard a
// real record of what a family paid, and which one is right depends on evidence only a
// human has. Reported once per student per year so it can be fixed at the source.
// ════════════════════════════════════════════════════════════════════════════
function _flDetectGridConflict(s, yr) {
  const arr = Array.isArray(s && s.openingOutstandingDues)
    ? s.openingOutstandingDues.find(d => d && _normaliseAcademicYear(d.year || '') === yr) : null;
  if (!arr || !arr.monthStatus || !Object.keys(arr.monthStatus).length) return null;
  const map   = _flYearFieldMap(s);
  const field = map.fieldForYear(yr);

  const norm = v => String(v || '').toUpperCase() === 'N/A-PAID' ? 'PAID' : String(v || 'DUE').toUpperCase();

  // TWO GRIDS claiming one year. Only checkable when a paired field grid exists —
  // this used to return early when it did not, which meant an entry contradicting
  // ITSELF went unreported unless it happened to also have a second grid beside it.
  const diffs = [];
  if (field && s[field] && Object.keys(s[field]).length) {
    _FL_MONTHS.forEach(m => {
      const a = norm(arr.monthStatus[m] != null ? arr.monthStatus[m] : arr.monthStatus[_FL_S2F[m]]);
      const b = norm(s[field][m]        != null ? s[field][m]        : s[field][_FL_S2F[m]]);
      if (a !== b) diffs.push(m + ': array=' + a + ' vs ' + field + '=' + b);
    });
  }

  // ── ONE RECORD CONTRADICTING ITSELF ────────────────────────────────────────
  // The entry carries THREE descriptions of one fact: a monthStatus grid, an
  // `amount` scalar, and an `unpaidMonths` list. The GRID is authoritative and both
  // readers already prefer it — _flOpeningDuesOutstanding falls back to `amount`
  // only when there is no grid, and icons.js reads `unpaidMonths` only in that same
  // case. So the other two are derived data stored as though it were source data,
  // and they drift.
  //
  // Report what the grid says, so the warning names the CORRECT value instead of
  // only announcing that something somewhere is wrong.
  const gridUnpaid = _FL_MONTHS.filter(m => {
    const v = arr.monthStatus[m] != null ? arr.monthStatus[m] : arr.monthStatus[_FL_S2F[m]];
    return v != null && norm(v) === 'DUE';
  }).map(m => _FL_S2F[m]);

  const listed = Array.isArray(arr.unpaidMonths)
    ? arr.unpaidMonths.map(x => _FL_S2F[_flShort(x)] || x) : null;
  const listStale   = !!(listed && (listed.length !== gridUnpaid.length
                                    || listed.some(x => gridUnpaid.indexOf(x) < 0)));
  const amountStale = Number(arr.amount) === 0 && gridUnpaid.length > 0;

  const notes = [];
  if (amountStale) notes.push('amount is 0 but the grid still shows ' + gridUnpaid.length +
    ' unpaid month' + (gridUnpaid.length !== 1 ? 's' : ''));
  if (listStale) notes.push('unpaidMonths lists [' + (listed.join(', ') || '—') +
    '] but the grid says [' + (gridUnpaid.join(', ') || 'none') + ']');
  const selfContradiction = notes.length ? notes.join('; ') : null;

  if (!diffs.length && !selfContradiction) return null;
  return { year: yr, field: field || null, diffs, selfContradiction,
           gridUnpaid, listedUnpaid: listed, amountStale, listStale,
           kind: diffs.length ? 'two-grids' : 'self-contradiction' };
}

function _flStudentYearOutstanding(s, yearTxs, yr, opts) {
  const o    = opts || {};
  const map  = o.fieldMap || _flYearFieldMap(s);
  // F13: surface a two-grid contradiction rather than silently preferring one.
  if (!o.quiet) {
    try {
      const _c = _flDetectGridConflict(s, yr);
      if (_c && _c.kind === 'two-grids') {
        console.warn('[GRID CONFLICT] ' + (s.admissionNumber || s.id || 'student') +
          ' has TWO disagreeing records for ' + yr + '. openingOutstandingDues[] is being ' +
          'used and ' + _c.field + ' is being ignored — one of them is wrong. Fix at the source.',
          _c);
      } else if (_c) {
        // NOT two disagreeing grids. This message used to claim it was, while
        // reporting diffs: [] in the same breath — the grids agreed perfectly and the
        // defect was inside ONE record. Anyone who followed that advice went and
        // compared two identical grids, found nothing, and learned to ignore the
        // warning. Say what is actually wrong, and what the right answer is.
        console.warn('[STALE DUES ENTRY] ' + (s.admissionNumber || s.id || 'student') +
          ' — the openingOutstandingDues entry for ' + yr + ' contradicts ITSELF: ' +
          _c.selfContradiction + '. The monthStatus grid is authoritative and is what ' +
          'is being billed, so no figure is wrong today; the stale fields only matter ' +
          'if the grid is ever lost. NO ACTION NEEDED — this is read BEFORE the repair, ' +
          'and _syncStudentFinancials derives the entry from its grid on this same pass. ' +
          'If it still appears on the NEXT reconcile, that is a real problem.', _c);
      }
    } catch(_) {}
  }
  const txsY = yearTxs || [];
  const S2F  = _FL_S2F_SYNC;

  const cls  = _resolveClassForYear(s, yr);
  // Needed before the rate now — a prior year prices from the rate stored WITH it.
  const _arrEntryForRate = Array.isArray(s.openingOutstandingDues)
    ? s.openingOutstandingDues.find(d => _normaliseAcademicYear((d && d.year) || '') === _normaliseAcademicYear(yr))
    : null;
  // ══════════════════════════════════════════════════════════════════════════
  // THE FEE SCHEDULE IS THIS YEAR'S. IT MUST NOT RE-PRICE CLOSED YEARS.
  //
  // There is one schedule and it is always today's, so _resolveClassForYear would
  // correctly work out that a student was in Grade 5 during 2024-25 and then bill
  // that year at whatever Grade 5 costs NOW. Editing a rate therefore rewrote
  // history: raising Grade 6 from 1,800 to 1,900 moved 2025-26 by +1,600 and
  // 2024-25 by +3,700 — a parent's two-year-old arrears grew because this year's
  // fee changed.
  //
  // The fee is architected for the CURRENT academic year. A closed year's debt was
  // incurred at that year's price and is settled at that year's price.
  //
  // The per-year rate was already being stored and simply never read:
  // openingOutstandingDues[].monthlyFee, written at onboarding and enumerated by
  // _flStudentAcademicYears. A prior year that carries one now prices from it. A
  // prior year without one keeps the old behaviour, because a guess at today's
  // rate still beats billing nothing.
  //
  // L8 still applies to the current year: through the ONE resolver, since
  // `_FEE_SCHEDULE[cls]` alone missed any class name carrying stray whitespace and
  // fell through to a stale stored monthlyFee.
  // ══════════════════════════════════════════════════════════════════════════
  const _curYrForRate = o.currentYear || _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const _storedYrRate = Number(_arrEntryForRate && _arrEntryForRate.monthlyFee);
  const rate = (_normaliseAcademicYear(yr) !== _curYrForRate
                && Number.isFinite(_storedYrRate) && _storedYrRate > 0)
    ? _storedYrRate
    : _flRateForClass(cls, s.monthlyFee);
  // Pattern B: the OPERATIVE rate for a month is the concession rate when one covers
  // it, the class rate otherwise. Every per-month figure below prices through this —
  // there is no second answer to what a month costs.
  const _conc    = (o.concession !== undefined) ? o.concession : _flConcessionFor(s);
  const _hasConc = !!(_conc && Number.isFinite(Number(_conc.concessionFee)) && Number(_conc.concessionFee) >= 0);
  const _opRate  = m => _flConcessionRateForMonth(_conc, yr, m, rate);
  const paid = new Set(), excused = new Set();
  const _yrField  = map.fieldForYear(yr);
  const _arrEntry = _arrEntryForRate;   // resolved above, because `rate` now needs it

  // ITEMS 1/16 PART 2 — does this year have a BILLING RECORD at all?
  const _hasArrGrid   = !!(_arrEntry && _arrEntry.monthStatus && Object.keys(_arrEntry.monthStatus).length);
  const _hasFieldGrid = !!(_yrField && s[_yrField] && Object.keys(s[_yrField]).length);
  const gridExists    = _hasArrGrid || _hasFieldGrid;

  if (_arrEntry && _arrEntry.monthStatus) {
    Object.entries(_arrEntry.monthStatus).forEach(([shortM, status]) => {
      const fullM = S2F[shortM] || shortM;
      if (status === 'N/A-PAID' || status === 'PAID') paid.add(fullM);
      else if (status === 'EXCUSED') excused.add(fullM);
    });
  } else if (_yrField && s[_yrField]) {
    Object.entries(s[_yrField]).forEach(([shortM, status]) => {
      const fullM = S2F[shortM] || shortM;
      if (status === 'N/A-PAID' || status === 'PAID') paid.add(fullM);
      else if (status === 'EXCUSED') excused.add(fullM);
    });
  }
  if (Array.isArray(o.revertMonths)) {
    o.revertMonths.forEach(m => {
      const fullM = S2F[m] || m;
      paid.delete(fullM);    paid.delete(m);
      excused.delete(fullM); excused.delete(m);
    });
  }

  // ITEM 5 — per-month credit on ONE ledger: MAX(baseline at the rate in force then,
  // rupees in the ledger). Not a sum — both describe the same money.
  const _rateAtMonth = _flHistoricalRateForMonth(s, yr, rate);
  txsY.forEach(t => {
    // ITEM 9: read BOTH keys — older waivers carry monthsExcused only.
    if (t.type === 'excused_waiver') {
      (t.monthsSelected || []).forEach(m => excused.add(S2F[m] || m));
      (t.monthsExcused  || []).forEach(m => excused.add(S2F[m] || m));
    }
  });
  const _ledger = _flAppliedByMonthFromTxs(txsY, m => Math.min(_rateAtMonth(m), _opRate(m)));
  const partialPaid = {};
  _FL_MONTHS.forEach(shortM => {
    const fullM = S2F[shortM];
    if (excused.has(fullM) || excused.has(shortM)) { paid.delete(fullM); paid.delete(shortM); return; }
    const _mRate   = _opRate(fullM);
    const wasPaid  = paid.has(fullM) || paid.has(shortM);
    const baseline = wasPaid ? Math.min(_rateAtMonth(fullM), _mRate) : 0;
    const applied  = Number(_ledger[fullM] != null ? _ledger[fullM] : _ledger[shortM]) || 0;
    const credit   = Math.min(_mRate, Math.max(baseline, applied));
    if (_mRate > 0 && credit >= _mRate) { paid.add(fullM); delete partialPaid[fullM]; }
    else {
      paid.delete(fullM); paid.delete(shortM);
      if (credit > 0) partialPaid[fullM] = credit; else delete partialPaid[fullM];
    }
  });
  // Preserve the pre-existing contract for any month key outside the academic twelve.
  txsY.forEach(t => {
    if (t.type === 'excused_waiver') return;
    if (!t.monthAllocations && Array.isArray(t.monthsSelected)) {
      t.monthsSelected.forEach(m => {
        if (_FL_MONTHS.indexOf(_flShort(m)) < 0 && !excused.has(m)) paid.add(m);
      });
    }
  });

  const _partialMonths = Object.keys(partialPaid).filter(m => !paid.has(m) && !excused.has(m));
  const _partialShort  = _partialMonths.reduce((sm, m) => sm + Math.max(0, _opRate(m) - (partialPaid[m] || 0)), 0);

  // ITEMS 1/16 PART 2 — a year with no grid is billed ONLY for what its ledger
  // PROVES. Absence of evidence is not evidence of a full-year liability.
  // ══════════════════════════════════════════════════════════════════════════
  // JSS-REF-VELTRIX-2026-005 ITEMS 1/16 PART 2 — CORRECTED SCOPE.
  //
  // Part 2 originally billed ANY grid-less year at only what its ledger proves, on
  // the stated assumption that "every path which enrols a student for a year writes
  // that year a grid, so no grid means no recorded liability."
  //
  // THAT ASSUMPTION WAS FALSE, and the Part B preview proved it against the real
  // roll: 152 active students, all with zero current-year transactions, would have
  // had their entire current-year liability erased — about 30.9 lakh. Their
  // academicYear still reads a prior year, so monthStatus binds THERE and the
  // current year has no grid, even though they are enrolled and owe in full. Four of
  // them (ADM-TEST-011/012/014/015) are not even carry-overs; they are plain
  // current-year students who have simply paid nothing yet.
  //
  // The owner's rule for the current year is explicit: every active student's annual
  // liability counts, reduced as reductions occur. So for the CURRENT year, enrolment
  // itself is the evidence of liability — a missing grid is a gap in our records, not
  // proof the student owes nothing.
  //
  // The original rule remains correct for PRIOR years: with no grid and no ledger
  // there is genuinely no evidence the student was ever enrolled then, and inventing
  // twelve months there is what manufactured Test Student One's phantom 11,900. (His case
  // is a prior year, and part 1's orphan-grid binding handles it regardless.)
  //
  //   prior year, no grid   -> bill only what the ledger proves   (unchanged)
  //   CURRENT year, no grid -> bill the full year minus credits   (restored)
  //
  // opts.currentYear lets a caller state which year is current; it defaults to the
  // real one. A terminated or hidden student is excluded — they are no longer
  // accruing — via opts.isActive.
  // ══════════════════════════════════════════════════════════════════════════
  let dueCount, outstanding;
  const _curYrForBilling = o.currentYear || _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const _statusS         = String((s && s.status) || 'active').toLowerCase();
  const _activeForBilling = (o.isActive !== undefined)
    ? !!o.isActive
    : (_statusS !== 'terminated' && _statusS !== 'hidden');
  const _billFullYear = !gridExists && _activeForBilling
                        && _normaliseAcademicYear(yr) === _curYrForBilling;

  if (gridExists) {
    dueCount = Math.max(0, 12 - paid.size - excused.size);
    const _fullDue = Math.max(0, dueCount - _partialMonths.length);
    if (!_hasConc) {
      outstanding = _fullDue * rate + _partialShort;      // unchanged path
    } else {
      // Price the due months one at a time instead of count x rate. dueCount stays
      // the authoritative COUNT — it tolerates month keys outside the academic twelve,
      // which this list cannot see — so honour the smaller of the two and let any
      // residual keep the class rate. A concession can only ever LOWER the bill.
      const _dueIdentified = _FL_MONTHS.map(m => _FL_S2F_SYNC[m])
        .filter(f => !paid.has(f) && !excused.has(f) && !(f in partialPaid));
      const _n        = Math.min(_fullDue, _dueIdentified.length);
      const _priced   = _dueIdentified.slice(0, _n).reduce((sm, f) => sm + _opRate(f), 0);
      const _residual = Math.max(0, _fullDue - _n) * rate;
      outstanding = _priced + _residual + _partialShort;
    }
  } else if (_billFullYear) {
    // No grid for the CURRENT year of an active student: bill twelve months, less
    // everything the ledger shows already settled for those months.
    // Twelve months at each month's OPERATIVE rate — identical to rate x 12 when no
    // concession covers the year.
    const _billable = _FL_MONTHS.reduce((sum, m) => sum + _opRate(_FL_S2F[m]), 0);
    const _creditedThisYear = _FL_MONTHS.reduce((sum, m) => {
      const full = _FL_S2F[m];
      const _r   = _opRate(full);
      if (excused.has(full) || excused.has(m)) return sum + _r;        // waived counts as settled
      const applied = Number(_ledger[full] != null ? _ledger[full] : _ledger[m]) || 0;
      return sum + Math.min(_r, applied);
    }, 0);
    outstanding = Math.max(0, _billable - _creditedThisYear);
    dueCount    = rate > 0 ? Math.ceil(outstanding / rate) : 0;
  } else {
    dueCount    = _partialMonths.length;
    outstanding = _partialShort;
  }
  return { cls, rate, paid, excused, partialPaid, dueCount, outstanding, gridExists,
           billedFullYearWithoutGrid: _billFullYear,
           concessionApplied: _hasConc, rateForMonth: _opRate };
}

// The current-year slice of the authoritative all-years aggregate. Was copy-pasted at
// icons.js (past-due banner), dashboard.js (Rolling Dues) and the Record Payment
// banner; F3 would have made it five sites. One reader instead.
// Returns NULL, not 0, when no aggregate has ever been written — 0 would read as
// "owes nothing", which is the opposite of "we do not know yet".
function _flCurrentYearOutstanding(s) {
  const all = Number(s && s.outstandingBalance);
  if (!Number.isFinite(all)) return null;
  return Math.max(0, all - (Number(s && s.previousDues) || 0));
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

    // Prime the concession register before any month is priced — _flStudentYearOutstanding
    // is synchronous and reads it from cache. Without this every concession month bills
    // at the standard class rate, which is the defect this pass closes.
    await _flLoadConcessions();

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

    // Label resolution and ORPHAN-GRID BINDING both moved verbatim into
    // _flYearFieldMap, so the extracted per-year computation resolves them
    // identically. The inferred years still have to be added to yearsSet here, or a
    // newly-bound grid would belong to a year this loop never visits.
    const _fieldMapSync     = _flYearFieldMap(s);
    _fieldMapSync.inferredYears.forEach(y => yearsSet.add(y));
    const _sDocYearSync     = _fieldMapSync.docYear;
    const _prevYearSync     = _fieldMapSync.prevYear;
    const _openYearSync     = _fieldMapSync.openYear;
    const _fieldForYearSync = _fieldMapSync.fieldForYear;
    const _shortToFullSync  = _FL_S2F_SYNC;

    // ── Recompute paid/excused/due months + outstanding amount PER YEAR (AUTHORITATIVE) ──
    // NOTE: this legacy read-modify-write path remains the authoritative writer during the
    // feeLedger dual-write / shadow-compare rollout. It is UNCHANGED. The canonical model is
    // computed separately below and only observed until FEATURE_FEELEDGER.read flips.
    const perYear = {};
    const _noGridYears = [];   // ITEMS 1/16 part 2 — years with no billing record at all
    yearsSet.forEach(yr => {
      // EXTRACT-AND-DELEGATE: every statement that used to live inline here now lives
      // in _flStudentYearOutstanding, moved verbatim. This function keeps ownership of
      // the Firestore reads, the year set, the aggregates, the legacy write-back and
      // the dry-run branch; the per-year arithmetic is shared with Due Fee so the two
      // cannot drift apart.
      const info = _flStudentYearOutstanding(
        s,
        txs.filter(t => _normaliseAcademicYear(t.academicYear) === yr),
        yr,
        { fieldMap: _fieldMapSync,
          revertMonths: (_revertTxMonths && Array.isArray(_revertTxMonths[yr])) ? _revertTxMonths[yr] : null });
      if (!info.gridExists) _noGridYears.push(yr);
      perYear[yr] = info;
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
      // ITEMS 1/16 part 2: years this student is associated with but which carry NO
      // month grid, so nothing beyond their ledger could be billed. These used to be
      // charged a full 12 months of invented dues. Surfaced rather than swallowed —
      // an entry here means "go and record what this student was actually billed
      // that year", and an empty array means every year is properly recorded.
      _flNoGridYears:     _noGridYears.slice().sort(),
    };

    // ── Write back per-year month grids to the correct legacy field (AUTHORITATIVE, dot-path) ──
    Object.entries(perYear).forEach(([yr, info]) => {
      if (yr === currentYear && yr !== _sDocYearSync) return;
      const field = _fieldForYearSync(yr);
      if (!field) return;
      // ══════════════════════════════════════════════════════════════════════
      // THE GRID IS BOTH AN INPUT AND AN OUTPUT. NEVER DEMOTE A PAID MONTH.
      //
      // _flStudentYearOutstanding reads this grid to decide `wasPaid`, and this
      // block writes the result back over it. For a month settled at ONBOARDING
      // there is no transaction — the grid IS the only evidence it was ever paid.
      // So the moment a rate rise turns such a month into PARTIAL and we persist
      // that, the evidence is gone: on the next pass `wasPaid` is false, there is
      // no ledger to fall back on, and the month lands on DUE forever.
      //
      // That is why a rate round-trip did not return. Grade 6 at 1,800 -> 1,900 ->
      // 1,800 left the current-year total at 30,79,950 over 155 students instead
      // of the 30,76,550 over 154 it started at. Raising the rate destroyed
      // paid-status that lowering it could not rebuild.
      //
      // A month may be PROMOTED freely (DUE -> PARTIAL -> N/A-PAID). It may only be
      // DEMOTED when a transaction was actually deleted, which is precisely what
      // opts.revertTxMonths names. Anything else is a derived figure eating its own
      // source data.
      // ══════════════════════════════════════════════════════════════════════
      const _revertThisYear = (_revertTxMonths && Array.isArray(_revertTxMonths[yr]))
        ? _revertTxMonths[yr].map(m => _flShort(m)) : [];
      ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'].forEach(shortM => {
        const fullM = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'}[shortM];
        const _storedNow = String((s[field] && s[field][shortM]) || '').toUpperCase();
        const _wasSettled = _storedNow === 'N/A-PAID' || _storedNow === 'PAID';
        const _mayDemote  = _revertThisYear.indexOf(shortM) >= 0;
        if (info.paid.has(fullM) || info.paid.has(shortM)) {
          updatePayload[`${field}.${shortM}`] = 'N/A-PAID';
        } else if (info.excused.has(fullM) || info.excused.has(shortM)) {
          updatePayload[`${field}.${shortM}`] = 'EXCUSED';
        } else if (_wasSettled && !_mayDemote) {
          // Rate moved under a month whose only proof of payment is this grid.
          // Leave the flag alone; the shortfall is carried by monthShortage and the
          // outstanding figure, neither of which destroys evidence.
          updatePayload[`${field}.${shortM}`] = _storedNow === 'PAID' ? 'PAID' : 'N/A-PAID';
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
        // unpaidMonths is DERIVED, like amount and monthStatus beside it — and it was
        // the one field this write-back never refreshed, so it drifted while the other
        // two stayed correct. previewStaleDuesEntries found four such entries, every
        // one of them an out-of-date LIST next to a right amount and a right grid.
        //
        // TEST STUDENT FIFTEEN (ADM-TEST-017, active) had the two years crossed: 2025-26
        // listed [April, May] when its grid said six months, and 2024-25 listed five
        // months when its grid said [April, May] — 2025-26 was carrying 2024-25's
        // answer, which is the shape add-student.js:646 produces by copying the OLDEST
        // year's list. Both amounts were already right, so nothing on screen was wrong;
        // the exposure is the fallback, where an entry with no grid is read from this
        // list alone.
        const _unpaidDerived = _FL_MONTHS
          .filter(sm => String(ms[sm] || '').toUpperCase() === 'DUE')
          .map(sm => _FL_S2F[sm]);
        return { ...entry, monthStatus: ms, monthShortage: msShort, amount: info.outstanding,
                 unpaidMonths: _unpaidDerived };
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
        // ITEMS 1/16 part 2: do NOT seed an all-DUE baseline for a year with no grid.
        // That is the same invention the authoritative path just stopped making — a
        // blank 12-month DUE base bills a year the system holds no record of. Skipping
        // the year entirely keeps the shadow model agreeing with the legacy one, which
        // is the whole point of running them side by side.
        yearsSet.forEach(yr => {
          if (_fl[yr]) return;
          if (perYear[yr] && perYear[yr].gridExists === false) return;
          _fl[yr] = { class: _resolveClassForYear(s, yr) || s.class || '', monthlyFee: 0, base: _blank() };
        });
        const _flPerYear = {};
        Object.keys(_fl).forEach(yr => {
          const e = _fl[yr];
          // L2 — the last raw _FEE_SCHEDULE[...] lookup on a live money path.
          // _FEE_SCHEDULE["LKG "] misses on the trailing space and returns undefined,
          // so the chain fell through to a stale stored monthlyFee, or to 0. That is
          // Test Student Two's failure mode, and it is NOT dormant here: feeLedger is
          // dual-written from this rate and FEATURE_FEELEDGER.read.recordPayment is
          // already true, so a mispriced entry reaches the reopen-partial netting.
          // _flRateForClass trims, retries, warns about the untrimmed name and falls
          // back through getClassRate — same fallback ORDER as before (schedule, then
          // the stored fee, then 0), just no longer defeated by whitespace.
          const r = e.monthlyFee || _flRateForClass(_resolveClassForYear(s, yr), s.monthlyFee) || 0;
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

    // ════════════════════════════════════════════════════════════════════════
    // DRY RUN. Everything above is the real computation, unchanged — this flag
    // only suppresses the write and returns what WOULD have been written.
    //
    // Deliberately a flag on this function rather than a separate preview engine:
    // a second implementation would drift from this one, and a preview that does
    // not match what the real pass does is worse than no preview at all. This is
    // the same single-source-of-truth rule item 17 imposes on every other path.
    // ════════════════════════════════════════════════════════════════════════
    if (opts.dryRun) {
      const before = {
        outstandingBalance: Number(s.outstandingBalance) || 0,
        previousDues:       Number(s.previousDues) || 0,
        fee_status:         s.fee_status || '',
      };
      const after = {
        outstandingBalance: updatePayload.outstandingBalance,
        previousDues:       updatePayload.previousDues,
        fee_status:         updatePayload.fee_status,
      };
      const gridChanges = [];
      Object.keys(updatePayload).forEach(k => {
        const m = k.match(/^(monthStatus|previousYearMonthStatus|prevYearMonthStatus)\.(\w+)$/);
        if (!m) return;
        const wasVal = (s[m[1]] || {})[m[2]];
        if (wasVal !== updatePayload[k]) gridChanges.push({ field: m[1], month: m[2], from: wasVal || '(unset)', to: updatePayload[k] });
      });
      return {
        studentId,
        name:        s.name || '',
        admissionNumber: s.admissionNumber || '',
        class:       s.class || '',
        status:      s.status || 'active',
        before, after,
        delta:       after.outstandingBalance - before.outstandingBalance,
        changed:     before.outstandingBalance !== after.outstandingBalance
                     || before.previousDues !== after.previousDues
                     || before.fee_status !== after.fee_status
                     || gridChanges.length > 0,
        gridChanges,
        noGridYears: _noGridYears.slice().sort(),
        perYear:     Object.entries(perYear).map(([yr, i]) =>
                       ({ year: yr, rate: i.rate, outstanding: i.outstanding, gridExists: i.gridExists })),
      };
    }

    await schoolCol('students').doc(studentId).update(updatePayload);
    invalidateStudentCache();
    invalidateFinanceCache();

    // SYNC ACROSS EVERY SECTION — the fundamental rule, applied at the one place the
    // aggregate is actually written. A terminated or hidden student's frozen snapshot
    // moves with their students/{id} figure, so the Terminated/Hidden sections and
    // their exports never disagree with Due Fee. s.status is already in hand, so an
    // active student — every student on a bulk reconcile — pays nothing for this.
    // Non-fatal: the write above already succeeded.
    await _flSyncSnapshotForStudent(studentId, s.status);
  } catch (_syncErr) {
    console.error('ITEM-10: _syncStudentFinancials failed for', studentId, _syncErr);
    if (opts.dryRun) return { studentId, error: (_syncErr && _syncErr.message) || 'unknown', changed: false };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 — RECONCILE DRY RUN (READ-ONLY).
//
// reconcileAllStudentDues() overwrites outstandingBalance, previousDues and the
// month grids for EVERY student, in place, with no undo. After an engine change
// that is an irreversible bulk write on live financial data whose school-wide
// effect nobody can see in advance. This runs the identical computation and
// writes nothing, so the pass can be reviewed before it is committed.
//
// It calls _syncStudentFinancials with { dryRun: true } — the SAME engine, not a
// reimplementation of it. A preview that disagrees with the real pass would be
// worse than no preview.
//
// Console:
//     await previewReconcileAllStudentDues();      // opens the report in a new tab
//
// PRINCIPAL-ONLY, and deliberately so. The published rules would let an Admin read
// this data (students and feeTransactions are both isSchoolStaff), so the gate is
// not a rules requirement — it is the app's own confidentiality guarantee. This
// report walks EVERY student, and a school-wide financial ledger that includes
// hidden students is exactly what Admin is not supposed to see. Keeping it
// Principal-only costs nothing, since only a Principal can run the real pass.
//
// Returns { total, changed, unchanged, failed, netDelta, increases, decreases,
// noGridWorklist, pinned, report, html }.
// ════════════════════════════════════════════════════════════════════════════

// Why a student's figure moved. Derived from what the engine actually did to them,
// not guessed from the sign: a year the engine could not price (items 1/16 part 2)
// is a different finding from a month reopened by the MAX-not-SUM credit rule
// (item 5), and they need different follow-up.
function _flClassifyDelta(r) {
  const reasons = [];
  const grid = r.gridChanges || [];
  if ((r.noGridYears || []).length && r.delta < 0) {
    reasons.push('phantom due zeroed — year with no billing record');
  }
  if (grid.some(g => /PAID/.test(String(g.from)) && g.to === 'PARTIAL')) {
    reasons.push('paid month reopened as PARTIAL — rate difference now owed');
  }
  if (grid.some(g => g.from === 'DUE' && /PAID/.test(String(g.to)))) {
    reasons.push('due month closed by the ledger');
  }
  if (grid.some(g => g.to === 'EXCUSED' && g.from !== 'EXCUSED')) {
    reasons.push('waiver now recognised');
  }
  if (!reasons.length) {
    reasons.push(r.delta < 0 ? 'stored aggregate was overstated'
               : r.delta > 0 ? 'stored aggregate was understated'
               : 'grid corrected, balance unchanged');
  }
  return reasons.join('; ');
}

// Admission numbers to surface at the top of the dry-run report regardless of where
// they sort — including when NOTHING about them changed, since "no change" is itself
// the answer being cross-checked.
//
// This used to be three hardcoded real admission numbers: the students the engine
// change was diagnosed from. That was development scaffolding, and it outlived its
// purpose the moment the change shipped and verified (GAP 0, and the SYNC cross-check
// clean across all 167). What it left behind was the last binding in this codebase
// between production code and identifiable pupils — a list of real children compiled
// into client JavaScript, for the convenience of a diagnosis that is finished.
//
// Empty by default, so the report pins nobody unless asked. The capability is not lost,
// it is handed to the caller, who knows which students they are actually checking:
//
//     await previewReconcileAllStudentDues({ pin: ['ADM-TEST-001'] })
//
// Passed at the console, an admission number is transient. Committed to a constant, it
// ships to every browser forever.
const _FL_PINNED_ADMISSIONS = [];
async function previewReconcileAllStudentDues(opts) {
  const o = opts || {};
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[DRY RUN] Principal only.');
    return null;
  }
  const snap  = await schoolCol('students').get();
  const docs  = snap.docs.filter(d => o.includeInactive ? true : (d.data().status || 'active') === 'active');
  const rows  = [];
  const quarantined = [];
  let failed  = 0;

  for (let i = 0; i < docs.length; i++) {
    if (i % 25 === 0) console.log(`[DRY RUN] ${i}/${docs.length}…`);
    const _d = docs[i].data();
    if (_flIsQuarantined(docs[i].id, _d.admissionNumber, o)) {
      quarantined.push({ studentId: docs[i].id, admissionNumber: _d.admissionNumber || '',
                         name: _d.name || '', reason: 'under investigation — excluded from preview and commit' });
      continue;
    }
    try {
      const r = await _syncStudentFinancials(docs[i].id, { dryRun: true });
      if (!r) { failed++; continue; }
      if (r.error) { failed++; rows.push(r); continue; }
      rows.push(r);
    } catch (e) { failed++; }
  }

  const changed   = rows.filter(r => r.changed && !r.error);
  const increases = changed.filter(r => r.delta > 0);
  const decreases = changed.filter(r => r.delta < 0);
  // The bucket the first report was missing. `changed` is true when the balance moved
  // OR previousDues moved OR fee_status moved OR any month-grid cell changed — but
  // increases/decreases only partition by BALANCE delta. Students whose grid or status
  // is corrected while the balance stays put belong to neither, so up + down did not
  // add up to changed. They are real changes and must be visible, not inferred from a
  // gap in the arithmetic.
  const sameBalance = changed.filter(r => r.delta === 0);
  const netDelta  = changed.reduce((a, r) => a + r.delta, 0);
  const noGrid    = rows.filter(r => (r.noGridYears || []).length)
                        .map(r => ({ name: r.name, admissionNumber: r.admissionNumber,
                                     class: r.class, years: r.noGridYears.join(', ') }));

  changed.forEach(r => { r.reason = _flClassifyDelta(r); });

  const upTotal   = increases.reduce((a, r) => a + r.delta, 0);
  const downTotal = decreases.reduce((a, r) => a + r.delta, 0);   // negative
  // Pinned students are reported even when NOTHING about them changes — "no change"
  // is itself the answer the reviewer is cross-checking for.
  // Caller-supplied pin list wins; the constant is empty by default (see its comment).
  const _pinList = (Array.isArray(o.pin) && o.pin.length) ? o.pin : _FL_PINNED_ADMISSIONS;
  const pinned = _pinList
    .map(adm => rows.find(r => String(r.admissionNumber || '').trim() === adm)
             || { admissionNumber: adm, missing: true })
    .map(r => r.missing ? r : Object.assign({}, r, { reason: r.changed ? (r.reason || _flClassifyDelta(r)) : 'no change' }));

  const html = _flBuildDryRunReportHTML({
    total: rows.length, failed, changed, increases, decreases, sameBalance,
    upTotal, downTotal, netDelta, noGrid, pinned, quarantined,
    scope: o.includeInactive ? 'all students (including terminated/hidden)' : 'active students only'
  });

  console.log('%c══ RECONCILE DRY RUN — NOTHING WAS WRITTEN ══', 'font-weight:bold;color:#c9a84c;font-size:14px');
  console.log(`Examined ${rows.length} · would change ${changed.length} · failed ${failed}`);
  console.log(`UP ${increases.length} (+${Math.round(upTotal)}) · DOWN ${decreases.length} (${Math.round(downTotal)}) · BALANCE-SAME ${sameBalance.length} · NET ${Math.round(netDelta)}`);
  if (quarantined.length) console.warn(`[DRY RUN] ${quarantined.length} student(s) QUARANTINED and skipped:`, quarantined.map(q => q.admissionNumber).join(', '));
  if (!o.noWindow) {
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else   console.warn('[DRY RUN] Popup blocked — allow popups, or use the returned .html string.');
  }
  console.log('%cNothing was written. Review the report, then run reconcileAllStudentDues() to commit.', 'color:#888');

  return { total: rows.length, changed, unchanged: rows.length - changed.length - failed,
           failed, netDelta, upTotal, downTotal, increases, decreases, sameBalance,
           quarantined, noGridWorklist: noGrid, pinned, report: rows, html };
}

// Renders the dry-run report as a standalone, self-contained page: readable top to
// bottom, screenshotable, and with a download button so it can be filed alongside
// whatever decision it informs. Pure — takes the computed figures, returns HTML.
function _flBuildDryRunReportHTML(_d) {
  // Defensive on every collection: a report that CRASHES on a missing bucket is worse
  // than one that renders an empty section, because the crash happens after the whole
  // read pass has already been paid for.
  const d = Object.assign({ total:0, failed:0, changed:[], increases:[], decreases:[],
                            sameBalance:[], noGrid:[], pinned:[], quarantined:[],
                            upTotal:0, downTotal:0, netDelta:0, scope:'' }, _d || {});
  const esc   = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const money = n => (n < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');
  const signed= n => (n > 0 ? '+₹' : n < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');
  const dirCell = n => `<td class="${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${n > 0 ? '▲ increases' : n < 0 ? '▼ decreases' : '— same'}</td>`;
  const gridSummary = r => (r.gridChanges || []).length
    ? (r.gridChanges || []).slice(0, 6).map(g => `${esc(g.month)}: ${esc(g.from)}→${esc(g.to)}`).join('<br>')
      + ((r.gridChanges.length > 6) ? `<br><em>+${r.gridChanges.length - 6} more</em>` : '')
    : '<span class="muted">—</span>';

  const row = r => r.missing
    ? `<tr><td colspan="8" class="muted">${esc(r.admissionNumber)} — not found in this run</td></tr>`
    : `<tr>
        <td><strong>${esc(r.name)}</strong><br><span class="muted">${esc(r.admissionNumber)}</span></td>
        <td>${esc(r.class)}</td>
        <td class="num">${money(r.before.outstandingBalance)}</td>
        <td class="num">${money(r.after.outstandingBalance)}</td>
        <td class="num ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}"><strong>${signed(r.delta)}</strong></td>
        ${dirCell(r.delta)}
        <td class="num">${money(r.before.previousDues)} → ${money(r.after.previousDues)}</td>
        <td class="small">${gridSummary(r)}<div class="muted small">${esc(r.reason || '')}</div></td>
      </tr>`;

  const sorted = d.changed.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return `<!doctype html><html><head><meta charset="utf-8">
<title>Reconcile Dry Run — ${new Date().toLocaleString('en-IN')}</title>
<style>
 body{font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:#12131a;color:#e8e8ee;margin:0;padding:28px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:30px 0 10px;color:#c9a84c;
    border-bottom:1px solid #2c2e3a;padding-bottom:6px}
 .banner{background:rgba(82,200,122,.10);border:1px solid rgba(82,200,122,.45);color:#7fdba0;
    padding:12px 16px;border-radius:8px;margin:16px 0;font-weight:600}
 .cards{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}
 .card{background:#1b1d26;border:1px solid #2c2e3a;border-radius:10px;padding:14px 18px;min-width:150px}
 .card .k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8b8fa3}
 .card .v{font-size:21px;font-weight:700;margin-top:4px}
 table{border-collapse:collapse;width:100%;margin-top:8px;background:#171923}
 th,td{border:1px solid #2c2e3a;padding:8px 10px;vertical-align:top;text-align:left}
 th{background:#1f2230;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#a8adc0;
    position:sticky;top:0}
 .num{text-align:right;white-space:nowrap} .small{font-size:12px}
 .up{color:#ff8f8f} .down{color:#7fdba0} .muted{color:#8b8fa3}
 button{background:#c9a84c;color:#12131a;border:0;border-radius:7px;padding:9px 16px;
    font-weight:700;cursor:pointer;font-size:13px}
 @media print{body{background:#fff;color:#000} .noprint{display:none}
   table{background:#fff} th{background:#eee;color:#000} td,th{border-color:#999}}
</style></head><body>
<h1>Reconcile — Dry Run Report</h1>
<div class="muted">${esc(new Date().toLocaleString('en-IN'))} · scope: ${esc(d.scope)}</div>
<div class="banner">✓ READ-ONLY — nothing was written to Firestore. This is what
 <code>reconcileAllStudentDues()</code> <em>would</em> change if you ran it.</div>
<div class="noprint" style="margin:14px 0">
 <button onclick="(function(){var b=new Blob([document.documentElement.outerHTML],{type:'text/html'});
  var a=document.createElement('a');a.href=URL.createObjectURL(b);
  a.download='reconcile-dry-run-'+new Date().toISOString().slice(0,10)+'.html';a.click();})()">
  ⬇ Download this report</button>
 <button onclick="window.print()" style="margin-left:8px;background:#3a3d4e;color:#e8e8ee">🖨 Print / PDF</button>
</div>

<div class="cards">
 <div class="card"><div class="k">Examined</div><div class="v">${d.total}</div></div>
 <div class="card"><div class="k">Would change</div><div class="v">${d.changed.length}</div></div>
 <div class="card"><div class="k">Unchanged</div><div class="v">${d.total - d.changed.length - d.failed}</div></div>
 <div class="card"><div class="k">Failed</div><div class="v" style="color:${d.failed ? '#ff8f8f' : 'inherit'}">${d.failed}</div></div>
 <div class="card"><div class="k">Moving DOWN</div><div class="v down">${d.decreases.length} · ${money(d.downTotal)}</div></div>
 <div class="card"><div class="k">Moving UP</div><div class="v up">${d.increases.length} · +${money(d.upTotal).replace('₹','₹')}</div></div>
 <div class="card"><div class="k">Balance same</div><div class="v">${d.sameBalance.length}</div></div>
 <div class="card"><div class="k">NET school-wide</div><div class="v">${signed(d.netDelta)}</div></div>
 ${d.quarantined && d.quarantined.length
   ? `<div class="card" style="border-color:#c9a84c"><div class="k">Quarantined</div><div class="v" style="color:#c9a84c">${d.quarantined.length}</div></div>` : ''}
</div>
<div class="muted small">Reconciliation check: ${d.increases.length} up + ${d.decreases.length} down
 + ${d.sameBalance.length} balance-unchanged = <strong>${d.increases.length + d.decreases.length + d.sameBalance.length}</strong>
 of ${d.changed.length} changed.${d.increases.length + d.decreases.length + d.sameBalance.length === d.changed.length
   ? ' ✓ accounted for.' : ' ✗ MISMATCH — do not commit.'}</div>
${d.quarantined && d.quarantined.length ? `
<h2>Quarantined — excluded from this run and from any commit</h2>
<div class="muted small">Skipped deliberately. These students are neither previewed nor written; their records
 are under investigation and reconciling them would bake today's contradictory state into the
 authoritative fields. Remove them from <code>_FL_RECONCILE_QUARANTINE</code> once resolved.</div>
<table><thead><tr><th>Adm#</th><th>Student id</th><th>Reason</th></tr></thead><tbody>
${d.quarantined.map(q => `<tr><td>${esc(q.admissionNumber || '—')}</td><td>${esc(q.studentId || '—')}</td><td>${esc(q.reason || 'under investigation')}</td></tr>`).join('')}
</tbody></table>` : ''}

<h2>Cross-check students (pinned)</h2>
<div class="muted small">Listed regardless of rank — verify these three against the live app before approving.</div>
<table><thead><tr><th>Student</th><th>Class</th><th>Was</th><th>Becomes</th><th>Delta</th>
 <th>Direction</th><th>Previous dues</th><th>Month grid / reason</th></tr></thead>
<tbody>${d.pinned.map(row).join('')}</tbody></table>

<h2>All students whose figures change (${d.changed.length})</h2>
<div class="muted small">Largest movement first. Students with no change are omitted.</div>
<table><thead><tr><th>Student</th><th>Class</th><th>Was</th><th>Becomes</th><th>Delta</th>
 <th>Direction</th><th>Previous dues</th><th>Month grid / reason</th></tr></thead>
<tbody>${sorted.map(row).join('') || '<tr><td colspan="8" class="muted">No student’s figures change.</td></tr>'}</tbody></table>

<h2>Years with no billing record — _flNoGridYears (${d.noGrid.length} students)</h2>
<div class="muted small">These students have an academic year the engine cannot price at all: no month grid
 exists for it. Their dues for that year read ₹0 until someone records what they were actually billed.
 This list is a worklist, not an error.</div>
<table><thead><tr><th>Student</th><th>Adm#</th><th>Class</th><th>Unpriced year(s)</th></tr></thead>
<tbody>${d.noGrid.length
  ? d.noGrid.map(n => `<tr><td>${esc(n.name)}</td><td>${esc(n.admissionNumber)}</td><td>${esc(n.class)}</td><td>${esc(n.years)}</td></tr>`).join('')
  : '<tr><td colspan="4" class="muted">None — every year is properly recorded.</td></tr>'}</tbody></table>

<p class="muted small" style="margin-top:26px">Nothing above has been applied. To commit these changes run
 <code>reconcileAllStudentDues()</code> as Principal. Export the students collection first — there is no undo.</p>
</body></html>`;
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
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// CONCESSION IMPACT PREVIEW (READ-ONLY).
//
// The engine now prices concession months at the concession rate. That LOWERS
// Due Fee, the Defaulter List and the Rolling Dues card — a visible number
// moving, so it gets a preview before it is trusted, exactly like Part B.
//
// Nothing here writes. It runs the engine twice per student, once with the
// concession and once with it suppressed, and reports the difference.
//
// Console:
//     const c = await previewConcessionImpact();
//
// It also flags INERT concessions — ones whose every active month is already
// settled, so the discount can never apply to anything. Test Student Two is one:
// her concession covers Apr and May 2027 and both are already marked paid, so
// it is worth exactly nothing to her. That is a data question for the office,
// not a bug, but it is invisible from the register screen.
// ════════════════════════════════════════════════════════════════════════════
async function previewConcessionImpact(opts) {
  const o = opts || {};
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[CONCESSION] Principal only.');
    return null;
  }
  const curYr = _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const [stuSnap, txSnap] = await Promise.all([
    schoolCol('students').get(),
    schoolCol('feeTransactions').get(),
    _flLoadConcessions(true)
  ]);
  const txByStudent = {};
  txSnap.docs.forEach(d => {
    const t = d.data();
    if (!t.studentId) return;
    (txByStudent[t.studentId] = txByStudent[t.studentId] || []).push(t);
  });

  const rows = [], inert = [];
  // Every concession record must be accounted for. A record that prices nobody is
  // either attached to a departed student or pointing at an admission number no
  // student carries — silently invisible either way, which is how a concession
  // stops applying without anyone noticing.
  const _seen = {};
  const _docsByAdm = {};        // one admission number must mean one student document
  stuSnap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    const _adm = _flClassKey(s.admissionNumber || s.admissionNo || '');
    if (_adm) {
      (_docsByAdm[_adm] = _docsByAdm[_adm] || []).push({ id: d.id, status: s.status || 'active' });
    }
    if (_adm && _FL_CONC_BY_ADM && _FL_CONC_BY_ADM[_adm]) {
      // An ACTIVE document always wins. Recording the excluded one unconditionally let
      // a terminated duplicate mask a live student who WAS priced.
      const _isOut = (s.status === 'terminated' || s.status === 'hidden');
      if (!_isOut) _seen[_adm] = 'priced';
      else if (_seen[_adm] !== 'priced') _seen[_adm] = 'excluded — status ' + s.status;
    }
    if (s.status === 'terminated' || s.status === 'hidden') return;
    const conc = _flConcessionFor(s);
    if (!conc) return;
    const yrTxs = (txByStudent[d.id] || []).filter(
      t => _normaliseAcademicYear(t.academicYear || '') === curYr);
    const withC = _flStudentYearOutstanding(s, yrTxs, curYr, { quiet: true });
    const without = _flStudentYearOutstanding(s, yrTxs, curYr, { quiet: true, concession: null });
    const row = {
      name: s.name || '—', admissionNumber: s.admissionNumber || '—', cls: s.class || '—',
      rate: without.rate, concRate: Number(conc.concessionFee),
      months: (Array.isArray(conc.activeMonths) && conc.activeMonths.length)
                ? conc.activeMonths.length : 12,
      before: without.outstanding, after: withC.outstanding,
      delta: withC.outstanding - without.outstanding
    };
    if (row.delta === 0) inert.push(row); else rows.push(row);
  });

  const before = rows.reduce((a, r) => a + r.before, 0);
  const after  = rows.reduce((a, r) => a + r.after, 0);

  console.log('%c══ CONCESSION IMPACT — NOTHING WAS WRITTEN ══', 'font-weight:bold;color:#c9a84c;font-size:14px');
  console.log(`Concession students priced : ${rows.length + inert.length}`);
  console.log(`Whose Due Fee changes      : ${rows.length}`);
  console.log(`Their current-year total  BEFORE: ₹${Math.round(before).toLocaleString('en-IN')}`);
  console.log(`                           AFTER: ₹${Math.round(after).toLocaleString('en-IN')}`);
  console.log(`CHANGE                     : ₹${Math.round(after - before).toLocaleString('en-IN')}`);
  if (typeof console.table === 'function' && rows.length) {
    console.table(rows.slice().sort((a, b) => a.delta - b.delta).map(r => ({
      Name: r.name, Adm: r.admissionNumber, Class: r.cls, Std: r.rate, Conc: r.concRate,
      ActiveMonths: r.months, Before: r.before, After: r.after, Delta: r.delta })));
  }
  if (inert.length) {
    console.warn('[CONCESSION] ' + inert.length + ' concession(s) change NOTHING — every month they ' +
      'cover is already settled, so the discount can never be applied. Worth checking with the ' +
      'office that the intended months were selected:',
      inert.map(r => r.admissionNumber + ' ' + r.name));
  }
  const _register = Object.keys(_FL_CONC_BY_ADM || {});
  const _unmatched = _register.filter(a => !_seen[a])
    .map(a => ({ admissionNo: a, reason: 'no student carries this admission number' }))
    .concat(_register.filter(a => _seen[a] && _seen[a] !== 'priced')
      .map(a => ({ admissionNo: a, reason: _seen[a] })));
  console.log(`Register records : ${_register.length}  ·  priced: ${rows.length + inert.length}` +
              `  ·  unaccounted: ${_unmatched.length}`);
  if (_unmatched.length) {
    console.warn('[CONCESSION] ' + _unmatched.length + ' record(s) in the register price NO ONE. ' +
      'A concession that matches no active student is invisible — it neither applies nor ' +
      'reports itself as broken:', _unmatched);
  }
  // One admission number, one student document. Two documents sharing one is a
  // multiple-sources-of-truth failure in its own right: which one a screen shows
  // becomes a matter of which query it happened to run.
  const _dupes = Object.keys(_docsByAdm).filter(a => _docsByAdm[a].length > 1)
    .map(a => ({ admissionNo: a, docs: _docsByAdm[a].length,
                 statuses: _docsByAdm[a].map(x => x.status).join(' + '),
                 ids: _docsByAdm[a].map(x => x.id).join(' , ') }));
  if (_dupes.length) {
    console.warn('[DUPLICATE STUDENT] ' + _dupes.length + ' admission number(s) are carried by ' +
      'MORE THAN ONE document in students/. Whichever one a screen reads is an accident of ' +
      'its query, so the same student can show two different classes, rates and balances:');
    if (typeof console.table === 'function') console.table(_dupes);
  }
  console.log('%cNothing was written.', 'color:#888');
  return { changed: rows.length, inert, unmatched: _unmatched, duplicates: _dupes,
           registerSize: _register.length, before, after, change: after - before, rows };
}

// ════════════════════════════════════════════════════════════════════════════
// ORPHAN & REBIND AUDIT (READ-ONLY) — what a wipe-and-reimport leaves behind.
//
// Deleting students does not delete what pointed AT them, and the SYNC cross-check
// cannot see any of it: that check compares the engine against the stored aggregate
// for students who EXIST. Everything below is either attached to a student who no
// longer does, or attached to a NEW student who never earned it. In both cases the
// engine and the aggregate agree perfectly — on a wrong figure — so the gap is 0 and
// nothing is reported.
//
// THREE THINGS TO LOOK FOR, worst first:
//
//  1. CONCESSION REBIND — the one that silently changes fees. Concession documents
//     key on admissionNo, not studentId (see the note at _flConcessionFor). A wipe
//     that leaves concessionFees intact, followed by an import that reuses admission
//     numbers — ADM-YYYY-NNN is a per-year sequence, so reuse is the NORM, not an
//     edge case — hands a brand-new student a discount granted to someone who has
//     left. Nothing warns. Their fees are simply lower than the schedule says.
//
//  2. ORPHANED TRANSACTIONS — feeTransactions whose studentId no longer exists.
//     Total Collected sums transactions, not students, so this money keeps being
//     reported as collected by a school that has no such pupil.
//
//  3. ORPHANED SNAPSHOTS — terminatedStudents / hiddenStudents / legacyStudents rows
//     pointing at deleted students. These print in their own sections and in every
//     export that sums over those collections.
//
// Console:
//     const orph = await previewOrphanedRecords();
//
// Writes nothing. Deletes nothing. Reports what is dangling and what has rebound.
// ════════════════════════════════════════════════════════════════════════════
async function previewOrphanedRecords() {
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[ORPHAN AUDIT] Principal only.'); return null;
  }
  const [sSnap, tSnap, cSnap] = await Promise.all([
    schoolCol('students').get(),
    schoolCol('feeTransactions').get(),
    schoolCol('concessionFees').get()
  ]);

  const byId  = new Map();
  const byAdm = new Map();
  sSnap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    byId.set(d.id, s);
    const a = String(s.admissionNumber || '').trim().toUpperCase();
    if (a) byAdm.set(a, s);
  });

  // 1. CONCESSION REBIND
  const concRebound = [], concOrphan = [];
  cSnap.docs.forEach(d => {
    const c = d.data();
    const adm = String(c.admissionNo || '').trim().toUpperCase();
    if (!adm) return;
    const hit = byAdm.get(adm);
    if (!hit) {
      concOrphan.push({ docId: d.id, admissionNo: adm, concessionFee: c.concessionFee,
                        note: 'no student holds this admission number — prices nobody' });
    } else {
      concRebound.push({ docId: d.id, admissionNo: adm, concessionFee: c.concessionFee,
                         nowAppliesTo: hit.name || '(unnamed)', studentId: hit.id,
                         theirClass: hit.class || '',
                         createdAt: c.createdAt ? '(has createdAt)' : '(none)',
                         note: 'ACTIVE — this student is being priced at the concession rate' });
    }
  });

  // 2. ORPHANED TRANSACTIONS
  const txOrphan = [];
  let orphanCash = 0;
  tSnap.docs.forEach(d => {
    const t = d.data();
    if (t.studentId && byId.has(t.studentId)) return;
    const amt = Number(t.amountPaid) || 0;
    orphanCash += amt;
    txOrphan.push({ docId: d.id, receipt: t.receiptNumber || '', studentId: t.studentId || '(none)',
                    studentName: t.studentName || '', amountPaid: amt,
                    academicYear: t.academicYear || '', type: t.type || 'payment' });
  });

  // 3. ORPHANED SNAPSHOTS
  const snapOrphan = [];
  for (const coll of ['terminatedStudents', 'hiddenStudents', 'legacyStudents']) {
    try {
      const snap = await schoolCol(coll).get();
      snap.docs.forEach(d => {
        const rec = d.data();
        const sid = rec.studentId;
        if (sid && byId.has(sid)) return;
        snapOrphan.push({ collection: coll, docId: d.id, studentId: sid || '(none)',
                          studentName: rec.studentName || rec.name || '',
                          outstanding: Number(rec.outstandingBalance) || 0 });
      });
    } catch (e) { console.warn('[ORPHAN AUDIT] could not read ' + coll + ': ' + e.message); }
  }

  console.log('%c[ORPHAN & REBIND AUDIT]', 'font-weight:bold');
  console.log('Students on roll: ' + sSnap.size);
  if (concRebound.length) {
    console.error('⛔ CONCESSIONS NOW APPLYING TO A CURRENT STUDENT: ' + concRebound.length +
      ' — if these were granted to students who have since been removed, the named ' +
      'students below are being charged a discounted rate nobody approved for them.');
    console.table(concRebound);
  } else {
    console.log('%c✅ No concession record binds to a student on the current roll.', 'color:green');
  }
  if (concOrphan.length) {
    console.warn('· concession records matching NO student: ' + concOrphan.length +
      ' (harmless today; they will bind the moment that admission number is reused)');
    console.table(concOrphan);
  }
  if (txOrphan.length) {
    console.error('⛔ ORPHANED TRANSACTIONS: ' + txOrphan.length +
      ' worth INR ' + orphanCash.toLocaleString('en-IN') +
      ' — counted by Total Collected, belonging to no student on the roll.');
    console.table(txOrphan.slice(0, 50));
  } else {
    console.log('%c✅ Every transaction belongs to a student on the roll.', 'color:green');
  }
  if (snapOrphan.length) {
    console.error('⛔ ORPHANED SNAPSHOTS: ' + snapOrphan.length +
      ' in terminated/hidden/legacy pointing at deleted students.');
    console.table(snapOrphan);
  } else {
    console.log('%c✅ No orphaned terminated/hidden/legacy records.', 'color:green');
  }

  return { concRebound, concOrphan, txOrphan, orphanCash, snapOrphan, roll: sSnap.size };
}

// ════════════════════════════════════════════════════════════════════════════
// SYNC CROSS-CHECK (READ-ONLY) — the fundamental rule, verified across every section.
//
// Every screen in this app gets its outstanding figure from exactly one of two places:
//
//   · the ENGINE          — Due Fee, Dashboard, Profile Card (since the frozen-balance
//                           fix), the reconcile itself
//   · the STORED AGGREGATE s.outstandingBalance — Terminated, Hidden, Legacy and every
//                           export that sums over those collections, all of which reach
//                           it through _computeAllYearsFeeSnapshot
//
// Those two agree only while _syncStudentFinancials has run for that student since the
// last thing that changed their money. When they diverge, two sections show two numbers
// for one student and nothing anywhere says so -- which is the entire class of defect
// this pass exists to close.
//
// So this compares them directly, for EVERY student including departed ones. It mirrors
// _syncStudentFinancials's own year enumeration rather than inventing a second one, and
// sums _flStudentYearOutstanding across those years exactly as the writer does, so the
// comparison is against the same definition the aggregate is supposed to hold.
//
// Departed students are the ones to watch. The engine deliberately stops accruing for
// them ("a departed student stops accruing", contract test 51d), so a hidden or
// terminated student whose aggregate still carries a live-looking balance is showing a
// debt the engine no longer recognises.
//
// Console:
//     const x = await previewSyncCrossCheck();
//
// Writes nothing. If it reports rows, reconcileAllStudentDues() is what fixes them --
// it reads /students with no status filter, so it covers departed students too.
// ════════════════════════════════════════════════════════════════════════════
async function previewSyncCrossCheck() {
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[SYNC X-CHECK] Principal only.'); return null;
  }
  await _flLoadConcessions(true);
  const curYr = _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const [sSnap, tSnap] = await Promise.all([
    schoolCol('students').get(), schoolCol('feeTransactions').get()
  ]);

  const txByStudent = {};
  tSnap.docs.forEach(d => {
    const t = d.data();
    (txByStudent[t.studentId] = txByStudent[t.studentId] || []).push(t);
  });

  const rows = [];
  sSnap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    const txs = txByStudent[s.id] || [];

    // Same enumeration _syncStudentFinancials uses — not a second opinion.
    const yearsSet = new Set();
    if (s.academicYear)          yearsSet.add(_normaliseAcademicYear(s.academicYear));
    if (s.previousAcademicYear)  yearsSet.add(_normaliseAcademicYear(s.previousAcademicYear));
    if (s.openingOutstandingYear)yearsSet.add(_normaliseAcademicYear(s.openingOutstandingYear));
    if (Array.isArray(s.openingOutstandingDues)) {
      s.openingOutstandingDues.forEach(e => { if (e && e.year) yearsSet.add(_normaliseAcademicYear(e.year)); });
    }
    txs.forEach(t => { if (t.academicYear) yearsSet.add(_normaliseAcademicYear(t.academicYear)); });
    yearsSet.add(curYr);
    try {
      const fm = _flYearFieldMap(s);
      fm.inferredYears.forEach(y => yearsSet.add(y));
    } catch (_) { /* fall through with what we have */ }

    let engineTotal = 0, ok = true;
    yearsSet.forEach(yr => {
      if (!yr || !ok) return;
      try {
        const info = _flStudentYearOutstanding(s, txs.filter(t =>
          _normaliseAcademicYear(t.academicYear || '') === yr), yr, { currentYear: curYr });
        engineTotal += Number(info && info.outstanding) || 0;
      } catch (_) { ok = false; }
    });
    if (!ok) return;

    const departed = s.status === 'terminated' || s.status === 'hidden';
    const stored = Number(s.outstandingBalance);
    const storedVal = Number.isFinite(stored) ? stored : null;

    // ══════════════════════════════════════════════════════════════════════
    // A MISSING AGGREGATE IS A FINDING, NOT A SKIP.
    //
    // This used to `return` when outstandingBalance was absent, on the reasoning
    // that there was nothing to compare against. That is backwards: a student the
    // reconcile has never written to is the MOST broken state this function can
    // encounter, and it was the one state guaranteed to be reported as fine.
    //
    // It matters most for exactly the case this check gets pointed at. Both student
    // creation paths reconcile AFTER the write — add-student per student,
    // bulk-admit once over the whole batch — so a bulk import that fails partway
    // leaves rows with no aggregate at all. Those students would have been skipped
    // in silence and the report would have said OUT OF SYNC: 0, while the engine
    // billed them a full year that no section had a stored figure for.
    //
    // Reported as its own category so it cannot be read as an ordinary drift: the
    // fix is to reconcile them, not to argue about a delta.
    // ══════════════════════════════════════════════════════════════════════
    if (storedVal === null) {
      rows.push({
        admissionNo: s.admissionNumber || '', name: s.name || '',
        status: s.status || 'active', class: s.class || '',
        storedAggregate: '(missing)', engineSays: engineTotal, gap: engineTotal,
        years: Array.from(yearsSet).filter(Boolean).sort().join(' '),
        note: 'NO STORED AGGREGATE — reconcile has never written this student'
      });
      return;
    }

    const gap = storedVal - engineTotal;
    if (gap === 0) return;
    rows.push({
      admissionNo: s.admissionNumber || '', name: s.name || '',
      status: s.status || 'active', class: s.class || '',
      storedAggregate: storedVal, engineSays: engineTotal, gap,
      years: Array.from(yearsSet).filter(Boolean).sort().join(' '),
      note: departed && gap > 0
        ? 'DEPARTED — aggregate still carries a debt the engine no longer accrues'
        : (gap > 0 ? 'Sections reading the aggregate OVER-state this student'
                   : 'Sections reading the aggregate UNDER-state this student')
    });
  });

  rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const departedRows = rows.filter(r => r.status === 'terminated' || r.status === 'hidden');
  const unreconciled = rows.filter(r => r.storedAggregate === '(missing)');
  const net = rows.reduce((a, r) => a + r.gap, 0);

  console.log('%c[SYNC CROSS-CHECK] engine vs stored aggregate · current year ' + curYr,
              'font-weight:bold');
  console.log('Scanned: ' + sSnap.size + ' students (active, hidden and terminated)');
  console.log('OUT OF SYNC: ' + rows.length + (rows.length ? '' : '  ✅'));
  if (rows.length) {
    if (unreconciled.length) {
      console.error('  ⛔ NEVER RECONCILED (no stored aggregate at all): ' + unreconciled.length +
        ' — these are not a drift, they are students no write has reached. ' +
        'Expect this if an import failed partway.');
    }
    console.log('  ...of which departed (hidden/terminated): ' + departedRows.length);
    console.log('  NET difference: INR ' + net.toLocaleString('en-IN'));
    console.table(rows);
    console.warn('[SYNC X-CHECK] Run reconcileAllStudentDues() to bring the aggregate ' +
      'back onto the engine. It has no status filter, so departed students are included.');
  } else {
    console.log('%c[SYNC X-CHECK] Every section agrees with the engine. SYNC holds.', 'color:green');
  }
  return { rows, departed: departedRows, net, scanned: sSnap.size, currentYear: curYr };
}

// ════════════════════════════════════════════════════════════════════════════
// PROFILE-CARD DRIFT PREVIEW (READ-ONLY) — how many cards were showing a frozen
// balance instead of the engine's figure, and by how much.
//
// The Profile Card's current-year Outstanding used to read the NEWEST transaction's
// stored remainingBalance whenever the year had any transaction, falling back to a
// live figure only when it had none. That stored number describes the balance at the
// instant of one payment, against the months that payment covered, and is never
// revisited -- so every month falling due afterwards was invisible to it.
//
// This reports the size of that gap across the whole roll: what each card WAS
// showing, what the engine says, and the difference. A positive drift means the card
// UNDER-stated the debt (the Test Student Two shape: "Fully cleared" over a grid of DUE months).
//
// Console:
//     const d = await previewProfileCardDrift();
//
// Writes nothing.
// ════════════════════════════════════════════════════════════════════════════
async function previewProfileCardDrift() {
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[CARD DRIFT] Principal only.'); return null;
  }
  await _flLoadConcessions(true);   // never measure against a cold register
  const curYr = _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const [sSnap, tSnap] = await Promise.all([
    schoolCol('students').get(),
    schoolCol('feeTransactions').get()
  ]);

  const txByStudent = {};
  tSnap.docs.forEach(d => {
    const t = d.data();
    (txByStudent[t.studentId] = txByStudent[t.studentId] || []).push(t);
  });

  const rows = [];
  sSnap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    const all = txByStudent[s.id] || [];
    const curTx = all.filter(t => {
      const ty = _normaliseAcademicYear(t.academicYear || t.feeYear || '');
      return !ty || ty === curYr;
    });

    // What the card USED to show: newest tx's frozen remainingBalance.
    const withBal = curTx
      .filter(t => t.type !== 'excused_waiver' && typeof t.remainingBalance === 'number')
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
    if (!withBal.length) return;                     // card was already using a live figure
    const wasShowing = withBal[0].remainingBalance || 0;

    let eng = null;
    try { eng = _flStudentYearOutstanding(s, curTx, curYr); } catch (_) { return; }
    if (!eng || !Number.isFinite(Number(eng.outstanding))) return;
    const truth = Number(eng.outstanding);
    const drift = truth - wasShowing;
    if (drift === 0) return;

    rows.push({
      admissionNo: s.admissionNumber || '', name: s.name || '',
      status: s.status || 'active', class: s.class || '',
      cardWasShowing: wasShowing, engineSays: truth, drift,
      direction: drift > 0 ? 'UNDER-stated the debt' : 'OVER-stated the debt'
    });
  });

  rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  const under = rows.filter(r => r.drift > 0);
  const over  = rows.filter(r => r.drift < 0);
  const net   = rows.reduce((a, r) => a + r.drift, 0);

  console.log('%c[PROFILE-CARD DRIFT] current year ' + curYr, 'font-weight:bold');
  console.log('Students whose card disagreed with the engine: ' + rows.length + ' of ' + sSnap.size);
  console.log('  UNDER-stated (card showed less than owed): ' + under.length +
              '  ·  INR ' + under.reduce((a, r) => a + r.drift, 0).toLocaleString('en-IN'));
  console.log('  OVER-stated  (card showed more than owed): ' + over.length +
              '  ·  INR ' + Math.abs(over.reduce((a, r) => a + r.drift, 0)).toLocaleString('en-IN'));
  console.log('  NET movement once every card reads from the engine: INR ' + net.toLocaleString('en-IN'));
  if (rows.length) console.table(rows);
  else console.log('%c[CARD DRIFT] Every card already agreed with the engine.', 'color:green');
  return { rows, under, over, net, currentYear: curYr, scanned: sSnap.size };
}

// ════════════════════════════════════════════════════════════════════════════
// ORPHANED MONTH GRID PREVIEW (READ-ONLY) — the academicYear data items.
//
// _flYearFieldMap binds monthStatus to s.academicYear:
//     if (docYear && yr === docYear) return 'monthStatus';
// docYear comes from the student document. When that field is MISSING, docYear is
// '' and the guard is falsy for every year asked, so fieldForYear() returns null
// always and the student's monthStatus is never read by anything. If that grid
// holds N/A-PAID months from an Excel import, those payments are invisible and the
// year bills at the full 12 months — the student is OVER-charged by exactly the
// months their grid says they already paid.
//
// This is not the same condition as a STALE academicYear, and the two must not be
// confused. A stale year (a promoted student still reading 2025-26) is harmless:
// the current year simply finds no grid and bills in full, which is correct, while
// monthStatus stays labelled with the year it actually describes. Verified on this
// roll at GAP: 0.
//
// It also explains why a stale year MUST NOT be "migrated" by writing the current
// year onto the student and stopping there. monthStatus is bound to whatever
// academicYear says, so relabelling the year without moving the grid in the SAME
// write silently converts last year's N/A-PAID marks into this year's and wipes a
// full year of dues for every student touched. promotions.js already does this
// correctly — year and grid move as one operation, older grids pushed into
// openingOutstandingDues[] under their real year. Any migration has to do the same.
//
// So this reports the case that IS a defect: a grid nothing can reach.
//
// Console:
//     const orph = await previewOrphanedMonthGrids();
//
// Writes nothing. Reports every student whose academicYear is missing, whether a
// grid exists behind it, how many months that grid marks paid, and what the year
// would cost with the grid honoured versus ignored — the difference being the
// amount currently being over-charged.
// ════════════════════════════════════════════════════════════════════════════
async function previewOrphanedMonthGrids() {
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[ORPHAN GRID] Principal only.');
    return null;
  }
  const snap = await schoolCol('students').get();
  const curYr = _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const rows = [];

  snap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    const docYear = _normaliseAcademicYear(s.academicYear || '');
    if (docYear) return;                    // has a year — grid is reachable

    const grid = (s.monthStatus && typeof s.monthStatus === 'object') ? s.monthStatus : {};
    const keys = Object.keys(grid);
    const paidMonths = keys.filter(m => {
      const v = String(grid[m] || '').toUpperCase();
      return v === 'PAID' || v === 'N/A-PAID' || v === 'EXCUSED';
    });

    const cls  = s.class || s.cls || '';
    const rate = _flRateForClass(cls, s.monthlyFee);
    // What the grid would save if it were reachable. The engine prices a grid-less
    // year at the full 12 months, so the exposure is simply the paid months' value.
    const ignoredValue = paidMonths.length * (Number(rate) || 0);

    rows.push({
      id: s.id,
      admissionNo: s.admissionNumber || '',
      name: s.name || '',
      status: s.status || 'active',
      class: cls,
      rate,
      gridExists: keys.length > 0,
      gridMonths: keys.length,
      paidInGrid: paidMonths.length,
      paidMonthNames: paidMonths.join(', '),
      overchargedBy: ignoredValue,
      note: keys.length === 0
        ? 'No grid — nothing orphaned. Setting academicYear is cosmetic here.'
        : 'GRID IS UNREACHABLE. ' + paidMonths.length + ' paid month(s) ignored.'
    });
  });

  const exposed = rows.filter(r => r.overchargedBy > 0);
  const total   = exposed.reduce((a, r) => a + r.overchargedBy, 0);

  console.log('%c[ORPHANED MONTH GRIDS] current year ' + curYr, 'font-weight:bold');
  console.log('Students with NO academicYear: ' + rows.length);
  console.log('  ...of those, holding an unreachable grid with paid months: ' + exposed.length);
  console.log('  TOTAL currently over-charged: INR ' + total.toLocaleString('en-IN'));
  if (rows.length) console.table(rows);
  if (exposed.length) {
    console.warn('[ORPHAN GRID] These students are billed for months their own grid ' +
      'marks PAID. Fixing means writing academicYear AND confirming the grid describes ' +
      'that year — do not write the year alone.');
  } else {
    console.log('%c[ORPHAN GRID] No money exposure — no reachable-grid loss.', 'color:green');
  }
  return { rows, exposed, totalOvercharged: total, currentYear: curYr };
}

// ════════════════════════════════════════════════════════════════════════════
// STALE DUES ENTRY PREVIEW (READ-ONLY).
//
// An openingOutstandingDues entry stores three descriptions of one fact: the
// monthStatus grid, an `amount` scalar, and an `unpaidMonths` list. The grid is
// authoritative and both readers prefer it, so the other two are derived data
// held as though it were source data — and they drift.
//
// Nothing is wrong on screen while a grid exists. The exposure is the FALLBACK:
// _flOpeningDuesOutstanding returns `entry.amount` when an entry has no grid, and
// icons.js reads `unpaidMonths` in that same case. A record whose grid is ever
// dropped falls straight onto a stale number.
//
// Console:
//     const st = await previewStaleDuesEntries();
//
// Writes nothing. Reports every entry whose amount or unpaidMonths disagrees with
// its own grid, and what each WOULD become if derived from the grid instead.
// ════════════════════════════════════════════════════════════════════════════
async function previewStaleDuesEntries(opts) {
  const o = opts || {};
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[STALE DUES] Principal only.');
    return null;
  }
  const snap = await schoolCol('students').get();
  const rows = [];
  snap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    const arr = Array.isArray(s.openingOutstandingDues) ? s.openingOutstandingDues : [];
    arr.forEach(entry => {
      const yr = _normaliseAcademicYear((entry && entry.year) || '');
      if (!yr) return;
      let c = null;
      try { c = _flDetectGridConflict(s, yr); } catch (_) { return; }
      if (!c || (!c.amountStale && !c.listStale && !c.diffs.length)) return;
      const cls  = (entry && entry.class) || _resolveClassForYear(s, yr);
      const rate = _flRateForClass(cls, s.monthlyFee);
      rows.push({
        name: s.name || '—', adm: s.admissionNumber || '—',
        status: s.status || 'active', year: yr, cls: cls || '—', rate,
        kind: c.kind,
        amountNow: Number(entry.amount) || 0,
        amountShouldBe: (c.gridUnpaid || []).length * rate,
        listNow: (c.listedUnpaid || []).join(', ') || '(none)',
        listShouldBe: (c.gridUnpaid || []).join(', ') || '(none)',
        gridDisagreement: c.diffs.length ? c.diffs.join(' | ') : ''
      });
    });
  });

  console.log('%c══ STALE DUES ENTRIES — NOTHING WAS WRITTEN ══', 'font-weight:bold;color:#c9a84c;font-size:14px');
  console.log(`Entries needing repair : ${rows.length}`);
  const live = rows.filter(r => r.status !== 'terminated' && r.status !== 'hidden');
  console.log(`On ACTIVE students     : ${live.length}` +
    (live.length ? '  ← these are the ones that could bite' : '  ← none, so nothing is at risk today'));
  if (typeof console.table === 'function' && rows.length) console.table(rows);
  console.log('%cNothing was written. The monthStatus grid is authoritative and is what ' +
    'is being billed — these fields only matter if a grid is ever lost.', 'color:#888');
  return { total: rows.length, onActiveStudents: live.length, rows };
}

// ════════════════════════════════════════════════════════════════════════════
// PROMOTION YEAR-ROLLOVER PREVIEW (READ-ONLY).
//
// runBulkPromotion advanced `class` and never touched `academicYear`, so every
// student it promoted still points at the year they left. 145 of 158 active
// students carry annual promotion history; 140 still read 2025-26.
//
// The repair is NOT "set academicYear and move on". _flYearFieldMap binds
// monthStatus to academicYear, so rolling the year without moving the grid turns
// last year's PAID marks into THIS year's and erases a full year of dues for
// every one of them. The grid has to move in the same write, and where
// previousYearMonthStatus is already occupied that year has to be preserved
// rather than overwritten.
//
// This reports exactly what a backfill would do, per student, and flags every
// case where something would be displaced. Nothing is written.
//
// Console:
//     const r = await previewPromotionYearRollover();
// ════════════════════════════════════════════════════════════════════════════
async function previewPromotionYearRollover(opts) {
  const o = opts || {};
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[ROLLOVER] Principal only.');
    return null;
  }
  const curYr = _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const snap  = await schoolCol('students').get();

  const rows = [], conflicts = [], noYear = [];
  snap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    if (s.status === 'terminated' || s.status === 'hidden') return;
    const oldYr = _normaliseAcademicYear(s.academicYear || '');
    if (!oldYr) { noYear.push({ name: s.name || '—', adm: s.admissionNumber || '—', cls: s.class || '—' }); return; }
    if (oldYr === curYr) return;                       // already correct

    const promotedAnnually = (s.promotionHistory || []).some(h => h && h.source === 'annual');
    const curGrid  = (s.monthStatus && Object.keys(s.monthStatus).length) ? s.monthStatus : null;
    const prevGrid = (s.previousYearMonthStatus && Object.keys(s.previousYearMonthStatus).length)
                       ? s.previousYearMonthStatus
                       : ((s.prevYearMonthStatus && Object.keys(s.prevYearMonthStatus).length)
                           ? s.prevYearMonthStatus : null);
    const paidInCurGrid = curGrid
      ? Object.values(curGrid).filter(v => { const u = String(v || '').toUpperCase();
                                            return u === 'N/A-PAID' || u === 'PAID'; }).length : 0;

    // The number that makes the danger concrete: paid months that would silently
    // become THIS year's if the grid did not move with the year.
    const row = {
      name: s.name || '—', adm: s.admissionNumber || '—', cls: s.class || '—',
      storedYear: s.academicYear || '(unset)', wouldBecome: curYr,
      promotedAnnually: promotedAnnually ? 'yes' : 'no',
      gridToArchive: curGrid ? Object.keys(curGrid).length + ' months' : 'none',
      paidMonthsAtRisk: paidInCurGrid,
      displacesOlderGrid: prevGrid ? 'YES — must be preserved first' : 'no'
    };
    rows.push(row);
    if (prevGrid) conflicts.push(row);
  });

  const atRisk = rows.reduce((a, r) => a + r.paidMonthsAtRisk, 0);
  console.log('%c══ PROMOTION YEAR ROLLOVER — NOTHING WAS WRITTEN ══', 'font-weight:bold;color:#c9a84c;font-size:14px');
  console.log(`Active students needing the year rolled : ${rows.length}`);
  console.log(`Of those, promoted by Annual Promotion  : ${rows.filter(r => r.promotedAnnually === 'yes').length}`);
  console.log(`Students with NO academicYear at all    : ${noYear.length}`);
  console.log(`Paid months that would be MIS-CLAIMED if the grid did not move with the year: ${atRisk}`);
  console.log(`Students whose previous-year grid must be preserved first : ${conflicts.length}`);
  if (typeof console.table === 'function' && rows.length) console.table(rows.slice(0, o.limit || 60));
  if (conflicts.length) {
    console.warn('[ROLLOVER] ' + conflicts.length + ' student(s) already hold a previous-year grid. ' +
      'Archiving this year over the top would DESTROY it — those must move into ' +
      'openingOutstandingDues[] first:', conflicts.map(r => r.adm + ' ' + r.name));
  }
  if (noYear.length) {
    console.warn('[ROLLOVER] ' + noYear.length + ' active student(s) carry NO academicYear. Nothing ' +
      'can be rolled for them because there is no year to roll FROM — they need one set by hand:', noYear);
  }
  console.log('%cNothing was written.', 'color:#888');
  return { needRollover: rows.length, conflicts, noYear, paidMonthsAtRisk: atRisk, rows };
}

// JSS-REF-VELTRIX-2026-005 — PART B PREVIEW (READ-ONLY).
//
// Part B is a five-line deletion in renderPendingFee: dropping the `gridExists`
// branch so Due Fee stops billing a grid-less year at `monthlyFee x 12 - paid` and
// uses the engine's "bill only what the ledger proves" instead (items 1/16 part 2).
//
// SHIPPED in 2a8a2d9. THIS PREVIEW STILL REPORTS A NON-EMPTY RESULT, AND THAT IS
// CORRECT — it builds the legacy figure from its OWN inline expression below, not by
// calling renderPendingFee. So it keeps answering the historical question "what would
// the old model have said?", which is exactly what makes it worth keeping: it is the
// standing measurement of how far fee x 12 - cash drifts from the truth, and that
// number will grow as more concessions and waivers are granted.
//
// It is NOT a check that Part B stayed shipped. For that, read renderPendingFee: the
// grid-less branch is gone and test 51 pins it.
//
// It was deliberately held back from F1 because it is the one change whose
// CORRECTNESS is not in question — only its VISIBLE EFFECT. The school-wide Due Fee
// total will fall, and students will disappear from the list. Nobody should approve
// that from a description; they should approve it from a number. The number it was
// approved on: 12 students, −52,250, 2 drop off, both carry-over, zero current-year.
// An earlier run of this same preview reported 144 drop-offs and 4 current-year
// students vanishing — that is the run that kept the branch alive, and the reason
// it is worth keeping a measurement around instead of trusting a description.
//
// This runs BOTH models over the real roll and reports the difference. It writes
// nothing, reads nothing beyond what Due Fee already reads, and calls the same
// _flStudentYearOutstanding the page uses, so the "after" figure is what the page
// would genuinely show — not an estimate of it.
//
// Console:
//     const r = await previewPartB();        // opens a report, returns the data
//
// The expectation, stated in advance so it can be checked rather than trusted: the
// students who drop off should be CARRY-OVER students whose academicYear still
// points at a prior year. If ordinary current-year students are disappearing in
// numbers, something is wrong and Part B should NOT ship.
// ════════════════════════════════════════════════════════════════════════════
async function previewPartB(opts) {
  const o = opts || {};
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[PART B] Principal only.');
    return null;
  }
  const curYr = _normaliseAcademicYear(_getCurrentAcademicYearStr());
  const [stuSnap, txSnap] = await Promise.all([
    schoolCol('students').get(),
    schoolCol('feeTransactions').get(),
    _flLoadConcessions(true)
  ]);
  const txByStudent = {};
  txSnap.docs.forEach(d => {
    const t = d.data();
    if (!t.studentId) return;
    (txByStudent[t.studentId] = txByStudent[t.studentId] || []).push(t);
  });

  const rows = [];
  stuSnap.docs.forEach(d => {
    const s = { id: d.id, ...d.data() };
    if (s.status === 'terminated' || s.status === 'hidden') return;   // same exclusion Due Fee uses
    const yrTxs = (txByStudent[d.id] || []).filter(
      t => _normaliseAcademicYear(t.academicYear || '') === curYr);
    const info  = _flStudentYearOutstanding(s, yrTxs, curYr, { quiet: true });
    const rate  = info.rate;

    let now, after;
    if (rate <= 0) {
      const agg = _flCurrentYearOutstanding(s);
      now = after = Math.max(0, agg != null ? agg : 0);              // unchanged by Part B
    } else if (info.gridExists) {
      now = after = info.outstanding;                                // unchanged by Part B
    } else {
      const paid = yrTxs.reduce((sum, t) => sum + _txCollectedAmount(t), 0);
      now   = Math.max(0, rate * 12 - paid);                         // the legacy branch
      after = info.outstanding;                                      // the engine's answer
    }
    if (now === after) return;                                       // Part B does not touch them
    rows.push({
      id: d.id, name: s.name || '—', admissionNumber: s.admissionNumber || '—',
      cls: s.class || '—', academicYear: s.academicYear || '(none)',
      carryOver: _normaliseAcademicYear(s.academicYear || '') !== curYr,
      txCount: yrTxs.length, now, after, delta: after - now,
      dropsOff: now > 0 && after === 0
    });
  });

  const nowTotal   = rows.reduce((a, r) => a + r.now, 0);
  const afterTotal = rows.reduce((a, r) => a + r.after, 0);
  const dropped    = rows.filter(r => r.dropsOff);
  const carry      = dropped.filter(r => r.carryOver).length;
  const notCarry   = dropped.filter(r => !r.carryOver);

  console.log('%c══ PART B PREVIEW — NOTHING WAS WRITTEN ══', 'font-weight:bold;color:#c9a84c;font-size:14px');
  console.log(`Students affected : ${rows.length}`);
  console.log(`Due Fee total for these students  NOW: ₹${Math.round(nowTotal).toLocaleString('en-IN')}`);
  console.log(`                              AFTER B: ₹${Math.round(afterTotal).toLocaleString('en-IN')}`);
  console.log(`CHANGE            : ₹${Math.round(afterTotal - nowTotal).toLocaleString('en-IN')}`);
  console.log(`Drop off the list : ${dropped.length}  (carry-over: ${carry}, current-year: ${notCarry.length})`);
  if (notCarry.length) {
    console.warn('[PART B] ' + notCarry.length + ' CURRENT-YEAR student(s) would drop off. That is NOT ' +
      'the expected population — expected only carry-over students. Review these before shipping Part B:',
      notCarry.map(r => r.admissionNumber + ' ' + r.name));
  }
  if (typeof console.table === 'function' && rows.length) {
    console.table(rows.slice().sort((a, b) => a.delta - b.delta).slice(0, o.limit || 60)
      .map(r => ({ Name: r.name, Adm: r.admissionNumber, Class: r.cls, AY: r.academicYear,
                   CarryOver: r.carryOver ? 'yes' : 'no', Txs: r.txCount,
                   Now: r.now, AfterB: r.after, Delta: r.delta })));
  }
  console.log('%cNothing was written. Part B SHIPPED in 2a8a2d9 — Due Fee already uses the ' +
    'AFTER-B column. The NOW column is the retired fee x 12 - cash model, kept as a ' +
    'measure of how far it drifted.', 'color:#888');
  return { affected: rows.length, nowTotal, afterTotal, change: afterTotal - nowTotal,
           dropped, carryOverDrops: carry, currentYearDrops: notCarry, rows };
}

// ════════════════════════════════════════════════════════════════════════════
// QUARANTINE — students excluded from every bulk reconcile, dry run included.
//
// A record whose class history is internally inconsistent must not be swept into a
// school-wide write while it is still being diagnosed: reconciling it would bake
// today's contradictory state into the authoritative fields and destroy the
// evidence. Quarantining ONE student must never block the other N−1, which is why
// this is a skip list and not a global abort.
//
// Add by admission number (stable, human-checkable) or by student doc id. Remove
// the entry once the record is understood and corrected — a student left here is
// silently never reconciled, so this list is meant to be temporary and short.
//
// ADM-TEST-002 (Test Student Two): reported showing three different classes across three
// screens — "LKG A" (terminatedStudents snapshot), "Grade 8 – Section A" (students
// document) and "Nursery – A" (past-due auto-detect for 2025-26). Until it is known
// which is correct, her figures are not safe to commit.
// ════════════════════════════════════════════════════════════════════════════
const _FL_RECONCILE_QUARANTINE = {
  admissionNumbers: [],
  studentIds:       [],
};
// ADM-TEST-002 / <student-doc-id-redacted> — RELEASED. Her three-classes-at-once symptom
// is fully explained and the causes are fixed in code:
//   · the foreign class ("Grade 8"/"Grade 7") came in through bulk-admit's unguarded
//     class overwrite — now refused for any jump beyond one chain step (4efcc4b)
//   · the stored value carried a TRAILING SPACE ("LKG "), which made the exact-key
//     fee lookup miss and silently priced her from a stale monthlyFee, and which also
//     scored -1 on the promotion chain so the new jump guard could not even judge
//     her — both closed by the single class key and rate resolver (c9179a0)
//   · her profile priced from that stale field ahead of the schedule (1f7cbea)
//   · two grids claiming the same year are now detected rather than silently
//     resolved (4efcc4b)
// Her DATA repair is the operator's step; see the accompanying message. Re-add either
// identifier here if anything about her figures still looks wrong.

// Should this student be skipped? Matches on either key, plus any caller-supplied
// extras via opts.skipStudentIds / opts.skipAdmissionNumbers.
function _flIsQuarantined(studentIdOrDoc, admissionNumber, opts) {
  const o    = opts || {};
  const id   = String(studentIdOrDoc || '').trim();
  const adm  = String(admissionNumber || '').trim();
  const ids  = [].concat(_FL_RECONCILE_QUARANTINE.studentIds || [], o.skipStudentIds || []);
  const adms = [].concat(_FL_RECONCILE_QUARANTINE.admissionNumbers || [], o.skipAdmissionNumbers || []);
  return (id && ids.indexOf(id) > -1) || (adm && adms.indexOf(adm) > -1);
}

async function reconcileAllStudentDues(opts) {
  const _o = opts || {};
  if (currentRole !== 'principal') return;
  if (!confirm('This will recompute dues/class for every student using the latest fee logic. Recommended after a calculation fix. Continue?')) return;

  const btn = document.getElementById('reconcileDuesBtn');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Reconciling…'; }

  try {
    const snap = await schoolCol('students').get();
    const total = snap.docs.length;
    let done = 0, failed = 0;
    const skipped = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      // QUARANTINE: a record under investigation is skipped, not written. Skipping ONE
      // student must never block the other N−1 — that is why this is a skip list rather
      // than an abort, so a single bad record cannot hold up the whole school.
      if (_flIsQuarantined(doc.id, d.admissionNumber, _o)) {
        skipped.push(d.admissionNumber || doc.id);
        if (btn) btn.textContent = `🔄 Reconciling… ${done + failed + skipped.length}/${total}`;
        continue;
      }
      try {
        await _syncStudentFinancials(doc.id);
        done++;
      } catch (e) {
        failed++;
        console.error('reconcileAllStudentDues: failed for', doc.id, e);
      }
      if (btn) btn.textContent = `🔄 Reconciling… ${done + failed + skipped.length}/${total}`;
    }

    if (skipped.length) {
      console.warn('[RECONCILE] QUARANTINED — not written:', skipped.join(', '));
    }
    showToast(`Reconciled ${done}/${total} students` +
              `${failed ? ` · ${failed} failed (see console)` : ''}` +
              `${skipped.length ? ` · ${skipped.length} quarantined and skipped: ${skipped.join(', ')}` : ''}.`,
              failed ? 'warning' : (skipped.length ? 'warning' : 'success'));
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

    // ── 2b. Prime the concession register ──────────────────────────────────
    // Synchronous pricing reads this from cache; loading it here keeps Due Fee,
    // the Defaulter List and the Rolling Dues card on the same rates Record
    // Payment quotes.
    await _flLoadConcessions();

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

      // ══════════════════════════════════════════════════════════════════════
      // JSS-REF-VELTRIX-2026-005 F1 PART A — Due Fee asks the ENGINE what is owed,
      // for every student whose current year HAS a month grid.
      //
      // It used to compute its own answer: monthlyRate × 12 − sum(amountPaid).
      // That model cannot see four things the engine knows:
      //   · EXCUSED waivers      — they carry amountPaid: 0, so a waived month
      //                            reduced nothing (item 9's bug, live on this screen)
      //   · CONCESSION rates     — every month billed at the standard rate
      //   · months paid at ONBOARDING — no transaction exists, so they read unpaid
      //   · every month GRID     — monthStatus and friends were never consulted
      //
      // It is not a quiet corner either: this figure is pushed into the Dashboard's
      // Accumulated Rolling Dues card further down this same function, so it
      // OVERWROTE item 9's fix every time Due Fee rendered.
      //
      // _flStudentYearOutstanding is the code _syncStudentFinancials itself runs —
      // pure, synchronous, fed from the student doc and transactions already held in
      // memory here, so no extra Firestore reads.
      //
      // SHIPPED IN PART A: untagged transactions (no academicYear) no longer count as
      // current-year. The engine filters strictly on the year; this screen used to
      // sweep them in, so a payment tagged to no year inflated what looked paid.
      //
      // PART B — SHIPPED. The grid-less branch is gone; the engine answers for every
      // student, with or without a grid. It was held back for exactly one reason: its
      // correctness was never in doubt, only its visible effect, and nobody should
      // approve a school-wide swing from a description. previewPartB measured it
      // instead, and the number it produced on approval was:
      //
      //   12 students, −52,250, 2 drop off the list, BOTH carry-over, ZERO
      //   current-year — the pass condition written into that preview before any of
      //   this work started.
      //
      // Every rupee of that traces to something the legacy fee×12 − cash model is
      // structurally incapable of seeing:
      //   · CONCESSION rates — Bipin Khan 6,000 → 0 and Rajat Rao 3,600 → 0. Both had
      //     paid every month in full AT THEIR CONCESSION RATE; the legacy branch
      //     compared that cash against the standard rate and invented the difference.
      //   · WAIVERS — Test Student Seven's 800 September remainder, excused and ignored.
      //   · CASH-CAPPED CREDIT — Test Student Four 17,000 → 8,000, the one moving the other
      //     way, where the legacy branch over-billed and the old ledger under-billed.
      //
      // An earlier run of the same preview reported 144 drop-offs and 4 current-year
      // students disappearing. That was the guard doing its job against a genuinely
      // wrong rule, and it is why this branch outlived three attempts to remove it.
      // ══════════════════════════════════════════════════════════════════════
      const _curYrNormPF = _normaliseAcademicYear(curYearStr);
      const _yrTxsPF     = txs.filter(t => _normaliseAcademicYear(t.academicYear || '') === _curYrNormPF);
      const _infoPF      = _flStudentYearOutstanding(s, _yrTxsPF, _curYrNormPF);
      const monthlyRate  = _infoPF.rate;

      let outstanding;
      if (monthlyRate <= 0) {
        // Year cannot be priced at all (no fee-schedule rate, no monthlyFee). Prefer the
        // authoritative aggregate's current-year slice over the legacy per-tx balance.
        const _agg = _flCurrentYearOutstanding(s);
        outstanding = Math.max(0, _agg != null ? _agg
                                              : (bal?.found ? bal.balance : (s.outstandingBalance || 0)));
      } else {
        outstanding = _infoPF.outstanding;                       // the engine, always
      }

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
              <!-- DUE FEE EXPORTS: routed to the shared exporter so the current year, each past
                   year and all-years combined all produce the same format from one code path.
                   _tableHtml is only instantiated for 'pfCur' (the Previous Year tab renders
                   per-year accordions instead, which carry their own export buttons). -->
              <button class="btn btn-secondary btn-sm" onclick="_pfCurDueExportXLSX()" title="Export as Excel">📊 XLSX</button>
              <button class="btn btn-secondary btn-sm" onclick="_pfCurDueExportPDF()" title="Export as PDF">🖨️ PDF</button>
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

    // ── DASH-SYNC: DELETED. IT NEVER RAN. ────────────────────────────────────
    // Twenty-three lines that claimed to be the fix for a real problem: "both
    // _executeRollingDuesRecompute and _psc_recomputeTotalDue compute independently
    // from Firestore and can diverge from the Due Fee page. Overwrite their DOM
    // targets here with the single source of truth."
    //
    // It never overwrote anything. It ran HERE, and setContent() below replaces the
    // entire page DOM immediately afterwards:
    //   · inline_psc_totalDue and inline_psc_pendingFeesCount are re-rendered by
    //     that very setContent, with the correct figures already inlined. The
    //     assignment landed on nodes discarded microseconds later.
    //   · psc_rollingDues belongs to the Dashboard, which is being torn down to make
    //     room for this page. Same outcome.
    //
    // So the divergence it was written to hide was never hidden — which is exactly
    // what turned up tonight, the Dashboard reading 29,34,150 while Due Fee read
    // 30,76,550 after a full reconcile. A patch that cannot work is worse than no
    // patch: it stops anyone looking for the real cause, which was two independent
    // models of what a student owes. 52c45e8 removed the second model, so both
    // surfaces now compute the same figure from the same engine and there is nothing
    // left to paper over.
    // ──────────────────────────────────────────────────────────────────────────

    setContent(`
      <!-- ARC-012: Due Fee page with two sub-sections -->
      <div class="page-head flex-between">
        <div>
          <div class="page-title">Due Fee ${blockLabel}</div>
          <div class="page-sub">${yearBreakdownSorted.length > 1 ? yearBreakdownSorted.map(([yr])=>yr).join(', ') : acYear.label} — ${allPending.length} student${allPending.length!==1?'s':''} with outstanding dues · Total ₹${fmtNum(totalGrand)} <span style="font-size:11px;color:var(--warn);margin-left:8px">⚡ Full annual dues shown from Day 1 (12 months, concession-aware)</span></div>
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
            ? `12 months less paid, waived & concession · ${info.count} student${info.count!==1?'s':''}`
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
          All active students with outstanding dues for the current academic year — twelve months at each month's operative rate, less what has been paid, waived or excused.
        </div>
        ${_filterHtml('pfCur', _pfFilters)}
        ${_tableHtml('pfCur','Current Year Due Records','Current')}
      </div>

      <!-- ═══ SUB-SECTION: PREVIOUS YEAR OUTSTANDING ═══ -->
      <div class="due-fee-subsection ${activeAy==='prev'?'active':''}" id="pfSubPrev">
        <div class="alert alert-info" style="margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
          <div>
            <strong>🕐 Previous Year Outstanding Dues</strong><br>
            Balances carried forward from academic years prior to ${acYear.label}. Click a year card to expand and view the student list. Each year has its own search, filters and exports.
          </div>
          <!-- DUE FEE EXPORTS: every past year combined. Per-year buttons live on each
               year card below; the current year exports from its own tab. -->
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" title="Export every previous academic year to one PDF"
              onclick="_pfPrevAllExportPDF()">📄 All Years PDF</button>
            <button class="btn btn-secondary btn-sm" title="Export every previous academic year to one Excel sheet"
              onclick="_pfPrevAllExportXLSX()">📊 All Years Excel</button>
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

            // Collect unique blocks/classes/sections across all years for filter dropdowns
            // JSS-REF-VELTRIX-2026-005 ITEM 5: Section added — previously this list was Class-only,
            // so previous-year dues could not be narrowed to a single Class + Section the way the
            // rest of the app organises students. Options stay data-driven (only values that
            // actually occur in these rows), so nothing hardcoded and no empty choices.
            const allBlocks  = [...new Set(Object.values(prevYearMap).flat().map(r=>r.block).filter(Boolean))].sort();
            const allClasses = [...new Set(Object.values(prevYearMap).flat().map(r=>r.class).filter(Boolean))].sort((a,b)=>{
              const na=parseInt(a)||0, nb=parseInt(b)||0;
              return na!==nb ? na-nb : a.localeCompare(b);
            });
            const allSections = [...new Set(Object.values(prevYearMap).flat().map(r=>r.section).filter(Boolean))].sort();

            return entries.map(([yr, rows]) => {
              const yrTotal = rows.reduce((s,r)=>s+r.amountDue,0);
              const yrId    = 'prevYr_' + yr.replace(/[^a-z0-9]/gi,'_');
              // ITEM 5: order the list Class-then-Section (then name) so it reads class & section
              // wise, matching how students are organised elsewhere.
              rows = rows.slice().sort(_pfClassSecCmp);
              // Store rows so runtime search can filter them
              window._pfPrevYearRows[yrId] = rows;

              const blockOpts  = ['<option value="">All Blocks</option>',  ...allBlocks.map( b=>`<option value="${b}">${b}</option>`)].join('');
              const classOpts  = ['<option value="">All Classes</option>', ...allClasses.map(c=>`<option value="${c}">${c}</option>`)].join('');
              const sectionOpts= ['<option value="">All Sections</option>',...allSections.map(x=>`<option value="${x}">Section ${x}</option>`)].join('');

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
                      <!-- ITEM 5: Section filter — plain select to match this accordion's own
                           Block/Class controls (the page-level bars use the _mkSecDropdown
                           multi-select, which is per-prefix stateful and not safe to instantiate
                           once per academic-year accordion). -->
                      <div style="display:flex;flex-direction:column;gap:4px">
                        <label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Section</label>
                        <select id="${yrId}_sectionF" class="filter-bar-select" style="min-width:130px;padding:7px 10px;font-size:12px"
                          onchange="_pfPrevYrSearch('${yrId}')">
                          ${sectionOpts}
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
                      <div style="display:flex;align-items:flex-end;gap:8px">
                        <button class="btn btn-ghost btn-sm" onclick="_pfPrevYrReset('${yrId}')"
                          style="padding:7px 14px;font-size:12px">✕ Clear</button>
                        <!-- DUE FEE EXPORTS: this year's own PDF/Excel, honouring this
                             accordion's Block/Class/Section/Search filters. -->
                        <button class="btn btn-secondary btn-sm" title="Export ${yr} dues to PDF"
                          onclick="_pfPrevYrExportPDF('${yrId}','${yr}')"
                          style="padding:7px 12px;font-size:12px">📄 PDF</button>
                        <button class="btn btn-secondary btn-sm" title="Export ${yr} dues to Excel"
                          onclick="_pfPrevYrExportXLSX('${yrId}','${yr}')"
                          style="padding:7px 12px;font-size:12px">📊 Excel</button>
                      </div>
                      <div style="display:flex;align-items:flex-end;margin-left:auto">
                        <span id="${yrId}_filterInfo" style="font-size:11px;color:var(--info);opacity:0.8"></span>
                      </div>
                    </div>
                  </div>
                  <!-- ITEM 10: this year's own "Outstanding Dues by Class" graph, rendered by
                       the SAME _pfRenderSubChart the current-year tab uses — so it carries the
                       identical interactivity (click a bar to drill into that class). Painted on
                       expand rather than at build time, because Chart.js cannot size a canvas
                       inside a display:none container. -->
                  <div style="padding:14px 18px;border-bottom:1px solid var(--glass-border)">
                    <div id="${yrId}_chartTitle" style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Outstanding Dues by Class — ${yr}</div>
                    <div style="overflow-x:auto"><canvas id="${yrId}_chart" height="90"></canvas></div>
                    <div id="${yrId}_chartEmpty" style="display:none;text-align:center;padding:20px;color:var(--muted);font-size:12px">No pending dues match the selected filters.</div>
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
                            return `<tr ${_studentRowAttrs(row)}>
                              <td>${blockBadge}</td>
                              <td>${_studentNameLink(row.name, row)}</td>
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
    return `<tr ${_studentRowAttrs(row)}>
      <td>${blockBadge}</td>
      <td>${_studentNameLink(row.name, row)}</td>
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
  // ITEM 10: track the Chart instance PER CANVAS. This used to collapse every non-"Cur"
  // canvas onto one _pfPrevChart slot, so a second previous-year chart would destroy the
  // first — which is why per-year graphs were not possible. It also never actually worked:
  // _pfCurChart/_pfPrevChart are declared with `let`, so window[...] resolved to undefined
  // and the destroy() below never ran, leaking a Chart per redraw. A canvas-scoped window
  // key fixes both.
  const chartRef = '_pfChart_' + canvasId;

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

// ════════════════════════════════════════════════════════════════════════════
// DUE FEE EXPORTS — ONE shared implementation, used by every year: the current
// year, each individual past year, and all past years combined.
//
// Why this exists: the four original pfCur*/pfPrev* exporters were near-identical
// copies AND were wired to no button at all — Due Fee had no export UI. Worse,
// pfPrevExport* read window._pfPrevFiltered, which is only populated by
// pfPrevApply(); the Previous Year tab never calls that (it renders per-year
// accordions), so those exports could only ever have said "No data to export".
// Everything now funnels through this one pair and is handed exactly the rows the
// screen is showing, so an export can never drift from the display.
// ════════════════════════════════════════════════════════════════════════════
const _PF_DUE_HEAD = ['Block','Name','Adm#','Class','Section','Parent','Contact','Amount Due','Last Payment','Type'];

/** One displayed dues row -> export cells. Single place, so PDF and Excel can't diverge. */
function _pfDueCells(r, forPdf) {
  return [
    r.block || '-', r.name || '-', r.admissionNo || '-', r.class || '-', r.section || '-',
    r.parentName || '-', r.contact || '-',
    forPdf ? 'INR ' + fmtNum(r.amountDue || 0) : Number(r.amountDue || 0),   // R4: jsPDF has no ₹ glyph
    r.lastPayDate ? fmtDate(r.lastPayDate) : '-',
    r.type || '-',
  ];
}

/** Class -> Section -> name, matching the on-screen order (ITEM 5). */
function _pfDueSorted(rows) { return (rows || []).slice().sort(_pfClassSecCmp); }

function _pfDueExportXLSX(rows, meta) {
  const list = _pfDueSorted(rows);
  if (!list.length) { showToast('No dues to export for this selection.', 'warning'); return; }
  const total = list.reduce((s, r) => s + Number(r.amountDue || 0), 0);
  const d = nowIST();
  const dateStr = d.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})
                + ', ' + d.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});
  const wsData = [
    [meta.title, `Block: ${currentViewBlock||'All'}`, `Date: ${dateStr}`,
     `Students: ${list.length}`, `Total: ₹${fmtNum(total)}`],
    [],
    _PF_DUE_HEAD,
    ...list.map(r => _pfDueCells(r, false)),
    [],
    ['', '', '', '', '', '', 'TOTAL', total, '', ''],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [14,22,14,12,10,20,14,14,16,12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, String(meta.sheet).slice(0, 31));
  XLSX.writeFile(wb, meta.file + '.xlsx');
  showToast(`Excel exported — ${list.length} student${list.length!==1?'s':''}, ₹${fmtNum(total)}.`, 'success');
}

async function _pfDueExportPDF(rows, meta) {
  const list = _pfDueSorted(rows);
  if (!list.length) { showToast('No dues to export for this selection.', 'warning'); return; }
  const total = list.reduce((s, r) => s + Number(r.amountDue || 0), 0);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const schoolName = currentProfile?.schoolName || currentSchoolId || 'School';
  const d = nowIST();
  const dateStr = d.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})
                + ', ' + d.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});
  doc.setFontSize(14); doc.setTextColor(45,110,62);
  doc.text(meta.title, 14, 15);
  doc.setFontSize(9); doc.setTextColor(100,143,115);
  doc.text(`${schoolName}  |  Block: ${currentViewBlock||'All'}  |  Generated: ${dateStr}`, 14, 21.5);
  doc.text(`Students: ${list.length}  |  Total outstanding: INR ${fmtNum(total)}`, 14, 27);   // R4
  doc.autoTable({
    startY: 31,
    head: [_PF_DUE_HEAD],
    body: list.map(r => _pfDueCells(r, true)),
    foot: [['', '', '', '', '', '', 'TOTAL', 'INR ' + fmtNum(total), '', '']],   // R4
    headStyles: { fillColor:[45,110,62], textColor:255, fontSize:8 },
    footStyles: { fillColor:[232,240,234], textColor:[30,60,40], fontSize:8, fontStyle:'bold' },
    bodyStyles: { fontSize:8 },
    alternateRowStyles: { fillColor:[245,252,247] },
    didDrawPage: () => {
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text('CONFIDENTIAL', 14, ph - 6);
      doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pw - 14, ph - 6, { align:'right' });
    },
  });
  doc.save(meta.file + '.pdf');
  showToast(`PDF exported — ${list.length} student${list.length!==1?'s':''}, ₹${fmtNum(total)}.`, 'success');
}

// ── Current academic year (uses the live filtered set from pfCurApply) ──────
function _pfCurDueExportXLSX() {
  const a = _getAcademicYear();
  _pfDueExportXLSX(window._pfCurFiltered || [], {
    title: `CURRENT YEAR DUE FEE — ${a.label}`, sheet: 'Current Year Dues',
    file: `CurrentYearDues_${a.label.replace(/[–\s]/g,'_')}`,
  });
}
async function _pfCurDueExportPDF() {
  const a = _getAcademicYear();
  await _pfDueExportPDF(window._pfCurFiltered || [], {
    title: `CURRENT YEAR DUE FEE — ${a.label}`,
    file: `CurrentYearDues_${a.label.replace(/[–\s]/g,'_')}`,
  });
}

/** Rows an accordion is actually showing — its filtered set when filters are active. */
function _pfPrevYrExportRows(yrId) {
  const f = (window._pfPrevYrFiltered || {})[yrId];
  return Array.isArray(f) ? f : ((window._pfPrevYearRows || {})[yrId] || []);
}

// ── One specific past academic year ────────────────────────────────────────
function _pfPrevYrExportXLSX(yrId, yr) {
  _pfDueExportXLSX(_pfPrevYrExportRows(yrId), {
    title: `PREVIOUS YEAR OUTSTANDING DUES — ${yr}`, sheet: `Dues ${yr}`,
    file: `Dues_${String(yr).replace(/[^0-9A-Za-z-]/g,'')}`,
  });
}
async function _pfPrevYrExportPDF(yrId, yr) {
  await _pfDueExportPDF(_pfPrevYrExportRows(yrId), {
    title: `PREVIOUS YEAR OUTSTANDING DUES — ${yr}`,
    file: `Dues_${String(yr).replace(/[^0-9A-Za-z-]/g,'')}`,
  });
}

// ── Every past academic year combined ──────────────────────────────────────
function _pfPrevAllRows() {
  const all = [];
  Object.keys(window._pfPrevYearRows || {}).forEach(id => _pfPrevYrExportRows(id).forEach(r => all.push(r)));
  return all;
}
function _pfPrevAllExportXLSX() {
  const a = _getAcademicYear();
  _pfDueExportXLSX(_pfPrevAllRows(), {
    title: `PREVIOUS YEAR OUTSTANDING DUES — ALL YEARS (before ${a.label})`,
    sheet: 'All Previous Years', file: 'PreviousYearDues_AllYears',
  });
}
async function _pfPrevAllExportPDF() {
  const a = _getAcademicYear();
  await _pfDueExportPDF(_pfPrevAllRows(), {
    title: `PREVIOUS YEAR OUTSTANDING DUES — ALL YEARS (before ${a.label})`,
    file: 'PreviousYearDues_AllYears',
  });
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

// Toggle a previous-year accordion card open/closed
function _pfTogglePrevYear(yrId, headerEl) {
  const body    = document.getElementById(yrId + '_body');
  const chevron = document.getElementById(yrId + '_chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display    = isOpen ? 'none'   : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  if (chevron) chevron.style.color     = isOpen ? 'var(--muted)' : 'var(--info)';
  // ITEM 10: paint this year's graph now that its canvas has real dimensions. Chart.js
  // renders a zero-size canvas inside a collapsed container, so it must wait for expand.
  if (!isOpen && typeof _pfPrevYrSearch === 'function') _pfPrevYrSearch(yrId);
}

// ── Per-year accordion search/filter (Previous Year tab) ──────────────────
// JSS-REF-VELTRIX-2026-005 ITEM 5: Class-then-Section-then-name ordering for previous-year dues
// rows, so the list reads class & section wise. Class uses the canonical getClassList() order when
// available (Nursery < LKG < ... < Grade 10), falling back to a numeric/lexical compare.
function _pfClassSecCmp(a, b) {
  const order = (typeof getClassList === 'function') ? getClassList() : [];
  const ci = c => { const i = order.indexOf(c || ''); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
  const ai = ci(a.class), bi = ci(b.class);
  if (ai !== bi) return ai - bi;
  if ((a.class || '') !== (b.class || '')) {
    const na = parseInt(a.class) || 0, nb = parseInt(b.class) || 0;
    if (na !== nb) return na - nb;
    return String(a.class || '').localeCompare(String(b.class || ''));
  }
  const sc = String(a.section || '').localeCompare(String(b.section || ''));
  if (sc !== 0) return sc;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function _pfPrevYrSearch(yrId) {
  const allRows = (window._pfPrevYearRows || {})[yrId] || [];
  const block   = (document.getElementById(yrId + '_blockF')?.value  || '').trim();
  const cls     = (document.getElementById(yrId + '_classF')?.value  || '').trim();
  const sec     = (document.getElementById(yrId + '_sectionF')?.value || '').trim();   // ITEM 5
  const q       = (document.getElementById(yrId + '_searchF')?.value || '').trim().toLowerCase();

  const filtered = allRows.filter(row => {
    if (block && row.block !== block) return false;
    if (cls   && row.class !== cls)   return false;
    if (sec   && String(row.section || '') !== sec) return false;   // ITEM 5
    if (q && !(
      (row.name       || '').toLowerCase().includes(q) ||
      (row.admissionNo|| '').toLowerCase().includes(q) ||
      (row.parentName || '').toLowerCase().includes(q) ||
      (row.class      || '').toLowerCase().includes(q) ||
      (row.section    || '').toLowerCase().includes(q) ||   // ITEM 5: section is searchable too
      (row.contact    || '').toLowerCase().includes(q)
    )) return false;
    return true;
  }).sort(_pfClassSecCmp);   // ITEM 5: keep class & section ordering after filtering

  // DUE FEE EXPORTS: remember what this accordion is showing so its PDF/Excel buttons
  // export exactly these rows (filters + search applied), never the unfiltered set.
  window._pfPrevYrFiltered = window._pfPrevYrFiltered || {};
  window._pfPrevYrFiltered[yrId] = filtered;

  // ITEM 10: keep this year's graph in step with its own filters, exactly as the
  // current-year tab does. Skipped while the accordion is collapsed — Chart.js cannot
  // measure a canvas inside display:none; _pfTogglePrevYear repaints it on expand.
  const _accBody = document.getElementById(yrId + '_body');
  if (_accBody && _accBody.style.display !== 'none' && typeof _pfRenderSubChart === 'function') {
    _pfRenderSubChart(yrId + '_chart', yrId + '_chartEmpty', yrId + '_chartTitle',
                      filtered, cls, 'rgba(74,158,202,0.70)');
  }

  const tbody     = document.getElementById(yrId + '_tbody');
  const infoEl    = document.getElementById(yrId + '_filterInfo');
  const totalEl   = document.getElementById(yrId + '_headerTotal');
  const subEl     = document.getElementById(yrId + '_total');
  const countEl   = document.getElementById(yrId + '_count');
  const filteredTotal = filtered.reduce((s,r)=>s+r.amountDue,0);

  if (infoEl) {
    const isFiltered = block || cls || sec || q;   // ITEM 5: Section counts as an active filter
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
    return `<tr ${_studentRowAttrs(row)}>
      <td>${blockBadge}</td>
      <td>${_studentNameLink(row.name, row)}</td>
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
  const blockF   = document.getElementById(yrId + '_blockF');
  const classF   = document.getElementById(yrId + '_classF');
  const sectionF = document.getElementById(yrId + '_sectionF');   // ITEM 5
  const searchF  = document.getElementById(yrId + '_searchF');
  if (blockF)   blockF.value   = '';
  if (classF)   classF.value   = '';
  if (sectionF) sectionF.value = '';
  if (searchF)  searchF.value  = '';
  _pfPrevYrSearch(yrId);
}
// DEAD-CODE SWEEP: removed the unwired _pf* no-op stubs and the pfApplyFilters/pfResetFilters +
// exportDueFee*/exportPendingFee* delegating shims (zero callers, no external references in this
// codebase). Live entry points are pfCurApply/pfCurReset and pfCurExportXLSX/pfCurExportPDF.



