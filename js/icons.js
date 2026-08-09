/* ============================================================
   SVG ICONS
   ============================================================ */
const iconDashboard =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const iconConcession=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
const iconStudents  =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const iconFee       =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
const iconFinance   =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
const iconAcademic  =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
const iconTerminated=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
const iconHidden    =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const iconApprovals =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
const iconProfile   =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const iconPromotions=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 21 7 17 3"/><line x1="21" y1="7" x2="9" y2="7"/><polyline points="7 21 3 17 7 13"/><line x1="15" y1="17" x2="3" y2="17"/></svg>`;
const iconPlus      =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const iconFeeStructure=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h10M7 12h6"/></svg>`;
const iconPendingFee=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
const iconPastDue   =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
const iconExcused   =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
const iconFeeOnboarding=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;

// ── PDF RECEIPT ENGINE ────────────────────────────────────────────────────
// Shared by printReceipt() and printDueReceipt().
// Requires jsPDF + jspdf-autotable (already loaded via CDN in <head>).
function generateIndustryStandardReceipt(txData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // --- PREMIUM FINTECH COLOR PALETTE ---
  const PRIMARY_COLOR = [26, 36, 43];      // Deep Royal Navy Slate
  const ACCENT_COLOR  = [41, 128, 185];    // Crisp Corporate Slate Blue
  const TEXT_DARK     = [50, 55, 60];      // Sharp Charcoal for Content
  const TEXT_MUTED    = [130, 135, 140];   // Clean Slate Gray for Subtext
  const BG_LIGHT      = [245, 247, 250];   // Premium Light Background

  // --- 1. MINIMALIST TOP BAR ACCENT ---
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, 210, 6, 'F'); // Ultra-thin clean executive upper edge

  // --- 2. HEADER BRANDING ---
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text("VELTRIX CAMPUS", 15, 22);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Automated Institutional Fee Management & Ledgers", 15, 27);

  // --- 3. OFFICIAL RECEIPT BADGE (CLEAN MINIMALIST LAYOUT) ---
  doc.setFillColor(...BG_LIGHT);
  doc.rect(135, 14, 60, 15, 'F');
  doc.setDrawColor(...ACCENT_COLOR);
  doc.setLineWidth(0.6);
  doc.line(135, 14, 135, 29); // Sharp left accent boundary line

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text("OFFICIAL RECEIPT", 140, 20);
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`ID: ${txData.receiptNumber || '—'}`, 140, 25);

  // Clean structure separator line
  doc.setDrawColor(230, 235, 240);
  doc.setLineWidth(0.4);
  doc.line(15, 34, 195, 34);

  // --- 4. METADATA TWO-COLUMN BALANCED SYSTEM ---
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...ACCENT_COLOR);
  doc.text("STUDENT PROFILE", 15, 41);
  doc.text("TRANSACTION ACCOUNTABILITY", 115, 41);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_DARK);

  // Left Column (Student Meta Vector)
  doc.text(`Student Name  :  ${txData.studentName   || '—'}`, 15, 48);
  doc.text(`Admission No  :  ${txData.admissionNo   || '—'}`, 15, 54);
  doc.text(`Class & Section:  ${txData.classSection || '—'}`, 15, 60);

  // Right Column (Transaction Meta Vector)
  doc.text(`Payment Date  :  ${txData.date          || '—'}`, 115, 48);
  doc.text(`Payment Method:  ${txData.paymentMode   || '—'}`, 115, 54);
  doc.text(`Status        :  ${(txData.paymentStatus || 'COMPLETED').toUpperCase()}`, 115, 60);
  if (txData.academicYear) {
    doc.text(`Academic Year :  ${txData.academicYear}`, 115, 66);
  }

  // --- 5. AUTOMATED BALANCED INVOICE TABLE ---
  const tableHeaders = txData.hideRemainingBalance
    ? [["Sr.", "Fee Particulars / Ledger Classification", "Amount Paid"]]
    : [["Sr.", "Fee Particulars / Ledger Classification", "Amount Paid", "Remaining Balance"]];
  const tableRows = [txData.hideRemainingBalance
    ? ["1", txData.feeHead || "Academic Program Fee Collection", `INR ${parseFloat(txData.amountPaid || 0).toLocaleString('en-IN')}.00`]
    : ["1", txData.feeHead || "Academic Program Fee Collection", `INR ${parseFloat(txData.amountPaid || 0).toLocaleString('en-IN')}.00`, `INR ${parseFloat(txData.remainingBalance || 0).toLocaleString('en-IN')}.00`]
  ];

  doc.autoTable({
    startY: txData.academicYear ? 74 : 68,
    head: tableHeaders,
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      font: 'Helvetica',
      fontStyle: 'bold',
      fontSize: 9.5,
      halign: 'left'
    },
    styles: {
      font: 'Helvetica',
      fontSize: 9,
      cellPadding: 4,
      textColor: TEXT_DARK,
      lineColor: [230, 235, 240],
      lineWidth: 0.2
    },
    columnStyles: txData.hideRemainingBalance
      ? { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 140 }, 2: { cellWidth: 40, fontStyle: 'bold', halign: 'right' } }
      : { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 100 }, 2: { cellWidth: 40, fontStyle: 'bold', halign: 'right' }, 3: { cellWidth: 40, halign: 'right' } }
  });

  // --- 6. ACCUMULATED LEDGER NET TOTALS ---
  let finalY = doc.lastAutoTable.finalY + 8;

  doc.setFillColor(...BG_LIGHT);
  doc.rect(115, finalY, 80, 14, 'F');

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text("Net Paid Amount:", 120, finalY + 8.5);
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT_COLOR);
  // "INR", not the rupee sign. jsPDF's built-in Helvetica is WinAnsi-encoded and has
  // no U+20B9 glyph, so it substituted the nearest byte and this line printed as
  // "¹0.00" on every receipt ever downloaded. The invoice table above already used
  // the INR prefix for exactly this reason; this one line was missed.
  doc.text(
    `INR ${parseFloat(txData.amountPaid || 0).toLocaleString('en-IN')}.00`,
    190, finalY + 8.5,
    { align: 'right' }
  );

  // --- 7. SECURITY & SIGNATURE SYSTEM FOOTER ---
  const footerY = 275;
  doc.setDrawColor(230, 235, 240);
  doc.line(15, footerY - 12, 195, footerY - 12);

  doc.setFont("Helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `Secure system transaction copy generated on: ${new Date().toLocaleString('en-IN', {timeZone:IST_TZ})}`,
    15, footerY - 2
  );

  doc.line(145, footerY - 5, 195, footerY - 5);
  doc.setFont("Helvetica", "normal");
  doc.text("Authorized Representative Stamp", 147, footerY);

  doc.save(`Veltrix_Receipt_${txData.receiptNumber || 'TX'}.pdf`);
}


// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// GLOBAL REMAINING BALANCE BANNER (Fix #2)
// Shared helper — called by Record Payment, Past Due, and Excused Section
// after a student is selected. Fetches all feeTransactions for the student,
// groups by academicYear, takes the latest remainingBalance per year, and
// renders a prominent coloured card into the target element.
// ════════════════════════════════════════════════════════════════


// ARC-015 — PAST DUE RECORDING MODULE
// Dedicated module for clearing dues from PREVIOUS academic years.
// Students are explicitly selected (ARC-013 process lock enforced).
// Class is auto-populated and locked from enrollment history (BUG-009 pattern).
// ════════════════════════════════════════════════════════════════
window._pastDueState = {};

// ITEM-9(a) FIX / ITEM-10 FIX: Grade/Class must reflect the SELECTED academic year,
// not just the student's current class. Delegates to the single shared resolver
// (_resolveClassForYear) so every module computes this identically — previously
// each module derived it independently, which was itself a symptom of the Item-10
// cross-module synchronization root cause.
function _pastDueClassForYear(s, selectedYear) {
  return _resolveClassForYear(s, selectedYear);
}

function renderPastDue(params = {}) {
  setActiveNav('pastDue');
  const iconPastDue = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
  setContent(`
    <div class="page-head flex-between">
      <div>
        <div class="page-title" style="display:flex;align-items:center;gap:10px">
          ${iconPastDue.replace('stroke="currentColor"','stroke="var(--warn)"')}
          Record Previous Year Dues
        </div>
        <div class="page-sub">Clear outstanding dues from any academic year — including <strong>2024-25</strong> and <strong>2025-26</strong>.</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">

      <!-- LEFT: Student Search + Year/Month Selection -->
      <div class="card">
        <div class="card-hdr"><span class="card-title">Payment Details</span></div>
        <div class="card-body">
          <div id="pastDueAlert"></div>

          <!-- ARC-013: Process lock — student must be explicitly selected -->
          <div class="form-group">
            <label class="form-label">Search Student *</label>
            <input class="form-control" id="pastDueSearch" placeholder="Name or Admission Number" oninput="_pastDueSearch(this.value)" autocomplete="off">
            <div id="pastDueResults" style="background:var(--lifted);border:1px solid var(--border);border-radius:8px;margin-top:4px;display:none;max-height:180px;overflow-y:auto"></div>
          </div>

          <!-- ARC-013: Lock notice -->
          <div id="pastDueLockNotice" style="padding:10px 14px;background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:var(--rad);font-size:12px;color:#e09090;margin-bottom:14px">
            🔒 Select a student above to unlock the form.
          </div>

          <div id="pastDueForm" style="pointer-events:none;opacity:0.4">

            <!-- Student info badge -->
            <div id="pastDueStudentInfo" style="display:none" class="alert alert-success"></div>
            <!-- Year Balance Banner (Fix #2) -->
            <!-- Point 10: Context-aware previous-year dues banner -->
            <div id="_pastDueCtxBanner" style="display:none;margin-bottom:10px;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border-lt);font-size:12px"></div>

            <!-- Academic Year selector -->
            <div class="form-group">
              <label class="form-label">Academic Year *</label>
              <select class="form-control" id="pastDueYear" onchange="_pastDueYearChange()">
                <option value="">Select academic year</option>
              </select>
            </div>

            <!-- Class — auto-locked (BUG-009 pattern) -->
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;gap:8px">
                Class
                <span style="font-size:10px;font-weight:400;color:var(--warn);text-transform:none;background:rgba(212,150,42,0.12);padding:2px 8px;border-radius:4px">🔒 Auto-detected</span>
              </label>
              <input class="form-control" id="pastDueClass" readonly placeholder="Auto-filled from enrollment" style="background:var(--depth);cursor:not-allowed;color:var(--gold-lt);font-weight:600">
            </div>

            <!-- Month grid -->
            <div class="form-group">
              <label class="form-label">Select Month(s) to Clear *</label>
              <div id="pastDueMonthGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px">
                ${['June','July','August','September','October','November','December','January','February','March','April','May'].map(m=>`
                  <button type="button" class="month-pill" data-month="${m}" onclick="_pastDueToggleMonth(this)" style="
                    padding:8px 4px;border-radius:8px;border:1px solid var(--glass-border);
                    background:rgba(0,0,0,0.30);backdrop-filter:blur(4px);
                    color:var(--muted);font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;
                    cursor:pointer;transition:all 0.15s ease;text-align:center">
                    ${m.slice(0,3)}</button>`).join('')}
              </div>
              <div id="pastDueMonthHint" style="font-size:11px;color:var(--muted);margin-top:7px">Select academic year first, then choose months.</div>
            </div>

            <!-- Amount — auto-calculated, locked -->
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;gap:8px">
                Amount (₹)
                <span style="font-size:10px;font-weight:400;color:var(--warn);text-transform:none;background:rgba(212,150,42,0.12);padding:2px 8px;border-radius:4px">🔒 Auto-calculated</span>
              </label>
              <input type="number" class="form-control" id="pastDueAmount" readonly placeholder="Select student + months" style="background:var(--depth);color:var(--gold-lt);font-weight:700;cursor:not-allowed">
            </div>

            <!-- JSS-REF-VELTRIX-2026-004 ITEM 06: opt-in partial payment for previous-year dues.
                 Off → clear the selected months in full. On → the collected amount may be short;
                 _pastDueSave allocates it oldest-first via the shared _allocateFeePayment. -->
            <div class="form-group" style="margin-top:-2px">
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--silver-lt);cursor:pointer;font-weight:600">
                <input type="checkbox" id="pastDuePartialToggle" onchange="_pastDuePartialToggleChanged()" style="width:15px;height:15px;accent-color:var(--warn);cursor:pointer">
                Accept a partial (short) payment
              </label>
              <div style="font-size:10px;color:var(--muted);margin-top:3px;line-height:1.5">Leave unchecked to clear the selected months in full. When checked, enter the <strong>amount actually collected</strong> below — earlier months clear first and the boundary month is recorded as <span style="color:var(--warn);font-weight:700">PARTIAL</span> with its balance shown (topped up first next time).</div>
              <div id="pastDueCollectedWrap" style="display:none;margin-top:8px">
                <label class="form-label" style="font-size:12px;display:flex;align-items:center;gap:8px">Amount Collected (₹)
                  <span style="font-size:10px;font-weight:400;color:var(--warn);text-transform:none">may be less than the total payable</span></label>
                <input type="number" class="form-control" id="pastDueCollectedAmount" min="0" step="1" oninput="_pastDueUpdatePartialHint(); if(typeof _updateSplitPaymentSummary==='function')_updateSplitPaymentSummary()" style="font-weight:700;color:var(--warn);border-color:rgba(212,150,42,0.4)">
                <div id="pastDuePartialHint" style="font-size:11px;color:var(--muted);margin-top:5px"></div>
              </div>
            </div>

            <!-- JSS-REF-013 FEATURE: Split Payment Support (Multi-Mode Single Transaction)
                 Reuses the same mode-wise breakup component as Record Payment so a previous-year
                 due can also be cleared across multiple modes (part Cash, part UPI, etc). -->
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;gap:8px">
                Payment Mode *
                <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;margin-left:0">Split across multiple modes if needed</span>
              </label>
              <div id="splitPaymentRows"></div>
              <button type="button" class="btn btn-ghost btn-sm" onclick="_addSplitPaymentRow()" style="margin-top:4px;font-size:11px">+ Add Payment Mode</button>
              <div id="splitPaymentHint" style="font-size:11px;margin-top:7px"></div>
            </div>

            <!-- Date -->
            <div class="form-group">
              <label class="form-label">Payment Date *</label>
              <input type="date" class="form-control" id="pastDueDate" value="${(()=>{const _d=nowIST();return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;})() /* BUG-TS-001 FIX */}" readonly style="background:var(--depth);cursor:not-allowed;color:var(--gold-lt);font-weight:600;border-color:rgba(212,150,42,0.3)">
              <div style="font-size:11px;color:var(--muted);margin-top:4px">🔒 Auto-set to today's date — read-only</div>
            </div>

            <button class="btn btn-primary btn-full" id="pastDueSaveBtn" onclick="_pastDueSave()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
              Record Past Due Payment
            </button>
          </div>
        </div>
      </div>

      <!-- RIGHT: Receipt preview -->
      <div>
        <div id="pastDueHelpCard" class="card" style="margin-bottom:16px">
          <div class="card-body" style="font-size:13px;color:var(--muted);line-height:1.8">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:var(--gold-lt);margin-bottom:8px">Record Previous Year Dues</div>
            <div style="margin-bottom:8px">Use this module to clear outstanding monthly dues from <strong style="color:var(--text)">previous academic years</strong>.</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;gap:8px"><span style="color:var(--gold-lt);font-weight:700">1</span> Search and select the student</div>
              <div style="display:flex;gap:8px"><span style="color:var(--gold-lt);font-weight:700">2</span> Choose the previous academic year</div>
              <div style="display:flex;gap:8px"><span style="color:var(--gold-lt);font-weight:700">3</span> Select the due months to clear</div>
              <div style="display:flex;gap:8px"><span style="color:var(--gold-lt);font-weight:700">4</span> Confirm payment mode and date</div>
            </div>
            <div style="margin-top:12px;padding:10px;background:rgba(224,82,82,0.08);border-radius:8px;border:1px solid rgba(224,82,82,0.2);color:#e09090;font-size:12px">
              ⚠️ This module is for <strong>previous year dues only</strong>. For current year dues, use <strong>Record Payment</strong>.
            </div>
          </div>
        </div>

        <!-- Receipt -->
        <div id="pastDueReceiptBox" class="receipt-box" style="display:none">
          <div class="receipt-hdr">
            <div class="receipt-logo">VELTRIX CAMPUS</div>
            <div id="pastDueReceiptSchool" class="receipt-sub"></div>
            <div class="receipt-title">PAST DUE PAYMENT RECEIPT</div>
          </div>
          <div class="receipt-grid">
            <div id="pdr_student"></div>
            <div id="pdr_details"></div>
          </div>
          <div id="pdr_total" class="receipt-total"></div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
            <button class="btn btn-secondary btn-sm" onclick="_pastDuePrint()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  `);

  // Set today's date
  const t = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  const mm = String(t.getMonth()+1).padStart(2,'0');
  const dd = String(t.getDate()).padStart(2,'0');
  document.getElementById('pastDueDate').value = `${t.getFullYear()}-${mm}-${dd}`;

  // JSS-REF-013 FEATURE: Split Payment — bind the shared component to this
  // module's own auto-calculated amount field, then start with a single row.
  window._splitPayAmountFieldId = 'pastDueAmount';
  _resetSplitPaymentRows();

  // Reset state
  window._pastDueState = { student: null, selectedMonths: [] };
  _pastDueLock(true);
}

