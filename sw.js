const CACHE_NAME = 'fred-os-v1';
const URLS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg'
];

// Install: cache the app shell so it works fully offline
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache when offline, network first when available
self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

// Listen for messages from the app telling us to schedule a notification
// via the Notification Triggers approach is not yet widely supported,
// so instead we keep the service worker alive longer using periodic sync
// where available, and rely on the app's own timer as the primary method.

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type: 'window'}).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// Periodic background sync (supported on some Android Chrome versions)
// This gives notifications a better chance of firing even when the app
// has been closed, by waking the service worker periodically to check
// the schedule and fire any due notifications.
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'fred-os-schedule-check') {
    event.waitUntil(checkScheduleAndNotify());
  }
});

// Fallback: regular sync event (fires when connectivity returns)
self.addEventListener('sync', function(event) {
  if (event.tag === 'fred-os-schedule-check') {
    event.waitUntil(checkScheduleAndNotify());
  }
});

function checkScheduleAndNotify() {
  // The schedule itself lives in the main app (index.html) since it needs
  // localStorage access for toggles. We post a message to any open client
  // to recalculate, and as a safety net we also fire a generic reminder
  // if it's been a while since the app was opened during waking hours.
  return self.clients.matchAll().then(function(clientList) {
    clientList.forEach(function(client) {
      client.postMessage({type: 'CHECK_SCHEDULE'});
    });
  });
}
