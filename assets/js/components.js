'use strict';
/* =========================================================
   CampusRide — shared UI components
   ========================================================= */
const STATUS = {
  scheduled: ['Scheduled', 'info'], in_progress: ['In progress', 'warn'], completed: ['Completed', 'success'], cancelled: ['Cancelled', 'danger'],
  confirmed: ['Confirmed', 'success'], active: ['Active', 'success'], pending: ['Pending approval', 'warn'], suspended: ['Suspended', 'danger'],
  available: ['Available', 'success'], maintenance: ['Maintenance', 'warn'], retired: ['Retired', ''],
  open: ['Open', 'danger'], in_review: ['In review', 'warn'], resolved: ['Resolved', 'success'],
};
const statusChip = (s) => chip((STATUS[s] || [titleCase(s), ''])[0], (STATUS[s] || [s, ''])[1]);
const roleChip = (r) => chip(titleCase(r), { admin: 'danger', manager: 'primary', driver: 'warn', passenger: 'info' }[r] || '');
const empty = (ic, title, text = '', action = '') => `<div class="card empty"><div class="ico">${icon(ic, 28)}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;
const statTile = (label, value, ic, color = '') => `<div class="card stat"><div class="ico ${color}">${icon(ic, 24)}</div><div><b>${value}</b><span>${esc(label)}</span></div></div>`;
const pageHead = (title, sub = '', right = '') => `<div class="page-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="row">${right}</div>` : ''}</div>`;
const segTabs = (items, cur, act) => `<div class="seg" role="tablist">${items.map(([k, l, n]) => `<button role="tab" class="${k === cur ? 'on' : ''}" data-act="${act}" data-k="${k}">${esc(l)}${n != null ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>`;

/* ---------------- form field helper ---------------- */
function fld(o) {
  const id = `f-${o.name}`;
  const common = `id="${id}" name="${o.name}"${o.v ? ` data-v="${esc(o.v)}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.ac ? ` autocomplete="${o.ac}"` : ''}${o.extra ? ' ' + o.extra : ''}`;
  let ctl;
  if (o.type === 'select') ctl = `<select ${common}>${(o.options || []).map(([v, l]) => `<option value="${esc(v)}"${String(o.value ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (o.type === 'textarea') ctl = `<textarea ${common} rows="${o.rows || 4}">${esc(o.value ?? '')}</textarea>`;
  else ctl = `<input type="${o.type || 'text'}" ${common} value="${esc(o.value ?? '')}">`;
  const req = (o.v || '').includes('required') ? '<span class="req" aria-hidden="true"> *</span>' : '';
  return `<div class="field${o.cls ? ' ' + o.cls : ''}"><label for="${id}">${esc(o.label)}${req}</label>${ctl}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
}

/* ---------------- ride pieces ---------------- */
function seatMeter(left, cap) {
  const pct = cap ? Math.round(100 * (cap - left) / cap) : 100;
  const tone = left === 0 ? 'full' : left <= Math.max(2, cap * 0.15) ? 'low' : 'ok';
  return `<div class="seatbox ${tone}"><div class="seat-top"><span>${icon('seat', 16)} <b data-seatnum>${left}</b> ${left === 1 ? 'seat' : 'seats'} left</span><small data-seatcap>of ${cap}</small></div><div class="meter"><i style="width:${pct}%"></i></div></div>`;
}
function delayChip(r) { return r.delay_minutes > 0 && ['scheduled', 'in_progress'].includes(r.status) ? chip(`${r.delay_minutes} min late`, 'warn') : ''; }

function stopTimeline(stops, dep, delay = 0, hiFrom = null, hiTo = null) {
  return `<ol class="timeline">${stops.map((s, i) => {
    const t = fmtClock(addMin(dep, s.minutes_from_start + delay));
    const cls = [i === 0 ? 'first' : '', i === stops.length - 1 ? 'last' : '', hiFrom && s.stop_id === hiFrom ? 'hi' : '', hiTo && s.stop_id === hiTo ? 'hi' : ''].join(' ');
    return `<li class="${cls}"><i></i><span class="tl-name">${esc(s.stop_name)}</span><span class="tl-time">${t}</span></li>`;
  }).join('')}</ol>`;
}

function rideCard(r) {
  const dep = parseDT(r.departure_time);
  const mine = r.my_booking_id;
  const ended = r.seats_left === 0;
  const route = r.from_stop || r.to_stop
    ? `${esc(r.from_stop ? r.from_stop.stop_name : r.start_point)} <span class="arrow">${icon('arrow', 14)}</span> ${esc(r.to_stop ? r.to_stop.stop_name : r.destination)}`
    : `${esc(r.start_point)} <span class="arrow">${icon('arrow', 14)}</span> ${esc(r.destination)}`;
  const pickAt = r.from_stop ? ` · pickup ${fmtClock(addMin(r.departure_time, r.from_stop.minutes_from_start + r.delay_minutes))}` : '';
  let btn;
  if (mine) btn = `<span class="chip success">${icon('check', 14)} You're booked</span>`;
  else if (!r.bookable) btn = `<span class="chip warn">Vehicle unavailable</span>`;
  else btn = `<button class="btn btn-primary" data-act="openBook" data-id="${r.schedule_id}" ${ended ? 'disabled' : ''}>${ended ? 'Full' : 'Book a seat'}</button>`;
  return `<article class="card ride hover" data-sid="${r.schedule_id}">
    <div class="ride-when"><b>${fmtClock(dep)}</b><span>${relDay(r.departure_time)}</span></div>
    <div class="ride-main">
      <h4>${esc(r.route_name)}</h4>
      <div class="ride-route">${route}</div>
      <div class="ride-meta"><span>${icon('clock', 14)} ${r.duration_min} min trip${pickAt}</span><span>${icon('bus', 14)} ${esc(r.vehicle_type)} ${esc(r.vehicle_number)}</span><span>${icon('user', 14)} ${esc(r.driver_name)}</span> ${delayChip(r)}</div>
      <details class="stops"><summary>View route & stops</summary>${stopTimeline(r.stops, r.departure_time, r.delay_minutes, r.from_stop?.stop_id, r.to_stop?.stop_id)}</details>
    </div>
    <div class="ride-act">${seatMeter(r.seats_left, r.capacity)}<div data-ride-btn>${btn}</div></div>
  </article>`;
}

/** Live seat availability: poll /seats and patch the cards in place (no re-render, no flicker). */
function applySeats(map) {
  Object.entries(map).forEach(([id, s]) => {
    $$(`[data-sid="${id}"]`).forEach((card) => {
      const box = $('.seatbox', card); if (!box) return;
      const num = $('[data-seatnum]', box);
      if (num && +num.textContent !== s.seats_left) { box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 900); }
      if (num) num.textContent = s.seats_left;
      box.classList.remove('ok', 'low', 'full'); box.classList.add(s.seats_left === 0 ? 'full' : s.seats_left <= Math.max(2, s.capacity * 0.15) ? 'low' : 'ok');
      $('.meter i', box).style.width = `${s.capacity ? Math.round(100 * s.booked / s.capacity) : 100}%`;
      const b = $('[data-act="openBook"]', card);
      if (b) { b.disabled = s.seats_left === 0 || s.status !== 'scheduled'; b.textContent = s.seats_left === 0 ? 'Full' : 'Book a seat'; }
      if (s.status !== 'scheduled') card.classList.add('dim');
    });
  });
}
function watchSeats(ctx, root = document) {
  const poll = async () => {
    const ids = $$('[data-sid]', root).map((c) => c.dataset.sid);
    if (!ids.length || document.hidden) return;
    try { const r = await api('seats', { params: { ids: ids.join(',') } }); if (ctx.alive()) applySeats(r.seats); } catch { /* ignore */ }
  };
  ctx.every(poll, 8000);
}

/* ---------------- star picker ---------------- */
const starPick = (name = 'rating', v = 0) => `<input type="hidden" name="${name}" value="${v || ''}" data-v="Rating|required|between:1,5"><div class="star-pick" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" aria-checked="${i === v}" class="${i <= v ? 'on' : ''}" data-act="pickStar" data-v="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">★</button>`).join('')}</div>`;
A.pickStar = (d, el) => {
  const wrap = el.closest('.star-pick'); const form = el.closest('form'); const inp = $('input[name=rating]', form);
  inp.value = d.v; $$('button', wrap).forEach((b) => { b.classList.toggle('on', +b.dataset.v <= +d.v); b.setAttribute('aria-checked', +b.dataset.v === +d.v); });
  setFieldError(form, 'rating', null);
};

/* ---------------- charts (inline SVG) ---------------- */
const PALETTE = ['#1769e0', '#06b6d4', '#f59e0b', '#12a36b', '#e0394f', '#8b5cf6'];
function barChart(data, { h = 190, fmt = (v) => v } = {}) {
  const w = 640, pl = 30, pb = 26, pt = 14, max = Math.max(1, ...data.map((d) => d.value));
  const top = Math.ceil(max / 4) * 4 || 4; const bw = (w - pl) / data.length;
  const ph = h - pb - pt;
  const grid = [0, 1, 2, 3, 4].map((i) => { const y = pt + ph - (ph * i) / 4; return `<line class="grid-line" x1="${pl}" x2="${w}" y1="${y}" y2="${y}"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end">${Math.round((top * i) / 4)}</text>`; }).join('');
  const bars = data.map((d, i) => { const bh = (ph * d.value) / top; const x = pl + i * bw + bw * 0.18; return `<g><rect class="bar" x="${x}" y="${pt + ph - bh}" width="${bw * 0.64}" height="${Math.max(bh, d.value ? 2 : 0)}" rx="5"><title>${esc(d.label)}: ${fmt(d.value)}</title></rect>${i % Math.ceil(data.length / 7) === 0 ? `<text x="${x + bw * 0.32}" y="${h - 8}" text-anchor="middle">${esc(d.label)}</text>` : ''}</g>`; }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Bar chart"><defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#06b6d4"/><stop offset="1" stop-color="#1769e0"/></linearGradient></defs>${grid}${bars}</svg>`;
}
function donut(data, size = 150) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1; let acc = 0; const r = 54, c = 2 * Math.PI * r;
  const segs = data.map((d, i) => { const len = (c * d.value) / total; const el = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${d.color || PALETTE[i % PALETTE.length]}" stroke-width="22" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"><title>${esc(d.label)}: ${d.value}</title></circle>`; acc += len; return el; }).join('');
  return `<div class="donut-wrap"><svg width="${size}" height="${size}" viewBox="0 0 140 140" role="img" aria-label="Donut chart"><circle r="54" cx="70" cy="70" fill="none" stroke="var(--surface-2)" stroke-width="22"/>${segs}<text x="70" y="75" text-anchor="middle" style="font-size:22px;font-weight:800;fill:var(--text)">${data.reduce((a, d) => a + d.value, 0)}</text></svg>
    <div class="legend">${data.map((d, i) => `<div><i style="background:${d.color || PALETTE[i % PALETTE.length]}"></i>${esc(d.label)} <b>${d.value}</b></div>`).join('')}</div></div>`;
}
function hbars(data, { suffix = '', max } = {}) {
  const m = max || Math.max(1, ...data.map((d) => d.value));
  return data.map((d) => `<div class="hbar"><span title="${esc(d.label)}" class="ell">${esc(d.label)}</span><div class="progress"><i style="width:${Math.min(100, (100 * d.value) / m)}%"></i></div><b>${d.value}${suffix}</b></div>`).join('');
}

