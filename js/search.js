/* ============================================================
   UNIVERSAL SEARCH
   ============================================================ */

// BUG-02 FIX: In-memory student cache (TTL: 120s). Load once, filter locally.
// No Firestore read per keystroke. Cache invalidated on student add/edit/terminate.
let _studentCache = null;
let _studentCacheTime = 0;
const STUDENT_CACHE_TTL = 120000; // 120 seconds

async function getStudentCache() {
  const now = Date.now();
  if (_studentCache && (now - _studentCacheTime) < STUDENT_CACHE_TTL) return _studentCache;
  const snap = await schoolCol('students').get();
  _studentCache = snap.docs.map(d=>({id:d.id,...d.data()}));
  _studentCacheTime = now;
  return _studentCache;
}
function invalidateStudentCache() { _studentCache = null; _studentCacheTime = 0; window._promotionRows = null; /* BUG-N14 FIX: bust promotion cache so class edits reflect immediately */
  // A terminatedStudents/hiddenStudents row is a PROJECTION of a student document.
  // If the student cache is stale the archive rows are stale by the same event, so
  // they are dropped together rather than at a dozen separate call sites — the
  // payment path proved that enumerating those sites means missing one.
  if (typeof invalidateArchiveCaches === 'function') invalidateArchiveCaches();
}

// ─── BUG-I02 FIX: Audit logging ─────────────────────────────────────────────
// All destructive and financial operations now call auditLog() which writes to
// the schools/{schoolId}/auditLogs collection. Covers termination, promotion,
// deletion, fee payments, and approval actions. Non-fatal — failures are logged
// to console only so they never block the primary operation.
function auditLog(action, details={}) {
  if (!currentUser || !currentSchoolId) return;
  schoolCol('auditLogs').add({
    action,
    performedBy:     currentUser.uid,
    performedByName: currentProfile?.name || currentUser.email || 'Unknown',
    performedByRole: currentRole || 'unknown',
    timestamp:       firebase.firestore.FieldValue.serverTimestamp(),
    schoolId:        currentSchoolId,
    details
  }).catch(err => console.warn('auditLog write failed (non-fatal):', err.message));
}
// ─────────────────────────────────────────────────────────────────────────────

// CHG-006 COMPLETE: Fee S.No (feeSno) has been removed from all UI views, forms,
// exports, receipts, search, and Firestore writes platform-wide.
// The field may still exist on legacy student documents in Firestore — those are
// preserved as-is and are not read anywhere in the application.
// BUG-04 FIX: Finance cache invalidation — clears stale data after any payment/delete
// BUG-L05 FIX: Cache TTL tracking — window globals now have max-age enforcement.
// All major caches (_financeData, _allTerminated, _allHidden) get a timestamp
// on write and are evicted when stale, preventing memory growth on long sessions.
const _CACHE_MAX_AGE = 10 * 60 * 1000; // 10 minutes
const _cacheWrittenAt = {}; // key → Date.now() at write time

// ════════════════════════════════════════════════════════════════════════════
// THE TTL ABOVE WAS DESCRIBED, NOT BUILT. _stampCache WAS CALLED FROM NOWHERE.
//
// _cacheWrittenAt therefore stayed empty for the entire session, _isCacheStale
// returned undefined for every key, and _evictStaleCaches — invoked on every
// navigation from app-shell-nav.js — did nothing at all. Every cache it names
// lived until something explicitly nulled it.
//
// window._allTerminated is the one that hurt. getTerminatedCache() has no TTL of
// its own and is cleared by exactly seven explicit assignments, none of which is
// in the payment path: recording a terminated student's dues clears the student
// and finance caches and leaves the archive rows untouched, so navigating
// straight back to Terminated re-served the pre-payment figures from memory.
//
// 'students' is dropped rather than fixed. It pointed at window._allStudents,
// which nothing has ever written — the real cache is search.js's own
// _studentCache, and it already enforces a 120s TTL. Evicting a phantom on a
// ten-minute timer was never doing anything for anybody.
// ════════════════════════════════════════════════════════════════════════════
function _isCacheStale(key) {
  return _cacheWrittenAt[key] && (Date.now() - _cacheWrittenAt[key]) > _CACHE_MAX_AGE;
}
function _stampCache(key) { _cacheWrittenAt[key] = Date.now(); }
function _evictStaleCaches() {
  if (_isCacheStale('finance'))    { invalidateFinanceCache(); }
  if (_isCacheStale('terminated')) { window._allTerminated = null; delete _cacheWrittenAt.terminated; }
  if (_isCacheStale('hidden'))     { window._allHidden     = null; delete _cacheWrittenAt.hidden; }
}

// ════════════════════════════════════════════════════════════════════════════
// THE ARCHIVE SCREENS ARE A SECOND STORE, AND A PAYMENT MOVES BOTH.
//
// terminatedStudents/{id} and hiddenStudents/{id} freeze a student's figures at
// hide-time; the live figures live on students/{id}. A payment updates the live
// side, and until the archive screen is next rendered its own row still says
// what it said before. Holding that row in a session-lifetime memory cache on
// top meant the screen could not even re-read the frozen copy.
//
// Called wherever money moves, beside invalidateStudentCache/invalidateFinanceCache.
// ════════════════════════════════════════════════════════════════════════════
function invalidateArchiveCaches() {
  window._allTerminated = null;
  window._allHidden     = null;
  window._terminatedData = null;
  delete _cacheWrittenAt.terminated;
  delete _cacheWrittenAt.hidden;
}

