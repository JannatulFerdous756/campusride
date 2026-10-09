-- CampusRide schema (MySQL 5.7+ / 8.x / MariaDB 10.3+), InnoDB, utf8mb4.
-- Safe to run more than once (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  user_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(80)  NOT NULL,
  email          VARCHAR(190) NOT NULL,
  phone          VARCHAR(20)  NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('passenger','driver','manager','admin') NOT NULL DEFAULT 'passenger',
  status         ENUM('active','pending','suspended') NOT NULL DEFAULT 'active',
  created_at     DATETIME NOT NULL,
  last_login_at  DATETIME NULL,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  selector        CHAR(24) NOT NULL,
  validator_hash  CHAR(64) NOT NULL,
  user_agent      VARCHAR(190) NULL,
  created_at      DATETIME NOT NULL,
  expires_at      DATETIME NOT NULL,
  PRIMARY KEY (token_id),
  UNIQUE KEY uq_auth_selector (selector),
  KEY idx_auth_user (user_id),
  CONSTRAINT fk_auth_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip            VARCHAR(45)  NOT NULL,
  email         VARCHAR(190) NOT NULL,
  success       TINYINT(1)   NOT NULL DEFAULT 0,
  attempted_at  DATETIME     NOT NULL,
  PRIMARY KEY (attempt_id),
  KEY idx_attempt_ip (ip, attempted_at),
  KEY idx_attempt_email (email, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_number  VARCHAR(30) NOT NULL,
  vehicle_type    VARCHAR(30) NOT NULL DEFAULT 'Bus',
  capacity        SMALLINT UNSIGNED NOT NULL,
  vehicle_status  ENUM('available','maintenance','retired') NOT NULL DEFAULT 'available',
  created_at      DATETIME NOT NULL,
  PRIMARY KEY (vehicle_id),
  UNIQUE KEY uq_vehicle_number (vehicle_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS routes (
  route_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_name   VARCHAR(100) NOT NULL,
  start_point  VARCHAR(100) NOT NULL,
  destination  VARCHAR(100) NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL,
  PRIMARY KEY (route_id),
  KEY idx_routes_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS route_stops (
  stop_id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id            INT UNSIGNED NOT NULL,
  stop_name           VARCHAR(100) NOT NULL,
  stop_order          SMALLINT UNSIGNED NOT NULL,
  minutes_from_start  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (stop_id),
  KEY idx_stops_route (route_id, stop_order),
  CONSTRAINT fk_stops_route FOREIGN KEY (route_id) REFERENCES routes (route_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id        INT UNSIGNED NOT NULL,
  vehicle_id      INT UNSIGNED NOT NULL,
  driver_id       INT UNSIGNED NOT NULL,
  departure_time  DATETIME NOT NULL,
  duration_min    SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  status          ENUM('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  delay_minutes   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  seats_taken     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  notes           VARCHAR(255) NOT NULL DEFAULT '',
  cancel_reason   VARCHAR(255) NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL,
  updated_at      DATETIME NOT NULL,
  PRIMARY KEY (schedule_id),
  KEY idx_sched_departure (departure_time, status),
  KEY idx_sched_driver (driver_id, departure_time),
  KEY idx_sched_vehicle (vehicle_id, departure_time),
  KEY idx_sched_route (route_id),
  CONSTRAINT fk_sched_route   FOREIGN KEY (route_id)   REFERENCES routes (route_id),
  CONSTRAINT fk_sched_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id),
  CONSTRAINT fk_sched_driver  FOREIGN KEY (driver_id)  REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
  booking_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  passenger_id    INT UNSIGNED NOT NULL,
  schedule_id     INT UNSIGNED NOT NULL,
  pickup_stop_id  INT UNSIGNED NOT NULL,
  booking_status  ENUM('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  booking_time    DATETIME NOT NULL,
  cancelled_at    DATETIME NULL,
  PRIMARY KEY (booking_id),
  UNIQUE KEY uq_booking_once (passenger_id, schedule_id),
  KEY idx_booking_schedule (schedule_id, booking_status),
  KEY idx_booking_time (booking_time),
  CONSTRAINT fk_booking_passenger FOREIGN KEY (passenger_id)   REFERENCES users (user_id),
  CONSTRAINT fk_booking_schedule  FOREIGN KEY (schedule_id)    REFERENCES schedules (schedule_id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_stop      FOREIGN KEY (pickup_stop_id) REFERENCES route_stops (stop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  notification_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  type             VARCHAR(30)  NOT NULL DEFAULT 'info',
  message          VARCHAR(255) NOT NULL,
  link             VARCHAR(120) NULL,
  is_read          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL,
  PRIMARY KEY (notification_id),
  KEY idx_notif_user (user_id, is_read, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  booking_id      INT UNSIGNED NULL,
  subject         VARCHAR(120) NOT NULL,
  description     TEXT NOT NULL,
  status          ENUM('open','in_review','resolved') NOT NULL DEFAULT 'open',
  admin_response  TEXT NULL,
  created_at      DATETIME NOT NULL,
  updated_at      DATETIME NOT NULL,
  PRIMARY KEY (complaint_id),
  KEY idx_complaint_status (status, created_at),
  KEY idx_complaint_user (user_id),
  CONSTRAINT fk_complaint_user    FOREIGN KEY (user_id)    REFERENCES users (user_id),
  CONSTRAINT fk_complaint_booking FOREIGN KEY (booking_id) REFERENCES bookings (booking_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  review_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  passenger_id  INT UNSIGNED NOT NULL,
  driver_id     INT UNSIGNED NOT NULL,
  schedule_id   INT UNSIGNED NOT NULL,
  rating        TINYINT UNSIGNED NOT NULL,
  comment       VARCHAR(500) NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL,
  PRIMARY KEY (review_id),
  UNIQUE KEY uq_review_once (passenger_id, schedule_id),
  KEY idx_review_driver (driver_id),
  CONSTRAINT fk_review_passenger FOREIGN KEY (passenger_id) REFERENCES users (user_id),
  CONSTRAINT fk_review_driver    FOREIGN KEY (driver_id)    REFERENCES users (user_id),
  CONSTRAINT fk_review_schedule  FOREIGN KEY (schedule_id)  REFERENCES schedules (schedule_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delay_reports (
  report_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id    INT UNSIGNED NOT NULL,
  driver_id      INT UNSIGNED NOT NULL,
  report_type    ENUM('delay','vehicle_problem') NOT NULL,
  delay_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  message        VARCHAR(300) NOT NULL,
  created_at     DATETIME NOT NULL,
  PRIMARY KEY (report_id),
  KEY idx_delay_schedule (schedule_id),
  KEY idx_delay_created (created_at),
  CONSTRAINT fk_delay_schedule FOREIGN KEY (schedule_id) REFERENCES schedules (schedule_id) ON DELETE CASCADE,
  CONSTRAINT fk_delay_driver   FOREIGN KEY (driver_id)   REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(40)  NOT NULL,
  entity      VARCHAR(30)  NOT NULL DEFAULT '',
  entity_id   INT UNSIGNED NULL,
  details     VARCHAR(500) NOT NULL DEFAULT '',
  ip          VARCHAR(45)  NOT NULL DEFAULT '',
  created_at  DATETIME NOT NULL,
  PRIMARY KEY (log_id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_user (user_id),
  KEY idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
