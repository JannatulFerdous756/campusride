<?php
/**
 * CampusRide - bootstrap: config, database, sessions, cookies, CSRF, validation, helpers.
 * Compatible with PHP 7.4+.
 */
declare(strict_types=1);

define('CR_ROOT', dirname(__DIR__, 2));
define('CR_VERSION', '1.0.0');

ini_set('display_errors', '0');
error_reporting(E_ALL);

/* ---------------------------------------------------------------- config */

function cr_config_path(): string
{
    $p = getenv('CAMPUSRIDE_CONFIG');
    return ($p !== false && $p !== '') ? $p : CR_ROOT . '/config.local.php';
}

function cfg(?string $key = null, $default = null)
{
    static $c = null;
    if ($c === null) {
        $c = [
            'db_host' => '127.0.0.1', 'db_port' => 3306, 'db_name' => '', 'db_user' => '', 'db_pass' => '',
            'app_key' => '', 'timezone' => 'Asia/Dhaka',
            'session_idle' => 7200, 'remember_days' => 30, 'cancel_cutoff_min' => 30,
            'strict_timing' => false, 'installed' => false,
        ];
        $file = cr_config_path();
        if (is_file($file)) {
            $loaded = include $file;
            if (is_array($loaded)) {
                $c = array_merge($c, $loaded);
            }
        }
        $env = ['CR_DB_HOST' => 'db_host', 'CR_DB_PORT' => 'db_port', 'CR_DB_NAME' => 'db_name',
                'CR_DB_USER' => 'db_user', 'CR_DB_PASS' => 'db_pass', 'CR_APP_KEY' => 'app_key', 'CR_TIMEZONE' => 'timezone'];
        foreach ($env as $e => $k) {
            $v = getenv($e);
            if ($v !== false && $v !== '') {
                $c[$k] = $v;
                if ($k === 'db_name') {
                    $c['installed'] = true;
                }
            }
        }
        $c['db_port'] = (int)$c['db_port'];
    }
    if ($key === null) {
        return $c;
    }
    return array_key_exists($key, $c) ? $c[$key] : $default;
}

function is_configured(): bool
{
    return cfg('db_name') !== '' && cfg('db_user') !== '';
}

@date_default_timezone_set((string)cfg('timezone', 'Asia/Dhaka'));

function now(): string
{
    return date('Y-m-d H:i:s');
}

/* ------------------------------------------------------------- responses */

function send_json(int $status, array $payload): void
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

function out(array $data = []): void
{
    send_json(200, array_merge(['ok' => true], $data));
}

function fail(string $msg, int $status = 400, array $extra = []): void
{
    send_json($status, array_merge(['ok' => false, 'error' => $msg], $extra));
}

function fail_fields(array $errors): void
{
    $first = reset($errors);
    send_json(422, ['ok' => false, 'error' => $first !== false ? (string)$first : 'Please fix the highlighted fields.', 'errors' => $errors]);
}

set_exception_handler(function ($e) {
    if ($e instanceof ApiError) {
        send_json($e->status, array_merge(['ok' => false, 'error' => $e->getMessage()], $e->extra));
    }
    error_log('[CampusRide] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        send_json(500, ['ok' => false, 'error' => 'Something went wrong on the server. Please try again.']);
    }
});

