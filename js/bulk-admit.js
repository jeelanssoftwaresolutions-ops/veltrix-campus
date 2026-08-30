/* ============================================================
   PHASE 8 #01 — BULK STUDENT ADMISSION
   [CHG-016] Upgraded to BulkAdmit Import Format v2.0 per Blueprint v3.0.
   Old v1 format is DEPRECATED and rejected on upload.
   v2.0 Required columns: StudentName, Block, Class(Prev), Class(Curr),
     Section, Gender, AdmissionNo, ParentName, ContactNumber,
     AcademicYear, MonthlyFee, MonthsPaidBeforePromotion, PromotionStatus,
     OutstandingBalance, + 12 month columns (Jun→May), TotalDue,
     MonthsDue, MonthsCleared.
   KEY FIELD: MonthsPaidBeforePromotion drives DueTracker auto-lock logic.
   Validates all required fields before committing to Firestore.
   Shows progress indicator and final success/failure summary.
   ============================================================ */
function renderBulkAdmit() {
  setContent(`
    <div class="page-head flex-between">
      <div>
        <div class="page-title">Bulk Student Admission</div>
        <div class="page-sub">Upload a CSV or Excel file to admit multiple students at once</div>
      </div>
      <button class="btn btn-ghost" onclick="navigate('students')">← Back</button>
    </div>

    <div style="max-width:780px">
      <!-- Template Download -->
      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr"><span class="card-title">Step 1 — Download Template</span></div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--muted);margin-bottom:14px">
            Fill in the provided template. All columns marked <strong style="color:var(--danger)">*</strong> are required.
            Do not rename or reorder column headers.<br>
            <span style="color:var(--gold-lt);font-weight:600">ℹ Block is auto-assigned from Gender</span>
            — leave Block blank for Male/Female students (auto → Boys Block / Girls Block).
            Fill Block only when Gender is <strong>Other</strong>.
          </p>
          <!-- [CHG-016] v2.0 column reference — old format is deprecated -->
          <div style="overflow-x:auto;margin-bottom:14px">
            <table class="data-table" style="font-size:11px;min-width:900px">
              <thead>
                <tr>
                  <th>StudentName *</th><th>Block *</th><th>Class(Prev)</th><th>Class(Curr) *</th><th>Section *</th><th>Gender</th>
                  <th style="color:var(--success)">AdmissionNo <span title="Optional — auto-generated if blank">⚡auto</span></th><th>ParentName</th><th>ContactNumber</th>
                  <th>AcademicYear *</th><th>MonthlyFee</th><th style="color:var(--gold-lt)">MonthsPaidBeforePromotion ★</th>
                  <th>PromotionStatus</th><th>OutstandingBalance</th>
                  <th style="color:var(--muted);font-size:10px">Jun…May (12 cols)</th>
                  <th>TotalDue</th><th>MonthsDue</th><th>MonthsCleared</th>
                </tr>
              </thead>
              <tbody>
                <tr style="color:var(--muted);font-style:italic;font-size:11px">
                  <td>Yaseen</td><td>Boys Block</td><td>Grade 6</td><td>Grade 7</td><td>A</td><td>Male</td>
                  <td>ADM-2025-001</td><td>F-0101</td><td>Irfan Khan</td><td>9876543210</td>
                  <td>2024-25</td><td>2500</td><td style="color:var(--gold-lt);font-weight:700">8</td>
                  <td>PROMOTED</td><td>10000</td>
                  <td style="font-size:10px">auto-set by system</td>
                  <td>10000</td><td>4</td><td>8</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="padding:8px 12px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:8px;margin-bottom:14px;font-size:12px">
            ★ <strong style="color:var(--gold-lt)">MonthsPaidBeforePromotion</strong> is the KEY field — it drives DueTracker auto-lock logic.
            All month columns (Jun→May) and OutstandingBalance are auto-calculated by the system; you may leave them blank.<br>
            ⚡ <strong style="color:var(--success)">AdmissionNo</strong> is now <strong>optional</strong> — leave it blank and the system auto-generates <code style="font-size:11px;color:var(--silver-lt)">ADM-YYYY-NNN</code> per CHG-014.<br>
            <strong style="color:var(--danger)">⚠ Old v1 format (Name/Class/AdmissionNumber columns) is deprecated and will be rejected.</strong>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="downloadBulkAdmitTemplate('csv')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download CSV Template
            </button>
            <button class="btn btn-secondary btn-sm" onclick="downloadBulkAdmitTemplate('xlsx')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Excel Template
            </button>
          </div>
        </div>
      </div>

      <!-- Upload -->
      <div class="card" style="margin-bottom:18px">
        <div class="card-hdr"><span class="card-title">Step 2 — Upload & Validate</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Select CSV or Excel File *</label>
            <input type="file" id="bulkAdmitFile" class="form-control" accept=".csv,.xlsx,.xls" onchange="parseBulkAdmitFile(this)">
          </div>
          <div id="bulkAdmitPreview" style="display:none">
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px" id="bulkAdmitPreviewTitle"></div>
            <div style="overflow-x:auto;max-height:280px;overflow-y:auto;margin-bottom:14px">
              <table class="data-table" style="font-size:12px" id="bulkAdmitPreviewTable"></table>
            </div>
            <div id="bulkAdmitValidation"></div>
          </div>
        </div>
      </div>

      <!-- Commit -->
      <div class="card" id="bulkAdmitCommitCard" style="display:none">
        <div class="card-hdr"><span class="card-title">Step 3 — Confirm & Admit</span></div>
        <div class="card-body">
          <div class="alert alert-warning" style="font-size:13px;margin-bottom:16px">
            ⚠️ New students will be created. If an Admission No already exists, only due-related fields (monthStatus, outstandingBalance, monthlyFee, academicYear) are updated — name, class, and profile data are never overwritten.
          </div>
          <div id="bulkAdmitProgress" style="display:none;margin-bottom:14px">
            <div style="font-size:13px;color:var(--muted);margin-bottom:6px" id="bulkAdmitProgressText">Processing…</div>
            <div style="height:6px;background:rgba(0,0,0,0.30);border-radius:3px;overflow:hidden">
              <div id="bulkAdmitProgressBar" style="height:100%;background:var(--gold-dim);border-radius:3px;width:0%;transition:width 0.3s ease"></div>
            </div>
          </div>
          <div id="bulkAdmitSummary"></div>
          <div style="display:flex;gap:12px;margin-top:8px">
            <button class="btn btn-primary" id="bulkAdmitBtn" onclick="processBulkAdmit()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
              Admit All Valid Students
            </button>
            <button class="btn btn-ghost" onclick="navigate('students')">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `);
  window._bulkAdmitRows = [];
}

