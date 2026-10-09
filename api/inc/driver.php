<?php
/* Driver endpoints */

function driver_owns(int $sid, int $uid): array
{
    $s = q_one('SELECT s.*, r.route_name FROM schedules s JOIN routes r ON r.route_id = s.route_id WHERE s.schedule_id = ? AND s.driver_id = ?', [$sid, $uid]);
    if (!$s) {
        fail('Trip not found or not assigned to you.', 404);
    }
    return $s;
}

function h_driver_trips(): void
{
    $u = require_role(['driver']);
    $rows = q_all("SELECT s.schedule_id, s.departure_time, s.duration_min, s.status, s.delay_minutes, s.notes,
            r.route_name, r.start_point, r.destination, v.vehicle_number, v.vehicle_type, v.capacity,
            (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id = s.schedule_id AND b.booking_status = 'confirmed') AS booked,
            (SELECT AVG(rating) FROM reviews rv WHERE rv.schedule_id = s.schedule_id) AS avg_rating
        FROM schedules s JOIN routes r ON r.route_id = s.route_id JOIN vehicles v ON v.vehicle_id = s.vehicle_id
        WHERE s.driver_id = ? ORDER BY s.departure_time DESC LIMIT 200", [$u['user_id']]);
    $trips = [];
    foreach ($rows as $r) {
        $active = in_array($r['status'], ['scheduled', 'in_progress'], true);
        $trips[] = [
            'schedule_id' => (int)$r['schedule_id'], 'departure_time' => $r['departure_time'], 'duration_min' => (int)$r['duration_min'],
            'status' => $r['status'], 'delay_minutes' => (int)$r['delay_minutes'], 'notes' => $r['notes'],
            'route_name' => $r['route_name'], 'start_point' => $r['start_point'], 'destination' => $r['destination'],
            'vehicle_number' => $r['vehicle_number'], 'vehicle_type' => $r['vehicle_type'], 'capacity' => (int)$r['capacity'],
            'booked' => (int)$r['booked'], 'avg_rating' => $r['avg_rating'] === null ? null : round((float)$r['avg_rating'], 1),
            'bucket' => $active ? 'current' : 'previous',
        ];
    }
    $avg = q_val('SELECT AVG(rating) FROM reviews WHERE driver_id = ?', [$u['user_id']]);
    out([
        'trips' => $trips,
        'summary' => [
            'completed' => (int)q_val("SELECT COUNT(*) FROM schedules WHERE driver_id = ? AND status = 'completed'", [$u['user_id']]),
            'upcoming' => (int)q_val("SELECT COUNT(*) FROM schedules WHERE driver_id = ? AND status IN ('scheduled','in_progress')", [$u['user_id']]),
            'rating' => $avg === null ? null : round((float)$avg, 1),
            'reviews' => (int)q_val('SELECT COUNT(*) FROM reviews WHERE driver_id = ?', [$u['user_id']]),
        ],
    ]);
}

function h_trip_passengers(): void
{
    $u = require_role(['driver']);
    $sid = (int)($_GET['id'] ?? 0);
    $s = driver_owns($sid, (int)$u['user_id']);
    $rows = q_all("SELECT b.booking_id, p.name, p.phone, ps.stop_name AS pickup_name, ps.stop_order, b.booking_time
        FROM bookings b JOIN users p ON p.user_id = b.passenger_id JOIN route_stops ps ON ps.stop_id = b.pickup_stop_id
        WHERE b.schedule_id = ? AND b.booking_status = 'confirmed' ORDER BY ps.stop_order, p.name", [$sid]);
    out(['trip' => ['schedule_id' => $sid, 'route_name' => $s['route_name'], 'departure_time' => $s['departure_time'], 'status' => $s['status']], 'passengers' => $rows]);
}

function h_trip_status(): void
{
    $u = require_role(['driver']);
    $b = body();
    $errors = validate($b, ['schedule_id' => 'Trip|required|int', 'status' => 'Status|required|in:in_progress,completed']);
    if ($errors) {
        fail_fields($errors);
    }
    $sid = (int)$b['schedule_id'];
    $new = (string)$b['status'];
    $s = driver_owns($sid, (int)$u['user_id']);
    $ok = ($s['status'] === 'scheduled' && $new === 'in_progress') || ($s['status'] === 'in_progress' && $new === 'completed');
    if (!$ok) {
        fail('A ' . str_replace('_', ' ', $s['status']) . ' trip cannot be changed to ' . str_replace('_', ' ', $new) . '.', 409);
    }
    if ($new === 'in_progress' && cfg('strict_timing') && strtotime($s['departure_time']) - time() > 1800) {
        fail('You can start a trip only within 30 minutes of departure.', 409);
    }
    q('UPDATE schedules SET status = ?, updated_at = ? WHERE schedule_id = ? AND status = ?', [$new, now(), $sid, $s['status']]);
    $msg = $new === 'in_progress'
        ? "Your ride {$s['route_name']} has started."
        : "Your ride {$s['route_name']} is completed. Please rate your trip!";
    foreach (q_all("SELECT passenger_id FROM bookings WHERE schedule_id = ? AND booking_status = 'confirmed'", [$sid]) as $p) {
        notify((int)$p['passenger_id'], 'status', $msg, $new === 'completed' ? '#/passenger/history' : '#/passenger/bookings');
    }
    notify_role('manager', 'status', "Driver {$u['name']} marked {$s['route_name']} (" . fmt_dt($s['departure_time']) . ') as ' . str_replace('_', ' ', $new) . '.', '#/manager/schedules');
    audit((int)$u['user_id'], 'trip_status', 'schedule', $sid, $new);
    out(['status' => $new]);
}

function h_delay_report(): void
{
    $u = require_role(['driver']);
    $b = body();
    $errors = validate($b, [
        'schedule_id' => 'Trip|required|int', 'report_type' => 'Report type|required|in:delay,vehicle_problem',
        'delay_minutes' => 'Delay (minutes)|int|between:0,600', 'message' => 'Message|required|min:5|max:300',
    ]);
    if (!isset($errors['delay_minutes']) && ($b['report_type'] ?? '') === 'delay' && (int)($b['delay_minutes'] ?? 0) < 1) {
        $errors['delay_minutes'] = 'Delay (minutes) must be between 1 and 600.';
    }
    if ($errors) {
        fail_fields($errors);
    }
    $sid = (int)$b['schedule_id'];
    $s = driver_owns($sid, (int)$u['user_id']);
    if (!in_array($s['status'], ['scheduled', 'in_progress'], true)) {
        fail('You can only report on active trips.', 409);
    }
    $type = (string)$b['report_type'];
    $mins = $type === 'delay' ? (int)$b['delay_minutes'] : 0;
    q('INSERT INTO delay_reports (schedule_id, driver_id, report_type, delay_minutes, message, created_at) VALUES (?,?,?,?,?,?)', [
        $sid, $u['user_id'], $type, $mins, str_in($b, 'message'), now(),
    ]);
    $rid = last_id();
    if ($type === 'delay') {
        q('UPDATE schedules SET delay_minutes = ?, updated_at = ? WHERE schedule_id = ?', [$mins, now(), $sid]);
        $msg = "Delay alert: {$s['route_name']} (" . fmt_dt($s['departure_time']) . ") is running about $mins min late.";
        foreach (q_all("SELECT passenger_id FROM bookings WHERE schedule_id = ? AND booking_status = 'confirmed'", [$sid]) as $p) {
            notify((int)$p['passenger_id'], 'delay', $msg, '#/passenger/bookings');
        }
        notify_role('manager', 'delay', "Driver {$u['name']} reported a $mins min delay on {$s['route_name']}.", '#/manager/overview');
    } else {
        notify_role('manager', 'vehicle', "Vehicle problem reported by {$u['name']} on {$s['route_name']}: " . mb_substr(str_in($b, 'message'), 0, 120), '#/manager/overview');
    }
    audit((int)$u['user_id'], 'delay_report', 'schedule', $sid, "$type $mins");
    out(['report_id' => $rid]);
}

function h_delay_reports(): void
{
    $u = require_role(['driver']);
    $rows = q_all('SELECT d.report_id, d.report_type, d.delay_minutes, d.message, d.created_at, r.route_name, s.departure_time
        FROM delay_reports d JOIN schedules s ON s.schedule_id = d.schedule_id JOIN routes r ON r.route_id = s.route_id
        WHERE d.driver_id = ? ORDER BY d.report_id DESC LIMIT 100', [$u['user_id']]);
    out(['reports' => $rows]);
}
