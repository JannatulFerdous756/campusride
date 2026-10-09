'use strict';
/* Public pages: home, about, routes, login, register, pending, 404 */

const heroArt = `<div class="hero-art" aria-hidden="true">
  <svg class="hero-bus" viewBox="0 0 420 260" fill="none"><defs><linearGradient id="hb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1769e0"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs>
    <path d="M10 232h400" stroke="var(--border)" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 14"/>
    <rect x="40" y="52" width="340" height="150" rx="30" fill="url(#hb)"/><rect x="62" y="74" width="62" height="52" rx="10" fill="#fff" opacity=".92"/><rect x="134" y="74" width="62" height="52" rx="10" fill="#fff" opacity=".92"/><rect x="206" y="74" width="62" height="52" rx="10" fill="#fff" opacity=".92"/>
    <path d="M286 74h60a14 14 0 0 1 14 14v38h-74z" fill="#fff" opacity=".92"/><rect x="40" y="150" width="340" height="10" fill="#fff" opacity=".25"/><circle cx="110" cy="206" r="26" fill="#0c1f3a"/><circle cx="110" cy="206" r="11" fill="#cfe0f5"/><circle cx="310" cy="206" r="26" fill="#0c1f3a"/><circle cx="310" cy="206" r="11" fill="#cfe0f5"/>
    <circle cx="372" cy="170" r="7" fill="#fbbf24"/><text x="64" y="186" fill="#fff" font-size="15" font-weight="800" font-family="system-ui">CAMPUSRIDE</text></svg>
  <div class="float-card a"><div class="row between"><b>Uttara → Campus</b><span class="chip success">Live</span></div><div class="muted small" style="margin:6px 0 10px">Today · 7:30 AM</div><div class="seatbox ok"><div class="seat-top"><span>${icon('seat', 16)} <b>14</b> seats left</span><small>of 40</small></div><div class="meter"><i style="width:65%"></i></div></div></div>
  <div class="float-card b"><div class="row" style="gap:10px"><span class="n-ic t-booking">${icon('check2', 16)}</span><div><b class="small">Seat confirmed</b><div class="muted small">Pickup: Kuril · 8:05 AM</div></div></div></div>
  <div class="float-card c"><div class="row" style="gap:10px"><span class="n-ic t-delay">${icon('clock', 16)}</span><div><b class="small">Delay alert</b><div class="muted small">Bus is 10 min late</div></div></div></div></div>`;

