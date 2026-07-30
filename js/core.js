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

function fmtDateIST(date, opts) {
  const d = (date && date.toDate) ? date.toDate() : (date ? new Date(date) : nowIST());
  return d.toLocaleDateString('en-IN', Object.assign({ timeZone: IST_TZ }, opts || {}));
}

function fmtTimeIST(date, opts) {
  const d = (date && date.toDate) ? date.toDate() : (date ? new Date(date) : nowIST());
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
   FIRESTORE SECURITY RULES — VELTRIX CAMPUS (ROBUST, FULL SCHEMA)
   Apply these in Firebase Console → Firestore Database → Rules tab.
   ─────────────────────────────────────────────────────────────────
   SCHEMA OVERVIEW
   ───────────────
   /users/{uid}                         → user profile (role, schoolId, name, email …)
   /schools/{schoolId}/
     students/{id}                      → active students
     terminatedStudents/{id}            → terminated students (principal writes, both read)
     hiddenStudents/{id}                → hidden students (principal writes, both read)
     legacyStudents/{id}                → Grade-10 graduates (principal writes, both read)
     feeTransactions/{id}              → fee payment records (both write, both read)
     hiddenFeeTransactions/{id}        → fee records for hidden students
     deletionRequests/{id}             → admin creates, principal resolves
     auditLogs/{id}                    → append-only audit trail (no delete/update)
     academicStructure/{id}            → class-section map (both read/write)
     feeStructure/{id}  (or as a doc) → fee structure (principal writes, admin reads)
   /schools/{schoolId}                  → school meta doc (both read, principal writes)

   ROLES (stored in /users/{uid}.role)
   ─────────────────────────────────────
   "principal" → full access within their school
   "admin"     → most read/write; cannot delete, cannot resolve approvals,
                 cannot write to terminatedStudents / legacyStudents / hiddenStudents
                 or feeStructure directly

   HELPER FUNCTIONS
   ─────────────────
   isAuth()      → request is authenticated
   uid()         → shorthand for request.auth.uid
   userDoc()     → /users/{uid} document
   role()        → user's role string
   schoolId()    → user's schoolId string
   isPrincipal() → role == "principal"
   isAdmin()     → role == "admin"
   belongsToSchool(sid) → user's schoolId matches the school document
   ============================================================

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       // ── Helpers ──────────────────────────────────────────────────────────
       function isAuth() {
         return request.auth != null;
       }
       function uid() {
         return request.auth.uid;
       }
       function userDoc() {
         return get(/databases/$(database)/documents/users/$(uid())).data;
       }
       function role() {
         return userDoc().role;
       }
       function schoolId() {
         return userDoc().schoolId;
       }
       function isPrincipal() {
         return isAuth() && role() == 'principal';
       }
       function isAdmin() {
         return isAuth() && role() == 'admin';
       }
       function isStaff() {
         return isAuth() && (role() == 'principal' || role() == 'admin');
       }
       function belongsToSchool(sid) {
         return isAuth() && schoolId() == sid;
       }
       function isSchoolStaff(sid) {
         return belongsToSchool(sid) && isStaff();
       }
       function isPrincipalOfSchool(sid) {
         return belongsToSchool(sid) && isPrincipal();
       }

       // ── ARC-018: Fee category write guard ────────────────────────────────
       // Returns true if the write is permitted given the current lock state.
       // Rules:
       //   1. If feeCategoryLocked does not exist yet (first setup) → allow.
       //   2. If feeCategoryLocked == false → allow (still in draft mode).
       //   3. If feeCategoryLocked == true → the incoming write must NOT
       //      change the top-level keys of feeCategoryConfig (structural lock).
       //      Rate-value changes inside existing keys are still permitted.
       function _feeCategoryWriteAllowed(existingResource, incomingRequest) {
         let existingData = existingResource != null ? existingResource.data : {};
         let incomingData = incomingRequest.resource.data;
         // If categories are not yet locked, all writes are fine
         if (!('feeCategoryLocked' in existingData) || existingData.feeCategoryLocked != true) {
           return true;
         }
         // Categories ARE locked — block structural key changes
         // Allow if feeCategoryConfig is not being touched at all
         if (!('feeCategoryConfig' in incomingData)) return true;
         // If feeCategoryConfig is being written, ensure the key set is identical
         let existingKeys = existingData.feeCategoryConfig.keys();
         let incomingKeys = incomingData.feeCategoryConfig.keys();
         return existingKeys.hasAll(incomingKeys) && incomingKeys.hasAll(existingKeys);
       }

       // ── /users/{userId} ──────────────────────────────────────────────────
       // Each user can read/write only their own profile.
       // Principals cannot escalate another user's role.
       match /users/{userId} {
         allow read:   if isAuth() && uid() == userId;
         allow create: if isAuth() && uid() == userId
                         && request.resource.data.keys().hasAll(['role','schoolId','name','email']);
         allow update: if isAuth() && uid() == userId
                         // Prevent role self-escalation: may not change own role to principal
                         // unless it already was principal (principals can preserve their role)
                         && (request.resource.data.role == resource.data.role
                             || resource.data.role == 'principal');
         allow delete: if false; // profiles are never deleted from client
       }

       // ── /schools/{schoolId} (meta doc) ───────────────────────────────────
       // ARC-018 FIX: fee category structural fields (feeCategoryConfig,
       // feeCategoryLocked) are Principal-only writes.
       // Additionally, once feeCategoryLocked == true, the feeCategoryConfig
       // field is immutable — nobody (not even Principal) can alter the keys,
       // only rate values inside each category. This is enforced at the
       // Firestore rule level so no client-side bypass is possible.
       match /schools/{schoolId} {
         allow read:   if isSchoolStaff(schoolId);
         // Principal writes: allowed unless categories are locked AND the write
         // attempts to change feeCategoryConfig keys (structural change blocked).
         allow write:  if isPrincipalOfSchool(schoolId)
                         && _feeCategoryWriteAllowed(resource, request);
         // Admins have zero write access to school doc (covers category fields).
         // — no additional rule needed: write defaults to deny for non-principals.

         // ── students ──────────────────────────────────────────────────────
         // Both roles read & write active students (admit, edit, search).
         // Only principal can hard-delete a student document.
         match /students/{studentId} {
           allow read:   if isSchoolStaff(schoolId);
           allow create: if isSchoolStaff(schoolId);
           allow update: if isSchoolStaff(schoolId);
           allow delete: if isPrincipalOfSchool(schoolId);
         }

         // ── terminatedStudents ────────────────────────────────────────────
         // Admin can read. Only principal can create/update/delete.
         match /terminatedStudents/{docId} {
           allow read:   if isSchoolStaff(schoolId);
           allow create: if isPrincipalOfSchool(schoolId);
           allow update: if isPrincipalOfSchool(schoolId);
           allow delete: if isPrincipalOfSchool(schoolId);
         }

         // ── hiddenStudents ────────────────────────────────────────────────
         match /hiddenStudents/{docId} {
           allow read:   if isSchoolStaff(schoolId);
           allow create: if isPrincipalOfSchool(schoolId);
           allow update: if isPrincipalOfSchool(schoolId);
           allow delete: if isPrincipalOfSchool(schoolId);
         }

         // ── legacyStudents ────────────────────────────────────────────────
         // Written only during Annual Promotion (principal-only action).
         // Both roles may read (for the Legacy Students archive view).
         match /legacyStudents/{docId} {
           allow read:   if isSchoolStaff(schoolId);
           allow create: if isPrincipalOfSchool(schoolId);
           allow update: if isPrincipalOfSchool(schoolId);
           allow delete: if false; // legacy archive is permanent
         }

         // ── feeTransactions ───────────────────────────────────────────────
         // Both roles record payments (create). Neither role updates or
         // deletes directly — deletions go through the deletionRequests
         // approval workflow (principal resolves via a batch write).
         //
         // LEAK-AUDIT FIX: this rule previously let ANY school staff (incl. Admin)
         // read ANY doc in this collection, full stop. Every "Admin must never see
         // hidden-student payments" guarantee elsewhere in this app (Finance table,
         // dashboard totals, exports, search) was enforced ONLY in client JS via an
         // isHiddenPayment filter — trivially bypassable by anyone reading the
         // network response or calling Firestore directly from devtools/console.
         // The split below closes that for single-document reads (get): a non-principal
         // can no longer fetch a hidden-flagged transaction by id even if they know it.
         //
         // IMPORTANT CAVEAT — list/query reads are NOT fully closed by rules alone:
         // Firestore only lets a security rule narrow a *list* query if the query
         // itself carries a matching where() clause (e.g. .where('isHiddenPayment','==',false));
         // otherwise a query that could return a mixed hidden/non-hidden result set is
         // rejected outright rather than silently filtered. Several Admin-reachable
         // queries in this app (dashboard totals, renderPendingFee, search, page-size
         // list fetches) currently query the whole collection with no such where()
         // clause. Recommend as a follow-up: add an explicit
         // .where('isHiddenPayment','in',[false,null]) (or similar) to every
         // non-principal-gated feeTransactions query, matched by an `allow list` rule
         // below — that is the only way to make the *list* path as strict as `get` now is.
         match /feeTransactions/{txId} {
           allow get:    if isSchoolStaff(schoolId) &&
                            (resource.data.isHiddenPayment != true || isPrincipalOfSchool(schoolId));
           allow list:   if isSchoolStaff(schoolId); // see caveat above — needs matching where() on the query side to be fully closed
           allow create: if isSchoolStaff(schoolId);
           allow update: if isPrincipalOfSchool(schoolId); // principal resolves approvals
           allow delete: if isPrincipalOfSchool(schoolId); // only after approval granted
         }

         // ── hiddenFeeTransactions ─────────────────────────────────────────
         // LEAK-AUDIT FIX: read was open to any school staff; this collection exists
         // specifically to hold confidential hidden-student data, so read access is
         // now principal-only, matching hiddenStudents' own confidentiality intent.
         match /hiddenFeeTransactions/{txId} {
           allow read:   if isPrincipalOfSchool(schoolId);
           allow create: if isSchoolStaff(schoolId);
           allow update: if isPrincipalOfSchool(schoolId);
           allow delete: if isPrincipalOfSchool(schoolId);
         }

         // ── deletionRequests ──────────────────────────────────────────────
         // Admin creates requests; principal reads and resolves (update status).
         // Neither role deletes request documents — they are audit history.
         match /deletionRequests/{reqId} {
           allow read:   if isSchoolStaff(schoolId);
           allow create: if isSchoolStaff(schoolId); // admin OR principal can submit
           allow update: if isPrincipalOfSchool(schoolId); // only principal approves/rejects
           allow delete: if false;
         }

         // ── auditLogs ─────────────────────────────────────────────────────
         // Append-only. No client may update or delete audit entries.
         // Both roles may read their school's audit log.
         match /auditLogs/{logId} {
           allow read:   if isSchoolStaff(schoolId);
           allow create: if isSchoolStaff(schoolId);
           allow update: if false;
           allow delete: if false;
         }

         // ── academicStructure ─────────────────────────────────────────────
         // Class-section map. Both roles read/write.
         match /academicStructure/{docId} {
           allow read:   if isSchoolStaff(schoolId);
           allow write:  if isSchoolStaff(schoolId);
         }

         // ── feeStructure ──────────────────────────────────────────────────
         // Only principal defines fee structures; admin reads them.
         match /feeStructure/{docId} {
           allow read:   if isSchoolStaff(schoolId);
           allow write:  if isPrincipalOfSchool(schoolId);
         }

         // ── config (sub-keys like timeLock) ───────────────────────────────
         // Stored directly on the school doc (no sub-collection needed).
         // Handled by the /schools/{schoolId} rule above.
       }
     }
   }

   NOTE: These rules use get() calls in helper functions. Firebase bills
   one read per get() call inside a rule evaluation. For high-traffic
   schools consider using Custom Claims (set via Admin SDK) so role and
   schoolId live in request.auth.token — eliminating the get() cost and
   improving rule evaluation latency.
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
   BUG-C05 FIX — PER-TENANT TIME LOCK (Phase 5 → Multi-Tenant)
   Time lock settings loaded from Firestore per school:
     schools/{schoolId}.timeLock → {
       enabled:     boolean,
       openHour:    number   (0-23),
       openMinute:  number   (0-59),
       closeHour:   number   (0-23),
       closeMinute: number   (0-59),
       workDays:    number[] (0=Sun, 1=Mon ... 6=Sat)
     }
   If timeLock is absent or enabled=false, access is unrestricted.
   Hardcoded Colonel's hours (7AM-3PM Mon-Sat) are GONE from global code.
   ============================================================ */

