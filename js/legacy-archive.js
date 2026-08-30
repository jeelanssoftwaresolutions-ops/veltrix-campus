/* ============================================================
   BUG-P12 FIX — LEGACY STUDENTS ARCHIVE
   Grade 10 graduates are written to legacyStudents collection
   during Annual Promotion (runBulkPromotion).
   This section surfaces them with a year filter and lets both
   Admin and Principal export to PDF or XLSX filtered by year.
   ============================================================ */
/* ── [ITEM-09] Legacy Student Labelling / Tagging ──────────────────────────
   Predefined labels per JSS-REF-VELTRIX-2026-003 Item 09. This list is
   intentionally just a starting point — a free-text "custom label" input in
   the Manage Labels modal lets the Principal add more without a code change,
   satisfying "may be extended" in the spec. ── */
const LEGACY_LABELS = [
  'Head Boy', 'Head Girl', 'House Captain', 'Prefect',
  'Topper', 'Above Average', 'Below Average',
  'Naughty', 'Back Bencher', "Teacher's Favourite",
  'Popular', 'Introvert', 'Extrovert'
];

async function renderLegacy() {
  setActiveNav('legacy');
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    const snap = await schoolCol('legacyStudents').get();
    const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                   .sort((a, b) => (b.promotionYear || 0) - (a.promotionYear || 0));

    // ══════════════════════════════════════════════════════════════════════════
    // JSS-REF-VELTRIX-2026-005 F2 — self-heal, which this screen never had.
    //
    // legacyStudents freezes amountPaid / outstandingBalance at graduation and
    // nothing has ever recomputed them. Terminated and Hidden both self-heal on
    // render; Legacy was the one snapshot collection left reading purely stored
    // figures, so a Grade-10 graduate's numbers were frozen permanently — and the
    // archive is delete-protected by the rules, so a wrong figure written once
    // stayed wrong forever with no way to correct it from the UI.
    //
    // Same recompute the other two use, from the same authoritative snapshot, and
    // patched through _flHealSnapshotDoc so a denied write is reported rather than
    // swallowed. Non-fatal: the table still renders on the stored values.
    // ══════════════════════════════════════════════════════════════════════════
    try {
      await Promise.all(all.map(async r => {
        if (!r.studentId) return;              // nothing to recompute from
        const s2 = await _computeAllYearsFeeSnapshot(r.studentId);
        // The studentId points at a document that no longer exists, so the recompute
        // above was derived from nothing and came back 0/0/0. Patching that in would
        // erase this graduate's archived figures — permanently, since the rules forbid
        // deleting from legacyStudents, so there would be no way back from the UI.
        // A missing student is not evidence that they owed nothing; it is the absence
        // of evidence either way, and the stored figure is the only record left.
        if (s2 && s2.studentMissing) {
          // The heal already knew this and kept it to the console. Carry it onto the
          // row so the SCREEN says it too: 13 of these currently show a red
          // outstanding balance totalling 3,29,700 with nothing indicating the
          // student they belong to no longer exists. Nobody can collect it, and the
          // row is click-through to a profile that will not load.
          r._studentMissing = true;
          console.warn('[LEGACY] ' + (r.studentName || r.id) + ': student record no longer ' +
            'exists — keeping the archived figures rather than recomputing them to zero.');
          return;
        }
        // Through _flSnapshotPatch — the one mapping, shared with the Terminated and
        // Hidden heals and with the reconcile's own push into these collections.
        const patch = (typeof _flSnapshotPatch === 'function')
          ? _flSnapshotPatch(r, s2)
          : {};
        if (Object.keys(patch).length) {
          Object.assign(r, patch);             // reflect on screen even if the write is denied
          _flHealSnapshotDoc('legacyStudents', r.id, patch);
        }
      }));
    } catch(e) {
      console.warn('[LEGACY] self-heal pass failed — showing stored figures:', e && e.message);
    }

    // Build year list from data
    const years = [...new Set(all.map(r => r.promotionYear).filter(Boolean))].sort((a,b) => b - a);
    const currentYear = years[0] || nowIST().getFullYear();
    window._legacyAll = all;
    window._legacyYear = currentYear;

    const yearOpts = years.map(y =>
      `<option value="${y}" ${y===currentYear?'selected':''}>${y}</option>`).join('');

    setContent(`
      <div class="page-head flex-between" style="margin-bottom:16px">
        <div>
          <div class="page-title">🎓 Legacy Students</div>
          <div class="page-sub">Grade 10 graduates archived by promotion year</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" id="legacyExportPdf" onclick="exportLegacyPdf()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Export PDF
          </button>
          <button class="btn btn-secondary btn-sm" id="legacyExportXls" onclick="exportLegacyXls()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Export Excel
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="card-body" style="padding:14px 18px">
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Promotion Year</div>
            <select id="legacyYearFilter" class="filter-bar-select" style="min-width:120px" onchange="legacyApplyFilter()">
              <option value="">All Years</option>
              ${yearOpts}
            </select>
            <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px">Label</div>
            <select id="legacyLabelFilter" class="filter-bar-select" style="min-width:160px" onchange="legacyApplyFilter()">
              <option value="">All Labels</option>
              ${[...new Set([...LEGACY_LABELS, ...all.flatMap(r => Array.isArray(r.labels) ? r.labels : [])])]
                .sort((a,b)=>a.localeCompare(b))
                .map(l => `<option value="${sanitizeHTML(l)}">${sanitizeHTML(l)}</option>`).join('')}
            </select>
            <div id="legacyCount" style="font-size:13px;color:var(--muted)"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table id="legacyTable">
              <thead>
                <tr>
                  <th>Year</th><th>Name</th><th>Adm#</th>
                  <th>Section</th><th>Block</th><th>Parent</th><th>Contact</th><th>Amount Paid</th><th>Outstanding</th>
                  <th>Labels</th><th>Actions</th>
                </tr>
              </thead>
              <tbody id="legacyTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `);

    legacyApplyFilter();

  } catch(e) {
    setContent(`<div class="alert alert-danger" style="margin:24px">Error loading Legacy Students: ${e.message}</div>`);
  }
}

