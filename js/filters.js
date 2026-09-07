/* ============================================================
   CHG-010: UNIVERSAL FILTER SYSTEM
   A single FilterEngine class, instantiated once per module.
   Modules call: FilterEngine.init(config) → subscribe onChange
   getState() → returns normalized filter object
   getClientPredicate() → returns a function(record) => bool
   ============================================================ */
class FilterEngine {
  /**
   * @param {Object} config
   *   targetId   {string}  DOM container id for filter UI
   *   sections   {string[]} available section labels e.g. ['A','B','C']
   *   classes    {string[]} available class labels
   *   blocks     {string[]} available block labels
   *   onChange   {function(state)} callback fired on every change (debounced 300ms)
   *   features   {Object}  optional flags: { datePresets, search, feeStatus, blockFilter }
   *                        all default true if omitted
   */
  constructor() {
    this._state        = this._emptyState();
    this._timer        = null;
    this._callbacks    = [];
    this._config       = {};
    this._debounceMs   = 300;
  }

  _emptyState() {
    return {
      block: '',
      className: '',
      sections: [],           // selected section labels
      datePreset: null,       // 'today' | 'yesterday' | 'week' | 'month' | null
      dateFrom: null,         // Date | null
      dateTo: null,           // Date | null
      search: '',
      feeStatus: '',          // '' | 'paid' | 'pending' | 'partial'
    };
  }

  /** Register a module; returns unsubscribe function */
  init(config) {
    this._config    = config;
    this._state     = this._emptyState();
    this._callbacks = config.onChange ? [config.onChange] : [];
    return () => { this._callbacks = []; };
  }

  /** Subscribe to state changes */
  onChange(fn) { this._callbacks.push(fn); }

  /** Read current filter state */
  getState() { return { ...this._state }; }

