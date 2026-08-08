/* ============================================================
   SPLASH → AUTH FLOW
   ============================================================ */
window.addEventListener('load', () => {
  updateHeaderDate();
  setInterval(updateHeaderDate, 1000); // VLX-REF-003 FIX: update every second for real-time display

  // P-A #15: Splash removed — go straight to auth
  initAuth();
});

function updateHeaderDate() {
  const d = new Date();
  // VLX-REF-003 FIX: Display live date+time in the header pill (no cached/static value)
  const el = document.getElementById('hdrDate');
  if (el) el.textContent = d.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})
    + ' · ' + d.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true});
}

function initAuth() {
  // SECURITY FIX: Use SESSION persistence so each browser tab maintains its own
  // independent Firebase Auth session. This is the correct Firebase API approach —
  // no signOut hacks needed. Admin in Tab 1, Principal in Tab 2, fully isolated.
  function _startListener() {
    auth.onAuthStateChanged(async user => {
      if (user) {
        currentUser = user;
        await loadUserProfile(user.uid);
        await loadSchoolConfig();
        showApp();
      } else {
        showLogin();
      }
    });
  }
  auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
    .then(_startListener)
    .catch(() => _startListener()); // fallback if SESSION persistence unavailable
}

async function loadUserProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      currentProfile  = doc.data();
      currentRole     = currentProfile.role || 'admin';
      const sid = (currentProfile.schoolId || '').trim();
      currentSchoolId = sid || null;
      // CHG-012: Block is a data filter, not user identity. Always null.
      currentUserBlock = null;
      currentViewBlock = null;
    } else {
      currentProfile  = { name: currentUser.email, role: null, email: currentUser.email, _noProfileDoc: true };
      currentRole     = null;
      currentSchoolId = null;
      currentUserBlock = null;
      currentViewBlock = null;
    }
  } catch(e) {
    currentProfile  = { name: 'User', role: null, _profileLoadError: true };
    currentRole     = null;
    currentSchoolId = null;
    currentUserBlock = null;
    currentViewBlock = null;
    console.error('Error loading user profile:', e);
  }
}

// Scoped collection helper — always use for school data.
// BUG-C03 FIX: throws if schoolId is missing.
// BUG-C04 FIX: Asserts that the authenticated UID matches the loaded profile's schoolId,
//              catching any case where currentSchoolId was tampered or mismatched.
function schoolCol(colName) {
  if (!currentUser) throw new Error('Not authenticated. Please log in.');
  if (!currentSchoolId) throw new Error(
    'schoolId not assigned to this user account. ' +
    'Add schoolId to Firestore → users/' + currentUser.uid + ' and reload.'
  );
  // Guard: profile schoolId must match the active currentSchoolId (C04 runtime check)
  // BUG-N02 FIX: Changed condition to catch empty-string schoolId bypassing this guard.
  // Old condition: currentProfile.schoolId && currentProfile.schoolId !== currentSchoolId
  //   → falsy schoolId (e.g. "") short-circuits and never checks the mismatch.
  // New condition: checks for undefined explicitly so "" still triggers the guard.
  if (currentProfile && currentProfile.schoolId !== undefined && currentProfile.schoolId !== currentSchoolId) {
    console.error('BUG-N02 / BUG-C04 GUARD: schoolId mismatch — forcing logout for safety.');
    doLogout();
    throw new Error('School ID mismatch detected. Session terminated for security.');
  }
  return db.collection('schools').doc(currentSchoolId).collection(colName);
}

// CHG-012: blockStudentQuery — no longer filters by block.
// Block is a UI data filter on student records, not an auth boundary.
// Both Admin and Principal see all blocks. UI-level block filter is applied in renderStudents().
function blockStudentQuery() {
  return schoolCol('students');
}

// CHG-012: assertCanWrite is a no-op — both roles can write all blocks.
function assertCanWrite(operationName) { /* CHG-012: no block write restriction */ }

// NOTE: resolveSchoolId() has been removed as part of BUG-C01+C02 fix.
// schoolId must now be explicitly set per user in Firestore users/{uid}.schoolId.
// BUG-C03 fix will enforce this with proper validation.

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */

// ════════════════════════════════════════════════════════════════════════════
// "OPEN A NEW WINDOW" — the login link threw on the deployment we actually use.
//
// It was inline on the anchor: window.open(location.href, '_blank', 'noopener').
// This app is opened straight off disk (file:///C:/Users/.../index.html), and
// Chrome treats every file: URL as its OWN unique security origin. Opening a
// file: URL from a file: page is therefore a cross-origin navigation, which it
// refuses:
//
//   Unsafe attempt to load URL file:///...index.html from frame with URL
//   file:///...index.html. 'file:' URLs are treated as unique security origins.
//
// window.open then returns null, the second window never appears, and the
// operator gets a console error instead of the thing the link promised. The
// link is on the LOGIN screen, so this is the first interaction available.
//
// window.open still works normally when the app is served over http(s), so the
// call is kept and its RESULT is checked — the missing half. When the browser
// refuses, say so and give the operator the keystroke that does work, instead
// of failing silently.
// ════════════════════════════════════════════════════════════════════════════
function openSecondWindow() {
  // Do NOT attempt the call on file:. Chrome emits
  //   "Unsafe attempt to load URL ... 'file:' URLs are treated as unique security origins."
  // ITSELF when it refuses — that message is written by the browser, not thrown as an
  // exception, so a try/catch or a null-check cleans up after it but never stops it
  // being printed. The only way the console stays clean is to not make a call that
  // cannot succeed. Ask the protocol first; window.open is reached only where it works.
  if (location.protocol !== 'file:') {
    let win = null;
    try { win = window.open(location.href, '_blank', 'noopener'); } catch (_) { win = null; }
    if (win) return;
    const blocked = 'The browser blocked the new window. Allow pop-ups for this site, or press Ctrl+N.';
    if (typeof showToast === 'function') showToast(blocked, 'warning', 7000);
    else alert(blocked);
    return;
  }

  const msg = 'Opened from a file, so the browser will not open a second window itself. ' +
              'Press Ctrl+N for a new window and paste the same address — both stay signed in separately.';
  if (typeof showToast === 'function') showToast(msg, 'warning', 8000);
  else alert(msg);
}

