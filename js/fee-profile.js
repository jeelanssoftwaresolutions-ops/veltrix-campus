/* ============================================================
   PHASE 7 #09 — VIRTUAL STUDENT FEE PROFILE CARD
   Accessible from the student profile via "Fee Card" button.
   Displays a 12-month (Jun–May) grid showing PAID / DUE / PARTIAL.
   Powered by monthsSelected arrays from Phase 6 transactions.
   Legacy transactions (no monthsSelected) are shown but not month-mapped.
   View-only. Exportable as PDF.
   ============================================================ */
async function renderFeeCard(params={}) {
  const { studentId } = params;
  if (!studentId) { setContent('<div class="alert alert-danger">No student ID provided.</div>'); return; }
  setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);

  try {
    const sDoc = await schoolCol('students').doc(studentId).get();
    if (!sDoc.exists) { setContent('<div class="alert alert-danger">Student not found.</div>'); return; }
    const s = { id: sDoc.id, ...sDoc.data() };

    const txSnap = await schoolCol('feeTransactions').where('studentId','==',studentId).get();
    const txs = txSnap.docs.map(d=>({id:d.id,...d.data()}));

    // Academic year cycle: June of current year → May of next year
    // If today is before June, the academic year started the previous calendar year
    const today     = nowIST(); /* ITEM 01 FIX */
    const yearStart = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
    const yearEnd   = yearStart + 1;
    const academicYear = `June ${yearStart} – May ${yearEnd}`;

    // Build month → paid transactions map
    // monthsSelected array (Phase 6) = authoritative source
    // Legacy transactions counted but not month-mapped
    const MONTHS = ['June','July','August','September','October','November','December','January','February','March','April','May'];
    const monthMap = {}; // month → { status, date, amount, receiptNo }
    MONTHS.forEach(m => { monthMap[m] = { status:'due', date:null, amount:0, receiptNo:null }; });

    let legacyCount = 0;
    txs.forEach(t => {
      const selected = t.monthsSelected; // array or undefined
      const txDate   = t.date?.toDate ? t.date.toDate() : (t.date ? new Date(t.date) : null);
      const dateStr  = txDate ? txDate.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'2-digit'}) : '—';
      const timeStr  = txDate ? txDate.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit'}) : '';

      if (selected && Array.isArray(selected) && selected.length > 0) {
        const isExcused = t.type === 'excused_waiver';
        selected.forEach(month => {
          if (monthMap[month]) {
            const existing = monthMap[month];
            if (isExcused) {
              // SYNC FIX (Fix 4): an excused month is neither "paid" nor "due" — label
              // it distinctly so the Fee Profile Card doesn't claim a ₹0 payment
              // was received. Excused always wins over a prior 'due' status, but
              // never overwrites an actual payment already recorded for that month.
              if (existing.status === 'due') {
                monthMap[month] = { status:'excused', date: dateStr, time: timeStr, amount: 0, receiptNo: t.receiptNumber||'—', reason: t.reason||'' };
              }
            } else if (existing.status === 'due') {
              // First payment for this month
              monthMap[month] = { status:'paid', date: dateStr, time: timeStr, amount: t.amountPaid||0, receiptNo: t.receiptNumber||'—' };
            } else if (existing.status !== 'excused') {
              // Already has a payment — mark as partial if amounts differ
              monthMap[month].status = 'partial';
              monthMap[month].amount += (t.amountPaid||0);
            }
          }
        });
      } else {
        legacyCount++;
      }
    });

    // JSS-REF-VELTRIX-2026-004 ITEM 06: the amount-difference heuristic above cannot tell a
    // genuine PARTIAL from a top-up that has since completed a month. For the current academic
    // year, defer to the sync-maintained monthStatus grid — the single source of truth that
    // encodes N/A-PAID / PARTIAL / EXCUSED / DUE from the per-month allocation ledger.
    if (s.monthStatus && typeof s.monthStatus === 'object' &&
        _normaliseAcademicYear(s.academicYear) === _normaliseAcademicYear(_getCurrentAcademicYearStr())) {
      const _sfFC = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};
      Object.entries(s.monthStatus).forEach(([k, st]) => {
        const full = _sfFC[k] || k;
        if (!monthMap[full] || monthMap[full].status === 'excused') return;
        const S = (st || '').toUpperCase();
        if (S === 'N/A-PAID' || S === 'PAID') monthMap[full].status = 'paid';
        else if (S === 'PARTIAL') monthMap[full].status = 'partial';
      });
    }

    const paidCount    = Object.values(monthMap).filter(m=>m.status==='paid').length;
    const partialCount = Object.values(monthMap).filter(m=>m.status==='partial').length;
    const dueCount     = Object.values(monthMap).filter(m=>m.status==='due').length;
    const excusedCount = Object.values(monthMap).filter(m=>m.status==='excused').length;

    const schoolName = currentProfile?.schoolName || currentSchoolId || 'School';

    // JSS-REF-VELTRIX-2026-004 ITEM 06: per-month PARTIAL balance-left. The most recent
    // transaction that touched a month records its running shortfall in tx.monthShortage;
    // taking the latest such value per month gives the amount still owed on a partial month.
    const _txMsFC = t => (t.date?.toMillis ? t.date.toMillis() : (t.date?.seconds ? t.date.seconds*1000 : new Date(t.date||0).getTime())) || 0;
    const shortByMonthFC = {};
    txs.filter(t => t.monthShortage && typeof t.monthShortage === 'object')
       .sort((a,b) => _txMsFC(a) - _txMsFC(b))
       .forEach(t => { Object.entries(t.monthShortage).forEach(([m, sh]) => { shortByMonthFC[m] = sh; }); });

    const monthCells = MONTHS.map(month => {
      const info   = monthMap[month];
      const cls    = info.status === 'paid' ? 'fms-paid' : info.status === 'partial' ? 'fms-partial' : info.status === 'excused' ? 'fms-excused' : 'fms-due';
      const label  = info.status === 'paid' ? 'PAID' : info.status === 'partial' ? 'PARTIAL' : info.status === 'excused' ? 'EXCUSED' : 'DUE';
      const _shFC  = info.status === 'partial' ? shortByMonthFC[month] : null;
      const detail = _shFC != null
        ? `<div class="fee-month-date" style="color:var(--warn);font-weight:700">₹${fmtNum(_shFC)} left</div>`
        : (info.status !== 'due'
            ? `<div class="fee-month-date">${info.date||''}${info.time ? '<br>'+info.time : ''}</div>`
            : `<div class="fee-month-date" style="color:var(--faint)">—</div>`);
      return `
        <div class="fee-month-cell">
          <div class="fee-month-name">${month.slice(0,3)}</div>
          <div class="fee-month-status ${cls}">${label}</div>
          ${detail}
        </div>`;
    }).join('');

    setContent(`
      <div class="page-head flex-between">
        <div>
          <div class="page-title">Fee Profile Card</div>
          <div class="page-sub">Virtual month-wise payment record — view only</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="history.back()">← Back</button>
          <button class="btn btn-primary btn-sm" onclick="exportFeeCardPDF('${studentId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export PDF
          </button>
        </div>
      </div>

      <div class="fee-card-wrap" id="feeCardContent">
        <!-- Card Header -->
        <div class="fee-card-school">${sanitizeHTML(schoolName)}</div>
        <div class="fee-card-title">Student Fee Profile Card</div>

        <!-- Student Info Grid -->
        <div class="fee-card-meta">
          <div class="fee-card-field">
            <div class="fee-card-lbl">Student Name</div>
            <div class="fee-card-val">${sanitizeHTML(s.name||'—')}</div>
          </div>
          <div class="fee-card-field">
            <div class="fee-card-lbl">Class</div>
            <div class="fee-card-val">${sanitizeHTML(s.class||'—')}</div>
          </div>
          <div class="fee-card-field">
            <div class="fee-card-lbl">Section</div>
            <div class="fee-card-val">${sanitizeHTML(s.section||'—')}</div>
          </div>
          <div class="fee-card-field">
            <div class="fee-card-lbl">Admission No.</div>
            <div class="fee-card-val">${sanitizeHTML(s.admissionNumber||'—')}</div>
          </div>
          <div class="fee-card-field">
          </div>
          <div class="fee-card-field">
            <div class="fee-card-lbl">Academic Year</div>
            <div class="fee-card-val">${academicYear}</div>
          </div>
        </div>

        <div class="fee-card-divider"></div>

        <!-- Month Grid -->
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Fee Option Status</div>  <!-- [CHG-015] Monthly Fee → Fee Option -->

        <div class="fee-card-legend">
          <span><span class="fee-month-status fms-paid" style="padding:2px 7px">PAID</span> Payment confirmed</span>
          <span><span class="fee-month-status fms-partial" style="padding:2px 7px">PARTIAL</span> Partial payment</span>
          <span><span class="fee-month-status fms-due" style="padding:2px 7px">DUE</span> Awaiting payment</span>
          <span><span class="fee-month-status fms-excused" style="padding:2px 7px">EXCUSED</span> Waived by Principal</span>
        </div>

        <div class="fee-month-grid">${monthCells}</div>

        <div class="fee-card-divider"></div>

        <!-- Summary Row -->
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:${legacyCount > 0 ? 14 : 0}px">
          <div style="background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.2);border-radius:8px;padding:10px 16px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:var(--gold-lt)">${paidCount}</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Paid</div>
          </div>
          <div style="background:rgba(212,150,42,0.10);border:1px solid rgba(212,150,42,0.2);border-radius:8px;padding:10px 16px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:var(--warn)">${partialCount}</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Partial</div>
          </div>
          <div style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:8px;padding:10px 16px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:#e09090">${dueCount}</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Due</div>
          </div>
          ${excusedCount > 0 ? `
          <div style="background:rgba(82,200,122,0.10);border:1px solid rgba(82,200,122,0.2);border-radius:8px;padding:10px 16px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:var(--success)">${excusedCount}</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Excused</div>
          </div>` : ''}
          <div style="flex:1;display:flex;align-items:center">
            <div style="font-size:11px;color:var(--muted);line-height:1.5">
              Block: <strong style="color:var(--text)">${sanitizeHTML(s.block||'—')}</strong>
              <!-- [CHG-020] Roll # removed -->
            </div>
          </div>
        </div>

        ${legacyCount > 0 ? `
        <div style="font-size:11px;color:var(--muted);padding:8px 12px;background:rgba(212,150,42,0.08);border:1px solid rgba(212,150,42,0.2);border-radius:8px">
          ⚠️ ${legacyCount} legacy transaction${legacyCount>1?'s':''} found without month tags — recorded before Phase 6 upgrade. These are preserved but not reflected in the month grid above.
        </div>` : ''}
      </div>
    `);
  } catch(e) {
    setContent(`<div class="alert alert-danger">Error loading fee card: ${e.message}</div>`);
  }
}

