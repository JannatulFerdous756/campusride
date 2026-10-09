<?php
/**
 * CampusRide web installer.
 * Locked by default: create an empty file named "install.allow" next to this file
 * (File Manager / FTP) to unlock it. The installer deletes that file when it finishes.
 */
declare(strict_types=1);

require __DIR__ . '/api/inc/bootstrap.php';
require __DIR__ . '/api/inc/installer.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

session_name('CAMPUSRIDE_INSTALL');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
session_start();
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
}

function h($s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function page(string $title, string $body): void
{
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . h($title) . ' - CampusRide</title><meta name="robots" content="noindex">'
        . '<style>
:root{--bg:#f1f6fb;--card:#fff;--ink:#0f2238;--mut:#5b6e84;--line:#dbe6f1;--brand:#1769e0;--brand2:#06b6d4;--bad:#d92d4c;--ok:#0f9d6b}
@media(prefers-color-scheme:dark){:root{--bg:#0a1626;--card:#10233a;--ink:#e8f1fb;--mut:#93a9c2;--line:#1f3856}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px 16px}
.wrap{max-width:640px;margin:0 auto}.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;margin-bottom:16px}
.logo i{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--brand),var(--brand2));display:inline-block}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,34,56,.08)}
h1{margin:0 0 4px;font-size:22px}h2{font-size:16px;margin:22px 0 8px;padding-top:14px;border-top:1px solid var(--line)}p.m{color:var(--mut);margin:0 0 14px}
label{display:block;font-weight:600;font-size:13px;margin:12px 0 4px}input,select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit}
input:focus,select:focus{outline:2px solid var(--brand);border-color:transparent}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:520px){.row{grid-template-columns:1fr}}
.err{color:var(--bad);font-size:12.5px;margin-top:3px}.alert{padding:11px 14px;border-radius:10px;margin:12px 0;font-size:14px}.alert.bad{background:rgba(217,45,76,.1);color:var(--bad)}.alert.ok{background:rgba(15,157,107,.12);color:var(--ok)}.alert.warn{background:rgba(245,158,11,.14)}
button,.btn{display:inline-block;margin-top:18px;padding:12px 20px;border:0;border-radius:11px;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
.chk{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-weight:500}.chk input{width:auto;margin-top:4px}code,pre{background:rgba(23,105,224,.08);padding:2px 6px;border-radius:6px;font-size:13px}pre{padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}
small{color:var(--mut)}</style></head><body><div class="wrap"><div class="logo"><i></i>CampusRide installer</div><div class="card">'
        . $body . '</div></div></body></html>';
    exit;
}

$allow = __DIR__ . '/install.allow';
$state = null;
if (is_configured()) {
    try {
        $state = cr_has_users(cr_pdo((string)cfg('db_host'), (int)cfg('db_port'), (string)cfg('db_name'), (string)cfg('db_user'), (string)cfg('db_pass')));
    } catch (Throwable $e) {
        $state = null;
    }
}
if ($state === true) {
    page('Already installed', '<h1>Already installed</h1><p class="m">CampusRide is set up on this server, so the installer is locked.</p>'
        . '<p><a class="btn" href="./">Open CampusRide</a></p><p><small>For safety, delete <code>install.php</code> and <code>install.allow</code> from the server.</small></p>');
}
if (!is_file($allow)) {
    page('Installer locked', '<h1>Installer is locked</h1><p class="m">To protect your server, nobody can run the installer until you unlock it.</p>'
        . '<ol><li>Open your hosting <b>File Manager</b> (or FTP).</li><li>Inside the CampusRide folder, create an <b>empty file</b> named <code>install.allow</code>.</li><li>Reload this page.</li></ol>'
        . '<p><small>The installer deletes this file automatically after a successful install.</small></p>');
}

