'use strict';
/* Transport manager pages */
const ROLE_M = ['manager', 'admin'];
const Mgr = { routes: [], vehicles: [], drivers: [], schedules: [] };

/* ---------------- booking overview ---------------- */
route('/manager/overview', { shell: 'app', title: 'Booking Overview', roles: ROLE_M }, async (view, ctx) => {
  const o = await ctx.wait(api('manager_overview'));
  const t = o.totals;
  view.innerHTML = `${pageHead('Booking overview', 'Reservations, delays, cancellations and vehicle availability at a glance.', `<a class="btn btn-primary" href="#/manager/schedules">${icon('plus', 16)} Publish schedule</a>`)}
    <div class="grid g4" style="margin-bottom:18px">${statTile('Confirmed seats (upcoming)', t.confirmed, 'seat')}${statTile('Upcoming rides', t.rides, 'calendar', 'blue')}${statTile('Active routes', t.routes, 'route', 'green')}${statTile('Active drivers', t.drivers, 'user', 'amber')}</div>
    <div class="split"><div class="card"><div class="card-title"><h3>Upcoming rides & reservations</h3></div><div class="table-wrap flat"><table><thead><tr><th>Departure</th><th>Route</th><th>Driver / vehicle</th><th>Seats</th><th></th></tr></thead><tbody>
      ${o.upcoming.map((s) => `<tr><td><b>${fmtClock(parseDT(s.departure_time))}</b><div class="muted small">${relDay(s.departure_time)}</div></td><td>${esc(s.route_name)} ${statusChip(s.status)} ${delayChip(s)}</td><td>${esc(s.driver_name)}<div class="muted small">${esc(s.vehicle_number)}</div></td>
      <td style="min-width:120px"><div class="progress"><i style="width:${Math.round(100 * s.booked / s.capacity)}%"></i></div><small>${s.booked}/${s.capacity}</small></td><td><button class="btn btn-ghost btn-sm" data-act="schedPassengers" data-id="${s.schedule_id}">View</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted center">No upcoming rides.</td></tr>'}</tbody></table></div></div>
    <div class="stack"><div class="card"><div class="card-title"><h3>Vehicle availability</h3></div>${donut([{ label: 'Available', value: o.vehicles.available, color: '#12a36b' }, { label: 'Maintenance', value: o.vehicles.maintenance, color: '#f59e0b' }, { label: 'Retired', value: o.vehicles.retired, color: '#94a3b8' }], 130)}</div>
    <div class="card"><div class="card-title"><h3>Delays & issues (7 days)</h3></div>${o.alerts.length ? o.alerts.map((a) => `<div class="mini-row"><span class="n-ic ${a.report_type === 'delay' ? 't-delay' : 't-vehicle'}">${icon(a.report_type === 'delay' ? 'clock' : 'wrench', 16)}</span><div style="flex:1"><b class="small">${esc(a.route_name)}</b> ${a.report_type === 'delay' ? chip(a.delay_minutes + ' min', 'warn') : chip('Vehicle', 'danger')}<div class="muted small">${esc(a.message)} — ${esc(a.driver_name)}, ${timeAgo(a.created_at)}</div></div></div>`).join('') : '<p class="muted">Nothing reported.</p>'}</div>
    <div class="card"><div class="card-title"><h3>Cancelled rides (7 days)</h3></div>${o.cancelled.length ? o.cancelled.map((c) => `<div class="mini-row"><div style="flex:1"><b class="small">${esc(c.route_name)}</b><div class="muted small">${fmtDT(c.departure_time)} · ${esc(c.cancel_reason || '')}</div></div></div>`).join('') : '<p class="muted">No cancellations.</p>'}</div></div></div>`;
});
A.schedPassengers = async (d) => {
  const r = await api('schedule_bookings', { params: { id: d.id } });
  const conf = r.bookings.filter((b) => b.booking_status === 'confirmed'); const can = r.bookings.filter((b) => b.booking_status !== 'confirmed');
  openModal({ title: `Passengers (${conf.length})`, wide: true, body: `${conf.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Pickup</th><th>Booked</th></tr></thead><tbody>${conf.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.phone || b.email)}</td><td>${esc(b.pickup_name)}</td><td>${timeAgo(b.booking_time)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No confirmed bookings.</p>'}${can.length ? `<p class="muted small" style="margin-top:12px">${plural(can.length, 'cancelled booking')} not shown.</p>` : ''}` });
};

/* ---------------- routes ---------------- */
route('/manager/routes', { shell: 'app', title: 'Routes', roles: ROLE_M }, async (view, ctx) => {
  const { routes } = await ctx.wait(api('manager_routes')); Mgr.routes = routes;
  view.innerHTML = `${pageHead('Routes & stops', 'Define routes with ordered pickup points. Passengers are matched against the stop order.', `<button class="btn btn-primary" data-act="editRoute" data-id="0">${icon('plus', 16)} New route</button>`)}
    <div class="grid g2">${routes.map((r) => `<div class="card ${r.is_active ? '' : 'dim'}"><div class="row between"><h3 style="margin:0">${esc(r.route_name)}</h3>${r.is_active ? chip('Active', 'success') : chip('Inactive')}</div>
      <p class="muted small" style="margin:4px 0 0">${esc(r.start_point)} → ${esc(r.destination)} · ${r.stops[r.stops.length - 1].minutes_from_start} min · ${plural(r.schedules, 'schedule')}</p>
      <ol class="timeline">${r.stops.map((s, i) => `<li class="${i === 0 ? 'first' : ''} ${i === r.stops.length - 1 ? 'last' : ''}"><i></i><span class="tl-name">${esc(s.stop_name)}</span><span class="tl-time">+${s.minutes_from_start}m</span></li>`).join('')}</ol>
      <div class="row"><button class="btn btn-soft btn-sm" data-act="editRoute" data-id="${r.route_id}">${icon('edit', 15)} Edit</button><button class="btn btn-danger btn-sm" data-act="delRoute" data-id="${r.route_id}">${icon('trash', 15)} Delete</button></div></div>`).join('') || empty('route', 'No routes yet', 'Create your first route.')}</div>`;
});
const RouteEdit = { stops: [] };
const stopRows = () => RouteEdit.stops.map((s, i) => `<div class="stop-row"><span class="sr-n">${i + 1}</span>
  <div class="field"><input name="sn${i}" value="${esc(s.stop_name)}" placeholder="Stop name" aria-label="Stop ${i + 1} name" data-v="Stop name|required|min:2|max:100"></div>
  <div class="field"><input name="sm${i}" type="number" min="0" max="600" value="${i === 0 ? 0 : esc(s.minutes_from_start)}" ${i === 0 ? 'readonly' : ''} aria-label="Minutes from start" data-v="Minutes|required|int|between:0,600"></div>
  <button type="button" class="btn-icon" data-act="rmStop" data-i="${i}" aria-label="Remove stop" ${RouteEdit.stops.length <= 2 ? 'disabled' : ''}>${icon('x', 16)}</button></div>`).join('');
function syncStops(form) { RouteEdit.stops = RouteEdit.stops.map((s, i) => ({ ...s, stop_name: form.elements['sn' + i]?.value ?? s.stop_name, minutes_from_start: form.elements['sm' + i]?.value ?? s.minutes_from_start })); }
A.editRoute = (d) => {
  const r = +d.id ? Mgr.routes.find((x) => x.route_id === +d.id) : null;
  RouteEdit.stops = r ? r.stops.map((s) => ({ ...s })) : [{ stop_id: 0, stop_name: '', minutes_from_start: 0 }, { stop_id: 0, stop_name: '', minutes_from_start: 20 }];
  openModal({ title: r ? 'Edit route' : 'New route', wide: true, body: `<form data-form="route" novalidate><input type="hidden" name="route_id" value="${r ? r.route_id : 0}">
    ${fld({ name: 'route_name', label: 'Route name', value: r ? r.route_name : '', ph: 'e.g. Uttara to Campus', v: 'Route name|required|min:3|max:100' })}
    ${fld({ name: 'is_active', label: 'Status', type: 'select', value: r ? r.is_active : 1, options: [['1', 'Active — visible to passengers'], ['0', 'Inactive — hidden']], v: 'Status|in:0,1' })}
    <div class="label" style="margin:4px 0 6px">Stops in order <span class="muted small">(first = start, last = destination; minutes counted from the start)</span></div>
    <div class="field" style="margin:0"><input type="hidden" name="stops"></div><div id="stop-rows">${stopRows()}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-act="addStop">${icon('plus', 15)} Add stop</button>
    <div class="form-error hide" role="alert"></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">Save route</button></div></form>` });
};
A.addStop = (d, el) => { const f = el.closest('form'); syncStops(f); const last = RouteEdit.stops[RouteEdit.stops.length - 1]; RouteEdit.stops.push({ stop_id: 0, stop_name: '', minutes_from_start: Math.min(600, (+last.minutes_from_start || 0) + 10) }); $('#stop-rows').innerHTML = stopRows(); f.elements['sn' + (RouteEdit.stops.length - 1)].focus(); };
A.rmStop = (d, el) => { const f = el.closest('form'); syncStops(f); RouteEdit.stops.splice(+d.i, 1); $('#stop-rows').innerHTML = stopRows(); };
F.route = async (form, v) => {
  const stops = RouteEdit.stops.map((s, i) => ({ stop_id: s.stop_id, stop_name: v['sn' + i], minutes_from_start: i === 0 ? 0 : v['sm' + i] }));
  for (let i = 1; i < stops.length; i++) if (+stops[i].minutes_from_start < +stops[i - 1].minutes_from_start) { showErrors(form, { stops: `Stop ${i + 1}: minutes must not decrease along the route.` }); return; }
  if (new Set(stops.map((s) => s.stop_name.trim().toLowerCase())).size !== stops.length) { showErrors(form, { stops: 'Stop names must be unique within a route.' }); return; }
  await post('route_save', { route_id: +v.route_id, route_name: v.route_name, is_active: v.is_active, stops });
  closeModal(); toast('Route saved.'); refresh();
};
A.delRoute = async (d) => {
  if (!(await confirmBox({ title: 'Delete route?', text: 'This cannot be undone. Routes with schedules can only be deactivated.', ok: 'Delete', danger: true }))) return;
  await post('route_delete', { route_id: +d.id }); toast('Route deleted.'); refresh();
};

/* ---------------- vehicles ---------------- */
route('/manager/vehicles', { shell: 'app', title: 'Vehicles', roles: ROLE_M }, async (view, ctx) => {
  const { vehicles } = await ctx.wait(api('vehicles')); Mgr.vehicles = vehicles;
  view.innerHTML = `${pageHead('Vehicles & capacity', 'Seat capacity is enforced by the database on every booking.', `<button class="btn btn-primary" data-act="editVehicle" data-id="0">${icon('plus', 16)} Add vehicle</button>`)}
    <div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Type</th><th>Capacity</th><th>Status</th><th>Upcoming rides</th><th></th></tr></thead><tbody>
    ${vehicles.map((v) => `<tr><td><b>${esc(v.vehicle_number)}</b></td><td>${esc(v.vehicle_type)}</td><td>${icon('seat', 15)} ${v.capacity}</td><td>${statusChip(v.vehicle_status)}</td><td>${v.upcoming}</td>
      <td class="right"><button class="btn btn-soft btn-sm" data-act="editVehicle" data-id="${v.vehicle_id}">${icon('edit', 15)} Edit</button> <button class="btn btn-danger btn-sm" data-act="delVehicle" data-id="${v.vehicle_id}" aria-label="Delete ${esc(v.vehicle_number)}">${icon('trash', 15)}</button></td></tr>`).join('') || '<tr><td colspan="6" class="center muted">No vehicles yet.</td></tr>'}</tbody></table></div>`;
});
A.editVehicle = (d) => {
  const v = +d.id ? Mgr.vehicles.find((x) => x.vehicle_id === +d.id) : null;
  openModal({ title: v ? 'Edit vehicle' : 'Add vehicle', body: `<form data-form="vehicle" novalidate><input type="hidden" name="vehicle_id" value="${v ? v.vehicle_id : 0}">
    ${fld({ name: 'vehicle_number', label: 'Vehicle number', value: v ? v.vehicle_number : '', ph: 'DHA-11-1234', v: 'Vehicle number|required|min:3|max:30' })}
    <div class="form-row">${fld({ name: 'vehicle_type', label: 'Type', type: 'select', value: v ? v.vehicle_type : 'Bus', options: ['Bus', 'Minibus', 'Microbus', 'Van', 'Car'].map((x) => [x, x]), v: 'Vehicle type|required|in:Bus,Minibus,Microbus,Van,Car' })}
    ${fld({ name: 'capacity', label: 'Seat capacity', type: 'number', value: v ? v.capacity : 40, extra: 'min="1" max="80"', v: 'Capacity|required|between:1,80' })}</div>
    ${fld({ name: 'vehicle_status', label: 'Status', type: 'select', value: v ? v.vehicle_status : 'available', options: [['available', 'Available'], ['maintenance', 'Under maintenance'], ['retired', 'Retired']], v: 'Status|required|in:available,maintenance,retired' })}
    <div class="form-error hide" role="alert"></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">Save vehicle</button></div></form>` });
};
F.vehicle = async (form, v) => { await post('vehicle_save', { vehicle_id: +v.vehicle_id, vehicle_number: v.vehicle_number, vehicle_type: v.vehicle_type, capacity: +v.capacity, vehicle_status: v.vehicle_status }); closeModal(); toast('Vehicle saved.'); refresh(); };
A.delVehicle = async (d) => {
  if (!(await confirmBox({ title: 'Delete vehicle?', text: 'Vehicles that were used in schedules cannot be deleted — mark them as retired instead.', ok: 'Delete', danger: true }))) return;
  await post('vehicle_delete', { vehicle_id: +d.id }); toast('Vehicle deleted.'); refresh();
};

/* ---------------- schedules ---------------- */
const dtLocal = (s) => String(s).slice(0, 16).replace(' ', 'T');
route('/manager/schedules', { shell: 'app', title: 'Schedules', roles: ROLE_M }, async (view, ctx) => {
  const scope = ctx.query.scope === 'past' ? 'past' : 'upcoming';
  const [s, r, v, d] = await ctx.wait(Promise.all([api('manager_schedules', { params: { scope } }), api('manager_routes'), api('vehicles'), api('drivers')]));
  Mgr.schedules = s.schedules; Mgr.routes = r.routes; Mgr.vehicles = v.vehicles; Mgr.drivers = d.drivers;
  view.innerHTML = `${pageHead('Departure schedules', 'Publish rides with a route, vehicle and driver. Conflicts are checked automatically (30 min buffer).', `<button class="btn btn-primary" data-act="editSched" data-id="0">${icon('plus', 16)} New schedule</button>`)}
    <div style="margin-bottom:12px">${segTabs([['upcoming', 'Upcoming'], ['past', 'Past & cancelled']], scope, 'schedTab')}</div>
    <div class="table-wrap"><table><thead><tr><th>Departure</th><th>Route</th><th>Driver</th><th>Vehicle</th><th>Seats</th><th>Status</th><th></th></tr></thead><tbody>
    ${s.schedules.map((x) => `<tr><td><b>${fmtClock(parseDT(x.departure_time))}</b><div class="muted small">${fmtDay(x.departure_time)}</div></td><td>${esc(x.route_name)}</td><td>${esc(x.driver_name)}</td><td>${esc(x.vehicle_number)}</td><td>${x.booked}/${x.capacity}</td><td>${statusChip(x.status)} ${delayChip(x)}${x.cancel_reason ? `<div class="muted small">${esc(x.cancel_reason)}</div>` : ''}</td>
      <td class="right"><button class="btn btn-ghost btn-sm" data-act="schedPassengers" data-id="${x.schedule_id}" aria-label="Passengers">${icon('users', 15)}</button>
      ${x.status === 'scheduled' ? `<button class="btn btn-soft btn-sm" data-act="editSched" data-id="${x.schedule_id}">${icon('edit', 15)}</button>` : ''}${['scheduled', 'in_progress'].includes(x.status) ? ` <button class="btn btn-danger btn-sm" data-act="cancelSched" data-id="${x.schedule_id}" aria-label="Cancel ride">${icon('x', 15)}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="center muted">Nothing here.</td></tr>'}</tbody></table></div>`;
});
A.schedTab = (d) => go('/manager/schedules?scope=' + d.k);
A.editSched = (d) => {
  const x = +d.id ? Mgr.schedules.find((s) => s.schedule_id === +d.id) : null;
  const tom = new Date(); tom.setDate(tom.getDate() + 1); tom.setHours(8, 0, 0, 0);
  openModal({ title: x ? 'Edit schedule' : 'New schedule', wide: true, body: `<form data-form="sched" novalidate><input type="hidden" name="schedule_id" value="${x ? x.schedule_id : 0}">
    <div class="form-row">${fld({ name: 'route_id', label: 'Route', type: 'select', value: x ? x.route_id : '', options: [['', 'Select route…'], ...Mgr.routes.filter((r) => r.is_active || (x && x.route_id === r.route_id)).map((r) => [r.route_id, r.route_name])], v: 'Route|required|int' })}
    ${fld({ name: 'vehicle_id', label: 'Vehicle', type: 'select', value: x ? x.vehicle_id : '', options: [['', 'Select vehicle…'], ...Mgr.vehicles.filter((v) => v.vehicle_status === 'available' || (x && x.vehicle_id === v.vehicle_id)).map((v) => [v.vehicle_id, `${v.vehicle_number} (${v.capacity} seats)`])], v: 'Vehicle|required|int' })}</div>
    <div class="form-row">${fld({ name: 'driver_id', label: 'Driver', type: 'select', value: x ? x.driver_id : '', options: [['', 'Select driver…'], ...Mgr.drivers.map((u) => [u.user_id, u.name + (u.rating ? ` ★${u.rating}` : '')])], v: 'Driver|required|int' })}
    ${fld({ name: 'departure_time', label: 'Departure', type: 'datetime-local', value: x ? dtLocal(x.departure_time) : dtLocal(dateKey(tom) + ' 08:00'), v: 'Departure|required|datetime' + (x ? '' : '|future') })}</div>
    <div class="form-row">${fld({ name: 'duration_min', label: 'Duration (minutes)', type: 'number', value: x ? x.duration_min : 55, extra: 'min="5" max="600"', v: 'Duration (minutes)|required|between:5,600' })}
    ${x ? '' : fld({ name: 'repeat_days', label: 'Repeat for extra days', type: 'number', value: 0, extra: 'min="0" max="30"', v: 'Repeat|between:0,30', hint: '0 = just this day; 5 = also the next 5 days' })}</div>
    ${fld({ name: 'notes', label: 'Notes (optional)', value: x ? x.notes : '', v: 'Notes|max:255' })}
    <div class="form-error hide" role="alert"></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">${x ? 'Save changes' : 'Publish schedule'}</button></div></form>` });
};
F.sched = async (form, v) => {
  const r = await post('schedule_save', { schedule_id: +v.schedule_id, route_id: +v.route_id, vehicle_id: +v.vehicle_id, driver_id: +v.driver_id, departure_time: v.departure_time, duration_min: +v.duration_min, repeat_days: +(v.repeat_days || 0), notes: v.notes });
  closeModal(); toast(r.created ? `${plural(r.created, 'ride')} published${r.skipped?.length ? ` (${r.skipped.length} skipped due to conflicts)` : ''}.` : 'Schedule updated. Passengers were notified.'); refresh();
};
A.cancelSched = (d) => openModal({ title: 'Cancel this ride?', body: `<p class="muted">All passengers and the driver will be notified.</p><form data-form="cancelSched" novalidate><input type="hidden" name="schedule_id" value="${d.id}">
  ${fld({ name: 'reason', label: 'Reason', v: 'Reason|required|min:4|max:200', ph: 'e.g. Vehicle breakdown' })}<div class="form-error hide" role="alert"></div>
  <div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Keep ride</button><button class="btn btn-danger" type="submit">Cancel ride</button></div></form>` });
F.cancelSched = async (form, v) => { await post('schedule_cancel', { schedule_id: +v.schedule_id, reason: v.reason }); closeModal(); toast('Ride cancelled and passengers notified.'); refresh(); };

/* ---------------- driver assignments ---------------- */
route('/manager/assignments', { shell: 'app', title: 'Driver Assignments', roles: ROLE_M }, async (view, ctx) => {
  const [s, d] = await ctx.wait(Promise.all([api('manager_schedules'), api('drivers')]));
  Mgr.schedules = s.schedules; Mgr.drivers = d.drivers;
  const rows = s.schedules.filter((x) => x.status === 'scheduled');
  view.innerHTML = `${pageHead('Driver assignments', 'See driver workload and reassign upcoming rides.')}
    <div class="grid g3" style="margin-bottom:18px">${d.drivers.map((u) => `<div class="card"><div class="row">${avatar(u.name, 44)}<div><b>${esc(u.name)}</b><div class="muted small">${u.rating ? '★ ' + u.rating : 'No ratings yet'} · ${esc(u.phone || '')}</div></div></div><div class="progress" style="margin:12px 0 4px"><i style="width:${Math.min(100, u.upcoming * 12)}%"></i></div><small class="muted">${plural(u.upcoming, 'upcoming trip')}</small></div>`).join('') || '<div class="card muted">No approved drivers yet. Ask the admin to approve driver accounts.</div>'}</div>
    <div class="table-wrap"><table><thead><tr><th>Departure</th><th>Route</th><th>Vehicle</th><th>Driver</th></tr></thead><tbody>
    ${rows.map((x) => `<tr><td><b>${fmtClock(parseDT(x.departure_time))}</b><div class="muted small">${fmtDay(x.departure_time)}</div></td><td>${esc(x.route_name)}</td><td>${esc(x.vehicle_number)}</td>
      <td><select data-change="reassign" data-id="${x.schedule_id}" aria-label="Driver for ${esc(x.route_name)}">${d.drivers.map((u) => `<option value="${u.user_id}" ${u.user_id === x.driver_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">No scheduled rides.</td></tr>'}</tbody></table></div>`;
});
I.reassign = async (el) => {
  const x = Mgr.schedules.find((s) => s.schedule_id === +el.dataset.id); const prev = x.driver_id;
  try {
    await post('schedule_save', { schedule_id: x.schedule_id, route_id: x.route_id, vehicle_id: x.vehicle_id, driver_id: +el.value, departure_time: dtLocal(x.departure_time), duration_min: x.duration_min, notes: x.notes });
    x.driver_id = +el.value; toast('Driver reassigned. Passengers and drivers were notified.');
  } catch (e) { el.value = prev; toast(e.message, 'error'); }
};
