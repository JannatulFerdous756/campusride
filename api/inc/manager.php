<?php
/* Transport manager endpoints (admins may use them too) */

function mgr(): array
{
    return require_role(['manager', 'admin']);
}

/* ---------------------------------------------------------------- routes */

function h_manager_routes(): void
{
    mgr();
    $res = [];
    foreach (q_all('SELECT * FROM routes ORDER BY is_active DESC, route_name') as $r) {
        $x = route_with_stops($r);
        $x['schedules'] = (int)q_val('SELECT COUNT(*) FROM schedules WHERE route_id = ?', [$r['route_id']]);
        $res[] = $x;
    }
    out(['routes' => $res]);
}

function h_route_save(): void
{
    $u = mgr();
    $b = body();
    $errors = validate($b, [
        'route_name' => 'Route name|required|min:3|max:100',
        'is_active' => 'Status|in:0,1',
    ]);
    $stops = isset($b['stops']) && is_array($b['stops']) ? array_values($b['stops']) : [];
    $clean = [];
    $prev = -1;
    foreach ($stops as $i => $s) {
        $s = is_array($s) ? $s : [];
        $e = validate($s, ['stop_name' => 'Stop name|required|min:2|max:100', 'minutes_from_start' => 'Minutes|required|int|between:0,600']);
        if ($e) {
            $errors['stops'] = 'Stop ' . ($i + 1) . ': ' . reset($e);
            break;
        }
        $m = (int)$s['minutes_from_start'];
        if ($i === 0) {
            $m = 0;
        }
        if ($m < $prev) {
            $errors['stops'] = 'Stop ' . ($i + 1) . ': minutes must not decrease along the route.';
            break;
        }
        $prev = $m;
        $clean[] = ['id' => (int)($s['stop_id'] ?? 0), 'name' => preg_replace('/\s+/', ' ', trim((string)$s['stop_name'])), 'min' => $m];
    }
    if (!isset($errors['stops']) && count($clean) < 2) {
        $errors['stops'] = 'Add at least two stops (start and destination).';
    }
    if (!isset($errors['stops'])) {
        $names = array_map(function ($c) {
            return mb_strtolower($c['name']);
        }, $clean);
        if (count(array_unique($names)) !== count($names)) {
            $errors['stops'] = 'Stop names must be unique within a route.';
        }
    }
    if ($errors) {
        fail_fields($errors);
    }
    $rid = (int)($b['route_id'] ?? 0);
    $active = isset($b['is_active']) && (string)$b['is_active'] === '0' ? 0 : 1;
    $start = $clean[0]['name'];
    $dest = $clean[count($clean) - 1]['name'];

    $rid = tx(function () use ($rid, $b, $clean, $start, $dest, $active) {
        if ($rid > 0) {
            if (!q_val('SELECT COUNT(*) FROM routes WHERE route_id = ?', [$rid])) {
                throw new ApiError('Route not found.', 404);
            }
            q('UPDATE routes SET route_name = ?, start_point = ?, destination = ?, is_active = ? WHERE route_id = ?', [str_in($b, 'route_name'), $start, $dest, $active, $rid]);
            $keep = [];
            foreach ($clean as $i => $c) {
                if ($c['id'] > 0 && q_val('SELECT COUNT(*) FROM route_stops WHERE stop_id = ? AND route_id = ?', [$c['id'], $rid])) {
                    q('UPDATE route_stops SET stop_name = ?, stop_order = ?, minutes_from_start = ? WHERE stop_id = ?', [$c['name'], $i + 1, $c['min'], $c['id']]);
                    $keep[] = $c['id'];
                } else {
                    q('INSERT INTO route_stops (route_id, stop_name, stop_order, minutes_from_start) VALUES (?,?,?,?)', [$rid, $c['name'], $i + 1, $c['min']]);
                    $keep[] = last_id();
                }
            }
            foreach (q_all('SELECT stop_id, stop_name FROM route_stops WHERE route_id = ?', [$rid]) as $old) {
                if (!in_array((int)$old['stop_id'], $keep, true)) {
                    if (q_val('SELECT COUNT(*) FROM bookings WHERE pickup_stop_id = ?', [$old['stop_id']])) {
                        throw new ApiError("Stop \"{$old['stop_name']}\" has bookings and cannot be removed.", 409);
                    }
                    q('DELETE FROM route_stops WHERE stop_id = ?', [$old['stop_id']]);
                }
            }
        } else {
            q('INSERT INTO routes (route_name, start_point, destination, is_active, created_at) VALUES (?,?,?,?,?)', [str_in($b, 'route_name'), $start, $dest, $active, now()]);
            $rid = last_id();
            foreach ($clean as $i => $c) {
                q('INSERT INTO route_stops (route_id, stop_name, stop_order, minutes_from_start) VALUES (?,?,?,?)', [$rid, $c['name'], $i + 1, $c['min']]);
            }
        }
        return $rid;
    });
    audit((int)$u['user_id'], isset($b['route_id']) && (int)$b['route_id'] > 0 ? 'route_update' : 'route_create', 'route', $rid, str_in($b, 'route_name'));
    out(['route_id' => $rid]);
}