function legacyApplyFilter() {
  const year    = parseInt(document.getElementById('legacyYearFilter')?.value || '0', 10) || null;
  const label   = document.getElementById('legacyLabelFilter')?.value || '';
  const all     = window._legacyAll || [];
  let filtered  = year ? all.filter(r => r.promotionYear === year) : all;
  if (label) filtered = filtered.filter(r => Array.isArray(r.labels) && r.labels.includes(label));
  window._legacyFiltered = filtered;
  window._legacyYear     = year;

  const tbody = document.getElementById('legacyTableBody');
  const countEl = document.getElementById('legacyCount');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:30px;color:var(--muted)">No legacy students found${year ? ' for ' + year : ''}.</td></tr>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  if (countEl) countEl.textContent = `${filtered.length} graduate${filtered.length !== 1 ? 's' : ''}`;

  tbody.innerHTML = filtered.map(r => {
    const labels = Array.isArray(r.labels) ? r.labels : [];
    const labelsHtml = labels.length
      ? labels.map(l => `<span style="display:inline-block;font-size:9px;padding:2px 7px;border-radius:10px;background:rgba(168,120,208,0.15);color:#c9a8f0;border:1px solid rgba(168,120,208,0.3);margin:1px;font-weight:600">${sanitizeHTML(l)}</span>`).join('')
      : `<span style="font-size:11px;color:var(--muted)">—</span>`;
    return `
    <tr ${_studentRowAttrs(r)}>
      <td><span style="font-size:11px;background:rgba(201,168,76,0.15);color:var(--gold-lt);padding:2px 8px;border-radius:5px;font-weight:700">${r.promotionYear || '—'}</span></td>
      <td>${r._studentMissing
              // Not a link: the studentId points at a deleted document, so the row
              // click would land on "Student not found". Named plainly instead.
              ? `<strong style="color:var(--muted)">${sanitizeHTML(r.studentName || '—')}</strong>
                 <div style="font-size:9px;font-weight:700;letter-spacing:.4px;color:var(--warn);margin-top:2px">STUDENT RECORD DELETED</div>`
              : _studentNameLink(r.studentName, r)}</td>
      <td class="muted">${sanitizeHTML(r.admissionNumber || '—')}</td>
      <td>${sanitizeHTML(r.section || '—')}</td>
      <td><span style="font-size:10px;background:${r.block==='Boys Block'?'rgba(168,188,208,0.14)':'rgba(201,168,76,0.14)'};color:${r.block==='Boys Block'?'var(--silver-lt)':'var(--gold-lt)'};padding:2px 7px;border-radius:10px;font-weight:600">${sanitizeHTML(r.block || '—')}</span></td>
      <td style="font-size:13px">${sanitizeHTML(r.parentName || '—')}</td>
      <td style="font-size:13px;color:var(--info)">${sanitizeHTML(r.contact || '—')}</td>
      <td style="color:var(--success);font-weight:600">₹${fmtNum(r.amountPaid || 0)}</td>
      <td style="color:${(r.outstandingBalance||0)>0 && !r._studentMissing?'var(--danger)':'var(--muted)'};font-weight:${(r.outstandingBalance||0)>0 && !r._studentMissing?'700':'400'}">₹${fmtNum(r.outstandingBalance || 0)}
        ${r._studentMissing && (r.outstandingBalance||0) > 0
          // Muted, not red. A balance nobody can collect against a student who no
          // longer exists is a historical record, not a debt on the books — showing
          // it in the same alarm colour as a live arrear overstates the roll.
          ? `<div style="font-size:9px;color:var(--muted);font-weight:400">archived · not collectable</div>` : ''}</td>
      <td style="max-width:200px">${labelsHtml}</td>
      <td><button class="btn btn-ghost btn-sm" style="font-size:11px;white-space:nowrap" onclick="openLegacyLabelsModal('${r.id}')">🏷️ Manage</button></td>
    </tr>`;
  }).join('');
}

