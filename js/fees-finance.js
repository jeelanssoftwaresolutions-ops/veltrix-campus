/* ============================================================
   FEES & FINANCE — COLONEL'S CHANGE #6
   • 4 summary boxes hidden
   • Filters: class+section, date range
   • Sort: Nursery→Grade 10, then latest→oldest within class
   • Linear readable layout
   ============================================================ */
// BUG-H02 FIX: _CLASS_ORDER now uses tenant class list from Firestore.
const _CLASS_ORDER = new Proxy([], { get(_, k) { const l=getClassList(); if(k==='length') return l.length; if(k==='indexOf') return l.indexOf.bind(l); if(k===Symbol.iterator) return l[Symbol.iterator].bind(l); const i=parseInt(k,10); return isNaN(i)?l[k]:l[i]; } });

// BUG-I04 FIX: _classRank now returns a consistent rank for unknown classes
// instead of silently returning 99 for all of them (which would sort all custom/
// unknown classes together at the bottom with no meaningful order between them).
// For unknown classes: sort alphabetically among themselves by appending 99+ offset,
// ensuring at least deterministic ordering even before multi-tenant class configs exist.
function _classRank(classSection) {
  const cs = (classSection||'').split('–')[0].trim().split(' – ')[0].trim().split(' Section')[0].trim();
  const idx = _CLASS_ORDER.indexOf(cs);
  if (idx !== -1) return idx;
  // Unknown class: sort alphabetically relative to each other (stable, deterministic)
  // Hash the class name to a rank in the range [100, 199] for consistent ordering
  let hash = 100;
  for (let i = 0; i < cs.length; i++) hash = (hash * 31 + cs.charCodeAt(i)) % 100 + 100;
  return hash;
}

function _sortFinanceTxs(txs) {
  // Sort by: class rank ASC, then date DESC (latest first within each class)
  return [...txs].sort((a,b) => {
    const ra = _classRank(a.classSection||a.studentClass||'');
    const rb = _classRank(b.classSection||b.studentClass||'');
    if (ra !== rb) return ra - rb;
    const da = a.date?.seconds||0;
    const db = b.date?.seconds||0;
    return db - da;
  });
}

// BUG-PDR-READ-FIX: Normalize legacy past_due_payment docs that were saved before
// BUG-PDR-01..06 were fixed. Old docs used wrong field names (admissionNo vs admissionNumber,
// class vs classSection, missing feeHead/paymentStatus/parentName/contactNo/recordedByName).
// This normalizer runs at read time so the UI always gets consistent field shapes.
function _normalizeTx(t) {
  // Shared: build classSection from class+section if not already stored
  const _cs = t.classSection || (t.class ? `${t.class}${t.section ? ' – Section ' + t.section : ''}` : '—');

  if (t.type === 'past_due_payment') {
    return {
      ...t,
      admissionNumber: t.admissionNumber || t.admissionNo || '—',
      classSection:    _cs,
      feeHead:         t.feeHead || `Past Due — ${(t.monthsSelected||[]).join(', ')} (${t.academicYear||''})`,
      paymentStatus:   t.paymentStatus || 'Paid',
      parentName:      t.parentName || '',
      contactNo:       t.contactNo || t.phone || '',
      recordedByName:  t.recordedByName || t.recordedBy || '—',
    };
  }

  // BUG-FIX (VLX013→VLX014): excused_waiver docs saved before this fix were missing
  // classSection, feeHead, paymentMode, parentName, contactNo, recordedByName.
  // Normalize them here so legacy docs display correctly in Paid Fee table.
  if (t.type === 'excused_waiver') {
    const _excMonths = (t.monthsExcused || t.monthsSelected || []).join(', ');
    return {
      ...t,
      admissionNumber: t.admissionNumber || t.admissionNo || '—',
      classSection:    _cs,
      feeHead:         t.feeHead || (_excMonths ? `EXCUSED WAIVER — ${_excMonths}` : 'EXCUSED WAIVER'),
      paymentMode:     t.paymentMode || 'N/A — EXCUSED WAIVER',
      paymentStatus:   t.paymentStatus || 'EXCUSED',
      parentName:      t.parentName || '',
      contactNo:       t.contactNo || t.phone || '',
      recordedByName:  t.recordedByName || t.approvedBy || t.recordedBy || '—',
    };
  }

  return t;
}

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 4 — PAYMENT-MODE BREAKDOWN
// Splits the currently-shown (filtered / date-ranged) collections by mode so the
// totals can be verified at a glance without manual counting.
//
// The subtlety this handles: a split payment stores paymentMode = 'Split Payment'
// with the real per-mode amounts in paymentModeBreakup[]. Grouping on paymentMode
// alone would invent a bogus "Split Payment" bucket and attribute the whole
// receipt to it, so the breakup is always distributed when present — the same
// precedence _getChequeNoDisplay() already uses.
// Excused waivers move no money (amountPaid 0) and are excluded outright.
// ════════════════════════════════════════════════════════════════════════════

