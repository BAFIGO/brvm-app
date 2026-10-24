/* BafiBourse – rappels du soir : notification sur le téléphone ou l'ordinateur, et message WhatsApp.
 * Carte « Mes rappels du soir » dans le Profil : heure choisie, rappel de l'épargne du jour, appareils, WhatsApp,
 * essai immédiat. L'envoi est fait par la fonction Supabase « rappels », une fois par séance, après publication. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HEURES = ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
  const CLE_PUB = (window.BRVM_CONFIG || {}).vapidPublique || "";
  let app = null, reglages = null, charge = false, abonnement = null;

  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installee = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushPossible = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const versOctets = (b64) => {
    const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };
  const enB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const appareil = () => (ios ? "iPhone ou iPad" : /Android/i.test(navigator.userAgent) ? "Android" : /Mac/i.test(navigator.userAgent) ? "Mac" : /Windows/i.test(navigator.userAgent) ? "Windows" : "Navigateur");

  async function inscription() {
    if (!pushPossible) return null;
    return (await navigator.serviceWorker.getRegistration("./")) || navigator.serviceWorker.register("sw.js");
  }
  async function etatAbonnement() {
    try { const reg = await navigator.serviceWorker?.getRegistration("./"); abonnement = reg ? await reg.pushManager.getSubscription() : null; }
    catch (e) { abonnement = null; }
  }

  // ---------------------------------------------------------------- activer ou couper la notification sur cet appareil
  async function activerPush() {
    if (app.demo) return app.toast("En démonstration, aucune notification n'est envoyée.");
    if (!CLE_PUB) return app.toast("Notifications pas encore configurées.", { detail: "La clé publique manque dans config.js." });
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return app.toast("Notifications refusées.", { detail: "Vous pouvez les autoriser plus tard dans les réglages de votre navigateur." });
    const reg = await inscription();
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(CLE_PUB) });
    await app.abonnerPush({ endpoint: sub.endpoint, p256dh: enB64(sub.getKey("p256dh")), auth: enB64(sub.getKey("auth")), appareil: appareil() });
    await sauver({ push: true });
    abonnement = sub;
    app.toast("Notifications activées sur cet appareil.", { detail: "Vous recevrez votre récap chaque soir de séance." });
  }
  async function couperPush() {
    try {
      if (abonnement) { await app.desabonnerPush(abonnement.endpoint); await abonnement.unsubscribe(); }
    } catch (e) { /* déjà désabonné */ }
    abonnement = null;
    app.toast("Notifications coupées sur cet appareil.");
  }
  async function sauver(maj) {
    reglages = { push: false, whatsapp: false, heure: "20:00", epargne: true, ...(reglages || {}), ...maj };
    await app.sauverRappels({ ...maj, fuseau_min: -new Date().getTimezoneOffset() });
  }

  // ---------------------------------------------------------------- la carte du Profil
  function carte() {
    const v = $("#v-profil");
    if (!v || v.hidden || !charge || $(".rp-carte", v)) return;
    const r = { push: false, whatsapp: false, heure: "20:00", epargne: true, ...(reglages || {}) };
    const h = String(r.heure).slice(0, 5), tel = app.telephone();
    const ici = !!abonnement;
    const etatPush = !pushPossible ? `<p class="small muted">Ce navigateur ne permet pas les notifications.</p>`
      : ios && !installee ? `<p class="small">Sur iPhone, les notifications passent par l'application installée : touchez <b>Partager</b>, puis
          <b>Sur l'écran d'accueil</b>, ouvrez BafiBourse depuis l'icône, et revenez ici.</p>`
      : Notification.permission === "denied" ? `<p class="small">Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur.</p>`
      : `<div class="rp-ligne"><span>${ici ? "✓ Activées sur cet appareil" : "Notification sur cet appareil"}</span>
          <button type="button" class="btn small${ici ? "" : " primary"}" data-rp="${ici ? "couper" : "activer"}">${ici ? "Couper" : "Activer"}</button></div>`;
    const html = `<div class="card rp-carte" aria-labelledby="h-rp"><h2 id="h-rp">Mes rappels du soir</h2>
      <p class="small muted">Chaque soir de séance, un rappel quand votre récap est prêt. Jamais plus d'un par soir.</p>
      <label class="rp-heure">Heure du rappel
        <select data-rp="heure">${HEURES.map((x) => `<option value="${x}"${x === h ? " selected" : ""}>${x.replace(":", " h ")}</option>`).join("")}</select></label>
      <label class="switch"><input type="checkbox" data-rp="epargne"${r.epargne ? " checked" : ""}> Me rappeler mon épargne du jour si elle n'est pas faite</label>
      <h3>Sur ce téléphone ou cet ordinateur</h3>${etatPush}
      <h3>Sur WhatsApp</h3>
      ${app.acces && !app.acces(1) ? `<div class="verrou"><span class="vr-ic" aria-hidden="true">🔒</span><span>Le rappel sur WhatsApp : disponible avec la formule <b>Essentiel</b>.</span>
          <button type="button" class="btn link small" data-formules>Voir les formules</button></div>`
      : tel ? `<label class="switch"><input type="checkbox" data-rp="whatsapp"${r.whatsapp ? " checked" : ""}>
          J'accepte de recevoir le rappel du soir sur WhatsApp au <b>${esc(tel)}</b>. Je peux l'arrêter à tout moment ici.</label>`
        : `<p class="small">Ajoutez votre numéro de téléphone ci-dessus (Pays et téléphone) pour recevoir le rappel sur WhatsApp.</p>`}
      <div class="actions"><button type="button" class="btn" data-rp="essai"${r.push || r.whatsapp ? "" : " disabled"}>M'envoyer un essai</button></div></div>`;
    const ancre = $(".av-profil", v) || $(".tuto-aide", v);
    if (ancre) ancre.insertAdjacentHTML("beforebegin", html); else v.insertAdjacentHTML("beforeend", html);
  }
  const refaire = () => { $("#v-profil .rp-carte")?.remove(); carte(); };

  document.addEventListener("change", async (ev) => {
    const el = ev.target.closest("[data-rp]");
    if (!el || !app) return;
    try {
      if (el.dataset.rp === "heure") { await sauver({ heure: el.value }); app.toast(`Rappel programmé à ${el.value.replace(":", " h ")}.`); }
      if (el.dataset.rp === "epargne") await sauver({ epargne: el.checked });
      if (el.dataset.rp === "whatsapp") {
        await sauver({ whatsapp: el.checked, ...(el.checked ? { whatsapp_le: new Date().toISOString() } : {}) });
        app.toast(el.checked ? "Rappel WhatsApp activé." : "Rappel WhatsApp arrêté.");
        refaire();
      }
    } catch (e) { app.toast("Enregistrement impossible : " + e.message); }
  });
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-rp]");
    if (!b || !app) return;
    b.disabled = true;
    try {
      if (b.dataset.rp === "activer") await activerPush();
      if (b.dataset.rp === "couper") { await couperPush(); await sauver({ push: false }); }
      if (b.dataset.rp === "essai") {
        const r = await app.essaiRappel();
        app.toast(r?.demo ? "En démonstration, aucun rappel n'est envoyé." : "Essai envoyé.",
          { detail: r?.demo ? "" : [r?.push ? `${r.push} notification${r.push > 1 ? "s" : ""}` : "", r?.whatsapp === "envoye" ? "WhatsApp" : r?.whatsapp === "non_configure" ? "WhatsApp pas encore configuré" : ""].filter(Boolean).join(" · ") });
      }
    } catch (e) { app.toast("Action impossible : " + e.message); }
    b.disabled = false;
    refaire();
  });

  window.addEventListener("brvm:maj", () => setTimeout(() => { if (app?.tab() === "profil") carte(); }, 80));
  window.addEventListener("brvm:pret", async () => {
    app = window.BRVM_APP?.rappels ? window.BRVM_APP : null;
    if (!app) return;
    try { reglages = await app.rappels(); charge = true; } catch (e) { return; }   // rappels.sql pas encore installé
    await etatAbonnement();
    if (abonnement && !app.demo) inscription();               // garde le service worker à jour
    window.dispatchEvent(new Event("brvm:maj"));
  });
})();
