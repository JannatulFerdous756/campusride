'use strict';
/* =========================================================
   CampusRide — core: helpers, validation, cookies, API (AJAX), router, shells
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const State = { user: null, csrf: '', nav: 0, shell: null, confirm: null, unread: 0, timers: [], cutoff: 30 };
const A = {};   // click actions   -> data-act="name"
const F = {};   // form submits    -> <form data-form="name">
const I = {};   // input events    -> data-on="name" / data-change="name"

/* ---------------- icons ---------------- */
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check2: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  bus: '<rect x="3" y="3" width="18" height="15" rx="3"/><path d="M3 11h18"/><path d="M7 3v8"/><path d="M17 3v8"/><circle cx="7.5" cy="15" r="1"/><circle cx="16.5" cy="15" r="1"/><path d="M5 18v2"/><path d="M19 18v2"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
  seat: '<path d="M6 3h6a3 3 0 0 1 3 3v7H6z"/><path d="M4 13h14v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  cookie: '<path d="M21 12a9 9 0 1 1-9-9 3 3 0 0 0 3 3 3 3 0 0 0 3 3 3 3 0 0 0 3 3z"/><circle cx="8.5" cy="12" r="1"/><circle cx="12" cy="16" r="1"/><circle cx="15" cy="11" r="1"/>',
  swap: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
};
const icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------------- formatting ---------------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n) => String(n).padStart(2, '0');
const parseDT = (s) => new Date(String(s).replace(' ', 'T'));
const fmtClock = (d) => `${((d.getHours() + 11) % 12) + 1}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const fmtTimeOf = (s) => fmtClock(parseDT(s));
const fmtDay = (s) => { const d = parseDT(s); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtDT = (s) => `${fmtDay(s)} · ${fmtTimeOf(s)}`;
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => dateKey(new Date());
const relDay = (s) => {
  const d = parseDT(s); d.setHours(0, 0, 0, 0); const t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((d - t) / 864e5);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : fmtDay(s);
};
const addMin = (s, m) => new Date(parseDT(s).getTime() + m * 60000);
const timeAgo = (s) => {
  const sec = Math.max(1, Math.round((Date.now() - parseDT(s)) / 1000));
  if (sec < 60) return 'just now';
  const m = Math.round(sec / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); return d < 30 ? `${d}d ago` : fmtDay(s);
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const formObj = (form) => {
  const o = Object.fromEntries(new FormData(form).entries());
  $$('input[type=checkbox]', form).forEach((c) => { if (c.name && !c.name.endsWith('[]')) o[c.name] = c.checked ? '1' : ''; });
  return o;
};
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initials = (n) => String(n).trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
const avatar = (name, size = 44) => `<span class="avatar" style="--h:${hue(name)};--s:${size}px" aria-hidden="true">${esc(initials(name))}</span>`;
const stars = (r) => `<span class="stars" style="--r:${r || 0}" role="img" aria-label="${r || 0} out of 5">★★★★★</span>`;
const chip = (t, cls = '') => `<span class="chip ${cls}">${esc(t)}</span>`;
const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ---------------- cookies (client side) ---------------- */
const Cookie = {
  get(n) { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; },
  set(n, v, days = 180) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${n}=${encodeURIComponent(v)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${secure}`;
  },
  del(n) { document.cookie = `${n}=; Max-Age=0; Path=/; SameSite=Lax`; },
  consent() { return this.get('cr_consent'); },
  /** Preference cookies are only written after the visitor allowed them. */
  pref(n, v, days) { if (this.consent() === 'all') this.set(n, v, days); },
};
function cookieBanner() {
  if (Cookie.consent() || $('#cookie-bar')) return;
  const el = document.createElement('div');
  el.id = 'cookie-bar'; el.className = 'cookie-bar'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Cookie preferences');
  el.innerHTML = `<div class="ck-ico">${icon('cookie', 22)}</div><div class="ck-text"><b>Cookies on CampusRide</b>
    <span>We always use a secure session cookie so you can log in. With your OK we also save preferences (dark mode, last ride search, your email on the login form).</span></div>
    <div class="ck-btns"><button class="btn btn-ghost btn-sm" data-act="cookieNo">Essential only</button><button class="btn btn-primary btn-sm" data-act="cookieYes">Accept all</button></div>`;
  document.body.appendChild(el);
}
A.cookieYes = () => { Cookie.set('cr_consent', 'all'); Cookie.set('cr_theme', document.documentElement.dataset.theme); $('#cookie-bar')?.remove(); toast('Preferences saved.'); };
A.cookieNo = () => { Cookie.set('cr_consent', 'essential'); ['cr_theme', 'cr_search', 'cr_email'].forEach((c) => Cookie.del(c)); $('#cookie-bar')?.remove(); };
A.cookieSettings = () => { Cookie.del('cr_consent'); cookieBanner(); };

