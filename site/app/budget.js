/* BafiBourse – Mon budget (livraison 1).
 * Deux parcours sur les mêmes données :
 *   – mode SIMPLE (par défaut) : trois gros boutons « J'ai gagné », « J'ai dépensé », « Je garde », une phrase
 *     « Aujourd'hui vous pouvez dépenser … », le projet en image, le coffre en deux étages (sécurité puis projet) ;
 *   – mode COMPLET : mois, reste à vivre, trois enveloppes (besoins, envies, épargne), dernières opérations.
 * Démarrage en images (3 écrans) ; saisie en deux touches ou à la voix ; « Rien aujourd'hui » garde la série ;
 * retour sans reproche après une absence ; bilan de la semaine. Données privées (24-budget.sql, RLS).
 * app.js fournit window.BRVM_APP (budget, epargneResume, rappels, toast) et appelle BafiBudget.render(vue). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const F = (n) => nf.format(Math.round(+n || 0)) + " F";
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const auj = () => iso(new Date());
  const ilya = (j) => { const d = new Date(); d.setDate(d.getDate() - j); return iso(d); };
  const ic = (d, c = "currentColor") => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  // ------------------------------------------------------------------ catégories (pictogrammes) et enveloppes
  const P = {
    nourriture: '<path d="M4 11h16l-1.5 8h-13z"/><path d="M8 11l4-6 4 6"/>',
    transport: '<rect x="3" y="8" width="18" height="9" rx="2"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
    logement: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
    famille: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c3 0 6 2 6 5.5"/>',
    sante: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>',
    ecole: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M7 11v5c3 2 7 2 10 0v-5"/>',
    ceremonie: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.5 8z"/>',
    factures: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    sorties: '<path d="M8 21h8M12 15v6M6 3h12l-1 7a5 5 0 0 1-10 0z"/>',
    habillement: '<path d="M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7z"/>',
    abonnements: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
    credit: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20M6 15h4"/>',
    autres: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    salaire: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    recette: '<path d="M4 7h16l-1 12H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
    transfert: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    tabaski: '<ellipse cx="12" cy="13" rx="6" ry="4.5"/><path d="M8 10c-2-1-3-3-2-5M16 10c2-1 3-3 2-5M9 17v3M15 17v3"/>',
    commerce: '<path d="M4 10h16v10H4z"/><path d="M3 10l2-6h14l2 6"/><path d="M10 20v-5h4v5"/>',
    securite: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    coffre: '<rect x="3" y="4" width="18" height="15" rx="2.5"/><circle cx="12" cy="11.5" r="3.2"/><path d="M6.5 19v1.6M17.5 19v1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', moins: '<path d="M5 12h14"/>', micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    semaine: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 14h2M11 14h2M15 14h2"/>',
  };
  const DEP = [  // [clé, libellé, enveloppe, mode simple ?]
    ["nourriture", "Nourriture", "besoins", 1], ["transport", "Transport", "besoins", 1], ["logement", "Logement", "besoins", 1],
    ["famille", "Famille", "besoins", 1], ["sante", "Santé", "besoins", 1], ["ecole", "École", "besoins", 1],
    ["ceremonie", "Fête, cérémonie", "envies", 1], ["factures", "Eau, électricité", "besoins", 0], ["sorties", "Sorties", "envies", 0],
    ["habillement", "Habits", "envies", 0], ["abonnements", "Abonnements", "envies", 0], ["credit", "Crédit", "besoins", 0], ["autres", "Autres", "envies", 1],
  ];
  const REV = [["salaire", "Salaire"], ["recette", "Recette du jour"], ["transfert", "Argent reçu"], ["autres", "Autres"]];
  const OBJ = [["ecole", "École"], ["tabaski", "Tabaski"], ["logement", "Maison"], ["commerce", "Commerce"], ["sante", "Santé"], ["securite", "Imprévus"]];
  const PROFILS = { equilibre: ["Équilibré", 50, 30, 20], batisseur: ["Bâtisseur", 50, 20, 30], fourmi: ["Fourmi", 40, 20, 40], serre: ["Serré", 60, 25, 15] };
  const catDep = (k) => DEP.find((c) => c[0] === k) || DEP[DEP.length - 1];
  const libCat = (m) => (m.type === "revenu" ? (REV.find((r) => r[0] === m.categorie) || REV[3])[1] : catDep(m.categorie)[1]);

  // ------------------------------------------------------------------ état
  const S = { charge: false, enCours: false, profil: null, mv: [], etape: 1, brouillon: {}, absent: false, erreur: null, vue: null };
  const app = () => window.BRVM_APP;
  async function charger() {
    if (S.enCours) return;
    S.enCours = true;
    try {
      const b = app().budget;
      S.profil = await b.profil();
      S.mv = (await b.mouvements(ilya(70))) || [];
      S.erreur = null;
    } catch (e) {
      S.erreur = /budget_|relation|does not exist|42P01/i.test(String(e?.message || e)) ? "installer" : String(e?.message || e);
    }
    S.charge = true; S.enCours = false;
    if (S.vue && location.hash.slice(1) === "budget") render(S.vue);
  }

  // ------------------------------------------------------------------ calculs
  function calculs() {
    const p = S.profil || {}, parts = PROFILS[p.profil] || PROFILS.equilibre;
    const jour = p.rythme === "jour";
    const d0 = auj().slice(0, 8) + "01";
    const mois = S.mv.filter((m) => m.date >= d0);
    const somme = (l, t) => l.filter((m) => m.type === t).reduce((a, m) => a + (+m.montant || 0), 0);
    const revMois = somme(mois, "revenu"), depMois = somme(mois, "depense");
    const fin = new Date(); fin.setMonth(fin.getMonth() + 1, 0);
    const joursRest = fin.getDate() - new Date().getDate() + 1;
    const revRef = jour ? Math.max(revMois, 0) : Math.max(+p.revenu || 0, revMois);
    const revMensuelPrevu = jour ? (+p.revenu || 0) * 26 : Math.max(+p.revenu || 0, revMois);
    const part = (i) => parts[i] / 100;
    const reste = revRef * (1 - part(3)) - depMois;
    const duJour = jour ? Math.max(0, Math.min(reste, (+p.revenu || 0) * (1 - part(3)))) : Math.max(0, reste) / Math.max(joursRest, 1);
    const env = { besoins: 0, envies: 0 };
    for (const m of mois.filter((x) => x.type === "depense")) env[m.enveloppe || catDep(m.categorie)[2]] += +m.montant || 0;
    const ep = app().epargneResume?.() || null;
    const garde = ep ? ep.mv.filter((m) => m.type === "VERSEMENT" && m.date >= d0).reduce((a, m) => a + (+m.montant || 0), 0) : 0;
    const securiteObj = Math.round(revMensuelPrevu * part(1) * (jour ? 6 : 3));
    const solde = ep?.solde || 0;
    const securite = Math.min(solde, securiteObj), projet = Math.max(0, solde - securiteObj);
    // série : jours notés d'affilée (mouvement ou « rien aujourd'hui »), jusqu'à aujourd'hui ou hier
    const jours = new Set(S.mv.map((m) => m.date));
    let serie = 0;
    for (let j = jours.has(auj()) ? 0 : 1; j < 70 && jours.has(ilya(j)); j++) serie++;
    const notéAujourdhui = jours.has(auj());
    const derniere = S.mv.reduce((a, m) => (m.date > a ? m.date : a), "");
    const sem = (de, a) => S.mv.filter((m) => m.date > ilya(a) && m.date <= ilya(de));
    const s1 = sem(0, 7), s0 = sem(7, 14);
    const gardeSem = ep ? ep.mv.filter((m) => m.type === "VERSEMENT" && m.date > ilya(7)).reduce((a, m) => a + (+m.montant || 0), 0) : 0;
    return { p, parts, jour, revMois, depMois, revRef, reste, duJour, env, garde, part, securiteObj, securite, projet, solde, serie, notéAujourdhui,
             derniere, joursRest, epargneCible: revRef * part(3),
             semaine: { dep: somme(s1, "depense"), depAvant: somme(s0, "depense"), garde: gardeSem, jours: new Set(s1.map((m) => m.date)).size } };
  }

  // ------------------------------------------------------------------ démarrage en images (3 écrans)
  function demarrage() {
    const b = S.brouillon, e = S.etape;
    const barre = `<div class="bu-etapes" aria-label="Étape ${e} sur 3">${[1, 2, 3].map((i) => `<span class="${i <= e ? "on" : ""}"></span>`).join("")}</div>`;
    if (e === 1) return `${barre}<h2 class="bu-q">Comment gagnez-vous votre argent ?</h2>
      <div class="bu-choix2">
        <button type="button" class="bu-gros" data-bu="rythme" data-v="jour" aria-pressed="${b.rythme === "jour"}"><span class="bu-tuile amb">${ic(P.soleil)}</span>Chaque jour<small>le montant change</small></button>
        <button type="button" class="bu-gros" data-bu="rythme" data-v="mois" aria-pressed="${b.rythme === "mois"}"><span class="bu-tuile">${ic(P.calendrier)}</span>Chaque mois<small>un salaire</small></button>
      </div>`;
    if (e === 2) return `${barre}<h2 class="bu-q">Combien gagnez-vous ${b.rythme === "jour" ? "par jour" : "par mois"}, à peu près ?</h2>
      <label class="bu-montant"><span class="sr-only">Montant</span><input id="bu-rev" inputmode="numeric" autocomplete="off" placeholder="0" value="${b.revenu ? nf.format(b.revenu) : ""}"><span>F</span></label>
      <div class="bu-puces">${(b.rythme === "jour" ? [3000, 5000, 10000, 20000] : [100000, 200000, 400000, 800000]).map((v) => `<button type="button" class="bu-puce" data-bu="rev-puce" data-v="${v}">${nf.format(v)}</button>`).join("")}</div>
      <button type="button" class="btn primary bu-suite" data-bu="suite2">Continuer</button>`;
    return `${barre}<h2 class="bu-q">Pour quoi voulez-vous garder de l'argent ?</h2>
      <div class="bu-grille">${OBJ.map(([k, l]) => `<button type="button" class="bu-cat" data-bu="obj" data-v="${k}" aria-pressed="${b.objectif_icone === k}"><span class="bu-tuile ${b.objectif_icone === k ? "" : "clair"}">${ic(P[k])}</span>${l}</button>`).join("")}</div>
      <label class="bu-champ">Combien ? <small>(facultatif)</small><input id="bu-obj-m" inputmode="numeric" placeholder="ex. 300 000" value="${b.objectif_montant ? nf.format(b.objectif_montant) : ""}"></label>
      <button type="button" class="btn primary bu-suite" data-bu="terminer"${b.objectif_icone ? "" : " disabled"}>C'est parti</button>
      <p class="small muted bu-note">Vous pourrez tout changer plus tard. Vos chiffres restent privés.</p>`;
  }
  const lireNombre = (v) => +String(v || "").replace(/[^\d]/g, "") || 0;
  async function terminerDemarrage() {
    const b = S.brouillon;
    b.objectif_montant = lireNombre($("#bu-obj-m")?.value) || null;
    const lib = (OBJ.find((o) => o[0] === b.objectif_icone) || ["", "Mon projet"])[1];
    const profil = { mode: "simple", rythme: b.rythme || "mois", revenu: b.revenu || 0, profil: "equilibre",
                     objectif_nom: b.objectif_icone === "securite" ? "Mes imprévus" : lib === "École" ? "L'école" : lib, objectif_icone: b.objectif_icone, objectif_montant: b.objectif_montant };
    try { await app().budget.sauverProfil(profil); S.profil = { ...(S.profil || {}), ...profil }; }
    catch (e) { app().toast("Enregistrement impossible : " + (e.message || e)); return; }
    const e = (S.profil.revenu || 0) * (S.profil.rythme === "jour" ? 0.2 : 0.2);
    app().toast("Votre budget est prêt.", { detail: `Vous pourriez garder environ ${F(e)} ${S.profil.rythme === "jour" ? "par jour" : "par mois"}.` });
    render(S.vue);
  }

  // ------------------------------------------------------------------ écrans
  const jauge = (v, max, cls = "") => `<div class="bu-jauge ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${max ? Math.round(Math.min(100, 100 * v / max)) : 0}"><i style="width:${max ? Math.min(100, 100 * v / max).toFixed(1) : 0}%"></i></div>`;
  function blocRetour(c) {
    if (!c.derniere || c.derniere >= ilya(3) || S.retourVu) return "";
    return `<section class="card bu-retour"><span class="bu-tuile amb">${ic(P.sante)}</span>
      <div><b>Content de vous revoir${app().profil?.()?.prenom ? ", " + esc(app().profil().prenom) : ""}</b>
        <p class="small">On reprend à partir d'aujourd'hui, sans rien rattraper. ${c.p.objectif_nom ? `Votre projet « ${esc(c.p.objectif_nom)} » vous attend.` : ""}</p>
        <button type="button" class="btn primary small" data-bu="reprendre">Reprendre aujourd'hui</button></div></section>`;
  }
  function blocProjet(c) {
    const p = c.p;
    return `<section class="card bu-projet"><span class="bu-tuile amb">${ic(P[p.objectif_icone] || P.coffre)}</span>
      <div class="bu-projet-c"><div class="bu-ligne"><b>${esc(p.objectif_nom || "Mon projet")}</b><span>${F(c.projet)}${p.objectif_montant ? " / " + F(p.objectif_montant) : ""}</span></div>
        ${p.objectif_montant ? jauge(c.projet, p.objectif_montant, "amb") : ""}
        <div class="bu-ligne small"><span>${ic(P.securite)} Sécurité ${F(c.securite)} / ${F(c.securiteObj)}</span></div>
        ${jauge(c.securite, c.securiteObj)}
        <p class="small muted">${c.securite < c.securiteObj ? "Ce que vous gardez remplit d'abord la sécurité, puis votre projet." : "Sécurité remplie : ce que vous gardez va maintenant à votre projet."}</p></div></section>`;
  }
  function blocSemaine(c) {
    const s = c.semaine, diff = s.depAvant ? Math.round(100 * (s.dep - s.depAvant) / s.depAvant) : null;
    return `<details class="card bu-sem"${new Date().getDay() === 0 ? " open" : ""}><summary><span class="bu-tuile">${ic(P.semaine, "#fff")}</span><b>Ma semaine</b></summary>
      <ul class="bu-sem-l">
        <li><span class="bu-tuile amb petit">${ic(P.coffre)}</span><span>Gardé</span><b>${F(s.garde)}</b></li>
        <li><span class="bu-tuile petit">${ic(P.moins, "#fff")}</span><span>Dépensé${diff !== null ? ` <small class="${diff <= 0 ? "good" : "bad"}">${diff <= 0 ? "" : "+"}${diff} %</small>` : ""}</span><b>${F(s.dep)}</b></li>
        <li><span class="bu-tuile clair petit">${ic(P.calendrier)}</span><span>Jours notés</span><b>${s.jours} / 7</b></li>
      </ul>${c.serie >= 7 ? `<p class="small">Vous êtes un épargnant régulier : ${c.serie} jours d'affilée.</p>` : ""}</details>`;
  }
  function vueSimple(c) {
    return `${blocRetour(c)}
      ${c.jour && !c.revMois ? `<section class="bu-phrase"><span class="small">Bienvenue dans votre budget</span><b style="font-size:1.35rem">Notez votre recette du jour</b>
          <span class="small">Touchez « J'ai gagné » : vous verrez aussitôt ce que vous pouvez dépenser.</span></section>`
      : `<section class="bu-phrase"><span class="small">Aujourd'hui, vous pouvez dépenser</span><b data-count>${F(c.duJour)}</b>
        ${c.serie ? `<span class="small">🔥 ${c.serie} jour${c.serie > 1 ? "s" : ""} d'affilée</span>` : ""}</section>`}
      <div class="bu-trois">
        <button type="button" class="bu-gros-b gagne" data-bu="saisir" data-v="revenu"><span class="bu-tuile">${ic(P.plus, "#fff")}</span>J'ai gagné</button>
        <button type="button" class="bu-gros-b depense" data-bu="saisir" data-v="depense"><span class="bu-tuile clair">${ic(P.moins)}</span>J'ai dépensé</button>
        <button type="button" class="bu-gros-b garde" data-coffre="verser"><span class="bu-tuile amb">${ic(P.coffre)}</span>Je garde</button>
      </div>
      ${!c.notéAujourdhui ? `<button type="button" class="btn bu-rien" data-bu="rien">Rien de spécial aujourd'hui</button>` : `<p class="small muted bu-ok">✓ Votre journée est notée.</p>`}
      ${blocProjet(c)}${dernieres(4)}${blocSemaine(c)}
      <p class="bu-mode small"><button type="button" class="btn link small" data-bu="mode" data-v="complet">Passer au budget détaillé</button></p>`;
  }
  function dernieres(n) {
    const l = S.mv.filter((m) => m.type !== "rien").slice(0, n);
    if (!l.length) return "";
    return `<section class="card"><h2 class="bu-h2">Dernières opérations</h2><ul class="bu-ops">${l.map((m) => `<li>
      <span class="bu-tuile ${m.type === "revenu" ? "" : "clair"} petit">${ic(P[m.categorie] || P.autres, m.type === "revenu" ? "#fff" : "currentColor")}</span>
      <span class="bu-op-l">${esc(libCat(m))}<small>${new Date(m.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</small></span>
      <b class="${m.type === "revenu" ? "good" : ""}">${m.type === "revenu" ? "+" : "−"}${F(m.montant)}</b>
      <button type="button" class="bu-suppr" data-bu="suppr" data-v="${m.id}" aria-label="Supprimer ${esc(libCat(m))} ${F(m.montant)}">×</button></li>`).join("")}</ul></section>`;
  }
  function vueComplete(c) {
    const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const env = (nom, cle, i, cls) => {
      const max = c.revRef * c.part(i), v = cle === "epargne" ? c.garde : c.env[cle];
      return `<div class="bu-env"><div class="bu-ligne"><b>${nom}</b><span>${F(v)} / ${F(max)}</span></div>${jauge(v, max, cls)}</div>`;
    };
    return `${blocRetour(c)}
      <section class="bu-phrase large"><span class="small">Reste à vivre · ${esc(mois)}</span><b data-count>${F(Math.max(0, c.reste))}</b>
        <span class="small">Gagné ${F(c.revMois)} · dépensé ${F(c.depMois)} · gardé ${F(c.garde)}</span>
        <span class="small">Aujourd'hui : ${F(c.duJour)} ${c.jour ? "(selon vos recettes du mois)" : `· ${c.joursRest} jour${c.joursRest > 1 ? "s" : ""} restant${c.joursRest > 1 ? "s" : ""}`}</span></section>
      <section class="card"><div class="bu-ligne"><h2 class="bu-h2">Mes enveloppes</h2>
          <label class="small">Profil <select data-bu="profil">${Object.entries(PROFILS).map(([k, v]) => `<option value="${k}"${(c.p.profil || "equilibre") === k ? " selected" : ""}>${v[0]} ${v[1]}/${v[2]}/${v[3]}</option>`).join("")}</select></label></div>
        ${env("Besoins", "besoins", 1, "")}${env("Envies", "envies", 2, "env2")}${env("Épargne et avenir", "epargne", 3, "amb")}
        <p class="small muted">Besoins : logement, nourriture, transport, santé, école, famille. Envies : sorties, habits, fêtes, abonnements.</p></section>
      <div class="bu-trois">
        <button type="button" class="bu-gros-b gagne" data-bu="saisir" data-v="revenu"><span class="bu-tuile">${ic(P.plus, "#fff")}</span>Revenu</button>
        <button type="button" class="bu-gros-b depense" data-bu="saisir" data-v="depense"><span class="bu-tuile clair">${ic(P.moins)}</span>Dépense</button>
        <button type="button" class="bu-gros-b garde" data-coffre="verser"><span class="bu-tuile amb">${ic(P.coffre)}</span>Épargne</button>
      </div>
      ${!c.notéAujourdhui ? `<button type="button" class="btn bu-rien" data-bu="rien">Rien de spécial aujourd'hui</button>` : ""}
      ${blocProjet(c)}${dernieres(8)}${blocSemaine(c)}
      <details class="card"><summary><b>Mes réglages de budget</b></summary>
        <div class="bu-reg">
          <label>Mon revenu ${c.jour ? "par jour" : "par mois"}<input id="bu-r-rev" inputmode="numeric" value="${nf.format(c.p.revenu || 0)}"></label>
          <label>Je gagne<select id="bu-r-ry"><option value="mois"${c.jour ? "" : " selected"}>chaque mois</option><option value="jour"${c.jour ? " selected" : ""}>chaque jour (variable)</option></select></label>
          <label>Mon projet<input id="bu-r-obj" value="${esc(c.p.objectif_nom || "")}"></label>
          <label>Montant du projet<input id="bu-r-objm" inputmode="numeric" value="${c.p.objectif_montant ? nf.format(c.p.objectif_montant) : ""}"></label>
          <button type="button" class="btn primary" data-bu="reglages">Enregistrer</button>
          <a href="#profil" class="small">Régler l'heure de mon rappel</a>
        </div></details>
      <p class="bu-mode small"><button type="button" class="btn link small" data-bu="mode" data-v="simple">Revenir au budget simple</button></p>`;
  }

  function render(v) {
    S.vue = v;
    if (!app()?.budget) { v.innerHTML = `<h1 id="h-bud">Mon budget</h1>`; return; }
    if (!S.charge) { v.innerHTML = `<h1 id="h-bud">Mon budget</h1><p class="muted">Chargement…</p>`; charger(); return; }
    if (S.erreur === "installer") { v.innerHTML = `<h1 id="h-bud">Mon budget</h1><div class="notice">Le budget arrive bientôt sur votre compte.</div>`; return; }
    if (!S.profil) { v.innerHTML = `<h1 id="h-bud">Mon budget</h1><div class="bu-demarrage">${demarrage()}</div>`; brancherDemarrage(v); return; }
    const c = calculs();
    v.innerHTML = `<h1 id="h-bud">Mon budget</h1>` + (S.profil.mode === "complet" ? vueComplete(c) : vueSimple(c));
  }

  function brancherDemarrage(v) {
    const r = $("#bu-rev", v);
    r?.addEventListener("input", () => { S.brouillon.revenu = lireNombre(r.value); });
  }

  // ------------------------------------------------------------------ saisie (deux touches ou à la voix)
  let dlg = null, saisie = { type: "depense", cat: null };
  function dialogue() {
    if (dlg) return dlg;
    document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-budget" class="bu-dlg" aria-labelledby="bu-dlg-t"><form method="dialog" class="bu-form" novalidate>
      <h2 id="bu-dlg-t" class="sr-only">Nouvelle opération</h2>
      <div class="bu-type" role="radiogroup" aria-label="Type">
        <button type="button" data-t="revenu" role="radio">J'ai gagné</button><button type="button" data-t="depense" role="radio">J'ai dépensé</button></div>
      <label class="bu-montant"><span class="sr-only">Montant</span><input id="bu-m" inputmode="numeric" autocomplete="off" placeholder="0"><span>F</span></label>
      <div class="bu-puces" id="bu-mp"></div>
      <div class="bu-grille" id="bu-cats"></div>
      <div class="bu-plus-opt" id="bu-opt"></div>
      <p class="bu-voix-r small muted" aria-live="polite"></p>
      <div class="bu-actions"><button type="button" class="bu-micro" aria-label="Dicter (ex. : j'ai payé 2 500 de taxi)">${ic(P.micro)}</button>
        <button type="submit" class="btn primary bu-ok-b" value="ok">Enregistrer</button></div>
      <button type="button" class="btn link small bu-annuler" value="annuler">Annuler</button></form></dialog>`);
    dlg = $("#dlg-budget");
    dlg.querySelector(".bu-annuler").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg) return dlg.close();
      const t = ev.target.closest("[data-t]"); if (t) { saisie.type = t.dataset.t; saisie.cat = null; peindre(); return; }
      const c = ev.target.closest("[data-cat]"); if (c) { saisie.cat = c.dataset.cat; peindre(); return; }
      const m = ev.target.closest("[data-m]"); if (m) { $("#bu-m", dlg).value = nf.format(+m.dataset.m); return; }
      if (ev.target.closest(".bu-micro")) dicter();
    });
    $("#bu-m", dlg).addEventListener("input", (ev) => { const n = lireNombre(ev.target.value); ev.target.value = n ? nf.format(n) : ""; });
    dlg.querySelector("form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const montant = lireNombre($("#bu-m", dlg).value);
      if (!montant) { $("#bu-m", dlg).focus(); app().toast("Indiquez le montant."); return; }
      const cat = saisie.cat || (saisie.type === "revenu" ? (S.profil?.rythme === "jour" ? "recette" : "salaire") : "autres");
      const m = { date: auj(), type: saisie.type, montant, categorie: cat, enveloppe: saisie.type === "depense" ? catDep(cat)[2] : null,
                  recurrent: !!dlg.querySelector("#bu-rec")?.checked, credit: !!dlg.querySelector("#bu-cre")?.checked };
      const b = dlg.querySelector(".bu-ok-b"); b.disabled = true;
      try {
        const x = await app().budget.ajouter(m);
        S.mv.unshift(x || { ...m, id: Date.now() }); dlg.close();
        const c = calculs();
        app().toast(saisie.type === "revenu" ? `${F(montant)} gagnés, bravo.` : `${F(montant)} notés.`,
          { detail: saisie.type === "revenu" ? `Pensez à garder ${F(montant * c.part(3))} tout de suite.` : `Il vous reste ${F(c.duJour)} pour aujourd'hui.`,
            actions: saisie.type === "revenu" ? [{ label: "Je garde", fn: () => document.querySelector("[data-coffre='verser']")?.click() }] : [] });
        render(S.vue);
      } catch (e) { app().toast("Enregistrement impossible : " + (e.message || e)); }
      finally { b.disabled = false; }
    });
    return dlg;
  }
  function peindre() {
    const complet = S.profil?.mode === "complet";
    dlg.querySelectorAll("[data-t]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.t === saisie.type)));
    const cats = saisie.type === "revenu" ? REV.map(([k, l]) => [k, l]) : DEP.filter((c) => complet || c[3]).map(([k, l]) => [k, l]);
    $("#bu-cats", dlg).innerHTML = cats.map(([k, l]) => `<button type="button" class="bu-cat" data-cat="${k}" aria-pressed="${saisie.cat === k}">
      <span class="bu-tuile ${saisie.cat === k ? "" : "clair"}">${ic(P[k] || P.autres, saisie.cat === k ? "#fff" : "currentColor")}</span>${l}</button>`).join("");
    const puces = saisie.type === "revenu" ? (S.profil?.rythme === "jour" ? [2000, 5000, 10000, 20000] : [50000, 100000, 200000, 400000]) : [500, 1000, 2500, 5000];
    $("#bu-mp", dlg).innerHTML = puces.map((v) => `<button type="button" class="bu-puce" data-m="${v}">${nf.format(v)}</button>`).join("");
    $("#bu-opt", dlg).innerHTML = complet && saisie.type === "depense"
      ? `<label><input type="checkbox" id="bu-rec"> Revient chaque mois</label><label><input type="checkbox" id="bu-cre"> Payé à crédit</label>` : "";
  }
  function ouvrir(type) {
    dialogue(); saisie = { type, cat: null };
    $("#bu-m", dlg).value = ""; $(".bu-voix-r", dlg).textContent = "";
    peindre(); dlg.showModal(); setTimeout(() => $("#bu-m", dlg).focus(), 60);
  }
  // dictée : « j'ai payé 2 500 de taxi », « j'ai gagné 12 000 aujourd'hui »
  const MOTS = { transport: /taxi|bus|car|moto|essence|carburant|transport|clando|wôrô|woro/i, nourriture: /march|riz|pain|nourrit|manger|repas|cuisine|poisson|viande/i,
    logement: /loyer|maison|chambre|logement/i, famille: /famille|maman|papa|enfant|frère|soeur|sœur|parent/i, sante: /santé|sante|médic|medic|pharma|hôpital|hopital|docteur/i,
    ecole: /école|ecole|scolar|fourniture|cahier/i, ceremonie: /baptême|bapteme|mariage|funéraille|funeraille|cérémon|ceremon|fête|fete/i,
    factures: /facture|électric|electric|eau|courant|crédit téléphone/i };
  function dicter() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition, out = $(".bu-voix-r", dlg);
    if (!R) { out.textContent = "La dictée n'est pas disponible ici : utilisez le micro de votre clavier."; return; }
    const r = new R(); r.lang = "fr-FR"; r.interimResults = false;
    out.textContent = "Je vous écoute…";
    r.onresult = (ev) => {
      const t = ev.results[0][0].transcript;
      out.textContent = `« ${t} »`;
      const n = lireNombre((t.match(/\d[\d\s.]*/) || [""])[0]);
      if (n) $("#bu-m", dlg).value = nf.format(n);
      if (/gagn|reçu|recu|vendu|recette|salaire/i.test(t)) saisie.type = "revenu";
      else if (/pay|dépens|depens|achet/i.test(t)) saisie.type = "depense";
      if (saisie.type === "depense") saisie.cat = Object.keys(MOTS).find((k) => MOTS[k].test(t)) || saisie.cat;
      peindre();
    };
    r.onerror = () => { out.textContent = "Je n'ai pas compris. Réessayez, ou tapez le montant."; };
    try { r.start(); } catch (e) { out.textContent = ""; }
  }

  // ------------------------------------------------------------------ actions
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-bu]");
    if (!b || !S.vue?.contains(b) && !b.closest(".bu-demarrage")) return;
    const a = b.dataset.bu, v = b.dataset.v;
    if (a === "rythme") { S.brouillon.rythme = v; S.etape = 2; render(S.vue); setTimeout(() => $("#bu-rev")?.focus(), 50); }
    else if (a === "rev-puce") { S.brouillon.revenu = +v; render(S.vue); }
    else if (a === "suite2") { S.brouillon.revenu = lireNombre($("#bu-rev")?.value) || S.brouillon.revenu; if (!S.brouillon.revenu) { $("#bu-rev")?.focus(); return; } S.etape = 3; render(S.vue); }
    else if (a === "obj") { S.brouillon.objectif_icone = v; const m = $("#bu-obj-m")?.value; render(S.vue); if (m) $("#bu-obj-m").value = m; }
    else if (a === "terminer") terminerDemarrage();
    else if (a === "saisir") ouvrir(v);
    else if (a === "rien") {
      try { const x = await app().budget.ajouter({ date: auj(), type: "rien", montant: 0, categorie: null }); S.mv.unshift(x || { date: auj(), type: "rien", montant: 0, id: Date.now() }); }
      catch (e) { app().toast("Impossible : " + (e.message || e)); return; }
      app().toast("C'est noté : votre série continue."); render(S.vue);
    }
    else if (a === "reprendre") { S.retourVu = true; render(S.vue); }
    else if (a === "suppr") {
      try { await app().budget.supprimer(+v); S.mv = S.mv.filter((m) => String(m.id) !== String(v)); app().toast("Opération supprimée."); render(S.vue); }
      catch (e) { app().toast("Impossible : " + (e.message || e)); }
    }
    else if (a === "mode") { await sauver({ mode: v }); app().toast(v === "complet" ? "Budget détaillé activé." : "Budget simple activé."); }
    else if (a === "reglages") {
      await sauver({ revenu: lireNombre($("#bu-r-rev").value), rythme: $("#bu-r-ry").value, objectif_nom: $("#bu-r-obj").value.trim() || null,
                     objectif_montant: lireNombre($("#bu-r-objm").value) || null });
      app().toast("Réglages enregistrés.");
    }
  });
  document.addEventListener("change", async (ev) => { if (ev.target.matches?.("[data-bu='profil']")) { await sauver({ profil: ev.target.value }); } });
  async function sauver(x) {
    try { await app().budget.sauverProfil({ ...S.profil, ...x }); S.profil = { ...S.profil, ...x }; render(S.vue); window.dispatchEvent(new Event("brvm:budget")); }
    catch (e) { app().toast("Enregistrement impossible : " + (e.message || e)); }
  }

  window.BafiBudget = { render, mode: () => S.profil?.mode || null, recharger: () => { S.charge = false; } };
  // À l'ouverture : en mode simple (ou pour un nouvel utilisateur), le budget est l'écran d'accueil
  window.addEventListener("brvm:pret", async () => {
    await charger();
    const h = location.hash.slice(1);
    if ((!h || h === "aujourdhui") && !S.erreur && (S.profil?.mode === "simple" || (!S.profil && !app().nbOps?.()))) location.hash = "budget";
    else if (h === "budget") app().render();
    window.dispatchEvent(new Event("brvm:budget"));
  });
})();
