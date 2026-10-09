<?php
/* Auth + public endpoints */

function h_me(): void
{
    $u = current_user();
    $unread = 0;
    if ($u) {
        $unread = (int)q_val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [$u['user_id']]);
    }
    out([
        'user' => $u ? user_public($u) : null,
        'csrf' => $_SESSION['csrf'],
        'unread' => $unread,
        'server_time' => now(),
        'cancel_cutoff_min' => (int)cfg('cancel_cutoff_min'),
    ]);
}

function h_check_email(): void
{
    $email = strtolower(str_in($_GET, 'email'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        out(['available' => false, 'valid' => false]);
    }
    $_SESSION['email_checks'] = (int)($_SESSION['email_checks'] ?? 0) + 1;
    if ($_SESSION['email_checks'] > 60) {
        fail('Too many checks. Please slow down.', 429);
    }
    $exists = (int)q_val('SELECT COUNT(*) FROM users WHERE email = ?', [$email]) > 0;
    out(['available' => !$exists, 'valid' => true]);
}

function h_register(): void
{
    $b = body();
    $errors = validate($b, [
        'name' => 'Full name|required|name',
        'email' => 'Email|required|email|max:190',
        'phone' => 'Phone|required|phone',
        'role' => 'Account type|required|in:passenger,driver',
        'password' => 'Password|required|password|max:100',
        'password2' => 'Confirm password|required|same:password',
    ]);
    $email = strtolower(str_in($b, 'email'));
    if (!isset($errors['email']) && q_val('SELECT COUNT(*) FROM users WHERE email = ?', [$email])) {
        $errors['email'] = 'This email is already registered.';
    }
    if ($errors) {
        fail_fields($errors);
    }
    $role = str_in($b, 'role');
    $status = $role === 'driver' ? 'pending' : 'active';
    q('INSERT INTO users (name, email, phone, password_hash, role, status, created_at) VALUES (?,?,?,?,?,?,?)', [
        preg_replace('/\s+/', ' ', str_in($b, 'name')), $email, str_in($b, 'phone'),
        password_hash((string)$b['password'], PASSWORD_DEFAULT), $role, $status, now(),
    ]);
    $id = last_id();
    audit($id, 'register', 'user', $id, "role=$role");
    if ($role === 'driver') {
        notify_role('admin', 'approval', 'New driver registration waiting for approval: ' . str_in($b, 'name'), '#/admin/users');
        out(['pending' => true, 'message' => 'Account created. An admin must approve your driver account before you can take trips.']);
    }
    notify($id, 'info', 'Welcome to CampusRide! Search a ride and book your first seat.', '#/passenger/search');
    $u = q_one('SELECT * FROM users WHERE user_id = ?', [$id]);
    login_user($u, false);
    out(['user' => user_public($u), 'csrf' => $_SESSION['csrf']]);
}

function h_login(): void
{
    $b = body();
    $errors = validate($b, ['email' => 'Email|required|email', 'password' => 'Password|required']);
    if ($errors) {
        fail_fields($errors);
    }
    $email = strtolower(str_in($b, 'email'));
    $ip = client_ip();
    $since = date('Y-m-d H:i:s', time() - 600);
    q('DELETE FROM login_attempts WHERE attempted_at < ?', [date('Y-m-d H:i:s', time() - 86400)]);
    $byEmail = (int)q_val('SELECT COUNT(*) FROM login_attempts WHERE email = ? AND success = 0 AND attempted_at > ?', [$email, $since]);
    $byIp = (int)q_val('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND success = 0 AND attempted_at > ?', [$ip, $since]);
    if ($byEmail >= 5 || $byIp >= 25) {
        fail('Too many failed attempts. Please wait 10 minutes and try again.', 429);
    }
    $u = q_one('SELECT * FROM users WHERE email = ?', [$email]);
    if (!$u || !password_verify((string)$b['password'], $u['password_hash'])) {
        q('INSERT INTO login_attempts (ip, email, success, attempted_at) VALUES (?,?,0,?)', [$ip, $email, now()]);
        fail('Incorrect email or password.', 401);
    }
    if ($u['status'] === 'suspended') {
        fail('This account has been suspended. Contact the administrator.', 403);
    }
    q('INSERT INTO login_attempts (ip, email, success, attempted_at) VALUES (?,?,1,?)', [$ip, $email, now()]);
    q('DELETE FROM login_attempts WHERE email = ? AND success = 0', [$email]);
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        q('UPDATE users SET password_hash = ? WHERE user_id = ?', [password_hash((string)$b['password'], PASSWORD_DEFAULT), $u['user_id']]);
    }
    login_user($u, !empty($b['remember']));
    audit((int)$u['user_id'], 'login', 'user', (int)$u['user_id'], !empty($b['remember']) ? 'remember=1' : '');
    out(['user' => user_public($u), 'csrf' => $_SESSION['csrf']]);
}

function h_logout(): void
{
    $u = current_user();
    if ($u) {
        audit((int)$u['user_id'], 'logout', 'user', (int)$u['user_id']);
    }
    logout_user();
    out(['csrf' => $_SESSION['csrf']]);
}

function h_locations(): void
{
    $rows = q_all('SELECT DISTINCT rs.stop_name FROM route_stops rs JOIN routes r ON r.route_id = rs.route_id WHERE r.is_active = 1 ORDER BY rs.stop_name');
    out(['locations' => array_column($rows, 'stop_name')]);
}

function route_with_stops(array $r): array
{
    $stops = q_all('SELECT stop_id, stop_name, stop_order, minutes_from_start FROM route_stops WHERE route_id = ? ORDER BY stop_order', [$r['route_id']]);
    foreach ($stops as &$s) {
        $s['stop_id'] = (int)$s['stop_id'];
        $s['stop_order'] = (int)$s['stop_order'];
        $s['minutes_from_start'] = (int)$s['minutes_from_start'];
    }
    return [
        'route_id' => (int)$r['route_id'], 'route_name' => $r['route_name'], 'start_point' => $r['start_point'],
        'destination' => $r['destination'], 'is_active' => (int)$r['is_active'], 'stops' => $stops,
    ];
}

function h_routes_public(): void
{
    $routes = q_all('SELECT * FROM routes WHERE is_active = 1 ORDER BY route_name');
    $res = [];
    foreach ($routes as $r) {
        $x = route_with_stops($r);
        $x['upcoming'] = (int)q_val("SELECT COUNT(*) FROM schedules WHERE route_id = ? AND status = 'scheduled' AND departure_time > ?", [$r['route_id'], now()]);
        $res[] = $x;
    }
    out(['routes' => $res]);
}

function h_stats(): void
{
    out(['stats' => [
        'routes' => (int)q_val('SELECT COUNT(*) FROM routes WHERE is_active = 1'),
        'upcoming' => (int)q_val("SELECT COUNT(*) FROM schedules WHERE status = 'scheduled' AND departure_time > ?", [now()]),
        'passengers' => (int)q_val("SELECT COUNT(*) FROM users WHERE role = 'passenger' AND status = 'active'"),
        'bookings' => (int)q_val("SELECT COUNT(*) FROM bookings WHERE booking_status = 'confirmed'"),
    ]]);
}
