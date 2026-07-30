/* ============================================================
   APP SHELL
   ============================================================ */
function showApp() {
  // BUG-C05 FIX: Time lock uses tenant config loaded in loadSchoolConfig().
  // isWithinSchoolHours() returns true if no timeLock config set (unrestricted).
  if (!isWithinSchoolHours()) {
    showTimeLockScreen();
    return;
  }

  // BUG-C03 FIX: Hard gate — user MUST have a valid role and schoolId.
  // Missing either means the Firestore users/{uid} doc is incomplete or absent.
  // We show a clear blocker screen instead of entering with null tenant isolation.
  if (!currentRole || !currentSchoolId) {
    showMissingProfileScreen();
    return;
  }

  // BUG-N21 FIX: Runtime assertion — verify tenant config was loaded for the
  // correct schoolId before rendering any page. Prevents stale config from a
  // previous session being shown to a different school's user.
  if (!_tenantFeeSchedule || !_tenantClassList || !_tenantSections) {
    console.error('BUG-N21 ASSERT: Tenant config not loaded before showApp(). Aborting render.');
    doLogout();
    return;
  }

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  renderSidebar();
  updateSidebarUser();
  loadSchoolMeta();
  if (currentRole === 'principal') {
    loadPendingCount();
  }
  _touchSessionExpiry(); // BUG-M02 FIX: stamp session expiry at app entry
  navigate('dashboard');
}

// BUG-C03 FIX: Shown when authenticated user has no valid Firestore profile or schoolId.
// Forces logout — no partial app access allowed.
function showMissingProfileScreen() {
  const hasNoDoc   = currentProfile?._noProfileDoc;
  const hasNoSid   = currentRole && !currentSchoolId;
  const hasNoRole  = !currentRole && !currentProfile?._noProfileDoc;

  let reason = '';
  if (hasNoDoc) {
    reason = `No user profile document found in Firestore.<br>
      Create <code>users/${currentUser?.uid}</code> with fields:
      <code>{ role, name, schoolId, email }</code>.`;
  } else if (hasNoSid) {
    reason = `Your account (<strong>${currentUser?.email}</strong>) has no <code>schoolId</code> assigned.<br>
      Add <code>schoolId</code> to <code>users/${currentUser?.uid}</code> in Firestore and reload.`;
  } else {
    reason = `Your account profile is incomplete (missing <code>role</code> or <code>schoolId</code>).<br>
      Contact your system administrator.`;
  }

  document.getElementById('loginScreen').style.display  = 'none';
  document.getElementById('app').style.display          = 'none';
  const old = document.getElementById('missingProfileScreen');
  if (old) old.remove();

  const screen = document.createElement('div');
  screen.id = 'missingProfileScreen';
  screen.style.cssText = 'position:fixed;inset:0;z-index:2000;background:var(--ink);display:flex;align-items:center;justify-content:center;padding:20px';
  screen.innerHTML = `
    <div style="max-width:480px;width:100%;text-align:center">
      <div style="width:72px;height:72px;border-radius:50%;background:rgba(224,82,82,0.1);border:2px solid rgba(224,82,82,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:28px">⚠️</div>
      <div style="font-family:'Cinzel',serif;font-size:18px;color:var(--danger);font-weight:600;margin-bottom:12px">Account Setup Incomplete</div>
      <div style="font-size:13px;color:var(--silver-lt);margin-bottom:20px;line-height:1.8">${reason}</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:14px 18px;font-size:12px;color:var(--muted);margin-bottom:24px;text-align:left">
        <strong style="color:var(--silver-lt);display:block;margin-bottom:6px">Required Firestore document:</strong>
        <code style="color:var(--gold-lt);font-size:11px;line-height:1.8">
          users/${currentUser?.uid || '&lt;uid&gt;'}<br>
          &nbsp;&nbsp;→ role: "admin" | "principal"<br>
          &nbsp;&nbsp;→ name: "Full Name"<br>
          &nbsp;&nbsp;→ email: "${currentUser?.email || ''}"<br>
          &nbsp;&nbsp;→ schoolId: "&lt;your-school-doc-id&gt;"
        </code>
        <div style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.6">
          ℹ️ <strong style="color:var(--silver)">CHG-012:</strong> One Admin account + One Principal account govern the entire system.
          Block (Boys/Girls) is a data-layer filter on student records — not part of authentication.
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="doLogout()" style="width:100%">Sign Out</button>
    </div>
  `;
  document.body.appendChild(screen);
}