function _pastDueLock(locked) {
  // ARC-013: Delegate to shared framework-level utility
  _workflowLock('pastDueForm', locked);
  const notice = document.getElementById('pastDueLockNotice');
  if (notice) notice.style.display = locked ? 'block' : 'none';
}

let _pastDueDebounce = null;
function _pastDueSearch(q) {
  clearTimeout(_pastDueDebounce);
  // ARC-013: any keystroke re-locks until explicit selection
  window._pastDueState.student = null;
  _pastDueLock(true);
  q = (q||'').trim();
  if (q.length < 2) { document.getElementById('pastDueResults').style.display='none'; return; }
  // BUG-⑦ FIX: Guard against null currentSchoolId — getStudentCache() builds a path
  // from currentSchoolId. If it's null the collection path is invalid and the query
  // silently returns nothing. Bail early with a visible hint instead.
  if (!currentSchoolId) {
    const el = document.getElementById('pastDueResults');
    if (el) { el.style.display='block'; el.innerHTML='<div class="s-item" style="color:var(--warn)">School not loaded — please refresh.</div>'; }
    return;
  }
  _pastDueDebounce = setTimeout(async () => {
    const all  = await getStudentCache();
    const lq   = q.toLowerCase();
    const hits = all.filter(s =>
      (s.name||'').toLowerCase().includes(lq) ||
      (s.admissionNumber||'').toLowerCase().includes(lq)
    ).slice(0,8);
    const el = document.getElementById('pastDueResults');
    if (!hits.length) { el.style.display='none'; return; }
    el.style.display = 'block';
    el.innerHTML = hits.map(s=>`
      <div class="s-item" onclick="_pastDuePick('${s.id}')">
        <div class="s-name">${sanitizeHTML(s.name)}</div>
        <div class="s-meta">Adm# ${sanitizeHTML(s.admissionNumber||'—')} · ${sanitizeHTML((s.class||s.cls||''))} ${sanitizeHTML(s.section||'')}</div>
      </div>`).join('');
  }, 300);
}

async function _pastDuePick(sid) {
  document.getElementById('pastDueResults').style.display = 'none';
  let list = [];
  try { list = await getStudentCache(); } catch(_) {}
  const s = list.find(x => x.id === sid);
  if (!s) return;

  window._pastDueState.student = s;
  window._pastDueState.selectedMonths = [];

  // JSS-REF-013: fresh student selection means a fresh payment allocation.
  if (typeof _resetSplitPaymentRows === 'function' && document.getElementById('splitPaymentRows')) {
    window._splitPayAmountFieldId = 'pastDueAmount';
    _resetSplitPaymentRows();
  }

  // Show student info badge
  const infoEl = document.getElementById('pastDueStudentInfo');
  if (infoEl) {
    infoEl.style.display = 'block';
    infoEl.innerHTML = `Student: <strong>${sanitizeHTML(s.name)}</strong> · ${sanitizeHTML((s.class||s.cls||''))} ${sanitizeHTML(s.section||'')} · Adm# ${sanitizeHTML(s.admissionNumber||'—')}`;
  }
  document.getElementById('pastDueSearch').value = s.name || '';

  // Fix #2: Show remaining balance by academic year

  // Point 10: Show previous-year outstanding dues context banner
  // BUG-FIX (VLX012→VLX013): s.outstandingBalance is COMBINED (all years) for two-year
  // import students. Show a per-year breakdown instead so the clerk sees exact amounts.
  const _pdCtxEl = document.getElementById('_pastDueCtxBanner');
  if (_pdCtxEl) {
    _pdCtxEl.style.display = 'block';
    const _normYrBanner = y => {
      if (!y) return '';
      const s2 = String(y).trim().replace(/[–—]/g, '-');
      const m  = s2.match(/^(\d{4})-(\d{2,4})$/);
      if (!m) return s2;
      return m[1] + '-' + (m[2].length === 4 ? m[2].slice(2) : m[2]);
    };

    // Build per-year balance map from all sources on the student doc
    const _bannerYearMap = {};
    // BUG-BANNER-FIX: Only show PREVIOUS years in this banner — current academic year
    // must NOT appear here because Record Payment handles current year dues.
    const _currentAcadYrNorm = _normYrBanner(_getCurrentAcademicYearStr());
    // Source 1: two-year Excel import — newer year (skip if it's current year)
    const _sDocYear = _normYrBanner(s.academicYear);
    const _monthlyFeeB = s.monthlyFee || 0;
    // JSS-REF-VELTRIX-2026-004 ITEM 06: fetch this student's transactions ONCE so the grid-based
    // sources below can make a PARTIAL month contribute its remainder (rate − applied), derived
    // live from the tx allocation ledger — the academicYear/monthStatus & prev-grid paths carry no
    // stored monthShortage. Reused by the ITEM-9(c) cross-check too (one read, not several).
    let _allTxB = [];
    try { _allTxB = (await schoolCol('feeTransactions').where('studentId','==',s.id).get()).docs.map(d => d.data()); } catch(_) { _allTxB = []; }
    const _yrTxB = yrNorm => _allTxB.filter(t => _normYrBanner(t.academicYear) === yrNorm);
    if (_sDocYear && _sDocYear !== _currentAcadYrNorm) {
      // BUG-ITEM9C-FALSEDUE FIX (Source 1 counterpart): a monthStatus grid that
      // EXISTS and confidently shows zero DUE months (every month N/A-PAID,
      // including ones marked paid directly at import with no feeTransactions
      // doc) means this year is genuinely cleared. The balance-subtraction
      // fallback (outstandingBalance − previousDues) is only trustworthy when
      // there's no grid at all to answer from — using it whenever the grid
      // computes to 0 re-derives a stale/incorrect combined figure and shows a
      // due that contradicts the fully-paid grid the clerk can see on screen.
      // Partial-aware: PARTIAL months add their remainder (rate − applied, from the tx ledger),
      // via the contract-tested _flOpeningDuesOutstanding — a fully-N/A-PAID grid still reads a
      // confident 0, and an empty grid falls back to (outstandingBalance − previousDues).
      const _sDocShort = _flPartialShortFromTxs(s.monthStatus, _yrTxB(_sDocYear), _monthlyFeeB);
      const _newerAmt = _flOpeningDuesOutstanding(
        { monthStatus: s.monthStatus, monthShortage: _sDocShort,
          amount: Math.max(0, (s.outstandingBalance || 0) - (s.previousDues || 0)) },
        _monthlyFeeB);
      if (_newerAmt > 0) _bannerYearMap[_sDocYear] = (_bannerYearMap[_sDocYear] || 0) + _newerAmt;
    }
    // Source 2: older year from Excel import (previousAcademicYear / previousYearMonthStatus)
    // BUG-COMBINED-PREVDUES FIX: s.previousDues is a COMBINED figure across every
    // past year (verified against live data: 8500 = 5100 owed for 2024-25 PLUS
    // 3400 owed for 2025-26, added together) — not this single year's own amount.
    // Dumping it whole under previousAcademicYear double-counted the 2025-26
    // portion that Source 1 already adds separately. Derive this year's own
    // amount from its own grid (previousYearMonthStatus DUE count), same pattern
    // as Source 1, and only fall back to previousDues if that grid is empty.
    const _prevYrB = _normYrBanner(s.previousAcademicYear);
    if (_prevYrB && _prevYrB !== _currentAcadYrNorm) {
      const _prevRateB = _flRateForClass(s.classPrev || s.openingOutstandingClass || s.class || s.cls, _monthlyFeeB);   // L2/L8
      // Partial-aware (same as Source 1): PARTIAL months add their remainder from the tx ledger.
      const _prevShort = _flPartialShortFromTxs(s.previousYearMonthStatus, _yrTxB(_prevYrB), _prevRateB);
      const _prevAmt = _flOpeningDuesOutstanding(
        { monthStatus: s.previousYearMonthStatus, monthShortage: _prevShort, amount: (s.previousDues || 0) },
        _prevRateB);
      if (_prevAmt > 0) _bannerYearMap[_prevYrB] = (_bannerYearMap[_prevYrB] || 0) + _prevAmt;
    }
    // Source 3: openingOutstandingDues[] — multi-year manual onboarding (skip current year)
    // BUG-PDR-AMOUNT-DRIFT FIX: derive each year's outstanding LIVE from its own
    // monthStatus DUE-count grid (same pattern as Source 2 above), NOT the stored
    // d.amount scalar. _pastDueSave() decrements the entry's monthStatus grid on
    // every payment but never rewrites d.amount, so trusting the scalar re-inflated
    // the balance back to its onboarding value on every subsequent payment/view.
    // Fall back to d.amount only when the entry carries no grid at all to answer from.
    if (Array.isArray(s.openingOutstandingDues)) {
      s.openingOutstandingDues.forEach(d => {
        if (!d.year) return;
        const _ky = _normYrBanner(d.year);
        if (_ky === _currentAcadYrNorm) return;
        const _dRate = _flRateForClass(d.class || s.class || s.cls, _monthlyFeeB || 0);   // L2/L8
        // grid-derived, never the stale scalar — shared helper (see _flOpeningDuesOutstanding
        // in pending-fee.js; contract-tested by past_due_outstanding_tracks_grid_not_stale_scalar).
        const _dAmt = _flOpeningDuesOutstanding(d, _dRate);
        if (_dAmt > 0) _bannerYearMap[_ky] = (_bannerYearMap[_ky] || 0) + _dAmt;
      });
    }
    // Source 4: single-year manual onboarding fallback (skip current year)
    // BUG-SRC4-DOUBLECOUNT FIX: outstandingBalance is the student's TOTAL balance
    // across every tracked year, not this specific opening year's own amount. When
    // Source 1 (s.academicYear) has already correctly claimed that total for a
    // DIFFERENT, newer year, this fallback used to still grab the same total and
    // stick it on openingOutstandingYear too — double-showing one real due under
    // two year labels.
    // BUG-SRC4-FIELDNAME + robust grid-derived variant: the opening year
    // (openingOutstandingYear) pairs with prevYearMonthStatus, NOT previousYearMonthStatus (which
    // pairs with previousAcademicYear — see students.js Source B/C ~L1061/1082). Compute this
    // year's own outstanding the SAME way Source 2 / Source 3 do — its grid's DUE-count × the
    // opening-class rate — reusing the contract-tested _flOpeningDuesOutstanding helper. It returns
    // the grid-derived amount when prevYearMonthStatus has data (0 for a fully-paid year, so the
    // stale TOTAL outstandingBalance is never mislabelled here), and falls back to the scalar
    // (previousDues / outstandingBalance) ONLY when there is genuinely no grid at all — so a real
    // unpaid legacy opening year is shown, never silently hidden. The !_bannerYearMap guard still
    // prevents double-counting a year Source 2 already claimed.
    const _openingYrB = _normYrBanner(s.openingOutstandingYear);
    if (_openingYrB && _openingYrB !== _currentAcadYrNorm && !_bannerYearMap[_openingYrB]) {
      const _openRateB   = _flRateForClass(s.openingOutstandingClass, _monthlyFeeB || 0);   // L2/L8
      const _openScalarB = s.previousDues > 0 ? s.previousDues : (s.outstandingBalance || 0);
      // Partial-aware (same as Source 1/2): PARTIAL months add their remainder from the tx ledger.
      const _openShort   = _flPartialShortFromTxs(s.prevYearMonthStatus, _yrTxB(_openingYrB), _openRateB);
      const _openAmtB    = _flOpeningDuesOutstanding(
        { monthStatus: s.prevYearMonthStatus, monthShortage: _openShort, amount: _openScalarB }, _openRateB);
      if (_openAmtB > 0) _bannerYearMap[_openingYrB] = _openAmtB;
    }

    // ITEM-9(c) FIX: A previous year's label was silently dropping from this banner
    // whenever its derived amount (Source 1's grid-count / balance-subtraction heuristic)
    // computed to zero due to stale/desynced fields — even though the year genuinely had
    // outstanding dues. Before finalising the map, cross-check every real candidate
    // previous year (s.academicYear, s.previousAcademicYear) against LIVE feeTransactions:
    // if it's missing (or zero) in _bannerYearMap but the live paid-month count still
    // leaves months unpaid, add it back using the live-derived amount instead of dropping it.
    // BUG-ITEM9C-FALSEDUE FIX: hasGrid tells us whether this year's own month-status
    // grid actually has data to answer from. A grid that exists and computed to a
    // confident ZERO (e.g. every month is "N/A-PAID") means the year is genuinely
    // cleared — including months that were marked paid directly at Excel import
    // and therefore never got a feeTransactions doc. The live-tx fallback below
    // only sees actual feeTransactions rows, so it can't see those import-paid
    // months and was wrongly re-flagging a fully-cleared year as still owing.
    // The fallback must only run when there is NO grid at all to trust (never
    // when the grid answered "0 due" with real data).
    const _bannerCandidateYears = [
      { yr: _sDocYear, cls: s.class || s.cls || '', hasGrid: !!(s.monthStatus && Object.keys(s.monthStatus).length) },
      { yr: _prevYrB,  cls: s.openingOutstandingClass || s.classPrev || (s.class || s.cls || ''), hasGrid: !!(s.previousYearMonthStatus && Object.keys(s.previousYearMonthStatus).length) },
    ].filter(c => c.yr && c.yr !== _currentAcadYrNorm);

    for (const cand of _bannerCandidateYears) {
      if ((_bannerYearMap[cand.yr] || 0) > 0) continue; // already has a genuine positive amount
      if (cand.hasGrid) continue; // grid already gave a trustworthy answer (incl. a confident zero) — don't override it
      try {
        const _livePaid = new Set();
        _allTxB.forEach(dd => {   // reuse the single fetch above — no extra Firestore read
          if (_normYrBanner(dd.academicYear) !== cand.yr) return;
          if (dd.type === 'excused_waiver') return;
          (dd.monthsSelected || []).forEach(m => _livePaid.add(m));
        });
        const _liveRate = _flRateForClass(cand.cls, s.monthlyFee || 0);   // L2/L8
        const _liveUnpaidAmt = Math.max(0, 12 - _livePaid.size) * _liveRate;
        if (_liveUnpaidAmt > 0) {
          _bannerYearMap[cand.yr] = _liveUnpaidAmt;
        }
      } catch (_liveErr) {
        console.warn('ITEM-9(c): live cross-check failed for', cand.yr, _liveErr);
      }
    }

    // BUG-RB-V3: Save per-year outstanding map so _pastDueSave() can compute
    // this-year remaining = yearOutstanding[year] - amountPaid (instead of using
    // total outstandingBalance which includes all years and gives wrong receipt balance)
    window._pastDueState.yearOutstandingMap = _bannerYearMap;

    const _totalBanner = Object.values(_bannerYearMap).reduce((a, b) => a + b, 0);
    if (_totalBanner > 0) {
      const _yearLines = Object.entries(_bannerYearMap)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([yr, amt]) => `<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(212,150,42,0.15);border:1px solid rgba(212,150,42,0.4);border-radius:6px;padding:5px 10px;font-size:13px;font-weight:600;color:var(--warn)">📅 ${yr}: <span style="color:var(--silver-lt)">₹${fmtNum(amt)}</span></span>`)
        .join('');
      _pdCtxEl.innerHTML = `<div style="background:rgba(212,150,42,0.1);border:1.5px solid rgba(212,150,42,0.5);border-radius:10px;padding:14px 16px;margin-bottom:4px">
        <div style="font-size:14px;font-weight:700;color:var(--warn);margin-bottom:10px">⚠️ Previous Year Outstanding</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${_yearLines}</div>
        <div style="font-size:12px;color:var(--muted)">Select year &amp; months below to clear dues year by year</div>
      </div>`;
    } else {
      _pdCtxEl.innerHTML = `<span style="color:var(--muted);font-size:12px">📅 Select the previous academic year and months to record dues</span>`;
    }
  }

  // ── AUTO-DETECT: previous academic year ─────────────────────────────────
  // Logic: current year = the year the student is now in (from _getCurrentAcademicYearStr).
  // Previous year = one year before that.
  // If the student has openingOutstandingYear set (from onboarding), use that as default.
  const now      = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  const curStart = _getAcademicYear().yearStart;   // L3: one definition of the June boundary
  const autoYear = s.openingOutstandingYear || `${curStart - 1}-${curStart}`;

  const yearSel = document.getElementById('pastDueYear');
  yearSel.innerHTML = '<option value="">Select previous academic year</option>';

  // Build year list: current year + last 2 previous years always shown,
  // plus openingOutstandingYear and any years from fee transactions.
  (async () => {
    const currentYearStr = _getCurrentAcademicYearStr(); // e.g. "2026-27"
    const studentYearsSet = new Set();

    // ── Collect ONLY years that have actual data for this student ──
    // Priority sources (student-specific data):
    // 1. openingOutstandingDues[] — multi-year manual onboarding
    if (Array.isArray(s.openingOutstandingDues)) {
      s.openingOutstandingDues.forEach(entry => {
        if (entry.year) studentYearsSet.add(_normaliseAcademicYear(entry.year.trim()));
      });
    }
    // 2. openingOutstandingYear — single-year manual onboarding
    if (s.openingOutstandingYear) {
      studentYearsSet.add(_normaliseAcademicYear(s.openingOutstandingYear.trim()));
    }
    // 3. previousAcademicYear — written by _deduplicateRowsInSheet during Excel import
    if (s.previousAcademicYear) {
      studentYearsSet.add(_normaliseAcademicYear(s.previousAcademicYear.trim()));
    }
    // 4. academicYear on the student doc (current/newer year from Excel import or onboarding)
    if (s.academicYear) {
      studentYearsSet.add(_normaliseAcademicYear(s.academicYear.trim()));
    }
    // 5. Years from this student's own fee transactions
    try {
      const txSnap = await schoolCol('feeTransactions')
        .where('studentId', '==', sid)
        .get();
      txSnap.docs.forEach(doc => {
        const yr = doc.data().academicYear;
        if (yr) studentYearsSet.add(_normaliseAcademicYear(yr.trim()));
      });
    } catch(_) {}

    // Fallback: if NO student-specific year was found at all, show last 2 past years
    // so the clerk still has something to select from (edge case — legacy data).
    if (studentYearsSet.size === 0) {
      const _yn = nowIST(); /* ITEM 01 FIX */
      const _yCur = _getAcademicYear().yearStart;   // L3: one definition of the June boundary
      for (let i = 1; i <= 2; i++) {
        const ys = _yCur - i;
        studentYearsSet.add(_normaliseAcademicYear(ys + '-' + String(ys + 1).slice(2)));
      }
    }

    // VLX-REF-005 FIX: Strip current year from ALL sources — final gate.
    // BUG-DROPDOWN-FIX: Also add every year that appears in the banner's yearOutstandingMap
    // (_pastDueState.yearOutstandingMap) — that map is the ground-truth of what years
    // have actual pending dues. If s.academicYear was "2026-27" (or missing), those
    // years would be silently absent from the set above even though dues exist.
    const _ymapYears = Object.keys(window._pastDueState?.yearOutstandingMap || {});
    _ymapYears.forEach(yr => { if (yr) studentYearsSet.add(yr); });

    const studentYears = Array.from(studentYearsSet)
      .filter(yr => Boolean(yr) && yr !== currentYearStr)
      .sort((a, b) => b.localeCompare(a));

    studentYears.forEach(label => {
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      yearSel.appendChild(opt);
    });

    // Auto-select: prefer the oldest year with outstanding dues (so clerk clears
    // dues in chronological order), then fall back to Firestore fields.
    // BUG-DROPDOWN-FIX: sort years ascending to get the oldest due year first.
    const _ymapSorted = Object.keys(window._pastDueState?.yearOutstandingMap || {})
      .filter(yr => studentYears.includes(yr))
      .sort((a, b) => a.localeCompare(b)); // oldest first
    const preferred = _ymapSorted.length > 0
      ? _ymapSorted[0]
      : s.previousAcademicYear
        ? _normaliseAcademicYear(s.previousAcademicYear)
        : s.openingOutstandingYear
          ? _normaliseAcademicYear(s.openingOutstandingYear)
          : autoYear;
    if (studentYears.includes(preferred)) {
      yearSel.value = preferred;
    } else if (studentYears.length > 0) {
      yearSel.value = studentYears[studentYears.length - 1]; // oldest
    }
    if (yearSel.value) _pastDueYearChange();
  })();

  // ── AUTO-DETECT: class for that year ────────────────────────────────────
  // If the student was onboarded with openingOutstandingClass, use that.
  // Otherwise derive: previous class = one step back in the class list from current class.
  // ITEM-9(a) FIX: resolve the class for the AUTO-DETECTED year specifically (not just
  // one flat step back) — this gets corrected again per-year in _pastDueYearChange()
  // whenever the clerk switches the academic year selector.
  const prevCls = _pastDueClassForYear(s, autoYear);
  window._pastDueState.prevClass = prevCls;

  const classField = document.getElementById('pastDueClass');
  classField.value = prevCls + (s.section ? ' – ' + s.section : '');

  // ── AUTO-DETECT: unpaid months for the auto-detected year ───────────────
  // Fetch actual transactions, then auto-select months that were set during onboarding
  // but have not been paid yet. Green = already paid. Red = still owed. White = not applicable.
  // ── GUARD: New student enrolled in current A.Y. — no previous year dues ──
  // Conditions: student.academicYear == curAcadYear AND no previousAcademicYear
  // AND no openingOutstandingYear AND outstandingBalance == 0.
  // → Keep form locked, show a friendly "no dues" notice instead.
  const _curYrGuard    = _getCurrentAcademicYearStr();
  const _normStuYr     = _normaliseAcademicYear(s.academicYear || '');
  const _hasPrevYr     = !!(s.previousAcademicYear || s.openingOutstandingYear);
  const _hasBalance    = (s.outstandingBalance || 0) > 0 || (s.previousDues || 0) > 0;
  const _hasMultiYearDues = Array.isArray(s.openingOutstandingDues) && s.openingOutstandingDues.length > 0;
  const _isNewEnrollee = (_normStuYr === _curYrGuard || !s.academicYear) && !_hasPrevYr && !_hasBalance && !_hasMultiYearDues;

  if (_isNewEnrollee) {
    // Hide the generic lock notice so it doesn't confuse
    const lockNotice = document.getElementById('pastDueLockNotice');
    if (lockNotice) lockNotice.style.display = 'none';
    // Show a clear green "no dues" alert
    const alertEl = document.getElementById('pastDueAlert');
    if (alertEl) {
      alertEl.innerHTML = `
        <div style="padding:14px 16px;border-radius:10px;margin-bottom:14px;
          background:rgba(82,200,122,0.10);border:1px solid rgba(82,200,122,0.30);
          display:flex;align-items:flex-start;gap:12px">
          <span style="font-size:20px;flex-shrink:0;line-height:1">✅</span>
          <div>
            <div style="font-weight:700;color:var(--success);font-size:13px;margin-bottom:5px">
              No Previous Year Dues — New Student
            </div>
            <div style="font-size:12px;color:var(--muted);line-height:1.7">
              <strong style="color:var(--text)">${sanitizeHTML(s.name)}</strong> was enrolled in
              <strong style="color:var(--gold-lt)">${_curYrGuard}</strong> — the current academic year.
              <br>This student has <strong style="color:var(--success)">no outstanding dues</strong>
              from any previous year.
              <br><br>To record a fee payment for the current year, use
              <a href="#" onclick="pushNav('recordFee',{studentId:'${s.id}',studentName:'${(s.name||'').replace(/['"]/g,'')}'});return false;"
                style="color:var(--gold-lt);font-weight:700;text-decoration:underline">
                Record Payment
              </a> from their student profile.
            </div>
          </div>
        </div>`;
    }
    return; // form stays locked — nothing more to do
  }

  await _pastDueLoadMonthGrid(autoYear, sid, s.openingOutstandingMonths || [], s);

  _pastDueLock(false);
  _pastDueCalcAmount();
}

