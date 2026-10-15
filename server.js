// FoodBridge - Surplus Food Rescue Platform
// Zero dependencies: uses only Node.js built-in modules. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const PUBLIC = path.join(__dirname, 'public');

// ---------- tiny JSON database ----------
const hash = (pw, salt = 'fb-salt') => crypto.scryptSync(pw, salt, 32).toString('hex');
const uid = () => crypto.randomBytes(5).toString('hex');
const hoursFromNow = h => new Date(Date.now() + h * 3600e3).toISOString();

function seed() {
  const users = [
    { id: 'u1', name: 'Admin', email: 'admin@foodbridge.com', password: hash('admin123'), role: 'admin', city: 'Mumbai' },
    { id: 'u2', name: 'Spice Garden Restaurant', email: 'donor@foodbridge.com', password: hash('demo123'), role: 'donor', city: 'Mumbai' },
    { id: 'u3', name: 'Hope Foundation NGO', email: 'ngo@foodbridge.com', password: hash('demo123'), role: 'receiver', city: 'Mumbai' },
    { id: 'u4', name: 'Rahul (Volunteer)', email: 'volunteer@foodbridge.com', password: hash('demo123'), role: 'volunteer', city: 'Mumbai' }
  ];
  const donations = [
    { id: 'd1', donorId: 'u2', donorName: 'Spice Garden Restaurant', title: 'Veg Biryani & Raita', category: 'Cooked Meal', servings: 40, location: 'Andheri West, Mumbai', expiry: hoursFromNow(5), status: 'available', notes: 'Freshly cooked today', created: new Date().toISOString() },
    { id: 'd2', donorId: 'u2', donorName: 'Spice Garden Restaurant', title: 'Fresh Bread Loaves', category: 'Bakery', servings: 25, location: 'Andheri West, Mumbai', expiry: hoursFromNow(20), status: 'available', notes: 'Baked this morning', created: new Date().toISOString() },
    { id: 'd3', donorId: 'u2', donorName: 'Spice Garden Restaurant', title: 'Seasonal Fruit Box', category: 'Fruits & Veg', servings: 15, location: 'Bandra, Mumbai', expiry: hoursFromNow(30), status: 'available', notes: '', created: new Date().toISOString() }
  ];
  const notices = [{ id: 'n1', text: 'Welcome to FoodBridge! Every meal shared is a life touched.', created: new Date().toISOString() }];
  return { users, donations, requests: [], notices };
}

let db;
function load() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { db = seed(); save(); }
}
function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
load();

const sessions = new Map(); // token -> userId

// ---------- helpers ----------
const send = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};
const readBody = req => new Promise(resolve => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, city: u.city });
const isExpired = d => new Date(d.expiry) < new Date();
const view = d => ({ ...d, expired: d.status === 'available' && isExpired(d) });

function authUser(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const id = sessions.get(t);
  return id ? db.users.find(u => u.id === id) : null;
}

