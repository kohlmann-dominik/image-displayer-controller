// frontend/public/service-worker.js

self.addEventListener("install", (event) => {
  // sofort aktiv werden
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // alle offenen Clients übernehmen
  event.waitUntil(self.clients.claim());
});

// Optional: später Caching einbauen
// self.addEventListener("fetch", (event) => {
//   // aktuell: Browser ganz normal machen lassen
// });