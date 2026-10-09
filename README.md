# CampusRide — Smart Campus Transport Sharing System

A role-based web app for campus transport: passengers search rides and reserve seats, drivers run trips,
transport managers publish routes and schedules, admins monitor everything.

**Stack:** HTML5 · CSS3 · JavaScript (AJAX / fetch) · PHP 7.4+ · MySQL (PDO) · JSON API · PHP sessions + cookies
**Validation:** every form is validated in the browser **and** again on the server with the same rules and messages.

## Roles & pages

| Role | Pages |
|---|---|
| Public | Home, About, Available Routes, Login, Registration |
| Passenger | Search Rides, Bookings, Booking History, Notifications, Reviews, Complaints |
| Driver | Assigned Trips, Passenger List, Ride Status, Delay Reports (needs admin approval) |
| Transport Manager | Booking Overview, Routes, Vehicles, Driver Assignments, Schedules |
| Admin | Analytics (+ CSV/JSON reports), User Management, Role Management, Complaints, Audit Logs |

Highlights: live seat availability (auto-refresh, no overbooking, no duplicate bookings), route matching by ordered stops,
in-app notifications (bell), analytics charts, role-based access enforced on the server, hashed passwords.

---

## 1. Run it locally (XAMPP / WAMP / any PHP + MySQL)

1. Copy the folder to `htdocs/campusride`.
2. Start **Apache** and **MySQL**. In phpMyAdmin create an empty database, e.g. `campusride` (utf8mb4).
3. Create an empty file called `install.allow` inside the folder (unlocks the installer).
4. Open `http://localhost/campusride/install.php`, fill in the DB details + your admin account, tick *demo data*, click **Install**.
5. Open `http://localhost/campusride/`.

Command-line alternative: `php tools/cli-install.php --db=campusride --user=root --pass= --admin-email=you@x.com --admin-pass='Admin@12345' --demo`

## 2. Put it online (public hosting)

CampusRide needs **PHP 7.4+ and MySQL/MariaDB**, so GitHub Pages / Netlify alone cannot run it.
Any shared host with cPanel (including free ones such as InfinityFree) or a small VPS works.

1. **Create a MySQL database + user** in the host's panel (cPanel → *MySQL Databases*). Note host, db name, user, password.
2. **Upload** every file of this folder to `public_html/` (or a sub-folder) via File Manager or FTP.
   Keep the `.htaccess` files (they protect private folders).
3. In File Manager create an **empty file `install.allow`** next to `install.php`.
4. Visit `https://your-domain/install.php`, enter the DB details and the admin account.
   Untick *demo data* for a real launch (leave it ticked for a class demo).