// ---------- API ----------
async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  const body = ['POST', 'PUT'].includes(m) ? await readBody(req) : {};

  if (m === 'POST' && p === '/api/register') {
    const { name, email, password, role, city } = body;
    if (!name || !email || !password || password.length < 4) return send(res, 400, { error: 'Name, email and a password (min 4 chars) are required.' });
    if (!['donor', 'receiver', 'volunteer'].includes(role)) return send(res, 400, { error: 'Choose a valid role.' });
    if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return send(res, 409, { error: 'Email already registered.' });
    const user = { id: uid(), name, email, password: hash(password), role, city: city || '' };
    db.users.push(user); save();
    const token = crypto.randomBytes(16).toString('hex'); sessions.set(token, user.id);
    return send(res, 201, { token, user: safeUser(user) });
  }
  if (m === 'POST' && p === '/api/login') {
    const user = db.users.find(u => u.email.toLowerCase() === (body.email || '').toLowerCase() && u.password === hash(body.password || ''));
    if (!user) return send(res, 401, { error: 'Invalid email or password.' });
    const token = crypto.randomBytes(16).toString('hex'); sessions.set(token, user.id);
    return send(res, 200, { token, user: safeUser(user) });
  }

  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Please log in.' });

  if (m === 'GET' && p === '/api/me') return send(res, 200, safeUser(user));
  if (m === 'POST' && p === '/api/logout') { sessions.delete((req.headers.authorization || '').replace('Bearer ', '')); return send(res, 200, { ok: true }); }

  // ----- donations -----
  if (m === 'GET' && p === '/api/donations') {
    let list = db.donations.map(view);
    if (user.role === 'donor') list = list.filter(d => d.donorId === user.id);
    else if (user.role !== 'admin') list = list.filter(d => d.status === 'available' && !d.expired);
    return send(res, 200, list.sort((a, b) => new Date(b.created) - new Date(a.created)));
  }
  if (m === 'POST' && p === '/api/donations') {
    if (user.role !== 'donor' && user.role !== 'admin') return send(res, 403, { error: 'Only donors can post food.' });
    const { title, category, servings, location, expiryHours, notes } = body;
    if (!title || !servings || !location || !expiryHours) return send(res, 400, { error: 'Title, servings, location and expiry are required.' });
    const d = { id: uid(), donorId: user.id, donorName: user.name, title, category: category || 'Cooked Meal', servings: +servings, location, expiry: hoursFromNow(+expiryHours), status: 'available', notes: notes || '', created: new Date().toISOString() };
    db.donations.push(d); save();
    return send(res, 201, view(d));
  }
  let mm = p.match(/^\/api\/donations\/(\w+)$/);
  if (mm) {
    const d = db.donations.find(x => x.id === mm[1]);
    if (!d) return send(res, 404, { error: 'Not found.' });
    if (d.donorId !== user.id && user.role !== 'admin') return send(res, 403, { error: 'Not allowed.' });
    if (m === 'PUT') {
      ['title', 'category', 'location', 'notes'].forEach(k => { if (body[k] !== undefined) d[k] = body[k]; });
      if (body.servings) d.servings = +body.servings;
      if (body.expiryHours) d.expiry = hoursFromNow(+body.expiryHours);
      save(); return send(res, 200, view(d));
    }
    if (m === 'DELETE') {
      db.donations = db.donations.filter(x => x.id !== d.id);
      db.requests = db.requests.filter(r => r.donationId !== d.id); save();
      return send(res, 200, { ok: true });
    }
  }

  // ----- requests -----
  if (m === 'GET' && p === '/api/requests') {
    let list = db.requests;
    if (user.role === 'receiver') list = list.filter(r => r.receiverId === user.id);
    else if (user.role === 'donor') list = list.filter(r => r.donorId === user.id);
    else if (user.role === 'volunteer') list = list.filter(r => r.status === 'approved' && !r.volunteerId || r.volunteerId === user.id);
    return send(res, 200, list.slice().sort((a, b) => new Date(b.created) - new Date(a.created)));
  }
  mm = p.match(/^\/api\/donations\/(\w+)\/request$/);
  if (m === 'POST' && mm) {
    if (user.role !== 'receiver') return send(res, 403, { error: 'Only receivers (NGOs / individuals) can request food.' });
    const d = db.donations.find(x => x.id === mm[1]);
    if (!d || d.status !== 'available' || isExpired(d)) return send(res, 400, { error: 'This donation is no longer available.' });
    const r = { id: uid(), donationId: d.id, title: d.title, servings: d.servings, location: d.location, donorId: d.donorId, donorName: d.donorName, receiverId: user.id, receiverName: user.name, volunteerId: null, volunteerName: null, status: 'pending', message: body.message || '', created: new Date().toISOString() };
    d.status = 'requested'; db.requests.push(r); save();
    return send(res, 201, r);
  }
  mm = p.match(/^\/api\/requests\/(\w+)\/(approve|reject|claim|complete)$/);
  if (m === 'POST' && mm) {
    const r = db.requests.find(x => x.id === mm[1]);
    const d = r && db.donations.find(x => x.id === r.donationId);
    if (!r || !d) return send(res, 404, { error: 'Not found.' });
    const act = mm[2];
    if (act === 'approve' || act === 'reject') {
      if (user.role !== 'admin' && r.donorId !== user.id) return send(res, 403, { error: 'Only the donor can do this.' });
      if (r.status !== 'pending') return send(res, 400, { error: 'Request already handled.' });
      r.status = act === 'approve' ? 'approved' : 'rejected';
      d.status = act === 'approve' ? 'approved' : 'available';
    } else if (act === 'claim') {
      if (user.role !== 'volunteer') return send(res, 403, { error: 'Only volunteers can claim deliveries.' });
      if (r.status !== 'approved' || r.volunteerId) return send(res, 400, { error: 'Delivery not available.' });
      r.volunteerId = user.id; r.volunteerName = user.name; r.status = 'in-transit';
    } else {
      if (!(r.volunteerId === user.id || r.receiverId === user.id || user.role === 'admin' || r.donorId === user.id)) return send(res, 403, { error: 'Not allowed.' });
      if (!['approved', 'in-transit'].includes(r.status)) return send(res, 400, { error: 'Cannot complete this request.' });
      r.status = 'completed'; d.status = 'completed';
    }
    save(); return send(res, 200, r);
  }

  // ----- stats & notices -----
  if (m === 'GET' && p === '/api/stats') {
    const done = db.requests.filter(r => r.status === 'completed');
    const meals = done.reduce((s, r) => s + r.servings, 0);
    return send(res, 200, {
      mealsSaved: meals,
      co2SavedKg: Math.round(meals * 0.9 * 10) / 10, // ~0.9 kg CO2e avoided per meal (estimate)
      completed: done.length,
      active: db.donations.filter(d => d.status === 'available' && !isExpired(d)).length,
      pending: db.requests.filter(r => r.status === 'pending').length,
      donors: db.users.filter(u => u.role === 'donor').length,
      receivers: db.users.filter(u => u.role === 'receiver').length,
      volunteers: db.users.filter(u => u.role === 'volunteer').length,
      leaderboard: Object.values(done.reduce((a, r) => { (a[r.donorId] = a[r.donorId] || { name: r.donorName, meals: 0 }).meals += r.servings; return a; }, {})).sort((a, b) => b.meals - a.meals).slice(0, 5)
    });
  }
  if (m === 'GET' && p === '/api/notices') return send(res, 200, db.notices.slice().reverse());
  if (m === 'POST' && p === '/api/notices') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Only admin can post notices.' });
    if (!body.text) return send(res, 400, { error: 'Notice text required.' });
    const n = { id: uid(), text: body.text, created: new Date().toISOString() };
    db.notices.push(n); save(); return send(res, 201, n);
  }
  mm = p.match(/^\/api\/notices\/(\w+)$/);
  if (m === 'DELETE' && mm) {
    if (user.role !== 'admin') return send(res, 403, { error: 'Only admin can delete notices.' });
    db.notices = db.notices.filter(n => n.id !== mm[1]); save(); return send(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/api/users') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Admin only.' });
    return send(res, 200, db.users.map(safeUser));
  }
  send(res, 404, { error: 'Unknown endpoint.' });
}

// ---------- static files ----------
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); send(res, 500, { error: 'Server error' }); }
}).listen(PORT, () => {
  console.log(`\n  FoodBridge is running!  Open  http://localhost:${PORT}\n`);
  console.log('  Demo logins:  admin@foodbridge.com / admin123');
  console.log('                donor@foodbridge.com / demo123   (also ngo@ and volunteer@)\n');
});
