(() => {
  'use strict';
  if (document.getElementById('radar-report-builder-script')) return;
  const script = document.createElement('script');
  script.id = 'radar-report-builder-script';
  script.src = './cloud/report-builder.js?v=20260715-final7';
  script.defer = true;
  document.body.appendChild(script);
})();