5. The installer writes `config.local.php`, deletes `install.allow` and locks itself. **Delete `install.php`** afterwards.
6. Turn on **HTTPS** (free SSL in cPanel / Let's Encrypt). Cookies automatically become `Secure` on HTTPS.
7. Done — share the link. Admin logs in with the email/password chosen in step 4.

**Nginx** (no .htaccess support) — add to the server block:
```nginx
location ~ ^/(api/inc|database|tools)/ { deny all; }
location = /config.local.php { deny all; }
location = /install.allow   { deny all; }
location ~ \.(sql|md|log)$  { deny all; }
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

**Config** lives in `config.local.php` (created by the installer, git-ignored). Keys: `db_host, db_port, db_name, db_user, db_pass,
timezone (default Asia/Dhaka), session_idle (7200 s), remember_days (30), cancel_cutoff_min (30), strict_timing (false)`.
Environment variables `CR_DB_HOST, CR_DB_PORT, CR_DB_NAME, CR_DB_USER, CR_DB_PASS, CR_TIMEZONE` override the file
(handy for Docker / PaaS), or point `CAMPUSRIDE_CONFIG` to another config path.

**Before announcing publicly:** HTTPS on · `install.php` deleted · no demo data (or change demo passwords) · strong admin password · regular DB backups.

## 3. Demo accounts (only if you ticked "demo data")

Password for all demo users: `Demo@1234` (the admin uses the password you chose).
`passenger1@campusride.test` … `passenger14@…`, `driver1@campusride.test` … `driver3@…`, `driver4@…` (pending approval), `manager@campusride.test`.
Tip: `https://your-site/#/login?demo=1` shows one-click demo logins.

---

## 4. How the required techniques are used (for your viva)

**Form validation – both sides.** Rules are written once as strings like `Email|required|email|max:190`.
* Client: `assets/js/core.js` (`Validate`) reads `data-v` attributes, shows inline errors on blur/typing/submit, focuses the first bad field and **does not send** invalid forms.
* Server: `api/inc/bootstrap.php` (`validate()`) re-checks every request (the browser can be bypassed) and answers `422 {errors:{field:message}}`, which the client displays under the same fields.
* Rules: required, email, min, max, int, between, in, date, time, datetime, future, phone (BD mobile), name, password strength, same-as.
* Extra business validation on the server: vehicle/driver time conflicts, capacity ≥ booked seats, unique stop names, direction-aware route matching, etc.
* AJAX: live "email already registered" check while registering.

**Sessions.** PHP session `CAMPUSRIDE_SID` (HttpOnly, SameSite=Lax, Secure on HTTPS, strict mode, id regenerated on login/logout, 2 h idle timeout).
Role + status are re-read from the database on every request, so a suspended user is locked out immediately. Every write needs a CSRF token (`X-CSRF-Token`).

**Cookies.**
* `CAMPUSRIDE_SID` – essential login session.
* `cr_remember` – optional "keep me signed in" cookie: `selector:validator`, only a SHA-256 of the validator is stored in `auth_tokens`, rotates on every use, deleted on logout/suspension.
* `cr_consent`, `cr_theme`, `cr_search`, `cr_email` – preference cookies set from JavaScript **only after the visitor accepts** in the cookie banner.

**Database safety.** PDO prepared statements everywhere, `password_hash()` (bcrypt), InnoDB foreign keys, `UNIQUE(passenger_id, schedule_id)` against duplicate bookings,
and an atomic seat counter (`UPDATE … SET seats_taken = seats_taken + 1 WHERE seats_taken < capacity`) inside a transaction against overbooking. Login brute-force throttling (5 failures / 10 min). All state changes are written to `audit_logs`.

## 5. Project structure

```
index.html            single-page shell (hash routes)      install.php        web installer (locked by install.allow)
assets/css/style.css  design system + dark mode            tools/cli-install.php  CLI installer
assets/js/            core (validation, cookies, AJAX, router) · components · pages-{public,passenger,driver,manager,admin} · main
api/index.php         JSON API front controller            database/schema.sql    13 MySQL tables
api/inc/              bootstrap · auth · passenger · driver · manager · admin · installer   (blocked from the web by .htaccess)
```

## 6. GitHub

`config.local.php` and `install.allow` are in `.gitignore`, so your database password is never pushed.
```
git init && git add . && git commit -m "CampusRide" && git branch -M main
git remote add origin https://github.com/<you>/campusride.git && git push -u origin main
```

## 7. Testing notes

Developed against PHP 8.3 (code kept PHP 7.4-compatible) and tested end-to-end with a MySQL-compatible server (Dolt 2.x):
API tests for all four roles, browser tests (Playwright) for validation, bookings, cookies/remember-me, live seats and every dashboard, and the web + CLI installers.
The production CSP header was also exercised in the browser. Concurrency under simultaneous bookings relies on InnoDB's atomic-update semantics — please also try it on your own MySQL/MariaDB.

## Troubleshooting

* *"CampusRide is not set up yet"* → run `install.php` (create `install.allow` first).
* *"Cannot connect to the database"* → check `config.local.php`; many hosts use a host name other than `localhost` and prefix DB names/users (e.g. `cpuser_campusride`).
* *Blank page / 500* → PHP must be 7.4+ with `pdo_mysql`, `mbstring` and `json`; look at the host's PHP error log.
* *Logged out immediately on HTTP behind a proxy* → make sure the proxy sends `X-Forwarded-Proto: https`.