function invalidateFinanceCache() {
  // BUG-H04 FIX + BUG-L05 FIX: Single unified finance cache clear with TTL reset.
  window._financeData        = null;
  window._allTxs             = null;
  window._financeAllLoaded   = null;
  window._lastFinanceSnap    = null;
  delete _cacheWrittenAt.finance;
}

function onSearch(q) {
  clearTimeout(searchDebounce);
  // BUG-005 FIX: Minimum 2 characters required before triggering any search.
  // Single-character queries are too broad and return false positives.
  if (!q.trim() || q.trim().length < 2) { document.getElementById('searchDropdown').style.display='none'; return; }
  searchDebounce = setTimeout(() => doSearch(q), 350);
}

async function doSearch(q) {
  try {
    const students = await getStudentCache();
    const lq = q.toLowerCase().trim();
    // BUG-005 FIX: For short queries (2-3 chars), require the field to START WITH
    // the query rather than just contain it — prevents over-permissive mid-word matches.
    const isShort = lq.length <= 3;
    const _matches = (field, val) => {
      if (!val) return false;
      const v = val.toLowerCase();
      return isShort ? v.startsWith(lq) : v.includes(lq);
    };
    const results = students.filter(s =>
      _matches('name', s.name)||
      _matches('admNo', s.admissionNumber)||
      _matches('pen', s.pen)||
      _matches('parent', s.parentName)||
      (s.contact||'').includes(lq)
    ).slice(0,10);

    const dd = document.getElementById('searchDropdown');
    if (!results.length) { dd.style.display='none'; return; }
    dd.style.display='block';
    // BUG-O08 FIX: Capped unbounded feeTransactions read — for schools with 5000+ transactions
    // an uncapped .get() fetches the entire collection on every search keystroke (after debounce).
    // .limit(500) covers realistic use while preventing runaway reads and Firestore billing spikes.
    // Reuses _financeData cache if already populated so the cap only matters on cold first fetch.
    const txPromise = (async () => {
      if (!window._financeData) {
        try {
          const snap = await schoolCol('feeTransactions').orderBy('date','desc').limit(500).get();
          // LEAK-AUDIT FIX: this cold-cache path was the only feeTransactions read in the
          // app that skipped the isHiddenPayment filter — a non-principal user searching
          // before ever visiting Finance/Export would populate window._financeData with
          // hidden-student receipts, which then surfaced in the "Fee Records" dropdown
          // AND got reused by viewReceipt()'s cache-first lookup. Same filter as Finance/Export now.
          window._financeData = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => currentRole === 'principal' || !t.isHiddenPayment);
          if (typeof _stampCache === 'function') _stampCache('finance');
        } catch { return null; }
      }
      return (window._financeData || [])
        .filter(t =>
          t.studentName?.toLowerCase().includes(lq) ||
          t.receiptNumber?.toLowerCase().includes(lq) ||
          t.feeHead?.toLowerCase().includes(lq) ||
          t.admissionNumber?.toLowerCase().includes(lq)
        )
        .slice(0, 5);
    })();

    let html = `<div style="font-size:10px;font-weight:700;color:var(--muted);padding:6px 14px 2px;text-transform:uppercase;letter-spacing:1px">Students</div>`;
    html += results.map(s=>`
      <div class="s-item" onmousedown="selectSearchResult('${s.id}')">
        <div class="s-name">${s.name}</div>
        <div class="s-meta">Adm# ${s.admissionNumber||'—'} · ${s.class||''} ${s.section||''} · ${s.status==='active'?'Active':'Terminated'}</div>
      </div>`).join('');
    dd.innerHTML = html;

    // Append fee transaction results when they arrive
    txPromise.then(results => {
      if (!results || !results.length) return;
      const ddEl = document.getElementById('searchDropdown');
      if (!ddEl) return;
      let txHtml = `<div style="font-size:10px;font-weight:700;color:var(--muted);padding:6px 14px 2px;text-transform:uppercase;letter-spacing:1px;border-top:1px solid var(--border-lt);margin-top:4px">Fee Records</div>`;
      txHtml += results.map(t => `
        <div class="s-item" onmousedown="selectSearchResult('${t.studentId}')">
          <div class="s-name">Receipt ${t.receiptNumber||'—'} — ${t.studentName}</div>
          <div class="s-meta">${t.feeHead} · ₹${fmtNum(t.amountPaid)} · ${fmtDate(t.date)}</div>
        </div>`).join('');
      ddEl.insertAdjacentHTML('beforeend', txHtml);
    });
  } catch(e) {}
}

function selectSearchResult(id) {
  document.getElementById('searchBox').value = '';
  document.getElementById('searchDropdown').style.display='none';
  pushNav('studentProfile', { id });
}
function showDrop() { if (document.getElementById('searchBox').value.trim()) document.getElementById('searchDropdown').style.display='block'; }
function hideDrop() { setTimeout(()=>document.getElementById('searchDropdown').style.display='none', 200); }

