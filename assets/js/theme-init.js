/* Runs before first paint: apply the saved theme (cookie, only present if the user allowed preference cookies). */
(function () {
  var m = document.cookie.match(/(?:^|; )cr_theme=([^;]+)/);
  var t = m ? decodeURIComponent(m[1]) : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light';
})();
