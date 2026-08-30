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

    // L3: ONE definition of where the academic year starts. _getAcademicYear owns
    // the June boundary; this used to re-derive it, and seven other sites did too.
    // They all agreed, so nothing was broken — but eight copies of a rule means a
    // school moving its year start has eight chances to leave one behind.
    const yearStart = _getAcademicYear().yearStart;
    const yearEnd   = yearStart + 1;
    const academicYear = `June ${yearStart} – May ${yearEnd}`;

    // Build month → paid transactions map
    // monthsSelected array (Phase 6) = authoritative source
    // Legacy transactions counted but not month-mapped
    const MONTHS = ACAD_MONTHS_FULL;
    const monthMap = {}; // month → { status, date, amount, receiptNo }
    MONTHS.forEach(m => { monthMap[m] = { status:'due', date:null, amount:0, receiptNo:null }; });

    // ══════════════════════════════════════════════════════════════════════════
    // THIS CARD IS ONE ACADEMIC YEAR. THE LOOP WAS READING ALL OF THEM.
    //
    // The header says "June 2026 – May 2027" and the grid is twelve months of THAT
    // year, but this loop walked every transaction the student has ever had, with
    // no year filter, and painted prior-year receipts onto it.
    //
    // Live case, ADM-2026-152: PDR-MSZQO4NL is a past-due receipt for December,
    // January, February and March of 2025-26. It was marking December and January
    // PAID on the 2026-27 card, and touching February a second time flipped it to
    // PARTIAL. The card totalled 8 PAID / 1 PARTIAL / 0 DUE — reporting the year
    // as settled while Record Payment, correctly, quoted 1,300 owing on each of
    // December and January.
    //
    // Zero DUE on a year with 3,800 outstanding, and it exports to PDF, so the
    // wrong picture leaves the building.
    //
    // Scoped through the shared _flTxBelongsToYear, the same answer the engine and
    // every other reader uses.
    // ══════════════════════════════════════════════════════════════════════════
    const _cyFC = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    let legacyCount = 0;
    txs.filter(t => _flTxBelongsToYear(t, _cyFC)).forEach(t => {
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

    // Fold in the student-document paid sources (monthStatus + currentYearPaidMonths).
    // Shared with exportFeeCardPDF so the card and its PDF cannot disagree.
    _fcApplyDocPaidSources(monthMap, s);

    const paidCount    = Object.values(monthMap).filter(m=>m.status==='paid').length;
    const partialCount = Object.values(monthMap).filter(m=>m.status==='partial').length;
    const dueCount     = Object.values(monthMap).filter(m=>m.status==='due').length;
    const excusedCount = Object.values(monthMap).filter(m=>m.status==='excused').length;

    const schoolName = currentProfile?.schoolName || currentSchoolId || 'School';

    // ══════════════════════════════════════════════════════════════════════════
    // THE FEE CARD NOW ASKS THE ENGINE. IT NEVER DID BEFORE.
    //
    // "₹X left" on a partial month came from tx.monthShortage — a figure stamped
    // on a receipt when that payment was taken and never revisited. Nothing
    // updates it: not a later payment, not a waiver, not a concession change, and
    // not a DELETE. _syncStudentFinancials rebuilds monthStatus and every balance
    // on the student and deliberately does not rewrite historical transaction
    // documents, because the ledger is append-only.
    //
    // So deleting a top-up left the surviving receipt still describing the world
    // as it was when IT was written, and this card printed that number.
    //
    // partialPaid is what has actually been applied to each month across every
    // REMAINING transaction; rateForMonth is what that month costs, concession
    // included. The remainder is the subtraction, and it cannot go stale because
    // nothing is stored.
    //
    // The register has to be primed first — _flStudentYearOutstanding is
    // synchronous and reads concessions from cache, so without this every month
    // prices at the standard rate and a concession month reports the wrong
    // remainder.
    // ══════════════════════════════════════════════════════════════════════════
    let _engineFC = null;
    try {
      if (typeof _flLoadConcessions === 'function') await _flLoadConcessions();
      // AUDIT: strict, through the shared answer — same as the engine, Due Fee,
      // Rolling Dues and the Profile Card. _cyFC is the one resolved above, so the
      // grid and the remainders are scoped to the same year by construction.
      const _cyTx = txs.filter(t => _flTxBelongsToYear(t, _cyFC));
      _engineFC = _flStudentYearOutstanding(s, _cyTx, _cyFC, { currentYear: _cyFC });
    } catch (e) {
      console.warn('[FEE CARD] engine unavailable, falling back to stored shortfalls: ' +
                   (e && e.message));
    }

    const shortByMonthFC = {};
    if (_engineFC && _engineFC.partialPaid && typeof _engineFC.rateForMonth === 'function') {
      Object.entries(_engineFC.partialPaid).forEach(([m, applied]) => {
        const _r    = Number(_engineFC.rateForMonth(m)) || 0;
        const _left = _r - (Number(applied) || 0);
        if (_left > 0) shortByMonthFC[m] = _left;
      });
    } else {
      // Previous behaviour, kept only for the case where the engine cannot be reached.
      const _txMsFC = t => (t.date?.toMillis ? t.date.toMillis() : (t.date?.seconds ? t.date.seconds*1000 : new Date(t.date||0).getTime())) || 0;
      txs.filter(t => t.monthShortage && typeof t.monthShortage === 'object')
         .sort((a,b) => _txMsFC(a) - _txMsFC(b))
         .forEach(t => { Object.entries(t.monthShortage).forEach(([m, sh]) => { shortByMonthFC[m] = sh; }); });
    }

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

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 3 — DOWNLOADABLE DUES REPORT
// Driven entirely by window._duesReportData, the snapshot renderStudentProfile()
// builds while it renders the year cards — so the PDF can never disagree with
// the figures on screen. Year sections are therefore whatever years actually
// have data for this student: nothing hardcoded, a new academic year appears on
// its own once it has data, and future years are never emitted.
//   downloadDuesReport('2025-26')  → that one year
//   downloadDuesReport('__ALL__')  → every year, one PDF
// ════════════════════════════════════════════════════════════════════════════
function downloadDuesReport(which) {
  const data = window._duesReportData;
  if (!data || !Array.isArray(data.years) || !data.years.length) {
    showToast('Open the student profile first — no dues data loaded.', 'warning');
    return;
  }
  const all  = which === '__ALL__';
  const yrs  = all ? data.years : data.years.filter(y => y.yr === which);
  if (!yrs.length) { showToast(`No dues data for ${which}.`, 'warning'); return; }

  try {
    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const pageW = 210, pageH = 297, margin = 14;
    const st    = data.student;
    const now   = nowIST();
    const stamp = now.toLocaleDateString('en-IN', {timeZone:IST_TZ,day:'2-digit',month:'short',year:'numeric'})
                + ', ' + now.toLocaleTimeString('en-IN', {timeZone:IST_TZ,hour:'2-digit',minute:'2-digit',hour12:true});
    const schoolName = currentProfile?.schoolName || currentSchoolId || 'School';
    const MONTHS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
    const money  = n => 'Rs. ' + Number(n || 0).toLocaleString('en-IN');

    // ── Page header ──
    doc.setFillColor(9, 21, 16);
    doc.rect(0, 0, pageW, 38, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(76,175,106);
    doc.text(schoolName, margin, 14);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(155,181,160);
    doc.text('Student Dues Report  ·  ' + (all ? 'Full History' : which), margin, 21);
    doc.setFontSize(8); doc.setTextColor(100,130,110);
    doc.text('Generated: ' + stamp, margin, 28);
    doc.text('CONFIDENTIAL', pageW - margin, 28, { align:'right' });

    // ── Student block ──
    let y = 48;
    doc.setTextColor(30,30,30); doc.setFont('helvetica','bold'); doc.setFontSize(13);
    doc.text(st.name, margin, y);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(90,90,90);
    y += 6;
    doc.text(`Adm# ${st.admissionNumber}   |   ${st.class} - Section ${st.section}   |   ${st.block}`, margin, y);
    y += 5;
    doc.text(`Parent/Guardian: ${st.parentName}   |   Contact: ${st.contact}`, margin, y);
    y += 8;

    const grandOut = yrs.reduce((s, yy) => s + Number(yy.outstanding || 0), 0);
    const grandPaid = yrs.reduce((s, yy) => s + Number(yy.paid || 0), 0);

    // ── Summary strip ──
    doc.setDrawColor(220,220,220); doc.setFillColor(248,248,248);
    doc.rect(margin, y, pageW - margin*2, 14, 'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(40,40,40);
    doc.text(`Years covered: ${yrs.length}`, margin + 4, y + 6);
    doc.text(`Total paid: ${money(grandPaid)}`, margin + 4, y + 11);
    doc.setTextColor(grandOut > 0 ? 190 : 40, grandOut > 0 ? 60 : 130, 60);
    doc.text(`Total outstanding: ${money(grandOut)}`, pageW - margin - 4, y + 8.5, { align:'right' });
    y += 22;

    // ── One dedicated section per academic year ──
    yrs.forEach(yy => {
      if (y > pageH - 78) { doc.addPage(); y = 20; }   // keep a section intact

      doc.setFillColor(232,240,248);
      doc.rect(margin, y - 5, pageW - margin*2, 9, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(20,60,100);
      doc.text(`${yy.yr} Dues${yy.isCurrent ? '  (current year)' : ''}`, margin + 3, y + 1.5);
      y += 12;

      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
      doc.text(`Monthly fee: ${money(yy.monthlyFee)}`, margin, y);
      doc.text(`Paid: ${money(yy.paid)}`, margin + 60, y);
      if (yy.excused > 0) doc.text(`Excused: ${money(yy.excused)}`, margin + 105, y);
      doc.setFont('helvetica','bold');
      doc.setTextColor(yy.outstanding > 0 ? 190 : 30, yy.outstanding > 0 ? 60 : 130, 60);
      doc.text(`Outstanding: ${money(yy.outstanding)}`, pageW - margin, y, { align:'right' });
      y += 7;

      // Month grid — 12 equal cells with status underneath
      const cellW = (pageW - margin*2) / 12;
      doc.setFontSize(7);
      MONTHS.forEach((m, i) => {
        const x = margin + i * cellW;
        const sVal = (yy.months && yy.months[m]) || 'DUE';
        doc.setDrawColor(215,215,215); doc.setFillColor(252,252,252);
        doc.rect(x, y, cellW, 11, 'FD');
        doc.setFont('helvetica','bold'); doc.setTextColor(70,70,70);
        doc.text(m, x + cellW/2, y + 4, { align:'center' });
        if      (sVal === 'PAID')    doc.setTextColor(30,130,60);
        else if (sVal === 'PARTIAL') doc.setTextColor(200,140,20);
        else if (sVal === 'EXCUSED') doc.setTextColor(70,120,180);
        else                          doc.setTextColor(200,60,60);
        doc.setFontSize(5.5);
        doc.text(sVal, x + cellW/2, y + 8.6, { align:'center' });
        doc.setFontSize(7);
      });
      y += 16;

      // Payments for this year
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(40,40,40);
      doc.text('Payments recorded', margin, y); y += 5;
      if (!yy.txList.length) {
        doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(130,130,130);
        doc.text('No payments recorded for this year.', margin + 2, y); y += 7;
      } else {
        doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(90,90,90);
        doc.text('Receipt', margin + 2, y); doc.text('Amount', margin + 46, y);
        doc.text('Months', margin + 74, y);  doc.text('Date', margin + 134, y);
        doc.text('Mode', margin + 162, y);
        y += 1.5; doc.setDrawColor(210,210,210); doc.line(margin, y, pageW - margin, y); y += 4;
        doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50);
        // DATA-INTEGRITY FIX: these cells used hardcoded character slices
        // (receipt 22 / months 34 / mode 16), which SILENTLY DROPPED content — a receipt
        // covering "December, January, February, March, April, May" (46 chars) printed as
        // "December, January, February, March", losing April and May, so the exported PDF
        // contradicted the same receipt shown in the profile. A financial document must never
        // truncate. Wrap to the real column width instead and grow the row, so every month,
        // the full receipt number and the full mode string always appear in full.
        const _colX = { receipt: margin + 2, amount: margin + 46, months: margin + 74, date: margin + 134, mode: margin + 162 };
        const _colW = { receipt: 42,         months: 58,          mode: 20 };
        yy.txList.forEach(t => {
          const _rcp = doc.splitTextToSize(String(t.receipt), _colW.receipt);
          const _mon = doc.splitTextToSize(String(t.months),  _colW.months);
          const _mod = doc.splitTextToSize(String(t.mode),    _colW.mode);
          const _lines = Math.max(_rcp.length, _mon.length, _mod.length, 1);
          const _rowH  = _lines * 3.9;
          if (y + _rowH > pageH - 20) { doc.addPage(); y = 20; }
          doc.text(_rcp, _colX.receipt, y);
          doc.text(money(t.amount), _colX.amount, y);
          doc.text(_mon, _colX.months, y);
          doc.text(String(t.date), _colX.date, y);
          doc.text(_mod, _colX.mode, y);
          y += _rowH + 0.9;
        });
        y += 3;
      }
      y += 4;
    });

    // ── Footer on every page ──
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(140,140,140);
      doc.text(`${schoolName}  ·  Dues Report  ·  ${st.name} (${st.admissionNumber})`, margin, pageH - 8);
      doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 8, { align:'right' });
    }

    const safeName = String(st.name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Student';
    doc.save(`Dues_${safeName}_${st.admissionNumber}_${all ? 'FullHistory' : which.replace(/[^0-9A-Za-z-]/g,'')}.pdf`);
    showToast(all ? `Full dues history downloaded (${yrs.length} year${yrs.length!==1?'s':''}).` : `${which} dues report downloaded.`, 'success');
  } catch (e) {
    console.error('ITEM 3: dues report failed:', e);
    showToast('Could not generate the dues report: ' + e.message, 'danger');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Student-document paid sources, applied on top of a transaction-derived month map.
// ONE implementation shared by renderFeeCard and exportFeeCardPDF — previously the
// card applied monthStatus while the PDF applied nothing, so the exported card
// disagreed with the card on screen; and NEITHER honoured currentYearPaidMonths,
// which every other surface (Profile Card, Record Payment, Due Fee, Concession)
// already respects. Those are months marked paid during "Onboard Existing Student"
// that have NO feeTransaction at all, so a transaction-only view calls them DUE
// even though they are genuinely paid.
//
//   monthStatus           — the sync-maintained grid. Applied ONLY when it describes
//                           the current academic year: a carry-over student's grid
//                           belongs to their previous year and must not leak into
//                           this year's card (same rule as record-payment's
//                           MONTHSTATUS-FIX).
//   currentYearPaidMonths — paid at onboarding; only upgrades a month still reading
//                           'due', so it can never overwrite a real payment or an
//                           excused waiver.
// ════════════════════════════════════════════════════════════════════════════
function _fcApplyDocPaidSources(monthMap, s) {
  if (!monthMap || !s) return monthMap;
  const S2F = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',
               Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};
  const curAY = _normaliseAcademicYear(_getCurrentAcademicYearStr());

  if (s.monthStatus && typeof s.monthStatus === 'object' &&
      _normaliseAcademicYear(s.academicYear) === curAY) {
    Object.entries(s.monthStatus).forEach(([k, st]) => {
      const full = S2F[k] || k;
      if (!monthMap[full] || monthMap[full].status === 'excused') return;
      const S = (st || '').toUpperCase();
      if (S === 'N/A-PAID' || S === 'PAID') monthMap[full].status = 'paid';
      else if (S === 'PARTIAL') monthMap[full].status = 'partial';
      else if (S === 'EXCUSED') monthMap[full].status = 'excused';
    });
  }

  if (Array.isArray(s.currentYearPaidMonths) &&
      (!s.currentYearDueYear || _normaliseAcademicYear(s.currentYearDueYear) === curAY)) {
    s.currentYearPaidMonths.forEach(m => {
      const full = S2F[m] || m;
      if (monthMap[full] && monthMap[full].status === 'due') monthMap[full].status = 'paid';
    });
  }
  return monthMap;
}

async function exportFeeCardPDF(studentId) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

    const sDoc = await schoolCol('students').doc(studentId).get();
    const s    = { id: sDoc.id, ...sDoc.data() };

    const txSnap = await schoolCol('feeTransactions').where('studentId','==',studentId).get();
    const txs    = txSnap.docs.map(d=>({id:d.id,...d.data()}));

    const today     = nowIST();                       // still needed for the PDF footer
    const yearStart = _getAcademicYear().yearStart;   // L3: one definition
    const yearEnd   = yearStart + 1;
    const academicYear = `June ${yearStart} – May ${yearEnd}`;

    const MONTHS = ACAD_MONTHS_FULL;
    const monthMap = {};
    MONTHS.forEach(m => { monthMap[m] = { status:'due', date:null }; });
    // Same year scoping as renderFeeCard — this export is the same one academic
    // year, and it was painting prior-year past-due receipts onto it. The comment
    // below promises the PDF mirrors the screen; that only holds if both filter.
    const _cyPDF = _normaliseAcademicYear(_getCurrentAcademicYearStr());
    txs.filter(t => _flTxBelongsToYear(t, _cyPDF)).forEach(t => {
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

    // Apply the SAME student-document paid sources the on-screen card applies, so the
    // exported PDF mirrors it exactly. Without this the PDF was transaction-only and
    // reported genuinely-paid months (sync-maintained or paid at onboarding) as DUE.
    _fcApplyDocPaidSources(monthMap, s);

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

