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
  const rendre = () => app()?.render?.();
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
    if (["budget", "objectifs", "aujourdhui", ""].includes(location.hash.slice(1))) rendre();
  }

  // ------------------------------------------------------------------ calculs
  function calculs() {
    const p = S.profil || {}, parts = PROFILS[p.profil] || PROFILS.equilibre;
    const jour = p.rythme === "jour";
    const dm = new Date(); dm.setDate(1); dm.setMonth(dm.getMonth() + (S.decal || 0));
    const d0 = iso(dm).slice(0, 8) + "01", fm = new Date(dm.getFullYear(), dm.getMonth() + 1, 0), d1 = iso(fm);
    const mois = S.mv.filter((m) => m.date >= d0 && m.date <= d1);
    const somme = (l, t) => l.filter((m) => m.type === t).reduce((a, m) => a + (+m.montant || 0), 0);
    const revMois = somme(mois, "revenu"), depMois = somme(mois, "depense");
    const fin = new Date(); fin.setMonth(fin.getMonth() + 1, 0);
    const joursRest = (S.decal || 0) ? 0 : fin.getDate() - new Date().getDate() + 1;
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
    const recAuj = S.mv.filter((m) => m.date === auj() && m.type === "revenu").reduce((a, m) => a + (+m.montant || 0), 0);
    // revenu de base prudent (revenu journalier) : le quart le plus faible des jours de recette des 60 derniers jours
    const parJour = {}; for (const m of S.mv) if (m.type === "revenu" && m.date >= ilya(60)) parJour[m.date] = (parJour[m.date] || 0) + (+m.montant || 0);
    const vals = Object.values(parJour).sort((a, b) => a - b), basePrudente = vals.length >= 8 ? vals[Math.floor(vals.length / 4)] * 26 : null;
    const abonnements = (() => { const vus = new Map(); for (const m of S.mv) if (m.recurrent && m.type === "depense") vus.set(m.categorie + "|" + m.montant, m); return [...vus.values()]; })();
    return { p, parts, jour, revMois, depMois, recAuj, basePrudente, abonnements, moisLib: dm.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), d0, d1, revRef, reste, duJour, env, garde, part, securiteObj, securite, projet, solde, serie, notéAujourdhui,
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
      ${b.rythme === "mois" ? `<p class="bu-q2">Quel jour êtes-vous payé ?</p><div class="bu-puces">${[1, 5, 10, 15, 25, 28, 30].map((j) => `<button type="button" class="bu-puce" data-bu="paie" data-v="${j}" aria-pressed="${b.jour_paie === j}">${j === 30 ? "Fin du mois" : "Le " + j}</button>`).join("")}</div>` : ""}
      <button type="button" class="btn primary bu-suite" data-bu="suite2">Continuer</button>`;
    return `${barre}<h2 class="bu-q">Pour quoi voulez-vous garder de l'argent ?</h2>
      <div class="bu-grille">${OBJ.map(([k, l]) => `<button type="button" class="bu-cat" data-bu="obj" data-v="${k}" aria-pressed="${b.objectif_icone === k}"><span class="bu-tuile ${b.objectif_icone === k ? "" : "clair"}">${ic(P[k])}</span>${l}</button>`).join("")}</div>
      ${b.objectif_icone ? `<label class="bu-champ">Son nom <small>(facultatif)</small><input id="bu-obj-n" maxlength="60" placeholder="${esc((OBJ.find((o) => o[0] === b.objectif_icone) || ["", "Mon projet"])[1])}" value="${esc(b.objectif_nom || "")}"></label>` : ""}
      <div class="bu-2col">
        <label class="bu-champ">Combien ? <small>(facultatif)</small><input id="bu-obj-m" inputmode="numeric" placeholder="ex. 300 000" value="${b.objectif_montant ? nf.format(b.objectif_montant) : ""}"></label>
        <label class="bu-champ">Pour quand ? <small>(facultatif)</small><input id="bu-obj-d" type="month" value="${esc(b.objectif_date || "")}"></label>
      </div>
      <p class="small bu-effort" id="bu-effort" aria-live="polite"></p>
      <p class="bu-q2">À quelle heure, le soir, voulez-vous votre petit rappel ?</p>
      <div class="bu-puces">${[["19:30", "19 h 30"], ["20:00", "20 h"], ["21:00", "21 h"], ["22:00", "22 h"]].map(([h, l]) => `<button type="button" class="bu-puce" data-bu="heure" data-v="${h}" aria-pressed="${(b.heure || "20:00") === h}">${l}</button>`).join("")}</div>
      <button type="button" class="btn primary bu-suite" data-bu="terminer"${b.objectif_icone ? "" : " disabled"}>C'est parti</button>
      <p class="small muted bu-note">Vous pourrez tout changer plus tard. Vos chiffres restent privés.</p>`;
  }
  // ouvre la fenêtre « Je garde » du coffre, montant prérempli
  function garder(montant) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.coffre = "verser"; b.hidden = true;
    document.body.appendChild(b); b.click(); b.remove();
    if (montant > 0) setTimeout(() => { const i = document.querySelector("#f-coffre [name=montant]"); if (i) { i.value = Math.round(montant); i.dispatchEvent(new Event("input", { bubbles: true })); } }, 60);
  }
  // « à ce rythme, atteint en juillet » : d'après ce qu'on garde chaque mois (étages dans l'ordre : sécurité puis projet)
  function quand(reste, parMois) {
    if (!(reste > 0)) return "atteint ✓";
    if (!(parMois > 0)) return "";
    const n = Math.ceil(reste / parMois), d = new Date(); d.setMonth(d.getMonth() + n);
    return `à ce rythme, atteint en ${d.toLocaleDateString("fr-FR", { month: "long", year: n > 10 ? "numeric" : undefined })}`;
  }
  const lireNombre = (v) => +String(v || "").replace(/[^\d]/g, "") || 0;
  async function terminerDemarrage() {
    const b = S.brouillon;
    b.objectif_montant = lireNombre($("#bu-obj-m")?.value) || null;
    const lib = $("#bu-obj-n")?.value.trim() || (OBJ.find((o) => o[0] === b.objectif_icone) || ["", "Mon projet"])[1];
    const profil = { mode: "simple", rythme: b.rythme || "mois", revenu: b.revenu || 0, profil: "equilibre", jour_paie: b.rythme === "mois" ? (b.jour_paie || null) : null,
                     objectif_nom: $("#bu-obj-n")?.value.trim() || (b.objectif_icone === "securite" ? "Mes imprévus" : lib === "École" ? "L'école" : lib),
                     objectif_icone: b.objectif_icone, objectif_montant: b.objectif_montant, objectif_date: $("#bu-obj-d")?.value ? $("#bu-obj-d").value + "-01" : null };
    try { await app().budget.sauverProfil(profil); S.profil = { ...(S.profil || {}), ...profil };
          app().sauverRappels?.({ heure: b.heure || "20:00", epargne: true }).catch?.(() => {}); }
    catch (e) { app().toast("Enregistrement impossible : " + (e.message || e)); return; }
    const e = (S.profil.revenu || 0) * (S.profil.rythme === "jour" ? 0.2 : 0.2);
    app().toast("Votre budget est prêt.", { detail: `Vous pourriez garder environ ${F(e)} ${S.profil.rythme === "jour" ? "par jour" : "par mois"}.` });
    rendre();
  }

  // ------------------------------------------------------------------ écrans
  const jauge = (v, max, cls = "") => `<div class="bu-jauge ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${max ? Math.round(Math.min(100, 100 * v / max)) : 0}"><i style="width:${max ? Math.min(100, 100 * v / max).toFixed(1) : 0}%"></i></div>`;
  function blocRetour(c) {
    if (!c.derniere || c.derniere >= ilya(3) || S.retourVu) return "";
    return `<section class="card bu-retour"><span class="bu-tuile amb">${ic(P.sante)}</span>
      <div><b>Content de vous revoir${app().profil?.()?.prenom ? ", " + esc(app().profil().prenom) : ""}</b>
        <p class="small">On reprend à partir d'aujourd'hui, sans rien rattraper. ${c.p.objectif_nom ? `Votre projet « ${esc(c.p.objectif_nom)} » vous attend : ${F(c.solde)} déjà gardés.` : ""}</p>
        <div class="bu-retour-b"><button type="button" class="btn primary small" data-bu="reprendre">Reprendre aujourd'hui</button>
          <button type="button" class="btn small" data-bu="saisir" data-v="depense">Noter mes derniers jours</button></div>
        <p class="small"><a href="#profil">Trop de rappels ? Régler mes rappels</a></p></div></section>`;
  }
  function blocSemaine(c) {
    const s = c.semaine, diff = s.depAvant ? Math.round(100 * (s.dep - s.depAvant) / s.depAvant) : null;
    return `<details class="card bu-sem"${new Date().getDay() === 0 ? " open" : ""}><summary><span class="bu-tuile">${ic(P.semaine, "#fff")}</span><b>Ma semaine</b></summary>
      <ul class="bu-sem-l">
        <li><span class="bu-tuile amb petit">${ic(P.coffre)}</span><span>Gardé</span><b>${F(s.garde)}</b></li>
        <li><span class="bu-tuile petit">${ic(P.moins, "#fff")}</span><span>Dépensé${diff !== null ? ` <small class="${diff <= 0 ? "good" : "bad"}">${diff <= 0 ? "" : "+"}${diff} %</small>` : ""}</span><b>${F(s.dep)}</b></li>
        <li><span class="bu-tuile clair petit">${ic(P.calendrier)}</span><span>Jours notés</span><b>${s.jours} / 7</b></li>
        <li><span class="bu-tuile amb petit">${ic(P.securite)}</span><span>Sécurité</span><b>${c.securiteObj ? (c.securite / (c.securiteObj / (c.jour ? 6 : 3))).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : 0} mois couverts</b></li>
        <li><span class="bu-tuile clair petit">${ic(P.ceremonie)}</span><span>Plaisirs du mois</span><b class="${c.env.envies <= c.revRef * c.part(2) ? "good" : "bad"}">${c.env.envies <= c.revRef * c.part(2) ? "dans le budget ✓" : "au-dessus du budget"}</b></li>
      </ul>${c.serie >= 7 ? `<p class="small">Vous êtes un épargnant régulier : ${c.serie} jours d'affilée.</p>` : ""}
      <p class="small"><a href="#budget">Voir mon budget du mois</a></p></details>`;
  }
  // Accueil unique du mode simple (onglet Aujourd'hui) : l'essentiel, dans l'ordre du parcours
  function vueAccueil(c) {
    return `${blocRetour(c)}${blocPaie(c)}
      ${c.jour && !c.revMois ? `<section class="bu-phrase"><span class="small">Bienvenue</span><b style="font-size:1.35rem">Notez votre recette du jour</b>
          <span class="small">Touchez « J'ai gagné » : vous verrez ce que vous pouvez dépenser.</span></section>`
      : `<section class="bu-phrase"><span class="small">Aujourd'hui, vous pouvez dépenser</span><b data-count>${F(c.duJour)}</b>
        ${c.serie ? `<span class="small">🔥 ${c.serie} jour${c.serie > 1 ? "s" : ""} d'affilée</span>` : ""}</section>`}
      ${troisBoutons()}${blocRecette(c)}
      ${blocRecurrents()}
      ${blocCoffre(c)}${blocCercle()}${blocPlacements()}${blocSoir(c)}${blocSemaine(c)}`;
  }
  const troisBoutons = () => `<div class="bu-trois">
        <button type="button" class="bu-gros-b gagne" data-bu="saisir" data-v="revenu"><span class="bu-tuile">${ic(P.plus, "#fff")}</span>J'ai gagné</button>
        <button type="button" class="bu-gros-b depense" data-bu="saisir" data-v="depense"><span class="bu-tuile clair">${ic(P.moins)}</span>J'ai dépensé</button>
        <button type="button" class="bu-gros-b garde" data-coffre="verser"><span class="bu-tuile amb">${ic(P.coffre)}</span>Je garde</button>
      </div>`;
  // recette (ou salaire) reçue aujourd'hui : sa répartition, et le geste « je garde » prérempli
  function blocRecette(c) {
    if (!c.recAuj) return "";
    const g = Math.round(c.recAuj * c.part(3)), gardeAuj = (app().epargneResume?.()?.mv || []).filter((m) => m.type === "VERSEMENT" && m.date === auj()).reduce((a, m) => a + (+m.montant || 0), 0);
    const habituel = c.jour ? +c.p.revenu || 0 : 0, surplus = habituel && c.recAuj > habituel * 1.2 ? Math.round(c.recAuj - habituel) : 0;
    return `<section class="card bu-recette"><div class="bu-ligne"><b>Gagné aujourd'hui : ${F(c.recAuj)}</b></div>
      <div class="bu-repart trois" aria-hidden="true"><i style="flex:${c.parts[1]}"></i><i style="flex:${c.parts[2]}"></i><i style="flex:${c.parts[3]}"></i></div>
      <div class="bu-ligne small"><span>Pour vivre</span><b>${F(c.recAuj * c.part(1))}</b></div>
      <div class="bu-ligne small"><span>Pour se faire plaisir</span><b>${F(c.recAuj * c.part(2))}</b></div>
      <div class="bu-ligne small"><span>Je garde tout de suite</span><b>${F(g)}</b></div>
      ${gardeAuj >= g ? `<p class="small good">✓ ${F(gardeAuj)} gardés aujourd'hui. Bravo.</p>`
        : `<button type="button" class="btn primary" data-bu="garder" data-v="${g - gardeAuj}">J'ai gardé ${F(g - gardeAuj)}</button>`}
      ${surplus && gardeAuj < g + surplus ? `<p class="small bu-bonne"><b>Bonne journée !</b> ${F(surplus)} de plus que d'habitude.
        <button type="button" class="btn link small" data-bu="garder" data-v="${surplus}">Les garder aussi</button></p>` : ""}</section>`;
  }
  // jour de paie (salaire) : garder d'abord, avant de dépenser
  function blocPaie(c) {
    const j = +c.p.jour_paie, d = new Date().getDate(), fin = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    if (c.jour || !j || !(d === Math.min(j, fin) || d === Math.min(j, fin) + 1) || c.garde >= c.epargneCible) return "";
    return `<section class="card bu-paie"><span class="bu-tuile amb">${ic(P.salaire)}</span><div><b>C'est jour de paie</b>
      <p class="small">Gardez d'abord <b>${F(Math.max(0, c.epargneCible - c.garde))}</b>, avant les dépenses.</p>
      <button type="button" class="btn primary small" data-coffre="verser">Je garde maintenant</button></div></section>`;
  }
  // dépenses qui reviennent chaque mois : proposées le jour habituel, notées en une touche
  function aNoterCeMois() {
    const d0 = auj().slice(0, 8) + "01", jour = new Date().getDate(), vus = new Set(), out = [];
    for (const m of S.mv) {
      if (!m.recurrent || m.type !== "depense" || m.date >= d0) continue;
      const cle = m.categorie + "|" + m.montant;
      if (vus.has(cle)) continue; vus.add(cle);
      const deja = S.mv.some((x) => x.date >= d0 && x.type === "depense" && x.categorie === m.categorie && +x.montant === +m.montant);
      if (!deja && +m.date.slice(8, 10) <= jour) out.push(m);
    }
    return out.slice(0, 3);
  }
  function blocRecurrents() {
    const l = aNoterCeMois();
    if (!l.length) return "";
    return `<section class="card"><h2 class="bu-h2">À noter ce mois-ci</h2><ul class="bu-ops">${l.map((m) => `<li>
      <span class="bu-tuile clair petit">${ic(P[m.categorie] || P.autres)}</span><span class="bu-op-l">${esc(libCat(m))}<small>comme le mois dernier</small></span>
      <button type="button" class="btn small primary" data-bu="rec" data-v="${esc(m.categorie)}|${+m.montant}">Noter ${F(m.montant)}</button></li>`).join("")}</ul></section>`;
  }
  function blocCoffre(c) {
    const p = c.p;
    return `<section class="card bu-projet"><span class="bu-tuile amb">${ic(P.coffre)}</span>
      <div class="bu-projet-c"><div class="bu-ligne"><span><b>Mon coffre</b><small class="bu-sous">${F(c.solde)} gardés</small></span><a href="#objectifs" class="small">Voir</a></div>
        <div class="bu-ligne small"><span>${ic(P.securite)} Sécurité</span><span>${F(c.securite)} / ${F(c.securiteObj)}</span></div>${jauge(c.securite, c.securiteObj)}
        <div class="bu-ligne small"><span>${ic(P[p.objectif_icone] || P.coffre)} ${esc(p.objectif_nom || "Mon projet")}</span><span>${F(c.projet)}${p.objectif_montant ? " / " + F(p.objectif_montant) : ""}</span></div>
        ${p.objectif_montant ? jauge(c.projet, p.objectif_montant, "amb") : ""}
        ${p.objectif_montant ? `<p class="small muted">${quand(p.objectif_montant + Math.max(0, c.securiteObj - c.securite) - c.projet, c.epargneCible)}${p.objectif_date ? ` · objectif : ${new Date(p.objectif_date).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}` : ""}</p>` : ""}</div></section>`;
  }
  function blocCercle() {
    let l = []; try { l = S.cercles || []; } catch (e) { l = []; }
    const c = l[0];
    if (!c) return `<section class="card bu-cercle"><span class="bu-tuile clair">${ic('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="4.5" r="2"/><circle cx="5.5" cy="16" r="2"/><circle cx="18.5" cy="16" r="2"/>')}</span>
      <div><b>Garder à plusieurs</b><p class="small muted">Avec la famille ou des amis, on tient plus facilement.</p><a href="#portefeuille" data-bu="cercles" class="small">Créer ou rejoindre un cercle</a></div></section>`;
    const m = c.membres || [], actifs = m.filter((x) => +x.serie > 0).length;
    return `<section class="card bu-cercle"><span class="bu-tuile">${ic('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="4.5" r="2"/><circle cx="5.5" cy="16" r="2"/><circle cx="18.5" cy="16" r="2"/>', "#fff")}</span>
      <div style="flex:1;min-width:0"><div class="bu-ligne"><b>${esc(c.nom)}</b><a href="#portefeuille" data-bu="cercles" class="small">Ouvrir</a></div>
        <p class="small muted">${actifs} sur ${m.length} en série en ce moment</p>
        <div class="bu-pastilles">${m.slice(0, 7).map((x) => `<span class="${+x.serie > 0 ? "ok" : ""}" title="${esc(x.pseudo || "")}">${esc(String(x.pseudo || "?").slice(0, 1).toUpperCase())}</span>`).join("")}</div></div></section>`;
  }
  function blocPlacements() {
    const pl = app().placements?.();
    if (!pl) return "";
    return `<a class="card bu-pl" href="#portefeuille" data-bu="placements"><span class="bu-tuile clair petit">${ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>')}</span>
      <span class="bu-op-l"><b>Mes placements</b><small>${F(pl.valeur)}${pl.varJour != null && Math.abs(pl.varJour) < 0.0005 ? " · stable aujourd'hui" : ""}${pl.varJour != null && Math.abs(pl.varJour) >= 0.0005 ? ` · <span class="${pl.varJour >= 0 ? "good" : "bad"}">${pl.varJour >= 0 ? "+" : ""}${(pl.varJour * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % aujourd'hui</span>` : ""}</small></span><span aria-hidden="true">›</span></a>`;
  }
  function blocSoir(c) {
    return c.notéAujourdhui ? `<p class="small muted bu-ok">✓ Votre journée est notée.</p>`
      : `<section class="card bu-soir"><div class="bu-ligne"><b>Mon point du jour</b></div>
          <div class="bu-soir-b"><button type="button" class="btn primary" data-bu="saisir" data-v="depense">Noter une dépense</button>
          <button type="button" class="btn" data-bu="rien">Rien de spécial</button></div></section>`;
  }
  // dépenses qui reviennent chaque mois : à passer en revue tous les 6 mois
  function blocAbonnements(c) {
    if (!c.abonnements.length) return "";
    const total = c.abonnements.reduce((a, m) => a + (+m.montant || 0), 0);
    return `<details class="card"><summary class="bu-ligne"><b>Mes dépenses de chaque mois</b><span class="small">${F(total)} / mois</span></summary>
      <ul class="bu-ops">${c.abonnements.map((m) => `<li><span class="bu-tuile clair petit">${ic(P[m.categorie] || P.autres)}</span><span class="bu-op-l">${esc(libCat(m))}</span><b>${F(m.montant)}</b></li>`).join("")}</ul>
      <p class="small muted">Tous les 6 mois, vérifiez-les : un abonnement oublié, c'est de l'argent qui part sans vous.</p></details>`;
  }
  function dernieres(n, c) {
    const l = S.mv.filter((m) => m.type !== "rien" && (!c || (m.date >= c.d0 && m.date <= c.d1))).slice(0, n);
    if (!l.length) return "";
    return `<section class="card"><h2 class="bu-h2">Dernières opérations</h2><ul class="bu-ops">${l.map((m) => `<li>
      <span class="bu-tuile ${m.type === "revenu" ? "" : "clair"} petit">${ic(P[m.categorie] || P.autres, m.type === "revenu" ? "#fff" : "currentColor")}</span>
      <span class="bu-op-l">${esc(libCat(m))}<small>${new Date(m.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</small></span>
      <b class="${m.type === "revenu" ? "good" : ""}">${m.type === "revenu" ? "+" : "−"}${F(m.montant)}</b>
      <button type="button" class="bu-suppr" data-bu="suppr" data-v="${m.id}" aria-label="Supprimer ${esc(libCat(m))} ${F(m.montant)}">×</button></li>`).join("")}</ul></section>`;
  }
  function vueBudget(c, simple) {
    const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const env = (nom, cle, i, cls) => {
      const max = c.revRef * c.part(i), v = cle === "epargne" ? c.garde : c.env[cle];
      return `<div class="bu-env"><div class="bu-ligne"><b>${nom}</b><span>${F(v)} / ${F(max)}</span></div>${jauge(v, max, cls)}</div>`;
    };
    return `${blocRetour(c)}
      <div class="bu-mois"><button type="button" class="btn small" data-bu="mois" data-v="-1" aria-label="Mois précédent"${(S.decal || 0) <= -2 ? " disabled" : ""}>‹</button>
        <b>${esc(c.moisLib)}</b><button type="button" class="btn small" data-bu="mois" data-v="1" aria-label="Mois suivant"${(S.decal || 0) >= 0 ? " disabled" : ""}>›</button></div>
      <section class="bu-phrase large"><span class="small">${S.decal ? (simple ? "Il me restait" : "Reste à vivre") : simple ? "Il me reste" : "Reste à vivre"} · ${esc(c.moisLib)}</span><b data-count>${F(Math.max(0, c.reste))}</b>
        <span class="small">Gagné ${F(c.revMois)} · dépensé ${F(c.depMois)} · gardé ${F(c.garde)}</span>
        ${S.decal ? `<span class="small">Mois terminé</span>` : `<span class="small">Aujourd'hui : ${F(c.duJour)} ${c.jour ? "(selon vos recettes du mois)" : `· ${c.joursRest} jour${c.joursRest > 1 ? "s" : ""} restant${c.joursRest > 1 ? "s" : ""}`}</span>`}</section>
      <section class="card"><div class="bu-ligne"><h2 class="bu-h2">${simple ? "Mon argent du mois" : "Mes enveloppes"}</h2>
          ${simple ? "" : `<label class="small">Profil <select data-bu="profil">${Object.entries(PROFILS).map(([k, v]) => `<option value="${k}"${(c.p.profil || "equilibre") === k ? " selected" : ""}>${v[0]} ${v[1]}/${v[2]}/${v[3]}</option>`).join("")}</select></label>`}</div>
        ${env(simple ? "Pour vivre" : "Besoins", "besoins", 1, "")}${env(simple ? "Pour se faire plaisir" : "Envies", "envies", 2, "env2")}${env(simple ? "Je garde" : "Épargne et avenir", "epargne", 3, "amb")}
        <p class="small muted">Besoins : logement, nourriture, transport, santé, école, famille. Envies : sorties, habits, fêtes, abonnements.</p></section>
      ${S.decal ? "" : troisBoutons() + blocRecette(c) + blocRecurrents() + blocSoir(c)}
      ${blocCoffre(c)}${dernieres(8, c)}${blocAbonnements(c)}${S.decal ? "" : blocSemaine(c)}
      <details class="card"><summary><b>Mes réglages de budget</b></summary>
        <div class="bu-reg">
          <label>Mon revenu ${c.jour ? "par jour" : "par mois"}<input id="bu-r-rev" inputmode="numeric" value="${nf.format(c.p.revenu || 0)}"></label>
          ${c.jour && c.basePrudente ? `<p class="small muted">Revenu de base prudent : <b>${F(c.basePrudente)}</b> par mois (vos mois les plus faibles). Votre budget s'appuie sur lui.</p>` : ""}
          <label>Je gagne<select id="bu-r-ry"><option value="mois"${c.jour ? "" : " selected"}>chaque mois</option><option value="jour"${c.jour ? " selected" : ""}>chaque jour (variable)</option></select></label>
          ${c.jour ? "" : `<label>Jour de paie<input id="bu-r-paie" inputmode="numeric" placeholder="ex. 28" value="${c.p.jour_paie || ""}"></label>`}
          <label>Mon projet<input id="bu-r-obj" value="${esc(c.p.objectif_nom || "")}"></label>
          <label>Montant du projet<input id="bu-r-objm" inputmode="numeric" value="${c.p.objectif_montant ? nf.format(c.p.objectif_montant) : ""}"></label>
          <button type="button" class="btn primary" data-bu="reglages">Enregistrer</button>
          ${simple ? "" : ""}
          <a href="#profil" class="small">Régler l'heure de mon rappel</a>
        </div></details>
      <p class="bu-mode small">${simple ? `<button type="button" class="btn link small" data-bu="mode" data-v="complet">Passer au mode complet (enveloppes, profils)</button>`
        : `<button type="button" class="btn link small" data-bu="mode" data-v="simple">Revenir au mode simple</button>`}</p>`;
  }

  // « Mon budget » (détail du mois), dans les deux modes
  function render(v) {
    S.vue = v;
    const t = (h) => `<h1 id="h-bud">${h}</h1>`;
    if (!app()?.budget) { v.innerHTML = t("Mon budget"); return; }
    if (!S.charge) { v.innerHTML = t("Mon budget") + `<p class="muted">Chargement…</p>`; charger(); return; }
    if (S.erreur === "installer") { v.innerHTML = t("Mon budget") + `<div class="notice">Le budget arrive bientôt sur votre compte.</div>`; return; }
    if (!S.profil) { v.innerHTML = t("Mon budget") + `<div class="bu-demarrage">${demarrage()}</div>`; brancherDemarrage(v); return; }
    v.innerHTML = t("Mon budget") + vueBudget(calculs(), S.profil.mode !== "complet");
  }
  // Accueil du mode simple (onglet Aujourd'hui)
  const accueilSimple = () => S.charge && !S.erreur && (S.profil ? S.profil.mode !== "complet" : !app()?.nbOps?.());
  function renderAccueil(v) {
    S.vue = v;
    S.decal = 0;
    if (!S.cerclesCharges) { S.cerclesCharges = true; app().cercles?.().then((l) => { S.cercles = l || []; if (location.hash.slice(1) === "aujourdhui" || !location.hash) rendre(); }).catch(() => {}); }
    v.innerHTML = `<h1 id="h-auj">Aujourd'hui</h1>` + (S.profil ? vueAccueil(calculs()) : `<div class="bu-demarrage">${demarrage()}</div>`);
    if (!S.profil) brancherDemarrage(v);
  }
  // Mes objectifs : les trois étages (sécurité, projet, faire grandir), reliés au budget et au coffre
  function renderObjectifs(v) {
    S.vue = v;
    S.decal = 0;
    if (!S.charge) { v.innerHTML = `<h1 id="h-obj">Mes objectifs</h1><p class="muted">Chargement…</p>`; charger(); return; }
    if (!S.profil) { v.innerHTML = `<h1 id="h-obj">Mes objectifs</h1><div class="notice">Commencez par votre budget : vos objectifs se calculent à partir de lui.
      <p><a class="btn primary" href="#budget">Commencer mon budget</a></p></div>`; return; }
    const c = calculs(), p = c.p, plein = c.securite >= c.securiteObj && c.securiteObj > 0;
    const moisRestants = c.epargneCible > 0 ? Math.ceil(Math.max(0, c.securiteObj - c.securite) / c.epargneCible) : null;
    const etage = (n, titre, icone, amb, sous, v, max, etat) => `<section class="card bu-etage${etat === "en cours" ? " actif" : ""}">
      <div class="bu-ligne"><span class="bu-etage-t"><span class="bu-tuile${amb ? " amb" : ""}">${ic(P[icone] || P.coffre, amb ? "currentColor" : "#fff")}</span>
        <span><b>${n} · ${esc(titre)}</b><small>${sous}</small></span></span><span class="chip">${etat}</span></div>
      ${max ? `<div class="bu-ligne small"><span>${F(v)}</span><b>${F(max)}</b></div>${jauge(v, max, amb ? "amb" : "")}` : ""}</section>`;
    const projetEtat = !plein ? "ensuite" : p.objectif_montant && c.projet >= p.objectif_montant ? "atteint ✓" : "en cours";
    v.innerHTML = `<h1 id="h-obj">Mes objectifs</h1>
      <p class="bu-intro">Ce que vous gardez remplit les étages <b>dans l'ordre</b>.</p>
      ${(() => { const cible = c.epargneCible, versSecu = Math.min(cible, Math.max(0, c.securiteObj - c.securite)), versProjet = plein || versSecu < cible ? cible - versSecu : 0;
        const mois = new Date().toLocaleDateString("fr-FR", { month: "long" });
        return cible > 0 ? `<section class="card"><b>À garder en ${esc(mois)} : ${F(cible)}</b>
          <div class="bu-repart" aria-hidden="true"><i style="flex:${versSecu || 0.001}"></i><i style="flex:${versProjet || 0.001}"></i></div>
          <div class="bu-ligne small"><span>${ic(P.securite)} Vers la sécurité</span><b>${F(versSecu)}</b></div>
          <div class="bu-ligne small"><span>${ic(P[p.objectif_icone] || P.coffre)} Vers ${esc(p.objectif_nom || "mon projet")}</span><b>${F(versProjet)}</b></div>
          <div class="bu-ligne small muted"><span>Vers la bourse</span><span>${plein ? "quand vous le décidez" : "dès que la sécurité est pleine"}</span></div>
          <p class="small muted">Déjà gardé ce mois-ci : ${F(c.garde)}.</p></section>` : ""; })()}
      ${etage(1, "Sécurité", "securite", false, `${c.jour ? "6" : "3"} mois de besoins, calculés depuis votre budget`, c.securite, c.securiteObj, plein ? "pleine ✓" : "en cours")}
      ${etage(2, p.objectif_nom || "Mon projet", p.objectif_icone, true, "Votre projet", c.projet, p.objectif_montant || 0, projetEtat)}
      <section class="card bu-etage${plein ? " actif" : ""}"><div class="bu-ligne"><span class="bu-etage-t"><span class="bu-tuile">${ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', "#fff")}</span>
        <span><b>3 · Faire grandir</b><small>Placer à la BRVM chez votre SGI</small></span></span><span class="chip">${plein ? "prêt" : "bientôt"}</span></div>
        <div class="bu-ligne small"><span>Plan proposé</span><b>${F(c.epargneCible)} ${c.jour ? "par mois" : "par mois, le jour de paie"}</b></div>
        <p class="small muted">${plein ? "Votre sécurité est pleine : vous pouvez commencer à placer." : moisRestants ? `Possible quand la sécurité sera pleine, dans environ ${moisRestants} mois.` : "Possible quand la sécurité sera pleine."}</p>
        ${plein ? `<button type="button" class="btn primary" data-coffre="sgi">J'ai envoyé à ma SGI</button>` : ""}</section>
      <div class="bu-soir-b"><button type="button" class="btn primary" data-coffre="verser">Je garde</button><button type="button" class="btn" data-coffre="reprendre">J'ai repris</button></div>
      <p class="small center"><a href="#portefeuille" data-bu="coffre">Historique et réglages du coffre</a></p>`;
  }

  function brancherDemarrage(v) {
    const r = $("#bu-rev", v);
    r?.addEventListener("input", () => { S.brouillon.revenu = lireNombre(r.value); });
    // effort mensuel du projet, calculé en direct (montant et date facultatifs)
    const eff = () => {
      const m = lireNombre($("#bu-obj-m", v)?.value), d = $("#bu-obj-d", v)?.value, out = $("#bu-effort", v);
      if (!out) return;
      S.brouillon.objectif_montant = m || null; S.brouillon.objectif_date = d || null; S.brouillon.objectif_nom = $("#bu-obj-n", v)?.value.trim() || null;
      if (!m || !d) { out.textContent = ""; return; }
      const [a, mo] = d.split("-").map(Number), n = Math.max(1, (a - new Date().getFullYear()) * 12 + mo - 1 - new Date().getMonth());
      const rev = (S.brouillon.revenu || 0) * (S.brouillon.rythme === "jour" ? 26 : 1), effort = m / n;
      out.innerHTML = `≈ <b>${F(effort)}</b> par mois pendant ${n} mois${rev ? (effort <= rev * 0.2 ? " : c'est dans vos moyens." : " : c'est beaucoup, une date plus lointaine aiderait.") : "."}`;
    };
    ["#bu-obj-m", "#bu-obj-d", "#bu-obj-n"].forEach((q) => $(q, v)?.addEventListener("input", eff));
    eff();
  }

  // ------------------------------------------------------------------ saisie (deux touches ou à la voix)
  let dlg = null, saisie = { type: "depense", cat: null };
  function dialogue() {
    if (dlg) return dlg;
    document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-budget" class="bu-dlg" aria-labelledby="bu-dlg-t"><form method="dialog" class="bu-form" novalidate>
      <h2 id="bu-dlg-t" class="sr-only">Nouvelle opération</h2>
      <div class="bu-type" role="radiogroup" aria-label="Type">
        <button type="button" data-t="revenu" role="radio">J'ai gagné</button><button type="button" data-t="depense" role="radio">J'ai dépensé</button><button type="button" data-t="garde" role="radio">Je garde</button></div>
      <label class="bu-montant"><span class="sr-only">Montant</span><input id="bu-m" inputmode="numeric" autocomplete="off" placeholder="0"><span>F</span></label>
      <div class="bu-habitude" id="bu-hab"></div>
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
      const t = ev.target.closest("[data-t]");
      if (t) { if (t.dataset.t === "garde") { const m = lireNombre($("#bu-m", dlg).value); dlg.close(); garder(m); return; } saisie.type = t.dataset.t; saisie.cat = null; peindre(); return; }
      const c = ev.target.closest("[data-cat]"); if (c) { saisie.cat = c.dataset.cat; peindre(); return; }
      const m = ev.target.closest("[data-m]"); if (m) { $("#bu-m", dlg).value = nf.format(+m.dataset.m); return; }
      const h = ev.target.closest("[data-rep]");
      if (h) { const [c, mt] = h.dataset.rep.split("|"); saisie.cat = c; $("#bu-m", dlg).value = nf.format(+mt); dlg.querySelector("form").requestSubmit(); return; }
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
        rendre();
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
    // « Comme d'habitude » : les 3 dépenses les plus fréquentes du mois, enregistrées en une touche
    const freq = new Map();
    for (const m of S.mv) if (m.type === saisie.type && m.type !== "rien" && m.date >= ilya(30) && +m.montant > 0) {
      const k = m.categorie + "|" + (+m.montant); freq.set(k, (freq.get(k) || 0) + 1);
    }
    const hab = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    $("#bu-hab", dlg).innerHTML = hab.length ? `<span class="small muted">Comme d'habitude :</span>` + hab.map(([k]) => { const [c, mt] = k.split("|");
      return `<button type="button" class="bu-hab" data-rep="${esc(k)}"><span class="bu-tuile clair petit">${ic(P[c] || P.autres)}</span>${esc(libCat({ type: saisie.type, categorie: c }))} ${F(mt)}</button>`; }).join("") : "";
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
    if (!b || !b.closest("#v-budget, #v-aujourdhui, #v-objectifs")) return;
    const a = b.dataset.bu, v = b.dataset.v;
    if (a === "rythme") { S.brouillon.rythme = v; S.etape = 2; rendre(); setTimeout(() => $("#bu-rev")?.focus(), 50); }
    else if (a === "rev-puce") { S.brouillon.revenu = +v; rendre(); }
    else if (a === "paie") { S.brouillon.revenu = lireNombre($("#bu-rev")?.value) || S.brouillon.revenu; S.brouillon.jour_paie = +v; rendre(); }
    else if (a === "suite2") { S.brouillon.revenu = lireNombre($("#bu-rev")?.value) || S.brouillon.revenu; if (!S.brouillon.revenu) { $("#bu-rev")?.focus(); return; } S.etape = 3; rendre(); }
    else if (a === "obj") { S.brouillon.objectif_icone = v; rendre(); }
    else if (a === "terminer") terminerDemarrage();
    else if (a === "heure") { S.brouillon.heure = v; rendre(); }
    else if (a === "saisir") ouvrir(v);
    else if (a === "garder") garder(+v);
    else if (a === "mois") { S.decal = Math.max(-2, Math.min(0, (S.decal || 0) + +v)); rendre(); }
    else if (a === "fermer-invit") { S.invitationFermee = true; b.closest(".bu-invit")?.remove(); }
    else if (a === "cercles" || a === "coffre" || a === "placements") { ev.preventDefault(); app().allerPf?.(a === "cercles" ? "cercles" : a === "coffre" ? "epargne" : "placements"); }
    else if (a === "rec") {
      const [cat, mt] = v.split("|");
      try { const x = await app().budget.ajouter({ date: auj(), type: "depense", montant: +mt, categorie: cat, enveloppe: catDep(cat)[2], recurrent: true });
            S.mv.unshift(x || { date: auj(), type: "depense", montant: +mt, categorie: cat, recurrent: true, id: Date.now() }); app().toast(`${F(+mt)} notés.`); rendre(); }
      catch (e) { app().toast("Impossible : " + (e.message || e)); }
    }
    else if (a === "rien") {
      try { const x = await app().budget.ajouter({ date: auj(), type: "rien", montant: 0, categorie: null }); S.mv.unshift(x || { date: auj(), type: "rien", montant: 0, id: Date.now() }); }
      catch (e) { app().toast("Impossible : " + (e.message || e)); return; }
      app().toast("C'est noté : votre série continue."); rendre();
    }
    else if (a === "reprendre") { S.retourVu = true; rendre(); }
    else if (a === "suppr") {
      try { await app().budget.supprimer(+v); S.mv = S.mv.filter((m) => String(m.id) !== String(v)); app().toast("Opération supprimée."); rendre(); }
      catch (e) { app().toast("Impossible : " + (e.message || e)); }
    }
    else if (a === "mode") { await sauver({ mode: v }); app().toast(v === "complet" ? "Budget détaillé activé." : "Budget simple activé."); }
    else if (a === "reglages") {
      await sauver({ revenu: lireNombre($("#bu-r-rev").value), rythme: $("#bu-r-ry").value, objectif_nom: $("#bu-r-obj").value.trim() || null,
                     jour_paie: Math.min(31, lireNombre($("#bu-r-paie")?.value)) || null,
                     objectif_montant: lireNombre($("#bu-r-objm").value) || null });
      app().toast("Réglages enregistrés.");
    }
  });
  document.addEventListener("change", async (ev) => { if (ev.target.matches?.("[data-bu='profil']")) { await sauver({ profil: ev.target.value }); } });
  async function sauver(x) {
    try { await app().budget.sauverProfil({ ...S.profil, ...x }); S.profil = { ...S.profil, ...x }; rendre(); window.dispatchEvent(new Event("brvm:budget")); }
    catch (e) { app().toast("Enregistrement impossible : " + (e.message || e)); }
  }

  // invitation sur l'ancien accueil (personnes déjà installées, sans budget) : un seul geste pour commencer
  const invitation = () => (S.charge && !S.erreur && !S.profil && !S.invitationFermee ? `<section class="card bu-invit"><span class="bu-tuile amb">${ic('<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M20 11h-4a2 2 0 0 0 0 4h4"/>')}</span>
      <div><b>Nouveau : mon budget</b><p class="small">Notez ce que vous gagnez et dépensez : BafiBourse vous dit ce que vous pouvez garder.</p>
        <a class="btn primary small" href="#budget">Commencer (1 minute)</a> <button type="button" class="btn link small" data-bu="fermer-invit">Plus tard</button></div></section>` : "");
  window.BafiBudget = { render, renderAccueil, renderObjectifs, accueilSimple, invitation,
    mode: () => (S.profil ? S.profil.mode : (S.charge && !app()?.nbOps?.() ? "simple" : null)), recharger: () => { S.charge = false; } };
  // À l'ouverture : en mode simple (ou pour un nouvel utilisateur), le budget est l'écran d'accueil
  window.addEventListener("brvm:pret", async () => {
    await charger();
    const h = location.hash.slice(1);
    if (["", "aujourdhui", "budget", "objectifs"].includes(h)) app().render();
    window.dispatchEvent(new Event("brvm:budget"));
  });
})();
