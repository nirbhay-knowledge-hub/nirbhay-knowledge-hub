require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const STORAGE = path.join(ROOT, "storage");
const PRIVATE_DIR = path.join(STORAGE, "private");
const PUBLIC_DIR = path.join(STORAGE, "public");
for (const dir of [STORAGE, PRIVATE_DIR, PUBLIC_DIR]) fs.mkdirSync(dir, { recursive: true });

if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("Set SESSION_SECRET to a long random value (at least 32 characters) in production.");
}
const db = new Database(path.join(STORAGE, "nkh.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL,
 title TEXT NOT NULL DEFAULT 'Safety Professional',
 bio TEXT NOT NULL DEFAULT '',
 photo_filename TEXT,
 is_public INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 original_name TEXT NOT NULL,
 stored_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: STORAGE }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret-before-deploying",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 8 }
}));
app.use("/assets", express.static(path.join(ROOT, "public")));
app.use("/public-uploads", express.static(PUBLIC_DIR));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
function currentUser(req) {
  if (!req.session.userId) return null;
  return db.prepare("SELECT id, username, display_name, title, bio, photo_filename, is_public FROM users WHERE id = ?").get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
  if (!currentUser(req)) return res.redirect("/login");
  next();
}
function page(title, body, user = null) {
  const nav = user
    ? `<a href="/dashboard">My Dashboard</a><a href="/files">Private File Manager</a><form class="inline" method="post" action="/logout"><button>Log out</button></form>`
    : `<a href="/login">Log in</a><a href="/register">Create account</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Nirbhay Knowledge Hub</title><link rel="stylesheet" href="/assets/style.css"></head><body><header><a class="brand" href="/"><span class="logo">NKH</span><span><b>NIRBHAY KNOWLEDGE HUB</b><small>Learn · Grow · Stay Safe</small></span></a><nav>${nav}</nav></header><main>${body}</main><footer>Created &amp; Founded by Nirbhay Kumar Singh · Nirbhay Knowledge Hub</footer></body></html>`;
}
function message(text, kind = "info") { return `<div class="message ${kind}">${escapeHtml(text)}</div>`; }

app.get("/", (req, res) => {
  const founder = db.prepare("SELECT display_name,title,bio,photo_filename,is_public FROM users WHERE username = ?").get("nirbhay");
  const name = founder?.display_name || process.env.FOUNDER_NAME || "Nirbhay Kumar Singh";
  const title = founder?.title || process.env.FOUNDER_TITLE || "Safety Officer / EHS Professional";
  const bio = founder?.bio || "A practical learning space for Safety Officers and EHS professionals to build site-safety knowledge, prepare for interviews and grow their careers.";
  const photo = founder?.photo_filename ? `/public-uploads/${encodeURIComponent(founder.photo_filename)}` : "";
  const body = `<section class="hero"><div><p class="eyebrow">Safety knowledge · Skills · Career growth</p><h1>Learn Better.<br><span>Work Safer.</span></h1><p class="lead">A learning platform for Safety Officers and EHS professionals — from core safety concepts to practical site knowledge and career preparation.</p><div class="actions"><a class="button" href="#learning">Explore learning areas</a><a class="button secondary" href="/register">Create your account</a></div></div><aside class="founder-card">${photo ? `<img class="founder-photo" src="${photo}" alt="Founder profile photo">` : `<div class="avatar">NK</div>`}<span class="pill">FOUNDER · NKH</span><h2>${escapeHtml(name)}</h2><p class="muted">${escapeHtml(title)}</p><p>${escapeHtml(bio)}</p></aside></section>
  <section id="learning"><h2>Explore the Knowledge Hub</h2><div class="cards"><article><h3>🦺 Safety Learning</h3><p>PTW, HIRA, work at height, scaffolding, lifting, confined space, fire safety and more.</p></article><article><h3>📝 Interview Preparation</h3><p>Practice questions, model answers and site-based safety scenarios.</p></article><article><h3>✅ Online Tests</h3><p>Knowledge checks and MCQs for revision.</p></article><article><h3>📄 Resume Builder</h3><p>Plan a professional Safety Officer / EHS resume.</p></article><article><h3>🔐 Private File Manager</h3><p>Keep your own certificates and study files inside your account.</p></article><article><h3>📈 My Progress</h3><p>Track learning goals as the learning module is developed.</p></article></div></section>
  <section class="about"><h2>About the Founder</h2><p><b>${escapeHtml(name)}</b> · ${escapeHtml(title)}</p><p>${escapeHtml(bio)}</p><p class="muted">Core areas: HIRA &amp; Risk Assessment · PTW · Fire &amp; Emergency Management · Incident Investigation · Safety Audits · Legal Compliance</p></section>
  <p class="notice">Public profile information is separate from private account files. Files uploaded to the private file manager are not served as public links.</p>`;
  res.send(page("Home", body, currentUser(req)));
});