// Loaded per-tenant after auth. Null = no restriction.
let currentTimeLock = null;

// Load school config (timeLock + future per-tenant settings) from Firestore.
// Called after loadUserProfile() so currentSchoolId is available.
// BUG-H01 + BUG-H02 FIX: Also loads per-tenant feeSchedule and class/section structure.
async function loadSchoolConfig() {
  currentTimeLock    = null;
  _tenantFeeSchedule = null;
  _tenantClassList   = null;
  _tenantSections    = null;
  if (!currentSchoolId) return;
  try {
    const doc = await db.collection('schools').doc(currentSchoolId).get();
    const data = doc.exists ? doc.data() : {};

    // Time lock (BUG-C05 — already fixed, kept here)
    // Time lock disabled — access is unrestricted regardless of Firestore config.
    currentTimeLock = null;

    // BUG-H01 FIX: fee schedule from Firestore config
    // BUGFIX-FEE: Validate all default class keys exist with positive values before trusting Firestore.
    const fs = data.config?.feeSchedule;
    const defaultKeys = Object.keys(_DEFAULT_FEE_SCHEDULE);
    const fsValid = fs && typeof fs === 'object'
      && defaultKeys.every(k => typeof fs[k] === 'number' && fs[k] > 0);

    // BUG-⑨ FIX: Also read feeCategoryConfig and merge its rates into the fee schedule.
    // renderFeeOnboarding() saves per-class rates under schools/{id}.feeCategoryConfig,
    // but the fee engine was only ever reading config.feeSchedule — the two systems were
    // completely disconnected. We now build a merged schedule so configured rates take effect.
    const feeCatConfig = data.feeCategoryConfig;
    let mergedSchedule = fsValid ? { ...fs } : { ..._DEFAULT_FEE_SCHEDULE };
    if (feeCatConfig && typeof feeCatConfig === 'object') {
      Object.entries(feeCatConfig).forEach(([cls, cfg]) => {
        // feeCategoryConfig values can be a plain number or an object with a `rate` key
        const rate = typeof cfg === 'number' ? cfg : (cfg?.rate ?? cfg?.monthlyFee ?? null);
        if (rate != null && Number(rate) > 0) {
          mergedSchedule[cls] = Number(rate);
        }
      });
    }
    _tenantFeeSchedule = mergedSchedule;

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
    // Fail open — use defaults so users are never locked out by a config error
    _tenantFeeSchedule = { ..._DEFAULT_FEE_SCHEDULE };
    _tenantClassList   = [..._DEFAULT_CLASS_LIST];
    _tenantSections    = [..._DEFAULT_SECTIONS];
  }
}

