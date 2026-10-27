/* BafiBourse – service worker : affiche le rappel du soir et ouvre l'application quand on le touche.
 * Il ne met rien en cache : l'application reste toujours à jour. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { texte: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.titre || "BafiBourse", {
    body: m.texte || "Votre récap du soir est prêt.",
    icon: "../icon-192.png?v=carapace1", badge: "../icon-192.png?v=carapace1", lang: "fr",
    tag: "recap-du-soir", renotify: true,                  // un seul rappel affiché à la fois
    data: { url: m.url || "./#aujourdhui" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#aujourdhui", self.registration.scope).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenetres) if (f.url.startsWith(self.registration.scope)) { await f.focus(); return f.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
