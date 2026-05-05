/* ══════════════════════════════════════════
   SMC PORTAL — app.js
   All application logic, Supabase integration,
   navigation, and CRUD operations.
══════════════════════════════════════════ */

// ── LOGO INJECTION ──
(function () {
  const LOGO = 'https://res.cloudinary.com/di3xaktpd/image/upload/v1777943522/Screenshot_2026-05-05_090450_aooquo.png';
  ['logo-login', 'logo-forgot', 'logo-sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = LOGO;
  });
})();

/* ══════════════════════════════════════════
   CONFIG & SUPABASE
══════════════════════════════════════════ */
const SUPABASE_URL  = 'https://eglfvisxzfdqnasypwtv.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnbGZ2aXN4emZkcW5hc3lwd3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTc0MTEsImV4cCI6MjA5MzM5MzQxMX0.59GGn05-bHC_0tstWNLs_-Vsdy-y58f_zcoMi5q7vUw';

const IS_DEMO = SUPABASE_URL.includes('YOUR_PROJECT') || SUPABASE_ANON.includes('YOUR_ANON');
const ENABLE_BOOTSTRAP_ADMIN    = true;
const BOOTSTRAP_ADMIN_EMAIL     = 'bootstrap@smc.local';
const BOOTSTRAP_ADMIN_PASSWORD  = 'Admin123!';

let sbClient        = null;
let currentUser     = null;
let editingViolId   = null;
let editingUserId   = null;
let pendingDeleteFn = null;

/* ── CONFIRM DELETE ── */
function confirmDelete(msg, sub, cb) {
  pendingDeleteFn = cb;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-sub').textContent = sub || 'This action cannot be undone.';
  openModal('confirm-modal');
}
function executePendingDelete() {
  if (pendingDeleteFn) { pendingDeleteFn(); pendingDeleteFn = null; }
}

/* ── SIMPLE CACHE ── */
const _cache = {};
function cacheSet(key, data)           { _cache[key] = { data, ts: Date.now() }; }
function cacheGet(key, ttl = 60000)    { const e = _cache[key]; if (e && Date.now() - e.ts < ttl) return e.data; return null; }
function cacheInvalidate(...keys)      { keys.forEach(k => delete _cache[k]); }

/* ── GLOBAL ERROR HANDLERS ── */
window.onerror            = (msg, src, line, col, err) => { console.error('Unhandled error:', err); showToast('An unexpected error occurred. Please refresh.', 'error'); };
window.onunhandledrejection = e => { console.error('Unhandled promise rejection:', e.reason); };

/* ── SUPABASE INIT ── */
function initSB(url, key) {
  try { sbClient = window.supabase.createClient(url || SUPABASE_URL, key || SUPABASE_ANON); return true; }
  catch (e) { console.warn('SB init failed', e); return false; }
}

/* ══════════════════════════════════════════
   SETTINGS (persisted in localStorage)
══════════════════════════════════════════ */
const DEFAULT_SETTINGS = {
  institution: 'SMC — Records & Grading System',
  batch: 'Batch 7',
  passing: 75,
  formula: 'avg4',
};
let SETTINGS = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const stored = localStorage.getItem('smc_settings');
    if (stored) SETTINGS = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch(e) {}
  // Populate settings form
  const si = document.getElementById('st-institution');
  const sb = document.getElementById('st-batch');
  const sp = document.getElementById('st-passing');
  const sf = document.getElementById('st-formula');
  if (si) si.value = SETTINGS.institution;
  if (sb) sb.value = SETTINGS.batch;
  if (sp) sp.value = SETTINGS.passing;
  if (sf) sf.value = SETTINGS.formula;
}

function saveSettings() {
  SETTINGS.institution = document.getElementById('st-institution')?.value || SETTINGS.institution;
  SETTINGS.batch       = document.getElementById('st-batch')?.value       || SETTINGS.batch;
  SETTINGS.passing     = parseInt(document.getElementById('st-passing')?.value) || 75;
  SETTINGS.formula     = document.getElementById('st-formula')?.value     || SETTINGS.formula;
  try { localStorage.setItem('smc_settings', JSON.stringify(SETTINGS)); } catch(e) {}
  updateBatchDisplay();
  showToast('Settings saved.', 'success');
}

function updateBatchDisplay() {
  const batchEls = ['ds-batch','ds-batch-m','ds2-batch'];
  batchEls.forEach(id => setText(id, SETTINGS.batch));
}

function computeGradeValue(c1, c2, c3, fe) {
  if (SETTINGS.formula === 'weighted') {
    return parseFloat((c1*.3 + c2*.3 + c3*.1 + fe*.3).toFixed(2));
  }
  return parseFloat(((c1 + c2 + c3 + fe) / 4).toFixed(2));
}

