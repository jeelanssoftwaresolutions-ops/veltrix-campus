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
// ════════════════════════════════════════════════════════════════════════════
// AUDIT F5 — getDynamicAcademicYears() AND populateYearDropdown() ARE GONE.
//
// They were the single most expensive read in the codebase: every student
// document AND every fee transaction, fetched in full, to produce a list of
// academic-year LABELS — a handful of strings like "2025-26". On a school with
// years of history that is the entire ledger pulled into the browser so a
// <select> can be filled.
//
// They were also dead. getDynamicAcademicYears() was called by exactly one
// thing, populateYearDropdown(), and populateYearDropdown() was called by
// nothing at all — not from another module, not from an inline handler in
// index.html. Both were referenced only by each other.
//
// The job was superseded rather than abandoned. _flStudentAcademicYears()
// further down this file is "the one list-builder behind every year selector":
// it answers which years THIS STUDENT has, from that student's own document and
// transactions, which is what every year dropdown in the app actually needs.
// Asking the whole database which years exist was the wrong question, and the
// screens stopped asking it.
//
// window._cachedDynamicYears goes with them, along with its three invalidation
// sites — a cache invalidated on every student write, for a function nobody
// called.
// ════════════════════════════════════════════════════════════════════════════

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
// ════════════════════════════════════════════════════════════════════════════
// DOES THIS TRANSACTION BELONG TO THIS YEAR? ONE ANSWER.
//
// A transaction with no academicYear — legacy data, and the reason several
// readers carry an "untagged tx assumed current-year" comment — was being
// answered two different ways:
//
//   COUNTED as current year : the Profile Card's Total Paid, the Terminated
//                             snapshot, the Fee Card
//   DROPPED entirely        : the engine's own per-year loop, Record Payment's
//                             applied-by-month ledger, past-due recording
//
// STRICT: a transaction belongs to the year it is tagged with, and an untagged
// one belongs to no year at all.
//
// This shipped LENIENT first — untagged counted as current-year — on the
// reasoning that the alternative bills a parent for money they demonstrably
// paid. That was wrong, for two reasons found afterwards.
//
// One: the Accumulated Rolling Dues card had already made this exact decision
// and recorded why. It used to include `|| !t.academicYear` and the comment
// there reports the consequence — "a payment tagged to no year inflated what
// looked paid here but not on Due Fee. That alone could move the two figures
// apart." Leniency was tried, observed to diverge, and removed. Reintroducing
// it in the engine while Due Fee and that card stayed strict made the split
// WIDER than the one it was meant to close.
//
// Two: an untagged transaction can no longer be created. The published rules
// require academicYear is string && size() > 0 on every feeTransactions create,
// and all three write paths already set it. The lenient branch could therefore
// only ever have applied to legacy documents, and it would have moved their
// money onto whatever year happened to be current when someone opened a screen.
//
// One answer, and it is the one the codebase had already chosen.
// ════════════════════════════════════════════════════════════════════════════
// feeYear is a legacy alias for academicYear and the Profile Card already fell
// back to it. Honoured here so routing that reader through this function cannot
// lose a transaction that only carries the old field name.
function _flTxBelongsToYear(t, yr) {
  const ty = _normaliseAcademicYear((t && (t.academicYear || t.feeYear)) || '');
  if (!ty) return false;                      // untagged belongs nowhere
  return ty === _normaliseAcademicYear(yr || '');
}

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
// ════════════════════════════════════════════════════════════════════════════
// THE PRICE A MONTH CARRIED WHEN IT WAS LAST PAID.
//
// Two sources, in order of how directly they witnessed it:
//
//   1. tx.monthRates — written by saveFeePayment at the moment of collection. This
//      is the receipt stating its own prices, and it is the only source that cannot
//      be rewritten by a later edit.
//   2. The concession register's superseded entries. A concession edit now keeps
//      what it replaced (concession-modal.js) instead of overwriting it, so for a
//      payment recorded BEFORE monthRates existed we can still ask which concession
//      was in force on that date and what it charged.
//
// A month neither source can speak to returns nothing — not a guess. The caller
// then falls through to its existing rule, so legacy data is untouched.
//
// Latest transaction wins: a month part-paid at one price and closed at another was
// closed at the second, and that is the price the discharge must be measured against.
// ════════════════════════════════════════════════════════════════════════════
function _flTxTimeMs(t) {
  if (!t) return 0;
  const d = t.date;
  if (d && typeof d.toMillis === 'function') return d.toMillis();
  if (d && typeof d.toDate === 'function')   return d.toDate().getTime() || 0;
  const n = new Date(d || t.createdAt || 0).getTime();
  return Number.isFinite(n) ? n : 0;
}

