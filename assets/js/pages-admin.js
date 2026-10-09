'use strict';
/* Admin pages */
const ROLE_A = ['admin'];

route('/admin/analytics', { shell: 'app', title: 'Analytics', roles: ROLE_A }, async (view, ctx) => {
  const a = await ctx.wait(api('analytics')); const t = a.totals;
  const dl = (type) => `<a class="btn btn-ghost btn-sm" href="api/index.php?action=admin_report&type=${type}&format=csv">${icon('download', 14)} ${titleCase(type)} CSV</a>`;
  view.innerHTML = `${pageHead('System analytics', 'Booking trends, popular routes and vehicle utilisation.')}
    <div class="grid g4" style="margin-bottom:18px">${statTile('Registered users', t.users, 'users')}${statTile('Confirmed bookings', t.bookings, 'seat', 'green')}${statTile('Total rides', t.rides, 'bus', 'blue')}${statTile('Average rating', t.avg_rating ?? '—', 'star', 'amber')}</div>
    ${t.pending_drivers || t.open_complaints ? `<div class="grid g2" style="margin-bottom:18px">${t.pending_drivers ? `<a class="alert warn linkcard" href="#/admin/users?status=pending">${icon('user', 20)}<span><b>${plural(t.pending_drivers, 'driver')}</b> waiting for approval</span></a>` : ''}${t.open_complaints ? `<a class="alert danger linkcard" href="#/admin/complaints">${icon('flag', 20)}<span><b>${plural(t.open_complaints, 'complaint')}</b> need attention</span></a>` : ''}</div>` : ''}
    <div class="split"><div class="card"><div class="card-title"><h3>Bookings per day (last 14 days)</h3></div>${barChart(a.trend.map((x) => ({ label: x.date.slice(5), value: x.count })))}</div>
      <div class="card"><div class="card-title"><h3>Popular routes</h3></div>${a.popular_routes.length ? hbars(a.popular_routes.map((r) => ({ label: r.route_name, value: +r.bookings }))) : '<p class="muted">No bookings yet.</p>'}</div></div>
    <div class="grid g3" style="margin-top:18px"><div class="card"><div class="card-title"><h3>Rides by status</h3></div>${donut([{ label: 'Scheduled', value: a.ride_status.scheduled, color: '#1769e0' }, { label: 'In progress', value: a.ride_status.in_progress, color: '#f59e0b' }, { label: 'Completed', value: a.ride_status.completed, color: '#12a36b' }, { label: 'Cancelled', value: a.ride_status.cancelled, color: '#e0394f' }])}</div>
      <div class="card"><div class="card-title"><h3>Users by role</h3></div>${donut(Object.entries(a.roles).map(([k, v], i) => ({ label: titleCase(k), value: v, color: PALETTE[i] })))}</div>
      <div class="card"><div class="card-title"><h3>Top drivers</h3></div>${a.top_drivers.length ? a.top_drivers.map((d) => `<div class="mini-row">${avatar(d.name, 34)}<div style="flex:1"><b class="small">${esc(d.name)}</b><div class="muted small">${d.reviews} reviews</div></div>${stars(+d.rating)} <b>${d.rating}</b></div>`).join('') : '<p class="muted">No reviews yet.</p>'}</div></div>
    <div class="card" style="margin-top:18px"><div class="card-title"><h3>Vehicle utilisation</h3><span class="muted small">booked seats ÷ total seats across non-cancelled rides</span></div>${hbars(a.utilization.map((v) => ({ label: `${v.vehicle_number} (${v.rides} rides)`, value: +v.utilization })), { suffix: '%', max: 100 })}</div>
    <div class="card" style="margin-top:18px"><div class="card-title"><h3>Reports</h3></div><div class="row">${['bookings', 'users', 'schedules', 'audit'].map(dl).join('')}<a class="btn btn-soft btn-sm" href="api/index.php?action=admin_report&type=bookings&format=json" target="_blank" rel="noopener">${icon('eye', 14)} View JSON</a></div></div>`;
});

