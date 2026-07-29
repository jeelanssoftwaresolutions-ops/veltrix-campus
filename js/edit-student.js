/* ============================================================
   EDIT STUDENT MODAL
   ============================================================ */
async function showEditStudentModal(id) {
  const doc = await schoolCol('students').doc(id).get();
  const s = doc.data();
  const classOptions = getClassList(); // BUG-H02 FIX: dynamic per-tenant class list
  // COLONEL'S CHANGE #2: DOB, PEN, Address, Previous School removed. Fee S.No added
  // ROLE-BASED EDIT: Admin sees only Name/Gender/Parent. Principal sees all fields.
  const isPrincipalEdit = currentRole === 'principal';
  openModal(isPrincipalEdit ? 'Edit Student Profile (Full)' : 'Edit Student — Basic Info', `
    <div id="editStudentAlert"></div>
    ${isPrincipalEdit ? `
    <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)">Block Assignment</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Block *</label>
        <select class="form-control" id="es_block">
          <option value="">Select block</option>
          ${getBlocks().map(b=>`<option ${s.block===b?'selected':''}>${b}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">Auto-assigned from gender. Select <strong>Other</strong> gender to assign manually.</div>
      </div>
    </div>` : ''}
    <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)">Personal Information</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Full Name *</label><input class="form-control" id="es_name" value="${s.name||''}"></div>
      <div class="form-group">
        <label class="form-label">Gender *</label>
        <select class="form-control" id="es_gender" onchange="${isPrincipalEdit?`syncBlockFromGender('es_gender','es_block')`:'void(0)'}">
          <option value="">Select gender</option>
          <option ${s.gender==='Male'?'selected':''}>Male</option>
          <option ${s.gender==='Female'?'selected':''}>Female</option>
          <option ${s.gender==='Other'?'selected':''}>Other</option>
        </select>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin:16px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)">Parent / Guardian</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Parent / Guardian Name *</label><input class="form-control" id="es_parent" value="${s.parentName||''}"></div>
      ${isPrincipalEdit ? `<div class="form-group"><label class="form-label">Contact</label><input class="form-control" id="es_contact" type="tel" inputmode="numeric" maxlength="10" value="${s.contact||''}" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)"></div>` : ''}
    </div>
    ${isPrincipalEdit ? `
    <div style="font-size:11px;font-weight:700;color:var(--gold-lt);letter-spacing:1px;text-transform:uppercase;margin:16px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)">Academic Details</div>
    <div class="form-row-3">
      <div class="form-group">
        <label class="form-label">Class</label>
        <select class="form-control" id="es_class">
          <option value="">Select class</option>
          ${classOptions.map(c=>`<option ${s.class===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Section</label>
        <select class="form-control" id="es_section">
          <option value="">Select section</option>
          ${getSections().map(sec=>`<option ${s.section===sec?'selected':''}>${sec}</option>`).join('')}
        </select>
      </div>
      <!-- [CHG-020] Roll Number field removed -->
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Admission Number</label><input class="form-control" id="es_admNo" value="${s.admissionNumber||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Date of Admission
          <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;margin-left:6px">DD MMM YYYY format shown in profile</span>
        </label>
        <input type="date" class="form-control" id="es_admissionDate"
          value="${s.admissionDate
            ? (()=>{const _ad=s.admissionDate.toDate?s.admissionDate.toDate():new Date(s.admissionDate);return `${_ad.getFullYear()}-${String(_ad.getMonth()+1).padStart(2,'0')}-${String(_ad.getDate()).padStart(2,'0')}`;})() /* BUG-TS-001 FIX */
            : ''}">
      </div>
    </div>` : `
    <div style="font-size:11px;color:var(--muted);margin-top:12px;padding:10px 12px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.20);border-radius:var(--rad)">
      ⚠ Admins can only edit Name, Gender, and Parent Name. Contact your Principal to change class, section, or admission number.
    </div>`}
  `, [
    { label:'Cancel', cls:'btn-ghost',   onclick:'closeModal()' },
    { label:'Save Changes', cls:'btn-primary', onclick:`saveEditStudent('${id}')` }
  ]);
  // Pre-lock block field if existing gender already maps to a block
  setTimeout(() => syncBlockFromGender('es_gender', 'es_block'), 80);
}

async function saveEditStudent(id) {
  // ROLE-BASED SAVE: Admin can only update name, gender, parentName.
  // Principal can update all fields (CHG-014 admissionDate included).
  const isPrincipalSave = currentRole === 'principal';
  const admDateRaw = isPrincipalSave ? getVal('es_admissionDate') : '';
  const data = isPrincipalSave ? {
    name:            getVal('es_name'),
    gender:          getVal('es_gender'),
    block:           getVal('es_block'),
    class:           getVal('es_class'),
    section:         getVal('es_section'),
    // [CHG-020] rollNumber removed
    admissionNumber: getVal('es_admNo'),
    parentName:      getVal('es_parent'),
    contact:         getVal('es_contact')
  } : {
    name:       getVal('es_name'),
    gender:     getVal('es_gender'),
    parentName: getVal('es_parent'),
  };
  if (isPrincipalSave && admDateRaw) {
    data.admissionDate = firebase.firestore.Timestamp.fromDate(new Date(admDateRaw));
  }
  Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
  // Uniqueness check for admissionNumber — principal only
  if (isPrincipalSave) {
    try {
      if (data.admissionNumber) {
        const dupSnap = await schoolCol('students').where('admissionNumber','==',data.admissionNumber).get();
        const conflict = dupSnap.docs.find(d => d.id !== id);
        if (conflict) {
          showFormAlert('editStudentAlert', `Admission Number "${data.admissionNumber}" is already assigned to another student.`, 'danger');
          return;
        }
      }
    } catch(e) { showFormAlert('editStudentAlert','Validation error: '+e.message,'danger'); return; }
  }
  try {
    await schoolCol('students').doc(id).update(data);
    auditLog('student_profile_edited', { studentId: id, updatedFields: Object.keys(data) }); // BUG-N19 FIX
    invalidateStudentCache(); // refresh cache after edit
    closeModal();
    pushNav('studentProfile', { id });
  } catch(e) { showFormAlert('editStudentAlert','Error: '+e.message,'danger'); }
}

