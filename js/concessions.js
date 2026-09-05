/* ============================================================
   [CHG-006] [CHG-007] — CONCESSION STUDENTS VIEW (Principal only)
   Live view of ConcessionDB — all students with fee overrides.
   Block → Class → Section drill-down to set concessions.
   Auto-reflects every record from schoolCol('concessionFees').
   ============================================================ */
async function renderConcessionStudents() {
  if (currentRole !== 'principal') {
    setContent('<div class="alert alert-danger" style="margin:24px">🔒 Concession Students is restricted to Principal only.</div>');
    return;
  }
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  setActiveNav('concessionStudents');

  try {
    // Load all concession records from ConcessionDB (concessionFees collection)
    const snap = await schoolCol('concessionFees').get();
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Load all active students for Block → Class → Section drill-down
    const stuSnap = await schoolCol('students').where('status', '==', 'active').get();
    const allStudents = stuSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Build concession map: admissionNo → concession record
    const concMap = {};
    records.forEach(r => { if (r.admissionNo) concMap[r.admissionNo] = r; });

    const feeSchedule = getFeeSchedule();

    // Render concession register
    setContent(`
      <div class="page-head flex-between">
        <div>
          <div class="page-title">Concession Students</div>
          <div class="page-sub">Principal-only · Fee override register — live view of all concession records</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="openAddConcessionModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            + Add Concession
          </button>
          <button class="btn btn-secondary" onclick="navigate('feeStructure')">
            Fee Structure
          </button>
        </div>
      </div>

      <!-- Block → Class → Section drill-down filter + Search -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-hdr">
          <span class="card-title">🎯 Filter by Block → Class → Section</span>
        </div>
        <div class="card-body">
          <!-- Search row -->
          <div style="margin-bottom:12px">
            <div style="position:relative;max-width:420px">
              <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input type="text" id="cs_search"
                placeholder="Search by student name or admission no…"
                oninput="csFilterChange()"
                style="width:100%;padding:8px 12px 8px 34px;background:var(--lifted);border:1px solid var(--border);border-radius:8px;color:var(--silver-lt);font-size:13px;outline:none;box-sizing:border-box"
                data-search-input="true">
            </div>
          </div>
          <!-- Filter dropdowns row -->
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
            <div class="filter-bar-field">
              <label class="filter-bar-label">Block</label>
              <select class="filter-bar-select" id="cs_block" onchange="csFilterChange()">
                <option value="">All Blocks</option>
                ${getBlocks().map(b => `<option value="${b}">${b}</option>`).join('')}
              </select>
            </div>
            <div class="filter-bar-field">
              <label class="filter-bar-label">Class</label>
              <select class="filter-bar-select" id="cs_class" onchange="csFilterChange()">
                <option value="">All Classes</option>
                ${getClassList().map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div class="filter-bar-field">
              <label class="filter-bar-label">Section</label>
              ${(()=>{ const dd=_mkSecDropdown('cs',getSections(),(sel)=>csFilterChange()); return dd.html; })()}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="csResetFilters()">Reset</button>
          </div>
        </div>
      </div>

      <!-- Concession register table -->
      <div class="card">
        <div class="card-hdr">
          <span class="card-title">🏷️ Concession Register — <span id="cs_count" style="color:var(--gold-lt)">${records.length} record${records.length!==1?'s':''}</span></span>
          <span style="font-size:12px;color:var(--muted)">Live view · Auto-updates with Fee Structure</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table id="cs_table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Adm. No</th>
                  <th>Block</th>
                  <th>Class</th>
                  <th>Section</th>
                  <th>Parent Name</th>
                  <th>Standard Fee</th>
                  <th style="color:var(--gold-lt)">Fee After Concession</th>
                  <th>Set By</th>
                  <th>Date Set</th>
                  <th style="width:28px"></th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="cs_tbody">
                ${_renderCsRows(records, allStudents, feeSchedule, concMap)}
              </tbody>
            </table>
          </div>
        </div>
        ${records.length === 0 ? `
          <div style="padding:48px;text-align:center;color:var(--muted)">
            <div style="font-size:32px;margin-bottom:12px">🏷️</div>
            <div style="font-size:15px;margin-bottom:6px;color:var(--silver-lt)">No concession overrides set</div>
            <div style="font-size:13px;margin-bottom:16px">Click <strong style="color:var(--gold-lt)">+ Add Concession</strong> above to grant a student a custom monthly fee override.</div>
            <button class="btn btn-primary btn-sm" onclick="openAddConcessionModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M12 5v14M5 12h14"/></svg>
              Add Concession
            </button>
          </div>` : ''}
      </div>
    `);

    // Store data for filtering + info lookup
    window._csAllRecords  = records;
    window._csAllStudents = allStudents;
    window._csConcMap     = concMap;
    window._csFeeSchedule = feeSchedule;
    // Build id → record map for ⓘ info popover
    window._csRecordMap = {};
    records.forEach(r => { window._csRecordMap[r.id] = r; });

  } catch(e) {
    setContent(`<div class="alert alert-danger" style="margin:24px">⚠ Error loading concession records: ${sanitizeHTML(e.message)}</div>`);
    console.error('[CHG-006] renderConcessionStudents error:', e);
  }
}