route('/', { shell: 'public', title: '' }, async (view, ctx) => {
  const [st, locs] = await ctx.wait(Promise.all([api('stats'), api('locations')]));
  const s = st.stats;
  view.innerHTML = `<section class="hero"><div class="container hero-grid"><div>
      <span class="eyebrow"><i>New</i> Live seat availability</span>
      <h1>Campus rides, <span class="grad-text">booked in seconds.</span></h1>
      <p class="lead">Find a shuttle from your stop to campus, reserve a seat that nobody else can take, and get alerts if the bus is late. Built for students, staff, drivers and transport managers.</p>
      <form class="quick-search" data-form="quickSearch" novalidate>
        <div class="qs-field">${icon('pin', 18)}<input name="from" list="locs" placeholder="Pickup point" aria-label="Pickup point" autocomplete="off" data-v="Pickup|max:100"></div>
        <div class="qs-field">${icon('pin', 18)}<input name="to" list="locs" placeholder="Destination" aria-label="Destination" autocomplete="off" data-v="Destination|max:100"></div>
        <button class="btn btn-primary" type="submit">${icon('search', 16)} Find rides</button><datalist id="locs">${locs.locations.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></form>
      <div class="hero-proof"><div><b data-count="${s.routes}">0</b><span>Active routes</span></div><div><b data-count="${s.upcoming}">0</b><span>Upcoming rides</span></div><div><b data-count="${s.bookings}">0</b><span>Seats booked</span></div></div>
    </div>${heroArt}</div></section>
    <section class="section container"><div class="section-head"><h2>How CampusRide works</h2><p>One platform, four roles, zero WhatsApp group chaos.</p></div>
      <div class="grid g4">${[['route', 'Manager publishes', 'Routes, stops, vehicles and departure schedules are set up by the transport office.'],
        ['search', 'You search', 'Filter by pickup, destination, date and time. Only rides that really pass your stops appear.'],
        ['seat', 'You reserve a seat', 'Seats update live. No overbooking, no duplicate bookings, instant confirmation.'],
        ['zap', 'Driver runs the trip', 'Drivers see their passenger list, update ride status and report delays — you get notified.']]
        .map(([ic, t, p], i) => `<div class="card step hover"><span class="n">${i + 1}</span><div class="num">${icon(ic, 24)}</div><h3>${t}</h3><p class="muted" style="margin:0">${p}</p></div>`).join('')}</div></section>
    <section class="section container"><div class="section-head"><h2>Built for every role</h2><p>Each person sees only what they are allowed to do — enforced on the server.</p></div>
      <div class="grid g4">${[['Passenger', 'user', ['Search & book seats', 'Cancel anytime before cut-off', 'Ratings & complaints']], ['Driver', 'bus', ['Assigned trips & passenger list', 'Start / complete rides', 'Report delays & vehicle issues']],
        ['Transport Manager', 'grid', ['Routes, stops & vehicles', 'Schedules & driver assignment', 'Monitor reservations & alerts']], ['Admin', 'shield', ['Approve & suspend accounts', 'Complaints & audit logs', 'Analytics & CSV reports']]]
        .map(([t, ic, li]) => `<div class="card role-card hover"><div class="num step-ic">${icon(ic, 24)}</div><h3>${t}</h3><ul>${li.map((x) => `<li>${icon('check', 15)}${x}</li>`).join('')}</ul></div>`).join('')}</div></section>
    <section class="section container"><div class="band"><h2 style="color:#fff">Ready for your next ride?</h2><p style="opacity:.9;max-width:52ch;margin:0 auto 22px">Create a free account in under a minute and book your first seat.</p>
      <a class="btn btn-lg" href="#/register">Create your account</a></div></section>`;
  $$('[data-count]', view).forEach((el) => {
    const to = +el.dataset.count; const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1 && ctx.alive()) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
});
F.quickSearch = async (form, v) => {
  const q = new URLSearchParams(); if (v.from) q.set('from', v.from); if (v.to) q.set('to', v.to);
  go('/passenger/search' + (q.toString() ? '?' + q : ''));
};

route('/about', { shell: 'public', title: 'About' }, async (view) => {
  view.innerHTML = `<div class="container page-hero"><h1>About <span class="grad-text">CampusRide</span></h1><p>CampusRide is a role-based smart campus transportation booking and management system. It connects passengers, drivers, transport managers and administrators through one database-driven platform.</p></div>
    <div class="container section" style="padding-top:20px"><div class="grid g3">
      <div class="card"><h3>${icon('seat', 20)} Live seat availability</h3><p class="muted">Bookings are processed in database transactions with row locking, so a bus can never be overbooked and nobody can book the same ride twice.</p></div>
      <div class="card"><h3>${icon('route', 20)} Route matching</h3><p class="muted">Rides are matched against the ordered stops of each route — a bus from Campus to Uttara will not show up for an Uttara to Campus search.</p></div>
      <div class="card"><h3>${icon('bell', 20)} Notifications</h3><p class="muted">Booking confirmations, cancellations, schedule changes and delay alerts appear instantly in your in-app notification bell.</p></div>
      <div class="card"><h3>${icon('chart', 20)} Transport analytics</h3><p class="muted">Admins see popular routes, booking trends and vehicle utilisation, and can export CSV / JSON reports.</p></div>
      <div class="card"><h3>${icon('shield', 20)} Role-based security</h3><p class="muted">Every action is authorised on the server. Passwords are hashed, sessions are HTTP-only, forms are CSRF-protected and validated on both client and server.</p></div>
      <div class="card"><h3>${icon('cookie', 20)} Sessions & cookies</h3><p class="muted">PHP sessions keep you signed in; an optional “remember me” cookie uses a rotating, hashed token. Preference cookies only after you allow them.</p></div></div>
      <div class="card" style="margin-top:18px"><h3>Technology</h3><div class="chips" style="margin-top:8px">${['HTML5', 'CSS3', 'JavaScript (AJAX)', 'PHP 7.4+', 'MySQL / PDO', 'JSON API', 'Sessions & Cookies', 'Client + server validation'].map((t) => chip(t, 'primary')).join('')}</div></div></div>`;
});

route('/routes', { shell: 'public', title: 'Available Routes' }, async (view, ctx) => {
  const { routes } = await ctx.wait(api('routes_public'));
  view.innerHTML = `<div class="container page-hero"><h1>Available <span class="grad-text">routes</span></h1><p>All active campus routes with stops and typical travel times. Log in to see departures and book a seat.</p></div>
    <div class="container section" style="padding-top:18px">${routes.length ? `<div class="grid g2">${routes.map((r) => `<div class="card"><div class="row between"><h3 style="margin:0">${icon('route', 20)} ${esc(r.route_name)}</h3>${chip(plural(r.upcoming, 'upcoming ride'), r.upcoming ? 'success' : '')}</div>
      <p class="muted" style="margin:6px 0 4px">${esc(r.start_point)} → ${esc(r.destination)} · ${r.stops[r.stops.length - 1].minutes_from_start} min</p>
      <ol class="timeline">${r.stops.map((s, i) => `<li class="${i === 0 ? 'first' : ''} ${i === r.stops.length - 1 ? 'last' : ''}"><i></i><span class="tl-name">${esc(s.stop_name)}</span><span class="tl-time">+${s.minutes_from_start} min</span></li>`).join('')}</ol>
      <a class="btn btn-soft btn-sm" href="#/passenger/search?from=${encodeURIComponent(r.start_point)}&to=${encodeURIComponent(r.destination)}">Find rides on this route</a></div>`).join('')}</div>` : empty('route', 'No routes yet', 'The transport office has not published any routes.')}</div>`;
});

/* ---------------- auth ---------------- */
const demoBox = `<details class="demo-box" open><summary>Demo accounts <small class="muted">(if demo data was installed)</small></summary><p class="small muted" style="margin:8px 0">Click to fill. Password for demo users: <code>Demo@1234</code></p><div class="chips">
  ${[['passenger1@campusride.test', 'Passenger'], ['driver1@campusride.test', 'Driver'], ['manager@campusride.test', 'Manager']].map(([e, l]) => `<button type="button" class="chip pointer" data-act="fillDemo" data-e="${e}">${l}</button>`).join('')}</div></details>`;
A.fillDemo = (d, el) => { const f = el.closest('form'); f.elements.email.value = d.e; f.elements.password.value = 'Demo@1234'; };

route('/login', { shell: 'public', title: 'Log in', guestOnly: true }, async (view, ctx) => {
  const saved = Cookie.get('cr_email') || '';
  view.innerHTML = `<div class="container auth-wrap"><div class="card auth-card"><h2 style="margin-bottom:4px">Welcome back</h2><p class="muted">Log in to book or manage rides.</p>
    <form data-form="login" novalidate>
      <div class="form-error hide" role="alert"></div>
      ${fld({ name: 'email', label: 'Email', type: 'email', value: saved, ph: 'you@university.edu', ac: 'username', v: 'Email|required|email' })}
      ${fld({ name: 'password', label: 'Password', type: 'password', ac: 'current-password', v: 'Password|required' })}
      <label class="check"><input type="checkbox" name="remember" value="1"> Keep me signed in on this device (30 days)</label>
      <button class="btn btn-primary btn-block btn-lg" type="submit" style="margin-top:14px">Log in</button></form>
    <p class="center muted" style="margin:18px 0 0">New here? <a href="#/register">Create an account</a></p>
    ${ctx.query.demo ? demoBox : ''}</div></div>`;
  if (saved) $('input[name=password]', view)?.focus();
});
F.login = async (form, v) => {
  const next = new URLSearchParams((location.hash.split('?')[1]) || '').get('next');
  const r = await post('login', { email: v.email, password: v.password, remember: !!v.remember });
  State.user = r.user; Cookie.pref('cr_email', v.email);
  await refreshMe(); State.shell = null;
  toast(`Welcome back, ${r.user.name.split(' ')[0]}!`);
  go(next && next.startsWith('/') ? next : homeFor(r.user));
};

route('/register', { shell: 'public', title: 'Create account', guestOnly: true }, async (view) => {
  view.innerHTML = `<div class="container auth-wrap"><div class="card auth-card" style="width:min(100%,540px)"><h2 style="margin-bottom:4px">Create your account</h2><p class="muted">Join CampusRide in under a minute.</p>
    <form data-form="register" novalidate>
      <div class="form-error hide" role="alert"></div>
      <div class="label" style="margin-bottom:8px">I am a…</div>
      <div class="role-pick two"><input type="radio" name="role" id="r-p" value="passenger" checked><label for="r-p">${icon('user', 20)}<br>Passenger<small>Student or staff</small></label>
        <input type="radio" name="role" id="r-d" value="driver"><label for="r-d">${icon('bus', 20)}<br>Driver<small>Needs admin approval</small></label></div>
      <div style="height:14px"></div>
      ${fld({ name: 'name', label: 'Full name', ac: 'name', ph: 'Your full name', v: 'Full name|required|name' })}
      <div class="form-row">${fld({ name: 'email', label: 'Email', type: 'email', ac: 'email', ph: 'you@university.edu', v: 'Email|required|email|max:190', extra: 'data-on="checkEmail"' })}
      ${fld({ name: 'phone', label: 'Mobile number', type: 'tel', ac: 'tel', ph: '01712345678', v: 'Phone|required|phone' })}</div>
      <div class="form-row">${fld({ name: 'password', label: 'Password', type: 'password', ac: 'new-password', v: 'Password|required|password|max:100', extra: 'data-on="pwStrength"', hint: '8+ characters with letters and numbers' })}
      ${fld({ name: 'password2', label: 'Confirm password', type: 'password', ac: 'new-password', v: 'Confirm password|required|same:password' })}</div>
      <div class="strength" aria-hidden="true"><i id="pw-bar"></i></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit" style="margin-top:18px">Create account</button></form>
    <p class="center muted" style="margin:18px 0 0">Already registered? <a href="#/login">Log in</a></p></div></div>`;
});
I.pwStrength = (el) => {
  const v = el.value; let s = 0; if (v.length >= 8) s++; if (/[A-Za-z]/.test(v) && /\d/.test(v)) s++; if (v.length >= 12) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
  const bar = $('#pw-bar'); if (bar) { bar.style.width = `${(s / 4) * 100}%`; bar.style.background = ['var(--danger)', 'var(--danger)', 'var(--warn)', 'var(--info)', 'var(--accent)'][s]; }
};
const checkEmailNow = debounce(async (el) => {
  const form = el.form; if (!form || Validate.field(el, formObj(form))) return;
  const val = el.value.trim();
  try {
    const r = await api('check_email', { params: { email: val } });
    if (el.value.trim() !== val) return;
    setFieldError(form, 'email', r.available ? null : 'This email is already registered.');
    if (r.available) { const w = el.closest('.field'); w.classList.add('valid'); }
  } catch { /* ignore */ }
}, 500);
I.checkEmail = (el) => checkEmailNow(el);
F.register = async (form, v) => {
  const r = await post('register', { name: v.name, email: v.email, phone: v.phone, role: v.role, password: v.password, password2: v.password2 });
  if (r.pending) {
    $('.auth-card', $('#view')).innerHTML = `<div class="center"><div class="empty" style="padding:10px"><div class="ico">${icon('clock', 28)}</div><h3>Almost there!</h3><p>${esc(r.message)}</p></div><a class="btn btn-primary" href="#/login">Go to log in</a></div>`;
    return;
  }
  State.user = r.user; Cookie.pref('cr_email', v.email);
  await refreshMe(); State.shell = null; toast('Account created. Welcome aboard!'); go(homeFor(r.user));
};

route('/pending', { shell: 'app', title: 'Account approval', roles: ['driver'] }, async (view) => {
  const u = State.user;
  if (u.status !== 'pending') return go(homeFor(u));
  view.innerHTML = `<div class="card empty" style="max-width:560px;margin:40px auto"><div class="ico">${icon('clock', 28)}</div><h3>Waiting for admin approval</h3><p>Hi ${esc(u.name.split(' ')[0])}, your driver account has been created. An administrator must approve it before you can see assigned trips. You will get a notification as soon as it is approved.</p><button class="btn btn-soft" data-act="recheck">${icon('refresh', 16)} Check again</button></div>`;
});
A.recheck = async () => { await refreshMe(); if (State.user.status !== 'pending') { toast('Approved! Welcome.'); go(homeFor(State.user)); } else toast('Still pending approval.', 'error'); };

route('/404', { shell: 'shared', title: 'Not found' }, async (view) => {
  view.innerHTML = `<div class="container"><div class="card empty" style="margin-top:60px">${`<div class="ico">${icon('route', 28)}</div>`}<h3>Wrong stop!</h3><p>This page does not exist.</p><a class="btn btn-primary" href="#/">Back to start</a></div></div>`;
});
