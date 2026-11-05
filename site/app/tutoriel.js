/* BafiBourse – prise en main guidée.
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
    if (document.body.classList.contains("tiroir-ouvert")) { document.querySelector(".ecran-voile")?.click(); await attendre(320); }
    if (etape.pf) {
      if (app.tab() !== "portefeuille" || app.ongletPf?.() !== etape.pf) { app.allerPf?.(etape.pf); await attendre(500); }
    } else if (etape.tab && app.tab() !== etape.tab) { app.aller(etape.tab); await attendre(400); }
    if ([].concat(etape.cible || []).some((c) => /fab/.test(c)) && document.body.classList.contains("fabs-caches")) {
      document.body.classList.remove("fabs-caches"); await attendre(260);              // le temps de son retour à l'écran
    }
    for (let i = 0; i < 15; i++) {
      for (const s of [].concat(etape.cible || [])) {
        const el = $(s);
        // cible dans une rubrique ou un bloc replié (Profil, ordres, journal) : on l'ouvre d'abord
        if (el && !visible(el)) { const d = el.closest("details:not([open])"); if (d) { d.open = true; await attendre(60); } }
        if (visible(el)) return el;
      }
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
  // Visite guidée : le parcours du menu, dans l'ordre — 1. mon argent au quotidien, 2. je garde, 3. je fais grandir, puis BafiBot.
  // Chaque étape sait se rendre seule à son écran (onglets du portefeuille compris) : la visite ne se coupe plus.
  const ETAPES_VISITE = () => [
    { tab: "aujourdhui", cible: [".nav-ouvrir"], titre: "Le menu : trois étapes",
      texte: "Touchez ici (ou glissez depuis la gauche) : 1. mon argent au quotidien, 2. je garde, 3. je fais grandir. La visite suit cet ordre." },
    { tab: "aujourdhui", cible: ["#v-aujourdhui .bu-phrase", "#v-aujourdhui .synthese", "#v-aujourdhui h1"], titre: "1 · Aujourd'hui",
      texte: (c) => c?.matches(".bu-phrase") ? "Ce que vous pouvez dépenser aujourd'hui, sans toucher à votre épargne. La bascule Simple / Détaillé, au-dessus, change l'affichage."
        : "Chaque soir après la séance : le point sur votre argent et ce qu'il y a à faire." },
    { tab: "aujourdhui", cible: ["#v-aujourdhui .bu-trois"], optionnel: true, titre: "Trois gestes",
      texte: "J'ai gagné, J'ai dépensé, Je garde : deux touches, ou la voix. Les pictogrammes sont les mêmes que dans votre budget." },
    { tab: "budget", cible: ["#v-budget .bu-prevu", "#v-budget .bu-phrase", "#v-budget h1"], titre: "1 · Mon budget",
      texte: "Préparez votre budget avec les mêmes images que la saisie, puis suivez chaque mois le dépensé face au prévu." },
    { tab: "avenir", cible: ["#v-avenir .bu-av-saisie", "#v-avenir h1"], titre: "1 · Mon avenir",
      texte: "Votre âge, ce que vous gardez et dépensez (par jour, semaine, mois ou an) : l'âge de liberté et ce qu'il vous faut se calculent aussitôt." },
    { tab: "objectifs", cible: ["#v-objectifs .bu-phrase", "#v-objectifs h1"], titre: "2 · Mes objectifs",
      texte: "Un seul plan pour tout : il remplit d'abord votre sécurité, puis vos projets, puis la bourse. Ici, on fixe et on suit." },
    { pf: "epargne", cible: ["#v-portefeuille .ep2-cta", "#v-portefeuille .ep2-tete", "#v-portefeuille .epargne"], titre: "2 · Mon coffre",
      texte: "Ici, on agit : Je garde, Envoyer à ma SGI, J'ai repris. Votre série et vos trophées suivent votre régularité." },
    { pf: "cercles", cible: ["#v-portefeuille .cercle", "#v-portefeuille .card"], titre: "2 · Mes cercles",
      texte: "Épargnez avec vos proches : chacun voit la régularité des autres, jamais les montants. On s'encourage d'un geste." },
    { pf: "simulateur", cible: ["#v-portefeuille .sim-resultat", "#v-portefeuille .sim-zone"], titre: "3 · Simuler un placement",
      texte: "Ce que donnerait votre profil d'investisseur avec un montant choisi. Touchez un titre proposé : il s'ouvre au Marché." },
    { tab: "marche", cible: ["#v-marche li.mk", "#v-marche .list > li:first-child", "#v-marche h1"], titre: "3 · Le Marché",
      texte: "L'analyse du soir de chaque titre : touchez une ligne pour la déplier. Le petit crayon note un achat fait chez votre SGI." },
    { pf: "placements", cible: ["#v-portefeuille .pl-tete", "#v-portefeuille .ajout-op"], titre: "3 · Mes placements",
      texte: "Vos titres au dernier cours, ce qu'il faut regarder, et le chemin de votre argent. Le crayon de chaque titre note une vente." },
    { tab: "performance", cible: ["#v-performance .card", "#v-performance h1"], titre: "3 · Performance",
      texte: "Votre résultat comparé au marché de la BRVM, dividendes compris." },
    { cible: "#fab-ia", optionnel: true, titre: "BafiBot, votre assistant",
      texte: "Une question sur votre budget, votre coffre ou un titre ? BafiBot répond avec vos propres chiffres. Il connaît aussi chaque écran." },
  ];

  async function lancerVisite(relance = false) {
    if (enCours) return;
    const e = etat();
    noter(relance ? "visite_relancee" : "visite_commencee");
    if (relance && !e.visite_commencee) noter("visite_commencee");
    e.visite_commencee = 1; sauver(e);
    // La visite part d'Aujourd'hui ; le coffre et le robot ne sont montrés que s'ils sont affichés
    if (app.tab() !== "aujourdhui") { app.aller("aujourdhui"); await attendre(350); }
    const etapes = ETAPES_VISITE().filter((s) => !s.optionnel || [].concat(s.cible).some((c) => document.querySelector(c)));
    const fin = await derouler(etapes, {
      surEtape: (i) => noter("visite_etape", i + 1),
      surPasse: (i) => noter("visite_passee", i + 1),
    });
    const e2 = etat();
    e2.astuces.portefeuille = 1; e2.astuces.marche = 1; e2.astuces.performance = 1;        // déjà vus pendant la visite
    if (fin === "fin") {
      e2.visite = "terminee"; noter("visite_terminee");
      if (!e2.pas.alertes) { e2.pas.alertes = 1; noter("pas_termine", "alertes"); }   // la visite a montré les alertes
    } else if (!e2.visite) e2.visite = "passee";
    sauver(e2);
    app.aller("aujourdhui");
    app.render();
    if (fin === "fin" && app.demo) {
      await attendre(400);
      const r = await derouler([{ titre: "Vous avez vu l'essentiel", texte: "Prêt à le faire avec votre propre argent ? Choisissez votre formule : gratuite pour commencer, 14 jours d'Essentiel offerts." }],
        { passer: "Continuer la démo", terminer: "Voir les offres" });
      if (r === "fin") location.href = "../#tarifs";
      return;
    }
    if (fin === "fin") {
      await attendre(400);
      const reste = premiersPas().filter((p) => !p.fait);
      if (reste.length) proposerSuite(null, `Visite terminée ! Il vous reste ${reste.length > 1 ? `${reste.length} premiers pas` : "1 premier pas"}, moins d'une minute. On continue ?`);
      else app.toast("Visite terminée", { detail: "Vous connaissez maintenant l'essentiel de l'application." });
    }
  }
  async function proposerVisite() {
    for (let k = 0; k < 600 && document.querySelector("dialog[open]"); k++) await attendre(200);   // ex. choix de la démo
    const p = app.prenom();
    noter("visite_proposee");
    const r = await derouler([{ titre: `Bienvenue${p ? " " + p : ""} !`, texte: "Découvrez le parcours en deux minutes : votre budget, votre épargne, puis la bourse, écran par écran." }],
      { passer: "Plus tard", terminer: "Commencer la visite" });
    if (r === "fin") lancerVisite();
    else { const e = etat(); e.visite = "plus_tard"; sauver(e); noter("visite_plus_tard"); app.render(); }
  }

  // ---------------------------------------------------------------- 2. « Mes premiers pas »
  const ouvrirAssistant = (question) => window.dispatchEvent(new CustomEvent("brvm:ouvrir-assistant", { detail: { question } }));
  function premiersPas() {
    const f = app.faits(), e = etat(), robot = !!$("#fab-ia");
    const budgetFait = !!window.BafiBudget?.contexte?.()?.budget_configure;
    return [
      // dans l'ordre du parcours : budget, plan d'épargne, puis la bourse
      { id: "budget", t: "Préparer mon budget", duree: "1 min", fait: budgetFait,
        guide: [{ tab: "budget", cible: ["#v-budget .bu-prevu", "#v-budget .bu-demarrage", "#v-budget h1"], titre: "Votre budget",
                  texte: "Indiquez ce que vous gagnez et vos principales dépenses, avec les images : l'application calcule ce que vous pouvez dépenser chaque jour." }] },
      ...(f.plan !== null ? [{ id: "epargne", t: "Choisir mon plan pour garder", duree: "30 s", fait: f.plan,
        guide: [{ tab: "objectifs", cible: ["#v-objectifs .bu-plan-b", "#v-objectifs h1"], titre: "Votre plan pour garder",
                  texte: "Un seul plan : combien garder et à quel rythme. Il remplit votre sécurité, puis vos projets, puis la bourse.",
                  action: { label: "Choisir mon plan", fn: () => document.querySelector('#v-objectifs [data-coffre="plan"]')?.click() } }] }] : []),
      { id: "depot", t: "Noter l'argent versé à ma SGI", duree: "1 min", fait: f.depot,
        guide: [{ tab: "portefeuille", cible: '#v-portefeuille [data-op=""]', titre: "Noter l'argent versé",
                  texte: "Chaque fois que vous envoyez de l'argent à votre SGI, notez-le ici : c'est le point de départ de tous les calculs.",
                  action: { label: "Noter un versement", fn: () => app.ouvrirOperation("DEPOT") } }] },
      { id: "achat", t: "Enregistrer mon premier achat", duree: "1 min", fait: f.achat,
        guide: [{ tab: "portefeuille", cible: ['#v-portefeuille .ajout-import', '#v-portefeuille [data-op=""]'], titre: "Enregistrer un achat",
                  texte: "Quand votre SGI vous envoie l'avis d'opéré, importez-le en photo ou en PDF : quantité, prix et frais se remplissent tout seuls.",
                  action: { label: "Importer mon avis d'opéré", fn: () => document.querySelector("#v-portefeuille .ajout-import")?.click() } }] },
      { id: "alertes", t: "Découvrir mes alertes", duree: "20 s", fait: !!e.pas.alertes,
        guide: [{ tab: "aujourdhui", cible: ["#v-aujourdhui .card.a-faire", "#v-aujourdhui .synthese", "#v-aujourdhui h1"], titre: "Vos alertes",
                  texte: (c) => c?.matches(".a-faire")
                    ? "Ce bloc « À faire » réunit après chaque séance les titres qui demandent votre attention, avec l'explication. Une alerte est un signal à examiner, jamais une vente automatique."
                    : "Dès que vous détiendrez des titres, leurs alertes apparaîtront dans un bloc « À faire » sur cet écran. Une alerte est un signal à examiner, jamais une vente automatique." }] },
      ...(robot ? [{ id: "robot", t: "Poser une question à BafiBot", duree: "30 s", fait: !!e.pas.robot,
        guide: [{ cible: "#fab-ia", titre: "BafiBot, votre assistant", texte: "Il répond avec vos propres chiffres. Essayez avec une question toute prête : vous pourrez ensuite poser les vôtres.",
                  action: { label: "Essayer : « Combien puis-je dépenser aujourd'hui ? »", fn: () => ouvrirAssistant("Combien puis-je dépenser aujourd'hui ?") } }] }] : []),
    ];
  }
  // Note chaque premier pas une seule fois, au moment où il devient fait
  function suivrePas(liste) {
    const e = etat(); let change = false;
    const avant = liste.filter((p) => e.pas[p.id]).length;
    for (const p of liste) if (p.fait && !e.pas[p.id]) { e.pas[p.id] = 1; change = true; if (["depot", "achat", "epargne"].includes(p.id)) noter("pas_termine", p.id); }
    if (!e.pas_progres || liste.filter((p) => e.pas[p.id]).length > avant) { e.pas_progres = Date.now(); change = true; }
    if (liste.length && liste.every((p) => p.fait) && e.liste !== "terminee") {
      e.liste = "terminee"; e.liste_le = Date.now(); change = true; noter("liste_terminee");
      // trophée de prise en main, célébré comme les trophées d'épargne
      setTimeout(() => {
        if (document.querySelector("dialog[open]")) return app.toast("Bravo, vos premiers pas sont faits !", { detail: "Vous savez maintenant tout ce qu'il faut pour suivre votre épargne." });
        app.celebrer({ id: "prise-en-main", titre: "Prise en main réussie", marque: "✓", metal: "saphir",
                       msg: "Vos premiers pas sont faits : vous savez maintenant tout ce qu'il faut pour suivre votre épargne." });
      }, 600);
    }
    if (change) sauver(e);
  }
  // Parcours enchaîné : après chaque premier pas, l'étape suivante est proposée directement,
  // sans revenir à la liste. « Plus tard » arrête le parcours ; la liste reste sur l'écran Aujourd'hui.
  let enAttente = null;                                     // premier pas en cours dans une fenêtre (opération, robot)
  async function lancerPas(id) {
    const liste = premiersPas(), i = liste.findIndex((x) => x.id === id), p = liste[i];
    if (!p || enCours) return;
    noter("pas_guide", id);
    const r = await derouler(p.guide, { surtitre: `Premier pas ${i + 1} sur ${liste.length}`, terminer: "Compris", passer: "Plus tard" });
    if (id === "alertes" && r === "fin") { const e = etat(); e.pas.alertes = 1; sauver(e); noter("pas_termine", "alertes"); }
    app.render();
    if (r === "fin") { await attendre(350); proposerSuite(id); }
    else if (r === "action") enAttente = id;               // la suite sera proposée à la fermeture de la fenêtre
  }
  async function proposerSuite(apres, message) {
    if (enCours) return;
    const liste = premiersPas(), faits = liste.filter((x) => x.fait).length;
    const suivant = liste.find((x) => !x.fait && x.id !== apres);
    if (!suivant) return;                                   // tout est fait : le trophée de prise en main s'affiche
    const r = await derouler([{ titre: message ? "Et maintenant ?" : "Étape suivante", texte: message || `${suivant.t} (${suivant.duree || "1 min"}). On continue ?` }],
      { surtitre: `Premiers pas : ${faits} sur ${liste.length} faits`, passer: "Plus tard", terminer: "Continuer" });
    if (r === "fin") lancerPas(suivant.id);
  }
  // Fin d'un premier pas fait dans une fenêtre : fenêtre d'opération fermée, ou robot refermé après une question
  document.addEventListener("close", (ev) => {
    if (!enAttente || !["dlg-op", "dlg-ia"].includes(ev.target?.id)) return;
    const id = enAttente; enAttente = null;
    setTimeout(async () => {
      app.render();
      await attendre(200);
      const fait = premiersPas().find((x) => x.id === id)?.fait;
      if (!fait) return;                                    // fenêtre fermée sans faire l'action : on n'insiste pas
      // laisse le temps de lire la confirmation de l'enregistrement
      for (let k = 0; k < 35 && !$("#toast")?.hidden; k++) await attendre(100);
      proposerSuite(id);
    }, 300);
  }, true);
  function carteListe() {
    const v = $("#v-aujourdhui");
    if (!v || v.hidden || $(".tuto-liste", v)) return;
    const e = etat();
    if (e.visite === undefined || e.liste === "masquee" || e.liste === "terminee") return;
    const liste = premiersPas(), faits = liste.filter((p) => p.fait).length;
    suivrePas(liste);
    if (faits === liste.length) return;
    const reste = liste.filter((p) => !p.fait), suivant = reste[0], e3 = etat();
    const reduite = e3.pas_progres && Date.now() - e3.pas_progres > 7 * 864e5;   // 7 jours sans progrès : une seule ligne
    const html = reduite
      ? `<div class="card tuto-liste tuto-reduite" aria-label="Mes premiers pas"><p><b>${reste.length > 1 ? `${reste.length} premiers pas restants` : "1 premier pas restant"}</b>
          <span class="small muted"> · ${faits} sur ${liste.length} faits</span></p>
          <p class="tuto-liens"><button type="button" class="btn small primary" data-pas="${suivant.id}">Continuer : ${esc(suivant.t)}</button>
          <button type="button" class="btn link small" data-tuto="masquer">Masquer</button></p></div>`
      : `<div class="card tuto-liste" aria-labelledby="tuto-liste-t">
      <div class="tuto-tete"><h2 id="tuto-liste-t">Mes premiers pas</h2><span class="small muted">${faits} sur ${liste.length}</span></div>
      <div class="tuto-barre" role="progressbar" aria-label="Avancement des premiers pas" aria-valuemin="0" aria-valuemax="${liste.length}" aria-valuenow="${faits}">
        <i style="width:${Math.round((faits / liste.length) * 100)}%"></i></div>
      ${faits ? `<details class="tuto-faits"><summary><span class="tuto-coche" aria-hidden="true">✓</span> ${faits > 1 ? `${faits} étapes faites` : "1 étape faite"}</summary>
        <ul class="tuto-pas">${liste.filter((p) => p.fait).map((p) => `<li class="fait"><span class="tuto-coche" aria-hidden="true">✓</span><span>${esc(p.t)}</span></li>`).join("")}</ul></details>` : ""}
      <ul class="tuto-pas">${reste.map((p, k) => `<li><button type="button" class="tuto-go${k === 0 ? " suivant" : ""}" data-pas="${p.id}">
          <span class="tuto-coche" aria-hidden="true"></span><span class="tuto-t">${esc(p.t)}<span class="tuto-duree">${p.duree || ""}</span></span><span class="tuto-fleche" aria-hidden="true">›</span></button></li>`).join("")}</ul>
      <div class="tuto-cta"><button type="button" class="btn primary" data-pas="${suivant.id}">Continuer : ${esc(suivant.t)}</button></div>
      <p class="small tuto-liens">${e.visite !== "terminee" ? `<button type="button" class="btn link" data-tuto="visite">Faire la visite guidée (1 min)</button> · ` : ""}
        <button type="button" class="btn link" data-tuto="masquer">Masquer</button></p></div>`;
    const synthese = $(".synthese", v), avant = $(".card", v);          // juste après la synthèse du jour
    if (synthese) synthese.insertAdjacentHTML("afterend", html);
    else if (avant) avant.insertAdjacentHTML("beforebegin", html); else v.insertAdjacentHTML("beforeend", html);
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
    // la visite a déjà montré les écrans : plus d'astuce ensuite ; sinon, une seule sollicitation par session
    if (e.visite === "terminee") { e.astuces[t] = 1; sauver(e); return; }
    if (window.BafiCalme && !window.BafiCalme.autorise("astuce")) return;
    window.BafiCalme?.consomme("astuce");
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
      <p class="small muted">Revoyez votre portrait d'épargnant ou la visite guidée à tout moment, ou réaffichez la liste de vos premiers pas sur l'écran Aujourd'hui.</p>
      <div class="actions"><button type="button" class="btn" data-tuto="portrait">Mon portrait d'épargnant</button>
      <button type="button" class="btn" data-tuto="revoir">Revoir la visite guidée</button>
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
    else if (a === "portrait") app.portrait();
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