async function exportFeeCardPDF(studentId) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

    const sDoc = await schoolCol('students').doc(studentId).get();
    const s    = { id: sDoc.id, ...sDoc.data() };

    const txSnap = await schoolCol('feeTransactions').where('studentId','==',studentId).get();
    const txs    = txSnap.docs.map(d=>({id:d.id,...d.data()}));

    const today     = nowIST(); /* ITEM 01 FIX */
    const yearStart = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
    const yearEnd   = yearStart + 1;
    const academicYear = `June ${yearStart} – May ${yearEnd}`;

    const MONTHS = ['June','July','August','September','October','November','December','January','February','March','April','May'];
    const monthMap = {};
    MONTHS.forEach(m => { monthMap[m] = { status:'due', date:null }; });
    txs.forEach(t => {
      const selected = t.monthsSelected;
      const isExcused = t.type === 'excused_waiver';
      const txDate   = t.date?.toDate ? t.date.toDate() : (t.date ? new Date(t.date) : null);
      const dateStr  = txDate ? txDate.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})+', '+txDate.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true}) : '—';
      if (selected && Array.isArray(selected)) {
        selected.forEach(month => {
          if (!monthMap[month]) return;
          if (isExcused) {
            // SYNC FIX (Fix 4): mirror renderFeeCard — excused months get their
            // own status, never displayed as "PAID" in the exported PDF.
            if (monthMap[month].status === 'due') {
              monthMap[month] = { status:'excused', date: dateStr };
            }
          } else if (monthMap[month].status === 'due') {
            monthMap[month] = { status:'paid', date: dateStr };
          } else if (monthMap[month].status !== 'excused') {
            monthMap[month].status = 'partial';
          }
        });
      }
    });

    const schoolName = currentProfile?.schoolName || currentSchoolId || 'School';
    const pageW = 210; const margin = 14;

    // Header
    doc.setFillColor(9, 21, 16);
    doc.rect(0, 0, pageW, 38, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(16); doc.setTextColor(76,175,106);
    doc.text(schoolName, margin, 14);
    doc.setFontSize(9); doc.setTextColor(155,181,160);
    doc.text('Student Fee Profile Card  ·  ' + academicYear, margin, 21);
    doc.setFontSize(8); doc.setTextColor(100,130,110);
    doc.text('Generated: ' + today.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'}) + ', ' + today.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true}), margin, 28);
    doc.text('CONFIDENTIAL', pageW - margin, 28, { align:'right' });

    // Student info
    let y = 46;
    doc.setFillColor(14,28,18);
    doc.roundedRect(margin, y, pageW - margin*2, 28, 3, 3, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(226,242,232);
    doc.text(s.name||'—', margin+4, y+8);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(106,143,115);
    doc.text(`Class: ${s.class||'—'}  |  Section: ${s.section||'—'}  |  Adm#: ${s.admissionNumber||'—'}  |  Block: ${s.block||'—'}`, margin+4, y+16);
    // [CHG-020] Roll # line removed
    y += 28; // was 34 — reduced since Roll # line gone

    // Month grid header
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(76,175,106);
    doc.text('MONTHLY FEE STATUS', margin, y); y += 6;

    // Month grid — 4 columns × 3 rows
    const cellW = (pageW - margin*2) / 4;
    const cellH = 18;
    MONTHS.forEach((month, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x   = margin + col * cellW;
      const cy  = y + row * (cellH + 3);
      const info = monthMap[month];

      // Cell background
      if (info.status === 'paid')    doc.setFillColor(18, 42, 24);
      else if (info.status === 'excused') doc.setFillColor(14, 38, 22);
      else if (info.status==='partial') doc.setFillColor(32, 24, 10);
      else                           doc.setFillColor(24, 14, 14);
      doc.roundedRect(x, cy, cellW-2, cellH, 2, 2, 'F');

      // Month name
      doc.setFont('helvetica','bold'); doc.setFontSize(8);
      doc.setTextColor(155, 181, 160);
      doc.text(month.slice(0,3).toUpperCase(), x + cellW/2 - 1, cy + 5, { align:'center' });

      // Status badge
      if (info.status === 'paid')        { doc.setTextColor(76,175,106); doc.text('PAID',    x + cellW/2 - 1, cy + 10, {align:'center'}); }
      else if (info.status === 'excused'){ doc.setTextColor(82,200,122); doc.text('EXCUSED', x + cellW/2 - 1, cy + 10, {align:'center'}); }
      else if (info.status === 'partial'){ doc.setTextColor(212,150,42); doc.text('PARTIAL', x + cellW/2 - 1, cy + 10, {align:'center'}); }
      else                               { doc.setTextColor(180,80,80);  doc.text('DUE',     x + cellW/2 - 1, cy + 10, {align:'center'}); }

      // Date
      doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(90,120,100);
      doc.text(info.date||'—', x + cellW/2 - 1, cy + 15, { align:'center' });
    });

    y += 3 * (cellH + 3) + 6;

    // Footer
    doc.setDrawColor(45,110,62); doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y); y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(90,120,100);
    doc.text('Powered by Veltrix Campus · Jeelan\'s Software & Solutions · Hyderabad, India', pageW/2, y, {align:'center'});

    doc.save(`FeeCard_${(s.name||'Student').replace(/\s/g,'_')}_${s.admissionNumber||studentId}.pdf`);
    showToast('Fee Card PDF exported successfully.', 'success');
  } catch(e) {
    showToast('PDF export failed: ' + e.message, 'danger');
  }
}