/* ---------------- users ---------------- */
const userRow = (u) => `<tr><td><div class="cell-user">${avatar(u.name, 38)}<div><b>${esc(u.name)}</b><span>${esc(u.email)}</span></div></div></td><td>${roleChip(u.role)}</td><td>${statusChip(u.status)}</td><td>${esc(u.phone || '—')}</td><td>${u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</td>
  <td class="right">${u.status === 'pending' ? `<button class="btn btn-success btn-sm" data-act="setStatus" data-id="${u.user_id}" data-s="active">${icon('check', 15)} Approve</button>` : ''}
  ${u.status === 'active' && u.user_id !== State.user.id ? `<button class="btn btn-danger btn-sm" data-act="setStatus" data-id="${u.user_id}" data-s="suspended" data-n="${esc(u.name)}">Suspend</button>` : ''}
  ${u.status === 'suspended' ? `<button class="btn btn-soft btn-sm" data-act="setStatus" data-id="${u.user_id}" data-s="active">Reactivate</button>` : ''}</td></tr>`;
route('/admin/users', { shell: 'app', title: 'User Management', roles: ROLE_A }, async (view, ctx) => {
  const q = ctx.query;
  const r = await ctx.wait(api('admin_users', { params: { role: q.role, status: q.status, q: q.q } }));
  view.innerHTML = `${pageHead('User management', 'Approve driver accounts, suspend accounts and create staff users.', `<button class="btn btn-primary" data-act="newUser">${icon('plus', 16)} Add user</button>`)}
    ${r.pending && q.status !== 'pending' ? `<a class="alert warn linkcard" style="margin-bottom:14px" href="#/admin/users?status=pending">${icon('user', 20)}<span><b>${plural(r.pending, 'account')}</b> waiting for approval — review now</span></a>` : ''}
    <form class="card filters users-f" data-form="userFilter" novalidate><div class="field wide"><label for="f-q">Search</label><input id="f-q" name="q" value="${esc(q.q || '')}" placeholder="Name or email" data-v="Search|max:60"></div>
      ${fld({ name: 'role', label: 'Role', type: 'select', value: q.role || '', options: [['', 'All roles'], ['passenger', 'Passenger'], ['driver', 'Driver'], ['manager', 'Manager'], ['admin', 'Admin']] })}
      ${fld({ name: 'status', label: 'Status', type: 'select', value: q.status || '', options: [['', 'Any status'], ['active', 'Active'], ['pending', 'Pending'], ['suspended', 'Suspended']] })}
      <div class="filter-btns"><button class="btn btn-primary" type="submit">Filter</button></div></form>
    <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Phone</th><th>Last login</th><th></th></tr></thead><tbody>${r.users.map(userRow).join('') || '<tr><td colspan="6" class="center muted">No users found.</td></tr>'}</tbody></table></div>`;
});
F.userFilter = async (form, v) => { const p = new URLSearchParams(); ['q', 'role', 'status'].forEach((k) => v[k] && p.set(k, v[k])); const t = '#/admin/users' + (p.toString() ? '?' + p : ''); if (location.hash === t) refresh(); else location.hash = t; };
A.setStatus = async (d) => {
  if (d.s === 'suspended' && !(await confirmBox({ title: `Suspend ${d.n}?`, text: 'They will be logged out and cannot sign in until reactivated.', ok: 'Suspend', danger: true }))) return;
  await post('user_status', { user_id: +d.id, status: d.s }); toast(d.s === 'active' ? 'Account active.' : 'Account suspended.'); refresh();
};
A.newUser = () => openModal({ title: 'Add user', body: `<form data-form="newUser" novalidate>
  ${fld({ name: 'name', label: 'Full name', v: 'Full name|required|name' })}${fld({ name: 'email', label: 'Email', type: 'email', v: 'Email|required|email|max:190' })}
  <div class="form-row">${fld({ name: 'phone', label: 'Mobile', v: 'Phone|required|phone', ph: '01712345678' })}${fld({ name: 'role', label: 'Role', type: 'select', value: 'manager', options: [['manager', 'Transport Manager'], ['driver', 'Driver'], ['passenger', 'Passenger'], ['admin', 'Admin']], v: 'Role|required|in:passenger,driver,manager,admin' })}</div>
  ${fld({ name: 'password', label: 'Temporary password', type: 'password', ac: 'new-password', v: 'Password|required|password|max:100', hint: '8+ characters with letters and numbers' })}
  <div class="form-error hide" role="alert"></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">Create user</button></div></form>` });