/* -------------------------------------------------------------- database */

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        if (!is_configured()) {
            send_json(503, ['ok' => false, 'error' => 'CampusRide is not installed yet.', 'code' => 'not_installed']);
        }
        $dsn = 'mysql:host=' . cfg('db_host') . ';port=' . cfg('db_port') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4';
        try {
            $pdo = new PDO($dsn, (string)cfg('db_user'), (string)cfg('db_pass'), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            error_log('[CampusRide] DB connect failed: ' . $e->getMessage());
            send_json(503, ['ok' => false, 'error' => 'Cannot connect to the database. Check config.local.php.', 'code' => 'db_error']);
        }
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function q_all(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function q_one(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function q_val(string $sql, array $params = [])
{
    $r = q($sql, $params)->fetchColumn();
    return $r === false ? null : $r;
}

function last_id(): int
{
    return (int)db()->lastInsertId();
}

/* ------------------------------------------------------ request / client */

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
        return true;
    }
    return isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443;
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function body(): array
{
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input');
        $b = [];
        if ($raw !== false && $raw !== '') {
            $j = json_decode($raw, true);
            if (is_array($j)) {
                $b = $j;
            }
        }
        if (!$b && !empty($_POST)) {
            $b = $_POST;
        }
    }
    return $b;
}

function str_in(array $src, string $k): string
{
    $v = $src[$k] ?? '';
    return is_scalar($v) ? trim((string)$v) : '';
}

/* -------------------------------------------------------------- sessions */

function cookie_opts(int $expires = 0, bool $httponly = true): array
{
    return ['expires' => $expires, 'path' => '/', 'secure' => is_https(), 'httponly' => $httponly, 'samesite' => 'Lax'];
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('CAMPUSRIDE_SID');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string)max(3600, (int)cfg('session_idle')));
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
    session_start();
    // idle timeout
    $idle = (int)cfg('session_idle');
    if (isset($_SESSION['last_seen']) && time() - (int)$_SESSION['last_seen'] > $idle) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_seen'] = time();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
}

function csrf_check(): void
{
    $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sent === '' || !hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) {
        fail('Your session expired. Please refresh the page and try again.', 419, ['code' => 'csrf']);
    }
}

function user_public(array $u): array
{
    return [
        'id' => (int)$u['user_id'], 'name' => $u['name'], 'email' => $u['email'], 'phone' => $u['phone'] ?? '',
        'role' => $u['role'], 'status' => $u['status'],
    ];
}

function current_user(): ?array
{
    static $cache = false;
    if ($cache !== false && isset($_SESSION['uid']) && $cache && (int)$cache['user_id'] === (int)$_SESSION['uid']) {
        return $cache;
    }
    $cache = null;
    if (!empty($_SESSION['uid'])) {
        $u = q_one('SELECT * FROM users WHERE user_id = ?', [(int)$_SESSION['uid']]);
        if ($u && $u['status'] !== 'suspended') {
            $cache = $u;
        } else {
            $_SESSION['uid'] = null;
        }
    }
    return $cache;
}

function login_user(array $u, bool $remember): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['user_id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    $_SESSION['last_seen'] = time();
    q('UPDATE users SET last_login_at = ? WHERE user_id = ?', [now(), $u['user_id']]);
    if ($remember) {
        issue_remember_token((int)$u['user_id']);
    }
}

function logout_user(): void
{
    if (!empty($_SESSION['uid'])) {
        q('DELETE FROM auth_tokens WHERE user_id = ?', [(int)$_SESSION['uid']]);
    }
    clear_remember_cookie();
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
        $_SESSION['last_seen'] = time();
    }
}

/* ---------------------------------------------------- remember-me cookie */

function issue_remember_token(int $uid): void
{
    $days = (int)cfg('remember_days');
    $selector = bin2hex(random_bytes(12));
    $validator = bin2hex(random_bytes(32));
    $exp = time() + $days * 86400;
    q('DELETE FROM auth_tokens WHERE expires_at < ?', [now()]);
    q('INSERT INTO auth_tokens (user_id, selector, validator_hash, user_agent, created_at, expires_at) VALUES (?,?,?,?,?,?)', [
        $uid, $selector, hash('sha256', $validator), substr((string)($_SERVER["HTTP_USER_AGENT"] ?? ""), 0, 190), now(), date('Y-m-d H:i:s', $exp),
    ]);
    setcookie('cr_remember', $selector . ':' . $validator, cookie_opts($exp));
}

function clear_remember_cookie(): void
{
    if (isset($_COOKIE['cr_remember'])) {
        $parts = explode(':', (string)$_COOKIE['cr_remember']);
        if (count($parts) === 2 && preg_match('/^[a-f0-9]{24}$/', $parts[0])) {
            q('DELETE FROM auth_tokens WHERE selector = ?', [$parts[0]]);
        }
    }
    setcookie('cr_remember', '', cookie_opts(time() - 3600));
    unset($_COOKIE['cr_remember']);
}