/* ══════════════════════════════════════════
   DEMO DATA
══════════════════════════════════════════ */
const DEMO_CADETS = [
  { id:'d1', batch:'Batch 7', cadet_id:'SMC-2025-001', roblox_username:'DeltaForce01', discord_id:'deltaforce#0001', division:'Alpha Division', position:'Squad Leader', email:'juan@smc.edu.ph', status:'active' },
  { id:'d2', batch:'Batch 7', cadet_id:'SMC-2025-002', roblox_username:'BravoMaria',   discord_id:'bravomaria#0202', division:'Bravo Division',  position:'Cadet',        email:'maria@smc.edu.ph', status:'active' },
  { id:'d3', batch:'Batch 7', cadet_id:'SMC-2025-003', roblox_username:'CharlieReyes', discord_id:'charliereyes#0303', division:'Charlie Division', position:'Cadet',     email:'',                 status:'irregular' },
  { id:'d4', batch:'Batch 7', cadet_id:'SMC-2025-004', roblox_username:'EchoAna',      discord_id:'echoana#0404',    division:'Echo Division',   position:'Platoon Leader', email:'ana@smc.edu.ph', status:'active' },
];
const DEMO_GRADES = [
  { id:'g1', cadet_id:'SMC-2025-001', roblox_username:'DeltaForce01', division:'Alpha Division', batch:'Batch 7', course1:88, course2:90, course3:85, final_exam:92, computed:88.75, remarks:'Passed' },
  { id:'g2', cadet_id:'SMC-2025-002', roblox_username:'BravoMaria',   division:'Bravo Division', batch:'Batch 7', course1:75, course2:78, course3:80, final_exam:77, computed:77.5,  remarks:'Passed' },
  { id:'g3', cadet_id:'SMC-2025-003', roblox_username:'CharlieReyes', division:'Charlie Division',batch:'Batch 7', course1:65, course2:70, course3:68, final_exam:null, computed:null, remarks:'Incomplete' },
  { id:'g4', cadet_id:'SMC-2025-004', roblox_username:'EchoAna',      division:'Echo Division',  batch:'Batch 7', course1:95, course2:92, course3:97, final_exam:94, computed:94.5,  remarks:'Passed' },
];
const DEMO_VIOLATIONS = [
  { id:'v1', date:'2025-03-12', cadet_id:'SMC-2025-003', name:'Reyes, Carlos', type:'Tardiness', tier:1, logged_by:'Admin', status:'Warning',    notes:'' },
  { id:'v2', date:'2025-04-01', cadet_id:'SMC-2025-003', name:'Reyes, Carlos', type:'AWOL',      tier:2, logged_by:'Admin', status:'Probation',  notes:'Absent without leave' },
];
const DEMO_COURSES = [
  { id:'c1', code:'NSTP101', title:"Nat'l Service Training Program", units:3, instructor:'Sgt. Pedro Bautista', enrolled:45, status:'active' },
  { id:'c2', code:'CMT201',  title:'Citizens Military Training',     units:3, instructor:'Lt. Rosa Lim',       enrolled:32, status:'active' },
  { id:'c3', code:'ROTC101', title:'Reserve Officers Training Corps',units:3, instructor:'Maj. Jose Rizal',   enrolled:28, status:'active' },
  { id:'c4', code:'CRIM101', title:'Introduction to Criminology',    units:3, instructor:'Dr. Maria Santos',  enrolled:60, status:'active' },
];
const DEMO_USERS = [
  { id:'u1', name:'Admin User',     email:'admin@smc.edu.ph',      role:'administrator', cadet_id:null,          created:'2025-01-01' },
  { id:'u2', name:'Registrar Office',email:'registrar@smc.edu.ph', role:'registrar',     cadet_id:null,          created:'2025-01-02' },
  { id:'u3', name:'Dela Cruz, Juan', email:'juan@smc.edu.ph',      role:'cadet',         cadet_id:'SMC-2025-001',created:'2025-01-10' },
];
const DEMO_AUDIT = [];

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
async function handleLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  const btn   = document.getElementById('l-btn');
  const err   = document.getElementById('l-err');
  if (!email || !pass) { showAuthError('l-err', 'Please enter email and password.'); return; }
  btn.textContent = 'Authenticating…'; btn.disabled = true;
  err.classList.remove('show');

  // Bootstrap admin (first-time setup)
  if (ENABLE_BOOTSTRAP_ADMIN && email === BOOTSTRAP_ADMIN_EMAIL && pass === BOOTSTRAP_ADMIN_PASSWORD) {
    initSB();
    let authResult = await sbClient.auth.signInWithPassword({ email, password: pass });
    if (authResult.error) {
      const signUpResult = await sbClient.auth.signUp({ email, password: pass, options: { data: { name:'Bootstrap Admin', role:'administrator', cadet_id:null } } });
      if (signUpResult.error && !signUpResult.data?.user) {
        showAuthError('l-err', 'Bootstrap admin setup failed: ' + signUpResult.error.message);
        btn.textContent = 'Authenticate & Enter Portal'; btn.disabled = false; return;
      }
      authResult = await sbClient.auth.signInWithPassword({ email, password: pass });
      if (authResult.error) {
        showAuthError('l-err', 'Bootstrap admin sign in failed: ' + authResult.error.message);
        btn.textContent = 'Authenticate & Enter Portal'; btn.disabled = false; return;
      }
    }
    const user = authResult.data.user;
    const meta = user.user_metadata || {};
    currentUser = { email: user.email, role:'administrator', name: meta.name || 'Bootstrap Admin', cadet_id: meta.cadet_id || null, uid: user.id };
    sessionStorage.setItem('smc_user', JSON.stringify(currentUser));
    showToast('Bootstrap admin signed in. Create a real admin account now.', 'success', 6000);
    enterApp(); btn.textContent = 'Authenticate & Enter Portal'; btn.disabled = false; return;
  }

  // Demo mode
  if (IS_DEMO) {
    let role = 'cadet';
    if (email.includes('admin'))      role = 'administrator';
    else if (email.includes('registrar')) role = 'registrar';
    else if (email.includes('instructor')) role = 'instructor';
    currentUser = { email, role, name: email.split('@')[0], cadet_id: role === 'cadet' ? 'SMC-2025-001' : null };
    enterApp(); btn.textContent = 'Authenticate & Enter Portal'; btn.disabled = false; return;
  }

  // Live Supabase auth
  try {
    initSB();
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password: pass });
    if (error) { showAuthError('l-err', error.message); btn.textContent = 'Authenticate & Enter Portal'; btn.disabled = false; return; }
    const meta = data.user.user_metadata || {};
    const role = meta.role || 'cadet';
    currentUser = { email: data.user.email, role, name: meta.name || email.split('@')[0], cadet_id: meta.cadet_id || null, uid: data.user.id };
    sessionStorage.setItem('smc_user', JSON.stringify(currentUser));
    await logAction('LOGIN', 'auth', data.user.id, `${currentUser.name} signed in`);
    enterApp();
  } catch (e) { showAuthError('l-err', 'Connection error. Please try again.'); }
  btn.textContent = 'Authenticate & Enter Portal'; btn.disabled = false;
}

async function handleForgot() {
  const email = document.getElementById('f-email').value.trim();
  if (!email) { showAuthError('f-err', 'Please enter your email.'); return; }
  document.getElementById('f-err').classList.remove('show');
  if (IS_DEMO) { document.getElementById('f-ok').classList.add('show'); return; }
  try {
    initSB();
    const { error } = await sbClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    if (error) showAuthError('f-err', error.message);
    else document.getElementById('f-ok').classList.add('show');
  } catch (e) { showAuthError('f-err', 'Failed to send reset link.'); }
}

async function handleLogout() {
  if (sbClient && !IS_DEMO) await sbClient.auth.signOut();
  currentUser = null;
  sessionStorage.removeItem('smc_user');
  document.getElementById('app').style.display = 'none';
  showLogin();
}

async function checkSession() {
  if (IS_DEMO) return;
  initSB();
  const { data: { session } } = await sbClient.auth.getSession();
  if (session) {
    const meta = session.user.user_metadata || {};
    currentUser = { email: session.user.email, role: meta.role || 'cadet', name: meta.name || session.user.email.split('@')[0], cadet_id: meta.cadet_id || null, uid: session.user.id };
    sessionStorage.setItem('smc_user', JSON.stringify(currentUser));
    await ensureUserProfile(currentUser);
    enterApp();
  } else {
    const stored = sessionStorage.getItem('smc_user');
    if (stored) { try { currentUser = JSON.parse(stored); enterApp(); } catch (e) { sessionStorage.removeItem('smc_user'); } }
  }
}

async function ensureUserProfile(user) {
  if (IS_DEMO || !sbClient || !user?.uid) return;
  try {
    const { data, error } = await sbClient.from('user_profiles').select('id').eq('uid', user.uid).limit(1);
    if (error) return;
    if (!Array.isArray(data) || data.length === 0) {
      await sbClient.from('user_profiles').insert([{ uid: user.uid, name: user.name || user.email.split('@')[0], email: user.email, role: user.role || 'cadet', cadet_id: user.cadet_id || null, created: new Date().toISOString().split('T')[0] }]);
      cacheInvalidate('user_profiles');
    }
  } catch (e) { console.warn('Could not ensure user profile', e); }
}

async function changePassword() {
  const pass    = document.getElementById('cp-pass').value;
  const confirm = document.getElementById('cp-confirm').value;
  if (!pass || pass.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
  if (pass !== confirm)          { showToast('Passwords do not match.', 'error'); return; }
  if (IS_DEMO) { showToast('Password change not available in demo mode.', 'error'); return; }
  try {
    const { error } = await sbClient.auth.updateUser({ password: pass });
    if (error) showToast('Error: ' + error.message, 'error');
    else { showToast('Password updated successfully.', 'success'); document.getElementById('cp-pass').value = ''; document.getElementById('cp-confirm').value = ''; }
  } catch (e) { showToast('Failed to update password.', 'error'); }
}

function showLogin()            { document.getElementById('login-screen').style.display = 'flex';  document.getElementById('forgot-screen').style.display = 'none'; }
function showForgot()           { document.getElementById('login-screen').style.display = 'none';  document.getElementById('forgot-screen').style.display = 'flex'; }
function showAuthError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('show'); }