/* ---------------- form validation (mirrors api/inc/bootstrap.php) ---------------- */
/* data-v="Label|required|email|max:190" on every input. Same rule names and messages as the server. */
const Validate = {
  dt(v) {
    const m = String(v).trim().replace('T', ' ').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] && +m[4] < 24 && +m[5] < 60) ? d : null;
  },
  rule(r, arg, v, label, data) {
    switch (r) {
      case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Enter a valid email address.';
      case 'min': return [...v].length >= +arg ? null : `${label} must be at least ${arg} characters.`;
      case 'max': return [...v].length <= +arg ? null : `${label} must be at most ${arg} characters.`;
      case 'int': return /^-?\d+$/.test(v) ? null : `${label} must be a whole number.`;
      case 'between': { const [a, b] = arg.split(',').map(Number); if (!/^-?\d+$/.test(v)) return `${label} must be a whole number.`; return (+v >= a && +v <= b) ? null : `${label} must be between ${a} and ${b}.`; }
      case 'in': return arg.split(',').includes(v) ? null : `${label} has an invalid value.`;
      case 'date': { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); const d = m && new Date(+m[1], +m[2] - 1, +m[3]); return (m && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? null : `${label} must be a valid date (YYYY-MM-DD).`; }
      case 'time': return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? null : `${label} must be a valid time (HH:MM).`;
      case 'datetime': return this.dt(v) ? null : `${label} must be a valid date and time.`;
      case 'future': { const d = this.dt(v); if (!d) return `${label} must be a valid date and time.`; return d > new Date() ? null : `${label} must be in the future.`; }
      case 'phone': return /^(?:\+?88)?01[3-9]\d{8}$/.test(v) ? null : 'Enter a valid Bangladeshi mobile number (e.g. 01712345678).';
      case 'name': return /^[\p{L}][\p{L}\s.'-]{1,59}$/u.test(v) ? null : `${label} may only contain letters, spaces and . ' - (2 to 60 characters).`;
      case 'password': return ([...v].length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v)) ? null : 'Password must be at least 8 characters with letters and numbers.';
      case 'same': return String(data[arg] ?? '').trim() === v ? null : `${label} does not match.`;
      default: return null;
    }
  },
  field(el, data) {
    const parts = (el.dataset.v || '').split('|'); const label = parts.shift();
    const v = String(el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value ?? '').trim();
    if (!v) return parts.includes('required') ? `${label} is required.` : null;
    for (const p of parts) {
      const [r, ...rest] = p.split(':');
      const msg = this.rule(r, rest.join(':'), v, label, data);
      if (msg) return msg;
    }
    return null;
  },
  form(form) {
    const data = formObj(form); const errors = {};
    $$('[data-v]', form).forEach((el) => { const m = this.field(el, data); if (m && !errors[el.name]) errors[el.name] = m; });
    return errors;
  },
};
function setFieldError(form, name, msg) {
  const el = form.elements[name]; if (!el) return;
  const wrap = el.closest('.field') || el.parentElement;
  wrap.classList.toggle('invalid', !!msg); wrap.classList.toggle('valid', !msg && !!String(el.value || '').trim());
  let e = wrap.querySelector('.field-err');
  if (msg) {
    if (!e) { e = document.createElement('div'); e.className = 'field-err'; e.setAttribute('role', 'alert'); wrap.appendChild(e); }
    e.textContent = msg; el.setAttribute('aria-invalid', 'true');
  } else { e?.remove(); el.removeAttribute('aria-invalid'); }
}
function showErrors(form, errors) {
  $$('[data-v]', form).forEach((el) => setFieldError(form, el.name, errors[el.name] || null));
  Object.keys(errors).forEach((k) => { if (!$(`[data-v][name="${k}"]`, form)) setFieldError(form, k, errors[k]); });
  const first = Object.keys(errors)[0]; form.elements[first]?.focus?.();
  const fe = $('.form-error', form); if (fe) { fe.textContent = ''; fe.classList.add('hide'); }
}
function formMessage(form, msg) { const fe = $('.form-error', form); if (fe) { fe.textContent = msg; fe.classList.toggle('hide', !msg); } else if (msg) toast(msg, 'error'); }
// live validation after the first blur
document.addEventListener('focusout', (e) => {
  const el = e.target.closest?.('[data-v]'); if (!el || !el.form) return;
  el.dataset.touched = '1'; setFieldError(el.form, el.name, Validate.field(el, formObj(el.form)));
});
document.addEventListener('input', (e) => {
  const el = e.target.closest?.('[data-v]'); if (!el || !el.form || !el.dataset.touched) return;
  setFieldError(el.form, el.name, Validate.field(el, formObj(el.form)));
  if (el.name === 'password') { const c = el.form.elements.password2; if (c?.dataset.touched) setFieldError(el.form, 'password2', Validate.field(c, formObj(el.form))); }
});

/* ---------------- API (AJAX) ---------------- */
class ApiError extends Error { constructor(m, status, data = {}) { super(m); this.status = status; this.errors = data.errors; this.code = data.code; } }
async function api(action, opts = {}) {
  const method = opts.method || (opts.body ? 'POST' : 'GET');
  const params = { action };
  for (const [k, v] of Object.entries(opts.params || {})) if (v !== undefined && v !== null && v !== '' && v !== false) params[k] = v;
  let res;
  try {
    res = await fetch(`api/index.php?${new URLSearchParams(params)}`, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': State.csrf },
      body: method === 'POST' ? JSON.stringify(opts.body || {}) : undefined,
    });
  } catch { throw new ApiError('Cannot reach the server. Check your internet connection.', 0); }
  let data;
  try { data = await res.json(); } catch { throw new ApiError('The server sent an unexpected response. Check that PHP is running.', res.status); }
  if (data.csrf) State.csrf = data.csrf;
  if (!data.ok) {
    if (res.status === 401 && State.user) { State.user = null; stopPolling(); }
    throw new ApiError(data.error || 'Request failed', res.status, data);
  }
  return data;
}
const post = (action, body = {}) => api(action, { method: 'POST', body });
const STALE = Symbol('stale');

/** Run an async job from a button: disables it, shows a spinner, shows errors (inline for forms). */
async function run(btn, job, form) {
  if (btn && btn.disabled) return;
  btn?.classList.add('busy'); if (btn) btn.disabled = true;
  try { return await job(); }
  catch (e) {
    if (e === STALE) return;
    if (form && e.errors) showErrors(form, e.errors);
    else if (form && $('.form-error', form)) formMessage(form, e.message || 'Something went wrong');
    else toast(e.message || 'Something went wrong', 'error');
    if (e.status === 419) setTimeout(() => location.reload(), 1200);
  } finally { if (btn) { btn.classList.remove('busy'); btn.disabled = false; } }
}

async function refreshMe() {
  const d = await api('me');
  State.user = d.user; State.unread = d.unread || 0; State.cutoff = d.cancel_cutoff_min ?? 30;
  updateChrome(); startPolling();
  return d.user;
}

/* ---------------- toast / modal ---------------- */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check2', 20)}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, type === 'error' ? 5200 : 3200);
}
function openModal({ title, body, wide = false }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back" data-act="modalBackdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="btn-icon" data-act="closeModal" aria-label="Close">${icon('x')}</button></div>${body}</div></div>`;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('.modal input:not([type=hidden]), .modal select, .modal textarea', root)?.focus(), 60);
}
function closeModal() {
  $('#modal-root').innerHTML = ''; document.body.style.overflow = '';
  if (State.confirm) { State.confirm(false); State.confirm = null; }
}
function confirmBox({ title, text, ok = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    openModal({ title, body: `<p class="muted">${text}</p><div class="modal-foot"><button class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirmYes">${esc(ok)}</button></div>` });
    State.confirm = resolve;
  });
}
A.closeModal = () => closeModal();
A.modalBackdrop = (d, el, e) => { if (e.target === el) closeModal(); };
A.confirmYes = () => { const r = State.confirm; State.confirm = null; closeModal(); r && r(true); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('#modal-root').firstChild) closeModal(); closeBell(); } });