/* ── [ITEM-09] Manage Labels modal ── multiple predefined labels + free-text
   custom label, so the label set can be extended without a code change. */
function openLegacyLabelsModal(docId) {
  const record = (window._legacyAll || []).find(r => r.id === docId);
  if (!record) { showToast('Student record not found.', 'danger'); return; }
  const current = Array.isArray(record.labels) ? record.labels : [];
  const customExisting = current.filter(l => !LEGACY_LABELS.includes(l));

  document.getElementById('_legLabelModal')?.remove();
  const modal = document.createElement('div');
  modal.id = '_legLabelModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--glass-border);border-radius:14px;padding:28px 32px;min-width:340px;max-width:480px;max-height:90vh;overflow-y:auto">
      <div style="font-size:16px;font-weight:700;color:var(--silver-hl);margin-bottom:4px">Manage Labels</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:18px">${sanitizeHTML(record.studentName || '—')} · ${sanitizeHTML(record.admissionNumber || '—')} · Class of ${record.promotionYear || '—'}</div>

      <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:.6px;text-transform:uppercase;margin-bottom:10px">Predefined Labels</div>
      <div id="_legLabelGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
        ${LEGACY_LABELS.map(l => `
          <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--silver-lt);padding:6px 8px;border:1px solid var(--glass-border);border-radius:8px;cursor:pointer">
            <input type="checkbox" value="${sanitizeHTML(l)}" ${current.includes(l) ? 'checked' : ''}>
            ${sanitizeHTML(l)}
          </label>`).join('')}
      </div>

      <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">Custom Labels</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Not in the list above? Add your own — it'll be remembered for future students too.</div>
      <div id="_legCustomChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${customExisting.map(l => `
          <span data-custom-chip="${sanitizeHTML(l)}" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 8px;border-radius:10px;background:rgba(168,120,208,0.15);color:#c9a8f0;border:1px solid rgba(168,120,208,0.3)">
            ${sanitizeHTML(l)}
            <span style="cursor:pointer;font-weight:700" onclick="this.parentElement.remove()">&times;</span>
          </span>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:18px">
        <input id="_legCustomInput" class="form-control" type="text" placeholder="e.g. Sports Champion" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();_legAddCustomChip();}">
        <button class="btn btn-secondary btn-sm" onclick="_legAddCustomChip()">+ Add</button>
      </div>

      <div id="_legLabelAlert"></div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveLegacyLabels('${docId}')">Save Labels</button>
        <button class="btn btn-ghost" onclick="document.getElementById('_legLabelModal').remove()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', ev => { if (ev.target === modal) modal.remove(); });
}

function _legAddCustomChip() {
  const inp = document.getElementById('_legCustomInput');
  const val = (inp?.value || '').trim();
  if (!val) return;
  const container = document.getElementById('_legCustomChips');
  // Avoid duplicate chips (case-insensitive) and duplicates of predefined labels
  const existingVals = [...container.querySelectorAll('[data-custom-chip]')].map(el => el.dataset.customChip.toLowerCase());
  if (existingVals.includes(val.toLowerCase()) || LEGACY_LABELS.some(l => l.toLowerCase() === val.toLowerCase())) {
    showFormAlert('_legLabelAlert', 'That label is already in the list above.', 'warning');
    inp.value = '';
    return;
  }
  const chip = document.createElement('span');
  chip.dataset.customChip = val;
  chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 8px;border-radius:10px;background:rgba(168,120,208,0.15);color:#c9a8f0;border:1px solid rgba(168,120,208,0.3)';
  chip.innerHTML = `${sanitizeHTML(val)} <span style="cursor:pointer;font-weight:700" onclick="this.parentElement.remove()">&times;</span>`;
  container.appendChild(chip);
  inp.value = '';
  inp.focus();
}