async function _pastDueYearChange() {
  const year = document.getElementById('pastDueYear')?.value;
  window._pastDueState.selectedMonths = [];
  if (!year || !window._pastDueState.student) {
    // Reset pills to blank
    document.querySelectorAll('#pastDueMonthGrid .month-pill').forEach(p => {
      p.dataset.selected = 'false'; p.dataset.paid = 'false';
      p.style.background = 'rgba(0,0,0,0.30)'; p.style.color = 'var(--muted)';
      p.style.borderColor = 'var(--glass-border)'; p.disabled = false; p.title = '';
    });
    _pastDueCalcAmount();
    return;
  }
  const sid = window._pastDueState.student.id;
  const s   = window._pastDueState.student;

  // ITEM-9(a) FIX: Grade/Class must update to match whichever academic year is now
  // selected — a student's grade one year ago is not the same as their current grade.
  const prevCls = _pastDueClassForYear(s, year);
  window._pastDueState.prevClass = prevCls;
  const classField = document.getElementById('pastDueClass');
  if (classField) classField.value = prevCls + (s.section ? ' – ' + s.section : '');

  // BUG-FIX: Only pass openingOutstandingMonths as the "owed" set when the
  // selected year actually matches the year those months belong to.
  // For any other year (e.g. user picks 2024-25 but openingOutstandingYear is
  // 2025-26), pass an empty array so no wrong RED pills appear.
  const owedYear = _normaliseAcademicYear(s.openingOutstandingYear || '');
  const selYear  = _normaliseAcademicYear(year);
  const openingMonths = (owedYear && owedYear === selYear)
    ? (s.openingOutstandingMonths || [])
    : [];

  await _pastDueLoadMonthGrid(year, sid, openingMonths, s);
  _pastDueCalcAmount();
}

// ── Shared month grid loader ─────────────────────────────────────────────────
// Fetches actual paid transactions for (student, year), then renders three states:
//   GREEN  = already paid (disabled, can't re-select)
//   RED    = owed from onboarding (openingOutstandingMonths) but not yet paid — auto-selected
//   WHITE  = not in outstanding list and not paid (selectable manually)
async function _pastDueLoadMonthGrid(year, sid, openingMonths, studentData) {
  // Fetch already-paid months for this student + year from ALL sources:
  // SOURCE 1: feeTransactions — payments recorded via Past Due Recording OR Record Payment
  // SOURCE 2: student doc monthStatus — Excel-imported N/A-PAID entries for this year
  // FORMAT-FIX: normalise year on both sides so "2024-25" matches "2024-2025" etc.
  const _normYear = _normaliseAcademicYear(year);
  let paid = new Set();
  let _appliedPD = {};     // JSS-REF-VELTRIX-2026-004 ITEM 06: per-month amount applied via partial txs
  const _pdYearTxs = [];   // this year's transactions, kept for the ITEM 14 ledger build below

  // ── Source 1: feeTransactions (covers both Record Payment + Past Due Recording) ──
  try {
    const txSnap = await schoolCol('feeTransactions')
      .where('studentId', '==', sid)
      .get();
    txSnap.docs.forEach(d => {
      const data = d.data();
      if (_normaliseAcademicYear(data.academicYear) !== _normYear) return;
      if (Array.isArray(data.monthsSelected)) data.monthsSelected.forEach(m => paid.add(m));
      // JSS-REF-VELTRIX-2026-005 ITEM 14: the per-month applied map is built from these below,
      // once the year's rate is known, via the shared _flAppliedByMonthFromTxs.
      _pdYearTxs.push(data);
    });
  } catch(e) { console.warn('[PastDue] Could not fetch paid months from transactions:', e.message); }

  // ── Source 2: student doc monthStatus / previousYearMonthStatus ──
  // Excel-imported students: monthStatus = CURRENT year; previousYearMonthStatus = OLDER year.
  // We pick the right map based on whether the selected year matches the student's academicYear.
  // Keys are SHORT (Jun…) — pills use FULL names (June…) — convert via _pdShortToFull.
  const _pdShortToFull = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};
  const sData = studentData || window._pastDueState.student || {};
  // Determine which map to read for Source 2
  const _sDataCurrentYear = _normaliseAcademicYear(sData.academicYear || '');
  const _src2Map = (_sDataCurrentYear && _sDataCurrentYear === _normYear)
    ? sData.monthStatus             // Selected year = student's current year → use monthStatus
    : sData.previousYearMonthStatus; // Selected year = a previous year → use previousYearMonthStatus
  if (_src2Map && typeof _src2Map === 'object') {
    Object.entries(_src2Map).forEach(([month, status]) => {
      if (status === 'N/A-PAID' || status === 'PAID') {
        paid.add(_pdShortToFull[month] || month); // "Jun"→"June"; full names pass through
      }
    });
  }

  // ── Source 3: openingOutstandingDues[] — multi-year manual onboarding ──
  // When a student is manually onboarded with dues for MULTIPLE years (e.g. 2024-25 + 2025-26),
  // each year's monthStatus is stored only inside this array (not in top-level monthStatus /
  // previousYearMonthStatus). We find the matching entry and extract its N/A-PAID months.
  // Also builds owedSet from DUE months if openingMonths array is empty for this year.
  const _multiYearDues = Array.isArray(sData.openingOutstandingDues) ? sData.openingOutstandingDues : [];
  let _multiYearOwedMonths = null; // will override owedSet if found
  if (_multiYearDues.length > 0) {
    const _matchEntry = _multiYearDues.find(entry => _normaliseAcademicYear(entry.year || '') === _normYear);
    if (_matchEntry && _matchEntry.monthStatus && typeof _matchEntry.monthStatus === 'object') {
      Object.entries(_matchEntry.monthStatus).forEach(([month, status]) => {
        const fullName = _pdShortToFull[month] || month;
        if (status === 'N/A-PAID' || status === 'PAID') {
          paid.add(fullName);
        }
      });
      // Build owed set from DUE entries of this specific year's monthStatus
      // (overrides the passed openingMonths which only tracks the oldest year)
      _multiYearOwedMonths = Object.entries(_matchEntry.monthStatus)
        .filter(([, status]) => status === 'DUE')
        .map(([month]) => _pdShortToFull[month] || month);
    } else if (_matchEntry && Array.isArray(_matchEntry.unpaidMonths)) {
      // Fallback: unpaidMonths list (full names stored at save time)
      _multiYearOwedMonths = _matchEntry.unpaidMonths;
    }
  }

  // Use per-year owed months from Source 3 if available; otherwise fall back to passed openingMonths
  const owedSet = new Set(_multiYearOwedMonths !== null ? _multiYearOwedMonths : openingMonths);
  // JSS-REF-VELTRIX-2026-004 ITEM 06: a PARTIAL month (money applied but < the year's rate) must
  // stay selectable (topped up first) instead of locking green like a fully-paid month.
  // L2/L8: through the ONE resolver. `_FEE_SCHEDULE[cls]` is an exact-key lookup, so a
  // class stored as "LKG " misses the map entirely and falls through to the stale
  // stored monthlyFee — which is precisely how Test Student Two was priced at 1,500 for
  // weeks while her class said LKG at 1,700. This is the Past Due month grid, so the
  // miss would quote every prior-year month at the wrong rate.
  const _pdGridRate = _flRateForClass(_resolveClassForYear(sData, year), sData.monthlyFee);
  // JSS-REF-VELTRIX-2026-005 ITEM 14: built by the SHARED _flAppliedByMonthFromTxs, so a
  // legacy top-up transaction (no monthAllocations) credits its months at the FULL rate.
  // The old allocations-only build left a settled partial month stuck at its first short
  // instalment — and because the PARTIAL branch below is tested BEFORE `paid.has(m)`, that
  // month stayed amber "still due" forever even though it was fully cleared.
  _appliedPD = _flAppliedByMonthFromTxs(_pdYearTxs, _pdGridRate);
  // Cache per-month applied amounts so _pastDueCalcAmount can net a PARTIAL month's remainder
  // (rate − applied) when it's tapped — same source as the grid + banner, so the pre-filled
  // amount, the outstanding, and the recorded payment never disagree.
  window._pastDueState.appliedByMonth = _appliedPD;

  // Reset and re-render each pill
  const autoSelected = [];
  document.querySelectorAll('#pastDueMonthGrid .month-pill').forEach(p => {
    const m = p.dataset.month;
    p.dataset.paid     = 'false';
    p.dataset.selected = 'false';
    p.disabled         = false;
    p.title            = '';
    p.innerHTML        = m.slice(0,3);   // reset label (a prior render may have left a PARTIAL badge)

    const _appM = _appliedPD[m] || 0;
    if (_appM > 0 && _pdGridRate > 0 && _appM < _pdGridRate) {
      // PARTIAL — money applied but below the rate; stays SELECTABLE (top up first), amber.
      const _left = Math.max(0, _pdGridRate - _appM);
      p.style.background = 'rgba(212,150,42,0.18)';
      p.style.color      = 'var(--warn)';
      p.style.borderColor= 'rgba(212,150,42,0.60)';
      p.title            = `${m} — PARTIAL: ₹${fmtNum(_appM)} paid, ₹${fmtNum(_left)} still due (tap to top up)`;
      p.innerHTML        = `${m.slice(0,3)}<br><span style="font-size:8px;font-weight:700;letter-spacing:0.3px">PARTIAL ₹${fmtNum(_left)}</span>`;
    } else if (paid.has(m)) {
      // Already paid — lock green
      p.dataset.paid     = 'true';
      p.disabled         = true;
      p.style.background = 'rgba(82,200,122,0.15)';
      p.style.color      = 'var(--success)';
      p.style.borderColor= 'rgba(82,200,122,0.3)';
      p.title            = 'Already paid';
    } else if (owedSet.has(m)) {
      // Owed from onboarding and not yet paid — RED, unselected (user must tap to select)
      p.dataset.selected = 'false';
      p.style.background = 'rgba(224,82,82,0.20)';
      p.style.color      = 'var(--danger)';
      p.style.borderColor= 'rgba(224,82,82,0.6)';
      p.title            = m + ' — unpaid (tap to select for payment)';
    } else {
      // Not flagged at onboarding but also not paid — lighter red, still selectable
      p.dataset.selected = 'false';
      p.style.background = 'rgba(224,82,82,0.12)';
      p.style.color      = 'var(--danger)';
      p.style.borderColor= 'rgba(224,82,82,0.40)';
      p.title            = m + ' — unpaid (tap to select for payment)';
    }
  });

  // Nothing auto-selected — user must explicitly tap months to pay
  window._pastDueState.selectedMonths = [];

  // Count unpaid (non-green) months for the hint
  const unpaidCount = Array.from(
    document.querySelectorAll('#pastDueMonthGrid .month-pill')
  ).filter(p => p.dataset.paid !== 'true').length;

  // Update hint
  const hintEl = document.getElementById('pastDueMonthHint');
  if (hintEl) {
    if (unpaidCount === 0 && paid.size > 0) {
      hintEl.textContent = `All recorded months for ${year} are already paid ✓`;
      hintEl.style.color = 'var(--success)';
    } else {
      hintEl.textContent = `${unpaidCount} unpaid month(s) — tap the months you want to clear now (they turn gold when selected).`;
      hintEl.style.color = 'var(--warn)';
    }
  }
}