F.newUser = async (form, v) => { await post('user_create', v); closeModal(); toast('User created.'); refresh(); };

route('/admin/roles', { shell: 'app', title: 'Role Management', roles: ROLE_A }, async (view, ctx) => {
  const r = await ctx.wait(api('admin_users', { params: { status: ctx.query.status === 'all' ? '' : 'active', role: ctx.query.role } }));
  const role = ctx.query.role || '';
  view.innerHTML = `${pageHead('Role management', 'Promote or change what each account is allowed to do. Role checks are enforced on the server.')}
    <div style="margin-bottom:12px">${segTabs([['', 'All'], ['passenger', 'Passengers'], ['driver', 'Drivers'], ['manager', 'Managers'], ['admin', 'Admins']], role, 'roleTab')}</div>
    <div class="table-wrap"><table><thead><tr><th>User</th><th>Current role</th><th>Change role</th></tr></thead><tbody>
    ${r.users.map((u) => `<tr><td><div class="cell-user">${avatar(u.name, 38)}<div><b>${esc(u.name)}</b><span>${esc(u.email)}</span></div></div></td><td>${roleChip(u.role)}</td>
      <td>${u.user_id === State.user.id ? '<span class="muted small">That is you</span>' : `<select data-change="changeRole" data-id="${u.user_id}" data-cur="${u.role}" aria-label="Role for ${esc(u.name)}">${['passenger', 'driver', 'manager', 'admin'].map((x) => `<option value="${x}" ${x === u.role ? 'selected' : ''}>${titleCase(x)}</option>`).join('')}</select>`}</td></tr>`).join('') || '<tr><td colspan="3" class="center muted">No users.</td></tr>'}</tbody></table></div>`;
});
A.roleTab = (d) => go('/admin/roles' + (d.k ? '?role=' + d.k : ''));
I.changeRole = async (el) => {
  const ok = await confirmBox({ title: 'Change role?', text: `Change this account to <b>${titleCase(el.value)}</b>? Their permissions change immediately.`, ok: 'Change role' });
  if (!ok) { el.value = el.dataset.cur; return; }
  try { await post('user_role', { user_id: +el.dataset.id, role: el.value }); toast('Role updated.'); refresh(); } catch (e) { el.value = el.dataset.cur; toast(e.message, 'error'); }
};

/* ---------------- complaints ---------------- */
route('/admin/complaints', { shell: 'app', title: 'Complaints', roles: ROLE_A }, async (view, ctx) => {
  const st = ctx.query.status || '';
  const { complaints } = await ctx.wait(api('admin_complaints', { params: { status: st } }));
  State.complaints = complaints;
  view.innerHTML = `${pageHead('Complaints', 'Review issues reported by passengers and respond.')}
    <div style="margin-bottom:12px">${segTabs([['', 'All'], ['open', 'Open'], ['in_review', 'In review'], ['resolved', 'Resolved']], st, 'cmpTab')}</div>
    <div class="list">${complaints.map((c) => `<div class="card"><div class="row between"><div class="row"><b>${esc(c.subject)}</b>${statusChip(c.status)}</div><span class="muted small">${timeAgo(c.created_at)}</span></div>
      <p style="margin:8px 0">${esc(c.description)}</p><div class="muted small">By ${esc(c.user_name)} (${esc(c.user_role)}) · ${esc(c.user_email)}${c.route_name ? ` · Ride: ${esc(c.route_name)}` : ''}</div>
      ${c.admin_response ? `<div class="alert info" style="margin-top:10px">${icon('info', 18)}<span><b>Response:</b> ${esc(c.admin_response)}</span></div>` : ''}
      <div style="margin-top:12px"><button class="btn btn-soft btn-sm" data-act="respond" data-id="${c.complaint_id}">${icon('edit', 15)} ${c.status === 'resolved' ? 'Edit response' : 'Respond'}</button></div></div>`).join('') || empty('flag', 'No complaints', 'Nothing to review here.')}</div>`;
});
A.cmpTab = (d) => go('/admin/complaints' + (d.k ? '?status=' + d.k : ''));
A.respond = (d) => {
  const c = State.complaints.find((x) => x.complaint_id === +d.id);
  openModal({ title: 'Respond to complaint', body: `<p class="muted"><b>${esc(c.subject)}</b><br>${esc(c.description)}</p><form data-form="respond" novalidate><input type="hidden" name="complaint_id" value="${c.complaint_id}">
    ${fld({ name: 'status', label: 'Status', type: 'select', value: c.status === 'open' ? 'in_review' : c.status, options: [['open', 'Open'], ['in_review', 'In review'], ['resolved', 'Resolved']], v: 'Status|required|in:open,in_review,resolved' })}
    ${fld({ name: 'admin_response', label: 'Response to the user', type: 'textarea', rows: 4, value: c.admin_response || '', v: 'Response|max:1000', hint: 'Required when resolving' })}
    <div class="form-error hide" role="alert"></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>` });
};
F.respond = async (form, v) => {
  if (v.status === 'resolved' && !v.admin_response.trim()) { showErrors(form, { admin_response: 'Write a response before resolving.' }); return; }
  await post('complaint_update', { complaint_id: +v.complaint_id, status: v.status, admin_response: v.admin_response }); closeModal(); toast('Complaint updated.'); refresh();
};

