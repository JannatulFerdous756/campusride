'use strict';
/* Passenger pages (+ shared notifications page) */

const ROLE_P = ['passenger'];

/* ---------------- search rides ---------------- */
route('/passenger/search', { shell: 'app', title: 'Search Rides', roles: ROLE_P }, async (view, ctx) => {
  let q = ctx.query;
  if (!Object.keys(q).length && Cookie.consent() === 'all') { try { q = JSON.parse(Cookie.get('cr_search') || '{}'); } catch { q = {}; } }
  State.lastFrom = q.from || '';
  const [locs, res] = await ctx.wait(Promise.all([api('locations'), api('rides', { params: q })]));
  view.innerHTML = `${pageHead('Find a ride', 'Search by pickup point, destination, date and time. Seat counts update live.')}
    <form class="card filters" data-form="search" novalidate>
      <div class="field wide">${'<label for="f-from">Pickup point</label>'}<input id="f-from" name="from" list="locs" autocomplete="off" placeholder="e.g. Uttara Sector 10" value="${esc(q.from || '')}" data-v="Pickup|max:100"></div>
      <button type="button" class="btn-icon swap" data-act="swapStops" aria-label="Swap pickup and destination">${icon('swap', 18)}</button>
      <div class="field wide"><label for="f-to">Destination</label><input id="f-to" name="to" list="locs" autocomplete="off" placeholder="e.g. Campus Gate" value="${esc(q.to || '')}" data-v="Destination|max:100"></div>
      <div class="field"><label for="f-date">Date</label><input id="f-date" type="date" name="date" min="${todayStr()}" value="${esc(q.date || '')}" data-v="Date|date"></div>
      <div class="field"><label for="f-time">Leaving after</label><input id="f-time" type="time" name="time" value="${esc(q.time || '')}" data-v="Time|time"></div>
      <div class="filter-btns"><button class="btn btn-primary" type="submit">${icon('search', 16)} Search</button><button type="button" class="btn btn-ghost" data-act="clearSearch">Clear</button></div>
      <datalist id="locs">${locs.locations.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></form>
    <div class="row quick-dates" style="margin:14px 0"><span class="muted small">Quick pick:</span>
      <button class="chip pointer" data-act="quickDate" data-d="0">Today</button><button class="chip pointer" data-act="quickDate" data-d="1">Tomorrow</button><button class="chip pointer" data-act="quickDate" data-d="">Any date</button>
      <span class="spacer"></span><span class="live-dot" title="Seat counts refresh automatically"><i></i> Live seats</span></div>
    <div class="row between" style="margin-bottom:10px"><b>${plural(res.rides.length, 'ride')} found</b></div>
    <div class="list" id="rides">${res.rides.length ? res.rides.map(rideCard).join('') : empty('search', 'No rides match your search', 'Try a different date or time, or clear the filters to see every upcoming ride.', '<button class="btn btn-soft" data-act="clearSearch">Show all upcoming rides</button>')}</div>`;
  watchSeats(ctx, view);
});
F.search = async (form, v) => {
  const e = {};
  if (v.from && v.to && v.from.trim().toLowerCase() === v.to.trim().toLowerCase()) e.to = 'Pickup and destination must be different.';
  if (Object.keys(e).length) { showErrors(form, e); return; }
  const q = {}; ['from', 'to', 'date', 'time'].forEach((k) => { if (v[k]) q[k] = v[k].trim(); });
  Cookie.pref('cr_search', JSON.stringify(q), 30);
  const qs = new URLSearchParams(q).toString(); const target = '#/passenger/search' + (qs ? '?' + qs : '');
  if (location.hash === target) refresh(); else location.hash = target;
};
A.clearSearch = () => { Cookie.del('cr_search'); if (location.hash === '#/passenger/search') refresh(); else go('/passenger/search'); };
A.swapStops = (d, el) => { const f = el.closest('form'); const t = f.elements.from.value; f.elements.from.value = f.elements.to.value; f.elements.to.value = t; };
A.quickDate = (d, el) => { const f = $('form.filters'); const x = new Date(); x.setDate(x.getDate() + (+d.d || 0)); f.elements.date.value = d.d === '' ? '' : dateKey(x); f.requestSubmit(); };

