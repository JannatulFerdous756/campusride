<?php
/* Passenger endpoints: search, seats, book, cancel, history, reviews, complaints, notifications */

function sched_select(): string
{
    return "SELECT s.*, r.route_name, r.start_point, r.destination, v.capacity, v.vehicle_number, v.vehicle_type, v.vehicle_status,
        d.name AS driver_name,
        (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id = s.schedule_id AND b.booking_status = 'confirmed') AS booked
        FROM schedules s
        JOIN routes r ON r.route_id = s.route_id
        JOIN vehicles v ON v.vehicle_id = s.vehicle_id
        JOIN users d ON d.user_id = s.driver_id";
}

function shape_sched(array $s, array $stops = []): array
{
    $cap = (int)$s['capacity'];
    $booked = (int)$s['booked'];
    return [
        'schedule_id' => (int)$s['schedule_id'], 'route_id' => (int)$s['route_id'],
        'route_name' => $s['route_name'], 'start_point' => $s['start_point'], 'destination' => $s['destination'],
        'departure_time' => $s['departure_time'], 'duration_min' => (int)$s['duration_min'],
        'status' => $s['status'], 'delay_minutes' => (int)$s['delay_minutes'], 'notes' => $s['notes'],
        'capacity' => $cap, 'booked' => $booked, 'seats_left' => max(0, $cap - $booked),
        'driver_name' => $s['driver_name'], 'vehicle_number' => $s['vehicle_number'], 'vehicle_type' => $s['vehicle_type'],
        'vehicle_status' => $s['vehicle_status'], 'stops' => $stops,
    ];
}

function stops_for(int $routeId): array
{
    static $cache = [];
    if (!isset($cache[$routeId])) {
        $rows = q_all('SELECT stop_id, stop_name, stop_order, minutes_from_start FROM route_stops WHERE route_id = ? ORDER BY stop_order', [$routeId]);
        foreach ($rows as &$r) {
            $r['stop_id'] = (int)$r['stop_id'];
            $r['stop_order'] = (int)$r['stop_order'];
            $r['minutes_from_start'] = (int)$r['minutes_from_start'];
        }
        $cache[$routeId] = $rows;
    }
    return $cache[$routeId];
}

function find_stop(array $stops, string $needle): ?array
{
    $needle = mb_strtolower(trim($needle));
    if ($needle === '') {
        return null;
    }
    foreach ($stops as $s) {
        if (mb_strtolower($s['stop_name']) === $needle) {
            return $s;
        }
    }
    foreach ($stops as $s) {
        if (mb_strpos(mb_strtolower($s['stop_name']), $needle) !== false) {
            return $s;
        }
    }
    return null;
}

function h_rides(): void
{
    $u = require_role(['passenger']);
    $from = str_in($_GET, 'from');
    $to = str_in($_GET, 'to');
    $date = str_in($_GET, 'date');
    $time = str_in($_GET, 'time');
    $errors = validate($_GET, ['date' => 'Date|date', 'time' => 'Time|time', 'from' => 'Pickup|max:100', 'to' => 'Destination|max:100']);
    if ($errors) {
        fail_fields($errors);
    }
    if ($from !== '' && $to !== '' && mb_strtolower($from) === mb_strtolower($to)) {
        fail_fields(['to' => 'Pickup and destination must be different.']);
    }
    $sql = sched_select() . " WHERE s.status = 'scheduled' AND s.departure_time > ? AND r.is_active = 1";
    $p = [now()];
    if ($date !== '') {
        $sql .= ' AND s.departure_time >= ? AND s.departure_time < ?';
        $p[] = $date . ' 00:00:00';
        $p[] = date('Y-m-d', strtotime($date . ' +1 day')) . ' 00:00:00';
    }
    if ($time !== '') {
        $sql .= ' AND TIME(s.departure_time) >= ?';
        $p[] = $time . ':00';
    }
    $sql .= ' ORDER BY s.departure_time LIMIT 300';
    $mine = [];
    foreach (q_all('SELECT schedule_id, booking_id FROM bookings WHERE passenger_id = ? AND booking_status = ?', [$u['user_id'], 'confirmed']) as $m) {
        $mine[(int)$m['schedule_id']] = (int)$m['booking_id'];
    }
    $res = [];
    foreach (q_all($sql, $p) as $s) {
        $stops = stops_for((int)$s['route_id']);
        $a = find_stop($stops, $from);
        $b = find_stop($stops, $to);
        if ($from !== '' && !$a) {
            continue;
        }
        if ($to !== '' && !$b) {
            continue;
        }
        if ($a && $b && $a['stop_order'] >= $b['stop_order']) {
            continue; // wrong direction
        }
        if ($a && !$b && $a['stop_order'] === end($stops)['stop_order']) {
            continue;
        }
        if ($b && !$a && $b['stop_order'] === $stops[0]['stop_order']) {
            continue;
        }
        $x = shape_sched($s, $stops);
        $x['from_stop'] = $a;
        $x['to_stop'] = $b;
        $x['my_booking_id'] = $mine[(int)$s['schedule_id']] ?? null;
        $x['bookable'] = $s['vehicle_status'] === 'available';
        $res[] = $x;
        if (count($res) >= 60) {
            break;
        }
    }
    out(['rides' => $res]);
}