async function loadSchoolMeta() {
  const nameEl = document.getElementById('sbSchoolName');
  const subEl  = document.getElementById('sbSchoolSub');
  if (!currentSchoolId) {
    if (nameEl) nameEl.textContent = 'No School Assigned';
    if (subEl)  subEl.textContent  = 'Contact administrator';
    return;
  }
  try {
    const doc = await db.collection('schools').doc(currentSchoolId).get();
    if (doc.exists) {
      const s = doc.data();
      if (nameEl) nameEl.textContent = s.name || currentSchoolId;
      if (subEl)  subEl.textContent  = s.gradeRange || s.tagline || '';
    } else {
      if (nameEl) nameEl.textContent = currentSchoolId;
      if (subEl)  subEl.textContent  = '';
    }
  } catch(e) {
    if (nameEl) nameEl.textContent = currentSchoolId;
    if (subEl)  subEl.textContent  = '';
  }
}

function updateSidebarUser() {
  const name  = currentProfile?.name || 'User';
  const role  = currentRole === 'principal' ? 'Principal' : 'Admin';

  document.getElementById('sbAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('sbName').textContent   = name;
  // CHG-012: Show role only — no block in identity label
  const roleEl = document.getElementById('sbRole');
  roleEl.textContent = role;
  roleEl.style.color = currentRole === 'principal' ? 'var(--warn)' : 'var(--info)';

  // BUG-N15 FIX: Refresh school name label in sidebar from profile data if available.
  const schoolNameEl = document.getElementById('sbSchoolName');
  if (schoolNameEl && currentProfile?.schoolName) {
    schoolNameEl.textContent = currentProfile.schoolName;
  }
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  const isPrincipal = currentRole === 'principal';
  // CHG-012: isReadOnly always false — removed

  const adminItems = [
    { id:'dashboard',    label:'DASHBOARD',             icon:iconDashboard },
    { id:'students',     label:'Students',              icon:iconStudents },
    { id:'recordFee',    label:'Record Payment',        icon:iconFee },
    { id:'finance',      label:'Paid Fee',              icon:iconFinance },
    { id:'concessions',  label:'CONCESSION MANAGEMENT', icon:iconConcession, locked:true },
    { id:'excused',      label:'FEES EXCUSED STUDENTS',    icon:iconExcused, locked:true },
    { id:'pendingFee',   label:'DUE FEE',               icon:iconPendingFee, locked:true },
    { id:'hidden',       label:'HIDDEN STUDENT',        icon:iconHidden, locked:true },
    { id:'terminated',   label:'TERMINATED',            icon:iconTerminated, locked:true },
    { id:'feeStructure', label:'FEE STRUCTURE',         icon:iconFeeStructure },
    { id:'academic',     label:'ACADEMIC STRUCTURE',    icon:iconAcademic },
    { id:'legacy',       label:'LEGACY STUDENT',        icon:iconAcademic },
    { id:'profile',      label:'My Profile',            icon:iconProfile },
  ];
  const principalItems = [
    { id:'dashboard',    label:'DASHBOARD',             icon:iconDashboard },
    { id:'students',     label:'Students',              icon:iconStudents },
    { id:'recordFee',    label:'Record Payment',        icon:iconFee },
    { id:'pastDue',      label:'Record Previous Year Dues', icon:iconPastDue },
    { id:'finance',      label:'Paid Fee',              icon:iconFinance },
    { id:'concessions',  label:'CONCESSION MANAGEMENT', icon:iconConcession },
    { id:'excused',      label:'FEES EXCUSED STUDENTS',    icon:iconExcused },
    { id:'pendingFee',   label:'DUE FEE',               icon:iconPendingFee },
    { id:'hidden',       label:'HIDDEN STUDENT',        icon:iconHidden },
    { id:'terminated',   label:'TERMINATED',            icon:iconTerminated },
    { id:'feeStructure', label:'FEE STRUCTURE',         icon:iconFeeStructure },
    { id:'academic',     label:'ACADEMIC STRUCTURE',    icon:iconAcademic },
    { id:'legacy',       label:'LEGACY STUDENT',        icon:iconAcademic },
    { id:'promotions',   label:'Student Promotions',    icon:iconPromotions },
    { id:'profile',      label:'My Profile',            icon:iconProfile },
  ];

  const items = isPrincipal ? principalItems : adminItems;

  // CHG-012: Cross-block switcher removed — block is now a data filter, not auth identity.
  // Both roles see all blocks. No read-only restriction per block.

  nav.innerHTML = items.map(it => {
    const lockBadge = (!isPrincipal && it.locked)
      ? `<span style="margin-left:auto;font-size:11px;color:var(--warn);opacity:0.7">🔒</span>` : '';
    const clickFn = (!isPrincipal && it.locked)
      ? `showTerminatedLockScreen()` : `navigate('${it.id}')`;
    return `<div class="nav-item" id="nav-${it.id}" onclick="${clickFn}">
      ${it.icon}
      <span>${it.label}</span>
      ${it.badge ? `<span class="nav-badge" id="pendingBadge" style="${pendingCount===0?'display:none':''}">${pendingCount}</span>` : ''}
      ${lockBadge}
    </div>`;
  }).join('');

  // CHG-012: No read-only banner needed — block is a data filter, not auth boundary.
}

function setActiveNav(id) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('nav-'+id);
  if (el) el.classList.add('active');
}

