'use strict';
/* Driver pages */
const ROLE_D = ['driver'];

const tripCard = (t, { actions = true } = {}) => {
  const dep = parseDT(t.departure_time);
  const fill = t.capacity ? Math.round(100 * t.booked / t.capacity) : 0;
  return `<article class="card ride">
    <div class="ride-when"><b>${fmtClock(dep)}</b><span>${relDay(t.departure_time)}</span></div>
    <div class="ride-main"><h4>${esc(t.route_name)} ${statusChip(t.status)} ${t.delay_minutes > 0 && ['scheduled', 'in_progress'].includes(t.status) ? chip(`${t.delay_minutes} min late`, 'warn') : ''}</h4>
      <div class="ride-route">${esc(t.start_point)} <span class="arrow">${icon('arrow', 14)}</span> ${esc(t.destination)}</div>
      <div class="ride-meta"><span>${icon('clock', 14)} ${t.duration_min} min</span><span>${icon('bus', 14)} ${esc(t.vehicle_type)} ${esc(t.vehicle_number)}</span>${t.avg_rating ? `<span>${icon('star', 14)} ${t.avg_rating}</span>` : ''}</div>
      <div class="fillbar"><div class="progress"><i style="width:${fill}%"></i></div><small>${t.booked} / ${t.capacity} passengers</small></div></div>
    <div class="ride-act">${actions && ['scheduled', 'in_progress'].includes(t.status) ? `
      <a class="btn btn-soft btn-sm" href="#/driver/passengers?id=${t.schedule_id}">${icon('users', 15)} Passengers</a>
      ${t.status === 'scheduled' ? `<button class="btn btn-primary btn-sm" data-act="tripStatus" data-id="${t.schedule_id}" data-s="in_progress">${icon('zap', 15)} Start ride</button>` : `<button class="btn btn-success btn-sm" data-act="tripStatus" data-id="${t.schedule_id}" data-s="completed">${icon('check', 15)} Complete</button>`}
      <a class="btn btn-ghost btn-sm" href="#/driver/reports?trip=${t.schedule_id}">${icon('alert', 15)} Report</a>` : ''}</div></article>`;
};
A.tripStatus = async (d) => {
  const start = d.s === 'in_progress';
  if (!(await confirmBox({ title: start ? 'Start this ride?' : 'Complete this ride?', text: start ? 'Passengers will be notified that the ride has started.' : 'Passengers will be notified and can rate the trip.', ok: start ? 'Start ride' : 'Mark completed' }))) return;
  await post('trip_status', { schedule_id: +d.id, status: d.s }); toast(start ? 'Ride started. Drive safe!' : 'Ride completed. Great job!'); refresh();
};

route('/driver/trips', { shell: 'app', title: 'Assigned Trips', roles: ROLE_D }, async (view, ctx) => {
  const { trips, summary } = await ctx.wait(api('driver_trips'));
  const tab = ctx.query.tab === 'previous' ? 'previous' : 'current';
  const cur = trips.filter((t) => t.bucket === 'current').sort((a, b) => (a.departure_time < b.departure_time ? -1 : 1));
  const prev = trips.filter((t) => t.bucket === 'previous');
  const list = tab === 'current' ? cur : prev;
  view.innerHTML = `${pageHead('Your trips', 'Routes and departures assigned to you by the transport manager.')}
    <div class="grid g4" style="margin-bottom:18px">${statTile('Upcoming trips', summary.upcoming, 'route')}${statTile('Completed trips', summary.completed, 'check2', 'green')}${statTile('Average rating', summary.rating ?? '—', 'star', 'amber')}${statTile('Reviews received', summary.reviews, 'users', 'blue')}</div>
    <div class="row between" style="margin-bottom:12px">${segTabs([['current', 'Upcoming', cur.length], ['previous', 'Previous trips', prev.length]], tab, 'driverTab')}</div>
    <div class="list">${list.length ? list.map((t) => tripCard(t)).join('') : empty('route', tab === 'current' ? 'No upcoming trips' : 'No previous trips', tab === 'current' ? 'Your manager has not assigned any trips yet.' : 'Completed and cancelled trips appear here.')}</div>`;
});
A.driverTab = (d) => go('/driver/trips?tab=' + d.k);

route('/driver/passengers', { shell: 'app', title: 'Passenger List', roles: ROLE_D }, async (view, ctx) => {
  const { trips } = await ctx.wait(api('driver_trips'));
  const cur = trips.filter((t) => t.bucket === 'current').sort((a, b) => (a.departure_time < b.departure_time ? -1 : 1));
  const id = +ctx.query.id || (cur[0] && cur[0].schedule_id);
  if (!cur.length) { view.innerHTML = pageHead('Passenger list') + empty('users', 'No active trips', 'Passenger lists are shown for your upcoming trips.'); return; }
  const r = await ctx.wait(api('trip_passengers', { params: { id } }));
  const groups = {};
  r.passengers.forEach((p) => { (groups[p.pickup_name] = groups[p.pickup_name] || []).push(p); });
  view.innerHTML = `${pageHead('Passenger list', 'Confirmed passengers grouped by pickup stop.', `<button class="btn btn-ghost" data-act="printPage">${icon('download', 16)} Print</button>`)}
    <div class="card" style="margin-bottom:18px"><div class="field" style="margin:0"><label for="f-trip">Trip</label><select id="f-trip" data-change="pickTrip">${cur.map((t) => `<option value="${t.schedule_id}" ${t.schedule_id === id ? 'selected' : ''}>${fmtDT(t.departure_time)} — ${esc(t.route_name)} (${t.booked} booked)</option>`).join('')}</select></div></div>
    <div class="card"><div class="card-title"><h3>${esc(r.trip.route_name)} · ${plural(r.passengers.length, 'passenger')}</h3>${statusChip(r.trip.status)}</div>
    ${r.passengers.length ? Object.entries(groups).map(([stop, ps]) => `<div class="stop-group"><div class="sg-head">${icon('pin', 15)} ${esc(stop)} <span class="chip">${ps.length}</span></div>${ps.map((p) => `<div class="mini-row">${avatar(p.name, 36)}<div style="flex:1"><b>${esc(p.name)}</b><div class="muted small">Booked ${timeAgo(p.booking_time)}</div></div>${p.phone ? `<a class="chip primary" href="tel:${esc(p.phone)}">${icon('phone', 13)} ${esc(p.phone)}</a>` : ''}</div>`).join('')}</div>`).join('') : '<p class="muted">No confirmed bookings yet.</p>'}</div>`;
});
I.pickTrip = (el) => go('/driver/passengers?id=' + el.value);
A.printPage = () => window.print();