/* ---------------- audit ---------------- */
route('/admin/audit', { shell: 'app', title: 'Audit Logs', roles: ROLE_A }, async (view, ctx) => {
  const q = ctx.query; const page = +q.page || 1;
  const r = await ctx.wait(api('admin_audit', { params: { page, action_filter: q.a, q: q.q } }));
  const pages = Math.max(1, Math.ceil(r.total / r.per));
  const link = (p) => '#/admin/audit?' + new URLSearchParams({ ...(q.a ? { a: q.a } : {}), ...(q.q ? { q: q.q } : {}), page: p });
  view.innerHTML = `${pageHead('Audit logs', 'Every important action — who did what, when and from where.', `<a class="btn btn-ghost" href="api/index.php?action=admin_report&type=audit&format=csv">${icon('download', 16)} Export CSV</a>`)}
    <form class="card filters users-f" data-form="auditFilter" novalidate><div class="field wide"><label for="f-q">Search</label><input id="f-q" name="q" value="${esc(q.q || '')}" placeholder="User, action or details" data-v="Search|max:60"></div>
      ${fld({ name: 'a', label: 'Action', type: 'select', value: q.a || '', options: [['', 'All actions'], ...r.actions.map((x) => [x, x])] })}<div class="filter-btns"><button class="btn btn-primary" type="submit">Filter</button></div></form>
    <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody>
    ${r.logs.map((l) => `<tr><td class="nowrap">${fmtDT(l.created_at)}</td><td>${l.user_name ? `${esc(l.user_name)} <span class="muted small">${esc(l.user_role)}</span>` : '<span class="muted">system</span>'}</td><td><code>${esc(l.action)}</code></td><td>${esc(l.entity)}${l.entity_id ? ' #' + l.entity_id : ''} ${esc(l.details)}</td><td class="muted small">${esc(l.ip)}</td></tr>`).join('') || '<tr><td colspan="5" class="center muted">No log entries.</td></tr>'}</tbody></table></div>
    <div class="row between" style="margin-top:14px"><span class="muted small">${plural(r.total, 'entry')} · page ${page} of ${pages}</span><div class="row">${page > 1 ? `<a class="btn btn-ghost btn-sm" href="${link(page - 1)}">${icon('left', 14)} Newer</a>` : ''}${page < pages ? `<a class="btn btn-ghost btn-sm" href="${link(page + 1)}">Older ${icon('right', 14)}</a>` : ''}</div></div>`;
});
F.auditFilter = async (form, v) => { const p = new URLSearchParams(); if (v.q) p.set('q', v.q); if (v.a) p.set('a', v.a); const t = '#/admin/audit' + (p.toString() ? '?' + p : ''); if (location.hash === t) refresh(); else location.hash = t; };
