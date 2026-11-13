/* BafiBourse – service worker : affiche le rappel du soir et le bilan du dimanche, pose la pastille sur l'icône,
 * et ouvre l'application quand on touche la notification.
 * Il ne met rien en cache : l'application reste toujours à jour. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { texte: e.data ? e.data.text() : "" }; }
  const tag = m.tag === "bilan-semaine" ? "bilan-semaine" : "recap-du-soir";       // un seul de chaque sorte affiché à la fois
  // adresse d'ouverture : toujours cette application ; seul l'écran demandé (#budget…) est repris du message
  let url = "./#aujourdhui";
  try { const h = new URL(m.url || url, self.registration.scope).hash; if (/^#[a-z-]{2,30}$/.test(h)) url = "./" + h; } catch (err) { /* adresse illisible */ }
  const badge = Math.max(0, Math.min(99, parseInt(m.badge, 10) || 0));
  e.waitUntil(Promise.all([
    self.registration.showNotification(String(m.titre || "BafiBourse").slice(0, 80), {
      body: String(m.texte || "Votre récap du soir est prêt.").slice(0, 240),
      icon: "../icon-192.png?v=carapace1", badge: "../icon-192.png?v=carapace1", lang: "fr",
      tag, renotify: true, data: { url },
    }),
    // pastille sur l'icône de l'application installée (quand le téléphone le permet)
    badge && self.navigator && "setAppBadge" in self.navigator ? self.navigator.setAppBadge(badge).catch(() => {}) : Promise.resolve(),
  ]));
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