function _pastDueToggleMonth(btn) {
  if (btn.dataset.paid === 'true') return;
  const isSelected = btn.dataset.selected === 'true';
  btn.dataset.selected = isSelected ? 'false' : 'true';
  if (isSelected) {
    // Deselect → back to RED (still unpaid — never grey)
    btn.style.background  = 'rgba(224,82,82,0.20)';
    btn.style.color       = 'var(--danger)';
    btn.style.borderColor = 'rgba(224,82,82,0.6)';
  } else {
    // Select → GOLD (being paid now)
    btn.style.background  = 'rgba(201,168,76,0.20)';
    btn.style.color       = 'var(--gold-lt)';
    btn.style.borderColor = 'rgba(201,168,76,0.5)';
  }
  window._pastDueState.selectedMonths = Array.from(
    document.querySelectorAll('#pastDueMonthGrid .month-pill[data-selected="true"]')
  ).map(p => p.dataset.month);
  _pastDueCalcAmount();
}

function _pastDueCalcAmount() {
  const months  = window._pastDueState.selectedMonths || [];
  const student = window._pastDueState.student;
  const hintEl  = document.getElementById('pastDueMonthHint');
  const amtEl   = document.getElementById('pastDueAmount');
  if (!months.length) {
    if (hintEl) hintEl.textContent = 'Select months to clear.';
    if (amtEl) amtEl.value = '';
    if (typeof _updateSplitPaymentSummary === 'function') _updateSplitPaymentSummary();
    return;
  }
  if (hintEl) hintEl.textContent = `${months.length} month(s): ${months.join(', ')}`;
  // Use prevClass rate — dues belong to the class the student was in that year, not current class
  const prevCls = window._pastDueState?.prevClass || (student ? (student.class || student.cls || '') : '');
  const rate = _flRateForClass(prevCls, 0);   // L2/L8: one resolver
  // JSS-REF-VELTRIX-2026-004 ITEM 06: a PARTIAL month owes only its remainder (rate − already
  // applied), not a fresh full month. Net each selected month against the per-month applied
  // amounts cached from the grid (monthAllocations) — same source as the banner/save, so the
  // pre-filled amount can never charge a partial month the full fee again. A DUE month (0
  // applied) still charges the full rate; matches _pastDueSave's own _fullPayable netting.
  const _applied = window._pastDueState?.appliedByMonth || {};
  const total = months.reduce((sum, m) => sum + Math.max(0, rate - (_applied[m] || 0)), 0);
  if (amtEl) amtEl.value = total || '';
  if (typeof _updateSplitPaymentSummary === 'function') _updateSplitPaymentSummary();
}

