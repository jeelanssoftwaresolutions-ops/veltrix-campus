/* ============================================================
   STUDENTS LIST
   BUG-H05 FIX: filterStudentTable now operates on the full in-memory
   dataset (_allStudentsDataset), not just the active DOM rows.
   A "Show Terminated" toggle lets admins surface terminated records
   without leaving the Students page. Search covers name, admission no,
   roll no, parent name, and class — across ALL statuses.
   ============================================================ */

// Module-level state for the Students page
let _allStudentsDataset  = [];   // full snapshot (active + terminated)
let _showTerminatedToggle = false; // whether terminated rows are visible

/* ============================================================
   CHG-002 — Student Management: Block > Class > Section Drill-Down
   Level 1: BOYS | GIRLS toggle (default = both)
   Level 2: Class tile grid with live student counts
   Level 3: Section multi-select checkboxes
   Default view: all students ordered Nursery → Grade 10
   ============================================================ */

// State for CHG-002 drill-down
let _smState = {
  blocks:   [],   // selected blocks (empty = all)
  cls:      null, // selected class (null = all)
  sections: [],   // selected sections (empty = all)
  search:   '',
  showTerminated: false,
  admissionThisMonth: false,  // CHG-001: filter to new admissions this calendar month
  // BUG-P16: Date filter fields
  datePreset: '',   // 'today'|'yesterday'|'thisWeek'|'thisMonth'|'thisYear'|'custom'|'' 
  dateFrom:   null, // Date object - start of range (inclusive)
  dateTo:     null  // Date object - end of range (inclusive, end of day)
};

async function renderStudents(params={}) {
  setActiveNav('students');
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    // Reset drill-down state on fresh navigation (but preserve if params carry filters)
    if (!params._preserveState) {
      _smState = { blocks:[], cls:null, sections:[], search:'', showTerminated:false, admissionThisMonth: false };
    }
    // CHG-001: Pre-filter to new admissions this month when called from stat card
    if (params.admissionThisMonth) {
      _smState.admissionThisMonth = true;
    }

    // Fetch ALL students (no block scope — CHG-012)
    const snap = await schoolCol('students').orderBy('name').get();
    // JSS-REF-VELTRIX-2026-005 ITEM 1: exclude hidden students — moveStudentToHidden() leaves the
    // doc in /students with status:'hidden', and its own confirmation promises they are "hidden
    // from all reports, dashboard totals, and Admin views". The Hidden section is their only view.
    // Hidden is excluded for everyone — the Hidden section is its only view.
    // Terminated is additionally excluded for a NON-principal: the Terminated
    // section is already Principal-only, so leaving those rows reachable here
    // (and behind Show Terminated) contradicted the section that owns them.
    _allStudentsDataset = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.status !== 'hidden' && (_flMaySeeDeparted() || !_flIsDeparted(s)));

    _renderStudentsShell();
    _applyStudentFilters();
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error loading students: ${e.message}</div>`);
  }
}

function _renderStudentsShell() {
  const active     = _allStudentsDataset.filter(s => s.status === 'active').length;
  const terminated = _allStudentsDataset.filter(s => s.status !== 'active').length;

  setContent(`
    <div class="page-head flex-between" style="margin-bottom:16px">
      <div>
        <div class="page-title">Student Management</div>
        <div class="page-sub" id="studentPageSub">${active} active · ${terminated} terminated</div>
      </div>
      <div class="page-actions">
        ${canWrite() ? `
        <button class="btn btn-secondary" onclick="pushNav('addStudent',{type:'existing'})">
          ${iconPlus} Existing Student
        </button>
        <button class="btn btn-primary" onclick="pushNav('addStudent',{type:'new'})">
          ${iconPlus} New Admission
        </button>
        <button class="btn btn-secondary" onclick="renderBulkAdmit()" style="border-color:var(--info);color:var(--info)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
          Bulk Admit
        </button>
        <button class="btn btn-danger" onclick="navigate('bulkRemove')" style="border-color:var(--danger)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="10" x2="16" y2="10"/></svg>
          Bulk Remove
        </button>` : ''}
      </div>
    </div>

    <!-- Student Table -->
    <div class="card" style="margin-bottom:14px">
      <div class="filter-bar">
        <div class="filter-bar-row1">
          <div class="filter-bar-field">
            <div class="filter-bar-label">Block</div>
            <select id="sm_blockF" class="filter-bar-select" style="min-width:140px" onchange="_smApplyDropFilters()">
              <option value="">All Blocks</option>
              ${getBlocks().map(b=>'<option>'+b+'</option>').join('')}
            </select>
          </div>
          <div class="filter-bar-field">
            <div class="filter-bar-label">Class</div>
            <select id="sm_classF" class="filter-bar-select" style="min-width:150px" onchange="_smApplyDropFilters()">
              <option value="">All Classes</option>
              ${getClassList().map(c=>'<option>'+c+'</option>').join('')}
            </select>
          </div>
          <div class="filter-bar-field grow">
            <div class="filter-bar-label" style="display:flex;align-items:center;gap:4px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search
            </div>
            <input type="text" id="studentSearchInput" class="filter-bar-input"
              placeholder="Student · Parent · Contact · Adm No"
              oninput="_smOnSearch(this.value)">
          </div>
          <div class="filter-bar-field">
            <div class="filter-bar-label">Section</div>
            ${(()=>{ const dd=_mkSecDropdown('sm',getSections(),(sel)=>{ _smState.sections=sel; _applyStudentFilters(); }); return dd.html; })()}
          </div>
          <div class="filter-bar-field" style="align-self:flex-end">
            <div class="filter-bar-clear-spacer">-</div>
            <div style="display:flex;gap:6px">
              ${_flMaySeeDeparted()
                /* The dataset no longer contains terminated rows for a non-principal,
                   so this button would toggle nothing and read as broken. Hidden
                   rather than left to disappoint. */
                ? `<button class="btn btn-ghost btn-sm" id="toggleTermBtn" onclick="_smToggleTerminated()" style="white-space:nowrap;font-size:12px">Show Terminated</button>`
                : ''}
              <button class="btn btn-ghost btn-sm" onclick="_smClearAll()" style="font-size:12px;padding:8px 14px">Clear All Filter</button>
            </div>
          </div>
        </div>
        <!-- BUG-P16: Date filter row — applies against admissionDate / createdAt -->
        <div class="filter-bar-row1" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:flex-end">
          <div class="filter-bar-label" style="font-size:11px;color:var(--muted);align-self:center;white-space:nowrap">Check Admission Entry:</div>
          <button id="smdp_today"     class="btn btn-ghost btn-sm" style="font-size:12px;padding:6px 12px" onclick="_smSetDatePreset('today')">Today</button>
          <button id="smdp_yesterday" class="btn btn-ghost btn-sm" style="font-size:12px;padding:6px 12px" onclick="_smSetDatePreset('yesterday')">Yesterday</button>
          <button id="smdp_thisWeek"  class="btn btn-ghost btn-sm" style="font-size:12px;padding:6px 12px" onclick="_smSetDatePreset('thisWeek')">This Week</button>
          <button id="smdp_thisMonth" class="btn btn-ghost btn-sm" style="font-size:12px;padding:6px 12px" onclick="_smSetDatePreset('thisMonth')">This Month</button>
          <button id="smdp_thisYear"  class="btn btn-ghost btn-sm" style="font-size:12px;padding:6px 12px" onclick="_smSetDatePreset('thisYear')">This Year</button>
          <div style="display:flex;align-items:center;gap:6px;margin-left:4px">
            <input type="date" id="sm_dateFrom" class="filter-bar-input" style="width:145px;padding:6px 10px;font-size:12px"
              onchange="_smSetCustomDate()" title="From date">
            <span style="color:var(--muted);font-size:12px">–</span>
            <input type="date" id="sm_dateTo" class="filter-bar-input" style="width:145px;padding:6px 10px;font-size:12px"
              onchange="_smSetCustomDate()" title="To date">
          </div>
          <button class="btn btn-ghost btn-sm" onclick="_smClearDate()" style="font-size:12px;padding:6px 12px;color:var(--muted)">Clear Date</button>
        </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-hdr">
        <span class="card-title" id="studentTableTitle">All Students (Active)</span>
        <div style="display:flex;gap:6px;align-items:center">
          <!-- [CHG-003] Dual Export: PDF + XLSX — exports currently-visible filtered rows -->
          <button class="btn btn-secondary btn-sm" onclick="exportSmPDF()" title="Export visible students as PDF">
            📄 PDF
          </button>
          <button class="btn btn-secondary btn-sm" onclick="exportSmXLSX()" title="Export visible students as Excel">
            📊 XLSX
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="tbl-wrap">
          <table id="studentTable">
            <thead><tr>
              <th>Block</th><th>Adm. No</th><!-- [CHG-020] Roll removed --><th>Name</th>
              <th>Class / Section</th><th>Parent</th><th>Contact</th>
              <th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="studentTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