/* ── [ITEM-02/03] Concession month-key + expiry + per-month amount helpers ── */
function _concCurrentMonthKey() {
  const t = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`;
}
// Item 03: a concession with defined Active Months auto-expires once the current
// month is past the last month in that list. Indefinite concessions ([] = all
// months) never expire.
function _isConcessionExpired(activeMonths) {
  if (!Array.isArray(activeMonths) || activeMonths.length === 0) return false;
  const lastMonth = [...activeMonths].sort()[activeMonths.length - 1];
  return _concCurrentMonthKey() > lastMonth;
}
function _concMonthLabel(key) {
  const _M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m] = String(key).split('-');
  return `${_M[parseInt(m, 10) - 1] || '?'} ${y || ''}`;
}
// Item 02: effective amount actually applied for a given month — a per-month
// override (monthlyBreakdown) takes precedence over the record's default/flat
// concessionFee.
function _concEffectiveAmount(record, key) {
  const bd = record && record.monthlyBreakdown;
  if (bd && typeof bd === 'object' && typeof bd[key] === 'number') return bd[key];
  return (record && record.concessionFee) || 0;
}

// Item 02 (user-reported fix): a concession's per-month correction must not be
// offerable for a month that has already been PAID or EXCUSED for this student
// — that month is settled and should be locked, mirroring the same paid/excused
// lock already used in the Add Concession month grid (VLX-007).
async function _concGetLockedMonthKeys(admissionNo, activeMonths) {
  const locked = {}; // key ('YYYY-MM') -> 'paid' | 'excused'
  if (!admissionNo || !activeMonths || !activeMonths.length) return locked;
  try {
    const sSnap = await schoolCol('students').where('admissionNumber', '==', admissionNo).limit(1).get();
    if (sSnap.empty) return locked;
    const sDoc = sSnap.docs[0];
    const sData = sDoc.data();
    const sid = sDoc.id;

    const _MMtoName = {'01':'January','02':'February','03':'March','04':'April','05':'May','06':'June',
      '07':'July','08':'August','09':'September','10':'October','11':'November','12':'December'};
    const _shortToFull = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',
      Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};

    const paidFullNames    = new Set();
    const excusedFullNames = new Set();
    const _curYrNorm = _normaliseAcademicYear(_getCurrentAcademicYearStr());

    const txSnap = await schoolCol('feeTransactions').where('studentId', '==', sid).get();
    txSnap.docs.forEach(doc => {
      const d = doc.data();
      if (_normaliseAcademicYear(d.academicYear) !== _curYrNorm) return;
      if (d.type === 'excused_waiver') {
        if (Array.isArray(d.monthsExcused))  d.monthsExcused.forEach(m => excusedFullNames.add(m));
        if (Array.isArray(d.monthsSelected)) d.monthsSelected.forEach(m => excusedFullNames.add(m));
      } else {
        if (Array.isArray(d.monthsSelected)) d.monthsSelected.forEach(m => paidFullNames.add(m));
      }
    });

    const studentYearNorm = _normaliseAcademicYear(sData.academicYear || '');
    // ══════════════════════════════════════════════════════════════════════
    // THE GRID CAN SAY EXCUSED, AND THIS ONLY LISTENED FOR THE PAID SPELLINGS.
    //
    // The transaction loop above collects waived months from excused_waiver
    // receipts, so a month waived through Fees Excused was already locked. This
    // branch — the student document's own grid — recognised only N/A-PAID and
    // PAID, so a month whose EXCUSED status reached the grid WITHOUT a surviving
    // waiver receipt read as open, and the concession editor offered to set a
    // rate on a month nobody will ever be billed for.
    //
    // Excused months go to their own set rather than being folded into paid: the
    // lock below distinguishes the two, and a waived month labelled "paid" would
    // tell the principal money was collected when it was forgiven.
    //
    // Fourth reader of this status to be corrected. The rule is in contract test
    // 110 — three spellings mean settled, only DUE and PARTIAL mean money owed.
    // ══════════════════════════════════════════════════════════════════════
    if ((!studentYearNorm || studentYearNorm === _curYrNorm) && sData.monthStatus && typeof sData.monthStatus === 'object') {
      Object.entries(sData.monthStatus).forEach(([m, st]) => {
        const _st = String(st || '').trim().toUpperCase();
        const _full = _shortToFull[m] || m;
        if (_st === 'N/A-PAID' || _st === 'PAID') paidFullNames.add(_full);
        else if (_st === 'EXCUSED')               excusedFullNames.add(_full);
      });
    }

    activeMonths.forEach(key => {
      const mm = key.split('-')[1];
      const fullName = _MMtoName[mm];
      if (!fullName) return;
      if (excusedFullNames.has(fullName)) locked[key] = 'excused';
      else if (paidFullNames.has(fullName)) locked[key] = 'paid';
    });
  } catch(e) {
    console.warn('[ITEM-02 lock check] Could not verify paid/excused months:', e.message);
  }
  return locked;
}

function _renderCsRows(records, allStudents, feeSchedule, concMap, filters={}) {
  let rows = records;

  // Apply Block/Class/Section filters
  if (filters.block)    rows = rows.filter(r => (r.block   || r.blockId || '') === filters.block);
  if (filters.cls)      rows = rows.filter(r => (r.class   || r.cls     || '') === filters.cls);
  if (filters.sections?.length) rows = rows.filter(r => filters.sections.includes(r.section || ''));

  // Apply search filter (name or admission no)
  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    rows = rows.filter(r =>
      (r.studentName || '').toLowerCase().includes(q) ||
      (r.admissionNo || '').toLowerCase().includes(q)
    );
  }

  if (rows.length === 0) {
    return `<tr><td colspan="11" style="text-align:center;padding:28px;color:var(--muted)">No concession records match the selected filters.</td></tr>`;
  }

  return rows.map(r => {
    const stdFee  = feeSchedule[r.class || r.cls] || 0;
    const conFee  = r.concessionFee ?? r.amount ?? stdFee;
    const saving  = stdFee - conFee;
    const dateStr = r.setAt ? fmtDate(r.setAt) : '—';
    const expired = _isConcessionExpired(r.activeMonths); // Item 03
    return `
      <tr ${_studentRowAttrs(r)}>
        <td>${_studentNameLink(r.studentName, r)}</td>
        <td style="color:var(--muted);font-size:12px">${sanitizeHTML(r.admissionNo || '—')}</td>
        <td>${sanitizeHTML(r.block || r.blockId || '—')}</td>
        <td>${sanitizeHTML(r.class || r.cls || '—')}</td>
        <td>${sanitizeHTML(r.section || '—')}</td>
        <td>${sanitizeHTML(r.parentName || '—')}</td>
        <td style="color:var(--muted)">₹${fmtNum(stdFee)}</td>
        <td style="color:var(--gold-lt);font-weight:700;background:rgba(201,168,76,0.08)">
          ₹${fmtNum(conFee)}
          ${saving>0?`<span style="font-size:10px;color:var(--success);display:block">-₹${fmtNum(saving)} waived</span>`:''}
          ${(()=>{ const am=r.activeMonths; if(!am||!am.length) return '<span style="font-size:10px;color:var(--muted);display:block">Indefinite</span>'; const _M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const lb=am.map(k=>{const[y,m]=k.split('-');return _M[parseInt(m)-1]+' '+y;});return '<span title="'+lb.join(', ')+'" style="font-size:10px;color:var(--muted);display:block;cursor:help">&#128197; '+am.length+' month'+(am.length!==1?'s':'')+'</span>'+(expired?'<span style="font-size:9px;color:var(--danger);display:block;font-weight:700">&#9203; Expired</span>':'');})()}
        </td>
        <td style="font-size:12px;color:var(--muted)">${sanitizeHTML(r.setBy || r.principalName || 'Principal')}</td>
        <td style="font-size:12px;color:var(--muted)">${fmtDateOnly(r.setAt)}</td>
        <td style="text-align:center;padding:0 4px">
          <button class="btn btn-ghost btn-sm" title="View details"
            style="font-size:13px;padding:3px 6px;min-width:0;border-radius:50%;line-height:1;color:var(--muted)"
            onclick="_csShowInfo(event,'${r.id}')">&#9432;</button>
        </td>
        <td>
          ${expired
            ? `<button class="btn btn-ghost btn-sm" disabled title="Concession duration has expired — editing is disabled" style="font-size:11px;opacity:0.4;cursor:not-allowed">✏️ Expired</button>`
            : `<button class="btn btn-ghost btn-sm" style="font-size:11px"
            onclick="openConcessionEdit('${r.id}','${jsAttr(r.studentName)}','${r.admissionNo||''}','${r.class||r.cls||''}',${conFee},${stdFee})">✏️ Edit</button>`}
          <button class="btn btn-sm" style="background:rgba(224,82,82,0.12);color:var(--danger);border:1px solid rgba(224,82,82,0.3);font-size:11px;margin-left:4px"
            onclick="removeConcession('${r.id}','${jsAttr(r.studentName)}')">✕ Remove</button>
        </td>
      </tr>`;
  }).join('');
}

/* ── Concession register ⓘ info popover ── */
function _csShowInfo(evt, docId) {
  // Remove any existing popover
  document.getElementById('_csInfoPop')?.remove();

  const r = (window._csRecordMap || {})[docId];
  if (!r) return;

  // Precise timestamp
  let preciseDate = '—';
  try {
    const d = r.setAt?.toDate ? r.setAt.toDate() : (r.setAt ? new Date(r.setAt) : null);
    if (d && !isNaN(d)) {
      preciseDate = d.toLocaleDateString('en-IN', {timeZone:IST_TZ, weekday:'short', day:'2-digit', month:'long', year:'numeric' })
        + ', ' + d.toLocaleTimeString('en-IN', {timeZone:IST_TZ, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
    }
  } catch(_) {}

  const reason = (r.reason || '').trim();
  const discount = r.concessionDiscount != null ? r.concessionDiscount : (r.standardFee != null && r.concessionFee != null ? r.standardFee - r.concessionFee : null);
  const operative = r.concessionFee != null ? r.concessionFee : null;
  const setBy = r.setBy || r.principalName || 'Principal';
  const expired = _isConcessionExpired(r.activeMonths); // Item 03

  // [ITEM-02] Month-by-month breakdown — shows the amount actually applied for
  // each active month (per-month override if edited, else the default fee).
  const sortedMonths = (r.activeMonths || []).slice().sort();
  const monthsHtml = sortedMonths.length
    ? '<div style="max-height:180px;overflow-y:auto">' + sortedMonths.map(k => {
        const amt = _concEffectiveAmount(r, k);
        const overridden = r.monthlyBreakdown && typeof r.monthlyBreakdown[k] === 'number';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--glass-border-lt)">'
          + '<span style="font-size:12px;color:var(--silver-lt)">' + _concMonthLabel(k) + '</span>'
          + '<span style="font-size:12px;font-weight:700;color:' + (overridden ? 'var(--gold-lt)' : 'var(--text)') + '">₹' + fmtNum(amt)
          + (overridden ? ' <span style="font-size:9px;font-weight:600;color:var(--gold-lt)">(edited)</span>' : '') + '</span></div>';
      }).join('') + '</div>'
    : '<span style="font-size:12px;color:var(--muted)">Indefinite — ₹' + fmtNum(r.concessionFee || 0) + '/month applies to every month (no fixed duration set).</span>';

  // JSS-REF-VELTRIX-2026-004 ITEM 07: render as a full-screen CENTERED popup (the same
  // dimmed-overlay + centered-card pattern as showReceipt) instead of a small popover
  // anchored to the info icon. The overlay keeps id="_csInfoPop" so the existing dedupe
  // check (top of this function) and the content's close button both target it.
  const overlay = document.createElement('div');
  overlay.id = '_csInfoPop';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:24px;animation:modalIn .15s ease';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const pop = document.createElement('div');
  pop.style.cssText = 'background:var(--panel);border:1px solid var(--glass-border);border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,0.65);padding:18px 20px;width:100%;max-width:380px;max-height:88vh;overflow-y:auto;font-size:13px;color:var(--silver-lt)';

  pop.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<span style="font-weight:700;font-size:13px;color:var(--gold-lt)">&#9432; Concession Details</span>' +
      '<button onclick="document.getElementById(&apos;_csInfoPop&apos;).remove()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;line-height:1;padding:0">&times;</button>' +
    '</div>' +
    // R2: whose concession is this? The popup showed dates, discount and months but
    // never named the candidate — open two students' details in a row and there was
    // nothing on the card to tell them apart.
    '<div style="margin-bottom:12px;padding:8px 11px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.22);border-radius:8px">' +
      '<div style="font-weight:700;font-size:14px;color:var(--silver-lt)">'+sanitizeHTML(r.studentName||'—')+'</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+sanitizeHTML(r.admissionNo||'—')+' &middot; '+sanitizeHTML(r.class||r.cls||'—')+(r.section?' &ndash; '+sanitizeHTML(r.section):'')+'</div>' +
    '</div>' +
    '<div style="margin-bottom:8px">' +
      '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Set On</div>' +
      '<div style="font-weight:600;color:var(--text);font-size:12px">'+preciseDate+'</div>' +
    '</div>' +
    '<div style="margin-bottom:8px">' +
      '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Set By</div>' +
      '<div style="font-size:12px">'+sanitizeHTML(setBy)+'</div>' +
    '</div>' +
    (discount != null ? '<div style="margin-bottom:8px"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Discount / Operative Fee</div><div style="font-size:12px;color:var(--gold-lt);font-weight:600">₹'+fmtNum(discount)+' waived &rarr; Student pays ₹'+fmtNum(operative)+'</div></div>' : '') +
    (expired ? '<div style="margin-bottom:8px;padding:6px 10px;background:rgba(224,82,82,0.10);border:1px solid rgba(224,82,82,0.3);border-radius:6px;font-size:11px;color:var(--danger);font-weight:700">&#9203; This concession has expired — editing is disabled.</div>' : '') +
    '<div style="margin-bottom:8px">' +
      '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Monthly Breakdown</div>' +
      '<div>'+monthsHtml+'</div>' +
    '</div>' +
    (reason ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--glass-border)"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Reason / Remarks</div><div style="font-size:12px;color:var(--silver-lt);line-height:1.5">'+sanitizeHTML(reason)+'</div></div>' : '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--glass-border);font-size:11px;color:var(--muted)">No reason / remark recorded.</div>');

  overlay.appendChild(pop);
  document.body.appendChild(overlay);

  // Close on ESC (backdrop click is handled on the overlay above)
  const _csEsc = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', _csEsc); } };
  document.addEventListener('keydown', _csEsc);
}

function csFilterChange() {
  if (!window._csAllRecords) return;
  const block    = document.getElementById('cs_block')?.value || '';
  const cls      = document.getElementById('cs_class')?.value || '';
  const sections = _secDdGet('cs');
  const search   = (document.getElementById('cs_search')?.value || '').trim();
  const filters  = { block, cls, sections, search };
  const tbody    = document.getElementById('cs_tbody');
  if (tbody) tbody.innerHTML = _renderCsRows(window._csAllRecords, window._csAllStudents, window._csFeeSchedule, window._csConcMap, filters);
  const countEl = document.getElementById('cs_count');
  if (countEl) {
    const q = search.toLowerCase();
    const filtered = window._csAllRecords.filter(r =>
      (!block    || (r.block||r.blockId||'') === block) &&
      (!cls      || (r.class||r.cls||'')     === cls)   &&
      (!sections.length || sections.includes(r.section||'')) &&
      (!q || (r.studentName||'').toLowerCase().includes(q) || (r.admissionNo||'').toLowerCase().includes(q))
    );
    countEl.textContent = `${filtered.length} record${filtered.length!==1?'s':''}`;
  }
}

function csResetFilters() {
  ['cs_block','cs_class'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const searchEl = document.getElementById('cs_search'); if (searchEl) searchEl.value = '';
  window._secDdState_cs = [];
  window._secDdRegistry?.cs?.syncUI?.();
  csFilterChange();
}

/* ── [CHG-005 / ITEM-02 / ITEM-03] Concession edit modal (Principal only) ──
   Extended per JSS-REF-VELTRIX-2026-003 Item 02: within the existing Edit
   option, a specific month (inside the concession's active duration) can now
   be selected and its concession amount corrected independently, without
   touching any other month's amount. Item 03: blocked entirely once expired. */
async function openConcessionEdit(docId, studentName, admissionNo, cls, currentFee, stdFee) {
  if (currentRole !== 'principal') return;
  const record = (window._csRecordMap || {})[docId] || {};
  if (_isConcessionExpired(record.activeMonths)) {
    showToast('This concession has expired — editing is disabled.', 'danger');
    return;
  }
  const activeMonths = Array.isArray(record.activeMonths) ? [...record.activeMonths].sort() : [];

  // Lock months already PAID or EXCUSED — a settled month cannot be corrected.
  const locked = await _concGetLockedMonthKeys(admissionNo, activeMonths);
  window._concEditLockedMonths = locked; // defense-in-depth check on save/reset too

  const editableMonths = activeMonths.filter(k => !locked[k]);
  const monthOptionsHtml = activeMonths.map(k => {
    const tag = locked[k] === 'paid' ? ' — ✓ Paid (locked)' : locked[k] === 'excused' ? ' — ✓ Excused (locked)' : '';
    return `<option value="${k}" ${locked[k] ? 'disabled' : ''}>${_concMonthLabel(k)}${tag}</option>`;
  }).join('');
  const defaultSelectKey = editableMonths[0] || activeMonths[0] || '';

  const modal = document.createElement('div');
  modal.id = 'concessionEditModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--glass-border);border-radius:14px;padding:28px 32px;min-width:340px;max-width:460px;max-height:90vh;overflow-y:auto">
      <div style="font-size:16px;font-weight:700;color:var(--silver-hl);margin-bottom:4px">Edit Concession</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:18px">${sanitizeHTML(studentName)} · ${sanitizeHTML(admissionNo)} · ${sanitizeHTML(cls)}</div>

      <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">Default / Overall Amount</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Standard fee: <strong style="color:var(--silver)">₹${fmtNum(stdFee)}</strong> · applies to any month below without its own correction</div>
      <label class="form-label" style="font-size:12px">Fee After Concession (₹) *</label>
      <input id="concessionFeeInput" class="form-control" type="number" min="0" step="50" value="${currentFee}" style="margin-bottom:14px">
      <div id="concessionEditAlert"></div>
      <div style="display:flex;gap:10px;margin-bottom:${activeMonths.length ? '20px' : '4px'}">
        <button class="btn btn-primary btn-sm" onclick="saveConcessionEdit('${docId}','${jsAttr(studentName)}','${admissionNo}','${cls}',${stdFee})">Save Default</button>
      </div>

      ${activeMonths.length ? `
      <div style="padding-top:16px;border-top:1px solid var(--glass-border)">
        <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">Correct a Specific Month</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Fix the concession amount for one month only — editing this month will not change any other month's amount. Months already <strong>Paid</strong> or <strong>Excused</strong> are locked and cannot be corrected here.</div>
        ${editableMonths.length ? `
        <div class="form-row" style="margin-bottom:10px">
          <div>
            <label class="form-label" style="font-size:12px">Month</label>
            <select id="concessionMonthSelect" class="form-control" onchange="_concLoadMonthAmount('${docId}')">
              ${monthOptionsHtml}
            </select>
          </div>
          <div>
            <label class="form-label" style="font-size:12px">Amount for this month (₹) *</label>
            <input id="concessionMonthAmountInput" class="form-control" type="number" min="0" step="50">
          </div>
        </div>
        <div id="concessionMonthAlert"></div>
        <div style="display:flex;gap:10px;margin-bottom:4px">
          <button class="btn btn-primary btn-sm" onclick="saveConcessionMonthEdit('${docId}','${jsAttr(studentName)}',${stdFee})">Save Month</button>
          <button class="btn btn-ghost btn-sm" onclick="resetConcessionMonthEdit('${docId}','${jsAttr(studentName)}')">Reset to Default</button>
        </div>` : `
        <div style="font-size:12px;color:var(--muted);padding:8px 0">All active months for this concession are already Paid or Excused — nothing left to correct.</div>
        `}
      </div>` : `
      <div style="padding-top:16px;border-top:1px solid var(--glass-border);font-size:12px;color:var(--muted)">
        This concession is Indefinite (no fixed duration set) — per-month correction isn't applicable. Set specific Active Months on this concession to enable it.
      </div>`}

      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn btn-ghost" onclick="document.getElementById('concessionEditModal').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  if (editableMonths.length) {
    const sel = document.getElementById('concessionMonthSelect');
    if (sel) sel.value = defaultSelectKey;
    _concLoadMonthAmount(docId);
  }
}

// Pre-fills the month-amount input with the currently effective amount
// (override if one exists, else the default fee) whenever the month dropdown changes.
function _concLoadMonthAmount(docId) {
  const record = (window._csRecordMap || {})[docId] || {};
  const sel = document.getElementById('concessionMonthSelect');
  const inp = document.getElementById('concessionMonthAmountInput');
  if (!sel || !inp) return;
  inp.value = _concEffectiveAmount(record, sel.value);
}

// [ITEM-02] Save a correction for exactly one month, stored under
// monthlyBreakdown.<YYYY-MM> — leaves every other month's amount untouched.
async function saveConcessionMonthEdit(docId, studentName, stdFee) {
  if (currentRole !== 'principal') return;
  const record = (window._csRecordMap || {})[docId] || {};
  if (_isConcessionExpired(record.activeMonths)) {
    showFormAlert('concessionMonthAlert', '❌ This concession has expired — editing disabled.', 'danger');
    return;
  }
  const sel = document.getElementById('concessionMonthSelect');
  const inp = document.getElementById('concessionMonthAmountInput');
  const key = sel?.value;
  const val = parseFloat(inp?.value);
  if (!key) { showFormAlert('concessionMonthAlert', '❌ Select a month.', 'danger'); return; }
  if (window._concEditLockedMonths && window._concEditLockedMonths[key]) {
    showFormAlert('concessionMonthAlert', '❌ ' + _concMonthLabel(key) + ' is already ' + (window._concEditLockedMonths[key] === 'excused' ? 'Excused' : 'Paid') + ' — locked, cannot be corrected.', 'danger');
    return;
  }
  if (isNaN(val) || val < 0) { showFormAlert('concessionMonthAlert', '❌ Enter a valid amount (0 or above).', 'danger'); return; }
  if (val > stdFee) { showFormAlert('concessionMonthAlert', '❌ Amount cannot exceed the standard fee (₹'+fmtNum(stdFee)+').', 'danger'); return; }
  try {
    await schoolCol('concessionFees').doc(docId).update({
      [`monthlyBreakdown.${key}`]: val,
      setBy: currentUser?.displayName || currentUser?.email || 'Principal',
      setAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // auditLog cannot throw — see search.js.
    auditLog('concession_month_edit', { studentName, month: key, amount: val });
    // ITEMS 4 + 17: a per-month concession correction changes that month's rate, so
    // it changes what the student owes. Reconcile before re-rendering, or the
    // register redraws from the pre-edit aggregate.
    await _flReconcileByAdmissionNo(record.admissionNo || record.admNo, 'concession_month_edit');
    invalidateFinanceCache(); invalidateStudentCache();
    showToast(`${_concMonthLabel(key)} concession corrected for ${studentName} → ₹${fmtNum(val)}`, 'success');
    document.getElementById('concessionEditModal')?.remove();
    renderConcessionStudents();
  } catch(e) {
    showFormAlert('concessionMonthAlert', '❌ Save failed: ' + e.message, 'danger');
  }
}

// [ITEM-02] Remove a month's override so it falls back to the default amount.
async function resetConcessionMonthEdit(docId, studentName) {
  if (currentRole !== 'principal') return;
  const record = (window._csRecordMap || {})[docId] || {};
  if (_isConcessionExpired(record.activeMonths)) {
    showFormAlert('concessionMonthAlert', '❌ This concession has expired — editing disabled.', 'danger');
    return;
  }
  const sel = document.getElementById('concessionMonthSelect');
  const key = sel?.value;
  if (!key) return;
  if (window._concEditLockedMonths && window._concEditLockedMonths[key]) {
    showFormAlert('concessionMonthAlert', '❌ ' + _concMonthLabel(key) + ' is already ' + (window._concEditLockedMonths[key] === 'excused' ? 'Excused' : 'Paid') + ' — locked, cannot be corrected.', 'danger');
    return;
  }
  try {
    await schoolCol('concessionFees').doc(docId).update({
      [`monthlyBreakdown.${key}`]: firebase.firestore.FieldValue.delete()
    });
    // ITEMS 4 + 17: reverting a month to the default rate is a rate change too —
    // it raises what that month owes, which is exactly the direction that must
    // never be missed.
    await _flReconcileByAdmissionNo(record.admissionNo || record.admNo, 'concession_month_reset');
    invalidateFinanceCache(); invalidateStudentCache();
    showToast(`${_concMonthLabel(key)} reset to default for ${studentName}`, 'success');
    document.getElementById('concessionEditModal')?.remove();
    renderConcessionStudents();
  } catch(e) {
    showFormAlert('concessionMonthAlert', '❌ Reset failed: ' + e.message, 'danger');
  }
}

async function saveConcessionEdit(docId, studentName, admissionNo, cls, stdFee) {
  if (currentRole !== 'principal') return;
  const record = (window._csRecordMap || {})[docId] || {};
  if (_isConcessionExpired(record.activeMonths)) { // Item 03
    showFormAlert('concessionEditAlert', '❌ This concession has expired — editing disabled.', 'danger');
    return;
  }
  const inp = document.getElementById('concessionFeeInput');
  const val = parseFloat(inp?.value);
  if (isNaN(val) || val < 0) {
    showFormAlert('concessionEditAlert', '❌ Enter a valid fee amount (0 or above).', 'danger');
    return;
  }
  try {
    await schoolCol('concessionFees').doc(docId).update({
      concessionFee: val,
      setBy:         currentUser?.displayName || currentUser?.email || 'Principal',
      setAt:         firebase.firestore.FieldValue.serverTimestamp()
    });
    // ITEMS 4 + 17: the headline concession rate changed — reconcile the student
    // before anything re-renders from the stored aggregate.
    await _flReconcileByAdmissionNo(admissionNo, 'concession_edit');
    invalidateFinanceCache(); invalidateStudentCache();
    document.getElementById('concessionEditModal')?.remove();
    showToast(`Concession updated for ${studentName} → ₹${fmtNum(val)}`, 'success');
    // Refresh the Concession Students register (where this modal is opened from)
    // instead of navigating to Fee Structure, so the updated Monthly Breakdown
    // is immediately visible — consistent with the new per-month save/reset flows.
    renderConcessionStudents();
  } catch(e) {
    showFormAlert('concessionEditAlert', '❌ Save failed: ' + e.message, 'danger');
  }
}

async function removeConcession(docId, studentName) {
  if (currentRole !== 'principal') return;
  if (!confirm(`Remove concession override for ${studentName}? They will revert to the standard class fee.`)) return;
  try {
    // ITEMS 4 + 17: capture the admission number BEFORE the delete — once the
    // concession document is gone there is nothing left to resolve the student from,
    // and the reconcile would silently no-op on the one path that RAISES what is owed.
    const _rec = (window._csRecordMap || {})[docId] || {};
    let _admNo = _rec.admissionNo || _rec.admNo || '';
    if (!_admNo) {
      try {
        const d = await schoolCol('concessionFees').doc(docId).get();
        _admNo = (d.exists && (d.data().admissionNo || d.data().admNo)) || '';
      } catch (e) {
        console.error('[CONCESSION] Could not re-read ' + docId + ' to recover its admission ' +
          'number before removal:', (e && e.message) || e);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // NO ADMISSION NUMBER MEANS NO DELETE. THIS PATH RAISES WHAT IS OWED.
    //
    // The comment above already names the hazard, and the fallback above was
    // written to avoid it — but its failure was swallowed and the delete ran
    // regardless. With an empty _admNo the sequence was: remove the discount,
    // then call a reconcile that resolves nobody and returns quietly. The
    // student's rate goes UP and every stored figure keeps describing the
    // discounted one, with a green success toast over the top.
    //
    // Fail closed. A concession left in place is visible, reversible and
    // costs the school a known amount; a concession removed with no reconcile
    // is an under-stated debt that nothing on screen would reveal. Refusing
    // is the recoverable option, so refusing is the default.
    // ══════════════════════════════════════════════════════════════════════
    if (!_admNo) {
      showToast('Cannot remove this concession: its admission number could not be resolved, ' +
                'so the student\'s dues could not be recalculated afterwards. Nothing was ' +
                'changed. Reload the Concession Management screen and try again.', 'danger');
      return;
    }

    await schoolCol('concessionFees').doc(docId).delete();

    // The reconcile is what raises this student's dues back to the standard
    // rate. If it fails the concession is already gone, so the operator must be
    // told the figures are behind — same reasoning as the payment path (F2).
    const _reconciled = await _flReconcileByAdmissionNo(_admNo, 'concession_removed');
    invalidateFinanceCache(); invalidateStudentCache();
    if (_reconciled === false) {
      showToast(`Concession removed for ${studentName}, but their dues could NOT be ` +
                `recalculated. Every screen will keep showing the old discounted figure ` +
                `until a reconcile succeeds. Adm# ${_admNo}.`, 'warning');
    } else {
      showToast(`Concession removed for ${studentName}. Standard fee now applies.`, 'success');
    }
    renderFeeStructure();
  } catch(e) {
    showToast('Remove failed: ' + e.message, 'danger');
  }
}