/* ---------------- global event delegation ---------------- */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.bell-wrap')) closeBell();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault();
  const r = fn({ ...el.dataset }, el, e);
  if (r && typeof r.catch === 'function') r.catch((err) => err !== STALE && toast(err.message || 'Something went wrong', 'error'));
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = F[form.dataset.form];
  if (!fn) return;
  const errors = Validate.form(form);
  $$('[data-v]', form).forEach((el) => { el.dataset.touched = '1'; });
  if (Object.keys(errors).length) { showErrors(form, errors); return; }
  showErrors(form, {});
  run($('button[type=submit]', form), () => fn(form, formObj(form)), form);
});
document.addEventListener('input', (e) => { const el = e.target.closest('[data-on]'); if (el) I[el.dataset.on]?.(el, e); });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el) I[el.dataset.change]?.(el, e); });

/* ---------------- theme ---------------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  Cookie.pref('cr_theme', t);
  $$('[data-act="theme"]').forEach((b) => (b.innerHTML = icon(t === 'dark' ? 'sun' : 'moon')));
}
A.theme = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
const themeBtn = () => `<button class="btn-icon" data-act="theme" aria-label="Toggle dark mode">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>`;

/* ---------------- timers (cleared on navigation) ---------------- */
function every(fn, ms) { State.timers.push(setInterval(fn, ms)); }
function clearTimers() { State.timers.forEach(clearInterval); State.timers = []; }