function h_ride(): void
{
    $u = require_role(['passenger', 'manager', 'admin']);
    $id = (int)($_GET['id'] ?? 0);
    $s = q_one(sched_select() . ' WHERE s.schedule_id = ?', [$id]);
    if (!$s) {
        fail('Ride not found.', 404);
    }
    $x = shape_sched($s, stops_for((int)$s['route_id']));
    $mb = q_one("SELECT booking_id FROM bookings WHERE passenger_id = ? AND schedule_id = ? AND booking_status = 'confirmed'", [$u['user_id'], $id]);
    $x['my_booking_id'] = $mb ? (int)$mb['booking_id'] : null;
    $x['bookable'] = $s['vehicle_status'] === 'available';
    out(['ride' => $x]);
}

/** Live seat counts for polling. ?ids=1,2,3 */
function h_seats(): void
{
    require_login();
    $ids = array_values(array_filter(array_map('intval', explode(',', str_in($_GET, 'ids'))), function ($i) {
        return $i > 0;
    }));
    $ids = array_slice(array_unique($ids), 0, 60);
    if (!$ids) {
        out(['seats' => new stdClass()]);
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $rows = q_all("SELECT s.schedule_id, s.status, s.delay_minutes, v.capacity,
        (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id = s.schedule_id AND b.booking_status = 'confirmed') AS booked
        FROM schedules s JOIN vehicles v ON v.vehicle_id = s.vehicle_id WHERE s.schedule_id IN ($in)", $ids);
    $res = [];
    foreach ($rows as $r) {
        $res[(string)$r['schedule_id']] = [
            'capacity' => (int)$r['capacity'], 'booked' => (int)$r['booked'],
            'seats_left' => max(0, (int)$r['capacity'] - (int)$r['booked']),
            'status' => $r['status'], 'delay_minutes' => (int)$r['delay_minutes'],
        ];
    }
    out(['seats' => $res ?: new stdClass()]);
}

function h_book(): void
{
    $u = require_role(['passenger']);
    $b = body();
    $errors = validate($b, ['schedule_id' => 'Ride|required|int', 'pickup_stop_id' => 'Pickup point|required|int']);
    if ($errors) {
        fail_fields($errors);
    }
    $sid = (int)$b['schedule_id'];
    $stopId = (int)$b['pickup_stop_id'];
    $uid = (int)$u['user_id'];

    $res = tx(function () use ($sid, $stopId, $uid) {
        $s = q_one('SELECT s.*, v.capacity, v.vehicle_status, r.route_name FROM schedules s
            JOIN vehicles v ON v.vehicle_id = s.vehicle_id JOIN routes r ON r.route_id = s.route_id
            WHERE s.schedule_id = ? FOR UPDATE', [$sid]);
        if (!$s) {
            throw new ApiError('Ride not found.', 404);
        }
        if ($s['status'] !== 'scheduled') {
            throw new ApiError('This ride is no longer open for booking.', 409);
        }
        if ($s['departure_time'] <= now()) {
            throw new ApiError('This ride has already departed.', 409);
        }
        if ($s['vehicle_status'] !== 'available') {
            throw new ApiError('The assigned vehicle is not available. Please choose another ride.', 409);
        }
        $stop = q_one('SELECT * FROM route_stops WHERE stop_id = ? AND route_id = ?', [$stopId, $s['route_id']]);
        if (!$stop) {
            throw new ApiError('That pickup point is not on this route.', 422, ['errors' => ['pickup_stop_id' => 'Choose a pickup point on this route.']]);
        }
        $last = q_val('SELECT MAX(stop_order) FROM route_stops WHERE route_id = ?', [$s['route_id']]);
        if ((int)$stop['stop_order'] >= (int)$last) {
            throw new ApiError('The last stop cannot be used as a pickup point.', 422, ['errors' => ['pickup_stop_id' => 'The last stop cannot be a pickup point.']]);
        }
        $existing = q_one('SELECT * FROM bookings WHERE passenger_id = ? AND schedule_id = ? FOR UPDATE', [$uid, $sid]);
        if ($existing && $existing['booking_status'] === 'confirmed') {
            throw new ApiError('You already have a seat on this ride.', 409);
        }
        // Atomic capacity guard: the counter only moves up while it is below the vehicle capacity.
        $st = q('UPDATE schedules SET seats_taken = seats_taken + 1 WHERE schedule_id = ?
            AND seats_taken < (SELECT capacity FROM vehicles WHERE vehicles.vehicle_id = schedules.vehicle_id)', [$sid]);
        if ($st->rowCount() < 1) {
            throw new ApiError('Sorry, this ride is full.', 409, ['code' => 'full']);
        }
        try {
            if ($existing) {
                $up = q("UPDATE bookings SET booking_status = 'confirmed', pickup_stop_id = ?, booking_time = ?, cancelled_at = NULL WHERE booking_id = ? AND booking_status = 'cancelled'", [$stopId, now(), $existing['booking_id']]);
                if ($up->rowCount() < 1) {
                    throw new ApiError('You already have a seat on this ride.', 409);
                }
                $bid = (int)$existing['booking_id'];
            } else {
                q("INSERT INTO bookings (passenger_id, schedule_id, pickup_stop_id, booking_status, booking_time) VALUES (?,?,?,'confirmed',?)", [$uid, $sid, $stopId, now()]);
                $bid = last_id();
            }
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') { // UNIQUE(passenger_id, schedule_id)
                throw new ApiError('You already have a seat on this ride.', 409);
            }
            throw $e;
        }
        $booked = (int)q_val('SELECT seats_taken FROM schedules WHERE schedule_id = ?', [$sid]);
        return ['booking_id' => $bid, 'sched' => $s, 'stop' => $stop, 'left' => (int)$s['capacity'] - $booked];
    });

    $s = $res['sched'];
    notify($uid, 'booking', "Seat confirmed on {$s['route_name']} - " . fmt_dt($s['departure_time']) . ", pickup: {$res['stop']['stop_name']}.", '#/passenger/bookings');
    notify((int)$s['driver_id'], 'booking', "New passenger booked {$s['route_name']} ({$res['left']} seats left).", '#/driver/passengers');
    audit($uid, 'book', 'booking', $res['booking_id'], "schedule=$sid");
    out(['booking_id' => $res['booking_id'], 'seats_left' => $res['left']]);
}

function h_cancel_booking(): void
{
    $u = require_role(['passenger']);
    $b = body();
    $errors = validate($b, ['booking_id' => 'Booking|required|int']);
    if ($errors) {
        fail_fields($errors);
    }
    $bid = (int)$b['booking_id'];
    $uid = (int)$u['user_id'];
    $s = tx(function () use ($bid, $uid) {
        $bk = q_one('SELECT * FROM bookings WHERE booking_id = ? AND passenger_id = ? FOR UPDATE', [$bid, $uid]);
        if (!$bk) {
            throw new ApiError('Booking not found.', 404);
        }
        if ($bk['booking_status'] !== 'confirmed') {
            throw new ApiError('This booking is already cancelled.', 409);
        }
        $s = q_one('SELECT s.*, r.route_name FROM schedules s JOIN routes r ON r.route_id = s.route_id WHERE s.schedule_id = ? FOR UPDATE', [$bk['schedule_id']]);
        if ($s['status'] !== 'scheduled') {
            throw new ApiError('Only upcoming rides can be cancelled.', 409);
        }
        $cut = (int)cfg('cancel_cutoff_min');
        if (strtotime($s['departure_time']) - time() < $cut * 60) {
            throw new ApiError("Cancellation closes $cut minutes before departure.", 409);
        }
        $up = q("UPDATE bookings SET booking_status = 'cancelled', cancelled_at = ? WHERE booking_id = ? AND booking_status = 'confirmed'", [now(), $bid]);
        if ($up->rowCount() < 1) {
            throw new ApiError('This booking is already cancelled.', 409);
        }
        q('UPDATE schedules SET seats_taken = seats_taken - 1 WHERE schedule_id = ? AND seats_taken > 0', [$s['schedule_id']]);
        return $s;
    });
    notify($uid, 'cancel', "Your booking on {$s['route_name']} (" . fmt_dt($s['departure_time']) . ') was cancelled.', '#/passenger/bookings');
    notify((int)$s['driver_id'], 'cancel', "A passenger cancelled on {$s['route_name']} (" . fmt_dt($s['departure_time']) . ').', '#/driver/passengers');
    audit($uid, 'cancel_booking', 'booking', $bid, 'schedule=' . $s['schedule_id']);
    out([]);
}

function h_my_bookings(): void
{
    $u = require_role(['passenger']);
    $rows = q_all("SELECT b.booking_id, b.booking_status, b.booking_time, b.cancelled_at, b.pickup_stop_id, ps.stop_name AS pickup_name,
            s.schedule_id, s.departure_time, s.duration_min, s.status AS ride_status, s.delay_minutes, s.driver_id,
            r.route_name, r.start_point, r.destination, d.name AS driver_name, v.vehicle_number,
            rv.rating AS my_rating
        FROM bookings b
        JOIN schedules s ON s.schedule_id = b.schedule_id
        JOIN routes r ON r.route_id = s.route_id
        JOIN users d ON d.user_id = s.driver_id
        JOIN vehicles v ON v.vehicle_id = s.vehicle_id
        JOIN route_stops ps ON ps.stop_id = b.pickup_stop_id
        LEFT JOIN reviews rv ON rv.schedule_id = s.schedule_id AND rv.passenger_id = b.passenger_id
        WHERE b.passenger_id = ? ORDER BY s.departure_time DESC LIMIT 200", [$u['user_id']]);
    $cut = (int)cfg('cancel_cutoff_min') * 60;
    $res = [];
    foreach ($rows as $r) {
        $conf = $r['booking_status'] === 'confirmed';
        $upcoming = $conf && $r['ride_status'] === 'scheduled';
        $res[] = [
            'booking_id' => (int)$r['booking_id'], 'booking_status' => $r['booking_status'], 'booking_time' => $r['booking_time'],
            'cancelled_at' => $r['cancelled_at'], 'pickup_name' => $r['pickup_name'], 'schedule_id' => (int)$r['schedule_id'],
            'departure_time' => $r['departure_time'], 'duration_min' => (int)$r['duration_min'], 'ride_status' => $r['ride_status'],
            'delay_minutes' => (int)$r['delay_minutes'], 'route_name' => $r['route_name'], 'start_point' => $r['start_point'],
            'destination' => $r['destination'], 'driver_name' => $r['driver_name'], 'vehicle_number' => $r['vehicle_number'],
            'my_rating' => $r['my_rating'] === null ? null : (int)$r['my_rating'],
            'can_cancel' => $upcoming && strtotime($r['departure_time']) - time() >= $cut,
            'can_review' => $conf && $r['ride_status'] === 'completed' && $r['my_rating'] === null,
            'bucket' => $upcoming ? 'upcoming' : 'history',
        ];
    }
    out(['bookings' => $res]);
}

function h_review(): void
{
    $u = require_role(['passenger']);
    $b = body();
    $errors = validate($b, [
        'schedule_id' => 'Ride|required|int', 'rating' => 'Rating|required|between:1,5', 'comment' => 'Comment|max:500',
    ]);
    if ($errors) {
        fail_fields($errors);
    }
    $sid = (int)$b['schedule_id'];
    $uid = (int)$u['user_id'];
    $s = q_one("SELECT s.* FROM schedules s JOIN bookings b ON b.schedule_id = s.schedule_id
        WHERE s.schedule_id = ? AND b.passenger_id = ? AND b.booking_status = 'confirmed'", [$sid, $uid]);
    if (!$s) {
        fail('You can only review rides you travelled on.', 403);
    }
    if ($s['status'] !== 'completed') {
        fail('You can review a ride after it is completed.', 409);
    }
    if (q_val('SELECT COUNT(*) FROM reviews WHERE passenger_id = ? AND schedule_id = ?', [$uid, $sid])) {
        fail('You already reviewed this ride.', 409);
    }
    q('INSERT INTO reviews (passenger_id, driver_id, schedule_id, rating, comment, created_at) VALUES (?,?,?,?,?,?)', [
        $uid, $s['driver_id'], $sid, (int)$b['rating'], str_in($b, 'comment'), now(),
    ]);
    notify((int)$s['driver_id'], 'review', 'You received a ' . (int)$b['rating'] . '-star rating.', '#/driver/trips');
    audit($uid, 'review', 'schedule', $sid, 'rating=' . (int)$b['rating']);
    out([]);
}

function h_my_reviews(): void
{
    $u = require_role(['passenger']);
    $rows = q_all('SELECT rv.rating, rv.comment, rv.created_at, d.name AS driver_name, r.route_name, s.departure_time
        FROM reviews rv JOIN schedules s ON s.schedule_id = rv.schedule_id JOIN routes r ON r.route_id = s.route_id
        JOIN users d ON d.user_id = rv.driver_id WHERE rv.passenger_id = ? ORDER BY rv.created_at DESC LIMIT 100', [$u['user_id']]);
    foreach ($rows as &$r) {
        $r['rating'] = (int)$r['rating'];
    }
    out(['reviews' => $rows]);
}

function h_complaint(): void
{
    $u = require_role(['passenger']);
    $b = body();
    $errors = validate($b, [
        'subject' => 'Subject|required|min:4|max:120', 'description' => 'Description|required|min:10|max:1000',
        'booking_id' => 'Booking|int',
    ]);
    if ($errors) {
        fail_fields($errors);
    }
    $bid = null;
    if (str_in($b, 'booking_id') !== '' && (int)$b['booking_id'] > 0) {
        if (!q_val('SELECT COUNT(*) FROM bookings WHERE booking_id = ? AND passenger_id = ?', [(int)$b['booking_id'], $u['user_id']])) {
            fail_fields(['booking_id' => 'Choose one of your own bookings.']);
        }
        $bid = (int)$b['booking_id'];
    }
    q('INSERT INTO complaints (user_id, booking_id, subject, description, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [
        $u['user_id'], $bid, str_in($b, 'subject'), str_in($b, 'description'), 'open', now(), now(),
    ]);
    $id = last_id();
    notify_role('admin', 'complaint', 'New complaint: ' . str_in($b, 'subject'), '#/admin/complaints');
    audit((int)$u['user_id'], 'complaint', 'complaint', $id, str_in($b, 'subject'));
    out(['complaint_id' => $id]);
}

function h_my_complaints(): void
{
    $u = require_role(['passenger']);
    $rows = q_all('SELECT complaint_id, booking_id, subject, description, status, admin_response, created_at, updated_at
        FROM complaints WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [$u['user_id']]);
    out(['complaints' => $rows]);
}

function h_notifications(): void
{
    $u = require_login();
    $rows = q_all('SELECT notification_id, type, message, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT 60', [$u['user_id']]);
    foreach ($rows as &$r) {
        $r['notification_id'] = (int)$r['notification_id'];
        $r['is_read'] = (int)$r['is_read'];
    }
    out(['notifications' => $rows, 'unread' => (int)q_val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [$u['user_id']])]);
}

function h_notif_read(): void
{
    $u = require_login();
    $b = body();
    if (isset($b['id']) && (int)$b['id'] > 0) {
        q('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?', [(int)$b['id'], $u['user_id']]);
    } else {
        q('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [$u['user_id']]);
    }
    out(['unread' => (int)q_val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [$u['user_id']])]);
}