// P-E #05 — FEE STRUCTURE EDITOR (Principal only)
// Edits schools/{id}.config.feeSchedule in Firestore
// ════════════════════════════════════════════════
function toggleFeeStructEdit() {
  const displays = document.querySelectorAll('.fee-struct-display');
  const inputs   = document.querySelectorAll('.fee-struct-input');
  const btns     = document.getElementById('feeStructButtons');
  const editBtn  = document.getElementById('feeStructEditBtn');
  displays.forEach(el => el.style.display = 'none');
  inputs.forEach(el => el.style.display = 'block');
  if (btns) btns.style.display = 'flex';
  if (editBtn) editBtn.style.display = 'none';
}

function cancelFeeStructEdit() {
  const displays = document.querySelectorAll('.fee-struct-display');
  const inputs   = document.querySelectorAll('.fee-struct-input');
  const btns     = document.getElementById('feeStructButtons');
  const editBtn  = document.getElementById('feeStructEditBtn');
  displays.forEach(el => el.style.display = 'block');
  inputs.forEach(el => { el.style.display = 'none'; });
  if (btns) btns.style.display = 'none';
  if (editBtn) editBtn.style.display = '';
}

async function saveFeeStructure() {
  if (currentRole !== 'principal') {
    showToast('Only Principal can edit fee structure.', 'danger');
    return;
  }
  if (!currentSchoolId) { showToast('School ID not loaded.', 'danger'); return; }

  // Gather new rates from inputs
  const newSchedule = {};
  let hasError = false;
  document.querySelectorAll('.fee-struct-input').forEach(inp => {
    const cls  = inp.dataset.class;
    const val  = parseFloat(inp.value);
    if (!cls || isNaN(val) || val < 0) { hasError = true; return; }
    newSchedule[cls] = val;
  });

  if (hasError || Object.keys(newSchedule).length === 0) {
    showFormAlert('feeStructAlert', '❌ Invalid values detected. All fees must be positive numbers.', 'danger');
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // A GUESSED RATE MUST NEVER BECOME THE OFFICIAL FEE.
  //
  // loadSchoolConfig starts the schedule from _DEFAULT_FEE_SCHEDULE so a class with
  // no stored rate still bills something. Correct for reading — and a trap for
  // writing, because this form renders whatever is in the schedule and the save
  // below persists it. A default nobody chose would silently become the fee.
  //
  // Two guards:
  //   1. The config read FAILED, so every rate on screen is a default. Refuse
  //      outright — one save would overwrite the whole school's fees.
  //   2. Individual classes are showing a substituted default. Drop them from the
  //      write UNLESS the Principal typed something different, and say which.
  //      A deliberate edit still saves; an untouched guess never does.
  // ══════════════════════════════════════════════════════════════════════════
  if (typeof isFeeScheduleTrusted === 'function' && !isFeeScheduleTrusted()) {
    showFormAlert('feeStructAlert', '❌ The school fee configuration could not be read, so every ' +
      'rate shown is a built-in default rather than your own. Saving now would overwrite the ' +
      'real fees for every class. <strong>Reload the page</strong> and try again once the ' +
      'configuration loads.', 'danger');
    return;
  }
  const _substituted = (typeof getFeeScheduleSubstituted === 'function') ? getFeeScheduleSubstituted() : [];
  const _guessesKept = [];
  if (_substituted.length) {
    const _live = (typeof getFeeSchedule === 'function') ? getFeeSchedule() : {};
    _substituted.forEach(cls => {
      if (newSchedule[cls] === undefined) return;
      if (Number(newSchedule[cls]) === Number(_live[cls])) {   // untouched guess
        delete newSchedule[cls];
        _guessesKept.push(cls);
      }
    });
    if (!Object.keys(newSchedule).length) {
      showFormAlert('feeStructAlert', '⚠️ Nothing to save. ' + _guessesKept.join(', ') +
        ' have no stored rate and are showing a built-in default — type the real fee for ' +
        'each before saving, so a guess is never recorded as the official amount.', 'warning');
      return;
    }
  }

  // Snapshot the rates BEFORE the write, so we can reconcile only the classes whose
  // rate actually moved. Re-pricing an untouched class would be pointless work on
  // every save. See the reconcile block at the end of this function.
  const _ratesBefore = Object.assign({}, (typeof _tenantFeeSchedule !== 'undefined' && _tenantFeeSchedule) || {});

  try {
    await currentUser.getIdToken(true);
    // BUG-⑨ FIX: Write rates to BOTH config.feeSchedule AND feeCategoryConfig so
    // the Fee Category Setup UI and the fee engine always stay in sync.
    //
    // ══════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-005 ITEM 3 — why the Principal got permission-denied.
    //
    // The ARC-018 rule on schools/{id} enforces a STRUCTURAL LOCK: once
    // feeCategoryLocked is true, the incoming and existing feeCategoryConfig key
    // sets must match exactly. On an update, request.resource.data is the MERGED
    // document, so the incoming key set is (existing keys + every class this form
    // writes). The Edit Rates table is built from the full class list, while
    // feeCategoryConfig only holds the classes that went through Fee Category
    // Setup — so any class present in the table but missing from the map made the
    // key sets differ and Firestore rejected the ENTIRE write, pure rate changes
    // included. Nothing about the rates themselves was ever the problem.
    //
    // When the categories are locked we therefore send feeCategoryConfig updates
    // ONLY for classes already in the map (rate-value edits, which the lock has
    // always been intended to permit) and report any class we had to skip.
    // config.feeSchedule — the map the fee engine actually reads — is always
    // written in full, so no rate edit is silently lost.
    //
    // firestore.rules in the repo root carries the corrected ruleset; it must be
    // published from the Firebase console by hand. This client-side guard makes
    // rate edits work against the rules as they stand today, before that.
    // ══════════════════════════════════════════════════════════════════════════
    let _lockedKeys = null;
    try {
      const _schoolDoc  = await db.collection('schools').doc(currentSchoolId).get();
      const _schoolData = _schoolDoc.exists ? _schoolDoc.data() : {};
      if (_schoolData.feeCategoryLocked === true &&
          _schoolData.feeCategoryConfig && typeof _schoolData.feeCategoryConfig === 'object') {
        _lockedKeys = new Set(Object.keys(_schoolData.feeCategoryConfig));
      }
    } catch(_) { /* read failed — fall through and attempt the full write */ }

    const feeCatUpdate = {};
    const _skipped = [];
    Object.entries(newSchedule).forEach(([cls, rate]) => {
      if (_lockedKeys && !_lockedKeys.has(cls)) { _skipped.push(cls); return; }
      feeCatUpdate[`feeCategoryConfig.${cls}`] = { rate };
    });
    // ══════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-005 L6 — the other half of "one edit changed all rates".
    //
    // This wrote 'config.feeSchedule' as a WHOLE-MAP REPLACE built only from the
    // inputs currently on screen. Any class not rendered — because it was missing
    // from the map, or the grid was showing substituted defaults — was ERASED from
    // Firestore by a save the Principal thought only touched one rate.
    //
    // Combined with the all-or-nothing load gate, that made the corruption stick:
    // load substitutes defaults, the grid renders those defaults, saving persists
    // them over the real rates, and the originals are gone for good.
    //
    // Now written per class as dot-paths, so a save can only ever change the classes
    // it actually edited. A class absent from the form is left untouched rather than
    // deleted.
    // ══════════════════════════════════════════════════════════════════════════
    const _schedUpdate = {};
    Object.entries(newSchedule).forEach(([cls, rate]) => {
      _schedUpdate['config.feeSchedule.' + cls] = rate;
    });
    await db.collection('schools').doc(currentSchoolId).update({
      ..._schedUpdate,
      ...feeCatUpdate,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (_skipped.length) {
      showToast(`Rates saved. ${_skipped.length} class${_skipped.length>1?'es':''} (${_skipped.join(', ')}) ` +
                `are not in the locked Fee Category list, so only the fee schedule was updated for them.`, 'warning');
    }

    // Update in-memory schedule so the _FEE_SCHEDULE Proxy reflects changes at once.
    // L6: MERGE, do not replace — assigning newSchedule wholesale would drop any class
    // that was not on the form from the in-memory map too, reproducing the same bug
    // client-side until the next reload.
    _tenantFeeSchedule = Object.assign({}, _tenantFeeSchedule || {}, newSchedule);

    cancelFeeStructEdit();
    showToast('Fee structure saved successfully.', 'success');
    if (_guessesKept.length) {
      showToast(`${_guessesKept.join(', ')} were left untouched — they have no stored rate and ` +
                `were showing a built-in default. Type the real fee to set them.`, 'warning');
    }

    // Refresh the display values
    document.querySelectorAll('.fee-struct-display').forEach(el => {
      const cls = el.dataset.class;
      if (newSchedule[cls] !== undefined) el.textContent = '₹' + fmtNum(newSchedule[cls]);
    });

    // ══════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-005 ITEM 1 — A RATE CHANGE IS A FEE-RELEVANT CHANGE.
    //
    // This was the last unhooked fee operation in the system. Twelve others —
    // payment, past due, waiver, deletion, undo, admission, bulk admit, class edit,
    // all four concession paths, termination, hide, unhide, both promotions — each
    // reconcile the students they touch. Editing a class rate did not, and it is the
    // WIDEST of them: one edit changes what every student in that class owes.
    //
    // So the rate moved and every stored outstandingBalance in that class kept the
    // old figure until something unrelated happened to touch the student. Two live
    // cases were found this way before the cause was:
    //
    //   Test Student Five   ADM-TEST-015, Grade 6 — stored 18,700 = 11 x 1,700
    //   Test Student Six   ADM-TEST-016, Grade 6 — stored 20,400 = 12 x 1,700
    //
    // Grade 6 bills 1,800. Both were carrying a pre-change rate, 1,200 light each,
    // and neither would ever have corrected itself.
    //
    // Only classes whose rate actually MOVED are reconciled, and only ACTIVE
    // students: a departed student's figure is a historical snapshot and must not
    // shift because the school re-priced a class afterwards.
    //
    // Non-fatal by construction — _flReconcileMany never throws, and the save has
    // already succeeded by this point. A failure here leaves stale aggregates, which
    // is exactly the state before this block existed, so it can only ever improve on
    // the old behaviour.
    // ══════════════════════════════════════════════════════════════════════════
    try {
      if (typeof _flStudentsAffectedByRateChange === 'function' && typeof _flReconcileMany === 'function') {
        // The cache still holds the PRE-save class rates, which is fine — this only
        // reads each student's class and status, never a rate.
        const _all = await getStudentCache();
        const { changedClasses, studentIds } =
          _flStudentsAffectedByRateChange(_ratesBefore, newSchedule, _all || []);

        if (changedClasses.length && studentIds.length) {
          showToast(`Re-pricing ${studentIds.length} student${studentIds.length !== 1 ? 's' : ''} in ` +
                    `${changedClasses.join(', ')}…`, 'info');
          const _rc = await _flReconcileMany(studentIds, 'fee_structure_rate_change');
          if (typeof invalidateStudentCache === 'function') invalidateStudentCache();
          if (typeof invalidateFinanceCache === 'function') invalidateFinanceCache();
          showToast(_rc && _rc.failed
            ? `Re-priced ${_rc.ok} of ${studentIds.length}; ${_rc.failed} failed — re-open Fee Structure and save again to retry.`
            : `Dues updated for ${studentIds.length} student${studentIds.length !== 1 ? 's' : ''}.`,
            _rc && _rc.failed ? 'warning' : 'success');
        }
      }
    } catch (e) {
      console.warn('[FEE STRUCTURE] Rates saved, but re-pricing failed. Stored balances for ' +
        'the edited classes are STALE until those students are reconciled:', e && e.message);
      showToast('Rates saved, but dues could not be re-calculated. Open Due Fee to refresh.', 'warning');
    }

  } catch(e) {
    // ITEM 3: name the exact document, field and rule so this is actionable
    // instead of a generic "check your rules".
    const msg = e.code === 'permission-denied'
      ? '❌ Permission denied writing <strong>schools/' + sanitizeHTML(currentSchoolId || '?') + '</strong>. ' +
        'The rule on that document must allow a Principal to write <code>config.feeSchedule</code> and ' +
        '<code>feeCategoryConfig</code>. If the ARC-018 fee-category lock is on, its structural check also ' +
        'has to permit rate-value edits. Publish <code>firestore.rules</code> (repo root) from the Firebase console.'
      : '❌ Save failed: ' + e.message;
    showFormAlert('feeStructAlert', msg, 'danger');
  }
}

// ════════════════════════════════════════════════
// VLX-REF-002: openEditTxModal, closeEditTxModal, saveEditedTx removed — Edit functionality disabled.


// JSS-REF-015 FIX: previously this navigated to the Record Payment page
// (pushNav('recordFee', ...)) just to display the receipt, yanking the user
// away from wherever they actually were (Paid Fee table, Dashboard, etc).
// showReceipt() is now a self-contained popup, so it can be opened directly
// on top of the current section — no navigation needed at all.
async function viewReceipt(txId) {
  try {
    // Try cache first — no Firestore read if Finance page was already visited
    // BUG-PDR-READ-FIX: normalize legacy past_due_payment docs on the way out too
    const cached = (window._financeData||[]).find(t => t.id === txId);
    // LEAK-AUDIT FIX: neither the cache hit nor the Firestore fallback below previously
    // checked isHiddenPayment — any txId reaching this function (typo'd link, stale
    // handler, devtools call) would render a hidden-student receipt to a non-principal
    // with zero gate. Both paths now enforce the same rule as Finance/Export/Search.
    if (cached) {
      if (cached.isHiddenPayment && currentRole !== 'principal') { showToast('Receipt not accessible.', 'danger'); return; }
      showReceipt(_normalizeTx(cached)); return;
    }
    // Fallback: fetch from Firestore
    const doc = await schoolCol('feeTransactions').doc(txId).get();
    if (!doc.exists) { showToast('Receipt not found.', 'danger'); return; }
    const txData = { id: doc.id, ...doc.data() };
    if (txData.isHiddenPayment && currentRole !== 'principal') { showToast('Receipt not accessible.', 'danger'); return; }
    showReceipt(_normalizeTx(txData));
  } catch(e) { showToast('Error loading receipt: ' + e.message, 'danger'); }
}