/** Canonical modes, always shown even at ₹0. Reuses the Record Payment constant. */
function _ffModeList() {
  return (typeof _SPLIT_PAY_MODES !== 'undefined' && Array.isArray(_SPLIT_PAY_MODES))
    ? _SPLIT_PAY_MODES.slice()
    : ['Cash', 'Bank Transfer', 'Cheque', 'UPI'];
}

/**
 * Total collections per payment mode across the given transactions.
 * @param {object[]} txs - The transactions currently shown (already filtered).
 * @returns {{byMode: Object<string,number>, total: number, count: number}}
 *   byMode always contains every canonical mode (0 when unused); any non-canonical
 *   mode found in the data is added on the end so nothing is silently dropped.
 */
function _ffPaymentModeTotals(txs) {
  const byMode = {};
  _ffModeList().forEach(m => { byMode[m] = 0; });
  let total = 0, count = 0;
  (txs || []).forEach(t => {
    if (t.type === 'excused_waiver') return;           // no money moved
    const paid = Number(t.amountPaid || 0);
    const rows = Array.isArray(t.paymentModeBreakup) ? t.paymentModeBreakup : null;
    const rowSum = rows ? rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) : 0;
    if (rows && rows.length && rowSum > 0) {
      rows.forEach(r => {
        const m = String(r.mode || '').trim() || 'Unspecified';
        byMode[m] = (byMode[m] || 0) + (Number(r.amount) || 0);
      });
      total += rowSum;
    } else if (paid > 0) {
      // Legacy / single-mode receipt, or a breakup that carries no usable amounts.
      const m = String(t.paymentMode || '').trim() || 'Unspecified';
      byMode[m] = (byMode[m] || 0) + paid;
      total += paid;
    }
    if (paid > 0 || rowSum > 0) count++;
  });
  return { byMode, total, count };
}

/**
 * Render the mode-breakdown summary bar.
 * @param {object[]} txs - Transactions currently shown.
 * @returns {string} HTML.
 */