app.get("/register", (req, res) => res.send(page("Create account", `<section class="form-card"><h1>Create your account</h1><p class="muted">Choose a unique User ID. Use a strong, unique password.</p><form method="post" action="/register"><label>User ID<input name="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_.-]+" autocomplete="username"></label><label>Display name<input name="display_name" required maxlength="80" autocomplete="name"></label><label>Password<input name="password" type="password" required minlength="12" autocomplete="new-password"></label><button class="button">Create account</button></form><p class="muted small">Use at least 12 characters. This starter does not include email verification or password reset yet.</p></section>`, currentUser(req))));
app.post("/register", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const displayName = String(req.body.display_name || "").trim();
  const password = String(req.body.password || "");
  if (!/^[a-z0-9_.-]{3,30}$/.test(username) || displayName.length < 2 || displayName.length > 80 || password.length < 12) {
    return res.status(400).send(page("Create account", message("Check your User ID, display name, and password. Password must be at least 12 characters.", "error")));
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users (username,password_hash,display_name,title,bio,is_public) VALUES (?,?,?,?,?,1)")
      .run(username, hash, displayName, "Safety Officer / EHS Professional", "Add a short professional introduction from your dashboard.");
    req.session.regenerate(err => {
      if (err) return res.status(500).send(page("Error", message("Could not create a session. Please try again.", "error")));
      req.session.userId = Number(info.lastInsertRowid);
      res.redirect("/dashboard");
    });
  } catch (e) {
    res.status(409).send(page("Create account", message("That User ID may already be in use. Please choose another.", "error")));
  }
});
app.get("/login", (req, res) => res.send(page("Log in", `<section class="form-card"><h1>Log in</h1><form method="post" action="/login"><label>User ID<input name="username" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="button">Log in</button></form><p class="muted small">Password reset and email verification need to be configured before a public launch.</p></section>`, currentUser(req))));
app.post("/login", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT id,password_hash FROM users WHERE username=?").get(username);
  const ok = user && await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).send(page("Log in", message("User ID or password was not correct.", "error")));
  req.session.regenerate(err => {
    if (err) return res.status(500).send(page("Log in", message("Could not start a session.", "error")));
    req.session.userId = user.id;
    res.redirect("/dashboard");
  });
});
app.post("/logout", requireAuth, (req, res) => req.session.destroy(() => res.redirect("/")));

