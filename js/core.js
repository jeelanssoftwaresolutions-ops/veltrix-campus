/* ============================================================
   JSS-REF-VELTRIX-2026-003 ITEM 01 FIX — INDIA STANDARD TIME
   System-wide timezone correction (was rendering in the local
   machine's timezone, which drifted to US time on affected
   devices, instead of always showing IST).
   ────────────────────────────────────────────────────────────
   nowIST()  → Date object whose LOCAL getters (getFullYear,
               getMonth, getDate, getHours, getMinutes,
               getSeconds, getDay) already read as IST wall-clock
               time, regardless of the viewing device's own
               timezone setting. Use this instead of `new Date()`
               anywhere "today" / "now" is computed for business
               logic (date-range filters, default form dates,
               "today" comparisons, timestamps written to records).
   fmtDateIST(date, opts) / fmtTimeIST(date, opts)
             → wrappers around toLocaleDateString/toLocaleTimeString
               that force timeZone:'Asia/Kolkata' so anything
               already holding a true Date/Timestamp (e.g. Firestore
               serverTimestamp values, which are always absolute/
               UTC-correct internally) is always DISPLAYED in IST,
               regardless of the viewer's device timezone.
   IST_TZ    → 'Asia/Kolkata', for direct use in any Intl call.
   ============================================================ */
const IST_TZ = 'Asia/Kolkata';

function nowIST() {
  const d = new Date();
  // d.getTime() is an absolute, timezone-independent instant.
  // Shifting it by the device's own offset first "cancels out"
  // the device timezone when local getters are read back, then
  // adding the fixed IST offset lands local getters on IST time.
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 60 * 60 * 1000);
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 — THE conversion from a date-only form value to the
// instant that gets STORED. Every save path must go through this.
//
// THE BUG IT KILLS. A date input yields 'YYYY-MM-DD'. `new Date('2026-07-31')` is
// specified to parse as UTC MIDNIGHT — not local midnight. Stored that way and
// rendered with timeZone 'Asia/Kolkata', it comes back as 05:30 am, because 05:30
// IS the IST offset. Every record written that way carries the same frozen 05:30,
// no matter what time it was actually created. That is why every waiver in Fees
// Excused shows "05:30 am".
//
// Record Payment and Past Due already worked around it inline (BUG-TS-001); the
// excused-waiver path never got the fix, and the same inline expression had been
// copy-pasted between the two that did. One converter instead of three copies and
// four raw `new Date(str)` calls.
//
//   mode 'now'  — an EVENT that happened: the user picks the DATE, and the clock
//                 supplies the time of day, in IST. Receipts, waivers, payments.
//   mode 'noon' — a DATE-ONLY fact where the time is meaningless: admission dates,
//                 effective-from. Anchored at 12:00 IST rather than a boundary, so
//                 no rounding or offset can tip it onto the wrong calendar day.
//
// Returns a real Date at the correct absolute instant, or null on unparseable input
// so a caller can decide rather than silently storing an epoch-zero date.
// ════════════════════════════════════════════════════════════════════════════
const _IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istInstantFromDateInput(dateStr, mode) {
  const m = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const yr = Number(m[1]), mo = Number(m[2]) - 1, dy = Number(m[3]);
  if (mode === 'noon') {
    return new Date(Date.UTC(yr, mo, dy, 12, 0, 0, 0) - _IST_OFFSET_MS);
  }
  // 'now' (default): that calendar date, at the current IST wall-clock time.
  const n = nowIST();   // local getters on this read as IST
  return new Date(Date.UTC(yr, mo, dy, n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds())
                  - _IST_OFFSET_MS);
}

