<?php
/**
 * CampusRide JSON API front controller.
 * GET  ?action=...   -> reads
 * POST ?action=...   -> writes (JSON body, X-CSRF-Token header required)
 */
declare(strict_types=1);

require __DIR__ . '/inc/bootstrap.php';

if (!is_configured()) {
    send_json(503, ['ok' => false, 'error' => 'CampusRide is not installed yet.', 'code' => 'not_installed']);
}

require __DIR__ . '/inc/auth.php';
require __DIR__ . '/inc/passenger.php';
require __DIR__ . '/inc/driver.php';
require __DIR__ . '/inc/manager.php';
require __DIR__ . '/inc/admin.php';

start_session();
try_remember();

/* action => [HTTP method, handler]. Role checks happen inside each handler (server side). */
$routes = [
    // public / session
    'me' => ['GET', 'h_me'], 'check_email' => ['GET', 'h_check_email'], 'register' => ['POST', 'h_register'],
    'login' => ['POST', 'h_login'], 'logout' => ['POST', 'h_logout'], 'stats' => ['GET', 'h_stats'],
    'routes_public' => ['GET', 'h_routes_public'], 'locations' => ['GET', 'h_locations'],
    // passenger
    'rides' => ['GET', 'h_rides'], 'ride' => ['GET', 'h_ride'], 'seats' => ['GET', 'h_seats'],
    'book' => ['POST', 'h_book'], 'cancel_booking' => ['POST', 'h_cancel_booking'], 'my_bookings' => ['GET', 'h_my_bookings'],
    'review' => ['POST', 'h_review'], 'my_reviews' => ['GET', 'h_my_reviews'],
    'complaint' => ['POST', 'h_complaint'], 'my_complaints' => ['GET', 'h_my_complaints'],
    'notifications' => ['GET', 'h_notifications'], 'notif_read' => ['POST', 'h_notif_read'],
    // driver
    'driver_trips' => ['GET', 'h_driver_trips'], 'trip_passengers' => ['GET', 'h_trip_passengers'],
    'trip_status' => ['POST', 'h_trip_status'], 'delay_report' => ['POST', 'h_delay_report'], 'delay_reports' => ['GET', 'h_delay_reports'],
    // manager
    'manager_routes' => ['GET', 'h_manager_routes'], 'route_save' => ['POST', 'h_route_save'], 'route_delete' => ['POST', 'h_route_delete'],
    'vehicles' => ['GET', 'h_vehicles'], 'vehicle_save' => ['POST', 'h_vehicle_save'], 'vehicle_delete' => ['POST', 'h_vehicle_delete'],
    'drivers' => ['GET', 'h_drivers'], 'manager_schedules' => ['GET', 'h_manager_schedules'],
    'schedule_save' => ['POST', 'h_schedule_save'], 'schedule_cancel' => ['POST', 'h_schedule_cancel'],
    'schedule_bookings' => ['GET', 'h_schedule_bookings'], 'manager_overview' => ['GET', 'h_manager_overview'],
    // admin
    'admin_users' => ['GET', 'h_admin_users'], 'user_status' => ['POST', 'h_user_status'], 'user_role' => ['POST', 'h_user_role'],
    'user_create' => ['POST', 'h_user_create'], 'admin_complaints' => ['GET', 'h_admin_complaints'],
    'complaint_update' => ['POST', 'h_complaint_update'], 'analytics' => ['GET', 'h_analytics'],
    'admin_audit' => ['GET', 'h_admin_audit'], 'admin_report' => ['GET', 'h_admin_report'],
];

$action = isset($_GET['action']) && is_string($_GET['action']) ? $_GET['action'] : '';
if (!isset($routes[$action])) {
    fail('Unknown action.', 404);
}
list($method, $handler) = $routes[$action];
if ($_SERVER['REQUEST_METHOD'] !== $method) {
    header('Allow: ' . $method);
    fail('Method not allowed.', 405);
}
if ($method === 'POST') {
    csrf_check();
}
$handler();
