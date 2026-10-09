<?php
/* Admin endpoints */

function adm(): array
{
    return require_role(['admin']);
}

function h_admin_users(): void
{
    adm();
    $role = str_in($_GET, 'role');
    $status = str_in($_GET, 'status');
    $search = str_in($_GET, 'q');
    $sql = 'SELECT user_id, name, email, phone, role, status, created_at, last_login_at FROM users WHERE 1=1';
    $p = [];
    if (in_array($role, ['passenger', 'driver', 'manager', 'admin'], true)) {
        $sql .= ' AND role = ?';
        $p[] = $role;
    }
    if (in_array($status, ['active', 'pending', 'suspended'], true)) {
        $sql .= ' AND status = ?';
        $p[] = $status;
    }
    if ($search !== '') {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($search, 0, 60)) . '%';
        $sql .= ' AND (name LIKE ? OR email LIKE ?)';
        $p[] = $like;
        $p[] = $like;
    }
    $sql .= " ORDER BY FIELD(status,'pending','active','suspended'), created_at DESC LIMIT 300";
    $rows = q_all($sql, $p);
    foreach ($rows as &$r) {
        $r['user_id'] = (int)$r['user_id'];
    }
    out(['users' => $rows, 'pending' => (int)q_val("SELECT COUNT(*) FROM users WHERE status = 'pending'")]);
}

function h_user_status(): void
{
    $me = adm();
    $b = body();
    $errors = validate($b, ['user_id' => 'User|required|int', 'status' => 'Status|required|in:active,suspended']);
    if ($errors) {
        fail_fields($errors);
    }
    $id = (int)$b['user_id'];
    $t = q_one('SELECT * FROM users WHERE user_id = ?', [$id]);
    if (!$t) {
        fail('User not found.', 404);
    }
    if ($id === (int)$me['user_id']) {
        fail('You cannot change your own account status.', 409);
    }
    $new = (string)$b['status'];
    q('UPDATE users SET status = ? WHERE user_id = ?', [$new, $id]);
    if ($new === 'suspended') {
        q('DELETE FROM auth_tokens WHERE user_id = ?', [$id]);
        if ($t['role'] === 'driver') {
            $n = (int)q_val("SELECT COUNT(*) FROM schedules WHERE driver_id = ? AND status = 'scheduled' AND departure_time > ?", [$id, now()]);
            if ($n > 0) {
                notify_role('manager', 'schedule', "Driver {$t['name']} was suspended and has $n upcoming trip(s). Please reassign.", '#/manager/schedules');
            }
        }
    } else {
        notify($id, 'account', $t['status'] === 'pending' ? 'Your driver account was approved. You can now see your trips.' : 'Your account was reactivated.', '#/');
    }
    audit((int)$me['user_id'], $t['status'] === 'pending' && $new === 'active' ? 'approve_user' : 'user_status', 'user', $id, "{$t['status']} -> $new");
    out([]);
}

function h_user_role(): void
{
    $me = adm();
    $b = body();
    $errors = validate($b, ['user_id' => 'User|required|int', 'role' => 'Role|required|in:passenger,driver,manager,admin']);
    if ($errors) {
        fail_fields($errors);
    }
    $id = (int)$b['user_id'];
    $t = q_one('SELECT * FROM users WHERE user_id = ?', [$id]);
    if (!$t) {
        fail('User not found.', 404);
    }
    if ($id === (int)$me['user_id']) {
        fail('You cannot change your own role.', 409);
    }
    $role = (string)$b['role'];
    if ($t['role'] === 'driver' && $role !== 'driver' && q_val("SELECT COUNT(*) FROM schedules WHERE driver_id = ? AND status IN ('scheduled','in_progress')", [$id])) {
        fail('This driver still has active trips. Reassign them first.', 409);
    }
    q('UPDATE users SET role = ? WHERE user_id = ?', [$role, $id]);
    notify($id, 'account', "Your role was changed to $role.", '#/');
    audit((int)$me['user_id'], 'role_change', 'user', $id, "{$t['role']} -> $role");
    out([]);
}

function h_user_create(): void
{
    $me = adm();
    $b = body();
    $errors = validate($b, [
        'name' => 'Full name|required|name', 'email' => 'Email|required|email|max:190', 'phone' => 'Phone|required|phone',
        'role' => 'Role|required|in:passenger,driver,manager,admin', 'password' => 'Password|required|password|max:100',
    ]);
    $email = strtolower(str_in($b, 'email'));
    if (!isset($errors['email']) && q_val('SELECT COUNT(*) FROM users WHERE email = ?', [$email])) {
        $errors['email'] = 'This email is already registered.';
    }
    if ($errors) {
        fail_fields($errors);
    }
    q('INSERT INTO users (name, email, phone, password_hash, role, status, created_at) VALUES (?,?,?,?,?,?,?)', [
        preg_replace('/\s+/', ' ', str_in($b, 'name')), $email, str_in($b, 'phone'), password_hash((string)$b['password'], PASSWORD_DEFAULT), $b['role'], 'active', now(),
    ]);
    $id = last_id();
    audit((int)$me['user_id'], 'user_create', 'user', $id, 'role=' . $b['role']);
    out(['user_id' => $id]);
}