// Firestore Timestamp wrapper for the same. Falls back to the current instant when
// the input cannot be parsed — a stored record must never carry epoch zero.
function istTimestampFromDateInput(dateStr, mode) {
  const d = istInstantFromDateInput(dateStr, mode) || new Date();
  return firebase.firestore.Timestamp.fromDate(d);
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 — THE resolution of "whatever I was handed" to a Date.
//
// The STORAGE side of the 05:30 bug is fixed by istInstantFromDateInput. This is
// the DISPLAY side of the same bug, and it bites even on correctly-stored data:
// hand any of these formatters a bare 'YYYY-MM-DD' and `new Date(str)` parses it
// as UTC midnight, so it renders as 05:30 am in IST. Same frozen number, different
// half of the system.
//
// A date-only string carries no time, so the only sane reading is "noon IST on that
// day" — never a boundary that an offset can push onto the wrong date. Anything
// with a time component, a Firestore Timestamp, or a Date is passed through
// untouched: those already denote a real instant.
// ════════════════════════════════════════════════════════════════════════════
function _toInstant(v) {
  if (v == null || v === '') return null;
  if (v.toDate) return v.toDate();                    // Firestore Timestamp
  if (v instanceof Date) return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    return istInstantFromDateInput(v, 'noon');        // date-only -> 12:00 IST, not UTC midnight
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDateIST(date, opts) {
  const d = _toInstant(date) || nowIST();
  return d.toLocaleDateString('en-IN', Object.assign({ timeZone: IST_TZ }, opts || {}));
}

function fmtTimeIST(date, opts) {
  const d = _toInstant(date) || nowIST();
  return d.toLocaleTimeString('en-IN', Object.assign({ timeZone: IST_TZ }, opts || {}));
}

/* ============================================================
   PHASE 4 — LANDSCAPE SLIDESHOW ENGINE (#12 + #13)
   Cycles 11 slides every 10s with smooth 1.4s cross-fade.
   Runs on all screens (login, splash, app) because #slideshow
   is fixed behind everything.
   ============================================================ */
(function initSlideshow() {
  const slides = document.querySelectorAll('.slide');
  if (!slides.length) return;
  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('active');
  }, 10000); // 10 seconds per slide
})();

/* ============================================================
   PHASE 4 — DIGITAL CLOCK ENGINE (#13)
   Injected into dashboards via renderDigitalClock().
   Updates every second, no visible flicker.
   ============================================================ */
let _clockInterval = null;

function renderDigitalClock() {
  // Clear any existing clock interval to avoid duplicates on re-render
  if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }

  function tick() {
    const now   = nowIST(); // JSS-REF-VELTRIX-2026-003 ITEM 01 FIX — always IST, never the device's own timezone
    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    if (!timeEl || !dateEl) { clearInterval(_clockInterval); _clockInterval = null; return; }
    const hh  = String(now.getHours()).padStart(2,'0');
    const mm  = String(now.getMinutes()).padStart(2,'0');
    const ss  = String(now.getSeconds()).padStart(2,'0');
    timeEl.textContent = `${hh}:${mm}:${ss}`;
    dateEl.textContent = fmtDateIST(new Date(), {weekday:'short', day:'2-digit', month:'short', year:'numeric'});
  }
  tick(); // Run immediately to avoid 1s blank flash
  _clockInterval = setInterval(tick, 1000);
}

/* ============================================================
   FIREBASE CONFIG — REPLACE WITH YOUR ACTUAL CONFIG
   ============================================================ */
/* ============================================================
   FIRESTORE SECURITY RULES — NOT HERE, BY DESIGN.

   The authoritative ruleset is  firestore.rules  at the repo root (ARC-018 +
   ARC-019 with the JSS-REF-VELTRIX-2026-005 ITEM 3 structural-lock fix), and it
   is confirmed to match what is published in Firebase Console.

   A ~270-line commented COPY of an older ruleset used to sit here. It was removed
   because it was actively harmful, not merely redundant:

     · It had drifted from what is live — it predated ARC-019 (principal-only
       excused waivers) and carried no concessionFees block at all, though the
       live rules do cover that collection. Reading this block as if it were
       current is what produced a wrong "concessionFees will default-deny"
       conclusion once already.
     · A commented-out copy cannot be diffed, reviewed, or deployed, so it could
       never be the source of truth it looked like.
     · It shipped the access-control model to every browser. Rules are not
       secrets and security does not depend on hiding them, but there is no
       reason to hand a stale map of the permission surface to anyone who opens
       DevTools.

   Deployment remains manual: paste firestore.rules into
   Firebase Console → Firestore Database → Rules → Publish.
   ============================================================ */
const firebaseConfig = {
  apiKey:            "AIzaSyBvwkjy-wOlDRfr05bEuh9BCXtmCZqyZ0I",
  authDomain:        "veltrix-campus.firebaseapp.com",
  projectId:         "veltrix-campus",
  storageBucket:     "veltrix-campus.firebasestorage.app",
  messagingSenderId: "726127791296",
  appId:             "1:726127791296:web:2a4f75c0f62dc5839c3125"
};

