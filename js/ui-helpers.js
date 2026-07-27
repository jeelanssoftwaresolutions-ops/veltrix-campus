/* ============================================================
   TOAST NOTIFICATIONS — BUG-23 FIX: replaces raw alert() calls
   ============================================================ */
function showToast(msg, type='info', duration=3500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9000;display:flex;flex-direction:column;gap:8px;max-width:340px';
    document.body.appendChild(container);
  }
  const colorMap = {
    success: 'rgba(201,168,76,0.95)',
    danger:  'rgba(224,82,82,0.95)',
    info:    'rgba(74,158,202,0.95)',
    warning: 'rgba(212,150,42,0.95)'
  };
  const toast = document.createElement('div');
  toast.style.cssText = `background:${colorMap[type]||colorMap.info};color:#fff;padding:12px 16px;border-radius:10px;font-size:13px;font-family:'DM Sans',sans-serif;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.4);animation:toastIn 0.2s ease;line-height:1.4;word-break:break-word`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal(title, bodyHtml, buttons=[]) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML   = bodyHtml;
  document.getElementById('modalFoot').innerHTML   = buttons.map(b=>`<button class="btn ${b.cls}" onclick="${b.onclick}">${b.label}</button>`).join('');
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function showConfirm(title, body, onOk) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').innerHTML    = `<p style="font-size:14px;color:var(--text)">${body}</p>`;
  const btn = document.getElementById('confirmOkBtn');
  btn.onclick = () => { closeConfirm(); onOk(); };
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }

/* ============================================================
   UTILITY HELPERS
   ============================================================ */
function getVal(id) { const el=document.getElementById(id); return el?(el.value||'').trim():''; }
function showFormAlert(containerId, msg, type) {
  const el=document.getElementById(containerId);
  if(el) el.innerHTML=`<div class="alert alert-${type}">${msg}</div>`;
}
function fmtNum(n) { return Number(n||0).toLocaleString('en-IN'); }

// ════════════════════════════════════════════════════════════════
// JSS-REF-002 ITEM 2 FIX — CHEQUE NUMBER FIELD ON PAYMENT RECORDS
// Shared helper: pulls the cheque number(s) off a transaction, whether it
// came from a split-mode breakup (paymentModeBreakup) or a legacy flat
// `chequeNumber` field. Returns '' when the payment involved no cheque —
// callers display it conditionally (blank cell) for non-cheque payments.
// ════════════════════════════════════════════════════════════════
function _getChequeNoDisplay(t) {
  if (Array.isArray(t.paymentModeBreakup) && t.paymentModeBreakup.length) {
    const chqRows = t.paymentModeBreakup.filter(r => r.mode === 'Cheque');
    if (chqRows.length) return chqRows.map(r => r.chequeNumber || '—').join(', ');
    return '';
  }
  if (t.paymentMode === 'Cheque' && t.chequeNumber) return t.chequeNumber;
  return '';
}

// BUG-I03 FIX: Sanitize user-supplied strings before innerHTML insertion.
// A student name containing <script> or <img onerror=> would execute as stored XSS.
function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}
function fmtDate(ts) {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const date = d.toLocaleDateString('en-IN', {timeZone:IST_TZ, day:'2-digit', month:'short', year:'numeric' });
    const time = d.toLocaleTimeString('en-IN', {timeZone:IST_TZ, hour:'2-digit', minute:'2-digit', hour12:true });
    return `${date}, ${time}`;
  } catch { return '—'; }
}

/* fmtDateOnly — use when only the date is needed (e.g. column headers, DOB, admission date) */
function fmtDateOnly(ts) {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', {timeZone:IST_TZ, day:'2-digit', month:'short', year:'numeric' });
  } catch { return '—'; }
}
function statusBadge(status) {
  // CHG-011: Gold-glass for Paid, amber-glass for Pending, blue-glass for Partial. No green anywhere.
  // BUG-H08 FIX: only genuinely UNRECOGNIZED (pre-migration/legacy) statuses get the "(legacy)"
  // tag — Partial/Pending/Overdue are normal current statuses and render as plain badges.
  const map = { 'Paid':'badge-green', 'Partial':'badge-yellow', 'Pending':'badge-yellow', 'Overdue':'badge-red' }; // BUG-P03: Partial treated same as Pending
  const isLegacy = status && !map[status];   // recognized status → not legacy (was: status !== 'Paid')
  const badge    = `<span class="badge ${map[status]||'badge-gray'}">${status||'—'}</span>`;
  return isLegacy
    ? badge + ` <span style="font-size:9px;color:var(--muted);vertical-align:middle">(legacy)</span>`
    : badge;
}

// Number to words converter
function numberToWords(num) {
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if(num===0)return'Zero';
  if(num<0)return'Minus '+numberToWords(-num);
  let str='';
  if(Math.floor(num/10000000)>0){str+=numberToWords(Math.floor(num/10000000))+' Crore ';num%=10000000;}
  if(Math.floor(num/100000)>0){str+=numberToWords(Math.floor(num/100000))+' Lakh ';num%=100000;}
  if(Math.floor(num/1000)>0){str+=numberToWords(Math.floor(num/1000))+' Thousand ';num%=1000;}
  if(Math.floor(num/100)>0){str+=numberToWords(Math.floor(num/100))+' Hundred ';num%=100;}
  if(num>0){if(num<20)str+=a[num];else str+=b[Math.floor(num/10)]+(num%10?' '+a[num%10]:'');}
  return str.trim();
}