// Time lock system disabled — access is always unrestricted.
function isWithinSchoolHours() {
  return true;
}

// Builds a human-readable lock message from tenant config — no hardcoded strings.
function getTimeLockMessage() {
  const tl       = currentTimeLock || {};
  const now      = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  const day      = now.getDay();
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const time     = now.toLocaleTimeString('en-IN', {timeZone:IST_TZ, hour:'2-digit', minute:'2-digit', hour12:true });
  const workDays  = tl.workDays   || [1,2,3,4,5,6];
  const openHour  = tl.openHour   ?? 7;
  const openMin   = tl.openMinute ?? 0;
  const closeHour = tl.closeHour  ?? 15;
  const closeMin  = tl.closeMinute ?? 0;
  const fmt = (h, m) => `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  const openLabel    = fmt(openHour, openMin);
  const closeLabel   = fmt(closeHour, closeMin);
  const workDayLabel = workDays.length === 7 ? 'Every day' : workDays.map(d => DAY_NAMES[d]).join(', ');
  if (!workDays.includes(day)) {
    return { heading:'System Unavailable', reason:`Today is ${DAY_NAMES[day]}. The system is not available today.`, sub:`Available: ${workDayLabel} · ${openLabel} to ${closeLabel}` };
  }
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < openHour * 60 + openMin) {
    return { heading:'System Not Yet Open', reason:`It is currently ${time} on ${DAY_NAMES[day]}. The system opens at ${openLabel}.`, sub:`Hours: ${workDayLabel} · ${openLabel} to ${closeLabel}` };
  }
  return { heading:'System Closed for the Day', reason:`It is currently ${time} on ${DAY_NAMES[day]}. The system closed at ${closeLabel}.`, sub:`Hours: ${workDayLabel} · ${openLabel} to ${closeLabel}` };
}

function showTimeLockScreen() {
  const msg = getTimeLockMessage();
  const tl  = currentTimeLock || {};
  const workDays  = (tl.workDays || [1,2,3,4,5,6]).map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ');
  const fmt = (h=0, m=0) => `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  const openLabel  = tl.enabled ? fmt(tl.openHour,  tl.openMinute)  : '—';
  const closeLabel = tl.enabled ? fmt(tl.closeHour, tl.closeMinute) : '—';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display         = 'none';
  const old = document.getElementById('timeLockScreen');
  if (old) old.remove();
  const screen = document.createElement('div');
  screen.id = 'timeLockScreen';
  screen.style.cssText = 'position:fixed;inset:0;z-index:2000;background:var(--ink);display:flex;align-items:center;justify-content:center;padding:20px';
  // BUG-L01 FIX: Only show detailed hours info to authenticated users.
  // Unauthenticated visitors (e.g. opened URL before logging in) see a generic
  // "System unavailable" message that doesn't reveal school name, hours, or system identity.
  const isAuthenticated = !!currentUser;
  screen.innerHTML = isAuthenticated ? `
    <div style="max-width:440px;width:100%;text-align:center">
      <div style="width:72px;height:72px;border-radius:50%;background:rgba(212,150,42,0.12);border:2px solid rgba(212,150,42,0.4);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px">🔒</div>
      <div style="font-family:'Cinzel',serif;font-size:18px;color:var(--warn);font-weight:600;margin-bottom:8px">${msg.heading}</div>
      <div style="font-size:14px;color:var(--silver-lt);margin-bottom:10px;line-height:1.6">${msg.reason}</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:28px">${msg.sub}</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:14px 18px;font-size:12px;color:var(--muted);margin-bottom:24px">
        <strong style="color:var(--silver-lt)">School Hours</strong><br>
        ${workDays} &nbsp;·&nbsp; ${openLabel} – ${closeLabel}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="doLogout()" style="width:100%">Sign Out</button>
    </div>
  ` : `
    <div style="max-width:400px;width:100%;text-align:center">
      <div style="width:72px;height:72px;border-radius:50%;background:rgba(212,150,42,0.12);border:2px solid rgba(212,150,42,0.4);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px">🔒</div>
      <div style="font-family:'Cinzel',serif;font-size:18px;color:var(--warn);font-weight:600;margin-bottom:8px">System Unavailable</div>
      <div style="font-size:14px;color:var(--silver-lt);margin-bottom:28px;line-height:1.6">This system is not available at this time. Please try again later.</div>
      <button class="btn btn-ghost btn-sm" onclick="location.reload()" style="width:100%">Retry</button>
    </div>
  `;
  document.body.appendChild(screen);
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