// BUG-I01 NOTE: Firebase config (apiKey, projectId) is visible in client HTML.
// This is expected — Firebase API keys are not secrets; security is enforced by Firestore Rules.
// ACTION REQUIRED: Enable Firebase App Check (https://firebase.google.com/docs/app-check)
// to restrict API access to your authorised domain only, preventing abuse from external scripts.
// SIGN-IN FIX: Guard against Firebase loading failure (e.g. network error, CDN blocked,
// or file:// origin). Without this, any uncaught error here crashes the entire script and
// doLogin() silently ceases to exist — making the Sign In button appear dead.
let auth, db;
try {
  if (typeof firebase === 'undefined') throw new Error('Firebase SDK not loaded.');
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db   = firebase.firestore();
} catch (_firebaseInitErr) {
  // Show a clear error on the login card instead of silent failure.
  window.addEventListener('DOMContentLoaded', () => {
    const isFileProtocol = location.protocol === 'file:';
    const errBox = document.getElementById('loginErr');
    const btn    = document.getElementById('loginBtn');
    if (errBox) {
      errBox.style.display = 'block';
      errBox.innerHTML = isFileProtocol
        ? '⚠️ <strong>Cannot sign in from a local file.</strong> Please serve this file via a web server (e.g. VS Code Live Server, <code>npx serve</code>, or deploy to hosting).'
        : '⚠️ <strong>Failed to connect to Firebase.</strong> Check your internet connection and reload the page.';
    }
    if (btn) btn.disabled = true;
  });
}

/* ============================================================
   FIX BUG-C01 + BUG-C02: LOCAL ACCOUNT SYSTEM REMOVED
   Single auth path — Firebase Auth only.
   All users must exist in Firebase Authentication + Firestore users collection.
   Schema: users/{uid} → { role, name, schoolId, email, designation, phone, ... }
   ============================================================ */

/* ============================================================
   THE SCHOOL-HOURS LOCK IS GONE — ALL OF IT, NOT HALF.

   It had been switched off in two different places and left standing in
   four: isWithinSchoolHours() returned a hardcoded true, currentTimeLock
   was nulled here regardless of what Firestore held, and the screen plus
   the message builder behind it could no longer be reached by anything.

   The session-expiry stamp in app-shell-nav.js still read the config and
   still computed a close-of-day instant with setHours — on the DEVICE's
   clock, while every other time decision in this codebase goes through
   nowIST(). That branch could not actually fire, because the config it
   tested was permanently null; but a live-looking wrong-clock computation
   sitting inside a feature nobody had finished deleting is precisely the
   thing that gets switched back on one day and misbehaves quietly.

   schools/{schoolId}.timeLock in Firestore is now simply ignored — no
   reader remains. The generic 8-hour session expiry is a SEPARATE feature
   and stays; it never depended on school hours.
   ============================================================ */