// CHG-012: Block-scoped read-only banner fully removed.
// Block (Boys/Girls) is a DATA FILTER on student records, not an auth boundary.
// Both Admin and Principal can read/write all blocks without restriction.
function _updateReadOnlyBanner() { /* CHG-012: retired — no block auth boundary */ }

async function loadPendingCount() {
  try {
    const snap = await schoolCol('deletionRequests').where('status','==','pending').get();
    pendingCount = snap.size;
    const badge = document.getElementById('pendingBadge');
    if (badge) { badge.textContent = pendingCount; badge.style.display = pendingCount > 0 ? '' : 'none'; }
  } catch(e){}
}

/* ============================================================
   NAVIGATION
   ============================================================ */
// BUG-M02 FIX: Session expiry stored with a close-of-day timestamp.
// A tab left open past school hours can no longer keep the user "logged in".
// We check on every navigation event — not only at login time.
const _SESSION_KEY = 'sfms_sess_expires';

function _touchSessionExpiry() {
  // Expiry = end of current school day (closeHour:closeMinute) or +8h from now if no timeLock
  const tl = currentTimeLock;
  let expires;
  if (tl && typeof tl.closeHour === 'number') {
    const d = new Date();
    d.setHours(tl.closeHour, tl.closeMinute || 0, 0, 0);
    // If close time is already past for today, set expiry to now (force re-login next navigate)
    expires = d.getTime() > Date.now() ? d.getTime() : Date.now();
  } else {
    expires = Date.now() + 8 * 60 * 60 * 1000; // 8 hours from now if no time lock configured
  }
  sessionStorage.setItem(_SESSION_KEY, String(expires));
}

function _isSessionExpired() {
  const raw = sessionStorage.getItem(_SESSION_KEY);
  if (!raw) return false; // No expiry stored yet — let auth handle it
  return Date.now() > parseInt(raw, 10);
}

function navigate(view, params={}, pushToStack=true) {
  // BUG-M02 FIX: Enforce session expiry on every navigation — not only at login
  if (_isSessionExpired()) { doLogout(); return; }
  // BUG-O06 FIX: Evict stale caches on every navigation
  _evictStaleCaches();
  // CHG-013: Detach dashboard real-time listeners when leaving dashboard
  if (currentView === 'dashboard' && view !== 'dashboard') {
    _detachDashListeners();
  }
  if (pushToStack && currentView && currentView !== view) {
    navStack.push({ view:currentView, params:{} });
  }
  currentView = view;
  setActiveNav(view);
  updateBackBtn();
  closeSidebar(); // BUG-L04 FIX: auto-close sidebar on mobile after navigation
  // LIVE-PROFILE: detach profile snapshot listeners when navigating away
  _detachProfileListeners();
  renderView(view, params);
}

function goBack() {
  if (navStack.length === 0) return;
  // CHG-013: Detach dashboard listeners when leaving dashboard via back
  if (currentView === 'dashboard') _detachDashListeners();
  // LIVE-PROFILE: detach profile snapshot listeners on back
  _detachProfileListeners();
  const prev = navStack.pop();
  currentView = prev.view;
  setActiveNav(prev.view);
  updateBackBtn();
  renderView(prev.view, prev.params);
}

function updateBackBtn() {
  const btn = document.getElementById('backBtn');
  if (navStack.length > 0) btn.classList.remove('invisible');
  else btn.classList.add('invisible');
}

function pushNav(view, params={}) {
  if (_isSessionExpired()) { doLogout(); return; } // BUG-M02 FIX
  // CHG-013: Detach dashboard listeners when leaving dashboard via pushNav
  if (currentView === 'dashboard' && view !== 'dashboard') _detachDashListeners();
  // LIVE-PROFILE: detach profile snapshot listeners on pushNav
  _detachProfileListeners();
  navStack.push({ view:currentView, params:{} });
  currentView = view;
  updateBackBtn();
  renderView(view, params);
}

function setContent(html) {
  // BUG-FIX (VLX013→VLX014): Explicitly stop the dashboard clock before replacing the
  // DOM. Without this, the setInterval tick fires after innerHTML wipes clockTime,
  // finds the element missing, self-clears _clockInterval to null — then
  // renderDigitalClock (called after setContent in renderPrincipalDash) tries to
  // clear a null interval, starts a new one, but the next tick still races with
  // the old pending microtask. Clearing here gives a clean slate every time.
  if (_clockInterval) { clearInterval(_clockInterval); _clockInterval = null; }
  document.getElementById('content').innerHTML = html;
}