// JSS-REF-VELTRIX-2026-004 ITEM 06 — partial-payment amount entry for Record Previous Year Dues.
// Mirrors the current-year handlers (_feePartialToggleChanged / _feeUpdatePartialHint): shows the
// editable "Amount Collected" field and keeps the split-payment summary + live shortfall hint in
// sync. The collected amount drives the split target (via _splitPayTargetTotal), so the modes still
// sum to it exactly while the shortfall vs the full payable creates the PARTIAL month.
function _pastDuePartialToggleChanged() {
  const on   = !!document.getElementById('pastDuePartialToggle')?.checked;
  const wrap = document.getElementById('pastDueCollectedWrap');
  const coll = document.getElementById('pastDueCollectedAmount');
  if (on) {
    if (wrap) wrap.style.display = '';
    // Seed the collected field with the full payable so the clerk just reduces it.
    if (coll && (!coll.value || parseFloat(coll.value) === 0)) {
      coll.value = parseFloat(document.getElementById('pastDueAmount')?.value) || 0;
    }
  } else if (wrap) {
    wrap.style.display = 'none';
  }
  if (typeof _updateSplitPaymentSummary === 'function') _updateSplitPaymentSummary();
  _pastDueUpdatePartialHint();
}
function _pastDueUpdatePartialHint() {
  const hint = document.getElementById('pastDuePartialHint');
  if (!hint) return;
  if (!document.getElementById('pastDuePartialToggle')?.checked) { hint.textContent = ''; return; }
  const full = parseFloat(document.getElementById('pastDueAmount')?.value) || 0;
  const coll = parseFloat(document.getElementById('pastDueCollectedAmount')?.value) || 0;
  const shortfall = +(full - coll).toFixed(2);
  if (coll <= 0)               hint.innerHTML = '<span style="color:var(--danger)">Enter the amount collected.</span>';
  else if (coll > full + 0.5)  hint.innerHTML = `<span style="color:var(--danger)">Collected ₹${fmtNum(coll)} exceeds the ₹${fmtNum(full)} payable.</span>`;
  else if (shortfall < 0.5)    hint.innerHTML = `<span style="color:var(--success)">✓ Covers the full ₹${fmtNum(full)} — no shortfall.</span>`;
  else                         hint.innerHTML = `<span style="color:var(--warn)">₹${fmtNum(shortfall)} short of ₹${fmtNum(full)} — the last covered month will be PARTIAL.</span>`;
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 F9 — DUPLICATE SUBMISSION LOCK for past-due payments.
//
// THIS ONE ALREADY COST REAL MONEY. Test Student One (ADM-TEST-001) holds two past-due
// receipts, PDR-MRXO3TVG and PDR-MRXO3TEX, for the SAME two months (April, May) at
// the SAME amount (3,400) on the SAME day. The receipt numbers are base-36
// timestamps and differ by two characters — they were issued milliseconds apart.
// That is 6,800 collected against 3,400 of liability, in the ledger right now.
//
// Record Payment has guarded this since VLX-REF-001 (record-payment.js:
// `if (_saveBtn.disabled) return;` on entry). Past Due never got it. Its button was
// only replaced — at the very end, AFTER the write committed — and between the
// first click and that moment the function awaits a feeTransactions query and then
// the write itself. A second click lands squarely in that window and runs the whole
// save again, from the same still-valid form state.
//
// WHY A WRAPPER RATHER THAN A GUARD INSIDE THE BODY. _pastDueSaveInner is ~280
// lines with a dozen early `return`s for validation. Disabling on entry would mean
// re-enabling at every one of them, and the first one anybody forgot would leave the
// button dead with no way back except a reload. A wrapper with try/finally re-enables
// on every path — including a thrown exception — without touching the body at all.
//
// The finally deliberately re-queries the DOM: the SUCCESS path replaces this button
// with a locked confirmation banner, so the element is gone and must NOT be
// resurrected. Only a still-present button is restored, which is exactly the
// validation-failure and error cases.
// ════════════════════════════════════════════════════════════════════════════
let _pdSaveInFlight = false;

async function _pastDueSave() {
  if (_pdSaveInFlight) return;                       // the guard the duplicates got through
  const _btnEl  = document.getElementById('pastDueSaveBtn');
  const _btnHtml = _btnEl ? _btnEl.innerHTML : null;
  _pdSaveInFlight = true;
  if (_btnEl) { _btnEl.disabled = true; _btnEl.innerHTML = '<span style="opacity:0.7">⏳ Processing…</span>'; }
  try {
    await _pastDueSaveInner();
  } catch (e) {
    console.error('[PAST DUE] save failed:', e);
    showFormAlert('pastDueAlert', 'Save failed: ' + ((e && e.message) || 'unknown error'), 'danger');
  } finally {
    _pdSaveInFlight = false;
    // Re-query: on success the button no longer exists (replaced by the banner).
    const _still = document.getElementById('pastDueSaveBtn');
    if (_still && _btnHtml !== null) { _still.disabled = false; _still.innerHTML = _btnHtml; }
  }
}

async function _pastDueSaveInner() {
  showFormAlert('pastDueAlert','','');
  const state   = window._pastDueState;
  const student = state?.student;
  if (!student?.id) { showFormAlert('pastDueAlert','Please search and select a student first.','danger'); return; }

  const year    = (document.getElementById('pastDueYear')?.value||'').trim();
  if (!year)    { showFormAlert('pastDueAlert','Select an academic year.','danger'); return; }

  const months  = state.selectedMonths || [];
  if (!months.length) { showFormAlert('pastDueAlert','Select at least one month to clear.','danger'); return; }

  const _splitResult = _collectSplitPaymentBreakup();
  if (!_splitResult.valid) { showFormAlert('pastDueAlert', _splitResult.error, 'danger'); return; }
  const paymentModeBreakup = _splitResult.breakup;
  const mode = paymentModeBreakup.length === 1 ? paymentModeBreakup[0].mode : 'Split Payment';

  const date  = (document.getElementById('pastDueDate')?.value||'').trim();
  if (!date)  { showFormAlert('pastDueAlert','Select a payment date.','danger'); return; }

  // Rate uses the PREVIOUS class (the class dues belong to), not current class
  const cls    = state.prevClass || student.class || student.cls || '';
  const rate   = _flRateForClass(cls, 0);   // L2/L8: one resolver

  // JSS-REF-VELTRIX-2026-004 ITEM 06 — PARTIAL past-due payment. Allocate the collected amount
  // across the selected months (oldest first) via the SAME single-source _allocateFeePayment the
  // current-year Record Payment uses — no second copy of the allocation logic. Prior amounts
  // already applied to each month of THIS year (partial top-ups) are read via the shared
  // _paidTowardMonthFromTxs, so a re-payment tops up an existing PARTIAL month first.
  let _pyTxs = [];
  try {
    const _pySnap = await schoolCol('feeTransactions').where('studentId','==',student.id).get();
    _pyTxs = _pySnap.docs.map(d => d.data()).filter(t => _normaliseAcademicYear(t.academicYear) === _normaliseAcademicYear(year));
  } catch(_) { _pyTxs = []; }
  const _ACAD_PD = ['June','July','August','September','October','November','December','January','February','March','April','May'];
  const _monthsInOrder = [...months].sort((a,b) => _ACAD_PD.indexOf(a) - _ACAD_PD.indexOf(b));
  const _rateForPD   = () => rate;
  const _priorPaidPD = m => _paidTowardMonthFromTxs(_pyTxs, m, _rateForPD);
  // Full payable nets any prior partial top-ups on the selected months (rate − alreadyApplied),
  // matching current-year lockedAmount.
  const _fullPayable = _monthsInOrder.reduce((s, m) => s + Math.max(0, rate - _priorPaidPD(m)), 0);
  const _pdPartialOn = !!document.getElementById('pastDuePartialToggle')?.checked;
  const _pdCollected = _pdPartialOn
    ? (parseFloat(document.getElementById('pastDueCollectedAmount')?.value) || 0)
    : _fullPayable;
  if (_pdPartialOn && _pdCollected <= 0) {
    showFormAlert('pastDueAlert', 'Enter the amount collected (greater than ₹0) for a partial payment.', 'danger');
    return;
  }
  const _allocPD = _allocateFeePayment(_monthsInOrder, _pdCollected, _rateForPD, _priorPaidPD);
  if (_allocPD.applied <= 0) {
    showFormAlert('pastDueAlert', 'Enter an amount greater than ₹0.', 'danger');
    return;
  }
  const amount = _allocPD.applied;   // actual cash applied now
  const _pdMonthAllocations = {}, _pdMonthShortage = {}, _pdPartialMonths = [], _pdMonthsPaidList = [];
  _allocPD.allocations.forEach(a => {
    if (a.nowPaid > 0) { _pdMonthAllocations[a.month] = a.nowPaid; _pdMonthsPaidList.push(a.month); }
    if (a.status === 'partial') { _pdPartialMonths.push(a.month); _pdMonthShortage[a.month] = a.shortage; }
  });
  const _pdIsPartial = _pdPartialMonths.length > 0;
  const _pdStatusForMonth = m => _pdPartialMonths.includes(m) ? 'PARTIAL' : (_pdMonthsPaidList.includes(m) ? 'N/A-PAID' : null);

  const receiptNumber = 'PDR-' + Date.now().toString(36).toUpperCase();
  const amtWords = numberToWords ? numberToWords(amount) : String(amount);

  const tx = {
    type:            'past_due_payment',
    studentId:       student.id,
    studentName:     student.name || '',
    // BUG-PDR-01 FIX: Normalize to 'admissionNumber' — showReceipt() and Paid Fee list
    // both read tx.admissionNumber; the old 'admissionNo' key caused "undefined" in receipt.
    admissionNumber: student.admissionNumber || '',
    admissionNo:     student.admissionNumber || '',   // keep for backward compat
    class:           cls,           // previous class (dues belong to this class)
    // BUG-PDR-02 FIX: Add classSection — Paid Fee list reads t.classSection not t.class.
    classSection:    `${cls} – Section ${student.section || ''}`,
    currentClass:    student.class || student.cls || '',
    section:         student.section || '',
    block:           student.block   || '',
    // BUG-PDR-03 FIX: Add parentName + contactNo so Paid Fee list doesn't show "—".
    parentName:      student.parentName || '',
    contactNo:       student.contact || student.contactNo || student.phone || '',
    academicYear:    year,
    // BUG-PDR-04 FIX: Add feeHead — showReceipt() reads tx.feeHead; was showing "undefined".
    feeHead:         `Past Due — ${months.join(', ')} (${year})`,
    monthsSelected:  _pdMonthsPaidList,
    amountPaid:      amount,
    // JSS-REF-VELTRIX-2026-004 ITEM 03: populate amountInWords so the shared showReceipt()
    // popup's "Amount in Words" row renders (the old inline renderer never showed it).
    amountInWords:   amtWords,
    remainingBalance: 0,
    paymentMode:     mode,
    // JSS-REF-013: mode-wise breakup — [{mode, amount, chequeNumber?}, ...], same schema
    // as Record Payment so receipts/exports/_getChequeNoDisplay() work identically.
    paymentModeBreakup,
    // BUG-PDR-05 FIX: Add paymentStatus — showReceipt() and statusBadge() both need it.
    paymentStatus:   _pdIsPartial ? 'Partial' : 'Paid',
    // JSS-REF-VELTRIX-2026-005 ITEM 14: the allocation ledger is written on EVERY past-due
    // payment, not just partial ones. _allocateFeePayment already computed it for both cases
    // (it nets each month against what was previously applied), so writing it always costs
    // nothing and closes the gap where a full top-up left the month's ledger frozen at its
    // first short instalment — which made a settled month reappear as PARTIAL/red.
    monthAllocations: _pdMonthAllocations,
    partialMonths:    _pdPartialMonths,
    monthShortage:    _pdMonthShortage,
    // BUG-DATE-FIX: 'date' was a plain "YYYY-MM-DD" string. new Date("YYYY-MM-DD") parses as
    // UTC midnight → IST 05:30 am regardless of actual time. Now stored as a real Firestore
    // Timestamp (date parts + current H:M:S) so receipt & "Recorded by" show the correct time.
    // Was an inline copy of the IST wall-clock expression (BUG-TS-001). Same instant,
    // now via the one shared converter.
    date: istTimestampFromDateInput(date, 'now'),
    receiptNumber,
    amountInWords:   amtWords + ' Rupees Only',
    recordedBy:      currentUser?.uid || '',
    // BUG-PDR-06 FIX: Add recordedByName — Paid Fee list reads t.recordedByName not t.recordedBy.
    recordedByName:  currentProfile?.name || currentUser?.email || 'Staff',
    createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    // BUG-RB-FIX-V3: Use the per-year outstanding map stored in _pastDueState.yearOutstandingMap
    // (built when the student was selected) to compute this year's remaining balance.
    // yearOutstanding[selectedYear] - amountPaid = remaining for THIS year on the receipt.
    // Total remaining (for student doc) = total outstanding - amountPaid.
    let remainingAfter = 0;
    try {
      const sDocPre = await schoolCol('students').doc(student.id).get();
      const sDataPre = sDocPre.data() || {};
      const curOut = parseFloat(sDataPre.outstandingBalance) || 0;

      // Per-year outstanding from the banner map (computed at student-select time)
      const _normYr = y => { if(!y) return ''; const s2=String(y).trim().replace(/[–—]/g,'-'); const m=s2.match(/^(\d{4})-(\d{2,4})$/); if(!m) return s2; return m[1]+'-'+(m[2].length===4?m[2].slice(2):m[2]); };
      const _yearMap = window._pastDueState?.yearOutstandingMap || {};
      const _normYear = _normYr(year);
      const _thisYearOutstanding = _yearMap[_normYear] ?? 0;

      // Receipt balance = what is still owed for THIS year after this payment
      const _yearRemaining = Math.max(0, _thisYearOutstanding - amount);

      // Student doc balance = total across all years minus this payment
      const _totalRemaining = Math.max(0, curOut - amount);

      remainingAfter = _yearRemaining;          // shown on receipt
      tx._totalOutstandingAfter = _totalRemaining; // stored on student doc
    } catch(_preErr) {
      console.warn('BUG-RB-FIX-V3: Could not compute remaining balance.', _preErr);
      remainingAfter = 0;
    }
    // Stamp the correct remainingBalance on tx BEFORE writing to Firestore
    tx.remainingBalance = remainingAfter;

    await schoolCol('feeTransactions').add(tx);

    // Step 2: Update student doc with new outstanding balance
    try {
      // BUG-PDR-07 FIX (CRITICAL): Advance academicYear to current year after past dues cleared.
      // Without this, the PREVIOUS YEAR GUARD in Record Payment permanently locks ALL month pills
      // because it reads student.academicYear and sees the old year — even after dues are paid.
      //
      // ITEM-5 FIX: The advance must only happen once ALL previous-year dues are fully
      // cleared (total outstanding across every tracked year == 0). Advancing academicYear
      // after every PARTIAL payment was the root cause of the year vanishing from the
      // "Record Previous Year Dues" selector before its remaining months could be cleared —
      // _pastDuePick() builds the dropdown from studentYearsSet, which explicitly excludes
      // anything equal to the student's (now-advanced) academicYear / the current year.
      const _totalOutstandingAfterSave = tx._totalOutstandingAfter ?? remainingAfter;
      const _studentUpdatePayload = {
        outstandingBalance: _totalOutstandingAfterSave,
        remainingBalance:   _totalOutstandingAfterSave,
        lastPaymentDate:    date,
        lastPaymentAmount:  amount,
        updatedAt:          firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (_totalOutstandingAfterSave <= 0) {
        // Every previous-year due (across all tracked years) is now cleared — safe to
        // advance so Record Payment's previous-year guard unlocks for the current year.
        _studentUpdatePayload.academicYear = _getCurrentAcademicYearStr();
      }

      // ITEM-9(b) FIX: Write the just-paid months back into the student doc's canonical
      // month-status snapshot, using per-field DOT-PATH updates so ONLY the exact months
      // just paid are touched — every other month/year is left completely untouched.
      // This was previously never written back at all, which let the profile view and
      // other screens keep showing a stale (import-time) DUE/PAID pattern that had no
      // relationship to what was actually paid — the "unrelated month marked due" bug.
      const _fullToShortPD = {June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec',January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May'};
      const _selYearNormPD = _normaliseAcademicYear(year);
      const _sDocYearPD    = _normaliseAcademicYear(student.academicYear || '');
      const _prevYearPD    = _normaliseAcademicYear(student.previousAcademicYear || '');
      const _openYearPD    = _normaliseAcademicYear(student.openingOutstandingYear || '');

      let _targetMapField = null;
      if (_sDocYearPD && _sDocYearPD === _selYearNormPD) {
        _targetMapField = 'monthStatus';
      } else if (_prevYearPD && _prevYearPD === _selYearNormPD) {
        _targetMapField = 'previousYearMonthStatus';
      } else if (_openYearPD && _openYearPD === _selYearNormPD) {
        _targetMapField = 'prevYearMonthStatus';
      }

      if (_targetMapField) {
        const _dotUpdates = {};
        months.forEach(m => {
          const st = _pdStatusForMonth(m);   // 'N/A-PAID' (fully paid) | 'PARTIAL' | null (untouched)
          if (st) _dotUpdates[`${_targetMapField}.${_fullToShortPD[m] || m}`] = st;
        });
        if (Object.keys(_dotUpdates).length) {
          await schoolCol('students').doc(student.id).update(_dotUpdates);
        }
      } else {
        // Multi-year manual onboarding: the year's grid lives inside the
        // openingOutstandingDues[] array — patch just the matching entry's
        // monthStatus, leaving every other array entry byte-for-byte untouched.
        const _oodSnap = await schoolCol('students').doc(student.id).get();
        const _oodData = _oodSnap.data() || {};
        const _oodArr  = Array.isArray(_oodData.openingOutstandingDues) ? [..._oodData.openingOutstandingDues] : [];
        const _oodIdx  = _oodArr.findIndex(e => _normaliseAcademicYear(e.year || '') === _selYearNormPD);
        if (_oodIdx > -1) {
          const _entry = { ..._oodArr[_oodIdx] };
          const _ms = { ...(_entry.monthStatus || {}) };
          months.forEach(m => { const st = _pdStatusForMonth(m); if (st) _ms[_fullToShortPD[m] || m] = st; });
          _entry.monthStatus = _ms;
          if (Array.isArray(_entry.unpaidMonths)) {
            const _fullyPaidPD = months.filter(m => _pdStatusForMonth(m) === 'N/A-PAID');
            _entry.unpaidMonths = _entry.unpaidMonths.filter(um => !_fullyPaidPD.includes(um));
          }
          _oodArr[_oodIdx] = _entry;
          await schoolCol('students').doc(student.id).update({ openingOutstandingDues: _oodArr });
        }
      }

      await schoolCol('students').doc(student.id).update(_studentUpdatePayload);
    } catch(_updateErr) {
      console.error('BUG-RB-FIX: Student doc update failed after tx save:', _updateErr);
    }

    // ITEM-10 FIX: Run the canonical cross-module reconciliation as the final step —
    // this recomputes aggregate + per-year fields from the transaction ledger so
    // Dashboard, Due Fee, and Student Profile all agree with what was just saved.
    await _syncStudentFinancials(student.id);

    invalidateFinanceCache();
    invalidateStudentCache();
    if (typeof auditLog === 'function') auditLog('past_due_payment', { studentName: student.name, academicYear: year, months, amount, receiptNumber });

    // JSS-REF-VELTRIX-2026-004 ITEM 03: previous-year dues receipts now use the SAME
    // centered popup as every other payment (showReceipt) instead of the old inline
    // _pastDueShowReceipt() renderer. The tx object is already built to showReceipt's
    // shape (see the BUG-PDR-* field comments where tx is constructed above).
    showReceipt(tx);
    showToast('Past due payment recorded and receipt generated.', 'success');

    // LOCK-PDR: Lock the entire form after successful payment so no accidental
    // duplicate entries can be made. User must revisit/refresh to record another.
    _pastDueLockForm(student.name, year, months);

  } catch(e) {
    showFormAlert('pastDueAlert','Error saving payment: ' + e.message,'danger');
  }
}

function _pastDueLockForm(studentName, year, months) {
  // Disable all inputs in the payment details form
  const _fields = ['pastDueYear','pastDueDate'];
  _fields.forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = true; el.style.opacity = '0.5'; } });

  // JSS-REF-013: lock every split-payment row (mode/amount/cheque/remove button)
  // and the "+ Add Payment Mode" control.
  document.querySelectorAll('#splitPaymentRows input, #splitPaymentRows select, #splitPaymentRows button').forEach(el => {
    el.disabled = true; el.style.opacity = '0.5';
  });

  // Disable all month pills
  document.querySelectorAll('#pastDueMonthGrid .month-pill').forEach(p => { p.disabled = true; p.style.pointerEvents = 'none'; p.style.opacity = '0.5'; });

  // Disable student search
  const _search = document.getElementById('pastDueSearch');
  if (_search) { _search.disabled = true; _search.style.opacity = '0.5'; }

  // Replace the save button with a locked confirmation banner
  // F9: prefer the id. The onclick selector still matches, but the id is what the
  // wrapper's finally checks for — keeping both lookups on the same element is what
  // guarantees the button is not resurrected after this replaces it with the banner.
  const _btn = document.getElementById('pastDueSaveBtn')
            || document.querySelector('[onclick="_pastDueSave()"]');
  if (_btn) {
    _btn.outerHTML = `<div style="
      background: rgba(34,197,94,0.08);
      border: 1.5px solid rgba(34,197,94,0.4);
      border-radius: 10px;
      padding: 14px 16px;
      text-align: center;
      margin-top: 4px;
    ">
      <div style="font-size:15px;font-weight:700;color:#22c55e;margin-bottom:6px">✅ Payment Recorded Successfully</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
        ${sanitizeHTML(studentName)} · ${sanitizeHTML(year)} · ${months.map(m=>sanitizeHTML(m)).join(', ')}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="navigate('pastDue')" style="width:100%;font-size:12px">
        🔄 Record Another Past Due Payment
      </button>
    </div>`;
  }
}

function _pastDueShowReceipt(tx, student, year, months, amount, date) {
  const box  = document.getElementById('pastDueReceiptBox');
  const help = document.getElementById('pastDueHelpCard');
  if (!box) return;
  if (help) help.style.display = 'none';

  const schoolName = currentProfile?.schoolName || currentSchoolId || 'School';
  document.getElementById('pastDueReceiptSchool').textContent = schoolName;

  document.getElementById('pdr_student').innerHTML = `
    <div class="r-row"><span class="r-lbl">Student Name</span><span class="r-val">${sanitizeHTML(student.name||'—')}</span></div>
    <div class="r-row"><span class="r-lbl">Class</span><span class="r-val">${sanitizeHTML((student.class||student.cls||''))}</span></div>
    <div class="r-row"><span class="r-lbl">Admission No</span><span class="r-val">${sanitizeHTML(student.admissionNumber||'—')}</span></div>
  `;
  document.getElementById('pdr_details').innerHTML = `
    <div class="r-row"><span class="r-lbl">Receipt No</span><span class="r-val" style="font-size:11px;color:var(--muted)">${sanitizeHTML(tx.receiptNumber)}</span></div>
    <div class="r-row"><span class="r-lbl">Academic Year</span><span class="r-val" style="color:var(--warn)">${sanitizeHTML(year)}</span></div>
    <div class="r-row"><span class="r-lbl">Months Cleared</span><span class="r-val">${months.map(m=>sanitizeHTML(m)).join(', ')}</span></div>
    <div class="r-row"><span class="r-lbl">Payment Mode</span><span class="r-val">${
      (Array.isArray(tx.paymentModeBreakup) && tx.paymentModeBreakup.length > 1)
        ? tx.paymentModeBreakup.map(r => `${sanitizeHTML(r.mode)} ₹${fmtNum(r.amount)}${r.mode==='Cheque' && r.chequeNumber ? ' (Chq# '+sanitizeHTML(r.chequeNumber)+')' : ''}`).join(' + ')
        : `${sanitizeHTML(tx.paymentMode)}${_getChequeNoDisplay(tx) ? ' (Chq# '+sanitizeHTML(_getChequeNoDisplay(tx))+')' : ''}`
    }</span></div>
    <div class="r-row"><span class="r-lbl">Date &amp; Time</span><span class="r-val">${
      // JSS-REF-VELTRIX-2026-005: through the shared resolver. The stored Timestamp was
      // already handled here, but the string fallback used `date + 'T00:00:00'` — the
      // DEVICE's local midnight, so the printed time moved with whoever opened it.
      fmtDate(tx.date || date)
    }</span></div>
  `;
  const remBal = tx.remainingBalance ?? 0;
  document.getElementById('pdr_total').innerHTML =
    `Amount Paid: ₹${fmtNum(amount)}` +
    (remBal > 0
      ? `<div style="margin-top:6px;font-size:13px;font-weight:600;color:var(--warn)">Remaining Outstanding: ₹${fmtNum(remBal)}</div>`
      : `<div style="margin-top:6px;font-size:12px;color:var(--success);font-weight:600">✅ All previous year dues cleared</div>`);
  box.style.display = 'block';
  window._lastPastDueTx = { tx, student, year, months, amount, date, schoolName };
}

function _pastDuePrint() {
  const d = window._lastPastDueTx;
  if (!d) return;
  const { tx, student, year, months, amount, date } = d;
  const txData = {
    receiptNumber:   tx.receiptNumber,
    studentName:     student.name || '—',
    admissionNo:     student.admissionNumber || '—',
    classSection:    (student.class||student.cls||'—') + ' – Sec ' + (student.section||'—'),
    // Through the shared resolver — never a raw parse of a date-only string.
    date:            fmtDateOnly(tx.date || date),
    paymentMode:     (Array.isArray(tx.paymentModeBreakup) && tx.paymentModeBreakup.length > 1)
                       ? tx.paymentModeBreakup.map(r => `${r.mode} ₹${fmtNum(r.amount)}${r.mode==='Cheque' && r.chequeNumber ? ' (Chq# '+r.chequeNumber+')' : ''}`).join(' + ')
                       : (tx.paymentMode || '—'),
    paymentStatus:   'CLEARED',
    feeHead:         `Past Due — ${months.join(', ')} (${year})`,
    amountPaid:      parseFloat(amount) || 0,
    remainingBalance: tx.remainingBalance ?? 0,
  };
  generateIndustryStandardReceipt(txData);
}
// END ARC-015 — PAST DUE RECORDING MODULE

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) {
    document.getElementById('searchDropdown').style.display='none';
  }
});


// ════════════════════════════════════════════════════════════════
// ARC-019 — EXCUSED SECTION MODULE (Principal Only)
// Zero-amount fee waiver with mandatory justification.
// Generates a formal EXCUSED receipt and audit log entry.
// ════════════════════════════════════════════════════════════════
window._excusedState = {};