  /** Fire callbacks (debounced) */
  _fire() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      const s = this.getState();
      this._callbacks.forEach(fn => { try { fn(s); } catch(e) { console.warn('[FilterEngine]', e); } });
    }, this._debounceMs);
  }

  /** Setters — each triggers _fire() */
  setBlock(v)      { this._state.block     = v;  this._fire(); }
  setClass(v)      { this._state.className = v;  this._fire(); }
  setSections(arr) { this._state.sections  = arr; this._fire(); }
  setFeeStatus(v)  { this._state.feeStatus = v;  this._fire(); }
  setSearch(v)     { this._state.search    = v.trim().toLowerCase(); this._fire(); }

  setDatePreset(preset) {
    const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
    let from, to = now;
    if (preset === 'today')     { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
    else if (preset === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      from = new Date(y.getFullYear(), y.getMonth(), y.getDate());
      to   = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    }
    else if (preset === 'week') {
      const mon = new Date(now);
      mon.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      from = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate());
    }
    else if (preset === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); }
    else { this._state.datePreset = null; this._state.dateFrom = null; this._state.dateTo = null; this._fire(); return; }
    if (preset !== 'yesterday') to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    this._state.datePreset = preset;
    this._state.dateFrom   = from;
    this._state.dateTo     = to;
    this._fire();
  }

  setCustomDateRange(fromStr, toStr) {
    this._state.datePreset = null;
    this._state.dateFrom   = fromStr ? new Date(fromStr) : null;
    this._state.dateTo     = toStr   ? (() => { const d = new Date(toStr); d.setHours(23,59,59,999); return d; })() : null;
    this._fire();
  }

  reset() { this._state = this._emptyState(); this._fire(); }

  /**
   * Returns a client-side predicate function.
   * Record shape expected (all fields optional):
   *   block, class/studentClass, section/studentSection,
   *   fee_status/feeStatus, date (Timestamp|Date|string),
   *   studentName, parentName, contactNo, admissionNumber
   */
  getClientPredicate() {
    const s = this.getState();
    return function(rec) {
      // Block
      if (s.block) {
        const rb = rec.block || rec.studentBlock || '';
        if (rb && rb !== s.block) return false;
      }
      // Class
      if (s.className) {
        const rc = rec.class || rec.studentClass || rec.classSection || '';
        if (!rc.startsWith(s.className)) return false;
      }
      // Sections (multi-select)
      if (s.sections.length) {
        const rsec = rec.section || rec.studentSection || '';
        if (rsec && !s.sections.includes(rsec)) return false;
      }
      // Fee status
      if (s.feeStatus) {
        const rf = rec.fee_status || rec.feeStatus || '';
        if (rf.toLowerCase() !== s.feeStatus) return false;
      }
      // Date range
      if (s.dateFrom || s.dateTo) {
        let rd = null;
        if (rec.date?.seconds)     rd = new Date(rec.date.seconds * 1000);
        else if (rec.date)         rd = new Date(rec.date);
        else if (rec.paymentDate)  rd = new Date(rec.paymentDate?.seconds ? rec.paymentDate.seconds * 1000 : rec.paymentDate);
        if (rd) {
          if (s.dateFrom && rd < s.dateFrom) return false;
          if (s.dateTo   && rd > s.dateTo)   return false;
        }
      }
      // Search
      if (s.search) {
        const hay = [
          rec.studentName, rec.name, rec.parentName, rec.guardianName,
          rec.contactNo, rec.phone, rec.admissionNumber, rec.admNo,
          rec.receiptNumber
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(s.search)) return false;
      }
      return true;
    };
  }

  /**
   * Renders a compact reusable filter bar HTML into a given container id.
   * Caller must call fe.init(config) first with valid config.sections / config.classes / config.blocks.
   * fePrefix: unique prefix for DOM ids (e.g. 'fe_fin', 'fe_pf', 'fe_stu')
   */
  renderBar(containerId, fePrefix, opts = {}) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const blocks   = this._config.blocks   || getBlocks();
    const classes  = this._config.classes  || getClassList();
    const sections = this._config.sections || getSections();
    const showFeeStatus = opts.feeStatus !== false;
    const self = this;

    el.innerHTML = `
      <div class="filter-bar-row1">
        ${showFeeStatus ? `
        <div class="filter-bar-field">
          <div class="filter-bar-label" style="color:var(--gold,#C9A84C)">★ Fee Status</div>
          <select id="${fePrefix}_feeStatus" class="filter-bar-select" onchange="window._fe_${fePrefix}&&window._fe_${fePrefix}.setFeeStatus(this.value)">
            <option value="">All Statuses</option>
            <option value="paid">✅ Paid</option>
            <option value="pending">🔴 Pending</option>
          </select>
        </div>` : ''}
        <div class="filter-bar-field">
          <div class="filter-bar-label">Block</div>
          <select id="${fePrefix}_block" class="filter-bar-select" style="min-width:140px" onchange="window._fe_${fePrefix}&&window._fe_${fePrefix}.setBlock(this.value)">
            <option value="">All Blocks</option>
            ${blocks.map(b=>`<option>${b}</option>`).join('')}
          </select>
        </div>
        <div class="filter-bar-field">
          <div class="filter-bar-label">Class</div>
          <select id="${fePrefix}_class" class="filter-bar-select" style="min-width:150px" onchange="window._fe_${fePrefix}&&window._fe_${fePrefix}.setClass(this.value)">
            <option value="">All Classes</option>
            ${classes.map(c=>`<option>${c}</option>`).join('')}
          </select>
        </div>
        <div class="filter-bar-field">
          <div class="filter-bar-label">Section</div>
          ${(()=>{
            const dd = _mkSecDropdown(fePrefix, sections, arr => {
              if(window['_fe_'+fePrefix]) window['_fe_'+fePrefix].setSections(arr);
            });
            return dd.html;
          })()}
        </div>
        <div class="filter-bar-field grow">
          <div class="filter-bar-label" style="display:flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Search
          </div>
          <input type="text" id="${fePrefix}_search" class="filter-bar-input" placeholder="Student · Parent · Contact · Adm No"
            oninput="window._fe_${fePrefix}&&window._fe_${fePrefix}.setSearch(this.value)">
        </div>
        <div class="filter-bar-field" style="align-self:flex-end">
          <div class="filter-bar-clear-spacer">-</div>
          <button class="btn btn-ghost btn-sm" style="padding:8px 14px;font-size:12px"
            onclick="window._fe_${fePrefix}&&(window._fe_${fePrefix}.reset(),document.querySelectorAll('[id^=${fePrefix}]').forEach(e=>{if(e.tagName==='SELECT')e.value='';else if(e.tagName==='INPUT')e.value=''}),window._secDdState_${fePrefix}=[],window._secDdRegistry?.['${fePrefix}']?.syncUI?.())">
            Clear All
          </button>
        </div>
      </div>
      <div class="filter-bar-row2">
        <span class="filter-bar-date-label">Date:</span>
        ${['today','yesterday','week','month'].map(p=>`
          <button id="${fePrefix}_preset_${p}" class="filter-bar-preset"
            onclick="window._fe_${fePrefix}&&window._fePresetClick_${fePrefix}('${p}')">
            ${p==='today'?'Today':p==='yesterday'?'Yesterday':p==='week'?'This Week':'This Month'}
          </button>`).join('')}
        <span class="filter-bar-or">or custom:</span>
        <input type="date" id="${fePrefix}_dateFrom" class="filter-bar-date-input"
          onchange="window._fe_${fePrefix}&&window._fe_${fePrefix}.setCustomDateRange(this.value,document.getElementById('${fePrefix}_dateTo')?.value||'');['today','yesterday','week','month'].forEach(p=>{const b=document.getElementById('${fePrefix}_preset_'+p);if(b)b.classList.remove('active');})" >
        <span class="filter-bar-arrow">→</span>
        <input type="date" id="${fePrefix}_dateTo" class="filter-bar-date-input"
          onchange="window._fe_${fePrefix}&&window._fe_${fePrefix}.setCustomDateRange(document.getElementById('${fePrefix}_dateFrom')?.value||'',this.value);['today','yesterday','week','month'].forEach(p=>{const b=document.getElementById('${fePrefix}_preset_'+p);if(b)b.classList.remove('active');})" >
      </div>
    `;

    // Preset click helper registered on window so inline onclick can reach it
    window[`_fePresetClick_${fePrefix}`] = (preset) => {
      // Toggle off if already active
      if (self._state.datePreset === preset) {
        self._state.datePreset = null; self._state.dateFrom = null; self._state.dateTo = null;
        ['today','yesterday','week','month'].forEach(p => {
          const b = document.getElementById(`${fePrefix}_preset_${p}`);
          if (b) b.classList.remove('active');
        });
        const df = document.getElementById(`${fePrefix}_dateFrom`); if (df) df.value = '';
        const dt = document.getElementById(`${fePrefix}_dateTo`);   if (dt) dt.value = '';
        self._fire();
        return;
      }
      ['today','yesterday','week','month'].forEach(p => {
        const b = document.getElementById(`${fePrefix}_preset_${p}`);
        if (b) b.classList.remove('active');
      });
      const ab = document.getElementById(`${fePrefix}_preset_${preset}`);
      if (ab) ab.classList.add('active');
      // Sync date inputs
      self.setDatePreset(preset);
      const s = self.getState();
      const fmt = d => { if (!d) return ''; const _fd = d.toDate ? d.toDate() : new Date(d); return `${_fd.getFullYear()}-${String(_fd.getMonth()+1).padStart(2,'0')}-${String(_fd.getDate()).padStart(2,'0')}`; }; // BUG-TS-001 FIX
      const dfEl = document.getElementById(`${fePrefix}_dateFrom`); if (dfEl) dfEl.value = fmt(s.dateFrom);
      const dtEl = document.getElementById(`${fePrefix}_dateTo`);   if (dtEl) dtEl.value = fmt(s.dateTo);
    };

    // Register instance on window so inline handlers work
    window[`_fe_${fePrefix}`] = self;
  }
}

/* CHG-010: Module-level singleton instances */
window._feFinance  = new FilterEngine();   // Paid Fee [CHG-008: renamed from Fees & Finance]
window._fePending  = new FilterEngine();   // Due Fee [CHG-009: renamed from Pending Fees]
window._feStudents = new FilterEngine();   // Student Management
