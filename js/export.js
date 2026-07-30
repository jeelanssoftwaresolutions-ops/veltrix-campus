/* ============================================================
   EXPORT FUNCTIONS
   ============================================================ */

// BUG-06 FIX: Ensure export globals are populated before any export runs.
// If user exports directly from Reports without visiting Finance, fetch fresh data.
async function ensureExportData() {
  // BUG-P02 FIX: Always do a full unbounded fetch for exports.
  // The dashboard pre-populates _financeData with a limited query (100/200 rows) or sets [] on
  // error. We force-clear it here so exports always get the complete, fresh collection.
  window._financeData = null;

  try {
    const snap = await schoolCol('feeTransactions').get();
    window._financeData = snap.docs.map(d=>({id:d.id,...d.data()})).filter(t => currentRole === 'principal' || !t.isHiddenPayment);
    window._allTxs = window._financeData;
  } catch(e) {
    console.error('BUG-P02: feeTransactions fetch failed for export:', e);
    showToast('Failed to fetch transaction data for export. Check your connection.', 'danger');
    window._financeData = [];
    throw e;
  }

  if (!window._allStudents || !window._allStudents.length) {
    try {
      const snap = await schoolCol('students').get();
      // JSS-REF-VELTRIX-2026-005 ITEM 1: hidden students are excluded from exported reports
      // (same rule as Due Fee / Dashboard totals — see moveStudentToHidden's own promise).
      window._allStudents = snap.docs.map(d=>({id:d.id,...d.data()})).filter(s => s.status !== 'hidden');
    } catch(e) {
      console.error('BUG-P02: students fetch failed for export:', e);
      window._allStudents = [];
    }
  }

  if (!window._allTerminated && !window._terminatedData) {
    try {
      const snap = await schoolCol('terminatedStudents').get();
      window._allTerminated = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch(e) {
      console.error('BUG-P02: terminatedStudents fetch failed for export:', e);
      window._allTerminated = [];
    }
  }
}

async function exportFinanceExcel() {
  // BUG-N17 FIX: Disable export button and show loading toast during full Firestore read.
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Export Excel'));
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Preparing…'; }
  try {
    let txs = _finExportRows();
    if (!txs.length) { await ensureExportData(); txs = _finExportRows(); }
    if (!txs.length) { showToast('No transaction data available. Visit the Paid Fee page first.', 'warning'); return; }
    // #14 FIX: Block column added first; fmtDate() on date field
    // JSS-REF-002 ITEM 2 FIX: Cheque No. column added — blank for non-cheque payments.
    const header = ['Block','Receipt#','Student','Parent','Contact','Adm#','Class','Fee Head','Amount','Balance','Mode','Cheque No.','Date','Status','Recorded By'];
    const rows = txs.map(t=>([t.studentBlock||t.block||'—',t.receiptNumber,t.studentName,t.parentName||'—',t.contactNo||t.phone||'—',t.admissionNumber,t.classSection,t.feeHead,Number(t.amountPaid||0),t.remainingBalance,_finModeDisplay(t),_getChequeNoDisplay(t)||'',fmtDate(t.date),t.paymentStatus,t.recordedByName]));
    exportXLS([header, ...rows, ..._finSummaryRows(txs, header.length)], 'Paid_Fee');  // [CHG-008]
    showToast(`Excel exported — ${txs.length} transaction${txs.length!==1?'s':''}.`, 'success');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 Export Excel'; }
  }
}
// ════════════════════════════════════════════════════════════════════════════
// PAID FEE EXPORTS — must mirror the screen exactly.
// Previously both read window._financeData, which ensureExportData() fills from an
// UNFILTERED read of the whole feeTransactions collection. Filtering the page to
// "Today", or to one block/class/section, and exporting still produced every
// transaction ever recorded — an export that silently contradicted the screen.
// They now export window._financeFiltered (published by _applyFinanceFilters with
// exactly the rows rendered), falling back to the loaded set and only then to a
// full read. Totals and the per-mode split come from the SAME _ffPaymentModeTotals()
// the on-screen breakdown uses, so an export can never disagree with the bar above it.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Reconciliation footer for a tabular export: a blank spacer then a TOTAL row with
 * the requested numeric columns summed. Financial exports are shared externally and
 * must be checkable without re-adding the column by hand.
 * @param {object[]} rows - The exported rows.
 * @param {number} width - Column count, so the row lines up with the header.
 * @param {Object<number,function>} sums - colIndex -> row accessor returning a number.
 * @returns {Array[]} Rows to append.
 */
function _expTotalsRows(rows, width, sums) {
  const blank = new Array(width).fill('');
  const total = new Array(width).fill('');
  total[0] = `TOTAL (${rows.length})`;
  Object.keys(sums).forEach(i => {
    total[Number(i)] = rows.reduce((s, r) => s + (Number(sums[i](r)) || 0), 0);
  });
  return [blank, total];
}

/** The rows the Paid Fee screen is currently showing. */
function _finExportRows() {
  if (Array.isArray(window._financeFiltered)) return window._financeFiltered;
  if (Array.isArray(window._financeAllLoaded) && window._financeAllLoaded.length) return window._financeAllLoaded;
  return window._financeData || [];
}

/**
 * Human-readable payment mode. A split payment stores paymentMode 'Split Payment'
 * with the real amounts in paymentModeBreakup[]; printing the literal string loses
 * the actual modes, so expand it the same way the receipt does.
 */
function _finModeDisplay(t) {
  if (Array.isArray(t.paymentModeBreakup) && t.paymentModeBreakup.length > 1) {
    return t.paymentModeBreakup.map(r => `${r.mode} ₹${fmtNum(r.amount)}`).join(' + ');
  }
  return t.paymentMode || '—';
}

/** Summary lines (grand total + per-mode split) appended to both export formats. */
function _finSummaryRows(txs, width) {
  const totals = (typeof _ffPaymentModeTotals === 'function')
    ? _ffPaymentModeTotals(txs)
    : { byMode: {}, total: txs.reduce((s,t)=>s+Number(t.amountPaid||0),0), count: txs.length };
  const pad = arr => { while (arr.length < width) arr.push(''); return arr; };
  const out = [ pad([]), pad(['TOTAL COLLECTED', '₹' + fmtNum(totals.total), `${totals.count} receipt(s)`]) ];
  Object.keys(totals.byMode).forEach(m => {
    if ((totals.byMode[m] || 0) > 0 || ['Cash','Bank Transfer','Cheque','UPI'].includes(m)) {
      out.push(pad(['  ' + m, '₹' + fmtNum(totals.byMode[m] || 0)]));
    }
  });
  return out;
}

async function exportFinancePDF() {
  // BUG-N17 FIX: Disable button and show loading state during export data fetch.
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Export PDF'));
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Preparing…'; }
  try {
    let txs = _finExportRows();
    if (!txs.length) { await ensureExportData(); txs = _finExportRows(); }
    if (!txs.length) { showToast('No transaction data available. Visit the Paid Fee page first.', 'warning'); return; }
    const headers = ['Block','Receipt#','Student','Parent','Contact','Class','Fee Head','Amount','Mode','Cheque No.','Date','Status'];
    // #14 FIX: Block column added first
    // JSS-REF-002 ITEM 2 FIX: Cheque No. column added — blank for non-cheque payments.
    const body = txs.map(t=>[t.studentBlock||t.block||'—',t.receiptNumber,t.studentName,t.parentName||'—',t.contactNo||t.phone||'—',t.classSection,t.feeHead,'₹'+fmtNum(t.amountPaid),_finModeDisplay(t),_getChequeNoDisplay(t)||'—',fmtDate(t.date),t.paymentStatus]);
    exportSimplePDF('Paid Fee Report',  // [CHG-008] renamed from Fee Collection Report
      headers, body.concat(_finSummaryRows(txs, headers.length)));
    showToast(`PDF exported — ${txs.length} transaction${txs.length!==1?'s':''}.`, 'success');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 Export PDF'; }
  }
}
async function exportFeeCollectionPDF()  { await exportFinancePDF(); }
async function exportFeeCollectionXLS()  { await exportFinanceExcel(); }
async function exportDefaulterPDF() {
  await ensureExportData();
  const txs = (window._allTxs||[]).filter(t=>t.remainingBalance>0);
  if (!txs.length) { showToast('No defaulter data found.', 'warning'); return; }
  // #14 FIX: Block column first
  exportSimplePDF('Defaulter List',
    ['Block','Student','Adm#','Class','Fee Head','Balance','Status'],
    txs.map(t=>[t.studentBlock||t.block||'—',t.studentName,t.admissionNumber,t.classSection,t.feeHead,'₹'+fmtNum(t.remainingBalance),t.paymentStatus]));
}
async function exportDefaulterXLS() {
  await ensureExportData();
  const txs = (window._allTxs||[]).filter(t=>t.remainingBalance>0);
  // #14 FIX: Block column first; explicit header as first element
  exportXLS([
    ['Block','Student','Adm#','Class','Fee Head','Balance','Status'],
    ...txs.map(t=>[t.studentBlock||t.block||'—',t.studentName,t.admissionNumber,t.classSection,t.feeHead,t.remainingBalance,t.paymentStatus])
  ], 'Defaulters');
}
async function exportStudentDbPDF() {
  await ensureExportData();
  const stu = window._allStudents||[];
  if (!stu.length) { showToast('No student data available. Try visiting Students page first.', 'warning'); return; }
  exportSimplePDF('Student Database',
    ['Block','Name','Adm#','Class','Section','Parent','Contact','Status'],
    stu.map(s=>[s.block||'—',s.name,s.admissionNumber,s.class,s.section,s.parentName,s.contact,s.status]));
}
async function exportStudentDbXLS() {
  await ensureExportData();
  const stu = window._allStudents||[];
  // #14 FIX: Block column first; explicit header row as first array element
  exportXLS([
    ['Block','Name','Adm#','Class','Section','Parent','Contact','Status'],
    ...stu.map(s=>[s.block||'—',s.name,s.admissionNumber,s.class,s.section,s.parentName,s.contact,s.status])
  ], 'Students');
}

/* ── [CHG-003] Student Management — Dual Export (filter-aware) ──────────────
   Exports only the currently-visible filtered rows, not the full collection.
   Falls back to full _allStudentsDataset if filter cache is empty.
   ─────────────────────────────────────────────────────────────────────────── */
function _smExportRows() {
  const list = (window._smCurrentVisible && window._smCurrentVisible.length > 0)
    ? window._smCurrentVisible
    : (_allStudentsDataset || []);
  if (!list.length) { showToast('No students visible to export. Apply a filter or load the Students page first.', 'warning'); return null; }
  return list;
}

async function exportSmPDF() {
  const list = _smExportRows(); if (!list) return;
  const titleParts = [];
  if (_smState.blocks.length)    titleParts.push(_smState.blocks.join(', '));
  if (_smState.cls)               titleParts.push(_smState.cls);
  if (_smState.sections.length)  titleParts.push('Section ' + _smState.sections.join('/'));
  const title = 'Student Management' + (titleParts.length ? ' — ' + titleParts.join(' · ') : '');
  exportSimplePDF(title,
    ['Block','Name','Adm#','Class','Section','Parent','Contact','Status'],
    list.map(s=>[s.block||'—',s.name||'—',s.admissionNumber||'—',s.class||'—',s.section||'—',s.parentName||'—',s.contact||'—',s.status||'active']));
  showToast(`PDF exported — ${list.length} student${list.length!==1?'s':''}`, 'success');
}

async function exportSmXLSX() {
  const list = _smExportRows(); if (!list) return;
  exportXLS([
    ['Block','Name','Adm#','Class','Section','Parent Name','Contact','Status'],
    ...list.map(s=>[s.block||'—',s.name||'—',s.admissionNumber||'—',s.class||'—',s.section||'—',s.parentName||'—',s.contact||'—',s.status||'active'])
  ], 'Students_Export');
  showToast(`Excel exported — ${list.length} student${list.length!==1?'s':''}`, 'success');
}
async function exportTerminatedPDF() {
  await ensureExportData();
  const list = window._allTerminated||[];
  if (!list.length) { showToast('No terminated student records found.', 'warning'); return; }
  // #14 FIX: Block column added as first column; fmtDate() on terminationDate
  exportSimplePDF('Terminated Students',
    ['Block','Name','Adm#','Parent','Contact','Class','Termination Date','Total Due','Paid','Outstanding','Status'],
    list.map(s=>[
      s.block||'—',
      s.studentName,
      s.admissionNumber,
      s.parentName||'—',
      s.contact||'—',
      `${s.class||''} ${s.section||''}`.trim(),
      fmtDate(s.terminationDate),
      '₹'+fmtNum(s.totalDue),
      '₹'+fmtNum(s.amountPaid),
      '₹'+fmtNum(s.outstandingBalance),
      s.outstandingBalance>0?'Dues Pending':'Cleared'
    ]));
}
/* ── [ITEM-07] Excused Section — PDF + Excel Export ────────────────────────
   Exports the Excused Candidates register (same rows currently on screen —
   see window._excusedCandRows, populated by _excusedRenderCandidates()),
   bringing this section's export capability in line with Terminated/Hidden/
   Concession Register and Student Management, which already have it. ── */
function _excusedExportRows() {
  const rows = window._excusedCandRows;
  if (!rows || !rows.length) { showToast('No excused candidates to export.', 'warning'); return null; }
  return rows;
}

async function exportExcusedPDF() {
  const rows = _excusedExportRows(); if (!rows) return;
  exportSimplePDF('Fees Excused Students',
    ['Name','Adm#','Class','Months Excused','Last Waiver Date','Reason','Approved By','Remaining Balance'],
    rows.map(r => {
      const name  = r.latest.studentName || r.sInfo.name || '—';
      const admNo = r.latest.admissionNo  || r.sInfo.admissionNumber || '—';
      const cls   = ((r.latest.class || r.sInfo.class || '') + ' ' + (r.latest.section || r.sInfo.section || '')).trim() || '—';
      const months = r.allMonths.length ? r.allMonths.join(', ') : '—';
      const remaining = r.remaining > 0 ? '₹'+fmtNum(r.remaining) : '₹0 — Cleared';
      return [name, admNo, cls, months, r.dateStr, r.latest.reason || '—', r.latest.approvedBy || '—', remaining];
    }));
  showToast(`PDF exported — ${rows.length} candidate${rows.length!==1?'s':''}`, 'success');
}

async function exportExcusedXLSX() {
  const rows = _excusedExportRows(); if (!rows) return;
  exportXLS([
    ['Name','Adm#','Class','Months Excused','Last Waiver Date','Reason','Approved By','Remaining Balance'],
    ...rows.map(r => {
      const name  = r.latest.studentName || r.sInfo.name || '—';
      const admNo = r.latest.admissionNo  || r.sInfo.admissionNumber || '—';
      const cls   = ((r.latest.class || r.sInfo.class || '') + ' ' + (r.latest.section || r.sInfo.section || '')).trim() || '—';
      const months = r.allMonths.length ? r.allMonths.join(', ') : '—';
      const remaining = r.remaining > 0 ? r.remaining : 0;
      return [name, admNo, cls, months, r.dateStr, r.latest.reason || '—', r.latest.approvedBy || '—', remaining];
    }),
    // Reconciliation footer — Remaining Balance is the only money column here.
    ..._expTotalsRows(rows, 8, { 7: r => (r.remaining > 0 ? r.remaining : 0) })
  ], 'Excused_Students_Export');
  showToast(`Excel exported — ${rows.length} candidate${rows.length!==1?'s':''}`, 'success');
}

async function exportTerminatedXLS() { await exportTerminatedExcel(); }
async function exportTerminatedExcel() {
  await ensureExportData();
  const list = window._terminatedData||window._allTerminated||[];
  // #14 FIX: Block column first; fmtDate() on terminationDate; explicit header row as first array element
  exportXLS([
    ['Block','Name','Adm#','Parent','Contact','Class','Section','Termination Date','Total Due','Amount Paid','Outstanding','Status'],
    ...list.map(s=>[
      s.block||'—',
      s.studentName,
      s.admissionNumber,
      s.parentName||'—',
      s.contact||'—',
      s.class,
      s.section,
      fmtDate(s.terminationDate),
      s.totalDue,
      s.amountPaid,
      s.outstandingBalance,
      s.outstandingBalance>0?'Dues Pending':'Cleared'
    ]),
    // Reconciliation footer — Total Due / Amount Paid / Outstanding.
    ..._expTotalsRows(list, 12, {
      8:  s => s.totalDue,
      9:  s => s.amountPaid,
      10: s => s.outstandingBalance,
    })
  ], 'Terminated_Students');
  showToast(`Excel exported — ${list.length} terminated student${list.length!==1?'s':''}.`, 'success');
}

function exportXLS(data, filename) {
  // BUG-P02 FIX: wrap in try/catch so failures surface as toasts instead of silent no-ops
  // BUG-008 FIX: Auto-size all columns to their widest content so exported Excel is readable.
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Compute max character width per column across all rows (header + data)
    if (data.length > 0) {
      const colCount = Math.max(...data.map(r => r.length));
      const colWidths = Array(colCount).fill(8);
      data.forEach(row => {
        row.forEach((cell, ci) => {
          const len = String(cell == null ? '' : cell).length;
          if (len > colWidths[ci]) colWidths[ci] = len;
        });
      });
      // Cap at 60 chars wide, minimum 10, add 2 chars padding
      ws['!cols'] = colWidths.map(w => ({ wch: Math.min(60, Math.max(10, w + 2)) }));
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}_${new Date().toLocaleDateString('en-IN', {timeZone:IST_TZ}).replace(/\//g,'-')}.xlsx`);
    showToast('Excel file downloaded.', 'success');
  } catch(e) {
    console.error('BUG-P02: XLSX export failed:', e);
    showToast('Excel export failed: ' + (e.message || e), 'danger');
  }
}

function exportSimplePDF(title, headers, rows) {
  // #14 FIX: landscape, block in header, school name, page numbers on every page
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const schoolName   = currentProfile?.schoolName || currentSchoolId || 'School';
  const blockLabel   = currentViewBlock || 'All Blocks';
  const dateStr      = new Date().toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'});
  const generatedBy  = currentProfile?.name || 'Principal';

  // Header band — Navy Blue
  doc.setFillColor(26,36,43);
  doc.rect(0,0,pw,22,'F');
  doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
  doc.text(schoolName, 12, 10);
  doc.setFontSize(10); doc.setFont(undefined,'normal');
  doc.text(title, 12, 17);
  doc.setFontSize(8);
  doc.text(`Block: ${blockLabel}  ·  Generated: ${dateStr}  ·  By: ${generatedBy}`, pw-12, 10, {align:'right'});
  doc.text('Veltrix Campus · Jeelan\'s Software & Solutions', pw-12, 17, {align:'right'});

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 26,
    styles:      { fontSize:8, cellPadding:3, textColor:[30,30,30] },
    headStyles:  { fillColor:[26,36,43], textColor:[255,255,255], fontStyle:'bold', fontSize:7.5 },
    alternateRowStyles: { fillColor:[240,244,248] },
    margin: { left:12, right:12 },
    didDrawPage: (data) => {
      // #14 FIX: block name in page header on EVERY page (after first)
      if (data.pageNumber > 1) {
        doc.setFillColor(26,36,43);
        doc.rect(0,0,pw,14,'F');
        doc.setFontSize(9); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
        doc.text(`${schoolName} — ${title}`, 12, 9);
        doc.setFontSize(8); doc.setFont(undefined,'normal');
        doc.text(`Block: ${blockLabel}  ·  ${dateStr}`, pw-12, 9, {align:'right'});
      }
      // Footer on every page
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(7); doc.setTextColor(120,120,120); doc.setFont(undefined,'normal');
      doc.text(`Block: ${blockLabel}  ·  ${title}`, 12, ph-4);
      doc.text(`Page ${data.pageNumber} of ${pageCount}  ·  Veltrix Campus`, pw-12, ph-4, {align:'right'});
    }
  });

  try {
    doc.save(`${title.replace(/\s/g,'_')}_${schoolName.replace(/\s/g,'_')}_${Date.now()}.pdf`);
    showToast('PDF downloaded.', 'success');
  } catch(e) {
    console.error('BUG-P02: PDF export failed:', e);
    showToast('PDF export failed: ' + (e.message || e), 'danger');
  }
}