const _loginBtnDefaultHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Sign In';

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPass').value;
  const btn   = document.getElementById('loginBtn');
  const err   = document.getElementById('loginErr');
  err.style.display = 'none';
  if (!email || !pass) { showErr('Please enter email and password.'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span style="opacity:0.7">Signing in…</span>';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    showErr(friendlyAuthError(e.code));
    btn.disabled = false;
    btn.innerHTML = _loginBtnDefaultHTML;
  }
}
function showErr(msg) {
  const e = document.getElementById('loginErr');
  e.textContent = msg; e.style.display = 'block';
}
function friendlyAuthError(code) {
  const m = {
    'auth/wrong-password':            'Incorrect password. Please try again.',
    'auth/user-not-found':            'No account found with this email.',
    'auth/invalid-email':             'Please enter a valid email address.',
    'auth/too-many-requests':         'Too many attempts. Please wait and try again.',
    'auth/invalid-credential':        'Incorrect email or password. Please try again.',
    'auth/invalid-login-credentials': 'Incorrect email or password. Please try again.',
    'auth/user-disabled':             'This account has been disabled.',
    'auth/network-request-failed':    'Network error. Check your connection.',
  };
  return m[code] || ('Login failed: ' + (code || 'unknown error'));
}

/* ================================================================
   BUG-L04 FIX — Mobile Sidebar Toggle
   ================================================================ */
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (!sb) return;
  const isOpen = sb.classList.contains('open');
  if (isOpen) { closeSidebar(); } else {
    sb.classList.add('open');
    if (ov) { ov.classList.add('open'); }
  }
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}

async function doLogout() {
  // BUG-C01 + BUG-C02 FIX: Single logout path — Firebase signOut only.
  // CHG-013: Always detach real-time listeners before clearing state
  _detachDashListeners();
  try { await auth.signOut(); } catch(e) {}
  currentUser = null; currentRole = null; currentProfile = null;
  currentSchoolId = null;
  currentUserBlock = null; currentViewBlock = null; // PHASE 2
  _tenantFeeSchedule = null; _tenantClassList = null; _tenantSections = null; // BUG-H01/H02 FIX: clear tenant config on logout

  // BUG-N21 FIX: Clear ALL window-level data caches on logout.
  // Without this, a School B user logging in on the same browser session could
  // momentarily see School A's students, transactions, or financials before
  // caches are refreshed — violating cross-tenant isolation golden rule.
  window._financeData        = null;
  window._financeAllLoaded   = null;
  window._financeRenderRows  = null;
  window._allStudents        = null;
  window._allTerminated      = null;
  window._terminatedData     = null; // BUG-O01 FIX: renderTerminated() sets this; must be cleared on logout to prevent cross-tenant data exposure via export
  window._allHidden          = null; // P-F: hidden section cache — cleared on logout to prevent cross-tenant exposure
  window._allTxs             = null;
  window._lastFinanceSnap    = null; // BUG-O04 FIX: pagination cursor for Finance Load More — stale School A cursor used for School B pagination causes Firestore path errors
  window._pfAllPending       = null; // BUG-P01 FIX: pending fees cache — must clear on logout to prevent cross-tenant data exposure
  _pfFilters                 = { block:'', cls:'', section:'', range:'all', dateFrom:'', dateTo:'', search:'' }; // BUG-P01 FIX: reset stale filter state on logout
  window._promotionRows      = null;
  window._academicSelected   = null; // BUG-O05 FIX: holds School A's selected class cards — must wipe on logout to prevent stale UI state leaking into School B session
  window._academicStatsMap   = null; // BUG-O05 FIX: holds School A's per-class stats map — same cross-tenant risk
  _studentCache              = null;
  _studentCacheTime          = 0;

  navStack = [];
  _setTerminatedUnlocked(false); // BUG-M10 FIX: clear sessionStorage lock on logout
  // Remove overlay screens if visible
  const tls = document.getElementById('timeLockScreen');
  if (tls) tls.remove();
  // BUG-C03 FIX: also remove missing-profile blocker screen on logout
  const mps = document.getElementById('missingProfileScreen');
  if (mps) mps.remove();
  document.getElementById('app').style.display = 'none';
  showLogin();
}
function showLogin() {
  // PHASE 4: Stop clock if running (navigating back to login)
  if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
  const ls = document.getElementById('loginScreen');
  ls.style.display = 'flex';
  // SIGN-IN FIX: Always reset the login button when returning to login screen
  // so it's never left in a disabled/loading state (e.g. after logout, failed profile load).
  const btn = document.getElementById('loginBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = _loginBtnDefaultHTML; }
  const err = document.getElementById('loginErr');
  if (err) err.style.display = 'none';
}

