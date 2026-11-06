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
    sablier: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    deux: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c0-3 3-5 6-5s6 2 6 5M10 20c0-3 3-5 6-5s6 2 6 5"/>',
    cercle: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="4.5" r="2"/><circle cx="5.5" cy="16" r="2"/><circle cx="18.5" cy="16" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    autre_rev: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>', moins: '<path d="M5 12h14"/>', micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
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
  // Budget prévu : { depenses: {catégorie: montant}, revenus: {catégorie: montant} } ; l'ancien format plat est converti
  function prevu(p) {
    const ch = p?.charges || {};
    if (ch.depenses || ch.revenus) return { depenses: ch.depenses || {}, revenus: ch.revenus || {} };
    const dep = {}; for (const [k, v] of Object.entries(ch)) if (+v) dep[k === "loyer" ? "logement" : k] = +v;
    return { depenses: dep, revenus: {} };
  }
  const PRINCIPALES = ["logement", "nourriture", "transport", "famille"];
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
      try { S.projets = (await b.projets?.()) || []; S.projetsOk = true; } catch (e) { S.projets = []; S.projetsOk = false; }   // 25-livraison3.sql
      S.erreur = null;
    } catch (e) {
      S.erreur = /budget_|relation|does not exist|42P01/i.test(String(e?.message || e)) ? "installer" : String(e?.message || e);
    }
    S.charge = true; S.enCours = false;
    if (["budget", "objectifs", "avenir", "aujourdhui", ""].includes(location.hash.slice(1))) rendre();
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
    const pv = prevu(p);
    const fixes = Object.entries(pv.depenses).filter(([k]) => catDep(k)[2] === "besoins").reduce((a, [, x]) => a + (+x || 0), 0);
    const securiteObj = Math.round((fixes > 0 ? fixes : revMensuelPrevu * part(1)) * (jour ? 6 : 3));
    const solde = ep?.solde || 0;
    const securite = Math.min(solde, securiteObj), projet = Math.max(0, solde - securiteObj);
    const liste = (S.projets && S.projets.length) ? S.projets.filter((x) => !x.realise_le) : (p.objectif_nom ? [{ id: "profil", nom: p.objectif_nom, icone: p.objectif_icone, montant: p.objectif_montant, date_cible: p.objectif_date }] : []);
    let resteP = projet;
    const projets = liste.map((x) => { const g = x.montant ? Math.min(resteP, +x.montant) : resteP; resteP = Math.max(0, resteP - g); return { ...x, garde: g }; });
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
    const pl = ep?.plan, planMensuel = pl?.montant ? Math.round(+pl.montant * ({ quotidien: 30.4, hebdo: 4.33, mensuel: 1 })[pl.rythme] || 0) : 0;
    const depParCat = {}; for (const m of mois) if (m.type === "depense") depParCat[m.categorie] = (depParCat[m.categorie] || 0) + (+m.montant || 0);
    const bourse = Math.max(0, resteP);                       // 3e poche : ce qui dépasse la sécurité et les projets attend d'aller à la SGI
    const envoyeSgi = ep?.envoye ?? (ep?.mv || []).filter((m) => m.type === "TRANSFERT").reduce((x, m) => x + (+m.montant || 0), 0);
    return { p, pv, depParCat, projets, fixes, bourse, envoyeSgi, parts, jour, revMois, depMois, recAuj, planMensuel, plan: pl || null, basePrudente, abonnements, moisLib: dm.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), d0, d1, revRef, reste, duJour, env, garde, part, securiteObj, securite, projet, solde, serie, notéAujourdhui,
             derniere, joursRest, epargneCible: planMensuel || revRef * part(3), epargneBudget: revRef * part(3),
             semaine: { dep: somme(s1, "depense"), depAvant: somme(s0, "depense"), garde: gardeSem, jours: new Set(s1.map((m) => m.date)).size } };
  }

  // ------------------------------------------------------------------ Mon avenir : âge d'indépendance financière (en francs d'aujourd'hui)
  // Hypothèses affichées et modifiables : rendement annuel par profil, inflation UEMOA ; on vit de son patrimoine quand
  // 4 % de celui-ci par an couvrent les dépenses. Simulation, pas une promesse.
  const HYP = { prudent: ["Prudent", 0.05], equilibre: ["Équilibré", 0.07], dynamique: ["Dynamique", 0.09] }, INFLATION = 0.025, RETRAIT = 0.04;
  function trajectoire(age, patrimoine, parMois, depensesMois, rendement, departDans = 0) {
    const reel = (1 + rendement) / (1 + INFLATION) - 1, rm = Math.pow(1 + reel, 1 / 12) - 1, besoin = depensesMois * 12 / RETRAIT;
    let k = patrimoine, ageLib = null; const points = [];
    for (let m = 0; m <= Math.max(1, 90 - age) * 12; m++) {
      if (m % 12 === 0) points.push(k);
      if (ageLib === null && k >= besoin && k > 0) ageLib = Math.ceil(age + m / 12);
      k = k * (1 + rm) + (m >= departDans * 12 ? parMois : 0);
    }
    return { ageLib, points, besoin };
  }
  function avenir(c, x = {}) {
    const age = +(x.age ?? S.avenirAge ?? c.p.age) || 0;
    if (!age) return null;
    const pl = app().placements?.(), patrimoine = (x.patrimoine ?? S.avenirPat ?? (c.solde + (pl?.valeur || 0))) || 0;
    const parMois = x.parMois ?? S.avenirPm ?? Math.round(c.epargneCible);
    const dep = x.depenses ?? S.avenirDep ?? Math.max(1, Math.round(c.revRef - c.epargneCible) || (c.fixes || 1));
    const h = HYP[x.hyp || S.avenirHyp || "equilibre"][1];
    const place = trajectoire(age, patrimoine, parMois, dep, h), dort = trajectoire(age, patrimoine, parMois, dep, 0);
    const retard = trajectoire(age, patrimoine, parMois, dep, h, 10);
    const sansMois = trajectoire(age, Math.max(0, patrimoine - c.garde), parMois, dep, h);
    return { age, patrimoine, parMois, dep, h, agePlace: place.ageLib, ageDort: dort.ageLib, ageRetard: retard.ageLib, place, dort,
             moisGagnes: place.ageLib && sansMois.ageLib ? Math.max(0, Math.round((sansMois.ageLib - place.ageLib) * 12)) : 0 };
  }
  function courbe(a) {
    const n = Math.min(a.place.points.length, 50), max = Math.max(a.place.besoin * 1.15, ...a.place.points.slice(0, n));
    const X = (i) => 24 + (i / Math.max(1, n - 1)) * 290, Y = (v) => 150 - Math.min(1, v / max) * 135;
    const trace = (pts) => pts.slice(0, n).map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 320 172" class="bu-courbe" role="img" aria-label="Courbe du patrimoine : argent placé, argent qui dort, et le montant qui permet de vivre de son patrimoine">
      <line x1="24" y1="150" x2="314" y2="150" class="ax"/><line x1="24" y1="${Y(a.place.besoin).toFixed(1)}" x2="314" y2="${Y(a.place.besoin).toFixed(1)}" class="besoin"/>
      <path d="${trace(a.dort.points)}" class="dort"/><path d="${trace(a.place.points)}" class="place"/>
      <text x="24" y="168">${a.age} ans</text><text x="314" y="168" text-anchor="end">${a.age + n - 1} ans</text></svg>`;
  }
  // Mon avenir : quatre chiffres (âge, je garde, je dépense, j'ai déjà) — montants au jour, à la semaine, au mois ou à l'année —
  // et le résultat se recalcule à chaque frappe : âge de liberté, montant qu'il faut, ce qu'on aura dans 10 à 40 ans.
  const FREQ = { jour: ["par jour", 30.4], semaine: ["par semaine", 4.33], mois: ["par mois", 1], an: ["par an", 1 / 12] };
  const parMoisDe = (m, f) => Math.round((+m || 0) * FREQ[f || "mois"][1]);
  function renderAvenir(v) {
    S.vue = v; S.decal = 0;
    if (!S.charge) { v.innerHTML = `<h1 id="h-av">Mon avenir</h1><p class="muted">Chargement…</p>`; charger(); return; }
    if (!S.profil) { v.innerHTML = `<h1 id="h-av">Mon avenir</h1><div class="notice">Commencez par votre budget : votre avenir se calcule à partir de lui.<p><a class="btn primary" href="#budget">Commencer mon budget</a></p></div>`; return; }
    const c = calculs(), pl = app().placements?.(), hyp = S.avenirHyp || "equilibre";
    const pmF = S.avenirPmF || "mois", depF = S.avenirDepF || "mois";
    const pm0 = S.avenirPmBrut ?? Math.round(c.epargneCible), dep0 = S.avenirDepBrut ?? Math.max(0, Math.round(c.revRef - c.epargneCible));
    const freq = (nom, cur) => `<div class="bu-freq" role="radiogroup" aria-label="Rythme">${Object.entries(FREQ).map(([k, [l]]) =>
      `<button type="button" role="radio" aria-checked="${cur === k}" data-bu="${nom}" data-v="${k}">${l.replace("par ", "")}</button>`).join("")}</div>`;
    v.innerHTML = `<h1 id="h-av">Mon avenir</h1>
      <section class="card bu-av-saisie">
        <label class="bu-champ">Mon âge<input id="av-age" inputmode="numeric" placeholder="ex. 32" value="${S.avenirAge || c.p.age || ""}"></label>
        <div class="bu-av-l"><label class="bu-champ">Je garde<input id="av-pm" inputmode="numeric" value="${nf.format(pm0)}"></label>${freq("av-pmf", pmF)}</div>
        <div class="bu-av-l"><label class="bu-champ">Je dépense<input id="av-dep" inputmode="numeric" value="${nf.format(dep0)}"></label>${freq("av-depf", depF)}</div>
        <label class="bu-champ">J'ai déjà<input id="av-pat" inputmode="numeric" value="${nf.format(S.avenirPat ?? (c.solde + (pl?.valeur || 0)))}"></label>
        <p class="small muted">Repris de votre budget, de votre coffre et de vos placements : changez-les librement, le résultat suit.</p>
        <div class="bu-puces" role="radiogroup" aria-label="Hypothèse de rendement">${Object.entries(HYP).map(([k, [l, r]]) => `<button type="button" class="bu-puce" role="radio" aria-checked="${hyp === k}" aria-pressed="${hyp === k}" data-bu="hyp" data-v="${k}">${l} · ${Math.round(r * 100)} %</button>`).join("")}</div>
      </section>
      <div id="av-res" aria-live="polite"></div>
      <p class="small"><a href="#portefeuille" data-bu="simuler">Comment placer cet argent ? Simuler un placement à la BRVM</a></p>
      <p class="small muted">Simulation, pas une promesse : rendement annuel supposé ${Math.round(HYP[hyp][1] * 100)} % (${HYP[hyp][0]}), inflation de ${(INFLATION * 100).toLocaleString("fr-FR")} % par an déduite ;
        on considère qu'on peut vivre de son patrimoine quand 4 % par an couvrent les dépenses. Les performances passées ne préjugent pas des performances futures.</p>`;
    const maj = () => {
      const n = (id) => lireNombre($(id, v)?.value);
      const age = Math.min(90, n("#av-age")); S.avenirAge = age || null;
      S.avenirPmBrut = n("#av-pm"); S.avenirDepBrut = n("#av-dep"); S.avenirPat = n("#av-pat");
      S.avenirPm = parMoisDe(S.avenirPmBrut, S.avenirPmF); S.avenirDep = Math.max(1, parMoisDe(S.avenirDepBrut, S.avenirDepF));
      const res = $("#av-res", v);
      if (!age) { res.innerHTML = `<p class="small muted">Indiquez votre âge : le résultat s'affiche aussitôt.</p>`; return; }
      const a = avenir(c, { age, parMois: S.avenirPm, depenses: S.avenirDep, patrimoine: S.avenirPat });
      const horizons = [10, 20, 30, 40].filter((h) => age + h <= 90);
      res.innerHTML = `<section class="bu-phrase large"><span class="small">Mon âge de liberté estimé</span><b>${a.agePlace ? a.agePlace + " ans" : "au-delà de 90 ans"}</b>
          <span class="small">si votre épargne est placée (${HYP[hyp][0]}). Laissée à dormir : ${a.ageDort ? a.ageDort + " ans" : "jamais"}.</span></section>
        <section class="card"><div class="bu-ligne"><b>Ce qu'il me faut</b><b class="bu-besoin">${F(a.place.besoin)}</b></div>
          <p class="small muted">Le patrimoine qui permet de payer ${F(S.avenirDep)} de dépenses par mois sans travailler (4 % par an). C'est la ligne en pointillés.</p></section>
        <section class="card"><h2 class="bu-h2">Deux chemins</h2>${courbe(a)}
          <div class="bu-legende small"><span><i class="place"></i>Argent placé</span><span><i class="dort"></i>Argent qui dort</span><span><i class="besoin"></i>Ce qu'il me faut</span></div></section>
        <section class="card"><h2 class="bu-h2">Ce que j'aurai</h2>
          <div class="scroll-x"><table class="dtable bu-hor"><thead><tr><th>Dans</th><th class="num">Placé</th><th class="num">Qui dort</th></tr></thead><tbody>
          ${horizons.map((h) => `<tr><td>${h} ans <small class="muted">(${age + h} ans)</small></td><td class="num"><b>${F(a.place.points[h] || 0)}</b></td><td class="num">${F(a.dort.points[h] || 0)}</td></tr>`).join("")}</tbody></table></div>
          <p class="small muted">En francs d'aujourd'hui, avec ${F(S.avenirPm)} gardés par mois. Vous aurez versé ${F(S.avenirPm * 12 * (horizons[1] || horizons[0] || 10))} en ${horizons[1] || horizons[0] || 10} ans : le reste, c'est votre argent qui l'a fait grandir.</p></section>
        ${a.moisGagnes ? `<section class="card"><b>🎉 ${a.moisGagnes} mois gagnés</b><p class="small">grâce à ce que vous avez gardé ce mois-ci.</p></section>` : ""}
        <section class="card"><b>Et si vous attendiez 10 ans ?</b><p class="small">${a.agePlace && a.ageRetard ? `Commencer dans 10 ans repousse votre liberté à ${a.ageRetard} ans, soit ${a.ageRetard - a.agePlace} an${a.ageRetard - a.agePlace > 1 ? "s" : ""} plus tard.` : "Commencer tôt compte plus que le montant : chaque année d'avance travaille pour vous."}</p></section>`;
    };
    let t = null;
    v.querySelectorAll("#av-age, #av-pm, #av-dep, #av-pat").forEach((i) => i.addEventListener("input", () => {
      if (i.id !== "av-age") { const x = lireNombre(i.value); i.value = x ? nf.format(x) : ""; }
      clearTimeout(t); t = setTimeout(maj, 250);
      if (i.id === "av-age") { clearTimeout(S.tAge); S.tAge = setTimeout(() => { const age = Math.min(90, lireNombre(i.value)); if (age && age !== +S.profil.age) { S.profil.age = age; app().budget.sauverProfil({ ...S.profil, age }).catch(() => {}); } }, 1200); }
    }));
    maj();
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
      ${app().telephone?.() ? `<label class="bu-case"><input type="checkbox" id="bu-wa"${b.whatsapp ? " checked" : ""}> Recevoir aussi le rappel par WhatsApp</label>`
        : `<p class="small muted center">Pour un rappel par WhatsApp, ajoutez votre numéro dans Profil.</p>`}
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
          const wa = !!$("#bu-wa")?.checked;
          app().sauverRappels?.({ heure: b.heure || "20:00", epargne: true, ...(wa ? { whatsapp: true, whatsapp_le: new Date().toISOString() } : {}) })?.catch?.(() => {});
          if (b.objectif_icone) try { const x = await app().budget.ajouterProjet?.({ nom: profil.objectif_nom, icone: b.objectif_icone, montant: profil.objectif_montant, date_cible: profil.objectif_date, ordre: 0 }); if (x) S.projets = [x]; } catch (e) { /* table non installée : le projet du profil sert */ } }
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
      <p class="small"><a href="#budget" data-bu="voir-budget">Voir mon budget du mois</a></p></details>`;
  }
  // Bascule « Simple / Détaillé » : visible en haut de l'accueil et du budget ; on touche ou on fait glisser le curseur
  const bascule = () => { const det = S.profil?.mode === "complet";
    return `<div class="bu-bascule" role="radiogroup" aria-label="Affichage : glissez ou touchez">
      <span class="bu-fl g" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></span>
      <button type="button" role="radio" aria-checked="${!det}" data-bu="mode" data-v="simple">Simple</button>
      <button type="button" role="radio" aria-checked="${det}" data-bu="mode" data-v="complet">Détaillé</button>
      <span class="bu-fl d" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span>
      <span class="bu-curseur${det ? " droite" : ""}" aria-hidden="true"></span></div>`; };
  // Accueil unique du mode simple (onglet Aujourd'hui) : l'essentiel, dans l'ordre du parcours
  function vueAccueil(c) {
    return `<div class="bu-acc"><div class="bu-col">${bascule()}${blocRetour(c)}${blocPaie(c)}
      ${c.jour && !c.revMois ? `<section class="bu-phrase"><span class="small">Bienvenue</span><b style="font-size:1.35rem">Notez votre recette du jour</b>
          <span class="small">Touchez « J'ai gagné » : vous verrez ce que vous pouvez dépenser.</span></section>`
      : `<section class="bu-phrase"><span class="small">Aujourd'hui, vous pouvez dépenser</span><b data-count>${F(c.duJour)}</b>
        ${c.serie ? `<span class="small">🔥 ${c.serie} jour${c.serie > 1 ? "s" : ""} d'affilée</span>` : ""}</section>`}
      ${troisBoutons()}${blocSoir(c)}${blocRecette(c)}
      ${blocRecurrents()}</div>
      <div class="bu-col">${blocCoffre(c)}${blocAvenir(c)}${blocCercle()}${blocPlacements()}${blocSemaine(c)}</div></div>`;
  }
  function vueAccueilDetaille(c) {
    const env = (nom, v, max, cls) => `<div class="bu-env mini"><div class="bu-ligne small"><span>${nom}</span><span>${F(v)} / ${F(max)}</span></div>${jauge(v, max, cls)}</div>`;
    return `<div class="bu-acc"><div class="bu-col">${bascule()}${blocRetour(c)}${blocPaie(c)}
      <section class="bu-phrase large"><span class="small">Aujourd'hui, vous pouvez dépenser</span><b data-count>${F(c.duJour)}</b>
        <span class="small">Reste à vivre du mois : ${F(Math.max(0, c.reste))} · gagné ${F(c.revMois)} · dépensé ${F(c.depMois)}</span>
        ${c.serie ? `<span class="small">🔥 ${c.serie} jour${c.serie > 1 ? "s" : ""} d'affilée</span>` : ""}</section>
      <section class="card"><div class="bu-ligne"><h2 class="bu-h2">Mes enveloppes</h2><a href="#budget" class="small">Mon budget</a></div>
        ${env("Besoins", c.env.besoins, c.revRef * c.part(1), "")}${env("Envies", c.env.envies, c.revRef * c.part(2), "env2")}${env("Épargne et avenir", c.garde, c.epargneCible, "amb")}</section>
      ${troisBoutons()}${blocSoir(c)}${blocRecette(c)}${blocRecurrents()}</div>
      <div class="bu-col">${blocCoffre(c)}${blocAvenir(c)}${blocCercle()}${blocSemaine(c)}
      <h2 class="bu-h2 bu-titre-bourse">Je fais grandir</h2>${blocPlacements()}<div class="bu-place-bourse"></div></div></div>`;
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
    const pr = c.projets.slice(0, 2), autres = c.projets.length - pr.length;
    let avant = Math.max(0, c.securiteObj - c.securite);
    return `<section class="card bu-projet"><span class="bu-tuile amb">${ic(P.coffre)}</span>
      <div class="bu-projet-c"><div class="bu-ligne"><span><b>Mon coffre</b><small class="bu-sous">${F(c.solde)} gardés</small></span><a href="#portefeuille" data-bu="coffre" class="small">Voir</a></div>
        <div class="bu-ligne small"><span>${ic(P.securite)} Sécurité</span><span>${F(c.securite)} / ${F(c.securiteObj)}</span></div>${jauge(c.securite, c.securiteObj)}
        ${pr.map((x) => { const r = (+x.montant || 0) - x.garde, q = x.montant ? quand(avant + r, c.epargneCible) : ""; avant += Math.max(0, r);
          return `<div class="bu-ligne small"><span>${ic(P[x.icone] || P.coffre)} ${esc(x.nom)}</span><span>${F(x.garde)}${x.montant ? " / " + F(x.montant) : ""}</span></div>
          ${x.montant ? jauge(x.garde, x.montant, "amb") : ""}${q ? `<p class="small muted">${q}</p>` : ""}`; }).join("")}
        ${autres > 0 ? `<p class="small muted">+ ${autres} autre${autres > 1 ? "s" : ""} projet${autres > 1 ? "s" : ""}</p>` : ""}
        ${!c.projets.length ? `<p class="small"><a href="#portefeuille" data-bu="coffre">Ajouter un projet</a></p>` : ""}</div></section>`;
  }
  // Mon avenir (accueil) : l'âge de liberté estimé, ou l'invitation à le calculer
  function blocAvenir(c) {
    const a = avenir(c);
    return `<a class="card bu-pl bu-av" href="#avenir"><span class="bu-tuile amb petit">${ic(P.sablier)}</span>
      <span class="bu-op-l"><b>Mon avenir</b><small>${a && a.agePlace ? `Âge de liberté estimé : ${a.agePlace} ans` : "Calculer mon âge de liberté"}</small></span><span aria-hidden="true">›</span></a>`;
  }
  function blocCercle() {
    const l = S.cercles || [], c = l[0];
    const creer = `<div class="bu-cer-b"><button type="button" class="btn small" data-bu="cercle-projet">${ic(P.ecole)} Un cercle pour mon projet</button>
      <button type="button" class="btn small" data-bu="cercle-deux">${ic(P.deux)} Épargner à deux</button></div>`;
    if (!c) return `<section class="card bu-cercle"><span class="bu-tuile clair">${ic(P.cercle)}</span>
      <div style="flex:1;min-width:0"><b>Garder à plusieurs</b><p class="small muted">Avec la famille ou des amis, on tient plus facilement.</p>${creer}</div></section>`;
    const m = c.membres || [], jour = (x) => x.maj_le && String(x.maj_le).slice(0, 10) === auj();
    const aujN = m.filter(jour).length, ten = m.reduce((a, x) => a + (+x.tenues || 0), 0), att = m.reduce((a, x) => a + (+x.attendues || 0), 0);
    const bravos = (c.bravos || []).filter(Boolean);
    return `<section class="card bu-cercle"><span class="bu-tuile">${ic(P.cercle, "#fff")}</span>
      <div style="flex:1;min-width:0"><div class="bu-ligne"><b>${esc(c.nom)}</b><a href="#portefeuille" data-bu="cercles" class="small">Ouvrir</a></div>
        <p class="small">${aujN} sur ${m.length} ont gardé aujourd'hui</p>
        <div class="bu-pastilles">${m.slice(0, 8).map((x) => `<span class="${jour(x) ? "ok" : ""}" title="${esc(x.pseudo || "")}${jour(x) ? " : a gardé aujourd'hui" : ""}">${esc(String(x.pseudo || "?").slice(0, 1).toUpperCase())}</span>`).join("")}</div>
        ${att ? `<p class="small muted">Ce mois-ci, le cercle a tenu ${ten} jours sur ${att}${ten / att >= 0.7 ? " : bravo à tous !" : "."}</p>` : ""}
        ${bravos.length ? `<p class="small bu-bravo">👏 ${esc(bravos.slice(0, 3).join(", "))}${bravos.length > 3 ? " et d'autres" : ""} ${bravos.length > 1 ? "vous encouragent" : "vous encourage"} aujourd'hui</p>` : ""}
        ${c.jai_encourage ? `<p class="small muted">✓ Vous avez encouragé le cercle aujourd'hui.</p>`
          : `<button type="button" class="btn small bu-encourager" data-bu="encourager" data-v="${esc(c.id)}">👏 J'encourage mon cercle</button>`}
        ${creer}</div></section>`;
  }
  function blocPlacements() {
    const pl = app().placements?.();
    if (!pl) return "";
    return `<a class="card bu-pl" href="#portefeuille" data-bu="placements"><span class="bu-tuile clair petit">${ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>')}</span>
      <span class="bu-op-l"><b>Mes placements</b><small>${F(pl.valeur)}${pl.varJour != null && Math.abs(pl.varJour) < 0.0005 ? " · stable aujourd'hui" : ""}${pl.varJour != null && Math.abs(pl.varJour) >= 0.0005 ? ` · <span class="${pl.varJour >= 0 ? "good" : "bad"}">${pl.varJour >= 0 ? "+" : ""}${(pl.varJour * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % aujourd'hui</span>` : ""}</small></span><span aria-hidden="true">›</span></a>`;
  }
  // Une journée sans dépense notable compte pour la série : une ligne discrète sous les trois boutons, pas une carte de plus
  function blocSoir(c) {
    return c.notéAujourdhui ? `<p class="small muted bu-ok">✓ Votre journée est notée.</p>`
      : `<button type="button" class="bu-rien-l" data-bu="rien">Rien à noter aujourd'hui ? <b>Touchez ici</b> pour garder votre série</button>`;
  }

  // Mon budget prévu : chaque ligne avec son pictogramme (les mêmes qu'à la saisie) ; prévu et dépensé côte à côte.
  // 4 lignes principales d'abord ; « Ajouter une ligne » propose les autres catégories (on n'ajoute que ce qui sert).
  function blocPrevu(c) {
    const dep = c.pv.depenses, rev = c.pv.revenus, edit = S.prevuEdit || !Object.keys(dep).length;
    const lignes = [...new Set([...PRINCIPALES, ...Object.keys(dep), ...(S.prevuAjout || [])])];
    const totP = Object.values(dep).reduce((a, x) => a + (+x || 0), 0), totR = Object.values(rev).reduce((a, x) => a + (+x || 0), 0);
    if (!edit) return `<section class="card bu-prevu"><div class="bu-ligne"><h2 class="bu-h2">Mon budget prévu</h2>
        <button type="button" class="btn small bu-modif" data-bu="prevu-edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg> Modifier mon budget</button></div>
      <p class="small">Je gagne <b>${F(totR || c.revRef)}</b> par mois${c.jour ? " (recettes de chaque jour)" : c.p.jour_paie ? `, payé le ${c.p.jour_paie}` : ""} et je prévois de dépenser <b>${F(totP)}</b>.</p>
      ${c.jour && c.basePrudente ? `<p class="small muted">Revenu de base prudent : <b>${F(c.basePrudente)}</b> par mois (vos mois les plus faibles). Votre budget s'appuie sur lui.</p>` : ""}
      <ul class="bu-pv-l">${Object.entries(dep).filter(([, x]) => +x > 0).map(([k, x]) => { const d = c.depParCat[k] || 0, trop = d > x;
        return `<li><span class="bu-tuile clair petit">${ic(P[k] || P.autres)}</span><span class="bu-op-l"><span class="bu-ligne"><b>${esc(catDep(k)[1])}</b><span class="small${trop ? " bad" : ""}">${F(d)} / ${F(x)}</span></span>${jauge(d, x, trop ? "trop" : "")}</span></li>`; }).join("")}</ul>
      <p class="small muted">Ce mois-ci : dépensé / prévu, ligne par ligne, avec les mêmes images qu'à la saisie.</p></section>`;
    const champ = (k, lib, val, type) => `<label class="bu-pv-c"><span class="bu-tuile clair">${ic(P[k] || P.autres)}</span><span class="bu-pv-n">${esc(lib)}</span>
      <input inputmode="numeric" data-prevu="${type}:${k}" value="${val ? nf.format(val) : ""}" placeholder="0" aria-label="${esc(lib)} par mois"></label>`;
    const autres = DEP.filter(([k]) => !lignes.includes(k));
    const ry = S.prevuRythme || (c.jour ? "jour" : "mois");
    const sources = [ry === "jour" ? ["recette", "Recettes"] : ["salaire", "Salaire"], ["transfert", "Argent reçu"], ["autre_rev", "Autres revenus"]];
    const base = (k) => rev[k] || (k === "salaire" || k === "recette" ? (c.jour ? (+c.p.revenu || 0) * 26 : +c.p.revenu || 0) : 0);
    return `<section class="card bu-prevu"><h2 class="bu-h2">Mon budget prévu <small class="muted">par mois, à peu près</small></h2>
      <p class="small muted">Ce que je gagne</p>
      <div class="bu-freq bu-freq2" role="radiogroup" aria-label="Je gagne">
        <button type="button" role="radio" aria-checked="${ry === "mois"}" data-bu="prevu-ry" data-v="mois">Chaque mois (salaire)</button>
        <button type="button" role="radio" aria-checked="${ry === "jour"}" data-bu="prevu-ry" data-v="jour">Chaque jour (recettes)</button></div>
      ${ry === "mois" ? `<label class="bu-champ bu-paie">Jour de paie <small class="muted">(facultatif)</small><input id="bu-r-paie" inputmode="numeric" placeholder="ex. 28" value="${c.p.jour_paie || ""}"></label>` : ""}
      <div class="bu-pv-g">${sources.map(([k, l]) => champ(k, l, base(k), "rev")).join("")}</div>
      <p class="small muted">Ce que je dépense</p>
      <div class="bu-pv-g">${lignes.map((k) => champ(k, catDep(k)[1], dep[k], "dep")).join("")}</div>
      ${autres.length ? `<details class="bu-pv-plus"><summary class="btn small">＋ Ajouter une ligne</summary><div class="bu-grille">${autres.map(([k, l]) =>
        `<button type="button" class="bu-cat" data-bu="prevu-ajout" data-v="${k}"><span class="bu-tuile clair">${ic(P[k] || P.autres)}</span>${l}</button>`).join("")}</div></details>` : ""}
      <div class="bu-pv-b">${Object.keys(dep).length ? `<button type="button" class="btn" data-bu="prevu-annuler">Annuler</button>` : ""}
        <button type="button" class="btn primary" data-bu="prevu-ok">Enregistrer mon budget</button></div>
      <p class="small"><a href="#profil">Régler l'heure de mon rappel</a></p>
      <p class="small muted">Les dépenses « besoins » (logement, nourriture, transport, famille, santé, école…) servent aussi à calculer votre sécurité.</p></section>`;
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
      const max = cle === "epargne" ? c.epargneCible : c.revRef * c.part(i), v = cle === "epargne" ? c.garde : c.env[cle];
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
      ${blocPrevu(c)}
`;
  }

  // « Mon budget » (détail du mois), dans les deux modes
  function render(v) {
    S.vue = v;
    const t = (h) => `<h1 id="h-bud">${h}</h1>`;
    if (!app()?.budget) { v.innerHTML = t("Mon budget"); return; }
    if (!S.charge) { v.innerHTML = t("Mon budget") + `<p class="muted">Chargement…</p>`; charger(); return; }
    if (S.erreur === "installer") { v.innerHTML = t("Mon budget") + `<div class="notice">Le budget arrive bientôt sur votre compte.</div>`; return; }
    if (!S.profil) { v.innerHTML = t("Mon budget") + `<div class="bu-demarrage">${demarrage()}</div>`; brancherDemarrage(v); return; }
    v.innerHTML = t("Mon budget") + bascule() + vueBudget(calculs(), S.profil.mode !== "complet");
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
  // Page Mon coffre : une seule ligne qui dit où va l'argent gardé ; le détail est dans Mes objectifs
  function coffreHtml() {
    if (!S.charge) { charger(); return ""; }
    if (!S.profil) return "";
    const c = calculs(), pr = c.projets.reduce((x, y) => x + y.garde, 0);
    return `<a class="card bu-ouva" href="#objectifs"><span class="bu-tuile petit">${ic(P.securite, "#fff")}</span>
      <span class="bu-op-l"><b>Où va cet argent</b><small>Sécurité ${F(c.securite)} · projets ${F(pr)} · bourse ${F(c.bourse)}</small></span><span class="small">Mes objectifs ›</span></a>`;
  }
  function renderObjectifs(v) {
    S.vue = v;
    S.decal = 0;
    if (!S.charge) { v.innerHTML = `<h1 id="h-obj">Mes objectifs</h1><p class="muted">Chargement…</p>`; charger(); return; }
    if (!S.profil) { v.innerHTML = `<h1 id="h-obj">Mes objectifs</h1><div class="notice">Commencez par votre budget : vos objectifs se calculent à partir de lui.
      <p><a class="btn primary" href="#budget">Commencer mon budget</a></p></div>`; return; }
    const c = calculs(), plein = c.securite >= c.securiteObj && c.securiteObj > 0, cible = c.epargneCible, pl0 = app().placements?.();
    const moisRestants = cible > 0 ? Math.ceil(Math.max(0, c.securiteObj - c.securite) / cible) : null;
    let avant = Math.max(0, c.securiteObj - c.securite);
    const etage = (n, titre, tuile, etat, corps) => `<section class="card bu-etage${etat === "en cours" ? " actif" : ""}"><div class="bu-ligne"><span class="bu-etage-t">${tuile}<b>${n} · ${titre}</b></span><span class="chip">${etat}</span></div>${corps}</section>`;
    v.innerHTML = `<h1 id="h-obj">Mes objectifs</h1>
      <section class="bu-phrase"><span class="small">Mon plan, un seul pour tout</span>
        <b style="font-size:1.6rem">${cible > 0 ? `${F(cible)} par mois` : "À fixer"}</b>
        <span class="small">${c.plan ? `soit ${F(c.plan.montant)} ${({ quotidien: "par jour", hebdo: "par semaine", mensuel: "par mois" })[c.plan.rythme] || ""}` : "d'après votre budget"} · réparti tout seul, dans l'ordre : 1. sécurité, 2. projets, 3. poche bourse</span>
        <button type="button" class="btn small bu-plan-b" data-coffre="plan">${c.plan ? "Modifier mon plan" : "Fixer mon plan"}</button></section>
      ${etage(1, "Sécurité", `<span class="bu-tuile">${ic(P.securite, "#fff")}</span>`, plein ? "pleine ✓" : "en cours",
        `<div class="bu-ligne small"><span>${F(c.securite)}</span><b>${F(c.securiteObj)}</b></div>${jauge(c.securite, c.securiteObj)}
         <p class="small muted">${c.fixes ? "D'après vos dépenses fixes" : `${c.jour ? 6 : 3} mois de besoins`}${!plein && moisRestants ? ` · pleine dans environ ${moisRestants} mois` : ""}</p>`)}
      ${etage(2, "Mes projets", `<span class="bu-tuile amb">${ic(P.coffre)}</span>`, plein ? "en cours" : "ensuite",
        `${c.projets.length ? `<ul class="bu-ops">${c.projets.map((x) => { const r = (+x.montant || 0) - x.garde, q = x.montant ? quand(avant + r, cible) : ""; avant += Math.max(0, r);
          return `<li class="bu-proj"><span class="bu-tuile clair petit">${ic(P[x.icone] || P.coffre)}</span><div class="bu-op-l">
            <div class="bu-ligne"><b>${esc(x.nom)}</b><span class="small">${F(x.garde)}${x.montant ? " / " + F(x.montant) : ""}</span></div>
            ${x.montant ? jauge(x.garde, x.montant, "amb") : ""}<small>${q}</small></div>
            ${x.id !== "profil" ? `<button type="button" class="bu-suppr" data-bu="suppr-projet" data-v="${x.id}" aria-label="Retirer le projet ${esc(x.nom)}">×</button>` : ""}</li>`; }).join("")}</ul>`
          : `<p class="small muted">Aucun projet pour l'instant.</p>`}
        ${(S.projets || []).some((x) => x.realise_le) ? `<p class="small good">✓ Réalisé : ${esc((S.projets || []).filter((x) => x.realise_le).map((x) => x.nom).join(", "))}</p>` : ""}
        ${S.projetsOk !== false ? `<button type="button" class="btn" data-bu="ajout-projet">Ajouter un projet</button>` : ""}`)}
      ${etage(3, "Ma poche bourse", `<span class="bu-tuile">${ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>', "#fff")}</span>`, c.bourse > 0 ? "à placer" : plein ? "prête" : "bientôt",
        `<div class="bu-ligne small"><span>Gardé pour la bourse, pas encore envoyé</span><b>${F(c.bourse)}</b></div>
         <div class="bu-ligne small"><span>Déjà envoyé à ma SGI</span><b>${F(c.envoyeSgi)}</b></div>
         ${pl0?.valeur ? `<div class="bu-ligne small"><span>Placé aujourd'hui (valeur)</span><b>${F(pl0.valeur)}</b></div>` : ""}
         <p class="small muted">${c.bourse > 0 ? "Cet argent attend dans votre coffre : envoyez-le à votre SGI depuis Mon coffre, quand vous le décidez."
           : plein ? "Ce que vous gardez en plus de vos projets viendra ici, prêt à être placé." : "Elle se remplit quand la sécurité et vos projets sont couverts."}</p>
         <p class="small"><a href="#avenir">Voir mon avenir</a></p>`)}
      <a class="card bu-ouva" href="#portefeuille" data-bu="coffre"><span class="bu-tuile amb petit">${ic(P.coffre)}</span>
        <span class="bu-op-l"><b>Mon coffre</b><small>${F(c.solde)} gardés · pour garder, reprendre ou envoyer à ma SGI</small></span><span aria-hidden="true">›</span></a>`;
  }
  // ajouter un projet (pictogramme, nom, montant, date)
  let dlgP = null, projIcone = "ecole";
  function ajouterProjet() {
    if (!dlgP) {
      document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-projet" class="bu-dlg" aria-labelledby="dp-t"><form method="dialog" class="bu-form" novalidate>
        <h2 id="dp-t" class="bu-q">Nouveau projet</h2><div class="bu-grille" id="dp-ic"></div>
        <label class="bu-champ">Son nom<input id="dp-n" maxlength="60" placeholder="ex. Tabaski 2027"></label>
        <div class="bu-2col"><label class="bu-champ">Combien ?<input id="dp-m" inputmode="numeric" placeholder="ex. 150 000"></label>
          <label class="bu-champ">Pour quand ?<input id="dp-d" type="month"></label></div>
        <button type="submit" class="btn primary bu-ok-b">Ajouter</button><button type="button" class="btn link small bu-annuler">Annuler</button></form></dialog>`);
      dlgP = $("#dlg-projet");
      dlgP.querySelector(".bu-annuler").addEventListener("click", () => dlgP.close());
      dlgP.addEventListener("click", (ev) => { const b = ev.target.closest("[data-pi]"); if (b) { projIcone = b.dataset.pi; peindreP(); } });
      dlgP.querySelector("form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const nom = $("#dp-n", dlgP).value.trim() || (OBJ.find((o) => o[0] === projIcone) || ["", "Mon projet"])[1];
        const d = $("#dp-d", dlgP).value;
        try {
          const x = await app().budget.ajouterProjet({ nom, icone: projIcone, montant: lireNombre($("#dp-m", dlgP).value) || null, date_cible: d ? d + "-01" : null, ordre: (S.projets || []).length });
          S.projets = [...(S.projets || []), x]; dlgP.close(); app().toast(`Projet « ${nom} » ajouté.`); rendre();
        } catch (e) { app().toast("Impossible : " + (e.message || e)); }
      });
    }
    $("#dp-n", dlgP).value = ""; $("#dp-m", dlgP).value = ""; $("#dp-d", dlgP).value = "";
    peindreP(); dlgP.showModal();
  }
  function peindreP() {
    $("#dp-ic", dlgP).innerHTML = OBJ.map(([k, l]) => `<button type="button" class="bu-cat" data-pi="${k}" aria-pressed="${projIcone === k}"><span class="bu-tuile ${projIcone === k ? "" : "clair"}">${ic(P[k], projIcone === k ? "#fff" : "currentColor")}</span>${l}</button>`).join("");
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
      <h2 id="bu-dlg-t" class="bu-dlg-t"><span class="bu-tuile petit" aria-hidden="true"></span><span class="bu-dlg-tt">J'ai dépensé</span></h2>
      <label class="bu-montant"><span class="sr-only">Montant</span><input id="bu-m" inputmode="numeric" autocomplete="off" placeholder="0"><span>F</span></label>
      <div class="bu-habitude" id="bu-hab"></div>
      <div class="bu-puces" id="bu-mp"></div>
      <div class="bu-grille" id="bu-cats"></div>
      <div class="bu-plus-opt" id="bu-opt"></div>
      <p class="bu-voix-r small muted" aria-live="polite"></p>
      <div class="bu-actions"><button type="button" class="bu-micro" aria-label="Dicter (ex. : j'ai payé 2 500 de taxi)">${ic(P.micro)}</button>
        <button type="button" class="btn bu-annuler" value="annuler">Annuler</button>
        <button type="submit" class="btn primary bu-ok-b" value="ok">Enregistrer</button></div></form></dialog>`);
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
    const rev = saisie.type === "revenu", t = $(".bu-dlg-t", dlg);
    $(".bu-dlg-tt", t).textContent = rev ? "J'ai gagné" : "J'ai dépensé";
    const tu = $(".bu-tuile", t); tu.className = `bu-tuile petit${rev ? "" : " clair"}`; tu.innerHTML = ic(rev ? P.plus : P.moins, rev ? "#fff" : "currentColor");
    const prevus = Object.keys(prevu(S.profil).depenses);
    const cats = saisie.type === "revenu" ? REV.map(([k, l]) => [k, l])
      : [...DEP.filter((c) => prevus.includes(c[0])), ...DEP.filter((c) => !prevus.includes(c[0]) && (complet || c[3]))].map(([k, l]) => [k, l]);
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

  // lit les champs du simulateur (s'ils sont à l'écran)
  function lireAvenir() {
    const n = (id) => { const e = document.getElementById(id); return e ? lireNombre(e.value) : undefined; };
    const age = n("av-age"); if (age !== undefined) S.avenirAge = Math.min(90, age) || S.avenirAge;
    const pm = n("av-pm"), pat = n("av-pat"), dep = n("av-dep");
    if (pm !== undefined) { S.avenirPmBrut = pm; S.avenirPm = parMoisDe(pm, S.avenirPmF); }
    if (dep !== undefined) { S.avenirDepBrut = dep; S.avenirDep = Math.max(1, parMoisDe(dep, S.avenirDepF)); }
    if (pat !== undefined) S.avenirPat = pat;
  }
  // ------------------------------------------------------------------ actions
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-bu]");
    if (!b || !b.closest("#v-budget, #v-aujourdhui, #v-objectifs, #v-avenir, #v-portefeuille")) return;
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
    else if (a === "ajout-projet") ajouterProjet();
    else if (a === "suppr-projet") { try { await app().budget.supprimerProjet(+v); S.projets = (S.projets || []).filter((x) => String(x.id) !== String(v)); app().toast("Projet retiré."); rendre(); } catch (e) { app().toast("Impossible : " + (e.message || e)); } }
    else if (a === "encourager") { b.disabled = true; try { await app().encouragerCercle(v); const c = (S.cercles || []).find((x) => String(x.id) === String(v)); if (c) c.jai_encourage = true; app().toast("👏 Votre cercle est encouragé."); rendre(); } catch (e) { b.disabled = false; app().toast("Impossible : " + (e.message || e)); } }
    else if (a === "cercle-projet" || a === "cercle-deux") {
      const pr = calculs().projets[0], nom = a === "cercle-deux" ? `${app().profil?.()?.prenom || "Nous"} à deux` : `${pr?.nom || "Notre projet"} ensemble`;
      try { await app().creerCercle(nom.slice(0, 40), 15); S.cerclesCharges = false; app().toast(`Cercle « ${nom} » créé.`, { detail: "Partagez son code depuis Mes cercles pour inviter vos proches." }); app().allerPf?.("cercles"); }
      catch (e) { app().toast("Impossible : " + (e.message || e)); }
    }
    else if (a === "av-pmf" || a === "av-depf") { if (a === "av-pmf") S.avenirPmF = v; else S.avenirDepF = v; S.avenirPmBrut = lireNombre($("#av-pm")?.value); S.avenirDepBrut = lireNombre($("#av-dep")?.value); rendre(); }
    else if (a === "hab-r" || a === "hab-n") { if (a === "hab-r") S.habR = v; else S.habN = +v; S.habM = lireNombre($("#av-hab")?.value) || S.habM; lireAvenir(); rendre(); }
    else if (a === "hyp") { S.avenirHyp = v; lireAvenir(); rendre(); }
    else if (a === "avenir-calc") {
      lireAvenir();
      if (!S.avenirAge) { $("#av-age")?.focus(); app().toast("Indiquez votre âge."); return; }
      await sauver({ age: S.avenirAge });
    }
    else if (a === "simuler") { ev.preventDefault(); app().allerPf?.("simulateur"); }
    else if (a === "prevu-edit") { S.prevuEdit = true; rendre(); document.querySelector(".bu-prevu")?.scrollIntoView({ block: "start", behavior: "smooth" }); }
    else if (a === "prevu-ry") {
      const garde = {}; document.querySelectorAll("[data-prevu]").forEach((i) => (garde[i.dataset.prevu] = i.value));
      S.prevuRythme = v; rendre();
      document.querySelectorAll("[data-prevu]").forEach((i) => { if (garde[i.dataset.prevu] !== undefined) i.value = garde[i.dataset.prevu]; });
      const r1 = garde["rev:salaire"] ?? garde["rev:recette"]; const c1 = document.querySelector(v === "jour" ? '[data-prevu="rev:recette"]' : '[data-prevu="rev:salaire"]'); if (c1 && r1) c1.value = r1;
    }
    else if (a === "voir-budget") { ev.preventDefault(); if (location.hash === "#budget") window.scrollTo({ top: 0, behavior: "smooth" }); else location.hash = "budget"; }
    else if (a === "prevu-annuler") { S.prevuEdit = false; S.prevuAjout = []; rendre(); }
    else if (a === "prevu-ajout") {
      const garde = {}; document.querySelectorAll("[data-prevu]").forEach((i) => (garde[i.dataset.prevu] = i.value));
      S.prevuAjout = [...(S.prevuAjout || []), v]; S.prevuEdit = true; rendre();
      document.querySelectorAll("[data-prevu]").forEach((i) => { if (garde[i.dataset.prevu] !== undefined) i.value = garde[i.dataset.prevu]; });
      document.querySelector(`[data-prevu="dep:${v}"]`)?.focus();
    }
    else if (a === "prevu-ok") {
      const dep = {}, rev = {};
      document.querySelectorAll("[data-prevu]").forEach((i) => { const [t, k] = i.dataset.prevu.split(":"), n = lireNombre(i.value); if (n) (t === "dep" ? dep : rev)[k] = n; });
      const ry = S.prevuRythme || (S.profil.rythme === "jour" ? "jour" : "mois"), totRev = Object.values(rev).reduce((x, y) => x + y, 0);
      const maj = { charges: Object.keys(dep).length || Object.keys(rev).length ? { depenses: dep, revenus: rev } : null, rythme: ry };
      if (totRev) maj.revenu = ry === "jour" ? Math.round(totRev / 26) : totRev;           // revenu du profil = total prévu (par jour si recettes)
      if (ry === "mois") maj.jour_paie = Math.min(31, lireNombre($("#bu-r-paie")?.value)) || null;
      S.prevuEdit = false; S.prevuAjout = []; S.prevuRythme = null;
      await sauver(maj);
      app().toast("Budget prévu enregistré.", { detail: "Vous verrez chaque mois le dépensé face au prévu." });
    }

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
    else if (a === "mode") { if ((S.profil?.mode || "simple") !== v) { await sauver({ mode: v }); app().toast(v === "complet" ? "Affichage détaillé : enveloppes et bourse." : "Affichage simple : l'essentiel."); } }
    else if (a === "reglages") {
      await sauver({ revenu: lireNombre($("#bu-r-rev").value), rythme: $("#bu-r-ry").value, objectif_nom: $("#bu-r-obj").value.trim() || null,
                     jour_paie: Math.min(31, lireNombre($("#bu-r-paie")?.value)) || null,
                     objectif_montant: lireNombre($("#bu-r-objm").value) || null });
      app().toast("Réglages enregistrés.");
    }
  });
  let gl = null;
  document.addEventListener("pointerdown", (ev) => { const b = ev.target.closest(".bu-bascule"); if (b) gl = { x: ev.clientX, b }; });
  document.addEventListener("pointerup", (ev) => {
    if (!gl) return; const dx = ev.clientX - gl.x, det = S.profil?.mode === "complet"; gl = null;
    if (Math.abs(dx) > 24 && (dx > 0) !== det) { ev.preventDefault(); sauver({ mode: dx > 0 ? "complet" : "simple" }); }
  });
  document.addEventListener("change", async (ev) => { if (ev.target.matches?.("[data-bu='profil']")) { await sauver({ profil: ev.target.value }); } });
  async function sauver(x) {
    try { await app().budget.sauverProfil({ ...S.profil, ...x }); S.profil = { ...S.profil, ...x }; rendre(); window.dispatchEvent(new Event("brvm:budget")); }
    catch (e) { app().toast("Enregistrement impossible : " + (e.message || e)); }
  }

  const accueilDetaille = () => S.charge && !S.erreur && S.profil?.mode === "complet";
  function enrichirDetaille(v) {
    const h1 = v.querySelector("h1");
    const bourse = document.createElement("details");
    bourse.className = "card bu-bourse";
    bourse.innerHTML = `<summary><span class="bu-tuile clair petit">${ic('<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>')}</span><b>Ma bourse aujourd'hui</b><small>alertes, récap du soir, marché</small></summary>`;
    [...v.children].filter((n) => n !== h1).forEach((n) => bourse.appendChild(n));
    const haut = document.createElement("div");
    haut.className = "bu-acc-det";
    haut.innerHTML = vueAccueilDetaille(calculs());
    v.appendChild(haut);
    const place = haut.querySelector(".bu-place-bourse");
    if (bourse.children.length > 1) { if (place) place.replaceWith(bourse); else haut.appendChild(bourse); } else place?.remove();
    if (!S.cerclesCharges) { S.cerclesCharges = true; app().cercles?.().then((l) => { S.cercles = l || []; if (location.hash.slice(1) === "aujourdhui" || !location.hash) rendre(); }).catch(() => {}); }
  }
  // invitation sur l'ancien accueil (personnes déjà installées, sans budget) : un seul geste pour commencer
  const invitation = () => (S.charge && !S.erreur && !S.profil && !S.invitationFermee ? `<section class="card bu-invit"><span class="bu-tuile amb">${ic('<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M20 11h-4a2 2 0 0 0 0 4h4"/>')}</span>
      <div><b>Nouveau : mon budget</b><p class="small">Notez ce que vous gagnez et dépensez : BafiBourse vous dit ce que vous pouvez garder.</p>
        <a class="btn primary small" href="#budget">Commencer (1 minute)</a> <button type="button" class="btn link small" data-bu="fermer-invit">Plus tard</button></div></section>` : "");
  // Données du budget transmises à BafiBot (montants en F CFA ; aucune donnée d'un autre utilisateur)
  function contexte() {
    if (!S.charge || !S.profil) return { budget_configure: false, aide: "Le budget n'est pas encore configuré : menu ☰ > Mon budget, 1 minute." };
    const c = calculs(), r = (x) => Math.round(+x || 0), a = avenir(c);
    return {
      budget_configure: true, affichage: c.p.mode === "complet" ? "détaillé" : "simple",
      revenu: { rythme: c.jour ? "chaque jour (variable)" : "chaque mois (salaire)", montant_declare: r(c.p.revenu), jour_de_paie: c.p.jour_paie || null },
      mois_en_cours: { mois: c.moisLib, gagne: r(c.revMois), depense: r(c.depMois), reste_a_vivre: r(c.reste), peut_depenser_aujourd_hui: r(c.duJour),
        garde_ce_mois: r(c.garde), a_garder_ce_mois: r(c.epargneCible), jours_restants: c.joursRest },
      enveloppes: { profil: (PROFILS[c.p.profil] || PROFILS.equilibre)[0] + " " + c.parts.slice(1).join("/"),
        besoins: { depense: r(c.env.besoins), budget: r(c.revRef * c.part(1)) }, envies: { depense: r(c.env.envies), budget: r(c.revRef * c.part(2)) },
        epargne: { garde: r(c.garde), budget: r(c.epargneCible) } },
      depenses_du_mois_par_categorie: Object.fromEntries(Object.entries(S.mv.filter((m) => m.type === "depense" && m.date >= c.d0 && m.date <= c.d1)
        .reduce((o, m) => { const k = libCat(m); o[k] = (o[k] || 0) + (+m.montant || 0); return o; }, {})).sort((x, y) => y[1] - x[1])),
      dernieres_operations: S.mv.filter((m) => m.type !== "rien").slice(0, 8).map((m) => ({ date: m.date, type: m.type === "revenu" ? "gagné" : "dépensé", categorie: libCat(m), montant: r(m.montant) })),
      budget_prevu_par_mois: { depenses: c.pv.depenses, revenus: c.pv.revenus },
      depenses_de_chaque_mois: c.abonnements.map((m) => ({ categorie: libCat(m), montant: r(m.montant) })),
      coffre: { total_garde: r(c.solde), securite: { garde: r(c.securite), objectif: r(c.securiteObj), pleine: c.securite >= c.securiteObj && c.securiteObj > 0 },
        projets: c.projets.map((x) => ({ nom: x.nom, objectif: r(x.montant), garde: r(x.garde), pour: x.date_cible || null })) },
      serie_jours_notes: c.serie,
      mon_avenir: a ? { age: a.age, age_de_liberte_estime_si_place: a.agePlace, age_si_l_argent_dort: a.ageDort, hypothese: HYP[S.avenirHyp || "equilibre"][0] } : null,
    };
  }
  // projets en cours (pour la reprise d'épargne) ; un projet réalisé quitte les objectifs, il reste dans l'historique
  const projetsEnCours = () => (S.charge && S.profil ? calculs().projets.filter((x) => x.id !== "profil") : []);
  async function realiserProjet(id) {
    try { await app().budget.majProjet(id, { realise_le: auj() }); S.projets = (S.projets || []).map((x) => (String(x.id) === String(id) ? { ...x, realise_le: auj() } : x)); }
    catch (e) { await app().budget.supprimerProjet(id); S.projets = (S.projets || []).filter((x) => String(x.id) !== String(id)); }   // colonne absente : retiré
    rendre();
  }
  window.BafiBudget = { render, contexte, projetsEnCours, realiserProjet, coffreHtml, cercles: () => S.cercles || [], renderAccueil, renderObjectifs, renderAvenir, accueilSimple, accueilDetaille, enrichirDetaille, invitation,
    mode: () => (S.profil ? S.profil.mode : (S.charge && !app()?.nbOps?.() ? "simple" : null)), recharger: () => { S.charge = false; } };
  // À l'ouverture : en mode simple (ou pour un nouvel utilisateur), le budget est l'écran d'accueil
  window.addEventListener("brvm:pret", async () => {
    await charger();
    const h = location.hash.slice(1);
    if (["", "aujourdhui", "budget", "objectifs"].includes(h)) app().render();
    window.dispatchEvent(new Event("brvm:budget"));
  });
})();