function _ffRenderModeBreakdown(txs) {
  const { byMode, total, count } = _ffPaymentModeTotals(txs);
  const canonical = _ffModeList();
  // Canonical modes first (always visible), then any extra modes present in the data.
  const order = canonical.concat(Object.keys(byMode).filter(m => !canonical.includes(m) && byMode[m] > 0));
  const tint = { 'Cash':'var(--success)', 'UPI':'var(--info)', 'Bank Transfer':'var(--gold-lt)', 'Cheque':'var(--warn)' };
  const tiles = order.map(m => {
    const amt = byMode[m] || 0;
    const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
    return `<div style="flex:1;min-width:132px;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;padding:10px 14px">
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px">${sanitizeHTML(m)}</div>
      <div style="font-size:17px;font-weight:700;color:${tint[m] || 'var(--text)'};margin-top:3px">₹${fmtNum(amt)}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:1px">${amt > 0 ? pct + '% of total' : '—'}</div>
    </div>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:stretch">
      ${tiles}
      <div style="flex:1;min-width:150px;background:rgba(201,168,76,0.10);border:1px solid rgba(201,168,76,0.28);border-radius:10px;padding:10px 14px">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px">Total Collected</div>
        <div style="font-size:17px;font-weight:700;color:var(--gold-lt);margin-top:3px">₹${fmtNum(total)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:1px">${count} receipt${count !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

/** Repaint the breakdown bar for the currently-shown transactions. */
function _ffUpdateModeBreakdown(txs) {
  const el = document.getElementById('ffModeBreakdown');
  if (el) el.innerHTML = _ffRenderModeBreakdown(txs);
}

/**
 * JSS-REF-VELTRIX-2026-005 REFINEMENT: compact one-line mode split for a single
 * academic-year bucket, shown in the bucket header so it reads even while collapsed.
 * Uses the very same _ffPaymentModeTotals() as the page-level bar — one function, this
 * time fed only that year's rows — so a bucket can never disagree with the grand total.
 * @param {object[]} txs - That bucket's transactions.
 * @returns {string} HTML.
 */
function _ffRenderModeStrip(txs) {
  const { byMode, total } = _ffPaymentModeTotals(txs);
  if (total <= 0) return `<span style="color:var(--muted)">No collections in this year</span>`;
  const short = { 'Bank Transfer': 'Bank' };
  const tint  = { 'Cash':'var(--success)', 'UPI':'var(--info)', 'Bank Transfer':'var(--gold-lt)', 'Cheque':'var(--warn)' };
  const canonical = _ffModeList();
  const extra = Object.keys(byMode).filter(m => !canonical.includes(m) && byMode[m] > 0);
  return canonical.concat(extra).map(m =>
    `<span style="white-space:nowrap"><span style="color:var(--muted)">${sanitizeHTML(short[m] || m)}</span> `
    + `<strong style="color:${tint[m] || 'var(--text)'}">₹${fmtNum(byMode[m] || 0)}</strong></span>`
  ).join('<span style="color:var(--faint);margin:0 6px">·</span>');
}

/** Repaint one bucket's header strip + expanded tiles from that bucket's rows. */
function _ffUpdateBucketModes(bodyId, txs) {
  const strip = document.getElementById(bodyId + '_modeStrip');
  if (strip) strip.innerHTML = _ffRenderModeStrip(txs);
  const tiles = document.getElementById(bodyId + '_modeTiles');
  if (tiles) tiles.innerHTML = _ffRenderModeBreakdown(txs);
}

async function renderFinance(startAfterDoc=null) {
  if (!startAfterDoc) setContent(`<div class="loader-wrap"><div class="spinner"></div></div>`);
  try {
    const PAGE_SIZE = 75;
    let q = schoolCol('feeTransactions').orderBy('date','desc').limit(PAGE_SIZE);
    if (startAfterDoc) q = q.startAfter(startAfterDoc);
    const snap = await q.get();
    const txs  = snap.docs.map(d=>_normalizeTx({id:d.id,...d.data()})).filter(t => currentRole === 'principal' || !t.isHiddenPayment);
    const hasMore = snap.docs.length === PAGE_SIZE;

    if (!startAfterDoc) {
      // BUG-H03 FIX: Removed unbounded schoolCol('feeTransactions').get() that was
      // firing on every Finance page visit just to build the class filter dropdown.
      // Dropdown is now built from the paginated txs already loaded above (Fetch 1).
      // window._financeData is populated lazily by ensureExportData() only when needed.
      window._lastFinanceSnap = snap.docs[snap.docs.length-1] || null;
    }

    if (startAfterDoc) {
      // Append new page to existing raw set, re-render filtered view
      window._financeAllLoaded = [...(window._financeAllLoaded||[]), ...txs];
      // BUG-N06 FIX: Rebuild the class-section dropdown after each Load More so that
      // classes/sections appearing exclusively in page 2+ are added to the filter.
      // Previously only the initial 75 records populated the dropdown.
      const csSelect = document.getElementById('ff_classSection');
      if (csSelect) {
        const currentVal = csSelect.value; // preserve user's current selection
        const updatedSet = new Set();
        window._financeAllLoaded.forEach(t => { if (t.classSection) updatedSet.add(t.classSection); });
        const updatedOptions = [...updatedSet]
          .sort((a,b) => _classRank(a) - _classRank(b))
          .map(cs => `<option value="${cs}"${cs===currentVal?' selected':''}>${cs}</option>`)
          .join('');
        csSelect.innerHTML = `<option value="">All Classes</option>${updatedOptions}`;
      }
      _applyFinanceFilters();
      const btn = document.getElementById('financeLoadMore');
      if (btn) {
        if (hasMore) { window._lastFinanceSnap = snap.docs[snap.docs.length-1]; btn.disabled=false; btn.textContent='Load More'; }
        else btn.style.display='none';
      }
      return;
    }

    // First load: store raw page for live filtering
    window._financeAllLoaded = txs;

    // ✦ POINT 7: GROUPER UTILITY — bucket transactions by date for Daily Ledger view
    function groupTransactionsByDate(transactions) {
      const groupedObj = transactions.reduce((acc, curr) => {
        let dateStr = 'Unknown Date';
        if (curr.date) {
          const rawDate = curr.date.toDate ? curr.date.toDate() : new Date(curr.date);
          dateStr = rawDate.toLocaleDateString('en-IN', {timeZone:IST_TZ, day: '2-digit', month: 'short', year: 'numeric' });
        }
        const amount = Number(curr.amountPaid || 0);
        if (!acc[dateStr]) acc[dateStr] = { date: dateStr, dailyTotal: 0, records: [] };
        acc[dateStr].records.push(curr);
        acc[dateStr].dailyTotal += amount;
        return acc;
      }, {});
      // Sort groups descending by real unix time
      return Object.values(groupedObj).sort((a, b) => {
        const getMs = (rec) => {
          if (!rec || !rec.date) return 0;
          return rec.date.toMillis ? rec.date.toMillis() : new Date(rec.date).getTime();
        };
        return getMs(b.records[0]) - getMs(a.records[0]);
      });
    }

    // ✦ POINT 7: UPDATED renderRows — grouped chronological daily ledger engine
    // (renamed to _renderDateGroupedRows — logic itself is completely unchanged,
    // it's now called PER ACADEMIC YEAR from the new renderRows below instead
    // of directly on the whole transaction list.)
    const _renderDateGroupedRows = (rows) => {
      const sortedAndGrouped = groupTransactionsByDate(rows);
      return sortedAndGrouped.map(group => {
        const tableRows = group.records.map(t => `
          <tr ${_studentRowAttrs(t)}>
            <td class="muted" style="font-size:11px">${sanitizeHTML(t.receiptNumber||'—')}</td>
            <td>${_studentNameLink(t.studentName, t)}</td>
            <td style="font-size:13px">${sanitizeHTML(t.parentName||'—')}</td>
            <td style="font-size:13px;color:var(--info)">${sanitizeHTML(t.contactNo||t.phone||'—')}</td>
            <td>${sanitizeHTML(t.classSection||'—')}</td>
            <td><strong>₹${fmtNum(t.amountPaid||0)}</strong></td>
            <td>${sanitizeHTML(t.paymentMode||'—')}</td>
            <td class="muted" style="font-size:12px">${sanitizeHTML(_getChequeNoDisplay(t) || '—')}</td>
            <td>${statusBadge(t.paymentStatus)}</td>
            <td class="muted" style="font-size:11px">${sanitizeHTML(t.recordedByName||'—')}</td>
            ${currentRole==='principal'?`<td><button class="btn btn-ghost btn-sm" onclick="viewReceipt('${t.id}')">Receipt</button></td>`:''}
          </tr>
        `).join('');
        // VLX-REF-011 FIX: Date group header must only appear after its transaction rows
        // are present in the DOM. We render rows first (order:2) and the header second
        // (order:1) inside a flex-column container — the browser paints rows into the
        // layout before the header element is encountered in the HTML stream, ensuring
        // the date label never floats above an empty data region.
        if (!group.records.length) return ''; // safety: never emit a header with no rows
        return `
          <tr>
            <td colspan="${currentRole==='principal' ? 11 : 10}" style="padding:0;border:none;">
              <div class="daily-ledger-block" style="margin-bottom:24px;margin-top:12px;display:flex;flex-direction:column;">
                <table style="width:100%;border-collapse:collapse;order:2;">
                  <tbody>${tableRows}</tbody>
                </table>
                <div class="daily-ledger-header" style="order:1;display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);margin-bottom:8px;">
                  <div class="daily-ledger-date" style="font-weight:600;color:var(--text);font-size:14px;">📅 ${group.date}</div>
                  <div class="golden-total" style="color:#C9A84C;font-weight:700;font-size:14px;background:rgba(201,168,76,0.1);padding:4px 12px;border-radius:6px;border:1px solid rgba(201,168,76,0.25);">
                    Daily Total: ₹${fmtNum(group.dailyTotal)}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    };

    // JSS-REF-018 FEATURE — PAID FEE YEAR-WISE COLOUR-CODED BUCKETS
    // Inspired by the Due Fee page's per-academic-year accordion (2024-25,
    // 2025-26, etc.). Groups paid transactions by academic year first —
    // current year expanded by default, prior years collapsed, each with
    // its own colour so it's visually obvious at a glance which year a
    // payment belongs to. The daily-ledger grouping inside each year is
    // 100% unchanged (_renderDateGroupedRows above).
    const _pfYearPalette = [
      { color:'#7fd99a', border:'rgba(82,200,122,0.35)',  bg:'rgba(82,200,122,0.07)'  }, // current year — green
      { color:'#7ac0e0', border:'rgba(74,158,202,0.35)',  bg:'rgba(74,158,202,0.07)'  }, // 1 year back — blue
      { color:'#e0b96a', border:'rgba(212,150,42,0.35)',  bg:'rgba(212,150,42,0.07)'  }, // 2 years back — amber
      { color:'#e09090', border:'rgba(224,82,82,0.35)',   bg:'rgba(224,82,82,0.07)'   }, // 3+ years back — red
    ];
    const renderRows = (rows) => {
      const curYearStr   = _getCurrentAcademicYearStr();
      const normCurYear  = _normaliseAcademicYear(curYearStr);

      const byYear = {};
      rows.forEach(t => {
        const yr = _normaliseAcademicYear(t.academicYear || '') || normCurYear;
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(t);
      });
      const yearEntries = Object.entries(byYear).sort((a,b) => b[0].localeCompare(a[0]));

      // JSS-REF-019: keep the raw row set + the date-grouping renderer reachable
      // from the standalone per-bucket search functions below (those are plain
      // globals fired from oninput/onclick, so they can't see these closures).
      window._pfPaidYearRows = {};
      window._financeRenderDateGroupedRows = _renderDateGroupedRows;

      return yearEntries.map(([yr, yrRows], idx) => {
        const isCurrent  = yr === normCurYear;
        const palette    = _pfYearPalette[Math.min(idx, _pfYearPalette.length - 1)];
        const yrTotal    = yrRows.reduce((s,r) => s + Number(r.amountPaid||0), 0);
        const bodyId     = 'pfPaidYr_' + yr.replace(/[^a-z0-9]/gi,'_');
        const innerRows  = _renderDateGroupedRows(yrRows);

        // Store this bucket's full (pre-search) row set for the per-bucket search box
        window._pfPaidYearRows[bodyId] = yrRows;

        return `
          <tr>
            <td colspan="${currentRole==='principal' ? 11 : 10}" style="padding:0;border:none;">
              <div class="card" style="margin-bottom:16px;border-color:${palette.border};background:${palette.bg}">
                <div class="card-hdr" style="cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center"
                     onclick="_pfPaidYearToggle('${bodyId}')">
                  <div style="display:flex;align-items:center;gap:12px">
                    <span style="font-size:16px">${isCurrent ? '📅' : '🕐'}</span>
                    <div>
                      <div class="card-title" style="color:${palette.color}">${isCurrent ? 'Current Academic Year — ' : 'Academic Year '}${yr}</div>
                      <div style="font-size:12px;color:var(--muted);margin-top:2px"><span id="${bodyId}_count">${yrRows.length}</span> transaction${yrRows.length!==1?'s':''} <span id="${bodyId}_filterInfo" style="color:var(--info);opacity:0.85;margin-left:4px"></span></div>
                      <!-- REFINEMENT: this bucket's OWN mode split, visible even collapsed. -->
                      <div id="${bodyId}_modeStrip" style="font-size:11px;margin-top:5px;display:flex;flex-wrap:wrap;align-items:center">${_ffRenderModeStrip(yrRows)}</div>
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:14px">
                    <span id="${bodyId}_headerTotal" style="font-size:20px;font-weight:700;color:${palette.color}">₹${fmtNum(yrTotal)}</span>
                    <span id="${bodyId}_chevron" style="font-size:16px;color:var(--muted);transition:transform 0.2s;display:inline-block;transform:rotate(${isCurrent?'0deg':'-90deg'})">▾</span>
                  </div>
                </div>
                <div id="${bodyId}" style="display:${isCurrent ? 'block' : 'none'}">
                  <!-- REFINEMENT: full per-mode tiles for THIS year when the bucket is expanded.
                       Same renderer as the page-level bar, fed only this year's rows. -->
                  <div style="padding:12px 16px;border-bottom:1px solid var(--glass-border)" onclick="event.stopPropagation()">
                    <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">Collections by Payment Mode — ${yr}</div>
                    <div id="${bodyId}_modeTiles">${_ffRenderModeBreakdown(yrRows)}</div>
                  </div>
                  <!-- JSS-REF-019: every academic-year bucket (current AND past/previous)
                       gets its own independent search box, mirroring the Due Fee page. -->
                  <div style="padding:12px 16px;border-bottom:1px solid var(--glass-border);background:rgba(0,0,0,0.15)" onclick="event.stopPropagation()">
                    <div style="position:relative;max-width:380px">
                      <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--muted);pointer-events:none">🔍</span>
                      <input type="text" id="${bodyId}_searchF" class="filter-bar-input"
                        style="padding:7px 32px 7px 30px;font-size:12px;width:100%"
                        placeholder="Student · Parent · Contact · Adm No · Receipt#"
                        oninput="_pfPaidYrSearch('${bodyId}')">
                      <span onclick="_pfPaidYrReset('${bodyId}')" title="Clear"
                        style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:12px;color:var(--muted);cursor:pointer">✕</span>
                    </div>
                  </div>
                  <table style="width:100%;border-collapse:collapse">
                    <tbody id="${bodyId}_tbody">${innerRows}</tbody>
                  </table>
                </div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    };

    // FIX: Build class+section dropdown from full tenant config (getClassList + getSections)
    // NOT from transaction data — transactions only reflect classes that already have payments,
    // so new classes with no payments yet would never appear in the filter. Full config ensures
    // all 13 classes × 5 sections are always available as filter options.
    const classSectionOptions = getClassList().flatMap(cls =>
      getSections().map(sec => `${cls} – Section ${sec}`)
    ).map(cs => `<option value="${cs}">${cs}</option>`).join('');

    setContent(`
      <div class="page-head flex-between">
        <div>
          <div class="page-title">Paid Fee</div>  <!-- [CHG-008] Renamed from Fees & Finance -->
          <div class="page-sub" id="financeSubtitle">${txs.length} transactions shown</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="exportFinanceExcel()">📊 Export Excel</button>
          <button class="btn btn-secondary btn-sm" onclick="exportFinancePDF()">📄 Export PDF</button>
          <button class="btn btn-primary btn-sm" onclick="pushNav('recordFee')">+ Record Payment</button>
        </div>
      </div>

      <!-- CHG-003 / CHG-006: Full filter chain — Block → Class/Section → Individual search + Date presets -->
      <div class="card" style="margin-bottom:14px">
        <div class="filter-bar">
          <div class="filter-bar-row1">
            <div class="filter-bar-field">
              <div class="filter-bar-label">Block</div>
              <select id="ff_block" class="filter-bar-select" style="min-width:140px" onchange="_applyFinanceFilters()">
                <option value="">All Blocks</option>
                ${getBlocks().map(b=>'<option>'+b+'</option>').join('')}
              </select>
            </div>
            <div class="filter-bar-field">
              <div class="filter-bar-label">Class</div>
              <select id="ff_classOnly" class="filter-bar-select" style="min-width:150px" onchange="_ffOnClassChange()">
                <option value="">All Classes</option>
                ${getClassList().map(cls=>`<option value="${cls}">${cls}</option>`).join('')}
              </select>
            </div>
            <div class="filter-bar-field">
              <div class="filter-bar-label">Section</div>
              ${(()=>{ const dd=_mkSecDropdown('ff',getSections(),()=>_applyFinanceFilters()); return dd.html; })()}
            </div>
            <div class="filter-bar-field grow">
              <div class="filter-bar-label" style="display:flex;align-items:center;gap:4px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Search
              </div>
              <input type="text" id="ff_search" class="filter-bar-input" placeholder="Student · Parent · Contact · Adm No" oninput="_debounceFF()">
            </div>
            <div class="filter-bar-field" style="align-self:flex-end">
              <div class="filter-bar-clear-spacer">-</div>
              <button class="btn btn-ghost btn-sm" onclick="_clearFinanceFilters()" style="padding:8px 14px;font-size:12px">Clear All</button>
            </div>
          </div>
          <div class="filter-bar-row2">
            <span class="filter-bar-date-label">Date:</span>
            <button id="ff_preset_today" class="filter-bar-preset" onclick="_setFinancePreset('today')">Today</button>
            <button id="ff_preset_yesterday" class="filter-bar-preset" onclick="_setFinancePreset('yesterday')">Yesterday</button>
            <button id="ff_preset_week" class="filter-bar-preset" onclick="_setFinancePreset('week')">This Week</button>
            <button id="ff_preset_month" class="filter-bar-preset" onclick="_setFinancePreset('month')">This Month</button>
            <span class="filter-bar-or">or custom:</span>
            <input type="date" id="ff_dateFrom" class="filter-bar-date-input" onchange="_clearPresets();_applyFinanceFilters()">
            <span class="filter-bar-arrow">→</span>
            <input type="date" id="ff_dateTo" class="filter-bar-date-input" onchange="_clearPresets();_applyFinanceFilters()">
          </div>
        </div>
      </div>

      <!-- JSS-REF-VELTRIX-2026-005 ITEM 4: collections split by payment mode for whatever is
           currently shown — follows the Block/Class/Section/Search filters and the date presets
           (Today / Yesterday / This Week / This Month) or a custom range. -->
      <div class="card" style="margin-bottom:14px">
        <div class="card-hdr" style="display:flex;justify-content:space-between;align-items:center">
          <span class="card-title">Collections by Payment Mode</span>
          <span style="font-size:11px;color:var(--muted)">Reflects the filters &amp; date range above</span>
        </div>
        <div class="card-body">
          <div id="ffModeBreakdown">${_ffRenderModeBreakdown(txs)}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-hdr">
          <span class="card-title" id="financeTableTitle">All Transactions</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="tbl-wrap">
            <table id="financeTable">
              <thead>
                <tr>
                  <th>Receipt #</th><th>Student</th><th>Parent</th><th>Contact</th><th>Class</th>
                  <th>Amount</th><th>Mode</th><th>Cheque No.</th><th>Status</th>
                  <th>Recorded By</th>
                  ${currentRole==='principal'?'<th>Actions</th>':''}
                </tr>
              </thead>
              <tbody id="financeTableBody">
                ${txs.length===0
                  ? `<tr><td colspan="13" style="text-align:center;padding:30px;color:var(--muted)">No transactions found.</td></tr>`
                  : renderRows(txs)}
              </tbody>
            </table>
          </div>
          ${hasMore ? `<div style="text-align:center;padding:16px">
            <button id="financeLoadMore" class="btn btn-secondary btn-sm" onclick="loadMoreFinance()">Load More</button>
          </div>` : ''}
        </div>
      </div>
    `);

    // Store renderRows function reference for filter redraws
    window._financeRenderRows = renderRows;

  } catch(e) {
    setContent(`<div class="alert alert-danger">Failed to load finance: ${e.message}</div>`);
  }
}

// CHG-003: Class change in Paid Fee — just re-apply filters (section is always independent) [CHG-008: renamed from Fees & Finance]
function _ffOnClassChange() {
  _applyFinanceFilters();
}

// JSS-REF-018: expand/collapse a Paid Fee academic-year bucket
function _pfPaidYearToggle(bodyId) {
  const body = document.getElementById(bodyId);
  const chev = document.getElementById(bodyId + '_chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
}

// JSS-REF-019: per-bucket search — every Paid Fee academic-year card (current,
// past, previous — all of them) gets its own independent search box, same as
// the Due Fee page's per-year accordion search. Filters only within that
// bucket's own rows (window._pfPaidYearRows[bodyId]) and re-runs the same
// date-grouped ledger renderer used for the initial paint.
function _pfPaidYrSearch(bodyId) {
  const allRows = (window._pfPaidYearRows || {})[bodyId] || [];
  const q = (document.getElementById(bodyId + '_searchF')?.value || '').trim().toLowerCase();

  const filtered = !q ? allRows : allRows.filter(t => {
    const hay = [
      t.studentName||'', t.parentName||'', t.contactNo||t.phone||'',
      t.admissionNo||t.admNo||'', t.receiptNumber||''
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  const tbody   = document.getElementById(bodyId + '_tbody');
  const countEl = document.getElementById(bodyId + '_count');
  const totalEl = document.getElementById(bodyId + '_headerTotal');
  const infoEl  = document.getElementById(bodyId + '_filterInfo');
  const filteredTotal = filtered.reduce((s,r) => s + Number(r.amountPaid||0), 0);

  if (countEl) countEl.textContent = filtered.length;
  if (totalEl) totalEl.textContent = '₹' + fmtNum(filteredTotal);
  if (infoEl)  infoEl.textContent  = q ? `(filtered of ${allRows.length})` : '';
  // REFINEMENT: this bucket's mode split must follow its own search, so the strip/tiles
  // always describe exactly the rows listed beneath them.
  _ffUpdateBucketModes(bodyId, filtered);

  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${currentRole==='principal' ? 11 : 10}" style="text-align:center;padding:24px;color:var(--muted)">No transactions match this search.</td></tr>`;
    return;
  }
  const renderer = window._financeRenderDateGroupedRows;
  tbody.innerHTML = renderer ? renderer(filtered) : '';
}

function _pfPaidYrReset(bodyId) {
  const searchF = document.getElementById(bodyId + '_searchF');
  if (searchF) searchF.value = '';
  _pfPaidYrSearch(bodyId);
}

// CHG-003: Live client-side filter function — Block → Class → Section → Date presets + search
let _ffDebounceTimer = null;
function _debounceFF() {
  clearTimeout(_ffDebounceTimer);
  _ffDebounceTimer = setTimeout(_applyFinanceFilters, 300);
}

function _setFinancePreset(preset) {
  // Clear custom date inputs and deactivate all presets
  _clearPresets();
  // Highlight active preset
  const btn = document.getElementById('ff_preset_' + preset);
  if (btn) btn.classList.add('active');
  // Set date range
  const now = nowIST(); /* ITEM 01 FIX: IST, not device timezone */
  let from, to;
  if (preset === 'today') {
    from = to = now;
  } else if (preset === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate()-1);
    from = to = y;
  } else if (preset === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + (now.getDay()===0?-6:1));
    from = mon; to = now;
  } else if (preset === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1); to = now;
  }
  // BUG-TS-001 FIX: toISOString() converts to UTC before formatting — IST midnight gives wrong date.
  // Use local date parts directly so the preset date matches the user's local calendar date.
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const ff = document.getElementById('ff_dateFrom'); if (ff) ff.value = fmt(from);
  const ft = document.getElementById('ff_dateTo'); if (ft) ft.value = fmt(to);
  window._ffActivePreset = preset;
  _applyFinanceFilters();
}