function renderExcusedSection(params = {}) {
  setActiveNav('excused');
  setContent(`
    <div class="page-head flex-between">
      <div>
        <div class="page-title" style="display:flex;align-items:center;gap:10px">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" width="22" height="22">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          Fees Excused Students
        </div>
        <div class="page-sub">Zero-amount fee waiver with mandatory justification — generates formal EXCUSED receipt.</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">
      <div class="card">
        <div class="card-hdr"><span class="card-title">Waiver Details</span></div>
        <div class="card-body">
          <div id="excusedAlert"></div>

          <!-- Step 1: Student search -->
          <div class="form-group">
            <label class="form-label">Step 1 — Search Student *</label>
            <input class="form-control" id="excusedSearch" placeholder="Name or Admission Number" oninput="_excusedSearch(this.value)" autocomplete="off">
            <div id="excusedResults" style="background:var(--lifted);border:1px solid var(--border);border-radius:8px;margin-top:4px;display:none;max-height:180px;overflow-y:auto"></div>
          </div>

          <!-- ARC-013 lock notice -->
          <div id="excusedLockNotice" style="padding:10px 14px;background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:var(--rad);font-size:12px;color:#e09090;margin-bottom:14px">
            🔒 Select a student above to unlock the form.
          </div>

          <div id="excusedForm" style="pointer-events:none;opacity:0.4">
            <div id="excusedStudentBadge" style="display:none" class="alert alert-success"></div>
            <!-- Year Balance Banner (Fix #2) -->

            <!-- Step 2: Academic year (JSS-REF-VELTRIX-2026-005 ITEM 13) -->
            <div class="form-group">
              <label class="form-label">Step 2 — Academic Year *
                <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;margin-left:6px">Current or any past year with dues</span>
              </label>
              <select class="form-control" id="excusedYear" onchange="_excusedYearChange()">
                <option value="">Select academic year</option>
              </select>
              <div id="excusedYearHint" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
            </div>

            <!-- Step 3: Month grid -->
            <div class="form-group">
              <label class="form-label">Step 3 — Select Months to Excuse *
                <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;margin-left:6px">Amount is fixed at ₹0</span>
              </label>
              <div id="excusedMonthGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px">
                ${['June','July','August','September','October','November','December','January','February','March','April','May'].map(m=>`
                  <button type="button" data-month="${m}" onclick="_excusedToggleMonth(this)" style="
                    padding:8px 4px;border-radius:8px;border:1px solid var(--glass-border);
                    background:rgba(0,0,0,0.30);backdrop-filter:blur(4px);
                    color:var(--muted);font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;
                    cursor:pointer;transition:all 0.15s;text-align:center">
                    ${m.slice(0,3)}</button>`).join('')}
              </div>
              <div id="excusedMonthHint" style="font-size:11px;color:var(--muted);margin-top:7px">No months selected.</div>
            </div>

            <!-- Amount waived — auto-calculated from selected months -->
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;gap:8px">
                Waiver Amount (₹)
                <span id="excusedWaiverBadge" style="font-size:10px;font-weight:400;color:var(--warn);text-transform:none;background:rgba(212,150,42,0.12);padding:2px 8px;border-radius:4px">🔒 Auto-calculated · Read-only</span>
              </label>
              <input class="form-control" id="excusedWaiverAmount" value="0" readonly style="background:var(--depth);cursor:not-allowed;color:var(--success);font-weight:700">
              <div id="excusedWaiverHint" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
            </div>

            <!-- Step 3: Mandatory justification -->
            <div class="form-group">
              <label class="form-label">Step 4 — Justification / Reason * <span style="color:var(--danger);font-size:11px">(Cannot be blank)</span></label>
              <textarea class="form-control" id="excusedReason" rows="3" placeholder="e.g. Student absent for medical reasons — surgical recovery (Jan–Mar)…" style="resize:vertical"></textarea>
            </div>

            <!-- Date -->
            <div class="form-group">
              <label class="form-label">Waiver Date *</label>
              <input type="date" class="form-control" id="excusedDate">
            </div>

            <button id="excusedSaveBtn" class="btn btn-primary btn-full" onclick="_excusedSave()" style="background:var(--success);color:#fff;box-shadow:0 2px 14px rgba(82,200,122,0.35)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 11l3 3L22 4"/></svg>
              Confirm Waiver &amp; Generate EXCUSED Receipt
            </button>
          </div>
        </div>
      </div>

      <!-- Right: info + receipt -->
      <div>
        <div id="excusedHelpCard" class="card" style="margin-bottom:16px">
          <div class="card-body" style="font-size:13px;color:var(--muted);line-height:1.8">
            <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;color:var(--success);margin-bottom:8px">Fees Excused Students</div>
            <div style="margin-bottom:8px">Waive specific monthly fees for a student at <strong style="color:var(--success)">₹0</strong> with mandatory justification. A formal EXCUSED receipt is generated and dues are cleared.</div>
            <div style="padding:10px;background:rgba(82,200,122,0.08);border:1px solid rgba(82,200,122,0.2);border-radius:8px;font-size:12px;color:var(--success)">
              ✅ All waiver transactions are audit-logged with the approver name, justification, and timestamp.
            </div>
          </div>
        </div>
        <div id="excusedReceiptBox" class="receipt-box" style="display:none">
          <div class="receipt-hdr">
            <div class="receipt-logo">VELTRIX CAMPUS</div>
            <div id="excusedReceiptSchool" class="receipt-sub"></div>
            <div class="receipt-title" style="color:var(--success)">EXCUSED — WAIVER RECEIPT</div>
          </div>
          <div class="receipt-grid">
            <div id="exr_student"></div>
            <div id="exr_details"></div>
          </div>
          <div id="exr_reason" style="margin:12px 0;padding:10px;background:rgba(255,255,255,0.06);border-radius:8px;font-size:12px;color:var(--muted)"></div>
          <div id="exr_total" class="receipt-total" style="color:var(--success)"></div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
            <button class="btn btn-secondary btn-sm" onclick="_excusedPrint()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print EXCUSED Receipt
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Excused Candidates list — parity with Terminated / Hidden sections -->
    <div class="card" style="margin-top:20px">
      <div class="card-hdr flex-between">
        <span class="card-title">Excused Candidates</span>
        <div style="display:flex;align-items:center;gap:10px">
          <span id="excusedCandCount" class="muted" style="font-size:12px"></span>
          <!-- [ITEM-07] Dual Export: PDF + Excel — exports the Excused Candidates register -->
          <button class="btn btn-secondary btn-sm" onclick="exportExcusedPDF()" title="Export Excused Candidates as PDF">
            📄 PDF
          </button>
          <button class="btn btn-secondary btn-sm" onclick="exportExcusedXLSX()" title="Export Excused Candidates as Excel">
            📊 XLSX
          </button>
        </div>
      </div>
      <!-- ITEM 8: universal student search, matching the Due Fee per-year search. -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--glass-border);background:rgba(0,0,0,0.15)">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="position:relative;flex:1;min-width:220px;max-width:420px">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--muted);pointer-events:none">🔍</span>
            <input type="text" id="excusedSearchF" class="filter-bar-input"
              style="padding:7px 32px 7px 30px;font-size:12px;width:100%"
              placeholder="Student name · Adm# · Class · Reason · Approved by"
              oninput="_excusedCandSearch()">
            <span onclick="_excusedCandReset()" title="Clear"
              style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--muted);cursor:pointer">✕</span>
          </div>
          <span id="excusedSearchInfo" style="font-size:11px;color:var(--info);opacity:0.85"></span>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="tbl-wrap tbl-sticky">
          <table>
            <thead><tr><th>Name</th><th>Adm#</th><th>Class</th><th>Months Excused</th><th>Last Waiver Date</th><th>Reason</th><th>Approved By</th><th>Remaining Balance</th><th>Receipt</th></tr></thead>
            <tbody id="excusedCandBody"><tr><td colspan="9" style="text-align:center;padding:30px;color:var(--muted)">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  `);
  const t = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  document.getElementById('excusedDate').value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  window._excusedState = { student: null, months: [] };
  _excusedLock(true);
  _excusedRenderCandidates();
}

// SYNC FIX (Fix 3): Excused Candidates list — parity with Terminated & Hidden
// sections, which both show a table of affected students. Excused waivers are
// stored as feeTransactions docs with type === 'excused_waiver' (not a separate
// collection), so this groups them by studentId, takes the latest waiver as the
// "Last Waiver Date/Reason/Approved By", and pulls each student's CURRENT
// remaining balance from the students collection (kept in sync by Fix 2).
// ITEM 8: universal student search for Fees Excused Students, mirroring the Due Fee
// per-year search. Filters the rendered rows in place rather than re-querying or
// re-rendering, so it cannot drift from _excusedRenderCandidates()'s output (which is
// also what the PDF/Excel exports reuse via window._excusedCandRows).
function _excusedCandSearch() {
  const q    = (document.getElementById('excusedSearchF')?.value || '').trim().toLowerCase();
  const body = document.getElementById('excusedCandBody');
  const info = document.getElementById('excusedSearchInfo');
  if (!body) return;
  const dataRows = Array.from(body.querySelectorAll('tr')).filter(tr => !tr.querySelector('td[colspan]'));
  let shown = 0;
  dataRows.forEach(tr => {
    const match = !q || (tr.textContent || '').toLowerCase().includes(q);
    tr.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  if (info) info.textContent = q ? `Showing ${shown} of ${dataRows.length}` : '';
}
function _excusedCandReset() {
  const el = document.getElementById('excusedSearchF');
  if (el) el.value = '';
  _excusedCandSearch();
}

async function _excusedRenderCandidates() {
  const body = document.getElementById('excusedCandBody');
  const countEl = document.getElementById('excusedCandCount');
  if (!body) return;
  try {
    const snap = await schoolCol('feeTransactions')
      .where('type', '==', 'excused_waiver')
      .get();

    const byStudent = {};
    snap.docs.forEach(d => {
      const t = d.data();
      const sid = t.studentId;
      if (!sid) return;
      if (!byStudent[sid]) byStudent[sid] = [];
      byStudent[sid].push(t);
    });

    const studentIds = Object.keys(byStudent);
    if (studentIds.length === 0) {
      body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--muted)">No excused waivers recorded yet.</td></tr>`;
      if (countEl) countEl.textContent = '';
      window._excusedCandRows = [];
      return;
    }

    // Pull current remaining balance from the students collection (Fix 2 keeps
    // outstandingBalance in sync on every excused/recorded/terminated/hidden payment).
    let stuMap = {};
    try {
      const stuList = await getStudentCache();
      stuMap = Object.fromEntries(stuList.map(s => [s.id, s]));
    } catch(_) {}

    const rows = studentIds.map(sid => {
      const txs = byStudent[sid].slice().sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0));
      const latest = txs[0];
      const allMonths = Array.from(new Set(txs.flatMap(t => t.monthsExcused || t.monthsSelected || [])));
      const sInfo = stuMap[sid] || {};
      const remaining = Number(sInfo.outstandingBalance ?? latest.remainingBalance ?? 0) || 0;
      const dateStr = latest.date ? fmtDate(latest.date) : '—';

      return { sid, latest, allMonths, sInfo, remaining, dateStr };
    });

    // Sort by latest waiver date desc
    rows.sort((a,b) => (b.latest.date?.seconds||0) - (a.latest.date?.seconds||0));

    // [ITEM-07] Cache the computed rows so PDF/Excel export reuses this exact
    // dataset instead of re-querying — export always matches what's on screen.
    window._excusedCandRows = rows;

    if (countEl) countEl.textContent = `${rows.length} candidate${rows.length!==1?'s':''}`;

    body.innerHTML = rows.map(r => {
      const name   = r.latest.studentName || r.sInfo.name || '—';
      const admNo  = r.latest.admissionNo  || r.sInfo.admissionNumber || '—';
      const cls    = (r.latest.class || r.sInfo.class || '') + ' ' + (r.latest.section || r.sInfo.section || '');
      const monthsBadge = r.allMonths.map(m => `<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(82,200,122,0.12);color:var(--success);margin-right:3px;display:inline-block;margin-bottom:2px">${sanitizeHTML(m.slice(0,3))}</span>`).join('');
      const remainingCell = r.remaining > 0
        ? `<span style="color:var(--danger);font-weight:700">₹${fmtNum(r.remaining)}</span>`
        : `<span style="color:var(--success);font-weight:700">₹0 — Cleared</span>`;

      return `<tr>
        <td><strong>${sanitizeHTML(name)}</strong></td>
        <td class="muted">${sanitizeHTML(admNo)}</td>
        <td>${sanitizeHTML(cls.trim())}</td>
        <td style="max-width:220px">${monthsBadge || '—'}</td>
        <td class="muted">${r.dateStr}</td>
        <td style="max-width:240px;font-size:12px;color:var(--muted)" title="${sanitizeHTML(r.latest.reason||'')}">${sanitizeHTML((r.latest.reason||'—').slice(0,60))}${(r.latest.reason||'').length>60?'…':''}</td>
        <td class="muted">${sanitizeHTML(r.latest.approvedBy||'—')}</td>
        <td>${remainingCell}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="_excusedRowReceipt('${sanitizeHTML(r.sid)}')"
              title="Regenerate the EXCUSED receipt for ${sanitizeHTML(r.latest.receiptNumber || 'this waiver')}"
              style="white-space:nowrap;font-size:11px;padding:5px 10px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align:-2px;margin-right:4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Receipt</button></td>
      </tr>`;
    }).join('');
  } catch(e) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--danger)">Error loading excused candidates: ${sanitizeHTML(e.message)}</td></tr>`;
  }
}

function _excusedLock(locked) {
  // ARC-013: Delegate to shared framework-level utility
  _workflowLock('excusedForm', locked);
  const n = document.getElementById('excusedLockNotice');
  if (n) n.style.display = locked ? 'block' : 'none';
}

let _excusedDebounce = null;
function _excusedSearch(q) {
  clearTimeout(_excusedDebounce);
  window._excusedState.student = null;
  _excusedLock(true);
  q = (q||'').trim();
  if (q.length < 2) { document.getElementById('excusedResults').style.display='none'; return; }
  // BUG-⑦ FIX: Guard against null currentSchoolId (same as _pastDueSearch fix)
  if (!currentSchoolId) {
    const el = document.getElementById('excusedResults');
    if (el) { el.style.display='block'; el.innerHTML='<div class="s-item" style="color:var(--warn)">School not loaded — please refresh.</div>'; }
    return;
  }
  _excusedDebounce = setTimeout(async () => {
    const all  = await getStudentCache();
    const lq   = q.toLowerCase();
    // R6: a departed student who still owes money can be waived. The app already
    // lets you TAKE their money — Terminated and Hidden both carry a "Pay Dues"
    // button — so refusing to let the Principal write that same debt off was an
    // asymmetry, not a safeguard. Deleted students are gone from this collection
    // entirely, so they cannot appear here regardless.
    const hits = all.filter(s =>
      (s.name||'').toLowerCase().includes(lq) ||
      (s.admissionNumber||'').toLowerCase().includes(lq)
    ).slice(0,8);
    const el = document.getElementById('excusedResults');
    if (!hits.length) { el.style.display='none'; return; }
    el.style.display = 'block';
    el.innerHTML = hits.map(s=>{
      // R6: the list now includes terminated/hidden students, so each row must say
      // so. Without this they look identical to an active student.
      const _st = String(s.status||'active').toLowerCase();
      const _stBadge = _st !== 'active'
        ? ` <span style="font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:2px 6px;border-radius:4px;background:rgba(224,82,82,0.15);color:var(--danger);border:1px solid rgba(224,82,82,0.30)">${sanitizeHTML(_st)}</span>`
        : '';
      return `
      <div class="s-item" onclick="_excusedPick('${s.id}')">
        <div class="s-name">${sanitizeHTML(s.name)}${_stBadge}</div>
        <div class="s-meta">Adm# ${sanitizeHTML(s.admissionNumber||'—')} · ${sanitizeHTML(s.class||'')} ${sanitizeHTML(s.section||'')}</div>
      </div>`;}).join('');
  }, 300);
}