/** Restore a session from the persistent remember-me cookie. */
function try_remember(): void
{
    if (!empty($_SESSION['uid']) || empty($_COOKIE['cr_remember'])) {
        return;
    }
    $parts = explode(':', (string)$_COOKIE['cr_remember']);
    if (count($parts) !== 2 || !preg_match('/^[a-f0-9]{24}$/', $parts[0]) || !preg_match('/^[a-f0-9]{64}$/', $parts[1])) {
        setcookie('cr_remember', '', cookie_opts(time() - 3600));
        return;
    }
    $t = q_one('SELECT * FROM auth_tokens WHERE selector = ?', [$parts[0]]);
    if (!$t || $t['expires_at'] < now()) {
        if ($t) {
            q('DELETE FROM auth_tokens WHERE token_id = ?', [$t['token_id']]);
        }
        setcookie('cr_remember', '', cookie_opts(time() - 3600));
        return;
    }
    if (!hash_equals($t['validator_hash'], hash('sha256', $parts[1]))) {
        // stolen / stale cookie: invalidate every token of that user
        q('DELETE FROM auth_tokens WHERE user_id = ?', [$t['user_id']]);
        setcookie('cr_remember', '', cookie_opts(time() - 3600));
        return;
    }
    $u = q_one('SELECT * FROM users WHERE user_id = ?', [$t['user_id']]);
    q('DELETE FROM auth_tokens WHERE token_id = ?', [$t['token_id']]);
    if (!$u || $u['status'] === 'suspended') {
        q('DELETE FROM auth_tokens WHERE user_id = ?', [$t['user_id']]);
        setcookie('cr_remember', '', cookie_opts(time() - 3600));
        return;
    }
    login_user($u, true); // rotates token
}

/* ------------------------------------------------------------ access ctl */

function require_login(): array
{
    $u = current_user();
    if (!$u) {
        fail('Please log in to continue.', 401, ['code' => 'auth']);
    }
    return $u;
}

function require_role(array $roles): array
{
    $u = require_login();
    if (!in_array($u['role'], $roles, true)) {
        fail('You do not have permission to do that.', 403, ['code' => 'forbidden']);
    }
    if ($u['role'] === 'driver' && $u['status'] === 'pending') {
        fail('Your driver account is waiting for admin approval.', 403, ['code' => 'pending']);
    }
    return $u;
}

/* ------------------------------------------------------------ validation */

/**
 * Rules are strings: "Label|required|email|max:190".
 * The same strings are used by assets/js/core.js so both sides agree.
 */
function validate(array $data, array $rules): array
{
    $errors = [];
    foreach ($rules as $field => $spec) {
        $parts = explode('|', $spec);
        $label = array_shift($parts);
        $val = isset($data[$field]) && is_scalar($data[$field]) ? trim((string)$data[$field]) : '';
        if ($val === '') {
            if (in_array('required', $parts, true)) {
                $errors[$field] = $label . ' is required.';
            }
            continue;
        }
        foreach ($parts as $r) {
            $arg = '';
            if (strpos($r, ':') !== false) {
                list($r, $arg) = explode(':', $r, 2);
            }
            $msg = check_rule($r, $arg, $val, $label, $data);
            if ($msg !== null) {
                $errors[$field] = $msg;
                break;
            }
        }
    }
    return $errors;
}

