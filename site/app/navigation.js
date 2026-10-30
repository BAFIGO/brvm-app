/* BafiBourse – navigation façon « menu latéral » (inspirée de l'application Claude).
 *   ☰ en haut à gauche ouvre le menu, qui glisse depuis la gauche ; l'écran en cours se décale et s'assombrit.
 *   Rubrique active surlignée ; « Épinglés » (vos titres principaux, vos cercles) ; « Récents » (dernières opérations) ;
 *   en bas, votre avatar (Profil et réglages) et « + Nouvelle opération ».
 *   Le titre de l'écran s'affiche au centre de l'en-tête ; sur Profil, un bouton « i » ouvre la version et les documents légaux.
 *   Chaque changement d'écran glisse de la droite vers la gauche (sauf si le téléphone demande de réduire les animations).
 * app.js fournit window.BRVM_APP et émet « brvm:pret », puis « brvm:maj ». */
(() => {
  "use strict";
  const VERSION = "2026.10.30";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CALME = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ic = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

  const RUBRIQUES = [
    { tab: "aujourdhui", nom: "Aujourd'hui", titre: "Aujourd'hui",
      ic: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>') },
    { tab: "portefeuille", nom: "Portefeuille", titre: "Portefeuille", ic: ic('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>') },
    { tab: "epargne", nom: "Épargne et cercles", titre: "Portefeuille",
      ic: ic('<rect x="3" y="4" width="18" height="15" rx="2.5"/><circle cx="12" cy="11.5" r="3.2"/><path d="M6.5 19v1.6M17.5 19v1.6"/>') },
    { tab: "performance", nom: "Performance", titre: "Performance", ic: ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>') },
    { tab: "marche", nom: "Marché", titre: "Marché", ic: ic('<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>') },
    { tab: "bafibot", nom: "BafiBot", ic: ic('<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/>') },
  ];
  const TITRES = { aujourdhui: "Aujourd'hui", portefeuille: "Portefeuille", performance: "Performance", marche: "Marché", profil: "Profil et réglages" };

  // ---------------------------------------------------------------- éléments (créés une seule fois)
  const bar = $(".topbar");
  if (!bar) return;
  document.body.classList.add("nav-tiroir");
  bar.insertAdjacentHTML("afterbegin", `<button type="button" class="nav-ouvrir" aria-label="Ouvrir le menu" aria-controls="tiroir" aria-expanded="false" hidden>
    ${ic('<path d="M4 7h16M4 12h12M4 17h8"/>')}</button>`);
  bar.querySelector(".brand")?.insertAdjacentHTML("afterend", `<p class="nav-titre" aria-live="polite"></p>
    <button type="button" class="nav-info" aria-label="Informations et documents légaux" aria-haspopup="dialog" aria-controls="dlg-infos" hidden>i</button>`);
  document.body.insertAdjacentHTML("beforeend", `
    <div class="tiroir-fond" hidden></div>
    <nav id="tiroir" class="tiroir" aria-label="Menu principal" hidden>
      <div class="ti-tete">
        <a class="ti-marque" href="#aujourdhui"><img src="../icon.svg?v=carapace1" alt="" width="30" height="30"><span><b class="m-bafi">Bafi</b>Bourse</span></a>
        <button type="button" class="ti-fermer" aria-label="Fermer le menu">${ic('<path d="M15 6l-6 6 6 6"/>')}</button>
      </div>
      <div class="ti-defile">
        <ul class="ti-liste">${RUBRIQUES.map((r) => `<li><a href="#${r.tab === "epargne" || r.tab === "bafibot" ? "" : r.tab}" class="ti-item" data-ti="${r.tab}">${r.ic}<span>${r.nom}</span></a></li>`).join("")}</ul>
        <div class="ti-bloc" data-bloc="epingles" hidden><p class="ti-sous">Épinglés</p><ul class="ti-liste petite"></ul></div>
        <div class="ti-bloc" data-bloc="recents" hidden><p class="ti-sous">Récents</p><ul class="ti-recents"></ul></div>
      </div>
      <div class="ti-pied">
        <a href="#profil" class="ti-moi" data-ti="profil" aria-label="Profil et réglages"></a>
        <button type="button" class="ti-nouvelle">${ic('<path d="M12 5v14M5 12h14"/>')}<span>Nouvelle opération</span></button>
      </div>
    </nav>
    <dialog id="dlg-infos" class="infos" aria-labelledby="infos-t">
      <div class="inf-tete"><p id="infos-t" class="inf-marque"><b class="m-bafi">Bafi</b>Bourse</p><p class="small muted">Version ${VERSION}</p></div>
      <ul class="inf-liste"></ul>
    </dialog>`);

  const ouvrirB = $(".nav-ouvrir"), tiroir = $("#tiroir"), fond = $(".tiroir-fond"), titre = $(".nav-titre"), infoB = $(".nav-info"), infos = $("#dlg-infos");
  let app = null, ouvert = false, retour = null, cacheCercles = null;

  // ---------------------------------------------------------------- ouvrir / fermer le menu
  const derriere = () => [bar, $("#main"), $("#annonce"), ...document.querySelectorAll(".fab, .fab-ia, .defile")].filter(Boolean);
  function ouvrir() {
    if (ouvert) return;
    ouvert = true; retour = document.activeElement;
    remplir();
    tiroir.hidden = false; fond.hidden = false;
    derriere().forEach((n) => n.setAttribute("inert", ""));
    requestAnimationFrame(() => document.body.classList.add("tiroir-ouvert"));
    ouvrirB.setAttribute("aria-expanded", "true");
    setTimeout(() => (tiroir.querySelector('[aria-current="page"]') || $(".ti-item", tiroir)).focus({ preventScroll: true }), CALME ? 0 : 60);
  }
  function fermer(rendreFocus = true) {
    if (!ouvert) return;
    ouvert = false;
    document.body.classList.remove("tiroir-ouvert");
    derriere().forEach((n) => n.removeAttribute("inert"));
    ouvrirB.setAttribute("aria-expanded", "false");
    setTimeout(() => { if (!ouvert) { tiroir.hidden = true; fond.hidden = true; } }, CALME ? 0 : 260);
    if (rendreFocus) (retour?.isConnected ? retour : ouvrirB).focus({ preventScroll: true });
  }
  ouvrirB.addEventListener("click", ouvrir);
  fond.addEventListener("click", () => fermer());
  $(".ti-fermer", tiroir).addEventListener("click", () => fermer());
  tiroir.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); fermer(); return; }
    if (ev.key !== "Tab") return;                               // la tabulation reste dans le menu
    const f = [...tiroir.querySelectorAll("a[href], button:not([disabled])")].filter((n) => n.offsetParent);
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  });
  // glisser le menu vers la gauche le ferme
  let x0 = null;
  tiroir.addEventListener("touchstart", (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
  tiroir.addEventListener("touchend", (ev) => { if (x0 !== null && x0 - ev.changedTouches[0].clientX > 60) fermer(); x0 = null; }, { passive: true });

  tiroir.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-ti]");
    if (a) {
      const t = a.dataset.ti;
      if (t === "epargne") { ev.preventDefault(); fermer(false); app?.allerEpargne?.(); return; }
      if (t === "bafibot") { ev.preventDefault(); fermer(false); window.dispatchEvent(new CustomEvent("brvm:ouvrir-assistant")); return; }
      fermer(false);                                             // le lien change l'écran (#…)
      return;
    }
    if (ev.target.closest(".ti-marque")) { fermer(false); return; }
    if (ev.target.closest(".ti-nouvelle")) { fermer(false); app?.ouvrirOperation?.(); return; }
    const e = ev.target.closest("[data-epingle]");
    if (e) { ev.preventDefault(); fermer(false); if (e.dataset.epingle === "cercle") app?.allerEpargne?.(); else location.hash = "portefeuille"; }
  });

  // ---------------------------------------------------------------- contenu du menu : rubrique active, épinglés, récents, avatar
  // « SONATEL SENEGAL » → « Sonatel Senegal » (sigles gardés en majuscules)
  const SIGLES = new Set(["CI", "BF", "SN", "ML", "NE", "TG", "BJ", "SA", "FCP", "SICAV", "UEMOA", "BOA", "CIE", "SIB", "SGB", "SGBC", "NSIA", "BICI", "BIIC", "CRRH", "SODE", "BRVM", "TPCI", "EOS", "AM"]);
  const joli = (t) => /[a-z]/.test(t) ? t : String(t || "").split(/(\s+|-)/).map((m) => (SIGLES.has(m) || /\d/.test(m) ? m : m.charAt(0) + m.slice(1).toLowerCase())).join("");
  const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
  async function remplir() {
    if (!app) return;
    const t = app.tab?.() || "aujourdhui";
    tiroir.querySelectorAll("[data-ti]").forEach((a) => (a.dataset.ti === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    const moi = $(".ti-moi", tiroir), p = app.profil?.() || {};
    const prenom = p.prenom || (app.email?.() || "").split("@")[0] || "Mon profil";
    moi.innerHTML = (window.BafiAvatar ? window.BafiAvatar(40) : `<span class="av-ini">${esc(prenom[0] || "?")}</span>`) + `<span class="ti-moi-nom">${esc(prenom)}</span>`;
    // récents
    const rec = app.recents?.() || [], bR = $('[data-bloc="recents"]', tiroir);
    bR.hidden = !rec.length;
    $(".ti-recents", bR).innerHTML = rec.map((r) => `<li><span>${esc(r.type)}${r.nom ? " · " + esc(joli(r.nom)) : ""}</span><span class="muted">${esc(fmtDate(r.date))}</span></li>`).join("");
    // épinglés : vos 3 premières lignes, puis vos cercles
    const pos = app.positions?.() || [];
    let cer = [];
    try {
      if (!cacheCercles || Date.now() - cacheCercles.t > 120000) cacheCercles = { t: Date.now(), l: (await app.cercles?.()) || [] };
      cer = cacheCercles.l.slice(0, 2);
    } catch (e) { cer = []; }
    const bE = $('[data-bloc="epingles"]', tiroir);
    const items = pos.map((x) => `<li><a href="#portefeuille" class="ti-item" data-epingle="titre"><span class="ti-pastille">${esc(joli(x.nom).slice(0, 1))}</span><span class="ti-txt">${esc(joli(x.nom))}</span></a></li>`)
      .concat(cer.map((c) => `<li><a href="#portefeuille" class="ti-item" data-epingle="cercle"><span class="ti-pastille rond">${esc((c.nom || "C").slice(0, 1))}</span><span class="ti-txt">${esc(c.nom || "Mon cercle")}</span></a></li>`));
    bE.hidden = !items.length;
    $("ul", bE).innerHTML = items.join("");
  }

  // ---------------------------------------------------------------- en-tête : titre de l'écran, bouton « i » sur Profil
  function entete() {
    if (!app) return;
    const t = app.tab?.() || "aujourdhui";
    titre.textContent = TITRES[t] || "";
    infoB.hidden = t !== "profil";
    if (ouvert) remplir();
  }

  // ---------------------------------------------------------------- fenêtre « i » : version et documents légaux
  const DOCS = [
    ["cgu", "Conditions d'utilisation"], ["confidentialite", "Politique de confidentialité"],
    ["mentions", "Mentions légales"], ["avertissement", "Avertissement sur les risques"],
  ];
  const IC_DOC = ic('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>');
  const IC_AIDE = ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>');
  function ouvrirInfos() {
    const docs = app?.documents?.() || {}, contact = window.BRVM_CONFIG?.contact || {};
    const lignes = DOCS.map(([k, nom]) => docs[k]
      ? `<li><button type="button" data-doc="${k}">${IC_DOC}<span>${esc(docs[k].titre || nom)}</span></button></li>`
      : `<li><span class="inf-absent">${IC_DOC}<span>${nom}<small>Bientôt disponible</small></span></span></li>`);
    const aide = contact.email ? `<a href="mailto:${esc(contact.email)}">${IC_AIDE}<span>Aide et assistance</span></a>`
      : `<button type="button" data-aide>${IC_AIDE}<span>Aide et assistance</span></button>`;
    $(".inf-liste", infos).innerHTML = lignes.join("") + `<li class="inf-sep" aria-hidden="true"></li><li>${aide}</li>`;
    infos.showModal();
  }
  infoB.addEventListener("click", ouvrirInfos);
  infos.addEventListener("click", (ev) => {
    if (ev.target === infos) { infos.close(); return; }                       // toucher le fond ferme
    const d = ev.target.closest("[data-doc]");
    if (d) { const doc = app?.documents?.()[d.dataset.doc]; infos.close(); if (doc) app.voirDocument(doc); return; }
    if (ev.target.closest("[data-aide]")) { infos.close(); window.dispatchEvent(new CustomEvent("brvm:ouvrir-assistant")); }
  });

  // ---------------------------------------------------------------- l'écran glisse de la droite vers la gauche
  let precedent = null;
  function glisser() {
    const t = app?.tab?.();
    if (!t || t === precedent) return;
    const v = document.getElementById("v-" + t);
    if (precedent && v && !CALME) { v.classList.remove("glisse"); void v.offsetWidth; v.classList.add("glisse"); }
    precedent = t;
  }

  window.addEventListener("brvm:pret", () => {
    app = window.BRVM_APP;
    ouvrirB.hidden = false;
    entete(); precedent = app.tab?.();
  });
  window.addEventListener("hashchange", () => { if (!app) return; fermer(false); glisser(); entete(); });
  window.addEventListener("brvm:maj", entete);
})();