/* ---------------- router ---------------- */
const Routes = [];
function route(path, opts, render) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  Routes.push({ path, re, keys, ...opts, render });
}
const go = (p) => { location.hash = '#' + p; };
const refresh = () => navigate({ soft: true });
const HOME = { passenger: '/passenger/search', driver: '/driver/trips', manager: '/manager/overview', admin: '/admin/analytics' };
const homeFor = (u) => (u.role === 'driver' && u.status === 'pending' ? '/pending' : HOME[u.role] || '/');

const skeletonPage = () => `<div class="stack" style="gap:18px"><div class="skel" style="height:34px;width:240px"></div><div class="grid g3"><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div></div><div class="skel" style="height:260px"></div></div>`;

async function navigate({ soft = false } = {}) {
  closeModal(); closeBell();
  if (!soft) clearTimers();
  const hash = location.hash.slice(1) || '/';
  const [pathRaw, qs = ''] = hash.split('?');
  const path = pathRaw || '/';
  const query = Object.fromEntries(new URLSearchParams(qs));
  let r = null; const params = {};
  for (const x of Routes) {
    const m = path.match(x.re);
    if (m) { r = x; x.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; }
  }
  if (!r) r = Routes.find((x) => x.path === '/404');
  if (r.roles) {
    if (!State.user) return go('/login?next=' + encodeURIComponent(hash));
    if (State.user.role === 'driver' && State.user.status === 'pending' && r.path !== '/pending') return go('/pending');
    if (!r.roles.includes(State.user.role)) { toast('That page is not available for your account.', 'error'); return go(homeFor(State.user)); }
  }
  if (r.guestOnly && State.user) return go(homeFor(State.user));

  const token = ++State.nav;
  const shell = r.shell === 'shared' ? (State.user ? 'app' : 'public') : r.shell;
  mountShell(shell);
  setActive(path);
  document.title = `${r.title ? r.title + ' · ' : ''}CampusRide`;
  const titleEl = $('#page-title'); if (titleEl) titleEl.textContent = r.title || '';
  const view = $('#view');
  if (!soft) view.innerHTML = skeletonPage();
  const ctx = {
    params, query, view, soft,
    alive: () => token === State.nav,
    wait: (p) => Promise.resolve(p).then((v) => { if (token !== State.nav) throw STALE; return v; }),
    every: (fn, ms) => every(() => { if (token === State.nav) fn(); }, ms),
  };
  try {
    await r.render(view, ctx);
    if (!soft && token === State.nav) window.scrollTo(0, 0);
  } catch (e) {
    if (e === STALE || token !== State.nav) return;
    if (e.status === 401) { State.user = null; return go('/login'); }
    view.innerHTML = `<div class="container"><div class="card empty" style="margin-top:40px"><div class="ico">${icon('alert', 28)}</div><h3>Something went wrong</h3><p>${esc(e.message || 'Unexpected error')}</p><button class="btn btn-primary" data-act="retry">Try again</button></div></div>`;
    if (!(e instanceof ApiError)) console.error(e);
  }
}
A.retry = () => navigate();
window.addEventListener('hashchange', () => navigate());