/* Build class tile grid with live counts */
function _renderClassGrid() {
  const grid = document.getElementById('smClassGrid');
  if (!grid) return;

  const classList = getClassList();
  const activeBase = _smState.showTerminated
    ? _allStudentsDataset.filter(s => s.status !== 'active')
    : _allStudentsDataset.filter(s => s.status === 'active');

  // Filter by selected blocks for counts
  const blockFiltered = _smState.blocks.length > 0
    ? activeBase.filter(s => _smState.blocks.includes(s.block))
    : activeBase;

  grid.innerHTML = classList.map(cls => {
    const count = blockFiltered.filter(s => s.class === cls).length;
    const isSelected = _smState.cls === cls;
    return `
      <div onclick="smSelectClass('${cls}')"
        style="cursor:pointer;border-radius:10px;padding:12px 18px;min-width:100px;text-align:center;
          border:2px solid ${isSelected ? 'var(--gold,#C9A84C)' : 'var(--border)'};
          background:${isSelected ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'};
          transition:all 0.15s;user-select:none">
        <div style="font-size:13px;font-weight:700;color:${isSelected ? 'var(--gold,#C9A84C)' : 'var(--silver-hl)'}">${cls}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${count} student${count !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('') + `
    <div onclick="smSelectClass(null)"
      style="cursor:pointer;border-radius:10px;padding:12px 18px;min-width:100px;text-align:center;
        border:2px solid ${_smState.cls === null ? 'var(--gold,#C9A84C)' : 'var(--border)'};
        background:${_smState.cls === null ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'};
        transition:all 0.15s;user-select:none">
      <div style="font-size:13px;font-weight:700;color:${_smState.cls === null ? 'var(--gold,#C9A84C)' : 'var(--silver-hl)'}">All Classes</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">${blockFiltered.length} student${blockFiltered.length !== 1 ? 's' : ''}</div>
    </div>`;
}

/* Render section checkboxes (Level 3) */
function _renderSectionPanel() {
  const panel = document.getElementById('smSectionPanel');
  const wrap  = document.getElementById('smSectionToggles');
  if (!panel || !wrap) return;

  const cls = _smState.cls;

  // Hide section panel if no class selected
  if (!cls) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';

  const sections = getSections();
  // Count per section for selected class+blocks
  const base = _allStudentsDataset.filter(s => {
    if (!_smState.showTerminated && s.status !== 'active') return false;
    if (s.class !== cls) return false;
    if (_smState.blocks.length > 0 && !_smState.blocks.includes(s.block)) return false;
    return true;
  });

  const allSelected = _smState.sections.length === 0;
  wrap.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;
      background:${allSelected ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'};
      border:1px solid ${allSelected ? 'var(--gold,#C9A84C)' : 'var(--border)'}">
      <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="_smToggleAllSections(this.checked)"
        style="accent-color:var(--gold,#C9A84C)">
      <span style="font-weight:700;font-size:13px">All Sections</span>
    </label>
    ${sections.map(sec => {
      const cnt = base.filter(s => s.section === sec).length;
      // Point 8 FIX: when allSelected, individual checkboxes are NOT checked (only "All" row is)
      const individualChecked = !allSelected && _smState.sections.includes(sec);
      return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;
          background:${individualChecked ? 'rgba(201,168,76,0.10)' : 'rgba(255,255,255,0.04)'};
          border:1px solid ${individualChecked ? 'var(--gold,#C9A84C)' : 'var(--border)'}">
        <input type="checkbox" data-sec="${sec}" ${individualChecked ? 'checked' : ''}
          onchange="_smToggleSection('${sec}', this.checked)"
          style="accent-color:var(--gold,#C9A84C)">
        <span style="font-size:13px">Section ${sec}</span>
        <span style="font-size:10px;color:var(--muted)">(${cnt})</span>
      </label>`;
    }).join('')}`;
}

/* ── CHG-002 event handlers ── */
function smToggleBlock(block) {
  if (_smState.blocks.includes(block)) {
    _smState.blocks = _smState.blocks.filter(b => b !== block);
  } else {
    _smState.blocks.push(block);
  }
  // Update button visual
  getBlocks().forEach(b => {
    const btn = document.querySelector(`[data-block="${b}"]`);
    if (!btn) return;
    const isBoys  = b === 'Boys Block';
    const accent  = isBoys ? 'var(--silver-lt)' : 'var(--gold-lt)';
    const accentBg= isBoys ? 'rgba(168,188,208,0.14)' : 'rgba(201,168,76,0.14)';
    const active = _smState.blocks.length === 0 || _smState.blocks.includes(b);
    btn.className = `btn ${active ? 'btn-primary' : 'btn-secondary'}`;
    btn.style.borderColor = accent;
    btn.style.background  = active ? accentBg : '';
    btn.style.color       = active ? accent : '';
  });
  _smState.sections = []; // reset section selection on block change
  _renderClassGrid();
  _renderSectionPanel();
  _applyStudentFilters();
}

function smResetBlocks() {
  _smState.blocks = [];
  getBlocks().forEach(b => {
    const btn = document.querySelector(`[data-block="${b}"]`);
    if (!btn) return;
    const isBoys  = b === 'Boys Block';
    const accent  = isBoys ? 'var(--silver-lt)' : 'var(--gold-lt)';
    const accentBg= isBoys ? 'rgba(168,188,208,0.14)' : 'rgba(201,168,76,0.14)';
    btn.className = 'btn btn-primary';
    btn.style.borderColor = accent;
    btn.style.background  = accentBg;
    btn.style.color       = accent;
  });
  _smState.sections = [];
  _renderClassGrid();
  _renderSectionPanel();
  _applyStudentFilters();
}

function smSelectClass(cls) {
  _smState.cls      = cls;
  _smState.sections = []; // reset section on class change
  _renderClassGrid();
  _renderSectionPanel();
  _applyStudentFilters();
}

function _smToggleAllSections(checked) {
  // Point 8 FIX: "All Sections" always means empty array (no filter)
  // Checking "All" → reset to [] (show all); unchecking is a no-op (stays all)
  _smState.sections = [];
  _renderSectionPanel();
  _applyStudentFilters();
}

function _smToggleSection(sec, checked) {
  const allSections = getSections();
  if (checked) {
    if (!_smState.sections.includes(sec)) _smState.sections.push(sec);
    // Point 8 FIX: if every section is now individually checked, collapse back to "All"
    if (_smState.sections.length === allSections.length) _smState.sections = [];
  } else {
    _smState.sections = _smState.sections.filter(s => s !== sec);
    // Point 8 FIX: if nothing is selected after unchecking, treat as "all" rather than "none"
    // This prevents an empty-filter edge case that hides all students
    if (_smState.sections.length === 0) _smState.sections = [];
  }
  _renderSectionPanel();
  _applyStudentFilters();
}

// ENH-017: SM filter bar section checkbox helpers
// ENH-017 SM bar helpers removed — now using _mkSecDropdown('sm', ...)

function _smOnSearch(val) {
  _smState.search = val;
  _applyStudentFilters();
}

function _smToggleTerminated() {
  _smState.showTerminated = !_smState.showTerminated;
  const btn = document.getElementById('toggleTermBtn');
  if (btn) {
    btn.textContent = _smState.showTerminated ? 'Hide Terminated' : 'Show Terminated';
    btn.className   = `btn btn-sm ${_smState.showTerminated ? 'btn-danger' : 'btn-secondary'}`;
  }
  _applyStudentFilters();
}

function _smApplyDropFilters() {
  // _smState.sections is managed by _mkSecDropdown('sm',...) callback — do NOT overwrite here.
  const blockF = document.getElementById('sm_blockF');
  const classF = document.getElementById('sm_classF');
  if (blockF) _smState.blocks = blockF.value ? [blockF.value] : [];
  if (classF) _smState.cls    = classF.value || null;
  _applyStudentFilters();
}

function _smClearAll() {
  _smState = { blocks:[], cls:null, sections:[], search:'', showTerminated:false, admissionThisMonth:false,
               datePreset:'', dateFrom:null, dateTo:null };
  ['studentSearchInput','sm_blockF','sm_classF','sm_dateFrom','sm_dateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset section dropdown
  window._secDdState_sm = [];
  window._secDdRegistry?.sm?.syncUI?.();
  // Reset date preset button highlights
  ['today','yesterday','thisWeek','thisMonth','thisYear'].forEach(p => {
    const btn = document.getElementById('smdp_'+p);
    if (btn) { btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; }
  });
  _applyStudentFilters();
}

// CHG-001: Clear only the admission-month filter, keep other filters intact
function _smClearAdmissionFilter() {
  _smState.admissionThisMonth = false;
  const banner = document.getElementById('smAdmissionMonthBanner');
  if (banner) banner.remove();
  _applyStudentFilters();
}

// BUG-P16: Date preset helper — sets _smState.dateFrom / dateTo from named preset
function _smSetDatePreset(preset) {
  const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  let from, to;
  if (preset === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (preset === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    from = new Date(y.getFullYear(), y.getMonth(), y.getDate());
    to   = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
  } else if (preset === 'thisWeek') {
    const day = now.getDay(); // 0=Sun
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    to   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day), 23, 59, 59, 999);
  } else if (preset === 'thisMonth') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (preset === 'thisYear') {
    from = new Date(now.getFullYear(), 0, 1);
    to   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  }
  _smState.datePreset = preset;
  _smState.dateFrom = from;
  _smState.dateTo   = to;
  // Clear custom date inputs
  const fromEl = document.getElementById('sm_dateFrom');
  const toEl   = document.getElementById('sm_dateTo');
  if (fromEl) fromEl.value = '';
  if (toEl)   toEl.value   = '';
  // Highlight active preset button
  ['today','yesterday','thisWeek','thisMonth','thisYear'].forEach(p => {
    const btn = document.getElementById('smdp_'+p);
    if (!btn) return;
    if (p === preset) {
      btn.style.background = 'rgba(201,168,76,0.20)';
      btn.style.color = 'var(--gold-lt)';
      btn.style.borderColor = 'var(--gold)';
    } else {
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }
  });
  _applyStudentFilters();
}

// BUG-P16: Custom date range from the From/To pickers
function _smSetCustomDate() {
  const fromEl = document.getElementById('sm_dateFrom');
  const toEl   = document.getElementById('sm_dateTo');
  const fromVal = fromEl ? fromEl.value : '';
  const toVal   = toEl   ? toEl.value   : '';
  // Clear preset highlights
  ['today','yesterday','thisWeek','thisMonth','thisYear'].forEach(p => {
    const btn = document.getElementById('smdp_'+p);
    if (btn) { btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; }
  });
  _smState.datePreset = fromVal || toVal ? 'custom' : '';
  _smState.dateFrom = fromVal ? new Date(fromVal + 'T00:00:00') : null;
  _smState.dateTo   = toVal   ? new Date(toVal   + 'T23:59:59') : null;
  _applyStudentFilters();
}

// BUG-P16: Clear date filter only
function _smClearDate() {
  _smState.datePreset = '';
  _smState.dateFrom   = null;
  _smState.dateTo     = null;
  const fromEl = document.getElementById('sm_dateFrom');
  const toEl   = document.getElementById('sm_dateTo');
  if (fromEl) fromEl.value = '';
  if (toEl)   toEl.value   = '';
  ['today','yesterday','thisWeek','thisMonth','thisYear'].forEach(p => {
    const btn = document.getElementById('smdp_'+p);
    if (btn) { btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; }
  });
  _applyStudentFilters();
}

/* ── Core filter + render ── */
function _applyStudentFilters() {
  const tbody = document.getElementById('studentTableBody');
  if (!tbody) return;

  const classList = getClassList();
  // canonical sort order: Nursery=0, LKG=1, … Grade 10=12
  const classOrder = Object.fromEntries(classList.map((c, i) => [c, i]));

  // Base set — when terminated toggle is ON show ONLY terminated; otherwise only active
  let base = _smState.showTerminated
    ? _allStudentsDataset.filter(s => s.status !== 'active')
    : _allStudentsDataset.filter(s => s.status === 'active');

  // Block filter
  if (_smState.blocks.length > 0) {
    base = base.filter(s => _smState.blocks.includes(s.block));
  }

  // Class filter
  if (_smState.cls) {
    base = base.filter(s => s.class === _smState.cls);
  }

  // Section filter (multi-select)
  if (_smState.sections.length > 0) {
    base = base.filter(s => _smState.sections.includes(s.section));
  }

  // Search
  const lq = (_smState.search || '').trim().toLowerCase();
  if (lq) {
    base = base.filter(s =>
      (s.name||'').toLowerCase().includes(lq)       ||
      (s.parentName||'').toLowerCase().includes(lq)  ||
      (s.contact||'').toLowerCase().includes(lq)     ||
      (s.admissionNumber||'').toLowerCase().includes(lq) ||
      // [CHG-020] rollNumber removed from search
      
      (`${s.class||''} ${s.section||''}`).toLowerCase().includes(lq)
    );
  }

  // CHG-001: New Admissions This Month filter
  if (_smState.admissionThisMonth) {
    const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    base = base.filter(s => {
      if (!s.admissionDate) return false;
      const ts = s.admissionDate.toDate
        ? s.admissionDate.toDate().getTime()
        : new Date(s.admissionDate).getTime();
      return ts >= startOfMonth && ts <= endOfMonth;
    });
  }

  // BUG-P16 FIX: Date filter — applies against admissionDate (primary) or createdAt (fallback)
  if (_smState.dateFrom || _smState.dateTo) {
    const fromMs = _smState.dateFrom ? _smState.dateFrom.getTime() : -Infinity;
    const toMs   = _smState.dateTo   ? _smState.dateTo.getTime()   : Infinity;
    base = base.filter(s => {
      // Resolve timestamp: admissionDate first, then createdAt
      const raw = s.admissionDate || s.createdAt;
      if (!raw) return false;
      const ms = raw.toDate ? raw.toDate().getTime() : new Date(raw).getTime();
      return ms >= fromMs && ms <= toMs;
    });
  }

  // BUG-P07 FIX: Sort by canonical class order → section A–E → name
  base.sort((a, b) => {
    const co = (classOrder[a.class] ?? 99) - (classOrder[b.class] ?? 99);
    if (co !== 0) return co;
    const so = (a.section||'').localeCompare(b.section||'');
    if (so !== 0) return so;
    return (a.name||'').localeCompare(b.name||'');
  });

  tbody.innerHTML = _renderStudentRows(base);
  window._smCurrentVisible = base; // [CHG-003] Export uses this to honour active filters
  _updateStudentTableTitle(base, lq);
}

/** Legacy filter shim — kept so any residual call sites still work */
function filterStudentTable(q) {
  _smState.search = q || '';
  const blockFilter = (document.getElementById('studentBlockFilter')?.value || '').trim();
  if (blockFilter) _smState.blocks = [blockFilter];
  _applyStudentFilters();
}


/** Render TR rows — same columns as before + group header support */
function _renderStudentRows(list) {
  if (list.length === 0) {
    return `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--muted)">No students found.</td></tr>`;
  }

  const classList = getClassList();
  const classOrder = Object.fromEntries(classList.map((c, i) => [c, i]));

  // Optionally insert group-header rows when showing all classes
  const rows = [];
  let lastGroup = null;

  list.forEach(s => {
    const group = `${s.block||'No Block'} · ${s.class||'—'} · Section ${s.section||'—'}`;
    if (!_smState.cls && group !== lastGroup) {
      lastGroup = group;
      rows.push(`<tr>
        <td colspan="9" style="background:rgba(255,255,255,0.04);padding:6px 12px;font-size:11px;
          font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid var(--border)">
          ${group}
        </td>
      </tr>`);
    }

    const sn = jsAttr(s.name);   // AUDIT F2: was the nearly-right sixth variant
    const isActive = s.status === 'active';
    const blockBadge = s.block
      ? `<span style="font-size:10px;background:${s.block==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${s.block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'};padding:2px 7px;border-radius:10px;font-weight:600">${s.block}</span>`
      : `<span style="font-size:10px;background:rgba(155,181,160,0.18);color:var(--muted);padding:2px 7px;border-radius:10px;font-weight:500;cursor:pointer" onclick="showEditStudentModal('${s.id}')">⚠ Unassigned</span>`;

    rows.push(`<tr data-status="${s.status||'active'}" ${_studentRowAttrs(s)}>
      <td>${blockBadge}</td>
      <td class="muted">${s.admissionNumber||'—'}</td>
      <!-- [CHG-020] Roll # column removed -->
      <td>${_studentNameLink(s.name, s)}</td>
      <td>${s.class||''} ${s.section||''}</td>
      <td>${s.parentName||'—'}</td>
      <td>${s.contact||'—'}</td>
      <td>${studentStatusBadge(s.status)}</td>   <!-- ITEM 6: was Active/Terminated only -->

      <td>
        <button class="btn btn-ghost btn-sm" onclick="pushNav('studentProfile',{id:'${s.id}'})">View</button>
        ${currentRole==='principal'&&isActive?`<button class="btn btn-danger btn-sm" onclick="terminateStudent('${s.id}','${sn}')">Terminate</button>`:''}
      </td>
    </tr>`);
  });

  return rows.join('');
}