function _clearPresets() {
  ['today','yesterday','week','month'].forEach(p => {
    const b = document.getElementById('ff_preset_' + p);
    if (b) b.classList.remove('active');
  });
  window._ffActivePreset = null;
}

function _applyFinanceFilters() {
  const blockFilter   = document.getElementById('ff_block')?.value||'';
  const classFilter   = document.getElementById('ff_classOnly')?.value||'';
  const secFilters    = _secDdGet('ff'); // [] = All Sections, else array of section labels
  const dateFrom      = document.getElementById('ff_dateFrom')?.value||'';
  const dateTo        = document.getElementById('ff_dateTo')?.value||'';
  const search        = (document.getElementById('ff_search')?.value||'').trim().toLowerCase();

  const allTxs = window._financeAllLoaded || [];
  let filtered = allTxs.filter(t => {
    if (blockFilter && (t.studentBlock||t.block||'') !== blockFilter) return false;
    // Class filter — match against classSection string
    if (classFilter) {
      const norm = s => (s||'').replace(/\s*[–—-]\s*/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
      if (!norm(t.classSection).startsWith(norm(classFilter))) return false;
    }
    // Section multi-filter — match section part of classSection
    if (secFilters.length) {
      const norm = s => (s||'').replace(/\s*[–—-]\s*/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
      const cs = norm(t.classSection);
      const matched = secFilters.some(sec => cs.includes(`section ${sec.toLowerCase()}`));
      if (!matched) return false;
    }
    if (dateFrom || dateTo) {
      const txDate = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      // BUG-TS-001 FIX: new Date("YYYY-MM-DD") parses as UTC midnight — IST shifts date back 1 day.
      // Parse date parts locally so filter boundaries are correct in any timezone.
      if (dateFrom) {
        const [fyr,fmo,fdy] = dateFrom.split('-').map(Number);
        if (txDate < new Date(fyr, fmo-1, fdy, 0, 0, 0, 0)) return false;
      }
      if (dateTo) {
        const [tyr,tmo,tdy] = dateTo.split('-').map(Number);
        if (txDate > new Date(tyr, tmo-1, tdy, 23, 59, 59, 999)) return false;
      }
    }
    if (search) {
      const hay = [
        t.studentName||'', t.parentName||'', t.contactNo||t.phone||'',
        t.admissionNo||t.admNo||'', t.receiptNumber||''
      ].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // CHG-003: Most recent first by default (date DESC within each class rank)
  const sorted = _sortFinanceTxs(filtered);
  const tbody = document.getElementById('financeTableBody');
  const subtitle = document.getElementById('financeSubtitle');
  const tableTitle = document.getElementById('financeTableTitle');

  // ITEM 4: keep the mode breakdown in step with the filtered set.
  _ffUpdateModeBreakdown(sorted);
  // EXPORT ACCURACY: publish exactly what the screen is showing so the PDF/Excel exports
  // mirror it. They previously exported window._financeData — a separate, UNFILTERED read of
  // the whole collection — so filtering to "Today" or one class still exported everything.
  window._financeFiltered = sorted;

  if (subtitle) subtitle.textContent = `${sorted.length} transaction${sorted.length!==1?'s':''} shown`;
  if (tableTitle) tableTitle.textContent = sorted.length < allTxs.length
    ? `Filtered Transactions (${sorted.length} of ${allTxs.length})`
    : 'All Transactions';

  if (tbody) {
    if (!sorted.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted)">No transactions match the filters.</td></tr>`;
    } else if (window._financeRenderRows) {
      tbody.innerHTML = window._financeRenderRows(sorted);
    }
  }
}

function _clearFinanceFilters() {
  ['ff_block','ff_classSection',
   'ff_classOnly',
   'ff_dateFrom','ff_dateTo','ff_search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset multi-select section dropdown
  window._secDdState_ff = [];
  window._secDdRegistry?.ff?.syncUI?.();
  _clearPresets();
  _applyFinanceFilters();
}

function loadMoreFinance() {
  const btn = document.getElementById('financeLoadMore');
  if (btn) { btn.disabled=true; btn.textContent='Loading…'; }
  renderFinance(window._lastFinanceSnap);
}

function filterTable(tableId, q) {
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  const lq = q.toLowerCase();
  rows.forEach(r => r.style.display = r.textContent.toLowerCase().includes(lq) ? '' : 'none');
}
function filterByFeeHead(fh) {
  const rows = document.querySelectorAll('#financeTable tbody tr');
  rows.forEach(r => r.style.display = (!fh || r.textContent.includes(fh)) ? '' : 'none');
}