function h_admin_complaints(): void
{
    adm();
    $status = str_in($_GET, 'status');
    $sql = "SELECT c.complaint_id, c.subject, c.description, c.status, c.admin_response, c.created_at, c.updated_at, c.booking_id,
        u.name AS user_name, u.role AS user_role, u.email AS user_email, r.route_name
        FROM complaints c JOIN users u ON u.user_id = c.user_id
        LEFT JOIN bookings b ON b.booking_id = c.booking_id LEFT JOIN schedules s ON s.schedule_id = b.schedule_id LEFT JOIN routes r ON r.route_id = s.route_id";
    $p = [];
    if (in_array($status, ['open', 'in_review', 'resolved'], true)) {
        $sql .= ' WHERE c.status = ?';
        $p[] = $status;
    }
    $sql .= " ORDER BY FIELD(c.status,'open','in_review','resolved'), c.created_at DESC LIMIT 200";
    out(['complaints' => q_all($sql, $p)]);
}

function h_complaint_update(): void
{
    $me = adm();
    $b = body();
    $errors = validate($b, ['complaint_id' => 'Complaint|required|int', 'status' => 'Status|required|in:open,in_review,resolved', 'admin_response' => 'Response|max:1000']);
    if (!$errors && $b['status'] === 'resolved' && str_in($b, 'admin_response') === '') {
        $errors['admin_response'] = 'Write a response before resolving.';
    }
    if ($errors) {
        fail_fields($errors);
    }
    $c = q_one('SELECT * FROM complaints WHERE complaint_id = ?', [(int)$b['complaint_id']]);
    if (!$c) {
        fail('Complaint not found.', 404);
    }
    q('UPDATE complaints SET status = ?, admin_response = ?, updated_at = ? WHERE complaint_id = ?', [$b['status'], str_in($b, 'admin_response'), now(), $c['complaint_id']]);
    notify((int)$c['user_id'], 'complaint', "Your complaint \"{$c['subject']}\" is now " . str_replace('_', ' ', (string)$b['status']) . '.', '#/passenger/complaints');
    audit((int)$me['user_id'], 'complaint_update', 'complaint', (int)$c['complaint_id'], (string)$b['status']);
    out([]);
}