function _updateStudentTableTitle(list, query='') {
  const titleEl = document.getElementById('studentTableTitle');
  if (!titleEl) return;
  const activeCount = list.filter(s => s.status === 'active').length;
  const termCount   = list.filter(s => s.status !== 'active').length;
  const clsPart = _smState.cls ? ' · ' + _smState.cls : '';
  const secPart = _smState.sections.length > 0 ? ' · Sec ' + _smState.sections.join(', ') : '';
  const blkPart = _smState.blocks.length > 0 ? ' · ' + _smState.blocks.map(b => b.replace(' Block','')).join('/') : '';
  // CHG-001: show month filter label when active
  const monthPart = _smState.admissionThisMonth ? ' · New This Month' : '';
  if (query) {
    titleEl.textContent = 'Search: "' + query + '" — ' + list.length + ' student' + (list.length!==1?'s':'');
  } else {
    const termStr = termCount > 0 ? ' + ' + termCount + ' terminated' : '';
    titleEl.textContent = (activeCount + termCount) + ' Student' + ((activeCount+termCount)!==1?'s':'') + blkPart + clsPart + secPart + monthPart + termStr;
  }

  // CHG-001: Show/hide the "Filtered: New Admissions This Month" banner
  let banner = document.getElementById('smAdmissionMonthBanner');
  if (_smState.admissionThisMonth) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'smAdmissionMonthBanner';
      const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
      const monthName = now.toLocaleDateString('en-IN', {timeZone:IST_TZ, month: 'long', year: 'numeric' });
      banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;
          background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.3);
          border-radius:8px;margin-bottom:10px;font-size:13px;flex-wrap:wrap">
          <span style="color:var(--warn);font-weight:700">📅 Filtered: New Admissions — ${monthName}</span>
          <span style="color:var(--muted);font-size:12px">${list.length} student${list.length!==1?'s':''} admitted this month</span>
          <button onclick="_smClearAdmissionFilter()" class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:11px;padding:3px 10px">✕ Clear Filter</button>
        </div>`;
      const tableCard = document.querySelector('.card:has(#studentTableTitle)') ||
                        document.getElementById('studentTableTitle')?.closest('.card');
      if (tableCard) tableCard.insertAdjacentElement('beforebegin', banner);
    }
  } else if (banner) {
    banner.remove();
  }
}

/* ============================================================
   STUDENT PROFILE
   ============================================================ */
// ══════════════════════════════════════════════════════════════════════════════
// navParams.fromArchive — OPENED FROM THE TERMINATED SCREEN.
//
// A terminated student may be paid from Terminated and nowhere else. That is one
// rule with two surfaces: the list's Pay Dues button, and this profile when it
// was reached from that list. Opening the same student from Paid Fee, the
// Students list or search is still refused, which is what the finding was about.
//
// Carried as an EXPLICIT nav param rather than inferred from navStack. The
// entitlement then travels with the navigation that earned it and dies with it —
// a back-button or a sidebar jump re-renders without the flag. Reading history
// to decide an access question is the kind of implicit state that breaks quietly
// months later.
//
// Defaults to {} so the two direct callers that pass no params — approvals.js
// re-rendering in place after a delete, and the onSnapshot re-renders below —
// get the safe answer.
// ══════════════════════════════════════════════════════════════════════════════
async function renderStudentProfile(id, preloaded, navParams) {
  const _fromArchive = !!(navParams && navParams.fromArchive);
  // LIVE-PROFILE: detach any existing profile listeners before starting fresh
  _detachProfileListeners();
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);

  // LIVE-PROFILE: inner render function — called on first load and on every snapshot update
  async function _doRenderProfile(studentData, txDocs, concessionData) {
    try {
      // ══════════════════════════════════════════════════════════════════════
      // THE RECORD ITSELF IS THE CONFIDENTIAL PART, NOT JUST THE BUTTONS.
      //
      // This function gated individual ACTIONS on currentRole and showed a
      // "View Only" chip to admins — but nothing stopped an Admin opening a
      // hidden student's profile and reading guardian, contact, the month grid,
      // the concession rate and the outstanding. Blocking the payment form and
      // leaving the record open would have shut the door and left the window.
      // ══════════════════════════════════════════════════════════════════════
      if (_flIsDeparted(studentData) && !_flMaySeeDeparted()) {
        const _st = String((studentData && studentData.status) || '').toLowerCase();
        setContent(`<div class="alert alert-danger" style="margin:24px">
          🔒 This student record is restricted to the Principal.
          <div style="margin-top:6px;font-size:12px;color:var(--muted)">
            ${_st === 'hidden'
              ? 'They are in the confidential section.'
              : 'They are in the terminated records.'}
          </div></div>`);
        return;
      }
      let s = _fixStudentFeeRates(studentData);  // BUG-FEE-AUTOFIX: recalculate prev-year balances using correct class rates
      const transactions = txDocs
        .sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0));

    // CARD FIX: Total Paid = sum of payments from the CURRENT academic year only
    const curAcadYear = _getCurrentAcademicYearStr();
    // JSS-REF-002 FIX (Existing-onboarded student payment not reflecting on profile):
    // this used to compare t.academicYear to curAcadYear with raw string equality,
    // which silently drops a real, just-recorded transaction the moment its year
    // string isn't byte-identical to curAcadYear (e.g. any stray whitespace, or a
    // legacy "YYYY-YYYY" long form) — every other year check in this file goes
    // through _normaliseAcademicYear() first; this one didn't, so it was the one
    // place a genuine payment could vanish from "Total Paid" / the transactions list.
    // AUDIT: through the shared _flTxBelongsToYear. This was the lenient reader —
    // `!ty ||` counted an UNTAGGED transaction as current-year, so its money showed
    // in Total Paid here while the engine, Due Fee and the Rolling Dues card all
    // ignored it and went on billing the month it had paid for. Strict now, matching
    // them; feeYear is still honoured inside the helper.
    const curYearTx   = transactions.filter(t => _flTxBelongsToYear(t, curAcadYear));
    const totalPaid = curYearTx.reduce((sum,t) => sum + (t.amountPaid||0), 0);

    setContent(`
      <div class="profile-hero">
        <div class="profile-avatar">${(s.name||'S').charAt(0).toUpperCase()}</div>
        <div style="flex:1">
          <div class="profile-name">${s.name||'—'}</div>
          <div class="profile-meta">${s.class||''} · Section ${s.section||''} · Adm# ${s.admissionNumber||'—'}</div>  <!-- [CHG-020] Roll# removed -->
          <div class="profile-badges">
            <!-- ITEM 6: a hidden student was mislabelled "Terminated" here -->
            ${studentStatusBadge(s.status)}
            
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="showEditStudentModal('${s.id}')">Edit Profile</button>
          ${currentRole==='principal'&&s.status==='active'?`<button class="btn btn-danger btn-sm" onclick="terminateStudent('${s.id}','${jsAttr(s.name)}')">Terminate Student</button>`:''}
          ${currentRole==='principal'&&s.status==='active'?`<button class="btn btn-ghost btn-sm" style="border-color:rgba(212,150,42,0.4);color:var(--warn)" onclick="moveStudentToHidden('${s.id}','${jsAttr(s.name)}')">🔒 Move to Hidden</button>`:''}
          ${currentRole==='principal'?`<button class="btn btn-sm" style="background:rgba(224,82,82,0.08);color:var(--danger);border:1px solid rgba(224,82,82,0.3);font-size:12px" onclick="deleteStudentPermanent('${s.id}','${jsAttr(s.admissionNumber)}','${jsAttr(s.name)}')">🗑 Delete Student</button>`:''}
          <!-- BUG-M11 FIX: classSection built from both class + section to prevent "Section undefined" -->
          <!-- CHG-006: feeSno removed from params platform-wide -->
          ${(typeof _flPaymentGuard === 'function' && !_flPaymentGuard(s, { fromArchive:_fromArchive }).allowed)
            ? `<button class="btn btn-sm" disabled title="${_flPaymentGuard(s).reason}"
                 style="background:rgba(224,82,82,0.06);color:var(--muted);border:1px solid rgba(224,82,82,0.22);cursor:not-allowed;opacity:0.75">⛔ Terminated — No Payment</button>`
            : `<button class="btn btn-primary btn-sm" onclick="pushNav('recordFee',{studentId:'${s.id}',studentName:'${jsAttr(s.name)}',classSection:'${(s.class||'')+'  –  Section '+(s.section||'')}'${_fromArchive ? ',fromArchive:true' : ''} })">Record Payment</button>`}
          <!-- PHASE 7 #09: Virtual Fee Profile Card button -->
          <button class="btn btn-secondary btn-sm" style="border-color:var(--gold);color:var(--gold-lt)" onclick="pushNav('feeCard',{studentId:'${s.id}'})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            Fee Card
          </button>
          <!-- JSS-REF-VELTRIX-2026-005 ITEM 3: all academic years with data, in one PDF.
               Per-year PDFs live on each year card's header below. -->
          <button class="btn btn-secondary btn-sm" style="border-color:rgba(201,168,76,0.40);color:var(--gold-lt)"
            title="Download every academic year's dues in a single PDF"
            onclick="downloadDuesReport('__ALL__')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Dues Report — Full History
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr"><span class="card-title">Personal Information</span></div>
        <div class="card-body">
          <!-- COLONEL'S CHANGE #2: Removed DOB, PEN, Address, Previous School, Admission Date. CHG-006: Fee S.No also removed. -->
          <!-- CHG-014: admissionDate re-added -->
          <div class="info-grid">
            <div class="info-item"><div class="info-lbl">Full Name</div><div class="info-val">${s.name||'—'}</div></div>
            <div class="info-item"><div class="info-lbl">Block</div><div class="info-val" style="font-weight:700;color:${s.block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'}">${s.block||'—'}</div></div>
            <div class="info-item"><div class="info-lbl">Gender</div><div class="info-val">${s.gender||'—'}</div></div>
            <div class="info-item"><div class="info-lbl">Class</div><div class="info-val">${s.class||'—'}</div></div>
            <div class="info-item"><div class="info-lbl">Section</div><div class="info-val">${s.section||'—'}</div></div>
            <div class="info-item"><div class="info-lbl">Admission No</div><div class="info-val">${s.admissionNumber||'—'}</div></div>
            
            <!-- [CHG-020] Roll Number info-item removed -->
            <div class="info-item">
              <div class="info-lbl">Date of Admission</div>
              <div class="info-val" style="color:var(--gold-lt);font-weight:600">
                ${s.admissionDate
                  ? fmtDateOnly(s.admissionDate)
                  : '<span style="color:var(--muted);font-style:italic;font-weight:400">Not recorded</span>'}
              </div>
            </div>
            <div class="info-item"><div class="info-lbl">Parent / Guardian</div><div class="info-val">${s.parentName||'—'}</div></div>
            <div class="info-item"><div class="info-lbl">Contact</div><div class="info-val">${s.contact||'—'}</div></div>
          </div>
        </div>
      </div>

      <!-- JSS-REF-013: Mid-year Individual Promotion carry-forward notice -->
      ${s.midYearPromotion && _normaliseAcademicYear(s.midYearPromotion.academicYear) === _normaliseAcademicYear(_getCurrentAcademicYearStr()) ? `
        <div class="card" style="margin-bottom:18px;border-color:rgba(201,168,76,0.35)">
          <div class="card-body" style="font-size:13px">
            <div style="font-weight:700;color:var(--gold-lt);margin-bottom:6px">🎓 Mid-Year Promotion — ${sanitizeHTML(s.midYearPromotion.fromClass)} → ${sanitizeHTML(s.midYearPromotion.toClass)}</div>
            <div style="color:var(--muted)">Promoted ${sanitizeHTML(s.midYearPromotion.promotionDate||'—')}. ${sanitizeHTML(s.midYearPromotion.toClass)} fee cycle begins <strong>${sanitizeHTML(s.midYearPromotion.effectiveMonth||'—')}</strong>.
            ${Array.isArray(s.midYearPromotion.priorGradeDueMonths) && s.midYearPromotion.priorGradeDueMonths.length
              ? `<strong style="color:var(--danger)">${s.midYearPromotion.priorGradeDueMonths.length} month(s)</strong> (${s.midYearPromotion.priorGradeDueMonths.map(m=>m.slice(0,3)).join(', ')}) remain due against ${sanitizeHTML(s.midYearPromotion.fromClass)} at ₹${fmtNum(s.midYearPromotion.priorGradeRate||0)}/month.`
              : 'No dues were carried forward from the prior grade.'}</div>
          </div>
        </div>` : ''}

      <!-- VLX-REF-004 + VLX-REF-007 FIX: Per-Academic-Year Fee Cards — each year's data shown separately,
           excused waivers tracked independently, previousAcademicYear (Excel import) included
           [EXPAND FIX v2]: Cards clickable — full dues breakdown on click. Both 2024-25 AND 2025-26 always shown. -->
      ${(()=>{
        // ── CONSTANTS ──
        const ACAD_MONTHS      = ACAD_MONTHS_SHORT;
        // ACAD_MONTHS_FULL — canonical, from core.js (AUDIT F9)

        // ══════════════════════════════════════════════════════════════════════
        // JSS-REF-VELTRIX-2026-005 L7 — the profile priced from a STALE stored field.
        //
        // This read `s.monthlyFee` FIRST and only fell back to the fee schedule. That
        // is the wrong way round: monthlyFee is a value copied onto the student
        // document at import or onboarding and never refreshed, while the fee schedule
        // is the live rate the ENGINE bills from (_flStudentYearOutstanding does
        // `_FEE_SCHEDULE[cls] || s.monthlyFee`). So the profile could quote one rate
        // while every calculation used another.
        //
        // Reported live for ADM-TEST-002: the profile showed "Monthly Fee 1,500" and
        // "Annual Fee 18,000" from a stale monthlyFee of 1,500, while her class rate is
        // 1,700 and every receipt she holds was taken at 1,700. The header figure and
        // the money collected disagreed on the same screen.
        //
        // Inverted to match the engine exactly: the class's scheduled rate wins, and
        // the stored monthlyFee survives only as a fallback for a class that has no
        // entry in the schedule at all.
        // ══════════════════════════════════════════════════════════════════════
        // L8: through the shared resolver, so a class name carrying stray whitespace
        // ("LKG ") still prices correctly instead of falling through to a stale field.
        const _schedRateL7 = (typeof _flRateForClass === 'function')
          ? _flRateForClass(s.class, 0)
          : ((typeof _FEE_SCHEDULE !== 'undefined') ? (_FEE_SCHEDULE[s.class] || 0) : 0);
        const monthlyFee   = _schedRateL7 || s.monthlyFee || 0;
        if (_schedRateL7 && s.monthlyFee && Number(s.monthlyFee) !== Number(_schedRateL7)) {
          // Identifies a student by admission number, and fires on EVERY profile render
          // where the stored fee is stale — so during a demo it prints a running list of
          // real pupils and their fees into a console the audience may be looking at.
          // The warning is worth keeping for engineering, so it is gated rather than cut:
          // set window.VELTRIX_DEBUG = true in the console to bring it back.
          if (window.VELTRIX_DEBUG) {
            console.warn('[PROFILE] ' + (s.admissionNumber || s.id) + ': stored monthlyFee ' +
              s.monthlyFee + ' disagrees with the ' + s.class + ' scheduled rate ' + _schedRateL7 +
              '. Using the schedule, which is what the engine bills from. The stored field is stale.');
          }
        }

        // LIVE-DUE-WIRE: outstanding = DUE months × concession-aware rate
        // CONCESSION-WIRE: extract concession rate + active months
        const _concFee          = concessionData?.concessionFee ?? null;
        const _concActiveMonths = Array.isArray(concessionData?.activeMonths) ? concessionData.activeMonths : [];

        // _mStatus only valid for current year if s.academicYear matches curAcadYear.
        // If student was imported in a PREVIOUS year (s.academicYear="2025-26" but
        // curAcadYear="2026-27"), s.monthStatus belongs to that old year — ignore it.
        // In that case assume all 12 months DUE for current year (no payments yet).
        // FIX (2026-07-07): too strict — if AcademicYear was blank/mismatched on the
        // Excel row but the student has NO other previous-year record at all, s.monthStatus
        // can only belong to the current year, so use it instead of discarding it (this was
        // hiding genuinely already-paid months from Excel import on the profile card).
        const _normYr = y => { if(!y) return ''; const s2=String(y).trim().replace(/[–—]/g,'-'); const m=s2.match(/^(\d{4})-(\d{2,4})$/); if(!m) return s2; return m[1]+'-'+(m[2].length===4?m[2].slice(2):m[2]); };
        const _hasOtherPrevYearRecord = !!(s.previousAcademicYear || s.openingOutstandingYear || s.prevYearMonthStatus || s.previousYearMonthStatus);
        const _mStatusIsCurrentYear = _normYr(s.academicYear) === curAcadYear || (!_hasOtherPrevYearRecord && s.monthStatus && Object.keys(s.monthStatus).length > 0);
        const _mStatus = _mStatusIsCurrentYear ? (s.monthStatus || {}) : {};

        // Helper: correct rate per month — concession or standard
        // ══════════════════════════════════════════════════════════════════
        // THE PROFILE CARD PRICES A CONCESSION MONTH THROUGH THE ENGINE NOW.
        //
        // This was a third implementation of concession resolution, and it was
        // wrong in two ways the engine's is not:
        //
        //   YEAR-BLIND   `_concActiveMonths.some(k => k.endsWith('-' + mm))`
        //                matched on month-of-year only. activeMonths are
        //                'YYYY-MM' keys, so a concession on 2026-12 also lit up
        //                December on every other year's card.
        //   BASE ONLY    it returned _concFee and never looked at
        //                monthlyBreakdown, the per-month override the BILL
        //                resolves first. A month corrected to 1,500 displayed
        //                the 1,650 base — the same defect A8 fixed on Record
        //                Payment's chip, in a second place.
        //
        // Reported as "a 2-month concession shows only 1 month in the Profile
        // Card" while Record Payment showed both.
        //
        // _flConcessionRateForMonth is the function the engine bills through,
        // so the card and the invoice can no longer disagree. The YEAR is now a
        // parameter because this card renders one block per academic year, and
        // a concession belongs to the year it was granted for.
        // ══════════════════════════════════════════════════════════════════
        const _profileRateForMonth = (shortMonth, forYear) => {
          if (typeof _concFee !== 'number') return monthlyFee;
          if (typeof _flConcessionRateForMonth !== 'function') return monthlyFee;
          return _flConcessionRateForMonth(concessionData, forYear || curAcadYear,
                                           shortMonth, monthlyFee);
        };

        const _curYrTxWithBal = curYearTx
          .filter(t => t.type !== 'excused_waiver' && typeof t.remainingBalance === 'number')
          .sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0));

        // JSS-REF-002 FIX (Existing-onboarded student payment not reflecting on profile):
        // Two bugs here previously:
        //  1) This only ever looked at s.monthStatus (the student doc's cached grid,
        //     written asynchronously by _syncStudentFinancials after a payment). If that
        //     write hadn't landed yet — or the student was onboarded blank so monthStatus
        //     started as {} — the Profile Card and Record Payment screen could disagree
        //     about which months were paid, even though the same feeTransactions exist.
        //     Fold curYearTx.monthsSelected in directly (same Source-1 logic Record
        //     Payment already uses) so the Profile Card can never lag behind a real,
        //     already-saved payment.
        //  2) Once monthStatus had ANY key at all, every month with NO explicit entry
        //     (common for a freshly onboarded "existing" student — unpaid months were
        //     never written as 'DUE', they just don't exist as keys) silently dropped
        //     out of "due" instead of correctly defaulting to due — undercounting
        //     outstanding the moment a student's first payment was recorded.
        const _paidOrExcusedThisYear = new Set();
        Object.entries(_mStatus).forEach(([m, st]) => {
          const up = (st||'').toUpperCase();
          if (up === 'N/A-PAID' || up === 'PAID' || up === 'EXCUSED') _paidOrExcusedThisYear.add(m);
        });
        curYearTx.forEach(t => {
          const list = t.type === 'excused_waiver' ? (t.monthsExcused || t.monthsSelected || []) : (t.monthsSelected || []);
          list.forEach(full => {
            const idx = ACAD_MONTHS_FULL.indexOf(full);
            const short = idx !== -1 ? ACAD_MONTHS[idx] : full;
            _paidOrExcusedThisYear.add(short);
            _paidOrExcusedThisYear.add(full);
          });
        });
        // ITEM 13 FIX (Onboard-Existing-Student "paid at entry" months not reflecting
        // on Profile Card): the "Onboard Existing Student" form's Current Year Dues
        // grid lets the admin mark months as already paid BEFORE any feeTransaction
        // exists (e.g. collected outside the system before onboarding). Those months
        // are written to the student doc as currentYearPaidMonths (see saveStudent
        // ~line 6748) and Record Payment's selectFeeStudent() already reads them
        // (Source 3, ~line 7320) to lock the pills — but the Profile Card never
        // checked this field, so a student onboarded with June/July pre-marked paid
        // showed 0 paid months, all 12 months DUE, and the full annual amount
        // outstanding. Fold the same field in here so both screens agree.
        if (Array.isArray(s.currentYearPaidMonths) &&
            _normaliseAcademicYear(s.currentYearDueYear) === curAcadYear) {
          s.currentYearPaidMonths.forEach(full => {
            const idx = ACAD_MONTHS_FULL.indexOf(full);
            const short = idx !== -1 ? ACAD_MONTHS[idx] : full;
            _paidOrExcusedThisYear.add(short);
            _paidOrExcusedThisYear.add(full);
          });
        }
        const _dueMonths = ACAD_MONTHS.filter(m => {
          const full = ACAD_MONTHS_FULL[ACAD_MONTHS.indexOf(m)];
          return !_paidOrExcusedThisYear.has(m) && !_paidOrExcusedThisYear.has(full);
        });
        const _pillBasedDue = _dueMonths.reduce((sum, m) => sum + _profileRateForMonth(m), 0);

        // ══════════════════════════════════════════════════════════════════════
        // THE CURRENT YEAR'S OUTSTANDING COMES FROM THE ENGINE, NOT FROM A
        // TRANSACTION'S FROZEN remainingBalance.
        //
        // This read:
        //     _curYrTxWithBal.length > 0 ? _curYrTxWithBal[0].remainingBalance : _pillBasedDue
        // took the NEWEST transaction's stored remainingBalance whenever the year had
        // any transaction at all, and only fell back to the live figure when it had
        // none. remainingBalance is a number written at the moment of a payment,
        // describing the balance after THAT payment against the months THAT payment
        // covered. It is never revisited. Every month that falls due afterwards is
        // invisible to it.
        //
        // TEST STUDENT TWO, LKG, 2026-27: annual 20,400, paid 9,200, six months (Aug-Jan)
        // still DUE and a 1,000 shortfall across Apr/May -> 11,200 genuinely
        // outstanding. Her newest 2026-27 receipt stored remainingBalance 0, because
        // it cleared the months it was paying for. The card therefore read
        // "OUTSTANDING ₹0 — Fully cleared" directly above its own grid showing six DUE
        // months, and the Terminated list showed 10,200 for the same student. Three
        // screens, three answers, no operation performed by anyone.
        //
        // _pillBasedDue was already the better number and was being discarded, but it
        // is not the right one either: it counts DUE months and cannot see a PARTIAL
        // month's shortfall, so it returns 10,200 here -- which is exactly the figure
        // the Terminated list shows, from the same blind spot.
        //
        // _flStudentYearOutstanding IS the definition, per-year, partial-aware,
        // concession-aware, excused-aware, and it is what Due Fee, the Dashboard and
        // the reconcile already bill from. Asking it here is the SYNC rule: one engine,
        // every section. The old chain stays only as a fallback for the case where the
        // engine cannot be reached at all.
        // ══════════════════════════════════════════════════════════════════════
        const _engineCurYr = (typeof _flStudentYearOutstanding === 'function')
          // Normalised, because the engine matches years by exact string and
          // curAcadYear is the raw value — 2026-2027 and 2026-27 are the same year (F4).
          ? (() => { try { return _flStudentYearOutstanding(s, curYearTx, _normaliseAcademicYear(curAcadYear)); }
                     catch (e) { console.warn('[PROFILE] engine failed for ' +
                       (s.admissionNumber || s.id) + ': ' + (e && e.message)); return null; } })()
          : null;
        const outstandingBal = (_engineCurYr && Number.isFinite(Number(_engineCurYr.outstanding)))
          ? Number(_engineCurYr.outstanding)
          : (_curYrTxWithBal.length > 0 ? (_curYrTxWithBal[0].remainingBalance || 0) : _pillBasedDue);

        // ── HELPER: build a month-grid HTML from a monthStatus object {Jun:'N/A-PAID'|'DUE'} ──
        const buildMonthGrid = (statusObj) => {
          return ACAD_MONTHS.map(short => {
            const raw   = (statusObj[short] || '').toUpperCase();
            const isPaid = raw === 'N/A-PAID' || raw === 'PAID';
            // A prior year's grid can now carry EXCUSED (see the waiver merge below).
            // It renders in its own green, matching the current-year grid's 'excused'
            // pill, so a waived month never reads as either paid or owed.
            const isExc  = raw === 'EXCUSED';
            // MONTHGRID-FIX (2026-07-07): a month with no explicit entry in the stored
            // grid is NOT "unknown" — it simply hasn't been paid, so it must read as DUE,
            // same as the current-year grid's default (see curMonthCells above, which
            // defaults status='due' before checking paid/excused). Previously this fell
            // through to a blank "—" placeholder, hiding genuinely-unpaid months.
            const cls    = isExc ? 'fms-excused' : isPaid ? 'fms-paid' : 'fms-due';
            const label  = isExc ? 'EXCUSED'     : isPaid ? 'PAID'     : 'DUE';
            const bg     = isExc ? 'rgba(82,200,122,0.08)'
                         : isPaid ? 'rgba(201,168,76,0.10)'
                         : 'rgba(224,82,82,0.07)';
            return `<div style="text-align:center;padding:8px 4px;border-radius:8px;border:1px solid var(--glass-border);background:${bg}">
              <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:4px">${short}</div>
              <span class="fee-month-status ${cls}" style="font-size:9px;padding:2px 5px">${label}</span>
            </div>`;
          }).join('');
        };

        // ── HELPER: stat mini-tile ──
        const tile = (label, value, sub, bg, borderColor, valColor) =>
          `<div style="background:${bg};border:1px solid ${borderColor};border-radius:10px;padding:12px 16px;min-width:130px">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${label}</div>
            <div style="font-size:18px;font-weight:700;color:${valColor}">${value}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">${sub}</div>
          </div>`;

        // ── STEP 1: GROUP TRANSACTIONS BY YEAR ──
        // JSS-REF-002 FIX (Existing-onboarded student payment not reflecting on
        // profile): group by the NORMALISED year, not the raw stored string. A
        // transaction is written with academicYear = _getCurrentAcademicYearStr(),
        // which should match curAcadYear exactly — but this raw-key grouping had
        // zero tolerance for the smallest divergence (whitespace, a legacy
        // "YYYY-YYYY" long form, etc.): the transaction would silently form its
        // own separate bucket instead of joining the current year's card, so the
        // payment existed in Firestore but never appeared against "this year".
        const yearMap = {};
        transactions.forEach(t => {
          const rawYr = t.academicYear || t.feeYear || curAcadYear;
          const yr = _normaliseAcademicYear(rawYr) || rawYr;
          if (!yearMap[yr]) yearMap[yr] = { paid:0, excused:0, txCount:0, balance:0, _lastTs:0, txList:[] };
          if (t.type === 'excused_waiver') { yearMap[yr].excused += (t.amountWaived||0); }
          else { yearMap[yr].paid += (t.amountPaid||0); }
          yearMap[yr].txCount++;
          yearMap[yr].txList.push(t);
          if ((t.date?.seconds||0) > yearMap[yr]._lastTs) {
            yearMap[yr].balance  = t.remainingBalance||0;
            yearMap[yr]._lastTs  = t.date?.seconds||0;
          }
        });

        // ── STEP 2: ENSURE CURRENT YEAR ALWAYS PRESENT ──
        if (!yearMap[curAcadYear]) {
          yearMap[curAcadYear] = { paid:0, excused:0, txCount:0, balance: s.outstandingBalance||0, _lastTs:0, txList:[] };
        }

        // ── STEP 3: INJECT PREVIOUS YEARS FROM STUDENT DOC ──
        // Student doc stores TWO separate previous-year keys:
        //   s.academicYear           → e.g. "2025-26"  (current/newer import year)
        //   s.previousAcademicYear   → e.g. "2024-25"  (older year from _deduplicateRowsInSheet)
        //   s.openingOutstandingYear → same or different previous year (from manual onboarding)
        //
        // monthStatus              = current import year's month grid
        // previousYearMonthStatus  = older import year's month grid  (set by _deduplicateRowsInSheet line 5144)
        // prevYearMonthStatus      = same (set by manual onboarding, line 6110) — fallback
        //
        // previousDues             = older year's outstanding balance
        // outstandingBalance       = combined (newer + older) or just current

        // Normalise helper — "2025-26" or "2025-2026" → "2025-26"
        const normYr = y => {
          if (!y) return '';
          const s2 = String(y).trim().replace(/[–—]/g,'-');
          const m  = s2.match(/^(\d{4})-(\d{2,4})$/);
          if (!m) return s2;
          return m[1]+'-'+(m[2].length===4?m[2].slice(2):m[2]);
        };

        // Collect all previous-year entries with their correct month grids + balances
        const prevEntries = [];

        // Source D: openingOutstandingDues[] (multi-year array — AUTHORITATIVE when present)
        // JSS-REF-VELTRIX-2026-003 ITEM 08.1 FIX: students onboarded via the current
        // "multi-year previous dues" form (saveStudent → allPrevDues, see ~line 5294)
        // have their full per-year breakdown stored ONLY in s.openingOutstandingDues[].
        // The legacy single-year fields used by Sources A/B/C below (openingOutstandingYear,
        // openingOutstandingClass, openingOutstandingMonths) are back-compat fields
        // populated from just the OLDEST row of that array — and s.openingOutstandingBalance
        // itself is never even written by that path, so Source C's balance check always
        // found 0 and skipped, and Source A (keyed off s.academicYear) either got
        // overridden to the current year or collapsed multiple years into one combined
        // figure. Net effect: previous-year dues entered this way never showed on the
        // Profile Card. Read the array directly, one card per year — same pattern
        // already used correctly by the Due Fee page (see _pushPrevDue, ~line 12925) —
        // and remember which years it covers so the fallback sources below don't
        // duplicate or clobber them.
        const _multiDuesYears = new Set();
        if (Array.isArray(s.openingOutstandingDues)) {
          s.openingOutstandingDues.forEach(d => {
            const dYr = normYr(d.year);
            if (!dYr || dYr === curAcadYear || !(d.amount > 0)) return;
            _multiDuesYears.add(dYr);
            const _dCls  = d.class || s.class || '';
            const _dRate = (_dCls && getFeeSchedule()[_dCls]) ? getFeeSchedule()[_dCls] : (s.monthlyFee || monthlyFee);
            const _dGrid = d.monthStatus || {};
            prevEntries.push({
              yr:          dYr,
              balance:     d.amount,
              monthStatus: _dGrid,
              monthlyFeeForYear: _dRate,
              // ITEM 06: a PARTIAL month is still owed — count it, else it vanishes from the tile
              // and from _liveOutstanding (monthsDue × rate).
              monthsDue:   Object.values(_dGrid).filter(v => ['DUE','PARTIAL'].includes((v||'').toUpperCase())).length,
              monthsCleared: Object.values(_dGrid).filter(v => _flStatusIsSettled(v)).length,
            });
          });
        }

        // Source A: student.academicYear (the year stored in the student doc itself)
        // If this differs from curAcadYear, it means the student was imported in an older year.
        // GHOST-CARD-FIX: If the student already has transactions in curAcadYear, their
        // s.academicYear is stale (never updated after manual add). Skip Source A in that case
        // so we don't generate a phantom previous-year card with stale outstandingBalance.
        // BUG-DEL-002 FIX: Also skip Source A when outstandingBalance==0 AND no transactions
        // exist at all — this covers the "all transactions deleted" state where Firestore now
        // writes 0, so there is genuinely nothing to show in a previous-year card.
        // BUG-GHOST-CARD-OVERSUPPRESS FIX: the old guard used `_hasCurYrTx` — "does ANY
        // transaction exist tagged to curAcadYear" — to decide whether s.academicYear was
        // stale. That's wrong: a family can genuinely have BOTH a paid-up current year
        // AND a real unpaid balance sitting in studentDocYear (e.g. Test Student Thirteen: paid
        // 2026-27 dues on time, but still owes 2025-26 dues from before). Blanket-skipping
        // Source A whenever the current year has any transaction silently dropped that
        // real 2025-26 balance from the profile card, even though the "Record Previous
        // Year Dues" page (which has no such guard — see ~line 15432) showed it correctly.
        // Fix: drop the `_hasCurYrTx` check entirely and instead rely on the existing
        // dueFromGrid / newerYearBalance derivation below — only surface Source A when
        // that derivation resolves to a genuinely positive amount (see finalNewerBalance
        // check right before the push), which correctly excludes truly-resolved years.
        const _hasAnyBalance = (s.outstandingBalance || 0) > 0 || (s.previousDues || 0) > 0;
        const studentDocYear = normYr(s.academicYear);
        if (studentDocYear && studentDocYear !== curAcadYear && !yearMap[studentDocYear] && _hasAnyBalance
            && !_multiDuesYears.has(studentDocYear)) {
          // BUG-FIX (VLX012→VLX013): For students merged from TWO Excel rows by
          // _deduplicateRowsInSheet(), s.outstandingBalance = COMBINED (older + newer year).
          // Using it here shows the total combined amount under the newer year card — WRONG.
          // The correct balance for studentDocYear (the newer imported year) is:
          //   s.outstandingBalance − s.previousDues   (net of the older year's share)
          // For true single-year imports (no s.previousDues), outstandingBalance is correct as-is.
          const newerYearBalance = (s.previousDues > 0)
            ? Math.max(0, (s.outstandingBalance || 0) - (s.previousDues || 0))
            : (s.outstandingBalance || 0);
          // Use DUE-month count from monthStatus as a cross-check / primary source
          // BUG-FEE-SOURCEA-FIX: studentDocYear may be a past year — derive the correct
          // class rate from the year gap, not from s.monthlyFee (current class rate).
          const _srcAGap = (() => {
            const _sy = y => { const m = String(y||'').match(/(\d{4})/); return m ? parseInt(m[1],10) : null; };
            const a = _sy(studentDocYear), b = _sy(curAcadYear);
            return (a !== null && b !== null) ? Math.max(0, b - a) : 0;
          })();
          const _srcAClass = (() => {
            if (_srcAGap <= 0) return s.class;
            const cl = getClassList();
            const sched2 = getFeeSchedule();
            const sortedK = Object.keys(sched2).sort((a,b) => b.length - a.length);
            let base = s.class;
            for (const k of sortedK) { if (s.class.startsWith(k)) { base = k; break; } }
            const idx = cl.indexOf(base);
            return idx >= _srcAGap ? cl[idx - _srcAGap] : cl[0];
          })();
          const _srcARate  = getFeeSchedule()[_srcAClass] || s.monthlyFee || monthlyFee;
          const _monthlyFeeDoc = _srcARate;
          // JSS-REF-VELTRIX-2026-004 ITEM 06: partial-aware — DUE at full rate PLUS each PARTIAL
          // month's remainder (from that year's tx allocations). Was count(DUE)×rate, which
          // dropped a partial month's balance from this card entirely.
          const _srcATx = transactions.filter(t => normYr(t.academicYear || t.feeYear || '') === studentDocYear);
          const _dueFromGrid = _flOpeningDuesOutstanding(
            { monthStatus: s.monthStatus,
              monthShortage: _flPartialShortFromTxs(s.monthStatus, _srcATx, _monthlyFeeDoc) },
            _monthlyFeeDoc);
          const finalNewerBalance = _dueFromGrid > 0 ? _dueFromGrid : newerYearBalance;
          // GHOST-CARD-FIX (retained): only surface this year's card if it genuinely
          // still owes something. This is what protects against the original stale-data
          // scenario the removed _hasCurYrTx guard was trying (too bluntly) to prevent.
          if (finalNewerBalance > 0) {
            prevEntries.push({
              yr:          studentDocYear,
              balance:     finalNewerBalance,
              monthStatus: s.monthStatus || {},           // ← stored year's own month grid
              monthlyFeeForYear: _monthlyFeeDoc,
              monthsDue:   s.monthsDue || 0,
              monthsCleared: s.monthsCleared || s.monthsPaidBeforePromotion || 0,
            });
          }
        }

        // Source B: previousAcademicYear (set by _deduplicateRowsInSheet — the OLDER of the two import rows)
        // GHOST-CARD-FIX-B: skip if previousDues=0 AND no transactions for that year — nothing to show
        const prevAcadYear = normYr(s.previousAcademicYear);
        const _prevHasTx = transactions.some(t => normYr(t.academicYear||t.feeYear||'') === prevAcadYear);
        if (prevAcadYear && prevAcadYear !== curAcadYear && prevAcadYear !== studentDocYear && ((s.previousDues||0) > 0 || _prevHasTx)
            && !_multiDuesYears.has(prevAcadYear)) {
          // BUG-FEE-PREVYR-B FIX: Use the class the student was in during that year (openingOutstandingClass
          // or classPrev) to look up the correct fee rate — not the student's current class fee.
          const _prevBCls = s.openingOutstandingClass || s.classPrev || '';
          const _prevBRate = (_prevBCls && getFeeSchedule()[_prevBCls]) ? getFeeSchedule()[_prevBCls] : (s.monthlyFee || monthlyFee);
          prevEntries.push({
            yr:          prevAcadYear,
            balance:     s.previousDues || 0,
            monthStatus: s.previousYearMonthStatus || s.prevYearMonthStatus || {},
            monthlyFeeForYear: _prevBRate,
            // ITEM 06: PARTIAL months are still owed — count them alongside DUE (see Source D).
            monthsDue:   Object.values(s.previousYearMonthStatus||s.prevYearMonthStatus||{}).filter(v=>['DUE','PARTIAL'].includes((v||'').toUpperCase())).length,
            monthsCleared: Object.values(s.previousYearMonthStatus||s.prevYearMonthStatus||{}).filter(v=>_flStatusIsSettled(v)).length,
          });
        }

        // Source C: openingOutstandingYear (manual onboarding path) — only if not already added
        // GHOST-CARD-FIX-C: skip if balance=0 AND no transactions for that year
        const openingYear = normYr(s.openingOutstandingYear);
        const _openingBal = s.openingOutstandingBalance || s.previousDues || 0;
        const _openingHasTx = transactions.some(t => normYr(t.academicYear||t.feeYear||'') === openingYear);
        if (openingYear && openingYear !== curAcadYear && openingYear !== studentDocYear && openingYear !== prevAcadYear && (_openingBal > 0 || _openingHasTx)
            && !_multiDuesYears.has(openingYear)) {
          // BUG-FEE-PREVYR-C FIX: Use openingOutstandingClass to look up the correct fee rate
          // for that year — not the student's current class fee.
          const _prevCCls = s.openingOutstandingClass || '';
          const _prevCRate = (_prevCCls && getFeeSchedule()[_prevCCls]) ? getFeeSchedule()[_prevCCls] : (s.monthlyFee || monthlyFee);
          prevEntries.push({
            yr:          openingYear,
            balance:     s.openingOutstandingBalance || s.previousDues || 0,
            monthStatus: s.prevYearMonthStatus || {},
            monthlyFeeForYear: _prevCRate,
            monthsDue:   (s.openingOutstandingMonths||[]).length || 0,
            monthsCleared: 12 - ((s.openingOutstandingMonths||[]).length || 0),
          });
        }

        // Inject into yearMap
        prevEntries.forEach(e => {
          if (!yearMap[e.yr]) {
            yearMap[e.yr] = {
              paid: 0, excused: 0, txCount: 0,
              balance: e.balance, _lastTs: 0, txList: [],
              _isPrevYear: true,
              _monthStatus: e.monthStatus,
              _monthlyFeeForYear: e.monthlyFeeForYear,
              _monthsDue: e.monthsDue,
              _monthsCleared: e.monthsCleared,
            };
          } else {
            // Enrich existing tx-based entry with month-level data
            if (!yearMap[e.yr]._monthStatus) yearMap[e.yr]._monthStatus = e.monthStatus;
          }
        });

        // BUG-FEECARD-PAIDGRID FIX: a FULLY-PAID openingOutstandingDues entry (amount 0) is
        // deliberately skipped above for BALANCE (Source D at ~L961) — it must not push a ₹0 card
        // nor claim the year in _multiDuesYears (that would suppress Sources A/B/C for OTHER
        // students → double-count risk). But its monthStatus grid still records which months were
        // paid at onboarding. For DISPLAY ONLY, merge that grid into a year card that already
        // exists (e.g. created from a later transaction), has no grid yet, AND already reads as
        // fully settled (balance 0) — so buildMonthGrid shows those onboarding-paid months as PAID
        // instead of defaulting the absent months to DUE. The balance===0 guard means this can
        // never hide a real due; balance, _multiDuesYears and Sources A/B/C are all untouched.
        if (Array.isArray(s.openingOutstandingDues)) {
          s.openingOutstandingDues.forEach(d => {
            const dYr = normYr(d.year);
            if (!dYr || dYr === curAcadYear) return;
            if (yearMap[dYr] && !yearMap[dYr]._monthStatus && (yearMap[dYr].balance || 0) === 0 &&
                d.monthStatus && Object.keys(d.monthStatus).length) {
              yearMap[dYr]._monthStatus = d.monthStatus;
            }
          });
        }

        // BUG-FEECARD-STUDOCYEAR FIX: for the studentDocYear / previousAcademicYear /
        // openingOutstandingYear, the authoritative month grid lives in a top-level field
        // (monthStatus / previousYearMonthStatus / prevYearMonthStatus). When that year's card
        // already exists — e.g. created from a later transaction, so Source A/B/C was skipped by
        // their !yearMap guard — it has no _monthStatus, so buildMonthGrid defaults the
        // tx-untouched months to DUE (onboarding-paid months wrongly shown as due, MONTHS CLEARED
        // 1/12). Merge the authoritative grid in for DISPLAY. These grids are sync-maintained and
        // consistent with the balance, so no balance guard is needed and no real due can be hidden.
        [[normYr(s.academicYear),          s.monthStatus],
         [normYr(s.previousAcademicYear),  s.previousYearMonthStatus],
         [normYr(s.openingOutstandingYear), s.prevYearMonthStatus]].forEach(([yr, grid]) => {
          if (yr && yr !== curAcadYear && yearMap[yr] && !yearMap[yr]._monthStatus &&
              grid && Object.keys(grid).length) {
            yearMap[yr]._monthStatus = grid;
          }
        });

        // ── STEP 4: SORT YEARS — newest first ──
        const years = Object.keys(yearMap).sort((a,b) =>
          parseInt((b||'').split('-')[0]||'0') - parseInt((a||'').split('-')[0]||'0')
        );

        // ── STEP 5: BUILD CARDS ──
        // JSS-REF-VELTRIX-2026-005 ITEM 3: as each year card is built, capture the SAME computed
        // figures into a report snapshot. The downloadable PDF is generated from this, so it can
        // never disagree with what is on screen. Years come from `years` (derived from real data:
        // transactions + openingOutstandingDues + Sources A/B/C/D + the current year), so sections
        // appear automatically for any year that has data and no future year is ever pre-rendered.
        const _duesReportYears = [];
        const cards = years.map((yr, cardIdx) => {
          const info        = yearMap[yr];
          const isCurrent   = yr === curAcadYear;

          // ══════════════════════════════════════════════════════════════════════
          // A PRIOR YEAR'S CARD ASKS THE ENGINE, EXACTLY AS THE CURRENT YEAR DOES.
          //
          // The current-year card was routed through _flStudentYearOutstanding above
          // for exactly this reason. Every year BEFORE it was still resolved by the
          // hand-rolled chain below, and that chain has a hole an excused waiver drops
          // straight through.
          //
          // info.balance is the newest transaction's remainingBalance (STEP 1 — and
          // that branch has NO type filter, so an excused_waiver doc can be the one
          // that sets it). The EXC- path writes remainingBalance as the student's
          // ALL-YEARS aggregate minus the waiver, correctly, because outstandingBalance
          // is the all-years field (icons.js, ITEM 9). So the moment a waiver is
          // recorded against a prior year, that year's card adopts the student's ENTIRE
          // balance as its own — and _liveOutstanding cannot rescue it, because a
          // waiver IS a transaction and the rescue only runs when txList is empty.
          //
          // Live case: 2024-25 frozen at 11,900 through every later action, its own
          // grid showing the year fully settled, and the Grand Total — which sums these
          // cards — faithfully reporting the sum of the frozen figures. The comment on
          // the fallback below asserts remainingBalance is "already correctly isolated
          // to that specific year by the payment-recording code". True of RCP- via
          // _yearRemaining. Never true of EXC-.
          //
          // ONLY when the year HAS a month grid. With no grid the engine bills what the
          // ledger proves and nothing more — deliberately, so a year nobody recorded is
          // not invented into twelve months of dues — but this card has a source the
          // engine does not: an opening balance imported as a scalar, with no grid
          // behind it. Handing those years to the engine would zero a real debt, so
          // they keep the chain below and the "imported from Excel" note that goes
          // with it.
          // ══════════════════════════════════════════════════════════════════════
          const _enginePrevYr = (!isCurrent && typeof _flStudentYearOutstanding === 'function')
            ? (() => { try { return _flStudentYearOutstanding(s, info.txList || [], yr); }
                       catch (e) { console.warn('[PROFILE] engine failed for ' +
                         (s.admissionNumber || s.id) + ' ' + yr + ': ' + (e && e.message));
                         return null; } })()
            : null;
          const _engineOwnsYr = !!(_enginePrevYr && _enginePrevYr.gridExists
                                   && Number.isFinite(Number(_enginePrevYr.outstanding)));

          // JSS-BUG-FEECARD-001 FIX: for a non-current year with ZERO real transactions,
          // info.balance can only have come from s.previousDues / s.outstandingBalance —
          // fields that, for students with 3+ tracked years (e.g. an old Excel-imported
          // year + a mid-way "Record Previous Year Dues" year + the current year), have
          // been observed holding a COMBINED total across multiple years rather than just
          // THIS year's own due amount — causing the card to show far more than its own
          // annual fee could ever be. Fix: for such zero-transaction years, derive the
          // amount LIVE as (due months × that year's rate) instead.
          // IMPORTANT: years that DO have a real transaction must be left untouched —
          // their info.balance is t.remainingBalance, already correctly isolated to that
          // specific year by the payment-recording code (see _yearRemaining in the past-due
          // payment flow), and re-deriving it from a month grid here would be WRONG for a
          // mid-year-promotion carry-forward period whose grid only records the months
          // actually PAID, leaving the remaining due months blank rather than marked 'DUE'
          // (that under-counts to 0, as seen when this was tried without the tx-count guard).
          let _liveOutstanding = null;
          if (!isCurrent && info.txList.length === 0) {
            const _rateLO = info._monthlyFeeForYear || monthlyFee;
            if (info._monthsDue != null) {
              _liveOutstanding = info._monthsDue * _rateLO;
            } else if (info._monthStatus && Object.keys(info._monthStatus).length > 0) {
              // JSS-REF-VELTRIX-2026-004 ITEM 06: partial-aware. This branch only runs when the
              // year has NO transactions, so there is no allocation ledger to net against — the
              // helper then counts a PARTIAL month at the full rate, which is the conservative
              // choice (an orphaned partial is never silently dropped to ₹0).
              _liveOutstanding = _flOpeningDuesOutstanding({ monthStatus: info._monthStatus }, _rateLO);
            }
          }
          let outstanding = isCurrent ? outstandingBal
                             : _engineOwnsYr ? Number(_enginePrevYr.outstanding)
                             : (_liveOutstanding != null ? _liveOutstanding : info.balance); // BUG-BAL-001 / JSS-BUG-FEECARD-001 FIX
          const accent      = isCurrent ? 'var(--gold)' : 'var(--info)';
          const accentBg    = isCurrent ? 'rgba(201,168,76,0.12)' : 'rgba(74,158,202,0.10)';
          const hasExcused  = (info.excused||0) > 0;
          const colCount    = hasExcused ? 3 : 2;
          const bodyId      = 'feeYrBody_' + cardIdx;

          const excusedTile = hasExcused ? `
            <div class="stat-card" style="background:rgba(82,200,122,0.06);border:1px solid rgba(82,200,122,0.20)">
              <div class="stat-label">Excused / Waived</div>
              <div class="stat-value" style="color:var(--success)">₹${fmtNum(info.excused)}</div>
              <div class="stat-sub">Fee waiver (₹0 collected)</div>
            </div>` : '';

          // ── EXPANDED HTML ──
          let expandedHtml = '';
          // ITEM 3: month → status for this year, filled by whichever branch renders below.
          // Declared once here (not per-branch) so the report snapshot after the if/else can read it.
          let _rptMonths = {};

          if (isCurrent) {
            // ── CURRENT YEAR ──
            // AUDIT / STEP 1 (second half): the month-status resolution and the
            // partial remainder now live in _flProfileCurrentYearRow, beside the
            // prior-year one, where the contract suite can reach them. The
            // paid-at-enrolment defect lived in these lines and was untestable.
            // Moved verbatim; this block only formats the result.
            const _cyRow = _flProfileCurrentYearRow(s, info, {
              curAcadYear:           curAcadYear,
              monthStatusIsThisYear: _mStatusIsCurrentYear,
              engineInfo:            _engineCurYr,
            });
            // Only the remainder map is read below now — the sets and the stored
            // grid were inputs to the status resolution, and that has moved into
            // the function. They are still returned for the contract tests.
            const shortByMonthPC    = _cyRow.shortByMonth;

            // ══════════════════════════════════════════════════════════════════
            // MONTHS CLEARED / MONTHS DUE, COUNTED FROM THE PILLS THEMSELVES.
            //
            // The prior-year card has carried these two tiles all along; the
            // current-year card never did, so the year you are actually collecting
            // was the one year you could not see a month count for without
            // counting the pills by eye.
            //
            // Counted from _cyRow.statusByMonth — the same resolved map the grid
            // below renders from — so a tile and the pill under it cannot report
            // different things. Deriving them from the engine's dueCount instead
            // would have been a second opinion on a question already answered.
            //
            // A PARTIAL month is NOT cleared: money landed on it but it still owes
            // the remainder, and it is still billed. It counts as due and is named
            // separately, because "3 due" reads very differently from "3 due, two
            // of which are part-paid" to whoever is chasing the money.
            // ══════════════════════════════════════════════════════════════════
            const _cyStatuses  = ACAD_MONTHS.map(sh => _cyRow.statusByMonth[sh]);
            const _cyPaidN     = _cyStatuses.filter(v => v === 'paid').length;
            const _cyExcusedN  = _cyStatuses.filter(v => v === 'excused').length;
            const _cyPartialN  = _cyStatuses.filter(v => v === 'partial').length;
            const _cyClearedN  = _cyPaidN + _cyExcusedN;
            const _cyDueN      = _cyStatuses.length - _cyClearedN;   // due + partial

            const curMonthCells = ACAD_MONTHS.map((short, i) => {
              const full = ACAD_MONTHS_FULL[i];
              // Resolved once, in _flProfileCurrentYearRow, under the same priority
              // it always used: excused > paid (transaction or paid-at-enrolment) >
              // the document's stored grid > due. Read here rather than re-derived,
              // so the pills and anything else reading statusByMonth cannot drift.
              const status = _cyRow.statusByMonth[short];
              const cls   = status==='paid'?'fms-paid':status==='partial'?'fms-partial':status==='excused'?'fms-excused':'fms-due';
              const label = status==='paid'?'PAID':status==='partial'?'PARTIAL':status==='excused'?'EXCUSED':'DUE';
              _rptMonths[short] = label;   // ITEM 3
              const bg    = status==='paid'?'rgba(201,168,76,0.10)':status==='partial'?'rgba(212,150,42,0.10)':status==='excused'?'rgba(82,200,122,0.08)':'rgba(224,82,82,0.07)';
              // JSS-REF-VELTRIX-2026-004 ITEM 06: show the balance still owed on a PARTIAL month.
              const _shPC = status === 'partial' && shortByMonthPC[full] != null
                ? `<div style="font-size:8px;color:var(--warn);margin-top:3px;font-weight:700">₹${fmtNum(shortByMonthPC[full])} left</div>`
                : '';
              // ITEM-8 FIX: literal "CONCESSION" label — consistent wording with the
              // Excused Section and Record Payment pills — instead of a 🏷 price tag.
              // The exact rate is still surfaced via the cell's tooltip.
              // JSS-REF-VELTRIX-2026-005 ITEM 6: a month can be BOTH on a concession rate AND
              // carry a partial payment. This used to require status === 'due', so on a PARTIAL
              // month the CONCESSION label was suppressed entirely. Both now show in the same
              // box (PARTIAL + ₹X left + CONCESSION). Settled months (paid/excused) still don't
              // need the label — the concession only matters for what is still billable.
              const _isConcMonth = (status === 'due' || status === 'partial')
                                   && _profileRateForMonth(short, yr) !== monthlyFee;
              // ITEM 15: show the concession AMOUNT in the month's own box, not just the
              // word — the rate was previously only reachable via the cell tooltip.
              const _concLabel   = _isConcMonth
                ? `<div style="font-size:8px;color:var(--gold-lt);margin-top:2px;font-weight:700;letter-spacing:0.3px">CONCESSION</div>`
                + `<div style="font-size:9px;color:var(--gold);font-weight:700;line-height:1.2">₹${fmtNum(_profileRateForMonth(short, yr))}</div>`
                : '';
              // Keep the PARTIAL month's own amber tint when it is also a concession month, so the
              // status colour still reads correctly; the concession tint applies to plain DUE months.
              const _concTint  = _isConcMonth && status === 'due';
              const _concTitle = _isConcMonth
                ? ` title="${short} — ${status === 'partial' ? 'PARTIAL, billed at the ' : ''}concession rate ₹${fmtNum(_profileRateForMonth(short, yr))}/month"`
                : '';
              return `<div${_concTitle} style="text-align:center;padding:8px 4px;border-radius:8px;border:1px solid ${_isConcMonth?'rgba(201,168,76,0.35)':'var(--glass-border)'};background:${_concTint?'rgba(201,168,76,0.07)':bg}">
                <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:4px">${short}</div>
                <span class="fee-month-status ${cls}" style="font-size:9px;padding:2px 5px">${label}</span>
                ${_shPC}${_concLabel}
              </div>`;
            }).join('');

            const txTableRows = info.txList.map(t => {
              const months = t.monthsSelected?.join(', ')||'—';
              return `<tr style="border-bottom:1px solid var(--glass-border-lt)">
                <td style="padding:6px 8px;color:var(--muted);font-size:12px">${t.receiptNumber||'—'}</td>
                <td style="padding:6px 8px;font-weight:700;color:var(--gold-lt);font-size:12px">₹${fmtNum(t.amountPaid||0)}</td>
                <td style="padding:6px 8px;color:var(--text);font-size:11px">${months}</td>
                <td style="padding:6px 8px;color:var(--muted);font-size:12px">${fmtDate(t.date)}</td>
                <td style="padding:6px 8px;color:var(--muted);font-size:12px">${t.paymentMode||'—'}</td>
              </tr>`;
            }).join('');

            expandedHtml = `
              <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--glass-border)">
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
                  ${tile('Monthly Fee','₹'+fmtNum(monthlyFee),'per month','rgba(201,168,76,0.10)','rgba(201,168,76,0.25)','var(--gold-lt)')}
                  ${(() => {
                    // ══════════════════════════════════════════════════════════
                    // ANNUAL FEE MUST BE WHAT THIS STUDENT IS BILLED, NOT THE
                    // STANDARD RATE TIMES TWELVE.
                    //
                    // It was monthlyFee × 12, which ignores concessions. Live
                    // case: ADM-2026-152 holds a ₹500 concession on Dec/Jan/Feb,
                    // so the year costs 9 × 1,800 + 3 × 1,300 = 20,100. The card
                    // said 21,600 while Outstanding — which IS concession-aware —
                    // was derived from 20,100. Two figures side by side that
                    // could not be reconciled by anyone reading them.
                    //
                    // The engine already prices each month through the concession
                    // resolver and hands that back as rateForMonth. Summing it
                    // over the twelve months is the same arithmetic the billing
                    // uses, so the two cards cannot disagree.
                    // ══════════════════════════════════════════════════════════
                    const _rf = _engineCurYr && typeof _engineCurYr.rateForMonth === 'function'
                      ? _engineCurYr.rateForMonth : null;
                    const _annual = _rf
                      ? ACAD_MONTHS_FULL.reduce((sum, m) => sum + (Number(_rf(m)) || 0), 0)
                      : monthlyFee * 12;
                    const _conc = !!(_engineCurYr && _engineCurYr.concessionApplied);
                    // ══════════════════════════════════════════════════════════
                    // "STANDARD" IS ALSO A PER-MONTH FIGURE. IT WAS FLAT x 12.
                    //
                    // The annual above already sums the engine's per-month price.
                    // The subtitle beside it did monthlyFee x 12, which ignores a
                    // mid-year promotion — so the two halves of one tile were
                    // priced by different rules.
                    //
                    // AARAV SHARMA, promoted Grade 5 -> 6 effective October: annual
                    // 20,700 (correct) beside "standard 21,600" (12 x 1,800), when
                    // four of his months were billed at Grade 5's 1,700 and the
                    // true standard is 21,200. The 400 gap read as concession
                    // savings; it was the promotion.
                    //
                    // rateBeforeConcession is the engine's own answer to "what does
                    // the schedule say this month costs" — concession removed,
                    // promotion honoured.
                    // ══════════════════════════════════════════════════════════
                    const _rbc = _engineCurYr && typeof _engineCurYr.rateBeforeConcession === 'function'
                      ? _engineCurYr.rateBeforeConcession : null;
                    const _stdRates = _rbc ? ACAD_MONTHS_FULL.map(m => Number(_rbc(m)) || 0) : null;
                    const _stdAnnual = _stdRates ? _stdRates.reduce((a, b) => a + b, 0) : monthlyFee * 12;
                    // A year whose months do not all cost the same cannot be
                    // described as "rate x 12" — saying so is what hid the
                    // promotion in the first place.
                    const _uniform = !_stdRates || _stdRates.every(r => r === _stdRates[0]);
                    const _sub  = _conc
                      ? 'concession applied · standard ₹' + fmtNum(_stdAnnual)
                      : (_uniform
                          ? '₹' + fmtNum(_stdRates ? _stdRates[0] : monthlyFee) + ' × 12 months'
                          : 'rate changed mid-year · ₹' + fmtNum(_stdAnnual) + ' for the year');
                    return tile('Annual Fee','₹'+fmtNum(_annual),_sub,'rgba(74,158,202,0.10)','rgba(74,158,202,0.25)','var(--info)');
                  })()}
                  ${tile('Months Cleared', _cyClearedN + ' / 12',
                         _cyExcusedN > 0
                           ? (_cyPaidN + ' paid · ' + _cyExcusedN + ' excused')
                           : 'paid in full',
                         'rgba(201,168,76,0.08)','rgba(201,168,76,0.22)','var(--gold-lt)')}
                  ${tile('Months Due',
                         _cyDueN > 0 ? _cyDueN + (_cyDueN === 1 ? ' month' : ' months') : '0 months',
                         _cyPartialN > 0
                           ? ('incl. ' + _cyPartialN + ' part-paid')
                           : (_cyDueN > 0 ? 'this academic year' : 'nothing pending'),
                         'rgba(224,82,82,0.08)','rgba(224,82,82,0.22)',
                         _cyDueN > 0 ? '#e09090' : 'var(--success)')}
                  ${tile('Outstanding','₹'+fmtNum(outstanding),outstanding>0?'Dues pending':'Fully cleared','rgba(224,82,82,0.08)','rgba(224,82,82,0.22)',outstanding>0?'#e09090':'var(--success)')}
                </div>
                <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Month-wise Status — ${yr}</div>
                <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px">${curMonthCells}</div>
                ${info.txList.length > 0 ? `
                  <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Transaction Log</div>
                  <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
                    <thead><tr style="border-bottom:1px solid var(--glass-border)">
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Receipt #</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Amount</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Months</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Date</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Mode</th>
                    </tr></thead>
                    <tbody>${txTableRows}</tbody>
                  </table></div>` : `<div style="font-size:12px;color:var(--muted);background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 12px">No transactions recorded for this year yet.</div>`}
              </div>`;

          } else {
            // ── PREVIOUS YEAR ──
            // AUDIT / STEP 1: the arithmetic that used to sit here inline — the grid
            // merge, the cleared/due counts and the stale-balance override — is now
            // _flProfilePriorYearRow in pending-fee.js, where the contract suite can
            // reach it. Three of this week's defects were in those lines and none of
            // them was testable. Moved verbatim; this block only formats the result.
            const _pyRow = _flProfilePriorYearRow(info, {
              monthlyFee:     monthlyFee,
              engineOwnsYear: _engineOwnsYr,
              outstandingIn:  outstanding,
            });
            const prevStatus = _pyRow.prevStatus;
            const prevFee    = _pyRow.prevFee;
            const hasGrid    = _pyRow.hasGrid;
            const mCleared   = _pyRow.mCleared;
            const mDue       = _pyRow.mDue;
            outstanding      = _pyRow.outstanding;

            // ITEM 3: capture this year's month statuses for the PDF report, using the same
            // prevStatus grid the pills below are rendered from (PARTIAL preserved).
            ACAD_MONTHS.forEach(m => {
              const raw = (prevStatus[m] || '').toUpperCase();
              _rptMonths[m] = (raw === 'N/A-PAID' || raw === 'PAID') ? 'PAID'
                            : raw === 'EXCUSED' ? 'EXCUSED'
                            : raw === 'PARTIAL' ? 'PARTIAL' : 'DUE';
            });

            // Also check transactions for this year (e.g. previous-year dues paid after promotion)
            const txTableRows = info.txList.map(t => {
              const months = t.monthsSelected?.join(', ')||'—';
              return `<tr style="border-bottom:1px solid var(--glass-border-lt)">
                <td style="padding:6px 8px;color:var(--muted);font-size:12px">${t.receiptNumber||'—'}</td>
                <td style="padding:6px 8px;font-weight:700;color:var(--gold-lt);font-size:12px">₹${fmtNum(t.amountPaid||0)}</td>
                <td style="padding:6px 8px;color:var(--text);font-size:11px">${months}</td>
                <td style="padding:6px 8px;color:var(--muted);font-size:12px">${fmtDate(t.date)}</td>
                <td style="padding:6px 8px;color:var(--muted);font-size:12px">${t.paymentMode||'—'}</td>
              </tr>`;
            }).join('');

            expandedHtml = `
              <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--glass-border)">
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
                  ${tile('Monthly Fee','₹'+fmtNum(prevFee),'per month','rgba(74,158,202,0.10)','rgba(74,158,202,0.25)','var(--info)')}
                  ${(() => {
                    // Same correction as the current-year card: a prior year with a
                    // concession on it was billed at the concession rate, so the
                    // Annual Fee shown beside its Outstanding has to be priced the
                    // same way. _enginePrevYr carries that year's own rateForMonth.
                    const _rfP = _enginePrevYr && typeof _enginePrevYr.rateForMonth === 'function'
                      ? _enginePrevYr.rateForMonth : null;
                    const _annualP = _rfP
                      ? ACAD_MONTHS_FULL.reduce((sum, m) => sum + (Number(_rfP(m)) || 0), 0)
                      : prevFee * 12;
                    const _concP = !!(_enginePrevYr && _enginePrevYr.concessionApplied);
                    // Same correction as the current-year tile: "standard" is the
                    // sum of what the schedule charged each month, not a flat x 12.
                    // A promotion inside a PRIOR year has the same effect there.
                    const _rbcP = _enginePrevYr && typeof _enginePrevYr.rateBeforeConcession === 'function'
                      ? _enginePrevYr.rateBeforeConcession : null;
                    const _stdRatesP = _rbcP ? ACAD_MONTHS_FULL.map(m => Number(_rbcP(m)) || 0) : null;
                    const _stdAnnualP = _stdRatesP ? _stdRatesP.reduce((a, b) => a + b, 0) : prevFee * 12;
                    const _uniformP = !_stdRatesP || _stdRatesP.every(r => r === _stdRatesP[0]);
                    const _subP  = _concP
                      ? 'concession applied · standard ₹' + fmtNum(_stdAnnualP)
                      : (_uniformP
                          ? '₹' + fmtNum(_stdRatesP ? _stdRatesP[0] : prevFee) + ' × 12'
                          : 'rate changed mid-year · ₹' + fmtNum(_stdAnnualP) + ' for the year');
                    return tile('Annual Fee','₹'+fmtNum(_annualP),_subP,'rgba(74,158,202,0.07)','rgba(74,158,202,0.20)','var(--info)');
                  })()}
                  ${tile('Months Cleared',mCleared+' / 12','Before promotion','rgba(201,168,76,0.08)','rgba(201,168,76,0.22)','var(--gold-lt)')}
                  ${tile('Months Due',outstanding>0?(mDue||Math.round(outstanding/(prevFee||1)))+' months':'0 months','Carried forward','rgba(224,82,82,0.08)','rgba(224,82,82,0.22)',outstanding>0?'#e09090':'var(--success)')}
                  ${tile('Outstanding','₹'+fmtNum(outstanding),outstanding>0?'Carry-forward dues':'Fully cleared','rgba(224,82,82,0.06)','rgba(224,82,82,0.20)',outstanding>0?'#e09090':'var(--success)')}
                </div>
                ${hasGrid ? `
                  <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Month-wise Status — ${yr} <span style="font-weight:400;color:var(--faint);font-size:9px">(from Excel import)</span></div>
                  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:${info.txList.length?'14px':'0'}">${buildMonthGrid(prevStatus)}</div>
                ` : `<div style="font-size:12px;color:var(--muted);background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 12px;margin-bottom:${info.txList.length?'12px':'0'}">ℹ️ Month-wise breakup not available. Outstanding ₹${fmtNum(outstanding)} imported from Excel.</div>`}
                ${info.txList.length > 0 ? `
                  <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Payments Made for This Year</div>
                  <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
                    <thead><tr style="border-bottom:1px solid var(--glass-border)">
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Receipt #</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Amount</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Months</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Date</th>
                      <th style="padding:6px 8px;text-align:left;color:var(--muted);font-weight:600;font-size:10px;text-transform:uppercase">Mode</th>
                    </tr></thead>
                    <tbody>${txTableRows}</tbody>
                  </table></div>` : ''}
              </div>`;
          }

          // ITEM 3: snapshot this year for the downloadable report — same numbers as the card.
          _duesReportYears.push({
            yr, isCurrent,
            monthlyFee:  isCurrent ? monthlyFee : (info._monthlyFeeForYear || monthlyFee),
            paid:        info.paid || 0,
            excused:     info.excused || 0,
            outstanding: outstanding || 0,
            months:      _rptMonths,
            txList: (info.txList || []).map(t => ({
              receipt: t.receiptNumber || '—',
              amount:  Number(t.amountPaid || 0),
              months:  Array.isArray(t.monthsSelected) ? t.monthsSelected.join(', ') : '—',
              date:    fmtDate(t.date),
              mode:    t.paymentMode || '—',
            })),
          });

          // ── CARD SHELL (clickable header, collapsed body) ──
          return `<div class="card" style="border-left:4px solid ${accent};margin-bottom:14px;cursor:pointer"
            onclick="(function(el){
              const b=document.getElementById('${bodyId}');
              if(!b)return;
              const isOpen=b.dataset.open==='1';
              b.style.display=isOpen?'none':'block';
              b.dataset.open=isOpen?'0':'1';
              const chev=el.querySelector('.fy-chev');
              if(chev)chev.style.transform=isOpen?'rotate(0deg)':'rotate(180deg)';
              const hint=el.querySelector('.fy-hint');
              if(hint)hint.textContent=isOpen?'Click to expand ▾':'Click to collapse ▴';
            })(this)">
            <div class="card-hdr" style="user-select:none">
              <div style="display:flex;align-items:center;gap:10px">
                <span class="card-title" style="color:${accent}">${yr} Fee Summary</span>
                ${isCurrent?'<span style="font-size:10px;background:rgba(201,168,76,0.18);color:var(--gold-lt);padding:2px 8px;border-radius:10px;font-weight:700">CURRENT YEAR</span>':''}
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <!-- ITEM 3: per-year dues report. stopPropagation so it doesn't toggle the card. -->
                <button class="btn btn-ghost btn-sm" title="Download the ${yr} dues report as a PDF"
                  style="border-color:rgba(201,168,76,0.40);color:var(--gold-lt);font-size:11px;padding:4px 10px"
                  onclick="event.stopPropagation();downloadDuesReport('${yr}')">⬇ ${yr} PDF</button>
                <span class="fy-hint" style="font-size:11px;color:var(--muted);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);border-radius:6px;padding:2px 8px">Click to expand ▾</span>
                <svg class="fy-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15" style="color:var(--muted);flex-shrink:0;transition:transform 0.2s;pointer-events:none"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
            <div class="card-body">
              <div class="stats-grid" style="grid-template-columns:repeat(${colCount},1fr);margin-bottom:0">
                <div class="stat-card gold" style="background:${accentBg};border:1px solid ${accent}33">
                  <div class="stat-label">Total Paid</div>
                  <div class="stat-value" style="color:var(--gold-lt)">₹${fmtNum(info.paid)}</div>
                  <div class="stat-sub">${info.txCount} transaction${info.txCount!==1?'s':''}</div>
                </div>
                ${excusedTile}
                <div class="stat-card red" style="background:rgba(224,82,82,0.06);border:1px solid rgba(224,82,82,0.25)">
                  <div class="stat-label">Outstanding</div>
                  <div class="stat-value" style="${outstanding>0?'color:#e09090':'color:var(--success)'}">₹${fmtNum(outstanding)}</div>
                  <div class="stat-sub">${outstanding>0?'Dues pending':'Fully cleared'}</div>
                </div>
              </div>
              <div id="${bodyId}" style="display:none" data-open="0">${expandedHtml}</div>
            </div>
          </div>`;
        }).join('');

        // ITEM 3: publish the snapshot for downloadDuesReport(). Rebuilt on every profile render,
        // so it always matches the cards currently on screen.
        window._duesReportData = {
          student: {
            id: s.id, name: s.name || '—', admissionNumber: s.admissionNumber || '—',
            class: s.class || '—', section: s.section || '—', block: s.block || '—',
            parentName: s.parentName || '—', contact: s.contact || '—',
          },
          years: _duesReportYears,
        };

        return cards;
      })()}

      <!-- ITEM 12: Grand totals across every academic year with data. Reads the snapshot the
           year cards just produced (window._duesReportData), so these figures are by
           construction the sum of the cards above and identical to the downloadable report —
           never a separate calculation that could drift. -->
      ${(() => {
        const _gy    = (window._duesReportData && window._duesReportData.years) || [];
        const _gPaid = _gy.reduce((a, y) => a + Number(y.paid || 0), 0);
        const _gDue  = _gy.reduce((a, y) => a + Number(y.outstanding || 0), 0);
        const _gExc  = _gy.reduce((a, y) => a + Number(y.excused || 0), 0);
        const _tile  = (label, value, sub, color, bg, border) => `
          <div style="flex:1;min-width:170px;background:${bg};border:1px solid ${border};border-radius:12px;padding:14px 18px">
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">${label}</div>
            <div style="font-size:22px;font-weight:700;color:${color}">₹${fmtNum(value)}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:2px">${sub}</div>
          </div>`;
        return `
        <div class="card" style="margin-bottom:18px;border-left:4px solid var(--gold)">
          <div class="card-hdr" style="display:flex;justify-content:space-between;align-items:center">
            <span class="card-title" style="color:var(--gold-lt)">Grand Total — All Academic Years</span>
            <span style="font-size:11px;color:var(--muted)">${_gy.length} year${_gy.length!==1?'s':''} on record</span>
          </div>
          <div class="card-body">
            <div style="display:flex;flex-wrap:wrap;gap:12px">
              ${_tile('Grand Total Paid', _gPaid, 'across every year', 'var(--gold-lt)', 'rgba(201,168,76,0.10)', 'rgba(201,168,76,0.28)')}
              ${_gExc > 0 ? _tile('Total Excused', _gExc, 'waived, ₹0 collected', 'var(--success)', 'rgba(82,200,122,0.08)', 'rgba(82,200,122,0.22)') : ''}
              ${_tile('Grand Total Dues', _gDue, _gDue > 0 ? 'still outstanding' : 'fully cleared',
                      _gDue > 0 ? '#e09090' : 'var(--success)', 'rgba(224,82,82,0.07)', 'rgba(224,82,82,0.22)')}
            </div>
          </div>
        </div>`;
      })()}

      <div class="card">
        <div class="card-hdr">
          <span class="card-title">Fee Payment History</span>
          <!-- VLX-REF-002 FIX: Payment editing is ADMIN-ONLY. Principal has read-only access. -->
          <div style="display:flex;align-items:center;gap:10px">
            ${currentRole==='admin'?`<span style="font-size:11px;color:var(--muted);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:3px 10px;font-weight:600;letter-spacing:0.3px">🔒 View Only</span>`:''}
            <!-- CHG-006: feeSno removed from params platform-wide -->
            ${(typeof _flPaymentGuard === 'function' && !_flPaymentGuard(s, { fromArchive:_fromArchive }).allowed)
              ? `<button class="btn btn-sm" disabled title="${_flPaymentGuard(s).reason}"
                   style="background:rgba(224,82,82,0.06);color:var(--muted);border:1px solid rgba(224,82,82,0.22);cursor:not-allowed;opacity:0.75">⛔ Terminated — No Payment</button>`
              : `<button class="btn btn-primary btn-sm" onclick="pushNav('recordFee',{studentId:'${s.id}',studentName:'${jsAttr(s.name)}',classSection:'${(s.class||'')+'  –  Section '+(s.section||'')}'${_fromArchive ? ',fromArchive:true' : ''} })">+ Record Payment</button>`}
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table>
              <!-- VLX-REF-002 FIX: Actions column (Edit/Delete) shown ONLY for Admin role.
                   Principal is strictly read-only on all payment records. -->
              <!-- VLX-REF-002: Actions column shown for Principal only (Delete); Admin has no edit or delete -->
              <thead><tr><th>Receipt #</th><th>Fee Head</th><th>Amount</th><th>Balance</th><th>Mode</th><th>Date</th><th>Status</th>${currentRole==='principal'?'<th>Actions</th>':''}</tr></thead>
              <tbody>
                ${transactions.length===0?`<tr><td colspan="${currentRole==='principal'?8:7}" style="text-align:center;padding:30px;color:var(--muted)">No transactions recorded.</td></tr>`:
                  transactions.map(t=>`
                  <tr>
                    <td class="muted">${t.receiptNumber||'—'}</td>
                    <td>${t.feeHead||'—'}</td>
                    <td><strong>₹${fmtNum(t.amountPaid||0)}</strong></td>
                    <td>₹${fmtNum(t.remainingBalance||0)}</td>
                    <td>${t.paymentMode||'—'}</td>
                    <td>${fmtDate(t.date)}</td>
                    <td>${statusBadge(t.paymentStatus)}</td>
                    ${currentRole==='principal'?`<td>
                      <button class="btn btn-danger btn-sm" onclick="deleteTxDirectly(this.dataset.txid,this.dataset.sid)" data-txid="${t.id}" data-sid="${s.id}" title="Delete this transaction">🗑 Delete</button>
                    </td>`:''}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);
    } catch(e) {
      setContent(`<div class="alert alert-danger">Error: ${e.message}</div>`);
    }
  } // end _doRenderProfile

  // LIVE-PROFILE: Wire onSnapshot listeners for student doc + feeTransactions
  // Both fire together — whenever either changes, re-render the full profile.
  try {
    // State holders updated by whichever snapshot fires
    let _snapStudentData = preloaded || null;
    let _snapTxDocs = [];
    let _snapConcession = null; // { concessionFee, activeMonths[] } or null

    // Initial load: fetch both once to populate state before snapshots fire
    if (!_snapStudentData) {
      const doc = await schoolCol('students').doc(id).get();
      if (!doc.exists) { setContent('<div class="alert alert-danger">Student not found.</div>'); return; }
      _snapStudentData = { id:doc.id, ...doc.data() };
    }
    const initTxSnap = await schoolCol('feeTransactions').where('studentId','==',id).get();
    _snapTxDocs = initTxSnap.docs.map(d=>({id:d.id,...d.data()}));

    // CONCESSION-WIRE: fetch concession for this student (by admissionNumber)
    try {
      const admNo = _snapStudentData.admissionNumber || '';
      if (admNo) {
        const cSnap = await schoolCol('concessionFees').where('admissionNo','==',admNo).limit(1).get();
        if (!cSnap.empty) _snapConcession = cSnap.docs[0].data();
      }
    } catch(_) {}

    // Initial render
    await _doRenderProfile(_snapStudentData, [..._snapTxDocs], _snapConcession);

    // onSnapshot — student doc changes (name, class, outstandingBalance, etc.)
    const unsubStudent = schoolCol('students').doc(id).onSnapshot(snap => {
      if (!snap.exists) return;
      _snapStudentData = { id:snap.id, ...snap.data() };
      _doRenderProfile(_snapStudentData, [..._snapTxDocs], _snapConcession);
    }, err => console.warn('[LIVE-PROFILE] student onSnapshot:', err.message));

    // onSnapshot — fee transactions for this student
    const unsubTx = schoolCol('feeTransactions')
      .where('studentId','==',id)
      .onSnapshot(snap => {
        _snapTxDocs = snap.docs.map(d=>({id:d.id,...d.data()}));
        _doRenderProfile(_snapStudentData, [..._snapTxDocs], _snapConcession);
      }, err => console.warn('[LIVE-PROFILE] feeTransactions onSnapshot:', err.message));

    // Register both for detach on navigate away
    window._profileListeners.push(unsubStudent, unsubTx);
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error loading profile: ${e.message}</div>`);
  }
}

