/* BafiBourse – navigation façon « menu latéral » (inspirée de l'application Claude).
 *   ☰ en haut à gauche ouvre le menu, qui glisse depuis la gauche ; l'écran en cours se décale et s'assombrit.
 *   Rubrique active surlignée ; « Épinglés » (vos titres principaux, vos cercles) ; « Récents » (dernières opérations) ;
 *   en bas, votre avatar (Profil et réglages) et « + Nouvelle opération ».
 *   Le titre de l'écran s'affiche au centre de l'en-tête ; sur Profil, un bouton « i » ouvre la version et les documents légaux.
 *   Chaque changement d'écran glisse de la droite vers la gauche (sauf si le téléphone demande de réduire les animations).
 * app.js fournit window.BRVM_APP et émet « brvm:pret », puis « brvm:maj ». */
(() => {
  "use strict";
  const VERSION = "2026.10.30c";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CALME = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ic = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

  // Menu : chaque rubrique ouvre exactement son écran (les quatre rubriques du Portefeuille sont séparées).
  // BafiBot n'y figure pas : son bouton flottant est toujours là.
  const RUBRIQUES = [
    { id: "aujourdhui", nom: "Aujourd'hui", href: "#aujourdhui",
      ic: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>') },
    { id: "pf:placements", nom: "Mes placements", ic: ic('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>') },
    { id: "pf:epargne", nom: "Mon épargne", ic: ic('<rect x="3" y="4" width="18" height="15" rx="2.5"/><circle cx="12" cy="11.5" r="3.2"/><path d="M6.5 19v1.6M17.5 19v1.6"/>') },
    { id: "pf:cercles", nom: "Mes cercles", ic: ic('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="4.5" r="2"/><circle cx="5.5" cy="16" r="2"/><circle cx="18.5" cy="16" r="2"/>') },
    { id: "pf:simulateur", nom: "Simulateur", ic: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>') },
    { id: "performance", nom: "Performance", href: "#performance", ic: ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>') },
    { id: "marche", nom: "Marché", href: "#marche", ic: ic('<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>') },
  ];
  const NOMS_PF = { placements: "Mes placements", epargne: "Mon épargne", cercles: "Mes cercles", simulateur: "Simulateur" };
  const TITRES = { aujourdhui: "Aujourd'hui", portefeuille: "Portefeuille", performance: "Performance", marche: "Marché", profil: "Profil et réglages" };

  // ---------------------------------------------------------------- éléments (créés une seule fois)
  const bar = $(".topbar");
  if (!bar) return;
  document.body.classList.add("nav-tiroir");
  bar.insertAdjacentHTML("afterbegin", `<button type="button" class="nav-ouvrir" aria-label="Ouvrir le menu" aria-controls="tiroir" aria-expanded="false" hidden>
    ${ic('<path d="M4 7h16M4 12h12M4 17h8"/>')}</button>`);
  bar.querySelector(".brand")?.insertAdjacentHTML("afterend", `<p class="nav-titre" aria-live="polite"></p>
    <button type="button" class="nav-info" aria-label="Informations et documents légaux" aria-haspopup="dialog" aria-controls="dlg-infos" hidden>i</button>`);
  // L'écran (en-tête, bandeau, contenu) est regroupé dans un panneau qui glisse vers la droite et découvre le menu,
  // posé en dessous, comme dans l'application Claude. Les boutons flottants restent hors du panneau.
  const ecran = document.createElement("div");
  ecran.className = "ecran";
  bar.before(ecran);
  [bar, $("#annonce"), $("#main")].filter(Boolean).forEach((n) => ecran.append(n));
  document.body.insertAdjacentHTML("beforeend", `
    <div class="ecran-voile" hidden aria-hidden="true"></div>
    <nav id="tiroir" class="tiroir" aria-label="Menu principal" hidden>
      <div class="ti-tete">
        <a class="ti-marque" href="#aujourdhui"><img src="../icon.svg?v=carapace1" alt="" width="30" height="30"><span><b class="m-bafi">Bafi</b>Bourse</span></a>
        <button type="button" class="ti-cadeau" aria-label="Parrainage : offrez BafiBourse à vos proches" aria-haspopup="dialog" aria-controls="dlg-parrainage">
          ${ic('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>')}<span class="ti-cadeau-pt" hidden></span></button>
      </div>
      <div class="ti-defile">
        <ul class="ti-liste">${RUBRIQUES.map((r) => `<li><a href="${r.href || "#portefeuille"}" class="ti-item" data-ti="${r.id}">${r.ic}<span>${r.nom}</span></a></li>`).join("")}</ul>
        <div class="ti-bloc" data-bloc="epingles"><p class="ti-sous">Épinglés</p><ul class="ti-liste petite"></ul>
          <p class="ti-astuce small" hidden>Touchez « Épingler » sur une ligne de Mes placements pour la retrouver ici.</p></div>
        <div class="ti-bloc" data-bloc="recents" hidden><p class="ti-sous">Récents</p><ul class="ti-recents"></ul></div>
      </div>
      <div class="ti-pied">
        <a href="#profil" class="ti-moi" data-ti="profil" aria-label="Profil et réglages"></a>
        <button type="button" class="ti-nouvelle">${ic('<path d="M12 5v14M5 12h14"/>')}<span>Nouvelle opération</span></button>
      </div>
    </nav>
    <dialog id="dlg-parrainage" class="parrainage" aria-labelledby="parr-t"><div class="parr">
      <button type="button" class="parr-fermer" aria-label="Fermer">${ic('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
      <div class="parr-ic bf-ic" aria-hidden="true">${ic('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>')}</div>
      <h2 id="parr-t">Offrez BafiBourse, gagnez un mois</h2>
      <p class="parr-lead">Invitez un proche à épargner avec vous. Dès qu'il prend une formule payante, vous recevez <b>un mois d'Essentiel offert</b>.</p>
      <ol class="parr-etapes">
        <li><span>1</span><div><b>Partagez votre lien</b><small>Par WhatsApp, SMS ou e-mail.</small></div></li>
        <li><span>2</span><div><b>Votre proche s'inscrit</b><small>Il profite lui aussi de 14 jours d'Essentiel offerts.</small></div></li>
        <li><span>3</span><div><b>Il choisit une formule payante</b><small>Votre mois d'Essentiel s'ajoute automatiquement.</small></div></li>
      </ol>
      <div class="parr-code"><span class="small muted">Votre code</span><code></code></div>
      <p class="parr-bilan small" hidden></p>
      <div class="parr-actions">
        <button type="button" class="btn primary parr-partager">Partager mon lien</button>
        <button type="button" class="btn parr-copier">Copier le lien</button>
      </div>
      <p class="small muted parr-note">Un mois offert par proche abonné, sans limite. Votre code ne donne accès à aucune de vos données.</p>
    </div></dialog>
    <dialog id="dlg-infos" class="infos" aria-labelledby="infos-t">
      <div class="inf-tete"><p id="infos-t" class="inf-marque"><b class="m-bafi">Bafi</b>Bourse</p><p class="small muted">Version ${VERSION}</p></div>
      <ul class="inf-liste"></ul>
    </dialog>`);

  const ouvrirB = $(".nav-ouvrir"), tiroir = $("#tiroir"), voile = $(".ecran-voile"), titre = $(".nav-titre"), infoB = $(".nav-info"), infos = $("#dlg-infos");
  let app = null, ouvert = false, retour = null, cacheCercles = null;

  // ---------------------------------------------------------------- ouvrir / fermer : l'écran glisse et découvre le menu
  const largeur = () => tiroir.getBoundingClientRect().width || Math.min(320, innerWidth * 0.84);
  const flottants = () => [...document.querySelectorAll(".fab, .fab-ia, .defile")];
  function poser(x, anime) {                                     // x : décalage de l'écran, de 0 (fermé) à la largeur du menu
    ecran.style.transition = anime && !CALME ? "" : "none";
    ecran.style.transform = x > 0 ? `translateX(${x}px)` : "";
    const k = Math.max(0, Math.min(1, x / largeur()));
    document.body.style.setProperty("--ouverture", k.toFixed(3));
  }
  function montrerMenu() {
    tiroir.hidden = false;
    document.body.classList.add("tiroir-visible");
    remplir();
  }
  function ouvrir() {
    if (ouvert) return;
    ouvert = true; retour = document.activeElement;
    montrerMenu();
    document.body.classList.add("tiroir-ouvert");
    voile.hidden = false;
    [ecran, ...flottants()].forEach((n) => n.setAttribute("inert", ""));
    requestAnimationFrame(() => poser(largeur(), true));
    ouvrirB.setAttribute("aria-expanded", "true");
    setTimeout(() => (tiroir.querySelector('[aria-current="page"]') || $(".ti-item", tiroir)).focus({ preventScroll: true }), CALME ? 0 : 60);
  }
  function fermer(rendreFocus = true) {
    if (!ouvert && !document.body.classList.contains("tiroir-visible")) return;
    ouvert = false;
    poser(0, true);
    document.body.classList.remove("tiroir-ouvert");
    voile.hidden = true;
    [ecran, ...flottants()].forEach((n) => n.removeAttribute("inert"));
    ouvrirB.setAttribute("aria-expanded", "false");
    setTimeout(() => { if (!ouvert) { tiroir.hidden = true; document.body.classList.remove("tiroir-visible"); ecran.style.transform = ""; } }, CALME ? 0 : 300);
    if (rendreFocus) (retour?.isConnected ? retour : ouvrirB).focus({ preventScroll: true });
  }
  ouvrirB.addEventListener("click", ouvrir);
  voile.addEventListener("click", () => fermer());
  tiroir.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); fermer(); return; }
    if (ev.key !== "Tab") return;                               // la tabulation reste dans le menu
    const f = [...tiroir.querySelectorAll("a[href], button:not([disabled])")].filter((n) => n.offsetParent);
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  });

  // ---------------------------------------------------------------- au doigt : l'écran suit le geste
  // Fermé : glisser vers la droite (depuis n'importe où, sauf sur une zone qui défile de côté) ouvre le menu.
  // Ouvert : glisser vers la gauche, sur le menu ou sur l'écran, le referme. On relâche : il va au plus proche.
  let geste = null;
  const defileDeCote = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.matches?.("input, textarea, select, [contenteditable], dialog")) return true;
      const o = getComputedStyle(n).overflowX;
      if ((o === "auto" || o === "scroll") && n.scrollWidth > n.clientWidth + 2) return true;
    }
    return false;
  };
  function debut(ev) {
    if (!app || ev.touches.length !== 1 || document.querySelector("dialog[open]") || document.getElementById("tuto")?.offsetParent) return;
    const t = ev.touches[0];
    if (!ouvert && defileDeCote(ev.target)) return;
    geste = { x0: t.clientX, y0: t.clientY, t0: performance.now(), base: ouvert ? largeur() : 0, actif: false, x: 0 };
  }
  function suivre(ev) {
    if (!geste) return;
    const t = ev.touches[0], dx = t.clientX - geste.x0, dy = t.clientY - geste.y0;
    if (!geste.actif) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx) || (!ouvert && dx < 0) || (ouvert && dx > 0 && geste.base)) { geste = null; return; }  // défilement vertical : on laisse faire
      geste.actif = true;
      if (!ouvert) montrerMenu();
    }
    ev.preventDefault();
    geste.x = Math.max(0, Math.min(largeur(), geste.base + dx));
    poser(geste.x, false);
  }
  function fin() {
    if (!geste) return;
    const g = geste; geste = null;
    if (!g.actif) return;
    const v = (g.x - g.base) / Math.max(1, performance.now() - g.t0);        // vitesse en px/ms
    const versOuvert = v > 0.4 || (v > -0.4 && g.x > largeur() * 0.4);
    if (versOuvert) { if (ouvert) poser(largeur(), true); else ouvrir(); }
    else { if (!ouvert) { ouvert = true; } fermer(false); }
  }
  document.addEventListener("touchstart", debut, { passive: true });
  document.addEventListener("touchmove", suivre, { passive: false });
  document.addEventListener("touchend", fin, { passive: true });
  document.addEventListener("touchcancel", fin, { passive: true });
  addEventListener("resize", () => { if (ouvert) poser(largeur(), false); });

  // ---------------------------------------------------------------- cadeau : le parrainage
  const parr = $("#dlg-parrainage");
  function lienParrain() {
    const code = app?.abo?.()?.code_parrain || "";
    return code ? `${location.origin}${location.pathname}?parrain=${encodeURIComponent(code)}` : "";
  }
  function ouvrirParrainage() {
    const a = app?.abo?.() || {}, lien = lienParrain();
    $(".parr-code code", parr).textContent = a.code_parrain || "…";
    const n = +a.filleuls || 0, b = $(".parr-bilan", parr);
    b.hidden = !n;
    b.textContent = n ? `Déjà ${n} proche${n > 1 ? "s" : ""} inscrit${n > 1 ? "s" : ""} avec votre lien. Merci !` : "";
    $(".parr-partager", parr).disabled = $(".parr-copier", parr).disabled = !lien;
    parr.showModal();
  }
  $(".ti-cadeau", tiroir).addEventListener("click", () => { fermer(false); setTimeout(ouvrirParrainage, CALME ? 0 : 200); });
  $(".parr-fermer", parr).addEventListener("click", () => parr.close());
  parr.addEventListener("click", (ev) => { if (ev.target === parr) parr.close(); });
  $(".parr-partager", parr).addEventListener("click", async () => {
    const lien = lienParrain(), texte = `Je mets de côté chaque jour et je suis mes placements à la BRVM avec BafiBourse. Inscris-toi avec mon lien, tu as 14 jours d'Essentiel offerts : ${lien}`;
    try { if (navigator.share) { await navigator.share({ text: texte }); return; } } catch (e) { if (e.name === "AbortError") return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(texte), "_blank", "noopener");
  });
  $(".parr-copier", parr).addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(lienParrain()); app?.toast?.("Lien de parrainage copié."); }
    catch (e) { app?.toast?.("Copie impossible : touchez « Partager mon lien »."); }
  });

  tiroir.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-ti]");
    if (a) {
      const t = a.dataset.ti;
      if (t.startsWith("pf:")) { ev.preventDefault(); fermer(false); app?.allerPf?.(t.slice(3)); return; }
      if (app?.tab?.() === t) { ev.preventDefault(); fermer(); return; }  // déjà sur cet écran : on referme simplement
      fermer(false);                                             // le lien change l'écran (#…)
      return;
    }
    if (ev.target.closest(".ti-marque")) { fermer(false); return; }
    if (ev.target.closest(".ti-nouvelle")) { fermer(false); app?.ouvrirOperation?.(); return; }
    const e = ev.target.closest("[data-epingle]");
    if (e) { ev.preventDefault(); fermer(false); if (e.dataset.epingle === "cercle") app?.allerPf?.("cercles"); else app?.allerPf?.("placements", e.dataset.code); }
  });

  // ---------------------------------------------------------------- contenu du menu : rubrique active, épinglés, récents, avatar
  // « SONATEL SENEGAL » → « Sonatel Senegal » (sigles gardés en majuscules)
  const SIGLES = new Set(["CI", "BF", "SN", "ML", "NE", "TG", "BJ", "SA", "FCP", "SICAV", "UEMOA", "BOA", "CIE", "SIB", "SGB", "SGBC", "NSIA", "BICI", "BIIC", "CRRH", "SODE", "BRVM", "TPCI", "EOS", "AM"]);
  const joli = (t) => /[a-z]/.test(t) ? t : String(t || "").split(/(\s+|-)/).map((m) => (SIGLES.has(m) || /\d/.test(m) ? m : m.charAt(0) + m.slice(1).toLowerCase())).join("");
  const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
  const actif = () => { const t = app?.tab?.() || "aujourdhui"; return t === "portefeuille" ? "pf:" + (app.ongletPf?.() || "placements") : t; };
  async function remplir() {
    if (!app) return;
    const t = actif();
    tiroir.querySelectorAll("[data-ti]").forEach((a) => (a.dataset.ti === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    const moi = $(".ti-moi", tiroir), p = app.profil?.() || {};
    const prenom = p.prenom || (app.email?.() || "").split("@")[0] || "Mon profil";
    moi.innerHTML = (window.BafiAvatar ? window.BafiAvatar(40) : `<span class="av-ini">${esc(prenom[0] || "?")}</span>`) + `<span class="ti-moi-nom">${esc(prenom)}</span>`;
    // récents
    const rec = app.recents?.() || [], bR = $('[data-bloc="recents"]', tiroir);
    bR.hidden = !rec.length;
    $(".ti-recents", bR).innerHTML = rec.map((r) => `<li><span>${esc(r.type)}${r.nom ? " · " + esc(joli(r.nom)) : ""}</span><span class="muted">${esc(fmtDate(r.date))}</span></li>`).join("");
    // épinglés : les titres que vous avez épinglés vous-même, puis vos cercles
    const pins = app.epingles?.() || [];
    let cer = [];
    try {
      if (!cacheCercles || Date.now() - cacheCercles.t > 120000) cacheCercles = { t: Date.now(), l: (await app.cercles?.()) || [] };
      cer = cacheCercles.l.slice(0, 2);
    } catch (e) { cer = []; }
    const bE = $('[data-bloc="epingles"]', tiroir);
    const items = pins.map((x) => `<li><a href="#portefeuille" class="ti-item" data-epingle="titre" data-code="${esc(x.code)}"><span class="ti-pastille">${esc(joli(x.nom).slice(0, 1))}</span><span class="ti-txt">${esc(joli(x.nom))}</span></a></li>`)
      .concat(cer.map((c) => `<li><a href="#portefeuille" class="ti-item" data-epingle="cercle"><span class="ti-pastille rond">${esc((c.nom || "C").slice(0, 1))}</span><span class="ti-txt">${esc(c.nom || "Mon cercle")}</span></a></li>`));
    $("ul", bE).innerHTML = items.join("");
    $(".ti-astuce", bE).hidden = pins.length > 0;
  }

  // ---------------------------------------------------------------- en-tête : titre de l'écran, bouton « i » sur Profil
  function entete() {
    if (!app) return;
    const t = app.tab?.() || "aujourdhui";
    titre.textContent = t === "portefeuille" ? NOMS_PF[app.ongletPf?.()] || "Portefeuille" : TITRES[t] || "";
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
