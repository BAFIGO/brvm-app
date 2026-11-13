/* BafiBourse – rappels par notification (itération 9 : plus de rappel quotidien par WhatsApp, payant).
 * Carte « Mes rappels » du Profil : notification sur cet appareil, heure du rappel du soir, épargne du jour,
 * bilan de la semaine (dimanche soir), pastille sur l'icône, essai immédiat.
 * Pastille : nombre d'alertes non vues sur l'icône de l'application installée (Badging API), dans le titre de
 * l'onglet « (2) BafiBourse » et sur la petite icône de l'onglet.
 * L'envoi est fait par la fonction Supabase « rappels » (soir de séance publiée, et dimanche pour le bilan). */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const HEURES = ["19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
  const CLE_PUB = (window.BRVM_CONFIG || {}).vapidPublique || "";
  const DEFAUT = { push: false, heure: "20:00", epargne: true, bilan_hebdo: true, badge: true };
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
  const heureFr = (h) => String(h).slice(0, 5).replace(":", " h ").replace(/ 00$/, "");

  async function inscription() {
    if (!pushPossible) return null;
    return (await navigator.serviceWorker.getRegistration("./")) || navigator.serviceWorker.register("sw.js");
  }
  async function etatAbonnement() {
    try { const reg = await navigator.serviceWorker?.getRegistration("./"); abonnement = reg ? await reg.pushManager.getSubscription() : null; }
    catch (e) { abonnement = null; }
  }
  // « ok », « ios » (installer d'abord), « bloque », « impossible »
  const etatAppareil = () => (!pushPossible ? (ios && !installee ? "ios" : "impossible") : ios && !installee ? "ios" : Notification.permission === "denied" ? "bloque" : "ok");

  // ---------------------------------------------------------------- activer ou couper la notification sur cet appareil
  async function activerPush(opts = {}) {
    if (app.demo) { await sauver({ push: true }); abonnement = abonnement || { demo: true }; app.toast("En démonstration, aucune notification n'est envoyée."); return true; }
    if (!CLE_PUB) { app.toast("Notifications pas encore configurées.", { detail: "La clé publique manque dans config.js." }); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { app.toast("Notifications refusées.", { detail: "Vous pourrez les autoriser plus tard dans les réglages du navigateur." }); return false; }
    const reg = await inscription();
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(CLE_PUB) });
    await app.abonnerPush({ endpoint: sub.endpoint, p256dh: enB64(sub.getKey("p256dh")), auth: enB64(sub.getKey("auth")), appareil: appareil() });
    await sauver({ push: true, ...(opts.heure ? { heure: opts.heure } : {}) });
    abonnement = sub;
    if (!opts.discret) app.toast("Notifications activées sur cet appareil.", { detail: "Un seul rappel par soir de séance, et le bilan du dimanche." });
    return true;
  }
  async function couperPush() {
    try {
      if (abonnement && !abonnement.demo) { await app.desabonnerPush(abonnement.endpoint); await abonnement.unsubscribe(); }
    } catch (e) { /* déjà désabonné */ }
    abonnement = null;
    app.toast("Notifications coupées sur cet appareil.");
  }
  async function sauver(maj) {
    reglages = { ...DEFAUT, ...(reglages || {}), ...maj };
    await app.sauverRappels({ ...maj, fuseau_min: -new Date().getTimezoneOffset() });
    if ("badge" in maj) pastille(dernierN);
  }

  // ---------------------------------------------------------------- la carte du Profil
  const opt = (k, titre, sous, on, dis = false) => `<label class="rp-opt"><span><b>${titre}</b><small>${sous}</small></span>
      <input type="checkbox" data-rp="${k}"${on ? " checked" : ""}${dis ? " disabled" : ""}></label>`;
  function blocAppareil() {
    const e = app?.demo ? "ok" : etatAppareil(), ici = !!abonnement;
    if (e === "ios") return `<div class="rp-opt rp-info"><span><b>Notification sur ce téléphone</b>
        <small>Sur iPhone, ajoutez d'abord BafiBourse à l'écran d'accueil : touchez <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>, et ouvrez l'application depuis l'icône.</small></span></div>`;
    if (e === "impossible") return `<div class="rp-opt rp-info"><span><b>Notification</b><small>Ce navigateur ne permet pas les notifications.</small></span></div>`;
    if (e === "bloque") return `<div class="rp-opt rp-info"><span><b>Notification bloquée</b><small>Autorisez les notifications pour ce site dans les réglages du navigateur.</small></span></div>`;
    return opt("appareil", "Notification sur cet appareil", ici ? `✓ Activée${appareil() === "Navigateur" ? " sur cet appareil" : " sur " + appareil()}` : "Gratuit. Un seul rappel par soir.", ici);
  }
  function carte() {
    const v = $("#v-profil");
    if (!v || v.hidden || !charge || $(".rp-carte", v)) return;
    const r = { ...DEFAUT, ...(reglages || {}) }, h = String(r.heure).slice(0, 5), actif = !!abonnement;
    const html = `<div class="card rp-carte" aria-labelledby="h-rp"><h2 id="h-rp">Mes rappels</h2>
      <div class="rp-liste">
        ${blocAppareil()}
        <label class="rp-opt"><span><b>Heure du rappel du soir</b><small>Quand votre récap est prêt</small></span>
          <select data-rp="heure" aria-label="Heure du rappel du soir">${HEURES.map((x) => `<option value="${x}"${x === h ? " selected" : ""}>${heureFr(x)}</option>`).join("")}</select></label>
        ${opt("epargne", "Mon épargne du jour", "Si elle n'est pas faite", r.epargne)}
        ${opt("bilan_hebdo", "Bilan de la semaine", "Le dimanche soir", r.bilan_hebdo !== false)}
        ${opt("badge", "Pastille sur l'icône", "Le nombre de choses à regarder", r.badge !== false)}
      </div>
      <div class="actions"><button type="button" class="btn" data-rp="essai"${actif ? "" : " disabled"}>M'envoyer un essai</button></div>
      <p class="small muted">Les rappels quotidiens par WhatsApp sont arrêtés : la notification les remplace, gratuitement.</p></div>`;
    const ancre = $(".av-profil", v) || $(".tuto-aide", v);
    if (ancre) ancre.insertAdjacentHTML("beforebegin", html); else v.insertAdjacentHTML("beforeend", html);
  }
  const refaire = () => { $("#v-profil .rp-carte")?.remove(); carte(); };

  document.addEventListener("change", async (ev) => {
    const el = ev.target.closest(".rp-carte [data-rp]");
    if (!el || !app) return;
    const k = el.dataset.rp;
    el.disabled = true;
    try {
      if (k === "heure") { await sauver({ heure: el.value }); app.toast(`Rappel du soir à ${heureFr(el.value)}.`); }
      if (k === "epargne" || k === "bilan_hebdo" || k === "badge") await sauver({ [k]: el.checked });
      if (k === "appareil") { if (el.checked) await activerPush(); else { await couperPush(); await sauver({ push: false }); } refaire(); }
    } catch (e) { app.toast("Enregistrement impossible : " + e.message); refaire(); }
    el.disabled = false;
  });
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest(".rp-carte button[data-rp='essai']");
    if (!b || !app) return;
    b.disabled = true;
    try {
      const r = await app.essaiRappel();
      app.toast(r?.demo ? "En démonstration, aucune notification n'est envoyée." : r?.push ? "Essai envoyé." : "Aucun appareil n'a reçu l'essai.",
        { detail: r?.demo ? "" : r?.push ? `${r.push} notification${r.push > 1 ? "s" : ""}` : "Coupez puis réactivez la notification sur cet appareil." });
    } catch (e) { app.toast("Essai impossible : " + e.message); }
    b.disabled = false;
  });

  // ---------------------------------------------------------------- pastille : icône de l'application, titre et icône de l'onglet
  let dernierN = 0, iconeBase = null, titreBase = null;
  const lienIcone = () => document.querySelector('link[rel="icon"]');
  function iconeOnglet(n) {
    const l = lienIcone();
    if (!l) return;
    if (iconeBase == null) iconeBase = l.href;
    if (!n) { if (l.href !== iconeBase) { l.href = iconeBase; l.type = "image/svg+xml"; } return; }
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 64;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0, 64, 64);
        g.beginPath(); g.arc(46, 18, 17, 0, 2 * Math.PI); g.fillStyle = "#D92D20"; g.fill();
        g.lineWidth = 3; g.strokeStyle = "#fff"; g.stroke();
        g.fillStyle = "#fff"; g.font = "bold 22px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(n > 9 ? "9+" : String(n), 46, 19);
        l.type = "image/png"; l.href = c.toDataURL("image/png");
      } catch (e) { /* dessin impossible : on garde l'icône normale */ }
    };
    img.src = iconeBase;
  }
  function pastille(n) {
    n = Math.max(0, Math.min(99, +n || 0));
    dernierN = n;
    const voir = (reglages?.badge ?? (() => { try { return localStorage.getItem("brvm-pastille") !== "0"; } catch (e) { return true; } })()) !== false;
    try { localStorage.setItem("brvm-pastille", voir ? "1" : "0"); } catch (e) { /* stockage indisponible */ }
    const m = voir ? n : 0;
    try { if ("setAppBadge" in navigator) (m ? navigator.setAppBadge(m) : navigator.clearAppBadge()).catch(() => {}); } catch (e) { /* non pris en charge */ }
    if (titreBase == null || !/^\(\d+\+?\) /.test(document.title)) titreBase = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = m ? `(${m > 9 ? "9+" : m}) ${titreBase}` : titreBase;
    iconeOnglet(m);
  }
  window.addEventListener("bafi:alertes", (ev) => pastille(ev.detail?.n));

  // pour l'écran de démarrage du budget (budget.js)
  window.BafiRappels = { etatAppareil: () => (app?.demo ? "ok" : etatAppareil()), activerPush: (o) => (app ? activerPush(o) : Promise.resolve(false)), active: () => !!abonnement };

  window.addEventListener("brvm:maj", () => setTimeout(() => { if (app?.tab() === "profil") carte(); }, 80));
  window.addEventListener("brvm:pret", async () => {
    app = window.BRVM_APP?.rappels ? window.BRVM_APP : null;
    if (!app) return;
    try { reglages = { ...DEFAUT, ...((await app.rappels()) || {}) }; charge = true; } catch (e) { return; }   // table pas encore installée
    await etatAbonnement();
    if (app.demo && reglages.push) abonnement = { demo: true };
    if (abonnement && !app.demo) inscription();               // garde le service worker à jour
    pastille(dernierN);
    window.dispatchEvent(new Event("brvm:maj"));
  });
})();