/* ---------------- bookings ---------------- */
const bookingCard = (b) => {
  const dep = parseDT(b.departure_time);
  return `<article class="card ride">
    <div class="ride-when"><b>${fmtClock(dep)}</b><span>${relDay(b.departure_time)}</span></div>
    <div class="ride-main"><h4>${esc(b.route_name)} ${statusChip(b.booking_status === 'cancelled' ? 'cancelled' : b.ride_status)}</h4>
      <div class="ride-route">${esc(b.start_point)} <span class="arrow">${icon('arrow', 14)}</span> ${esc(b.destination)}</div>
      <div class="ride-meta"><span>${icon('pin', 14)} Pickup: <b>${esc(b.pickup_name)}</b></span><span>${icon('user', 14)} ${esc(b.driver_name)}</span><span>${icon('bus', 14)} ${esc(b.vehicle_number)}</span>
        ${b.delay_minutes > 0 && b.ride_status === 'scheduled' ? chip(`${b.delay_minutes} min late`, 'warn') : ''}</div>
      <div class="muted small" style="margin-top:6px">Booked ${timeAgo(b.booking_time)} · Booking #${b.booking_id}${b.cancelled_at ? ` · Cancelled ${timeAgo(b.cancelled_at)}` : ''}</div></div>
    <div class="ride-act">${b.my_rating ? `<div>${stars(b.my_rating)} <span class="muted small">your rating</span></div>` : ''}
      ${b.can_cancel ? `<button class="btn btn-danger btn-sm" data-act="cancelBooking" data-id="${b.booking_id}">Cancel seat</button>` : ''}
      ${!b.can_cancel && b.bucket === 'upcoming' ? `<span class="muted small">Cancellation closed (${State.cutoff} min before departure)</span>` : ''}
      ${b.can_review ? `<button class="btn btn-primary btn-sm" data-act="openReview" data-id="${b.schedule_id}" data-route="${esc(b.route_name)}" data-driver="${esc(b.driver_name)}">${icon('star', 15)} Rate trip</button>` : ''}
      ${b.bucket === 'history' ? `<a class="btn btn-ghost btn-sm" href="#/passenger/complaints?booking=${b.booking_id}">Report issue</a>` : ''}</div></article>`;
};
route('/passenger/bookings', { shell: 'app', title: 'My Bookings', roles: ROLE_P }, async (view, ctx) => {
  const { bookings } = await ctx.wait(api('my_bookings'));
  const up = bookings.filter((b) => b.bucket === 'upcoming').sort((a, b) => (a.departure_time < b.departure_time ? -1 : 1));
  view.innerHTML = `${pageHead('Upcoming bookings', 'Your confirmed seats. Cancel up to ' + State.cutoff + ' minutes before departure.', '<a class="btn btn-primary" href="#/passenger/search">' + icon('plus', 16) + ' Book another ride</a>')}
    <div class="list">${up.length ? up.map(bookingCard).join('') : empty('calendar', 'No upcoming bookings', 'Find a ride and reserve your seat.', '<a class="btn btn-primary" href="#/passenger/search">Search rides</a>')}</div>`;
});
route('/passenger/history', { shell: 'app', title: 'Booking History', roles: ROLE_P }, async (view, ctx) => {
  const { bookings } = await ctx.wait(api('my_bookings'));
  const h = bookings.filter((b) => b.bucket === 'history');
  view.innerHTML = `${pageHead('Booking history', 'Completed, cancelled and past rides.')}<div class="list">${h.length ? h.map(bookingCard).join('') : empty('history', 'No history yet', 'Your finished rides will show up here.')}</div>`;
});
A.cancelBooking = async (d) => {
  if (!(await confirmBox({ title: 'Cancel this seat?', text: 'Your seat will be released for other passengers.', ok: 'Yes, cancel seat', danger: true }))) return;
  await post('cancel_booking', { booking_id: +d.id }); toast('Booking cancelled.'); refresh();
};

