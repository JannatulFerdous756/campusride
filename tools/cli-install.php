<?php
/**
 * CLI installer for VPS / local use:
 *   php tools/cli-install.php --host=127.0.0.1 --port=3306 --db=campusride --user=root --pass=secret \
 *       --admin-email=admin@example.com --admin-pass='Admin@12345' [--admin-name="Site Admin"] [--demo] [--create-db] [--tz=Asia/Dhaka]
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    exit("CLI only.\n");
}
require dirname(__DIR__) . '/api/inc/bootstrap.php';
require dirname(__DIR__) . '/api/inc/installer.php';

$o = getopt('', ['host::', 'port::', 'db:', 'user:', 'pass::', 'admin-email:', 'admin-pass:', 'admin-name::', 'tz::', 'demo', 'create-db']);
foreach (['db', 'user', 'admin-email', 'admin-pass'] as $req) {
    if (empty($o[$req])) {
        fwrite(STDERR, "Missing --$req\n");
        exit(1);
    }
}
$errors = validate(['e' => $o['admin-email'], 'p' => $o['admin-pass']], ['e' => 'Admin email|required|email', 'p' => 'Admin password|required|password']);
if ($errors) {
    fwrite(STDERR, implode("\n", $errors) . "\n");
    exit(1);
}
$host = $o['host'] ?? '127.0.0.1';
$port = (int)($o['port'] ?? 3306);
$pdo = cr_pdo($host, $port, $o['db'], $o['user'], $o['pass'] ?? '', isset($o['create-db']));
if (cr_has_users($pdo)) {
    fwrite(STDERR, "Database already has users - aborting.\n");
    exit(1);
}
echo 'Schema: ' . cr_run_schema($pdo) . " statements\n";
$id = cr_create_user($pdo, $o['admin-name'] ?? 'Site Admin', $o['admin-email'], '', password_hash($o['admin-pass'], PASSWORD_DEFAULT), 'admin');
if (isset($o['demo'])) {
    $c = cr_seed_demo($pdo, $id);
    echo "Demo data: {$c['sched']} rides, {$c['book']} bookings (password Demo@1234)\n";
}
$conf = cr_write_config([
    'db_host' => $host, 'db_port' => $port, 'db_name' => $o['db'], 'db_user' => $o['user'], 'db_pass' => $o['pass'] ?? '',
    'app_key' => bin2hex(random_bytes(32)), 'timezone' => $o['tz'] ?? 'Asia/Dhaka', 'session_idle' => 7200, 'remember_days' => 30,
    'cancel_cutoff_min' => 30, 'strict_timing' => false, 'installed' => true,
]);
echo $conf['ok'] ? "Config written to {$conf['path']}\n" : "Could not write config. Create it with:\n{$conf['code']}\n";
echo "Done. Admin: {$o['admin-email']}\n";