/* ── [CHG-016 + CHG-014] Admission Number Auto-Generation — FIXED ──────────
   Format: ADM-YYYY-NNN  (YYYY = admission year, NNN = sequential, no cap).

   RULES:
   1. Once a student receives ADM-YYYY-NNN it follows them for ALL future years.
      It is NEVER re-assigned or changed during promotions.
   2. The sequence is per-admission-year.  After importing 657 students in 2024,
      the next new student gets ADM-2024-658 — not ADM-2024-001.
   3. No 999-student cap.  Numbers grow naturally: 657 → "657", 1000 → "1000".

   generateNextAdmNoForYear(yearStr) — async; scans Firestore for highest serial
     under ADM-{yr}-* and returns the next one.  Used by Bulk Import.
   generateNextAdmNo() — same but always uses the current calendar year.
     Used by the New Admission form auto-fill.
   _autoGenAdmNo(yearStr) — sync placeholder only; replaced async in bulk flow.
   ─────────────────────────────────────────────────────────────────────────── */

async function generateNextAdmNoForYear(yearStr) {
  const yr     = String(yearStr || '').split('-')[0] || String(nowIST().getFullYear());
  const prefix = `ADM-${yr}-`;
  try {
    const snap = await schoolCol('students')
      .where('admissionNumber', '>=', prefix)
      .where('admissionNumber', '<',  prefix + '\uf8ff')
      .get();
    let maxNum = 0;
    snap.forEach(d => {
      const raw = (d.data().admissionNumber || '').replace(prefix, '');
      const n   = parseInt(raw, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
    const next   = maxNum + 1;
    const padded = next < 1000 ? String(next).padStart(3, '0') : String(next);
    return `${prefix}${padded}`;
  } catch(e) {
    return `${prefix}${Date.now() % 100000}`;
  }
}

async function generateNextAdmNo() {
  return generateNextAdmNoForYear(String(nowIST().getFullYear()));
}

/* Sync shim — only a placeholder; bulk-admit loop overwrites with real number */
function _autoGenAdmNo(yearStr) {
  const yr = String(yearStr || '').split('-')[0] || String(nowIST().getFullYear());
  return `ADM-${yr}-PENDING`;
}

function downloadBulkAdmitTemplate(fmt = 'csv') {
  // [CHG-016] BulkAdmit v2.0 column specification per Blueprint v3.0
  // Old v1 format (Name/Class/AdmissionNumber) is deprecated.
  const MONTH_COLS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
  const HEADERS = [
    'StudentName','Block','Class(Prev)','Class(Curr)','Section','Gender',
    'AdmissionNo','ParentName','ContactNumber',
    'AcademicYear','MonthlyFee','MonthsPaidBeforePromotion',
    'PromotionStatus','OutstandingBalance',
    ...MONTH_COLS,
    'TotalDue','MonthsDue','MonthsCleared'
  ];
  const SAMPLE = [
    'Yaseen','Boys Block','Grade 6','Grade 7','A','Male',
    'ADM-2025-001','Irfan Khan','9876543210',
    '2024-25','1800','8',
    'PROMOTED','7200',
    'N/A-PAID','N/A-PAID','N/A-PAID','N/A-PAID','N/A-PAID','N/A-PAID','N/A-PAID','N/A-PAID','DUE','DUE','DUE','DUE',
    '7200','4','8'
  ];

  if (fmt === 'xlsx') {
    // Build workbook using SheetJS — [CHG-016] v2.0 format
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, SAMPLE]);
    // Highlight the key column (MonthsPaidBeforePromotion = index 12)
    ws['!cols'] = HEADERS.map((h, i) => ({ wch: Math.max(h.length + 2, 14), hidden: false }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BulkAdmit_v2');
    XLSX.writeFile(wb, 'BulkAdmit_Template_v2.xlsx');
  } else {
    // CSV download — [CHG-016] v2.0 format
    const header = HEADERS.join(',') + '\n';
    const sample = SAMPLE.join(',') + '\n';
    const blob   = new Blob([header + sample], { type:'text/csv' });
    const a      = document.createElement('a');
    a.href       = URL.createObjectURL(blob);
    a.download   = 'BulkAdmit_Template_v2.csv';
    a.click();
  }
}

async function parseBulkAdmitFile(input) {
  const file = input.files[0];
  if (!file) return;
  window._bulkAdmitRows = [];
  document.getElementById('bulkAdmitPreview').style.display    = 'none';
  document.getElementById('bulkAdmitCommitCard').style.display = 'none';

  try {
    let rows = [];
    let hasBanner = false; // true when file has a title banner at row 1 (Automated Formulas sheet)
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim());
        const row  = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        rows.push(row);
      }
    } else {
      const data    = await file.arrayBuffer();
      const wb      = XLSX.read(data);
      const ws      = wb.Sheets[wb.SheetNames[0]];
      // Auto-detect format:
      // "Automated Formulas" master sheet → banner at row 1, real headers at row 2 → range:1 skips banner
      // Clean import template → headers already at row 1 → range:0 (default)
      const cellA1  = ws['A1'] ? String(ws['A1'].v || '').trim() : '';
      hasBanner = cellA1.startsWith('\u{1F3EB}') || cellA1.toLowerCase().includes('veltrix') || cellA1.toLowerCase().includes('bulkadmit');
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval:'', range: hasBanner ? 1 : 0 });
      // Normalise header names from "Automated Formulas" sheet to v2.0 import names
      const HEADER_MAP = {
        'Student Name':                    'StudentName',
        'Admission No':                    'AdmissionNo',
        'Fee S.No':                        '_feeSNo',
        'Parent Name':                     'ParentName',
        'Contact':                         'ContactNumber',
        'Academic Year':                   'AcademicYear',
        'Monthly Fee\n(\u20B9)':          'MonthlyFee',
        'Monthly Fee\r\n(\u20B9)':       'MonthlyFee',
        'Monthly Fee (\u20B9)':            'MonthlyFee',
        'Months Paid\nBefore Promotion':  'MonthsPaidBeforePromotion',
        'Months Paid\r\nBefore Promotion':'MonthsPaidBeforePromotion',
        'Months Paid Before Promotion':    'MonthsPaidBeforePromotion',
        'Promotion\nStatus':              'PromotionStatus',
        'Promotion\r\nStatus':           'PromotionStatus',
        'Promotion Status':                'PromotionStatus',
        'Outstanding\nBalance (\u20B9)':  'OutstandingBalance',
        'Outstanding\r\nBalance (\u20B9)':'OutstandingBalance',
        'Outstanding Balance (\u20B9)':    'OutstandingBalance',
        'Class\n(Prev)':                  'Class(Prev)',
        'Class\r\n(Prev)':               'Class(Prev)',
        'Class (Prev)':                    'Class(Prev)',
        'Class\n(Curr)':                  'Class(Curr)',
        'Class\r\n(Curr)':               'Class(Curr)',
        'Class (Curr)':                    'Class(Curr)',
        'Total Due (\u20B9)':              'TotalDue',
        'Months Due':                      'MonthsDue',
        'Months Cleared':                  'MonthsCleared',
      };
      rows = rawRows.map(r => {
        const mapped = {};
        Object.entries(r).forEach(([k, v]) => {
          const norm = HEADER_MAP[k] || k;
          mapped[norm] = v;
        });
        return mapped;
      });
    }

    // [CHG-016] v2.0 Format Validation — detect and reject old v1 format
    // v1 indicators: old column names like 'Name', 'AdmissionNumber', 'Class' (without Prev/Curr)
    const firstRow = rows[0] || {};
    const rowKeys  = Object.keys(firstRow).map(k => k.trim());
    const isV1Format = rowKeys.includes('Name') || rowKeys.includes('AdmissionNumber') ||
                       (rowKeys.includes('Class') && !rowKeys.includes('Class(Curr)') && !rowKeys.includes('Class(Prev)'));
    if (isV1Format) {
      throw new Error(
        '[CHG-016] Old BulkAdmit v1 format detected. This format is deprecated. ' +
        'Please download the new v2.0 template (click "Download CSV/Excel Template" above) ' +
        'and use the updated column headers: StudentName, AdmissionNo, Class(Prev), Class(Curr), ' +
        'AcademicYear, MonthlyFee, MonthsPaidBeforePromotion, PromotionStatus, etc.'
      );
    }

    // [CHG-016] v2.0 required fields
    // Block can be auto-derived from Gender. MonthsPaidBeforePromotion defaults to 0 if blank.
    // AdmissionNo is now OPTIONAL — if blank, system auto-generates ADM-YYYY-NNN per CHG-014+CHG-016.
    const REQUIRED = ['StudentName','Class(Curr)','Section'];
    const MONTH_COLS = ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
    const valid = []; const errors = [];

    rows.forEach((r, i) => {
      const rowNum  = i + (hasBanner ? 3 : 2); // +3 when banner present (row1=banner, row2=headers, row3=data); +2 for clean template
      // Skip completely empty rows (formula-only rows with no student data)
      const hasAnyData = Object.values(r).some(v => String(v||'').trim() !== '');
      if (!hasAnyData) return;
      const allKeysMissing = REQUIRED.every(f => !String(r[f]||'').trim());
      if (allKeysMissing) return; // silent skip — blank template row
      // [CHG-016] v2.0 field names
      const missing = REQUIRED.filter(f => !String(r[f]||'').trim());
      if (missing.length) {
        errors.push(`Row ${rowNum} (${r.StudentName||'unnamed'}): missing ${missing.join(', ')}`);
        return;
      }
      // Validate PromotionStatus — only PROMOTED / NOT PROMOTED / PENDING accepted
      const promotionStatus = String(r.PromotionStatus||'PROMOTED').trim().toUpperCase();
      if (!['PROMOTED','NOT PROMOTED','PENDING',''].includes(promotionStatus)) {
        errors.push(`Row ${rowNum} (${r.StudentName||'unnamed'}): PromotionStatus "${r.PromotionStatus}" is invalid — must be PROMOTED, NOT PROMOTED, or PENDING.`);
        return;
      }
      // Normalise block name — derive from gender if not supplied
      const gender = String(r.Gender||'').trim();
      let block = String(r.Block||'').trim();
      const autoBlock = genderToBlock(gender);

      if (!block && autoBlock) {
        block = autoBlock;
      } else if (block && autoBlock && block.toLowerCase() !== autoBlock.toLowerCase()) {
        errors.push(`Row ${rowNum} (${r.StudentName||'unnamed'}): Block "${block}" conflicts with gender "${gender}" — expected "${autoBlock}". Fix the spreadsheet.`);
        return;
      } else if (!block && !autoBlock) {
        errors.push(`Row ${rowNum} (${r.StudentName||'unnamed'}): Block is required when gender is "Other" or blank.`);
        return;
      }

      if (!getBlocks().map(b=>b.toLowerCase()).includes(block.toLowerCase())) {
        errors.push(`Row ${rowNum}: Block "${block}" is not valid — must be "Boys Block" or "Girls Block"`);
        return;
      }
      // [CHG-016] Use Class(Curr) as the current class
      const cls = String(r['Class(Curr)']||'').trim();
      if (!getClassList().includes(cls)) {
        errors.push(`Row ${rowNum}: Class(Curr) "${cls}" not found in school config`);
        return;
      }
      // [CHG-016] Parse MonthsPaidBeforePromotion — KEY FIELD for DueTracker
      const monthsPaid = parseInt(r.MonthsPaidBeforePromotion || '0', 10) || 0;
      if (monthsPaid < 0 || monthsPaid > 12) {
        errors.push(`Row ${rowNum} (${r.StudentName||'unnamed'}): MonthsPaidBeforePromotion "${r.MonthsPaidBeforePromotion}" must be 0–12.`);
        return;
      }
      // Build month status map from v2.0 columns (or derive from MonthsPaidBeforePromotion if blank)
      const monthStatus = {};
      MONTH_COLS.forEach((m, idx) => {
        const cellVal = String(r[m]||'').trim().toUpperCase();
        if (cellVal === 'N/A-PAID' || cellVal === 'PAID') {
          monthStatus[m] = 'N/A-PAID';
        } else if (cellVal === 'DUE') {
          monthStatus[m] = 'DUE';
        } else {
          // Auto-derive from MonthsPaidBeforePromotion
          monthStatus[m] = idx < monthsPaid ? 'N/A-PAID' : 'DUE';
        }
      });
      const monthsDue = MONTH_COLS.filter(m => monthStatus[m] === 'DUE').length;
      // L2/L8: through the ONE resolver. `_FEE_SCHEDULE[cls]` alone misses on any class
      // name carrying stray whitespace — "LKG " scores no match, falls through to 0, and
      // the student is imported with a zero monthly fee. That is Test Student Two's exact
      // failure, written into the database at import time rather than merely displayed.
      const monthlyFee = parseFloat(r.MonthlyFee || r['MonthlyFee(Rs.)'] || '0')
        || ((typeof _flRateForClass === 'function') ? _flRateForClass(cls, 0) : (_FEE_SCHEDULE[cls] || 0));

      // ══════════════════════════════════════════════════════════════════════
      // A PRESENT ZERO IS AN ANSWER. `||` READ IT AS A MISSING ONE.
      //
      // outstandingBalance and totalDue were each
      //     parseFloat(r.X || 0) || (monthsDue * monthlyFee)
      // and `||` tests truthiness, not presence. A sheet stating
      // OutstandingBalance 0 parsed to 0, fell through as falsy, and the student
      // was imported owing monthsDue x monthlyFee — a debt the spreadsheet had
      // explicitly denied. Dues written off, settled outside the system, or a
      // stale month grid beside an authoritative balance column all land here.
      //
      // An unparseable cell took the same path: parseFloat('—') is NaN, also
      // falsy, so a typo became a computed balance instead of a row this import
      // refused. That is how one bad column becomes 150 wrong balances that no
      // one can trace back to a spreadsheet nobody kept.
      //
      // Three cases, told apart properly:
      //   blank            not stated -> derive from the month grid, as before
      //   finite number    what it says, ZERO INCLUDED
      //   anything else    a row error, because guessing at money the sheet got
      //                    wrong is not a recovery, it is an invention
      //
      // Number.isFinite is the same test terminated.js:424 uses for exactly this
      // question. Negatives are refused too: a negative liability is not a
      // credit here, it is a sheet that needs fixing before it is imported.
      // ══════════════════════════════════════════════════════════════════════
      const _derivedDue = monthsDue * monthlyFee;
      const _sheetMoney = (raw, label) => {
        const s = String(raw == null ? '' : raw).trim();
        if (s === '') return { ok: true, value: _derivedDue };   // not stated -> derive
        const n = Number(s.replace(/,/g, ''));                   // "12,600" is a normal sheet value
        if (!Number.isFinite(n) || n < 0) {
          errors.push(`Row ${rowNum} (${r.StudentName||'unnamed'}): ${label} "${raw}" is not a valid amount. ` +
                      `Leave it blank to derive it from the month grid, or enter a number — 0 is allowed and means "owes nothing".`);
          return { ok: false, value: 0 };
        }
        return { ok: true, value: n };
      };
      const _outstandingCell = _sheetMoney(r.OutstandingBalance, 'OutstandingBalance');
      const _totalDueCell    = _sheetMoney(r.TotalDue,           'TotalDue');
      if (!_outstandingCell.ok || !_totalDueCell.ok) return;     // same error-then-skip the checks above use

      valid.push({
        name:            String(r.StudentName).trim(),
        block:           block,
        classPrev:       String(r['Class(Prev)']||'').trim(),
        class:           cls,
        section:         String(r.Section||'').trim(),
        gender:          String(r.Gender||'').trim(),
        // ADM-FIX: keep the sheet number if present; blank rows get assigned
        // sequentially AFTER the loop via _assignBulkAdmNos() — never use sync fallback.
        admissionNumber: String(r.AdmissionNo||'').trim() || '',
        _hadAdmNo: !!String(r.AdmissionNo||'').trim(),  // true = came from sheet; false = needs assignment
        _rawAcademicYear: String(r.AcademicYear||'').trim(),
        feeSno:          '',
        parentName:      String(r.ParentName||'').trim(),
        contact:         String(r.ContactNumber||r.Contact||'').trim(),
        // NORMALISE ON THE WAY IN. A sheet may say "2025-2026" where the app stores
        // "2025-26"; both mean the same year, and every READER already resolves that
        // through _normaliseAcademicYear. Storing the raw form was still how three
        // students on this roll ended up in long form -- and F4 showed what one raw
        // string comparison against them costs: a doubled outstanding balance, silently.
        // Readers normalising is a safety net, not a licence to write inconsistently.
        academicYear:    (typeof _normaliseAcademicYear === 'function')
                           ? (_normaliseAcademicYear(String(r.AcademicYear||'').trim()) || _getCurrentAcademicYearStr())
                           : (String(r.AcademicYear||'').trim() || _getCurrentAcademicYearStr()),
        monthlyFee:      monthlyFee,
        monthsPaidBeforePromotion: monthsPaid,
        promotionStatus: promotionStatus || 'PROMOTED',
        outstandingBalance: _outstandingCell.value,
        monthStatus:     monthStatus,   // [CHG-016] DueTracker month grid
        totalDue:        _totalDueCell.value,
        monthsDue:       monthsDue,
        monthsCleared:   monthsPaid,
        // CHG-014 + EXCEL-ADM-FIX: Map AdmissionDate from Excel if provided.
        // If blank, derive admission date from the student's OLDEST academic year
        // (previousAcademicYear > academicYear) so ADM-2024-NNN is correct for a
        // student whose data starts in 2024-25, not today's date.
        admissionDate: (() => {
          const _rawAdmDate = r.AdmissionDate && String(r.AdmissionDate).trim();
          // Date-only fact from the sheet — 12:00 IST via the shared converter, never
          // `new Date(str)` (UTC midnight -> stored as 05:30 IST).
          if (_rawAdmDate) return istTimestampFromDateInput(_rawAdmDate, 'noon');
          // Derive from oldest academic year: previousAcademicYear takes priority
          const _prevYr = String(r.previousAcademicYear || r.openingOutstandingYear || r._rawAcademicYear || r.academicYear || '').trim();
          const _startYr = _prevYr ? parseInt(_prevYr.split('-')[0], 10) : null;
          if (_startYr && !isNaN(_startYr)) {
            // June 1 of the academic year start = first day of that academic year
            // June 1 at 12:00 IST — `new Date(y,5,1)` is the DEVICE's local midnight,
            // so the stored instant moved with whatever machine ran the import.
            return istTimestampFromDateInput(_startYr + '-06-01', 'noon');
          }
          return firebase.firestore.FieldValue.serverTimestamp();
        })(),
        // BUG-P08 FIX: dueDate mirrors admissionDate for date-range query compatibility.
        dueDate: (() => {
          const _rawAdmDate = r.AdmissionDate && String(r.AdmissionDate).trim();
          // Date-only fact from the sheet — 12:00 IST via the shared converter, never
          // `new Date(str)` (UTC midnight -> stored as 05:30 IST).
          if (_rawAdmDate) return istTimestampFromDateInput(_rawAdmDate, 'noon');
          const _prevYr = String(r.previousAcademicYear || r.openingOutstandingYear || r._rawAcademicYear || r.academicYear || '').trim();
          const _startYr = _prevYr ? parseInt(_prevYr.split('-')[0], 10) : null;
          if (_startYr && !isNaN(_startYr)) {
            return istTimestampFromDateInput(_startYr + '-06-01', 'noon');
          }
          return firebase.firestore.FieldValue.serverTimestamp();
        })(),
        status: 'active',
        type: 'promoted',  // [CHG-016] v2.0: promoted type for DueTracker workflow
        // S3: fee_status is not written at import. A two-state rule cannot say
        // 'partial', and _flReconcileMany at the end of this import computes it
        // for every touched student through the engine's own rule.
        // monthlyFee already set above from spreadsheet or fee schedule
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    // ADM-FIX: Assign sequential admission numbers to rows that didn't have one.
    // Group blank-AdmNo rows by their academic year and assign ADM-YYYY-N continuing
    // from the highest number already in Firestore for that year.
    const blankRows = valid.filter(r => !r._hadAdmNo && !r.admissionNumber);
    if (blankRows.length) {
      // Find distinct years needing assignment
      const yearGroups = {};
      blankRows.forEach(r => {
        // EXCEL-ADM-FIX: Use the OLDEST year for admission number prefix.
        // A student who joined in 2024-25 must get ADM-2024-NNN, not ADM-2025-NNN.
        // Priority: previousAcademicYear > openingOutstandingYear > _rawAcademicYear > academicYear
        const _oldestYrStr = String(
          r.previousAcademicYear || r.openingOutstandingYear || r._rawAcademicYear || r.academicYear || ''
        ).trim();
        const yr = _oldestYrStr.split('-')[0] || String(nowIST().getFullYear());
        if (!yearGroups[yr]) yearGroups[yr] = [];
        yearGroups[yr].push(r);
      });
      // For each year, fetch the current max from Firestore then assign in order
      for (const [yr, grp] of Object.entries(yearGroups)) {
        const prefix = `ADM-${yr}-`;
        let maxNum = 0;
        try {
          const snap = await schoolCol('students')
            .where('admissionNumber', '>=', prefix)
            .where('admissionNumber', '<',  prefix + '')
            .get();
          snap.forEach(d => {
            const raw = (d.data().admissionNumber || '').replace(prefix, '');
            const n   = parseInt(raw, 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          });
        } catch(e) { /* use 0 as base if query fails */ }
        // Also account for any already-assigned rows from THIS import (same year)
        valid.forEach(r => {
          if (r.admissionNumber && r.admissionNumber.startsWith(prefix)) {
            const n = parseInt(r.admissionNumber.replace(prefix, ''), 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          }
        });
        grp.forEach(r => {
          maxNum++;
          const padded = maxNum < 1000 ? String(maxNum).padStart(3, '0') : String(maxNum);
          r.admissionNumber = `${prefix}${padded}`;
        });
      }
    }

    window._bulkAdmitRows = valid;

    // [CHG-016] Updated preview table shows v2.0 key fields
    const previewHtml = `
      <thead><tr><th>#</th><th>Name</th><th>Block</th><th>Class(Prev)</th><th>Class(Curr)</th><th>Section</th><th>Adm#</th><th style="color:var(--gold-lt)">Months Paid ★</th><th>Months Due</th><th>AcademicYear</th></tr></thead>
      <tbody>${valid.map((r,i)=>`<tr><td class="muted">${i+1}</td><td>${sanitizeHTML(r.name)}</td><td>${sanitizeHTML(r.block)}</td><td>${sanitizeHTML(r.classPrev||'—')}</td><td>${sanitizeHTML(r.class)}</td><td>${sanitizeHTML(r.section)}</td><td>${sanitizeHTML(r.admissionNumber)}</td><td style="color:var(--gold-lt);font-weight:700">${r.monthsPaidBeforePromotion}</td><td style="color:var(--danger)">${r.monthsDue}</td><td style="color:var(--muted)">${sanitizeHTML(r.academicYear||'—')}</td></tr>`).join('')}</tbody>`;
    document.getElementById('bulkAdmitPreviewTable').innerHTML = previewHtml;
    document.getElementById('bulkAdmitPreviewTitle').textContent = `${valid.length} valid row${valid.length!==1?'s':''} ready · ${errors.length} error${errors.length!==1?'s':''}`;
    document.getElementById('bulkAdmitValidation').innerHTML = errors.length
      ? `<div class="alert alert-warning" style="font-size:12px"><strong>${errors.length} row${errors.length!==1?'s':''} with errors (will be skipped):</strong><br>${errors.map(e=>`• ${sanitizeHTML(e)}`).join('<br>')}</div>`
      : `<div class="alert alert-success" style="font-size:12px">✅ All ${valid.length} rows passed validation.</div>`;
    document.getElementById('bulkAdmitPreview').style.display = 'block';
    if (valid.length > 0) document.getElementById('bulkAdmitCommitCard').style.display = 'block';

  } catch(e) {
    showToast('Failed to parse file: ' + e.message, 'danger');
  }
}

/* ── SMART DEDUP HELPER ────────────────────────────────────────────────────
   _findExistingStudent(r)
   Priority 1: admissionNumber match (non-blank only)
   Priority 2: name + contact match (handles blank AdmissionNo rows)
   Priority 3: name + parentName match (fallback when contact also blank)
   Returns the Firestore DocumentSnapshot or null.
   ──────────────────────────────────────────────────────────────────────── */
async function _findExistingStudent(r) {
  // P1 — admissionNumber (only if it was in the sheet, not auto-generated)
  if (r._hadAdmNo) {
    const snap = await schoolCol('students').where('admissionNumber','==',r.admissionNumber).get();
    if (!snap.empty) return snap.docs[0];
  }
  // P2 — name + contact
  if (r.contact) {
    const snap = await schoolCol('students')
      .where('name','==',r.name)
      .where('contact','==',r.contact)
      .get();
    if (!snap.empty) return snap.docs[0];
  }
  // P3 — name + parentName
  if (r.parentName) {
    const snap = await schoolCol('students')
      .where('name','==',r.name)
      .where('parentName','==',r.parentName)
      .get();
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

/* ── MULTI-YEAR SHEET DEDUP (PATCHED) ──────────────────────────────────────
   The Boys_Block sheet contains each student TWICE — once per academic year.
   We must collapse them into a single record BEFORE hitting Firestore.
   Patch: Enforces a strict composite key using name+contact for all records
   when admission number is not present, avoiding blind name merges.
   ──────────────────────────────────────────────────────────────────────── */
function _deduplicateRowsInSheet(rows) {
  const map = new Map();
  const normName = n => (n||'').toLowerCase().replace(/\s+/g,' ').trim();
  const cleanPhone = p => String(p||'').replace(/[^\d]/g, '');
  for (const r of rows) {
    // Strict composite key: Use Admission No if available, else combine Name + Contact + Parent
    const nk = normName(r.name);
    const phone = cleanPhone(r.contact);
    const parent = normName(r.parentName);

    let key;
    if (r._hadAdmNo && r.admissionNumber) {
        key = `adm_${r.admissionNumber.trim().toUpperCase()}`;
    } else {
        key = `${nk}|${phone}|${parent}`;
    }
    if (!map.has(key)) {
      map.set(key, Object.assign({}, r));
      continue;
    }

    const existing = map.get(key);
    // Compare academic years; keep whichever row is the newer year
    const yearOf = y => { const p = (y||'').split('-'); return parseInt(p[0]||'0', 10); };
    const existingYear = yearOf(existing.academicYear);
    const newYear      = yearOf(r.academicYear);
    // Same year — skip (no merge needed, just keep existing)
    if (newYear === existingYear) continue;
    // The "newer" row becomes the base (current class, section, etc.)
    const [newer, older] = newYear >= existingYear ? [r, existing] : [existing, r];
    // Accumulate outstanding — previous year unpaid dues carry forward
    const combinedOutstanding = (newer.outstandingBalance || 0) + (older.outstandingBalance || 0);
    const combinedTotalDue    = (newer.totalDue || 0)    + (older.totalDue || 0);
    const _shortToFull = {Jun:'June',Jul:'July',Aug:'August',Sep:'September',Oct:'October',Nov:'November',Dec:'December',Jan:'January',Feb:'February',Mar:'March',Apr:'April',May:'May'};
    const olderMonthStatus = older.monthStatus || {};
    const derivedOwedMonths = Object.entries(olderMonthStatus)
      .filter(([, status]) => status === 'DUE')
      .map(([m]) => _shortToFull[m] || m);
    // ══════════════════════════════════════════════════════════════════════════
    // THREE OR MORE YEARS FOR ONE STUDENT: EVERYTHING OLDER THAN THE IMMEDIATE
    // PREVIOUS YEAR HAS TO GO SOMEWHERE THAT SURVIVES THE NEXT MERGE.
    //
    // This fold is PAIRWISE. Three sheet rows (2024-25, 2025-26, 2026-27) merge
    // twice, and the previous-year facts live in SCALARS —  previousAcademicYear,
    // previousYearMonthStatus, openingOutstandingYear/Class/Months. The second
    // merge rewrote all of them from `older`'s OWN year, and because the record is
    // rebuilt as Object.assign({}, newer, …) starting from the RAW newer row, the
    // scalars `older` was carrying about 2024-25 were never copied across. That
    // year's class, its month grid and its identity simply stopped existing on the
    // way to Firestore — silently, with the import reporting success.
    //
    // It is why Record Previous Year Dues only ever offered ONE prior year.
    // _flStudentAcademicYears (pending-fee.js:644) already reads a multi-year
    // openingOutstandingDues[] ARRAY; nothing was ever writing more than one year
    // into it from this path, so the dropdown had nothing older to show.
    //
    // Older years now ACCUMULATE into that array instead of overwriting a scalar.
    // Shape is the one the engine already consumes at pending-fee.js:559 —
    //     forEach(d => add(d.year, d.class, d.monthlyFee || s.monthlyFee, d.monthStatus))
    // so each entry carries its own year, class and grid and is priced as what it
    // cost THEN rather than at today's schedule.
    //
    // SPLIT OF RESPONSIBILITY, kept exactly as the field contract expects:
    //   · the IMMEDIATE previous year  -> the six scalars (unchanged behaviour)
    //   · every year older than that   -> openingOutstandingDues[]
    // Keeping the immediate previous year out of the array is deliberate: a year
    // described by BOTH an array entry and a labelled field grid is the F13
    // contradictory-grid case, and there is no reason to manufacture one here.
    //
    // monthlyFee IS OMITTED on a year demoted out of the scalars, and that is not an
    // oversight. Once a year has been reduced to previousAcademicYear +
    // openingOutstandingClass, its own rate is no longer recoverable — only its
    // class is. The engine then resolves the rate from that class, which is exactly
    // what happens for that year today. Inventing a monthlyFee here would move a
    // real figure on the strength of a guess.
    // ══════════════════════════════════════════════════════════════════════════
    const _yrKey = y => String(y || '').trim();
    const _olderArr = Array.isArray(older.openingOutstandingDues) ? older.openingOutstandingDues : [];
    const _newerArr = Array.isArray(newer.openingOutstandingDues) ? newer.openingOutstandingDues : [];
    const _accum = [..._olderArr, ..._newerArr];

    // HARVEST FROM BOTH SIDES, because which side is the accumulated record depends
    // on the order the rows happen to appear in the sheet. Rows arriving
    // 2024-25 → 2026-27 → 2025-26 leave the partly-merged record as `newer` on the
    // final pass, and its previousAcademicYear (2024-25) is then overwritten by the
    // incoming older row's year — the identical loss this fix exists to stop, just
    // reached from the other direction. Taking it from `older` alone is a fix that
    // only works when the sheet is already sorted.
    //
    // After this merge the scalars describe older.academicYear, so ANY scalar
    // previous-year on either side that is neither that year nor the new current year
    // is strictly older and belongs in the array.
    [older, newer].forEach(src => {
      const py = _yrKey(src.previousAcademicYear);
      if (!py) return;
      if (py === _yrKey(older.academicYear) || py === _yrKey(newer.academicYear)) return;
      _accum.push({
        year:        src.previousAcademicYear,
        class:       src.openingOutstandingClass || src.classPrev || '',
        monthStatus: src.previousYearMonthStatus || {}
      });
    });

    // De-dupe by year, last write wins, and never let an accumulated entry shadow
    // the year that is about to occupy the scalars or the current year itself.
    // Through _flMergeOpeningDues — this logic was lifted out to pending-fee.js so
    // the onboarding form's re-import path could use the same one instead of growing
    // a second copy. Behaviour here is unchanged except that keys are now normalised,
    // which is a no-op for a sheet whose rows all share one year format.
    const _mergedOpeningDues = _flMergeOpeningDues(
      [], _accum, [older.academicYear, newer.academicYear]);

    map.set(key, Object.assign({}, newer, {
      outstandingBalance:      combinedOutstanding,
      totalDue:                combinedTotalDue,
      // S3: see above — fee_status is the reconcile's to write, not the import's.
      previousDues:            older.outstandingBalance || 0,
      previousAcademicYear:    older.academicYear || '',
      previousYearMonthStatus: olderMonthStatus,
      openingOutstandingMonths: derivedOwedMonths,
      openingOutstandingYear:   older.academicYear || '',
      openingOutstandingClass:  older.class || older.classPrev || '',
      ...(_mergedOpeningDues.length ? { openingOutstandingDues: _mergedOpeningDues } : {}),
      admissionNumber: newer._hadAdmNo ? newer.admissionNumber
                     : older._hadAdmNo ? older.admissionNumber
                     : newer.admissionNumber,
      _hadAdmNo: newer._hadAdmNo || older._hadAdmNo
    }));
  }
  return Array.from(map.values());
}

async function processBulkAdmit() {
  const rawRows = window._bulkAdmitRows || [];
  if (!rawRows.length) { showToast('No valid rows to admit.', 'danger'); return; }

  const btn      = document.getElementById('bulkAdmitBtn');
  const progWrap = document.getElementById('bulkAdmitProgress');
  const progBar  = document.getElementById('bulkAdmitProgressBar');
  const progText = document.getElementById('bulkAdmitProgressText');
  btn.disabled   = true;
  progWrap.style.display = 'block';

  // Step 1 — collapse same-student rows from the sheet itself (multi-year duplicates)
  progText.textContent = 'Merging multi-year entries in sheet…';
  const rows = _deduplicateRowsInSheet(rawRows);
  const mergedInSheet = rawRows.length - rows.length;

  let admitted = 0; let updated = 0; let skipped = 0; const skipReasons = [];
  const _touchedStudentIds = [];   // ITEM 17: every row this run created OR updated

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const pct = Math.round(((i+1) / rows.length) * 100);
    progBar.style.width  = pct + '%';
    progText.textContent = `Processing ${i+1} of ${rows.length} — ${r.name}`;

    try {
      // Step 2 — smart identity match in Firestore (P1: admNo, P2: name+contact, P3: name+parent)
      const existingDoc = await _findExistingStudent(r);

      if (existingDoc) {
        // Student already in Firestore — update fee + class fields only, never duplicate
        const existData = existingDoc.data();
        // ══════════════════════════════════════════════════════════════════════
        // F4 — THE IDEMPOTENCY GUARD COMPARED RAW STRINGS.
        //
        // Re-importing a sheet must not double a student's dues, and the guard for
        // that was `existData.academicYear !== r.academicYear` — a literal string
        // comparison of two academic years. "2025-26" and "2025-2026" are the SAME
        // year and different strings, so the guard read them as a year change and
        // accumulated.
        //
        // Not hypothetical: three active students on this roll store their year in
        // the long form. Import a sheet using the short form against them and the
        // outstanding balance doubles, silently, with no row rejected and no
        // warning. Import it twice and it triples.
        //
        // _normaliseAcademicYear is the same function every other year comparison
        // in the app goes through. This one call site was doing it by hand.
        // ══════════════════════════════════════════════════════════════════════
        const firestoreOutstanding = existData.outstandingBalance || 0;
        const sheetOutstanding     = r.outstandingBalance || 0;
        const _existYrBA = (typeof _normaliseAcademicYear === 'function')
          ? _normaliseAcademicYear(existData.academicYear || '') : (existData.academicYear || '');
        const _sheetYrBA = (typeof _normaliseAcademicYear === 'function')
          ? _normaliseAcademicYear(r.academicYear || '') : (r.academicYear || '');
        const combinedOutstanding  = (_existYrBA !== _sheetYrBA)
          ? firestoreOutstanding + sheetOutstanding
          : sheetOutstanding;

        // ══════════════════════════════════════════════════════════════════════
        // JSS-REF-VELTRIX-2026-005 — TEST STUDENT TWO'S ROOT CAUSE. Implausible class jump guard.
        //
        // This update overwrote `class` and `classPrev` on an EXISTING student with
        // ZERO validation. A sheet row carrying the right admission number but another
        // student's class silently re-grades the student — and since item 5, the class
        // is what every rate resolution starts from, so it also re-prices every month
        // they have ever been billed for.
        //
        // ADM-TEST-002 is the live case: her own onboarding record says Nursery in
        // 2025-26, her termination snapshot says LKG, and her payments were all taken
        // at the 1,700 Nursery/LKG rate — yet her student document reads
        // class "Grade 8", classPrev "Grade 7". Nursery to Grade 8 is a nine-step jump
        // in one year. It is not a promotion; it is somebody else's row.
        //
        // A real class change between imports is at most ONE step along the promotion
        // chain (or none). Anything larger is rejected: the stored class is kept, the
        // row is reported, and every other field on the row still imports normally.
        // Conservative on purpose — refusing a legitimate double-promotion costs one
        // manual edit, while accepting a bad one silently re-prices a student's entire
        // fee history, which is what happened here.
        // ══════════════════════════════════════════════════════════════════════
        // L8: normalise through the shared key so stray whitespace cannot silently
        // disable this guard by scoring -1 on the chain.
        const _chainBA   = getClassList();
        const _keyBA     = c => (typeof _flClassKey === 'function') ? _flClassKey(c) : String(c || '').trim();
        const _oldClsBA  = _keyBA(existData.class);
        const _newClsBA  = _keyBA(r.class);
        const _iOld = _chainBA.indexOf(_oldClsBA), _iNew = _chainBA.indexOf(_newClsBA);
        // Only judge when BOTH classes are known positions on the chain; an unknown
        // name is left to the existing behaviour rather than guessed at.
        const _implausibleJump = _oldClsBA && _newClsBA && _oldClsBA !== _newClsBA
                              && _iOld >= 0 && _iNew >= 0 && Math.abs(_iNew - _iOld) > 1;
        if (_implausibleJump) {
          skipReasons.push(
            `${r.name || _newClsBA}: class change REJECTED — "${_oldClsBA}" to "${_newClsBA}" is ` +
            `${Math.abs(_iNew - _iOld)} steps in one import. Kept "${_oldClsBA}". ` +
            `Check whether this sheet row belongs to a different student.`);
          console.warn('[BULK ADMIT] Implausible class jump rejected for ' +
            (r.admissionNumber || r.name) + ': ' + _oldClsBA + ' -> ' + _newClsBA);
        }

        // ══════════════════════════════════════════════════════════════════════
        // openingOutstandingDues[] IS MERGED BY YEAR, NEVER BLIND-OVERWRITTEN.
        //
        // This student may already hold years in Firestore from an earlier import
        // that this sheet says nothing about. Assigning the sheet's array straight
        // over the stored one would delete those years — the same class of silent
        // history loss the pairwise fold in _deduplicateRowsInSheet was just fixed
        // for, only against the database instead of against the next sheet row.
        //
        // arrayUnion is not the tool either: it de-dupes on exact deep equality, so
        // a year whose grid has legitimately changed would be appended ALONGSIDE its
        // older self, leaving two contradictory entries for one year (F13).
        //
        // Keyed by year: what is stored is kept, what the sheet carries wins for the
        // years it actually describes, and neither the current year nor the year
        // occupying the previous-year scalars is allowed in — those are described by
        // their own fields, and a duplicate description is the contradiction F13 is
        // about.
        // ══════════════════════════════════════════════════════════════════════
        // Through _flMergeOpeningDues (pending-fee.js) — the shared version of exactly
        // this, so the onboarding form's re-import path cannot drift from it.
        const _oodMerged = _flMergeOpeningDues(
          existData.openingOutstandingDues,
          r.openingOutstandingDues,
          [r.previousAcademicYear || existData.previousAcademicYear, r.academicYear]);

        await existingDoc.ref.update({
          class:                     _implausibleJump ? _oldClsBA : r.class,
          section:                   r.section,
          classPrev:                 _implausibleJump ? (existData.classPrev || '') : r.classPrev,
          monthStatus:               r.monthStatus,
          monthsPaidBeforePromotion: r.monthsPaidBeforePromotion,
          outstandingBalance:        combinedOutstanding,
          totalDue:                  r.totalDue,
          monthsDue:                 r.monthsDue,
          monthsCleared:             r.monthsCleared,
          // S3: see above — fee_status is the reconcile's to write, not the import's.
          monthlyFee:                r.monthlyFee,
          academicYear:              r.academicYear,
          promotionStatus:           r.promotionStatus,
          // JSS-REF-VELTRIX-2026-002 Item 12 FIX — ATOMIC PREVIOUS-YEAR BLOCK.
          // previousDues / previousAcademicYear / previousYearMonthStatus /
          // openingOutstandingMonths / openingOutstandingYear / openingOutstandingClass
          // are read together as ONE unit by every downstream consumer (Profile Source B
          // ~L4157-4174, Due Fee Section B ~L13389-13410, Dashboard rolling-dues banner
          // ~L14753-14756, Record Previous Year Dues field router ~L15334-15343).
          // OLD BUG: previousDues/previousAcademicYear were written unconditionally
          // (defaulting to 0/'' when r had none), while the other four used a guarded
          // spread and were left untouched when r had none. On any re-import where this
          // sheet's row carried no merge data, that split 2-vs-4 write silently detached
          // the year LABEL from its own month-grid/balance data already in Firestore —
          // producing exactly the "figures swapped / wrong year's pills" symptom.
          // FIX: write all six together only when this row actually carries merged
          // previous-year data (r.previousAcademicYear, set solely by
          // _deduplicateRowsInSheet's merge branch); otherwise touch none of the six,
          // so an existing student's previous-year history survives an unrelated update.
          // openingOutstandingDues joins the SAME atomic block, under the SAME guard.
          // It is the seventh member of the unit described above, not an independent
          // field: it holds the years older than previousAcademicYear, so writing it
          // when the other six are being left alone would detach a year's history from
          // the label that identifies it — precisely the Item 12 bug. It is also only
          // written when the merge actually produced something, so a re-import of a
          // single-year sheet cannot blank a multi-year student's accumulated history.
          ...(r.previousAcademicYear ? {
            previousDues:             r.previousDues || 0,
            previousAcademicYear:     r.previousAcademicYear,
            previousYearMonthStatus:  r.previousYearMonthStatus  || {},
            openingOutstandingMonths: r.openingOutstandingMonths || [],
            openingOutstandingYear:   r.openingOutstandingYear   || r.previousAcademicYear,
            openingOutstandingClass:  r.openingOutstandingClass  || r.classPrev || '',
            ...(_oodMerged.length ? { openingOutstandingDues: _oodMerged } : {})
          } : {}),
          // Only update admissionNumber if the existing record had none
          ...((!existData.admissionNumber && r.admissionNumber) ? { admissionNumber: r.admissionNumber } : {}),
          updatedBy:  currentUser.uid,
          updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
        });
        updated++;
        _touchedStudentIds.push(existingDoc.id);   // ITEM 17: an UPDATE re-prices too
        continue;
      }

      // New student — create record
      const ref = await schoolCol('students').add(r);
      schoolCol('academicStructure').doc(`${r.class}-${r.section}`).set({
        className:r.class, section:r.section,
        studentIds: firebase.firestore.FieldValue.arrayUnion(ref.id)
      }, { merge:true }).catch(()=>{});
      admitted++;
      _touchedStudentIds.push(ref.id);
    } catch(e) {
      skipReasons.push(`${r.name}: ${e.message}`); skipped++;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // JSS-REF-VELTRIX-2026-005 ITEM 17 — "bulk admit" is named in the rule.
  //
  // Every row here writes fee state directly: monthStatus, previousDues,
  // openingOutstanding*, previousYearMonthStatus. That is the import sheet's own
  // arithmetic landing in the authoritative fields without the engine ever seeing
  // it — so a sheet whose grid and scalar disagree imports that disagreement as
  // fact, for as many students as the file contains. It is the highest-volume way
  // to introduce exactly the desync items 1/16 were about.
  //
  // UPDATED rows are included, not just new ones: an update can change class,
  // previous-year labels and grids, which re-prices an existing student.
  //
  // Bounded concurrency — a large sheet would otherwise fire hundreds of
  // simultaneous recomputes and risk a half-reconciled roll.
  // ══════════════════════════════════════════════════════════════════════════
  if (_touchedStudentIds.length && typeof _flReconcileMany === 'function') {
    progText.textContent = `Reconciling 0/${_touchedStudentIds.length}…`;
    const _rc = await _flReconcileMany(_touchedStudentIds, 'bulk_admit', (done, total) => {
      progText.textContent = `Reconciling ${done}/${total}…`;
    });
    if (_rc.failed > 0) {
      showToast(`⚠️ ${_rc.failed} of ${_touchedStudentIds.length} imported students could not be ` +
                `reconciled — run Reconcile All Dues from Due Fee to retry.`, 'warning');
    }
  }

  progBar.style.width  = '100%';
  progText.textContent = 'Done!';
  invalidateStudentCache(); invalidateFinanceCache();
  auditLog('bulk_admit', { admitted, updated, skipped, mergedInSheet, total: rawRows.length });

  // Summary report
  const sumEl = document.getElementById('bulkAdmitSummary');
  sumEl.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:${skipped>0?14:0}px">
      <div style="background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.2);border-radius:8px;padding:12px 20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--gold-lt)">${admitted}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Admitted</div>
      </div>
      <div style="background:rgba(82,168,100,0.12);border:1px solid rgba(82,168,100,0.2);border-radius:8px;padding:12px 20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--success)">${updated}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Dues Updated</div>
      </div>
      ${mergedInSheet > 0 ? `<div style="background:rgba(74,158,202,0.12);border:1px solid rgba(74,158,202,0.2);border-radius:8px;padding:12px 20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:var(--info)">${mergedInSheet}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Multi-Year Merged</div>
      </div>` : ''}
      ${skipped > 0 ? `<div style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:8px;padding:12px 20px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#e09090">${skipped}</div>
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Skipped</div>
      </div>` : ''}
    </div>
    ${mergedInSheet > 0 ? `<div class="alert" style="background:rgba(74,158,202,0.08);border:1px solid rgba(74,158,202,0.2);font-size:12px;margin-bottom:10px">ℹ️ <strong>${mergedInSheet} row${mergedInSheet!==1?'s':''} from the sheet had the same student in two academic years.</strong> Their outstanding balances were combined and merged into a single record.</div>` : ''}
    ${skipReasons.length ? `<div class="alert alert-warning" style="font-size:12px"><strong>Skipped reasons:</strong><br>${skipReasons.map(r=>`• ${sanitizeHTML(r)}`).join('<br>')}</div>` : ''}
    <button class="btn btn-primary btn-sm" onclick="navigate('students')" style="margin-top:8px">← Back to Students</button>`;
  btn.style.display = 'none';
}