route('/driver/status', { shell: 'app', title: 'Ride Status', roles: ROLE_D }, async (view, ctx) => {
  const { trips } = await ctx.wait(api('driver_trips'));
  const cur = trips.filter((t) => t.bucket === 'current').sort((a, b) => (a.departure_time < b.departure_time ? -1 : 1));
  const steps = ['scheduled', 'in_progress', 'completed'];
  view.innerHTML = `${pageHead('Update ride status', 'Move a trip through Scheduled → In progress → Completed. Passengers are notified at each step.')}
    <div class="list">${cur.length ? cur.map((t) => `<div class="card"><div class="row between"><div><h3 style="margin:0">${esc(t.route_name)}</h3><div class="muted small">${fmtDT(t.departure_time)} · ${t.booked} passengers</div></div>
      <div>${t.status === 'scheduled' ? `<button class="btn btn-primary" data-act="tripStatus" data-id="${t.schedule_id}" data-s="in_progress">${icon('zap', 16)} Start ride</button>` : `<button class="btn btn-success" data-act="tripStatus" data-id="${t.schedule_id}" data-s="completed">${icon('check', 16)} Complete ride</button>`}</div></div>
      <ol class="stepper">${steps.map((s, i) => `<li class="${i < steps.indexOf(t.status) ? 'done' : i === steps.indexOf(t.status) ? 'now' : ''}"><i>${i < steps.indexOf(t.status) ? '✓' : i + 1}</i><span>${titleCase(s)}</span></li>`).join('')}</ol></div>`).join('') : empty('zap', 'Nothing to update', 'You have no scheduled or running trips.')}</div>`;
});

route('/driver/reports', { shell: 'app', title: 'Delay Reports', roles: ROLE_D }, async (view, ctx) => {
  const [{ trips }, { reports }] = await ctx.wait(Promise.all([api('driver_trips'), api('delay_reports')]));
  const cur = trips.filter((t) => t.bucket === 'current').sort((a, b) => (a.departure_time < b.departure_time ? -1 : 1));
  view.innerHTML = `${pageHead('Delays & vehicle problems', 'Report an issue — affected passengers and managers are notified immediately.')}
    <div class="split"><div class="card"><div class="card-title"><h3>Previous reports</h3></div>${reports.length ? reports.map((r) => `<div class="review"><div class="row between"><b>${esc(r.route_name)}</b>${r.report_type === 'delay' ? chip(`${r.delay_minutes} min delay`, 'warn') : chip('Vehicle problem', 'danger')}</div><p style="margin:6px 0">${esc(r.message)}</p><div class="muted small">${fmtDT(r.departure_time)} trip · reported ${timeAgo(r.created_at)}</div></div>`).join('') : '<p class="muted">No reports yet.</p>'}</div>
    ${cur.length ? `<form class="card" data-form="delayReport" novalidate><div class="card-title"><h3>New report</h3></div>
      ${fld({ name: 'schedule_id', label: 'Trip', type: 'select', value: ctx.query.trip || '', options: cur.map((t) => [t.schedule_id, `${fmtDT(t.departure_time)} — ${t.route_name}`]), v: 'Trip|required|int' })}
      ${fld({ name: 'report_type', label: 'Type', type: 'select', options: [['delay', 'Delay'], ['vehicle_problem', 'Vehicle problem']], v: 'Report type|required|in:delay,vehicle_problem', extra: 'data-change="reportType"' })}
      ${fld({ name: 'delay_minutes', label: 'Delay (minutes)', type: 'number', value: '10', v: 'Delay (minutes)|int|between:0,600', extra: 'min="0" max="600"', cls: 'delay-field' })}
      ${fld({ name: 'message', label: 'Details', type: 'textarea', rows: 3, v: 'Message|required|min:5|max:300', ph: 'What is happening?' })}
      <div class="form-error hide" role="alert"></div><button class="btn btn-primary btn-block" type="submit">Send report</button></form>` : `<div class="card">${empty('alert', 'No active trips', 'You can report on trips that are scheduled or in progress.')}</div>`}</div>`;
});
I.reportType = (el) => { $('.delay-field', el.form)?.classList.toggle('hide', el.value !== 'delay'); };
F.delayReport = async (form, v) => {
  if (v.report_type === 'delay' && (+v.delay_minutes < 1)) { showErrors(form, { delay_minutes: 'Delay (minutes) must be between 1 and 600.' }); return; }
  await post('delay_report', { schedule_id: +v.schedule_id, report_type: v.report_type, delay_minutes: +v.delay_minutes || 0, message: v.message });
  toast('Report sent. Passengers have been notified.'); refresh();
};