/* ---------------- reviews ---------------- */
A.openReview = (d) => openModal({
  title: 'Rate your trip',
  body: `<form data-form="review" novalidate><input type="hidden" name="schedule_id" value="${d.id}"><p class="muted">${esc(d.route)} · Driver ${esc(d.driver)}</p>
    ${starPick()}<div style="height:12px"></div>${fld({ name: 'comment', label: 'Comment (optional)', type: 'textarea', rows: 3, v: 'Comment|max:500', ph: 'How was the ride?' })}
    <div class="form-error hide" role="alert"></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Cancel</button><button class="btn btn-primary" type="submit">Submit rating</button></div></form>`,
});
F.review = async (form, v) => { await post('review', { schedule_id: +v.schedule_id, rating: +v.rating, comment: v.comment }); closeModal(); toast('Thanks for your feedback!'); refresh(); };
route('/passenger/reviews', { shell: 'app', title: 'Reviews', roles: ROLE_P }, async (view, ctx) => {
  const [mine, bk] = await ctx.wait(Promise.all([api('my_reviews'), api('my_bookings')]));
  const todo = bk.bookings.filter((b) => b.can_review);
  view.innerHTML = `${pageHead('Ratings & reviews', 'Rate completed rides to help drivers and the transport office improve.')}
    ${todo.length ? `<div class="card" style="margin-bottom:18px"><div class="card-title"><h3>Waiting for your rating</h3>${chip(String(todo.length), 'warn')}</div>${todo.map((b) => `<div class="mini-row"><div style="flex:1"><b>${esc(b.route_name)}</b><div class="muted small">${fmtDT(b.departure_time)} · Driver ${esc(b.driver_name)}</div></div><button class="btn btn-primary btn-sm" data-act="openReview" data-id="${b.schedule_id}" data-route="${esc(b.route_name)}" data-driver="${esc(b.driver_name)}">${icon('star', 15)} Rate</button></div>`).join('')}</div>` : ''}
    <div class="card"><div class="card-title"><h3>Your reviews</h3></div>${mine.reviews.length ? mine.reviews.map((r) => `<div class="review"><div class="row between"><b>${esc(r.route_name)}</b>${stars(r.rating)}</div><div class="muted small">Driver ${esc(r.driver_name)} · ${fmtDT(r.departure_time)}</div>${r.comment ? `<p style="margin:8px 0 0">${esc(r.comment)}</p>` : ''}</div>`).join('') : '<p class="muted">You have not reviewed any rides yet.</p>'}</div>`;
});

/* ---------------- complaints ---------------- */
route('/passenger/complaints', { shell: 'app', title: 'Complaints', roles: ROLE_P }, async (view, ctx) => {
  const [cm, bk] = await ctx.wait(Promise.all([api('my_complaints'), api('my_bookings')]));
  const opts = [['', 'Not about a specific booking'], ...bk.bookings.map((b) => [b.booking_id, `#${b.booking_id} · ${b.route_name} · ${fmtDay(b.departure_time)}`])];
  view.innerHTML = `${pageHead('Complaints & feedback', 'Tell the administrators about a problem. You will be notified when it is reviewed.')}
    <div class="split"><div class="card"><div class="card-title"><h3>Your complaints</h3></div>${cm.complaints.length ? cm.complaints.map((c) => `<div class="review"><div class="row between"><b>${esc(c.subject)}</b>${statusChip(c.status)}</div><p style="margin:6px 0">${esc(c.description)}</p><div class="muted small">${timeAgo(c.created_at)}${c.booking_id ? ` · Booking #${c.booking_id}` : ''}</div>${c.admin_response ? `<div class="alert info" style="margin-top:8px">${icon('info', 18)}<span><b>Admin response:</b> ${esc(c.admin_response)}</span></div>` : ''}</div>`).join('') : '<p class="muted">No complaints submitted.</p>'}</div>
    <form class="card" data-form="complaint" novalidate><div class="card-title"><h3>New complaint</h3></div>
      ${fld({ name: 'subject', label: 'Subject', v: 'Subject|required|min:4|max:120', ph: 'e.g. Bus was 30 minutes late' })}
      ${fld({ name: 'booking_id', label: 'Related booking', type: 'select', options: opts, value: ctx.query.booking || '', v: 'Booking|int' })}
      ${fld({ name: 'description', label: 'What happened?', type: 'textarea', v: 'Description|required|min:10|max:1000', ph: 'Describe the problem (at least 10 characters)' })}
      <div class="form-error hide" role="alert"></div><button class="btn btn-primary btn-block" type="submit">Submit complaint</button></form></div>`;
});
F.complaint = async (form, v) => { await post('complaint', { subject: v.subject, booking_id: v.booking_id, description: v.description }); toast('Complaint submitted. Thank you.'); refresh(); };

/* ---------------- notifications (all roles) ---------------- */
route('/notifications', { shell: 'app', title: 'Notifications', roles: ['passenger', 'driver', 'manager', 'admin'] }, async (view, ctx) => {
  const r = await ctx.wait(api('notifications'));
  State.unread = r.unread; updateBell();
  view.innerHTML = `${pageHead('Notifications', 'Booking confirmations, schedule changes and delay alerts.', r.unread ? '<button class="btn btn-soft" data-act="notifAll">Mark all as read</button>' : '')}
    <div class="card notif-page">${r.notifications.length ? r.notifications.map(notifItem).join('') : empty('bell', 'No notifications yet', 'We will let you know when something happens.')}</div>`;
});
