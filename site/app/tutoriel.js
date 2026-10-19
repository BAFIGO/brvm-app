/* BRVM Portefeuille – prise en main guidée.
 * 1. Visite de bienvenue : 5 bulles au plus, proposée une seule fois après l'inscription.
 * 2. « Mes premiers pas » : liste sur l'écran Aujourd'hui ; chaque ligne lance un mini-guide et se coche
 *    toute seule quand l'action est réellement faite (dépôt, achat, alertes, robot, plan d'épargne).
 * 3. Une astuce à la première visite de Portefeuille, Performance et Marché.
 * 4. Dans le Profil : revoir la visite, réafficher la liste.
 * L'avancement est gardé dans le profil (colonne « tutoriel », fichier tutoriel.sql) ; chaque étape est
 * notée dans tutoriel_evenements pour les indicateurs de la console. app.js fournit window.BRVM_APP. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CALME = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const visible = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && !el.closest("[hidden]");
  let app = null, enCours = false;

  // ---------------------------------------------------------------- état (gardé dans le profil)
  const etat = () => {
    const e = { ...(app.tutoriel() || {}) };
    e.pas = { ...(e.pas || {}) }; e.astuces = { ...(e.astuces || {}) };
    return e;
  };
  const sauver = (e) => app.sauverTutoriel(e);
  const noter = (evenement, etape) => app.evenement(evenement, etape == null ? null : String(etape));

  // ---------------------------------------------------------------- la bulle (avec mise en lumière de l'élément expliqué)
  document.body.insertAdjacentHTML("beforeend", `
    <div id="tuto" hidden>
      <div class="tuto-voile"></div>
      <div class="tuto-halo" aria-hidden="true"></div>
      <div class="tuto-bulle" role="dialog" aria-modal="true" aria-labelledby="tuto-titre" aria-describedby="tuto-texte">
        <p class="tuto-pos" id="tuto-pos"></p>
        <h2 id="tuto-titre" tabindex="-1"></h2>
        <p id="tuto-texte"></p>
        <div class="tuto-act">
          <button type="button" class="btn link tuto-passer"></button>
          <span class="tuto-espace"></span>
          <button type="button" class="btn tuto-retour">Retour</button>
          <button type="button" class="btn primary tuto-suivant"></button>
        </div>
      </div>
    </div>`);
  const racine = $("#tuto"), voile = $(".tuto-voile", racine), halo = $(".tuto-halo", racine), bulle = $(".tuto-bulle", racine);
  const bPasser = $(".tuto-passer", bulle), bRetour = $(".tuto-retour", bulle), bSuivant = $(".tuto-suivant", bulle);
  let cibleActuelle = null, rendu = null, inertes = [];

  function placer() {
    const w = Math.min(380, innerWidth - 24);
    bulle.style.width = w + "px";
    const bh = bulle.offsetHeight, c = cibleActuelle;
    if (!c || !visible(c)) {
      halo.hidden = true; voile.classList.add("sombre");
      bulle.style.left = (innerWidth - w) / 2 + "px";
      bulle.style.top = Math.max(12, (innerHeight - bh) / 2) + "px";
      return;
    }
    const r = c.getBoundingClientRect(), m = 6;
    halo.hidden = false; voile.classList.remove("sombre");
    Object.assign(halo.style, { left: r.left - m + "px", top: r.top - m + "px", width: r.width + 2 * m + "px", height: r.height + 2 * m + "px" });
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
    let top;
    if (innerHeight - r.bottom > bh + 24) top = r.bottom + 14;          // en dessous de l'élément
    else if (r.top > bh + 24) top = r.top - bh - 14;                  // au-dessus
    else top = Math.max(12, innerHeight - bh - 12);                   // pas de place : en bas de l'écran
    bulle.style.left = left + "px"; bulle.style.top = top + "px";
  }
  const replacer = () => { if (!racine.hidden) requestAnimationFrame(placer); };
  addEventListener("resize", replacer); addEventListener("scroll", replacer, { passive: true });

  function ouvrirCalque() {
    racine.hidden = false;
    inertes = [...document.body.children].filter((el) => el !== racine && !el.inert);
    inertes.forEach((el) => (el.inert = true));                      // le reste de l'écran est mis en pause
  }
  function fermerCalque() {
    racine.hidden = true; cibleActuelle = null;
    inertes.forEach((el) => (el.inert = false)); inertes = [];
  }
  bulle.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); bPasser.click(); }
    if (ev.key !== "Tab") return;                                     // le clavier reste dans la bulle
    const f = [...bulle.querySelectorAll("button:not([hidden])")];
    const i = f.indexOf(document.activeElement);
    if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
  });

  // Trouve l'élément à montrer (après changement d'onglet si besoin), en attendant qu'il s'affiche
  async function trouver(etape) {
    if (etape.tab && app.tab() !== etape.tab) { app.aller(etape.tab); await attendre(300); }
    for (let i = 0; i < 15; i++) {
      for (const s of [].concat(etape.cible || [])) { const el = $(s); if (visible(el)) return el; }
      if (!etape.cible) return null;
      await attendre(100);
    }
    return null;
  }

  // Affiche une suite de bulles ; renvoie « fin », « passe » ou « action »
  function derouler(etapes, o = {}) {
    return new Promise(async (resoudre) => {
      enCours = true;
      const declencheur = document.activeElement;
      let i = 0, fini = false;
      ouvrirCalque();
      const terminer = (raison) => {
        if (fini) return; fini = true;
        fermerCalque(); enCours = false;
        if (declencheur?.isConnected) declencheur.focus?.({ preventScroll: true });
        resoudre(raison);
      };
      const afficher = async () => {
        const e = etapes[i];
        bulle.classList.add("charge");
        cibleActuelle = await trouver(e);
        if (fini) return;
        if (cibleActuelle) {
          cibleActuelle.scrollIntoView({ block: "center", behavior: CALME ? "auto" : "smooth" });
          if (!CALME) await attendre(300);
        }
        $("#tuto-pos").textContent = etapes.length > 1 ? `${i + 1} sur ${etapes.length}` : (o.surtitre || "");
        $("#tuto-pos").hidden = !$("#tuto-pos").textContent;
        $("#tuto-titre").textContent = e.titre;
        $("#tuto-texte").textContent = typeof e.texte === "function" ? e.texte(cibleActuelle) : e.texte;
        const dernier = i === etapes.length - 1;
        bPasser.textContent = o.passer || (etapes.length > 1 ? "Passer la visite" : "Plus tard");
        bRetour.hidden = i === 0;
        bSuivant.textContent = e.action ? e.action.label : dernier ? (o.terminer || "Terminer") : "Suivant";
        bulle.classList.remove("charge");
        placer();
        o.surEtape?.(i, e);
        $("#tuto-titre").focus({ preventScroll: true });
      };
      bPasser.onclick = () => { o.surPasse?.(i); terminer("passe"); };
      bRetour.onclick = () => { if (i > 0) { i--; afficher(); } };
      bSuivant.onclick = () => {
        const e = etapes[i];
        if (e.action) { terminer("action"); setTimeout(e.action.fn, 50); return; }
        if (i < etapes.length - 1) { i++; afficher(); } else terminer("fin");
      };
      afficher();
    });
  }

  // ---------------------------------------------------------------- 1. visite de bienvenue
  const ETAPES_VISITE = () => [
    { tab: "aujourdhui", cible: "#v-aujourdhui h1", titre: "Aujourd'hui",
      texte: `Chaque soir après la séance : le point sur votre argent, vos alertes et ${app.sim() ? "la simulation" : "la proposition"} du jour.` },
    { tab: "portefeuille", cible: '#v-portefeuille [data-op=""]', titre: "Noter vos opérations",
      texte: "Après chaque achat, vente ou versement chez votre SGI, notez-le ici : tous les calculs partent de ce journal." },
    { cible: ['.tabs-bottom [data-tab="marche"]'], titre: "Le marché",
      texte: "Les analyses du soir pour les actions, obligations et OPCVM de la BRVM. Touchez un titre pour le détail." },
    { cible: "#fab-coffre", optionnel: true, titre: "Votre coffre",
      texte: "Mettez de l'argent de côté avant de l'envoyer à votre SGI, et suivez votre régularité." },
    { cible: "#fab-ia", optionnel: true, titre: "Votre assistant",
      texte: "Une question ? Demandez-lui : il répond avec vos chiffres et l'actualité publiée." },
  ];
  async function lancerVisite(relance = false) {
    if (enCours) return;
    const e = etat();
    noter(relance ? "visite_relancee" : "visite_commencee");
    if (relance && !e.visite_commencee) noter("visite_commencee");
    e.visite_commencee = 1; sauver(e);
    // La visite part d'Aujourd'hui ; le coffre et le robot ne sont montrés que s'ils sont affichés
    if (app.tab() !== "aujourdhui") { app.aller("aujourdhui"); await attendre(350); }
    const etapes = ETAPES_VISITE().filter((s) => !s.optionnel || visible($(s.cible)));
    const fin = await derouler(etapes, {
      surEtape: (i) => noter("visite_etape", i + 1),
      surPasse: (i) => noter("visite_passee", i + 1),
    });
    const e2 = etat();
    e2.astuces.portefeuille = 1;                               // déjà vu pendant la visite
    if (fin === "fin") { e2.visite = "terminee"; noter("visite_terminee"); }
    else if (!e2.visite) e2.visite = "passee";
    sauver(e2);
    app.aller("aujourdhui");
    if (fin === "fin") app.toast("Visite terminée", { detail: "Vos premiers pas vous attendent en haut de cet écran." });
  }
  async function proposerVisite() {
    const p = app.prenom();
    noter("visite_proposee");
    const r = await derouler([{ titre: `Bienvenue${p ? " " + p : ""} !`, texte: "Découvrez l'essentiel de l'application en une minute, en cinq étapes." }],
      { passer: "Plus tard", terminer: "Commencer la visite" });
    if (r === "fin") lancerVisite();
    else { const e = etat(); e.visite = "plus_tard"; sauver(e); noter("visite_plus_tard"); app.render(); }
  }

  // ---------------------------------------------------------------- 2. « Mes premiers pas »
  const ouvrirAssistant = () => window.dispatchEvent(new Event("brvm:ouvrir-assistant"));
  function premiersPas() {
    const f = app.faits(), e = etat(), robot = !!$("#fab-ia");
    return [
      { id: "depot", t: "Noter l'argent versé à ma SGI", fait: f.depot,
        guide: [{ tab: "portefeuille", cible: '#v-portefeuille [data-op=""]', titre: "Noter l'argent versé",
                  texte: "Chaque fois que vous envoyez de l'argent à votre SGI, notez-le ici : c'est le point de départ de tous les calculs.",
                  action: { label: "Noter un versement", fn: () => app.ouvrirOperation("DEPOT") } }] },
      { id: "achat", t: "Enregistrer mon premier achat", fait: f.achat,
        guide: [{ tab: "portefeuille", cible: '#v-portefeuille [data-op=""]', titre: "Enregistrer un achat",
                  texte: "Quand votre SGI confirme un achat (avis d'opéré), notez-le ici avec la quantité, le prix et les frais.",
                  action: { label: "Noter un achat", fn: () => app.ouvrirOperation("ACHAT") } }] },
      { id: "alertes", t: "Découvrir mes alertes", fait: !!e.pas.alertes,
        guide: [{ tab: "aujourdhui", cible: ["#v-aujourdhui .card.alertes", "#v-aujourdhui h1"], titre: "Vos alertes",
                  texte: (c) => c?.matches(".alertes")
                    ? "Après chaque séance, les titres qui demandent votre attention apparaissent ici, avec l'explication. Une alerte est un signal à examiner, jamais une vente automatique."
                    : "Dès que vous détiendrez des titres, leurs alertes apparaîtront ici après chaque séance. Une alerte est un signal à examiner, jamais une vente automatique." }] },
      ...(robot ? [{ id: "robot", t: "Poser une question au robot", fait: !!e.pas.robot,
        guide: [{ cible: "#fab-ia", titre: "Votre assistant", texte: "Posez-lui une question sur votre portefeuille ou le marché : il répond avec vos chiffres.",
                  action: { label: "Poser une question", fn: ouvrirAssistant } }] }] : []),
      ...(f.plan !== null ? [{ id: "epargne", t: "Choisir mon rythme d'épargne", fait: f.plan,
        guide: [{ tab: "profil", cible: ["#f-plan", "#v-profil h1"], titre: "Votre rythme d'épargne",
                  texte: "Choisissez combien mettre de côté et à quel rythme : le coffre vous aide ensuite à le tenir." }] }] : []),
    ];
  }
  // Note chaque premier pas une seule fois, au moment où il devient fait
  function suivrePas(liste) {
    const e = etat(); let change = false;
    for (const p of liste) if (p.fait && !e.pas[p.id]) { e.pas[p.id] = 1; change = true; if (["depot", "achat", "epargne"].includes(p.id)) noter("pas_termine", p.id); }
    if (liste.length && liste.every((p) => p.fait) && e.liste !== "terminee") {
      e.liste = "terminee"; change = true; noter("liste_terminee");
      app.toast("Bravo, vos premiers pas sont faits !", { detail: "Vous savez maintenant tout ce qu'il faut pour suivre votre épargne." });
    }
    if (change) sauver(e);
  }
  async function lancerPas(id) {
    const p = premiersPas().find((x) => x.id === id);
    if (!p || enCours) return;
    noter("pas_guide", id);
    const r = await derouler(p.guide, { surtitre: "Premiers pas", terminer: "Compris" });
    if (id === "alertes" && r === "fin") { const e = etat(); e.pas.alertes = 1; sauver(e); noter("pas_termine", "alertes"); }
    app.render();
  }
  function carteListe() {
    const v = $("#v-aujourdhui");
    if (!v || v.hidden || $(".tuto-liste", v)) return;
    const e = etat();
    if (e.visite === undefined || e.liste === "masquee" || e.liste === "terminee") return;
    const liste = premiersPas(), faits = liste.filter((p) => p.fait).length;
    suivrePas(liste);
    if (faits === liste.length) return;
    const html = `<div class="card tuto-liste" aria-labelledby="tuto-liste-t">
      <div class="tuto-tete"><h2 id="tuto-liste-t">Mes premiers pas</h2><span class="small muted">${faits} sur ${liste.length}</span></div>
      <div class="tuto-barre" role="progressbar" aria-label="Avancement des premiers pas" aria-valuemin="0" aria-valuemax="${liste.length}" aria-valuenow="${faits}">
        <i style="width:${Math.round((faits / liste.length) * 100)}%"></i></div>
      <ul class="tuto-pas">${liste.map((p) => p.fait
        ? `<li class="fait"><span class="tuto-coche" aria-hidden="true">✓</span><span>${esc(p.t)}<span class="sr-only"> : fait</span></span></li>`
        : `<li><button type="button" class="tuto-go" data-pas="${p.id}"><span class="tuto-coche" aria-hidden="true"></span><span>${esc(p.t)}</span><span class="tuto-fleche" aria-hidden="true">›</span></button></li>`).join("")}</ul>
      <p class="small tuto-liens">${e.visite !== "terminee" ? `<button type="button" class="btn link" data-tuto="visite">Faire la visite guidée (1 min)</button> · ` : ""}
        <button type="button" class="btn link" data-tuto="masquer">Masquer</button></p></div>`;
    const avant = $(".card", v);
    if (avant) avant.insertAdjacentHTML("beforebegin", html); else v.insertAdjacentHTML("beforeend", html);
  }

  // ---------------------------------------------------------------- 3. astuce à la première visite d'un onglet
  const ASTUCES = {
    portefeuille: { titre: "Votre portefeuille", texte: "Vos titres valorisés au dernier cours, puis le journal de toutes vos opérations." },
    performance: { titre: "Votre performance", texte: "Votre résultat depuis le début, comparé à l'indice de la BRVM, dividendes compris." },
    marche: { titre: "Le marché", texte: "Les analyses du soir pour chaque titre : touchez une ligne pour voir le détail et les raisons." },
  };
  async function astuce(t) {
    const e = etat();
    if (enCours || !ASTUCES[t] || e.astuces[t] || e.visite === undefined) return;
    e.astuces[t] = 1; sauver(e); noter("astuce_vue", t);
    await attendre(400);
    if (app.tab() !== t) return;
    await derouler([{ cible: `#v-${t} h1`, ...ASTUCES[t] }], { surtitre: "Astuce", passer: "Fermer", terminer: "Compris" });
  }

  // ---------------------------------------------------------------- 4. aide dans le Profil
  function carteAide() {
    const v = $("#v-profil");
    if (!v || v.hidden || $(".tuto-aide", v)) return;
    const e = etat();
    v.insertAdjacentHTML("beforeend", `<div class="card tuto-aide"><h2>Aide à la prise en main</h2>
      <p class="small muted">Revoyez la visite guidée à tout moment, ou réaffichez la liste de vos premiers pas sur l'écran Aujourd'hui.</p>
      <div class="actions"><button type="button" class="btn" data-tuto="revoir">Revoir la visite guidée</button>
      ${e.liste === "masquee" ? `<button type="button" class="btn" data-tuto="liste">Réafficher mes premiers pas</button>` : ""}</div></div>`);
  }

  // ---------------------------------------------------------------- branchements
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tuto], [data-pas]");
    if (!b || !app) return;
    if (b.dataset.pas) return lancerPas(b.dataset.pas);
    const a = b.dataset.tuto, e = etat();
    if (a === "visite") lancerVisite(e.visite === "terminee" || e.visite === "passee");
    else if (a === "revoir") lancerVisite(true);
    else if (a === "masquer") { e.liste = "masquee"; sauver(e); noter("liste_masquee"); app.toast("Liste masquée", { detail: "Vous pouvez la réafficher depuis le Profil." }); app.render(); }
    else if (a === "liste") { delete e.liste; sauver(e); app.toast("Vos premiers pas sont de retour sur l'écran Aujourd'hui."); }
  });
  window.addEventListener("brvm:question", () => {          // première question posée au robot
    const e = etat();
    if (!e.pas.robot) { e.pas.robot = 1; sauver(e); noter("pas_termine", "robot"); }
  });
  window.addEventListener("brvm:maj", () => {
    if (!app) return;
    setTimeout(() => {
      if (enCours) return;
      const t = app.tab();
      if (t === "aujourdhui") carteListe();
      else if (t === "profil") carteAide();
      else astuce(t);
    }, 0);
  });
  window.addEventListener("brvm:pret", () => {
    app = window.BRVM_APP;
    if (!app?.tutoriel) { app = null; return; }
    const e = etat();
    if (e.visite === undefined) {
      // Compte déjà bien utilisé avant cette version : pas de visite imposée (relançable depuis le Profil)
      if (!app.demo && app.nbOps() >= 3) { e.visite = "ancien"; sauver(e); carteListe(); return; }
      setTimeout(() => { if (!enCours && app.tab() === "aujourdhui") proposerVisite(); }, 900);
    } else carteListe();
  });
})();
