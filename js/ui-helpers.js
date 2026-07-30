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

// ════════════════════════════════════════════════════════════════════════════
// JSS-REF-VELTRIX-2026-005 ITEM 2 — UNIVERSAL CLICK-TO-PROFILE
// ONE shared renderer + ONE shared handler for every student name shown in a
// list or table, so the behaviour is defined in a single place instead of being
// copy-pasted per screen (academic.js and terminated.js each had their own
// inline onclick before this).
//
// Deliberately NOT applied to search/picker dropdowns (Record Payment, Past Due,
// Excused, Individual Promotion) — a click there already selects the student for
// that form, and hijacking it would break the workflow. The global search box
// already routes to the profile via selectSearchResult().
// ════════════════════════════════════════════════════════════════════════════

/**
 * Render a student name as a clickable profile link.
 * @param {string} name - Display name.
 * @param {object} ref - Any row/transaction/student object; the id is read from
 *   `id` or `studentId`, falling back to `admissionNo` / `admissionNumber`.
 * @returns {string} HTML. Falls back to plain bold text when nothing identifies
 *   the student (e.g. an import preview row that has no record yet).
 */
function _studentNameLink(name, ref) {
  const label = sanitizeHTML(name || '—');
  // ITEM 2 FIX: prefer studentId — `ref.id` is the row's OWN collection doc id (feeTransactions /
  // concessionFees / legacyStudents / terminatedStudents), not a student id.
  const id  = String((ref && (ref.studentId || ref.id)) || '').trim();
  const adm = String((ref && (ref.admissionNo || ref.admissionNumber)) || '').trim();
  if (!id && !adm) return `<strong>${label}</strong>`;
  // FULL-ROW CLICK: the whole <tr> is the click target now (see _studentRowAttrs + the delegated
  // listener below), so the name carries NO handler of its own and NO underline — it is simply
  // tinted/bold so it still reads as the row's subject rather than as a raw hyperlink.
  return `<strong class="student-link" style="color:var(--gold-lt)">${label}</strong>`;
}

/** Descendants that own their own behaviour — a click inside these must NEVER navigate. */
const _STUDENT_ROW_INTERACTIVE =
  'button, a, input, select, textarea, label, [onclick], [contenteditable="true"], .month-pill';

/**
 * Attributes that make a table row open a student's profile when clicked.
 * Spread onto the row: `<tr ${_studentRowAttrs(row)}>`. Emits nothing when the row
 * identifies no student, so such rows simply stay non-clickable.
 * @param {object} ref - Any row/transaction/student object (same shape _studentNameLink takes).
 * @returns {string} HTML attributes, or '' when not resolvable.
 */
function _studentRowAttrs(ref) {
  const id  = String((ref && (ref.studentId || ref.id)) || '').trim();
  const adm = String((ref && (ref.admissionNo || ref.admissionNumber)) || '').trim();
  if (!id && !adm) return '';
  const a = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `class="student-row" data-sid="${a(id)}" data-adm="${a(adm)}" title="Open student profile"`;
}

// ONE delegated listener for every student row in the app — installed once here rather than
// attaching a handler per row, so behaviour stays defined in a single place. Any click that
// originates inside an interactive control (Record Dues / Receipt / Edit buttons, checkboxes,
// dropdowns, month pills, or anything carrying its own onclick) is ignored and keeps working
// exactly as before; only "empty" areas of the row navigate.
document.addEventListener('click', function (e) {
  const t = e.target;
  if (!t || typeof t.closest !== 'function') return;
  const row = t.closest('tr.student-row');
  if (!row) return;
  if (t.closest(_STUDENT_ROW_INTERACTIVE)) return;   // let the row's own controls win
  if (window.getSelection && String(window.getSelection()).length > 0) return; // text being selected
  openStudentProfile(row.dataset.sid || '', row.dataset.adm || '');
});

/**
 * Open a student's profile from any screen. Resolves an admission number to a
 * doc id when the row carries no studentId (e.g. the Concession register).
 * @param {string} id - Student doc id, or '' when unknown.
 * @param {string} [admissionNo] - Fallback identifier.
 * @returns {Promise<void>}
 */
async function openStudentProfile(id, admissionNo) {
  // ITEM 2 FIX: never navigate on an unvalidated id. A row's `id` can belong to another collection
  // (a receipt, a concession record, a terminated/legacy entry), which produced "Student not found".
  // _flResolveStudentRefId validates the candidate against /students and falls back to the
  // admission number — the same explicit student-identity resolution Due Fee's rows rely on.
  let sid = String(id || '').trim();
  try {
    const all = await getStudentCache();
    sid = _flResolveStudentRefId({ studentId: sid, admissionNumber: admissionNo }, all);
  } catch (_) { /* keep the raw candidate; the guard below still applies */ }
  if (!sid) { showToast('Profile not available for this record.', 'warning'); return; }
  pushNav('studentProfile', { id: sid });
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