function enterApp() {
  document.getElementById('login-screen').style.display  = 'none';
  document.getElementById('forgot-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  loadSettings();
  setupRoleUI();
  nav('dashboard', null);
  loadDashboard();
}

/* ══════════════════════════════════════════
   ROLE-BASED UI
══════════════════════════════════════════ */
function setupRoleUI() {
  const role     = currentUser.role;
  const initials = (currentUser.name || currentUser.email).substring(0, 2).toUpperCase();
  document.getElementById('sb-avatar').textContent = initials;
  document.getElementById('sb-name').textContent   = currentUser.name || currentUser.email;
  const rp = document.getElementById('sb-role-pill');
  rp.textContent = cap(role);
  rp.className   = 'role-pill role-' + role;

  document.querySelectorAll('[data-roles]').forEach(el => {
    const roles = el.getAttribute('data-roles').split(',');
    el.style.display = roles.includes(role) ? '' : 'none';
  });
  document.querySelectorAll('.op-card[data-roles]').forEach(el => {
    const roles = el.getAttribute('data-roles').split(',');
    el.style.display = roles.includes(role) ? '' : 'none';
  });
  if (role === 'cadet' || role === 'instructor') document.getElementById('dash-stats-row').style.display = 'none';
  if (IS_DEMO) { const cpp = document.getElementById('change-password-panel'); if (cpp) cpp.style.display = 'none'; }
}

function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
function closeSidebar()  { document.body.classList.remove('sidebar-open'); }

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
const PAGE_LABELS = {
  dashboard:'Dashboard', cadets:'Cadet Roster', enroll:'Enroll Cadet', courses:'Courses',
  grades:'Grading System', 'encode-grade':'Encode Grades', reports:'Reports & Transcripts',
  violations:'Violations Log', users:'User Management', audit:'Audit Log',
  'my-grades':'My Grades', 'my-profile':'My Profile', settings:'Settings'
};
const ROLE_PAGES = {
  administrator: ['dashboard','cadets','enroll','grades','encode-grade','violations','users','audit','settings'],
  registrar:     ['dashboard','cadets','enroll','grades','encode-grade','violations'],
  instructor:    ['dashboard','grades','encode-grade','my-profile'],
  cadet:         ['dashboard','my-grades','my-profile']
};

function nav(page, navEl) {
  const allowed = ROLE_PAGES[currentUser?.role] || [];
  if (!allowed.includes(page)) { showToast('Access denied for your role.', 'error'); return; }
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  else document.querySelectorAll('.nav-item').forEach(el => { if (el.dataset.page === page) el.classList.add('active'); });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');
  document.getElementById('bc-label').textContent = PAGE_LABELS[page] || page;
  closeSidebar();
  const loaders = {
    cadets:         loadCadets,
    grades:         loadGrades,
    violations:     loadViolations,
    users:          loadUsers,
    audit:          loadAudit,
    'encode-grade': loadEncodeDropdowns,
    'my-grades':    loadMyGrades,
    'my-profile':   loadMyProfile,
    settings:       loadSettings,
  };
  if (loaders[page]) loaders[page]();
}

/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
async function loadDashboard() {
  let cadets = DEMO_CADETS.length, grades = DEMO_GRADES.length,
      viols  = DEMO_VIOLATIONS.length;
  if (sbClient && !IS_DEMO) {
    const results = await Promise.allSettled([
      sbClient.from('cadets').select('*', { count:'exact', head:true }),
      sbClient.from('grades').select('*', { count:'exact', head:true }),
      sbClient.from('violations').select('*', { count:'exact', head:true }),
    ]);
    if (results[0].status === 'fulfilled' && results[0].value.count != null) cadets = results[0].value.count;
    if (results[1].status === 'fulfilled' && results[1].value.count != null) grades = results[1].value.count;
    if (results[2].status === 'fulfilled' && results[2].value.count != null) viols  = results[2].value.count;
  }
  setText('ds-cadets',  cadets);  setText('ds-cadets-m', cadets);
  setText('ds2-cadets', cadets);  setText('ds2-viols',   viols);
  setText('ds2-grades', grades);
  updateBatchDisplay();
}

/* ── GENERIC FETCH WITH DEMO FALLBACK ── */
async function fetchOrDemo(table, demoData, query) {
  if (!sbClient || IS_DEMO) return demoData;
  const cached = cacheGet(table);
  if (cached) return cached;
  try {
    const q = query ? query(sbClient.from(table)) : sbClient.from(table).select('*');
    const { data, error } = await q;
    if (error) throw error;
    cacheSet(table, data);
    return data;
  } catch (e) { console.error('Fetch error:', table, e); return demoData; }
}

/* ══════════════════════════════════════════
   CADETS
══════════════════════════════════════════ */
async function loadCadets() {
  document.getElementById('cadet-tbody').innerHTML = '<tr class="loading-row"><td colspan="9"><span class="spinner"></span>Loading cadets…</td></tr>';
  const data  = await fetchOrDemo('cadets', DEMO_CADETS, q => q.select('*').order('cadet_id'));
  const tbody = document.getElementById('cadet-tbody');
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="ei">👥</div><p>No cadets enrolled yet.</p></td></tr>'; return;
  }
  tbody.innerHTML = data.map(c => {
    const safeId = encodeURIComponent(c.id);
    return `<tr data-search="${(c.cadet_id+' '+c.roblox_username+' '+c.division+' '+c.discord_id+' '+c.batch).toLowerCase()}">
      <td class="td-mono">${esc(c.batch||'—')}</td>
      <td class="td-mono">${esc(c.cadet_id)}</td>
      <td><strong>${esc(c.roblox_username||'—')}</strong></td>
      <td>${esc(c.division||'—')}</td>
      <td class="td-mono" style="font-size:11px">${esc(c.discord_id||'—')}</td>
      <td>${positionBadge(c.position)}</td>
      <td style="font-size:11.5px">${esc(c.email||'—')}</td>
      <td>${sBadge(c.status)}</td>
      <td><div class="td-actions">
        <button class="btn btn-outline" style="padding:4px 10px;font-size:11px" onclick="openEditCadetById('${safeId}')">Edit</button>
        <button class="btn btn-danger"  style="padding:4px 10px;font-size:11px" onclick="confirmDelete('Delete cadet ${esc(c.cadet_id)}?','All grades and violations linked to this cadet may be affected.',()=>deleteCadet('${safeId}','${esc(c.cadet_id)}'))">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function enrollCadet() {
  const id = v('e-id'), roblox = v('e-roblox'), division = v('e-division'), batch = v('e-batch');
  let valid = true;
  if (!batch)    { invalidate('e-batch',    'e-batch-err');    valid = false; } else clearValidation('e-batch',    'e-batch-err');
  if (!id)       { invalidate('e-id',       'e-id-err');       valid = false; } else clearValidation('e-id',       'e-id-err');
  if (!roblox)   { invalidate('e-roblox',   'e-roblox-err');   valid = false; } else clearValidation('e-roblox',   'e-roblox-err');
  if (!division) { invalidate('e-division', 'e-division-err'); valid = false; } else clearValidation('e-division', 'e-division-err');
  if (!valid)  { showToast('Please fix the highlighted fields.', 'error'); return; }
  const payload = { batch, cadet_id:id, roblox_username:roblox, email:v('e-email'), discord_id:v('e-discord'), division, position:v('e-position'), status:v('e-status') };
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('cadets').insert([payload]);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('cadets');
  } else { DEMO_CADETS.push({ ...payload, id: 'd' + Date.now() }); }
  await logAction('CREATE', 'cadets', payload.cadet_id, `Enrolled ${roblox} — ${division}`);
  showToast('Cadet enrolled successfully.', 'success');
  ['e-batch','e-id','e-email','e-roblox','e-discord'].forEach(fid => setVal(fid, ''));
  setVal('e-division',''); setVal('e-position','Cadet'); setVal('e-status','active');
  nav('cadets', null);
}

async function openEditCadetById(encodedId) {
  const id  = decodeURIComponent(encodedId);
  let rec   = null;
  if (sbClient && !IS_DEMO) { const { data } = await sbClient.from('cadets').select('*').eq('id',id).single(); rec = data; }
  else rec = DEMO_CADETS.find(x => x.id === id);
  if (!rec) { showToast('Record not found.', 'error'); return; }
  setVal('ec-id',       id);
  setVal('ec-cadet-id', rec.cadet_id        || '');
  setVal('ec-batch',    rec.batch            || '');
  setVal('ec-roblox',   rec.roblox_username  || '');
  setVal('ec-discord',  rec.discord_id       || '');
  setVal('ec-division', rec.division         || '');
  setVal('ec-position', rec.position         || 'Cadet');
  setVal('ec-email',    rec.email            || '');
  setVal('ec-status',   rec.status           || 'active');
  openModal('edit-cadet-modal');
}

async function updateCadet() {
  const id      = v('ec-id');
  const payload = { batch:v('ec-batch'), roblox_username:v('ec-roblox'), discord_id:v('ec-discord'), division:v('ec-division'), position:v('ec-position'), email:v('ec-email'), status:v('ec-status') };
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('cadets').update(payload).eq('id',id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('cadets');
  } else { const i = DEMO_CADETS.findIndex(x => x.id === id); if (i >= 0) Object.assign(DEMO_CADETS[i], payload); }
  await logAction('UPDATE', 'cadets', v('ec-cadet-id'), `Updated ${payload.roblox_username}`);
  closeModal('edit-cadet-modal'); showToast('Cadet record updated.', 'success'); loadCadets();
}

async function deleteCadet(encodedId, cadetId) {
  const id = decodeURIComponent(encodedId);
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('cadets').delete().eq('id',id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('cadets');
  } else { const i = DEMO_CADETS.findIndex(x => x.id === id); if (i >= 0) DEMO_CADETS.splice(i,1); }
  await logAction('DELETE', 'cadets', cadetId, 'Cadet record deleted');
  closeModal('confirm-modal'); showToast('Cadet deleted.', 'success'); loadCadets(); loadDashboard();
}

/* ══════════════════════════════════════════
   COURSES
══════════════════════════════════════════ */
async function loadCourses() {
  document.getElementById('course-tbody').innerHTML = '<tr class="loading-row"><td colspan="7"><span class="spinner"></span>Loading…</td></tr>';
  const data  = await fetchOrDemo('courses', DEMO_COURSES);
  const tbody = document.getElementById('course-tbody');
  tbody.innerHTML = data.map(c => {
    const safeId = encodeURIComponent(c.id);
    return `<tr>
      <td class="td-mono">${esc(c.code)}</td><td>${esc(c.title)}</td>
      <td class="td-mono">${c.units}</td><td>${esc(c.instructor||'—')}</td>
      <td class="td-mono">${c.enrolled||0}</td><td>${sBadge(c.status)}</td>
      <td><div class="td-actions">
        <button class="btn btn-outline" style="padding:4px 10px;font-size:11px" onclick="openEditCourse('${safeId}')">Edit</button>
        <button class="btn btn-danger"  style="padding:4px 10px;font-size:11px" onclick="confirmDelete('Delete course ${esc(c.code)}?','',()=>deleteCourse('${safeId}','${esc(c.code)}'))">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function openEditCourse(encodedId) {
  const id = decodeURIComponent(encodedId);
  let c = null;
  if (sbClient && !IS_DEMO) { const { data } = await sbClient.from('courses').select('*').eq('id',id).single(); c = data; }
  else c = DEMO_COURSES.find(x => x.id === id);
  if (!c) return;
  setVal('cm-id',id); setVal('cm-code',c.code); setVal('cm-title',c.title); setVal('cm-units',c.units); setVal('cm-instructor',c.instructor||''); setVal('cm-status',c.status);
  document.getElementById('course-modal-title').textContent = 'Edit Course';
  openModal('course-modal');
}
function clearCourseForm() { ['cm-id','cm-code','cm-title','cm-units','cm-instructor'].forEach(id => setVal(id,'')); }

async function saveCourse() {
  const id      = v('cm-id');
  const payload = { code: v('cm-code').toUpperCase(), title: v('cm-title'), units: parseInt(v('cm-units'))||3, instructor: v('cm-instructor'), status: v('cm-status') };
  if (!payload.code || !payload.title) { showToast('Course code and title required.', 'error'); return; }
  if (sbClient && !IS_DEMO) {
    if (id) { const { error } = await sbClient.from('courses').update(payload).eq('id',id); if (error) { showToast('Error: ' + error.message, 'error'); return; } }
    else     { const { error } = await sbClient.from('courses').insert([{ ...payload, enrolled:0 }]); if (error) { showToast('Error: ' + error.message, 'error'); return; } }
    cacheInvalidate('courses');
  } else {
    if (id) { const i = DEMO_COURSES.findIndex(x => x.id === id); if (i >= 0) Object.assign(DEMO_COURSES[i], payload); }
    else DEMO_COURSES.push({ ...payload, id: 'c'+Date.now(), enrolled:0 });
  }
  await logAction(id ? 'UPDATE' : 'CREATE', 'courses', payload.code, `${id ? 'Updated' : 'Added'} course ${payload.code}`);
  closeModal('course-modal'); showToast('Course saved.', 'success'); loadCourses(); loadDashboard();
}

async function deleteCourse(encodedId, code) {
  const id = decodeURIComponent(encodedId);
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('courses').delete().eq('id',id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('courses');
  } else { const i = DEMO_COURSES.findIndex(x => x.id === id); if (i >= 0) DEMO_COURSES.splice(i,1); }
  await logAction('DELETE', 'courses', code, 'Course deleted');
  closeModal('confirm-modal'); showToast('Course deleted.', 'success'); loadCourses();
}

/* ══════════════════════════════════════════
   GRADES
══════════════════════════════════════════ */
let _gradesData = [];

async function loadGrades() {
  document.getElementById('grade-tbody').innerHTML = '<tr class="loading-row"><td colspan="11"><span class="spinner"></span>Loading grades…</td></tr>';
  _gradesData = await fetchOrDemo('grades', DEMO_GRADES, q => q.select('*').order('cadet_id'));
  renderGrades(_gradesData);
  buildSYFilters(_gradesData);
}

function renderGrades(data) {
  const tbody = document.getElementById('grade-tbody');
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--muted);padding:32px">No grade records found.</td></tr>'; return;
  }
  tbody.innerHTML = data.map(g => {
    const safeId = encodeURIComponent(g.id);
    return `<tr data-search="${(g.cadet_id+' '+g.roblox_username+' '+g.division+' '+g.batch).toLowerCase()}">
      <td class="td-mono">${esc(g.cadet_id)}</td>
      <td><strong>${esc(g.roblox_username||'—')}</strong></td>
      <td>${esc(g.division||'—')}</td>
      <td class="td-mono">${esc(g.batch||'—')}</td>
      <td class="grade-cell ${gClass(g.course1)}">${g.course1??'—'}</td>
      <td class="grade-cell ${gClass(g.course2)}">${g.course2??'—'}</td>
      <td class="grade-cell ${gClass(g.course3)}">${g.course3??'—'}</td>
      <td class="grade-cell ${gClass(g.final_exam)}">${g.final_exam??'—'}</td>
      <td class="grade-cell ${gClass(g.computed)}" style="font-weight:700">${g.computed!=null?g.computed+'%':'—'}</td>
      <td>${rBadge(g.remarks)}</td>
      <td><div class="td-actions">
        <button class="btn btn-outline" style="padding:4px 10px;font-size:11px" onclick="openEditGrade('${safeId}')">Edit</button>
        <button class="btn btn-danger"  style="padding:4px 10px;font-size:11px" onclick="confirmDelete('Delete this grade record?','',()=>deleteGrade('${safeId}','${esc(g.cadet_id)}'))">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function loadEncodeDropdowns() {
  const cadets = await fetchOrDemo('cadets', DEMO_CADETS, q => q.select('*').order('cadet_id'));
  const sel = document.getElementById('g-cadet');
  sel.innerHTML = '<option value="">— Select Cadet —</option>' +
    cadets.map(c => `<option value="${esc(c.cadet_id)}" data-roblox="${esc(c.roblox_username||'')}" data-division="${esc(c.division||'')}" data-batch="${esc(c.batch||'')}">${esc(c.roblox_username)} (${esc(c.cadet_id)})</option>`).join('');
  sel.onchange = function() {
    const opt = this.options[this.selectedIndex];
    setVal('g-roblox',   opt.dataset.roblox   || '');
    setVal('g-division', opt.dataset.division  || '');
    setVal('g-batch',    opt.dataset.batch     || '');
  };
}

function computeGrade() {
  const c1 = parseFloat(v('g-c1')), c2 = parseFloat(v('g-c2')),
        c3 = parseFloat(v('g-c3')), fe = parseFloat(v('g-final'));
  const vals = [v('g-c1'), v('g-c2'), v('g-c3'), v('g-final')];
  const hasAny = vals.some(x => x !== '');
  if (!hasAny) { setVal('g-computed',''); return; }
  const r1 = isNaN(c1)?0:c1, r2 = isNaN(c2)?0:c2, r3 = isNaN(c3)?0:c3, rf = isNaN(fe)?0:fe;
  const computed = computeGradeValue(r1, r2, r3, rf);
  const hasAll   = vals.every(x => x !== '');
  setVal('g-computed', computed + '%' + (hasAll ? '' : ' (partial)'));
}

function computeEditGrade() {
  const c1 = parseFloat(v('eg-c1'))||0, c2 = parseFloat(v('eg-c2'))||0,
        c3 = parseFloat(v('eg-c3'))||0, fe = parseFloat(v('eg-final'))||0;
  setVal('eg-computed', computeGradeValue(c1,c2,c3,fe) + '%');
}

async function saveGrade() {
  const cadetId = v('g-cadet');
  if (!cadetId) { invalidate('g-cadet','g-cadet-err'); showToast('Please select a cadet.','error'); return; }
  clearValidation('g-cadet','g-cadet-err');
  const c1 = parseFloat(v('g-c1')), c2 = parseFloat(v('g-c2')),
        c3 = parseFloat(v('g-c3')), fe = parseFloat(v('g-final'));
  const computed = computeGradeValue(isNaN(c1)?0:c1, isNaN(c2)?0:c2, isNaN(c3)?0:c3, isNaN(fe)?0:fe);
  const payload = {
    cadet_id: cadetId,
    roblox_username: v('g-roblox'),
    division:        v('g-division'),
    batch:           v('g-batch'),
    course1:  isNaN(c1)?null:c1,
    course2:  isNaN(c2)?null:c2,
    course3:  isNaN(c3)?null:c3,
    final_exam: isNaN(fe)?null:fe,
    computed,
    remarks: v('g-remarks'),
    encoded_by: currentUser?.email
  };
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('grades').insert([payload]);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('grades');
  } else { DEMO_GRADES.push({ ...payload, id: 'g'+Date.now() }); }
  await logAction('CREATE', 'grades', cadetId, `Grade encoded for ${cadetId}`);
  showToast('Grade saved.', 'success'); nav('grades', null);
}

async function openEditGrade(encodedId) {
  const id = decodeURIComponent(encodedId);
  let g = null;
  if (sbClient && !IS_DEMO) { const { data } = await sbClient.from('grades').select('*').eq('id',id).single(); g = data; }
  else g = DEMO_GRADES.find(x => x.id === id);
  if (!g) return;
  setVal('eg-id',id); setVal('eg-c1',g.course1??''); setVal('eg-c2',g.course2??'');
  setVal('eg-c3',g.course3??''); setVal('eg-final',g.final_exam??'');
  setVal('eg-computed',(g.computed??'')+'%'); setVal('eg-remarks',g.remarks||'');
  openModal('edit-grade-modal');
}

async function updateGrade() {
  const id = v('eg-id');
  const c1 = parseFloat(v('eg-c1'))||0, c2 = parseFloat(v('eg-c2'))||0,
        c3 = parseFloat(v('eg-c3'))||0, fe = parseFloat(v('eg-final'))||0;
  const computed = computeGradeValue(c1,c2,c3,fe);
  const payload  = { course1:c1||null, course2:c2||null, course3:c3||null, final_exam:fe||null, computed, remarks:v('eg-remarks') };
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('grades').update(payload).eq('id',id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('grades');
  } else { const i = DEMO_GRADES.findIndex(x => x.id === id); if (i >= 0) Object.assign(DEMO_GRADES[i], payload); }
  await logAction('UPDATE', 'grades', id, 'Grade record updated');
  closeModal('edit-grade-modal'); showToast('Grade updated.', 'success'); loadGrades();
}

async function deleteGrade(encodedId, cadetId) {
  const id = decodeURIComponent(encodedId);
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('grades').delete().eq('id',id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('grades');
  } else { const i = DEMO_GRADES.findIndex(x => x.id === id); if (i >= 0) DEMO_GRADES.splice(i,1); }
  await logAction('DELETE', 'grades', cadetId, 'Grade record deleted');
  closeModal('confirm-modal'); showToast('Grade deleted.', 'success'); loadGrades();
}

function setGradeFilter(el, term, tbodyId) {
  const parent = el.closest('.grade-filters, div');
  if (parent) parent.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll(`#${tbodyId} tr`).forEach(tr => {
    tr.style.display = (term === 'all' || tr.textContent.toLowerCase().includes(term)) ? '' : 'none';
  });
}

/* ══════════════════════════════════════════
   VIOLATIONS
══════════════════════════════════════════ */
async function loadViolations() {
  document.getElementById('viol-tbody').innerHTML = '<tr class="loading-row"><td colspan="8"><span class="spinner"></span>Loading…</td></tr>';
  const data  = await fetchOrDemo('violations', DEMO_VIOLATIONS, q => q.select('*').order('date',{ ascending:false }));
  const tbody = document.getElementById('viol-tbody');
  tbody.innerHTML = data.map(vr => {
    const safeId = encodeURIComponent(vr.id);
    return `<tr data-search="${(vr.name+' '+vr.cadet_id+' '+vr.type+' '+(vr.status||'')).toLowerCase()}">
      <td class="td-mono">${esc(vr.date)}</td><td class="td-mono">${esc(vr.cadet_id)}</td>
      <td>${esc(vr.name||'—')}</td><td>${esc(vr.type)}</td>
      <td>${tierBadge(vr.tier)}</td><td>${sBadge(vr.status?.toLowerCase())}</td>
      <td style="color:var(--silver);font-size:12px">${esc(vr.logged_by||'—')}</td>
      <td><button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="confirmDelete('Delete this violation record?','',()=>deleteViolation('${safeId}','${esc(vr.cadet_id)}'))">Delete</button></td>
    </tr>`;
  }).join('');
}

function setViolFilter(el, status) {
  el.closest('.grade-filters').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#viol-tbody tr').forEach(tr => {
    tr.style.display = (status === 'all' || tr.textContent.toLowerCase().includes(status)) ? '' : 'none';
  });
}

