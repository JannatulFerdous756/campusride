'use strict';
/* Boot: load the session (AJAX), then start the router. */
(async function boot() {
  cookieBanner();
  try {
    await refreshMe();
  } catch (e) {
    const notInstalled = e.code === 'not_installed';
    $('#root').innerHTML = `<div class="container" style="max-width:600px;padding:12vh 0"><div class="card empty"><div class="ico">${icon(notInstalled ? 'wrench' : 'alert', 28)}</div>
      <h3>${notInstalled ? 'CampusRide is not set up yet' : "Can't reach the server"}</h3>
      <p>${notInstalled ? 'Run the installer to create the database tables and your admin account.' : esc(e.message)}</p>
      ${notInstalled ? '<a class="btn btn-primary" href="install.php">Open installer</a>' : '<button class="btn btn-primary" data-act="reload">Try again</button>'}</div></div>`;
    return;
  }
  if (!location.hash) history.replaceState(null, '', '#/');
  navigate();
})();
A.reload = () => location.reload();