app.get("/dashboard", requireAuth, (req, res) => {
  const u = currentUser(req);
  const body = `<section class="form-card wide"><h1>My Account</h1><p>Signed in as <b>${escapeHtml(u.username)}</b>.</p><p class="muted">Update the profile other people can see. Your uploaded private files remain separate.</p><form method="post" action="/profile" enctype="multipart/form-data"><label>Public display name<input name="display_name" required maxlength="80" value="${escapeHtml(u.display_name)}"></label><label>Professional title<input name="title" maxlength="100" value="${escapeHtml(u.title)}"></label><label>Public introduction<textarea name="bio" rows="4" maxlength="600">${escapeHtml(u.bio)}</textarea></label><label>Public profile visibility<select name="is_public"><option value="1" ${u.is_public ? "selected" : ""}>Public — profile can be viewed by anyone</option><option value="0" ${!u.is_public ? "selected" : ""}>Private — hide profile from public profile pages</option></select></label><label>Profile photo (optional)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label><button class="button">Save profile</button></form><p class="muted small">Only profile fields you save as public appear on your public profile page. Never upload confidential work documents as a public profile photo.</p><a class="button secondary" href="/u/${encodeURIComponent(u.username)}">View public profile</a> <a class="button secondary" href="/files">Open private files</a></section>`;
  res.send(page("My Account", body, u));
});
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PUBLIC_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, ["image/jpeg","image/png","image/webp"].includes(file.mimetype))
});
app.post("/profile", requireAuth, photoUpload.single("photo"), (req, res) => {
  const u = currentUser(req);
  const displayName = String(req.body.display_name || "").trim().slice(0,80);
  const title = String(req.body.title || "").trim().slice(0,100);
  const bio = String(req.body.bio || "").trim().slice(0,600);
  const isPublic = req.body.is_public === "1" ? 1 : 0;
  let photo = u.photo_filename;
  if (req.file) photo = req.file.filename;
  db.prepare("UPDATE users SET display_name=?,title=?,bio=?,is_public=?,photo_filename=? WHERE id=?")
    .run(displayName || u.display_name, title, bio, isPublic, photo, u.id);
  res.redirect("/dashboard");
});
app.get("/u/:username", (req, res) => {
  const u = db.prepare("SELECT username,display_name,title,bio,photo_filename,is_public FROM users WHERE username=?").get(String(req.params.username).toLowerCase());
  if (!u || !u.is_public) return res.status(404).send(page("Profile unavailable", message("This public profile is not available.")));
  const photo = u.photo_filename ? `<img class="founder-photo" src="/public-uploads/${encodeURIComponent(u.photo_filename)}" alt="Profile photo">` : `<div class="avatar"> ${escapeHtml(u.display_name.split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase())}</div>`;
  res.send(page(`${u.display_name} · Public Profile`, `<section class="form-card public-profile">${photo}<span class="pill">PUBLIC PROFILE</span><h1>${escapeHtml(u.display_name)}</h1><p class="muted">${escapeHtml(u.title)}</p><p>${escapeHtml(u.bio)}</p><p class="muted">Nirbhay Knowledge Hub · Safety learning and career development</p></section>`));
});
const privateUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRIVATE_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID())
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf","image/jpeg","image/png","image/webp","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    cb(null, allowed.includes(file.mimetype));
  }
});
app.get("/files", requireAuth, (req, res) => {
  const u = currentUser(req);
  const files = db.prepare("SELECT id,original_name,mime_type,size_bytes,created_at FROM files WHERE user_id=? ORDER BY id DESC").all(u.id);
  const rows = files.length ? files.map(f => `<tr><td>${escapeHtml(f.original_name)}</td><td>${(f.size_bytes/1024).toFixed(1)} KB</td><td><a href="/files/${f.id}/download">Download</a> <form class="inline" method="post" action="/files/${f.id}/delete" onsubmit="return confirm('Delete this file?')"><button class="link-button">Delete</button></form></td></tr>`).join("") : `<tr><td colspan="3">No files uploaded yet.</td></tr>`;
  const body = `<section class="form-card wide"><h1>My Private File Manager</h1><p class="muted">Only your signed-in account can list, download or delete these files.</p><form method="post" action="/files" enctype="multipart/form-data"><label>Choose a private file (PDF, image, TXT, DOCX or XLSX; max 10 MB)<input type="file" name="file" required></label><button class="button">Upload private file</button></form><div class="table-wrap"><table><thead><tr><th>File</th><th>Size</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  res.send(page("Private File Manager", body, u));
});
app.post("/files", requireAuth, privateUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send(page("Upload", message("File type not allowed, or file is missing/too large.", "error"), currentUser(req)));
  db.prepare("INSERT INTO files (user_id,original_name,stored_name,mime_type,size_bytes) VALUES (?,?,?,?,?)")
    .run(currentUser(req).id, path.basename(req.file.originalname).slice(0,180), req.file.filename, req.file.mimetype, req.file.size);
  res.redirect("/files");
});
app.get("/files/:id/download", requireAuth, (req, res) => {
  const f = db.prepare("SELECT * FROM files WHERE id=? AND user_id=?").get(Number(req.params.id), currentUser(req).id);
  if (!f) return res.status(404).send(page("File not found", message("File not found in your account.", "error"), currentUser(req)));
  const full = path.join(PRIVATE_DIR, path.basename(f.stored_name));
  if (!fs.existsSync(full)) return res.status(404).send(page("File missing", message("Stored file is unavailable.", "error"), currentUser(req)));
  res.download(full, path.basename(f.original_name));
});
app.post("/files/:id/delete", requireAuth, (req, res) => {
  const f = db.prepare("SELECT * FROM files WHERE id=? AND user_id=?").get(Number(req.params.id), currentUser(req).id);
  if (f) {
    const full = path.join(PRIVATE_DIR, path.basename(f.stored_name));
    try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch {}
    db.prepare("DELETE FROM files WHERE id=? AND user_id=?").run(f.id, currentUser(req).id);
  }
  res.redirect("/files");
});
app.use((req, res) => res.status(404).send(page("Not found", message("That page was not found."), currentUser(req))));
app.listen(PORT, () => console.log(`Nirbhay Knowledge Hub running on http://localhost:${PORT}`));