function openViolModal() {
  editingViolId = null;
  document.getElementById('vm-date').value = new Date().toISOString().split('T')[0];
  populateCadetDropdown('vm-cadet');
  openModal('viol-modal');
}

async function populateCadetDropdown(selectId) {
  const cadets = await fetchOrDemo('cadets', DEMO_CADETS, q => q.select('*').order('last_name'));
  document.getElementById(selectId).innerHTML =
    '<option value="">— Select Cadet —</option>' +
    cadets.map(c => `<option value="${esc(c.cadet_id)}">${esc(c.last_name)}, ${esc(c.first_name)} (${esc(c.cadet_id)})</option>`).join('');
}

async function saveViolation() {
  const cadetId = v('vm-cadet');
  if (!cadetId) { invalidate('vm-cadet', 'vm-cadet-err'); showToast('Please select a cadet.', 'error'); return; }
  clearValidation('vm-cadet', 'vm-cadet-err');
  const cadetList = await fetchOrDemo('cadets', DEMO_CADETS);
  const cadet     = cadetList.find(c => c.cadet_id === cadetId) || { last_name:cadetId, first_name:'' };
  let existingCount = 0;
  if (sbClient && !IS_DEMO) { const { count } = await sbClient.from('violations').select('*',{ count:'exact', head:true }).eq('cadet_id',cadetId); existingCount = count||0; }
  else existingCount = DEMO_VIOLATIONS.filter(x => x.cadet_id === cadetId).length;
  const tier   = existingCount + 1;
  const status = tier === 1 ? 'Warning' : tier === 2 ? 'Probation' : 'Suspension';
  const payload = { cadet_id:cadetId, name:`${cadet.last_name}, ${cadet.first_name}`, date:v('vm-date')||new Date().toISOString().split('T')[0], type:v('vm-type'), notes:v('vm-notes'), logged_by:currentUser?.email||'Admin', tier, status };
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('violations').insert([payload]);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('violations');
  } else { DEMO_VIOLATIONS.push({ ...payload, id: 'v'+Date.now() }); }
  await logAction('CREATE', 'violations', cadetId, `Violation logged: ${payload.type} — Tier ${tier}`);
  closeModal('viol-modal'); showToast(`Violation logged. Status: ${status}`, 'success'); loadViolations(); loadDashboard();
}