function check_rule(string $r, string $arg, string $val, string $label, array $data): ?string
{
    switch ($r) {
        case 'required':
            return null;
        case 'email':
            return filter_var($val, FILTER_VALIDATE_EMAIL) ? null : 'Enter a valid email address.';
        case 'min':
            return mb_strlen($val) >= (int)$arg ? null : "$label must be at least $arg characters.";
        case 'max':
            return mb_strlen($val) <= (int)$arg ? null : "$label must be at most $arg characters.";
        case 'int':
            return preg_match('/^-?\d+$/', $val) ? null : "$label must be a whole number.";
        case 'between':
            list($a, $b) = array_map('intval', explode(',', $arg));
            if (!preg_match('/^-?\d+$/', $val)) {
                return "$label must be a whole number.";
            }
            return ((int)$val >= $a && (int)$val <= $b) ? null : "$label must be between $a and $b.";
        case 'in':
            return in_array($val, explode(',', $arg), true) ? null : "$label has an invalid value.";
        case 'date':
            $d = DateTime::createFromFormat('Y-m-d', $val);
            return ($d && $d->format('Y-m-d') === $val) ? null : "$label must be a valid date (YYYY-MM-DD).";
        case 'time':
            return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $val) ? null : "$label must be a valid time (HH:MM).";
        case 'datetime':
            return parse_dt($val) !== null ? null : "$label must be a valid date and time.";
        case 'future':
            $t = parse_dt($val);
            if ($t === null) {
                return "$label must be a valid date and time.";
            }
            return $t > date('Y-m-d H:i:s') ? null : "$label must be in the future.";
        case 'phone':
            return preg_match('/^(?:\+?88)?01[3-9]\d{8}$/', $val) ? null : 'Enter a valid Bangladeshi mobile number (e.g. 01712345678).';
        case 'name':
            return preg_match('/^[\p{L}][\p{L}\s.\'-]{1,59}$/u', $val) ? null : "$label may only contain letters, spaces and . ' - (2 to 60 characters).";
        case 'password':
            return (mb_strlen($val) >= 8 && preg_match('/[A-Za-z]/', $val) && preg_match('/\d/', $val)) ? null : 'Password must be at least 8 characters with letters and numbers.';
        case 'same':
            $o = isset($data[$arg]) && is_scalar($data[$arg]) ? trim((string)$data[$arg]) : '';
            return $o === $val ? null : "$label does not match.";
    }
    return null;
}

/** Accepts "Y-m-d H:i", "Y-m-dTH:i" (and with seconds). Returns "Y-m-d H:i:s" or null. */
function parse_dt(string $v): ?string
{
    $v = str_replace('T', ' ', trim($v));
    if (!preg_match('/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/', $v, $m)) {
        return null;
    }
    $d = DateTime::createFromFormat('Y-m-d', $m[1]);
    if (!$d || $d->format('Y-m-d') !== $m[1] || (int)$m[2] > 23 || (int)$m[3] > 59) {
        return null;
    }
    return $m[1] . ' ' . $m[2] . ':' . $m[3] . ':' . (isset($m[4]) && $m[4] !== '' ? $m[4] : '00');
}

/* ------------------------------------------------------ audit & notices */

function audit(?int $uid, string $action, string $entity = '', ?int $entityId = null, string $details = ''): void
{
    q('INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip, created_at) VALUES (?,?,?,?,?,?,?)', [
        $uid, $action, $entity, $entityId, mb_substr($details, 0, 500), client_ip(), now(),
    ]);
}

function notify(int $uid, string $type, string $message, string $link = ''): void
{
    q('INSERT INTO notifications (user_id, type, message, link, is_read, created_at) VALUES (?,?,?,?,0,?)', [
        $uid, $type, mb_substr($message, 0, 250), $link, now(),
    ]);
}

function notify_role(string $role, string $type, string $message, string $link = ''): void
{
    foreach (q_all("SELECT user_id FROM users WHERE role = ? AND status = 'active'", [$role]) as $r) {
        notify((int)$r['user_id'], $type, $message, $link);
    }
}

function fmt_dt(string $dt): string
{
    $t = strtotime($dt);
    return $t ? date('D, d M Y \a\t g:i A', $t) : $dt;
}

/* ---------------------------------------------------------- transactions */

class ApiError extends Exception
{
    public $status;
    public $extra;

    public function __construct(string $msg, int $status = 400, array $extra = [])
    {
        parent::__construct($msg);
        $this->status = $status;
        $this->extra = $extra;
    }
}

/** Run $fn inside a DB transaction (retried a few times on deadlock / serialization failures). */
function tx(callable $fn)
{
    $pdo = db();
    for ($attempt = 1; ; $attempt++) {
        $pdo->beginTransaction();
        try {
            $r = $fn();
            $pdo->commit();
            return $r;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                try {
                    $pdo->rollBack();
                } catch (Throwable $ignore) {
                }
            }
            $msg = strtolower($e->getMessage());
            $transient = $e instanceof PDOException && ($e->getCode() === '40001' || strpos($msg, 'deadlock') !== false
                || strpos($msg, 'serializ') !== false || strpos($msg, 'lock wait') !== false || strpos($msg, 'conflict') !== false);
            if ($transient && $attempt < 4) {
                usleep(random_int(20000, 80000) * $attempt);
                continue;
            }
            throw $e;
        }
    }
}
