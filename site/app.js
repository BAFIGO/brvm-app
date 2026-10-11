/* BRVM Portefeuille – application web (sans framework, sans étape de compilation).
 * Données : Supabase (règles RLS : chacun ne voit que ses propres profil, journal et propositions).
 * Mode démo : ?demo=1 charge demo.json (données fictives), rien n'est enregistré. */
(() => {
  "use strict";

  const CFG = window.BRVM_CONFIG;
  const DEMO = new URLSearchParams(location.search).has("demo");
  const FEES = CFG.fraisCourtage;
  const MIN_LINE = 50000;                                  // même seuil que l'outil (MIN_LINE_FCFA)
  const TABS = ["aujourdhui", "portefeuille", "marche", "profil"];
  const PROFILS = {
    prudent: { t: "Prudent", d: "Surtout des obligations et des fonds monétaires, peu d'actions. Variations faibles." },
    equilibre: { t: "Équilibré", d: "Un tiers à la moitié en actions, le reste en obligations et fonds. Le choix par défaut." },
    dynamique: { t: "Dynamique", d: "Jusqu'à 70 % en actions et fonds actions. Plus de rendement attendu, plus de variations." },
  };
  const CLASSES = { actions: "Actions", obligations: "Obligations", opcvm_actions: "OPCVM actions", opcvm_taux: "OPCVM taux" };
  const COLORS = { actions: "#2f8a72", obligations: "#c48a1a", opcvm_actions: "#5b73c4", opcvm_taux: "#a86aa6" };
  const BUY = ["ACHAT", "ACHAT FORT", "SOUSCRIRE"];

  // ---------------------------------------------------------------- utilitaires
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ok = (v) => v !== null && v !== undefined && Number.isFinite(+v);
  const F = (v) => (ok(v) ? nf0.format(Math.round(+v)) + " F" : "–");
  const N = (v) => (ok(v) ? nf0.format(+v) : "–");
  const P = (v, sign = true) => (ok(v) ? (sign && +v > 0 ? "+" : "") + nf1.format(+v * 100) + " %" : "–");
  const D = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR") : "–");
  const today = () => new Date().toISOString().slice(0, 10);
  const cls = (v) => (ok(v) ? (+v > 0 ? "good" : +v < 0 ? "bad" : "") : "");
  const chip = (d) => {
    if (!d) return "";
    const k = BUY.includes(d) ? "buy" : /VENDRE|ÉVITER|RACHETER/.test(d) ? "sell" : /ALLÉGER|SURVEILLER/.test(d) ? "warn" : "";
    return `<span class="chip ${k}">${esc(d)}</span>`;
  };
  function spark(c, w = 96, h = 30) {
    const pts = c?.points;
    if (!pts || pts.length < 2) return "";
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 1 - ((v - lo) / span) * (h - 2)).toFixed(1)}`);
    const chg = pts[pts.length - 1] / pts[0] - 1;
    return `<svg class="spark ${chg >= 0 ? "good" : "bad"}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="Cours sur un an (${D(c.debut)} – ${D(c.fin)}) : ${P(chg)}"><polyline points="${xy.join(" ")}"/></svg>`;
  }
  const APPR = { Bon: "buy", Moyen: "warn", Faible: "sell" };
  const appr = (a) => (a ? `<span class="chip ${APPR[a] || ""}">${esc(a)}</span>` : "");
  function analyse(a) {
    if (!a) return `<p class="small muted">Analyse financière indisponible (états financiers non publiés ou illisibles).</p>`;
    const m = (v) => (ok(v) ? nf0.format(Math.round(v)) : "–");
    const pc = (v) => (ok(v) ? nf1.format(v * 100) + " %" : "–");
    let h = `<div class="fin"><div class="fin-head"><span class="grade g-${esc(a.note || "x")}" aria-label="Note financière ${esc(a.note || "non disponible")}">${esc(a.note || "–")}</span>
      <div><b>Analyse financière : ${esc(a.recommandation || "–")}</b><div class="sub">Note ${esc(a.note || "–")}${ok(a.score) ? ` (${N(a.score)}/100)` : ""} · perspective ${esc((a.perspective || "–").toLowerCase())}</div></div></div>`;
    if (a.proposition) h += `<p>${esc(a.proposition)}</p>`;
    if (a.verdict) h += `<p class="small">${esc(a.verdict)}</p>`;
    for (const al of a.alertes || []) h += `<div class="notice small">⚠ ${esc(al)}</div>`;
    if (a.familles?.length) h += `<ul class="fam">${a.familles.map((f) => `<li><span>${esc(f.nom)}</span> ${appr(f.appreciation)}
      <div class="sub">${esc(f.resume || "")}</div></li>`).join("")}</ul>`;
    const yrs = (a.annees || []).filter((y) => ok(y.rev) || ok(y.ni));
    if (yrs.length) h += `<div class="tbl" role="region" aria-label="Chiffres clés" tabindex="0"><table><caption class="small muted">Chiffres clés (millions de F)</caption>
      <thead><tr><th scope="col">Exercice</th><th scope="col">${a.banque ? "PNB" : "Chiffre d'affaires"}</th><th scope="col">Résultat net</th><th scope="col">Marge nette</th></tr></thead>
      <tbody>${yrs.map((y) => `<tr><th scope="row">${esc(y.year)}</th><td>${m(y.rev)}</td><td class="${cls(y.ni)}">${m(y.ni)}</td><td>${pc(y.margin)}</td></tr>`).join("")}</tbody></table></div>`;
    if (a.ratios?.length) h += `<details class="ratios"><summary>Voir les ${a.ratios.length} ratios détaillés</summary><ul class="list">
      ${a.ratios.map((r) => `<li><div class="main"><div>${esc(r.libelle)}</div>${r.aide ? `<div class="sub">${esc(r.aide)}</div>` : ""}</div>
        <div class="right num"><b>${esc(r.valeur ?? "–")}</b>${r.precedent ? `<div class="sub">avant ${esc(r.precedent)}</div>` : ""}${appr(r.appreciation)}</div></li>`).join("")}</ul></details>`;
    return h + `</div>`;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500);
  }

  // ---------------------------------------------------------------- accès aux données
  function supaApi() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    });
    const r = ({ data, error }) => { if (error) throw error; return data; };
    return {
      session: async () => (await sb.auth.getSession()).data.session,
      onAuth: (cb) => sb.auth.onAuthStateChange((_e, s) => cb(s)),
      login: async (email) => r(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })),
      verify: async (email, token) => r(await sb.auth.verifyOtp({ email, token, type: "email" })),
      logout: async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); },
      profil: async (uid) => r(await sb.from("profils").select("*").eq("id", uid).maybeSingle()),
      saveProfil: async (uid, p) => r(await sb.from("profils").update(p).eq("id", uid)),
      seance: async () => r(await sb.from("seances").select("*").order("date", { ascending: false }).limit(1))[0] || null,
      proposition: async (uid) => r(await sb.from("propositions").select("date,contenu").eq("user_id", uid)
        .order("date", { ascending: false }).limit(1))[0] || null,
      operations: async () => r(await sb.from("operations").select("id,date,type,ticker,quantite,prix,frais,montant,note")
        .order("date").order("id")),
      addOperation: async (op) => r(await sb.from("operations").insert(op)),
      deleteOperation: async (id) => r(await sb.from("operations").delete().eq("id", id)),
      table: async (name, date) => r(await sb.from(name).select("*").eq("date", date).limit(2000)),
      cibles: async (date, profil) => r(await sb.from("cibles_profil").select("*").eq("date", date).eq("profil", profil)),
    };
  }

  function demoApi() {
    let data = null, nextId = 10000;
    const load = async () => (data ??= await (await fetch("demo.json")).json());
    const names = { actions_analyse: "actions", obligations_analyse: "obligations", opcvm_analyse: "opcvm" };
    return {
      session: async () => { await load(); return { user: { id: "demo", email: data.profil.email } }; },
      onAuth: () => {},
      login: async () => {}, verify: async () => {},
      logout: async () => { location.href = location.pathname; },
      profil: async () => ({ ...(await load()).profil }),
      saveProfil: async (_u, p) => { Object.assign((await load()).profil, p); },
      seance: async () => (await load()).seance,
      proposition: async () => (await load()).proposition,
      operations: async () => (await load()).operations.slice(),
      addOperation: async (op) => {
        const d = await load();
        d.operations.push({ ...op, id: nextId++ });
        d.operations.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      },
      deleteOperation: async (id) => { const d = await load(); d.operations = d.operations.filter((o) => o.id !== id); },
      table: async (name) => (await load())[names[name]],
      cibles: async (_d, profil) => (await load()).cibles.filter((c) => c.profil === profil),
    };
  }

  const api = DEMO ? demoApi() : supaApi();
  const S = { user: null, profil: null, seance: null, prop: null, ops: [], mk: { actions: [], obligations: [], opcvm: [] },
              cibles: [], prices: new Map(), names: new Map(), classes: new Map(),
              ui: { mkTab: "actions", mkFilter: "opp", mkQuery: "", mkShow: 30 } };

  // ---------------------------------------------------------------- journal → positions (même méthode que l'outil)
  function replay(ops) {
    const pos = new Map();
    let cash = 0, apports = 0;
    const errors = [];
    for (const o of ops) {
      const t = o.ticker || "", q = +o.quantite || 0, p = +o.prix || 0, m = +o.montant || 0;
      const fee = ok(o.frais) ? +o.frais : (o.type === "ACHAT" || o.type === "VENTE" ? q * p * FEES : 0);
      if (o.type === "DEPOT") { cash += m; apports += m; }
      else if (o.type === "RETRAIT") { cash -= m; apports -= m; }
      else if (o.type === "FRAIS") cash -= m;
      else if (o.type === "ACHAT") {
        cash -= q * p + fee;
        const x = pos.get(t) || { q: 0, cost: 0 };
        x.q += q; x.cost += q * p + fee; pos.set(t, x);
      } else if (o.type === "VENTE") {
        const x = pos.get(t);
        if (!x || x.q < q - 1e-9) { errors.push(`Vente de ${N(q)} ${t} le ${D(o.date)} supérieure à la quantité détenue.`); continue; }
        const avg = x.cost / x.q;
        cash += q * p - fee; x.q -= q; x.cost -= q * avg;
        if (x.q < 1e-9) pos.delete(t);
      } else if (o.type === "DIVIDENDE") cash += ok(o.montant) ? m : q * p;
    }
    const positions = [...pos.entries()].map(([code, x]) => {
      const cours = S.prices.get(code);
      const valeur = ok(cours) ? x.q * cours : null;
      return { code, quantite: x.q, pru: x.cost / x.q, cout: x.cost, cours, valeur,
               pv: ok(valeur) ? valeur * (1 - FEES) - x.cost : null, classe: S.classes.get(code) };
    }).sort((a, b) => (b.valeur || 0) - (a.valeur || 0));
    const investi = positions.reduce((s, p) => s + (p.valeur || 0), 0);
    return { positions, cash, apports, errors, valeur: cash + investi };
  }

  // ---------------------------------------------------------------- proposition instantanée (budget × poids cibles)
  function estimate(budget) {
    // Même principe que le calcul du soir : chaque poche garde ses meilleures lignes de façon qu'aucune
    // ne descende sous MIN_LINE, puis nombre entier de titres au prix limite (frais compris).
    const byClass = {};
    for (const c of S.cibles) if (ok(c.prix) && +c.prix > 0) (byClass[c.classe] ||= []).push(c);
    const lines = [];
    let invest = 0, rdt = 0;
    for (const list of Object.values(byClass)) {
      const pocket = list.reduce((s, c) => s + +c.poids, 0) * budget;
      const n = Math.max(1, Math.min(list.length, Math.floor(pocket / MIN_LINE)));
      const keep = [...list].sort((a, b) => b.poids - a.poids).slice(0, n);
      const wsum = keep.reduce((s, c) => s + +c.poids, 0);
      for (const c of keep) {
        const prix = +c.prix, q = Math.floor((pocket * c.poids / wsum) / (prix * (1 + FEES)));
        if (q <= 0) continue;
        const montant = q * prix;
        lines.push({ classe: c.classe, code: c.code, libelle: c.libelle, quantite: q, prix, montant, decision: c.decision });
        invest += montant * (1 + FEES);
        rdt += montant * (+c.rendement_attendu || 0);
      }
    }
    const order = Object.keys(CLASSES);
    lines.sort((a, b) => order.indexOf(a.classe) - order.indexOf(b.classe) || b.montant - a.montant);
    return { lines, invest, reliquat: budget - invest, rdt: invest ? rdt / (invest / (1 + FEES)) : null };
  }

  function classBar(lines) {
    const tot = {};
    let all = 0;
    for (const l of lines) { tot[l.classe] = (tot[l.classe] || 0) + (+l.montant || 0); all += +l.montant || 0; }
    if (!all) return "";
    const keys = Object.keys(CLASSES).filter((k) => tot[k] > 0);
    return `<div class="bar" role="img" aria-label="${esc(keys.map((k) => `${CLASSES[k]} ${Math.round((tot[k] / all) * 100)} %`).join(", "))}">
      ${keys.map((k) => `<span style="width:${(tot[k] / all) * 100}%;background:${COLORS[k]}"></span>`).join("")}</div>
      <div class="legend">${keys.map((k) => `<span><i style="background:${COLORS[k]}"></i>${CLASSES[k]} ${Math.round((tot[k] / all) * 100)} %</span>`).join("")}</div>`;
  }

  // ---------------------------------------------------------------- vues
  function vAujourdhui() {
    const v = $("#v-aujourdhui");
    const L = replay(S.ops);
    const c = S.prop?.contenu;
    const fresh = S.prop && S.seance && S.prop.date === S.seance.date;
    const hasPf = L.positions.length > 0 || L.cash > 0;
    let h = `<h1 id="h-auj">Aujourd'hui</h1>`;
    if (!S.seance) {
      v.innerHTML = h + `<div class="notice info">Les analyses du marché n'ont pas encore été publiées. Revenez après la prochaine séance.</div>`;
      return;
    }
    h += `<p class="muted small">Analyses de la séance du ${D(S.seance.date)}</p>`;
    const alertes = [...L.errors, ...(fresh && c?.alertes ? c.alertes : [])];
    if (L.cash < -1) alertes.unshift("Trésorerie négative : enregistrez vos dépôts d'espèces pour des calculs justes.");
    for (const a of alertes) h += `<div class="notice">${esc(a)}</div>`;

    if (hasPf) {
      const perf = c?.performance || {};
      h += `<div class="card kpis">
        <div class="kpi"><div class="lbl">Valeur du portefeuille</div><div class="val num">${F(L.valeur)}</div></div>
        <div class="kpi"><div class="lbl">Trésorerie</div><div class="val num">${F(L.cash)}</div></div>
        <div class="kpi"><div class="lbl">Performance</div><div class="val num ${cls(perf.twr_total)}">${P(perf.twr_total)}</div>
          <div class="small muted">indice ${P(perf.bench_total)}</div></div></div>`;
      const ordres = fresh ? c?.ordres || [] : [];
      h += `<div class="card"><h2>Ordres proposés</h2>`;
      if (!S.prop) h += `<p class="muted">Votre première proposition sera calculée ce soir, après la séance.</p>`;
      else if (!fresh) h += `<p class="muted">La proposition de ce soir n'est pas encore calculée (dernière : ${D(S.prop.date)}).</p>`;
      else if (!ordres.length) h += `<p>Rien à faire ce soir : votre portefeuille est proche de sa cible.</p>`;
      else {
        h += `<p class="small muted">Pour rejoindre votre portefeuille cible (${esc(PROFILS[c.profil]?.t || c.profil)}). Prix limites indicatifs.</p><ul class="list">`;
        ordres.forEach((o, i) => {
          h += `<li><div class="main"><div class="name">${esc(o.libelle || o.code)}</div>
            <div class="sub">${chip(o.sens)} ${esc(o.code)} · ${esc(o.motif || "")}${ok(o.seances) && o.seances > 1 ? ` · ~${N(o.seances)} séances` : ""}</div></div>
            <div class="right num"><b>${N(o.quantite)}</b><div class="sub">limite ${F(o.prix_limite)}</div>
            <button class="btn small" data-ordre="${i}">J'ai passé l'ordre</button></div></li>`;
        });
        h += `</ul><p class="small muted">Calculés avec votre journal au soir du ${D(S.prop.date)}.</p>`;
      }
      h += `</div>`;
      if (fresh && c?.proposition?.lignes?.length)
        h += `<div class="card"><h2>Votre portefeuille cible</h2>${classBar(c.proposition.lignes)}
          <p class="small muted">Rendement attendu ${P(c.proposition.rendement_attendu, false)} par an, volatilité ${P(c.proposition.volatilite, false)}.</p></div>`;
    } else {
      const budget = +S.profil?.budget || 0;
      const nightly = fresh && c?.proposition && !c.positions?.length && Math.round(c.proposition.base) === Math.round(budget)
        && c.profil === S.profil?.profil ? c.proposition : null;
      const e = nightly ? { lines: nightly.lignes, reliquat: nightly.reliquat, rdt: nightly.rendement_attendu } : estimate(budget);
      h += `<div class="card"><h2>Votre portefeuille proposé</h2>
        <form id="f-budget" class="grid2" novalidate>
          <label>Budget à investir (F)<input name="budget" type="number" min="0" step="10000" inputmode="numeric" value="${budget || ""}"></label>
          <label>Profil<select name="profil">${Object.entries(PROFILS).map(([k, p]) =>
            `<option value="${k}"${S.profil?.profil === k ? " selected" : ""}>${p.t}</option>`).join("")}</select></label>
        </form>`;
      if (!budget) h += `<p class="muted">Indiquez le montant que vous souhaitez investir pour recevoir une proposition.</p>`;
      else if (!e.lines.length) h += `<p class="muted">Budget trop faible pour constituer un portefeuille diversifié.</p>`;
      else {
        h += classBar(e.lines) + `<p class="small muted">Rendement attendu ${P(e.rdt, false)} par an · non investi ${F(e.reliquat)}.
          ${nightly ? "Proposition calculée ce soir." : "Estimation immédiate ; la proposition détaillée est recalculée chaque soir."}</p><ul class="list">`;
        e.lines.forEach((l, i) => {
          h += `<li><div class="main"><div class="name">${esc(l.libelle || l.code)}</div>
            <div class="sub">${esc(CLASSES[l.classe] || l.classe)} · ${esc(l.code)} ${chip(l.decision)}</div></div>
            <div class="right num"><b>× ${N(l.quantite)}</b><div class="sub">${F(l.montant)}</div>
            <button class="btn small" data-ligne="${i}">J'ai acheté</button></div></li>`;
        });
        h += `</ul>`;
        S.lines = e.lines;
      }
      h += `<div class="notice info small">Pour suivre votre portefeuille, enregistrez d'abord votre dépôt chez votre SGI,
        puis vos achats. <button class="btn link" data-op="DEPOT">Enregistrer un dépôt</button></div></div>`;
    }
    h += `<p class="small muted">Outil d'aide à la décision, ce n'est pas un conseil en investissement. Données de marché : BRVM.</p>`;
    v.innerHTML = h;
    const fb = $("#f-budget", v);
    if (fb) {
      const save = async () => {
        const budget = Math.max(0, +fb.budget.value || 0), profil = fb.profil.value;
        try {
          await api.saveProfil(S.user.id, { budget, profil });
          Object.assign(S.profil, { budget, profil });
          S.cibles = await api.cibles(S.seance.date, profil);
          vAujourdhui();
        } catch (err) { toast("Enregistrement impossible : " + err.message); }
      };
      fb.budget.addEventListener("change", save);
      fb.profil.addEventListener("change", save);
      fb.addEventListener("submit", (ev) => { ev.preventDefault(); save(); });
    }
  }

  function vPortefeuille() {
    const v = $("#v-portefeuille");
    const L = replay(S.ops);
    const latent = L.positions.reduce((s, p) => s + (p.pv || 0), 0);
    let h = `<h1 id="h-pf">Portefeuille</h1>
      <div class="card kpis">
        <div class="kpi"><div class="lbl">Valeur</div><div class="val num">${F(L.valeur)}</div></div>
        <div class="kpi"><div class="lbl">Trésorerie</div><div class="val num">${F(L.cash)}</div></div>
        <div class="kpi"><div class="lbl">Apports nets</div><div class="val num">${F(L.apports)}</div></div>
        <div class="kpi"><div class="lbl">Plus-value latente</div><div class="val num ${cls(latent)}">${F(latent)}</div></div>
      </div>
      <div class="actions"><button class="btn primary" data-op="">Nouvelle opération</button></div>`;
    for (const e of L.errors) h += `<div class="notice bad">${esc(e)}</div>`;
    h += `<div class="card"><h2>Positions</h2>`;
    if (!L.positions.length) h += `<p class="muted">Aucune position. Enregistrez vos achats avec « Nouvelle opération ».</p>`;
    else {
      h += `<ul class="list">`;
      for (const p of L.positions) {
        const d = S.decisions?.get(p.code);
        const act = S.actions?.get(p.code);
        h += `<li><div class="main"><div class="name">${esc(S.names.get(p.code) || p.code)}${act?.analyse?.note ? ` <span class="grade sm g-${esc(act.analyse.note)}" title="Note financière">${esc(act.analyse.note)}</span>` : ""}</div>
          <div class="sub">${esc(p.code)} · ${N(p.quantite)} × PRU ${F(p.pru)} ${chip(d)}</div></div>
          <div class="right num">${act ? spark(act.courbe, 72, 24) : ""}<b>${F(p.valeur)}</b><div class="sub ${cls(p.pv)}">${ok(p.pv) ? F(p.pv) + " · " + P(p.pv / p.cout) : "cours inconnu"}</div></div></li>`;
      }
      h += `</ul><p class="small muted">Valorisé au cours de la séance du ${D(S.seance?.date)}, net des frais de vente estimés.</p>`;
    }
    h += `</div><div class="card"><h2>Journal des opérations</h2>`;
    if (!S.ops.length) h += `<p class="muted">Aucune opération enregistrée.</p>`;
    else {
      h += `<ul class="list">`;
      for (const o of [...S.ops].reverse()) {
        const what = ["ACHAT", "VENTE"].includes(o.type) ? `${N(o.quantite)} × ${F(o.prix)}` : F(o.montant);
        h += `<li><div class="main"><div class="name">${esc(o.type.charAt(0) + o.type.slice(1).toLowerCase())} ${esc(o.ticker || "")}</div>
          <div class="sub">${D(o.date)}${o.note ? " · " + esc(o.note) : ""}</div></div>
          <div class="right num">${what}<div><button class="btn link small" data-del="${esc(o.id)}" aria-label="Supprimer l'opération du ${D(o.date)}">Supprimer</button></div></div></li>`;
      }
      h += `</ul><p class="small muted">Une erreur de saisie se corrige en supprimant la ligne, jamais par une opération inverse.</p>`;
    }
    v.innerHTML = h + `</div>`;
  }

  function vMarche() {
    const v = $("#v-marche"), u = S.ui;
    const rows = S.mk[u.mkTab] || [];
    const q = u.mkQuery.trim().toLowerCase();
    const list = rows.filter((r) => (u.mkFilter === "all" || BUY.includes(r.decision))
      && (!q || (r.code + " " + (r.nom || "")).toLowerCase().includes(q))).sort((a, b) => (b.score || 0) - (a.score || 0));
    let h = `<h1 id="h-mk">Marché</h1>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Classe d'actifs">
          ${[["actions", "Actions"], ["obligations", "Obligations"], ["opcvm", "OPCVM"]].map(([k, t]) =>
            `<button type="button" data-mk="${k}" aria-pressed="${u.mkTab === k}">${t}</button>`).join("")}
        </div>
        <input id="mk-q" type="search" placeholder="Rechercher un titre" value="${esc(u.mkQuery)}" aria-label="Rechercher un titre">
        <select id="mk-f" aria-label="Filtre" style="width:auto">
          <option value="opp"${u.mkFilter === "opp" ? " selected" : ""}>Opportunités</option>
          <option value="all"${u.mkFilter === "all" ? " selected" : ""}>Tous</option>
        </select>
      </div>
      <p class="small muted">${list.length} titre${list.length > 1 ? "s" : ""} · séance du ${D(S.seance?.date)} · touchez une ligne pour ${u.mkTab === "actions" ? "l'analyse financière" : "le détail"}</p>
      <div class="card"><ul class="list">`;
    for (const r of list.slice(0, u.mkShow)) {
      let px, det;
      if (u.mkTab === "actions") {
        px = `${spark(r.courbe)}<div>${F(r.cours)} <span class="sub ${cls(r.var_1j)}">${P(r.var_1j)}</span></div>`;
        det = `<p>Achat limite ${F(r.limite_achat)} · stop ${F(r.stop)} · objectif ${F(r.objectif)} · dividende ${P(r.rendement_div, false)}`
          + (ok(r.per) ? ` · PER ${nf1.format(r.per)}` : "") + `</p>` + (r.raisons ? `<p class="small muted">Signal du jour : ${esc(r.raisons)}</p>` : "")
          + analyse(r.analyse);
      } else if (u.mkTab === "obligations") {
        px = `${P(r.rendement_actuariel, false)}<div class="sub">${F(r.prix)}</div>`;
        det = `${esc(r.emetteur || "")} · échéance ${D(r.echeance)} · duration ${ok(r.duration) ? nf1.format(r.duration) + " ans" : "–"} · coupon ${P(r.taux_coupon, false)}`;
      } else {
        px = `${F(r.vl)}<div class="sub">VL du ${D(r.date_vl)}</div>`;
        det = `${esc(r.gestionnaire || "")} · ${esc(CLASSES[r.classe] || r.classe || "")} · volatilité ${P(r.volatilite, false)} · rendement attendu ${P(r.rendement_attendu, false)}`;
      }
      const note = r.analyse?.note ? ` <span class="grade sm g-${esc(r.analyse.note)}" title="Note financière">${esc(r.analyse.note)}</span>` : "";
      if (u.mkTab !== "actions" && r.raisons) det += `<br>${esc(r.raisons)}`;
      h += `<li class="mk"><details class="item"><summary class="row"><div class="main"><div class="name">${esc(r.nom || r.code)}${note}</div>
          <div class="sub">${esc(r.code)} · score ${N(r.score)} ${chip(r.decision)}</div></div>
          <div class="right num">${px}</div></summary>
          <div class="why">${det}</div></details></li>`;
    }
    h += `</ul>${list.length > u.mkShow ? `<div class="actions"><button class="btn" id="mk-more">Afficher plus</button></div>` : ""}</div>
      <p class="small muted">Score de 0 à 100 calculé par l'outil (technique, fondamentaux, dividende, valorisation, liquidité).
      Aide à la décision, pas un conseil en investissement. Données de marché : BRVM.</p>`;
    v.innerHTML = h;
    v.querySelectorAll("[data-mk]").forEach((b) => b.addEventListener("click", () => { u.mkTab = b.dataset.mk; u.mkShow = 30; vMarche(); }));
    const qi = $("#mk-q", v);
    qi.addEventListener("input", () => { u.mkQuery = qi.value; u.mkShow = 30; vMarche(); $("#mk-q").focus(); const n = $("#mk-q"); n.setSelectionRange(n.value.length, n.value.length); });
    $("#mk-f", v).addEventListener("change", (e) => { u.mkFilter = e.target.value; vMarche(); });
    $("#mk-more", v)?.addEventListener("click", () => { u.mkShow += 30; vMarche(); });
  }

  function vProfil() {
    const v = $("#v-profil"), p = S.profil || {};
    v.innerHTML = `<h1 id="h-pr">Profil</h1>
      <form id="f-profil" class="card" novalidate>
        <p class="muted small">Connecté avec <b>${esc(S.user.email || p.email || "")}</b></p>
        <label for="pr-budget">Budget à investir (F)</label>
        <input id="pr-budget" name="budget" type="number" min="0" step="10000" inputmode="numeric" value="${p.budget ?? ""}">
        <fieldset style="border:0;padding:0;margin:12px 0 0"><legend style="font-weight:600;font-size:.9rem">Profil de risque</legend>
          <div class="radios">${Object.entries(PROFILS).map(([k, x]) => `<label><input type="radio" name="profil" value="${k}"${p.profil === k ? " checked" : ""}>
            <span><b>${x.t}</b><br><span class="small muted">${x.d}</span></span></label>`).join("")}</div>
        </fieldset>
        <label class="switch" style="margin-top:14px"><input type="checkbox" name="recevoir_email"${p.recevoir_email ? " checked" : ""}>
          Recevoir ma proposition par e-mail chaque soir de séance</label>
        <div class="actions"><button class="btn primary" type="submit">Enregistrer</button></div>
      </form>
      <div class="card">
        <h2>À propos</h2>
        <p class="small">Chaque soir de séance, l'outil analyse les actions, obligations et OPCVM cotés à la BRVM, puis calcule
          pour vous un portefeuille cible et les ordres pour le rejoindre, à partir de votre budget, de votre profil et de votre journal.</p>
        <p class="small muted">Outil d'aide à la décision : ce n'est pas un conseil en investissement. Les performances passées ne préjugent
          pas des performances futures. Vos données (profil, journal) ne sont visibles que par vous.</p>
        <div class="actions"><button class="btn" id="logout">${DEMO ? "Quitter la démo" : "Se déconnecter"}</button></div>
      </div>`;
    const f = $("#f-profil", v);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const upd = { budget: Math.max(0, +f.budget.value || 0), profil: f.profil.value || "equilibre", recevoir_email: f.recevoir_email.checked };
      try {
        await api.saveProfil(S.user.id, upd);
        const changed = upd.profil !== S.profil.profil;
        Object.assign(S.profil, upd);
        if (changed && S.seance) S.cibles = await api.cibles(S.seance.date, upd.profil);
        toast("Profil enregistré. La proposition sera recalculée ce soir.");
      } catch (err) { toast("Enregistrement impossible : " + err.message); }
    });
    $("#logout", v).addEventListener("click", () => api.logout());
  }

  const VIEWS = { aujourdhui: vAujourdhui, portefeuille: vPortefeuille, marche: vMarche, profil: vProfil };

  // ---------------------------------------------------------------- saisie d'une opération
  const dlg = $("#dlg-op"), fop = $("#f-op");
  function syncOpForm() {
    const t = fop.type.value;
    const titre = ["ACHAT", "VENTE", "DIVIDENDE"].includes(t), montant = !["ACHAT", "VENTE"].includes(t);
    fop.querySelectorAll('[data-for="titre"]').forEach((e) => (e.hidden = !titre));
    fop.querySelectorAll('[data-for="montant"]').forEach((e) => (e.hidden = !montant));
    fop.querySelectorAll('[data-for="titre"] input[name="quantite"], [data-for="titre"] input[name="prix"], [data-for="titre"] input[name="frais"]')
      .forEach((e) => (e.closest("label").hidden = !titre || t === "DIVIDENDE"));
  }
  function openOp(pre = {}) {
    fop.reset();
    fop.date.value = today();
    for (const [k, val] of Object.entries(pre)) if (fop[k] && val !== null && val !== undefined) fop[k].value = val;
    $(".msg", fop).textContent = "";
    $("#dlg-op-title").textContent = pre.type ? "Enregistrer l'opération" : "Nouvelle opération";
    syncOpForm();
    dlg.showModal();
  }
  fop.type.addEventListener("change", syncOpForm);
  fop.addEventListener("submit", async (ev) => {
    if (ev.submitter?.value !== "ok") return;                    // « Annuler » ferme simplement la fenêtre
    ev.preventDefault();
    const t = fop.type.value, num = (n) => (fop[n].value === "" ? null : +fop[n].value);
    const op = { date: fop.date.value, type: t, ticker: (fop.ticker.value || "").trim().toUpperCase() || null,
                 quantite: null, prix: null, frais: null, montant: null, note: fop.note.value.trim() || null };
    const err = (m) => { $(".msg", fop).textContent = m; };
    if (!op.date) return err("Indiquez la date.");
    if (op.date > today()) return err("La date ne peut pas être dans le futur.");
    if (t === "ACHAT" || t === "VENTE") {
      Object.assign(op, { quantite: num("quantite"), prix: num("prix"), frais: num("frais") });
      if (!op.ticker) return err("Indiquez le code du titre.");
      if (!(op.quantite > 0) || !(op.prix > 0)) return err("Indiquez une quantité et un prix positifs.");
      if (t === "VENTE") {
        const held = replay(S.ops).positions.find((p) => p.code === op.ticker)?.quantite || 0;
        if (op.quantite > held + 1e-9) return err(`Vous ne détenez que ${N(held)} ${op.ticker}.`);
      }
    } else {
      op.montant = num("montant");
      if (!(op.montant > 0)) return err("Indiquez un montant positif.");
      if (t === "DIVIDENDE" && !op.ticker) return err("Indiquez le code du titre qui a versé le dividende.");
      if (t !== "DIVIDENDE") op.ticker = null;
    }
    const dup = S.ops.some((o) => o.date === op.date && o.type === op.type && (o.ticker || null) === op.ticker
      && +o.quantite === +op.quantite && +o.prix === +op.prix && +o.montant === +op.montant);
    if (dup && !fop.dataset.dupOk) { fop.dataset.dupOk = "1"; return err("Une opération identique existe déjà ce jour-là. Enregistrer quand même ?"); }
    delete fop.dataset.dupOk;
    try {
      await api.addOperation(op);
      S.ops = await api.operations(S.user.id);
      dlg.close();
      toast("Opération enregistrée.");
      render();
    } catch (e) { err("Enregistrement impossible : " + e.message); }
  });

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.op !== undefined) openOp(b.dataset.op ? { type: b.dataset.op } : {});
    else if (b.dataset.ordre !== undefined) {
      const o = S.prop.contenu.ordres[+b.dataset.ordre];
      openOp({ type: o.sens, ticker: o.code, quantite: String(o.quantite), prix: String(o.prix_limite) });
    } else if (b.dataset.ligne !== undefined) {
      const l = S.lines[+b.dataset.ligne];
      openOp({ type: "ACHAT", ticker: l.code, quantite: String(l.quantite), prix: String(l.prix) });
    } else if (b.dataset.del !== undefined) {
      if (!confirm("Supprimer définitivement cette opération du journal ?")) return;
      try {
        await api.deleteOperation(isNaN(+b.dataset.del) ? b.dataset.del : +b.dataset.del);
        S.ops = await api.operations(S.user.id);
        toast("Opération supprimée.");
        render();
      } catch (e) { toast("Suppression impossible : " + e.message); }
    }
  });

  // ---------------------------------------------------------------- navigation
  let current = null;
  function tab() { const h = location.hash.slice(1); return TABS.includes(h) ? h : "aujourdhui"; }
  function render() {
    const t = tab();
    for (const k of TABS) $("#v-" + k).hidden = k !== t;
    document.querySelectorAll("[data-tab]").forEach((a) => (a.dataset.tab === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    VIEWS[t]();
    if (current && current !== t) { $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0); }
    current = t;
  }
  window.addEventListener("hashchange", () => { if (S.user) render(); });

  // ---------------------------------------------------------------- démarrage
  async function loadAll() {
    const uid = S.user.id;
    const [profil, seance, prop, ops] = await Promise.all([api.profil(uid), api.seance(), api.proposition(uid), api.operations(uid)]);
    S.profil = profil || { id: uid, email: S.user.email, budget: 0, profil: "equilibre", recevoir_email: true };
    Object.assign(S, { seance, prop, ops: ops || [] });
    if (seance) {
      const [a, o, f, c] = await Promise.all([api.table("actions_analyse", seance.date), api.table("obligations_analyse", seance.date),
        api.table("opcvm_analyse", seance.date), api.cibles(seance.date, S.profil.profil)]);
      S.mk = { actions: a || [], obligations: o || [], opcvm: f || [] };
      S.cibles = c || [];
      S.prices = new Map(); S.names = new Map(); S.classes = new Map(); S.decisions = new Map();
      S.actions = new Map(S.mk.actions.map((r) => [r.code, r]));
      for (const r of S.mk.actions) { S.prices.set(r.code, r.cours); S.names.set(r.code, r.nom); S.classes.set(r.code, "actions"); S.decisions.set(r.code, r.decision); }
      for (const r of S.mk.obligations) { S.prices.set(r.code, r.prix); S.names.set(r.code, r.nom); S.classes.set(r.code, "obligations"); S.decisions.set(r.code, r.decision); }
      for (const r of S.mk.opcvm) { S.prices.set(r.code, r.vl); S.names.set(r.code, r.nom); S.classes.set(r.code, r.classe); S.decisions.set(r.code, r.decision); }
      $("#codes").innerHTML = [...S.names.entries()].map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join("");
    }
  }

  let started = false;
  async function start(user) {
    if (started) return;
    started = true;
    S.user = user;
    $("#v-connexion").hidden = true;
    $("#loading").hidden = false;
    try {
      await loadAll();
    } catch (e) {
      $("#loading").textContent = "Chargement impossible : " + e.message;
      return;
    }
    $("#loading").hidden = true;
    document.querySelectorAll(".tabs-top, .tabs-bottom").forEach((n) => (n.hidden = false));
    if (!TABS.includes(location.hash.slice(1))) history.replaceState(null, "", location.pathname + location.search + "#aujourdhui");
    render();
  }

  function showLogin() {
    $("#loading").hidden = true;
    $("#v-connexion").hidden = false;
    const fl = $("#f-login"), fc = $("#f-code");
    fl.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = fl.email.value.trim(), m = $(".msg", fl);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { m.textContent = "Adresse e-mail invalide."; return; }
      fl.querySelector("button").disabled = true;
      try {
        await api.login(email);
        m.textContent = "C'est envoyé : ouvrez l'e-mail et touchez le lien (pensez aux courriers indésirables).";
        fc.hidden = false;
      } catch (e) { m.textContent = "Envoi impossible : " + e.message; }
      fl.querySelector("button").disabled = false;
    });
    fc.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const m = $(".msg", fc);
      try { await api.verify(fl.email.value.trim(), fc.code.value.trim()); }
      catch (e) { m.textContent = "Code refusé : " + e.message; }
    });
  }

  async function init() {
    $("#badge-demo").hidden = !DEMO;
    if (DEMO) document.title = "Démo – BRVM Portefeuille";
    try {
      api.onAuth((s) => { if (s?.user) start(s.user); });
      const s = await api.session();
      if (s?.user) start(s.user); else showLogin();
    } catch (e) {
      $("#loading").textContent = "Impossible de joindre le service : " + e.message;
    }
  }
  init();
})();