async function _excusedPick(sid) {
  document.getElementById('excusedResults').style.display = 'none';
  let list = []; try { list = await getStudentCache(); } catch(_) {}
  const s = list.find(x => x.id === sid);
  if (!s) return;
  window._excusedState.student = s;
  window._excusedState.months  = [];
  document.getElementById('excusedSearch').value = s.name || '';
  const badge = document.getElementById('excusedStudentBadge');
  if (badge) { badge.style.display='block'; badge.innerHTML = `Student: <strong>${sanitizeHTML(s.name)}</strong> · ${sanitizeHTML(s.class||'')} ${sanitizeHTML(s.section||'')} · Adm# ${sanitizeHTML(s.admissionNumber||'—')}`; }

  // Reset all pills to default unlocked state first
  document.querySelectorAll('#excusedMonthGrid button').forEach(p => {
    p.dataset.selected = 'false';
    p.dataset.paid     = 'false';
    p.disabled         = false;
    p.style.background    = 'rgba(0,0,0,0.30)';
    p.style.color         = 'var(--muted)';
    p.style.borderColor   = 'var(--glass-border)';
    p.style.opacity       = '1';
    p.style.cursor        = 'pointer';
    p.textContent         = p.dataset.month.slice(0,3);
  });
  document.getElementById('excusedMonthHint').textContent = 'No months selected.';

  // ══════════════════════════════════════════════════════════════════════════
  // JSS-REF-VELTRIX-2026-005 ITEM 13 — the waiver is no longer current-year only.
  //
  // This block used to hard-filter every transaction to the CURRENT academic year
  // and read only s.monthStatus, so a past year's dues could never be excused —
  // the months showed as unpaid-and-selectable but the saved waiver was tagged with
  // the current year, landing the credit on the wrong year entirely.
  //
  // The student's transactions are fetched ONCE here and cached on _excusedState;
  // switching the year selector re-locks the grid from that cache without another
  // read. _excusedYearChange() below does the per-year work.
  // ══════════════════════════════════════════════════════════════════════════
  try {
    const txSnap = await schoolCol('feeTransactions').where('studentId','==',sid).get();
    window._excusedState.allTxs = txSnap.docs.map(d => d.data());
  } catch(e) {
    window._excusedState.allTxs = [];
    console.warn('[EXCUSED-SYNC] Transaction fetch failed:', e.message);
  }

  // Populate the academic-year selector from this student's OWN data, via the shared
  // _flStudentAcademicYears — the same builder Record Previous Year Dues uses.
  // includeCurrent: true, because Fees Excused covers the current year AND past years.
  try {
    const _yrSel = document.getElementById('excusedYear');
    if (_yrSel) {
      const _years = _flStudentAcademicYears(s, window._excusedState.allTxs, { includeCurrent: true });
      const _cur   = _normaliseAcademicYear(_getCurrentAcademicYearStr());
      _yrSel.innerHTML = '<option value="">Select academic year</option>' +
        _years.map(y => `<option value="${y}">${y}${y === _cur ? ' (current)' : ''}</option>`).join('');
      // Default to the current year — the common case — falling back to the newest
      // year the student actually has data for.
      _yrSel.value = _years.includes(_cur) ? _cur : (_years[0] || '');
    }
  } catch(e) { console.warn('[EXCUSED-SYNC] Year list build failed:', e.message); }

  await _excusedYearChange();
  _excusedLock(false);
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 13 — re-lock the month grid for the SELECTED year.
//
// Runs on student select and on every year change. All three lock states (paid,
// excused, concession) are resolved for whichever year is chosen, so excusing a
// past year behaves exactly like excusing the current one.
//
// Paid/excused come from the shared _flClosedMonthsForYear, which reads that year's
// grid via _flGridForYear and its ledger via _flAppliedByMonthFromTxs — the same two
// sources the engine uses, so this grid cannot disagree with what the student
// actually owes for that year.
// ════════════════════════════════════════════════════════════════════════════
async function _excusedYearChange() {
  const st = window._excusedState || {};
  const s  = st.student;
  if (!s) return;
  const year = (document.getElementById('excusedYear')?.value || '').trim();
  st.year    = year;
  st.months  = [];

  // Rate for THAT year's class — not today's class. A student promoted since then
  // must have the past year waived at the rate that year was billed at.
  const _yrCls  = (typeof _resolveClassForYear === 'function' && year)
    ? _resolveClassForYear(s, year) : (s.class || s.cls || '');
  // L2/L8: _flRateForClass already does exact -> trimmed -> getClassRate -> fallback,
  // in that order. This hand-rolled chain skipped the trimmed step.
  const _yrRate = _yrCls ? _flRateForClass(_yrCls, s.monthlyFee || 0) : (s.monthlyFee || 0);
  st.yearClass = _yrCls;
  st.yearRate  = _yrRate;

  // Reset every pill to the default unlocked state before re-locking for this year.
  document.querySelectorAll('#excusedMonthGrid button').forEach(p => {
    p.dataset.selected = 'false';
    p.dataset.paid     = 'false';
    p.disabled         = false;
    p.title            = '';
    p.style.background  = 'rgba(0,0,0,0.30)';
    p.style.color       = 'var(--muted)';
    p.style.borderColor = 'var(--glass-border)';
    p.style.opacity     = '1';
    p.style.cursor      = 'pointer';
    p.textContent       = p.dataset.month.slice(0,3);
  });
  const _mh = document.getElementById('excusedMonthHint');
  if (_mh) { _mh.textContent = 'No months selected.'; _mh.style.color = 'var(--muted)'; }
  const _wa = document.getElementById('excusedWaiverAmount');
  const _wh = document.getElementById('excusedWaiverHint');
  if (_wa) _wa.value = '0';
  if (_wh) _wh.textContent = '';

  const _yrHint = document.getElementById('excusedYearHint');
  if (!year) {
    if (_yrHint) { _yrHint.textContent = 'Select an academic year to load its months.'; _yrHint.style.color = 'var(--warn)'; }
    return;
  }

  const _yrTxs = (st.allTxs || []).filter(t => _normaliseAcademicYear(t.academicYear) === _normaliseAcademicYear(year));
  let paid = new Set(), excused = new Set();
  try {
    const _closed = _flClosedMonthsForYear(s, year, _yrTxs, _yrRate);
    paid = _closed.paid; excused = _closed.excused;
    document.querySelectorAll('#excusedMonthGrid button').forEach(btn => {
      const m = btn.dataset.month;
      if (excused.has(m)) {
        // Previously excused — bright green, "✓ EXCUSED" label
        btn.dataset.paid     = 'true';
        btn.disabled         = true;
        btn.title            = `${m} ${year} already excused (waived) — cannot waive again`;
        btn.style.background = 'rgba(82,200,122,0.18)';
        btn.style.color      = 'var(--success)';
        btn.style.borderColor= 'rgba(82,200,122,0.60)';
        btn.style.opacity    = '1';
        btn.style.cursor     = 'not-allowed';
        btn.innerHTML        = `${m.slice(0,3)}<br><span style="font-size:7px;letter-spacing:0.5px;font-weight:700">✓ EXCUSED</span>`;
      } else if (paid.has(m)) {
        // Fee paid — muted green, "✓ PAID" label
        btn.dataset.paid     = 'true';
        btn.disabled         = true;
        btn.title            = `${m} ${year} already paid — cannot waive`;
        btn.style.background = 'rgba(82,200,122,0.10)';
        btn.style.color      = 'var(--success)';
        btn.style.borderColor= 'rgba(82,200,122,0.35)';
        btn.style.opacity    = '0.65';
        btn.style.cursor     = 'not-allowed';
        btn.innerHTML        = `${m.slice(0,3)}<br><span style="font-size:8px;letter-spacing:0.5px;font-weight:700">✓ PAID</span>`;
      }
    });
  } catch(e) {
    console.warn('[EXCUSED-SYNC] Paid month lock failed:', e.message);
  }

  // CONCESSION SYNC: fetch this student's concession activeMonths and mark those
  // pills as "concession covered" — they already have a fee reduction set by the
  // Principal and must not be double-waived via Excused Section.
  // Visual: amber/gold border, disabled, shows "CONCESSION" label.
  try {
    const admNo = s.admissionNumber || '';
    window._excusedState.concessionActiveMonths = [];
    window._excusedState.concessionRate = null;
    if (admNo) {
      const cSnap = await schoolCol('concessionFees')
        .where('admissionNo', '==', admNo)
        .limit(1).get();
      if (!cSnap.empty) {
        const cData = cSnap.docs[0].data();
        const activeMonths = Array.isArray(cData.activeMonths) ? cData.activeMonths : [];
        window._excusedState.concessionActiveMonths = activeMonths;
        window._excusedState.concessionRate = (typeof cData.concessionFee === 'number') ? cData.concessionFee : null;
        // Per-month concession override (ITEM-02). Loaded so the excused section
        // prices a covered month exactly as the ENGINE does — see _excRateForMonth.
        window._excusedState.concessionMonthlyBreakdown =
          (cData.monthlyBreakdown && typeof cData.monthlyBreakdown === 'object') ? cData.monthlyBreakdown : {};

        if (activeMonths.length > 0) {
          // Build a set of full-month-name strings covered by this concession
          // activeMonths format: ['2026-07','2026-08',...]
          const _MONTH_NAME = {
            '01':'January','02':'February','03':'March','04':'April',
            '05':'May','06':'June','07':'July','08':'August',
            '09':'September','10':'October','11':'November','12':'December'
          };
          // ITEM 13: the calendar YEAR half of each key was being thrown away, so a
          // concession active in 2026-27 locked the same month names in every past
          // year too — blocking waivers for years the concession never covered.
          // Keep only keys that fall inside the SELECTED academic year: months
          // 06-12 belong to its first calendar year, 01-05 to its second.
          const _ayStart = parseInt(String(year).slice(0, 4), 10);
          const coveredMonthNames = new Set(
            activeMonths.map(k => {
              const [yy, mm] = String(k).split('-');
              if (!mm || !_MONTH_NAME[mm]) return null;
              const belongsTo = parseInt(mm, 10) >= 6 ? _ayStart : _ayStart + 1;
              return parseInt(yy, 10) === belongsTo ? _MONTH_NAME[mm] : null;
            }).filter(Boolean)
          );
          document.querySelectorAll('#excusedMonthGrid button').forEach(btn => {
            // Skip already-paid pills
            if (btn.dataset.paid === 'true') return;
            if (!coveredMonthNames.has(btn.dataset.month)) return;
            btn.dataset.paid      = 'concession';
            btn.disabled          = true;
            btn.title             = `${btn.dataset.month} — covered by concession (₹${fmtNum(cData.concessionFee)}/month set by Principal)`;
            btn.style.background  = 'rgba(201,168,76,0.12)';
            btn.style.color       = 'var(--gold-lt)';
            btn.style.borderColor = 'rgba(201,168,76,0.45)';
            btn.style.opacity     = '0.75';
            btn.style.cursor      = 'not-allowed';
            btn.innerHTML         = `${btn.dataset.month.slice(0,3)}<br><span style="font-size:7px;letter-spacing:0.5px;font-weight:700">CONCESSION</span>`;
          });
        }
      }
    }
  } catch(e) {
    console.warn('[EXCUSED-SYNC] Concession month lock failed:', e.message);
  }

  // ITEM 13: tell the clerk which year and rate they are about to waive at, so a
  // past-year waiver can never be mistaken for a current-year one.
  const _yrHintEl = document.getElementById('excusedYearHint');
  if (_yrHintEl) {
    const _isCur = _normaliseAcademicYear(year) === _normaliseAcademicYear(_getCurrentAcademicYearStr());
    _yrHintEl.innerHTML = _yrRate > 0
      ? `Waiving <strong>${sanitizeHTML(year)}</strong>${_isCur ? ' (current year)' : ' — past year dues'} ` +
        `at the ${sanitizeHTML(_yrCls || '—')} rate of ₹${fmtNum(_yrRate)}/month.`
      : `No fee rate found for ${sanitizeHTML(_yrCls || 'this class')} in ${sanitizeHTML(year)} — check the fee structure.`;
    _yrHintEl.style.color = _yrRate > 0 ? 'var(--muted)' : 'var(--danger)';
  }
}

function _excusedToggleMonth(btn) {
  // SYNC FIX: guard — paid/concession pills are disabled but onclick fires on some browsers anyway
  if (btn.dataset.paid === 'true' || btn.dataset.paid === 'concession' || btn.disabled) return;
  const isSelected = btn.dataset.selected === 'true';
  btn.dataset.selected = isSelected ? 'false' : 'true';
  btn.style.background  = isSelected ? 'rgba(0,0,0,0.30)'       : 'rgba(82,200,122,0.18)';
  btn.style.color       = isSelected ? 'var(--muted)'           : 'var(--success)';
  btn.style.borderColor = isSelected ? 'var(--glass-border)'    : 'rgba(82,200,122,0.5)';
  window._excusedState.months = Array.from(
    document.querySelectorAll('#excusedMonthGrid button[data-selected="true"]')
  ).map(p => p.dataset.month);
  const hint       = document.getElementById('excusedMonthHint');
  const waiverEl   = document.getElementById('excusedWaiverAmount');
  const waiverHint = document.getElementById('excusedWaiverHint');
  const months  = window._excusedState.months;
  const student = window._excusedState.student;
  if (!months.length) {
    if (hint) { hint.textContent = 'No months selected.'; hint.style.color = 'var(--muted)'; }
    if (waiverEl) waiverEl.value = '0';
    if (waiverHint) waiverHint.textContent = '';
    return;
  }
  // Calculate waiver amount at the rate for the SELECTED academic year's class.
  // ITEM 13: this used to read the student's CURRENT class rate, so waiving a past
  // year for a since-promoted student valued those months at the new class's fee.
  // _excusedYearChange resolves the year's class and rate; fall back to the current
  // class only when no year is selected yet.
  const cls      = window._excusedState.yearClass || (student ? (student.class || student.cls || '') : '');
  const stdRate  = window._excusedState.yearRate
                   || (cls ? _flRateForClass(cls, 0) : 0);   // L2/L8: one resolver
  const total    = stdRate * months.length;

  // Update month hint
  if (hint) {
    if (total > 0) {
      hint.innerHTML = `${months.length} month(s): ${months.join(', ')}&nbsp;·&nbsp;<span style="color:var(--success);font-weight:700">₹${fmtNum(total)} waived</span> <span style="color:var(--muted);font-size:10px">(standard rate ₹${fmtNum(stdRate)}/month × ${months.length} — excused at ₹0)</span>`;
    } else {
      hint.textContent = months.length + ' month(s): ' + months.join(', ');
    }
    hint.style.color = 'var(--success)';
  }

  // Update Waiver Amount field with actual monetary value being waived
  if (waiverEl) waiverEl.value = total;
  if (waiverHint && stdRate > 0) {
    waiverHint.innerHTML = `<span style="color:var(--muted)">₹${fmtNum(stdRate)}/month × ${months.length} month${months.length !== 1 ? 's' : ''} = <strong style="color:var(--success)">₹${fmtNum(total)}</strong> fully waived (student pays ₹0)</span>`;
  }
}

async function _excusedSave() {
  // DUPLICATE LOCK: disable button immediately on first click — same pattern as VLX-REF-001
  const _excBtn = document.getElementById('excusedSaveBtn');
  if (_excBtn) {
    if (_excBtn.disabled) return; // already processing — block repeat clicks
    _excBtn.disabled = true;
    _excBtn.innerHTML = '<span style="opacity:0.7">⏳ Processing…</span>';
  }
  showFormAlert('excusedAlert','','');
  const state   = window._excusedState;
  const student = state?.student;
  if (!student?.id) { showFormAlert('excusedAlert','Please search and select a student first.','danger'); return; }
  const months  = state.months || [];
  if (!months.length) { showFormAlert('excusedAlert','Select at least one month to excuse.','danger'); return; }
  // ITEM 13: the waiver year is now explicit. Without it the transaction would be
  // tagged with the current year and the credit would land on the wrong year.
  const _excYear = (state.year || document.getElementById('excusedYear')?.value || '').trim();
  if (!_excYear) {
    if (_excBtn) { _excBtn.disabled = false; _excBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 11l3 3L22 4"/></svg> Confirm Waiver &amp; Generate EXCUSED Receipt'; }
    showFormAlert('excusedAlert','Select the academic year being waived.','danger'); return;
  }
  const reason  = (document.getElementById('excusedReason')?.value||'').trim();
  if (!reason)  {
    if (_excBtn) { _excBtn.disabled = false; _excBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 11l3 3L22 4"/></svg> Confirm Waiver &amp; Generate EXCUSED Receipt'; }
    showFormAlert('excusedAlert','Justification / reason is mandatory and cannot be blank.','danger'); return;
  }
  const date    = (document.getElementById('excusedDate')?.value||'').trim();
  if (!date) {
    if (_excBtn) { _excBtn.disabled = false; _excBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 11l3 3L22 4"/></svg> Confirm Waiver &amp; Generate EXCUSED Receipt'; }
    showFormAlert('excusedAlert','Select a waiver date.','danger'); return;
  }

  const approvedBy = currentProfile?.name || currentUser?.email || 'Principal';
  const receiptNumber = 'EXC-' + Date.now().toString(36).toUpperCase();

  // ITEM-7 FIX — REMAINING BALANCE MISCALCULATING IN EXCUSED SECTION:
  // Both the "amount waived" figure and the post-waiver "remaining balance" used to be
  // computed independently and inconsistently with the rest of the app:
  //   - amountWaived used a FLAT standard rate × months, ignoring any concession active
  //     on the excused months, so it could overstate what was actually being waived.
  //   - remainingBalance was "seeded" from the latest current-year feeTransactions doc's
  //     remainingBalance field. If the student had no current-year transaction yet
  //     (e.g. their very first fee action this year is an excused waiver), that seed
  //     defaulted to 0 — so newBalance = max(0, 0 - deduct) always came out ₹0, even
  //     though the student's true annual obligation was still outstanding.
  // Fix: mirror Record Payment's proven live calculation (calcLockedFee / VLX-REF-006)
  // — sum the concession-aware rate for every currently-UNPAID month pill on screen
  // (paid, already-excused, and concession-locked pills are excluded — the grid already
  // marks those), then subtract exactly what's being excused now. This keeps the
  // Excused Section balance in sync with what the on-screen month grid shows, with no
  // dependency on a possibly-missing prior transaction.
  // ITEM 13: class and rate for the YEAR BEING WAIVED, not the student's class today.
  // A student promoted since then must have a past year valued at what that year was
  // billed at — _excusedYearChange resolved both; these fall back to the current class
  // only if that never ran.
  const _excCls     = state.yearClass || student.class || student.cls || '';
  const _excInfo    = getClassRate(_excCls);
  const _excStdRate = state.yearRate || _excInfo?.rate || _flRateForClass(_excCls, 0);   // L2/L8
  const _excCoveredMonths = new Set(state.concessionActiveMonths || []);
  const _excConcRate = state.concessionRate;
  // ITEM 13: anchor the concession month-key window to the year BEING WAIVED, not
  // the current one, so a concession is matched against the right calendar months.
  // (The month->number map that used to live here is gone; _flConcMonthKey owns it.)
  const _excAcadYrStr = _excYear;
  // DEEP-AUDIT FIX — was a FOURTH hand-rolled copy of the concession month-key + rate
  // logic (after the engine, record-payment's quote, and _markConcessionMonths, all
  // of which R1/L2 already routed through _flConcessionRateForMonth). This copy also
  // never honoured monthlyBreakdown — a per-month concession override — so the section's
  // "total outstanding" priced an overridden month at the flat concession rate while
  // the engine priced it at the override. Now it delegates to the SAME resolver the
  // engine uses, keyed off the SELECTED year, so it cannot drift.
  const _excConcRecord = {
    concessionFee:    (typeof _excConcRate === 'number') ? _excConcRate : -1,
    activeMonths:     Array.from(_excCoveredMonths || []),
    monthlyBreakdown: (state.concessionMonthlyBreakdown && typeof state.concessionMonthlyBreakdown === 'object')
                        ? state.concessionMonthlyBreakdown : {},
  };
  function _excRateForMonth(monthName) {
    if (typeof _excConcRate !== 'number' || _excConcRate < 0) return _excStdRate; // no concession
    if (typeof _flConcessionRateForMonth === 'function') {
      return _flConcessionRateForMonth(_excConcRecord, _excAcadYrStr, monthName, _excStdRate);
    }
    return _excStdRate;   // resolver unavailable — safe fallback to the class rate
  }
  const _amountWaived = months.reduce((sum, m) => sum + _excRateForMonth(m), 0);

  const _excClassSection = (student.class || student.cls || '')
    ? `${student.class || student.cls}${student.section ? ' – Section ' + student.section : ''}`
    : '—';

  const tx = {
    type:           'excused_waiver',
    studentId:      student.id,
    studentName:    student.name || '',
    admissionNo:    student.admissionNumber || '',
    admissionNumber: student.admissionNumber || '',
    class:          student.class || student.cls || '',
    section:        student.section || '',
    block:          student.block   || '',
    // BUG-FIX (VLX013→VLX014): These fields were missing from excused_waiver docs,
    // causing Paid Fee table and Dashboard Recent Transactions to show blanks for
    // Class, Fee Head, Mode columns on excused entries.
    classSection:   _excClassSection,
    feeHead:        `EXCUSED WAIVER — ${months.join(', ')} (${_excYear})`,
    paymentMode:    'N/A — EXCUSED WAIVER',
    parentName:     student.parentName || '',
    contactNo:      student.contact || student.contactNo || student.phone || '',
    recordedByName: currentProfile?.name || currentUser?.email || 'Principal',
    monthsExcused:  months,
    // SYNC FIX: mirror monthsExcused into monthsSelected — this is the field
    // selectFeeStudent() scans (academicYear === currentYear) to lock "already
    // paid/cleared" month pills in Record Payment. Without this, excused months
    // stay selectable in Record Payment, letting staff pay for a month that was
    // already waived → double entry + desynced balances.
    monthsSelected: months,
    amountPaid:     0,
    amountWaived:   _amountWaived,
    reason,
    approvedBy,
    approverUid:    currentUser?.uid || '',
    // SYNC FIX: store as Firestore Timestamp (not raw string) — every other fee
    // module (Record Payment, Past Due, Terminated, Hidden) stores `date` this way,
    // and selectFeeStudent()'s prevBalance lookup runs orderBy('date','desc') across
    // all feeTransactions for the student. A string date here breaks that ordering.
    // JSS-REF-VELTRIX-2026-005: was `new Date(date)`, which parses 'YYYY-MM-DD' as UTC
    // MIDNIGHT — stored that way, every waiver rendered as 05:30 am in IST, frozen at
    // the offset itself. An EVENT timestamp: the chosen date, at the current IST time.
    date:           istTimestampFromDateInput(date, 'now'),
    receiptNumber,
    // ITEM 13: the year the clerk chose. Hardcoding the current year is what made
    // waiving a past year impossible — the credit always landed on the current one.
    // _syncStudentFinancials already recomputes every year it finds on a transaction,
    // so a prior-year waiver reconciles through the same path with no extra wiring.
    academicYear:   _excYear,
    status:         'EXCUSED',
    paymentStatus:  'EXCUSED',
    // SYNC FIX: remainingBalance will be computed AFTER the deduction below and
    // back-filled into this tx doc (see post-write update). Placeholder for now.
    remainingBalance: 0,
    createdAt:      firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const db = firebase.firestore();
    const stuRef = schoolCol('students').doc(student.id);
    const txRef  = schoolCol('feeTransactions').doc();

    // ITEM-7 FIX: live, pill-based remaining balance — see note above. Sum the
    // concession-aware rate for every currently-unpaid month pill (this already
    // includes the months about to be excused), then subtract exactly what's
    // being excused now to get what's left owed for the rest of the year.
    const _unpaidPillMonths = Array.from(document.querySelectorAll('#excusedMonthGrid button'))
      .filter(b => b.dataset.paid !== 'true' && b.dataset.paid !== 'concession')
      .map(b => b.dataset.month);
    const totalOutstanding = _unpaidPillMonths.reduce((sum, m) => sum + _excRateForMonth(m), 0);
    const deduct = _amountWaived;

    // SYNC FIX (Fix 2): atomic transaction — write the excused tx + update
    // student.outstandingBalance together. Re-checks student doc exists inside
    // the transaction (no stale-snapshot dependency for the write itself).
    //
    // JSS-REF-VELTRIX-2026-005 ITEM 9: the provisional balance is now the student's
    // OWN all-years aggregate minus the waiver, read inside the transaction. It used
    // to be "this year's unpaid pills minus the waiver" — a current-year-only figure
    // written straight over outstandingBalance, which is the ALL-YEARS aggregate every
    // screen reads. Excusing one month therefore erased the student's entire prior-year
    // carry-forward until the next recompute happened to restore it (and left it erased
    // for good if that recompute failed). The pill sum survives only as the fallback for
    // a student who has no aggregate yet. _syncStudentFinancials below remains the sole
    // authoritative writer; this value just keeps the doc sane in between.
    let newBalance = 0;
    await db.runTransaction(async (transaction) => {
      const _stuSnap = await transaction.get(stuRef);
      const _prevAgg = Number(_stuSnap.exists ? _stuSnap.data().outstandingBalance : NaN);
      const _base    = Number.isFinite(_prevAgg) ? _prevAgg : totalOutstanding;
      newBalance     = Math.max(0, _base - deduct);
      tx.remainingBalance = newBalance;
      transaction.set(txRef, tx);
      transaction.update(stuRef, {
        outstandingBalance: newBalance,
        fee_status:         newBalance <= 0 ? 'paid' : 'pending',
        updatedAt:          firebase.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Audit log
    try { auditLog('excused_waiver', { studentName: student.name, months, reason, approvedBy, receiptNumber, newOutstandingBalance: newBalance }); } catch(_) {}

    // ITEM-10 FIX: canonical cross-module reconciliation as the final step.
    await _syncStudentFinancials(student.id);

    invalidateStudentCache();
    invalidateFinanceCache();
    _excusedShowReceipt(tx, student, months, date, reason, approvedBy);
    _excusedRenderCandidates(); // SYNC FIX (Fix 3): refresh candidate list immediately
    showToast('Waiver confirmed — EXCUSED receipt generated.','success');
    // DUPLICATE LOCK: keep button permanently disabled after success.
    // Form inputs also locked — user must use 'New Waiver' to start fresh.
    if (_excBtn) {
      _excBtn.disabled = true;
      _excBtn.style.background = 'rgba(82,200,122,0.25)';
      _excBtn.style.boxShadow = 'none';
      _excBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 11l3 3L22 4"/></svg> ✅ Waiver Confirmed';
    }
    // Lock all form inputs in the excused form
    ['excusedReason','excusedDate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.disabled = true; el.style.opacity = '0.5'; el.style.cursor = 'not-allowed'; }
    });
    // Lock month pills
    document.querySelectorAll('#excusedMonthGrid .month-pill, #excusedMonthGrid button').forEach(b => {
      b.disabled = true; b.style.pointerEvents = 'none'; b.style.opacity = '0.6';
    });
    // Show 'New Waiver' reset button
    const _excFormWrap = document.getElementById('excusedForm');
    if (_excFormWrap) {
      const _newBtn = document.createElement('button');
      _newBtn.className = 'btn btn-secondary btn-full';
      _newBtn.style.marginTop = '12px';
      _newBtn.textContent = '+ New Waiver';
      _newBtn.onclick = () => renderExcusedSection();
      _excFormWrap.appendChild(_newBtn);
    }
  } catch(e) {
    showFormAlert('excusedAlert','Error saving waiver: ' + e.message,'danger');
    // Re-enable button on error so user can retry
    if (_excBtn) {
      _excBtn.disabled = false;
      _excBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M9 11l3 3L22 4"/></svg> Confirm Waiver &amp; Generate EXCUSED Receipt';
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 — regenerate an EXCUSED receipt from the candidates row.
//
// The receipt used to exist only in the moment: it was rendered once, immediately
// after saving a waiver, and if the clerk navigated away it was gone. Reprinting
// meant re-issuing the waiver, which would have double-counted amountWaived.
//
// This renders the SAME receipt through the SAME function the save path calls
// (_excusedShowReceipt), from the transaction already loaded into the row — no
// re-query, no second renderer, and nothing is written. It also populates
// window._lastExcusedTx, so the existing Print button works on it unchanged.
//
// A student may hold several waivers; the row shows the LATEST, so that is the one
// regenerated. The button's tooltip names the receipt number so which one is never
// ambiguous.
// ════════════════════════════════════════════════════════════════════════════
function _excusedRowReceipt(sid) {
  const row = (window._excusedCandRows || []).find(r => r.sid === sid);
  if (!row || !row.latest) { showToast('Receipt data not loaded — reopen this page and try again.', 'danger'); return; }
  const tx = row.latest;
  // The row's own months are every month across ALL of this student's waivers; the
  // receipt must show only the months on THIS transaction.
  const months = (tx.monthsExcused && tx.monthsExcused.length ? tx.monthsExcused
                 : (tx.monthsSelected || []));
  // Saved receipts carry a Firestore Timestamp; the renderer expects something
  // `new Date()` accepts.
  const when = (tx.date && typeof tx.date.toDate === 'function') ? tx.date.toDate()
             : (tx.date || new Date());
  const student = {
    name:            tx.studentName || row.sInfo.name || '—',
    class:           tx.class || row.sInfo.class || '',
    cls:             tx.class || row.sInfo.class || '',
    admissionNumber: tx.admissionNumber || tx.admissionNo || row.sInfo.admissionNumber || '—',
  };
  _excusedShowReceipt(tx, student, months, when, tx.reason || '—', tx.approvedBy || '—');
  document.getElementById('excusedReceiptBox')?.scrollIntoView({ behavior:'smooth', block:'center' });
}

function _excusedShowReceipt(tx, student, months, date, reason, approvedBy) {
  const box  = document.getElementById('excusedReceiptBox');
  const help = document.getElementById('excusedHelpCard');
  if (!box) return;
  if (help) help.style.display = 'none';
  const schoolName = currentProfile?.schoolName || currentSchoolId || 'School';
  document.getElementById('excusedReceiptSchool').textContent = schoolName;
  document.getElementById('exr_student').innerHTML = `
    <div class="r-row"><span class="r-lbl">Student Name</span><span class="r-val">${sanitizeHTML(student.name||'—')}</span></div>
    <div class="r-row"><span class="r-lbl">Class</span><span class="r-val">${sanitizeHTML(student.class||student.cls||'—')}</span></div>
    <div class="r-row"><span class="r-lbl">Admission No</span><span class="r-val">${sanitizeHTML(student.admissionNumber||'—')}</span></div>
  `;
  document.getElementById('exr_details').innerHTML = `
    <div class="r-row"><span class="r-lbl">Receipt No</span><span class="r-val" style="font-size:11px;color:var(--muted)">${sanitizeHTML(tx.receiptNumber)}</span></div>
    <div class="r-row"><span class="r-lbl">Academic Year</span><span class="r-val" style="color:var(--warn)">${sanitizeHTML(tx.academicYear||_getCurrentAcademicYearStr())}</span></div>
    <div class="r-row"><span class="r-lbl">Months Excused</span><span class="r-val">${months.map(m=>sanitizeHTML(m)).join(', ')}</span></div>
    <div class="r-row"><span class="r-lbl">Approved By</span><span class="r-val">${sanitizeHTML(approvedBy)}</span></div>
    <div class="r-row"><span class="r-lbl">Date &amp; Time</span><span class="r-val">${
      // JSS-REF-VELTRIX-2026-005: show the instant that was actually STORED on the
      // transaction. This used to be `new Date(date)` on the raw 'YYYY-MM-DD' form
      // value — UTC midnight, rendered as 05:30 am in IST on every single receipt,
      // even after the storage side was fixed. tx.date first; the form value only as
      // a fallback, and then through the shared resolver rather than raw parsing.
      fmtDate(tx.date || date)
    }</span></div>
  `;
  document.getElementById('exr_reason').innerHTML = `<strong style="color:var(--muted)">Justification:</strong> ${sanitizeHTML(reason)}`;
  const _waived = typeof tx.amountWaived === 'number' && tx.amountWaived > 0
    ? `₹${fmtNum(tx.amountWaived)}`
    : '₹0';
  document.getElementById('exr_total').innerHTML = `Amount Waived: ${_waived} (EXCUSED — Student Pays ₹0)`;
  box.style.display = 'block';
  window._lastExcusedTx = { tx, student, months, date, reason, approvedBy, schoolName };
}

function _excusedPrint() {
  const d = window._lastExcusedTx;
  if (!d) return;
  const txData = {
    receiptNumber:   d.tx.receiptNumber,
    studentName:     d.student.name || '—',
    admissionNo:     d.student.admissionNumber || '—',
    classSection:    (d.student.class||d.student.cls||'—') + ' – Sec ' + (d.student.section||'—'),
    // Same fix as the on-screen receipt: the STORED instant, resolved through the
    // shared helper — never `new Date('YYYY-MM-DD')`, which is UTC midnight.
    date:            fmtDateOnly(d.tx?.date || d.date),
    paymentMode:     'N/A — EXCUSED WAIVER',
    paymentStatus:   'EXCUSED',
    feeHead:         `EXCUSED — ${d.months.join(', ')} | Reason: ${d.reason}`,
    amountPaid:      0,
    amountWaived:    d.tx.amountWaived || 0,
    academicYear:    d.tx.academicYear || _getCurrentAcademicYearStr(),
    hideRemainingBalance: true,
  };
  generateIndustryStandardReceipt(txData);
}
// END ARC-019 — EXCUSED SECTION

// Point 14: Fee Category module (ARC-018) completely removed.