$tzs = ['Asia/Dhaka', 'UTC', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Kuala_Lumpur', 'Europe/London', 'America/New_York'];
$v = ['db_host' => 'localhost', 'db_port' => '3306', 'db_name' => '', 'db_user' => '', 'db_pass' => '', 'admin_name' => '', 'admin_email' => '', 'admin_password' => '', 'admin_password2' => '', 'timezone' => 'Asia/Dhaka'];
$errors = [];
$general = '';
$demo = true;
$createDb = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($v as $k => $_) {
        $v[$k] = isset($_POST[$k]) && is_string($_POST[$k]) ? trim($_POST[$k]) : '';
    }
    $demo = !empty($_POST['demo']);
    $createDb = !empty($_POST['create_db']);
    if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) {
        $general = 'Session expired. Please try again.';
    } else {
        $errors = validate($v, [
            'db_host' => 'Database host|required|max:120', 'db_port' => 'Port|required|between:1,65535',
            'db_name' => 'Database name|required|max:64', 'db_user' => 'Database user|required|max:64',
            'admin_name' => 'Admin name|required|name', 'admin_email' => 'Admin email|required|email|max:190',
            'admin_password' => 'Admin password|required|password|max:100', 'admin_password2' => 'Confirm password|required|same:admin_password',
            'timezone' => 'Timezone|required|in:' . implode(',', $tzs),
        ]);
        if (!$errors) {
            try {
                $pdo = cr_pdo($v['db_host'], (int)$v['db_port'], $v['db_name'], $v['db_user'], $v['db_pass'], $createDb);
                if (cr_has_users($pdo)) {
                    throw new RuntimeException('This database already contains CampusRide users. Use an empty database.');
                }
                cr_run_schema($pdo);
                $adminId = cr_create_user($pdo, preg_replace('/\s+/', ' ', $v['admin_name']), $v['admin_email'], '', password_hash($v['admin_password'], PASSWORD_DEFAULT), 'admin');
                $seeded = null;
                if ($demo) {
                    $seeded = cr_seed_demo($pdo, $adminId);
                }
                $conf = cr_write_config([
                    'db_host' => $v['db_host'], 'db_port' => (int)$v['db_port'], 'db_name' => $v['db_name'], 'db_user' => $v['db_user'], 'db_pass' => $v['db_pass'],
                    'app_key' => bin2hex(random_bytes(32)), 'timezone' => $v['timezone'], 'session_idle' => 7200, 'remember_days' => 30,
                    'cancel_cutoff_min' => 30, 'strict_timing' => false, 'installed' => true,
                ]);
                $removed = @unlink($allow);
                $html = '<h1>CampusRide is installed &#127881;</h1><div class="alert ok">Database tables created and your admin account is ready.</div>';
                if ($seeded) {
                    $html .= '<div class="alert warn"><b>Demo data was added</b> (' . (int)$seeded['sched'] . ' rides, ' . (int)$seeded['book'] . ' bookings). Demo logins use password <code>Demo@1234</code>. '
                        . 'For a real public launch, re-install on an empty database with demo data turned off.</div>';
                }
                if (!$conf['ok']) {
                    $html .= '<div class="alert bad"><b>Could not write config.local.php.</b> Create it in the CampusRide folder with exactly this content:</div><pre>' . h($conf['code']) . '</pre>';
                }
                if (!$removed) {
                    $html .= '<div class="alert bad">Please delete <code>install.allow</code> manually.</div>';
                }
                $html .= '<p><a class="btn" href="./#/login">Go to CampusRide</a></p><p><small>Now delete <code>install.php</code> from the server and make sure the site runs over HTTPS.</small></p>';
                session_destroy();
                page('Installed', $html);
            } catch (Throwable $e) {
                $general = 'Setup failed: ' . $e->getMessage();
            }
        }
    }
}

function field(string $name, string $label, string $type = 'text', string $extra = '', string $hint = ''): string
{
    global $v, $errors;
    $val = $type === 'password' ? '' : $v[$name];
    return '<label for="' . $name . '">' . h($label) . '</label><input id="' . $name . '" name="' . $name . '" type="' . $type . '" value="' . h($val) . '" ' . $extra . '>'
        . ($hint ? '<small>' . h($hint) . '</small>' : '') . (isset($errors[$name]) ? '<div class="err">' . h($errors[$name]) . '</div>' : '');
}

$tzOpts = '';
foreach ($tzs as $t) {
    $tzOpts .= '<option' . ($v['timezone'] === $t ? ' selected' : '') . '>' . h($t) . '</option>';
}
$b = '<h1>Install CampusRide</h1><p class="m">Create an empty MySQL database in your hosting panel first, then fill in the details below.</p>';
if ($general) {
    $b .= '<div class="alert bad">' . h($general) . '</div>';
}
$b .= '<form method="post" autocomplete="off" novalidate><input type="hidden" name="csrf" value="' . h($_SESSION['csrf']) . '">'
    . '<h2 style="border:0;padding:0">1. Database</h2><div class="row">' . field('db_host', 'Host', 'text', 'required') . field('db_port', 'Port', 'number', 'required min="1" max="65535"') . '</div>'
    . field('db_name', 'Database name', 'text', 'required') . field('db_user', 'Database user', 'text', 'required') . field('db_pass', 'Database password', 'password', 'autocomplete="new-password"')
    . '<label class="chk"><input type="checkbox" name="create_db" value="1"' . ($createDb ? ' checked' : '') . '> Try to create the database if it does not exist (works on VPS/localhost, usually not on shared hosting)</label>'
    . '<h2>2. Admin account</h2>' . field('admin_name', 'Full name', 'text', 'required') . field('admin_email', 'Email', 'email', 'required')
    . '<div class="row">' . field('admin_password', 'Password', 'password', 'required minlength="8" autocomplete="new-password"', '8+ characters with letters and numbers')
    . field('admin_password2', 'Confirm password', 'password', 'required autocomplete="new-password"') . '</div>'
    . '<h2>3. Options</h2><label for="timezone">Timezone</label><select id="timezone" name="timezone">' . $tzOpts . '</select>'
    . '<label class="chk"><input type="checkbox" name="demo" value="1"' . ($demo ? ' checked' : '') . '> Add demo data (sample routes, rides, users) - handy for a demo or presentation; untick for a real launch</label>'
    . '<button type="submit">Install CampusRide</button></form>';
page('Install', $b);