async function saveLegacyLabels(docId) {
  if (currentRole !== 'principal') { showToast('Only the Principal can manage legacy labels.', 'danger'); return; }
  const checked = [...document.querySelectorAll('#_legLabelGrid input[type=checkbox]:checked')].map(cb => cb.value);
  const customChips = [...document.querySelectorAll('#_legCustomChips [data-custom-chip]')].map(el => el.dataset.customChip);
  const labels = [...new Set([...checked, ...customChips])];
  try {
    await schoolCol('legacyStudents').doc(docId).update({
      labels: labels,
      labelsUpdatedBy: currentUser?.displayName || currentUser?.email || 'Principal',
      labelsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Keep in-memory copy in sync so the table + filter dropdown reflect the change immediately.
    const rec = (window._legacyAll || []).find(r => r.id === docId);
    if (rec) rec.labels = labels;
    document.getElementById('_legLabelModal')?.remove();
    showToast('Labels updated.', 'success');
    legacyApplyFilter();
  } catch(e) {
    showFormAlert('_legLabelAlert', '❌ Save failed: ' + e.message, 'danger');
  }
}

async function exportLegacyPdf() {
  const rows = window._legacyFiltered || [];
  if (!rows.length) { showToast('No data to export.', 'warning'); return; }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const year = window._legacyYear ? String(window._legacyYear) : 'All Years';
  const dateStr = new Date().toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'});
  doc.setFontSize(14); doc.setTextColor(45,110,62);
  doc.text('LEGACY STUDENTS ARCHIVE', 14, 16);
  doc.setFontSize(9); doc.setTextColor(100,143,115);
  doc.text(`Promotion Year: ${year}  |  Generated: ${dateStr}  |  Total: ${rows.length} graduate(s)`, 14, 23);
  doc.autoTable({
    startY: 28,
    head: [['Year','Name','Adm#','Section','Block','Parent','Contact','Paid','Outstanding','Labels']],
    body: rows.map(r => [
      r.promotionYear||'—', r.studentName||'—', r.admissionNumber||'—',
      r.section||'—', r.block||'—',
      r.parentName||'—', r.contact||'—',
      '₹'+fmtNum(r.amountPaid||0), '₹'+fmtNum(r.outstandingBalance||0),
      (Array.isArray(r.labels) && r.labels.length) ? r.labels.join(', ') : '—'
    ]),
    headStyles:  { fillColor:[45,110,62], textColor:255, fontSize:8 },
    bodyStyles:  { fontSize:8 },
    alternateRowStyles: { fillColor:[245,252,247] },
    columnStyles: { 8:{ textColor:[200,50,50] } }
  });
  doc.save(`LegacyStudents_${year.replace(/ /g,'_')}_${dateStr.replace(/ /g,'')}.pdf`);
  showToast('PDF exported.', 'success');
}

function exportLegacyXls() {
  const rows = window._legacyFiltered || [];
  if (!rows.length) { showToast('No data to export.', 'warning'); return; }
  const year = window._legacyYear ? String(window._legacyYear) : 'All Years';
  const d_now = new Date(); const dateStr = d_now.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})+', '+d_now.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});
  const wsData = [
    ['LEGACY STUDENTS ARCHIVE', `Year: ${year}`, `Generated: ${dateStr}`, `Total: ${rows.length}`],
    [],
    ['Year','Name','Admission No','Section','Block','Parent','Contact','Amount Paid','Outstanding Balance','Labels'],
    ...rows.map(r => [
      r.promotionYear||'—', r.studentName||'—', r.admissionNumber||'—',
      r.section||'—', r.block||'—',
      r.parentName||'—', r.contact||'—',
      r.amountPaid||0, r.outstandingBalance||0,
      (Array.isArray(r.labels) && r.labels.length) ? r.labels.join(', ') : '—'
    ]),
    // Reconciliation footer — Amount Paid and Outstanding Balance, so an archive
    // shared externally can be checked without re-adding the columns by hand.
    ..._expTotalsRows(rows, 10, { 7: r => r.amountPaid, 8: r => r.outstandingBalance })
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [8,24,14,14,10,14,22,14,14,26].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ws, 'Legacy Students');
  XLSX.writeFile(wb, `LegacyStudents_${year.replace(/ /g,'_')}.xlsx`);
  showToast('Excel exported.', 'success');
}