// Load school config (per-tenant settings) from Firestore.
// Called after loadUserProfile() so currentSchoolId is available.
// BUG-H01 + BUG-H02 FIX: Also loads per-tenant feeSchedule and class/section structure.
async function loadSchoolConfig() {
  _tenantFeeSchedule = null;
  _tenantClassList   = null;
  _tenantSections    = null;
  if (!currentSchoolId) return;
  try {
    const doc = await db.collection('schools').doc(currentSchoolId).get();
    const data = doc.exists ? doc.data() : {};

    // ══════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-005 L6 — "editing ONE class changed ALL the rates".
    //
    // This gate was ALL-OR-NOTHING. It demanded that EVERY key in
    // _DEFAULT_FEE_SCHEDULE be present in the stored config with a value > 0; if a
    // single one failed, `fsValid` went false and the ENTIRE saved schedule was
    // thrown away and replaced by the built-in defaults. One bad or missing class,
    // and every other class the Principal had ever configured silently reverted.
    //
    // Two ordinary actions trip it:
    //   · setting any class to 0        -> `fs[k] > 0` fails -> whole map discarded
    //   · a class missing from the map  -> `k in fs` fails   -> whole map discarded
    //
    // And it is self-reinforcing with saveFeeStructure(), which writes
    // 'config.feeSchedule' as a WHOLE-MAP REPLACE built only from the inputs on
    // screen. The grid renders `Object.entries(getFeeSchedule())` — so once the
    // defaults have been substituted, a save persists exactly those defaults over
    // the real rates. Revert, save, and the corruption is permanent.
    //
    // Fixed by making the merge PER KEY instead of all-or-nothing: every stored rate
    // that is a positive number is trusted on its own merits, and a default is used
    // only for a class the stored map genuinely lacks. A single bad entry can now
    // only affect that one class. Anything rejected is named in the console rather
    // than silently swallowed, so a bad value is diagnosable.
    // ══════════════════════════════════════════════════════════════════════════
    const fs = data.config?.feeSchedule;
    const defaultKeys = Object.keys(_DEFAULT_FEE_SCHEDULE);
    const _fsIsObj = !!(fs && typeof fs === 'object');
    const _fsRejected = [];
    if (_fsIsObj) {
      defaultKeys.forEach(k => {
        if (!(typeof fs[k] === 'number' && fs[k] > 0)) {
          _fsRejected.push(k + '=' + JSON.stringify(fs[k]));
        }
      });
      if (_fsRejected.length) {
        console.warn('[FEE SCHEDULE] Using the built-in default for ' + _fsRejected.length +
          ' class(es) whose stored rate is missing or not a positive number: ' +
          _fsRejected.join(', ') + '. Every OTHER stored rate is kept as-is.');
      }
    }

    // BUG-⑨ FIX: Also read feeCategoryConfig and merge its rates into the fee schedule.
    // renderFeeOnboarding() saves per-class rates under schools/{id}.feeCategoryConfig,
    // but the fee engine was only ever reading config.feeSchedule — the two systems were
    // completely disconnected. We now build a merged schedule so configured rates take effect.
    const feeCatConfig = data.feeCategoryConfig;
    // PER-KEY merge: start from the defaults so no class can go missing, then let
    // every VALID stored rate override its own class. One bad entry no longer costs
    // the others their configured value.
    let mergedSchedule = { ..._DEFAULT_FEE_SCHEDULE };
    // ══════════════════════════════════════════════════════════════════════════
    // REMEMBER WHICH RATES ARE REAL AND WHICH ARE GUESSES.
    //
    // Starting from the defaults means a class with no stored rate silently
    // acquires one. That is right for BILLING — a missing rate must not price a
    // student at zero — but it is dangerous for EDITING, because the Fee Structure
    // form renders whatever is in here and a save writes it straight back. A
    // substituted default the Principal never chose then becomes the stored rate,
    // permanently, and nothing ever says so.
    //
    // That is the surviving half of L6. L6 stopped a save ERASING classes absent
    // from the form; it did nothing about a save OVERWRITING a present class with
    // a guess. Grade 9 here is 1,900 — one missing key and a single save would
    // pin it at the 1,700 default, under-billing every Grade 9 student by 200 a
    // month with no error anywhere.
    //
    // So track provenance. saveFeeStructure refuses to persist a rate that came
    // from this fallback unless the Principal actually typed a different value.
    // ══════════════════════════════════════════════════════════════════════════
    const _fromStore = new Set();
    if (_fsIsObj) {
      Object.entries(fs).forEach(([cls, rate]) => {
        if (typeof rate === 'number' && rate > 0) { mergedSchedule[cls] = rate; _fromStore.add(cls); }
      });
    }
    if (feeCatConfig && typeof feeCatConfig === 'object') {
      Object.entries(feeCatConfig).forEach(([cls, cfg]) => {
        // feeCategoryConfig values can be a plain number or an object with a `rate` key
        const rate = typeof cfg === 'number' ? cfg : (cfg?.rate ?? cfg?.monthlyFee ?? null);
        if (rate != null && Number(rate) > 0) {
          mergedSchedule[cls] = Number(rate);
          _fromStore.add(cls);
        }
      });
    }
    _tenantFeeSchedule = mergedSchedule;
    _tenantFeeScheduleSubstituted = Object.keys(mergedSchedule).filter(c => !_fromStore.has(c));
    _tenantFeeScheduleTrusted     = true;
    if (_tenantFeeScheduleSubstituted.length) {
      console.warn('[FEE SCHEDULE] ' + _tenantFeeScheduleSubstituted.length + ' class(es) have NO ' +
        'stored rate and are showing a built-in default: ' + _tenantFeeScheduleSubstituted.join(', ') +
        '. Billing uses it, but Fee Structure will NOT save it back unless you type a rate ' +
        'yourself — otherwise a guess would become the official fee.');
    }

    // BUG-H02 FIX: class list + sections from Firestore config
    const cl  = data.config?.classList;
    const sec = data.config?.sections;
    _tenantClassList = (Array.isArray(cl)  && cl.length  > 0) ? cl  : [..._DEFAULT_CLASS_LIST];

    // BUG-P14 FIX: Expand sections A–C to A–E.
    // If the stored config.sections is missing D or E (i.e. was saved as ['A','B','C']),
    // upgrade it to the full 5-section default and persist the new value to Firestore
    // so dropdowns, filters, and Academic Structure all reflect A–E immediately.
    if (Array.isArray(sec) && sec.length > 0) {
      const hasDE = sec.includes('D') && sec.includes('E');
      if (!hasDE) {
        // Merge existing sections with the full default (preserves any custom entries)
        const upgraded = [...new Set([...sec, ..._DEFAULT_SECTIONS])].sort();
        _tenantSections = upgraded;
        // Persist silently — non-blocking, non-fatal
        db.collection('schools').doc(currentSchoolId).update({ 'config.sections': upgraded })
          .catch(e => console.warn('BUG-P14: Could not persist upgraded sections:', e.message));
      } else {
        _tenantSections = sec;
      }
    } else {
      _tenantSections = [..._DEFAULT_SECTIONS];
    }

  } catch(e) {
    console.warn('Could not load school config:', e.message);
    // Fail open — use defaults so users are never locked out by a config error.
    // Failing open is right for READING: nobody should be blocked from recording a
    // payment because a config fetch blipped. It is NOT right for WRITING. Every
    // rate below is now a guess, so the schedule is marked UNTRUSTED and Fee
    // Structure refuses to save until a successful load replaces it. Otherwise one
    // save during a network blip would overwrite the whole school's real fees with
    // built-in defaults, and nothing would ever say it happened.
    _tenantFeeSchedule = { ..._DEFAULT_FEE_SCHEDULE };
    _tenantClassList   = [..._DEFAULT_CLASS_LIST];
    _tenantSections    = [..._DEFAULT_SECTIONS];
    _tenantFeeScheduleSubstituted = Object.keys(_DEFAULT_FEE_SCHEDULE);
    _tenantFeeScheduleTrusted     = false;
    console.error('[FEE SCHEDULE] Config load FAILED — every rate on screen is a built-in ' +
      'default, not this school\'s. Billing continues so nobody is locked out, but Fee ' +
      'Structure will refuse to save until a reload succeeds.');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// F8 — "HAS THIS STUDENT LEFT THE LIVE ROLL?", DEFINED ONCE.
//
// This predicate was written out by hand in thirteen places across four modules.
// Every copy agreed, which is exactly why it was worth collapsing: they agreed
// until one of them didn't, and nothing would have reported the day that changed.
//
// Departed means terminated OR hidden. Both keep their document in /students —
// moveStudentToHidden and the termination paths only set status — so every
// aggregate, dashboard tile and export has to exclude them explicitly rather
// than relying on the collection to have shrunk.
//
// NOT applied to two deliberate exceptions, which are annotated where they sit:
// the Students screen (its own Show/Hide Terminated toggle) and the student
// database export (carries a Status column and is meant to list everyone).
// Those exclude only 'hidden', and that is a decision, not a divergence.
// ════════════════════════════════════════════════════════════════════════════
function _flIsDeparted(s) {
  const st = String((s && s.status) || '').toLowerCase();
  return st === 'terminated' || st === 'hidden';
}

// ════════════════════════════════════════════════════════════════════════════
// MAY THIS VIEWER SEE A DEPARTED STUDENT AT ALL?
//
// Not "may they pay one" — _flPaymentGuard answers that. This is the earlier
// question: whether the record should be visible in the first place.
//
// It was answered nowhere. An Admin could reach a HIDDEN student through global
// search — listed, and mislabelled "Terminated" — open their full profile, and
// read guardian, contact, the twelve-month grid, the concession rate and the
// outstanding. The Hidden module's own confirmation promises those students are
// "hidden from all reports, dashboard totals, and Admin views".
//
// Terminated is included by the same decision: an Admin has no business in the
// departed roll, and the Terminated section is already Principal-only, so
// leaving them visible in search and the student list contradicted the section
// that owns them.
//
// One predicate, because a half-applied access rule is worse than either state —
// gating the profile but not the search leaks the roster and looks broken.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// IS THIS MONTH SETTLED? — THE THIRD STATE KEEPS BEING FORGOTTEN.
//
// A month grid holds five spellings: N/A-PAID, PAID, EXCUSED, DUE, PARTIAL. The
// first three are settled — nothing is owed, whether it was collected or waived.
// Only DUE and PARTIAL mean money.
//
// Written out by hand, that rule has now been got wrong five times, always the
// same way: a test lists the two "paid" spellings and forgets EXCUSED exists.
//
//   past-due grid      offered waived months for collection, in red
//   promotion          carried a waived month into the new grade as a debt
//   profile card       stored-grid fallback rendered a waived month DUE
//   concession editor  offered to set a rate on a waived month
//   months-cleared     counted only N/A-PAID, undercounting a cleared year
//
// Not a rule anyone disputes — a rule nobody could see they were re-writing. So
// it is written once, here, next to _flIsDeparted, and contract test 110 pins it.
//
// Trims and upper-cases: status reaches these grids from imports and hand edits,
// and " excused" matching nothing is exactly how the third state disappears.
// ════════════════════════════════════════════════════════════════════════════
function _flStatusIsSettled(status) {
  const st = String(status == null ? '' : status).trim().toUpperCase();
  return st === 'N/A-PAID' || st === 'PAID' || st === 'EXCUSED';
}

function _flMaySeeDeparted() {
  return (typeof currentRole !== 'undefined') && currentRole === 'principal';
}

let currentUser     = null;  // Firebase Auth user object
let currentRole     = null;  // 'admin' | 'principal'
let currentProfile  = null;  // Firestore users/{uid} document data
let currentSchoolId = null;  // Multi-tenant school isolation key
let navStack        = [];    // Navigation history
let currentView     = null;  // Active view name
let searchDebounce  = null;
let pendingCount    = 0;

// BUG-H01 FIX: Per-tenant fee schedule (loaded from Firestore schools/{id}.config.feeSchedule)
// BUG-H02 FIX: Per-tenant class list + sections (loaded from Firestore schools/{id}.config)
// All fall back to Colonel defaults so single-tenant deployment is unaffected.
let _tenantFeeSchedule = null;
let _tenantClassList   = null;
let _tenantSections    = null;
// Provenance for the fee schedule. Billing may fall back to a default; EDITING may
// not persist one. See the merge in loadSchoolConfig and the guard in
// saveFeeStructure — together they stop a guessed rate becoming the official fee.
let _tenantFeeScheduleSubstituted = null;   // classes showing a built-in default
let _tenantFeeScheduleTrusted     = false;  // false = the config read itself failed

const _DEFAULT_FEE_SCHEDULE = {
  'Nursery':1700,'LKG':1700,'UKG':1700,
  'Grade 1':1700,'Grade 2':1700,'Grade 3':1700,'Grade 4':1700,'Grade 5':1700,
  'Grade 6':1800,'Grade 7':1800,'Grade 8':1800,
  'Grade 9':1900,'Grade 10':2100
};
const _DEFAULT_CLASS_LIST = ['Nursery','LKG','UKG','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10'];
const _DEFAULT_SECTIONS   = ['A','B','C','D','E'];

/* ============================================================
   PHASE 1 — BLOCK-WISE STRUCTURE (#14)
   Two root blocks: Boys Block and Girls Block.
   All student records, fees, and reports carry blockId.
   ============================================================ */
const BLOCKS = ['Boys Block', 'Girls Block'];

// ════════════════════════════════════════════════════════════════════════════
// THE ACADEMIC YEAR, DECLARED ONCE.
//
// AUDIT F9 — the June-to-May month list was written out thirteen times across
// seven files, and the short/full month map five more times. None of the copies
// disagreed when the audit ran; that is the whole reason to consolidate them now
// rather than after one does.
//
// This is the shape of every defect fixed in this refactor cycle: one fact
// expressed in several places, and eventually one of them updated. The snapshot
// field mapping had six copies before it was reduced to _flSnapshotPatch; the
// per-year outstanding calculation had four before _flStudentYearOutstanding.
// Both were consolidated only after they had already drifted and produced wrong
// figures on screen.
//
// core.js is first in index.html, so these are safe to reference from any other
// module at top level, not merely inside a function.
//
// Frozen deliberately. These are shared instances now, so a stray push() or
// sort() at one call site would silently reorder the academic year everywhere
// else. Frozen, that attempt throws in strict mode and is a no-op otherwise —
// either way it cannot corrupt another screen. Nothing mutates them today; this
// keeps it that way.
// ════════════════════════════════════════════════════════════════════════════
const ACAD_MONTHS_FULL = Object.freeze([
  'June','July','August','September','October','November','December',
  'January','February','March','April','May'
]);
const ACAD_MONTHS_SHORT = Object.freeze([
  'Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'
]);
// Short -> full ('Jun' -> 'June') and the reverse. Derived from the two arrays
// above rather than typed out again, so a change to either list cannot leave the
// maps describing a different year than the arrays do.
const MONTH_S2F = Object.freeze(Object.fromEntries(
  ACAD_MONTHS_SHORT.map((s, i) => [s, ACAD_MONTHS_FULL[i]])));
const MONTH_F2S = Object.freeze(Object.fromEntries(
  ACAD_MONTHS_FULL.map((f, i) => [f, ACAD_MONTHS_SHORT[i]])));
function getBlocks() { return BLOCKS; }

/* ============================================================
   GENDER → BLOCK AUTO-WIRING
   Male   → Boys Block
   Female → Girls Block
   Other  → no auto-assign (user selects manually)
   ============================================================ */
function genderToBlock(gender) {
  if (!gender) return null;
  const g = gender.trim().toLowerCase();
  if (g === 'male')   return 'Boys Block';
  if (g === 'female') return 'Girls Block';
  return null; // 'Other' — no auto-assign
}

/**
 * Called onchange of any gender dropdown.
 * blockFieldId : the id of the block <select> to update.
 * If gender maps to a block — set the block value and lock the field.
 * If gender is 'Other' or blank — unlock and let user pick manually.
 */
function syncBlockFromGender(genderFieldId, blockFieldId) {
  const gEl = document.getElementById(genderFieldId);
  const bEl = document.getElementById(blockFieldId);
  if (!gEl || !bEl) return;
  const mapped = genderToBlock(gEl.value);
  if (mapped) {
    bEl.value    = mapped;
    bEl.disabled = true;
    bEl.title    = `Auto-assigned from gender (${gEl.value})`;
    bEl.style.opacity = '0.7';
    bEl.style.cursor  = 'not-allowed';
  } else {
    bEl.disabled = false;
    bEl.title    = '';
    bEl.style.opacity = '';
    bEl.style.cursor  = '';
  }
}

/* ============================================================
   CHG-012 — Single Admin + Single Principal (no block-scoped accounts)
   Block (Boys/Girls) is a DATA FILTER on student records, not an auth boundary.
   Both Admin and Principal see ALL blocks by default; filter is optional via UI.
   ============================================================ */
let currentUserBlock  = null;  // CHG-012: always null — block lives on student.block, not user identity
let currentViewBlock  = null;  // CHG-012: always null — use UI block filter instead

function isReadOnlyView() {
  // CHG-012: No block-scoped read-only restriction. Both roles read & write all blocks.
  return false;
}

function canWrite() { return true; }

// CHG-012: switchViewBlock kept as no-op to avoid breaking residual call sites.
function switchViewBlock(block) {
  // Block switching is now handled via the UI data filter, not by changing auth context.
}

function getFeeSchedule() { return _tenantFeeSchedule || _DEFAULT_FEE_SCHEDULE; }
// Which classes are showing a built-in default rather than a stored rate, and did
// the config read succeed at all. Reading may fall back; writing may not.
function getFeeScheduleSubstituted() { return _tenantFeeScheduleSubstituted || []; }
function isFeeScheduleTrusted()      { return _tenantFeeScheduleTrusted === true; }
function getClassList()   { return _tenantClassList   || _DEFAULT_CLASS_LIST; }
function getSections()    { return _tenantSections    || _DEFAULT_SECTIONS; }

/* ============================================================
   ENH-017-UNIFIED: Multi-select Section Dropdown Factory
   Usage:
     _mkSecDropdown(prefix, sections, onChangeCb)
       prefix     – unique string for DOM ids, e.g. 'ff', 'cs', 'fe_pf'
       sections   – array of section labels, e.g. ['A','B','C']
       onChangeCb – function(selectedArray) called on every change
                    selectedArray is [] when "All Sections" is active

   DOM ids created:
     #{prefix}_secDdWrap  – outer wrapper
     #{prefix}_secDdBtn   – the button/trigger
     #{prefix}_secDdLabel – text span inside button
     #{prefix}_secDdPanel – dropdown panel

   State read: window['_secDdState_'+prefix] → []|['A','B',...]
   ============================================================ */
function _mkSecDropdown(prefix, sections, onChangeCb) {
  const stateKey = '_secDdState_' + prefix;
  window[stateKey] = []; // [] = All Sections

  function _selected() { return window[stateKey] || []; }

  function _labelText() {
    const sel = _selected();
    if (!sel.length) return 'All Sections';
    if (sel.length === 1) return 'Section ' + sel[0];
    return sel.length + ' Sections';
  }

  function _badgeHtml() {
    const sel = _selected();
    return sel.length ? `<span class="sec-dd-badge">${sel.length}</span>` : '';
  }

  // Panel lives on <body> — never inside any card/backdrop-filter context.
  // We create it once and reuse it.
  function _ensurePanel() {
    let panel = document.getElementById(prefix + '_secDdPanel');
    if (panel) return panel;
    const itemsHtml = sections.map(sec => `
      <div class="sec-dd-item" onclick="_secDdItemClick(event,'${prefix}','${sec}')">
        <input type="checkbox" data-sec="${sec}" checked>
        <span>Section ${sec}</span>
      </div>`).join('');
    panel = document.createElement('div');
    panel.id        = prefix + '_secDdPanel';
    panel.className = 'sec-dd-panel';
    panel.innerHTML = `
      <div class="sec-dd-item all-item checked" onclick="_secDdAllClick(event,'${prefix}')">
        <input type="checkbox" data-sec-all checked>
        <span>All Sections</span>
      </div>
      ${itemsHtml}`;
    document.body.appendChild(panel);
    return panel;
  }

  function _syncUI() {
    const sel   = _selected();
    const isAll = sel.length === 0;
    // Update button label + highlight
    const labelEl = document.getElementById(prefix + '_secDdLabel');
    if (labelEl) labelEl.innerHTML = _labelText() + _badgeHtml();
    const btn = document.getElementById(prefix + '_secDdBtn');
    if (btn) btn.classList.toggle('active', !isAll);
    // Update panel checkboxes (panel may be on body)
    const panel = document.getElementById(prefix + '_secDdPanel');
    if (!panel) return;
    const allCb = panel.querySelector('[data-sec-all]');
    if (allCb) allCb.checked = isAll;
    const allItem = allCb?.closest('.sec-dd-item');
    if (allItem) allItem.classList.toggle('checked', isAll);
    sections.forEach(sec => {
      const cb = panel.querySelector(`[data-sec="${sec}"]`);
      if (!cb) return;
      const checked = !isAll && sel.includes(sec);
      cb.checked = checked;
      const item = cb.closest('.sec-dd-item');
      if (item) item.classList.toggle('checked', checked);
    });
  }

  function _togglePanel(force) {
    const panel = _ensurePanel();
    const btn   = document.getElementById(prefix + '_secDdBtn');
    if (!btn) return;
    const open = force !== undefined ? force : !panel.classList.contains('open');
    if (open) {
      // Close all other open panels first
      document.querySelectorAll('.sec-dd-panel.open').forEach(p => {
        if (p.id !== prefix + '_secDdPanel') {
          p.classList.remove('open');
          const ob = document.getElementById(p.id.replace('_secDdPanel','_secDdBtn'));
          if (ob) ob.classList.remove('open');
        }
      });
      // Position directly under the button using viewport coords
      const rect = btn.getBoundingClientRect();
      panel.style.top      = (rect.bottom + 4) + 'px';
      panel.style.left     = rect.left + 'px';
      panel.style.minWidth = Math.max(180, rect.width) + 'px';
    }
    panel.classList.toggle('open', open);
    btn.classList.toggle('open', open);
  }

  function _toggleAll() {
    window[stateKey] = [];
    _syncUI();
    onChangeCb([]);
  }

  function _toggleSec(sec, checked) {
    let sel = _selected().slice();
    if (checked) {
      if (!sel.includes(sec)) sel.push(sec);
    } else {
      sel = sel.filter(s => s !== sec);
    }
    if (sel.length === sections.length) sel = [];
    window[stateKey] = sel;
    _syncUI();
    onChangeCb(sel.slice());
  }

  function _build() {
    // Only the button goes in the card DOM. Panel is appended to <body> on first open.
    return `
      <div class="sec-dd-wrap" id="${prefix}_secDdWrap">
        <div class="sec-dd-btn" id="${prefix}_secDdBtn"
             onclick="_secDdToggle(event,'${prefix}')">
          <span id="${prefix}_secDdLabel">All Sections</span>
          <span class="sec-dd-chevron">▾</span>
        </div>
      </div>`;
  }

  if (!window._secDdRegistry) window._secDdRegistry = {};
  window._secDdRegistry[prefix] = { toggleAll: _toggleAll, toggleSec: _toggleSec, togglePanel: _togglePanel, syncUI: _syncUI, ensurePanel: _ensurePanel };

  return { html: _build(), syncUI: _syncUI };
}

// Global dispatch functions (called from inline onclick in generated HTML)
function _secDdToggle(e, prefix) {
  e.stopPropagation();
  // Ensure panel exists on body before toggling
  window._secDdRegistry?.[prefix]?.ensurePanel?.();
  window._secDdRegistry?.[prefix]?.togglePanel();
}
function _secDdAllClick(e, prefix) {
  e.stopPropagation();
  window._secDdRegistry?.[prefix]?.toggleAll();
}
function _secDdItemClick(e, prefix, sec) {
  e.stopPropagation();
  const r = window._secDdRegistry?.[prefix]; if (!r) return;
  const cb = e.currentTarget.querySelector('input[type=checkbox]');
  const newChecked = cb ? !cb.checked : true;
  r.toggleSec(sec, newChecked);
}

// Close all open panels on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.sec-dd-panel.open').forEach(p => {
    const prefix = p.id.replace('_secDdPanel', '');
    p.classList.remove('open');
    const btn = document.getElementById(prefix + '_secDdBtn');
    if (btn) btn.classList.remove('open');
  });
});

// Reposition body-level panels on scroll or resize
function _secDdReposition() {
  document.querySelectorAll('.sec-dd-panel.open').forEach(panel => {
    const prefix = panel.id.replace('_secDdPanel', '');
    const btn = document.getElementById(prefix + '_secDdBtn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 4) + 'px';
    panel.style.left = rect.left + 'px';
  });
}
window.addEventListener('scroll', _secDdReposition, true);
window.addEventListener('resize', _secDdReposition);

// Expose getter for reading selected sections from a dropdown
function _secDdGet(prefix) {
  return window['_secDdState_' + prefix] || [];
}
/* ── End ENH-017-UNIFIED ──────────────────────────────────────────────── */