/* ---------------- shells ---------------- */
const logoMark = `<span class="logo-mark">${icon('bus', 20)}</span>`;
const logo = (href = '#/') => `<a href="${href}" class="logo">${logoMark}<span>Campus<b>Ride</b></span></a>`;

const NAV = {
  passenger: [['/passenger/search', 'Search Rides', 'search'], ['/passenger/bookings', 'Bookings', 'calendar'], ['/passenger/history', 'Booking History', 'history'],
    ['/notifications', 'Notifications', 'bell'], ['/passenger/reviews', 'Reviews', 'star'], ['/passenger/complaints', 'Complaints', 'flag']],
  driver: [['/driver/trips', 'Assigned Trips', 'route'], ['/driver/passengers', 'Passenger List', 'users'], ['/driver/status', 'Ride Status', 'zap'],
    ['/driver/reports', 'Delay Reports', 'alert'], ['/notifications', 'Notifications', 'bell']],
  manager: [['/manager/overview', 'Booking Overview', 'grid'], ['/manager/routes', 'Routes', 'route'], ['/manager/vehicles', 'Vehicles', 'bus'],
    ['/manager/assignments', 'Driver Assignments', 'user'], ['/manager/schedules', 'Schedules', 'calendar'], ['/notifications', 'Notifications', 'bell']],
  admin: [['/admin/analytics', 'Analytics', 'chart'], ['/admin/users', 'User Management', 'users'], ['/admin/roles', 'Role Management', 'shield'],
    ['/admin/complaints', 'Complaints', 'flag'], ['/admin/audit', 'Audit Logs', 'list'], ['/notifications', 'Notifications', 'bell']],
};
const PUBLIC_LINKS = [['/', 'Home'], ['/routes', 'Available Routes'], ['/about', 'About']];