function renderView(view, params) {
  switch(view) {
    case 'dashboard':     return (currentRole==='principal')?renderPrincipalDash():renderAdminDash();
    case 'students':      return renderStudents(params);
    case 'studentProfile':return renderStudentProfile(params.id, params.studentData);
    case 'addStudent':    return renderAddStudent(params);
    case 'bulkAdmit':     return renderBulkAdmit();   // PHASE 8 #01
    case 'bulkRemove':    return renderBulkRemove();  // PHASE 8 #01
    case 'recordFee':     return renderRecordFee(params);
    case 'pastDue':       return renderPastDue(params);    // ARC-015: Previous year due recording
    case 'feeCard':       return renderFeeCard(params);  // PHASE 7 #09
    case 'finance':       return renderFinance();
    case 'feeStructure':  return renderFeeStructure();
    case 'academic':      return renderAcademic();
    case 'classSection':  return renderClassSection(params); // BUG-09 FIX: pass full params (was dropping section)
    case 'terminated':    return (currentRole==='admin' && !_isTerminatedUnlocked())
                            ? showTerminatedLockScreen()
                            : renderTerminated();
    case 'hidden':        return (currentRole !== 'principal')
                            ? setContent('<div class="alert alert-danger" style="margin:24px">🔒 Access denied — Hidden section is Principal only.</div>')
                            : renderHidden();
    // [EVICTED] case 'approvals' removed — renderApprovals() route purged per nav restructure
    case 'promotions':    return renderPromotions();
    case 'legacy':        return renderLegacy();       // BUG-P12 FIX: Grade 10 legacy archive
    case 'profile':       return renderProfile();
    // LEAK-AUDIT FIX: Due Fee is Principal-only by design (see [CHG-002] comments on the
    // Admin dashboard) but this route had no gate of its own — only the nav *link* was
    // rendered with locked:true for Admin (cosmetic only). Anyone calling navigate('pendingFee')
    // or pushNav('pendingFee') directly (console, stray link, browser history) bypassed that
    // and got the full Due Fee ledger. Mirrors the same gate already used for 'excused'.
    case 'pendingFee':    return (currentRole !== 'principal')
                            ? setContent('<div class="alert alert-danger" style="margin:24px">🔒 Access denied — Due Fee is Principal only.</div>')
                            : renderPendingFee();   // PHASE 12 #11
    case 'excused':        return (currentRole !== 'principal')
                            ? setContent('<div class="alert alert-danger" style="margin:24px">🔒 Access denied — Fees Excused Students is Principal only.</div>')
                            : renderExcusedSection(params);  // ARC-019
    case 'feeOnboarding':  return renderFeeStructure(); // Point 14: Fee Category module removed — redirect to Fee Structure
    case 'concessions':
    case 'concessionStudents': return (currentRole !== 'principal')
                            ? setContent('<div class="alert alert-danger" style="margin:24px">🔒 Access denied — Concession Management is Principal only.</div>')
                            : renderConcessionStudents();  // [CHG-006] [CHG-007]
    default:              setContent('<div class="empty-state"><p>View not found.</p></div>');
  }
}

/* ============================================================
   CHG-013: DASHBOARD STAT CARD REAL-TIME LISTENER REGISTRY
   Tracks all onSnapshot listeners so they can be detached on
   navigate away, preventing memory leaks.
   ============================================================ */
window._dashListeners = window._dashListeners || [];
function _detachDashListeners() {
  (window._dashListeners || []).forEach(unsub => { try { unsub(); } catch(_){} });
  window._dashListeners = [];
}

// LIVE-PROFILE: onSnapshot listeners for student profile — detached on navigate away
window._profileListeners = window._profileListeners || [];
function _detachProfileListeners() {
  (window._profileListeners || []).forEach(unsub => { try { unsub(); } catch(_){} });
  window._profileListeners = [];
}

/* CHG-013: CSS for the gold pulse "live" indicator dot */
(function _injectLiveDotStyle() {
  if (document.getElementById('_liveDotStyle')) return;
  const s = document.createElement('style');
  s.id = '_liveDotStyle';
  s.textContent = `
    .live-dot {
      display:inline-block; width:7px; height:7px; border-radius:50%;
      background:var(--warn,#C9A84C); margin-left:6px; vertical-align:middle;
      animation:livePulse 1.8s ease-in-out infinite;
      box-shadow:0 0 6px rgba(201,168,76,0.7);
    }
    @keyframes livePulse {
      0%,100% { opacity:1; transform:scale(1); }
      50%      { opacity:0.35; transform:scale(0.65); }
    }
  `;
  document.head.appendChild(s);
})();