async function deleteViolation(encodedId, cadetId) {
  const id = decodeURIComponent(encodedId);
  if (sbClient && !IS_DEMO) {
    const { error } = await sbClient.from('violations').delete().eq('id',id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    cacheInvalidate('violations');
  } else { const i = DEMO_VIOLATIONS.findIndex(x => x.id === id); if (i >= 0) DEMO_VIOLATIONS.splice(i,1); }
  await logAction('DELETE', 'violations', cadetId, 'Violation record deleted');
  closeModal('confirm-modal'); showToast('Violation deleted.', 'success'); loadViolations();
}

/* ══════════════════════════════════════════
   USERS
══════════════════════════════════════════ */
async function loadUsers() {
  document.getElementById('user-tbody').innerHTML = '<tr class="loading-row"><td colspan="6"><span class="spinner"></span>Loading…</td></tr>';
  const data  = await fetchOrDemo('user_profiles', DEMO_USERS);
  const tbody = document.getElementById('user-tbody');
  tbody.innerHTML = data.map(u => {
    const safeId = encodeURIComponent(u.id);
    return `<tr>
      <td><strong>${esc(u.name)}</strong></td><td class="td-mono">${esc(u.email)}</td>
      <td>${roleBadge(u.role)}</td><td class="td-mono">${u.cadet_id||'—'}</td>
      <td class="td-mono" style="font-size:11px">${u.created||'—'}</td>
      <td><div class="td-actions">
        ${u.id !== 'u1'
          ? `<button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="confirmDelete('Delete account for ${esc(u.email)}?','They will lose portal access.',()=>deleteUser('${safeId}','${esc(u.email)}'))">Delete</button>`
          : '<span style="color:var(--muted);font-size:11px">Protected</span>'
        }
      </div></td>
    </tr>`;
  }).join('');
}

async function saveUser() {
  const name = v('um-name'), email = v('um-email'), role = v('um-role'), pass = v('um-pass'), cadetId = v('um-cadet-id');
  if (!name || !email || !pass) { showToast('Name, email, and password are required.', 'error'); return; }
  if (pass.length < 6)          { showToast('Password must be at least 6 characters.', 'error'); return; }
  if (sbClient && !IS_DEMO) {
    const { data, error } = await sbClient.auth.signUp({ email, password:pass, options:{ data:{ name, role, cadet_id:cadetId||null } } });
    if (error) { showToast('Error: ' + error.message, 'error', 6000); return; }
    if (!data?.session) { showToast('Auth user created. Verify your email before first login.', 'success', 8000); closeModal('user-modal'); loadUsers(); return; }
    const authUser = data.session.user || data.user;
    if (!authUser?.id) { showToast('Auth user created, but no valid session was returned.', 'error', 8000); return; }
    const profileInsert = await sbClient.from('user_profiles').insert([{ uid:authUser.id, name, email, role, cadet_id:cadetId||null, created:new Date().toISOString().split('T')[0] }]);
    if (profileInsert.error) showToast('User created but profile save failed: ' + profileInsert.error.message, 'error', 6000);
    else cacheInvalidate('user_profiles');
  } else { DEMO_USERS.push({ id:'u'+Date.now(), name, email, role, cadet_id:cadetId||null, created:new Date().toISOString().split('T')[0] }); }
  await logAction('CREATE', 'users', email, `Created account: ${name} (${role})`);
  closeModal('user-modal'); showToast('User account created. They may need to verify their email.', 'success', 6000); loadUsers();
}

async function deleteUser(encodedId, email) {
  const id = decodeURIComponent(encodedId);
  if (sbClient && !IS_DEMO) { await sbClient.from('user_profiles').delete().eq('id',id); cacheInvalidate('user_profiles'); }
  else { const i = DEMO_USERS.findIndex(x => x.id === id); if (i >= 0) DEMO_USERS.splice(i,1); }
  await logAction('DELETE', 'users', email, 'User account deleted');
  closeModal('confirm-modal'); showToast('User account deleted.', 'success'); loadUsers();
}

function toggleCadetField() {
  const role = v('um-role');
  document.getElementById('um-cadet-field').style.display = role === 'cadet' ? 'block' : 'none';
  if (role === 'cadet') populateCadetDropdown('um-cadet-id');
}

/* ══════════════════════════════════════════
   AUDIT LOG
══════════════════════════════════════════ */
async function loadAudit() {
  document.getElementById('audit-tbody').innerHTML = '<tr class="loading-row"><td colspan="6"><span class="spinner"></span>Loading…</td></tr>';
  let data = DEMO_AUDIT;
  if (sbClient && !IS_DEMO) {
    try { const { data:r } = await sbClient.from('audit_log').select('*').order('created_at',{ ascending:false }).limit(200); if (r) data = r; } catch (e) {}
  }
  const tbody = document.getElementById('audit-tbody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">No audit entries yet.</td></tr>'; return; }
  tbody.innerHTML = data.map(a => `<tr data-search="${(a.action+' '+a.table_name+' '+a.performed_by+' '+(a.details||'')).toLowerCase()}">
    <td class="td-mono" style="font-size:11px">${a.created_at ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(a.created_at)) : a.timestamp||'—'}</td>
    <td><span class="audit-action audit-${(a.action||'').toLowerCase()}">${esc(a.action||'—')}</span></td>
    <td class="td-mono">${esc(a.table_name||'—')}</td>
    <td class="td-mono">${esc(a.record_id||'—')}</td>
    <td style="color:var(--silver);font-size:12px;max-width:200px">${esc(a.details||'—')}</td>
    <td style="font-size:12px">${esc(a.performed_by||'—')}</td>
  </tr>`).join('');
}

async function logAction(action, table, recordId, details) {
  const entry = { action, table_name:table, record_id:String(recordId||''), details, performed_by:currentUser?.email||'system', created_at:new Date().toISOString(), timestamp:new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short'}).format(new Date()) };
  DEMO_AUDIT.unshift(entry);
  if (DEMO_AUDIT.length > 100) DEMO_AUDIT.splice(100);
  if (sbClient && !IS_DEMO) { try { await sbClient.from('audit_log').insert([entry]); } catch (e) {} }
}

/* ══════════════════════════════════════════
   CADET — MY GRADES
══════════════════════════════════════════ */
async function loadMyGrades() {
  const cadetId = currentUser?.cadet_id;
  if (!cadetId) {
    document.getElementById('my-grade-tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">No cadet ID linked to your account. Contact the registrar.</td></tr>'; return;
  }
  document.getElementById('my-grades-title').textContent = `My Grades — ${cadetId}`;
  document.getElementById('my-grade-tbody').innerHTML = '<tr class="loading-row"><td colspan="8"><span class="spinner"></span>Loading…</td></tr>';
  let data = DEMO_GRADES.filter(g => g.cadet_id === cadetId);
  if (sbClient && !IS_DEMO) { try { const { data:r } = await sbClient.from('grades').select('*').eq('cadet_id',cadetId); if (r) data = r; } catch (e) {} }
  const tbody = document.getElementById('my-grade-tbody');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:32px">No grade records found.</td></tr>'; return; }
  tbody.innerHTML = data.map(g => `<tr data-search="${(g.course+' '+(g.term||'')).toLowerCase()}" data-term="${g.term||''}">
    <td class="td-mono">${esc(g.course)}</td>
    <td><span class="badge badge-gray">${cap(g.term||'—')}</span></td>
    <td class="td-mono">${esc(g.sy||'—')}</td>
    <td class="grade-cell ${gClass(g.prelim)}">${g.prelim??'—'}</td>
    <td class="grade-cell ${gClass(g.midterm)}">${g.midterm??'—'}</td>
    <td class="grade-cell ${gClass(g.final_grade)}">${g.final_grade??'—'}</td>
    <td class="grade-cell ${gClass(g.computed)}" style="font-weight:700">${g.computed!=null?g.computed+'%':'—'}</td>
    <td>${rBadge(g.remarks)}</td>
  </tr>`).join('');
}

/* ══════════════════════════════════════════
   MY PROFILE
══════════════════════════════════════════ */
async function loadMyProfile() {
  const role     = currentUser?.role;
  const initials = (currentUser?.name||'AU').substring(0,2).toUpperCase();
  document.getElementById('prof-avatar').textContent = initials;
  document.getElementById('prof-name').textContent   = currentUser?.name || currentUser?.email;
  document.getElementById('prof-role-badge').innerHTML = `<span class="role-pill role-${role}">${cap(role)}</span>`;
  let infoHTML = '';
  if (role === 'cadet' && currentUser?.cadet_id) {
    const cadetId = currentUser.cadet_id;
    let cadet = DEMO_CADETS.find(c => c.cadet_id === cadetId) || {};
    if (sbClient && !IS_DEMO) { const { data } = await sbClient.from('cadets').select('*').eq('cadet_id',cadetId).single(); if (data) cadet = data; }
    infoHTML = `
      <div class="profile-info-item"><label>Cadet ID</label><span>${esc(cadet.cadet_id||cadetId)}</span></div>
      <div class="profile-info-item"><label>Course</label><span>${esc(cadet.course||'—')}</span></div>
      <div class="profile-info-item"><label>Year Level</label><span>${esc(cadet.year_level||'—')}</span></div>
      <div class="profile-info-item"><label>Section</label><span>${esc(cadet.section||'—')}</span></div>
      <div class="profile-info-item"><label>Status</label><span>${sBadge(cadet.status||'active')}</span></div>
      <div class="profile-info-item"><label>Email</label><span>${esc(currentUser.email)}</span></div>`;
  } else {
    infoHTML = `
      <div class="profile-info-item"><label>Email</label><span>${esc(currentUser?.email||'—')}</span></div>
      <div class="profile-info-item"><label>Role</label><span>${cap(role)}</span></div>`;
  }
  document.getElementById('prof-info').innerHTML = infoHTML;
}

/* ══════════════════════════════════════════
   REPORTS
══════════════════════════════════════════ */
async function generateReport(type) {
  const area    = document.getElementById('report-area');
  const title   = document.getElementById('report-title');
  const content = document.getElementById('report-content');
  area.style.display = 'block';
  content.innerHTML  = '<div style="text-align:center;padding:40px;color:var(--muted)"><span class="spinner"></span> Generating report…</div>';
  const now = new Date().toLocaleDateString('en-PH');
  const hdr = `<div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)">
    <div style="font-size:28px">🎖️</div>
    <div>
      <h2 style="font-family:'Cinzel',serif;font-size:18px">SMC — Records &amp; Grading System</h2>
      <p style="font-size:12px;color:var(--silver)">Generated: ${now} · Printed by: ${esc(currentUser?.email)}</p>
    </div></div>`;
  let data, html = '';
  if (type === 'grades') {
    title.textContent = 'Grade Report';
    data = await fetchOrDemo('grades', DEMO_GRADES);
    html = hdr + `<div class="table-wrap"><table><thead><tr><th>Cadet ID</th><th>Name</th><th>Course</th><th>Term</th><th>SY</th><th>Prelim</th><th>Midterm</th><th>Final</th><th>Computed</th><th>Remarks</th></tr></thead><tbody>
      ${data.map(g => `<tr><td>${esc(g.cadet_id)}</td><td>${esc(g.name||'—')}</td><td>${esc(g.course)}</td><td>${cap(g.term)}</td><td>${esc(g.sy||'—')}</td><td>${g.prelim??'—'}</td><td>${g.midterm??'—'}</td><td>${g.final_grade??'—'}</td><td>${g.computed!=null?g.computed+'%':'—'}</td><td>${esc(g.remarks||'—')}</td></tr>`).join('')}
    </tbody></table></div>`;
  } else if (type === 'enrollment') {
    title.textContent = 'Enrollment Report';
    data = await fetchOrDemo('cadets', DEMO_CADETS, q => q.select('*').order('last_name'));
    html = hdr + `<div class="table-wrap"><table><thead><tr><th>Cadet ID</th><th>Name</th><th>Course</th><th>Year</th><th>Section</th><th>Status</th></tr></thead><tbody>
      ${data.map(c => `<tr><td>${esc(c.cadet_id)}</td><td>${esc(c.last_name)}, ${esc(c.first_name)}</td><td>${esc(c.course||'—')}</td><td>${esc(c.year_level||'—')}</td><td>${esc(c.section||'—')}</td><td>${esc(c.status||'—')}</td></tr>`).join('')}
    </tbody></table></div>`;
  } else if (type === 'violations') {
    title.textContent = 'Violations Summary';
    data = await fetchOrDemo('violations', DEMO_VIOLATIONS, q => q.select('*').order('date',{ ascending:false }));
    html = hdr + `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Cadet ID</th><th>Name</th><th>Type</th><th>Tier</th><th>Status</th></tr></thead><tbody>
      ${data.map(vr => `<tr><td>${esc(vr.date)}</td><td>${esc(vr.cadet_id)}</td><td>${esc(vr.name||'—')}</td><td>${esc(vr.type)}</td><td>Tier ${vr.tier}</td><td>${esc(vr.status)}</td></tr>`).join('')}
    </tbody></table></div>`;
  } else if (type === 'transcript') {
    title.textContent = 'Transcript of Records';
    const [grades, cadets] = await Promise.all([fetchOrDemo('grades', DEMO_GRADES), fetchOrDemo('cadets', DEMO_CADETS)]);
    const cadetIds = [...new Set(grades.map(g => g.cadet_id))];
    html = hdr + cadetIds.map(cid => {
      const cGrades = grades.filter(g => g.cadet_id === cid);
      const cadet   = cadets.find(c => c.cadet_id === cid) || {};
      return `<h3 style="margin:20px 0 8px;font-family:'Cinzel',serif">${esc(cadet.last_name||'')}${cadet.last_name?', ':''} ${esc(cadet.first_name||cid)} — ${esc(cid)}</h3>
        <div class="table-wrap"><table><thead><tr><th>Course</th><th>Term</th><th>SY</th><th>Prelim</th><th>Midterm</th><th>Final</th><th>Computed</th><th>Remarks</th></tr></thead><tbody>
        ${cGrades.map(g => `<tr><td>${esc(g.course)}</td><td>${cap(g.term)}</td><td>${esc(g.sy||'—')}</td><td>${g.prelim??'—'}</td><td>${g.midterm??'—'}</td><td>${g.final_grade??'—'}</td><td>${g.computed!=null?g.computed+'%':'—'}</td><td>${esc(g.remarks||'—')}</td></tr>`).join('')}
        </tbody></table></div>`;
    }).join('<hr style="margin:20px 0;border-color:var(--border)"/>');
  }
  content.innerHTML = html;
  area.scrollIntoView({ behavior:'smooth' });
}

/* ══════════════════════════════════════════
   UTILITY HELPERS
══════════════════════════════════════════ */
function v(id)          { return document.getElementById(id)?.value || ''; }
function setVal(id,val) { const el = document.getElementById(id); if (el) el.value = val ?? ''; }
function setText(id,val){ const el = document.getElementById(id); if (el) el.textContent = val; }
function cap(s)         { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function esc(s)         { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function filterTbl(tbodyId, q) {
  const ql = q.toLowerCase();
  document.querySelectorAll(`#${tbodyId} tr`).forEach(tr => {
    const txt = tr.dataset.search || tr.textContent.toLowerCase();
    tr.style.display = txt.includes(ql) ? '' : 'none';
  });
}

function invalidate(inputId, errId)     { const el=document.getElementById(inputId), er=document.getElementById(errId); if(el) el.classList.add('invalid'); if(er) er.classList.add('show'); }
function clearValidation(inputId,errId) { const el=document.getElementById(inputId), er=document.getElementById(errId); if(el) el.classList.remove('invalid'); if(er) er.classList.remove('show'); }
function openModal(id)  { const m=document.getElementById(id); if(m) m.classList.add('open'); }
function closeModal(id) { const m=document.getElementById(id); if(m) m.classList.remove('open'); }

// Close modals by clicking backdrop
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

/* ── BADGE HELPERS ── */
function sBadge(s) {
  const map = { active:'badge-green', irregular:'badge-gold', 'on-leave':'badge-gray', dropped:'badge-red', warning:'badge-gold', probation:'badge-red', suspension:'badge-red', inactive:'badge-gray' };
  return `<span class="badge ${map[(s||'').toLowerCase()]||'badge-gray'}">${cap(s||'—')}</span>`;
}
function roleBadge(r) {
  const map = { administrator:'badge-gold', registrar:'badge-blue', instructor:'badge-purple', cadet:'badge-green' };
  return `<span class="badge ${map[r]||'badge-gray'}">${cap(r)}</span>`;
}
function positionBadge(p) {
  const map = { 'Company Commander':'badge-gold','Company XO':'badge-purple','Platoon Leader':'badge-blue','Platoon Sergeant':'badge-blue','Squad Leader':'badge-green','Cadet':'badge-gray' };
  return `<span class="badge ${map[p]||'badge-gray'}">${esc(p||'Cadet')}</span>`;
}
function tierBadge(tier) {
  if (tier === 1) return `<span class="badge badge-gold">Tier 1 — Warning</span>`;
  if (tier === 2) return `<span class="badge badge-red">Tier 2 — Probation</span>`;
  return `<span class="badge badge-red" style="background:rgba(120,0,0,.3);color:#ff6b6b">Tier ${tier} — Suspension</span>`;
}
function rBadge(r) {
  if (!r) return '—';
  const map = { 'Passed':'badge-green', 'Failed':'badge-red', 'Ongoing':'badge-blue', 'Incomplete':'badge-gold' };
  return `<span class="badge ${map[r]||'badge-gray'}">${esc(r)}</span>`;
}
function gClass(vv) {
  if (vv == null) return '';
  if (vv >= 90) return 'grade-a'; if (vv >= 80) return 'grade-b';
  if (vv >= 75) return 'grade-c'; if (vv >= 70) return 'grade-d';
  return 'grade-f';
}

/* ── TOAST ── */
let toastTimer;
function showToast(msg, type = 'success', duration) {
  const dur = duration || (type === 'error' ? 6000 : 3400);
  const t   = document.getElementById('toast');
  document.getElementById('toast-msg').textContent  = msg;
  document.getElementById('toast-icon').textContent = type === 'success' ? '✅' : '❌';
  t.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, dur);
}

/* ── KEYBOARD SHORTCUTS ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen')?.style.display !== 'none') handleLogin();
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
initSB();
checkSession();