function sideNavHtml() {
  const u = State.user; if (!u || !NAV[u.role]) return '';
  const badge = (p) => (p === '/notifications' && State.unread ? `<span class="pill" data-unread>${State.unread}</span>` : '');
  return `<div class="side-label">${esc(titleCase(u.role))} menu</div>` + NAV[u.role].map(([p, l, ic]) => `<a href="#${p}" data-path="${p}">${icon(ic, 19)}<span>${l}</span>${badge(p)}</a>`).join('');
}
function updateChrome() {
  const u = State.user;
  const nav = $('#side-nav'); if (nav) { nav.innerHTML = sideNavHtml(); setActive((location.hash.slice(1) || '/').split('?')[0]); }
  const su = $('#side-user'); if (su && u) su.innerHTML = `${avatar(u.name, 42)}<div class="who"><b>${esc(u.name)}</b><span>${esc(u.role)}${u.status === 'pending' ? ' · pending' : ''}</span></div><button class="btn-icon" data-act="logout" aria-label="Log out" title="Log out">${icon('logout')}</button>`;
  updateBell();
  if (State.shell === 'public') { const na = $('#nav-auth'); if (na) na.innerHTML = publicAuthHtml(); }
}
function publicAuthHtml() {
  const u = State.user;
  return u ? `<a class="btn btn-primary btn-sm" href="#${homeFor(u)}">${icon('grid', 16)} Dashboard</a><button class="btn btn-ghost btn-sm hide-sm" data-act="logout">Log out</button>`
    : `<a class="btn btn-ghost btn-sm hide-sm" href="#/login">Log in</a><a class="btn btn-primary btn-sm" href="#/register">Sign up</a>`;
}
function mountShell(kind) {
  if (State.shell === kind && $('#view')) return;
  State.shell = kind;
  const root = $('#root');
  if (kind === 'public') {
    root.innerHTML = `<header class="nav"><div class="container nav-in">${logo()}
      <nav class="nav-links" id="pub-links" aria-label="Main">${PUBLIC_LINKS.map(([p, l]) => `<a href="#${p}" data-path="${p}">${l}</a>`).join('')}</nav>
      <div class="nav-actions">${themeBtn()}<span class="row" id="nav-auth" style="gap:10px">${publicAuthHtml()}</span></div>
      <button class="btn-icon nav-burger" data-act="pubNav" aria-label="Menu">${icon('menu')}</button></div></header>
      <main id="view"></main>
      <footer class="footer"><div class="container footer-in"><div>${logo()}<div style="margin-top:8px">Smart campus transport — find a ride, reserve a seat.</div></div>
      <div class="row" style="gap:18px"><a href="#/routes">Routes</a><a href="#/about">About</a><button class="linkbtn" data-act="cookieSettings">Cookie settings</button><span>© ${new Date().getFullYear()} CampusRide</span></div></div></footer>`;
  } else {
    root.innerHTML = `<div class="app"><aside class="sidebar" id="sidebar" aria-label="Sidebar">${logo('#' + (State.user ? homeFor(State.user) : '/'))}<nav class="side-nav" id="side-nav"></nav><div class="side-user" id="side-user"></div></aside>
      <div class="app-main"><header class="topbar"><button class="btn-icon side-burger" data-act="sideOpen" aria-label="Open menu">${icon('menu')}</button><h1 id="page-title"></h1><span class="spacer"></span>
      <div class="bell-wrap"><button class="btn-icon bell" id="bell" data-act="bell" aria-label="Notifications" aria-haspopup="true"></button><div class="notif-pop hide" id="notif-pop" role="menu"></div></div>${themeBtn()}</header><main id="view" class="app-view"></main></div>
      <div class="scrim" id="scrim" data-act="sideClose"></div></div>`;
    updateChrome();
  }
}
function setActive(path) {
  $$('[data-path]').forEach((a) => {
    const p = a.dataset.path;
    a.classList.toggle('active', p === path || (p !== '/' && path.startsWith(p + '/')));
  });
}
A.pubNav = () => $('#pub-links')?.classList.toggle('open');
A.sideOpen = () => { $('#sidebar')?.classList.add('open'); $('#scrim')?.classList.add('open'); };
A.sideClose = () => { $('#sidebar')?.classList.remove('open'); $('#scrim')?.classList.remove('open'); };
window.addEventListener('hashchange', () => { A.sideClose(); $('#pub-links')?.classList.remove('open'); });
A.logout = async () => {
  await post('logout');
  State.user = null; State.shell = null; State.unread = 0; stopPolling();
  await refreshMe();
  toast('You have been logged out.');
  const already = (location.hash.slice(1) || '/') === '/';
  go('/');
  if (already) navigate();
};

