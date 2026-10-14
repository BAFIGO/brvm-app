/* BRVM Portefeuille – application web (sans framework, sans étape de compilation).
 * Données : Supabase (règles RLS : chacun ne voit que ses propres profil, journal et propositions).
 * Mode démo : ?demo=1 charge demo.json (données fictives), rien n'est enregistré. */
(() => {
  "use strict";

  const CFG = window.BRVM_CONFIG;
  const DEMO = new URLSearchParams(location.search).has("demo");
  const FEES = CFG.fraisCourtage;
  const MIN_LINE = 50000;                                  // même seuil que l'outil (MIN_LINE_FCFA)
  const SEUIL_DEFAUT = 2 * MIN_LINE;                       // seuil d'investissement : 2 lignes minimum (réglable : console → Moteur)
  const RYTHMES = { quotidien: ["par jour", "aujourd'hui"], hebdo: ["par semaine", "cette semaine"], mensuel: ["par mois", "ce mois-ci"] };
  const SOURCES = { especes: "Espèces", banque: "Banque", mobile: "Mobile money" };
  const TYPES_OP = { ACHAT: "Achat", VENTE: "Vente", DIVIDENDE: "Dividende", DEPOT: "Argent versé à ma SGI", RETRAIT: "Argent retiré de ma SGI",
                     FRAIS: "Frais", SOLDE: "Solde relevé" };
  const TABS = ["aujourdhui", "portefeuille", "performance", "marche", "profil"];
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
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const P2 = (v) => (ok(v) ? (+v > 0 ? "+" : "") + nf2.format(+v * 100) + " %" : "–");
  const Dc = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "–");
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
      indices: async () => r(await sb.from("indices").select("date,code,cloture,variation").order("date").limit(3000)),
      annonce: async () => r(await sb.from("annonces").select("message,niveau").order("cree_le", { ascending: false }).limit(1))[0] || null,
      // Épargne mise de côté (supabase/epargne.sql) : erreur si le fichier n'est pas installé → fonctions masquées
      coffre: async () => r(await sb.rpc("mon_epargne")),
      addMouvement: async (m) => r(await sb.rpc("epargne_mouvement", { p_date: m.date, p_type: m.type, p_montant: m.montant,
                                                                     p_source: m.source || "", p_note: m.note || null })),
      envoyerSgi: async (date, montant) => r(await sb.rpc("epargne_envoyer_sgi", { p_date: date, p_montant: montant })),
      savePlan: async (pl) => r(await sb.from("coffre_plans").upsert({ user_id: S.user.id, montant: pl.montant, rythme: pl.rythme,
                                  jours_ouvres: pl.jours_ouvres, objectif: pl.objectif, debut: pl.debut }, { onConflict: "user_id" })),
      documents: async () => r(await sb.from("documents_legaux").select("type,version,titre,texte,publie_le").order("version", { ascending: false })),
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
      indices: async () => (await load()).indices || [],
      // Épargne mise de côté : en démonstration, un plan quotidien et quelques semaines de versements fictifs
      coffre: async () => {
        const d = await load();
        if (!d.coffre) {
          const iso = (dt) => new Date(dt.getTime() - dt.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
          const mv = [], src = ["especes", "mobile", "especes", "banque"];
          let id = 1;
          for (let j = 34; j >= 1; j--) {
            const dt = new Date(); dt.setDate(dt.getDate() - j);
            if ([0, 6].includes(dt.getDay()) || j % 9 === 4) continue;           // week-ends et quelques oublis
            mv.push({ id: id++, date: iso(dt), type: "VERSEMENT", montant: j % 6 === 0 ? 10000 : 5000, source: src[j % 4] });
          }
          const debut = new Date(); debut.setDate(debut.getDate() - 34);
          d.coffre = { plan: { montant: 5000, rythme: "quotidien", jours_ouvres: true, objectif: 500000, debut: iso(debut) }, mouvements: mv, nextId: id };
        }
        return { plan: d.coffre.plan && { ...d.coffre.plan }, mouvements: d.coffre.mouvements.slice(), seuil: 100000 };
      },
      addMouvement: async (m) => { const d = await load(); d.coffre.mouvements.push({ ...m, id: d.coffre.nextId++ }); },
      envoyerSgi: async (date, montant) => {
        const d = await load();
        d.coffre.mouvements.push({ id: d.coffre.nextId++, date, type: "TRANSFERT", montant });
        d.operations.push({ id: nextId++, date, type: "DEPOT", ticker: null, quantite: null, prix: null, frais: null, montant, note: "Depuis mon épargne" });
        d.operations.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      },
      savePlan: async (pl) => { (await load()).coffre.plan = { ...pl }; },
      annonce: async () => (await load()).annonce || null,
      documents: async () => (await load()).documents || [],
    };
  }

  const api = DEMO ? demoApi() : supaApi();
  const S = { user: null, profil: null, seance: null, prop: null, ops: [], mk: { actions: [], obligations: [], opcvm: [] },
              cibles: [], prices: new Map(), names: new Map(), classes: new Map(),
              ui: { mkTab: "actions", mkFilter: "opp", mkQuery: "", mkShow: 30, perf: 1 } };

  // ---------------------------------------------------------------- journal → positions (même méthode que l'outil)
  function replay(ops) {
    const pos = new Map();
    let cash = 0, apports = 0, realise = 0, dividendes = 0, fraisOps = 0;
    const errors = [];
    for (const o of ops) {
      const t = o.ticker || "", q = +o.quantite || 0, p = +o.prix || 0, m = +o.montant || 0;
      const fee = ok(o.frais) ? +o.frais : (o.type === "ACHAT" || o.type === "VENTE" ? q * p * FEES : 0);
      if (o.type === "DEPOT") { cash += m; apports += m; }
      else if (o.type === "RETRAIT") { cash -= m; apports -= m; }
      else if (o.type === "FRAIS") { cash -= m; fraisOps += m; }
      else if (o.type === "ACHAT") {
        cash -= q * p + fee;
        const x = pos.get(t) || { q: 0, cost: 0 };
        x.q += q; x.cost += q * p + fee; pos.set(t, x);
      } else if (o.type === "VENTE") {
        const x = pos.get(t);
        if (!x || x.q < q - 1e-9) { errors.push(`Vente de ${N(q)} ${t} le ${D(o.date)} supérieure à la quantité détenue.`); continue; }
        const avg = x.cost / x.q;
        cash += q * p - fee; realise += q * p - fee - q * avg; x.q -= q; x.cost -= q * avg;
        if (x.q < 1e-9) pos.delete(t);
      } else if (o.type === "DIVIDENDE") { const d = ok(o.montant) ? m : q * p; cash += d; dividendes += d; }
    }
    const positions = [...pos.entries()].map(([code, x]) => {
      const cours = S.prices.get(code);
      const valeur = ok(cours) ? x.q * cours : null;
      return { code, quantite: x.q, pru: x.cost / x.q, cout: x.cost, cours, valeur,
               pv: ok(valeur) ? valeur * (1 - FEES) - x.cost : null, classe: S.classes.get(code) };
    }).sort((a, b) => (b.valeur || 0) - (a.valeur || 0));
    const investi = positions.reduce((s, p) => s + (p.valeur || 0), 0);
    const latent = positions.reduce((s, p) => s + (p.pv || 0), 0);
    return { positions, cash, apports, errors, valeur: cash + investi, investi, latent, realise, dividendes, fraisOps,
             fraisVente: investi * FEES, gainTotal: cash + investi - apports };
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

  // Le journal a-t-il changé depuis le calcul du soir ? (trésorerie ou positions différentes)
  function journalChanged(L, c) {
    if (!c) return true;
    if (Math.abs((+c.tresorerie || 0) - L.cash) > 1) return true;
    const key = (arr) => arr.map((p) => `${p.code}:${Math.round(+p.quantite * 1000)}`).sort().join("|");
    return key(c.positions || []) !== key(L.positions);
  }

  // Ordres recalculés sur le téléphone (même logique que le calcul du soir, en plus simple) :
  // cible du profil appliquée à la valeur actuelle, moins ce qui est déjà détenu ; ventes d'abord,
  // achats limités à la trésorerie disponible ; écarts < 2 % de la valeur ignorés (frais).
  const KEEP = ["CONSERVER", "ACHAT", "ACHAT FORT", "SOUSCRIRE"];
  function instantOrders(L) {
    const value = L.valeur;
    if (!(value > 0)) return { ordres: [], cible: [] };
    const cible = estimate(value).lines;
    const want = new Map(cible.map((l) => [l.code, l]));
    const held = new Map(L.positions.map((p) => [p.code, p]));
    const minTrade = 0.02 * value;
    const sells = [], buys = [];
    for (const p of L.positions) {
      const w = want.get(p.code);
      const px = ok(p.cours) ? p.cours : null;
      if (!px) continue;
      if (!w) {
        if (KEEP.includes(S.decisions?.get(p.code))) continue;      // hors cible mais encore bien noté : on garde
        sells.push({ sens: "VENTE", code: p.code, libelle: S.names.get(p.code), quantite: p.quantite, prix_limite: px, motif: "sortie de la cible" });
      } else if (p.quantite - w.quantite > 0 && (p.quantite - w.quantite) * px >= minTrade) {
        sells.push({ sens: "VENTE", code: p.code, libelle: w.libelle, quantite: p.quantite - w.quantite, prix_limite: px, motif: "alléger" });
      }
    }
    let cash = L.cash + sells.reduce((s, o) => s + o.quantite * o.prix_limite * (1 - FEES), 0);
    const gaps = cible.map((l) => ({ l, q: l.quantite - (held.get(l.code)?.quantite || 0) }))
      .filter((g) => g.q > 0 && (g.q * g.l.prix >= minTrade || !held.has(g.l.code)))
      .sort((a, b) => b.q * b.l.prix - a.q * a.l.prix);
    for (const { l, q } of gaps) {
      const n = Math.min(q, Math.floor(cash / (l.prix * (1 + FEES))));
      if (n <= 0) continue;
      cash -= n * l.prix * (1 + FEES);
      buys.push({ sens: "ACHAT", code: l.code, libelle: l.libelle, quantite: n, prix_limite: l.prix,
                  motif: held.has(l.code) ? "renforcer" : "nouvelle ligne" });
    }
    return { ordres: [...sells, ...buys], cible };
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


  // ---------------------------------------------------------------- épargne mise de côté (coffre) : suivi déclaratif
  const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoLocal(d); };
  const weekday = (iso) => new Date(iso + "T12:00:00").getDay();             // 0 dimanche … 6 samedi
  // Période d'épargne contenant une date (clé) selon le rythme du plan
  function periode(iso, r) {
    if (r === "mensuel") return iso.slice(0, 7);
    if (r === "hebdo") { const w = weekday(iso); return addDays(iso, w === 0 ? -6 : 1 - w); }
    return iso;
  }
  function prevPeriode(k, r, plan) {
    if (r === "mensuel") { const [y, m] = k.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; }
    if (r === "hebdo") return addDays(k, -7);
    let d = addDays(k, -1);
    while (plan.jours_ouvres && [0, 6].includes(weekday(d))) d = addDays(d, -1);
    return d;
  }
  const seuil = () => +S.coffre?.seuil || SEUIL_DEFAUT;
  function epargne() {
    const c = S.coffre;
    if (!c) return null;
    const mv = c.mouvements || [];
    // totaux depuis le début (calculés par la base) ; à défaut, somme des mouvements chargés
    const sum = (t) => mv.filter((m) => m.type === t).reduce((a, m) => a + (+m.montant || 0), 0);
    const tt = c.totaux || {};
    const verse = +(tt.verse ?? sum("VERSEMENT")), envoye = +(tt.envoye ?? sum("TRANSFERT")), retire = +(tt.retire ?? sum("RETRAIT"));
    const e = { solde: verse - envoye - retire, verse, envoye, plan: c.plan, mv };
    const plan = c.plan;
    if (!plan?.montant) return e;
    const r = plan.rythme || "mensuel", now = today();
    const faits = new Set(mv.filter((m) => m.type === "VERSEMENT").map((m) => periode(m.date, r)));
    const cur = periode(now, r);
    const jourCompte = !(r === "quotidien" && plan.jours_ouvres && [0, 6].includes(weekday(now)));
    e.aFaire = jourCompte && !faits.has(cur);
    // régularité sur les dernières périodes écoulées (+ la période en cours si déjà tenue)
    const n = r === "quotidien" ? 20 : r === "hebdo" ? 12 : 6;
    const debut = plan.debut || (mv[0]?.date) || now;
    let k = jourCompte && faits.has(cur) ? cur : prevPeriode(cur, r, plan), tenus = 0, total = 0, serie = 0, enSerie = true;
    for (let i = 0; i < n && k >= periode(debut, r); i++, k = prevPeriode(k, r, plan)) {
      total++;
      if (faits.has(k)) { tenus++; if (enSerie) serie++; } else enSerie = false;
    }
    Object.assign(e, { tenus, total, serie, unite: r === "quotidien" ? "jour" : r === "hebdo" ? "semaine" : "mois" });
    // projections (sommes versées seulement, sans rendement supposé)
    const parPeriode = +plan.montant;
    const periodesVers = (montant) => Math.max(0, Math.ceil(montant / parPeriode));
    const enJours = (p) => (r === "quotidien" ? Math.ceil(p * (plan.jours_ouvres ? 7 / 5 : 1)) : r === "hebdo" ? p * 7 : p * 30);
    if (e.solde < seuil()) e.seuilDans = enJours(periodesVers(seuil() - e.solde));
    if (plan.objectif) {
      e.objectif = +plan.objectif;
      e.reste = Math.max(0, e.objectif - verse);
      e.objectifLe = e.reste ? addDays(now, enJours(periodesVers(e.reste))) : null;
    }
    return e;
  }
  const delai = (j) => (j <= 1 ? "demain" : j < 14 ? `dans ${j} jours` : j < 60 ? `dans ${Math.round(j / 7)} semaines` : `dans ${Math.round(j / 30)} mois`);
  // Montant à investir : saisi à la main, ou automatique (mis de côté + total chez ma SGI)
  function budgetAuto() { const L = replay(S.ops); return Math.max(0, L.valeur) + (epargne()?.solde || 0); }
  const budgetActuel = () => (S.coffre && S.profil?.budget_mode === "auto" ? budgetAuto() : +S.profil?.budget || 0);

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
    if (L.cash < -1) alertes.unshift("Votre disponible chez la SGI est négatif : enregistrez vos dépôts pour des calculs justes.");
    for (const a of alertes) h += `<div class="notice">${esc(a)}</div>`;
    const ep = epargne();
    if (ep && ep.solde >= seuil())
      h += `<div class="notice info"><b>Votre épargne mise de côté atteint ${F(ep.solde)}.</b> C'est assez pour investir :
        envoyez-la à votre SGI, les ordres seront recalculés. <button class="btn link" data-coffre="transfert">J'ai envoyé à ma SGI</button></div>`;

    if (hasPf) {
      const changed = !fresh || journalChanged(L, c);
      const perf = changed ? {} : c?.performance || {};       // performance du soir : valable pour ce journal-là
      h += `<div class="card kpis">
        <div class="kpi"><div class="lbl">Total chez ma SGI</div><div class="val num" data-count="${L.valeur ?? ""}">${F(L.valeur)}</div></div>
        <div class="kpi"><div class="lbl">Disponible chez ma SGI</div><div class="val num">${F(L.cash)}</div></div>
        <div class="kpi"><div class="lbl">Performance</div><div class="val num ${cls(perf.twr_total)}">${P(perf.twr_total)}</div>
          <div class="small muted">${changed ? "recalculée ce soir" : "indice " + P(perf.bench_total)}</div></div></div>`;
      const inst = changed ? instantOrders(L) : null;
      const ordres = changed ? inst.ordres : c?.ordres || [];
      S.ordres = ordres;
      const investi = L.valeur > 0 ? (L.valeur - L.cash) / L.valeur : 0;
      h += `<div class="card"><h2>Ordres proposés</h2>`;
      if (!ordres.length) {
        h += investi < 0.5 && L.cash > MIN_LINE
          ? `<p>Aucun ordre calculable pour l'instant avec votre disponible de ${F(L.cash)}. Vérifiez votre montant à investir et votre profil, ou revenez après le calcul du soir.</p>`
          : `<p>Rien à faire pour l'instant : votre portefeuille est proche de sa cible.</p>`;
      } else {
        h += `<p class="small muted">Pour rejoindre votre portefeuille cible (${esc(PROFILS[S.profil?.profil]?.t || S.profil?.profil || "")}). Prix limites indicatifs.</p><ul class="list">`;
        ordres.forEach((o, i) => {
          h += `<li><div class="main"><div class="name">${esc(o.libelle || o.code)}</div>
            <div class="sub">${chip(o.sens)} ${esc(o.code)} · ${esc(o.motif || "")}${ok(o.seances) && o.seances > 1 ? ` · ~${N(o.seances)} séances` : ""}</div></div>
            <div class="right num"><b>${N(o.quantite)}</b><div class="sub">limite ${F(o.prix_limite)}</div>
            <button class="btn small" data-ordre="${i}">J'ai passé l'ordre</button></div></li>`;
        });
        h += `</ul>`;
      }
      h += changed
        ? `<p class="small muted">Recalculés à l'instant avec votre journal à jour (estimation). Le calcul détaillé, qui tient compte de la liquidité de chaque titre, est refait ce soir après la séance.</p>`
        : `<p class="small muted">Calculés avec votre journal au soir du ${D(S.prop.date)}.</p>`;
      h += `</div>`;
      const lignes = changed ? inst.cible : c?.proposition?.lignes || [];
      if (lignes.length)
        h += `<div class="card"><h2>Votre portefeuille cible</h2>${classBar(lignes)}
          <p class="small muted">${changed ? "Répartition visée pour " + F(L.valeur) + "." : `Rendement attendu ${P(c.proposition.rendement_attendu, false)} par an, volatilité ${P(c.proposition.volatilite, false)}.`}</p></div>`;
    } else {
      const auto = S.coffre && S.profil?.budget_mode === "auto";
      const budget = budgetActuel();
      const nightly = fresh && c?.proposition && !c.positions?.length && Math.round(c.proposition.base) === Math.round(budget)
        && c.profil === S.profil?.profil ? c.proposition : null;
      const e = nightly ? { lines: nightly.lignes, reliquat: nightly.reliquat, rdt: nightly.rendement_attendu } : estimate(budget);
      h += `<div class="card"><h2>Votre portefeuille proposé</h2>
        <form id="f-budget" class="grid2" novalidate>
          ${auto ? `<div><div class="lbl small muted" style="font-weight:600">Montant à investir (automatique)</div><div class="val num" style="font-size:1.2rem;font-weight:700;margin-top:10px">${F(budget)}</div>
            <a class="small" href="#profil">Changer de mode</a></div>`
          : `<label>Montant à investir (F)<input name="budget" type="number" min="0" step="10000" inputmode="numeric" value="${budget || ""}"></label>`}
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
        puis vos achats. <button class="btn link" data-op="DEPOT">Enregistrer l'argent versé à ma SGI</button></div></div>`;
    }
    h += `<p class="small muted">Outil d'aide à la décision, ce n'est pas un conseil en investissement. Données de marché : BRVM.</p>`;
    v.innerHTML = h;
    const fb = $("#f-budget", v);
    if (fb) {
      const save = async () => {
        const profil = fb.profil.value, upd = fb.budget ? { budget: Math.max(0, +fb.budget.value || 0), profil } : { profil };
        try {
          await api.saveProfil(S.user.id, upd);
          Object.assign(S.profil, upd);
          S.cibles = await api.cibles(S.seance.date, profil);
          vAujourdhui();
        } catch (err) { toast("Enregistrement impossible : " + err.message); }
      };
      fb.budget?.addEventListener("change", save);
      fb.profil.addEventListener("change", save);
      fb.addEventListener("submit", (ev) => { ev.preventDefault(); save(); });
    }
  }

  const pluriel = (n, u) => `${n} ${u === "mois" ? "mois" : u + (n > 1 ? "s" : "")}`;
  function carteEpargne(ep) {
    const pl = ep.plan, r = pl?.rythme;
    let h = `<div class="card epargne" id="mon-epargne"><div class="ep-head"><h2>Mon épargne</h2>
      ${pl?.montant ? `<span class="chip">${F(pl.montant)} ${RYTHMES[r][0]}</span>` : ""}</div>`;
    if (!pl?.montant) {
      return h + `<p>Fixez-vous un rythme (par jour, par semaine ou par mois) : l'application vous aide à le tenir et vous dit quand investir.</p>
        <div class="actions" style="justify-content:flex-start"><button class="btn primary" data-coffre="plan">Créer mon plan d'épargne</button>
        <button class="btn" data-coffre="verser">J'ai épargné</button></div></div>`;
    }
    if (ep.objectif) {
      const pc = Math.min(100, (100 * ep.verse) / ep.objectif);
      h += `<div class="jauge" role="img" aria-label="${Math.round(pc)} % de l'objectif"><i style="width:${pc.toFixed(1)}%"></i></div>
        <p class="small">${F(ep.verse)} épargnés sur un objectif de ${F(ep.objectif)}${ep.objectifLe ? ` · atteint vers le ${D(ep.objectifLe)} à ce rythme` : " · objectif atteint !"}</p>`;
    }
    h += `<div class="ep-stats">
        <div><div class="lbl">Mis de côté</div><b class="num">${F(ep.solde)}</b></div>
        <div><div class="lbl">Régularité</div><b class="num">${ep.tenus} / ${pluriel(ep.total, ep.unite)}</b></div>
        <div><div class="lbl">Série en cours</div><b class="num">${pluriel(ep.serie, ep.unite)}</b></div>
        <div><div class="lbl">Prochain versement</div><b>${ep.aFaire ? RYTHMES[r][1] : "à jour ✓"}</b></div>
      </div>
      <p class="small ${ep.solde >= seuil() ? "good" : "muted"}">${ep.solde >= seuil() ? `Prêt à investir : envoyez votre épargne à votre SGI.`
        : `Investissement possible ${delai(ep.seuilDans)} à votre rythme (à partir de ${F(seuil())} mis de côté, pour limiter les frais).`}</p>
      <div class="actions" style="justify-content:flex-start"><button class="btn primary" data-coffre="verser">J'ai épargné</button>
        <button class="btn" data-coffre="transfert"${ep.solde > 0 ? "" : " disabled"}>J'ai envoyé à ma SGI</button>
        ${ep.solde > 0 ? `<button class="btn link small" data-coffre="reprendre">J'ai repris de mon épargne</button>` : ""}</div>`;
    const der = [...ep.mv].sort((a, b) => b.date.localeCompare(a.date) || (b.id || 0) - (a.id || 0)).slice(0, 5);
    if (der.length) h += `<details class="aide"><summary>Derniers mouvements</summary><ul class="list">${der.map((m) => `<li><div class="main">
        <div class="name">${m.type === "VERSEMENT" ? "Mis de côté" : m.type === "TRANSFERT" ? "Envoyé à ma SGI" : "Retiré"}</div>
        <div class="sub">${D(m.date)}${m.source ? " · " + esc(SOURCES[m.source] || m.source) : ""}</div></div>
        <div class="right num ${m.type === "VERSEMENT" ? "good" : ""}">${m.type === "VERSEMENT" ? "+" : "−"}${F(m.montant)}</div></li>`).join("")}</ul></details>`;
    return h + `</div>`;
  }
  function aideGain() {
    const L = replay(S.ops), ligne = (t, v, cl = "") => `<tr class="${cl}"><th scope="row">${t}</th><td class="num ${cls(v)}">${v > 0 ? "+" : ""}${F(v)}</td></tr>`;
    showInfo("Comprendre mon gain", `<p>Deux chiffres répondent à deux questions différentes :</p>
      <ul class="small"><li><b>Gain si je vendais aujourd'hui</b> : seulement les titres que vous avez encore, frais de vente déduits.</li>
      <li><b>Gain total depuis le début</b> : tout ce que votre argent a rapporté, dividendes et titres déjà vendus compris.</li></ul>
      <table class="decomp"><tbody>
        ${ligne("Gain si je vendais aujourd'hui", L.latent)}
        ${L.investi > 0 ? ligne(`+ frais de vente estimés (${nf1.format(FEES * 100)} %), pas encore payés`, L.fraisVente) : ""}
        ${ligne("+ dividendes reçus", L.dividendes)}
        ${ligne("+ résultat des titres déjà vendus", L.realise)}
        ${L.fraisOps ? ligne("− autres frais", -L.fraisOps) : ""}
        ${ligne("= Gain total depuis le début", L.gainTotal, "tot")}
      </tbody></table>
      <p class="small muted">Vérification : total chez ma SGI ${F(L.valeur)} − total envoyé à ma SGI ${F(L.apports)} = ${F(L.gainTotal)}.
        Les frais d'achat sont déjà déduits dans les deux chiffres.</p>
      <p class="small">La page <b>Performance</b> montre ce même gain total, mais sur la période choisie (une séance, un mois…).</p>`);
  }
  function showInfo(title, html) {
    $("#dlg-info-title").textContent = title;
    $("#dlg-info-body").innerHTML = html;
    $("#dlg-info").showModal();
  }

  function vPortefeuille() {
    const v = $("#v-portefeuille");
    const L = replay(S.ops);
    const ep = epargne(), cote = ep ? Math.max(0, ep.solde) : 0;
    const total = cote + Math.max(0, L.cash) + L.investi;
    const seg = (v, col) => (total > 0 && v > 0 ? `<i style="width:${(100 * v / total).toFixed(2)}%;background:${col}"></i>` : "");
    let h = `<h1 id="h-pf">Portefeuille</h1>
      <div class="card argent">
        <div class="lbl">Mon argent pour la bourse</div><div class="val num big" data-count="${total}">${F(total)}</div>
        <div class="bar3" aria-hidden="true">${seg(cote, "var(--s2)")}${seg(Math.max(0, L.cash), "var(--s3)")}${seg(L.investi, "var(--s1)")}</div>
        <ul class="legende">
          ${ep ? `<li><span class="pt" style="background:var(--s2)"></span><span>Mis de côté</span><b class="num">${F(cote)}</b></li>` : ""}
          <li><span class="pt" style="background:var(--s3)"></span><span>Disponible chez ma SGI</span><b class="num">${F(L.cash)}</b></li>
          <li><span class="pt" style="background:var(--s1)"></span><span>Placé en bourse</span><b class="num">${F(L.investi)}</b></li>
        </ul>
        <details class="aide"><summary>Que veulent dire ces montants ?</summary><dl>
          ${ep ? `<dt>Mis de côté</dt><dd>L'argent que vous gardez pour la bourse (espèces, banque, mobile money), pas encore envoyé à votre SGI.</dd>` : ""}
          <dt>Disponible chez ma SGI</dt><dd>L'argent déjà envoyé à votre SGI, prêt pour vos prochains achats.</dd>
          <dt>Placé en bourse</dt><dd>Ce que valent vos actions, obligations et OPCVM au cours de la dernière séance.</dd>
          <dt>Total chez ma SGI</dt><dd>Disponible + placé en bourse : ${F(L.valeur)}.</dd></dl></details>
      </div>
      <div class="card kpis">
        <div class="kpi"><div class="lbl">Total envoyé à ma SGI</div><div class="val num">${F(L.apports)}</div><div class="small muted">dépôts moins retraits</div></div>
        <div class="kpi"><div class="lbl">Gain total depuis le début</div><div class="val num ${cls(L.gainTotal)}">${L.gainTotal > 0 ? "+" : ""}${F(L.gainTotal)}</div><div class="small muted">dividendes et ventes compris</div></div>
        <div class="kpi"><div class="lbl">Gain si je vendais aujourd'hui</div><div class="val num ${cls(L.latent)}">${L.latent > 0 ? "+" : ""}${F(L.latent)}</div><div class="small muted">titres détenus, frais de vente déduits</div></div>
        <div class="kpi" style="align-self:center"><button class="btn small" id="gain-aide">Comprendre mon gain</button></div>
      </div>`;
    if (ep) h += carteEpargne(ep);
    h += `
      <div class="actions"><button class="btn primary" data-op="">Opération chez ma SGI</button></div>`;
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
      h += `</ul><p class="small muted">Valorisé au cours de la séance du ${D(S.seance?.date)}. Sous chaque ligne : le gain si vous la vendiez aujourd'hui, frais de vente estimés déduits.</p>`;
    }
    h += `</div><div class="card"><h2>Journal des opérations</h2>`;
    if (!S.ops.length) h += `<p class="muted">Aucune opération enregistrée.</p>`;
    else {
      h += `<ul class="list">`;
      for (const o of [...S.ops].reverse()) {
        const what = ["ACHAT", "VENTE"].includes(o.type) ? `${N(o.quantite)} × ${F(o.prix)}` : F(o.montant);
        h += `<li><div class="main"><div class="name">${esc(TYPES_OP[o.type] || o.type)} ${esc(o.ticker || "")}</div>
          <div class="sub">${D(o.date)}${o.note ? " · " + esc(o.note) : ""}</div></div>
          <div class="right num">${what}<div><button class="btn link small" data-del="${esc(o.id)}" aria-label="Supprimer l'opération du ${D(o.date)}">Supprimer</button></div></div></li>`;
      }
      h += `</ul><p class="small muted">Une erreur de saisie se corrige en supprimant la ligne, jamais par une opération inverse.</p>`;
    }
    v.innerHTML = h + `</div>`;
    $("#gain-aide", v).addEventListener("click", aideGain);
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

  function formPlan(pl) {
    return `<form id="f-plan" class="card" novalidate><h2>Mon plan d'épargne</h2>
      <p class="small muted">L'argent reste chez vous (espèces, banque, mobile money) : l'application vous aide seulement à suivre votre régularité.</p>
      <div class="grid2"><label>Montant (F)<input name="montant" type="number" min="0" step="500" inputmode="numeric" value="${pl.montant || ""}" placeholder="ex. 5000"></label>
        <label>Rythme<select name="rythme">${Object.entries({ quotidien: "Chaque jour", hebdo: "Chaque semaine", mensuel: "Chaque mois" })
          .map(([k, t]) => `<option value="${k}"${(pl.rythme || "mensuel") === k ? " selected" : ""}>${t}</option>`).join("")}</select></label></div>
      <label class="switch" id="pl-ouvres"><input type="checkbox" name="jours_ouvres"${pl.jours_ouvres !== false ? " checked" : ""}> Du lundi au vendredi seulement</label>
      <label>Objectif à atteindre (F, facultatif)<input name="objectif" type="number" min="0" step="10000" inputmode="numeric" value="${pl.objectif || ""}" placeholder="ex. 500000"></label>
      <div class="actions"><button class="btn primary" type="submit">Enregistrer mon plan</button></div></form>`;
  }

  function vProfil() {
    const v = $("#v-profil"), p = S.profil || {};
    v.innerHTML = `<h1 id="h-pr">Profil</h1>
      <form id="f-profil" class="card" novalidate>
        <p class="muted small">Connecté avec <b>${esc(S.user.email || p.email || "")}</b></p>
        ${S.coffre ? `<fieldset class="fs"><legend>Montant à investir</legend><div class="radios">
          <label><input type="radio" name="budget_mode" value="manuel"${p.budget_mode !== "auto" ? " checked" : ""}><span><b>Je le saisis</b><br>
            <span class="small muted">Un montant fixe, que vous changez quand vous voulez.</span></span></label>
          <label><input type="radio" name="budget_mode" value="auto"${p.budget_mode === "auto" ? " checked" : ""}><span><b>Automatique : ${F(budgetAuto())}</b><br>
            <span class="small muted">Mis de côté + total chez ma SGI : il grandit avec votre épargne.</span></span></label></div></fieldset>` : ""}
        <div id="pr-budget-w"${S.coffre && p.budget_mode === "auto" ? " hidden" : ""}>
          <label for="pr-budget">${S.coffre ? "Montant saisi (F)" : "Montant à investir (F)"}</label>
          <input id="pr-budget" name="budget" type="number" min="0" step="10000" inputmode="numeric" value="${p.budget ?? ""}"></div>
        <fieldset style="border:0;padding:0;margin:12px 0 0"><legend style="font-weight:600;font-size:.9rem">Profil de risque</legend>
          <div class="radios">${Object.entries(PROFILS).map(([k, x]) => `<label><input type="radio" name="profil" value="${k}"${p.profil === k ? " checked" : ""}>
            <span><b>${x.t}</b><br><span class="small muted">${x.d}</span></span></label>`).join("")}</div>
        </fieldset>
        <label class="switch" style="margin-top:14px"><input type="checkbox" name="recevoir_email"${p.recevoir_email ? " checked" : ""}>
          Recevoir ma proposition par e-mail chaque soir de séance</label>
        <div class="actions"><button class="btn primary" type="submit">Enregistrer</button></div>
      </form>
      ${S.coffre ? formPlan(S.coffre.plan || {}) : ""}
      <div class="card">
        <h2>À propos</h2>
        <p class="small">Chaque soir de séance, l'outil analyse les actions, obligations et OPCVM cotés à la BRVM, puis calcule
          pour vous un portefeuille cible et les ordres pour le rejoindre, à partir de votre budget, de votre profil et de votre journal.</p>
        ${S.docs?.avertissement ? `<div class="doc-texte small muted">${esc(S.docs.avertissement.texte)}</div>`
          : `<p class="small muted">Outil d'aide à la décision : ce n'est pas un conseil en investissement. Les performances passées ne préjugent
          pas des performances futures. Vos données (profil, journal) ne sont visibles que par vous.</p>`}
        ${S.docs?.cgu ? `<p class="small"><button class="btn link" type="button" id="voir-cgu">${esc(S.docs.cgu.titre)} (version ${esc(S.docs.cgu.version)})</button>
          ${p.cgu_acceptee_le ? `<span class="muted">acceptée le ${new Date(p.cgu_acceptee_le).toLocaleDateString("fr-FR")}</span>` : ""}</p>` : ""}
        <div class="actions"><button class="btn" id="logout">${DEMO ? "Quitter la démo" : "Se déconnecter"}</button></div>
      </div>`;
    const f = $("#f-profil", v);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const upd = { budget: Math.max(0, +f.budget.value || 0), profil: f.profil.value || "equilibre", recevoir_email: f.recevoir_email.checked };
      if (S.coffre) upd.budget_mode = f.budget_mode.value;
      try {
        await api.saveProfil(S.user.id, upd);
        const changed = upd.profil !== S.profil.profil;
        Object.assign(S.profil, upd);
        if (changed && S.seance) S.cibles = await api.cibles(S.seance.date, upd.profil);
        toast("Profil enregistré. La proposition sera recalculée ce soir.");
      } catch (err) { toast("Enregistrement impossible : " + err.message); }
    });
    $("#logout", v).addEventListener("click", () => api.logout());
    $("#voir-cgu", v)?.addEventListener("click", () => showCgu(S.docs.cgu, false));
    f.querySelectorAll('[name="budget_mode"]').forEach((r) => r.addEventListener("change", () => ($("#pr-budget-w", v).hidden = f.budget_mode.value === "auto")));
    const fp = $("#f-plan", v);
    if (fp) {
      const sync = () => ($("#pl-ouvres", fp).hidden = fp.rythme.value !== "quotidien");
      fp.rythme.addEventListener("change", sync); sync();
      fp.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const montant = Math.round(+fp.montant.value || 0);
        if (montant <= 0) { toast("Indiquez le montant à mettre de côté."); return; }
        const plan = { montant, rythme: fp.rythme.value, jours_ouvres: fp.jours_ouvres.checked, objectif: Math.round(+fp.objectif.value || 0) || null,
                       debut: S.coffre.plan?.debut || today() };
        try { await api.savePlan(plan); S.coffre.plan = plan; toast("Plan d'épargne enregistré."); vProfil(); }
        catch (e) { toast("Enregistrement impossible : " + e.message); }
      });
    }
  }

  // ---------------------------------------------------------------- performance quotidienne
  const PERIODES = [[1, "Séance"], [5, "5 séances"], [21, "1 mois"], [63, "3 mois"], [0, "Depuis le début"]];
  const SERIES = [["pf", "Portefeuille", "var(--s1)"], ["BRVM30", "BRVM 30", "var(--s2)"], ["BRVMC", "BRVM Composite", "var(--s3)"]];
  const cumul = (rs) => (rs.some(ok) ? rs.reduce((a, r) => (ok(r) ? a * (1 + +r) : a), 1) - 1 : null);   // null si aucune donnée

  function perfChart(rows, ix) {
    // indices de performance cumulée (base 0 % la veille de la première séance), un seul axe en %
    const pts = { pf: [0], BRVM30: [0], BRVMC: [0] };
    const acc = { pf: 1, BRVM30: 1, BRVMC: 1 };
    for (const r of rows) {
      if (ok(r.pct)) acc.pf *= 1 + r.pct;
      for (const k of ["BRVM30", "BRVMC"]) { const v = ix[k]?.get(r.date)?.variation; if (ok(v)) acc[k] *= 1 + +v; }
      for (const k in acc) pts[k].push(acc[k] - 1);
    }
    const dates = [null, ...rows.map((r) => r.date)];
    const Wd = 360, Ht = 210, L = 42, R = 58, T = 10, B = 22;
    const all = Object.values(pts).flat();
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const pad = (hi - lo || 0.01) * 0.12; lo -= pad; hi += pad;
    const x = (i) => L + (i / (dates.length - 1)) * (Wd - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (Ht - T - B);
    const ticks = []; const step = (hi - lo) / 4;
    for (let k = 0; k <= 4; k++) ticks.push(lo + k * step);
    let g = `<g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${Wd - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${P(t)}</text>`).join("")}</g>`;
    g += `<line class="zero" x1="${L}" x2="${Wd - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    g += `<g class="axis"><text x="${x(1)}" y="${Ht - 6}" text-anchor="start">${D(dates[1])}</text><text x="${x(dates.length - 1)}" y="${Ht - 6}" text-anchor="end">${D(dates[dates.length - 1])}</text></g>`;
    // étiquettes de fin espacées pour ne pas se chevaucher
    const has = { pf: true, BRVM30: rows.some((r) => ok(ix.BRVM30?.get(r.date)?.variation)), BRVMC: rows.some((r) => ok(ix.BRVMC?.get(r.date)?.variation)) };
    const ends = SERIES.filter(([k]) => has[k]).map(([k, n, col]) => ({ k, n, col, v: pts[k][pts[k].length - 1], yy: y(pts[k][pts[k].length - 1]) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < ends.length; i++) ends[i].yy = Math.max(ends[i].yy, ends[i - 1].yy + 14);
    for (const [k, , col] of SERIES.filter(([k2]) => has[k2]))
      g += `<path class="line" stroke="${col}" d="${pts[k].map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")}"/>`;
    g += `<g class="end">${ends.map((e) => `<text x="${Wd - R + 6}" y="${e.yy + 4}"><tspan fill="${e.col}">●</tspan> ${P(e.v)}</text>`).join("")}</g>`;
    g += `<g class="hover" visibility="hidden"><line class="cross" y1="${T}" y2="${Ht - B}"/>${SERIES.filter(([k]) => has[k]).map(([k, , col]) => `<circle class="dot" r="4" fill="${col}" data-k="${k}"/>`).join("")}</g>`;
    const label = `Performance cumulée du ${D(dates[1])} au ${D(dates[dates.length - 1])} : ` + SERIES.filter(([k]) => has[k]).map(([k, n]) => `${n} ${P(pts[k][pts[k].length - 1])}`).join(", ");
    return { html: `<div class="chart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="${esc(label)}">${g}<rect class="hit" x="${L}" y="${T}" width="${Wd - L - R}" height="${Ht - T - B}" fill="transparent"/></svg><div class="tip" hidden></div></div>`,
             pts, dates, x, y, Wd, has };
  }

  function vPerformance() {
    const v = $("#v-performance");
    const hist = (S.prop?.contenu?.historique || []).filter((r) => r.date);
    const ix = {};
    for (const r of S.indices || []) (ix[r.code] ||= new Map()).set(r.date, r);
    let h = `<h1 id="h-perf">Performance</h1>`;
    if (!hist.length) {
      v.innerHTML = h + `<div class="notice info">Le gain ou la perte de chaque séance est calculé chaque soir à partir de votre journal.
        Enregistrez vos opérations : les premiers chiffres apparaîtront après le prochain calcul.</div>`;
      return;
    }
    const n = S.ui.perf, rows = n ? hist.slice(-n) : hist.slice();
    const last = hist[hist.length - 1];
    const gain = rows.reduce((a, r) => a + (+r.gain || 0), 0);
    const pf = cumul(rows.map((r) => r.pct));
    const idx = (k) => cumul(rows.map((r) => ix[k]?.get(r.date)?.variation));
    const b30 = idx("BRVM30"), bc = idx("BRVMC");
    const per = n === 1 ? `la séance du ${D(last.date)}` : `${D(rows[0].date)} → ${D(last.date)}`;
    h += `<div class="seg scroll" role="group" aria-label="Période">${PERIODES.map(([k, t]) => `<button type="button" data-perf="${k}" aria-pressed="${S.ui.perf === k}">${t}</button>`).join("")}</div>
      <div class="card"><p class="small muted">Sur ${per}</p>
        <div class="kpi"><div class="lbl">Gain ou perte du portefeuille</div>
          <div class="val num ${cls(gain)}">${gain > 0 ? "+" : ""}${F(gain)}</div></div>
        <div class="cmp" style="margin-top:10px">
          ${[["Portefeuille", pf, "var(--s1)"], ["BRVM 30", b30, "var(--s2)"], ["BRVM Composite", bc, "var(--s3)"]].map(([t, val, col]) =>
            `<div class="kpi"><div class="lbl"><i style="background:${col}"></i>${t}</div><div class="val num ${cls(val)}">${n === 1 ? P2(val) : P(val)}</div></div>`).join("")}
        </div>
        <p class="small" style="margin-top:10px">${ok(pf) && ok(b30) ? `Écart avec le BRVM 30 : <b class="${cls(pf - b30)}">${(pf - b30 > 0 ? "+" : "") + nf1.format((pf - b30) * 100)} points</b>` + (pf >= b30 ? " — vous faites mieux que le marché." : " — le marché fait mieux sur cette période.") : ""}</p>
        ${!ok(b30) || !ok(bc) ? `<p class="small muted">« – » : indice pas encore disponible pour ces séances.</p>` : ""}
        <p class="small muted">Gain sur la période choisie, hors dépôts et retraits : évolution des cours, dividendes et frais.
          À ne pas confondre avec le « gain si je vendais aujourd'hui » de Portefeuille.</p></div>`;
    const chartRows = rows.length >= 5 ? rows : hist.slice(-21);
    const ch = perfChart(chartRows, ix);
    h += `<div class="card"><h2>Évolution comparée</h2>
      <div class="legend">${SERIES.map(([, n2, col]) => `<span><i class="s" style="background:${col}"></i>${n2}</span>`).join("")}</div>${ch.html}
      <p class="small muted">Performance cumulée${chartRows === rows ? "" : " sur le dernier mois"}, en partant de 0 %. Touchez le graphique pour le détail d'un jour.</p></div>`;
    const nTab = S.ui.perfRows || 10, tab = hist.slice(-nTab).reverse();
    h += `<div class="card"><h2>Jour par jour</h2><div class="tbl" role="region" aria-label="Gain par séance" tabindex="0"><table>
      <thead><tr><th scope="col">Séance</th><th scope="col">Gain (F)</th><th scope="col">Portef.</th><th scope="col">BRVM 30</th><th scope="col">Compos.</th></tr></thead>
      <tbody>${tab.map((r) => { const a = ix.BRVM30?.get(r.date)?.variation, c2 = ix.BRVMC?.get(r.date)?.variation;
        return `<tr><th scope="row">${Dc(r.date)}</th><td class="${cls(r.gain)}">${ok(r.gain) ? (r.gain > 0 ? "+" : "") + N(r.gain) : "–"}</td><td class="${cls(r.pct)}">${P2(r.pct)}</td><td>${P2(a)}</td><td>${P2(c2)}</td></tr>`; }).join("")}</tbody></table></div>
      ${hist.length > nTab ? `<div class="actions"><button class="btn small" id="perf-more">Afficher plus de séances</button></div>` : ""}
      <p class="small muted">Calculé chaque soir avec votre journal ; une opération enregistrée aujourd'hui apparaît après le calcul du soir.</p></div>`;
    v.innerHTML = h;
    v.querySelectorAll("[data-perf]").forEach((b) => b.addEventListener("click", () => { S.ui.perf = +b.dataset.perf; vPerformance(); }));
    $("#perf-more", v)?.addEventListener("click", () => { S.ui.perfRows = (S.ui.perfRows || 10) + 20; vPerformance(); });
    // info-bulle : le jour le plus proche du doigt ou de la souris
    const svg = $(".chart svg", v), tip = $(".chart .tip", v), hov = $(".hover", svg);
    const show = (ev) => {
      const bb = svg.getBoundingClientRect(), sx = ((ev.clientX - bb.left) / bb.width) * ch.Wd;
      let i = 1, best = Infinity;
      for (let k = 1; k < ch.dates.length; k++) { const d = Math.abs(ch.x(k) - sx); if (d < best) { best = d; i = k; } }
      hov.setAttribute("visibility", "visible");
      $(".cross", hov).setAttribute("x1", ch.x(i)); $(".cross", hov).setAttribute("x2", ch.x(i));
      hov.querySelectorAll(".dot").forEach((c) => { c.setAttribute("cx", ch.x(i)); c.setAttribute("cy", ch.y(ch.pts[c.dataset.k][i])); });
      tip.innerHTML = `<b>${D(ch.dates[i])}</b>` + SERIES.filter(([k]) => ch.has[k]).map(([k, n2, col]) => `<span style="color:${col}">●</span> ${n2} ${P(ch.pts[k][i])}`).join("<br>");
      tip.hidden = false;
      const px = (ch.x(i) / ch.Wd) * bb.width;
      tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), bb.width - tip.offsetWidth) + "px";
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", () => { hov.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  const VIEWS = { aujourdhui: vAujourdhui, portefeuille: vPortefeuille, performance: vPerformance, marche: vMarche, profil: vProfil };

  // ---------------------------------------------------------------- saisie d'une opération chez la SGI
  // Étapes : que s'est-il passé ? → catégorie → titre (liste « code – nom ») → quantité, prix, total en direct.
  const dlg = $("#dlg-op"), fop = $("#f-op");
  const AUTRE = "__autre__";
  const catDe = (code) => { const c = S.classes.get(code) || ""; return c === "actions" ? "actions" : c === "obligations" ? "obligations" : c ? "opcvm" : null; };
  const TABLES = { actions: "actions", obligations: "obligations", opcvm: "opcvm" };
  const prixDe = (r, cat) => (cat === "actions" ? r.cours : cat === "obligations" ? r.prix : r.vl);
  const court = (t, n = 34) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  function libelle(r, cat) {
    const nom = r.nom || r.code;
    if (cat === "actions") return `${r.code} – ${court(nom, 30)}`;
    if (cat === "obligations") return `${court(nom, 30)} – ${r.code}`;
    return `${court(nom, 26)} – ${court(r.gestionnaire || r.code, 14)}`;
  }
  const opType = () => fop.querySelector('[name="type"]:checked')?.value || "ACHAT";
  const opCat = () => fop.querySelector('[name="cat"]:checked')?.value || "actions";
  function remplirTitres(garder) {
    const t = opType(), q = $("#op-q").value.trim().toLowerCase(), sel = $("#op-titre");
    const match = (txt) => !q || txt.toLowerCase().includes(q);
    let html = `<option value="">Choisir un titre…</option>`, n = 0;
    if (t === "ACHAT") {
      const cat = opCat(), rows = (S.mk[TABLES[cat]] || []).filter((r) => r.code && match(libelle(r, cat) + " " + r.code));
      const tri = cat === "actions" ? (a, b) => a.code.localeCompare(b.code) : (a, b) => (a.nom || "").localeCompare(b.nom || "");
      const prop = rows.filter((r) => BUY.includes(r.decision)).sort((a, b) => (b.score || 0) - (a.score || 0));
      const opt = (r) => `<option value="${esc(r.code)}">${esc(libelle(r, cat))}</option>`;
      if (prop.length) html += `<optgroup label="Proposés ce soir">${prop.map(opt).join("")}</optgroup>`;
      html += `<optgroup label="Tous les titres">${rows.slice().sort(tri).map(opt).join("")}</optgroup>`;
      n = rows.length;
      $('[data-for="recherche"]', fop).hidden = cat === "actions";            // ~48 actions : la liste suffit
    } else {
      // vente, dividende : seulement les titres détenus, regroupés par catégorie
      const pos = replay(S.ops).positions;
      for (const [cat, nom] of [["actions", "Actions"], ["obligations", "Obligations"], ["opcvm", "OPCVM"]]) {
        const rows = pos.filter((p) => (catDe(p.code) || "actions") === cat).map((p) => ({ ...(S.mk[TABLES[cat]] || []).find((r) => r.code === p.code), code: p.code, nom: S.names.get(p.code) || p.code, q: p.quantite }))
          .filter((r) => match(libelle(r, cat)));
        if (rows.length) html += `<optgroup label="${nom}">${rows.map((r) => `<option value="${esc(r.code)}">${esc(libelle(r, cat))} (${N(r.q)})</option>`).join("")}</optgroup>`;
        n += rows.length;
      }
      $('[data-for="recherche"]', fop).hidden = n <= 30 && !q;
    }
    html += `<option value="${AUTRE}">Autre titre (saisir le code)</option>`;
    sel.innerHTML = html;
    if (garder && [...sel.options].some((o) => o.value === garder)) sel.value = garder;
    else if (garder) { sel.value = AUTRE; fop.autre.value = garder; }
    infoTitre(false);
  }
  function infoTitre(prefill) {
    const t = opType(), code = fop.ticker.value, info = $("#op-info");
    $('[data-for="autre"]', fop).hidden = code !== AUTRE;
    if (!code || code === AUTRE) { info.textContent = ""; total(); return; }
    const cat = catDe(code) || opCat(), r = (S.mk[TABLES[cat]] || []).find((x) => x.code === code);
    const px = r ? prixDe(r, cat) : null, held = replay(S.ops).positions.find((p) => p.code === code)?.quantite || 0;
    const parts = [];
    if (ok(px)) parts.push(`${cat === "opcvm" ? "Valeur liquidative" : cat === "obligations" ? "Prix (coupon couru compris)" : "Cours"} de la séance du ${D(S.seance?.date)} : ${F(px)}`);
    if (r?.decision) parts.push(`analyse : ${r.decision}`);
    if (held) parts.push(`vous en détenez ${N(held)}`);
    info.textContent = parts.join(" · ");
    if (prefill && ok(px) && (t === "ACHAT" || t === "VENTE") && (!fop.prix.value || fop.dataset.prixAuto === "1")) { fop.prix.value = px; fop.dataset.prixAuto = "1"; }
    if (t === "VENTE" && held && !fop.quantite.value) fop.quantite.value = held;
    total();
  }
  function total() {
    const t = opType(), out = $("#op-total");
    const q = +fop.quantite.value || 0, p = +fop.prix.value || 0, brut = q * p;
    const fee = fop.frais.value !== "" ? +fop.frais.value : brut * FEES, dispo = replay(S.ops).cash;
    out.className = "op-total";
    if (t === "ACHAT" && brut > 0) {
      out.innerHTML = `${N(q)} × ${F(p)} = ${F(brut)} + frais ${F(fee)} = <b>${F(brut + fee)}</b><br><span class="small">Disponible chez ma SGI : ${F(dispo)}</span>`;
      if (brut + fee > dispo + 1) { out.classList.add("warn"); out.innerHTML += `<br><span class="small">Le disponible ne suffit pas : enregistrez d'abord l'argent versé à votre SGI.</span>`; }
    } else if (t === "VENTE" && brut > 0) out.innerHTML = `Vous recevez environ <b>${F(brut - fee)}</b> (${F(brut)} − frais ${F(fee)})`;
    else out.textContent = "";
  }
  function syncOpForm() {
    const t = opType();
    const titre = ["ACHAT", "VENTE", "DIVIDENDE"].includes(t);
    fop.querySelectorAll('[data-for="titre"]').forEach((e) => (e.hidden = !titre));
    $('[data-for="cat"]', fop).hidden = t !== "ACHAT";
    fop.querySelectorAll('[data-for="qp"]').forEach((e) => (e.hidden = !["ACHAT", "VENTE"].includes(t)));
    $('[data-for="montant"]', fop).hidden = ["ACHAT", "VENTE"].includes(t);
    $('[data-for="vers-epargne"]', fop).hidden = !(t === "RETRAIT" && S.coffre);
    if (titre) remplirTitres(fop.ticker.value || null);
    total();
  }
  function openOp(pre = {}) {
    fop.reset();
    delete fop.dataset.dupOk; delete fop.dataset.prixAuto;
    fop.date.value = today();
    $(".msg", fop).textContent = "";
    $("#op-q").value = "";
    const t = pre.type || "ACHAT";
    fop.querySelector(`[name="type"][value="${t}"]`).checked = true;
    const cat = (pre.ticker && catDe(pre.ticker)) || S.ui.opCat || "actions";
    fop.querySelector(`[name="cat"][value="${cat}"]`).checked = true;
    $("#dlg-op-title").textContent = "Opération chez ma SGI";
    fop.ticker.innerHTML = "";
    syncOpForm();
    if (pre.ticker) remplirTitres(pre.ticker);
    for (const k of ["quantite", "prix", "montant"]) if (pre[k] !== undefined && pre[k] !== null) fop[k].value = pre[k];
    infoTitre(!pre.prix);
    dlg.showModal();
  }
  fop.querySelectorAll('[name="type"]').forEach((r) => r.addEventListener("change", () => { fop.ticker.value = ""; fop.quantite.value = ""; fop.prix.value = ""; syncOpForm(); }));
  fop.querySelectorAll('[name="cat"]').forEach((r) => r.addEventListener("change", () => { S.ui.opCat = opCat(); $("#op-q").value = ""; remplirTitres(null); }));
  $("#op-q").addEventListener("input", () => remplirTitres(fop.ticker.value || null));
  fop.ticker.addEventListener("change", () => { fop.quantite.value = opType() === "VENTE" ? "" : fop.quantite.value; infoTitre(true); });
  fop.prix.addEventListener("input", () => { delete fop.dataset.prixAuto; total(); });
  fop.quantite.addEventListener("input", total);
  fop.frais.addEventListener("input", total);
  fop.addEventListener("submit", async (ev) => {
    if (ev.submitter?.value !== "ok") return;                    // « Annuler » ferme simplement la fenêtre
    ev.preventDefault();
    const t = opType(), num = (n) => (fop[n].value === "" ? null : +fop[n].value);
    const code = fop.ticker.value === AUTRE ? (fop.autre.value || "").trim().toUpperCase() : fop.ticker.value;
    const op = { date: fop.date.value, type: t, ticker: code || null,
                 quantite: null, prix: null, frais: null, montant: null, note: fop.note.value.trim() || null };
    const err = (m) => { $(".msg", fop).textContent = m; };
    if (!op.date) return err("Indiquez la date.");
    if (op.date > today()) return err("La date ne peut pas être dans le futur.");
    if (t === "ACHAT" || t === "VENTE") {
      Object.assign(op, { quantite: num("quantite"), prix: num("prix"), frais: num("frais") });
      if (!op.ticker) return err("Choisissez le titre.");
      if (!(op.quantite > 0) || !(op.prix > 0)) return err("Indiquez une quantité et un prix positifs.");
      if (t === "VENTE") {
        const held = replay(S.ops).positions.find((p) => p.code === op.ticker)?.quantite || 0;
        if (op.quantite > held + 1e-9) return err(`Vous ne détenez que ${N(held)} ${op.ticker}.`);
      }
    } else {
      op.montant = num("montant");
      if (!(op.montant > 0)) return err("Indiquez un montant positif.");
      if (t === "DIVIDENDE" && !op.ticker) return err("Choisissez le titre qui a versé le dividende ou le coupon.");
      if (t !== "DIVIDENDE") op.ticker = null;
    }
    const dup = S.ops.some((o) => o.date === op.date && o.type === op.type && (o.ticker || null) === op.ticker
      && +o.quantite === +op.quantite && +o.prix === +op.prix && +o.montant === +op.montant);
    if (dup && !fop.dataset.dupOk) { fop.dataset.dupOk = "1"; return err("Une opération identique existe déjà ce jour-là. Appuyez de nouveau sur Enregistrer pour confirmer."); }
    delete fop.dataset.dupOk;
    try {
      await api.addOperation(op);
      if (t === "RETRAIT" && S.coffre && fop.vers_epargne.checked) {
        await api.addMouvement({ date: op.date, type: "VERSEMENT", montant: op.montant, source: "banque", note: "Retiré de ma SGI" });
        S.coffre = await api.coffre(S.user.id);
      }
      S.ops = await api.operations(S.user.id);
      dlg.close();
      toast("Opération enregistrée.");
      render();
    } catch (e) { err("Enregistrement impossible : " + e.message); }
  });

  // ---------------------------------------------------------------- saisie rapide : « J'ai épargné » / « J'ai envoyé à ma SGI »
  const dcf = $("#dlg-coffre"), fcf = $("#f-coffre");
  let cfMode = "verser";
  function openCoffre(mode) {
    const ep = epargne();
    if (!ep) return;
    cfMode = mode;
    fcf.reset();
    fcf.date.value = today();
    $(".msg", fcf).textContent = "";
    const verser = mode === "verser", m = +ep.plan?.montant || 0;
    $("#dlg-coffre-title").textContent = verser ? "J'ai épargné" : mode === "reprendre" ? "J'ai repris de mon épargne" : "J'ai envoyé à ma SGI";
    $("#dlg-coffre-sub").textContent = verser
      ? "Notez l'argent que vous venez de mettre de côté pour la bourse."
      : mode === "reprendre"
        ? `Cet argent sort de votre épargne (${F(ep.solde)} mis de côté) pour un autre usage. Il ne compte plus pour la bourse.`
        : `Cet argent quitte votre épargne (${F(ep.solde)} mis de côté) et devient disponible chez votre SGI : un dépôt est ajouté à votre journal.`;
    const presets = verser ? (m ? [m, 2 * m, 5 * m] : [1000, 5000, 10000]) : [ep.solde];
    $("#cf-presets").innerHTML = presets.filter((x) => x > 0).map((x, i) => `<button type="button" class="btn small" data-v="${x}">${!verser ? "Tout : " : ""}${F(x)}</button>`).join("");
    $("#cf-presets").querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => {
      fcf.montant.value = b.dataset.v;
      $("#cf-presets").querySelectorAll("[data-v]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    }));
    fcf.montant.value = presets[0] > 0 ? presets[0] : "";
    $("#cf-presets [data-v]")?.setAttribute("aria-pressed", "true");
    $("#cf-src").hidden = !verser;
    $("#cf-ok").textContent = verser ? "Mettre de côté" : mode === "reprendre" ? "Confirmer" : "Confirmer l'envoi";
    dcf.showModal();
  }
  fcf.addEventListener("submit", async (ev) => {
    if (ev.submitter?.value !== "ok") return;
    ev.preventDefault();
    const ep = epargne(), montant = Math.round(+fcf.montant.value || 0), date = fcf.date.value || today();
    const err = (t) => ($(".msg", fcf).textContent = t);
    if (montant <= 0) return err("Indiquez un montant.");
    if (date > today()) return err("La date ne peut pas être dans le futur.");
    try {
      if (cfMode === "verser") {
        await api.addMouvement({ date, type: "VERSEMENT", montant, source: fcf.source.value });
        toast(`Bravo : ${F(montant)} de plus mis de côté.`);
      } else if (cfMode === "reprendre") {
        if (montant > ep.solde) return err(`Vous avez ${F(ep.solde)} mis de côté.`);
        await api.addMouvement({ date, type: "RETRAIT", montant });
        toast(`${F(montant)} repris de votre épargne.`);
      } else {
        if (montant > ep.solde) return err(`Vous avez ${F(ep.solde)} mis de côté. Pour de l'argent venant d'ailleurs, utilisez « Opération chez ma SGI » → Argent versé à ma SGI.`);
        await api.envoyerSgi(date, montant);                     // une seule transaction : épargne et journal ensemble
        S.ops = await api.operations(S.user.id);
        toast(`${F(montant)} envoyés à votre SGI : vos ordres sont recalculés.`);
      }
      S.coffre = await api.coffre(S.user.id);
      dcf.close();
      render();
    } catch (e) { err("Enregistrement impossible : " + e.message); }
  });

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.coffre === "plan") { location.hash = "profil"; setTimeout(() => $("#f-plan")?.scrollIntoView({ block: "start" }), 50); }
    else if (b.dataset.coffre) openCoffre(b.dataset.coffre);
    else if (b.dataset.op !== undefined) openOp(b.dataset.op ? { type: b.dataset.op } : {});
    else if (b.dataset.ordre !== undefined) {
      const o = S.ordres[+b.dataset.ordre];
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
  const CALME = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function countUp(el) {
    const to = +el.dataset.count;
    if (CALME || !isFinite(to) || !to) return;
    const t0 = performance.now(), d = 600;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = F(to * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function render() {
    const t = tab();
    for (const k of TABS) $("#v-" + k).hidden = k !== t;
    document.querySelectorAll("[data-tab]").forEach((a) => (a.dataset.tab === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    VIEWS[t]();
    const fab = $("#fab-coffre"), showFab = !!S.coffre && ["aujourdhui", "portefeuille"].includes(t);
    fab.hidden = !showFab;
    document.body.classList.toggle("has-fab", showFab);
    const aFaire = !!epargne()?.aFaire;
    $(".fab-dot", fab).hidden = !aFaire;
    fab.setAttribute("aria-label", aFaire ? "Noter mon épargne (pas encore notée pour cette période)" : "Noter mon épargne");
    if (current !== t) {                                   // transition douce et compteur, sauf « mouvement réduit »
      const v = $("#v-" + t);
      v.classList.remove("v-in"); void v.offsetWidth; v.classList.add("v-in");
      v.querySelectorAll("[data-count]").forEach(countUp);
    }
    if (current && current !== t) { $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0); }
    current = t;
  }
  window.addEventListener("hashchange", () => { if (S.user) render(); });

  // ---------------------------------------------------------------- démarrage
  async function loadAll() {
    const uid = S.user.id;
    try { S.coffre = api.coffre ? await api.coffre(uid) : null; } catch (e) { S.coffre = null; }   // épargne : absente si epargne.sql n'est pas installé
    try {                                                              // versions les plus récentes de chaque texte
      const docs = await api.documents();
      S.docs = {};
      for (const d of docs || []) if (!S.docs[d.type]) S.docs[d.type] = d;
    } catch (e) { S.docs = {}; }                                       // table pas encore créée
    const [profil, seance, prop, ops] = await Promise.all([api.profil(uid), api.seance(), api.proposition(uid), api.operations(uid)]);
    S.profil = profil || { id: uid, email: S.user.email, budget: 0, profil: "equilibre", recevoir_email: true };
    Object.assign(S, { seance, prop, ops: ops || [] });
    if (seance) {
      const [a, o, f, c] = await Promise.all([api.table("actions_analyse", seance.date), api.table("obligations_analyse", seance.date),
        api.table("opcvm_analyse", seance.date), api.cibles(seance.date, S.profil.profil)]);
      S.mk = { actions: a || [], obligations: o || [], opcvm: f || [] };
      S.cibles = c || [];
      try { S.indices = await api.indices(); } catch (e) { S.indices = []; }   // table pas encore créée
      S.prices = new Map(); S.names = new Map(); S.classes = new Map(); S.decisions = new Map();
      S.actions = new Map(S.mk.actions.map((r) => [r.code, r]));
      for (const r of S.mk.actions) { S.prices.set(r.code, r.cours); S.names.set(r.code, r.nom); S.classes.set(r.code, "actions"); S.decisions.set(r.code, r.decision); }
      for (const r of S.mk.obligations) { S.prices.set(r.code, r.prix); S.names.set(r.code, r.nom); S.classes.set(r.code, "obligations"); S.decisions.set(r.code, r.decision); }
      for (const r of S.mk.opcvm) { S.prices.set(r.code, r.vl); S.names.set(r.code, r.nom); S.classes.set(r.code, r.classe); S.decisions.set(r.code, r.decision); }
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
    const cgu = S.docs?.cgu;
    if (cgu && (+S.profil.cgu_version || 0) < cgu.version && !(await showCgu(cgu, true))) return;
    document.querySelectorAll(".tabs-top, .tabs-bottom").forEach((n) => (n.hidden = false));
    if (!TABS.includes(location.hash.slice(1))) history.replaceState(null, "", location.pathname + location.search + "#aujourdhui");
    render();
  }

  // Conditions d'utilisation : lecture seule, ou acceptation obligatoire d'une nouvelle version (true si acceptée)
  function showCgu(doc, accept) {
    return new Promise((resolve) => {
      const d = $("#dlg-cgu"), f = $("form", d), msg = $(".msg", f);
      $("#dlg-cgu-title").textContent = doc.titre;
      $("#dlg-cgu-sub").textContent = `Version ${doc.version} du ${new Date(doc.publie_le).toLocaleDateString("fr-FR")}`
        + (accept ? (S.profil.cgu_version ? " : les conditions ont changé, merci de les relire." : " : merci de les lire avant de continuer.") : "");
      $("#dlg-cgu-texte").textContent = doc.texte;
      msg.textContent = "";
      $(".actions", f).innerHTML = accept
        ? `<button class="btn" type="button" data-non>Me déconnecter</button><button class="btn primary" type="button" data-oui>J'accepte</button>`
        : `<button class="btn primary" value="ok">Fermer</button>`;
      d.oncancel = accept ? (e) => e.preventDefault() : null;           // acceptation : pas de fermeture par Échap
      if (accept) {
        $("[data-non]", f).addEventListener("click", () => api.logout());
        $("[data-oui]", f).addEventListener("click", async () => {
          const upd = { cgu_version: doc.version, cgu_acceptee_le: new Date().toISOString() };
          try { await api.saveProfil(S.user.id, upd); Object.assign(S.profil, upd); d.close(); resolve(true); }
          catch (e) { msg.textContent = "Enregistrement impossible : " + e.message; }
        });
      } else d.addEventListener("close", () => resolve(false), { once: true });
      d.showModal();
    });
  }

  async function showAnnonce() {
    try {
      const a = await api.annonce();
      const el = $("#annonce");
      if (!a) { el.hidden = true; return; }
      el.className = "annonce " + (a.niveau || "info");
      const lbl = { maintenance: "Maintenance", attention: "Attention" }[a.niveau];
      el.innerHTML = (lbl ? `<b>${lbl}</b> · ` : "") + esc(a.message);
      el.hidden = false;
    } catch (e) { /* table pas encore créée : pas de bannière */ }
  }

  function showLogin() {
    $("#loading").hidden = true;
    $("#v-connexion").hidden = false;
    const fl = $("#f-login"), fc = $("#f-code");
    fl.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = fl.email.value.trim(), m = $(".msg", fl);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { m.textContent = "Adresse e-mail invalide."; return; }
      const btn = fl.querySelector("button");
      btn.disabled = true;
      let wait = 0;
      try {
        await api.login(email);
        m.textContent = "C'est envoyé : ouvrez l'e-mail et touchez le lien (pensez aux courriers indésirables).";
        fc.hidden = false;
        wait = 60;                                   // évite les demandes répétées (limite d'envoi)
      } catch (e) {
        const msg = String(e.message || e);
        if (/rate limit|too many|429|security purposes/i.test(msg)) {
          m.textContent = "Trop de demandes de connexion en peu de temps. Si vous avez déjà reçu un lien ou un code, "
            + "utilisez-le ; sinon réessayez dans quelques minutes.";
          fc.hidden = false;
          wait = 60;
        } else m.textContent = "Envoi impossible : " + msg;
      }
      if (!wait) { btn.disabled = false; return; }
      const label = btn.textContent;
      const tick = () => {
        if (wait <= 0) { btn.disabled = false; btn.textContent = label; return; }
        btn.textContent = `Nouvel envoi possible dans ${wait--} s`;
        setTimeout(tick, 1000);
      };
      tick();
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
    showAnnonce();
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
