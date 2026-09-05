/* ============================================================
   ACADEMIC STRUCTURE
   ============================================================ */
/* ============================================================
   ACADEMIC STRUCTURE — COLONEL'S CHANGE #7 (Phase 4)
   • Pre-populate ALL 13 classes × 5 sections (A, B, C, D, E)
   • Each card: student count, total monthly due, amount paid, pending dues
   • Multiselect: pick multiple cards → combined paid/pending summary
   ============================================================ */
/* ============================================================
   ACADEMIC STRUCTURE — Block → Class → Students drill-down
   Step 1: Block selection
   Step 2: Class selection (with live student counts per class)
   Step 3: Student table for selected block + class
   ============================================================ */

// State for academic drill-down
let _acState = { block: null, cls: null };

async function renderAcademic() {
  setActiveNav('academic');
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    _acState = { block: null, cls: null };
    window._acAllStudents = await getStudentCache();
    _renderAcademicShell();
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error: ${e.message}</div>`);
  }
}

function _renderAcademicShell() {
  const allStudents  = window._acAllStudents || [];
  const active       = allStudents.filter(s => s.status === 'active').length;
  const CLASS_LIST   = getClassList();

  setContent(`
    <div class="page-head flex-between" style="margin-bottom:16px">
      <div>
        <div class="page-title">Academic Structure</div>
        <div class="page-sub" id="acPageSub">${active} active students · ${getBlocks().length} blocks · ${CLASS_LIST.length} classes</div>
      </div>
    </div>

    <!-- STEP 1: Block Selection -->
    <div class="card" style="margin-bottom:14px;padding:16px 20px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:12px">Block</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap" id="acBlockToggles">
        ${getBlocks().map(b => {
          const isBoys = b === 'Boys Block';
          const isActive = _acState.block === b;
          const accent = isBoys ? 'var(--silver-lt)' : 'var(--gold-lt)';
          const accentBg = isBoys ? 'rgba(168,188,208,0.14)' : 'rgba(201,168,76,0.14)';
          return `<button
            class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}"
            style="font-weight:600;font-size:13px;min-width:140px;letter-spacing:0.3px;
              border-color:${accent};
              ${isActive ? `background:${accentBg};color:${accent}` : `color:var(--muted)`}"
            onclick="acSelectBlock('${b}')">
            <span style="font-size:9px;opacity:0.8;margin-right:6px">◆</span>${b}
          </button>`;
        }).join('')}
      </div>
    </div>

    <!-- STEP 2: Class Selection (hidden until block chosen) -->
    <div class="card" style="margin-bottom:14px;padding:16px 20px;display:none" id="acClassPanel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:12px">Class</div>
      <div id="acClassGrid" style="display:flex;flex-wrap:wrap;gap:10px"></div>
    </div>

    <!-- STEP 3: Section Selection (hidden until class chosen) -->
    <div class="card" style="margin-bottom:14px;padding:16px 20px;display:none" id="acSectionPanel">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:12px">Section</div>
      <div id="acSectionGrid" style="display:flex;flex-wrap:wrap;gap:10px"></div>
    </div>

    <!-- STEP 4: Student Table (hidden until section chosen) -->
    <div class="card" style="display:none" id="acStudentPanel">
      <div class="card-hdr" style="flex-wrap:wrap;gap:8px">
        <span class="card-title" id="acTableTitle">Students</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="text" id="acSearchInput"
            placeholder="Search name, adm no, roll…"
            class="form-control" style="max-width:280px;padding:7px 12px;font-size:13px"
            oninput="_acOnSearch(this.value)">
          <button class="btn btn-secondary btn-sm" onclick="_acClearSearch()" style="font-size:11px;color:var(--muted)">✕ Clear</button>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="tbl-wrap">
          <table id="acStudentTable">
            <thead><tr>
              <th>Adm. No</th><!-- [CHG-020] Roll removed --><th>Name</th>
              <th>Class / Section</th><th>Parent</th><th>Contact</th>
              <th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody id="acStudentBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

function acSelectBlock(blk) {
  _acState.block   = blk;
  _acState.cls     = null;
  _acState.section = null;

  // Highlight active block button
  document.querySelectorAll('#acBlockToggles .btn').forEach(btn => {
    const isBoys  = btn.textContent.includes('Boys Block');
    const isThis  = btn.textContent.includes(blk);
    const accent  = isBoys ? 'var(--silver-lt)' : 'var(--gold-lt)';
    const accentBg= isBoys ? 'rgba(168,188,208,0.14)' : 'rgba(201,168,76,0.14)';
    btn.className = `btn ${isThis ? 'btn-primary' : 'btn-secondary'}`;
    if (isThis) {
      btn.style.background   = accentBg;
      btn.style.color        = accent;
      btn.style.borderColor  = accent;
    } else {
      btn.style.background = '';
      btn.style.color      = 'var(--muted)';
      btn.style.borderColor= accent;
    }
  });

  // Hide section + student panels, show class panel
  const classPanel   = document.getElementById('acClassPanel');
  const sectionPanel = document.getElementById('acSectionPanel');
  const studentPanel = document.getElementById('acStudentPanel');
  if (sectionPanel)  sectionPanel.style.display  = 'none';
  if (studentPanel)  studentPanel.style.display  = 'none';
  if (classPanel)    classPanel.style.display    = '';

  _acRenderClassGrid();
}

function _acRenderClassGrid() {
  const grid        = document.getElementById('acClassGrid');
  if (!grid) return;
  const CLASS_LIST  = getClassList();
  const allStudents = window._acAllStudents || [];
  const blk         = _acState.block;

  const blockStudents = allStudents.filter(s => s.status === 'active' && s.block === blk);

  grid.innerHTML = CLASS_LIST.map(cls => {
    const count      = blockStudents.filter(s => s.class === cls).length;
    const isSelected = _acState.cls === cls;
    return `
      <div onclick="acSelectClass('${cls}')"
        style="cursor:pointer;border-radius:10px;padding:12px 18px;min-width:110px;text-align:center;
          border:2px solid ${isSelected ? 'var(--gold,#C9A84C)' : 'var(--border)'};
          background:${isSelected ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'};
          transition:all 0.15s;user-select:none">
        <div style="font-size:13px;font-weight:700;color:${isSelected ? 'var(--gold,#C9A84C)' : 'var(--silver-hl)'}">${cls}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${count} student${count !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
}

function acSelectClass(cls) {
  _acState.cls     = cls;
  _acState.section = null;

  // Re-render class grid to update highlight
  _acRenderClassGrid();

  // Hide student panel, show section panel
  const sectionPanel = document.getElementById('acSectionPanel');
  const studentPanel = document.getElementById('acStudentPanel');
  if (studentPanel)  studentPanel.style.display = 'none';
  if (sectionPanel)  sectionPanel.style.display = '';

  _acRenderSectionGrid();
}

function _acRenderSectionGrid() {
  const grid        = document.getElementById('acSectionGrid');
  if (!grid) return;
  const SECTIONS    = getSections();
  const allStudents = window._acAllStudents || [];
  const blk         = _acState.block;
  const cls         = _acState.cls;

  const base = allStudents.filter(s =>
    s.status === 'active' && s.block === blk && s.class === cls
  );

  grid.innerHTML = SECTIONS.map(sec => {
    const count      = base.filter(s => s.section === sec).length;
    const isSelected = _acState.section === sec;
    return `
      <div onclick="acSelectSection('${sec}')"
        style="cursor:pointer;border-radius:10px;padding:12px 20px;min-width:110px;text-align:center;
          border:2px solid ${isSelected ? 'var(--gold,#C9A84C)' : 'var(--border)'};
          background:${isSelected ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'};
          transition:all 0.15s;user-select:none">
        <div style="font-size:13px;font-weight:700;color:${isSelected ? 'var(--gold,#C9A84C)' : 'var(--silver-hl)'}">Section ${sec}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${count} student${count !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('') + (() => {
    const total  = base.length;
    const isAll  = _acState.section === null;
    return `
      <div onclick="acSelectSection(null)"
        style="cursor:pointer;border-radius:10px;padding:12px 20px;min-width:110px;text-align:center;
          border:2px solid ${isAll ? 'var(--gold,#C9A84C)' : 'var(--border)'};
          background:${isAll ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'};
          transition:all 0.15s;user-select:none">
        <div style="font-size:13px;font-weight:700;color:${isAll ? 'var(--gold,#C9A84C)' : 'var(--silver-hl)'}">All Sections</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${total} student${total !== 1 ? 's' : ''}</div>
      </div>`;
  })();
}

function acSelectSection(sec) {
  _acState.section = sec;

  // Re-render section grid to update highlight
  _acRenderSectionGrid();

  // Show student table
  const panel = document.getElementById('acStudentPanel');
  if (panel) panel.style.display = '';

  _acApplyFilters();
}

function _acOnSearch(val) {
  _acState.search = val;
  _acApplyFilters();
}
function _acClearSearch() {
  _acState.search = '';
  const inp = document.getElementById('acSearchInput');
  if (inp) inp.value = '';
  _acApplyFilters();
}

function _acApplyFilters() {
  const tbody = document.getElementById('acStudentBody');
  const title = document.getElementById('acTableTitle');
  if (!tbody) return;

  const allStudents = window._acAllStudents || [];
  const CLASS_LIST  = getClassList();
  const classOrder  = Object.fromEntries(CLASS_LIST.map((c,i) => [c,i]));

  let base = allStudents.filter(s => s.status === 'active');

  // Block filter
  if (_acState.block)   base = base.filter(s => s.block === _acState.block);

  // Class filter
  if (_acState.cls)     base = base.filter(s => s.class === _acState.cls);

  // Section filter
  if (_acState.section) base = base.filter(s => s.section === _acState.section);

  // Search
  const lq = (_acState.search || '').trim().toLowerCase();
  if (lq) {
    base = base.filter(s =>
      (s.name||'').toLowerCase().includes(lq) ||
      (s.admissionNumber||'').toLowerCase().includes(lq) ||
      // [CHG-020] rollNumber removed from search
      (s.parentName||'').toLowerCase().includes(lq) ||
      (s.contact||'').toLowerCase().includes(lq)
    );
  }

  // Sort: class order → name
  base.sort((a,b) => {
    const co = (classOrder[a.class]??99) - (classOrder[b.class]??99);
    if (co !== 0) return co;
    return (a.name||'').localeCompare(b.name||'');
  });

  // Update title
  const clsLabel = _acState.cls  || 'All Classes';
  const secLabel = _acState.section ? ` · Section ${_acState.section}` : ' · All Sections';
  const blkLabel = _acState.block || 'All Blocks';
  if (title) title.textContent = `${blkLabel} · ${clsLabel}${secLabel} — ${base.length} student${base.length!==1?'s':''}`;

  // Render rows
  if (base.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--muted)">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = base.map(s => {
    const statusColor = s.status === 'active' ? 'var(--success)' : 'var(--danger)';
    return `<tr ${_studentRowAttrs(s)}>
      <td style="font-size:12px;color:var(--muted)">${s.admissionNumber||'—'}</td>
      <!-- [CHG-020] Roll # td removed -->
      <!-- ITEM 2: was its own inline onclick — now the shared _studentNameLink handler -->
      <td>${_studentNameLink(s.name, s)}</td>
      <td style="font-size:13px">${s.class||'—'} ${s.section ? '– '+s.section : ''}</td>
      <td style="font-size:13px;color:var(--muted)">${s.parentName||'—'}</td>
      <td style="font-size:13px;color:var(--muted)">${s.contact||'—'}</td>
      <td><span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:8px;
        background:${s.status==='active'?'rgba(82,200,122,0.15)':'rgba(224,82,82,0.15)'};
        color:${statusColor};border:1px solid ${statusColor}40">${s.status||'active'}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="pushNav('studentProfile',{id:'${s.id}'})">View</button>
        ${canWrite() ? `<button class="btn btn-ghost btn-sm" onclick="pushNav('addStudent',{type:'edit',id:'${s.id}'})">Edit</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

async function renderClassSection(params) {
  const className = typeof params === 'object' ? params.className : params;
  const section   = typeof params === 'object' ? params.section : '';
  const block     = typeof params === 'object' ? params.block : '';
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    let q = schoolCol('students').where('class','==',className);
    if (section) q = q.where('section','==',section);
    if (block)   q = q.where('block','==',block);
    const snap = await q.get();
    const students = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||'').localeCompare(b.name||''));  // [CHG-020] sorted by name; rollNumber sort removed
    const blockLabel = block ? `<span style="font-size:12px;padding:2px 10px;border-radius:10px;background:${block==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'};font-weight:600;margin-left:10px">${block}</span>` : '';

    setContent(`
      <div class="page-head flex-between">
        <div>
          <div class="page-title">${className}${section?' – Section '+section:''} ${blockLabel}</div>
          <div class="page-sub">${students.length} student${students.length!==1?'s':''} enrolled</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="pushNav('addStudent',{type:'new'})">+ Add Student</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table>
              <thead><tr><!-- [CHG-020] Roll No removed --><th>Admission No</th><th>Name</th><th>Parent Name</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${students.length===0?`<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted)">No students in this section.</td></tr>`:
                  students.map(s=>`
                  <tr>
                    <!-- [CHG-020] Roll # td removed -->
                    <td class="muted">${s.admissionNumber||'—'}</td>
                    <td><strong>${s.name||'—'}</strong></td>
                    <td>${s.parentName||'—'}</td>
                    <td>${s.contact||'—'}</td>
                    <td>${s.status==='active'?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Terminated</span>'}</td>
                    <td><button class="btn btn-ghost btn-sm" onclick="pushNav('studentProfile',{id:'${s.id}'})">View Profile</button></td>
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
}