/* ---------------- notification bell + polling ---------------- */
function updateBell() {
  const b = $('#bell'); if (!b) return;
  b.innerHTML = `${icon('bell', 20)}${State.unread ? `<span class="bell-badge">${State.unread > 9 ? '9+' : State.unread}</span>` : ''}`;
  $$('[data-unread]').forEach((p) => { p.textContent = State.unread; p.classList.toggle('hide', !State.unread); });
  if (State.user && $('#side-nav') && !$('#side-nav [data-unread]') && State.unread) $('#side-nav').innerHTML = sideNavHtml();
}
function closeBell() { $('#notif-pop')?.classList.add('hide'); }
function notifIcon(t) { return { booking: 'check2', cancel: 'x', schedule: 'calendar', delay: 'clock', status: 'zap', vehicle: 'wrench', review: 'star', complaint: 'flag', approval: 'user', account: 'shield' }[t] || 'bell'; }
function notifItem(n) {
  const inner = `<span class="n-ic t-${esc(n.type)}">${icon(notifIcon(n.type), 16)}</span><span class="n-body"><span>${esc(n.message)}</span><small>${timeAgo(n.created_at)}</small></span>`;
  return `<a class="notif ${n.is_read ? '' : 'unread'}" href="${n.link ? esc(n.link) : '#/notifications'}" data-act="notifOpen" data-id="${n.notification_id}">${inner}</a>`;
}
A.bell = async (d, el, e) => {
  e.stopPropagation();
  const pop = $('#notif-pop'); if (!pop.classList.contains('hide')) return closeBell();
  pop.classList.remove('hide'); pop.innerHTML = `<div class="np-head"><b>Notifications</b></div><div class="np-empty">Loading…</div>`;
  const r = await api('notifications');
  State.unread = r.unread; updateBell();
  pop.innerHTML = `<div class="np-head"><b>Notifications</b>${r.unread ? '<button class="linkbtn" data-act="notifAll">Mark all read</button>' : ''}</div>
    <div class="np-list">${r.notifications.slice(0, 8).map(notifItem).join('') || '<div class="np-empty">You are all caught up.</div>'}</div>
    <a class="np-foot" href="#/notifications">View all notifications</a>`;
};
A.notifOpen = async (d) => { closeBell(); try { const r = await post('notif_read', { id: +d.id }); State.unread = r.unread; updateBell(); } catch { /* ignore */ } };
A.notifAll = async (d, el, e) => { e.stopPropagation(); const r = await post('notif_read', {}); State.unread = r.unread; updateBell(); closeBell(); if ((location.hash || '').startsWith('#/notifications')) refresh(); };
let pollTimer = null;
function startPolling() {
  if (pollTimer || !State.user) return;
  pollTimer = setInterval(async () => {
    if (!State.user || document.hidden) return;
    try { const d = await api('me'); if (!d.user) { State.user = null; stopPolling(); navigate(); return; } if (d.unread > State.unread) toast('You have a new notification.'); State.unread = d.unread; updateBell(); } catch { /* offline */ }
  }, 30000);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
