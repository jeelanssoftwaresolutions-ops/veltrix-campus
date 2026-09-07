/* ============================================================
   PROFILE
   ============================================================ */
function renderProfile() {
  const p = currentProfile || {};
  setContent(`
    <div class="page-head">
      <div class="page-title">My Profile</div>
      <div class="page-sub">Manage your account information and credentials.</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px">
      <div class="card">
        <div class="card-hdr"><span class="card-title">Profile Information</span></div>
        <div class="card-body">
          <div id="profileAlert"></div>
          <div style="text-align:center;margin-bottom:20px">
            <div style="width:72px;height:72px;border-radius:50%;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;margin:0 auto 12px" id="profileAvatarInitial">${(p.name||'U').charAt(0).toUpperCase()}</div>
            <div style="font-size:12px;color:var(--muted)">${currentRole==='principal'?'Principal':'Admin'}</div>
          </div>
          <div class="form-group"><label class="form-label">Full Name</label><input class="form-control" id="pf_name" value="${p.name||''}"></div>
          <div class="form-group"><label class="form-label">Designation</label><input class="form-control" id="pf_designation" value="${p.designation||''}"></div>
          <div class="form-group"><label class="form-label">Email Address</label><input class="form-control" id="pf_email" value="${p.email||currentUser?.email||''}" disabled></div>
          <div class="form-group"><label class="form-label">Phone Number</label><input class="form-control" id="pf_phone" type="tel" inputmode="numeric" maxlength="10" value="${p.phone||''}" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)"></div>
          <div class="form-group"><label class="form-label">Qualification</label><input class="form-control" id="pf_qual" value="${p.qualification||''}"></div>
          <div class="form-group"><label class="form-label">Office Address</label><textarea class="form-control" id="pf_addr" rows="2">${p.officeAddress||''}</textarea></div>
          <button class="btn btn-primary" id="saveProfileBtn" onclick="saveProfile()">Save Changes</button>
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><span class="card-title">Change Password</span></div>
        <div class="card-body">
          <div id="pwAlert"></div>
          <div class="alert alert-info" style="margin-bottom:16px;font-size:12px">Passwords must be at least 8 characters and include letters and numbers.</div>
          <div class="form-group"><label class="form-label">Current Password</label><input type="password" class="form-control" id="pw_current" placeholder="••••••••"></div>
          <div class="form-group"><label class="form-label">New Password</label><input type="password" class="form-control" id="pw_new" placeholder="••••••••"></div>
          <div class="form-group"><label class="form-label">Confirm New Password</label><input type="password" class="form-control" id="pw_confirm" placeholder="••••••••"></div>
          <button class="btn btn-primary" onclick="changePassword()">Update Password</button>
        </div>
      </div>
    </div>
  `);
}

async function saveProfile() {
  // P-C #11: Guard — currentUser must be authenticated before writing
  if (!currentUser) {
    showFormAlert('profileAlert', 'Session expired. Please log in again.', 'danger');
    return;
  }

  const data = {
    name:          getVal('pf_name'),
    designation:   getVal('pf_designation'),
    phone:         getVal('pf_phone'),
    qualification: getVal('pf_qual'),
    officeAddress: getVal('pf_addr')
  };

  if (!data.name) {
    showFormAlert('profileAlert', 'Full Name is required.', 'danger');
    return;
  }

  const btn = document.getElementById('saveProfileBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    // P-C #11 FIX: Force-refresh the Firebase Auth ID token before writing.
    // Stale JWT tokens (>1hr old) cause false PERMISSION_DENIED errors even when
    // the Firestore rule is correct. getIdToken(true) forces a fresh token fetch.
    await currentUser.getIdToken(true);

    const userRef = db.collection('users').doc(currentUser.uid);

    // P-C #11 FIX: Try update() first — only touches the specified fields,
    // preserves all existing fields (role, schoolId, block, email).
    // Falls back to set({merge:true}) if the document doesn't exist yet.
    try {
      await userRef.update(data);
    } catch(updateErr) {
      if (updateErr.code === 'not-found') {
        // Document doesn't exist — create it with merge so no fields are lost
        await userRef.set(data, { merge: true });
      } else {
        throw updateErr; // re-throw permission errors, network errors, etc.
      }
    }

    Object.assign(currentProfile, data);
    updateSidebarUser();

    const avatarEl = document.getElementById('profileAvatarInitial');
    if (avatarEl) avatarEl.textContent = (data.name).charAt(0).toUpperCase();

    showFormAlert('profileAlert', '✅ Profile updated successfully!', 'success');
    showToast('Profile saved.', 'success');

  } catch(e) {
    // P-C #11 FIX: Actionable error message — tells exactly which Firestore rule to add
    let msg;
    if (e.code === 'permission-denied') {
      msg = '❌ Permission denied. Add this rule in Firebase Console → Firestore → Rules:<br>' +
            '<code style="font-size:11px;background:rgba(0,0,0,0.3);padding:4px 8px;border-radius:4px;display:block;margin-top:6px;">' +
            'match /users/{userId} {<br>' +
            '&nbsp;&nbsp;allow read, write: if request.auth != null && request.auth.uid == userId;<br>' +
            '}</code>';
    } else {
      msg = '❌ Save failed: ' + e.message;
    }
    showFormAlert('profileAlert', msg, 'danger');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

async function changePassword() {
  const cur = getVal('pw_current'); const nw = getVal('pw_new'); const cn = getVal('pw_confirm');
  if (!cur||!nw||!cn) { showFormAlert('pwAlert','Please fill all fields.','danger'); return; }
  if (nw !== cn)      { showFormAlert('pwAlert','New passwords do not match.','danger'); return; }
  if (nw.length < 8)  { showFormAlert('pwAlert','Password must be at least 8 characters.','danger'); return; }
  if (!/[a-zA-Z]/.test(nw)||!/[0-9]/.test(nw)) { showFormAlert('pwAlert','Password must include letters and numbers.','danger'); return; }

  try {
    // BUG-C01 + BUG-C02 FIX: Firebase re-auth + updatePassword only. No local account path.
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, cur);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(nw);
    showFormAlert('pwAlert','Password changed successfully! Use the new password on next login.','success');
    document.getElementById('pw_current').value='';
    document.getElementById('pw_new').value='';
    document.getElementById('pw_confirm').value='';
  } catch(e) {
    const msg = e.code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Error: ' + e.message;
    showFormAlert('pwAlert', msg, 'danger');
  }
}