/* ---------------- booking modal ---------------- */
async function openBook(id) {
  const { ride } = await api('ride', { params: { id } });
  const stops = ride.stops.slice(0, -1);
  const pre = (State.lastFrom && stops.find((s) => s.stop_name === State.lastFrom)) || stops[0];
  openModal({
    title: 'Confirm your seat',
    body: `<form data-form="book" novalidate><input type="hidden" name="schedule_id" value="${ride.schedule_id}">
      <div class="book-sum"><b>${esc(ride.route_name)}</b><span>${fmtDT(ride.departure_time)} · ${esc(ride.vehicle_type)} ${esc(ride.vehicle_number)} · Driver ${esc(ride.driver_name)}</span>
      ${ride.delay_minutes ? `<span class="chip warn">${ride.delay_minutes} min late</span>` : ''}</div>
      <div class="label" style="margin:14px 0 8px">Choose your pickup point</div>
      <div class="stop-pick">${stops.map((s) => `<label><input type="radio" name="pickup_stop_id" value="${s.stop_id}" ${s.stop_id === pre.stop_id ? 'checked' : ''}><span><b>${esc(s.stop_name)}</b><small>${fmtClock(addMin(ride.departure_time, s.minutes_from_start + ride.delay_minutes))}</small></span></label>`).join('')}</div>
      <div class="alert info" style="margin-top:14px">${icon('info', 18)}<span>${ride.seats_left} ${ride.seats_left === 1 ? 'seat is' : 'seats are'} left. You can cancel up to ${State.cutoff} minutes before departure.</span></div>
      <div class="form-error hide" role="alert"></div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-act="closeModal">Not now</button><button class="btn btn-primary" type="submit">${icon('check', 16)} Confirm booking</button></div></form>`,
  });
}
A.openBook = (d) => openBook(+d.id);
F.book = async (form, v) => {
  const r = await post('book', { schedule_id: +v.schedule_id, pickup_stop_id: +v.pickup_stop_id });
  closeModal(); toast(`Seat confirmed! ${r.seats_left} ${r.seats_left === 1 ? 'seat' : 'seats'} left.`);
  State.unread++; updateBell(); refresh();
};