function h_analytics(): void
{
    adm();
    $roles = ['passenger' => 0, 'driver' => 0, 'manager' => 0, 'admin' => 0];
    foreach (q_all('SELECT role, COUNT(*) AS c FROM users GROUP BY role') as $r) {
        $roles[$r['role']] = (int)$r['c'];
    }
    $sstat = ['scheduled' => 0, 'in_progress' => 0, 'completed' => 0, 'cancelled' => 0];
    foreach (q_all('SELECT status, COUNT(*) AS c FROM schedules GROUP BY status') as $r) {
        $sstat[$r['status']] = (int)$r['c'];
    }
    $popular = q_all("SELECT r.route_name, COUNT(b.booking_id) AS bookings
        FROM routes r JOIN schedules s ON s.route_id = r.route_id JOIN bookings b ON b.schedule_id = s.schedule_id AND b.booking_status = 'confirmed'
        GROUP BY r.route_id, r.route_name ORDER BY bookings DESC LIMIT 6");
    $from = date('Y-m-d 00:00:00', strtotime('-13 days'));
    $perDay = [];
    for ($i = 13; $i >= 0; $i--) {
        $perDay[date('Y-m-d', strtotime("-$i days"))] = 0;
    }
    foreach (q_all('SELECT DATE(booking_time) AS d, COUNT(*) AS c FROM bookings WHERE booking_time >= ? GROUP BY DATE(booking_time)', [$from]) as $r) {
        if (isset($perDay[$r['d']])) {
            $perDay[$r['d']] = (int)$r['c'];
        }
    }
    $trend = [];
    foreach ($perDay as $d => $c) {
        $trend[] = ['date' => $d, 'count' => $c];
    }
    $util = q_all("SELECT v.vehicle_number, v.capacity,
        COUNT(DISTINCT s.schedule_id) AS rides,
        COUNT(b.booking_id) AS seats_used
        FROM vehicles v
        LEFT JOIN schedules s ON s.vehicle_id = v.vehicle_id AND s.status <> 'cancelled'
        LEFT JOIN bookings b ON b.schedule_id = s.schedule_id AND b.booking_status = 'confirmed'
        GROUP BY v.vehicle_id, v.vehicle_number, v.capacity ORDER BY v.vehicle_number");
    foreach ($util as &$v) {
        $den = (int)$v['rides'] * (int)$v['capacity'];
        $v['utilization'] = $den > 0 ? round(100 * (int)$v['seats_used'] / $den, 1) : 0;
        $v['rides'] = (int)$v['rides'];
        $v['capacity'] = (int)$v['capacity'];
    }
    $drivers = q_all('SELECT u.name, ROUND(AVG(rv.rating),1) AS rating, COUNT(rv.review_id) AS reviews
        FROM users u JOIN reviews rv ON rv.driver_id = u.user_id GROUP BY u.user_id, u.name ORDER BY rating DESC, reviews DESC LIMIT 5');
    out([
        'totals' => [
            'users' => array_sum($roles),
            'bookings' => (int)q_val("SELECT COUNT(*) FROM bookings WHERE booking_status = 'confirmed'"),
            'cancelled_bookings' => (int)q_val("SELECT COUNT(*) FROM bookings WHERE booking_status = 'cancelled'"),
            'rides' => array_sum($sstat),
            'open_complaints' => (int)q_val("SELECT COUNT(*) FROM complaints WHERE status <> 'resolved'"),
            'pending_drivers' => (int)q_val("SELECT COUNT(*) FROM users WHERE role = 'driver' AND status = 'pending'"),
            'avg_rating' => ($ar = q_val('SELECT AVG(rating) FROM reviews')) === null ? null : round((float)$ar, 2),
        ],
        'roles' => $roles, 'ride_status' => $sstat, 'popular_routes' => $popular, 'trend' => $trend,
        'utilization' => $util, 'top_drivers' => $drivers,
    ]);
}

function h_admin_audit(): void
{
    adm();
    $action = str_in($_GET, 'action_filter');
    $search = str_in($_GET, 'q');
    $page = max(1, (int)($_GET['page'] ?? 1));
    $per = 25;
    $where = ' WHERE 1=1';
    $p = [];
    if ($action !== '' && preg_match('/^[a-z_]{2,40}$/', $action)) {
        $where .= ' AND a.action = ?';
        $p[] = $action;
    }
    if ($search !== '') {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($search, 0, 60)) . '%';
        $where .= ' AND (a.details LIKE ? OR u.name LIKE ? OR a.action LIKE ?)';
        array_push($p, $like, $like, $like);
    }
    $total = (int)q_val('SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id' . $where, $p);
    $rows = q_all('SELECT a.log_id, a.action, a.entity, a.entity_id, a.details, a.ip, a.created_at, u.name AS user_name, u.role AS user_role
        FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id' . $where . ' ORDER BY a.log_id DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per), $p);
    $actions = array_column(q_all('SELECT DISTINCT action FROM audit_logs ORDER BY action'), 'action');
    out(['logs' => $rows, 'total' => $total, 'page' => $page, 'per' => $per, 'actions' => $actions]);
}

function csv_cell($v): string
{
    $s = (string)$v;
    if ($s !== '' && strpos("=+-@\t\r", $s[0]) !== false) {
        $s = "'" . $s;
    }
    return '"' . str_replace('"', '""', $s) . '"';
}

function h_admin_report(): void
{
    adm();
    $type = str_in($_GET, 'type');
    $format = str_in($_GET, 'format') === 'csv' ? 'csv' : 'json';
    switch ($type) {
        case 'bookings':
            $rows = q_all("SELECT b.booking_id, p.name AS passenger, p.email, r.route_name, s.departure_time, ps.stop_name AS pickup, b.booking_status, b.booking_time, s.status AS ride_status
                FROM bookings b JOIN users p ON p.user_id = b.passenger_id JOIN schedules s ON s.schedule_id = b.schedule_id
                JOIN routes r ON r.route_id = s.route_id JOIN route_stops ps ON ps.stop_id = b.pickup_stop_id ORDER BY b.booking_id DESC LIMIT 5000");
            break;
        case 'users':
            $rows = q_all('SELECT user_id, name, email, phone, role, status, created_at, last_login_at FROM users ORDER BY user_id LIMIT 5000');
            break;
        case 'schedules':
            $rows = q_all("SELECT s.schedule_id, r.route_name, s.departure_time, s.duration_min, s.status, s.delay_minutes, v.vehicle_number, v.capacity, d.name AS driver,
                (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id = s.schedule_id AND b.booking_status = 'confirmed') AS booked
                FROM schedules s JOIN routes r ON r.route_id = s.route_id JOIN vehicles v ON v.vehicle_id = s.vehicle_id JOIN users d ON d.user_id = s.driver_id ORDER BY s.departure_time DESC LIMIT 5000");
            break;
        case 'audit':
            $rows = q_all('SELECT log_id, user_id, action, entity, entity_id, details, ip, created_at FROM audit_logs ORDER BY log_id DESC LIMIT 5000');
            break;
        default:
            fail_fields(['type' => 'Choose a report type.']);
            return;
    }
    audit((int)$_SESSION['uid'], 'report', 'report', null, "$type.$format");
    if ($format === 'json') {
        out(['type' => $type, 'generated_at' => now(), 'count' => count($rows), 'rows' => $rows]);
    }
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="campusride-' . $type . '-' . date('Ymd-His') . '.csv"');
    header('Cache-Control: no-store');
    echo "\xEF\xBB\xBF";
    if ($rows) {
        echo implode(',', array_map('csv_cell', array_keys($rows[0]))) . "\r\n";
        foreach ($rows as $r) {
            echo implode(',', array_map('csv_cell', $r)) . "\r\n";
        }
    }
    exit;
}