function h_route_delete(): void
{
    $u = mgr();
    $id = (int)(body()['route_id'] ?? 0);
    if (!q_val('SELECT COUNT(*) FROM routes WHERE route_id = ?', [$id])) {
        fail('Route not found.', 404);
    }
    if (q_val('SELECT COUNT(*) FROM schedules WHERE route_id = ?', [$id])) {
        fail('This route has schedules. Deactivate it instead of deleting.', 409);
    }
    q('DELETE FROM routes WHERE route_id = ?', [$id]);
    audit((int)$u['user_id'], 'route_delete', 'route', $id);
    out([]);
}

/* -------------------------------------------------------------- vehicles */

function h_vehicles(): void
{
    mgr();
    $rows = q_all("SELECT v.*, (SELECT COUNT(*) FROM schedules s WHERE s.vehicle_id = v.vehicle_id AND s.status IN ('scheduled','in_progress') AND s.departure_time > ?) AS upcoming
        FROM vehicles v ORDER BY v.vehicle_number", [date('Y-m-d H:i:s', time() - 86400)]);
    foreach ($rows as &$r) {
        $r['vehicle_id'] = (int)$r['vehicle_id'];
        $r['capacity'] = (int)$r['capacity'];
        $r['upcoming'] = (int)$r['upcoming'];
    }
    out(['vehicles' => $rows]);
}

function h_vehicle_save(): void
{
    $u = mgr();
    $b = body();
    $errors = validate($b, [
        'vehicle_number' => 'Vehicle number|required|min:3|max:30',
        'vehicle_type' => 'Vehicle type|required|in:Bus,Minibus,Microbus,Van,Car',
        'capacity' => 'Capacity|required|between:1,80',
        'vehicle_status' => 'Status|required|in:available,maintenance,retired',
    ]);
    $id = (int)($b['vehicle_id'] ?? 0);
    $num = strtoupper(str_in($b, 'vehicle_number'));
    if (!isset($errors['vehicle_number']) && q_val('SELECT COUNT(*) FROM vehicles WHERE vehicle_number = ? AND vehicle_id <> ?', [$num, $id])) {
        $errors['vehicle_number'] = 'This vehicle number already exists.';
    }
    if (!$errors && $id > 0) {
        $maxBooked = (int)q_val("SELECT COALESCE(MAX(c), 0) FROM (SELECT COUNT(*) AS c FROM bookings b JOIN schedules s ON s.schedule_id = b.schedule_id
            WHERE s.vehicle_id = ? AND s.status = 'scheduled' AND b.booking_status = 'confirmed' GROUP BY s.schedule_id) t", [$id]);
        if ((int)$b['capacity'] < $maxBooked) {
            $errors['capacity'] = "Capacity cannot be below $maxBooked (seats already booked on an upcoming ride).";
        }
    }
    if ($errors) {
        fail_fields($errors);
    }
    if ($id > 0) {
        if (!q_val('SELECT COUNT(*) FROM vehicles WHERE vehicle_id = ?', [$id])) {
            fail('Vehicle not found.', 404);
        }
        q('UPDATE vehicles SET vehicle_number = ?, vehicle_type = ?, capacity = ?, vehicle_status = ? WHERE vehicle_id = ?', [$num, $b['vehicle_type'], (int)$b['capacity'], $b['vehicle_status'], $id]);
    } else {
        q('INSERT INTO vehicles (vehicle_number, vehicle_type, capacity, vehicle_status, created_at) VALUES (?,?,?,?,?)', [$num, $b['vehicle_type'], (int)$b['capacity'], $b['vehicle_status'], now()]);
        $id = last_id();
    }
    if ($b['vehicle_status'] !== 'available') {
        notify_role('manager', 'vehicle', "Vehicle $num is now " . $b['vehicle_status'] . '. Check its upcoming rides.', '#/manager/vehicles');
    }
    audit((int)$u['user_id'], 'vehicle_save', 'vehicle', $id, $num);
    out(['vehicle_id' => $id]);
}

function h_vehicle_delete(): void
{
    $u = mgr();
    $id = (int)(body()['vehicle_id'] ?? 0);
    if (q_val('SELECT COUNT(*) FROM schedules WHERE vehicle_id = ?', [$id])) {
        fail('This vehicle is used by schedules. Mark it as retired instead.', 409);
    }
    q('DELETE FROM vehicles WHERE vehicle_id = ?', [$id]);
    audit((int)$u['user_id'], 'vehicle_delete', 'vehicle', $id);
    out([]);
}

function h_drivers(): void
{
    mgr();
    $rows = q_all("SELECT u.user_id, u.name, u.phone,
        (SELECT COUNT(*) FROM schedules s WHERE s.driver_id = u.user_id AND s.status IN ('scheduled','in_progress') AND s.departure_time > ?) AS upcoming,
        (SELECT AVG(rating) FROM reviews rv WHERE rv.driver_id = u.user_id) AS rating
        FROM users u WHERE u.role = 'driver' AND u.status = 'active' ORDER BY u.name", [now()]);
    foreach ($rows as &$r) {
        $r['user_id'] = (int)$r['user_id'];
        $r['upcoming'] = (int)$r['upcoming'];
        $r['rating'] = $r['rating'] === null ? null : round((float)$r['rating'], 1);
    }
    out(['drivers' => $rows]);
}

/* ------------------------------------------------------------- schedules */

function sched_conflict(int $vehicleId, int $driverId, string $dep, int $dur, int $exceptId): ?string
{
    $buf = 30 * 60;
    $start = strtotime($dep);
    $end = $start + $dur * 60 + $buf;
    $rows = q_all("SELECT s.schedule_id, s.vehicle_id, s.driver_id, s.departure_time, s.duration_min, r.route_name FROM schedules s JOIN routes r ON r.route_id = s.route_id
        WHERE s.status IN ('scheduled','in_progress') AND (s.vehicle_id = ? OR s.driver_id = ?) AND s.schedule_id <> ?
        AND s.departure_time > ? AND s.departure_time < ?", [$vehicleId, $driverId, $exceptId, date('Y-m-d H:i:s', $start - 86400), date('Y-m-d H:i:s', $end)]);
    foreach ($rows as $o) {
        $os = strtotime($o['departure_time']);
        $oe = $os + (int)$o['duration_min'] * 60 + $buf;
        if ($os < $end && $oe > $start) {
            $who = (int)$o['vehicle_id'] === $vehicleId ? 'vehicle' : 'driver';
            return "The $who is already assigned to {$o['route_name']} at " . fmt_dt($o['departure_time']) . ' (30 min buffer applies).';
        }
    }
    return null;
}

function h_manager_schedules(): void
{
    mgr();
    $scope = str_in($_GET, 'scope');
    $sql = sched_select();
    $p = [];
    if ($scope === 'past') {
        $sql .= " WHERE s.status IN ('completed','cancelled') OR s.departure_time < ? ORDER BY s.departure_time DESC LIMIT 100";
        $p[] = date('Y-m-d H:i:s', time() - 6 * 3600);
    } else {
        $sql .= " WHERE s.status IN ('scheduled','in_progress') AND s.departure_time >= ? ORDER BY s.departure_time LIMIT 200";
        $p[] = date('Y-m-d H:i:s', time() - 6 * 3600);
    }
    $res = [];
    foreach (q_all($sql, $p) as $s) {
        $x = shape_sched($s);
        $x['route_id'] = (int)$s['route_id'];
        $x['vehicle_id'] = (int)$s['vehicle_id'];
        $x['driver_id'] = (int)$s['driver_id'];
        $x['cancel_reason'] = $s['cancel_reason'];
        $res[] = $x;
    }
    out(['schedules' => $res]);
}

function h_schedule_save(): void
{
    $u = mgr();
    $b = body();
    $errors = validate($b, [
        'route_id' => 'Route|required|int', 'vehicle_id' => 'Vehicle|required|int', 'driver_id' => 'Driver|required|int',
        'departure_time' => 'Departure|required|datetime', 'duration_min' => 'Duration (minutes)|required|between:5,600',
        'notes' => 'Notes|max:255', 'repeat_days' => 'Repeat|between:0,30',
    ]);
    $id = (int)($b['schedule_id'] ?? 0);
    $dep = isset($b['departure_time']) ? parse_dt((string)$b['departure_time']) : null;
    if (!$errors && $id === 0 && $dep <= now()) {
        $errors['departure_time'] = 'Departure must be in the future.';
    }
    if ($errors) {
        fail_fields($errors);
    }
    $route = q_one('SELECT * FROM routes WHERE route_id = ?', [(int)$b['route_id']]);
    $veh = q_one('SELECT * FROM vehicles WHERE vehicle_id = ?', [(int)$b['vehicle_id']]);
    $drv = q_one("SELECT * FROM users WHERE user_id = ? AND role = 'driver'", [(int)$b['driver_id']]);
    if (!$route || !$route['is_active']) {
        $errors['route_id'] = 'Choose an active route.';
    }
    if (!$veh || $veh['vehicle_status'] !== 'available') {
        $errors['vehicle_id'] = 'Choose an available vehicle.';
    }
    if (!$drv || $drv['status'] !== 'active') {
        $errors['driver_id'] = 'Choose an approved driver.';
    }
    if ($errors) {
        fail_fields($errors);
    }
    $dur = (int)$b['duration_min'];
    $notes = str_in($b, 'notes');

    if ($id > 0) {
        $old = q_one("SELECT * FROM schedules WHERE schedule_id = ?", [$id]);
        if (!$old) {
            fail('Schedule not found.', 404);
        }
        if ($old['status'] !== 'scheduled') {
            fail('Only scheduled rides can be edited.', 409);
        }
        $booked = (int)q_val("SELECT COUNT(*) FROM bookings WHERE schedule_id = ? AND booking_status = 'confirmed'", [$id]);
        if ($booked > 0 && (int)$old['route_id'] !== (int)$b['route_id']) {
            fail_fields(['route_id' => 'The route cannot change once passengers have booked. Cancel the ride instead.']);
        }
        if ($booked > (int)$veh['capacity']) {
            fail_fields(['vehicle_id' => "This vehicle has only {$veh['capacity']} seats but $booked are booked."]);
        }
        $c = sched_conflict((int)$veh['vehicle_id'], (int)$drv['user_id'], $dep, $dur, $id);
        if ($c) {
            fail_fields(['departure_time' => $c]);
        }
        q('UPDATE schedules SET route_id = ?, vehicle_id = ?, driver_id = ?, departure_time = ?, duration_min = ?, notes = ?, updated_at = ? WHERE schedule_id = ?',
            [$route['route_id'], $veh['vehicle_id'], $drv['user_id'], $dep, $dur, $notes, now(), $id]);
        $changed = $old['departure_time'] !== $dep || (int)$old['driver_id'] !== (int)$drv['user_id'] || (int)$old['vehicle_id'] !== (int)$veh['vehicle_id'];
        if ($changed) {
            foreach (q_all("SELECT passenger_id FROM bookings WHERE schedule_id = ? AND booking_status = 'confirmed'", [$id]) as $p) {
                notify((int)$p['passenger_id'], 'schedule', "Schedule update: {$route['route_name']} is now " . fmt_dt($dep) . " (vehicle {$veh['vehicle_number']}).", '#/passenger/bookings');
            }
            if ((int)$old['driver_id'] !== (int)$drv['user_id']) {
                notify((int)$old['driver_id'], 'schedule', "You were unassigned from {$route['route_name']} (" . fmt_dt($old['departure_time']) . ').', '#/driver/trips');
            }
        }
        notify((int)$drv['user_id'], 'schedule', "You are assigned to {$route['route_name']} on " . fmt_dt($dep) . '.', '#/driver/trips');
        audit((int)$u['user_id'], 'schedule_update', 'schedule', $id, $dep);
        out(['schedule_id' => $id]);
    }

    $repeat = (int)($b['repeat_days'] ?? 0);
    $created = [];
    $skipped = [];
    for ($i = 0; $i <= $repeat; $i++) {
        $d = date('Y-m-d H:i:s', strtotime($dep . " +$i day"));
        $c = sched_conflict((int)$veh['vehicle_id'], (int)$drv['user_id'], $d, $dur, 0);
        if ($c) {
            if ($i === 0) {
                fail_fields(['departure_time' => $c]);
            }
            $skipped[] = substr($d, 0, 10);
            continue;
        }
        q('INSERT INTO schedules (route_id, vehicle_id, driver_id, departure_time, duration_min, status, delay_minutes, notes, created_by, created_at, updated_at)
            VALUES (?,?,?,?,?,?,0,?,?,?,?)', [$route['route_id'], $veh['vehicle_id'], $drv['user_id'], $d, $dur, 'scheduled', $notes, $u['user_id'], now(), now()]);
        $created[] = last_id();
    }
    notify((int)$drv['user_id'], 'schedule', "New assignment: {$route['route_name']} on " . fmt_dt($dep) . (count($created) > 1 ? ' (+' . (count($created) - 1) . ' more days)' : '') . '.', '#/driver/trips');
    audit((int)$u['user_id'], 'schedule_create', 'schedule', $created[0], count($created) . ' ride(s)');
    out(['created' => count($created), 'skipped' => $skipped, 'schedule_id' => $created[0]]);
}

function h_schedule_cancel(): void
{
    $u = mgr();
    $b = body();
    $errors = validate($b, ['schedule_id' => 'Ride|required|int', 'reason' => 'Reason|required|min:4|max:200']);
    if ($errors) {
        fail_fields($errors);
    }
    $id = (int)$b['schedule_id'];
    $s = q_one('SELECT s.*, r.route_name FROM schedules s JOIN routes r ON r.route_id = s.route_id WHERE s.schedule_id = ?', [$id]);
    if (!$s) {
        fail('Schedule not found.', 404);
    }
    if (!in_array($s['status'], ['scheduled', 'in_progress'], true)) {
        fail('This ride is already ' . $s['status'] . '.', 409);
    }
    tx(function () use ($id, $b) {
        q('SELECT schedule_id FROM schedules WHERE schedule_id = ? FOR UPDATE', [$id]);
        q("UPDATE schedules SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE schedule_id = ?", [str_in($b, 'reason'), now(), $id]);
    });
    foreach (q_all("SELECT passenger_id FROM bookings WHERE schedule_id = ? AND booking_status = 'confirmed'", [$id]) as $p) {
        notify((int)$p['passenger_id'], 'cancel', "Ride cancelled: {$s['route_name']} (" . fmt_dt($s['departure_time']) . '). Reason: ' . str_in($b, 'reason'), '#/passenger/history');
    }
    notify((int)$s['driver_id'], 'cancel', "Trip cancelled: {$s['route_name']} (" . fmt_dt($s['departure_time']) . ').', '#/driver/trips');
    audit((int)$u['user_id'], 'schedule_cancel', 'schedule', $id, str_in($b, 'reason'));
    out([]);
}

function h_schedule_bookings(): void
{
    mgr();
    $id = (int)($_GET['id'] ?? 0);
    $rows = q_all("SELECT p.name, p.email, p.phone, ps.stop_name AS pickup_name, b.booking_status, b.booking_time
        FROM bookings b JOIN users p ON p.user_id = b.passenger_id JOIN route_stops ps ON ps.stop_id = b.pickup_stop_id
        WHERE b.schedule_id = ? ORDER BY b.booking_status, ps.stop_order, p.name", [$id]);
    out(['bookings' => $rows]);
}

function h_manager_overview(): void
{
    mgr();
    $weekAgo = date('Y-m-d H:i:s', time() - 7 * 86400);
    $upcoming = [];
    foreach (q_all(sched_select() . " WHERE s.status IN ('scheduled','in_progress') AND s.departure_time >= ? ORDER BY s.departure_time LIMIT 12", [date('Y-m-d H:i:s', time() - 6 * 3600)]) as $s) {
        $upcoming[] = shape_sched($s);
    }
    $alerts = q_all("SELECT d.report_id, d.report_type, d.delay_minutes, d.message, d.created_at, u.name AS driver_name, r.route_name, s.departure_time
        FROM delay_reports d JOIN users u ON u.user_id = d.driver_id JOIN schedules s ON s.schedule_id = d.schedule_id JOIN routes r ON r.route_id = s.route_id
        WHERE d.created_at > ? ORDER BY d.report_id DESC LIMIT 15", [$weekAgo]);
    $cancelled = q_all("SELECT s.schedule_id, s.departure_time, s.cancel_reason, r.route_name FROM schedules s JOIN routes r ON r.route_id = s.route_id
        WHERE s.status = 'cancelled' AND s.updated_at > ? ORDER BY s.updated_at DESC LIMIT 10", [$weekAgo]);
    $veh = q_all('SELECT vehicle_status, COUNT(*) AS c FROM vehicles GROUP BY vehicle_status');
    $vc = ['available' => 0, 'maintenance' => 0, 'retired' => 0];
    foreach ($veh as $v) {
        $vc[$v['vehicle_status']] = (int)$v['c'];
    }
    out([
        'upcoming' => $upcoming, 'alerts' => $alerts, 'cancelled' => $cancelled, 'vehicles' => $vc,
        'totals' => [
            'confirmed' => (int)q_val("SELECT COUNT(*) FROM bookings b JOIN schedules s ON s.schedule_id = b.schedule_id WHERE b.booking_status = 'confirmed' AND s.status = 'scheduled'"),
            'rides' => (int)q_val("SELECT COUNT(*) FROM schedules WHERE status = 'scheduled' AND departure_time > ?", [now()]),
            'routes' => (int)q_val('SELECT COUNT(*) FROM routes WHERE is_active = 1'),
            'drivers' => (int)q_val("SELECT COUNT(*) FROM users WHERE role = 'driver' AND status = 'active'"),
        ],
    ]);
}