function _flRecordedMonthRates(yearTxs, s, yr) {
  const out  = {};
  const S2Fr = _FL_S2F_SYNC || _FL_S2F;
  const txs  = (yearTxs || [])
    .filter(t => t && t.type !== 'excused_waiver')
    .slice()
    .sort((a, b) => _flTxTimeMs(a) - _flTxTimeMs(b));   // oldest first; later overwrites

  // Source 2, primed first so a recorded rate always beats a reconstructed one.
  let conc = null;
  try { conc = _flConcessionFor(s); } catch (_) { conc = null; }
  const hist = (conc && Array.isArray(conc.history)) ? conc.history : [];
  const _histRateFor = (month, atMs) => {
    if (!hist.length || !atMs) return null;
    const key = _flConcMonthKey(yr, month);
    if (!key) return null;
    // Most recently superseded first — the entry in force at atMs is the earliest one
    // superseded AFTER the payment landed.
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      if (!h || !Array.isArray(h.activeMonths) || h.activeMonths.indexOf(key) < 0) continue;
      const sup = new Date(h.supersededAt || 0).getTime();
      if (!Number.isFinite(sup) || sup < atMs) continue;   // already replaced by then
      const bd = h.monthlyBreakdown;
      if (bd && typeof bd === 'object' && typeof bd[key] === 'number' && bd[key] >= 0) return bd[key];
      const r = Number(h.concessionFee);
      if (Number.isFinite(r) && r >= 0) return r;
    }
    return null;
  };

  txs.forEach(t => {
    const at = _flTxTimeMs(t);
    // Source 1 — what the receipt itself recorded.
    if (t.monthRates && typeof t.monthRates === 'object') {
      Object.keys(t.monthRates).forEach(m => {
        const r = Number(t.monthRates[m]);
        if (Number.isFinite(r) && r > 0) out[S2Fr[_flShort(m)] || m] = r;
      });
      return;
    }
    // Source 2 — reconstructed for a payment older than that field.
    const touched = Array.isArray(t.monthsSelected) ? t.monthsSelected
                  : (t.monthAllocations ? Object.keys(t.monthAllocations) : []);
    touched.forEach(m => {
      const full = S2Fr[_flShort(m)] || m;
      const r    = _histRateFor(full, at);
      if (Number.isFinite(r) && r > 0) out[full] = r;
    });
  });
  return out;
}

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

    // ══════════════════════════════════════════════════════════════════════
    // (c) ITEM 5, REVISED — a month is charged at the rate in force THAT month.
    //
    // This asserted the opposite: "months paid at the OLD rate owe only the
    // difference after promotion", expecting June and July to sit at 1,700 in
    // partialPaid and the year to cost 2 x 100 + 10 x 1800.
    //
    // That rule produced a debt nobody could pay. Live case: KABIR KAPOOR's June
    // was settled at 1,700 on enrolment, a mid-year promotion re-priced it at
    // 1,800, and the 100 difference could never be collected — the grid shows
    // June as N/A-PAID so the month picker locks it green, and no screen offers
    // any control that would take that 100. It simply accrued, inflating Rolling
    // Dues, uncollectable and unclearable.
    //
    // midYearPromotion records priorGradeRate and effectiveMonth precisely so the
    // new rate can start WHEN IT SAYS IT DOES, and the promotion banner tells the
    // parent "the new fee cycle begins <effectiveMonth>". Charging earlier months
    // at the new rate contradicted the app's own promise to the family.
    //
    // So: months before effectiveMonth cost the prior grade's rate on BOTH sides
    // of the ledger. Here Jun/Jul are settled outright, Aug (still before
    // September) is due at 1,700, and Sep-May are due at 1,800.
    // ══════════════════════════════════════════════════════════════════════
    const c = _flStudentYearOutstanding(
      S({ monthlyFee:1800, monthStatus: grid({ Jun:'N/A-PAID', Jul:'N/A-PAID' }),
          midYearPromotion:{ academicYear:'2026-27', priorGradeRate:1700, effectiveMonth:'September' } }),
      [ { academicYear:'2026-27', monthAllocations:{ June:1700, July:1700 } } ], '2026-27');
    const diffCharged = !c.partialPaid['June'] && !c.partialPaid['July']   // settled, not short
                     && c.paid.has('June') && c.paid.has('July')
                     && c.rateForMonth('August')    === 1700   // before the effective month
                     && c.rateForMonth('September') === 1800   // from it onward
                     && c.outstanding === 1700 + 9 * 1800;     // Aug at the old rate, Sep-May at the new

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

  // 75) "TOTAL DUE" MUST NOT CONTAIN "AMOUNT PAID".
  //     _computeAllYearsFeeSnapshot defined totalDue as totalPaid + excusedTotal +
  //     outstanding, so the Terminated table's Total Due column rose as the student
  //     paid and the two columns summed to more than was ever owed. The three
  //     figures are three different questions and this pins each one:
  //       totalDue    = dues across every year, no money received in it
  //       totalPaid   = money received, every year
  //       outstanding = the CURRENT year's slice of totalDue
  //     Figures are the ones from the live report: 18,700 owed of which 6,800 is
  //     prior-year, 13,800 collected, 10,200 waived.
  T('archive_snapshot_keeps_dues_paid_and_current_year_apart', async () => {
    const _realSchoolCol = (typeof schoolCol === 'function') ? schoolCol : null;
    if (!_realSchoolCol) return { pass: false, detail: 'schoolCol unavailable' };
    try {
      const txs = [
        { type: 'payment',        amountPaid:   13800, remainingBalance: 11900, date: { seconds: 200 } },
        { type: 'excused_waiver', amountWaived: 10200,                          date: { seconds: 300 } },
      ];
      schoolCol = () => ({
        doc:   () => ({ get: () => Promise.resolve({ exists: true, data: () => ({
                 outstandingBalance: 18700, previousDues: 6800 }) }) }),
        where: () => ({ get: () => Promise.resolve({ docs: txs.map(t => ({ data: () => t })) }) })
      });
      const s = await _computeAllYearsFeeSnapshot('sid');
      const oldFormula = s.totalPaid + s.excusedTotal + s.outstanding;   // what it used to answer
      return { pass: s.totalDue    === 18700       // all-years DUES only
                   && s.totalPaid  === 13800       // collected, all years
                   && s.excusedTotal === 10200     // still reported, no longer folded into dues
                   && s.outstanding === 11900      // 18700 - 6800 -> the current year alone
                   && s.outstanding <= s.totalDue  // true by construction
                   && s.totalDue !== oldFormula,   // and it is NOT the old sum
               detail: { totalDue: s.totalDue, totalPaid: s.totalPaid,
                         excused: s.excusedTotal, outstanding: s.outstanding,
                         priorYearArrears: s.totalDue - s.outstanding,
                         whatItUsedToAnswer: oldFormula } };
    } finally { schoolCol = _realSchoolCol; }
  });

  // 76) A TERMINATED STUDENT MAY NOT BE PAID, AND THE ONE EXCEPTION IS NARROW.
  //     There was no isTerminated guard in the codebase at all; every entry point
  //     rendered Record Payment unconditionally and the write took it. This pins
  //     the guard both ways — that it refuses, and that it does NOT refuse the
  //     things it was never meant to: an active student, or a hidden one (hiding is
  //     a confidentiality measure, not an exit).
  //
  //     THE EXCEPTION IS GONE. The first version of this guard took an allowArchived
  //     option so Terminated/Hidden's Pay Dues could still collect arrears; that was
  //     closed by decision. The test asserts the absence: passing anything at all as
  //     a second argument must NOT open the door, so a re-introduced flag fails here
  //     rather than quietly working.
  T('terminated_payable_only_from_the_terminated_screen', () => {
    if (typeof _flPaymentGuard !== 'function') {
      return { pass: false, detail: '_flPaymentGuard not loaded' };
    }
    const active    = _flPaymentGuard({ status: 'active' });
    const noStatus  = _flPaymentGuard({});                  // absent status -> active
    const nullDoc   = _flPaymentGuard(null);                // display fail-open; the
                                                            // write refuses separately
    const hidden    = _flPaymentGuard({ status: 'hidden' });
    const term      = _flPaymentGuard({ status: 'terminated' });
    const termCased = _flPaymentGuard({ status: 'Terminated' });   // case is not a bypass
    const termSpace = _flPaymentGuard({ status: ' Terminated ' });  // padded + cased
                                                                   // must still be caught
    // THE TERMINATED SCREEN COLLECTS. It passes fromArchive and is allowed
    // through; that is the whole point of the flag. Every other entry point
    // omits it and is refused, which is what the finding was actually about.
    const termArch  = _flPaymentGuard({ status: 'terminated' }, { fromArchive: true });
    // An options object that does NOT carry fromArchive must not open the door —
    // a near-miss flag name is the obvious way this gets re-broken.
    const termNear  = _flPaymentGuard({ status: 'terminated' }, { allowArchived: true, force: true });
    // And the flag must not change the answer for a student who was never blocked.
    const activeArch = _flPaymentGuard({ status: 'active' }, { fromArchive: true });

    // hidden.allowed was asserted TRUE here. That was not an oversight in the
    // test — it faithfully recorded what the guard did, and what the guard did
    // was let a confidential student's payment form open to anyone who reached
    // them. An ADMIN session on a hidden student is how it surfaced. Both
    // departed states are blocked now, and both open only via fromArchive.
    return { pass: active.allowed && noStatus.allowed && nullDoc.allowed
                 && hidden.allowed === false
                 && _flPaymentGuard({ status: 'hidden' }, { fromArchive: true }).allowed === true
                 && term.allowed === false
                 && typeof term.reason === 'string' && term.reason.length > 0
                 && termCased.allowed === false
                 && termSpace.allowed === false     // padding is not a bypass
                 && termArch.allowed === true       // Terminated may collect
                 && termArch.viaArchiveScreen === true
                 && termNear.allowed === false      // only THIS flag, by name
                 && activeArch.allowed === true
                 && activeArch.viaArchiveScreen === undefined,
             detail: { active: active.allowed, hidden: hidden.allowed,
                       terminated: term.allowed, terminatedCased: termCased.allowed,
                       paddedStatus: termSpace.allowed,
                       viaTerminatedScreen: termArch.allowed,
                       nearMissFlagRefused: termNear.allowed, reason: term.reason } };
  });

  // 77) A PRIOR YEAR'S OUTSTANDING COMES FROM ITS GRID, NEVER FROM A WAIVER RECEIPT.
  //     The profile card read each prior year's figure from the newest transaction's
  //     remainingBalance, and that branch has no type filter — so an EXC- doc could
  //     set it. The excused path writes remainingBalance as the student's ALL-YEARS
  //     aggregate minus the waiver (correctly: outstandingBalance is the all-years
  //     field), so waiving one prior-year month handed that single year the whole
  //     balance and froze it there. Live: 2024-25 stuck at 11,900 with its own grid
  //     showing the year settled.
  //
  //     The engine is what the card now asks. Here the year IS settled — nine months
  //     paid, three waived — so the only correct answer is 0, and the 11,900 sitting
  //     on the waiver receipt must not appear anywhere in it.
  T('prior_year_waiver_does_not_hand_that_year_the_all_years_balance', () => {
    const grid = {};
    ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb'].forEach(m => grid[m] = 'N/A-PAID');
    ['Mar','Apr','May'].forEach(m => grid[m] = 'EXCUSED');
    const s = {
      class: 'Nursery', monthlyFee: 1700, academicYear: '2026-27',
      outstandingBalance: 11900, previousDues: 11900,
      openingOutstandingDues: [{ year: '2025-26', class: 'Nursery', monthlyFee: 1700,
                                 monthStatus: grid }]
    };
    const waiverTx = { type: 'excused_waiver', academicYear: '2025-26',
                       amountWaived: 5100, remainingBalance: 11900,
                       monthsExcused: ['March','April','May'], date: { seconds: 100 } };

    const info = _flStudentYearOutstanding(s, [waiverTx], '2025-26', { currentYear: '2026-27' });

    // And the year the waiver did NOT touch is unaffected by any of this.
    const s2 = { class: 'LKG', monthlyFee: 1700, academicYear: '2026-27',
                 openingOutstandingDues: [{ year: '2024-25', class: 'Nursery',
                                            monthlyFee: 1500, monthStatus: allDue() }] };
    const untouched = _flStudentYearOutstanding(s2, [], '2024-25', { currentYear: '2026-27' });

    return { pass: info.gridExists === true
                 && info.outstanding === 0                 // settled, not 11,900
                 && info.paid.size === 9
                 && info.excused.size === 3
                 && info.rate === 1700                     // priced at ITS year's stored rate
                 && untouched.outstanding === 12 * 1500,   // 18,000, at 2024-25's own rate
             detail: { outstanding: info.outstanding,
                       staleFigureOnTheReceipt: waiverTx.remainingBalance,
                       paid: info.paid.size, excused: Array.from(info.excused),
                       rate: info.rate, untouchedYear: untouched.outstanding } };
  });

  // 78) ONBOARDING AN EXISTING STUDENT WITH THREE PRIOR YEARS MUST YIELD THREE.
  //     The sibling of test 73, for the "+ Existing Student" form. Two distinct
  //     defects had to be fixed before this could pass: the year dropdown offered
  //     exactly two academic years so a third could not be entered at all, and the
  //     payload described the OLDEST year twice (scalars AND array) while the
  //     newest went only into the array.
  //
  //     Asserted end to end through the REAL functions the form calls —
  //     _fsPrevYearFields for the split, then _flStudentAcademicYears, which is
  //     what the Record Previous Year Dues dropdown is actually built from.
  T('existing_student_three_prior_years_all_reach_the_dropdown', () => {
    if (typeof _fsPrevYearFields !== 'function') {
      return { pass: false, detail: '_fsPrevYearFields not loaded (add-student.js)' };
    }
    const grid = m => { const g = {}; _FL_MONTHS.forEach(k => g[k] = 'DUE'); return Object.assign(g, m || {}); };
    // Deliberately out of order, to prove the split sorts rather than trusting input.
    const rows = [
      { class:'LKG',     year:'2024-2025', amount:18000, unpaidMonths:['June'], monthStatus:grid(), monthlyFee:1500 },
      { class:'UKG',     year:'2025-2026', amount:20400, unpaidMonths:['July'], monthStatus:grid(), monthlyFee:1700 },
      { class:'Nursery', year:'2023-2024', amount:16800, unpaidMonths:['May'],  monthStatus:grid(), monthlyFee:1400 },
    ];
    const f = _fsPrevYearFields(rows, 'Grade 3');
    const s = Object.assign({ class:'Grade 3', monthlyFee:1900, academicYear:'2026-27' }, f);

    const arr    = Array.isArray(s.openingOutstandingDues) ? s.openingOutstandingDues : [];
    const inArr  = y => arr.some(e => _normaliseAcademicYear(e.year) === y);
    const years  = (typeof _flStudentAcademicYears === 'function')
      ? _flStudentAcademicYears(s, []).map(_normaliseAcademicYear) : [];

    // Each archived year must still price at ITS OWN rate, not Grade 3's.
    const rate2324 = _flStudentYearOutstanding(s, [], '2023-24', { currentYear:'2026-27' }).rate;

    return { pass:
      // newest prior year occupies the scalars, with its own grid and class
         _normaliseAcademicYear(s.previousAcademicYear) === '2025-26'
      && _normaliseAcademicYear(s.openingOutstandingYear) === '2025-26'
      && s.openingOutstandingClass === 'UKG'
      && !!s.previousYearMonthStatus && Object.keys(s.previousYearMonthStatus).length === 12
      // ...and is NOT also in the array (F13)
      && !inArr('2025-26')
      // the two older years are in the array, and only there
      && arr.length === 2 && inArr('2024-25') && inArr('2023-24')
      // each archived year kept the rate it was quoted at
      && rate2324 === 1400
      // the stale duplicate-description field is cleared, not left pointing elsewhere
      && !!s.prevYearMonthStatus && Object.keys(s.prevYearMonthStatus).length === 0
      // balance is the sum of all three, untouched
      && s.outstandingBalance === 16800 + 18000 + 20400
      // THE HEADLINE: all three prior years reach the dropdown, not just the newest
      && years.indexOf('2025-26') > -1
      && years.indexOf('2024-25') > -1
      && years.indexOf('2023-24') > -1,
      detail: { scalarYear: s.previousAcademicYear, archived: arr.map(e => e.year + '/' + e.class),
                dropdownOffers: years, balance: s.outstandingBalance, rate202324: rate2324 } };
  });

  // 79) THE TWO-YEAR CASE THAT ALREADY WORKED MUST GO ON WORKING, and the
  //     re-onboarding merge must not delete what the form did not mention.
  //     Two prior years put ONE year in the scalars and ONE in the array; with a
  //     single prior year the array is absent entirely rather than empty, which is
  //     what lets _flMergeOpeningDues keep the stored years on a re-import.
  T('existing_student_two_prior_years_no_regression_and_merge_keeps_the_rest', () => {
    if (typeof _fsPrevYearFields !== 'function' || typeof _flMergeOpeningDues !== 'function') {
      return { pass: false, detail: '_fsPrevYearFields / _flMergeOpeningDues not loaded' };
    }
    const grid = () => { const g = {}; _FL_MONTHS.forEach(k => g[k] = 'DUE'); return g; };
    const two = _fsPrevYearFields([
      { class:'LKG', year:'2024-2025', amount:18000, unpaidMonths:[], monthStatus:grid(), monthlyFee:1500 },
      { class:'UKG', year:'2025-2026', amount:20400, unpaidMonths:[], monthStatus:grid(), monthlyFee:1700 },
    ], 'Grade 1');
    const sTwo  = Object.assign({ class:'Grade 1', academicYear:'2026-27' }, two);
    const yrsTwo = _flStudentAcademicYears(sTwo, []).map(_normaliseAcademicYear);

    // One prior year: scalars only, and NO openingOutstandingDues key at all.
    const one = _fsPrevYearFields([
      { class:'UKG', year:'2025-2026', amount:20400, unpaidMonths:[], monthStatus:grid(), monthlyFee:1700 },
    ], 'Grade 1');

    // The re-import case. The student already holds 2023-24 in Firestore; this form
    // run mentions only 2025-26 (scalars) and 2024-25 (array). 2023-24 must survive,
    // and the scalar year and the current year must NOT appear in the array.
    const merged = _flMergeOpeningDues(
      [{ year:'2023-24', class:'Nursery', monthlyFee:1400, monthStatus:grid() }],
      two.openingOutstandingDues,
      [two.previousAcademicYear, '2026-27']);
    const mYears = merged.map(e => _normaliseAcademicYear(e.year)).sort();

    // Cross-format: '2024-2025' from this form and '2024-25' from bulk-admit are the
    // same year and must collapse to one entry, not sit side by side as F13.
    const crossFmt = _flMergeOpeningDues(
      [{ year:'2024-25',   class:'LKG', monthStatus:grid() }],
      [{ year:'2024-2025', class:'LKG', monthStatus:grid(), monthlyFee:1500 }], []);

    return { pass:
         _normaliseAcademicYear(two.previousAcademicYear) === '2025-26'
      && Array.isArray(two.openingOutstandingDues) && two.openingOutstandingDues.length === 1
      && _normaliseAcademicYear(two.openingOutstandingDues[0].year) === '2024-25'
      && yrsTwo.indexOf('2025-26') > -1 && yrsTwo.indexOf('2024-25') > -1
      // single prior year: the key is ABSENT, not an empty array that would wipe
      && one.openingOutstandingDues === undefined
      && _normaliseAcademicYear(one.previousAcademicYear) === '2025-26'
      // the merge kept the stored year this form run said nothing about
      && mYears.length === 2 && mYears[0] === '2023-24' && mYears[1] === '2024-25'
      // and cross-format duplicates collapse to one, keeping the incoming entry
      && crossFmt.length === 1 && crossFmt[0].monthlyFee === 1500,
      detail: { twoScalar: two.previousAcademicYear,
                twoArchived: (two.openingOutstandingDues||[]).map(e => e.year),
                oneArchivedKeyPresent: one.openingOutstandingDues !== undefined,
                mergedYears: mYears, crossFormatCount: crossFmt.length } };
  });

  // 80) A MONTH PAID BEFORE ENROLMENT IS PAID. THE ENGINE HAS TO KNOW THAT.
  //     Reported from the live app. ADM-2026-152, admitted 19 Aug 2026, so June
  //     and July precede admission and were recorded as paid at entry. The month
  //     grid showed all twelve months settled — nine PAID, Mar/Apr/May EXCUSED —
  //     directly above an Outstanding card reading 3,600, which is exactly those
  //     two months at 1,800.
  //
  //     currentYearPaidMonths was honoured by the profile grid, the Fee Card,
  //     Record Payment's pills and _flClosedMonthsForAY — which this file
  //     describes as the SHARED definition of a settled month, naming
  //     paid-at-enrolment as its third source. The engine that decides what is
  //     OWED was the one reader that ignored it.
  T('months_paid_at_enrolment_are_not_billed_again', () => {
    const cy = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const grid = {};
    // Aug..Feb paid, Mar/Apr/May excused, Jun+Jul absent from the grid entirely —
    // they were never billed through this system.
    ['Aug','Sep','Oct','Nov','Dec','Jan','Feb'].forEach(m => grid[m] = 'N/A-PAID');
    ['Mar','Apr','May'].forEach(m => grid[m] = 'EXCUSED');

    const base = { class:'Grade 6', monthlyFee:1800, academicYear:cy, status:'active',
                   monthStatus: grid };

    // Without the paid-at-entry record: June and July are genuinely owed.
    const owed = _flStudentYearOutstanding(base, [], cy, { currentYear: cy });

    // With it: the year is closed.
    const settled = _flStudentYearOutstanding(
      { ...base, currentYearPaidMonths:['June','July'], currentYearDueYear: cy },
      [], cy, { currentYear: cy });

    // The guard must scope it to the year it was recorded for — a paid-at-entry
    // month tagged to a DIFFERENT year must not silently close this one.
    const otherYear = _flStudentYearOutstanding(
      { ...base, currentYearPaidMonths:['June','July'], currentYearDueYear:'2024-25' },
      [], cy, { currentYear: cy });

    // And with no grid at all, the full-year branch must credit them too rather
    // than billing twelve months against a ledger they were never in.
    const noGrid = _flStudentYearOutstanding(
      { class:'Grade 6', monthlyFee:1800, academicYear:cy, status:'active',
        currentYearPaidMonths:['June','July'], currentYearDueYear: cy },
      [], cy, { currentYear: cy });

    return { pass: owed.outstanding === 3600          // the reported figure
                 && settled.outstanding === 0          // what it should have been
                 && settled.paid.has('June') && settled.paid.has('July')
                 && otherYear.outstanding === 3600     // guard holds
                 && noGrid.outstanding === 10 * 1800,  // 12 months less the two
             detail: { reported: owed.outstanding, withEntryRecord: settled.outstanding,
                       wrongYearIgnored: otherYear.outstanding, noGrid: noGrid.outstanding } };
  });

  // 81) DELETING A TOP-UP REOPENS THE MONTH FOR ITS REMAINDER, NOT FOR ITS RATE.
  //     Reported live on ADM-2026-152. Dec/Jan/Feb sit on a 1,300 concession
  //     (3 x 1,300 = 3,900), settled by a 3,800 receipt plus a 100 top-up on
  //     February. Deleting the 100 must leave February owing exactly 100.
  //
  //     Asserted for BOTH receipt shapes, because the 3,800 may or may not carry
  //     monthAllocations and a legacy multi-month receipt is credited by a
  //     different path. And asserted with the concession ACTIVE — activeMonths
  //     are 'YYYY-MM' keys, so a test that passes month names silently prices
  //     every month at the standard rate and proves nothing.
  T('deleting_a_topup_reopens_only_the_remainder', () => {
    const cy = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const yStart = parseInt(cy.slice(0, 4), 10);
    const _saveConc = _FL_CONC_BY_ADM, _saveOk = _FL_CONC_OK, _saveAt = _FL_CONC_LOADED_AT;
    try {
      _FL_CONC_BY_ADM = { 'ADM-TEST-152': { admissionNo:'ADM-TEST-152', concessionFee:1300,
        activeMonths:[ yStart + '-12', (yStart+1) + '-01', (yStart+1) + '-02' ],
        monthlyBreakdown:{} } };
      _FL_CONC_OK = true; _FL_CONC_LOADED_AT = Date.now();

      const grid = {};
      ['Aug','Sep','Oct','Nov','Dec','Jan','Feb'].forEach(m => grid[m] = 'N/A-PAID');
      ['Mar','Apr','May'].forEach(m => grid[m] = 'EXCUSED');
      const s = { admissionNumber:'ADM-TEST-152', class:'Grade 6', monthlyFee:1800,
                  academicYear:cy, status:'active', monthStatus:grid,
                  currentYearPaidMonths:['June','July'], currentYearDueYear:cy };

      const big = alloc => ({ academicYear:cy, amountPaid:3800, date:{seconds:100},
        monthsSelected:['December','January','February'],
        ...(alloc ? { monthAllocations:{ December:1300, January:1300, February:1200 } } : {}) });
      const top = { academicYear:cy, amountPaid:100, date:{seconds:200},
        monthsSelected:['February'], monthAllocations:{ February:100 } };

      const run = (txs, revert) =>
        _flStudentYearOutstanding(s, txs, cy, { currentYear:cy, revertMonths:revert || null });

      const beforeA = run([big(true),  top]);
      const afterA  = run([big(true)],  ['February']);
      const beforeB = run([big(false), top]);
      const afterB  = run([big(false)], ['February']);

      // The remainder the month grid prints comes from the same two values.
      const leftA = (afterA.rateForMonth('February') || 0) - (afterA.partialPaid.February || 0);

      return { pass: afterA.rateForMonth('February') === 1300   // concession really active
                   && beforeA.outstanding === 0 && beforeB.outstanding === 0
                   && afterA.outstanding === 100                // not 1,300, not 3,800
                   && afterB.outstanding === 100                // legacy receipt agrees
                   && leftA === 100,
               detail: { febRate: afterA.rateForMonth('February'),
                         beforeWithAlloc: beforeA.outstanding, afterWithAlloc: afterA.outstanding,
                         beforeLegacy: beforeB.outstanding, afterLegacy: afterB.outstanding,
                         remainderShown: leftA } };
    } finally {
      _FL_CONC_BY_ADM = _saveConc; _FL_CONC_OK = _saveOk; _FL_CONC_LOADED_AT = _saveAt;
    }
  });

  // 82) A TRANSACTION BELONGS TO THE YEAR IT IS TAGGED WITH. UNTAGGED BELONGS NOWHERE.
  //     Six readers answered this two different ways, so an untagged payment read
  //     as collected on the Profile Card while the engine went on billing the
  //     month it had paid for. _flTxBelongsToYear is now the one answer.
  //
  //     STRICT is the answer, and this test exists partly to stop it being made
  //     lenient again. Leniency was tried on the Accumulated Rolling Dues card
  //     and removed with the reason recorded in place: an untagged payment
  //     "inflated what looked paid here but not on Due Fee". It is also moot
  //     going forward — the published rules require academicYear on every
  //     feeTransactions create, so only legacy documents can lack one, and
  //     sweeping those onto whichever year happens to be current when a screen
  //     is opened is not a fix.
  T('a_transaction_belongs_only_to_the_year_it_is_tagged_with', () => {
    const cy = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const prev = (parseInt(cy.slice(0,4),10) - 1) + '-' + cy.slice(0,4).slice(2);

    const untagged = { amountPaid: 1800, monthsSelected:['August'] };          // no academicYear
    const tagged   = { academicYear: prev, amountPaid: 1800, monthsSelected:['August'] };
    const longForm = { academicYear: cy.slice(0,4) + '-' + (parseInt(cy.slice(0,4),10)+1),
                       amountPaid: 1800, monthsSelected:['August'] };          // 'YYYY-YYYY'

    return { pass: _flTxBelongsToYear(untagged, cy)   === false  // belongs NOWHERE
                 && _flTxBelongsToYear(untagged, prev) === false
                 && _flTxBelongsToYear(tagged,   prev) === true   // tagged lands on its year
                 && _flTxBelongsToYear(tagged,   cy)   === false  // and only there
                 && _flTxBelongsToYear(longForm, cy)   === true   // 'YYYY-YYYY' normalises
                 && _flTxBelongsToYear({ academicYear:'' }, cy) === false,
             detail: { currentYear: cy, priorYear: prev,
                       untaggedInCurrent: _flTxBelongsToYear(untagged, cy),
                       untaggedInPrior:   _flTxBelongsToYear(untagged, prev),
                       longFormMatches:   _flTxBelongsToYear(longForm, cy) } };
  });

  // 83) THE PRIOR/CURRENT SPLIT IS ITS OWN FACT, AND THE TOTAL DOES NOT PROVE IT.
  //     previewSyncCrossCheck verifies outstandingBalance against the engine
  //     summed over every year. previousDues — the prior-years-only slice that
  //     _flCurrentYearOutstanding subtracts to get "this year alone" — is
  //     verified by nothing, and a wrong split leaves the verified total intact.
  //
  //     _flPriorYearBreakdown is the pure half of previewPriorYearCrossCheck.
  //     Pinned here because a diagnostic that miscounts is worse than none: it
  //     is trusted.
  T('prior_year_breakdown_excludes_the_current_year_and_finds_every_other', () => {
    const cy   = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const y1   = parseInt(cy.slice(0, 4), 10);
    const prev = (y1 - 1) + '-' + String(y1).slice(2);
    const older= (y1 - 2) + '-' + String(y1 - 1).slice(2);

    const allDueGrid = allDue();               // 12 DUE months
    const s = {
      class:'Grade 6', monthlyFee:1800, academicYear: cy, status:'active',
      monthStatus: allDue(),                   // current year, must be EXCLUDED
      previousAcademicYear: prev, classPrev:'Grade 5',
      previousYearMonthStatus: allDueGrid,
      openingOutstandingDues: [{ year: older, class:'Grade 4', monthlyFee: 1500,
                                 monthStatus: allDueGrid }]
    };

    const out = _flPriorYearBreakdown(s, [], cy);
    const seen = out.years.map(y => y.year);

    // A student with nothing prior must produce nothing — not a zero row.
    const bare = _flPriorYearBreakdown(
      { class:'Grade 6', monthlyFee:1800, academicYear: cy, monthStatus: allDue() }, [], cy);

    return { pass: seen.indexOf(cy) === -1              // current year excluded
                 && seen.indexOf(prev) > -1             // scalar prior year found
                 && seen.indexOf(older) > -1            // archived year found
                 && seen.length === 2
                 // Each priced at ITS OWN year, not at this year's Grade 6 rate:
                 //   older — carries a stored monthlyFee (1,500), so that is used
                 //   prev  — carries none, so it resolves from classPrev (Grade 5,
                 //           1,700 on the live schedule). NOT 1,800.
                 && out.years.find(y => y.year === older).outstanding === 12 * 1500
                 && out.years.find(y => y.year === prev).outstanding  === 12 * _flRateForClass('Grade 5', 0)
                 && out.years.find(y => y.year === prev).outstanding  !== 12 * 1800
                 && out.enginePrior === (12 * 1500) + (12 * _flRateForClass('Grade 5', 0))
                 && bare.years.length === 0 && bare.enginePrior === 0,
             detail: { years: seen, enginePrior: out.enginePrior,
                       perYear: out.years.map(y => y.year + '=' + y.outstanding),
                       bareYears: bare.years.length } };
  });

  // 84) A MISSING academicYear IS HEALED, BUT ONLY WHEN NOTHING CAN BE MIS-FILED.
  //     The write-back refuses the current year unless it matches the doc's own
  //     year, and an absent academicYear resolves to '', so the guard fires every
  //     time and monthStatus is never written. The reconcile now fills it in.
  //
  //     The condition is the whole test. Healing a student who ALREADY has a grid
  //     would re-file real months under a year they were not billed in, which is
  //     worse than the empty field it fixes. So: heal when the year is absent and
  //     there is no grid; leave it alone in every other case.
  T('missing_academic_year_healed_only_when_no_grid_can_be_misfiled', () => {
    const cy = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const grid = allDue();
    // Mirror of the shipped condition (pending-fee.js, _syncStudentFinancials).
    const wouldHeal = s => {
      const docYr   = _normaliseAcademicYear(s.academicYear || '');
      const hasGrid = !!(s.monthStatus && Object.keys(s.monthStatus).length);
      return !docYr && !hasGrid;
    };

    const bare      = { admissionNumber:'A1' };                                  // heal
    const emptyYear = { admissionNumber:'A2', academicYear:'' };                 // heal
    const noGridPrv = { admissionNumber:'A3', previousAcademicYear:'2024-25',
                        previousYearMonthStatus: grid };                          // heal — prior
                                                                                  // grid is not
                                                                                  // monthStatus
    const hasGrid   = { admissionNumber:'A4', monthStatus: grid };                // DO NOT heal
    const hasYear   = { admissionNumber:'A5', academicYear: cy };                 // nothing to do
    const both      = { admissionNumber:'A6', academicYear: cy, monthStatus: grid };

    return { pass: wouldHeal(bare)      === true
                 && wouldHeal(emptyYear)=== true
                 && wouldHeal(noGridPrv)=== true
                 && wouldHeal(hasGrid)  === false   // the one that must never fire
                 && wouldHeal(hasYear)  === false
                 && wouldHeal(both)     === false,
             detail: { bare: wouldHeal(bare), emptyYear: wouldHeal(emptyYear),
                       priorGridOnly: wouldHeal(noGridPrv), hasOwnGrid: wouldHeal(hasGrid),
                       alreadyTagged: wouldHeal(hasYear) } };
  });

  // 85) THE EXTRACTION CHANGED NO FIGURE — CHARACTERISATION, NOT ASPIRATION.
  //     _flProfilePriorYearRow was lifted verbatim out of the profile card's
  //     template literal. A refactor whose whole claim is "nothing moved" has to
  //     prove it, so the ORIGINAL inline logic is reproduced here and both are run
  //     over the shapes that actually broke. Any divergence fails.
  //
  //     This copy is deliberate duplication with a job: it is the before-picture.
  //     It can be deleted once this has shipped and stayed green for a release.
  T('profile_prior_year_extraction_reproduces_the_inline_logic', () => {
    const F2S = { June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',
                  November:'Nov',December:'Dec',January:'Jan',February:'Feb',
                  March:'Mar',April:'Apr',May:'May' };
    const MONTHS_SHORT = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];

    // The code as it stood in students.js before the extraction.
    const inlineOriginal = (info, monthlyFee, engineOwns, outstandingIn) => {
      let outstanding = outstandingIn;
      const prevStatus = { ...(info._monthStatus || {}) };
      info.txList.forEach(t => {
        const isW = t.type === 'excused_waiver';
        const ms  = isW ? (t.monthsExcused && t.monthsExcused.length ? t.monthsExcused : (t.monthsSelected || []))
                        : (t.monthsSelected || []);
        ms.forEach(m => {
          const k = F2S[m] || m;
          if (isW) { const c = (prevStatus[k]||'').toUpperCase();
                     if (c !== 'N/A-PAID' && c !== 'PAID') prevStatus[k] = 'EXCUSED'; }
          else prevStatus[k] = 'N/A-PAID';
        });
      });
      const prevFee = info._monthlyFeeForYear || monthlyFee;
      const hasGrid = Object.keys(prevStatus).length > 0;
      const mCleared = hasGrid
        ? MONTHS_SHORT.filter(m => { const r = (prevStatus[m]||'').toUpperCase();
            return r === 'N/A-PAID' || r === 'PAID' || r === 'EXCUSED'; }).length
        : (info._monthsCleared != null ? info._monthsCleared : 0);
      const mDue = hasGrid ? (12 - mCleared)
                           : (info._monthsDue != null ? info._monthsDue : 0);
      if (hasGrid && mDue === 0 && !engineOwns) outstanding = 0;
      return { prevStatus, prevFee, hasGrid, mCleared, mDue, outstanding };
    };

    const paidGrid = {}; MONTHS_SHORT.forEach(m => paidGrid[m] = 'N/A-PAID');
    const someDue  = Object.assign({}, paidGrid, { Mar:'DUE', Apr:'DUE', May:'DUE' });

    // Every shape that mattered, including the three that were live defects.
    const cases = [
      ['no grid, stale counters',
       { _monthStatus:{}, txList:[], _monthsCleared:4, _monthsDue:8 }, 1700, false, 13600],
      ['waiver settles the last three (the EXC-MSYSQNNW shape)',
       { _monthStatus:someDue, _monthlyFeeForYear:1700,
         txList:[{ type:'excused_waiver', monthsExcused:['March','April','May'] }] }, 1800, false, 5100],
      ['payment outranks a waiver on the same month',
       { _monthStatus:{ Jun:'DUE' }, _monthlyFeeForYear:1700,
         txList:[{ monthsSelected:['June'] },
                 { type:'excused_waiver', monthsExcused:['June'] }] }, 1800, false, 1700],
      ['full grid, engine does NOT own it — override fires',
       { _monthStatus:paidGrid, _monthlyFeeForYear:1500, txList:[] }, 1800, false, 4200],
      ['full grid, engine DOES own it — override must NOT fire',
       { _monthStatus:paidGrid, _monthlyFeeForYear:1500, txList:[] }, 1800, true, 4200],
      ['waiver falling back to monthsSelected',
       { _monthStatus:{ Feb:'DUE' }, txList:[{ type:'excused_waiver', monthsSelected:['February'] }] },
       1700, false, 1700],
    ];

    const diffs = [];
    cases.forEach(([label, info, fee, owns, outIn]) => {
      const a = inlineOriginal(info, fee, owns, outIn);
      const b = _flProfilePriorYearRow(info, { monthlyFee:fee, engineOwnsYear:owns, outstandingIn:outIn });
      if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ label, was:a, now:b });
    });

    // And the behaviours those cases exist to protect, asserted outright.
    const waived  = _flProfilePriorYearRow(cases[1][1], { monthlyFee:1800, engineOwnsYear:false, outstandingIn:5100 });
    const ranked  = _flProfilePriorYearRow(cases[2][1], { monthlyFee:1800, engineOwnsYear:false, outstandingIn:1700 });
    const ownedYr = _flProfilePriorYearRow(cases[4][1], { monthlyFee:1800, engineOwnsYear:true,  outstandingIn:4200 });
    const freeYr  = _flProfilePriorYearRow(cases[3][1], { monthlyFee:1800, engineOwnsYear:false, outstandingIn:4200 });

    return { pass: diffs.length === 0
                 && waived.mCleared === 12 && waived.mDue === 0     // EXCUSED counts as cleared
                 && ranked.prevStatus.Jun === 'N/A-PAID'            // payment beats waiver
                 && ownedYr.outstanding === 4200                    // engine not overruled
                 && freeYr.outstanding === 0,                       // stale balance overruled
             detail: { casesCompared: cases.length, divergences: diffs,
                       waivedCleared: waived.mCleared, rankedJun: ranked.prevStatus.Jun,
                       engineOwned: ownedYr.outstanding, engineFree: freeYr.outstanding } };
  });

  // 86) A PRIOR-YEAR RECEIPT MUST NOT PAINT MONTHS ONTO THIS YEAR'S CARD.
  //     The Fee Card and its PDF export both built their month grid from EVERY
  //     transaction the student had, with no year filter, onto a card headed with
  //     one academic year.
  //
  //     Live: ADM-2026-152 holds PDR-MSZQO4NL, a past-due receipt for December,
  //     January, February and March of 2025-26. It marked December and January
  //     PAID on the 2026-27 card, and touching February a second time flipped it
  //     to PARTIAL. The card read 8 PAID / 1 PARTIAL / 0 DUE — a settled year,
  //     while Record Payment correctly quoted 1,300 owing on each of December and
  //     January. Zero DUE against 3,800 outstanding, and it exports to PDF.
  T('a_prior_year_receipt_does_not_paint_this_years_fee_card', () => {
    const cy   = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const y1   = parseInt(cy.slice(0, 4), 10);
    const prev = (y1 - 1) + '-' + String(y1).slice(2);

    const thisYearTopUp = { academicYear: cy,   monthsSelected:['February'], amountPaid:100 };
    const priorPastDue  = { academicYear: prev, monthsSelected:['December','January','February','March'],
                            amountPaid:6800 };
    const thisYearWaive = { academicYear: cy,   type:'excused_waiver',
                            monthsExcused:['March','April','May'], amountWaived:5400 };
    const untagged      = { monthsSelected:['June'], amountPaid:1800 };   // no year at all

    const all = [thisYearTopUp, priorPastDue, thisYearWaive, untagged];

    // What the card now feeds its month map.
    const kept    = all.filter(t => _flTxBelongsToYear(t, cy));
    const dropped = all.filter(t => !_flTxBelongsToYear(t, cy));

    // The months the prior-year receipt would have painted, and must no longer.
    const bledThrough = ['December','January'].filter(m =>
      kept.some(t => (t.monthsSelected || []).includes(m)));

    return { pass: kept.length === 2                       // top-up + waiver only
                 && kept.indexOf(thisYearTopUp) > -1
                 && kept.indexOf(thisYearWaive) > -1
                 && dropped.indexOf(priorPastDue) > -1     // the receipt that bled
                 && dropped.indexOf(untagged) > -1         // untagged belongs nowhere
                 && bledThrough.length === 0,              // Dec/Jan no longer painted
             detail: { keptCount: kept.length,
                       priorReceiptDropped: dropped.indexOf(priorPastDue) > -1,
                       untaggedDropped: dropped.indexOf(untagged) > -1,
                       monthsStillBleeding: bledThrough } };
  });

  // 87) STEP 2 — THE GOLDEN STUDENT. One fixture carrying every shape that broke.
  //
  //     Modelled on the live record that surfaced most of this week's defects:
  //     admitted mid-year so June and July were settled before the system knew
  //     them; a 1,300 concession on Dec/Jan/Feb keyed 'YYYY-MM'; a waiver over
  //     Mar/Apr/May; a partial February with only 100 applied after its top-up
  //     receipt was deleted; a PRIOR-YEAR past-due receipt naming Dec/Jan/Feb/Mar
  //     that must not touch this year at all; and terminated status.
  //
  //     Every defect fixed this week fails this test if reintroduced:
  //       · paid-at-enrolment ignored          -> June/July read DUE
  //       · prior-year receipt bleeding        -> December reads PAID
  //       · frozen monthShortage               -> February's remainder wrong
  //       · engine blind to currentYearPaidMonths -> outstanding 3,600 too high
  //       · concession month-keys mismatched   -> February billed at 1,800
  T('golden_student_every_shape_that_broke_this_week', () => {
    const cy = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    const y1 = parseInt(cy.slice(0, 4), 10);
    const prev = (y1 - 1) + '-' + String(y1).slice(2);
    const _sc = _FL_CONC_BY_ADM, _so = _FL_CONC_OK, _sa = _FL_CONC_LOADED_AT;
    try {
      _FL_CONC_BY_ADM = { 'ADM-GOLD-1': { admissionNo:'ADM-GOLD-1', concessionFee:1300,
        activeMonths:[ y1 + '-12', (y1+1) + '-01', (y1+1) + '-02' ], monthlyBreakdown:{} } };
      _FL_CONC_OK = true; _FL_CONC_LOADED_AT = Date.now();

      const grid = {};
      ['Aug','Sep','Oct','Nov'].forEach(m => grid[m] = 'N/A-PAID');
      ['Mar','Apr','May'].forEach(m => grid[m] = 'EXCUSED');

      const s = {
        admissionNumber:'ADM-GOLD-1', class:'Grade 6', monthlyFee:1800,
        academicYear: cy, status:'terminated', monthStatus: grid,
        currentYearPaidMonths:['June','July'], currentYearDueYear: cy,
      };

      const thisYear = [
        { academicYear:cy, amountPaid:1800, monthsSelected:['August'], date:{seconds:10} },
        { academicYear:cy, amountPaid:5400, monthsSelected:['September','October','November'], date:{seconds:20} },
        { academicYear:cy, amountPaid:100,  monthsSelected:['February'],
          monthAllocations:{ February:100 }, date:{seconds:30} },
        { academicYear:cy, type:'excused_waiver', amountWaived:5400,
          monthsExcused:['March','April','May'], date:{seconds:40} },
      ];
      // The receipt that bled onto this year's Fee Card.
      const priorReceipt = { academicYear:prev, amountPaid:6800,
        monthsSelected:['December','January','February','March'], date:{seconds:5} };
      const allTx = thisYear.concat([priorReceipt]);

      const yearTx = allTx.filter(t => _flTxBelongsToYear(t, cy));
      const eng    = _flStudentYearOutstanding(s, yearTx, cy, { currentYear: cy });
      const row    = _flProfileCurrentYearRow(s, { txList: yearTx },
                       { curAcadYear: cy, monthStatusIsThisYear: true, engineInfo: eng });
      const st     = row.statusByMonth;

      // Dec 1,300 + Jan 1,300 + Feb (1,300-100) = 3,800.
      const expected = 1300 + 1300 + (1300 - 100);

      return { pass: yearTx.length === 4                       // prior receipt excluded
                   && st.Jun === 'paid' && st.Jul === 'paid'    // settled at enrolment
                   && st.Aug === 'paid' && st.Nov === 'paid'
                   && st.Dec === 'due'  && st.Jan === 'due'     // NOT painted by the prior receipt
                   && st.Mar === 'excused' && st.May === 'excused'   // stored EXCUSED honoured
                   && st.Feb === 'partial'                            // engine wins over the receipt
                   && eng.rateForMonth('February') === 1300     // concession keys line up
                   && eng.rateForMonth('August')   === 1800     // and only where they apply
                   && row.shortByMonth.February === 1200        // derived, not frozen
                   && eng.outstanding === expected,             // 3,800
               detail: { txKept: yearTx.length, outstanding: eng.outstanding, expected,
                         jun: st.Jun, dec: st.Dec, jan: st.Jan, feb: st.Feb, mar: st.Mar,
                         febRate: eng.rateForMonth('February'),
                         febLeft: row.shortByMonth.February } };
    } finally {
      _FL_CONC_BY_ADM = _sc; _FL_CONC_OK = _so; _FL_CONC_LOADED_AT = _sa;
    }
  });

  // 88) STEP 3 — THE RATCHET. A render path may not grow a new stored-money read.
  //
  //     Every defect this week was one shape: a screen deriving a money figure
  //     from a stored field instead of asking the engine. Steps 1 and 2 fixed the
  //     ones that existed and made them testable. Neither stops the next one, and
  //     the next one will pass review by being correct on the day it is written.
  //
  //     So: each render path has a registered BUDGET of how many stored-field
  //     reads it currently contains. Grow one and this fails. The budget is not a
  //     blessing — several of these are the very reads that were wrong. It is a
  //     ceiling that only moves down.
  //
  //     Reads the loaded functions through Function.prototype.toString(), which
  //     behaves the same in the browser and the CLI runner and needs no file
  //     access. There is no build step, so what is loaded is the source.
  T('no_render_path_grows_a_new_stored_money_read', () => {
    const FIELDS = ['remainingBalance','previousDues','monthShortage','outstandingBalance','totalDue'];

    // Measured 2026-08-28. Lower these whenever a read is removed; never raise one
    // without a comment saying why the engine could not answer instead.
    const BUDGET = {
      renderStudentProfile: { remainingBalance:6, previousDues:10, outstandingBalance:7 },
      renderFeeCard:        { monthShortage:4 },
      renderPendingFee:     { remainingBalance:1, previousDues:12, outstandingBalance:10 },
      renderTerminated:     { outstandingBalance:1, totalDue:1 },
      renderHidden:         { outstandingBalance:1, totalDue:1 },
      renderPrincipalDash:  { remainingBalance:2, outstandingBalance:4 },
      // Deliberately at zero: these render money and currently ask for it properly.
      // A non-zero count here is a new independent derivation and fails outright.
      //
      // selectFeeStudent joined this group when ARC-016's prevBalance fetch was
      // removed: it read the newest transaction's frozen remainingBalance twice (the
      // query and its fallback) for a value nothing consumed. The balance shown in
      // Record Payment is calcLockedFee()'s, computed from the grid and the operative
      // rate. A read reappearing here means that frozen-snapshot path came back.
      selectFeeStudent:     {},
      renderFinance:        {},
      renderAdminDash:      {},
      renderLegacy:         {},
      exportFeeCardPDF:     {},
      calcLockedFee:        {},
    };

    const grew = [], shrank = [], missing = [];
    Object.keys(BUDGET).forEach(name => {
      const fn = (typeof window !== 'undefined' ? window[name] : null) ||
                 (typeof globalThis !== 'undefined' ? globalThis[name] : null);
      if (typeof fn !== 'function') { missing.push(name); return; }
      const src = fn.toString();
      FIELDS.forEach(f => {
        const n       = (src.match(new RegExp('\\.' + f + '\\b', 'g')) || []).length;
        const allowed = BUDGET[name][f] || 0;
        if (n > allowed) grew.push(`${name}.${f}: ${allowed} -> ${n}`);
        else if (n < allowed) shrank.push(`${name}.${f}: ${allowed} -> ${n}`);
      });
    });

    if (grew.length) {
      console.error('%c[RATCHET] A render path grew a stored-money read: ' + grew.join('  ·  ') +
        '\nEvery wrong figure this week came from a screen deriving money from a stored ' +
        'field instead of asking the engine. If _flStudentYearOutstanding genuinely cannot ' +
        'answer this, raise the budget WITH a comment saying why.', 'color:#c22;font-weight:bold');
    }
    if (shrank.length) {
      console.warn('[RATCHET] Reads were removed — tighten the budget so it stays a ceiling: ' +
        shrank.join('  ·  '));
    }
    if (missing.length) {
      console.warn('[RATCHET] Not loaded, so not checked: ' + missing.join(', '));
    }

    // `missing` is not a failure: the CLI runner loads every script, but a partial
    // load (or a renamed function) should say so rather than silently pass.
    return { pass: grew.length === 0 && shrank.length === 0,
             detail: { grew, shrank, notLoaded: missing,
                       registered: Object.keys(BUDGET).length } };
  });

  // 89) STEP 4 — "checked recently" must never be shown when it was not.
  //     The dashboard line is the whole reason the checks get run, so an
  //     indicator that reads reassuringly on a browser that has never run them is
  //     worse than having no indicator: it retires the habit it exists to create.
  //     Never-run and unreadable storage both have to land on the stale side.
  T('health_check_staleness_never_reads_reassuringly_by_default', () => {
    const DAY = 86400000;
    // Mirror of the shipped classification (dashboard.js, psc_healthLine).
    // `outcome` is the verdict of the last run: true / false / null = unknown.
    const classify = (last, outcome) => {
      const days  = last == null ? null : Math.floor((Date.now() - last) / DAY);
      const stale = days == null || days >= 30;
      const when  = last == null ? 'never run on this browser'
                  : days === 0  ? 'run today'
                  : days === 1  ? 'run yesterday'
                                : `run ${days} days ago`;
      // The three states the line renders. "healthy" is the ONLY one that may
      // read calmly, and it requires an explicit passing verdict — age alone
      // can never earn it, which is the defect this pins shut.
      const state = outcome === false ? 'failed'
                  : outcome === true  ? (stale ? 'aged' : 'healthy')
                                      : 'unknown';
      return { days, stale, when, state };
    };

    const never   = classify(null, null);
    const today   = classify(Date.now(), true);
    const yest    = classify(Date.now() - DAY, true);
    const day29   = classify(Date.now() - 29 * DAY, true);
    const day30   = classify(Date.now() - 30 * DAY, true);
    const ancient = classify(Date.now() - 400 * DAY, true);

    // ── The regression this test exists to prevent ──────────────────────────
    // A run that FAILED an hour ago must not render like a clean one, and must
    // not age into anything softer. A record with no verdict — every record
    // written before the outcome was stored — is UNKNOWN, never healthy.
    const failedToday  = classify(Date.now(), false);
    const failedOld    = classify(Date.now() - 400 * DAY, false);
    const legacyRecord = classify(Date.now(), null);   // { at } with no ok
    const outcomeRules =
         failedToday.state  === 'failed'      // fresh failure stays a failure
      && failedOld.state    === 'failed'      // and does not age out of it
      && legacyRecord.state === 'unknown'     // missing verdict != passing
      && never.state        === 'unknown'
      && today.state        === 'healthy'     // only an explicit pass reads calm
      && day30.state        === 'aged';

    // _flHealthLastRun must survive storage being unavailable or holding junk —
    // a throw here would take the dashboard render down with it.
    let robust = true;
    const _ls = (typeof localStorage !== 'undefined') ? localStorage : null;
    if (_ls) {
      const saved = (() => { try { return _ls.getItem(_FL_HEALTH_KEY); } catch (_) { return null; } })();
      try {
        try { _ls.setItem(_FL_HEALTH_KEY, 'not json at all'); } catch (_) {}
        if (_flHealthLastRun() !== null) robust = false;      // garbage -> null, not a throw
        try { _ls.setItem(_FL_HEALTH_KEY, JSON.stringify({ at: 'nonsense' })); } catch (_) {}
        if (_flHealthLastRun() !== null) robust = false;      // non-numeric -> null
      } catch (_) { robust = false; }
      try { if (saved === null) _ls.removeItem(_FL_HEALTH_KEY); else _ls.setItem(_FL_HEALTH_KEY, saved); } catch (_) {}
    }

    return { pass: never.stale === true && never.when === 'never run on this browser'
                 && today.stale === false && today.when === 'run today'
                 && yest.when === 'run yesterday'
                 && day29.stale === false          // 30 days is the cadence…
                 && day30.stale === true           // …and the boundary is inclusive
                 && ancient.stale === true
                 && outcomeRules
                 && robust,
             detail: { never: never.when, today: today.when, yesterday: yest.when,
                       day29Stale: day29.stale, day30Stale: day30.stale,
                       freshFailure: failedToday.state, agedFailure: failedOld.state,
                       legacyRecord: legacyRecord.state, cleanRun: today.state,
                       survivesBadStorage: robust } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE CURRENT-YEAR MONTH COUNTS COME FROM THE PILLS, NOT A SECOND OPINION.
  //
  // The profile card's Months Cleared / Months Due tiles sit directly above the
  // twelve month pills. If the tiles were derived from the engine's dueCount and
  // the pills from statusByMonth, the two could disagree on screen — the exact
  // shape of every defect this suite exists to catch. They are counted from the
  // same resolved map, so this pins the counting rule rather than the wiring:
  // paid and excused are cleared, and a PARTIAL month is DUE, because it still
  // owes its remainder and is still billed for it.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_part_paid_month_counts_as_due_not_cleared_on_the_profile_card', () => {
    // Six paid, one excused, two part-paid, three untouched.
    const statusByMonth = {};
    ACAD_MONTHS_SHORT.forEach((sh, i) => {
      statusByMonth[sh] = i < 6 ? 'paid'
                        : i === 6 ? 'excused'
                        : i < 9 ? 'partial'
                        : 'due';
    });

    const st        = ACAD_MONTHS_SHORT.map(sh => statusByMonth[sh]);
    const paidN     = st.filter(v => v === 'paid').length;
    const excusedN  = st.filter(v => v === 'excused').length;
    const partialN  = st.filter(v => v === 'partial').length;
    const clearedN  = paidN + excusedN;
    const dueN      = st.length - clearedN;

    // A grid with nothing settled must read 0/12 and 12 due — never 0 due, which
    // is how a "cleared" default would render a student who has paid nothing.
    const blank     = ACAD_MONTHS_SHORT.map(() => 'due');
    const blankDue  = blank.length - blank.filter(v => v === 'paid' || v === 'excused').length;

    return { pass: clearedN === 7            // 6 paid + 1 excused
                && dueN === 5                // 2 partial + 3 untouched
                && partialN === 2
                && clearedN + dueN === 12    // every month lands in exactly one bucket
                && blankDue === 12,
             detail: { paidN, excusedN, partialN, clearedN, dueN,
                       partialsCountedAsDue: dueN - 3 === partialN,
                       emptyGridReadsAllDue: blankDue } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A BULK-IMPORT ZERO MEANS ZERO. IT DOES NOT MEAN "WORK IT OUT YOURSELF".
  //
  // Two halves, because either alone would pass while the defect lived:
  //   1. the RULE — blank derives, a finite number wins including 0, anything
  //      else is a row error rather than an invented balance;
  //   2. the SOURCE — parseBulkAdmitFile no longer decides this with `||`,
  //      checked through Function.prototype.toString the way the render-path
  //      ratchet does, so re-introducing the old idiom fails here rather than
  //      three months later on somebody's roll.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_bulk_import_zero_balance_is_not_a_missing_one', () => {
    const DERIVED = 9 * 1800;            // what the month grid would imply
    const errors  = [];
    // Mirror of the shipped resolver in bulk-admit.js parseBulkAdmitFile.
    const sheetMoney = raw => {
      const s = String(raw == null ? '' : raw).trim();
      if (s === '') return { ok: true, value: DERIVED };
      const n = Number(s.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) { errors.push(String(raw)); return { ok: false, value: 0 }; }
      return { ok: true, value: n };
    };

    const blank    = sheetMoney('');       // not stated -> derive
    const undef    = sheetMoney(undefined);
    const zeroStr  = sheetMoney('0');      // THE DEFECT: used to become DERIVED
    const zeroNum  = sheetMoney(0);
    const real     = sheetMoney('12600');
    const comma    = sheetMoney('12,600'); // sheets write it this way
    const junk     = sheetMoney('—');      // used to become DERIVED, silently
    const typo     = sheetMoney('18OO');   // letter O — parseFloat took the 18
    const negative = sheetMoney('-500');

    const rule = blank.value === DERIVED && undef.value === DERIVED
              && zeroStr.ok === true && zeroStr.value === 0      // present zero wins
              && zeroNum.ok === true && zeroNum.value === 0
              && real.value === 12600 && comma.value === 12600
              && junk.ok === false && typo.ok === false          // errors, not guesses
              && negative.ok === false
              && errors.length === 3;

    // The source half. `||` between a parsed sheet cell and a computed fallback
    // is the exact shape that swallowed the zero.
    let sourceClean = true, checked = false;
    const fn = (typeof window !== 'undefined' ? window.parseBulkAdmitFile : null) ||
               (typeof globalThis !== 'undefined' ? globalThis.parseBulkAdmitFile : null);
    if (typeof fn === 'function') {
      checked = true;
      const src = fn.toString();
      if (/parseFloat\(\s*r\.(OutstandingBalance|TotalDue)\s*\|\|\s*0\s*\)\s*\|\|/.test(src)) sourceClean = false;
      if (!/Number\.isFinite/.test(src)) sourceClean = false;
    }

    // `checked` is part of the verdict, not a footnote. If parseBulkAdmitFile is
    // not reachable the source half asserts nothing, and a test that quietly
    // stops testing is worse than one that was never written — it reports green
    // for a defect it is no longer looking at.
    return { pass: rule && sourceClean && checked,
             detail: { derived: DERIVED, blank: blank.value, zeroString: zeroStr.value,
                       zeroNumber: zeroNum.value, comma: comma.value,
                       rejected: errors, sourceChecked: checked, sourceClean } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A FAILED RECONCILE MUST NOT LOOK LIKE A SUCCESSFUL ONE TO ITS CALLER.
  //
  // _syncStudentFinancials catches its own error and does not rethrow. That is
  // deliberate — a bulk reconcile must not abort on one bad student — but it
  // meant the LIVE path returned undefined whether it wrote or not, and
  // saveFeePayment awaited exactly that before announcing success over totals
  // it had just failed to update.
  //
  // Behaviour and source, both pinned. The source half matters more than usual:
  // the behavioural half tests a two-line decision, and deleting the returns it
  // depends on would leave that decision reading undefined forever — silently
  // true again, with the test still green.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_failed_reconcile_is_visible_to_the_caller_that_just_took_money', () => {
    // Mirror of saveFeePayment's decision.
    const failed = res => !!(res && res.ok === false);

    const wrote     = failed({ ok: true, studentId: 's1' });
    const threw     = failed({ ok: false, studentId: 's1', error: 'permission-denied' });
    const legacy    = failed(undefined);          // a caller that returns nothing
    const dryRunBad = failed({ studentId: 's1', error: 'x', changed: false, ok: false });

    const rule = wrote === false && threw === true && dryRunBad === true
              && legacy === false;   // undefined is NOT a failure signal — see below

    // Which is exactly why the source is checked: `legacy === false` is only safe
    // while the live path genuinely returns a verdict. Remove those returns and
    // this assertion stops protecting anything, so assert they are still there.
    let syncOk = true, payOk = true, checked = 0;
    const g = (typeof window !== 'undefined' ? window : globalThis);

    if (typeof g._syncStudentFinancials === 'function') {
      checked++;
      const src = g._syncStudentFinancials.toString();
      if (!/return\s*\{\s*ok:\s*true/.test(src))  syncOk = false;   // success verdict
      if (!/return\s*\{\s*ok:\s*false/.test(src)) syncOk = false;   // failure verdict
    }
    if (typeof g.saveFeePayment === 'function') {
      checked++;
      const src = g.saveFeePayment.toString();
      // The result must be BOUND, not awaited and dropped on the floor.
      if (!/=\s*await\s+_syncStudentFinancials\s*\(/.test(src)) payOk = false;
      if (!/ok\s*===\s*false/.test(src))                        payOk = false;
    }

    return { pass: rule && syncOk && payOk && checked === 2,
             detail: { wroteReadsClean: wrote === false, failureIsVisible: threw,
                       dryRunFailureVisible: dryRunBad,
                       syncReturnsVerdict: syncOk, callerReadsVerdict: payOk,
                       functionsChecked: checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE RECONCILE MUST NOT WRITE A FIGURE COMPUTED BEFORE THE LAST PAYMENT.
  //
  // The marker decides whether the aggregate about to be written is still based
  // on current data. Two ways it can fail, and both are silent:
  //   too LOOSE  — misses a concurrent payment, and the stale write lands. The
  //                original defect, under-stating what a family owes.
  //   too TIGHT  — reports contention when nothing changed, so every reconcile
  //                burns its retries and gives up. Not a wrong number, but the
  //                aggregate silently stops being maintained at all.
  // Firestore hands back a NEW Timestamp instance on every read, so identity
  // comparison would land straight in the second failure.
  // ══════════════════════════════════════════════════════════════════════════
  T('the_reconcile_notices_a_payment_that_landed_while_it_was_computing', () => {
    const TS = ms => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });
    const base = { outstandingBalance: 5400, fee_status: 'pending',
                   lastPaymentDate: TS(1700000000000), lastPaymentAmount: 1800 };
    const m = d => _flConcurrencyMarker(d);

    // Stable across reads: a fresh Timestamp OBJECT for the same instant, and
    // fields the engine never reads, must not read as contention.
    // NOTE: monthStatus used to sit in this list. F10 moved it — it is an engine
    // input, and treating a grid change as "unrelated" was the defect itself.
    const reread = { outstandingBalance: 5400, fee_status: 'pending',
                     lastPaymentDate: TS(1700000000000), lastPaymentAmount: 1800 };
    const unrelated = Object.assign({}, base, { name: 'renamed', section: 'C',
                                                parentName: 'someone', contact: '999' });

    // KEY ORDER MUST NOT MATTER. Firestore does not promise it, and a dot-path
    // update can reorder a map — if order counted, every reconcile after a
    // past-due write would report contention on a document nobody had touched,
    // burn its retries and give up, silently ending aggregate maintenance.
    const gridA = Object.assign({}, base, { monthStatus: { June: 'PAID', July: 'DUE' } });
    const gridB = Object.assign({}, base, { monthStatus: { July: 'DUE', June: 'PAID' } });
    // Same for openingOutstandingDues, where array order carries no meaning.
    const oodA = Object.assign({}, base, { openingOutstandingDues: [
      { year: '2024-25', amount: 100 }, { year: '2025-26', amount: 200 } ] });
    const oodB = Object.assign({}, base, { openingOutstandingDues: [
      { year: '2025-26', amount: 200 }, { year: '2024-25', amount: 100 } ] });

    const stable = m(base) === m(reread)
                && m(base) === m(unrelated)
                && m(gridA) === m(gridB)
                && m(oodA)  === m(oodB);

    // Each field a concurrent writer touches must move the marker.
    const moved =
         m(Object.assign({}, base, { outstandingBalance: 3600 }))  !== m(base)
      && m(Object.assign({}, base, { fee_status: 'paid' }))        !== m(base)
      && m(Object.assign({}, base, { lastPaymentDate: TS(1700000009999) })) !== m(base)
      && m(Object.assign({}, base, { lastPaymentAmount: 100 }))    !== m(base)
      // F10 — the grids past-due writes without touching any scalar above.
      && m(gridA)                                                  !== m(base)
      && m(Object.assign({}, gridA, { monthStatus: { June: 'DUE', July: 'DUE' } })) !== m(gridA)
      && m(Object.assign({}, base, { previousYearMonthStatus: { May: 'PAID' } }))   !== m(base)
      && m(Object.assign({}, base, { prevYearMonthStatus: { May: 'PAID' } }))       !== m(base)
      && m(oodA)                                                   !== m(base)
      // A grid inside an openingOutstandingDues entry counts too — that is the
      // second of past-due's two grid write paths.
      && m(Object.assign({}, oodA, { openingOutstandingDues: [
           { year: '2024-25', amount: 100, monthStatus: { Jun: 'PAID' } },
           { year: '2025-26', amount: 200 } ] }))                  !== m(oodA)
      // The labels that bind a grid to a year: without them the grid is
      // unreachable and the year re-prices entirely.
      && m(Object.assign({}, base, { academicYear: '2026-27' }))         !== m(base)
      && m(Object.assign({}, base, { previousAcademicYear: '2025-26' })) !== m(base)
      && m(Object.assign({}, base, { openingOutstandingYear: '2024-25' })) !== m(base)
      // What a due month costs, and whether this student accrues at all.
      && m(Object.assign({}, base, { class: 'Grade 6' }))          !== m(base)
      && m(Object.assign({}, base, { monthlyFee: 1700 }))          !== m(base)
      && m(Object.assign({}, base, { status: 'terminated' }))      !== m(base)
      // Paid-at-enrolment months have no ledger entry; only this list stops
      // them being billed twice.
      && m(Object.assign({}, base, { currentYearPaidMonths: ['June'] })) !== m(base)
      && m(Object.assign({}, base, { currentYearDueYear: '2026-27' }))   !== m(base);

    // A year written long-form must not read as a change from its short form —
    // the engine normalises both, so the marker must too.
    const yearFormStable =
      m(Object.assign({}, base, { academicYear: '2026-27' })) ===
      m(Object.assign({}, base, { academicYear: '2026-2027' }));

    // A student with no aggregate yet is a legitimate state, not a crash, and
    // must still be comparable to itself.
    const empty = m({}) === m({}) && m(undefined) === m(null) && typeof m({}) === 'string';
    // …and must not collide with a real record.
    const distinct = m({}) !== m(base);

    // Source half: the write is compare-and-set, and the bulk pass opts out.
    let casWired = true, bulkOptsOut = true, checked = 0;
    const g = (typeof window !== 'undefined' ? window : globalThis);
    if (typeof g._syncStudentFinancials === 'function') {
      checked++;
      const src = g._syncStudentFinancials.toString();
      if (!/runTransaction/.test(src))            casWired = false;
      if (!/_flConcurrencyMarker\(cur\.data/.test(src)) casWired = false;
      if (!/CONTENDED/.test(src))                 casWired = false;
      if (!/opts\.skipCas/.test(src))             casWired = false;
    }
    if (typeof g.reconcileAllStudentDues === 'function') {
      checked++;
      if (!/skipCas:\s*true/.test(g.reconcileAllStudentDues.toString())) bulkOptsOut = false;
    }

    return { pass: stable && moved && empty && distinct && yearFormStable
                && casWired && bulkOptsOut && checked === 2,
             detail: { stableAcrossReads: stable, everyEngineInputMoves: moved,
                       yearFormatIrrelevant: yearFormStable,
                       emptyRecordSafe: empty, emptyDistinctFromReal: distinct,
                       compareAndSetWired: casWired, bulkOptsOut, functionsChecked: checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE SCHOOL-HOURS LOCK STAYS DELETED.
  //
  // It survived two separate switch-offs and still had four pieces standing:
  // a gate returning hardcoded true, a config permanently nulled, an
  // unreachable screen, and a session expiry computing a close-of-day instant
  // on the DEVICE's clock while everything else uses nowIST(). None of it could
  // fire, which is exactly why it lasted — dead code that looks live is what
  // someone re-enables later assuming it once worked.
  //
  // An absence test, deliberately. There is no behaviour left to assert, only
  // the end state: no half of this feature comes back without this failing.
  // ══════════════════════════════════════════════════════════════════════════
  T('the_school_hours_lock_does_not_come_back', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);

    const gone = typeof g.isWithinSchoolHours === 'undefined'
              && typeof g.showTimeLockScreen  === 'undefined'
              && typeof g.getTimeLockMessage  === 'undefined'
              && typeof g.currentTimeLock     === 'undefined';

    // The expiry must be a plain duration from now. setHours() reintroduces the
    // device clock; currentTimeLock reintroduces the config it read.
    // toString() returns comments as well as code, and the comment explaining
    // what was removed necessarily NAMES setHours and currentTimeLock. This
    // assertion caught exactly that on its first run — which is the proof it is
    // reading real source. Strip comments so it tests the code, not the prose.
    // Safe here: _touchSessionExpiry contains no string literal holding a slash.
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    let expiryClean = true, checked = false;
    if (typeof g._touchSessionExpiry === 'function') {
      checked = true;
      const src = codeOnly(g._touchSessionExpiry.toString());
      if (/setHours/.test(src))        expiryClean = false;
      if (/currentTimeLock/.test(src)) expiryClean = false;
      if (!/Date\.now\(\)/.test(src))  expiryClean = false;   // still stamps an expiry at all
    }

    return { pass: gone && expiryClean && checked,
             detail: { lockSymbolsRemoved: gone, expiryIsPlainDuration: expiryClean,
                       expiryChecked: checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE STUDENT DOC KEEPS ONE AGGREGATE, NOT TWO.
  //
  // remainingBalance duplicated outstandingBalance on students/{id}, was written
  // by only some of the paths that moved money, and was read by nothing. Both
  // writers are gone and the sync now deletes the stored field.
  //
  // Asserted at the source, because the risk is not that it comes back as a bug
  // — it is that it comes back as a CONVENIENCE. The name reads authoritative,
  // and a second aggregate maintained by half the writers is how the divergence
  // returns. The receipt's own remainingBalance is untouched and must stay.
  // ══════════════════════════════════════════════════════════════════════════
  T('the_student_doc_does_not_grow_a_second_outstanding_field', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    let syncClean = true, checked = 0;
    if (typeof g._syncStudentFinancials === 'function') {
      checked++;
      const src = codeOnly(g._syncStudentFinancials.toString());
      // Enumerate the assignments rather than testing a negative lookahead —
      // `\s*` backtracks to zero-width and makes (?!…) succeed against its own
      // target, which is how the first version of this assertion failed on the
      // very line it was written to allow. The field may appear exactly once,
      // and only as a delete.
      const assigns = src.match(/remainingBalance\s*:[^,\n]*/g) || [];
      syncClean = assigns.length === 1 && /FieldValue\.delete/.test(assigns[0]);
    }

    // The past-due writer must not reintroduce it on the student doc. Its
    // TRANSACTION payload still carries remainingBalance and that is correct, so
    // this checks the _studentUpdatePayload literal specifically.
    let pastDueClean = true;
    if (typeof g._pastDueSaveInner === 'function') {
      checked++;
      const src = codeOnly(g._pastDueSaveInner.toString());
      const m = src.match(/_studentUpdatePayload\s*=\s*\{[\s\S]*?\n\s*\}/);
      if (m && /remainingBalance/.test(m[0])) pastDueClean = false;
    }

    return { pass: syncClean && pastDueClean && checked >= 1,
             detail: { syncDeletesField: syncClean, pastDueDoesNotWriteIt: pastDueClean,
                       functionsChecked: checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE CHECKER AND THE WRITER AGREE ON fee_status BY CONSTRUCTION.
  //
  // _syncStudentFinancials wrote five fields and previewSyncCrossCheck verified
  // one. fee_status was the live gap: filters.js reads it and offers 'partial' as
  // a filter, while bulk-admit, the excused waiver and approvals all write a
  // two-state pending/paid that never emits 'partial'.
  //
  // The fix was extraction, not a second copy of the rule in the checker. This
  // pins the rule itself AND that both sides route through it — a duplicated
  // rule would pass this test on the day it was written and drift afterwards,
  // which is the failure being closed.
  // ══════════════════════════════════════════════════════════════════════════
  T('fee_status_has_one_rule_and_both_sides_use_it', () => {
    const paidSet = ms => ({ paid: new Set(ms) });
    const yr = (partialPaid, paidMonths) => Object.assign({ partialPaid }, paidSet(paidMonths || []));

    const cleared  = _flFeeStatusFor([yr({}, ['June'])], 0);
    const owing    = _flFeeStatusFor([yr({}, [])], 5400);
    const partial  = _flFeeStatusFor([yr({ February: 100 }, [])], 1200);
    // Money on a month that IS paid is not a partial — it reached its rate.
    const notPart  = _flFeeStatusFor([yr({ June: 1800 }, ['June'])], 3600);
    // A partial in ANY year counts, not just the current one.
    const priorYr  = _flFeeStatusFor([yr({}, []), yr({ March: 500 }, [])], 900);
    // Zero applied is not a partial.
    const zeroApp  = _flFeeStatusFor([yr({ May: 0 }, [])], 1800);
    // Cleared wins over everything: nothing owed is 'paid' even with a stray partial.
    const clrPart  = _flFeeStatusFor([yr({ May: 100 }, [])], 0);

    const rule = cleared === 'paid' && owing === 'pending' && partial === 'partial'
              && notPart === 'pending' && priorYr === 'partial'
              && zeroApp === 'pending' && clrPart === 'paid';

    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    let wired = true, checked = 0;
    for (const name of ['_syncStudentFinancials', 'previewSyncCrossCheck']) {
      if (typeof g[name] !== 'function') continue;
      checked++;
      if (!/_flFeeStatusFor\s*\(/.test(codeOnly(g[name].toString()))) wired = false;
    }

    // S3: and no OTHER writer may set it. A two-state writer cannot express
    // 'partial', so any site that writes fee_status without going through
    // _flFeeStatusFor can only ever demote a part-payer — which is precisely
    // what the import, the waiver and the approval path each used to do.
    // saveFeePayment is the one permitted exception: it is three-state, it is
    // atomic with the money, and it names 'partial' itself.
    // Named explicitly, and the COUNT is part of the verdict. The first version of
    // this list had two names wrong, so it checked half of what it claimed and
    // still reported green — the same vacuous-assertion failure the bulk-import
    // and reconcile tests are each guarded against.
    const codeOnly2 = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const FORMER_WRITERS = ['parseBulkAdmitFile', '_deduplicateRowsInSheet',
                            'processBulkAdmit', '_excusedSave', 'deleteTxDirectly',
                            '_pastDueSaveInner'];
    let soleAuthor = true, authorsChecked = 0;
    for (const name of FORMER_WRITERS) {
      if (typeof g[name] !== 'function') continue;
      authorsChecked++;
      if (/fee_status\s*:/.test(codeOnly2(g[name].toString()))) soleAuthor = false;
    }

    return { pass: rule && wired && checked === 2
                && soleAuthor && authorsChecked === FORMER_WRITERS.length,
             detail: { cleared, owing, partial, paidMonthNotPartial: notPart,
                       priorYearPartial: priorYr, zeroApplied: zeroApp,
                       clearedBeatsPartial: clrPart, bothSidesWired: wired, checked,
                       noProvisionalWriters: soleAuthor, authorsChecked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // auditLog IS CALLED AFTER THE MONEY HAS MOVED. IT MUST NOT THROW.
  //
  // Eighteen call sites, nearly all of them immediately after a payment, waiver,
  // termination or concession change. record-payment calls it between the
  // transaction committing and the receipt being shown, so a synchronous throw
  // there would deny a receipt for money already taken. Three call sites had
  // wrapped it defensively and fifteen had not; the guarantee now lives in the
  // function, which is the only place it can be relied on.
  // ══════════════════════════════════════════════════════════════════════════
  T('audit_logging_cannot_break_the_action_it_is_recording', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    let guarded = false, namesAction = false, checked = false;
    if (typeof g.auditLog === 'function') {
      checked = true;
      const src = codeOnly(g.auditLog.toString());
      // A try that opens before the first statement, and a catch — so neither a
      // synchronous throw nor a rejected write escapes to the caller.
      guarded = /try\s*\{/.test(src) && /catch\s*\(/.test(src) && /\.catch\s*\(/.test(src);
      // A failure must name WHICH action went unrecorded; "some write failed" is
      // not actionable for a compliance trail.
      namesAction = /\[AUDIT\]/.test(src) && /action/.test(src);
    }

    // It must actually survive being called in a broken environment rather than
    // merely look guarded. currentUser is undefined in the suite, so this
    // exercises the early return; the try/catch covers the rest.
    let survivesCall = true;
    try { g.auditLog('contract_suite_probe', { note: 'not written — no session' }); }
    catch (_) { survivesCall = false; }

    return { pass: guarded && namesAction && survivesCall && checked,
             detail: { syncAndAsyncGuarded: guarded, failureNamesAction: namesAction,
                       survivesCall, checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REMOVING A CONCESSION RAISES WHAT IS OWED. IT MUST NOT RUN BLIND.
  //
  // removeConcession deletes the discount and then reconciles the student by
  // admission number. With no admission number the delete still happened and
  // the reconcile resolved nobody and returned quietly — the rate went up while
  // every stored figure kept describing the discounted one, under a green toast.
  //
  // The invariant is an ORDER, not the presence of a guard: the refusal has to
  // come before the delete. A guard placed after it would read as a fix and
  // protect nothing, so position is what this asserts.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_concession_is_never_removed_without_a_student_to_reconcile', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    let guardFirst = false, checksReconcile = false, surfacesLookup = false, checked = false;
    if (typeof g.removeConcession === 'function') {
      checked = true;
      const src = codeOnly(g.removeConcession.toString());
      const guardAt  = src.search(/if\s*\(\s*!\s*_admNo\s*\)/);
      const deleteAt = src.search(/\.delete\s*\(/);
      // Both must exist, and the guard must come first.
      guardFirst = guardAt > -1 && deleteAt > -1 && guardAt < deleteAt;
      // The reconcile that raises the dues is the one whose failure matters most.
      checksReconcile = /_reconciled\s*===\s*false/.test(src);
      // The recovery read's failure is reported rather than swallowed.
      surfacesLookup = /console\.error/.test(src);
    }

    return { pass: guardFirst && checksReconcile && surfacesLookup && checked,
             detail: { refusesBeforeDeleting: guardFirst,
                       reportsFailedReconcile: checksReconcile,
                       lookupFailureSurfaced: surfacesLookup, checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE PAYMENT FORM OPENS AFTER THE GUARD, NOT BEFORE IT.
  //
  // selectFeeStudent unlocked the workflow the instant a student was clicked,
  // then read their document, then re-locked if the payment guard refused. For
  // one Firestore round trip a terminated student's form was open and fillable.
  // saveFeePayment re-checks atomically so money was never at risk — but the
  // whole point of the selection-time guard is to save the clerk from filling in
  // a form that will be refused, and unlocking first spent exactly that.
  //
  // Asserted as an ORDER, like the concession-removal test: an unlock that sits
  // before the guard reads as correct and protects nothing.
  // ══════════════════════════════════════════════════════════════════════════
  T('the_payment_form_does_not_open_before_the_guard_answers', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    let unlockAfterGuard = false, singleUnlock = false, tellsOnFailure = false, checked = false;
    if (typeof g.selectFeeStudent === 'function') {
      checked = true;
      const src = codeOnly(g.selectFeeStudent.toString());
      const guardAt  = src.search(/_flPaymentGuard\s*\(/);
      const unlockAt = src.search(/_setFeeWorkflowLock\s*\(\s*false\s*\)/);
      unlockAfterGuard = guardAt > -1 && unlockAt > -1 && unlockAt > guardAt;
      // Exactly one unlock: a second one earlier in the function would reopen the
      // window while this assertion kept passing on the later occurrence.
      singleUnlock = (src.match(/_setFeeWorkflowLock\s*\(\s*false\s*\)/g) || []).length === 1;
      // Failing closed is right; failing closed in silence is not.
      tellsOnFailure = /stayed locked/.test(src);
    }

    return { pass: unlockAfterGuard && singleUnlock && tellsOnFailure && checked,
             detail: { unlocksOnlyAfterGuard: unlockAfterGuard, exactlyOneUnlock: singleUnlock,
                       explainsLockedForm: tellsOnFailure, checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // "HAS THIS STUDENT LEFT THE ROLL?" IS ONE QUESTION WITH ONE ANSWER.
  //
  // It was written out by hand in sixteen places across five modules. Every copy
  // agreed — which is the point: they agreed right up until one of them didn't,
  // and nothing would have reported the day that changed. The engine's own
  // billing branch was one of them, so a divergence there would have decided
  // whether a student accrues.
  // ══════════════════════════════════════════════════════════════════════════
  T('departed_means_the_same_thing_everywhere', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    if (typeof g._flIsDeparted !== 'function') {
      return { pass: false, detail: { reason: '_flIsDeparted not loaded' } };
    }
    const d = g._flIsDeparted;

    const rule = d({ status: 'terminated' }) === true
              && d({ status: 'hidden' })     === true
              && d({ status: 'active' })     === false
              && d({})                       === false   // absent status is live
              && d(null)                     === false   // and so is no student at all
              && d(undefined)                === false
              // Case and stray whitespace must not decide whether someone is billed.
              && d({ status: 'TERMINATED' }) === true
              && d({ status: 'Hidden' })     === true
              // Nothing else counts as departed — 'graduated' is not a status this
              // app writes, and guessing at unknown ones would silently stop billing.
              && d({ status: 'graduated' })  === false;

    // The consumers that decide money must be routed through it.
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    let wired = 0, expected = 0;
    for (const name of ['_flStudentYearOutstanding', 'previewSyncCrossCheck']) {
      if (typeof g[name] !== 'function') continue;
      expected++;
      if (/_flIsDeparted\s*\(/.test(codeOnly(g[name].toString()))) wired++;
    }

    return { pass: rule && expected === 2 && wired === 2,
             detail: { predicateCorrect: rule, consumersWired: wired, consumersFound: expected } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A HIDDEN STUDENT IS AS GUARDED AS A TERMINATED ONE.
  //
  // The guard tested only for 'terminated', so hidden students passed it and the
  // payment form opened for them — found live in an ADMIN session, showing a
  // confidential student's month grid, concession rate and outstanding. The only
  // thing between that and a receipt was a role check at the very end of
  // saveFeePayment, which made a confidentiality guarantee rest on one guard.
  //
  // The asymmetry is the thing to pin: both states blocked by default, both
  // openable only by the screen entitled to collect from them.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_hidden_student_is_guarded_exactly_like_a_terminated_one', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const G = g._flPaymentGuard;
    if (typeof G !== 'function') return { pass: false, detail: { reason: 'guard not loaded' } };

    const hidden     = { status: 'hidden' };
    const terminated = { status: 'terminated' };
    const active     = { status: 'active' };

    const blocked =
         G(hidden).allowed     === false      // the defect: this used to be true
      && G(terminated).allowed === false
      && G(active).allowed     === true
      && G({}).allowed         === true       // no status = active
      && G(null).allowed       === true;

    // Only the entitled screen opens either of them.
    const viaArchive =
         G(hidden,     { fromArchive: true }).allowed === true
      && G(terminated, { fromArchive: true }).allowed === true
      && G(hidden,     { fromArchive: false }).allowed === false
      && G(hidden,     {}).allowed                    === false;

    // Whitespace and case must not be a bypass — status arrives from imports and
    // hand edits, and ' Hidden' matching nothing would reopen the door silently.
    const normalised =
         G({ status: ' hidden ' }).allowed === false
      && G({ status: 'HIDDEN' }).allowed   === false
      && G({ status: 'Terminated' }).allowed === false;

    // The refusal must name the screen that IS allowed, and name the right one.
    const rHidden = String(G(hidden).reason || '');
    const rTerm   = String(G(terminated).reason || '');
    const signposted = /Hidden Students screen/i.test(rHidden)
                    && /Terminated Students screen/i.test(rTerm)
                    && rHidden !== rTerm;

    return { pass: blocked && viaArchive && normalised && signposted,
             detail: { hiddenBlocked: G(hidden).allowed === false,
                       archiveStillOpens: viaArchive, caseAndSpaceSafe: normalised,
                       refusalNamesRightScreen: signposted } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A NON-PRINCIPAL DOES NOT SEE A DEPARTED STUDENT, ANYWHERE.
  //
  // Blocking the payment form was not enough: the record itself is the
  // confidential part. An Admin could still find a hidden student in global
  // search — listed, and mislabelled "Terminated" — and open a profile carrying
  // guardian, contact, the month grid, the concession rate and the outstanding.
  //
  // Pinned as ONE rule across every surface, because a half-applied access rule
  // is worse than either state: gating the profile but not the search leaks the
  // roster and looks broken to whoever clicks through.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_non_principal_never_sees_a_departed_student', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    if (typeof g._flMaySeeDeparted !== 'function' || typeof g._flIsDeparted !== 'function') {
      return { pass: false, detail: { reason: 'predicates not loaded' } };
    }
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    // The predicate cannot be exercised by swapping roles: currentRole is a
    // top-level `let` in core.js, so it lives in script scope and assigning
    // globalThis.currentRole creates a DIFFERENT binding the function never
    // reads. The first version of this test did exactly that and reported a
    // failure that was entirely its own. Asserted at the source instead.
    const mayeSrc = codeOnly(g._flMaySeeDeparted.toString());
    const roleRule = /currentRole/.test(mayeSrc)
                  && /'principal'|"principal"/.test(mayeSrc)
                  // It must GRANT on principal, never merely mention the word —
                  // an inverted comparison would still match the two tests above.
                  && /===\s*'principal'|===\s*"principal"/.test(mayeSrc)
                  && typeof g._flMaySeeDeparted() === 'boolean';

    // Every surface that can list or open a student must consult it. Named
    // explicitly and counted, so a renamed function fails here rather than
    // silently dropping out of the check.
    const SURFACES = ['doSearch', 'renderStudents', 'renderStudentProfile'];
    let wired = 0, found = 0;
    for (const name of SURFACES) {
      if (typeof g[name] !== 'function') continue;
      found++;
      if (/_flMaySeeDeparted\s*\(/.test(codeOnly(g[name].toString()))) wired++;
    }

    return { pass: roleRule && found === SURFACES.length && wired === SURFACES.length,
             detail: { predicateFollowsRole: roleRule, surfacesWired: wired,
                       surfacesFound: found, expected: SURFACES.length } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // HIDING A STUDENT MUST CARRY THEIR EXISTING RECEIPTS WITH THEM.
  //
  // isHiddenPayment was written once, by saveFeePayment, from the status held at
  // the moment of payment — so a student's earlier receipts stayed unflagged when
  // they were later hidden. Six read surfaces filter on that flag, and the
  // Principal's own Hidden Fee History QUERIES on it, so the same omission both
  // leaked the receipts to Admin and hid them from the one section meant to show
  // them.
  //
  // Pinned as a wiring assertion: the hide path must set it, the undo path must
  // clear it, and both must report a failure rather than leave a student
  // half-confidential.
  // ══════════════════════════════════════════════════════════════════════════
  T('hiding_a_student_moves_their_existing_receipts_too', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    if (typeof g._flSetPaymentVisibility !== 'function') {
      return { pass: false, detail: { reason: '_flSetPaymentVisibility not loaded' } };
    }

    // Both directions must be wired, and each must READ the result — a backfill
    // that half-completes and says nothing is the failure mode that matters.
    let hideSets = false, undoClears = false, bothReport = 0, checked = 0;
    if (typeof g.moveStudentToHidden === 'function') {
      checked++;
      const src = codeOnly(g.moveStudentToHidden.toString());
      hideSets = /_flSetPaymentVisibility\s*\([^)]*isHiddenPayment['"]\s*,\s*true/.test(src);
      if (/\.ok\b/.test(src)) bothReport++;
    }
    if (typeof g.undoHiddenStudent === 'function' || typeof g._undoHidden === 'function') {
      const fn = g.undoHiddenStudent || g._undoHidden;
      checked++;
      const src = codeOnly(fn.toString());
      undoClears = /_flSetPaymentVisibility\s*\([^)]*isHiddenPayment['"]\s*,\s*false/.test(src);
      if (/\.ok\b/.test(src)) bothReport++;
    }

    return { pass: hideSets && undoClears && bothReport === 2 && checked === 2,
             detail: { hidePathSetsFlag: hideSets, undoPathClearsFlag: undoClears,
                       bothSurfaceFailure: bothReport, pathsFound: checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WHAT THE CONCESSION CHIP SAYS IS WHAT THE MONTH IS BILLED.
  //
  // The chip rendered concessionFee — the base — while the bill resolves a
  // month through monthlyBreakdown first. Editing one month writes that map and
  // leaves the base alone, so the two drifted apart the moment anyone used the
  // per-month editor. A student's stated rate disagreeing with their charged
  // rate, on the screen where money is taken, is the worst place for it.
  //
  // The rule pinned here is the resolution ORDER, not the chip's wording: the
  // per-month entry wins, the base applies where there is none, and a month
  // outside activeMonths is not on concession at all.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_per_month_concession_beats_the_base_rate_everywhere', () => {
    const R = 1800;
    const conc = { concessionFee: 1650, activeMonths: ['2026-12', '2027-01', '2027-02'],
                   monthlyBreakdown: { '2027-01': 1500 } };
    const rate = m => _flConcessionRateForMonth(conc, '2026-27', m, R);

    const order = rate('January')  === 1500   // per-month entry wins over the base
               && rate('December') === 1650   // covered, no entry -> the base
               && rate('February') === 1650
               && rate('June')     === R;     // outside activeMonths -> no concession

    // A per-month entry of ZERO is a real amount, not a missing one — a month
    // waived to nothing must not silently fall back to the base rate.
    const zeroed = _flConcessionRateForMonth(
      { concessionFee: 1650, activeMonths: ['2026-12'], monthlyBreakdown: { '2026-12': 0 } },
      '2026-27', 'December', R) === 0;

    // No activeMonths at all means the concession covers the whole year.
    const ungated = _flConcessionRateForMonth({ concessionFee: 1200 }, '2026-27', 'June', R) === 1200;

    // The chip must not state a single rate when the schedule is not single.
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const g = (typeof window !== 'undefined' ? window : globalThis);
    let chipHonest = false, checked = false;
    if (typeof g.selectFeeStudent === 'function') {
      checked = true;
      const src = codeOnly(g.selectFeeStudent.toString());
      // Asserts the chip RESOLVES each month through the engine rather than
      // printing concessionFee. Deliberately not a wording check — the first
      // version matched the literal "varies by month", so changing the label to
      // something better broke a test that was never about the label.
      chipHonest = /_flConcessionRateForMonth\s*\(/.test(src);
    }

    return { pass: order && zeroed && ungated && chipHonest && checked,
             detail: { resolutionOrder: order, zeroIsAnAmount: zeroed,
                       ungatedCoversYear: ungated, chipReflectsSchedule: chipHonest } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A CONCESSION MONTH BELONGS TO ONE YEAR, AND COSTS WHAT THE BILL CHARGES.
  //
  // The profile card carried a third implementation of concession resolution.
  // It matched activeMonths with endsWith('-' + mm) — month-of-year only — so a
  // concession granted for 2026-12 also lit December on every other year's
  // card; and it returned the base fee, never monthlyBreakdown, so a month
  // corrected to 1,500 displayed 1,650 while the bill took 1,500.
  //
  // Both are pinned through _flConcessionRateForMonth, the function the engine
  // bills through, so the card cannot disagree with the invoice again.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_concession_month_is_scoped_to_its_own_academic_year', () => {
    const R = 1800;
    const conc = { concessionFee: 1650, activeMonths: ['2026-12'],
                   monthlyBreakdown: { '2026-12': 1500 } };

    // December 2026-27 IS covered. December of the NEXT year is a different month
    // key entirely — the endsWith test could not tell them apart.
    const thisDec = _flConcessionRateForMonth(conc, '2026-27', 'Dec', R);
    const nextDec = _flConcessionRateForMonth(conc, '2027-28', 'Dec', R);

    // Jun-Dec belong to the opening calendar year, Jan-May to the closing one —
    // so a January concession is keyed to startYear + 1, and asking for it under
    // the wrong academic year must not match.
    const janConc = { concessionFee: 1400, activeMonths: ['2027-01'] };
    const janIn   = _flConcessionRateForMonth(janConc, '2026-27', 'Jan', R);
    const janOut  = _flConcessionRateForMonth(janConc, '2025-26', 'Jan', R);

    const scoped = thisDec === 1500      // per-month override, not the 1650 base
                && nextDec === R         // a different year is not on concession
                && janIn   === 1400
                && janOut  === R;

    // And the card must route through it rather than re-deriving.
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const g = (typeof window !== 'undefined' ? window : globalThis);
    let cardWired = false, checked = false;
    if (typeof g.renderStudentProfile === 'function') {
      checked = true;
      const src = codeOnly(g.renderStudentProfile.toString());
      cardWired = /_flConcessionRateForMonth\s*\(/.test(src)
               // the year-blind test must be gone, not merely bypassed
               && !/endsWith\s*\(\s*['"]-['"]\s*\+/.test(src);
    }

    return { pass: scoped && cardWired && checked,
             detail: { decThisYear: thisDec, decNextYear: nextDec,
                       janInYear: janIn, janWrongYear: janOut,
                       cardUsesEngineResolver: cardWired } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // E3 — ONE OUTSTANDING FOR THE PAYMENT SCREEN, READ BY EVERY SURFACE ON IT.
  //
  // Record Payment held FOUR derivations of "what does this student still owe
  // this year": the dues banner subtracted previousDues from the stored
  // aggregate; the Remaining Balance field summed the unpaid pills through
  // _flPayableForMonths; a second branch of the same field summed them again
  // through _quoteForMonth once months were selected; and the Profile Card asked
  // the engine. Each is defensible alone. Together they produced one student
  // showing four different balances at one moment, and a banner reading 5,700
  // beside a field reading 5,800.
  //
  // All four now read the engine's figure, computed once at selection from data
  // already fetched. Their own derivations remain as FALLBACKS — deliberately,
  // because a screen that silently reports zero when a computation failed is how
  // a family stops being billed. Falling back to a slightly stale figure is
  // recoverable; falling back to zero is not.
  // ══════════════════════════════════════════════════════════════════════════
  T('the_payment_screen_has_one_outstanding_not_four', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    // The value must be PUBLISHED once, from the engine, at selection.
    let publishes = false, publishChecked = false;
    if (typeof g.selectFeeStudent === 'function') {
      publishChecked = true;
      const src = codeOnly(g.selectFeeStudent.toString());
      publishes = /engineOutstanding\s*=/.test(src)
               && /_flStudentYearOutstanding\s*\(/.test(src);
    }

    // And every reader must consult it. Counted, so a new derivation added later
    // fails here instead of quietly becoming a fifth answer.
    let readers = 0, readerChecked = 0;
    for (const name of ['_rpRenderDuesBanner', 'calcLockedFee']) {
      if (typeof g[name] !== 'function') continue;
      readerChecked++;
      const src = codeOnly(g[name].toString());
      const hits = (src.match(/engineOutstanding/g) || []).length;
      // calcLockedFee has TWO branches that need it; the banner has one.
      if (hits >= (name === 'calcLockedFee' ? 2 : 1)) readers++;
    }

    // Falling back to the pill sum is required; falling back to zero is not
    // acceptable, so every reader must guard on Number.isFinite rather than `||`.
    let guarded = true;
    for (const name of ['_rpRenderDuesBanner', 'calcLockedFee']) {
      if (typeof g[name] !== 'function') continue;
      const src = codeOnly(g[name].toString());
      if (/engineOutstanding\s*\|\|/.test(src)) guarded = false;   // `|| 0` would swallow a real 0
      if (!/Number\.isFinite/.test(src))        guarded = false;
    }

    return { pass: publishes && publishChecked && readerChecked === 2
                && readers === 2 && guarded,
             detail: { publishedFromEngine: publishes, readersWired: readers,
                       readersFound: readerChecked, fallbackNotZero: guarded } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE PAST-DUE GRID MUST READ THE YEAR THE CLERK ACTUALLY PICKED.
  //
  // It chose between monthStatus and previousYearMonthStatus on one test — "is
  // this the student's current year?" — and read previousYearMonthStatus for ANY
  // earlier year. That field describes exactly ONE year, so on a student with
  // three years on record the wrong grid answered.
  //
  // Live: selecting 2024-25 read the 2025-26 grid, where September is N/A-PAID,
  // and locked September 2024-25 green. September was the only month still owed
  // that year, so the ₹1,700 the banner correctly reported could not be
  // collected — the month that would clear it looked already settled.
  //
  // _flGridForYear is pinned as the resolver because it is the one the ENGINE
  // bills through: if the grid the clerk is shown came from anywhere else, the
  // screen and the invoice are answering from different years again.
  // ══════════════════════════════════════════════════════════════════════════
  T('the_past_due_grid_reads_the_selected_years_own_grid', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    if (typeof g._flGridForYear !== 'function') {
      return { pass: false, detail: { reason: '_flGridForYear not loaded' } };
    }

    // A student shaped like the live case: current year 2026-27, previous 2025-26
    // in previousYearMonthStatus, and 2024-25 filed in openingOutstandingDues.
    const s = {
      academicYear: '2026-27',
      monthStatus: { Jun: 'N/A-PAID' },
      previousAcademicYear: '2025-2026',
      previousYearMonthStatus: { Sep: 'N/A-PAID', Jun: 'N/A-PAID' },
      openingOutstandingDues: [
        { year: '2024-2025', monthStatus: { Sep: 'DUE', Jun: 'N/A-PAID' } }
      ],
    };

    const g2425 = g._flGridForYear(s, '2024-25');
    const g2526 = g._flGridForYear(s, '2025-26');
    const g2627 = g._flGridForYear(s, '2026-27');

    // THE defect: September must be DUE for 2024-25, not the 2025-26 N/A-PAID.
    const rightYear = g2425.Sep === 'DUE'
                   && g2526.Sep === 'N/A-PAID'
                   && g2627.Jun === 'N/A-PAID'
                   // long-form and short-form year labels resolve identically
                   && g._flGridForYear(s, '2024-2025').Sep === 'DUE';

    // A year with no grid must come back empty rather than borrowing another's.
    const noGrid = Object.keys(g._flGridForYear(s, '2019-20') || {}).length === 0;

    // And the screen must use it, with EXCUSED locked rather than sold.
    const codeOnly = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    let wired = false, checked = false;
    if (typeof g._pastDueLoadMonthGrid === 'function') {
      const fn = g._pastDueLoadMonthGrid;
      checked = true;
      const src = codeOnly(fn.toString());
      wired = /_flGridForYear\s*\(/.test(src)
           && /EXCUSED/.test(src)
           && !/previousYearMonthStatus/.test(src);   // the wrong-year read is gone
    }

    return { pass: rightYear && noGrid && wired && checked,
             detail: { sep2425: g2425.Sep, sep2526: g2526.Sep,
                       emptyYearStaysEmpty: noGrid, gridWired: wired, fnFound: checked } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE CONCESSION BADGE SURVIVES THE MARKERS THAT RUN AFTER IT.
  //
  // _markConcessionMonths() ran before the pass that marks paid/excused/due, and
  // _markDueMonthsRed ends with `btn.textContent = month.slice(0,3)`. textContent
  // replaces the node's children, so the badge was not restyled — it was deleted,
  // on precisely the UNPAID concession months where a reduced rate matters.
  //
  // toggleMonthPill already re-applied it after its own textContent reset, with a
  // comment saying why. The load path never got the same treatment, which is what
  // made this look like "only appears after clicking".
  //
  // Pinned as an ORDER, like the guard and the concession-removal tests: a badge
  // applied before a marker that rewrites textContent is a badge that is not there.
  // ══════════════════════════════════════════════════════════════════════════
  T('the_concession_badge_is_applied_after_every_marker', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    let orderOk = false, checked = false;
    if (typeof g.selectFeeStudent === 'function') {
      checked = true;
      const src = codeOnly(g.selectFeeStudent.toString());
      const conc = src.lastIndexOf('_markConcessionMonths');
      const due  = src.lastIndexOf('_markDueMonthsRed');
      const paid = src.lastIndexOf('_markPaidMonths');
      const exc  = src.lastIndexOf('_markExcusedMonths');
      // Every marker that repaints a pill must run BEFORE the badge is applied.
      orderOk = conc > -1 && due > -1 && paid > -1 && exc > -1
             && conc > due && conc > paid && conc > exc;
    }

    // And the destructive call is still there — this test is only meaningful while
    // something downstream actually rewrites textContent. If that ever stops being
    // true the ordering requirement should be revisited, not silently assumed.
    let stillDestructive = false;
    if (typeof g._markDueMonthsRed === 'function') {
      stillDestructive = /textContent\s*=/.test(codeOnly(g._markDueMonthsRed.toString()));
    }

    return { pass: orderOk && checked && stillDestructive,
             detail: { badgeAppliedLast: orderOk, markerStillRewritesText: stillDestructive } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A PART-PAID MONTH KEEPS ITS REMAINDER ON SCREEN.
  //
  // _markDueMonthsRed ends with `btn.textContent = month.slice(0,3)` and ran
  // after the pass that stamps "PARTIAL ₹1,200" onto a part-paid pill. The label
  // and the amber styling were deleted, leaving a plain red month that looks
  // exactly like one nothing has been paid against — so the clerk collects the
  // FULL rate instead of the remainder and the family pays twice for the part
  // already settled.
  //
  // Same deletion that took the concession badge. A month can carry both labels
  // and both were lost, which is why the two were reported separately.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_part_paid_month_is_never_repainted_as_plainly_due', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    let skipsPartial = false, skipsPaid = false, rewrites = false, checked = false;
    if (typeof g._markDueMonthsRed === 'function') {
      checked = true;
      const src = codeOnly(g._markDueMonthsRed.toString());
      skipsPartial = /dataset\.partial\s*===\s*'true'\s*\)\s*return/.test(src);
      skipsPaid    = /paidMonths\s*&&\s*paidMonths\.has\(month\)\s*\)\s*return/.test(src);
      // The guard only matters while this function still rewrites the node's text.
      rewrites     = /textContent\s*=/.test(src);
      // And the skip must come BEFORE the repaint, or it protects nothing.
      const gAt = src.search(/dataset\.partial/);
      const wAt = src.search(/textContent\s*=/);
      if (!(gAt > -1 && wAt > -1 && gAt < wAt)) skipsPartial = false;
    }

    return { pass: skipsPartial && skipsPaid && rewrites && checked,
             detail: { partialSkippedBeforeRepaint: skipsPartial,
                       paidStillSkipped: skipsPaid,
                       stillRewritesText: rewrites } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE SAME SHEET MUST IMPORT THE SAME WAY AS .csv AND AS .xlsx.
  //
  // Two format-specific defects made one file produce two different rolls.
  //
  // DATES  .xlsx hands over an Excel SERIAL NUMBER, not a date string.
  //        istInstantFromDateInput accepts only YYYY-MM-DD and returns null for
  //        anything else, at which point istTimestampFromDateInput falls back to
  //        `new Date()` — so every imported student was stamped as admitted on
  //        the day of the upload. The same sheet as .csv worked, because CSV
  //        yields text.
  //
  // COMMAS the CSV branch split on `,` with no quote handling. One comma inside
  //        a quoted field shifted every column after it, silently. .xlsx was
  //        unaffected.
  // ══════════════════════════════════════════════════════════════════════════
  T('a_sheet_imports_the_same_whether_it_is_csv_or_xlsx', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    if (typeof g._baSheetDateToISO !== 'function') {
      return { pass: false, detail: { reason: '_baSheetDateToISO not loaded' } };
    }
    const D = g._baSheetDateToISO;

    // 45444 is 2024-06-15 on the Excel 1900 epoch. Number, numeric string and a
    // real Date must all land on the same calendar day.
    const serialNum = D(45458);
    const serialStr = D('45458');
    const asDate    = D(new Date(Date.UTC(2024, 5, 15)));
    const iso       = D('2024-06-15');
    const dmy       = D('15/06/2024');
    const dmyDash   = D('15-06-2024');

    const agree = iso === '2024-06-15'
               && asDate === '2024-06-15'
               && dmy === '2024-06-15' && dmyDash === '2024-06-15'
               && serialNum === serialStr            // one value, two shapes
               && /^\d{4}-\d{2}-\d{2}$/.test(serialNum);

    // Unreadable must return '' so the caller can raise a row error. Returning
    // anything date-shaped here is how "today" got stamped on real admissions.
    const refuses = D('') === '' && D(null) === '' && D(undefined) === ''
                 && D('not a date') === '' && D('32/13/2024') === '';

    // And the CSV reader must be a real scanner, not a split.
    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    let csvSafe = false, checked = false;
    if (typeof g.parseBulkAdmitFile === 'function') {
      checked = true;
      const src = codeOnly(g.parseBulkAdmitFile.toString());
      csvSafe = !/lines\[i\]\.split\(','\)/.test(src)      // the shifting split is gone
             && /inQ/.test(src)                            // quote state is tracked
             && /cellDates/.test(src);                     // and xlsx is asked for real dates
    }

    // A multi-year roll arrives as one tab per academic year. Reading only the
    // first tab imported part of the file and said nothing; a cover sheet in slot
    // one imported nothing at all. And the header row must be FOUND, not guessed
    // from banner text — matching 'veltrix' meant any other banner made row 1 be
    // read as the headers, failing the whole sheet on missing StudentName.
    let allSheets = false;
    if (typeof g.parseBulkAdmitFile === 'function') {
      const src = codeOnly(g.parseBulkAdmitFile.toString());
      allSheets = /wb\.SheetNames\.forEach/.test(src)          // every sheet, not [0]
               && !/wb\.Sheets\[wb\.SheetNames\[0\]\]/.test(src)
               && /_looksLikeHeaderRow/.test(src)              // headers found by content
               && !/toLowerCase\(\)\.includes\('veltrix'\)/.test(src);
    }

    return { pass: agree && refuses && csvSafe && allSheets && checked,
             detail: { iso, asDate, dmy, serialNum, serialStr,
                       refusesGarbage: refuses, csvScannerAndCellDates: csvSafe,
                       everySheetReadHeadersFound: allSheets } };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A WAIVED MONTH IS SETTLED. IT IS NOT CARRIED, SOLD, OR COUNTED AS DUE.
  //
  // EXCUSED has now been mishandled in three separate readers, always the same
  // way: a status test lists the two "paid" spellings and forgets the third
  // state exists.
  //
  //   past-due grid    a waived month fell through to "not flagged, still
  //                    selectable" and was offered for collection in red
  //   promotion        a waived month was absent from the settled set, so it
  //                    was carried into the new grade as a debt at the old rate
  //   profile card     the stored-grid fallback rendered it DUE
  //
  // The writer was never at fault — Fees Excused is transaction-driven, locks
  // both paid and already-excused months through _flClosedMonthsForYear, and
  // reconciles after. Every one of these was a reader inventing its own test.
  //
  // Pinned as the RULE rather than any one call site: three spellings mean
  // settled, and only DUE and PARTIAL mean money is owed.
  // ══════════════════════════════════════════════════════════════════════════
  T('excused_counts_as_settled_in_every_reader', () => {
    const g0 = (typeof window !== 'undefined' ? window : globalThis);
    if (typeof g0._flStatusIsSettled !== 'function') {
      return { pass: false, detail: { reason: '_flStatusIsSettled not loaded' } };
    }
    const isSettled = g0._flStatusIsSettled;
    const SETTLED = ['N/A-PAID', 'PAID', 'EXCUSED'];
    const OWING   = ['DUE', 'PARTIAL'];

    const rule = SETTLED.every(isSettled)
              && OWING.every(st => !isSettled(st))
              && isSettled('excused')            // case is not a bypass
              && isSettled(' EXCUSED ')          // nor is padding from an import
              && !isSettled('')                  // and absence is not settlement —
              && !isSettled(null)                // an unwritten month still owes
              && !isSettled(undefined)
              && !isSettled('WAIVED');           // only the spelling the app writes

    const codeOnly = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const g = (typeof window !== 'undefined' ? window : globalThis);

    // The promotion carry-forward: a waived month must not become a debt.
    let promoOk = false, promoFound = false;
    for (const name of ['_ipComputeCarryForward', '_ipCarryForward', 'renderIndividualPromotion']) {
      if (typeof g[name] !== 'function') continue;
      const src = codeOnly(g[name].toString());
      if (!/priorGradeDueMonths/.test(src)) continue;
      promoFound = true;
      promoOk = /EXCUSED/.test(src) && /monthsExcused/.test(src);
      break;
    }

    // The past-due grid: a waived month must not be offered for collection.
    let pastDueOk = false, pastDueFound = false;
    if (typeof g._pastDueLoadMonthGrid === 'function') {
      pastDueFound = true;
      pastDueOk = /EXCUSED/.test(codeOnly(g._pastDueLoadMonthGrid.toString()));
    }

    // The concession editor must not offer to price a waived month, and the
    // months-cleared counts must include one. Both were corrected after the rule
    // was extracted, so they are asserted against the shared predicate rather
    // than against a spelling of their own.
    let concOk = false, concFound = false;
    if (typeof g._concGetLockedMonthKeys === 'function') {
      concFound = true;
      const src = codeOnly(g._concGetLockedMonthKeys.toString());
      // The grid branch must route a waived month to the EXCUSED set, not fold it
      // into paid — the lock below distinguishes them, and "paid" on a waived month
      // would tell the principal money was collected when it was forgiven.
      concOk = /EXCUSED/.test(src) && /excusedFullNames\.add/.test(src);
    }
    let clearedOk = false, clearedFound = false;
    if (typeof g.renderStudentProfile === 'function') {
      clearedFound = true;
      const src = codeOnly(g.renderStudentProfile.toString());
      clearedOk = /_flStatusIsSettled/.test(src)
               && !/toUpperCase\(\)\s*===\s*'N\/A-PAID'/.test(src);   // the old count is gone
    }

    return { pass: rule && promoFound && promoOk && pastDueFound && pastDueOk
                && concFound && concOk && clearedFound && clearedOk,
             detail: { ruleHolds: rule, promotionHonoursExcused: promoOk,
                       promotionFnFound: promoFound,
                       pastDueHonoursExcused: pastDueOk, pastDueFnFound: pastDueFound,
                       concessionHonoursExcused: concOk, concessionFnFound: concFound,
                       monthsClearedCountsExcused: clearedOk } };
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
  T('the_promotion_chain_iterates_as_well_as_it_measures', () => {
    // Referenced by bare identifier, not off globalThis: PROMOTION_CHAIN is a
    // top-level `const`, so it lives in the script's lexical scope and never
    // becomes a property of the global object. Reaching for it through `window`
    // finds undefined and the test skips itself while reporting green-ish — the
    // same trap that made an earlier test assert nothing at all.
    if (typeof PROMOTION_CHAIN === 'undefined' || typeof getClassList !== 'function') {
      return { pass: false, detail: { reason: 'PROMOTION_CHAIN / getClassList not loaded' } };
    }
    const C = PROMOTION_CHAIN;
    const real = getClassList() || [];
    if (!real.length) return { pass: false, detail: { reason: 'class list is empty' } };

    // These four always worked — the proxy forwarded them by name or by index, and
    // that is exactly what made the failure so quiet: every SIZE question answered
    // correctly while every WALK over the same list visited nothing.
    const measures = C.length === real.length
                  && C[0] === real[0]
                  && C[C.length - 1] === real[real.length - 1]
                  && C.indexOf(real[real.length - 1]) === real.length - 1;

    // These three returned empty. map built the Promotion Map table (no rows ever),
    // forEach seeded the per-class counts (so every count stayed 0, including the
    // "→ Terminated" figure on an action labelled "cannot be undone").
    let walked = 0;
    C.forEach(() => walked++);
    const mapped   = C.map(c => c).join('|');
    const filtered = C.filter(Boolean).length;
    const spread   = [...C].length;
    const iterates = walked === real.length
                  && mapped === real.join('|')
                  && filtered === real.length
                  && spread === real.length;

    // The specific shape the screen depends on: seed a tally by forEach, then count
    // into it. If forEach visits nothing the tally is empty and every lookup below
    // it reads undefined, which is what pinned the terminal-class count at zero.
    const counts = {};
    C.forEach(c => { counts[c] = 0; });
    [real[0], real[0], real[real.length - 1]].forEach(cls => {
      if (counts[cls] !== undefined) counts[cls]++;
    });
    const tallyOk = Object.keys(counts).length === real.length
                 && counts[real[0]] === 2
                 && counts[real[real.length - 1]] === 1;

    return { pass: measures && iterates && tallyOk,
             detail: { measures, iterates, tallyOk, classes: real.length,
                       walked, mappedRows: mapped ? mapped.split('|').length : 0,
                       terminalCount: counts[real[real.length - 1]] } };
  });

  T('the_standard_annual_fee_is_priced_month_by_month_too', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const YR = '2026-27';
    // AARAV SHARMA, reconstructed. Grade 5 -> Grade 6 effective October, standard
    // 1,700 then 1,800. Concession 1,500 on two months, one either side of the
    // promotion — January (Grade 6) and September (Grade 5), which is the only
    // arrangement that reproduces every figure on his card.
    const promo = { academicYear: YR, priorGradeRate: 1700, effectiveMonth: 'October' };
    const conc  = { concessionFee: 1500, activeMonths: ['2026-09', '2027-01'] };
    const s = { admissionNumber: 'ADM-2026-153', academicYear: YR, status: 'active',
                class: '__no_such_class__', monthlyFee: 1800,
                midYearPromotion: promo, promotionHistory: [promo], monthStatus: { Jun:'DUE' } };
    const info = _flStudentYearOutstanding(s, [], YR,
      { quiet: true, concession: conc, currentYear: YR, isActive: true });

    if (typeof info.rateBeforeConcession !== 'function') {
      return { pass: false, detail: { reason: 'engine does not expose rateBeforeConcession' } };
    }
    const M = _FL_MONTHS.map(m => _FL_S2F[m]);
    const billed   = M.reduce((sum, m) => sum + (Number(info.rateForMonth(m)) || 0), 0);
    const standard = M.reduce((sum, m) => sum + (Number(info.rateBeforeConcession(m)) || 0), 0);

    // 4 x 1,700 + 8 x 1,800 = 21,200 — NOT the 21,600 a flat 12 x 1,800 produces.
    const standardOk = standard === 21200 && standard !== 1800 * 12;
    // Concession takes 200 off September and 300 off January: 21,200 - 500 = 20,700,
    // which is the annual his card shows.
    const billedOk   = billed === 20700 && (standard - billed) === 500;
    // The concession must not be credited with the promotion's saving. Under the
    // old flat subtitle the apparent discount was 900; only 500 of it is concession.
    const notCreditedToConcession = (1800 * 12) - billed === 900 && (standard - billed) === 500;
    // And with no promotion at all the two must agree with the flat figure, or this
    // change would have broken every ordinary student's card.
    const plain = _flStudentYearOutstanding(
      { admissionNumber: 'ADM-PLAIN', academicYear: YR, status: 'active',
        class: '__no_such_class__', monthlyFee: 1800, monthStatus: { Jun:'DUE' } },
      [], YR, { quiet: true, concession: null, currentYear: YR, isActive: true });
    const plainOk = M.reduce((sum, m) => sum + (Number(plain.rateBeforeConcession(m)) || 0), 0) === 21600;

    // ABSENCE — neither profile tile may rebuild "standard" as a flat multiplication.
    let cardOk = false, cardFound = false;
    if (typeof g.renderStudentProfile === 'function') {
      cardFound = true;
      const src = codeOnly(g.renderStudentProfile.toString());
      cardOk = /rateBeforeConcession/.test(src)
            && !/standard ₹'\s*\+\s*fmtNum\(monthlyFee \* 12\)/.test(src)
            && !/standard ₹'\s*\+\s*fmtNum\(prevFee \* 12\)/.test(src);
    }

    return { pass: standardOk && billedOk && notCreditedToConcession && plainOk
                && cardFound && cardOk,
             detail: { standard, billed, flatWouldSay: 1800 * 12,
                       standardOk, billedOk, notCreditedToConcession, plainOk, cardOk } };
  });

  T('a_settled_month_is_not_reopened_by_the_ledger_alone', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (typeof g._flPartialMonthsFromLedger !== 'function'
        || typeof g.selectFeeStudent !== 'function'
        || typeof g._flStudentYearOutstanding !== 'function') {
      return { pass: false, detail: { reason: 'helpers not loaded' } };
    }

    // KARAN KAPOOR's July: 1,500 in the ledger against a month that now prices at
    // 1,700, closed in full under the concession that covered it at the time and
    // recorded N/A-PAID in the grid.
    const YR = '2026-27';
    const s = { admissionNumber: 'ADM-2026-070', academicYear: YR, status: 'active',
                class: '__no_such_class__', monthlyFee: 1700,
                monthStatus: { Jun:'N/A-PAID', Jul:'N/A-PAID', Aug:'N/A-PAID', Sep:'DUE',
                               Oct:'DUE', Nov:'DUE', Dec:'DUE', Jan:'DUE', Feb:'DUE',
                               Mar:'DUE', Apr:'DUE', May:'DUE' } };
    const txs = [{ academicYear: YR, date: new Date('2026-08-20T10:00:00Z'),
                   monthsSelected: ['July', 'August'],
                   monthAllocations: { July: 1500, August: 1500 } }];
    const info = _flStudentYearOutstanding(s, txs, YR,
      { quiet: true, concession: null, currentYear: YR, isActive: true });

    // The engine closes them — the grid is the evidence the ledger cannot carry.
    const engineSettled = info.paid.has('July') && info.paid.has('August')
                       && !(info.partialPaid && info.partialPaid.July);

    // The ledger derivation, ON ITS OWN, calls them partial. That is not a bug in
    // the helper — 1,500 really is less than 1,700 — it is why it must not be the
    // last word on whether a month is open.
    const ledgerSaysPartial = _flPartialMonthsFromLedger(
      { July: 1500, August: 1500 }, () => 1700).has('July');

    // So the de-lock that repaints tiles must consult the engine before striking a
    // month out of the locked set. Without this, both months offered themselves for
    // collection at 200 each while outstanding was 0.
    const src = codeOnly(g.selectFeeStudent.toString());
    const asksEngineBeforeUnlocking =
      /_flPartialMonthsFromLedger\([\s\S]{0,200}?forEach\(\s*m\s*=>\s*\{\s*if\s*\(\s*!\s*_settledDL\(m\)\s*\)/.test(src)
      && /_settledDL\s*=\s*m\s*=>/.test(src)
      && /engineInfo/.test(src)
      // ABSENCE: the unconditional strike-out must not come back.
      && !/_flPartialMonthsFromLedger\([^;]*\)\s*\.forEach\(\s*m\s*=>\s*paidMonths\.delete\(m\)\s*\)/.test(src);

    return { pass: engineSettled && ledgerSaysPartial && asksEngineBeforeUnlocking,
             detail: { engineSettled, ledgerSaysPartial, asksEngineBeforeUnlocking,
                       outstanding: info.outstanding } };
  });

  T('a_class_rate_rise_does_not_reach_a_concession_month_or_a_prior_one', () => {
    const YR = '2026-27';
    // Grade 1 at 1,700, promoted mid-year to Grade 6 at 1,800 effective October.
    // The promotion record is what _flHistoricalRateForMonth reads.
    const promo = { academicYear: YR, priorGradeRate: 1700, effectiveMonth: 'October' };
    // An ACTIVE, un-overwritten concession covering November and December.
    const conc  = { concessionFee: 1500, activeMonths: ['2026-11', '2026-12'] };
    const s = { admissionNumber: 'ADM-RATE-1', academicYear: YR, status: 'active',
                class: '__no_such_class__', monthlyFee: 1800,
                midYearPromotion: promo, promotionHistory: [promo],
                monthStatus: { Jun:'N/A-PAID', Jul:'DUE', Aug:'DUE', Sep:'DUE', Oct:'DUE',
                               Nov:'DUE', Dec:'DUE', Jan:'DUE', Feb:'DUE', Mar:'DUE',
                               Apr:'DUE', May:'DUE' } };
    const info = _flStudentYearOutstanding(s, [], YR,
      { quiet: true, concession: conc, currentYear: YR, isActive: true });
    const priceOf = info.rateForMonth;

    // (a) A month covered by a live concession is immune to the class rise — the
    //     concession rate is the operative one whatever the class now costs.
    const concessionHeld = priceOf('November') === 1500 && priceOf('December') === 1500;
    // (b) A month BEFORE the promotion's effective month keeps the rate in force
    //     then, settled or not. _flHistoricalRateForMonth is positional, not a
    //     settlement test — which is precisely why an open July must not drift to
    //     1,800 just because it was never closed.
    const priorHeld = priceOf('June') === 1700 && priceOf('July') === 1700
                   && priceOf('August') === 1700 && priceOf('September') === 1700;
    // (c) And the rise DOES apply from the effective month onward, or the test
    //     would pass on an engine that simply never raised anything.
    const riseApplies = priceOf('October') === 1800 && priceOf('March') === 1800
                     && priceOf('May') === 1800;

    // ══════════════════════════════════════════════════════════════════════
    // (d) THE HALF THAT ACTUALLY CAUGHT KARAN'S JULY. The engine above was never
    // wrong about these months; Record Payment was. It priced every pill from
    // getClassRate(sData.class) — the CURRENT class — so after the Grade 6
    // promotion July's tile read PARTIAL 300 while the engine, and the banner
    // directly above the tiles, said 200.
    //
    // Assert the screen asks the engine rather than re-deriving, on every site
    // that prices a month: the PARTIAL label, the quote, and the save path that
    // stamps monthRates onto the receipt.
    // ══════════════════════════════════════════════════════════════════════
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    let screenOk = false, screenFound = false;
    if (typeof g._rpRateForMonth === 'function' && typeof g.calcLockedFee === 'function'
        && typeof g.saveFeePayment === 'function' && typeof g.selectFeeStudent === 'function') {
      screenFound = true;
      const helper = codeOnly(g._rpRateForMonth.toString());
      const quote  = codeOnly(g.calcLockedFee.toString());
      const save   = codeOnly(g.saveFeePayment.toString());
      // selectFeeStudent paints the PARTIAL label. It is a THIRD pricing site, and
      // leaving it out is what let a first pass of this test stay green while the
      // tile still read 300 — the label is what the clerk actually collects on.
      const tiles  = codeOnly(g.selectFeeStudent.toString());
      // ABSENCE, stated as the shape that was actually wrong: a month's PRICE fed
      // from the current class rate. Written narrowly on purpose — calcLockedFee
      // also compares _concessionRateForMonth(m, info.rate) against info.rate to
      // decide whether to show a "concession" label, and that comparison is about
      // concession-vs-standard, not about which class rate applies. A blanket ban
      // on the call would have failed on a line that is doing nothing wrong.
      const pricesAtCurrentClassRate = src =>
        /_flPayableForMonths\(\s*[A-Za-z_$][\w$]*\s*,\s*m\s*=>\s*_concessionRateForMonth\(/.test(src)
        || /_quoteForMonth\s*=\s*m\s*=>\s*\{\s*const\s+r\s*=\s*_concessionRateForMonth\(/.test(src)
        || /const\s+left\s*=\s*Math\.max\(0,\s*_concessionRateForMonth\(/.test(src);
      screenOk =
        // the helper prefers the engine's own published per-month price
        /engineInfo/.test(helper) && /rateForMonth/.test(helper)
        // and its fallback is the historical resolver, not the bare class rate
        && /_flHistoricalRateForMonth/.test(helper)
        && !pricesAtCurrentClassRate(quote) && !pricesAtCurrentClassRate(save)
        && !pricesAtCurrentClassRate(tiles)
        && /_rpRateForMonth/.test(quote) && /_rpRateForMonth/.test(save)
        && /_rpRateForMonth/.test(tiles);
    }

    return { pass: concessionHeld && priorHeld && riseApplies && screenFound && screenOk,
             detail: { concessionHeld, priorHeld, riseApplies, screenFound, screenOk,
                       july: priceOf('July'), november: priceOf('November'),
                       october: priceOf('October') } };
  });

  T('a_month_closed_under_a_concession_does_not_reopen_when_it_changes', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    if (typeof g._flRecordedMonthRates !== 'function') {
      return { pass: false, detail: { reason: '_flRecordedMonthRates not loaded' } };
    }
    const YR = '2026-27';
    // KARAN KAPOOR, reproduced. Grade 1 at 1,700. July and August were paid in FULL
    // at a 1,500 concession. A second concession was then applied to November and
    // December — one document per student, so that edit erased July and August from
    // activeMonths and both reverted to 1,700.
    const concNow = { concessionFee: 1500, activeMonths: ['2026-11', '2026-12'] };
    const grid = { Jun:'N/A-PAID', Jul:'PARTIAL', Aug:'PARTIAL', Sep:'DUE', Oct:'DUE',
                   Nov:'DUE', Dec:'DUE', Jan:'DUE', Feb:'DUE', Mar:'DUE', Apr:'DUE', May:'DUE' };
    const mk = extra => ({
      admissionNumber: 'ADM-2026-070', academicYear: YR, status: 'active',
      class: '__no_such_class__', monthlyFee: 1700, monthStatus: { ...grid }, ...extra });
    const txBase = { academicYear: YR, date: new Date('2026-08-20T10:00:00Z'),
                     monthsSelected: ['July', 'August'],
                     monthAllocations: { July: 1500, August: 1500 } };
    const opts = { quiet: true, concession: concNow, currentYear: YR, isActive: true };

    // The receipt recorded what each month cost that day.
    const withRates = _flStudentYearOutstanding(
      mk({}), [{ ...txBase, monthRates: { July: 1500, August: 1500 } }], YR, opts);
    // The same payment, recorded before that field existed.
    const legacy = _flStudentYearOutstanding(mk({}), [{ ...txBase }], YR, opts);

    // Legacy still shows the phantom debt — 200 on each month, because 1,500 is all
    // the evidence there is and today's price says 1,700. That is the OLD behaviour
    // and it must be left exactly as it was for existing data.
    const legacyShort = Math.max(0, 1700 - 1500) * 2;
    const legacyOwes  = (legacy.partialPaid && (legacy.partialPaid.July || 0) === 1500)
                     && (legacy.partialPaid.August || 0) === 1500;

    // With the price recorded, both months are discharged: nothing owing, and they
    // are settled rather than merely part-paid.
    const closed = withRates.paid.has('July') && withRates.paid.has('August')
                && !(withRates.partialPaid && withRates.partialPaid.July)
                && !(withRates.partialPaid && withRates.partialPaid.August);
    // And the difference between the two is exactly the 400 that was reported.
    const gap = legacy.outstanding - withRates.outstanding;
    const gapIs400 = gap === legacyShort && gap === 400;

    // A month that was genuinely SHORT is not swept up by this. 1,400 against a
    // recorded 1,500 is still 300 owing at today's 1,700 — the rule closes a
    // discharged month, it does not forgive an undischarged one.
    const stillShort = _flStudentYearOutstanding(mk({}),
      [{ ...txBase, monthAllocations: { July: 1400, August: 1500 },
         monthRates: { July: 1500, August: 1500 } }], YR, opts);
    const shortKept = !stillShort.paid.has('July')
                   && (stillShort.partialPaid.July || 0) === 1400
                   && stillShort.paid.has('August');

    return { pass: legacyOwes && closed && gapIs400 && shortKept,
             detail: { legacyOutstanding: legacy.outstanding,
                       withRecordedRates: withRates.outstanding,
                       gap, gapIs400, legacyOwes, closed, shortKept } };
  });

  T('promotion_does_not_call_a_part_paid_month_paid', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (typeof g._ipComputeCarryForward !== 'function' || typeof g._ipRecompute !== 'function') {
      return { pass: false, detail: { reason: '_ipComputeCarryForward / _ipRecompute not loaded' } };
    }
    const cfSrc = codeOnly(g._ipComputeCarryForward.toString());
    const rcSrc = codeOnly(g._ipRecompute.toString());

    // The carry-forward must ASK the engine, not re-derive settlement from
    // monthsSelected — which lists every month a payment touched, short ones included.
    const asksEngine   = /_flStudentYearOutstanding/.test(cfSrc);
    const readsPartial = /partialPaid/.test(cfSrc) && /rateForMonth/.test(cfSrc);
    // A part-paid month must be its own category: not silently green, and not billed
    // as a whole unpaid month either.
    const splitsOut    = /priorGradePartialMonths/.test(cfSrc)
                      && /priorGradeDueMonths\s*=\s*elapsedMonths\.filter/.test(cfSrc)
                      && /!\(m in partialMonths\)/.test(cfSrc);

    // ABSENCE CHECK — the all-clear banner may no longer fire on unpaid months alone.
    // "All months up to the promotion date are paid" printed above a live 400 debt is
    // the exact sentence this test exists to keep out.
    const bannerGated  = /nothingOwed/.test(rcSrc)
                      && !/All months up to the promotion date are paid/.test(rcSrc);
    // And the preview must stop promising a top-up the engine deliberately never
    // performs: _flHistoricalRateForMonth charges a pre-promotion month at the rate
    // in force then, so there is no difference to collect.
    const noFalsePromise = !/will be topped up by the/.test(rcSrc);
    // A waived month was never billed, so it can carry no rate difference.
    const excusedSplit   = /excusedMonths/.test(cfSrc) && /billedPaid/.test(rcSrc);

    return { pass: asksEngine && readsPartial && splitsOut && bannerGated
                && noFalsePromise && excusedSplit,
             detail: { asksEngine, readsPartial, splitsOut, bannerGated,
                       noFalsePromise, excusedSplit } };
  });

  T('going_back_returns_to_the_record_you_were_looking_at', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const need = ['navigate', 'pushNav', 'goBack'];
    const missing = need.filter(n => typeof g[n] !== 'function');
    if (missing.length) return { pass: false, detail: { reason: 'not loaded: ' + missing.join(', ') } };

    // ABSENCE CHECK — neither push may hard-code an empty params object. That
    // literal is the whole defect: the stack recorded WHICH view you came from
    // and discarded WHICH RECORD, so every parameterised view came back blank.
    const navSrc  = codeOnly(g.navigate.toString());
    const pushSrc = codeOnly(g.pushNav.toString());
    const emptyLiteral = /params\s*:\s*\{\s*\}/;
    const navKeeps  = !emptyLiteral.test(navSrc)  && /params\s*:\s*currentParams/.test(navSrc);
    const pushKeeps = !emptyLiteral.test(pushSrc) && /params\s*:\s*currentParams/.test(pushSrc);

    // Both entry points must also RECORD the params of the view they are opening,
    // or the next push has nothing truthful to store.
    const navRecords  = /currentParams\s*=\s*params/.test(navSrc);
    const pushRecords = /currentParams\s*=\s*params/.test(pushSrc);

    // And going back must restore them and render WITH them.
    const backSrc  = codeOnly(g.goBack.toString());
    const backOk   = /currentParams\s*=\s*prev\.params/.test(backSrc)
                  && /renderView\(\s*prev\.view\s*,\s*currentParams\s*\)/.test(backSrc);

    // The trail that reported it: profile → Fee Card → back. Both destinations are
    // parameterised, and renderFeeCard/renderStudentProfile each answer "not found"
    // on an absent id — so an empty params object is indistinguishable from a
    // deleted student. Assert the round trip preserves the id.
    const stack = [];
    let cv = 'studentProfile', cp = { id: 'ADM-2026-070' };
    stack.push({ view: cv, params: cp });                 // pushNav('feeCard', {studentId})
    cv = 'feeCard'; cp = { studentId: 'ADM-2026-070' };
    const prev = stack.pop();                             // goBack()
    const roundTripOk = prev.params && prev.params.id === 'ADM-2026-070';

    return { pass: navKeeps && pushKeeps && navRecords && pushRecords && backOk && roundTripOk,
             detail: { navKeeps, pushKeeps, navRecords, pushRecords, backOk, roundTripOk } };
  });

  T('the_receipt_balance_is_the_engine_minus_the_cash_taken', () => {
    const g = (typeof window !== 'undefined' ? window : globalThis);
    const codeOnly = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (typeof g.saveFeePayment !== 'function' || typeof g._flPayableForMonths !== 'function') {
      return { pass: false, detail: { reason: 'saveFeePayment / _flPayableForMonths not loaded' } };
    }
    const src = codeOnly(g.saveFeePayment.toString());

    // (a) The receipt figure is the SAME number the Remaining Balance field shows.
    const readsEngine = /engineOutstanding/.test(src);
    const oneIdentity = /balance\s*=\s*Math\.max\(\s*0\s*,\s*_outstandingBefore\s*-/.test(src);

    // (b) ABSENCE CHECK — the pill scrape that priced a PARTIAL month at its whole
    // fee must not come back. It is the shape, not the helper, that was wrong:
    // reduce over still-unpaid pills straight into _concessionRateForMonth with no
    // netting of what the month already carries.
    const noRawPillSum = !/_stillUnpaidMonths/.test(src)
                      && !/balance\s*=\s*balance\s*\+/.test(src);
    // Any surviving pill fallback must net partials through the shared helper.
    const fallbackNets = !/monthPickerGrid/.test(src) || /_flPayableForMonths/.test(src);

    // (c) BEHAVIOUR, in two parts, from Karan Kapoor's live case.
    //
    // Part 1 — the mechanism that broke the receipt. Standard 1,700; July and August
    // each already carry 1,500 of their month; January..May are wholly due. Priced
    // one-month-whole per pill — what the old code did — that is 7 x 1,700 = 11,900.
    // Netted against what those two months already hold it is 400 + 8,500 = 8,900.
    // The 3,000 between them is two settled months billed a second time, and it is
    // the size of the error that reached the parent.
    const months  = ['July','August','January','February','March','April','May'];
    const applied = { July: 1500, August: 1500 };
    const netted  = g._flPayableForMonths(months, () => 1700, applied);
    const whole   = months.length * 1700;
    const nettingOk = netted === 8900 && whole === 11900 && (whole - netted) === 3000;

    // Part 2 — the identity itself, on the figures the live screens actually showed.
    // The engine published 11,500 outstanding; 2,900 was collected against a 3,000
    // Nov+Dec charge. 11,500 − 2,900 = 8,600, which is what the Terminated screen
    // reported independently a moment later. The receipt printed 12,000.
    const remainingAfter = Math.max(0, 11500 - 2900);
    const identityOk = remainingAfter === 8600 && remainingAfter !== 12000;

    const behaviourOk = nettingOk && identityOk;

    return { pass: readsEngine && oneIdentity && noRawPillSum && fallbackNets && behaviourOk,
             detail: { readsEngine, oneIdentity, noRawPillSum, fallbackNets,
                       nettedPayable: netted, wholeMonthPayable: whole,
                       doubleBilled: whole - netted, nettingOk,
                       receiptRemaining: remainingAfter, identityOk, behaviourOk } };
  });

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
// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 F4 — "HAS ANYONE TOUCHED THIS STUDENT'S MONEY SINCE
// I READ IT?"
//
// _syncStudentFinancials reads the student and their whole transaction list,
// computes for a while, then writes the aggregate. A payment committing inside
// that gap was overwritten by a figure computed without it.
//
// It cannot be closed by wrapping the function in a transaction: the compute
// depends on a COLLECTION QUERY (feeTransactions where studentId ==), and the
// firebase compat client cannot read a query inside runTransaction — only
// documents. So the read stays outside and the WRITE becomes compare-and-set:
// this marker is taken from the student doc at read time and re-checked, inside
// a transaction, immediately before the update.
//
// The fields are exactly the ones a concurrent money-writer touches:
// saveFeePayment sets all four; the excused waiver and past-due paths set
// outstandingBalance and fee_status. A change in any of them means the compute
// that is about to be written was based on a roll that has since moved.
//
// Pure and string-valued so the suite can assert it without a database, and so
// comparison never depends on object identity or key order. Timestamps are
// reduced to millis because Firestore hands back a Timestamp instance whose
// identity differs on every read.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// S1 — ONE DEFINITION OF fee_status, FOR THE WRITER AND THE CHECKER BOTH.
//
// _syncStudentFinancials computed this inline and previewSyncCrossCheck did not
// check it at all — the checker verified outstandingBalance and nothing else,
// while the writer wrote five fields. Teaching the checker a SECOND copy of the
// rule would have made drift detectable; extracting the rule makes it
// impossible, which is the same reasoning that produced _flSnapshotPatch.
//
// Three states, and 'partial' is the one that only this rule produces:
// bulk-admit, the excused waiver and approvals all write a two-state
// pending/paid, so a student holding an open partial reads 'pending' from them
// until a reconcile corrects it. filters.js offers 'partial' as a filter and
// exact-matches it, so that window is visible to whoever is chasing part-payers.
//
// A month is partial when money has landed on it and it is NOT in the paid set —
// a month that reached its full rate is paid, not partial, however it got there.
//
// Pure, so the suite can assert it without a database.
// ════════════════════════════════════════════════════════════════════════════
function _flFeeStatusFor(perYearInfos, totalOutstanding) {
  const anyPartial = (perYearInfos || []).some(info =>
    info && info.partialPaid && Object.keys(info.partialPaid).some(
      m => (Number(info.partialPaid[m]) || 0) > 0 && !(info.paid && info.paid.has(m))));
  return (Number(totalOutstanding) || 0) > 0 ? (anyPartial ? 'partial' : 'pending') : 'paid';
}

function _flConcurrencyMarker(d) {
  const o = d || {};
  const ms = t => {
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number')    return t.seconds * 1000;
    const n = new Date(t).getTime();
    return Number.isFinite(n) ? n : 0;
  };
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : null);

  // ══════════════════════════════════════════════════════════════════════════
  // F10 — THE MARKER GUARDED THE MONEY SCALARS AND NOT THE GRIDS.
  //
  // F4 covered the four fields a concurrent PAYMENT writes. Past-due recording
  // (icons.js) makes three separate non-transactional writes, and the first two
  // change monthStatus dot-paths or openingOutstandingDues while touching none
  // of those four. A reconcile whose compare-and-set landed in that window saw
  // an unchanged marker, believed its payload current, and wrote — and the
  // payload carries month-grid dot-paths, so it overwrote the months just
  // recorded. A marker covering only part of what the compute depends on is the
  // same flaw as no marker, narrowed.
  //
  // Everything the engine reads is covered now: the grids, the year labels that
  // bind a grid to a year, the class and rate the year is priced at, the
  // paid-at-enrolment list, and status — which decides whether the student
  // accrues at all.
  //
  // CANONICAL, because Firestore does not promise key order and a dot-path
  // update can reorder a map. Comparing raw JSON.stringify output would have
  // reported contention on a document nobody had touched, and every reconcile
  // would have burned its retries and given up — failing closed in a way that
  // silently stops the aggregate being maintained. Keys are sorted, and the
  // openingOutstandingDues entries are sorted too, since array order there
  // carries no meaning.
  // ══════════════════════════════════════════════════════════════════════════
  const grid = g => {
    if (!g || typeof g !== 'object') return '';
    return Object.keys(g).sort().map(k => k + '=' + String(g[k])).join('|');
  };
  const ood = arr => {
    if (!Array.isArray(arr)) return '';
    return arr.map(e => [
      _normaliseAcademicYear((e && e.year) || ''),
      n(e && e.amount),
      n(e && e.monthlyFee),
      grid(e && e.monthStatus),
    ].join('~')).sort().join(';');
  };
  const list = a => (Array.isArray(a) ? a.map(String).sort().join(',') : '');

  return JSON.stringify([
    n(o.outstandingBalance),
    String(o.fee_status || ''),
    ms(o.lastPaymentDate),
    n(o.lastPaymentAmount),
    // Grids — what past-due writes and what the engine bills from.
    grid(o.monthStatus),
    grid(o.previousYearMonthStatus),
    grid(o.prevYearMonthStatus),
    ood(o.openingOutstandingDues),
    // The labels that decide WHICH year each grid above describes. A grid is
    // unreachable without them, so a change here re-prices the whole student.
    _normaliseAcademicYear(o.academicYear || ''),
    _normaliseAcademicYear(o.previousAcademicYear || ''),
    _normaliseAcademicYear(o.openingOutstandingYear || ''),
    // What a due month costs, and who is billed at all.
    String(o.class || o.cls || ''),
    n(o.monthlyFee),
    String(o.status || ''),
    // Months settled before the student existed in the system — they have no
    // ledger entry, so only this list stops them being billed a second time.
    list(o.currentYearPaidMonths),
    _normaliseAcademicYear(o.currentYearDueYear || ''),
  ]);
}

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
    .filter(s => s && s.id && !_flIsDeparted(s)
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
  // ══════════════════════════════════════════════════════════════════════════
  // A MONTH IS CHARGED AT THE RATE IN FORCE THAT MONTH — THE SAME RATE IT IS
  // CREDITED AT.
  //
  // _rateAtMonth moved ABOVE _opRate so the charge can use it. Previously the
  // charge came from `rate` (the CURRENT class rate) while the credit for an
  // already-settled month came from _rateAtMonth (the rate in force then). A
  // mid-year promotion therefore made a closed month reopen: KABIR KAPOOR's June
  // was settled at 1,700 as a Grade 5 student, Grade 6 charged it at 1,800, and
  // it owed 100 forever.
  //
  // "Forever" is the operative word and it is what decided this. June shows
  // N/A-PAID on every screen, so the month picker locks it green and there is no
  // control anywhere that collects that 100. A charge with no month to pay it
  // against is not a debt; it is a balance that inflates Rolling Dues and can
  // never be cleared by anyone.
  //
  // midYearPromotion already records priorGradeRate and effectiveMonth, and the
  // promotion banner already tells the parent "Grade 6 fee cycle begins October".
  // Billing June at Grade 6 rates contradicted the app's own promise. The engine
  // now honours it on both sides of the ledger.
  //
  // Concession still applies on top: the operative rate is the concession-adjusted
  // rate in force for that month, so a concession and a mid-year promotion compose
  // instead of one overwriting the other.
  // ══════════════════════════════════════════════════════════════════════════
  const _rateAtMonth = _flHistoricalRateForMonth(s, yr, rate);
  const _opRate  = m => _flConcessionRateForMonth(_conc, yr, m, _rateAtMonth(m));
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
  // ══════════════════════════════════════════════════════════════════════════
  // MONTHS SETTLED BEFORE THE STUDENT EXISTED IN THE SYSTEM.
  //
  // A student onboarded mid-year through "Existing Student" arrives with months
  // already paid at their old school or in cash before enrolment. Those months
  // have no transaction — there is nothing to have a receipt for — and they are
  // recorded on the student document as currentYearPaidMonths.
  //
  // Five places already honour that field: the profile month grid, the Fee Card,
  // Record Payment's pill grid, the concession month guard, and
  // _flClosedMonthsForAY, which is described in this same file as the SHARED
  // definition of a settled month and names paid-at-enrolment as its third
  // source. The one function that decides what the student OWES did not read it.
  //
  // Live case: admitted 19 Aug 2026, so June and July precede admission and were
  // marked paid at entry. The grid showed all twelve months settled — nine PAID,
  // Mar/Apr/May EXCUSED — directly above an Outstanding card reading 3,600,
  // which is exactly those two months at 1,800. Every screen agreed the year was
  // closed except the number that says what is owed.
  //
  // Guarded on currentYearDueYear, the same way every other reader guards it, so
  // a paid-at-entry month is only ever credited to the year it was recorded for.
  // ══════════════════════════════════════════════════════════════════════════
  const _paidAtEntry = new Set();
  if (s && Array.isArray(s.currentYearPaidMonths) &&
      (!s.currentYearDueYear ||
       _normaliseAcademicYear(s.currentYearDueYear) === _normaliseAcademicYear(yr))) {
    s.currentYearPaidMonths.forEach(m => {
      const fullM = S2F[m] || m;
      _paidAtEntry.add(fullM);
      paid.add(fullM);
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
  // _rateAtMonth is now declared above _opRate, because the CHARGE needs it too.
  txsY.forEach(t => {
    // ITEM 9: read BOTH keys — older waivers carry monthsExcused only.
    if (t.type === 'excused_waiver') {
      (t.monthsSelected || []).forEach(m => excused.add(S2F[m] || m));
      (t.monthsExcused  || []).forEach(m => excused.add(S2F[m] || m));
    }
  });
  const _ledger = _flAppliedByMonthFromTxs(txsY, m => Math.min(_rateAtMonth(m), _opRate(m)));
  // ══════════════════════════════════════════════════════════════════════════
  // A MONTH CLOSED AT THE PRICE IN FORCE THEN DOES NOT REOPEN WHEN THE PRICE MOVES.
  //
  // _rateAtMonth already gives the CLASS dimension of this guarantee — it is what
  // stopped a mid-year promotion reopening Kabir Kapoor's settled June for 100 that
  // no screen could ever collect. The CONCESSION dimension had no equivalent, and a
  // student holds one concession document: editing it overwrites activeMonths, so
  // months the concession used to cover silently revert to the class rate.
  //
  // Karan Kapoor's July and August were paid in full at a 1,500 concession. A later
  // concession on November and December erased that, both months repriced to 1,700,
  // and the 1,500 already collected became 200 owing on each — 400 of debt the
  // school never charged and had already forgiven the difference on.
  //
  // _flRecordedMonthRates reads the price the RECEIPT recorded (tx.monthRates), so
  // "was this settled in full?" is answered against the day it was paid instead of
  // against today. Months with no recorded rate make no claim and fall through to
  // the existing baseline/ledger rule, so every legacy transaction behaves exactly
  // as it did.
  // ══════════════════════════════════════════════════════════════════════════
  const _ratesThen = _flRecordedMonthRates(txsY, s, yr);
  const partialPaid = {};
  _FL_MONTHS.forEach(shortM => {
    const fullM = S2F[shortM];
    if (excused.has(fullM) || excused.has(shortM)) { paid.delete(fullM); paid.delete(shortM); return; }
    const _mRate   = _opRate(fullM);
    const wasPaid  = paid.has(fullM) || paid.has(shortM);
    const baseline = wasPaid ? Math.min(_rateAtMonth(fullM), _mRate) : 0;
    const applied  = Number(_ledger[fullM] != null ? _ledger[fullM] : _ledger[shortM]) || 0;
    // The price this month carried when it was last paid, per the receipt. Closing
    // against it credits the month in full at whatever it costs now — the debt was
    // discharged, and a discharged month owes nothing regardless of later repricing.
    const _rateThen   = Number(_ratesThen[fullM]);
    const _closedThen = Number.isFinite(_rateThen) && _rateThen > 0 && applied >= _rateThen - 0.5;
    const credit   = _closedThen ? _mRate : Math.min(_mRate, Math.max(baseline, applied));
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
    : !_flIsDeparted(s);
  const _billFullYear = !gridExists && _activeForBilling
                        && _normaliseAcademicYear(yr) === _curYrForBilling;

  if (gridExists) {
    dueCount = Math.max(0, 12 - paid.size - excused.size);
    const _fullDue = Math.max(0, dueCount - _partialMonths.length);
    // ══════════════════════════════════════════════════════════════════════
    // EVERY DUE MONTH IS PRICED ONE AT A TIME. THERE IS NO FLAT-RATE FAST PATH.
    //
    // This used to branch: `_fullDue * rate` when the student had no concession,
    // and per-month pricing only when they did. That shortcut assumed every month
    // of the year costs the same — true for a concession-free student under a
    // single class rate, and FALSE the moment a mid-year promotion means June
    // costs 1,700 and October costs 1,800.
    //
    // It is what kept the promotion defect alive after the credit side was fixed:
    // months were correctly credited at the rate in force then, and still charged
    // count x current-rate. Ten due months x 1,800 where the first should have
    // been 1,700.
    //
    // dueCount stays the authoritative COUNT — it tolerates month keys outside the
    // academic twelve, which this list cannot see — so honour the smaller of the
    // two and let any residual keep the class rate.
    // ══════════════════════════════════════════════════════════════════════
    const _dueIdentified = _FL_MONTHS.map(m => _FL_S2F_SYNC[m])
      .filter(f => !paid.has(f) && !excused.has(f) && !(f in partialPaid));
    const _n        = Math.min(_fullDue, _dueIdentified.length);
    const _priced   = _dueIdentified.slice(0, _n).reduce((sm, f) => sm + _opRate(f), 0);
    const _residual = Math.max(0, _fullDue - _n) * rate;
    outstanding = _priced + _residual + _partialShort;
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
      // Paid at enrolment counts as settled too. This branch bills a full twelve
      // months against the LEDGER, and a month paid before the student existed in
      // the system has no ledger entry to find — so without this it is billed
      // again. Same rule as the grid branch above, applied where there is no grid.
      if (_paidAtEntry.has(full)) return sum + _r;
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
           concessionApplied: _hasConc, rateForMonth: _opRate,
           // The month's price with the CONCESSION removed but the promotion still
           // honoured — i.e. what the school's own schedule says that month costs.
           // rateForMonth minus the discount, not the flat current class rate.
           //
           // "standard" is a real per-month figure and was being rebuilt on the
           // profile card as monthlyFee x 12, which is flat and promotion-blind.
           // AARAV SHARMA, promoted Grade 5 -> 6 effective October: his card read
           // "standard 21,600" (12 x 1,800) when four of his months were billed at
           // Grade 5's 1,700 and the true standard is 21,200 — so 400 of the
           // promotion's effect was being credited to his concession.
           rateBeforeConcession: _rateAtMonth };
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

// ════════════════════════════════════════════════════════════════════════════
// MERGE openingOutstandingDues[] BY YEAR. NEVER BLIND-OVERWRITE IT.
//
// A student may already hold archived years in Firestore that whatever is writing
// now knows nothing about. Assigning a freshly-built array straight over the
// stored one deletes those years silently, with the operation reporting success.
//
// arrayUnion is not the tool either: it de-dupes on exact deep equality, so a year
// whose grid legitimately changed would be appended ALONGSIDE its older self,
// leaving two contradictory records for one year (F13).
//
// Keyed by year: what is stored is kept, what is incoming wins for the years it
// actually describes, and excludeYears drops the ones already described by their
// own fields — the current year, and whichever year occupies the previous-year
// scalars. A year in both places is that same contradiction from the other side.
//
// Keys are NORMALISED, which the inline copy could not do because it only ever saw
// one producer. bulk-admit writes '2024-25' and the onboarding form writes
// '2024-2025'; keyed raw, a student imported by one and re-onboarded through the
// other ends up holding two entries for a single year. Only the KEY is normalised
// — each entry is stored untouched and keeps whatever label it arrived with.
//
// Lifted verbatim from bulk-admit, which held the only correct copy and needed it
// in a second place the moment the onboarding form was audited.
// ════════════════════════════════════════════════════════════════════════════
function _flMergeOpeningDues(stored, incoming, excludeYears) {
  const k = y => _normaliseAcademicYear(String(y || '').trim());
  const map = new Map();
  (Array.isArray(stored)   ? stored   : []).forEach(e => { const y = k(e && e.year); if (y) map.set(y, e); });
  (Array.isArray(incoming) ? incoming : []).forEach(e => { const y = k(e && e.year); if (y) map.set(y, e); });
  (excludeYears || []).forEach(y => { const key = k(y); if (key) map.delete(key); });
  return Array.from(map.values());
}

// ════════════════════════════════════════════════════════════════════════════
// MAY THIS STUDENT BE PAID? ONE ANSWER, ASKED BY THE UI AND BY THE WRITE.
//
// A terminated student's Record Payment button was hidden nowhere. The Students
// list, the Due Fee list, the past-due banner and the profile card all rendered
// it unconditionally, so opening a terminated student from Paid Fee still offered
// "+ Record Payment" and the payment went through — reported live, and it is how
// a terminated student accumulated seven more transactions.
//
// A hidden button is not a guard. This is called in BOTH places: by each entry
// point to decide whether to render the control, and by saveFeePayment against a
// FRESH read of the student document, so a stale button, a back-button, a
// half-loaded page or a console call all meet the same refusal.
//
// THERE IS NO EXCEPTION. This shipped with one — Terminated and Hidden passed an
// allowArchived flag so their Principal-only "Pay Dues" button could still collect
// arrears from someone who had left. That is now closed by decision: a terminated
// student cannot be paid from anywhere, by anyone, and the way to collect from one
// is Undo Terminate, take the payment, terminate again. The flag, the
// _feeArchiveOverride it rode on, and the Pay Dues button on Terminated are all
// gone rather than left dormant — a bypass that exists but is unused is a bypass
// somebody re-enables later without reading this paragraph.
//
// 'hidden' is NOT blocked and never was. Hiding a student is a confidentiality
// measure, not an exit: they are still enrolled and still accruing, so the Hidden
// screen's Pay Dues button goes on working on its own merits. It only ever passed
// the override because it sat next to Terminated in the same commit.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// A STUDENT'S PAST RECEIPTS MOVE WITH THEM INTO — AND OUT OF — CONFIDENTIALITY.
//
// isHiddenPayment / isTerminatedPayment are stamped by saveFeePayment at the
// moment a payment is written, from the status the student held THEN. Nothing
// ever revisited them, so hiding a student left every receipt they already had
// unflagged. Two consequences, in opposite directions:
//
//   LEAK      six read surfaces filter on the flag — the Admin dashboard's
//             recent-transactions table and its Total Collected tile, Finance,
//             Export, global search and viewReceipt. A confidential student's
//             earlier receipts stayed visible to an Admin in all of them. Found
//             live: eight KABIR KAPOOR rows on an Admin dashboard.
//   BLIND SPOT renderHiddenFeeHistory QUERIES where(flag == true), so the
//             Principal's own confidential history was MISSING everything that
//             predated the hide. The section that exists to show these payments
//             was the one place they did not appear.
//
// The flag cannot be replaced by reading the student's status at display time:
// that history view is a Firestore query, and "transactions whose student is
// hidden" cannot be expressed as one — an `in` clause caps at ten ids, and the
// alternative is fetching every transaction in the school. So the flag stays and
// is MAINTAINED instead, which is what it always needed.
//
// Batched in chunks because Firestore caps a write batch at 500. The caller is
// told how many moved and whether anything failed: a partial backfill leaves some
// receipts visible, and silently half-hiding a confidential student is worse than
// not starting.
// ════════════════════════════════════════════════════════════════════════════
async function _flSetPaymentVisibility(studentId, flag, value) {
  if (!studentId || !flag) return { ok: false, updated: 0, error: 'missing studentId or flag' };
  try {
    const snap = await schoolCol('feeTransactions').where('studentId', '==', studentId).get();
    const docs = snap.docs.filter(d => {
      const cur = !!(d.data() || {})[flag];
      return value ? !cur : cur;                    // only write what actually changes
    });
    if (!docs.length) return { ok: true, updated: 0 };

    const db = firebase.firestore();
    let done = 0;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = db.batch();
      docs.slice(i, i + 450).forEach(d => {
        batch.update(d.ref, value
          ? { [flag]: true }
          : { [flag]: firebase.firestore.FieldValue.delete() });
      });
      await batch.commit();
      done += Math.min(450, docs.length - i);
    }
    return { ok: true, updated: done };
  } catch (e) {
    return { ok: false, updated: 0, error: (e && e.message) || 'unknown' };
  }
}

function _flPaymentGuard(sData, opts) {
  // trim() as well as toLowerCase(): status arrives from imports and hand edits, and
  // " terminated" matching nothing would have been a bypass nobody had to look for.
  const status = String((sData && sData.status) || 'active').trim().toLowerCase();
  // ══════════════════════════════════════════════════════════════════════════
  // HIDDEN IS GUARDED TOO. IT WAS NOT.
  //
  // This read `if (status !== 'terminated') return allowed` — so a HIDDEN student
  // passed the guard entirely. selectFeeStudent unlocked the form for them and
  // rendered the month grid, the concession rate and the outstanding, to whoever
  // had reached that student. Found live: an ADMIN session, on a hidden student,
  // with the payment form open.
  //
  // saveFeePayment's role check was the only thing standing between that and a
  // receipt, which made a confidentiality guarantee depend on a single guard at
  // the very end of the flow. The Hidden module's own confirmation promises these
  // students are "hidden from all reports, dashboard totals, and Admin views";
  // a form showing their fee grid is none of those things.
  //
  // Both departed states now work the same way: blocked everywhere except the one
  // screen entitled to collect from them, which says so by passing fromArchive.
  // For hidden that is the Hidden Students screen, which is principal-only in its
  // own right — so the entitlement and the role gate reinforce each other instead
  // of one carrying the whole weight.
  // ══════════════════════════════════════════════════════════════════════════
  if (status !== 'terminated' && status !== 'hidden') return { allowed: true, status };

  // ══════════════════════════════════════════════════════════════════════
  // THE TERMINATED SECTION COLLECTS. EVERYWHERE ELSE DOES NOT.
  //
  // Decided by the Colonel, and it is the right split. A student who has left
  // still owes what they owe, and the Terminated screen is where the school
  // goes to collect it — that is what the screen is for. What the audit was
  // actually about is the OTHER doors: opening a terminated student from Paid
  // Fee, or the Students list, or the past-due banner, and recording a payment
  // there as though nothing had happened. Those stay shut.
  //
  // So this is deliberately not a status check alone. It is "is this student
  // terminated, AND did the request come from the one screen entitled to
  // collect from them". Only Terminated passes fromArchive.
  //
  // Scope is the CURRENT academic year, and Record Payment enforces that on its
  // own: its previous-year guard already refuses a save whose months all belong
  // to a past year and redirects to Record Previous Year Dues. Nothing extra is
  // needed here, and adding a second year check would be a second definition of
  // the same rule.
  // ══════════════════════════════════════════════════════════════════════
  if (opts && opts.fromArchive) {
    return { allowed: true, status, viaArchiveScreen: true };
  }

  // Each state names the screen that IS entitled, so the refusal tells the clerk
  // where to go rather than only that they cannot be here.
  return {
    allowed: false,
    status,
    reason: status === 'hidden'
      ? 'This student is in the CONFIDENTIAL (Hidden) section. Payments cannot be ' +
        'recorded from here. Use Pay Dues on the Hidden Students screen, which is ' +
        'restricted to the Principal.'
      : 'This student is TERMINATED. Payments cannot be recorded from here. ' +
        'Use Pay Dues on the Terminated Students screen to collect the current ' +
        'year, or restore them with Undo Terminate first.'
  };
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
    // F4: the state this compute is about to be based on. Re-checked inside a
    // transaction at the write below — see _flConcurrencyMarker.
    const _casMarker = _flConcurrencyMarker(sDocSnap.data());

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
        txs.filter(t => _flTxBelongsToYear(t, yr)),
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
    // S1: through the shared rule, which previewSyncCrossCheck now also calls, so
    // the checker cannot drift from the writer it is checking.

    const updatePayload = {
      outstandingBalance: totalOutstanding,
      // ══════════════════════════════════════════════════════════════════════
      // S2 — remainingBalance ON THE STUDENT DOC IS GONE. IT WAS WRITE-ONLY.
      //
      // It held a duplicate of outstandingBalance and NOTHING read it. Every
      // remainingBalance read in the codebase is on a TRANSACTION — a receipt's
      // frozen balance at the moment it was written, which is correct and stays.
      //
      // It was not merely redundant, it was already wrong: saveFeePayment and the
      // excused waiver both write outstandingBalance and NOT this, so between a
      // payment and its reconcile the two fields held different numbers for the
      // same quantity. A second aggregate with an authoritative-sounding name,
      // maintained by half the writers and verified by none, is the exact shape
      // of the Pattern-B defects this engine exists to prevent — the next person
      // to reach for "remainingBalance" would have found a stale number.
      //
      // Deleted rather than merely un-written. Leaving the stored values behind
      // would freeze them at today's figure and leave the trap fully baited; this
      // removes the field from each student as they reconcile. It is derived, so
      // nothing is lost — restoring the write would repopulate it on the next pass.
      // ══════════════════════════════════════════════════════════════════════
      remainingBalance:   firebase.firestore.FieldValue.delete(),
      previousDues:       prevYearsOutstanding,
      fee_status:         _flFeeStatusFor(Object.values(perYear), totalOutstanding),
      updatedAt:          firebase.firestore.FieldValue.serverTimestamp(),
      // ITEMS 1/16 part 2: years this student is associated with but which carry NO
      // month grid, so nothing beyond their ledger could be billed. These used to be
      // charged a full 12 months of invented dues. Surfaced rather than swallowed —
      // an entry here means "go and record what this student was actually billed
      // that year", and an empty array means every year is properly recorded.
      _flNoGridYears:     _noGridYears.slice().sort(),
    };

    // ══════════════════════════════════════════════════════════════════════════
    // A STUDENT WITH NO academicYear CAN NEVER GET A MONTH GRID.
    //
    // The write-back below refuses the current year unless it equals the doc's own
    // year (`yr !== _sDocYearSync` -> return). With academicYear absent that field
    // resolves to '', which equals no year, so the guard fires every time and
    // monthStatus is never written. The student is billed correctly — the engine
    // still credits their ledger — but the grid stays permanently empty, so every
    // month settled at onboarding or by a legacy receipt has nowhere to be
    // recorded, and the pills have nothing to read.
    //
    // Reported on the live roll as "no academicYear: 1, setting it is cosmetic".
    // It is cosmetic only while that student has no grid AND stays terminated. The
    // moment they are restored and paid, the missing year is what stops their
    // months from ever being marked.
    //
    // Healed here, tightly: only when the field is genuinely absent AND no
    // monthStatus exists to be mis-attributed. A student who already has a grid
    // keeps whatever year that grid was filed under — guessing there would move
    // real months onto the wrong year, which is far worse than an empty field.
    // ══════════════════════════════════════════════════════════════════════════
    const _docYrRaw = _normaliseAcademicYear(s.academicYear || '');
    const _hasGrid  = !!(s.monthStatus && Object.keys(s.monthStatus).length);
    if (!_docYrRaw && !_hasGrid) {
      updatePayload.academicYear = currentYear;
      console.warn('[RECONCILE] ' + (s.admissionNumber || studentId) + ' had no academicYear ' +
        'and no month grid, so its grid could never be written. Set to ' + currentYear + '.');
    }

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
          const d = _deriveYearMonths(e, txs.filter(t => _flTxBelongsToYear(t, yr)), r);
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

    // ══════════════════════════════════════════════════════════════════════
    // F4 — COMPARE-AND-SET, BECAUSE THE COMPUTE ABOVE IS ALREADY OLD.
    //
    // This was a bare .update(). Everything above it was read potentially
    // hundreds of milliseconds ago, and saveFeePayment commits its receipt and
    // its balance in a TRANSACTION — so a payment landing in that gap was
    // overwritten here by an aggregate computed without it. Self-healing on the
    // next sync and visible to previewSyncCrossCheck, but wrong in between, and
    // wrong in the direction of under-stating what a family owes.
    //
    // The whole function cannot be wrapped: it depends on a collection query
    // and the compat client cannot read queries inside a transaction. So the
    // write re-checks, atomically, that nothing moved since the read — and
    // recomputes from scratch if it did, rather than writing a figure it now
    // knows is stale.
    //
    // opts.skipCas: reconcileAllStudentDues is a deliberate, supervised pass
    // over the whole roll. It writes to every student, so it would contend with
    // its own previous writes constantly, and 152 transactions is real cost for
    // a race a supervised bulk pass should not be having. It keeps the plain
    // update. That leaves the window open on the bulk path BY CHOICE — do not
    // run a full reconcile during collection hours.
    // ══════════════════════════════════════════════════════════════════════
    const _stuRef = schoolCol('students').doc(studentId);
    if (opts.skipCas) {
      await _stuRef.update(updatePayload);
    } else {
      const _outcome = await firebase.firestore().runTransaction(async t => {
        const cur = await t.get(_stuRef);
        if (!cur.exists) return 'GONE';
        if (_flConcurrencyMarker(cur.data()) !== _casMarker) return 'CONTENDED';
        t.update(_stuRef, updatePayload);
        return 'OK';
      });

      if (_outcome === 'GONE') {
        return { ok: false, studentId, error: 'the student record was deleted while this reconcile was computing' };
      }
      if (_outcome === 'CONTENDED') {
        // Recompute rather than retry the write: the payload is what is stale,
        // not the attempt. Recursion re-reads the student AND the ledger, which
        // is exactly what a fresh compute needs. Bounded, because a genuinely
        // busy student would otherwise spin here while a clerk waits.
        const _attempt = (opts._casAttempt || 0) + 1;
        if (_attempt <= 2) {
          return _syncStudentFinancials(studentId, Object.assign({}, opts, { _casAttempt: _attempt }));
        }
        console.warn('[RECONCILE] ' + studentId + ' was written by someone else on every attempt; ' +
                     'the aggregate was NOT updated. The transaction ledger is unaffected.');
        return { ok: false, studentId,
                 error: 'another write kept landing while this reconcile was computing — the aggregate was not updated' };
      }
    }
    invalidateStudentCache();
    invalidateFinanceCache();

    // SYNC ACROSS EVERY SECTION — the fundamental rule, applied at the one place the
    // aggregate is actually written. A terminated or hidden student's frozen snapshot
    // moves with their students/{id} figure, so the Terminated/Hidden sections and
    // their exports never disagree with Due Fee. s.status is already in hand, so an
    // active student — every student on a bulk reconcile — pays nothing for this.
    // Non-fatal: the write above already succeeded.
    await _flSyncSnapshotForStudent(studentId, s.status);

    // ══════════════════════════════════════════════════════════════════════
    // SAY WHETHER IT WORKED. THE LIVE PATH USED TO RETURN undefined EITHER WAY.
    //
    // The catch below logs and does not rethrow, and this branch returned
    // nothing, so `await _syncStudentFinancials(id)` resolved identically on
    // success and on failure. saveFeePayment awaited exactly that and carried
    // straight on to "Payment recorded successfully!" and the receipt — with the
    // aggregate never written. The money is committed by then (the transaction
    // above it succeeded), so nothing is lost; what is lost is anyone KNOWING
    // that Due Fee and the dashboard are now behind.
    //
    // dryRun keeps its own richer shape, returned earlier — the reconcile
    // preview and the contract suite both read it and must not change.
    //
    // Note _flSyncSnapshotForStudent has its own catch and warns rather than
    // throwing: a terminated/hidden snapshot that could not be refreshed does
    // NOT make this false. The aggregate on students/{id} is the authority and
    // it was written; the archive screens heal themselves on next render.
    // ══════════════════════════════════════════════════════════════════════
    return { ok: true, studentId };
  } catch (_syncErr) {
    console.error('ITEM-10: _syncStudentFinancials failed for', studentId, _syncErr);
    const _msg = (_syncErr && _syncErr.message) || 'unknown';
    if (opts.dryRun) return { studentId, error: _msg, changed: false, ok: false };
    return { ok: false, studentId, error: _msg };
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
      const _isOut = (_flIsDeparted(s));
      if (!_isOut) _seen[_adm] = 'priced';
      else if (_seen[_adm] !== 'priced') _seen[_adm] = 'excluded — status ' + s.status;
    }
    if (_flIsDeparted(s)) return;
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
  // ══════════════════════════════════════════════════════════════════════════
  // TWO DIFFERENT STATES WERE BEING REPORTED AS ONE, AND THE ADVICE DIFFERS.
  //
  // _unmatched mixes a record whose admission number matches NO student with one
  // whose student exists and was simply excluded from this pricing pass for being
  // terminated or hidden. Both used to print "price NO ONE ... matches no active
  // student", which reads as "this record is dead, remove it".
  //
  // For the second group that is wrong and expensive. A terminated student may
  // still be paid from the Terminated screen, and their concession IS applying
  // when they are — verified live on ADM-2026-152, whose months quote at 1,300
  // against a 1,800 class rate. Deleting it on the strength of this warning
  // re-prices them at full rate the moment anyone collects, or the moment they
  // are restored.
  //
  // Split, because only the first group is actionable.
  // ══════════════════════════════════════════════════════════════════════════
  const _orphanRecs   = _unmatched.filter(r => /no student carries/i.test(r.reason || ''));
  const _departedRecs = _unmatched.filter(r => !/no student carries/i.test(r.reason || ''));
  if (_orphanRecs.length) {
    console.warn('[CONCESSION] ' + _orphanRecs.length + ' record(s) match NO student at all. ' +
      'These price nobody and report nothing — the admission number they name is not on the ' +
      'roll:', _orphanRecs);
  }
  if (_departedRecs.length) {
    console.log('[CONCESSION] ' + _departedRecs.length + ' record(s) belong to a terminated or ' +
      'hidden student, so they are not priced in this pass. They are NOT dead: a terminated ' +
      'student can still be paid from the Terminated screen, and the discount applies when ' +
      'they are. Do not remove these on the strength of this line:', _departedRecs);
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
      // ══════════════════════════════════════════════════════════════════════
      // THIS READ THE WRONG FIELD AND CALLED EVERY RECORD UNTRACEABLE.
      //
      // It reported on c.createdAt, which the concession writer has never set.
      // What it does write is setBy / setByUid / setAt (serverTimestamp) and
      // effectiveFrom — full provenance, on every record. So a register with
      // complete authorship printed "(none)" against all of it, which is exactly
      // the signal someone uses to decide a discount was never properly granted.
      //
      // Reports what is actually stored. A record with no setAt AND no setBy is
      // the genuinely unattributed case and now says so on its own.
      // ══════════════════════════════════════════════════════════════════════
      const _who  = c.setBy || c.principalName || '';
      const _when = c.setAt || c.effectiveFrom || c.createdAt || null;
      concRebound.push({ docId: d.id, admissionNo: adm, concessionFee: c.concessionFee,
                         nowAppliesTo: hit.name || '(unnamed)', studentId: hit.id,
                         theirClass: hit.class || '',
                         grantedBy: _who || '(no setBy recorded)',
                         grantedAt: _when ? (typeof fmtDate === 'function' ? fmtDate(_when) : '(recorded)')
                                          : '(no timestamp recorded)',
                         note: (_who || _when)
                           ? 'ACTIVE — priced at the concession rate; provenance on record'
                           : 'ACTIVE — priced at the concession rate, and NOTHING records who granted it' });
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
// ════════════════════════════════════════════════════════════════════════════
// WHO ELSE WAS CAUGHT BY THE TWO RATE BUGS, AND WHAT DOES ONE STUDENT LOOK LIKE.
//
// Read-only. Two jobs, because the questions came together:
//
//   previewRatePolicyOverlap()          — scan the whole roll
//   previewRatePolicyOverlap('ADM-…')   — dump one student's evidence
//
// The scan reports three flags per affected student:
//
//   concessionOverwritten — the concession document carries superseded entries,
//       so months it used to cover may have been repriced under them. Only edits
//       made AFTER the supersede fix are visible; earlier ones left no trace,
//       which is exactly why this cannot be answered retroactively.
//   rateSplit — the engine's price for some month differs from the CURRENT class
//       rate. That is the population Record Payment was mis-quoting: the tile and
//       the banner disagreed by the difference.
//   bothOverlap — the case asked about: a concession edit AND a mid-year rate
//       change in the same year, where the two interact.
//
// It FLAGS. It does not write. Deciding what a student owes is not a scan's job.
// ════════════════════════════════════════════════════════════════════════════
async function previewRatePolicyOverlap(admissionNo) {
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[RATE OVERLAP] Principal only.'); return null;
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

  const want = String(admissionNo || '').trim().toUpperCase();
  const rows = [], detail = [];

  sSnap.docs.forEach(d => {
    const s   = { id: d.id, ...d.data() };
    const adm = String(s.admissionNumber || '').trim().toUpperCase();
    if (want && adm !== want) return;

    const yrTxs = (txByStudent[d.id] || []).filter(t => _flTxBelongsToYear(t, curYr));
    let info = null;
    try { info = _flStudentYearOutstanding(s, yrTxs, curYr, { quiet: true }); } catch (_) { return; }
    if (!info) return;

    const conc      = _flConcessionFor(s);
    const hist      = (conc && Array.isArray(conc.history)) ? conc.history : [];
    const classRate = Number(info.rate) || 0;

    // Where does the month's real price differ from the current class rate? That gap
    // is what Record Payment was quoting before it was routed through the engine.
    const split = [];
    _FL_MONTHS.forEach(sm => {
      const full = _FL_S2F[sm];
      const eng  = Number(info.rateForMonth(full)) || 0;
      if (eng !== classRate) split.push({ month: full, enginePrice: eng, classRate });
    });

    const promos = []
      .concat(Array.isArray(s.promotionHistory) ? s.promotionHistory : [])
      .concat(s.midYearPromotion ? [s.midYearPromotion] : [])
      .filter(p => p && p.effectiveMonth
                && _normaliseAcademicYear(p.academicYear || '') === curYr
                && (Number(p.priorGradeRate) || 0) > 0);

    const concessionOverwritten = hist.length > 0;
    const rateSplit  = split.length > 0;
    const bothOverlap = concessionOverwritten && promos.length > 0;
    if (!concessionOverwritten && !rateSplit && !want) return;

    rows.push({
      admissionNumber: s.admissionNumber || '(none)', name: s.name || '',
      class: s.class || '', status: s.status || 'active',
      concessionOverwritten, supersededEntries: hist.length,
      midYearRateChange: promos.length > 0, bothOverlap,
      monthsPricedBelowClassRate: split.length,
      outstanding: info.outstanding
    });

    if (want) {
      detail.push({
        student: { admissionNumber: s.admissionNumber, name: s.name, class: s.class,
                   academicYear: s.academicYear, monthlyFee: s.monthlyFee, status: s.status },
        // What _flHistoricalRateForMonth can actually SEE. A promotion missing any of
        // these is invisible to it, and every month then prices at the current rate.
        promotionsVisibleToEngine: promos.map(p => ({
          fromClass: p.fromClass, toClass: p.toClass, academicYear: p.academicYear,
          priorGradeRate: p.priorGradeRate, effectiveMonth: p.effectiveMonth,
          promotionDate: p.promotionDate })),
        concessionNow: conc ? { concessionFee: conc.concessionFee,
                                activeMonths: conc.activeMonths || [] } : null,
        concessionSuperseded: hist.map(h => ({ concessionFee: h.concessionFee,
                                activeMonths: h.activeMonths || [],
                                supersededAt: h.supersededAt })),
        monthStatus: s.monthStatus || null,
        perMonth: _FL_MONTHS.map(sm => {
          const full = _FL_S2F[sm];
          const applied = _flAppliedByMonthFromTxs(yrTxs, info.rateForMonth)[full] || 0;
          return { month: full,
                   enginePrice: Number(info.rateForMonth(full)) || 0,
                   currentClassRate: classRate,
                   settled: info.paid.has(full), excused: info.excused.has(full),
                   appliedFromLedger: applied,
                   stillOwing: info.paid.has(full) || info.excused.has(full)
                     ? 0 : Math.max(0, (Number(info.rateForMonth(full)) || 0) - applied) };
        }),
        // Whether the receipts for this year recorded their own prices. Where this is
        // empty, the price a month carried then is NOT reconstructible from the ledger.
        recordedMonthRates: _flRecordedMonthRates(yrTxs, s, curYr)
      });
    }
  });

  rows.sort((a, b) => Number(b.bothOverlap) - Number(a.bothOverlap));
  console.log('[RATE OVERLAP] scanned ' + sSnap.size + ' students for ' + curYr +
    ' — ' + rows.length + ' flagged, ' + rows.filter(r => r.bothOverlap).length +
    ' with BOTH a superseded concession and a mid-year rate change.');
  if (rows.length) console.table(rows);
  if (detail.length) console.log('[RATE OVERLAP] detail:', JSON.stringify(detail[0], null, 2));
  return { academicYear: curYr, scanned: sSnap.size, rows, detail: detail[0] || null };
}

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
  const statusRows = [];   // S1: fee_status disagreements, tracked apart from balance gaps
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
    const _yearInfos = [];
    yearsSet.forEach(yr => {
      if (!yr || !ok) return;
      try {
        const info = _flStudentYearOutstanding(s, txs.filter(t =>
          _normaliseAcademicYear(t.academicYear || '') === yr), yr, { currentYear: curYr });
        engineTotal += Number(info && info.outstanding) || 0;
        _yearInfos.push(info);                       // S1: needed for fee_status
      } catch (_) { ok = false; }
    });
    if (!ok) return;

    // ══════════════════════════════════════════════════════════════════════
    // S1 — fee_status IS CHECKED NOW. IT NEVER WAS.
    //
    // _syncStudentFinancials writes five fields; this verified one of them.
    // previousDues has its own cross-check, remainingBalance is deleted (S2),
    // _flNoGridYears is advisory — fee_status was the one live field with a
    // reader (filters.js) and no verification at all behind it.
    //
    // Computed through _flFeeStatusFor, the same function the writer uses, so
    // this cannot drift from what it is checking.
    //
    // A BLANK status counts as a mismatch, and that is deliberate. S3 removed
    // fee_status from the import and the two provisional writers, so a student
    // whose reconcile never ran now has an aggregate and no status at all — and
    // filters.js matches on the value, so a blank silently matches no filter. If
    // blanks were skipped here, removing those writes would have traded a wrong
    // status for an invisible one. Students with NO aggregate never reach this
    // line; the missing-aggregate row above is their finding.
    // ══════════════════════════════════════════════════════════════════════
    const _statusStored   = String(s.fee_status || '');
    const _statusExpected = _flFeeStatusFor(_yearInfos, engineTotal);

    const departed = _flIsDeparted(s);
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

    // Reported separately from the balance table: a status-only disagreement has
    // a gap of zero, and the table below is sorted and netted BY gap. Folding
    // them together would bury them at the bottom of a list ordered by a number
    // they do not have.
    if (_statusStored.toLowerCase() !== _statusExpected) {
      statusRows.push({
        admissionNo: s.admissionNumber || '', name: s.name || '',
        status: s.status || 'active', class: s.class || '',
        storedStatus: _statusStored || '(blank)', engineSays: _statusExpected,
        outstanding: engineTotal,
        note: !_statusStored
          ? 'NO STORED STATUS — reconcile has not run since this student was written'
          : (_statusExpected === 'partial'
              ? 'holds an open partial — the Partial filter will not find this student'
              : 'stored status disagrees with the engine')
      });
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
  const departedRows = rows.filter(r => _flIsDeparted(r));
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

  // S1: reported on its own line, because a stored fee_status can disagree while
  // every balance matches — bulk-admit, the excused waiver and approvals all
  // write a two-state pending/paid and never emit 'partial'.
  if (statusRows.length) {
    console.warn('[SYNC X-CHECK] fee_status disagrees with the engine on ' + statusRows.length +
      ' student(s). Balances are unaffected; what breaks is the Partial filter and ' +
      'anything else reading the stored status. A reconcile fixes it.');
    console.table(statusRows);
  } else {
    console.log('%c[SYNC X-CHECK] fee_status agrees with the engine on every student.', 'color:green');
  }

  return { rows, statusRows, departed: departedRows, net,
           scanned: sSnap.size, currentYear: curYr };
}

// ════════════════════════════════════════════════════════════════════════════
// THE PRIOR/CURRENT SPLIT, WHICH NOTHING WAS CHECKING.
//
// previewSyncCrossCheck verifies outstandingBalance against the engine summed
// over EVERY tracked year, and it comes back clean. That is a real result, and it
// is also the reason this gap survived: the TOTAL can be right while the split of
// it is wrong.
//
// _syncStudentFinancials writes two numbers. outstandingBalance is the all-years
// total and is verified. previousDues is the prior-years-only slice and is
// verified by nothing. Everything that needs "this year alone" derives it by
// subtraction — _flCurrentYearOutstanding(s) is literally
// outstandingBalance − previousDues — so a stale previousDues leaves the total
// correct, the cross-check green, and every consumer of the split wrong:
//
//   · Terminated and Hidden, the "Outstanding (this year)" column
//   · the past-due banner (icons.js)
//   · Record Payment's prior-dues advisory
//   · the dues export
//
// Two offsetting per-year errors hide the same way: 2024-25 over by 1,000 and
// 2025-26 under by 1,000 sums correctly and shows two wrong figures on the
// profile card, which renders each year separately.
//
// So this reports the PER-YEAR breakdown, not a total: what the engine says each
// prior year owes, what previousDues claims they owe together, and what the
// current-year slice comes to both ways.
//
// Console:
//     const p = await previewPriorYearCrossCheck();
//
// Writes nothing.
// ════════════════════════════════════════════════════════════════════════════

// Pure half, so it is contract-testable without Firestore. Returns the prior-year
// picture for one student: every prior year the engine can see, what each owes,
// and the total those come to.
function _flPriorYearBreakdown(s, txs, curYr) {
  const cur = _normaliseAcademicYear(curYr || _getCurrentAcademicYearStr());
  const yearsSet = new Set();
  if (s.academicYear)           yearsSet.add(_normaliseAcademicYear(s.academicYear));
  if (s.previousAcademicYear)   yearsSet.add(_normaliseAcademicYear(s.previousAcademicYear));
  if (s.openingOutstandingYear) yearsSet.add(_normaliseAcademicYear(s.openingOutstandingYear));
  if (Array.isArray(s.openingOutstandingDues)) {
    s.openingOutstandingDues.forEach(e => { if (e && e.year) yearsSet.add(_normaliseAcademicYear(e.year)); });
  }
  (txs || []).forEach(t => { if (t.academicYear) yearsSet.add(_normaliseAcademicYear(t.academicYear)); });
  try { _flYearFieldMap(s).inferredYears.forEach(y => yearsSet.add(y)); } catch (_) {}

  const years = [];
  let enginePrior = 0;
  Array.from(yearsSet).filter(Boolean).sort().forEach(yr => {
    if (yr === cur) return;                       // prior years only
    let info = null;
    try {
      info = _flStudentYearOutstanding(s, (txs || []).filter(t => _flTxBelongsToYear(t, yr)),
                                       yr, { currentYear: cur, quiet: true });
    } catch (_) { return; }
    const amt = Number(info && info.outstanding) || 0;
    years.push({ year: yr, outstanding: amt, gridExists: !!(info && info.gridExists) });
    enginePrior += amt;
  });
  return { years, enginePrior };
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 4 — ONE COMMAND, ONE VERDICT, AND A RECORD THAT IT RAN.
//
// The diagnostics are only worth having if they are run, and "run three console
// functions and read three outputs" is a habit, not a process. This runs the four
// that are genuine pass/fail checks and prints a single verdict.
//
// previewProfileCardDrift is deliberately NOT one of them. It measures what a card
// WOULD show under the old frozen-balance model against what the engine says, so
// on a healthy system it still reports every student whose stored remainingBalance
// differs — it is a migration-impact report, not a health check. Folding it into
// the verdict would leave this permanently amber, and a permanently amber light is
// one nobody looks at. It runs and reports as information.
//
// The timestamp is per-browser (localStorage), which is a real limitation and is
// said out loud rather than papered over with a Firestore write: these functions
// promise to write nothing, and that promise is worth more than a shared clock.
//
// Console:
//     await previewHealthCheck()
// ════════════════════════════════════════════════════════════════════════════
const _FL_HEALTH_KEY = 'sfms_last_health_check';

function _flHealthLastRun() {
  try {
    const raw = localStorage.getItem(_FL_HEALTH_KEY);
    if (!raw) return null;
    const at = JSON.parse(raw).at;
    return Number.isFinite(at) ? at : null;
  } catch (_) { return null; }
}

// ════════════════════════════════════════════════════════════════════════════
// WHAT DID THE LAST RUN ACTUALLY SAY?
//
// Deliberately separate from _flHealthLastRun rather than widening its return:
// that function answers "when", the contract suite pins it as number-or-null,
// and a reader wanting the age should not have to know about the verdict.
//
// Three states, and the third is the point:
//   true   every pass/fail check was zero
//   false  at least one check failed or could not be loaded
//   null   NOT KNOWN — never run, unreadable storage, or a record written
//          before the verdict was stored. Never treat this as healthy; the
//          whole defect being closed here was a missing answer rendering as
//          a good one.
// ════════════════════════════════════════════════════════════════════════════
function _flHealthLastOutcome() {
  try {
    const raw = localStorage.getItem(_FL_HEALTH_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!Number.isFinite(rec && rec.at)) return null;   // no valid run, no verdict
    return typeof rec.ok === 'boolean' ? rec.ok : null; // legacy record -> unknown
  } catch (_) { return null; }
}

// The checks named by the last run, when it failed. Empty array when it passed,
// was never run, or predates the verdict being stored — callers must read the
// outcome, not the length of this, to tell "passed" from "unknown".
function _flHealthLastFailures() {
  try {
    const raw = localStorage.getItem(_FL_HEALTH_KEY);
    if (!raw) return [];
    const f = JSON.parse(raw).failed;
    return Array.isArray(f) ? f.filter(x => typeof x === 'string') : [];
  } catch (_) { return []; }
}

async function previewHealthCheck() {
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[HEALTH] Principal only.'); return null;
  }
  const t0 = Date.now();
  const checks = [];
  const run = async (label, fn, verdict) => {
    if (typeof fn !== 'function') { checks.push({ check: label, result: 'NOT LOADED', ok: false }); return null; }
    try {
      const r = await fn();
      const v = verdict(r);
      checks.push({ check: label, result: v.text, ok: v.ok });
      return r;
    } catch (e) {
      checks.push({ check: label, result: 'THREW: ' + ((e && e.message) || 'unknown'), ok: false });
      return null;
    }
  };

  console.log('%c[HEALTH] running the four pass/fail checks…', 'font-weight:bold');
  // S1: fee_status counts toward the verdict. It is a field the sync writes and
  // filters.js reads, so a disagreement is a real inconsistency — reporting it
  // without letting it fail would repeat exactly the F3 mistake of a check that
  // detects something and still reads green.
  await run('aggregate vs engine (all years)', typeof previewSyncCrossCheck === 'function' ? previewSyncCrossCheck : null,
    r => ({ ok: r && r.rows.length === 0 && (r.statusRows || []).length === 0,
            text: r ? `${r.rows.length} out of sync of ${r.scanned}` +
                      ((r.statusRows || []).length ? ` · ${r.statusRows.length} fee_status mismatch` : '')
                    : 'no result' }));
  await run('prior/current split', typeof previewPriorYearCrossCheck === 'function' ? previewPriorYearCrossCheck : null,
    r => ({ ok: r && r.rows.length === 0,
            text: r ? `${r.rows.length} disagreeing of ${r.scanned}` : 'no result' }));
  await run('opening-dues scalars', typeof previewStaleDuesEntries === 'function' ? previewStaleDuesEntries : null,
    r => ({ ok: r && r.onActiveStudents === 0,
            text: r ? `${r.onActiveStudents} on active students (${r.total} total)` : 'no result' }));
  await run('unreachable month grids', typeof previewOrphanedMonthGrids === 'function' ? previewOrphanedMonthGrids : null,
    r => ({ ok: r && (r.totalOvercharged || 0) === 0,
            text: r ? `INR ${(r.totalOvercharged || 0).toLocaleString('en-IN')} over-charged` : 'no result' }));

  const failed = checks.filter(c => !c.ok);
  console.table(checks);

  // Informational, for the reason in the header above.
  let driftNote = '(not run)';
  if (typeof previewProfileCardDrift === 'function') {
    try {
      const d = await previewProfileCardDrift();
      driftNote = d ? `${d.rows.length} card(s) would differ under the OLD frozen-balance model ` +
                      `(net INR ${Math.abs(d.net).toLocaleString('en-IN')}) — informational, not a fault`
                    : '(no result)';
    } catch (_) { driftNote = '(threw)'; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RECORD THE VERDICT, NOT JUST THE HOUR.
  //
  // This wrote { at } alone. The dashboard line reads that and classifies on AGE,
  // so a run in which checks FAILED stamped the same "run today" as a clean one —
  // in calm grey, next to a comment claiming nothing here had detected a fault.
  // The one surface built to say the data is unverified was reassuring people
  // immediately after it had proved otherwise.
  //
  // `ok` is the verdict; `failed` names the checks so the line can say which.
  // Older records hold only { at } — those read as outcome UNKNOWN, never as
  // healthy, because a missing verdict is not a passing one.
  // ══════════════════════════════════════════════════════════════════════════
  try {
    localStorage.setItem(_FL_HEALTH_KEY, JSON.stringify({
      at:     Date.now(),
      ok:     failed.length === 0,
      failed: failed.map(f => f.check),
    }));
  } catch (_) {}

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (failed.length === 0) {
    console.log('%c[HEALTH] ALL CLEAR — every pass/fail check is zero. (' + secs + 's)',
      'color:#2a2;font-weight:bold');
  } else {
    console.error('%c[HEALTH] ' + failed.length + ' CHECK(S) FAILED: ' +
      failed.map(f => f.check).join(', ') + '. Scroll up for the detail from each. (' + secs + 's)',
      'color:#c22;font-weight:bold');
  }
  console.log('[HEALTH] profile-card drift: ' + driftNote);
  console.log('[HEALTH] Nothing was written. Run after every bulk import, and monthly otherwise.');
  return { ok: failed.length === 0, checks, drift: driftNote, ranAt: Date.now() };
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 1 OF THE TESTABILITY WORK — THE PROFILE CARD'S PRIOR-YEAR ARITHMETIC,
// LIFTED OUT OF THE TEMPLATE LITERAL IT WAS SEALED INSIDE.
//
// This computation lived inline in students.js, interleaved with the HTML it
// produced, which made it unreachable from the contract suite. Three of the
// defects fixed this week were in these exact lines:
//
//   · the grid ignored excused waivers, so a waived month rendered DUE forever
//   · mCleared did not count EXCUSED, so mDue could never reach zero on a year
//     that was fully accounted for
//   · the mDue===0 override zeroed a real debt when the engine owned the year
//
// None of them could have been caught by a test, because there was nothing a
// test could call. Now there is. MOVED VERBATIM — every branch, every fallback
// and every precedence rule is the code that was there, so this refactor cannot
// change a figure. The render formats what this returns and decides nothing.
//
//   info      one year's bucket from the profile's yearMap: _monthStatus,
//             txList, _monthlyFeeForYear, _monthsCleared, _monthsDue
//   opts      monthlyFee     — fallback rate when the year carries none
//             engineOwnsYear — the engine answered for this year, so the
//                              grid-based override below must not overrule it
//             outstandingIn  — the figure resolved before this branch, which
//                              this function may lower to 0 and returns either way
// ════════════════════════════════════════════════════════════════════════════
function _flProfilePriorYearRow(info, opts) {
  const o        = opts || {};
  const monthly  = Number(o.monthlyFee) || 0;
  const engineOwns = !!o.engineOwnsYear;
  let   outstanding = Number(o.outstandingIn) || 0;
  const txList   = (info && info.txList) || [];

  // The stored snapshot reflects import time only, and for legacy data may predate
  // payments made later through Record Previous Year Dues. Merge the live ledger in
  // so the grid can never show a genuinely-settled month as due.
  const prevStatus = { ...((info && info._monthStatus) || {}) };
  txList.forEach(t => {
    const isWaiver = t.type === 'excused_waiver';
    const months   = isWaiver
      ? (t.monthsExcused && t.monthsExcused.length ? t.monthsExcused : (t.monthsSelected || []))
      : (t.monthsSelected || []);
    months.forEach(m => {
      const shortKey = MONTH_F2S[m] || m;
      if (isWaiver) {
        // A real payment outranks a waiver on the same month: money changed hands,
        // and overwriting PAID with EXCUSED would hide it.
        const cur = (prevStatus[shortKey] || '').toUpperCase();
        if (cur !== 'N/A-PAID' && cur !== 'PAID') prevStatus[shortKey] = 'EXCUSED';
      } else {
        prevStatus[shortKey] = 'N/A-PAID';
      }
    });
  });

  const prevFee = (info && info._monthlyFeeForYear) || monthly;
  const hasGrid = Object.keys(prevStatus).length > 0;

  // With a grid present it is the source of truth the user is looking at. The
  // stored _monthsCleared/_monthsDue counters are captured once at import and
  // drift after later payments, which is what made "Months Cleared" disagree with
  // the pills. EXCUSED counts as cleared — the school settled it, nobody owes it.
  const mCleared = hasGrid
    ? ACAD_MONTHS_SHORT.filter(m => {
        const raw = (prevStatus[m] || '').toUpperCase();
        return raw === 'N/A-PAID' || raw === 'PAID' || raw === 'EXCUSED';
      }).length
    : ((info && info._monthsCleared) != null ? info._monthsCleared : 0);

  const mDue = hasGrid ? (12 - mCleared)
                       : ((info && info._monthsDue) != null ? info._monthsDue : 0);

  // Overrules a stale STORED balance that contradicts a 12/12 grid — but never
  // the engine. The display grid marks a month PAID as soon as any transaction
  // names it, so a PARTIAL month reads cleared here while the engine correctly
  // still carries its shortfall; zeroing that would discard a real debt.
  if (hasGrid && mDue === 0 && !engineOwns) outstanding = 0;

  return { prevStatus, prevFee, hasGrid, mCleared, mDue, outstanding };
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 1 (second half) — THE PROFILE CARD'S CURRENT-YEAR MONTH STATUS.
//
// Sibling of _flProfilePriorYearRow, lifted out of the same template literal for
// the same reason. This is where the paid-at-enrolment defect lived: months
// settled before the student existed in the system have no transaction, so a grid
// built from transactions alone rendered them DUE.
//
// Resolution order is the one that was there, and the order matters:
//   excused  — a waiver wins outright; nobody paid and nobody owes
//   paid     — a transaction naming the month, OR a month settled at enrolment
//   stored   — the document's own monthStatus (Excel import / sync write-back)
//   due      — nothing said otherwise
//
//   s     the student document
//   info  the current year's bucket from yearMap (its txList is already this year)
//   opts  curAcadYear            — normalised current academic year
//         monthStatusIsThisYear  — the relaxed check the outstanding calc uses, so
//                                  the grid and the balance agree about whether
//                                  monthStatus describes THIS year
//         engineInfo             — _flStudentYearOutstanding's result, source of
//                                  the per-month remainder shown on a PARTIAL
// ════════════════════════════════════════════════════════════════════════════
function _flProfileCurrentYearRow(s, info, opts) {
  const o = opts || {};
  const cy = _normaliseAcademicYear(o.curAcadYear || _getCurrentAcademicYearStr());
  const txList = (info && info.txList) || [];

  const paidSet = new Set(), excusedSet = new Set();
  txList.forEach(t => {
    const sel = t.monthsSelected;
    if (sel && Array.isArray(sel)) sel.forEach(m => {
      if (t.type === 'excused_waiver') excusedSet.add(m); else paidSet.add(m);
    });
  });

  // Paid at enrolment — no transaction exists for these, and a grid built from
  // transactions alone reported them DUE. Guarded on the year they were recorded
  // for, the same way every other reader guards it.
  if (s && Array.isArray(s.currentYearPaidMonths) &&
      _normaliseAcademicYear(s.currentYearDueYear) === cy) {
    s.currentYearPaidMonths.forEach(m => paidSet.add(m));
  }

  const stored = o.monthStatusIsThisYear ? ((s && s.monthStatus) || {}) : {};

  // A month the ENGINE is still carrying a shortfall on is partial, whatever the
  // receipt says. Extracting this exposed the disagreement: a month named by any
  // transaction landed in paidSet and rendered PAID, while the remainder below it
  // — which comes from the engine — printed "₹1,200 left" on the same tile. The
  // status and the amount had different authors. Live on ADM-2026-152's February.
  const engPartial = new Set();
  const engInfo = o.engineInfo;
  if (engInfo && engInfo.partialPaid && typeof engInfo.rateForMonth === 'function') {
    Object.entries(engInfo.partialPaid).forEach(([m, applied]) => {
      if ((Number(engInfo.rateForMonth(m)) || 0) - (Number(applied) || 0) > 0) {
        engPartial.add(m);
        engPartial.add(_flShort(m));
      }
    });
  }

  const statusByMonth = {};
  ACAD_MONTHS_SHORT.forEach((short, i) => {
    const full = ACAD_MONTHS_FULL[i];
    let status = 'due';
    if (excusedSet.has(full) || excusedSet.has(short))      status = 'excused';
    else if (engPartial.has(full) || engPartial.has(short)) status = 'partial';
    else if (paidSet.has(full) || paidSet.has(short))       status = 'paid';
    else {
      const raw = (stored[short] || '').toUpperCase();
      if (raw === 'N/A-PAID' || raw === 'PAID') status = 'paid';
      else if (raw === 'PARTIAL')               status = 'partial';
      // EXCUSED was missing here. _syncStudentFinancials writes it into
      // monthStatus, and the prior-year grid already honoured it, but this branch
      // had no case for it — so a waived month whose waiver transaction was not in
      // this year's list fell through to DUE, on a month nobody owes.
      else if (raw === 'EXCUSED')               status = 'excused';
    }
    statusByMonth[short] = status;
  });

  // The remainder on a PARTIAL month, derived — never the frozen tx.monthShortage,
  // which describes the world at the instant one receipt was written and is not
  // revisited by a later payment, a waiver, a concession change or a delete.
  const shortByMonth = {};
  const eng = o.engineInfo;
  if (eng && eng.partialPaid && typeof eng.rateForMonth === 'function') {
    Object.entries(eng.partialPaid).forEach(([m, applied]) => {
      const left = (Number(eng.rateForMonth(m)) || 0) - (Number(applied) || 0);
      if (left > 0) shortByMonth[m] = left;
    });
  }

  return { statusByMonth, shortByMonth, paidSet, excusedSet, storedGrid: stored };
}

async function previewPriorYearCrossCheck() {
  if (typeof currentRole !== 'undefined' && currentRole !== 'principal') {
    console.warn('[PRIOR-YEAR X-CHECK] Principal only.'); return null;
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
    const s   = { id: d.id, ...d.data() };
    const txs = txByStudent[s.id] || [];
    const { years, enginePrior } = _flPriorYearBreakdown(s, txs, curYr);

    // A student with no prior year at all cannot have a prior/current split wrong.
    const storedPrior = Number(s.previousDues);
    if (!years.length && !(Number.isFinite(storedPrior) && storedPrior > 0)) return;

    const storedPriorVal = Number.isFinite(storedPrior) ? storedPrior : null;
    const gap = storedPriorVal === null ? enginePrior : (storedPriorVal - enginePrior);
    if (gap === 0) return;

    // What every consumer of the split actually reads, versus what it should be.
    const agg = Number(s.outstandingBalance);
    const sliceShown  = Number.isFinite(agg) && storedPriorVal !== null
      ? Math.max(0, agg - storedPriorVal) : null;

    rows.push({
      admissionNo: s.admissionNumber || '', name: s.name || '',
      status: s.status || 'active', class: s.class || '',
      priorYears: years.map(y => y.year + ':' + y.outstanding).join('  ') || '(none)',
      enginePrior,
      storedPreviousDues: storedPriorVal === null ? '(missing)' : storedPriorVal,
      gap,
      currentSliceShown: sliceShown === null ? '(unknown)' : sliceShown,
      note: storedPriorVal === null
        ? 'previousDues never written — the current-year slice is the whole aggregate'
        : (gap > 0 ? 'previousDues OVER-states prior years — this year reads too low'
                   : 'previousDues UNDER-states prior years — this year reads too high')
    });
  });

  const net = rows.reduce((a, r) => a + (Number(r.gap) || 0), 0);
  console.log('%c[PRIOR-YEAR X-CHECK] previousDues vs the engine, per year · current year ' + curYr,
    'font-weight:bold');
  console.log('Scanned: ' + sSnap.size + ' students');
  console.log('Prior/current split disagreeing with the engine: ' + rows.length);
  if (rows.length) {
    console.log('NET previousDues movement if corrected: INR ' + net.toLocaleString('en-IN'));
    console.table(rows);
    console.log('%cThe all-years total can still be correct while this is wrong — that is the ' +
      'point of this check. Every figure derived by subtracting previousDues is affected: the ' +
      'Terminated/Hidden "Outstanding (this year)" column, the past-due banner, Record Payment\'s ' +
      'prior-dues advisory and the dues export.', 'color:#c22');
    console.log('Fix: reconcile the listed students — _flReconcileMany(ids, "prior-year-xcheck").');
  } else {
    console.log('%cEvery prior/current split agrees with the engine.', 'color:#2a2');
  }
  console.log('Nothing was written.');
  return { rows, net, scanned: sSnap.size, currentYear: curYr };
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
    // AUDIT: through the shared _flTxBelongsToYear, like every other reader. This
    // was still lenient after the strict conversion, which is the worst place for
    // it to be left: a drift DETECTOR comparing the engine's answer against a
    // figure built from a different set of transactions reports drift that is not
    // there, or misses drift that is. A diagnostic has to bill the same way as the
    // thing it is auditing.
    const curTx = all.filter(t => _flTxBelongsToYear(t, curYr));

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
  const live = rows.filter(r => !_flIsDeparted(r));
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
    if (_flIsDeparted(s)) return;
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
    if (_flIsDeparted(s)) return;   // same exclusion Due Fee uses
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
        // F4: the bulk carve-out. This pass writes to every student in turn, so
        // compare-and-set would contend with its own prior writes and cost 150+
        // transactions for a race a supervised full reconcile should not have.
        // Do not run this during collection hours.
        await _syncStudentFinancials(doc.id, { skipCas: true });
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

    // ══════════════════════════════════════════════════════════════════════════
    // AUDIT F4 — THREE FULL SCANS OF THE LEDGER, PER STUDENT.
    //
    // The per-student loop below reached for allTxs.filter(t => t.studentId ===
    // s.id && _normaliseAcademicYear(t.academicYear) === yr) in three branches.
    // That is students x transactions comparisons, each one normalising a year
    // string, and transactions only ever accumulate — so the screen got slower
    // every year the school operated even with enrolment flat.
    //
    // Measured with this file's own normaliser, on Node, which is faster than
    // the machines this runs on:
    //     500 students /  25,000 tx  ->  12.5M pairs  ->  195 ms
    //   1,200 students / 100,000 tx  -> 120.0M pairs  ->  2.2 s
    // and a render could pay it more than once per student.
    //
    // Indexed once here instead: studentId -> academic year -> that year's
    // transactions. Each year string is normalised exactly once, at build time,
    // rather than once per (student, transaction) pair. The lookups below become
    // O(1) and the whole pass is O(students + transactions).
    //
    // Untagged transactions keep the '' key rather than being dropped, matching
    // the old filter, which compared _normaliseAcademicYear(undefined) and
    // simply failed to match any real year.
    // ══════════════════════════════════════════════════════════════════════════
    const _txByStudentYear = new Map();
    for (const t of allTxs) {
      const sid = t.studentId;
      if (!sid) continue;
      let byYear = _txByStudentYear.get(sid);
      if (!byYear) { byYear = new Map(); _txByStudentYear.set(sid, byYear); }
      const yr = _normaliseAcademicYear(t.academicYear) || '';
      let bucket = byYear.get(yr);
      if (!bucket) { bucket = []; byYear.set(yr, bucket); }
      bucket.push(t);
    }
    const _txFor = (sid, yr) => {
      const byYear = _txByStudentYear.get(sid);
      return (byYear && byYear.get(yr)) || [];
    };

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
      if (_flIsDeparted(s)) return; // ITEM 05.2: Pending Fee excludes hidden students — Hidden section is their dedicated view
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
      if (_flIsDeparted(s)) return; // ITEM 05.2: same exclusion applied to the second pass below
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
        const _openTx = _txFor(s.id, _openingYrNorm);
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
          const _pyTx  = _txFor(s.id, storedAcadYear);
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
          const _pyTx  = _txFor(s.id, prevAcadYrNorm);
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
      ? `<button class="btn btn-primary btn-sm" onclick="pushNav('recordFee',{studentId:'${row.studentId}',studentName:'${jsAttr(row.name)}',classSection:'${row.class} \u2013 Section ${row.section}'})" >Record Payment</button>`
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



