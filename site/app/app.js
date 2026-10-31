/* BafiBourse – application web (sans framework, sans étape de compilation).
 * Données : Supabase (règles RLS : chacun ne voit que ses propres profil, journal et propositions).
 * Mode démo : ?demo=1 charge demo.json (données fictives), rien n'est enregistré. */
(() => {
  "use strict";

  const CFG = window.BRVM_CONFIG;
  const DEMO = new URLSearchParams(location.search).has("demo");
  // Arrivée par le lien de l'e-mail (lu avant que Supabase ne nettoie l'adresse)
  const VIENT_DU_LIEN = /access_token=|[?&]code=|type=(magiclink|signup|email)/.test(location.hash + location.search);
  const DEMO_DEBUT = DEMO && new URLSearchParams(location.search).get("demo") === "debut";   // démo « mes premiers jours »
  // Mode des portefeuilles réglé dans la console (Moteur) : « simulation » = calcul selon les réglages de l'utilisateur,
  // jamais présenté comme une recommandation. Démo : ?demo=1&mode=simulation
  let MODE = DEMO && new URLSearchParams(location.search).get("mode") === "simulation" ? "simulation" : "proposition";
  const SIM = () => MODE === "simulation";
  const AVERT = () => SIM()
    ? "Simulation calculée à partir de vos réglages (budget et profil de risque) : ce n'est ni une recommandation ni un conseil en investissement. Vous restez seul décideur de vos ordres."
    : "Outil d'aide à la décision, ce n'est pas un conseil en investissement.";
  const FEES = CFG.fraisCourtage;
  const MIN_LINE = 50000;                                  // même seuil que l'outil (MIN_LINE_FCFA)
  const SEUIL_DEFAUT = 2 * MIN_LINE;                       // seuil d'investissement : 2 lignes minimum (réglable : console → Moteur)
  const RYTHMES = { quotidien: ["par jour", "aujourd'hui"], hebdo: ["par semaine", "cette semaine"], mensuel: ["par mois", "ce mois-ci"] };
  const SOURCES = { especes: "Espèces", banque: "Banque", mobile: "Mobile money" };
  const TYPES_OP = { ACHAT: "Achat", VENTE: "Vente", DIVIDENDE: "Dividende", DEPOT: "Argent versé à ma SGI", RETRAIT: "Argent retiré de ma SGI",
                     FRAIS: "Frais", SOLDE: "Solde relevé" };
  const TABS = ["aujourdhui", "portefeuille", "performance", "marche", "profil"];
  const ICONE_EPINGLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/></svg>`;
  const PROFILS = {
    prudent: { t: "Prudent", d: "Surtout des obligations et des fonds monétaires, peu d'actions. Variations faibles." },
    equilibre: { t: "Équilibré", d: "Un tiers à la moitié en actions, le reste en obligations et fonds. Le choix par défaut." },
    dynamique: { t: "Dynamique", d: "Jusqu'à 70 % en actions et fonds actions. Plus de rendement attendu, plus de variations." },
  };
  const CLASSES = { actions: "Actions", obligations: "Obligations", opcvm_actions: "OPCVM actions", opcvm_taux: "OPCVM taux" };
  const COLORS = { actions: "#2f8a72", obligations: "#c48a1a", opcvm_actions: "#5b73c4", opcvm_taux: "#a86aa6", liquidites: "#9aa0b4" };
  const BUY = ["ACHAT", "ACHAT FORT", "SOUSCRIRE"];

  // ---------------------------------------------------------------- utilitaires
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ok = (v) => v !== null && v !== undefined && Number.isFinite(+v);
  const F = (v) => (ok(v) ? nf0.format(Math.round(+v)) + " F" : "–");
  const montantHtml = (v) => (ok(v) ? `${nf0.format(Math.round(+v))}<span class="unite">&nbsp;F</span>` : "–");
  const N = (v) => (ok(v) ? nf0.format(+v) : "–");
  const P = (v, sign = true) => (ok(v) ? (sign && +v > 0 ? "+" : "") + nf1.format(+v * 100) + " %" : "–");
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const P2 = (v) => (ok(v) ? (+v > 0 ? "+" : "") + nf2.format(+v * 100) + " %" : "–");
  const Dc = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "–");
  const D = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR") : "–");
  const today = () => new Date().toISOString().slice(0, 10);
  // Chef d'orchestre des sollicitations non demandées (notation, astuces…) : une seule par session,
  // jamais par-dessus une fenêtre ou une bulle, jamais dans les 30 secondes qui suivent l'ouverture.
  // La visite guidée et les alertes importantes passent toujours.
  const OUVERTURE = Date.now();
  window.BafiCalme = {
    libre: () => !document.querySelector("dialog[open]") && !(document.getElementById("tuto") && !document.getElementById("tuto").hidden),
    autorise(type) {
      if (!this.libre()) return false;
      if (type === "visite" || type === "alerte") return true;
      if (Date.now() - OUVERTURE < 30000) return false;
      try { return !sessionStorage.getItem("brvm-sollicitation"); } catch (e) { return true; }
    },
    consomme(type) { try { sessionStorage.setItem("brvm-sollicitation", type); } catch (e) { /* rien */ } },
  };
  const cls = (v) => (ok(v) ? (+v > 0 ? "good" : +v < 0 ? "bad" : "") : "");
  const chip = (d) => {
    if (!d) return "";
    const k = BUY.includes(d) ? "buy" : /VENDRE|ÉVITER|RACHETER/.test(d) ? "sell" : /ALLÉGER|SURVEILLER/.test(d) ? "warn" : "";
    return `<span class="chip ${k}">${esc(libDecision(d))}</span>`;
  };
  // Les décisions du moteur sont présentées comme des appréciations, jamais comme des ordres (« Achat fort » → « Très bien noté »)
  const LIB_DECISION = { "ACHAT FORT": "Très bien noté", ACHAT: "Bien noté", SOUSCRIRE: "Bien noté", RENFORCER: "Bien noté",
    CONSERVER: "Neutre", SURVEILLER: "À surveiller", "ALLÉGER": "Moins bien noté", "ÉVITER": "Fragile", VENDRE: "Fragile",
    "ÉVITER (illiquide)": "Peu échangé" };
  function libDecision(d) {
    const t = String(d || "");
    if (LIB_DECISION[t]) return LIB_DECISION[t];
    if (/illiquide/i.test(t)) return "Peu échangé";
    return t.charAt(0) + t.slice(1).toLowerCase();
  }
  // Les trois repères d'une action : santé financière (A à E), tendance du cours, score BafiBourse
  // Historique boursier sur 5 ans : des faits passés (cours ajustés des fractionnements, dividendes), jamais une prévision
  function histoAnnuel(h, type = "action") {
    if (!h?.annees?.length) return "";
    const act = type === "action";
    const resume = h.moyenne_annuelle != null
      ? `<p class="ha-resume">Sur ${h.nb_annees} an${h.nb_annees > 1 ? "s" : ""} : <b class="${cls(h.moyenne_annuelle)}">${P(h.moyenne_annuelle)}</b> par an en moyenne${act ? ", dividendes compris" : ""}
          · pire année : ${h.pire_annee} (<span class="${cls(h.pire_total)}">${P(h.pire_total)}</span>)</p>`
      : `<p class="ha-resume small muted">Historique trop court pour une moyenne sur plusieurs années.</p>`;
    const max = Math.max(0.05, ...h.annees.map((l) => Math.abs(l.total ?? l.variation ?? 0)));
    const lignes = h.annees.slice().reverse().map((l) => {
      const t = act ? l.total : l.variation;
      return `<tr><th scope="row">${l.annee}${l.en_cours ? `<span class="small muted" title="année en cours, depuis le 1er janvier">*</span>` : ""}</th>
        <td class="num">${F(l.cours)}</td><td class="num ${cls(l.variation)}">${P(l.variation)}</td>
        ${act ? `<td class="num c-div">${l.dividende ? `${F(l.dividende)}<span class="small muted"> · ${P(l.rendement_dividende, false)}</span>` : "–"}</td>` : ""}
        <td class="num ${cls(t)}"><b>${P(t)}</b></td>
        <td class="ha-barre" aria-hidden="true"><span class="${t >= 0 ? "pos" : "neg"}" style="width:${Math.min(100, (Math.abs(t || 0) / max) * 100)}%"></span></td></tr>`;
    }).join("");
    return `<div class="ha"><h4>Sur ${h.annees.length > 5 ? 5 : h.annees.filter((l) => !l.en_cours).length} ans en bourse</h4>${resume}
      ${acces(1) ? `<div class="scroll-x"><table class="dtable ha-t"><thead><tr><th>Année</th><th class="num">${act ? "Cours 31/12" : "VL 31/12"}</th><th class="num">Var.</th>
          ${act ? `<th class="num c-div">Dividende</th>` : ""}<th class="num">${act ? "Total" : "Perf."}</th><th class="ha-barre"></th></tr></thead><tbody>${lignes}</tbody></table></div>`
        : verrou(1, "Le détail année par année")}
      <p class="small muted">${acces(1) && act ? "Total = variation du cours + dividende. " : ""}* année en cours, depuis le 1er janvier.
        Performances passées${act ? ", ajustées des fractionnements" : ""} : elles ne préjugent pas des performances futures.</p></div>`;
  }
  const SANTE = { A: "Très solide", B: "Solide", C: "Correcte", D: "Fragile", E: "Très fragile" };
  function tendanceCours(c, raisons) {
    const m = /Tech\.\s*(Hausse|Baisse|Neutre|Stable)\s*\((\d+)\s*%\)/i.exec(raisons || "");
    if (m) {
      const k = /hausse/i.test(m[1]) ? "hausse" : /baisse/i.test(m[1]) ? "baisse" : "stable";
      return { k, conf: +m[2], lib: { hausse: "En hausse", baisse: "En baisse", stable: "Stable" }[k], fl: { hausse: "↗", baisse: "↘", stable: "→" }[k] };
    }
    const pts = c?.points;
    if (!pts || pts.length < 8) return null;
    const debut = pts.slice(0, Math.max(3, Math.floor(pts.length / 4)));
    const ref = debut.reduce((a, v) => a + v, 0) / debut.length, ch = pts[pts.length - 1] / ref - 1;
    const k = ch > 0.04 ? "hausse" : ch < -0.04 ? "baisse" : "stable";
    return { k, ch, lib: { hausse: "En hausse", baisse: "En baisse", stable: "Stable" }[k], fl: { hausse: "↗", baisse: "↘", stable: "→" }[k] };
  }
  function phraseReperes(note, t) {
    const sol = /[AB]/.test(note || ""), fra = /[DE]/.test(note || "");
    if (!note || !t) return "";
    if (sol && t.k === "hausse") return "Entreprise solide et cours porteur.";
    if (sol && t.k === "baisse") return "Entreprise solide, mais le marché hésite en ce moment.";
    if (sol) return "Entreprise solide, cours stable.";
    if (fra && t.k === "hausse") return "Le cours monte, mais l'entreprise est fragile : prudence.";
    if (fra && t.k === "baisse") return "Entreprise fragile et cours en baisse.";
    if (fra) return "Entreprise fragile, cours stable.";
    return `Santé financière correcte, cours ${t.lib.toLowerCase()}.`;
  }
  function reperes(r) {
    const note = r.analyse?.note, t = tendanceCours(r.courbe, r.raisons);
    const sol = /[AB]/.test(note || ""), fra = /[DE]/.test(note || "");
    const caseActive = (ligne, col) => (ligne === "sol" ? sol : fra) && t && (col === "h" ? t.k === "hausse" : t.k === "baisse") ? " actif" : "";
    return `<div class="reperes">
      <div class="rp-tuile"><span class="rp-lbl">Santé financière</span>
        ${note ? `<span class="rp-val"><span class="grade sm g-${esc(note)}">${esc(note)}</span> ${SANTE[note] || ""}</span>` : `<span class="rp-val muted">Non notée</span>`}</div>
      <div class="rp-tuile"><span class="rp-lbl">Tendance du cours</span>
        ${t ? `<span class="rp-val t-${t.k}">${t.fl} ${t.lib} <small>${t.conf ? `confiance ${t.conf} %` : `${P(t.ch)} sur 3 mois`}</small></span>` : `<span class="rp-val muted">–</span>`}</div>
      <div class="rp-tuile"><span class="rp-lbl">Score BafiBourse</span><span class="rp-val">${N(r.score)}<small>/100</small> ${chip(r.decision)}</span></div>
    </div>
    ${note && t ? `<div class="quadrant" role="img" aria-label="${esc(phraseReperes(note, t))}">
      <span></span><span class="q-tete">Cours en hausse</span><span class="q-tete">Cours en baisse</span>
      <span class="q-cote">Solide (A, B)</span><span class="q-case${caseActive("sol", "h")}">Solide et porteuse</span><span class="q-case${caseActive("sol", "b")}">Solide, le marché hésite</span>
      <span class="q-cote">Fragile (D, E)</span><span class="q-case${caseActive("fra", "h")}">Le cours monte, prudence</span><span class="q-case${caseActive("fra", "b")}">Fragile et délaissée</span>
    </div><p class="rp-phrase">${esc(phraseReperes(note, t))} <span class="muted">Le score résume les deux, avec le dividende, la valorisation et la liquidité.</span></p>` : ""}`;
  }
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
    let h = `<div class="fin"><div class="fin-head"><span class="grade g-${esc(a.note || "x")}" aria-label="Santé financière ${esc(a.note || "non disponible")}">${esc(a.note || "–")}</span>
      <div><b>Santé financière : ${esc(SANTE[a.note] || "non notée")}</b><div class="sub">Note ${esc(a.note || "–")} · perspective ${esc((a.perspective || "–").toLowerCase())}</div></div></div>`;
    // états financiers mal lus : la note est plafonnée et l'utilisateur est prévenu, dans toutes les formules
    if (a.fiabilite === "partielle") h += `<div class="notice small">ⓘ <b>Analyse partielle.</b> Certains indicateurs de cette société sont en cours de vérification par notre équipe :
      l'appréciation sera complétée dès leur validation.</div>`;
    if (!acces(2)) {                                          // Essentiel : le pourquoi en un coup d'œil ; le détail est réservé à l'Investisseur
      if (a.familles?.length) h += `<ul class="fam-pastilles" aria-label="Ce qui fait la note">${a.familles.map((f) =>
        `<li class="fp-${/bon/i.test(f.appreciation || "") ? "bon" : /faible/i.test(f.appreciation || "") ? "faible" : "moyen"}">${esc(f.nom)}</li>`).join("")}</ul>
        <p class="small muted fp-legende"><span class="fp-bon">bon</span> <span class="fp-moyen">moyen</span> <span class="fp-faible">faible</span></p>`;
      return h + verrou(2, "Le verdict détaillé, les niveaux de prix, les chiffres clés et les ratios") + `</div>`;
    }
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

  // Message de confirmation : texte, détail facultatif et boutons d'action (« Annuler », « Voir »).
  // Avec des boutons, il reste 8 s, et ne disparaît pas tant que le doigt ou le clavier est dessus.
  function toast(msg, o = {}) {
    const t = $("#toast"), actions = o.actions || [];
    const cacher = () => { clearTimeout(toast.t); t.hidden = true; };
    const lancer = () => { clearTimeout(toast.t); toast.t = setTimeout(cacher, o.duree || (actions.length ? 8000 : 4000)); };
    t.innerHTML = `<div class="toast-txt"><b>${esc(msg)}</b>${o.detail ? `<span>${esc(o.detail)}</span>` : ""}</div>`
      + (actions.length ? `<div class="toast-act">${actions.map((a, i) => `<button type="button" class="btn link" data-i="${i}">${esc(a.label)}</button>`).join("")}</div>` : "");
    t.classList.toggle("riche", !!(o.detail || actions.length));
    actions.forEach((a, i) => t.querySelector(`[data-i="${i}"]`).addEventListener("click", () => { cacher(); a.fn(); }));
    t.onpointerenter = t.onfocusin = () => clearTimeout(toast.t);
    t.onpointerleave = t.onfocusout = lancer;
    t.hidden = false;
    lancer();
  }
  // Bouton « occupé » pendant l'envoi : il ne réagit plus (pas de double enregistrement) et le dit.
  // fin("✓ Enregistré") affiche brièvement le succès sur le bouton ; fin() le remet tel quel.
  function occupe(b, texte = "Enregistrement…") {
    if (!b) return () => {};
    const avant = b.textContent;
    b.disabled = true; b.setAttribute("aria-busy", "true"); b.textContent = texte;
    return (succes) => {
      b.removeAttribute("aria-busy");
      if (!succes) { b.textContent = avant; b.disabled = false; return; }
      b.textContent = succes;
      setTimeout(() => { b.textContent = avant; b.disabled = false; }, 1500);
    };
  }
  // Confirmation qui reste sous le bouton d'un formulaire du Profil, jusqu'à la prochaine modification
  function confirmeForm(f, suite) {
    if (!f || !$(".actions", f)) return;
    let m = $(".ok-msg", f);
    if (!m) { m = document.createElement("p"); m.className = "ok-msg"; m.setAttribute("role", "status"); $(".actions", f).before(m); }
    const h = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
    setTimeout(() => { m.textContent = `✓ Enregistré à ${h}${suite ? " : " + suite : ""}`; }, 60);
    f.addEventListener("input", () => { m.textContent = ""; }, { once: true });
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
      // creer = false : reconnexion seulement (erreur si aucun compte avec cette adresse)
      login: async (email, creer) => r(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !!creer, emailRedirectTo: location.origin + location.pathname } })),
      verify: async (email, token) => r(await sb.auth.verifyOtp({ email, token, type: "email" })),
      logout: async () => { await sb.auth.signOut(); location.href = "../?deconnecte=1"; },   // retour à la page d'accueil
      // tous les appareils : les jetons de renouvellement sont révoqués côté serveur (téléphone perdu, ordinateur partagé)
      logoutPartout: async () => { await sb.auth.signOut({ scope: "global" }); location.href = "../?deconnecte=1"; },
      seanceRecente: async () => { const { data } = await sb.from("seances").select("date").order("date", { ascending: false }).limit(1); return data?.[0]?.date || null; },
      profil: async (uid) => r(await sb.from("profils").select("*").eq("id", uid).maybeSingle()),
      saveProfil: async (uid, p) => r(await sb.from("profils").update(p).eq("id", uid)),
      seance: async () => r(await sb.from("seances").select("*").order("date", { ascending: false }).limit(1))[0] || null,
      proposition: async (uid) => r(await sb.from("propositions").select("date,contenu").eq("user_id", uid)
        .order("date", { ascending: false }).limit(1))[0] || null,
      // Secours : dernier historique de performance non vide (si le calcul du soir n'en a pas produit)
      historiqueSecours: async (uid) => (r(await sb.from("propositions").select("date,historique:contenu->historique,performance:contenu->performance")
        .eq("user_id", uid).order("date", { ascending: false }).limit(15)) || []).find((x) => Array.isArray(x.historique) && x.historique.length) || null,
      operations: async () => ajusterFractionnements(r(await sb.from("operations").select("id,date,type,ticker,quantite,prix,frais,montant,note")
        .order("date").order("id"))),
      fractionnements: async () => { const { data, error } = await sb.from("fractionnements").select("ticker,date,facteur"); if (error) throw error; return data || []; },
      addOperation: async (op) => r(await sb.from("operations").insert(op)),
      // Import d'un document de la SGI : plusieurs opérations en une seule écriture (tout ou rien)
      addOperations: async (ops) => (r(await sb.from("operations").insert(ops).select("id")) || []).map((x) => x.id),
      lireDocument: async (type, donnees) => {
        const { data, error } = await sb.functions.invoke("lire-document", { body: { type, donnees } });
        if (error) {
          let m = error.message;
          try { m = (await error.context?.json())?.erreur || m; } catch (e) { /* message d'origine */ }
          const err = new Error(m); err.quota = error.context?.status === 402; throw err;
        }
        return data;
      },
      deleteOperation: async (id) => r(await sb.from("operations").delete().eq("id", id)),
      table: async (name, date) => r(await sb.from(name).select("*").eq("date", date).limit(2000)),
      // Dernier cours connu d'un titre absent de l'analyse du jour : on cherche dans les trois tables
      dernierCours: async (code, avant) => {
        for (const [t, col] of [["actions_analyse", "cours"], ["obligations_analyse", "prix"], ["opcvm_analyse", "vl"]]) {
          const { data } = await sb.from(t).select(`date,nom,${col}`).eq("code", code).lt("date", avant).not(col, "is", null)
            .order("date", { ascending: false }).limit(1);
          if (data?.length) return { date: data[0].date, cours: +data[0][col], nom: data[0].nom, classe: t.split("_")[0] };
        }
        return null;
      },
      cibles: async (date, profil) => r(await sb.from("cibles_profil").select("*").eq("date", date).eq("profil", profil)),
      indices: async () => {
        const depuis = new Date(Date.now() - 5.2 * 365 * 864e5).toISOString().slice(0, 10), out = [];
        for (let a = 0; ; a += 1000) {
          const page = r(await sb.from("indices").select("date,code,cloture,variation").gte("date", depuis)
            .order("date").order("code").range(a, a + 999)) || [];
          out.push(...page);
          if (page.length < 1000) break;
        }
        return out;
      },
      annonce: async () => r(await sb.from("annonces").select("message,niveau").order("cree_le", { ascending: false }).limit(1))[0] || null,
      // Épargne mise de côté (supabase/epargne.sql) : erreur si le fichier n'est pas installé → fonctions masquées
      coffre: async () => r(await sb.rpc("mon_epargne")),
      addMouvement: async (m) => r(await sb.rpc("epargne_mouvement", { p_date: m.date, p_type: m.type, p_montant: m.montant,
                                                                     p_source: m.source || "", p_note: m.note || null })),
      envoyerSgi: async (date, montant) => r(await sb.rpc("epargne_envoyer_sgi", { p_date: date, p_montant: montant })),
      savePlan: async (pl) => r(await sb.from("coffre_plans").upsert({ user_id: S.user.id, montant: pl.montant, rythme: pl.rythme,
                                  jours_ouvres: pl.jours_ouvres, objectif: pl.objectif, debut: pl.debut }, { onConflict: "user_id" })),
      mode: async () => r(await sb.rpc("mode_recommandation")),
      // Univers accessible (supabase/univers.sql) : erreur si le fichier n'est pas installé → rubrique masquée
      // pays des SGI (drapeaux) : colonne ajoutée par une version plus récente de univers.sql → repli sans elle
      sgi: async () => { const q = await sb.from("sgi").select("nom,pays").eq("actif", true).order("nom");
        return q.error ? r(await sb.from("sgi").select("nom").eq("actif", true).order("nom")) : q.data; },
      gestionnaires: async () => { const q = await sb.from("gestionnaires_acces").select("gestionnaire,sgo_directe,distributeurs,confirme,pays");
        return q.error ? r(await sb.from("gestionnaires_acces").select("gestionnaire,sgo_directe,distributeurs,confirme")) : q.data; },
      titresPays: async () => r(await sb.from("titres_pays").select("code,pays")),
      documents: async () => r(await sb.from("documents_legaux").select("type,version,titre,texte,publie_le").order("version", { ascending: false })),
      // Avis des utilisateurs (avis.sql) : lecture de son propre avis, envoi par la fonction donner_avis
      noterDemandeAvis: async (d) => { await sb.from("avis_demandes").insert(d); },
      // Cercles d'épargne (cercles.sql)
      cercles: async () => { const { data, error } = await sb.rpc("mes_cercles"); if (error) throw error; return data || []; },
      creerCercle: async (nom, objectif) => { const { data, error } = await sb.rpc("creer_cercle", { p_nom: nom, p_objectif: objectif }); if (error) throw new Error(error.message); return data; },
      apercuCercle: async (code) => { const { data, error } = await sb.rpc("apercu_cercle", { p_code: code }); if (error) throw new Error(error.message); return data; },
      rejoindreCercle: async (code) => { const { data, error } = await sb.rpc("rejoindre_cercle", { p_code: code }); if (error) throw new Error(error.message); return data; },
      quitterCercle: async (id) => { const { error } = await sb.rpc("quitter_cercle", { p_cercle: id }); if (error) throw new Error(error.message); },
      // cercles publics (cercles-publics.sql)
      cerclesPublics: async (onglet, rythme, taille) => { const { data, error } = await sb.rpc("cercles_publics", { p_onglet: onglet, p_rythme: rythme || null, p_taille: taille || null }); if (error) throw new Error(error.message); return data; },
      demanderAdhesion: async (id, message) => { const { error } = await sb.rpc("demander_adhesion", { p_cercle: id, p_message: message || null }); if (error) throw new Error(error.message); },
      annulerDemande: async (id) => { const { error } = await sb.rpc("annuler_demande", { p_id: id }); if (error) throw new Error(error.message); },
      mesDemandes: async () => { const { data, error } = await sb.rpc("mes_demandes"); if (error) throw new Error(error.message); return data || []; },
      demandesRecues: async () => { const { data, error } = await sb.rpc("demandes_recues"); if (error) throw new Error(error.message); return data || []; },
      repondreDemande: async (id, ok) => { const { error } = await sb.rpc("repondre_demande", { p_id: id, p_accepter: ok }); if (error) throw new Error(error.message); },
      signalerCercle: async (id, motif) => { const { error } = await sb.rpc("signaler_cercle", { p_cercle: id, p_motif: motif || null }); if (error) throw new Error(error.message); },
      publierCercle: async (id, pub, pres) => { const { data, error } = await sb.rpc("publier_cercle", { p_cercle: id, p_public: pub, p_presentation: pres || null }); if (error) throw new Error(error.message); return data; },
      publierRegularite: async (x) => { const { error } = await sb.from("epargne_publique").upsert({ ...x, user_id: S.user.id, maj_le: new Date().toISOString() }); if (error) throw error; },
      // Rappels du soir (rappels.sql)
      rappels: async () => r(await sb.from("rappels").select("push, whatsapp, heure, epargne").maybeSingle()),
      sauverRappels: async (x) => { r(await sb.from("rappels").upsert({ ...x, user_id: S.user.id, modifie_le: new Date().toISOString() })); },
      abonnerPush: async (a) => { r(await sb.from("push_abonnements").upsert({ ...a, user_id: S.user.id, actif: true })); },
      desabonnerPush: async (endpoint) => { r(await sb.from("push_abonnements").delete().eq("endpoint", endpoint)); },
      essaiRappel: async () => {
        const { data, error } = await sb.functions.invoke("rappels", { body: { essai: true } });
        if (error) { let m = error.message; try { m = (await error.context?.json())?.erreur || m; } catch (e) { /* message d'origine */ } throw new Error(m); }
        return data;
      },
      monAvis: async () => {
        const { data, error } = await sb.from("avis").select("note,commentaire,publication,ville,statut,motif_refus,recommandation").maybeSingle();
        if (error) throw error;
        return data;
      },
      donnerAvis: async (a) => {
        const { data, error } = await sb.rpc("donner_avis", { p_note: a.note, p_commentaire: a.commentaire, p_publication: a.publication, p_ville: a.ville,
                                                             p_recommandation: a.recommandation ?? null });
        if (error) throw new Error(error.message);
        return data;
      },
      // Prise en main : événements pour les indicateurs de la console (tutoriel.sql) ; sans effet si la table manque
      evenementTutoriel: async (evenement, etape) => { await sb.from("tutoriel_evenements").insert({ evenement, etape }); },
      // Alertes des positions (vue v_alertes_positions, fichier alertes.sql) : erreur si la vue n'est pas installée → rubrique masquée
      alertes: async () => r(await sb.from("v_alertes_positions").select("classe_actif,ticker,alerte,motif,plancher,jours_echeance,perf_pct,dernier_cours")),
      // Abonnements (abonnements.sql) : formule, quotas, demandes, parrainage
      maFormule: async () => { const { data, error } = await sb.rpc("ma_formule"); if (error) throw error; return data; },
      demanderAbonnement: async (d) => r(await sb.from("abonnement_demandes").insert(d)),
      // paiement en ligne PayDunya (fonction serveur « paiement ») : création de la facture, puis vérification au retour
      payer: async (objet) => { const { data, error } = await sb.functions.invoke("paiement", { body: { objet } });
        if (error) { let m = error.message; try { m = (await error.context?.json())?.erreur || m; } catch (e) { /* message d'origine */ } throw new Error(m); } return data; },
      verifierPaiement: async (token) => { const { data, error } = await sb.functions.invoke("paiement", { body: { verifier: token } });
        if (error) { let m = error.message; try { m = (await error.context?.json())?.erreur || m; } catch (e) { /* message d'origine */ } throw new Error(m); } return data; },
      tarifs: async () => {
        const [t, q] = await Promise.all([sb.from("tarifs").select("objet,libelle,prix,duree_mois,credit_questions,credit_pages,ordre").order("ordre"),
                                          sb.from("quotas_formules").select("formule,questions,questions_debut,approfondies,pages")]);
        if (t.error) throw t.error;
        return { tarifs: t.data || [], quotas: q.data || [] };
      },
      definirParrain: async (code) => { const { data } = await sb.rpc("definir_parrain", { p_code: code }); return data; },
      // Assistant : fonction Supabase « assistant » (la clé de l'API Claude reste sur le serveur)
      assistant: async (body) => {
        const { data, error } = await sb.functions.invoke("assistant", { body });
        if (error) {
          let msg = error.message || "erreur inconnue", code = error.context?.status;
          try { const j = await error.context.json(); if (j?.erreur) msg = j.erreur; } catch (e) { /* réponse non JSON */ }
          let j2 = null; try { j2 = await error.context.clone?.().json(); } catch (e) { /* déjà lu */ }
          const err = new Error(msg); err.status = code; err.quota = code === 402; throw err;
        }
        return data;
      },
    };
  }

  function demoApi() {
    let data = null, nextId = 10000;
    const load = async () => (data ??= debutDemo(await (await fetch("demo.json")).json()));
    // Démo « mes premiers jours » : le même marché, mais un compte qui démarre (un versement, un premier achat)
    const debutDemo = (d) => {
      (d.actions || []).forEach((r, i) => { if (r.historique_annuel || !r.cours) return;
        const an = new Date().getFullYear(), vars = [0.15, 0.12, -0.08, 0.13, 0.06, 0.04].map((v, k) => v + ((i * 7 + k * 3) % 9 - 4) / 100);
        let c = +r.cours / vars.slice(-1).reduce((a, v) => a * (1 + v), 1) / vars.slice(0, 5).reduce((a, v) => a * (1 + v), 1);
        const annees = vars.map((v, k) => { const prec = c; c = prec * (1 + v); const dv = Math.round(prec * 0.06);
          return { annee: an - 5 + k, cours: Math.round(c), variation: v, dividende: dv, rendement_dividende: dv / prec, total: v + dv / prec, en_cours: k === 5 }; });
        const comp = annees.filter((l) => !l.en_cours), prod = comp.reduce((a, l) => a * (1 + l.total), 1), pire = comp.reduce((m, l) => (l.total < m.total ? l : m));
        r.historique_annuel = { annees, moyenne_annuelle: prod ** (1 / comp.length) - 1, nb_annees: comp.length, pire_annee: pire.annee, pire_total: pire.total }; });
      if (!DEMO_DEBUT) return d;
      const jour = (n) => { const x = new Date(); x.setDate(x.getDate() - n); while ([0, 6].includes(x.getDay())) x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };
      const snts = (d.actions || []).find((r) => r.code === "SNTS");
      d.operations = [
        { id: 1, date: jour(8), type: "DEPOT", ticker: null, quantite: null, prix: null, frais: null, montant: 250000, note: null },
        { id: 2, date: jour(6), type: "ACHAT", ticker: "SNTS", quantite: 5, prix: +(snts?.cours || 25000), frais: null, montant: null, note: null }];
      if (d.proposition?.contenu?.historique) d.proposition.contenu.historique = d.proposition.contenu.historique.slice(-5);
      return d;
    };
    const names = { actions_analyse: "actions", obligations_analyse: "obligations", opcvm_analyse: "opcvm" };
    return {
      session: async () => { await load(); return { user: { id: "demo", email: data.profil.email } }; },
      onAuth: () => {},
      login: async () => {}, verify: async () => {},
      logout: async () => { location.href = "../?deconnecte=1"; },
      profil: async () => ({ ...(await load()).profil }),
      saveProfil: async (_u, p) => { Object.assign((await load()).profil, p); },
      seance: async () => (await load()).seance,
      proposition: async () => (await load()).proposition,
      sgi: async () => [["Alpha Bourse", "CI"], ["Beta Securities", "SN"], ["Gamma Finance", "CI"], ["Omega Capital", "BF"]].map(([nom, pays]) => ({ nom, pays })),
      gestionnaires: async () => [["ALPHA AM", ["Alpha Bourse"]], ["BETA GESTION", ["Beta Securities"]], ["DELTA ASSET", []],
        ["GAMMA CAPITAL", ["Gamma Finance"]], ["OMEGA FINANCE", ["Omega Capital"]], ["SIGMA AM", []]]
        .map(([gestionnaire, distributeurs], i) => ({ gestionnaire, distributeurs, sgo_directe: true, confirme: false, pays: ["CI", "SN", "CI", "BF", "CI", "TG"][i] })),
      titresPays: async () => [],
      operations: async () => (await load()).operations.slice(),
      addOperation: async (op) => {
        const d = await load();
        d.operations.push({ ...op, id: nextId++ });
        d.operations.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      },
      deleteOperation: async (id) => { const d = await load(); d.operations = d.operations.filter((o) => o.id !== id); },
      historiqueSecours: async () => null,
      addOperations: async (ops) => {
        const d = await load(), ids = ops.map(() => nextId++);
        ops.forEach((op, k) => d.operations.push({ ...op, id: ids[k] }));
        d.operations.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
        return ids;
      },
      // Démonstration : lecture simulée d'un avis d'exécution et d'un relevé (aucun envoi)
      lireDocument: async (type) => {
        await new Promise((ok) => setTimeout(ok, 1400));
        return type === "application/pdf" ? {
          document: { nature: "releve_compte", sgi: "SGI de démonstration", periode_debut: "2026-07-01", periode_fin: "2026-09-30" },
          operations: [
            { type: "DIVIDENDE", date: "2026-08-14", titre: "SONATEL SENEGAL", montant_net: 18200, libelle: "Encaissement Div SONATEL 2025" },
            { type: "FRAIS", date: "2026-09-30", montant_net: 3540, libelle: "Retenues Frais accès WEB" },
            { type: "FRAIS", date: "2026-09-30", montant_net: 1770, libelle: "Retenues Frais de gestion" },
            { type: "DEPOT", date: "2026-07-03", montant_net: 600000, libelle: "Versement espèces" },
            { type: "VENTE", date: "2026-07-20", titre: "ORANGE COTE D'IVOIRE", quantite: 30, cours: 341, frais: 133, montant_net: 10097, libelle: "Vente ORAC" }],
          positions: [{ titre: "SONATEL SENEGAL", quantite: 20 }, { titre: "ORANGE COTE D'IVOIRE", quantite: 30 }, { titre: "PALM CI", quantite: 40 }],
          liquidites: { date: "2026-09-30", montant: 1890000 },
        } : {
          document: { nature: "avis_execution", sgi: "SGI de démonstration", date: "2026-10-09" },
          operations: [{ type: "ACHAT", date: "2026-10-09", titre: "SOCIETE GENERALE COTE D'IVOIRE", isin: "CI0000000600", quantite: 6,
                         cours: 10100, montant_brut: 60600, frais: 962, montant_net: 61562, reference: "2026100912" }],
        };
      },
      table: async (name) => (await load())[names[name]],
      dernierCours: async () => null,
      cibles: async (_d, profil) => (await load()).cibles.filter((c) => c.profil === profil),
      indices: async () => (await load()).indices || [],
      // Épargne mise de côté : en démonstration, un plan quotidien et quelques semaines de versements fictifs
      coffre: async () => {
        const d = await load();
        if (!d.coffre) {
          const iso = (dt) => new Date(dt.getTime() - dt.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
          const mv = [], src = ["especes", "mobile", "especes", "banque"];
          let id = 1;
          const ouvres = [];                                                    // jours ouvrés, du plus récent au plus ancien
          for (let j = 1; j <= 40; j++) { const dt = new Date(); dt.setDate(dt.getDate() - j); if (![0, 6].includes(dt.getDay())) ouvres.push(j); }
          const manques = DEMO_DEBUT ? new Set() : new Set([6, 7, 11, 16, 21].map((i) => ouvres[i]));   // série de 6 jours en cours ; avant, des séries plus courtes
          for (let j = DEMO_DEBUT ? 7 : 34; j >= 1; j--) {
            const dt = new Date(); dt.setDate(dt.getDate() - j);
            if ([0, 6].includes(dt.getDay()) || manques.has(j)) continue;
            mv.push({ id: id++, date: iso(dt), type: "VERSEMENT", montant: j % 6 === 0 ? 10000 : 5000, source: src[j % 4] });
          }
          const debut = new Date(); debut.setDate(debut.getDate() - (DEMO_DEBUT ? 8 : 34));
          d.coffre = { plan: { montant: 5000, rythme: "quotidien", jours_ouvres: true, objectif: 500000, debut: iso(debut) }, mouvements: mv, nextId: id };
        }
        return { plan: d.coffre.plan && { ...d.coffre.plan }, mouvements: d.coffre.mouvements.slice(), seuil: 100000 };
      },
      addMouvement: async (m) => { const d = await load(); if (!d.coffre) await api.coffre(); d.coffre.mouvements.push({ ...m, id: d.coffre.nextId++ }); },
      envoyerSgi: async (date, montant) => {
        const d = await load();
        if (!d.coffre) await api.coffre();
        d.coffre.mouvements.push({ id: d.coffre.nextId++, date, type: "TRANSFERT", montant });
        d.operations.push({ id: nextId++, date, type: "DEPOT", ticker: null, quantite: null, prix: null, frais: null, montant, note: "Depuis mon épargne" });
        d.operations.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      },
      savePlan: async (pl) => { (await load()).coffre.plan = { ...pl }; },
      annonce: async () => (await load()).annonce || null,
      documents: async () => (await load()).documents || [],
      alertes: async () => alertesDemo(),
      evenementTutoriel: async () => {},
      monAvis: async () => avisDemo,
      noterDemandeAvis: async () => {},
      rappels: async () => rappelsDemo, sauverRappels: async (x) => { rappelsDemo = { ...rappelsDemo, ...x }; },
      cercles: async () => cerclesDemo,
      maFormule: async () => ({ formule: new URLSearchParams(location.search).get("formule") || "essentiel", souscrite: "essentiel", essai: true,
        fin: new Date(Date.now() + 9 * 864e5).toISOString(), quotas: { questions: 100, approfondies: 0, pages: 15 },
        usage: { questions: 37, approfondies: 0, pages: 4 }, credits: { questions: 0, pages: 0 }, code_parrain: "DEMO2026", filleuls: 1, demande: null }),
      demanderAbonnement: async () => {}, definirParrain: async () => true,
      payer: async () => { throw new Error("En démonstration, le paiement n'est pas disponible : créez votre compte pour choisir votre formule."); },
      verifierPaiement: async () => ({ statut: "en_attente" }),
      tarifs: async () => { throw new Error("démo : tarifs par défaut"); },
      creerCercle: async (nom, objectif) => {
        const c = { id: "c" + Date.now(), nom, code: Math.random().toString(16).slice(2, 10).toUpperCase(), objectif_pct: objectif, createur: true,
                    membres: [{ pseudo: "Vous", moi: true, serie: 6, unite: "jour", record: 9, jours_mois: 14, tenues: 14, attendues: 17, regularite: 0.8 }] };
        cerclesDemo = [...cerclesDemo, c]; return c;
      },
      apercuCercle: async (code) => ({ nom: "Les amis de la fac", objectif_jours: 15, objectif_pct: 80, membres: 4, deja: cerclesDemo.some((c) => c.code === code) }),
      rejoindreCercle: async () => ({ nom: "Les amis de la fac", deja: false }),
      quitterCercle: async (id) => { cerclesDemo = cerclesDemo.filter((c) => c.id !== id); },
      publierRegularite: async () => {},
      cerclesPublics: async (onglet) => {
        const L = PUBLICS_DEMO.filter((c) => onglet === "top" ? c.membres >= 3 && !c.nouveau : c.places > 0)
          .map((c) => ({ ...c, demande: DEMANDES_DEMO.has(c.id) })).sort((a, b) => b.regularite - a.regularite).slice(0, onglet === "top" ? 10 : 30);
        return { cercles: L.map((c, i) => ({ ...c, rang: i + 1 })), filtres: new URLSearchParams(location.search).get("formule") === "investisseur" };
      },
      demanderAdhesion: async (id) => { DEMANDES_DEMO.add(id); },
      annulerDemande: async (id) => { DEMANDES_DEMO.delete(id); },
      mesDemandes: async () => PUBLICS_DEMO.filter((c) => DEMANDES_DEMO.has(c.id)).map((c) => ({ id: c.id, cercle_id: c.id, nom: c.nom })),
      demandesRecues: async () => RECUES_DEMO,
      repondreDemande: async (id, ok) => { const d = RECUES_DEMO.find((x) => x.id === id); RECUES_DEMO = RECUES_DEMO.filter((x) => x.id !== id);
        const c = cerclesDemo.find((x) => x.id === d?.cercle_id); if (c) { c.demandes = RECUES_DEMO.length;
          if (ok) c.membres.push({ pseudo: d.pseudo, moi: false, serie: 0, unite: "jour", record: 0, tenues: 0, attendues: 0 }); } },
      signalerCercle: async () => {},
      publierCercle: async (id, pub, pres) => { const c = cerclesDemo.find((x) => x.id === id); if (c) { c.public = pub; c.presentation = pres; c.capacite = pub ? 30 : 20; } return { public: pub }; },
      abonnerPush: async () => {}, desabonnerPush: async () => {}, essaiRappel: async () => ({ demo: true }),
      donnerAvis: async (a) => {
        const st = a.publication && (a.commentaire || "").length >= 20 ? "en_attente" : "prive";
        avisDemo = { ...a, statut: st }; return { statut: st };
      },
      assistant: async (body) => {
        await new Promise((ok) => setTimeout(ok, 700));
        const c = body.contexte || {}, pf = c.portefeuille || {}, al = c.alertes_titres || [];
        return { texte: `En démonstration, je réponds seulement avec les données fictives de l'écran.\n\n`
          + `- Votre portefeuille de démonstration vaut **${F(pf.valeur_totale)}**, dont ${F(pf.disponible)} disponibles chez la SGI.\n`
          + `- ${al.length ? `${al.length} alerte${al.length > 1 ? "s" : ""} à regarder, par exemple ${al[0].code} : ${al[0].motif}` : "Aucune alerte sur vos titres."}\n\n`
          + `Avec un compte, je réponds à votre question réelle et je peux chercher l'actualité publiée des sociétés.`, sources: [] };
      },
    };
  }

  const api = DEMO ? demoApi() : supaApi();
  const S = { vus: new Set(), user: null, profil: null, seance: null, prop: null, ops: [], mk: { actions: [], obligations: [], opcvm: [] },
              cibles: [], prices: new Map(), names: new Map(), classes: new Map(),
              ui: { mkTab: "actions", mkFilter: "opp", mkQuery: "", mkShow: 30, perf: 1, tend: "1a" } };

  // ---------------------------------------------------------------- journal → positions (même méthode que l'outil)
  // Opérations du « point de départ » (titres déjà détenus à l'arrivée) : repérées par leur note
  const estDepart = (o) => /point de d[ée]part/i.test(o.note || "") && ok(o.montant);
  function replay(ops) {
    const pos = new Map();
    let cash = 0, apports = 0, realise = 0, dividendes = 0, fraisOps = 0, avantArrivee = 0;
    const errors = [];
    for (const o of ops) {
      const t = o.ticker || "", q = +o.quantite || 0, p = +o.prix || 0, m = +o.montant || 0;
      const fee = ok(o.frais) ? +o.frais : (o.type === "ACHAT" || o.type === "VENTE" ? q * p * FEES : 0);
      if (o.type === "DEPOT") { cash += m; apports += m; }
      else if (o.type === "RETRAIT") { cash -= m; apports -= m; }
      else if (o.type === "FRAIS") { cash -= m; fraisOps += m; }
      else if (o.type === "ACHAT" && estDepart(o)) {
        // Point de départ : titres déjà détenus à l'arrivée. Prix = prix de revient de la SGI (pour la plus-value
        // de chaque ligne) ; la trésorerie et les apports comptent leur valeur du jour (montant) : le gain total part de zéro.
        cash -= m;
        avantArrivee += m - q * p;
        const x = pos.get(t) || { q: 0, cost: 0 };
        x.q += q; x.cost += q * p; pos.set(t, x);
      }
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
      const cours = S.prices.get(code), sansCours = !ok(cours);
      const valeur = sansCours ? x.cost : x.q * cours;          // sans aucun cours : compté au prix d'achat, frais compris
      return { code, quantite: x.q, pru: x.cost / x.q, cout: x.cost, cours, valeur, sansCours, coursDu: S.coursAnciens?.get(code) || null,
               pv: sansCours ? 0 : valeur * (1 - FEES) - x.cost, classe: S.classes.get(code) };
    }).sort((a, b) => (b.valeur || 0) - (a.valeur || 0));
    const cotes = positions.filter((p) => !p.sansCours);
    const investi = positions.reduce((s, p) => s + (p.valeur || 0), 0);
    const latent = positions.reduce((s, p) => s + (p.pv || 0), 0);
    const fraisVente = cotes.reduce((s, p) => s + p.valeur * FEES, 0);
    return { positions, cash, apports, errors, valeur: cash + investi, investi, latent, realise, dividendes, fraisOps, avantArrivee,
             fraisVente, gainTotal: cash + investi - apports,
             sansCours: positions.filter((p) => p.sansCours), coursAnciens: positions.filter((p) => p.coursDu) };
  }

  // ---------------------------------------------------------------- proposition instantanée (budget × poids cibles)
  // ---------------------------------------------------------------- univers accessible (Profil → Mes comptes et mes placements)
  const CHOIX_FCP = { accessibles: ["Seulement ceux que je peux souscrire", "Selon mes SGI (et les sociétés de gestion si je le précise)."],
    tous: ["Tous les FCP", "Sans tenir compte de mes SGI."], aucun: ["Aucun FCP", ""] };
  const CHOIX_OBLIG = { toutes: ["Toutes les obligations cotées", ""], publiques: ["États et institutions régionales seulement", "Pas d'émetteurs privés."],
    aucune: ["Aucune obligation", ""] };
  // Gestionnaires dont l'utilisateur peut souscrire les FCP ; null = pas de filtre (aucune SGI déclarée, univers absent)
  function accesFcp() {
    const p = S.profil || {}, U = S.univ;
    if (!U || (p.choix_fcp || "accessibles") !== "accessibles") return null;
    const mes = new Set(p.mes_sgi || []), dir = !!p.souscription_sgo;
    if (!mes.size && !dir) return null;
    return new Set(U.gest.filter((g) => (dir && g.sgo_directe !== false) || (g.distributeurs || []).some((x) => mes.has(x))).map((g) => g.gestionnaire));
  }
  // L'estimation immédiate respecte les choix du profil, comme le calcul du soir ; FCP et obligations détenus restent dans l'univers
  function permis(classe, code, detenus) {
    const p = S.profil || {};
    if (classe === "actions") return p.choix_actions !== false;
    if (detenus?.has(code)) return true;
    if (classe === "obligations") {
      const o = p.choix_obligations || "toutes";
      return o === "toutes" || (o === "publiques" && ["etat", "regional"].includes(S.mk.obligations.find((x) => x.code === code)?.categorie));
    }
    if (String(classe).startsWith("opcvm")) {
      if (p.choix_fcp === "aucun") return false;
      const a = accesFcp();
      return !a || a.has(S.mk.opcvm.find((x) => x.code === code)?.gestionnaire);
    }
    return true;
  }

  function noticesUnivers(c) {
    const p = S.profil || {};
    if (!S.univ) return "";
    if ((p.choix_fcp || "accessibles") === "accessibles" && !(p.mes_sgi || []).length && !p.souscription_sgo)
      return `<div class="notice info small">Indiquez votre SGI dans <a href="#profil">Profil → Mes comptes et mes placements</a> :
        seuls les FCP que vous pouvez souscrire vous seront alors ${SIM() ? "inclus dans la simulation" : "proposés"}.</div>`;
    const hors = c?.univers?.fcp_inaccessibles || [];
    if (!hors.length || !accesFcp()) return "";
    return `<div class="card"><h2>FCP bien notés, non souscriptibles par vos SGI</h2><ul class="list">${hors.map((f) => `<li><div class="main">
      <div class="name">${esc(f.nom)}</div><div class="sub">${esc(f.gestionnaire)} · se souscrit chez ${esc((f.ou || []).join(" ou ") || "–")}${f.confirme ? "" : " (à confirmer)"}</div></div></li>`).join("")}</ul>
      <p class="small muted">Pour les inclure, ajoutez une SGI qui les distribue dans votre profil.</p></div>`;
  }

  // Drapeau du pays d'un titre (déduit par pays.js, corrections de la console d'abord)
  function mq(code) {
    const P = window.BRVM_PAYS, x = S.lignesMk?.get(code);
    if (!P || !x) return "";
    return P.marque(P.de(x[0], x[1], S.paysTitres, S.paysGest), nomPays);
  }

  function estimate(budget, detenus, ciblesProfil = S.cibles) {
    // Même principe que le calcul du soir : chaque poche garde ses meilleures lignes de façon qu'aucune
    // ne descende sous MIN_LINE, puis nombre entier de titres au prix limite (frais compris).
    const byClass = {};
    const cibles = ciblesProfil.filter((c) => ok(c.prix) && +c.prix > 0 && permis(c.classe, c.code, detenus));
    const total = cibles.reduce((s, c) => s + +c.poids, 0) || 1;   // part retirée par les choix : répartie sur le reste
    for (const c of cibles) (byClass[c.classe] ||= []).push(c);
    const lines = [];
    let invest = 0, rdt = 0;
    for (const list of Object.values(byClass)) {
      const pocket = list.reduce((s, c) => s + +c.poids, 0) / total * budget;
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
  // Rejoue le journal dans l'ordre des dates (le même jour : achats avant ventes) et renvoie la première vente
  // impossible, c'est-à-dire supérieure aux titres détenus à sa date. Le calcul du soir refuse un tel journal.
  function venteImpossible(ops) {
    const rang = (t) => (t === "ACHAT" ? 0 : t === "VENTE" ? 2 : 1);
    const tri = ops.map((o, i) => ({ o, i })).sort((a, b) => String(a.o.date).localeCompare(String(b.o.date)) || rang(a.o.type) - rang(b.o.type) || a.i - b.i);
    const stock = new Map();
    for (const { o } of tri) {
      if (o.type === "ACHAT") stock.set(o.ticker, (stock.get(o.ticker) || 0) + +o.quantite);
      if (o.type === "VENTE") {
        const q = stock.get(o.ticker) || 0;
        if (+o.quantite > q + 1e-9) return { op: o, detenu: q };
        stock.set(o.ticker, q - +o.quantite);
      }
    }
    return null;
  }
  const texteVenteImpossible = (v) => `Vente de ${N(v.op.quantite)} ${S.names.get(v.op.ticker) || v.op.ticker} le ${D(v.op.date)} : `
    + (v.detenu > 0 ? `vous n'en déteniez que ${N(v.detenu)} à cette date.` : "vous n'en déteniez aucun à cette date.");

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
  // opts.montant : tester un autre montant (l'écart avec la valeur actuelle est traité comme un apport ou un retrait) ;
  // opts.cibles : les cibles d'un autre profil (simulateur). Rien n'est enregistré.
  function instantOrders(L, opts = {}) {
    const value = opts.montant ?? L.valeur;
    if (!(value > 0)) return { ordres: [], cible: [], rdt: null };
    const est = estimate(value, new Set(L.positions.map((p) => p.code)), opts.cibles || S.cibles), cible = est.lines;
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
    let cash = L.cash + (value - L.valeur) + sells.reduce((s, o) => s + o.quantite * o.prix_limite * (1 - FEES), 0);
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
    return { ordres: [...sells, ...buys], cible, rdt: est.rdt };
  }

  function classBar(lines) {
    const tot = {};
    let all = 0;
    for (const l of lines) { tot[l.classe] = (tot[l.classe] || 0) + (+l.montant || 0); all += +l.montant || 0; }
    if (!all) return "";
    const NOMS = { ...CLASSES, liquidites: "Disponible" }, keys = Object.keys(NOMS).filter((k) => tot[k] > 0);
    return `<div class="bar" role="img" aria-label="${esc(keys.map((k) => `${NOMS[k]} ${Math.round((tot[k] / all) * 100)} %`).join(", "))}">
      ${keys.map((k) => `<span style="width:${(tot[k] / all) * 100}%;background:${COLORS[k]}"></span>`).join("")}</div>
      <div class="legend">${keys.map((k) => `<span><i style="background:${COLORS[k]}"></i>${NOMS[k]} ${Math.round((tot[k] / all) * 100)} %</span>`).join("")}</div>`;
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
    // Série en cours : un oubli par période de 30 jours est couvert par le joker ; record : plus longue série
    const debutK = periode(debut, r), dateDe = (key) => (key.length === 7 ? key + "-01" : key), limJoker = addDays(now, -30);
    let k = jourCompte && faits.has(cur) ? cur : prevPeriode(cur, r, plan), tenus = 0, total = 0, serie = 0, enSerie = true;
    let joker = null, run = 0, record = 0;
    for (let i = 0; i < 400 && k >= debutK; i++, k = prevPeriode(k, r, plan)) {
      const fait = faits.has(k);
      if (i < n) { total++; if (fait) tenus++; }
      if (enSerie) {
        if (fait) serie++;
        else if (!joker && serie > 0 && dateDe(k) >= limJoker) joker = k;
        else enSerie = false;
      }
      if (fait) { run++; record = Math.max(record, run); } else run = 0;
    }
    record = Math.max(record, serie);
    Object.assign(e, { tenus, total, serie, record, joker, unite: r === "quotidien" ? "jour" : r === "hebdo" ? "semaine" : "mois" });
    // calendrier : 20 derniers jours ouvrés, 12 semaines ou 6 mois, du plus ancien au plus récent
    const cal = [];
    for (let i = 0, kk = cur; i < n && kk >= debutK; i++, kk = prevPeriode(kk, r, plan))
      cal.push({ k: kk, fait: faits.has(kk), joker: kk === joker, encours: kk === cur && !faits.has(kk) });
    e.calendrier = cal.reverse();
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
  // ---------------------------------------------------------------- encourager la régularité (trophées, félicitations)
  // On félicite l'épargne (versement, régularité, objectif), jamais les achats ou ventes de titres.
  const PALIERS = { quotidien: [3, 7, 14, 30, 60, 100], hebdo: [4, 8, 12, 26, 52], mensuel: [3, 6, 12, 24] };
  // Rang de chaque médaille : plus l'effort est long, plus le métal est précieux
  const RANGS = { bronze: "Bronze", argent: "Argent", or: "Or", platine: "Platine", diamant: "Diamant", legende: "Légende", emeraude: "Émeraude", saphir: "Saphir", rubis: "Rubis" };
  const RANG_SERIE = ["bronze", "argent", "or", "platine", "diamant", "legende"];
  const RANG_OBJECTIF = { 25: "bronze", 50: "argent", 75: "or", 100: "platine" };
  function trophees(e) {
    if (!e) return [];
    const r = e.plan?.rythme, u = e.unite || "jour", t = [];
    t.push({ id: "premier", titre: "Premier pas", marque: "1", metal: "emeraude", ok: e.verse > 0, rang: 1,
      msg: "Votre coffre est ouvert. Chaque versement compte : revenez au prochain rendez-vous pour lancer votre série." });
    if (r && e.plan?.montant) PALIERS[r].forEach((n, i) => t.push({ id: `serie-${r}-${n}`, titre: `${pluriel(n, u)} d'affilée`, marque: String(n), metal: RANG_SERIE[i],
      ok: Math.max(e.serie || 0, e.record || 0) >= n, reste: n - (e.serie || 0), unite: u, rang: 10 + n,
      msg: `Petit à petit, l'oiseau fait son nid : ${pluriel(n, u)} sans interruption. Continuez sur cette lancée !` }));
    if (e.objectif) for (const pc of [25, 50, 75, 100]) t.push({ id: `objectif-${e.objectif}-${pc}`, titre: pc === 100 ? "Objectif atteint" : `${pc} % de l'objectif`,
      marque: pc + "%", metal: RANG_OBJECTIF[pc], ok: e.verse >= (e.objectif * pc) / 100, rang: pc === 100 ? 500 : 200 + pc,
      msg: pc === 100 ? `Vous avez mis de côté ${F(e.verse)} : objectif de ${F(e.objectif)} atteint. Bravo pour votre discipline !`
        : `${F(e.verse)} épargnés sur ${F(e.objectif)}. ${pc === 50 ? "La moitié du chemin est faite !" : "Vous êtes sur la bonne voie."}` });
    t.push({ id: "seuil", titre: "Prêt à investir", marque: "↑", metal: "saphir", ok: e.solde >= seuil() || e.envoye > 0, rang: 400, action: "transfert",
      msg: `Votre épargne atteint ${F(e.solde)} : elle peut maintenant travailler en bourse. Envoyez-la à votre SGI.` });
    t.push({ id: "sgi", titre: "Investisseur BRVM", marque: "★", metal: "rubis", ok: e.envoye > 0, rang: 450,
      msg: "Premier envoi à votre SGI : vous êtes maintenant investisseur à la BRVM. Votre portefeuille va grandir avec votre épargne." });
    return t;
  }
  const cleFetes = () => "brvm-fetes-" + (S.user?.id || "x");
  // Étapes déjà fêtées : dans le profil Supabase (profils.fetes, partagé entre appareils) ; à défaut, sur ce téléphone
  const fetesEnBase = () => !DEMO && S.profil && "fetes" in S.profil;
  function chargerFetes() {
    let v = fetesEnBase() && Array.isArray(S.profil.fetes) ? S.profil.fetes : null;
    if (!v && !fetesEnBase()) try { v = JSON.parse(localStorage.getItem(cleFetes()) || "null"); } catch (e) { /* stockage indisponible */ }
    S.fetes = new Set(Array.isArray(v) ? v : []);
    if (!v) { trophees(epargne()).filter((t) => t.ok).forEach((t) => S.fetes.add(t.id)); garderFetes(); }   // l'historique ne se fête pas
  }
  function garderFetes() {
    const liste = [...S.fetes];
    if (fetesEnBase()) { S.profil.fetes = liste; api.saveProfil(S.user.id, { fetes: liste }).catch(() => { /* réessayé à la prochaine étape */ }); }
    else try { localStorage.setItem(cleFetes(), JSON.stringify(liste)); } catch (e) { /* tant pis */ }
  }
  const MSG_JOUR = [
    (m, s, u) => `Bravo ! ${F(m)} de plus. Série : ${pluriel(s, u)}.`,
    (m, s, u) => `C'est noté : ${F(m)} mis de côté. ${pluriel(s, u)} d'affilée !`,
    (m, s) => `Petit à petit, l'oiseau fait son nid : ${F(m)} de plus.${s > 1 ? ` Série : ${s}.` : ""}`,
    (m, s, u) => `Belle régularité ! ${pluriel(s, u)} sans interruption.`,
  ];
  // Après une action d'épargne : grande félicitation si une étape est franchie, sinon petite victoire
  function feter(montant) {
    const e = epargne();
    const nouveaux = trophees(e).filter((t) => t.ok && !S.fetes.has(t.id)).sort((a, b) => b.rang - a.rang);
    if (nouveaux.length) { nouveaux.forEach((t) => S.fetes.add(t.id)); garderFetes(); bravo(nouveaux); return; }
    if (montant) {
      const s = Math.max(1, e?.serie || 1), u = e?.unite || "jour";
      toast(MSG_JOUR[s % MSG_JOUR.length](montant, s, u));
      const fab = $("#fab-coffre");
      fab.classList.remove("fab-ok"); void fab.offsetWidth; fab.classList.add("fab-ok");
      setTimeout(() => fab.classList.remove("fab-ok"), 1600);
    }
  }
  // Médaille : ruban à deux pans, couronne métallique crantée, face bombée, gravure, reflet ; grisée si pas encore gagnée
  const medaille = (t, gros) => {
    const m = t.metal || "bronze", petit = t.marque.length > 2;
    return `<svg class="medaille m-${m}${t.ok ? "" : " verrou"}${gros ? " gros" : ""}" viewBox="0 0 64 84" aria-hidden="true">
      <path class="ruban-a" d="M17 0h13l7 25-11 7z"/><path class="ruban-b" d="M47 0H34l-7 25 11 7z"/>
      <path class="ruban-l" d="M23.5 0h3l6.2 23.5-2.6 1.6zM40.5 0h-3l-6.2 23.5 2.6 1.6z"/>
      <circle cx="32" cy="55" r="26" fill="url(#m-${m}-rim)"/>
      <circle cx="32" cy="55" r="26" fill="none" class="cran" stroke-dasharray="2.4 2.1"/>
      <circle cx="32" cy="55" r="20.5" fill="url(#m-${m}-face)"/>
      <circle cx="32" cy="55" r="17.2" fill="none" class="grav"/>
      <path d="M14 46a20 20 0 0 1 22-11" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>
      <text x="32.6" y="${petit ? 60.6 : 61.6}" text-anchor="middle" font-size="${petit ? 12.5 : 17}" class="ombre">${esc(t.marque)}</text>
      <text x="32" y="${petit ? 60 : 61}" text-anchor="middle" font-size="${petit ? 12.5 : 17}">${esc(t.marque)}</text></svg>`;
  };
  function bravo(items) {
    const t = items[0], d = $("#dlg-bravo");
    $("#bravo-medaille").innerHTML = `<div class="halo h-${t.metal || "bronze"}" aria-hidden="true"></div>${medaille(t, true)}`;
    $("#bravo-rang").textContent = "Médaille " + (RANGS[t.metal] || "");
    $("#bravo-titre").textContent = t.titre;
    $("#bravo-msg").textContent = t.msg;
    $("#bravo-aussi").innerHTML = items.length > 1 ? "Et aussi : " + items.slice(1).map((x) => `<b>${esc(x.titre)}</b>`).join(", ") : "";
    $("#bravo-action").hidden = t.action !== "transfert";
    S.bravoTrophee = t;
    d.showModal();
    confettis(d);
  }
  // ---------------------------------------------------------------- partager un trophée (image, sans aucun montant)
  const METAUX = { bronze: ["#d08a4a", "#7a4a1f"], argent: ["#eef1f5", "#8e96a3"], or: ["#ffd75e", "#b8860b"], platine: ["#f2f2f0", "#9aa3ad"],
    diamant: ["#c8f4ff", "#3fa6cf"], legende: ["#d9a3ff", "#6a1b9a"], emeraude: ["#6be39a", "#1e7a4f"], saphir: ["#8fa2ff", "#1b2a8a"], rubis: ["#ff6f9b", "#8b0a3a"] };
  const URL_SITE = location.origin + location.pathname.replace(/(app|admin)\/.*$/, "");   // l'adresse du site, quel que soit le domaine
  const phraseTrophee = (t) => /^serie-/.test(t.id || "") ? `J'ai épargné ${String(t.titre).toLowerCase()} avec BafiBourse !`
    : t.id === "premier" ? "J'ai mis de côté mes premiers francs avec BafiBourse !"
    : t.id === "sgi" ? "J'ai investi mon épargne à la BRVM avec BafiBourse !"
    : `J'ai décroché la médaille « ${t.titre} » sur BafiBourse !`;
  async function imageTrophee(t) {
    const W = 1080, H = 1350, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d"), police = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    const fond = g.createLinearGradient(0, 0, W, H);
    fond.addColorStop(0, "#1b286a"); fond.addColorStop(1, "#0f1640");
    g.fillStyle = fond; g.fillRect(0, 0, W, H);
    // halo et rayons
    const halo = g.createRadialGradient(W / 2, 560, 40, W / 2, 560, 460);
    halo.addColorStop(0, "rgba(246,158,35,.45)"); halo.addColorStop(1, "rgba(246,158,35,0)");
    g.fillStyle = halo; g.fillRect(0, 0, W, H);
    // marque
    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.font = `800 64px ${police}`;
    const wB = g.measureText("Bafi").width, wT = g.measureText("BafiBourse").width, x0 = W / 2 - wT / 2;
    g.textAlign = "left"; g.fillStyle = "#F69E23"; g.fillText("Bafi", x0, 150); g.fillStyle = "#ffffff"; g.fillText("Bourse", x0 + wB, 150);
    g.textAlign = "center";
    // médaille : ruban, disque, chiffre
    const [clair, fonce] = METAUX[t.metal] || METAUX.bronze, cx = W / 2, cy = 590, r = 190;
    g.fillStyle = "#F69E23"; g.beginPath(); g.moveTo(cx - 150, 300); g.lineTo(cx - 40, 300); g.lineTo(cx + 20, cy - 120); g.lineTo(cx - 90, cy - 120); g.fill();
    g.fillStyle = "#4f6ad9"; g.beginPath(); g.moveTo(cx + 150, 300); g.lineTo(cx + 40, 300); g.lineTo(cx - 20, cy - 120); g.lineTo(cx + 90, cy - 120); g.fill();
    const disque = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    disque.addColorStop(0, clair); disque.addColorStop(1, fonce);
    g.fillStyle = disque; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.lineWidth = 14; g.strokeStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.arc(cx, cy, r - 26, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(20,23,41,.85)"; g.font = `800 ${String(t.marque || "★").length > 2 ? 120 : 170}px ${police}`;
    g.textBaseline = "middle"; g.fillText(String(t.marque || "★"), cx, cy + 8); g.textBaseline = "alphabetic";
    // textes
    g.fillStyle = "#F69E23"; g.font = `700 44px ${police}`; g.fillText(`Médaille ${RANGS[t.metal] || ""}`.trim(), cx, 880);
    g.fillStyle = "#ffffff"; g.font = `800 76px ${police}`;
    const lignes = (txt, max) => { const m = txt.split(" "), out = []; let l = ""; for (const w of m) { const e = l ? l + " " + w : w; if (g.measureText(e).width > max && l) { out.push(l); l = w; } else l = e; } out.push(l); return out; };
    let y = 980;
    for (const l of lignes(t.titre, 940).slice(0, 2)) { g.fillText(l, cx, y); y += 88; }
    g.font = `500 40px ${police}`; g.fillStyle = "rgba(255,255,255,.88)";
    for (const l of lignes(phraseTrophee(t), 900).slice(0, 2)) { g.fillText(l, cx, y + 10); y += 54; }
    g.font = `600 36px ${police}`; g.fillStyle = "rgba(255,255,255,.7)";
    g.fillText("Épargner chaque jour, investir à la BRVM", cx, H - 120);
    g.fillStyle = "#F69E23"; g.fillText(URL_SITE.replace("https://", "").replace(/\/$/, ""), cx, H - 66);
    return new Promise((ok) => c.toBlob(ok, "image/png"));
  }
  async function partagerTrophee(t) {
    if (!t) return;
    const texte = `${phraseTrophee(t)} ${URL_SITE}`;
    const blob = await imageTrophee(t), fichier = new File([blob], "trophee-bafibourse.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [fichier] })) return await navigator.share({ files: [fichier], text: texte });
    } catch (e) { if (e.name === "AbortError") return; }
    // ordinateur ou navigateur sans partage de fichier : aperçu, image à enregistrer et lien WhatsApp
    const url = URL.createObjectURL(blob);
    showInfo("Partager mon trophée", `<img src="${url}" alt="Image du trophée ${esc(t.titre)}" class="tr-apercu">
      <p class="small muted">Aucun montant n'apparaît sur l'image : seulement votre réussite.</p>
      <div class="actions"><a class="btn" href="${url}" download="trophee-bafibourse.png">Enregistrer l'image</a>
        <a class="btn primary" href="https://wa.me/?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">Envoyer sur WhatsApp</a></div>`);
  }

  function confettis(hote) {
    if (CALME || S.profil?.felicitations === false) return;
    const c = document.createElement("canvas");
    c.className = "confettis";
    (hote?.open ? hote : document.body).append(c);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d"); g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const cols = ["--s1", "--s2", "--s3", "--accent"].map((v) => css.getPropertyValue(v).trim() || "#17866F").concat(["#E4B43A", "#C8553D"]);
    const P = Array.from({ length: W < 500 ? 90 : 150 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6,
      vx: (Math.random() - 0.5) * 2.4, vy: 2.2 + Math.random() * 3.2, r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0], o: Math.random() * 6.3 }));
    const t0 = performance.now();
    const f = (t) => {
      const el = t - t0;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = Math.max(0, 1 - Math.max(0, el - 2300) / 900);
      for (const p of P) {
        p.o += 0.06; p.x += p.vx + Math.sin(p.o) * 0.7; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, Math.abs(Math.cos(p.o)) * p.h + 1); g.restore();
      }
      if (el < 3200) requestAnimationFrame(f); else c.remove();
    };
    requestAnimationFrame(f);
  }

  const delai = (j) => (j <= 1 ? "demain" : j < 14 ? `dans ${j} jours` : j < 60 ? `dans ${Math.round(j / 7)} semaines` : `dans ${Math.round(j / 30)} mois`);
  // Montant à investir : saisi à la main, ou automatique (mis de côté + total chez ma SGI)
  function budgetAuto() { const L = replay(S.ops); return Math.max(0, L.valeur) + (epargne()?.solde || 0); }
  const budgetActuel = () => (S.coffre && S.profil?.budget_mode === "auto" ? budgetAuto() : +S.profil?.budget || 0);

  // ---------------------------------------------------------------- vues
  function vAujourdhui() {
    const v = $("#v-aujourdhui");
    v.onclick = (ev) => { if (ev.target.closest("[data-completer]")) onboarding(true); };
    const L = replay(S.ops);
    const c = S.prop?.contenu;
    const fresh = S.prop && S.seance && S.prop.date === S.seance.date;
    const hasPf = L.positions.length > 0 || L.cash > 0;
    let h = `<h1 id="h-auj">Aujourd'hui</h1>`;
    if (!S.seance) {
      v.innerHTML = h + `<div class="notice info">Les analyses du marché n'ont pas encore été publiées. Revenez après la prochaine séance.</div>`;
      return;
    }
    const recapVu = (etatTutoriel() || {}).recap_vu === S.seance.date;
    h += `<p class="muted small">Analyses de la séance du ${D(S.seance.date)}</p>`;
    // sans portefeuille, pas de synthèse : le récap garde son bandeau
    if (!recapVu && !(L.positions.length > 0 || L.cash > 0)) h += `<button type="button" class="recap-inv" data-recap><span class="recap-lune" aria-hidden="true">🌙</span>
      <span><b>Votre récap du soir est prêt</b><span class="small">Séance du ${D(S.seance.date).slice(0, 5)} · 30 secondes</span></span><span class="recap-voir" aria-hidden="true">Voir ›</span></button>`;
    if (!DEMO && "prenom" in (S.profil || {}) && !S.profil.prenom)
      h += `<div class="notice info small">Complétez votre profil (prénom, pays, objectif) : 2 minutes pour des propositions plus justes.
        <button class="btn small" type="button" data-completer>Compléter mon profil</button></div>`;
    // Bloc « À faire » : problèmes du journal, alertes importantes des titres, épargne à verser ou à envoyer
    const faire = [];
    const alertes = [...L.errors, ...(fresh && c?.alertes ? c.alertes : [])];
    if (L.cash < -1) alertes.unshift("Votre disponible chez la SGI est négatif : enregistrez vos dépôts pour des calculs justes.");
    for (const a of alertes) faire.push(`<li class="af af-journal"><span class="af-ic" aria-hidden="true">!</span><div class="main"><div class="sub">${esc(a)}</div></div></li>`);
    const { urg, aut } = lignesAlertes();
    faire.push(...urg);
    if (!DEMO && S.profil?.onboarding_fini_le && !S.profil?.questionnaire?.horizon)
      faire.push(`<li class="af af-epargne"><span class="af-ic" aria-hidden="true">?</span><div class="main"><div class="name">Affinez votre profil d'investisseur</div>
        <div class="sub">Trois questions, une minute : pour des propositions adaptées à votre horizon et à votre tempérament.</div></div>
        <button class="btn small" type="button" data-completer>Répondre</button></li>`);
    const ep = epargne();
    if (ep?.aFaire && ep.plan?.montant)
      faire.push(`<li class="af af-epargne"><span class="af-ic" aria-hidden="true">+</span><div class="main"><div class="name">Vos ${F(ep.plan.montant)} ${RYTHMES[ep.plan.rythme][1] === "aujourd'hui" ? "d'aujourd'hui" : RYTHMES[ep.plan.rythme][1]} ?</div>
        <div class="sub">${ep.serie > 0 ? `Votre série de ${pluriel(ep.serie, ep.unite)} vous attend.` : "C'est le moment de commencer une nouvelle série."}</div></div>
        <button class="btn small primary" data-coffre="verser">J'ai épargné</button></li>`);
    if (ep && ep.solde >= seuil())
      faire.push(`<li class="af af-epargne"><span class="af-ic" aria-hidden="true">→</span><div class="main"><div class="name">Épargne prête à investir : ${F(ep.solde)}</div>
        <div class="sub">Envoyez-la à votre SGI : ${SIM() ? "la simulation sera recalculée" : "les ordres seront recalculés"}.</div></div>
        <button class="btn small" data-coffre="transfert">J'ai envoyé à ma SGI</button></li>`);
    const blocFaire = faire.length || aut.length ? `<div class="card a-faire"><h2>À faire</h2>
      ${faire.length ? `<ul class="list">${faire.slice(0, 3).join("")}</ul>` : `<p class="small muted">Rien d'urgent ce soir.</p>`}
      ${faire.length > 3 ? `<details class="aide"><summary>Voir les ${faire.length - 3} autres</summary><ul class="list">${faire.slice(3).join("")}</ul></details>` : ""}
      ${aut.length ? `<details class="aide"><summary>${aut.length} point${aut.length > 1 ? "s" : ""} de vigilance sur vos titres</summary><ul class="list">${aut.join("")}</ul></details>` : ""}
      ${(S.alertes || []).length ? `<p class="small muted">Alertes calculées après chaque séance : un signal à examiner, jamais une vente automatique (environ ${nf1.format(FEES * 100)} % de frais par vente).</p>` : ""}</div>` : "";

    if (!hasPf) h += blocFaire;
    if (hasPf) {
      const changed = !fresh || journalChanged(L, c);
      const perf = changed ? {} : c?.performance || {};       // performance du soir : valable pour ce journal-là
      const hist = c?.historique || [], der = hist[hist.length - 1];
      const jour = !changed && der && der.date === S.seance.date && ok(der.gain) ? der : null;
      const vm = jour ? varMarche(jour.date) : null;
      const ctx = changed ? "" : contexteMarche(perf.twr_total, perf.bench_total, hist[0]?.date);
      h += `<div class="card synthese">${bandeDiscipline(L)}
        <div class="syn-lbl">Total chez ma SGI</div>
        <div class="syn-val num" data-count="${L.valeur ?? ""}" data-unite="1">${montantHtml(L.valeur)}</div>
        ${jour ? `<div class="syn-jour ${cls(jour.gain)}"><b class="num">${jour.gain > 0 ? "+" : ""}${F(jour.gain)}${ok(jour.pct) ? ` (${P(jour.pct)})` : ""}</b> sur la séance du ${D(jour.date).slice(0, 5)}${ok(vm) ? `<span class="syn-mkt"> · marché ${P(vm)}</span>` : ""}</div>` : ""}
        <button type="button" class="syn-recap${recapVu ? " vu" : ""}" data-recap><span class="syn-recap-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M17 3.5v3M15.5 5h3"/></svg></span>
          <span>${recapVu ? "Revoir le récap du soir" : `<b>Votre récap du soir est prêt</b> · 30 secondes`}</span><span class="syn-recap-f" aria-hidden="true">›</span></button>
        <details class="syn-detail"><summary>Voir le détail</summary>
          <div class="syn-grid">
            <div><div class="syn-lbl">Disponible chez ma SGI</div><div class="syn-sec num">${montantHtml(L.cash)}</div></div>
            <div><div class="syn-lbl">Performance</div><div class="syn-sec num ${cls(perf.twr_total)}">${P(perf.twr_total)}</div>
              <div class="small muted">${changed ? "recalculée ce soir" : "marché " + P(perf.bench_total)}</div></div>
          </div>${ctx ? `<p class="syn-ctx">${ctx}</p>` : ""}</details></div>`;
      h += blocFaire;
      const inst = changed ? instantOrders(L) : null;
      const ordres = changed ? inst.ordres : c?.ordres || [];
      S.ordres = ordres;
      const investi = L.valeur > 0 ? (L.valeur - L.cash) / L.valeur : 0;
      if (!acces(1)) h += `<div class="card ordres sim-zone"><span class="sim-pastille">Simulation</span>${verrou(1, "Le simulateur : la répartition visée par votre profil et les ajustements")}</div>`;
      else {
      const nV = ordres.filter((o) => o.sens === "VENTE").length, nA = ordres.length - nV;
      const resume = !ordres.length ? "Rien à faire pour l'instant"
        : [nA ? `${nA} achat${nA > 1 ? "s" : ""}` : "", nV ? `${nV} vente${nV > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et ") + (SIM() ? " simulés" : " proposés") + " ce soir";
      h += `<details class="card ordres ordres-pli sim-zone"${S.ui.ordresOuverts ? " open" : ""}><summary><span class="op-t"><span class="sim-pastille">Simulation</span> ${SIM() ? "Ajustements simulés" : "Ordres proposés"}</span>
        <span class="op-r">${resume}</span></summary>`;
      if (!ordres.length) {
        h += investi < 0.5 && L.cash > MIN_LINE
          ? `<p>Aucun ordre calculable pour l'instant avec votre disponible de ${F(L.cash)}. Vérifiez votre montant à investir et votre profil, ou revenez après le calcul du soir.</p>`
          : `<p>Rien à faire pour l'instant : votre portefeuille est proche de sa cible.</p>`;
      } else {
        h += `<p class="small muted">${SIM() ? "Pour rejoindre la cible calculée selon vos réglages" : "Pour rejoindre votre portefeuille cible"} (${esc(PROFILS[S.profil?.profil]?.t || S.profil?.profil || "")}). Prix limites indicatifs.</p>`;
        // Regroupés par sens ; les 5 premiers visibles, le reste dans une liste repliable
        const ligne = ({ o, i }) => `<li><div class="main"><div class="name">${mq(o.code)}${esc(nomLisible(o.libelle || o.code))}</div>
            <div class="sub">${esc(o.code)}${o.motif ? " · " + esc(o.motif) : ""}${ok(o.seances) && o.seances > 1 ? ` · ~${N(o.seances)} séances` : ""}</div></div>
            <div class="right num"><b>${N(o.quantite)} titre${o.quantite > 1 ? "s" : ""}</b><div class="sub">limite ${F(o.prix_limite)}</div>
            <button class="btn small" data-ordre="${i}">J'ai passé l'ordre</button></div></li>`;
        const groupe = (titre, liste) => {
          if (!liste.length) return "";
          const total = liste.reduce((a, { o }) => a + (+o.quantite || 0) * (+o.prix_limite || 0), 0);
          return `<div class="og"><h3 class="og-t">${titre}<span class="og-n">${liste.length} ordre${liste.length > 1 ? "s" : ""} · environ ${F(total)}</span></h3>
            <ul class="list">${liste.slice(0, 5).map(ligne).join("")}</ul>
            ${liste.length > 5 ? `<details class="og-plus"><summary>Voir les ${liste.length - 5} autres</summary><ul class="list">${liste.slice(5).map(ligne).join("")}</ul></details>` : ""}</div>`;
        };
        const tous = ordres.map((o, i) => ({ o, i }));
        h += groupe(SIM() ? "Ventes simulées" : "À vendre", tous.filter((x) => x.o.sens === "VENTE"))
           + groupe(SIM() ? "Achats simulés" : "À acheter", tous.filter((x) => x.o.sens !== "VENTE"));
      }
      h += changed
        ? `<p class="small muted">Recalculés à l'instant avec votre journal à jour (estimation). Le calcul détaillé, qui tient compte de la liquidité de chaque titre, est refait ce soir après la séance.</p>`
        : `<p class="small muted">Calculés avec votre journal au soir du ${D(S.prop.date)}.</p>`;
      h += `<p><button type="button" class="btn small" data-ouvrir-sim>Ouvrir le simulateur</button></p></details>`;
      }
      // la cible du profil est un réglage, pas un suivi du soir : elle est affichée dans Portefeuille
    } else {
      const auto = S.coffre && S.profil?.budget_mode === "auto";
      const budget = budgetActuel();
      const nightly = fresh && c?.proposition && !c.positions?.length && Math.round(c.proposition.base) === Math.round(budget)
        && c.profil === S.profil?.profil ? c.proposition : null;
      const e = nightly ? { lines: nightly.lignes, reliquat: nightly.reliquat, rdt: nightly.rendement_attendu } : estimate(budget);
      h += `<div class="card ordres sim-zone"><span class="sim-pastille">Simulation</span><h2>${SIM() ? "Simulation de portefeuille" : "Votre portefeuille proposé"}</h2>
        <form id="f-budget" class="grid2" novalidate>
          ${auto ? `<div><div class="lbl small muted" style="font-weight:600">Montant à investir (automatique)</div><div class="val num" style="font-size:1.2rem;font-weight:700;margin-top:10px">${F(budget)}</div>
            <a class="small" href="#profil">Changer de mode</a></div>`
          : `<label>Montant à investir (F)<input name="budget" type="number" min="0" step="10000" inputmode="numeric" value="${budget || ""}"></label>`}
          <label>Profil<select name="profil">${Object.entries(PROFILS).map(([k, p]) =>
            `<option value="${k}"${S.profil?.profil === k ? " selected" : ""}>${p.t}</option>`).join("")}</select></label>
        </form>`;
      if (!budget) h += `<p class="muted">Indiquez le montant que vous souhaitez investir ${SIM() ? "pour lancer la simulation" : "pour recevoir une proposition"}.</p>`;
      else if (!e.lines.length) h += `<p class="muted">Budget trop faible pour constituer un portefeuille diversifié.</p>`;
      else {
        h += classBar(e.lines) + `<p class="small muted">Rendement attendu ${P(e.rdt, false)} par an · non investi ${F(e.reliquat)}.
          ${nightly ? (SIM() ? "Simulation calculée ce soir." : "Proposition calculée ce soir.")
            : `Estimation immédiate ; la ${SIM() ? "simulation" : "proposition"} détaillée est recalculée chaque soir.`}</p><ul class="list">`;
        e.lines.forEach((l, i) => {
          h += `<li><div class="main"><div class="name">${mq(l.code)}${esc(l.libelle || l.code)}</div>
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
    h += noticesUnivers(c);
    h += `<p class="small muted">${AVERT()} Données de marché : BRVM.</p>`;
    v.innerHTML = h;
    $(".ordres-pli", v)?.addEventListener("toggle", (ev) => (S.ui.ordresOuverts = ev.target.open));
    const fb = $("#f-budget", v);
    if (fb) {
      const save = async () => {
        const profil = fb.profil.value, upd = fb.budget ? { budget: Math.max(0, +fb.budget.value || 0), profil } : { profil };
        try {
          await api.saveProfil(S.user.id, upd);
          Object.assign(S.profil, upd);
          S.cibles = await ciblesLisibles(S.seance.date, profil);
          vAujourdhui();
        } catch (err) { toast("Enregistrement impossible : " + err.message); }
      };
      fb.budget?.addEventListener("change", save);
      fb.profil.addEventListener("change", save);
      fb.addEventListener("submit", (ev) => { ev.preventDefault(); save(); });
    }
  }

  const pluriel = (n, u) => `${n} ${u === "mois" ? "mois" : u + (n > 1 ? "s" : "")}`;
  // « SOCIETE GENERALE CI » → « Société Générale CI » ; un nom déjà en casse mixte n'est pas touché
  const SIGLES = new Set(["CI", "BF", "SN", "ML", "NE", "TG", "BJ", "GW", "SA", "SGI", "FCP", "FCPE", "SICAV", "OPCVM", "UEMOA", "UMOA", "BOA",
    "BOAD", "BIDC", "CRRH", "CIE", "SIB", "SGB", "SGBC", "NSIA", "BICI", "BIIC", "PAD", "TPCI", "SODE", "SDSC", "SMB", "SAPH", "SOGB", "AM", "ETI", "BNI", "BHCI"]);
  const MOTS_ACCENTS = { ETAT: "État", SOCIETE: "Société", GENERALE: "Générale", SENEGAL: "Sénégal", COTE: "Côte", BENIN: "Bénin",
    ELECTRICITE: "Électricité", MONETAIRE: "Monétaire", DIVERSIFIE: "Diversifié", TOTALENERGIES: "TotalEnergies", REPUBLIQUE: "République",
    ENERGIE: "Énergie", SECURITE: "Sécurité", EQUILIBRE: "Équilibré", DYNAMIQUE: "Dynamique" };
  const PETITS_MOTS = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "of", "the", "and", "d", "l"]);
  function nomLisible(t) {
    t = String(t ?? "");
    const lettres = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (lettres.length < 4 || lettres !== lettres.toUpperCase()) return t;
    return t.split(/(\s+)/).map((m, i) => {
      if (/^\s+$/.test(m) || /\d/.test(m)) return m;
      const nu = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z'’-]/gi, "");
      if (SIGLES.has(nu)) return m;
      if (MOTS_ACCENTS[nu]) return MOTS_ACCENTS[nu];
      const bas = m.toLowerCase();
      if (i > 0 && PETITS_MOTS.has(bas)) return bas;
      return bas.replace(/(^|[-'’])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
    }).join("");
  }
  async function ciblesLisibles(date, profil) {
    return ((await api.cibles(date, profil)) || []).map((c) => ({ ...c, libelle: nomLisible(c.libelle) }));
  }
  function animerEpargne(v) {
    const an = $(".ep-anneau", v), cpt = $(".ep-compte", v);
    if (!an || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const val = +cpt.dataset.val, cle = `${val}|${$(".ea-jauge", an).dataset.offset}`;
    if (S.ui.epAnime === cle) return;                          // déjà joué pour ces chiffres
    S.ui.epAnime = cle;
    const j = $(".ea-jauge", an), off = +j.dataset.offset, C = +j.dataset.c;
    j.style.transition = "none"; j.style.strokeDashoffset = C; void j.getBoundingClientRect();
    cpt.textContent = F(0);
    new IntersectionObserver(([e], o) => {
      if (!e.isIntersecting) return;
      o.disconnect();
      j.style.transition = "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)"; j.style.strokeDashoffset = off;
      const t0 = performance.now();
      (function pas(t) { const k = Math.min(1, (t - t0) / 1200); cpt.textContent = F(Math.round(val * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(pas); })(t0);
      an.closest(".epargne")?.classList.add("anime");
    }, { threshold: 0.4 }).observe(an);
  }
  // Mon épargne, allégée pour limiter la charge mentale : trois blocs visibles (où j'en suis + une action,
  // une ligne de motivation, mes trophées), le reste seulement quand il sert ou replié.
  function carteEpargne(ep) {
    const pl = ep.plan, r = pl?.rythme;
    if (!pl?.montant) {
      return `<div class="card epargne ep2" id="mon-epargne"><h2 class="ep2-etat">Fixez-vous un rythme d'épargne</h2>
        <p>Par jour, par semaine ou par mois : l'application vous aide à le tenir et vous dit quand investir.</p>
        <button class="btn primary ep2-cta" data-coffre="plan">Créer mon plan d'épargne</button></div>`;
    }
    const tr = trophees(ep), gagnes = tr.filter((t) => !!t.ok), suivant = tr.find((t) => !t.ok && t.reste > 0);
    const debutant = !(ep.verse > 0) && !gagnes.length;
    const periode = RYTHMES[r][1];
    const pc = ep.objectif ? Math.min(100, (100 * ep.verse) / ep.objectif) : 0;
    let h = `<div class="card epargne ep2" id="mon-epargne">`;

    // 1. Où j'en suis, et la seule action qui compte
    h += `<div class="ep2-tete"><h2 class="ep2-etat">${ep.aFaire
        ? `Mettez de côté <b>${F(pl.montant)}</b> ${periode}`
        : `Vous êtes à jour ${periode} <span class="ep2-ok" aria-hidden="true">✓</span>`}</h2>
      <p class="ep2-plan small muted">Mon plan : ${F(pl.montant)} ${RYTHMES[r][0]} · <button type="button" class="btn link small" data-coffre="plan">modifier</button></p></div>`;
    if (ep.objectif) h += `<div class="ep2-objectif">
        <div class="ep2-chiffres"><span><b class="num">${F(ep.verse)}</b> épargnés sur ${F(ep.objectif)}</span><b class="num">${Math.round(pc)} %</b></div>
        <div class="ep2-barre" role="progressbar" aria-label="Progression vers l'objectif" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pc)}"><i style="width:${pc.toFixed(1)}%"></i></div>
        <p class="small muted">${ep.objectifLe ? `Objectif atteint vers le ${D(ep.objectifLe)} à ce rythme` : "Objectif atteint, bravo !"}</p></div>`;
    h += `<button class="btn primary ep2-cta" data-coffre="verser">J'ai épargné</button>`;

    // 2. Une seule ligne de motivation (série, record et prochain trophée réunis)
    if (debutant) h += `<p class="ep2-motiv"><span class="ep2-flamme" aria-hidden="true">🏅</span><span>Votre premier trophée, <b>Premier pas</b>, dès votre premier versement.</span></p>`;
    else if (ep.serie > 0) h += `<p class="ep2-motiv"><span class="ep2-flamme" aria-hidden="true">🔥</span><span><b>${pluriel(ep.serie, ep.unite)} d'affilée</b>${suivant ? ` · prochain trophée dans ${pluriel(suivant.reste, suivant.unite)}` : ""}</span></p>`;
    else h += `<p class="ep2-motiv"><span class="ep2-flamme" aria-hidden="true">🌱</span><span>Une nouvelle série commence${ep.record > 1 ? ` · votre record : <b>${pluriel(S.demoPerdue ? 23 : ep.record, ep.unite)}</b>, à battre` : ""}</span></p>`;

    // 3. L'argent mis de côté et pas encore envoyé : seulement s'il y en a
    if (ep.solde > 0) {
      const pret = ep.solde >= seuil();
      h += `<div class="ep2-cote${pret ? " pret" : ""}"><div><span class="small muted">Mis de côté, pas encore envoyé à votre SGI</span><b class="num">${F(ep.solde)}</b>
          <span class="small">${pret ? "Prêt à investir : vous pouvez l'envoyer à votre SGI." : `Investissement possible ${delai(ep.seuilDans)} (à partir de ${F(seuil())}, pour limiter les frais).`}</span></div>
        <div class="ep2-cote-act"><button class="btn${pret ? " primary" : ""} small" data-coffre="transfert">J'ai envoyé à ma SGI</button>
          <button class="btn link small" data-coffre="reprendre">J'ai repris de mon épargne</button></div></div>`;
    }

    // Mes trophées : aperçu des médailles gagnées, la galerie complète se déplie
    if (!debutant) {
      const prochains = tr.filter((t) => !t.ok).slice(0, 2);
      h += `<details class="ep2-pli ep2-trophees"${S.ui.epTrophees ? " open" : ""}><summary><span class="ep2-pli-t">Mes trophées</span>
          <span class="ep2-mini" aria-hidden="true">${gagnes.slice(-4).map((t) => `<span class="ep2-mini-m">${medaille(t)}</span>`).join("")}</span>
          <span class="small muted">${gagnes.length} sur ${tr.length}</span></summary>
        <p class="small muted">Touchez « Partager » pour montrer un trophée à vos proches.</p>
        <ul class="trophees">${[...gagnes, ...prochains].map((t) => `<li class="${t.ok ? "" : "verrou"}" title="${esc(t.titre)} · ${esc(RANGS[t.metal] || "")}">${medaille(t)}
          <span>${esc(t.titre)}</span><span class="rang r-${t.metal}">${esc(RANGS[t.metal] || "")}</span>${!t.ok && t.reste > 0 ? `<span class="small muted">encore ${pluriel(t.reste, t.unite)}</span>` : ""}${t.ok ? `<button type="button" class="tr-partager" data-partager="${esc(t.id)}" aria-label="Partager le trophée ${esc(t.titre)}">Partager</button>` : ""}</li>`).join("")}</ul></details>`;
    }

    // Ma régularité : le calendrier, replié
    if (ep.calendrier?.length && !debutant) {
      const libCal = (c) => `${c.k.length === 7 ? c.k : D(c.k)} : ${c.fait ? "épargné" : c.joker ? "oubli couvert par le joker" : c.encours ? "à faire" : "manqué"}`;
      h += `<details class="ep2-pli"><summary><span class="ep2-pli-t">Ma régularité</span><span class="small muted">${ep.tenus} sur ${pluriel(ep.total, ep.unite)} · record ${pluriel(Math.max(ep.record, ep.serie), ep.unite)}</span></summary>
        <div class="ep-cal" role="list" aria-label="Mes ${ep.calendrier.length} dernières périodes d'épargne">${ep.calendrier.map((c, i) =>
          `<span role="listitem" class="ec ${c.fait ? "fait" : c.joker ? "joker" : c.encours ? "encours" : "manque"}" style="--i:${i}" title="${esc(libCal(c))}" aria-label="${esc(libCal(c))}"></span>`).join("")}</div>
        <p class="ep-legende small muted"><span class="ec fait"></span> épargné <span class="ec joker"></span> joker <span class="ec manque"></span> manqué</p>
        ${ep.joker && ep.serie > 0 ? `<p class="small muted">Joker utilisé : l'oubli du ${D(ep.joker.length === 7 ? ep.joker + "-01" : ep.joker)} n'a pas cassé votre série (un joker par mois).</p>` : ""}</details>`;
    }

    const der = [...ep.mv].sort((a, b) => b.date.localeCompare(a.date) || (b.id || 0) - (a.id || 0)).slice(0, 5);
    if (der.length) h += `<details class="ep2-pli"><summary><span class="ep2-pli-t">Derniers mouvements</span></summary><ul class="list">${der.map((m) => `<li><div class="main">
        <div class="name">${m.type === "VERSEMENT" ? "Mis de côté" : m.type === "TRANSFERT" ? "Envoyé à ma SGI" : "Retiré"}</div>
        <div class="sub">${D(m.date)}${m.source ? " · " + esc(SOURCES[m.source] || m.source) : ""}</div></div>
        <div class="right num ${m.type === "VERSEMENT" ? "good" : ""}">${m.type === "VERSEMENT" ? "+" : "−"}${F(m.montant)}</div></li>`).join("")}</ul></details>`;
    return h + `</div>`;
  }
  function aideGain() {
    // Deux tableaux qui partent du même chiffre : la plus ou moins-value des titres détenus, SANS les vendre.
    // Les frais de vente n'apparaissent qu'en moins, et seulement dans le scénario « si je vendais tout ».
    const L = replay(S.ops);
    const ligne = (t, v, cl = "") => `<tr class="${cl}"><th scope="row">${t}</th><td class="num ${cls(v)}">${v > 0 ? "+" : ""}${F(v)}</td></tr>`;
    const brut = L.latent + L.fraisVente;                         // valeur actuelle des titres − ce qu'ils ont coûté (frais d'achat compris)
    const ecart = L.gainTotal - (brut + L.dividendes + L.realise - L.fraisOps - L.avantArrivee);
    showInfo("Comprendre mon gain", `<p>Le point de départ est le même : ce que valent vos titres aujourd'hui, comparé à ce qu'ils vous ont coûté (frais d'achat compris).</p>
      <h3 class="decomp-t">Si je vendais tout aujourd'hui</h3>
      <table class="decomp"><tbody>
        ${ligne("Valeur actuelle de vos titres − ce qu'ils vous ont coûté", brut)}
        ${L.fraisVente > 0 ? ligne(`− frais de vente estimés (${nf1.format(FEES * 100)} %), à payer lors de la vente`, -L.fraisVente) : ""}
        ${ligne("= Gain si je vendais aujourd'hui", L.latent, "tot")}
      </tbody></table>
      <h3 class="decomp-t">Depuis le début, sans rien vendre</h3>
      <table class="decomp"><tbody>
        ${ligne("Valeur actuelle de vos titres − ce qu'ils vous ont coûté", brut)}
        ${ligne("+ dividendes reçus", L.dividendes)}
        ${ligne("+ résultat des titres déjà vendus", L.realise)}
        ${L.fraisOps ? ligne("− autres frais prélevés", -L.fraisOps) : ""}
        ${Math.abs(L.avantArrivee) >= 1 ? ligne("− plus-value acquise avant votre arrivée (déjà chez vous au point de départ)", -L.avantArrivee) : ""}
        ${Math.abs(ecart) >= 1 ? ligne("± écart à vérifier dans le journal", ecart) : ""}
        ${ligne(Math.abs(L.avantArrivee) >= 1 ? "= Gain total depuis votre arrivée" : "= Gain total depuis le début", L.gainTotal, "tot")}
      </tbody></table>
      ${L.coursAnciens.length ? `<p class="small">Sans cours lors de la dernière séance, ${L.coursAnciens.map((p) => `<b>${esc(S.names.get(p.code) || p.code)}</b> (cours du ${D(p.coursDu)})`).join(", ")}
        ${L.coursAnciens.length > 1 ? "sont valorisés" : "est valorisé"} à son dernier cours connu.</p>` : ""}
      ${L.sansCours.length ? `<p class="small">Aucun cours connu pour ${L.sansCours.map((p) => `<b>${esc(S.names.get(p.code) || p.code)}</b>`).join(", ")} :
        ${L.sansCours.length > 1 ? "ils sont comptés" : "il est compté"} à son prix d'achat, sans gain ni perte, en attendant un cours.</p>` : ""}
      <p class="small muted">Vérification : total chez ma SGI ${F(L.valeur)} − total envoyé à ma SGI ${F(L.apports)} = ${F(L.gainTotal)}.
        Les frais de vente ne sont payés qu'au moment de vendre : c'est pourquoi le gain total ne les retire pas.</p>
      <p class="small">La page <b>Performance</b> montre ce même gain total, mais sur la période choisie (une séance, un mois…).</p>`);
  }
  function showInfo(title, html) {
    $("#dlg-info-title").textContent = title;
    $("#dlg-info-body").innerHTML = html;
    $("#dlg-info").showModal();
  }

  // ---------------------------------------------------------------- alertes des positions (vue v_alertes_positions)
  // urgent : affiché en clair dans Aujourd'hui ; les autres sont regroupés dans une liste repliable
  const NIVEAUX = {
    ROUGE: { t: "Sortie à examiner", c: "rouge", urgent: true, o: 1 },
    ORANGE: { t: "À surveiller de près", c: "orange", urgent: true, o: 2 },
    BLEU: { t: "Échéance proche", c: "bleu", urgent: true, o: 3 },
    VERT: { t: "Objectif atteint", c: "vert", urgent: true, o: 4 },
    JAUNE: { t: "Vigilance", c: "jaune", o: 5 },
    GRIS: { t: "Donnée ancienne", c: "gris", o: 6 },
    INFO: { t: "Information", c: "info", o: 7 },
    INCONNU: { t: "À vérifier", c: "gris", o: 8 },
  };
  const cleJournal = () => S.ops.length + ":" + (S.ops[S.ops.length - 1]?.id ?? "");
  async function chargerAlertes() {
    S.alertesCle = cleJournal();
    try {
      const rows = (await api.alertes()) || [];
      S.alertes = rows.filter((a) => a.alerte && a.alerte !== "OK")
        .sort((a, b) => (NIVEAUX[a.alerte]?.o || 9) - (NIVEAUX[b.alerte]?.o || 9) || String(a.ticker).localeCompare(b.ticker));
    } catch (e) { S.alertes = null; }                                  // vue pas encore installée → rien n'est affiché
    S.alertesMap = new Map((S.alertes || []).map((a) => [a.ticker, a]));
  }
  // En mode simulation, le moteur ne « recommande » rien
  const motifAlerte = (m) => SIM() ? String(m || "").replace("Le moteur recommande désormais de vendre", "L'analyse du soir classe désormais ce titre en vente") : String(m || "");
  function ligneAlerte(a) {
    const n = NIVEAUX[a.alerte] || NIVEAUX.INFO;
    return `<li class="al al-${n.c}"><span class="al-pt" aria-hidden="true"></span><div class="main">
      <div class="name">${mq(a.ticker)}${esc(S.names.get(a.ticker) || a.ticker)} <span class="al-niv">${esc(n.t)}</span></div>
      <div class="sub">${esc(motifAlerte(a.motif))}</div></div></li>`;
  }
  function lignesAlertes() {
    const A = S.alertes || [];
    return { urg: A.filter((a) => NIVEAUX[a.alerte]?.urgent).map(ligneAlerte), aut: A.filter((a) => !NIVEAUX[a.alerte]?.urgent).map(ligneAlerte) };
  }
  function blocAlertes() {
    const A = S.alertes;
    if (!A || !A.length) return "";
    const urg = A.filter((a) => NIVEAUX[a.alerte]?.urgent), aut = A.filter((a) => !NIVEAUX[a.alerte]?.urgent);
    let h = `<div class="card alertes"><h2>Alertes sur mes titres</h2>`;
    if (urg.length) h += `<ul class="list">${urg.map(ligneAlerte).join("")}</ul>`;
    else h += `<p class="small muted">Rien d'urgent sur vos titres ce soir.</p>`;
    if (aut.length) h += `<details class="aide"><summary>${aut.length} point${aut.length > 1 ? "s" : ""} de vigilance</summary><ul class="list">${aut.map(ligneAlerte).join("")}</ul></details>`;
    return h + `<p class="small muted">Calculées après chaque séance. Une alerte est un signal à examiner, jamais une vente automatique : chaque vente coûte environ ${nf1.format(FEES * 100)} % de frais.</p></div>`;
  }
  function pastille(a) {
    if (!a) return "";
    const n = NIVEAUX[a.alerte] || NIVEAUX.INFO;
    return ` <button type="button" class="al-btn al-${n.c}" data-alerte="${esc(a.ticker)}" aria-label="Alerte : ${esc(n.t)}. Voir le détail"><span class="al-pt" aria-hidden="true"></span>${esc(n.t)}</button>`;
  }
  // Démo : quelques alertes calculées sur les données fictives (même logique simplifiée que la vue)
  function alertesDemo() {
    const out = [];
    for (const p of replay(S.ops).positions) {
      const [cat, r] = S.lignesMk?.get(p.code) || [];
      if (cat === "actions" && ok(r.cours)) {
        const plancher = p.pru * 0.85;                           // la vue suit aussi le plus haut depuis l'achat
        if (r.cours <= plancher) out.push({ ticker: p.code, alerte: "ORANGE", plancher, motif: `Clôture sous le plancher (${N(plancher)}) : à confirmer à la prochaine séance` });
        else if (r.cours <= plancher * 1.05) out.push({ ticker: p.code, alerte: "JAUNE", plancher, motif: `Moins de 5 % au-dessus du plancher (${N(plancher)}) : vigilance` });
        else if (ok(r.objectif) && r.cours >= r.objectif) out.push({ ticker: p.code, alerte: "VERT", plancher, motif: `Objectif atteint (${N(r.objectif)}) : prise de bénéfice partielle possible` });
      } else if (cat === "obligations" && r.echeance) {
        const j = Math.round((new Date(r.echeance) - new Date()) / 864e5);
        if (j <= 90) out.push({ ticker: p.code, alerte: "BLEU", jours_echeance: j, motif: `Échéance dans ${j} jours : préparer le réinvestissement` });
      }
    }
    const act = replay(S.ops).positions.find((p) => S.classes.get(p.code) === "actions");
    if (!out.length && act) out.push({ ticker: act.code, alerte: "JAUNE", plancher: act.pru * 0.9,
      motif: `Exemple de démonstration : le cours approche du plancher (${N(act.pru * 0.9)}), vigilance` });
    return out;
  }

  // ---------------------------------------------------------------- assistant : données envoyées avec chaque question
  // Uniquement ce que l'utilisateur voit déjà dans l'application (ses données et les analyses du soir).
  const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function ligneTitre(cat, r) {
    const x = { categorie: cat, ...r };
    delete x.courbe; delete x.date;
    const s = JSON.stringify(x);
    return s.length > 6000 ? { ...x, analyse: JSON.stringify(x.analyse || "").slice(0, 3000) + "…" } : x;
  }
  const MOTS_COMMUNS = new Set(["societe", "banque", "generale", "internationale", "afrique", "africaine", "industrielle", "compagnie",
    "senegal", "ivoire", "nationale", "regionale", "commerciale", "distribution", "obligation", "obligations", "tresor", "public",
    "placement", "actions", "diversifie", "monetaire", "epargne", "capital", "finance", "financiere", "portefeuille", "marche"]);
  const echap = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const contient = (t, w) => new RegExp(`(^|[^a-z0-9])${echap(w)}([^a-z0-9]|$)`).test(t);     // mot entier, pas un morceau de mot
  function titresCites(q) {
    const t = norm(q), out = [];
    for (const [code, [cat, r]] of S.lignesMk || []) {
      const nom = norm(r.nom);
      const vu = contient(t, norm(code)) || (nom.length >= 4 && contient(t, nom))
        || nom.split(/[\s\-']+/).some((w) => w.length >= 5 && !MOTS_COMMUNS.has(w) && contient(t, w));
      if (vu) out.push(ligneTitre(cat, r));
      if (out.length >= 3) break;
    }
    return out;
  }
  function contexteAssistant(question) {
    const L = replay(S.ops), c = S.prop?.contenu;
    const r0 = (v) => (ok(v) ? Math.round(+v) : null);
    const derniers = {};
    for (const i of S.indices || []) derniers[i.code] = i;
    const top = (rows, n) => rows.filter((r) => BUY.includes(r.decision)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, n)
      .map((r) => ({ code: r.code, nom: r.nom, score: r.score, decision: r.decision, cours: r.cours ?? r.prix ?? r.vl,
                     rendement: r.rendement_div ?? r.rendement_actuariel ?? r.rendement_attendu }));
    return {
      date_du_jour: today(), seance_analysee: S.seance?.date || null,
      mode: SIM() ? "simulation" : "proposition", demo: DEMO,
      utilisateur: { prenom: S.profil?.prenom || null, profil_de_risque: S.profil?.profil, budget: S.profil?.budget },
      portefeuille: { valeur_totale: r0(L.valeur), disponible: r0(L.cash), place_en_bourse: r0(L.investi), gain_latent: r0(L.latent),
                      gain_total_depuis_debut: r0(L.gainTotal), dividendes_recus: r0(L.dividendes),
                      performance: c?.performance ? { portefeuille: c.performance.twr_total, indice: c.performance.bench_total } : null },
      positions: L.positions.slice(0, 30).map((p) => ({ code: p.code, nom: S.names.get(p.code) || p.code, classe: CLASSES[p.classe] || p.classe,
        quantite: p.quantite, prix_achat_moyen: r0(p.pru), cours: p.cours, valeur: r0(p.valeur), gain_latent: r0(p.pv),
        decision_du_soir: S.decisions?.get(p.code) || null })),
      alertes_titres: (S.alertes || []).map((a) => ({ code: a.ticker, niveau: NIVEAUX[a.alerte]?.t || a.alerte, motif: motifAlerte(a.motif) })),
      alertes_journal: [...L.errors, ...((S.prop?.date === S.seance?.date && c?.alertes) || [])],
      ordres_du_soir: (S.ordres || []).slice(0, 10).map((o) => ({ code: o.code, sens: o.sens, quantite: o.quantite, prix_limite: o.prix_limite, motif: o.motif })),
      indices: Object.values(derniers).map((i) => ({ code: i.code, date: i.date, cloture: i.cloture, variation: i.variation })),
      meilleures_analyses: { actions: top(S.mk.actions, 5), obligations: top(S.mk.obligations, 3), opcvm: top(S.mk.opcvm, 3) },
      titres_cites: titresCites(question),
    };
  }
  function suggestionsAssistant() {
    const L = replay(S.ops);
    const s = [L.positions.length ? "Où en est mon portefeuille ?" : "Par où commencer avec mon budget ?", "Comment va le marché aujourd'hui ?"];
    if ((S.alertes || []).length) s.push("Que faire de mes alertes ?");
    s.push(SIM() ? "Que dit la simulation du soir ?" : "Que me recommandez-vous ?");
    const act = L.positions.find((p) => S.classes.get(p.code) === "actions");
    if (act) s.push(`Perspectives de ${S.names.get(act.code) || act.code}`);
    const obl = L.positions.find((p) => S.classes.get(p.code) === "obligations");
    if (obl) s.push(`Que vaut mon obligation ${obl.code} ?`);
    return s.slice(0, 5);
  }
  function signalerAssistant() { window.dispatchEvent(new Event("brvm:maj")); }
  let tutoDemo = {}, avisDemo = null, rappelsDemo = null;
  const PUBLICS_DEMO = [
    ["p1", "Les épargnants de Dakar", "Un petit pas chaque jour, ensemble. Bienvenue à tous les rythmes.", 14, 30, 0.94, 18.2, "jour", false],
    ["p2", "Famille et avenir", "Pour préparer les études des enfants.", 9, 20, 0.91, 9.4, "semaine", false],
    ["p3", "Les fonctionnaires d'Abidjan", "Épargne mensuelle, fin de mois sereine.", 22, 50, 0.89, 4.1, "mois", false],
    ["p4", "Jeunes investisseurs UEMOA", "On apprend la bourse en épargnant.", 27, 30, 0.86, 12.7, "jour", false],
    ["p5", "Cercle des commerçantes", "Chaque vente, un peu de côté.", 11, 30, 0.83, 21.0, "jour", false],
    ["p6", "Les matinaux", "On épargne avant le café.", 6, 20, 0.81, 7.3, "jour", false],
    ["p7", "Objectif maison 2030", null, 18, 30, 0.79, 6.0, "semaine", false],
    ["p8", "Bamako Épargne", "Patience et constance.", 5, 30, 0.76, 3.2, "mois", false],
    ["p9", "Les tortues", "Lentement mais sûrement.", 8, 20, 0.74, 11.5, "jour", false],
    ["p10", "Entre collègues", null, 4, 20, 0.72, 2.8, "semaine", false],
    ["p11", "Premiers pas", "Nouveau cercle pour débutants : on démarre ensemble.", 2, 30, 1, 1.5, "jour", true],
    ["p12", "Lomé Avenir", "Cercle tout juste créé.", 3, 30, 0.67, 2, "semaine", true],
  ].map(([id, nom, presentation, membres, capacite, regularite, serie_moyenne, rythme, nouveau]) =>
    ({ id, nom, presentation, membres, capacite, places: capacite - membres, regularite, serie_moyenne, rythme, nouveau, membre: false }));
  const DEMANDES_DEMO = new Set();
  let RECUES_DEMO = [{ id: 901, cercle_id: "c1", cercle: "Les amis de la fac", pseudo: "Aminata K.", message: "Je viens de la page des cercles, j'aimerais épargner avec vous !", cree_le: new Date().toISOString() }];
  let cerclesDemo = [{ id: "c1", nom: "Les amis de la fac", code: "A1B2C3D4", objectif_jours: 15, objectif_pct: 80, createur: true, public: true,
    presentation: "Anciens de la fac, tous les rythmes sont bienvenus.", capacite: 30, demandes: 1, membres: [
    { pseudo: "Awa D.", moi: false, serie: 12, unite: "jour", record: 12, jours_mois: 16, tenues: 16, attendues: 17, regularite: 0.92, maj_le: new Date().toISOString() },
    { pseudo: "Vous", moi: true, serie: 6, unite: "jour", record: 9, jours_mois: 14, tenues: 14, attendues: 17, regularite: 0.8 },
    { pseudo: "Koffi A.", moi: false, serie: 2, unite: "semaine", record: 5, jours_mois: 2, tenues: 2, attendues: 3, regularite: 0.6 },
    { pseudo: "Mariam S.", moi: false, serie: 1, unite: "mois", record: 4, jours_mois: 1, tenues: 1, attendues: 1, regularite: 1 }] }];
  const cleTuto = () => "brvm-tuto-" + (S.user?.id || "x");
  function etatTutoriel() {
    if (S.profil && "tutoriel" in S.profil) return S.profil.tutoriel || {};
    if (DEMO) return tutoDemo;
    try { return JSON.parse(localStorage.getItem(cleTuto()) || "{}"); } catch (e) { return {}; }
  }
  async function sauverTutoriel(e) {
    if (S.profil && "tutoriel" in S.profil) {
      S.profil.tutoriel = e;
      try { await api.saveProfil(S.user.id, { tutoriel: e }); } catch (err) { /* réessayé à la prochaine étape */ }
    } else if (DEMO) tutoDemo = e;
    else try { localStorage.setItem(cleTuto(), JSON.stringify(e)); } catch (err) { /* navigateur sans stockage */ }
  }

  function vPortefeuille() {
    const v = $("#v-portefeuille");
    const L = replay(S.ops);
    const ep = epargne(), cote = ep ? Math.max(0, ep.solde) : 0;
    const total = cote + Math.max(0, L.cash) + L.investi;
    const seg = (v, col) => (total > 0 && v > 0 ? `<i style="width:${(100 * v / total).toFixed(2)}%;background:${col}"></i>` : "");
    const onglet = S.ui.pfOnglet || "placements";
    let h = `<h1 id="h-pf">${{ placements: "Mes placements", epargne: "Mon épargne", cercles: "Mes cercles", simulateur: "Simulateur" }[onglet] || "Portefeuille"}</h1>`;
    h += `<div class="seg pf-onglets" role="tablist" aria-label="Rubriques du portefeuille">
        <button type="button" role="tab" data-pfo="placements" aria-selected="${onglet === "placements"}" aria-pressed="${onglet === "placements"}">Placements</button>
        <button type="button" role="tab" data-pfo="epargne" aria-selected="${onglet === "epargne"}" aria-pressed="${onglet === "epargne"}">Épargne${ep?.serie > 0 ? ` · 🔥${ep.serie}` : ""}</button>
        <button type="button" role="tab" data-pfo="cercles" aria-selected="${onglet === "cercles"}" aria-pressed="${onglet === "cercles"}">Cercles</button>
        <button type="button" role="tab" data-pfo="simulateur" aria-selected="${onglet === "simulateur"}" aria-pressed="${onglet === "simulateur"}">Simulateur</button></div>`;
    if (onglet === "simulateur") {
      v.innerHTML = h + simulateurHtml(L);
      lierSimulateur(v, L);
      v.querySelectorAll("[data-pfo]").forEach((b) => b.addEventListener("click", () => { S.ui.pfOnglet = b.dataset.pfo; vPortefeuille(); window.dispatchEvent(new Event("brvm:maj")); }));
      return;
    }
    if (onglet === "cercles") {
      // les cercles d'épargne : cercles.js s'insère avant l'ancre (indicateurs de régularité, jamais de montant)
      v.innerHTML = h + `<p class="small muted pf-cer-intro">Épargnez avec vos proches ou rejoignez un cercle ouvert : chacun voit la régularité des autres, jamais leurs montants.</p><div class="pf-ancre-cercles"></div>`;
      v.querySelectorAll("[data-pfo]").forEach((b) => b.addEventListener("click", () => { S.ui.pfOnglet = b.dataset.pfo; vPortefeuille(); window.dispatchEvent(new Event("brvm:maj")); }));
      return;
    }
    if (onglet === "epargne") {
      // l'épargne au quotidien : coffre, série, trophées, cercles (cercles.js s'insère avant l'ancre)
      h += ep ? carteEpargne(ep) : `<div class="card epargne ep2"><h2 class="ep2-etat">Fixez-vous un rythme d'épargne</h2><p>Suivez votre régularité et gagnez vos premiers trophées.</p>
        <button type="button" class="btn primary ep2-cta" data-coffre="plan">Choisir mon rythme d'épargne</button></div>`;
      v.innerHTML = h;
      $(".ep2-trophees", v)?.addEventListener("toggle", (ev) => (S.ui.epTrophees = ev.target.open));
      v.querySelectorAll("[data-pfo]").forEach((b) => b.addEventListener("click", () => { S.ui.pfOnglet = b.dataset.pfo; vPortefeuille(); window.dispatchEvent(new Event("brvm:maj")); }));
      return;
    }
    h += `
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
        <div class="kpi"><div class="lbl">Gain total depuis le début</div><div class="val num ${cls(L.gainTotal)}">${L.gainTotal > 0 ? "+" : ""}${F(L.gainTotal)}</div><div class="small muted">dividendes et ventes compris${(() => {
          const c2 = S.prop?.contenu, b = S.prop?.date === S.seance?.date && !journalChanged(L, c2) ? c2?.performance?.bench_total : null;
          return ok(b) ? ` · marché ${P(b)} sur la période` : "";
        })()}</div></div>
        <div class="kpi" style="align-self:center"><button class="btn small" id="gain-aide">Comprendre mon gain</button></div>
      </div>`;
    // Ajouter une opération : l'import d'un avis ou d'un relevé est l'action principale, la saisie l'alternative
    h += `<div class="card ajout-op" aria-labelledby="h-ajout"><h2 id="h-ajout">Ajouter une opération</h2>
        <button type="button" class="ajout-import" data-import=""><span class="ai-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/></svg></span>
          <span class="ai-txt"><b>Importer un avis ou un relevé</b><span>Photo ou PDF de votre SGI : les opérations se remplissent toutes seules</span></span>
          <span class="ai-badge">Le plus rapide</span></button>
        <button type="button" class="ajout-main" data-op=""><span class="ai-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span><span>Saisir à la main</span><span aria-hidden="true">›</span></button>
        ${!S.ops.length ? `<button type="button" class="ajout-main ajout-depart" data-depart=""><span class="ai-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V5l8-2 8 2v15"/><path d="M9 20v-5h6v5M8 9h2M14 9h2"/></svg></span><span>J'ai déjà des titres chez ma SGI<small>Déclarez ce que vous possédez aujourd'hui, sans ressaisir votre historique</small></span><span aria-hidden="true">›</span></button>` : ""}</div>`;
    for (const e of L.errors) h += `<div class="notice bad">${esc(e)}</div>`;
    h += `<div class="card positions"><h2>Positions${L.positions.length ? ` <span class="h-n">${L.positions.length}</span>` : ""}</h2>`;
    if (!L.positions.length) h += `<p class="muted">Aucune position pour l’instant : ajoutez une opération ci-dessus.</p>`;
    else {
      h += `<ul class="list">`;
      for (const p of L.positions) {
        const d = S.decisions?.get(p.code);
        const act = S.actions?.get(p.code);
        const al = S.alertesMap?.get(p.code);
        const ep1 = estEpingle(p.code);
        h += `<li id="pos-${esc(p.code)}" data-pos="${esc(p.code)}"${al ? ` class="a-al al-${NIVEAUX[al.alerte]?.c || "info"}"` : ""}><div class="main"><div class="name">${mq(p.code)}${esc(S.names.get(p.code) || p.code)}${act?.analyse?.note ? ` <span class="grade sm g-${esc(act.analyse.note)}" title="Santé financière">${esc(act.analyse.note)}</span>` : ""}</div>
          <div class="sub">${esc(p.code)} · ${N(p.quantite)} à ${F(p.pru)} en moyenne${ok(al?.plancher) ? ` · plancher ${F(al.plancher)}` : ""}</div>
          <div class="sub etats"><button type="button" class="epingler" data-epingler="${esc(p.code)}" aria-pressed="${ep1}"
            aria-label="${ep1 ? "Retirer des épinglés" : "Épingler dans le menu"} : ${esc(S.names.get(p.code) || p.code)}">${ICONE_EPINGLE}<span>${ep1 ? "Épinglé" : "Épingler"}</span></button>${chip(d)}${pastille(al)}${p.coursDu ? `<span class="small muted">dernier cours connu : ${D(p.coursDu)}</span>` : ""}${p.sansCours ? `<span class="small muted">pas de cours : compté à son prix d'achat</span>` : ""}</div></div>
          <div class="right num">${act ? spark(act.courbe, 72, 24) : ""}<b>${F(p.valeur)}</b><div class="sub ${cls(p.pv)}">${ok(p.pv) ? F(p.pv) + " · " + P(p.pv / p.cout) : "cours inconnu"}</div></div></li>`;
      }
      h += `</ul><p class="small muted">Valorisé au cours de la séance du ${D(S.seance?.date)}. Sous chaque ligne : le gain si vous la vendiez aujourd'hui, frais de vente estimés déduits.
        « Épingler » place un titre dans le menu, pour y revenir en un geste.</p>`;
    }
    h += `</div>`;
    {
      const c = S.prop?.contenu, fresh = S.prop && S.seance && S.prop.date === S.seance.date;
      const changed = !fresh || journalChanged(L, c);
      const lignes = changed ? (L.positions.length || L.cash > 0 ? instantOrders(L).cible : []) : c?.proposition?.lignes || [];
      // Ma répartition : d'abord celle d'aujourd'hui (positions réelles), puis la cible du profil, et les écarts principaux
      const actuel = L.positions.filter((p) => p.valeur > 0 && CLASSES[p.classe]).map((p) => ({ classe: p.classe, montant: p.valeur }));
      if (L.cash > 0) actuel.push({ classe: "liquidites", montant: L.cash });
      const parClasse = (ls) => { const t = {}, tot = ls.reduce((a, l) => a + (+l.montant || 0), 0) || 1;
        ls.forEach((l) => (t[l.classe] = (t[l.classe] || 0) + (+l.montant || 0) / tot)); return t; };
      if (actuel.length) h += `<div class="card cible"><h2>Ma répartition</h2>${classBar(actuel)}
        <p class="small muted">La répartition de vos placements réels au cours de la séance.</p>
        <button type="button" class="btn small sim-lien" data-pfo-aller="simulateur"><span class="sim-pastille">Simulation</span> Comparer à mon profil</button></div>`;
    }
    h += `<details class="card journal journal-pli"${S.ui.journalOuvert ? " open" : ""}><summary><h2>Journal des opérations${S.ops.length ? ` <span class="h-n">${S.ops.length}</span>` : ""}</h2>
      <span class="op-r">${S.ops.length ? `Voir mes ${S.ops.length} opération${S.ops.length > 1 ? "s" : ""}` : "Aucune opération"}</span></summary>`;
    if (S.ops.length) h += acces(1) ? `<div class="actions" style="justify-content:flex-start"><button type="button" class="btn small" data-export-journal>Exporter mon journal (CSV)</button></div>`
      : verrou(1, "L'export du journal en CSV ou Excel");
    if (!S.ops.length) h += `<p class="muted">Aucune opération enregistrée.</p>`;
    else {
      h += `<ul class="list">`;
      for (const o of [...S.ops].reverse()) {
        const what = ["ACHAT", "VENTE"].includes(o.type) ? `${N(o.quantite)} × ${F(o.prix)}` : F(o.montant);
        h += `<li data-op-row="${esc(o.id)}"><div class="main"><div class="name">${esc(TYPES_OP[o.type] || o.type)} ${esc(o.ticker ? (S.names.get(o.ticker) || o.ticker) : "")}</div>
          <div class="sub">${D(o.date)}${o.note ? " · " + esc(o.note) : ""}</div>
          ${o._fract ? `<div class="sub fract">Ajusté du fractionnement du ${D(o._fract.date)} : ${N(o.quantite / o._fract.f)} titres à ${F(o.prix * o._fract.f)}
            deviennent ${N(o.quantite)} titres à ${F(o.prix)}, même montant.</div>` : ""}</div>
          <div class="right num">${what}<div><button class="btn link small del" data-del="${esc(o.id)}" aria-label="Supprimer l'opération du ${D(o.date)}">Supprimer</button></div></div></li>`;
      }
      h += `</ul><p class="small muted">Une erreur de saisie se corrige en supprimant la ligne, jamais par une opération inverse.</p>`;
    }
    v.innerHTML = h + `</details>`;
    $("#gain-aide", v).addEventListener("click", aideGain);
    $(".journal-pli", v)?.addEventListener("toggle", (ev) => (S.ui.journalOuvert = ev.target.open));
    v.querySelectorAll("[data-pfo]").forEach((b) => b.addEventListener("click", () => { S.ui.pfOnglet = b.dataset.pfo; vPortefeuille(); window.dispatchEvent(new Event("brvm:maj")); }));
    v.querySelectorAll("[data-pfo-aller]").forEach((b) => b.addEventListener("click", () => { S.ui.pfOnglet = b.dataset.pfoAller; vPortefeuille(); scrollTo({ top: 0, behavior: "smooth" }); window.dispatchEvent(new Event("brvm:maj")); }));
  }

  // ---------------------------------------------------------------- Simulateur
  // Une hypothèse, jamais un fait : le réel vient du journal, le simulateur calcule ce que donnerait un profil avec un montant.
  // Rien n'est enregistré ; les ordres se passent chez la SGI, puis l'avis s'importe dans le journal.
  const PART = (lignes, classe) => { const t = lignes.reduce((a, l) => a + (+l.montant || 0), 0) || 1;
    return lignes.filter((l) => (classe === "opcvm" ? /^opcvm/.test(l.classe) : l.classe === classe)).reduce((a, l) => a + (+l.montant || 0), 0) / t; };
  function simulateurHtml(L) {
    const badge = `<span class="sim-pastille">Simulation</span>`;
    if (!acces(1)) return `<div class="card sim-zone">${badge}<h2>Simulateur</h2>
      <p>Voyez ce que donnerait votre profil d'investisseur avec votre argent : la répartition visée, les écarts avec vos placements réels, et les ajustements possibles.</p>
      ${verrou(1, "Le simulateur")}</div>`;
    const reel = L.valeur > 0 ? Math.round(L.valeur) : 0;
    const u = S.ui.sim ||= { montant: reel || budgetActuel() || 500000, profil: S.profil?.profil || "equilibre" };
    if (!acces(2)) u.profil = S.profil?.profil || "equilibre";
    const ciblesP = u.profil === S.profil?.profil ? S.cibles : S.ciblesPar?.[u.profil];
    const r = ciblesP ? instantOrders(L.valeur > 0 ? L : { valeur: 0, cash: 0, positions: [] }, { montant: u.montant, cibles: ciblesP }) : null;
    const nA = r ? r.ordres.filter((o) => o.sens !== "VENTE").length : 0, nV = r ? r.ordres.length - nA : 0;
    const ecart = u.montant - reel;
    let h = `<div class="card sim-zone">${badge}<h2>Simulateur</h2>
      <p class="small">Ce que donnerait un profil d'investisseur avec un montant donné. <b>Rien n'est acheté ni enregistré</b> : vos ordres se passent chez votre SGI.</p>
      <div class="sim-reglages">
        <label>Montant simulé (F)<input type="number" min="0" step="10000" inputmode="numeric" id="sim-montant" value="${u.montant}"></label>
        <div class="sim-puces">${reel ? `<button type="button" class="puce${u.montant === reel ? " on" : ""}" data-sim-m="${reel}">Mon portefeuille (${F(reel)})</button>` : ""}
          ${[100000, 500000].map((x) => `<button type="button" class="puce" data-sim-m="${(reel || 0) + x}">${reel ? "+" : ""}${F(x)}</button>`).join("")}</div>
        <div class="sim-profil"><span class="small muted">Profil simulé</span>
          ${acces(2) ? `<div class="seg" role="group" aria-label="Profil simulé">${Object.entries(PROFILS).map(([k, p]) =>
            `<button type="button" data-sim-p="${k}" aria-pressed="${u.profil === k}"${k === S.profil?.profil ? ` aria-label="${p.t}, mon profil"` : ""}>${p.t}${k === S.profil?.profil ? " ★" : ""}</button>`).join("")}</div>`
            : `<b>${esc(PROFILS[u.profil]?.t || "")}</b> <span class="small muted">(votre profil)</span>`}</div>
      </div></div>`;
    if (!r) return h + `<div class="card sim-zone"><p class="muted">Chargement des cibles du profil…</p></div>`;
    // répartition : le réel en trait plein, la simulation en pointillés
    h += `<div class="card sim-zone">${badge}<h2>Répartition</h2>
      ${reel ? `<p class="rep-lbl">Aujourd'hui (réel)</p>${classBar(L.positions.filter((p) => p.valeur > 0 && CLASSES[p.classe]).map((p) => ({ classe: p.classe, montant: p.valeur })).concat(L.cash > 0 ? [{ classe: "liquidites", montant: L.cash }] : []))}` : ""}
      <p class="rep-lbl">Simulée · profil ${esc(PROFILS[u.profil]?.t || "")}${ecart ? ` · ${ecart > 0 ? "avec un apport de" : "avec un retrait de"} ${F(Math.abs(ecart))}` : ""}</p>
      <div class="sim-barre">${classBar(r.cible)}</div>
      <p class="small">${ok(r.rdt) ? `Rendement attendu estimé : <b>${P(r.rdt, false)}</b> par an · ` : ""}${r.cible.length} ligne${r.cible.length > 1 ? "s" : ""}
        · part en actions ${Math.round(PART(r.cible, "actions") * 100)} %</p></div>`;
    // ajustements : un résumé et les principaux, sans bouton d'enregistrement (on n'enregistre que le réel)
    const top = r.ordres.slice().sort((a, b) => b.quantite * b.prix_limite - a.quantite * a.prix_limite).slice(0, 6);
    h += `<div class="card sim-zone">${badge}<h2>Ajustements simulés</h2>
      ${r.ordres.length ? `<p>${[nA ? `${nA} achat${nA > 1 ? "s" : ""}` : "", nV ? `${nV} vente${nV > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et ")} pour se rapprocher de cette répartition :</p>
        <ul class="list">${top.map((o) => `<li><div class="main"><div class="name">${o.sens === "VENTE" ? "Vente" : "Achat"} · ${esc(nomLisible(o.libelle || o.code))}</div>
          <div class="sub">${esc(o.motif || "")}</div></div><div class="right num"><b>${N(o.quantite)} titre${o.quantite > 1 ? "s" : ""}</b><div class="sub">vers ${F(o.prix_limite)}</div></div></li>`).join("")}</ul>
        ${r.ordres.length > top.length ? `<p class="small muted">et ${r.ordres.length - top.length} autre${r.ordres.length - top.length > 1 ? "s" : ""}, plus petit${r.ordres.length - top.length > 1 ? "s" : ""}.</p>` : ""}`
      : `<p>Rien à ajuster : vos placements sont déjà proches de cette répartition.</p>`}
      <p class="small muted">Une estimation pour éclairer vos décisions, pas une recommandation. Si vous passez un ordre chez votre SGI, importez ensuite l'avis :
        votre portefeuille réel se met à jour.</p></div>`;
    // Investisseur : les trois profils côte à côte
    if (acces(2)) {
      const lignes = Object.keys(PROFILS).map((k) => { const c = k === S.profil?.profil ? S.cibles : S.ciblesPar?.[k];
        return [k, c ? instantOrders(L.valeur > 0 ? L : { valeur: 0, cash: 0, positions: [] }, { montant: u.montant, cibles: c }) : null]; });
      h += `<div class="card sim-zone">${badge}<h2>Comparer les profils</h2><p class="small muted">Pour ${F(u.montant)}, avec les cibles de ce soir.</p>
        <div class="scroll-x"><table class="dtable sim-comp"><thead><tr><th>Profil</th><th class="num">Actions</th><th class="num">Oblig.</th><th class="num c-opcvm">OPCVM</th><th class="num" title="Rendement attendu par an">Rend.</th></tr></thead>
        <tbody>${lignes.map(([k, x]) => `<tr class="${k === u.profil ? "on" : ""}"><td><b>${esc(PROFILS[k].t)}</b>${k === S.profil?.profil ? ` <span aria-label="mon profil">★</span>` : ""}</td>
          ${x ? `<td class="num">${Math.round(PART(x.cible, "actions") * 100)} %</td><td class="num">${Math.round(PART(x.cible, "obligations") * 100)} %</td>
          <td class="num c-opcvm">${Math.round(PART(x.cible, "opcvm") * 100)} %</td><td class="num">${ok(x.rdt) ? P(x.rdt, false) : "–"}</td>` : `<td colspan="4" class="muted">…</td>`}</tr>`).join("")}</tbody></table></div>
        <p class="small muted">★ : votre profil. Plus de part en actions : un rendement attendu plus élevé, mais des variations plus fortes. Pour changer de profil : Profil › Mon profil d'investisseur.</p></div>`;
    } else h += `<div class="card sim-zone">${badge}<h2>Comparer les profils</h2>${verrou(2, "La comparaison des trois profils et la simulation d'un autre profil")}</div>`;
    return h;
  }
  async function lierSimulateur(v, L) {
    const u = S.ui.sim, refaire = () => { vPortefeuille(); window.dispatchEvent(new Event("brvm:maj")); };
    // cibles des autres profils, chargées à la demande (Investisseur)
    if (acces(2) && S.seance) {
      S.ciblesPar ||= {};
      const manquants = Object.keys(PROFILS).filter((k) => k !== S.profil?.profil && !S.ciblesPar[k]);
      if (manquants.length) { for (const k of manquants) { try { S.ciblesPar[k] = await ciblesLisibles(S.seance.date, k); } catch (e) { S.ciblesPar[k] = []; } } return refaire(); }
    }
    const m = $("#sim-montant", v);
    m?.addEventListener("change", () => { const x = Math.max(0, Math.round(+m.value || 0)); if (x !== u.montant) { u.montant = x; refaire(); } });
    v.querySelectorAll("[data-sim-m]").forEach((b) => b.addEventListener("click", () => { u.montant = +b.dataset.simM; refaire(); }));
    v.querySelectorAll("[data-sim-p]").forEach((b) => b.addEventListener("click", () => { u.profil = b.dataset.simP; refaire(); }));
  }

  // ---------------------------------------------------------------- tendance du marché : BRVM Composite et BRVM 30
  // Évolution en % sur la période choisie (clôtures officielles BRVM, collectées via Sikafinance), et performance par année.
  const PER_IDX = [["1m", "1 mois", 30], ["3m", "3 mois", 91], ["6m", "6 mois", 182], ["1a", "1 an", 365], ["5a", "5 ans", 1827]];
  const IDX = [["BRVMC", "BRVM Composite", "var(--s3)"], ["BRVM30", "BRVM 30", "var(--s2)"]];
  function tendance() {
    const by = {};
    for (const r of S.indices || []) if (ok(r.cloture) && IDX.some(([k]) => k === r.code)) (by[r.code] ||= []).push(r);
    for (const k in by) by[k].sort((a, b) => (a.date < b.date ? -1 : 1));
    const base = by.BRVMC?.length ? by.BRVMC : by.BRVM30;
    if (!base?.length || base.length < 5) return null;
    const fin = base[base.length - 1].date, per = PER_IDX.find((p) => p[0] === S.ui.tend) || PER_IDX[3];
    const deb = new Date(new Date(fin + "T00:00:00") - per[2] * 864e5).toISOString().slice(0, 10);
    let dates = base.filter((r) => r.date >= deb).map((r) => r.date);
    const court = new Date(base[0].date) - new Date(deb) > 10 * 864e5;   // historique nettement plus court que la période
    if (dates.length > 260) { const st = Math.ceil(dates.length / 260); dates = dates.filter((d, i) => i % st === 0 || i === dates.length - 1); }
    const pts = {}, has = {}, res = {};
    for (const [k] of IDX) {
      const lignes = (by[k] || []).filter((r) => r.date >= dates[0] && r.date <= fin);
      const m = new Map(lignes.map((r) => [r.date, +r.cloture])), b0 = lignes[0]?.cloture;
      let prec = null;
      pts[k] = dates.map((d) => { const c = m.get(d); if (ok(c) && ok(b0)) prec = c / b0 - 1; return prec; });
      has[k] = lignes.length > 1;
      if (has[k]) {
        const cl = lignes.map((r) => +r.cloture);
        res[k] = { var: cl[cl.length - 1] / cl[0] - 1, der: cl[cl.length - 1], haut: Math.max(...cl), bas: Math.min(...cl) };
      }
    }
    // graphique (même dessin que la performance)
    const Wd = 360, Ht = 200, L = 42, R = 58, T = 10, B = 22, n = dates.length;
    const vals = IDX.flatMap(([k]) => (has[k] ? pts[k].filter(ok) : []));
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const pad = (hi - lo || 0.01) * 0.12; lo -= pad; hi += pad;
    const x = (i) => L + (i / Math.max(1, n - 1)) * (Wd - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (Ht - T - B);
    const ticks = [0, 1, 2, 3, 4].map((k) => lo + (k * (hi - lo)) / 4);
    let g = `<g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${Wd - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${P(t)}</text>`).join("")}</g>`;
    g += `<line class="zero" x1="${L}" x2="${Wd - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    g += `<g class="axis"><text x="${x(0)}" y="${Ht - 6}" text-anchor="start">${D(dates[0])}</text><text x="${x(n - 1)}" y="${Ht - 6}" text-anchor="end">${D(dates[n - 1])}</text></g>`;
    const series = IDX.filter(([k]) => has[k]);
    for (const [k, , col] of series)
      g += `<path class="line" stroke="${col}" d="${pts[k].map((v, i) => (ok(v) ? `${i && ok(pts[k][i - 1]) ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}` : "")).join("")}"/>`;
    const ends = series.map(([k, , col]) => ({ col, v: pts[k][n - 1], yy: y(pts[k][n - 1]) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < ends.length; i++) ends[i].yy = Math.max(ends[i].yy, ends[i - 1].yy + 14);
    g += `<g class="end">${ends.map((e) => `<text x="${Wd - R + 6}" y="${e.yy + 4}"><tspan fill="${e.col}">●</tspan> ${P(e.v)}</text>`).join("")}</g>`;
    g += `<g class="hover" visibility="hidden"><line class="cross" y1="${T}" y2="${Ht - B}"/>${series.map(([k, , col]) => `<circle class="dot" r="4" fill="${col}" data-k="${k}"/>`).join("")}</g>`;
    const label = `Évolution du ${D(dates[0])} au ${D(fin)} : ` + series.map(([k, nom]) => `${nom} ${P(res[k].var)}`).join(", ");
    // performance par année civile (l'année en cours : depuis le 1er janvier)
    const annees = [];
    const ref = by.BRVMC || [], ref30 = by.BRVM30 || [];
    const finAnnee = (lst, an) => { for (let i = lst.length - 1; i >= 0; i--) if (lst[i].date.slice(0, 4) <= String(an)) return lst[i].date.slice(0, 4) === String(an) ? +lst[i].cloture : null; return null; };
    const debAnnee = (lst, an) => lst.find((r) => r.date.slice(0, 4) === String(an));
    const perfAn = (lst, an) => {
      const f = finAnnee(lst, an); if (!ok(f)) return null;
      const p0 = finAnnee(lst, an - 1) ?? (debAnnee(lst, an) ? +debAnnee(lst, an).cloture : null);
      return ok(p0) ? f / p0 - 1 : null;
    };
    const anFin = +fin.slice(0, 4);
    for (let an = anFin; an > anFin - 6; an--) {
      const c = perfAn(ref, an), t = perfAn(ref30, an);
      if (ok(c) || ok(t)) annees.push({ an, c, t, partiel: an === anFin || !finAnnee(ref, an - 1) });
    }
    const html = `<div class="card tendance" aria-labelledby="h-tend"><h2 id="h-tend">Tendance du marché</h2>
      <div class="seg tend-per" role="group" aria-label="Période de la tendance">${PER_IDX.map(([k, t]) =>
        `<button type="button" data-tend="${k}" aria-pressed="${per[0] === k}">${t}</button>`).join("")}</div>
      <div class="tend-kpi">${series.map(([k, nom, col]) => `<div><div class="lbl"><i class="s" style="background:${col}"></i>${nom}</div>
        <div class="val num ${cls(res[k].var)}">${P(res[k].var)}</div>
        <div class="small muted">clôture ${nf1.format(res[k].der)} · plus haut ${nf1.format(res[k].haut)} · plus bas ${nf1.format(res[k].bas)}</div></div>`).join("")}</div>
      <div class="chart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="${esc(label)}">${g}<rect class="hit" x="${L}" y="${T}" width="${Wd - L - R}" height="${Ht - T - B}" fill="transparent"/></svg><div class="tip" hidden></div></div>
      <p class="small muted">Évolution en % depuis le début de la période, sur les clôtures officielles de la BRVM.
        ${court ? `Historique disponible à partir du ${D(base[0].date)} : il s'allongera au fil des publications.` : ""} Les performances passées ne préjugent pas des performances futures.</p>
      ${annees.length > 1 ? `<details class="aide"><summary>Performance par année</summary>
        <div class="tbl" role="region" aria-label="Performance des indices par année" tabindex="0"><table>
        <thead><tr><th scope="col">Année</th><th scope="col">BRVM Composite</th><th scope="col">BRVM 30</th></tr></thead>
        <tbody>${annees.map((a) => `<tr><th scope="row">${a.an}${a.partiel ? "*" : ""}</th><td class="${cls(a.c)}">${P2(a.c)}</td><td class="${cls(a.t)}">${P2(a.t)}</td></tr>`).join("")}</tbody></table></div>
        <p class="small muted">* année en cours (depuis le 1er janvier) ou incomplète dans l'historique disponible.</p></details>` : ""}</div>`;
    const lier = (v) => {
      const svg = $(".tendance .chart svg", v), tip = $(".tendance .chart .tip", v);
      if (!svg) return;
      const hov = $(".hover", svg);
      const show = (ev) => {
        const bb = svg.getBoundingClientRect(), sx = ((ev.clientX - bb.left) / bb.width) * Wd;
        let i = 0, best = Infinity;
        for (let k = 0; k < n; k++) { const d = Math.abs(x(k) - sx); if (d < best) { best = d; i = k; } }
        hov.setAttribute("visibility", "visible");
        $(".cross", hov).setAttribute("x1", x(i)); $(".cross", hov).setAttribute("x2", x(i));
        hov.querySelectorAll(".dot").forEach((c) => { const vv = pts[c.dataset.k][i]; c.setAttribute("cx", x(i)); c.setAttribute("cy", ok(vv) ? y(vv) : -99); });
        tip.innerHTML = `<b>${D(dates[i])}</b>` + series.map(([k, nom, col]) => `<span style="color:${col}">●</span> ${nom} ${P(pts[k][i])}`).join("<br>");
        tip.hidden = false;
        const px = (x(i) / Wd) * bb.width;
        tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), bb.width - tip.offsetWidth) + "px";
      };
      svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
      svg.addEventListener("pointerleave", () => { hov.setAttribute("visibility", "hidden"); tip.hidden = true; });
    };
    const rC = res.BRVMC || res.BRVM30;
    const resume = rC ? `${res.BRVMC ? "BRVM Composite" : "BRVM 30"} ${P(rC.var)} sur ${per[1]}` : "Voir la tendance";
    return { html: html.replace('<div class="card tendance"', '<div class="tendance"'), lier, resume };
  }

  // ---------------------------------------------------------------- récapitulatif du soir
  // Quelques cartes à faire défiler, en 30 secondes : votre argent, vos titres, l'alerte du jour, le marché,
  // le fait du soir (différent chaque soir), votre épargne ; la dernière carte finit sur une note positive.
  function recapCartes() {
    const c = S.prop?.contenu, fresh = S.prop && S.seance && S.prop.date === S.seance.date;
    const L = replay(S.ops), hasPf = L.positions.length > 0 || S.ops.length > 0;
    const hist = c?.historique || [], der = hist[hist.length - 1];
    const jour = fresh && der && der.date === S.seance.date && ok(der.gain) ? der : null;
    const vm = varMarche(S.seance.date), v30 = (S.indices || []).find((x) => x.code === "BRVM30" && x.date === S.seance.date)?.variation;
    const actions = (S.mk.actions || []).filter((r) => ok(r.var_1j));
    const cartes = [];
    const carte = (ic, titre, corps, cl = "") => cartes.push({ ic, titre, corps, cl });
    // Votre argent
    if (hasPf) carte("💰", "Votre argent", `<p class="rc-grand num">${montantHtml(L.valeur)}</p>
      ${jour ? `<p class="rc-ligne ${cls(jour.gain)}"><b>${jour.gain > 0 ? "+" : ""}${F(jour.gain)}</b> sur la séance${ok(jour.pct) ? ` (${P(jour.pct)})` : ""}</p>` : `<p class="rc-ligne muted">Total chez votre SGI ce soir.</p>`}
      ${ok(vm) ? `<p class="small">Le marché a fait ${P(vm)} ${vm >= 0 ? "" : ""}sur la même séance.</p>` : ""}`);
    // Vos titres : le meilleur et le plus en recul ce soir
    const miens = L.positions.map((p) => ({ p, r: actions.find((x) => x.code === p.code) })).filter((x) => x.r).sort((a, b) => b.r.var_1j - a.r.var_1j);
    if (miens.length && miens.every((x) => Math.abs(x.r.var_1j) < 0.0005)) {
      carte("📈", "Vos titres ce soir", `<p class="rc-ligne"><b>Stables.</b></p><p>Aucune de vos ${miens.length} action${miens.length > 1 ? "s" : ""} n'a bougé de façon notable ce soir.</p>`);
    } else if (miens.length) {
      const haut = miens[0], bas = miens[miens.length - 1];
      carte("📈", "Vos titres ce soir", `<ul class="rc-liste">
        <li><span>${haut.r.var_1j > 0 ? "Le plus en forme" : "Le moins en recul"}</span><b>${esc(S.names.get(haut.r.code) || haut.r.code)}</b><span class="num ${cls(haut.r.var_1j)}">${P(haut.r.var_1j)}</span></li>
        ${miens.length > 1 && bas.r.var_1j < haut.r.var_1j ? `<li><span>Le plus en recul</span><b>${esc(S.names.get(bas.r.code) || bas.r.code)}</b><span class="num ${cls(bas.r.var_1j)}">${P(bas.r.var_1j)}</span></li>` : ""}</ul>
        <p class="small">Sur ${miens.length} action${miens.length > 1 ? "s" : ""} détenue${miens.length > 1 ? "s" : ""}.</p>`);
    }
    // L'alerte du jour
    const urg = (S.alertes || []).filter((a) => NIVEAUX[a.alerte]?.urgent);
    if (hasPf) carte(urg.length ? "🔔" : "✅", "Vos alertes", urg.length
      ? `<p class="rc-ligne"><b>${urg.length} titre${urg.length > 1 ? "s" : ""} à examiner</b></p>
         <p>${esc(S.names.get(urg[0].ticker) || urg[0].ticker)} : ${esc(NIVEAUX[urg[0].alerte].t.toLowerCase())}. ${esc(motifAlerte(urg[0].motif))}</p>
         <p class="small">Une alerte est un signal à examiner, jamais une vente automatique.</p>`
      : `<p class="rc-ligne"><b>Rien d'urgent ce soir.</b></p><p>Aucun de vos titres ne demande d'attention particulière.</p>`, urg.length ? "rc-alerte" : "");
    // Le marché
    if (actions.length) {
      const hausses = actions.filter((r) => r.var_1j > 0).length, baisses = actions.filter((r) => r.var_1j < 0).length;
      const top = [...actions].sort((a, b) => b.var_1j - a.var_1j)[0], flop = [...actions].sort((a, b) => a.var_1j - b.var_1j)[0];
      carte("🏛️", "Le marché", `${ok(vm) ? `<p class="rc-ligne">BRVM Composite <b class="num ${cls(vm)}">${P(vm)}</b>${ok(v30) ? ` · BRVM 30 <b class="num ${cls(v30)}">${P(v30)}</b>` : ""}</p>` : ""}
        <p>${hausses} action${hausses > 1 ? "s" : ""} en hausse, ${baisses} en baisse.</p>
        <ul class="rc-liste"><li><span>Plus forte hausse</span><b>${esc(top.nom || top.code)}</b><span class="num ${cls(top.var_1j)}">${P(top.var_1j)}</span></li>
          <li><span>Plus forte baisse</span><b>${esc(flop.nom || flop.code)}</b><span class="num ${cls(flop.var_1j)}">${P(flop.var_1j)}</span></li></ul>`);
    }
    // Le fait du soir : change chaque soir (mot du glossaire, ou plus fort rendement de dividende)
    const n = Math.floor(new Date(S.seance.date + "T00:00:00") / 864e5);
    const mot = window.BafiGlossaire?.termeDuJour(n);
    const divs = (S.mk.actions || []).filter((r) => ok(r.rendement_div) && r.rendement_div > 0).sort((a, b) => b.rendement_div - a.rendement_div);
    if (n % 2 === 0 && mot) carte("💡", "Le mot du soir", `<p class="rc-ligne"><b>${esc(mot[0])}</b></p><p>${esc(mot[1])}</p>`);
    else if (divs.length) carte("💡", "Le saviez-vous ?", `<p>Ce soir, le plus fort rendement de dividende de la BRVM est celui de <b>${esc(divs[0].nom || divs[0].code)}</b> : <b>${P(divs[0].rendement_div, false)}</b> par an au cours actuel.</p>
      <p class="small">Un dividende passé ne garantit pas les suivants.</p>`);
    else if (mot) carte("💡", "Le mot du soir", `<p class="rc-ligne"><b>${esc(mot[0])}</b></p><p>${esc(mot[1])}</p>`);
    // Votre épargne : la série, le prochain palier ; la fin du récap sur une note positive
    const ep = epargne();
    if (ep?.plan?.montant) {
      const paliers = PALIERS[ep.plan.rythme] || [], proch = paliers.find((x) => x > ep.serie);
      carte("🔥", "Votre épargne", `<p class="rc-grand">${ep.serie > 0 ? pluriel(ep.serie, ep.unite) : "Nouvelle série"}</p>
        <p class="rc-ligne">${ep.serie > 0 ? "d'affilée" : "à lancer dès aujourd'hui"} · ${F(ep.verse)} mis de côté</p>
        ${proch && ep.serie > 0 ? `<p>Encore <b>${pluriel(proch - ep.serie, ep.unite)}</b> pour la médaille des ${pluriel(proch, ep.unite)}.</p>` : ""}
        ${ep.aFaire ? `<p><button type="button" class="btn primary" data-coffre="verser">J'ai épargné aujourd'hui</button></p>` : `<p class="small">Votre épargne du jour est faite : bravo !</p>`}`, "rc-epargne");
    }
    carte("🌙", "À demain !", `<p class="rc-ligne">Vous êtes à jour pour ce soir.</p>
      <p>${ep?.serie > 0 ? `Votre série de ${pluriel(ep.serie, ep.unite)} continue : c'est la régularité qui construit un patrimoine.` : "Chaque soir de séance, BafiBourse refait le point pour vous."}</p>
      <p class="small muted">Aide à la décision, pas un conseil en investissement.</p>`, "rc-fin");
    return cartes;
  }
  function animerNombre(el) {
    const t = el.firstChild?.nodeType === 3 ? el.firstChild : null, txt = t?.nodeValue || "";
    const v = +txt.replace(/[^\d-]/g, "");
    if (!t || !Number.isFinite(v) || !v) return;
    const t0 = performance.now(), fmt = (x) => nf0.format(Math.round(x)).replace(/\u202f/g, " ");
    (function pas(now) { const k = Math.min(1, (now - t0) / 900); t.nodeValue = txt.replace(/[\d\s\u202f\u00a0.,-]+/, fmt(v * (1 - Math.pow(1 - k, 3))) + " ");
      if (k < 1) requestAnimationFrame(pas); else t.nodeValue = txt; })(t0);
  }
  const ICO_RC = {
    argent: ["rc-t-indigo", '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h2.5M3 9.5h18"/>'],
    titres: ["rc-t-vert", '<path d="M4 18l5-6 4 3 7-8"/><path d="M15 7h5v5"/>'],
    alerte: ["rc-t-ambre", '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.5"/>'],
    marche: ["rc-t-bleu", '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'],
    mot: ["rc-t-ambre", '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'],
    epargne: ["rc-t-ambre", '<rect x="3" y="4" width="18" height="15" rx="2.5"/><circle cx="12" cy="11.5" r="3.2"/><path d="M12 8.3v1.1M12 13.6v1.1M8.8 11.5h1.1M14.1 11.5h1.1M6.5 19v1.6M17.5 19v1.6"/>'],
    demain: ["rc-t-nuit", '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M17 3.5v3M15.5 5h3"/>'],
  };
  const EMO_RC = { "💰": "argent", "📈": "titres", "🏛️": "marche", "💡": "mot", "🔥": "epargne", "🌙": "demain", "⚠️": "alerte", "🔔": "alerte", "⚠": "alerte" };
  const tuileRecap = (emo) => { const [cl, d] = ICO_RC[EMO_RC[emo]] || ICO_RC.mot;
    return `<span class="rc-tuile ${cl}" aria-hidden="true"><svg viewBox="0 0 24 24">${d}</svg></span>`; };
  const DUREE_CARTE = 7000;       // défilement automatique, comme des « stories » : en pause dès qu'on touche ou qu'on survole

  function ouvrirRecap() {
    let d = $("#dlg-recap");
    if (!d) {
      document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-recap" aria-labelledby="rc-titre">
        <div class="rc-tete"><div class="rc-barres" aria-hidden="true"></div>
          <button type="button" class="rc-x" aria-label="Fermer le récap">×</button></div>
        <h2 id="rc-titre" class="sr-only">Récap du soir</h2>
        <div class="rc-piste" tabindex="0" aria-live="polite"></div>
        <div class="rc-nav"><button type="button" class="btn" data-rc="prec">Précédent</button><span class="rc-pos small muted"></span>
          <button type="button" class="btn primary" data-rc="suiv">Suivant</button></div></dialog>`);
      d = $("#dlg-recap");
      const piste = $(".rc-piste", d);
      const pos = () => Math.round(piste.scrollLeft / piste.clientWidth);
      const aller = (i) => piste.scrollTo({ left: i * piste.clientWidth, behavior: CALME ? "auto" : "smooth" });
      // Défilement automatique : la barre de la carte active se remplit, puis on passe à la suivante
      let minuterie = 0, pause = false, actuelle = -1;
      const relancer = () => {
        clearTimeout(minuterie);
        const i = pos(), n = piste.children.length;
        if (CALME || pause || !d.open || i >= n - 1) return;
        minuterie = setTimeout(() => aller(i + 1), DUREE_CARTE);
      };
      d._relancer = relancer;
      const suspendre = (v) => { pause = v; d.classList.toggle("rc-pause", v); if (!v) relancer(); else clearTimeout(minuterie); };
      piste.addEventListener("pointerdown", () => suspendre(true));
      piste.addEventListener("pointerup", () => setTimeout(() => suspendre(false), 400));
      d.addEventListener("mouseenter", () => suspendre(true));
      d.addEventListener("mouseleave", () => suspendre(false));
      const maj = () => {
        const i = pos(), n = piste.children.length;
        d.querySelectorAll(".rc-barres i").forEach((b, k) => { b.classList.toggle("on", k < i); b.classList.toggle("cours", k === i); });
        if (i !== actuelle) {                                  // nouvelle carte : son contenu entre en scène, et le compteur redémarre
          actuelle = i;
          piste.querySelectorAll(".rc-carte").forEach((c, k) => c.classList.toggle("actif", k === i));
          const g = piste.children[i]?.querySelector(".rc-grand .num, .rc-grand");
          if (g && !CALME && !g.dataset.joue) { g.dataset.joue = "1"; animerNombre(g); }
          const b = d.querySelector(".rc-barres i.cours");
          if (b) { b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; }
          relancer();
        }
        $(".rc-pos", d).textContent = `${i + 1} sur ${n}`;
        $('[data-rc="prec"]', d).disabled = i === 0;
        $('[data-rc="suiv"]', d).textContent = i === n - 1 ? "Terminer" : "Suivant";
        piste.querySelectorAll(".rc-carte").forEach((c, k) => c.setAttribute("aria-hidden", String(k !== i)));
      };
      piste.addEventListener("scroll", () => requestAnimationFrame(maj), { passive: true });
      d.addEventListener("click", (ev) => {
        if (ev.target.closest(".rc-x")) return d.close();
        const b = ev.target.closest("[data-rc]");
        if (!b) return;
        const i = pos(), n = piste.children.length;
        if (b.dataset.rc === "prec") aller(i - 1);
        else if (i >= n - 1) d.close(); else aller(i + 1);
      });
      d.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowRight") { ev.preventDefault(); aller(Math.min(pos() + 1, piste.children.length - 1)); }
        if (ev.key === "ArrowLeft") { ev.preventDefault(); aller(Math.max(pos() - 1, 0)); }
      });
      d.addEventListener("close", () => { clearTimeout(minuterie); actuelle = -1; render(); });
      d._maj = maj;
    }
    const cartes = recapCartes();
    $(".rc-barres", d).innerHTML = cartes.map(() => "<i></i>").join("");
    $(".rc-piste", d).innerHTML = cartes.map((c, k) => `<section class="rc-carte ${c.cl}" role="group" aria-roledescription="carte" aria-label="${k + 1} sur ${cartes.length} : ${esc(c.titre)}">
        ${tuileRecap(c.ic)}<h3>${esc(c.titre)}</h3><div class="rc-corps">${c.corps}</div></section>`).join("");
    d.style.setProperty("--rc-duree", CALME ? "0s" : DUREE_CARTE + "ms");
    d.showModal();
    $(".rc-piste", d).scrollLeft = 0;
    d._maj();
    $('[data-rc="suiv"]', d).focus();
    const e = etatTutoriel() || {};
    if (e.recap_vu !== S.seance.date) sauverTutoriel({ ...e, recap_vu: S.seance.date });
  }

  // ---------------------------------------------------------------- trois titres à regarder ce soir
  // Pour ne pas noyer un débutant dans 48 actions : un de ses titres qui demande attention (ou qui a le plus bougé),
  // le meilleur score du soir parmi les titres qu'il n'a pas, et le plus fort mouvement de la séance.
  // Une sélection pour orienter le regard, jamais une recommandation.
  function aRegarder() {
    const actions = S.mk.actions || [];
    if (actions.length < 5) return [];
    const detenus = new Set(replay(S.ops).positions.map((p) => p.code)), pris = new Set(), choix = [];
    const ajouter = (r, raison, classe = "actions", etiquette = "") => { if (r && !pris.has(r.code)) { pris.add(r.code); choix.push({ r, raison, classe, etiquette }); } };
    // 1. un titre détenu : d'abord celui qui a une alerte importante, sinon celui qui a le plus bougé
    const al = (S.alertes || []).find((a) => NIVEAUX[a.alerte]?.urgent);
    if (al) {
      const c = al.ticker, r = [...actions, ...(S.mk.obligations || []), ...(S.mk.opcvm || [])].find((x) => x.code === c);
      const classe = (S.mk.obligations || []).some((x) => x.code === c) ? "obligations" : (S.mk.opcvm || []).some((x) => x.code === c) ? "opcvm" : "actions";
      ajouter(r || { code: c, nom: S.names.get(c) || c }, `${NIVEAUX[al.alerte]?.t || "Alerte"} : ${motifAlerte(al.motif)}`, classe, "Votre titre");
    } else {
      const r = actions.filter((x) => detenus.has(x.code) && ok(x.var_1j)).sort((a, b) => Math.abs(b.var_1j) - Math.abs(a.var_1j))[0];
      if (r && Math.abs(r.var_1j) >= 0.005) ajouter(r, `${r.var_1j > 0 ? "En hausse" : "En baisse"} de ${P(Math.abs(r.var_1j), false)} ce soir`, "actions", "Votre titre");
    }
    // 2. le meilleur score du soir parmi les titres non détenus
    ajouter(actions.filter((x) => !detenus.has(x.code) && ok(x.score)).sort((a, b) => b.score - a.score)[0],
      "Score le plus élevé ce soir", "actions", "Meilleur score");
    // 3. le plus fort mouvement de la séance
    const m = actions.filter((x) => ok(x.var_1j) && !pris.has(x.code)).sort((a, b) => Math.abs(b.var_1j) - Math.abs(a.var_1j))[0];
    if (m && Math.abs(m.var_1j) >= 0.01) ajouter(m, `Plus forte ${m.var_1j > 0 ? "hausse" : "baisse"} de la séance`, "actions", "Mouvement du jour");
    // complément : scores suivants
    for (const r of actions.filter((x) => !detenus.has(x.code) && ok(x.score)).sort((a, b) => b.score - a.score)) {
      if (choix.length >= 3) break;
      ajouter(r, "Parmi les meilleurs scores du soir", "actions", "Score élevé");
    }
    return choix.slice(0, 3);
  }
  function blocARegarder() {
    const c = aRegarder();
    if (c.length < 2) return "";
    return `<section class="card a-regarder" aria-labelledby="h-reg"><h2 id="h-reg">${c.length} titres à regarder ce soir</h2>
      <ul class="reg-liste">${c.map((x) => `<li><button type="button" class="reg" data-regarder="${esc(x.r.code)}" data-classe="${x.classe}">
          <span class="reg-et">${esc(x.etiquette)}</span>
          <span class="reg-nom">${mq(x.r.code)}${esc(x.r.nom || x.r.code)}</span>
          <span class="reg-ligne">${ok(x.r.cours) ? `<b class="num">${F(x.r.cours)}</b>` : ""}${ok(x.r.var_1j) ? ` <span class="num ${cls(x.r.var_1j)}">${P(x.r.var_1j)}</span>` : ""}${ok(x.r.score) ? ` · score ${N(x.r.score)}` : ""}</span>
          <span class="reg-raison">${esc(x.raison)}</span></button></li>`).join("")}</ul>
      <p class="small muted">Une sélection pour orienter votre regard, pas une recommandation. Touchez un titre pour voir son analyse.</p></section>`;
  }

  function vMarche() {
    const v = $("#v-marche"), u = S.ui;
    const rows = S.mk[u.mkTab] || [];
    const q = u.mkQuery.trim().toLowerCase();
    const list = rows.filter((r) => (u.mkFilter === "all" || BUY.includes(r.decision))
      && (!q || (r.code + " " + (r.nom || "")).toLowerCase().includes(q))).sort((a, b) => (b.score || 0) - (a.score || 0));
    const tend = tendance();
    let h = `<h1 id="h-mk">Marché</h1>${!q ? blocARegarder() : ""}
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Classe d'actifs">
          ${[["actions", "Actions"], ["obligations", "Obligations"], ["opcvm", "OPCVM"]].map(([k, t]) =>
            `<button type="button" data-mk="${k}" aria-pressed="${u.mkTab === k}">${t}</button>`).join("")}
        </div>
        <input id="mk-q" type="search" placeholder="Rechercher un titre" value="${esc(u.mkQuery)}" aria-label="Rechercher un titre">
        <select id="mk-f" aria-label="Filtre" style="width:auto">
          <option value="opp"${u.mkFilter === "opp" ? " selected" : ""}>Les mieux notés</option>
          <option value="all"${u.mkFilter === "all" ? " selected" : ""}>Tous</option>
        </select>
      </div>
      <p class="small muted">${list.length} titre${list.length > 1 ? "s" : ""} · séance du ${D(S.seance?.date)} · touchez une ligne pour ${u.mkTab === "actions" ? "ses repères et son analyse" : "le détail"}</p>
      <div class="card"><ul class="list">`;
    for (const r of list.slice(0, u.mkShow)) {
      let px, det;
      if (u.mkTab === "actions") {
        px = `${spark(r.courbe)}<div>${F(r.cours)} <span class="sub ${cls(r.var_1j)}">${P(r.var_1j)}</span></div>`;
        // Découverte : les repères. Essentiel : + dividende, PER et les familles de la note en une ligne.
        // Investisseur : + niveaux de prix, signal technique détaillé, verdict, alertes, chiffres clés et ratios.
        const essentiel = `<p class="small">Dividende ${P(r.rendement_div, false)}${ok(r.per) ? ` · PER ${nf1.format(r.per)}` : ""}</p>`;
        det = !acces(1) ? verrou(1, "Le pourquoi de la note : croissance, rentabilité, solidité, dividende")
          : !acces(2) ? essentiel + analyse(r.analyse)
          : `<p>Prix repère ${F(r.limite_achat)} · plancher ${F(r.stop)} · dividende ${P(r.rendement_div, false)}`
            + (ok(r.per) ? ` · PER ${nf1.format(r.per)}` : "") + `</p>`
            + (r.raisons ? `<p class="small muted">Signal du jour : ${esc(r.raisons)}</p>` : "") + analyse(r.analyse);
      } else if (u.mkTab === "obligations") {
        px = `${P(r.rendement_actuariel, false)}<div class="sub">${F(r.prix)}</div>`;
        det = `${esc(r.emetteur || "")} · échéance ${D(r.echeance)} · duration ${ok(r.duration) ? nf1.format(r.duration) + " ans" : "–"} · coupon ${P(r.taux_coupon, false)}`;
      } else {
        px = `${F(r.vl)}<div class="sub">VL du ${D(r.date_vl)}</div>`;
        const acc = accesFcp();
        det = `${esc(r.gestionnaire || "")}${acc ? (acc.has(r.gestionnaire) ? " · souscriptible via vos comptes" : " · non souscriptible via vos SGI") : ""} · ${esc(CLASSES[r.classe] || r.classe || "")} · volatilité ${P(r.volatilite, false)} · rendement attendu ${P(r.rendement_attendu, false)}`;
      }
      const note = r.analyse?.note ? ` <span class="grade sm g-${esc(r.analyse.note)}" title="Santé financière">${esc(r.analyse.note)}</span>` : "";
      if (u.mkTab !== "actions" && r.raisons) det += `<br>${esc(r.raisons)}`;
      const pxCourt = u.mkTab === "actions" ? `${F(r.cours)}<div class="sub ${cls(r.var_1j)}">${P(r.var_1j)}</div>` : px;
      h += `<li class="mk"><details class="item"><summary class="row"><div class="main"><div class="name">${mq(r.code)}${esc(r.nom || r.code)}</div>
          <div class="sub">${chip(r.decision)}</div></div>
          <div class="right num">${pxCourt}</div></summary>
          <div class="why">${u.mkTab === "actions" ? reperes(r) + histoAnnuel(r.historique_annuel, "action") : `<p class="small muted mk-id">${esc(r.code)} · score ${N(r.score)} sur 100</p>`}
            ${u.mkTab === "opcvm" ? histoAnnuel(r.historique_annuel, "opcvm") : ""}
            ${u.mkTab === "actions" && r.courbe ? `<div class="mk-courbe">${spark(r.courbe, 160, 40)}<span class="small muted">${esc(r.code)} · 3 derniers mois</span></div>` : ""}${det}</div></details></li>`;
    }
    h += `</ul>${list.length > u.mkShow ? `<div class="actions"><button class="btn" id="mk-more">Afficher plus</button></div>` : ""}</div>
      ${tend ? `<details class="card tend-pli"${u.tendOuverte ? " open" : ""}><summary><span class="op-t">Tendance du marché</span>
        <span class="op-r">${esc(tend.resume)}</span></summary>${tend.html}</details>` : ""}
      <p class="small muted">Score de 0 à 100 calculé par l'outil (technique, fondamentaux, dividende, valorisation, liquidité).
      Aide à la décision, pas un conseil en investissement. Données de marché : BRVM.</p>`;
    v.innerHTML = h;
    v.querySelectorAll("[data-mk]").forEach((b) => b.addEventListener("click", () => { u.mkTab = b.dataset.mk; u.mkShow = 30; vMarche(); }));
    v.querySelectorAll("[data-tend]").forEach((b) => b.addEventListener("click", () => { u.tend = b.dataset.tend; vMarche(); }));
    // un titre « à regarder » : la liste se filtre sur lui et son analyse s'ouvre
    v.querySelectorAll("[data-regarder]").forEach((b) => b.addEventListener("click", () => {
      Object.assign(u, { mkTab: b.dataset.classe, mkFilter: "all", mkQuery: b.dataset.regarder, mkShow: 30 });
      vMarche();
      const d = $("#v-marche .list details");
      if (d) { d.open = true; d.scrollIntoView({ block: "start", behavior: CALME ? "auto" : "smooth" }); d.querySelector("summary")?.focus({ preventScroll: true }); }
    }));
    tend?.lier(v);
    $(".tend-pli", v)?.addEventListener("toggle", (ev) => (u.tendOuverte = ev.target.open));
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

  const radios = (name, opts, cur) => `<div class="radios">${Object.entries(opts).map(([k, [t, d]]) => `<label><input type="radio" name="${name}" value="${k}"${cur === k ? " checked" : ""}>
      <span><b>${t}</b>${d ? `<br><span class="small muted">${d}</span>` : ""}</span></label>`).join("")}</div>`;
  function formUnivers(p) {
    return `<form id="f-univers" class="card" novalidate><h2>Mes comptes et mes placements</h2>
      <p class="small muted">Le portefeuille ne retient que ce que vous pouvez et voulez acheter. Les titres que vous détenez déjà ne sont pas concernés.</p>
      ${champsUnivers(p)}
      <div class="actions"><button class="btn primary" type="submit">Enregistrer mes choix</button></div></form>`;
  }
  function champsUnivers(p) {
    const mes = new Set(p.mes_sgi || []);
    return `<fieldset class="fs"><legend>Mes SGI</legend><div class="radios sgi">${listeSgi(mes) || `<p class="small muted">Liste pas encore disponible.</p>`}</div>
        <p class="small muted">Votre SGI n'est pas dans la liste ? Écrivez-nous : elle sera ajoutée.</p></fieldset>
      <label class="switch" style="margin-top:6px"><input type="checkbox" name="souscription_sgo"${p.souscription_sgo ? " checked" : ""}> Je peux aussi souscrire directement auprès des sociétés de gestion</label>
      <fieldset class="fs"><legend>FCP</legend>${radios("choix_fcp", CHOIX_FCP, p.choix_fcp || "accessibles")}</fieldset>
      <fieldset class="fs"><legend>Obligations</legend>${radios("choix_obligations", CHOIX_OBLIG, p.choix_obligations || "toutes")}</fieldset>
      <label class="switch" style="margin-top:14px"><input type="checkbox" name="choix_actions"${p.choix_actions !== false ? " checked" : ""}> Actions cotées</label>`;
  }
  // SGI regroupées par pays, celui de l'utilisateur en premier ; drapeau devant chaque nom
  function listeSgi(mes) {
    const pref = S.profil?.pays || paysParDefaut(), groupes = new Map();
    for (const n of S.univ.sgi) {
      const c = S.univ.paysSgi?.get(n) || "";
      if (!groupes.has(c)) groupes.set(c, []);
      groupes.get(c).push(n);
    }
    const ordre = [...groupes.keys()].sort((a, b) => (b === pref) - (a === pref) || !a - !b || nomPays(a).localeCompare(nomPays(b), "fr"));
    const titres = ordre.length > 1 || (ordre[0] && ordre[0] !== pref);
    return ordre.map((c) => (titres ? `<p class="sgi-pays small"><span class="drapeau" aria-hidden="true">${c ? drapeau(c) : ""}</span>
        ${c ? esc(nomPays(c)) : "Autres SGI"}${c === pref ? ` <span class="muted">· votre pays</span>` : ""}</p>` : "")
      + groupes.get(c).map((n) => `<label><input type="checkbox" name="mes_sgi" value="${esc(n)}"${mes.has(n) ? " checked" : ""}>
        <span>${c ? `<span class="drapeau" aria-hidden="true">${drapeau(c)}</span> ` : ""}${esc(n)}${c ? `<span class="sr-only"> (${esc(nomPays(c))})</span>` : ""}</span></label>`).join("")).join("");
  }
  // → champs du profil, ou message d'erreur
  function lireUnivers(fu) {
    const upd = { mes_sgi: [...fu.querySelectorAll('[name="mes_sgi"]:checked')].map((x) => x.value), souscription_sgo: fu.souscription_sgo.checked,
      choix_fcp: fu.choix_fcp.value || "accessibles", choix_obligations: fu.choix_obligations.value || "toutes", choix_actions: fu.choix_actions.checked };
    if (upd.choix_fcp === "aucun" && upd.choix_obligations === "aucune" && !upd.choix_actions) return "Gardez au moins une catégorie de placements.";
    return upd;
  }

  // ---------------------------------------------------------------- création de compte guidée (onboarding)
  const UEMOA = ["CI", "SN", "ML", "BF", "NE", "TG", "BJ", "GW"];
  const DIASPORA = ["FR", "BE", "CH", "CA", "US", "GB", "DE", "IT", "ES", "MA", "GH", "NG", "GN", "CM", "GA"];
  const FUSEAUX = { "Africa/Abidjan": "CI", "Africa/Dakar": "SN", "Africa/Bamako": "ML", "Africa/Ouagadougou": "BF", "Africa/Niamey": "NE",
    "Africa/Lome": "TG", "Africa/Porto-Novo": "BJ", "Africa/Bissau": "GW", "Europe/Paris": "FR", "Europe/Brussels": "BE" };
  const INDICATIFS = { CI: "225", SN: "221", ML: "223", BF: "226", NE: "227", TG: "228", BJ: "229", GW: "245" };   // secours sans la bibliothèque
  const drapeau = (iso) => String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  let telLib = null, noms = null;
  // Bibliothèque des numéros de téléphone (vendor/), chargée seulement quand on en a besoin ; null si indisponible
  function chargerTel() {
    return telLib ??= new Promise((ok) => {
      if (window.libphonenumber) return ok(window.libphonenumber);
      const sc = document.createElement("script");
      sc.src = "../vendor/libphonenumber-min.js";
      sc.onload = () => ok(window.libphonenumber || null);
      sc.onerror = () => ok(null);
      document.head.appendChild(sc);
    });
  }
  function nomPays(iso) {
    try { noms ??= new Intl.DisplayNames(["fr"], { type: "region" }); return noms.of(iso) || iso; } catch (e) { return iso; }
  }
  function indicatif(lib, iso) { try { return lib ? lib.getCountryCallingCode(iso) : INDICATIFS[iso] || ""; } catch (e) { return INDICATIFS[iso] || ""; } }
  function paysParDefaut() { try { return FUSEAUX[Intl.DateTimeFormat().resolvedOptions().timeZone] || "CI"; } catch (e) { return "CI"; } }
  function optionsPays(lib, cur) {
    const tous = lib ? lib.getCountries() : UEMOA;
    const opt = (c) => `<option value="${c}"${c === cur ? " selected" : ""}>${drapeau(c)} ${esc(nomPays(c))} (+${indicatif(lib, c)})</option>`;
    const reste = tous.filter((c) => !UEMOA.includes(c) && !DIASPORA.includes(c)).sort((a, b) => nomPays(a).localeCompare(nomPays(b), "fr"));
    return `<optgroup label="UEMOA">${UEMOA.map(opt).join("")}</optgroup>` + (lib ? `<optgroup label="Diaspora">${DIASPORA.filter((c) => tous.includes(c)).map(opt).join("")}</optgroup>
      <optgroup label="Tous les pays">${reste.map(opt).join("")}</optgroup>` : "");
  }
  // Prénom, nom, pays (drapeau + indicatif) et téléphone sans indicatif : assistant et Profil
  function champsIdentite(p, lib) {
    const pays = p.pays || paysParDefaut();
    let tel = "";
    try { tel = p.telephone && lib ? lib.parsePhoneNumberFromString(p.telephone)?.formatNational() || "" : p.telephone || ""; } catch (e) { tel = p.telephone || ""; }
    // Pays et téléphone sur une seule ligne : le sélecteur (drapeau + indicatif) donne aussi le pays enregistré
    return `<div class="grid2"><label>Prénom<input name="prenom" autocomplete="given-name" maxlength="60" value="${esc(p.prenom || "")}"></label>
        <label>Nom<input name="nom" autocomplete="family-name" maxlength="80" value="${esc(p.nom || "")}"></label></div>
      <label for="ob-tel">Pays et téléphone <span class="muted">(numéro facultatif)</span></label>
      <div class="tel"><span class="indicatif"><span class="drapeau" aria-hidden="true">${drapeau(pays)} +${indicatif(lib, pays)} <span class="chevron">▾</span></span>
        <select name="pays" aria-label="Pays (et indicatif)">${optionsPays(lib, pays)}</select></span>
        <input id="ob-tel" name="telephone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" value="${esc(tel)}" placeholder="Numéro sans l'indicatif"></div>
      <p class="small muted">Touchez le drapeau pour choisir votre pays. Le numéro sert seulement à vous recontacter si vous demandez de l'aide
        (par exemple pour ouvrir un compte chez une SGI) ; il n'est jamais transmis à des tiers.</p>`;
  }
  function brancherIdentite(f, lib) {
    f.pays.addEventListener("change", () => {
      const c = f.pays.value;
      $(".indicatif .drapeau", f).innerHTML = `${drapeau(c)} +${esc(indicatif(lib, c))} <span class="chevron">▾</span>`;
      f.telephone.focus();
    });
    f.telephone.addEventListener("blur", () => {
      const t = f.telephone.value.trim();
      if (lib && t) try { f.telephone.value = new lib.AsYouType(f.pays.value).input(t); } catch (e) { /* laissé tel quel */ }
    });
  }
  // → { prenom, nom, pays, telephone } (téléphone au format international), ou message d'erreur
  function lireIdentite(f, lib) {
    const prenom = f.prenom.value.trim(), nom = f.nom.value.trim(), pays = f.pays.value, brut = f.telephone.value.trim();
    if (!prenom || !nom) return "Indiquez votre prénom et votre nom.";
    let telephone = null;
    if (brut) {
      if (lib) {
        let n = null;
        try { n = lib.parsePhoneNumberFromString(brut, pays); } catch (e) { n = null; }
        if (!n || !n.isValid()) return `Ce numéro ne correspond pas à un numéro de ${nomPays(pays)} : saisissez-le sans l'indicatif +${indicatif(lib, pays)}.`;
        telephone = n.number;
      } else {
        const d = brut.replace(/\D/g, "");
        if (d.length < 6 || d.length > 12) return "Numéro de téléphone invalide.";
        telephone = "+" + indicatif(null, pays) + d;
      }
    }
    return { prenom, nom, pays, telephone };
  }

  // Profil de risque déduit de 3 questions (plutôt qu'un choix direct)
  const QUESTIONS = [
    { id: "horizon", q: "Dans combien de temps pourriez-vous avoir besoin de cet argent ?", r: [["moins2", "Dans moins de 2 ans"], ["2a5", "Entre 2 et 5 ans"], ["plus5", "Dans plus de 5 ans"]] },
    { id: "baisse", q: "Votre placement perd 20 % en quelques mois. Que faites-vous ?", r: [["vendre", "Je vends pour limiter la perte"], ["attendre", "J'attends que ça remonte"], ["racheter", "J'en profite pour en racheter"]] },
    { id: "priorite", q: "Quelle est votre priorité ?", r: [["proteger", "Protéger mon capital"], ["equilibre", "Un équilibre entre sécurité et rendement"], ["croissance", "Faire croître mon épargne sur le long terme"]] }];
  function profilDepuis(rep) {
    if (rep.horizon === "moins2") return "prudent";                  // argent nécessaire bientôt : pas de risque
    const sc = QUESTIONS.reduce((t, q) => t + Math.max(0, q.r.findIndex(([k]) => k === rep[q.id])), 0);
    return sc <= 2 ? "prudent" : sc <= 4 ? "equilibre" : "dynamique";
  }

  // Assistant en 5 étapes : chaque étape est enregistrée tout de suite (reprise là où on s'est arrêté)
  async function onboarding(completer = false) {
    const v = $("#v-onboarding"), p = S.profil;
    document.querySelectorAll(".tabs-top, .tabs-bottom").forEach((n) => (n.hidden = true));
    document.querySelectorAll("main > .view").forEach((n) => (n.hidden = n !== v));
    v.hidden = false;
    v.innerHTML = `<p class="center muted">Chargement…</p>`;
    const lib = await chargerTel();
    const toutes = [
      { n: 1, titre: "Vous", oblig: true },
      { n: 2, titre: "Votre profil d'investisseur", oblig: true },
      { n: 3, titre: "Votre épargne" },
      ...(S.univ ? [{ n: 4, titre: "Vos comptes" }] : []),
      { n: 5, titre: "Vos préférences", oblig: true }];
    const etapes = completer
      ? toutes.filter((e) => (e.n === 1 && !p.prenom) || e.n === 2 || e.n === 4)
      : toutes.filter((e) => [1, 3, 5].includes(e.n));
    let i = completer ? 0 : Math.max(0, etapes.findIndex((e) => e.n > (+p.onboarding_etape || 0)));
    const rep = { ...(p.questionnaire || {}) };
    return new Promise((fini) => {
      const finir = (msg) => {
        v.hidden = true;
        document.querySelectorAll(".tabs-top, .tabs-bottom").forEach((n) => (n.hidden = false));
        history.replaceState(null, "", location.pathname + location.search + "#aujourdhui");
        render();
        if (msg) toast(msg);
        fini();
      };
      const corps = (e) => {
        if (e.n === 1) return `<p class="small muted">Pour personnaliser votre espace. Votre adresse : <b>${esc(S.user.email || p.email || "")}</b></p>` + champsIdentite(p, lib);
        if (e.n === 2) return QUESTIONS.map((q) => `<fieldset class="fs"><legend>${q.q}</legend>${radios(q.id, Object.fromEntries(q.r.map(([k, t]) => [k, [t, ""]])), rep[q.id])}</fieldset>`).join("")
          + `<p class="notice info small" id="ob-profil"${rep.horizon && rep.baisse && rep.priorite ? "" : " hidden"}></p>`;
        if (e.n === 3) {
          const pl = S.coffre?.plan || {};
          return (S.coffre ? `<p class="small muted">Mettez de côté un peu, régulièrement : c'est la clé. L'argent reste chez vous (espèces, banque, mobile money).</p>
            <div class="grid2"><label>Je mets de côté (F)<input name="montant" type="number" min="0" step="500" inputmode="numeric" value="${pl.montant || ""}" placeholder="ex. 5000"></label>
              <label>Rythme<select name="rythme">${Object.entries({ quotidien: "Chaque jour", hebdo: "Chaque semaine", mensuel: "Chaque mois" })
                .map(([k, t]) => `<option value="${k}"${(pl.rythme || "mensuel") === k ? " selected" : ""}>${t}</option>`).join("")}</select></label></div>
            <label>Objectif à atteindre (F, facultatif)<input name="objectif" type="number" min="0" step="10000" inputmode="numeric" value="${pl.objectif || ""}" placeholder="ex. 500000"></label>` : "")
            + `<label>Montant que vous souhaitez investir en bourse (F, facultatif)<input name="budget" type="number" min="0" step="10000" inputmode="numeric" value="${+p.budget || ""}" placeholder="ex. 500000"></label>
            <p class="small muted">Vous pourrez le changer à tout moment${S.coffre ? ", ou le faire suivre automatiquement votre épargne (Profil)" : ""}.</p>`;
        }
        if (e.n === 4) return champsUnivers(p) + `<p class="small muted">Pas encore de compte chez une SGI ? Passez cette étape : vous pourrez l'indiquer plus tard dans votre profil.</p>`;
        return `<label class="switch"><input type="checkbox" name="recevoir_email"${p.recevoir_email !== false ? " checked" : ""}> Recevoir ma ${SIM() ? "simulation" : "proposition"} par e-mail chaque soir de séance</label>
          ${S.coffre && (DEMO || "felicitations" in p) ? `<label class="switch" style="margin-top:12px"><input type="checkbox" name="felicitations"${p.felicitations !== false ? " checked" : ""}> Animations de félicitations (confettis)</label>` : ""}
          <h3 style="margin-top:18px">Récapitulatif</h3><ul class="recap small">
            <li><b>${esc(p.prenom || "")}${p.nom ? " " + esc(p.nom) : ""}</b>${p.pays ? ` · ${drapeau(p.pays)} ${esc(nomPays(p.pays))}` : ""}</li>
            <li>Profil d'investisseur : <b>${esc(PROFILS[p.profil]?.t || "Équilibré")}</b>${p.questionnaire?.horizon ? "" : " (par défaut : vous l'affinerez en 1 minute)"}</li>
            ${S.coffre?.plan?.montant ? `<li>Épargne : <b>${F(S.coffre.plan.montant)}</b> ${({ quotidien: "par jour", hebdo: "par semaine", mensuel: "par mois" })[S.coffre.plan.rythme] || ""}</li>` : ""}
            ${+p.budget ? `<li>Montant à investir : <b>${F(p.budget)}</b></li>` : ""}
            ${(p.mes_sgi || []).length ? `<li>SGI : <b>${esc(p.mes_sgi.join(", "))}</b></li>` : ""}</ul>
          <p class="small muted">Tout se modifie ensuite dans l'onglet Profil.</p>`;
      };
      const lire = async (e, f) => {
        if (e.n === 1) return lireIdentite(f, lib);
        if (e.n === 2) {
          for (const q of QUESTIONS) { rep[q.id] = f[q.id].value; if (!rep[q.id]) return "Répondez aux trois questions."; }
          return { questionnaire: { ...rep }, profil: profilDepuis(rep) };
        }
        if (e.n === 3) {
          const montant = S.coffre ? Math.max(0, +f.montant.value || 0) : 0;
          if (montant) {
            const pl = { ...(S.coffre.plan || {}), montant, rythme: f.rythme.value, jours_ouvres: S.coffre.plan?.jours_ouvres ?? true,
              objectif: +f.objectif.value || null, debut: S.coffre.plan?.debut || new Date().toISOString().slice(0, 10) };
            await api.savePlan(pl);
            S.coffre.plan = pl;
          }
          const budget = Math.max(0, +f.budget.value || 0);
          return budget ? { budget } : {};
        }
        if (e.n === 4) return lireUnivers(f);
        const upd = { recevoir_email: f.recevoir_email.checked };
        if (!p.profil) upd.profil = "equilibre";                // profil par défaut, en attendant les 3 questions
        if (!p.budget_mode && S.coffre) upd.budget_mode = "auto";      // la simulation part de l'argent réel
        if (f.felicitations) upd.felicitations = f.felicitations.checked;
        if (!p.onboarding_fini_le) upd.onboarding_fini_le = new Date().toISOString();
        return upd;
      };
      const afficher = () => {
        const e = etapes[i], dernier = i === etapes.length - 1;
        v.innerHTML = `<h1 id="h-ob">${completer ? "Affiner mon profil" : p.prenom ? `Bienvenue, ${esc(p.prenom)}` : "Bienvenue"}</h1>
          ${!completer && i === 0 ? `<p class="small">Trois petites étapes, une minute, puis votre portrait d'épargnant.</p>` : ""}
          <div class="ob-barre" role="progressbar" aria-label="Progression" aria-valuemin="1" aria-valuemax="${etapes.length}" aria-valuenow="${i + 1}">
            <span style="width:${((i + 1) / etapes.length) * 100}%"></span></div>
          <p class="small muted">Étape ${i + 1} sur ${etapes.length}</p>
          <form id="f-ob" class="card" novalidate><h2>${e.titre}</h2>${corps(e)}<p class="msg" role="status" aria-live="polite"></p>
            <div class="actions">${i > 0 ? `<button class="btn" type="button" data-retour>Retour</button>` : ""}
              ${e.oblig ? "" : `<button class="btn" type="button" data-passer>Passer</button>`}
              <button class="btn primary" type="submit">${dernier ? "Terminer" : "Continuer"}</button></div></form>
          ${i > 0 || completer ? `<p class="small center"><button class="btn link" type="button" data-plus-tard>Terminer plus tard</button></p>` : ""}`;
        const f = $("#f-ob", v), msg = $(".msg", f);
        if (e.n === 1) brancherIdentite(f, lib);
        if (e.n === 2) {
          const maj = () => {
            QUESTIONS.forEach((q) => { rep[q.id] = f[q.id].value || rep[q.id]; });
            const el = $("#ob-profil", f);
            if (!(rep.horizon && rep.baisse && rep.priorite)) return;
            const pr = PROFILS[profilDepuis(rep)];
            el.hidden = false;
            el.innerHTML = `Votre profil : <b>${esc(pr.t)}</b>. ${esc(pr.d)}`;
          };
          f.addEventListener("change", maj); maj();
        }
        f.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const b = $("button[type=submit]", f);
          b.disabled = true;
          try {
            const upd = await lire(e, f);
            if (typeof upd === "string") { msg.textContent = upd; b.disabled = false; return; }
            if ("onboarding_etape" in p || DEMO) upd.onboarding_etape = Math.max(+p.onboarding_etape || 0, e.n);
            await api.saveProfil(S.user.id, upd);
            const avant = p.profil;
            Object.assign(p, upd);
            if (upd.profil && upd.profil !== avant && S.seance) S.cibles = await ciblesLisibles(S.seance.date, upd.profil);
            if (dernier && completer) return finir("Profil complété.");
            if (dernier) {                                       // premier « waouh » : le portrait, avant d'entrer dans l'espace
              v.innerHTML = `<div class="portrait">${portraitHtml(true)}
                <div class="actions"><button class="btn primary" type="button" data-entrer>Découvrir mon espace</button></div></div>`;
              window.scrollTo(0, 0);
              animerPortrait(v);
              $("[data-entrer]", v).addEventListener("click", () => finir(`Bienvenue${p.prenom ? ", " + p.prenom : ""} ! Votre espace est prêt.`));
              $("[data-entrer]", v).focus({ preventScroll: true });
              return;
            }
            i++; afficher();
            window.scrollTo(0, 0);
          } catch (err) { msg.textContent = "Enregistrement impossible : " + err.message; b.disabled = false; }
        });
        $("[data-retour]", v)?.addEventListener("click", () => { i--; afficher(); });
        $("[data-passer]", v)?.addEventListener("click", () => { i++; afficher(); });
        $("[data-plus-tard]", v)?.addEventListener("click", () => {
          try { sessionStorage.setItem("brvm-ob-plus-tard", "1"); } catch (e) { /* stockage indisponible */ }
          finir(completer ? "" : "D'accord : vous reprendrez votre profil à la prochaine connexion.");
        });
        $("input, select", f)?.focus();
      };
      afficher();
    });
  }

  // ---------------------------------------------------------------- la bourse remise dans son contexte
  // Une perte isolée effraie ; comparée au marché sur la même période, elle se comprend. Phrases factuelles, sans conseil.
  function contexteMarche(pf, ix, depuis) {
    if (!ok(pf) || !ok(ix)) return "";
    const pct = (v) => nf1.format(Math.abs(v) * 100) + " %", d = depuis ? ` depuis le ${D(depuis)}` : "";
    const vous = (v) => `${v >= 0 ? "progresse" : "recule"} de ${pct(v)}`, marche = (v) => `${v >= 0 ? "progressé" : "reculé"} de ${pct(v)}`;
    if (pf < 0 && ix < 0) return pf >= ix
      ? `Le marché a ${marche(ix)}${d} ; votre portefeuille ne recule que de ${pct(pf)} : il résiste mieux.`
      : `Le marché a ${marche(ix)}${d}, votre portefeuille ${vous(pf)}. Sur une courte période, c'est fréquent : la bourse se juge sur plusieurs années.`;
    if (pf < 0) return `Votre portefeuille ${vous(pf)} alors que le marché a ${marche(ix)}${d} : regardez les alertes de vos titres.`;
    if (ix < 0) return `Votre portefeuille ${vous(pf)} alors que le marché a ${marche(ix)}${d}.`;
    return `Votre portefeuille ${vous(pf)} ; le marché a ${marche(ix)}${d}.`;
  }
  // Variation de la BRVM Composite lors d'une séance donnée
  const varMarche = (date) => {
    const r = (S.indices || []).find((x) => x.code === "BRVMC" && x.date === date);
    return ok(r?.variation) ? +r.variation : null;
  };
  // La discipline d'épargne : ce qui dépend entièrement de l'utilisateur, montré en premier
  function bandeDiscipline(L) {
    const ep = epargne();
    if (ep?.plan?.montant) {
      const unites = ep.unite === "mois" ? "mois" : ep.unite + "s";
      return `<div class="syn-disc"><span class="syn-disc-ic" aria-hidden="true">${ep.serie > 0 ? "🔥" : "＋"}</span><div>
        <b>${ep.serie > 0 ? `Série de ${pluriel(ep.serie, ep.unite)}` : "Une nouvelle série à lancer"}</b> · ${F(ep.verse)} mis de côté
        ${ep.total ? `<div class="small">Régularité : ${ep.tenus} ${unites} tenus sur ${ep.total}${ep.record > ep.serie ? ` · record : ${pluriel(ep.record, ep.unite)}` : ""}</div>` : ""}</div></div>`;
    }
    if (L.apports > 0) return `<div class="syn-disc"><span class="syn-disc-ic" aria-hidden="true">＋</span><div><b>${F(L.apports)} investis</b> au fil de vos versements à votre SGI
      <div class="small"><button type="button" class="btn link small" data-coffre="plan">Fixer un rythme d’épargne</button> pour suivre votre régularité.</div></div></div>`;
    return "";
  }

  // ---------------------------------------------------------------- portrait d'épargnant
  // Ce que la régularité seule permet de mettre de côté (aucun rendement de bourse supposé : pas de promesse de gain),
  // le portefeuille cible du profil de risque, et le premier trophée à portée de main.
  const PAR_AN = (pl) => pl.rythme === "quotidien" ? (pl.jours_ouvres === false ? 365 : 260) : pl.rythme === "hebdo" ? 52 : 12;
  function portraitHtml(debut = false) {
    const p = S.profil || {}, pl = S.coffre?.plan || {}, pr = PROFILS[p.profil] || PROFILS.equilibre;
    const exemple = !(+pl.montant > 0);
    const plan = exemple ? { montant: 1000, rythme: "quotidien", jours_ouvres: true } : pl;
    const n = PAR_AN(plan), unite = { quotidien: "par jour", hebdo: "par semaine", mensuel: "par mois" }[plan.rythme] || "";
    const horizons = [["Dans 6 mois", n / 2], ["Dans 1 an", n], ["Dans 3 ans", n * 3]].map(([t, k]) => [t, Math.round(k) * plan.montant]);
    const max = horizons[2][1];
    // objectif : date approximative d'arrivée au rythme choisi
    let objectif = "";
    if (!exemple && +pl.objectif > 0) {
      const deja = epargne()?.verse || 0, reste = Math.max(0, pl.objectif - deja);
      const jours = Math.ceil(reste / plan.montant) * (365 / n);
      const quand = new Date(Date.now() + jours * 864e5).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      objectif = reste ? `<p>Votre objectif de <b>${F(pl.objectif)}</b> serait atteint vers <b>${quand}</b>.</p>` : `<p>Votre objectif de <b>${F(pl.objectif)}</b> est déjà atteint : bravo !</p>`;
    }
    // portefeuille cible du profil : poids des cibles regroupés par classe d'actifs
    const parClasse = {};
    for (const c of S.cibles || []) parClasse[c.classe] = (parClasse[c.classe] || 0) + (+c.poids || 0);
    const total = Object.values(parClasse).reduce((a, b) => a + b, 0);
    const classes = Object.entries(parClasse).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const repartition = total ? `<div class="pt-barre" role="img" aria-label="${esc(classes.map(([k, v]) => `${CLASSES[k] || k} ${Math.round((v / total) * 100)} %`).join(", "))}">
        ${classes.map(([k, v]) => `<i style="width:${(v / total) * 100}%;background:${COLORS[k] || "var(--muted)"}"></i>`).join("")}</div>
      <ul class="pt-leg">${classes.map(([k, v]) => `<li><i style="background:${COLORS[k] || "var(--muted)"}"></i>${esc(CLASSES[k] || k)} <b>${Math.round((v / total) * 100)} %</b></li>`).join("")}</ul>` : "";
    const verse = epargne()?.verse || 0;
    return `<p class="pt-sur">${debut ? "Votre espace est prêt" : "Votre portrait d'épargnant"}</p>
      <h1 id="h-portrait">${p.prenom ? `${esc(p.prenom)}, voici` : "Voici"} ce que votre régularité peut construire</h1>
      <section class="card pt-carte" aria-labelledby="pt-ep">
        <h2 id="pt-ep">${exemple ? "Par exemple, avec 1 000 F par jour ouvré" : `Avec ${F(plan.montant)} ${unite}`}</h2>
        <ul class="pt-proj">${horizons.map(([t, m]) => `<li><span class="pt-t">${t}</span>
          <span class="pt-piste"><i data-l="${Math.max(6, (m / max) * 100).toFixed(1)}"></i></span><b class="num">${montantHtml(m)}</b></li>`).join("")}</ul>
        <p class="small muted">Votre épargne seule, mise de côté avec régularité : sans compter aucun gain ni aucune perte de la bourse.</p>
        ${objectif}
        ${exemple ? `<p class="small">Choisissez votre propre rythme dans le Profil : ce portrait s'y adaptera.</p>` : ""}
      </section>
      <section class="card pt-carte" aria-labelledby="pt-pf">
        <h2 id="pt-pf">Votre profil : ${esc(pr.t)}</h2>
        <p>${esc(pr.d)}</p>
        ${repartition ? `<p class="small muted">Répartition de ${SIM() ? "la simulation" : "votre portefeuille cible"} ce soir :</p>${repartition}` : ""}
      </section>
      <section class="card pt-carte pt-trophee" aria-labelledby="pt-tr">
        ${medaille({ marque: "1", metal: "emeraude", ok: verse > 0 })}
        <div><h2 id="pt-tr">${verse > 0 ? "Premier trophée gagné" : "Votre premier trophée vous attend"}</h2>
          <p class="small">${verse > 0 ? "Vous avez déjà commencé à mettre de côté : continuez votre série !" : "Mettez de côté vos premiers francs avec le coffre : la médaille « Premier pas » est à vous."}</p></div>
      </section>
      <p class="small muted">Projection de l'épargne seule, à titre d'illustration. Ce n'est pas un conseil en investissement ; investir en bourse comporte un risque de perte en capital.</p>`;
  }
  // Les barres de la projection se remplissent une fois (sauf si l'appareil demande moins d'animations)
  function animerPortrait(hote) {
    const barres = hote.querySelectorAll(".pt-piste i");
    if (CALME) { barres.forEach((b) => (b.style.width = b.dataset.l + "%")); return; }
    requestAnimationFrame(() => setTimeout(() => barres.forEach((b, k) => setTimeout(() => (b.style.width = b.dataset.l + "%"), k * 160)), 200));
  }
  function voirPortrait() {
    showInfo("Mon portrait d'épargnant", `<div class="portrait">${portraitHtml(false).replace(/<p class="pt-sur">[^<]*<\/p>\s*<h1[^>]*>[^<]*<\/h1>/, "")}</div>`);
    animerPortrait($("#dlg-info"));
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
        ${S.coffre && (DEMO || "felicitations" in p) ? `<label class="switch" style="margin-top:14px"><input type="checkbox" name="felicitations"${p.felicitations !== false ? " checked" : ""}>
          Animations de félicitations (confettis)</label>` : ""}
        <label class="switch" style="margin-top:14px"><input type="checkbox" name="recevoir_email"${p.recevoir_email ? " checked" : ""}>
          Recevoir ma ${SIM() ? "simulation" : "proposition"} par e-mail chaque soir de séance</label>
        <div class="actions"><button class="btn primary" type="submit">Enregistrer mes réglages</button></div>
      </form>
      ${DEMO || "prenom" in p ? `<form id="f-identite" class="card" novalidate><h2>Mes coordonnées</h2><div class="ident"><p class="muted small">Chargement…</p></div>
        <p class="msg" role="status" aria-live="polite"></p><div class="actions"><button class="btn primary" type="submit">Enregistrer mes coordonnées</button></div></form>` : ""}
      ${S.univ && (DEMO || "mes_sgi" in p) ? formUnivers(p) : ""}
      ${S.coffre ? formPlan(S.coffre.plan || {}) : ""}
      ${DEMO && S.coffre ? `<div class="card"><h2>Essayer les félicitations</h2><p class="small muted">Démonstration uniquement.</p>
        <div class="actions" style="justify-content:flex-start">
          <button class="btn small" data-essai="jour">Petite victoire</button><button class="btn small" data-essai="serie">Série de 7 jours</button>
          <button class="btn small" data-essai="objectif">Objectif atteint</button><button class="btn small" data-essai="seuil">Prêt à investir</button>
          <button class="btn small" data-essai="perdue">Série perdue</button></div></div>` : ""}
      <div class="card">
        <h2>À propos</h2>
        <p class="small">Chaque soir de séance, l'outil analyse les actions, obligations et OPCVM cotés à la BRVM, puis calcule
          ${SIM() ? "une simulation de portefeuille et les ajustements pour la rejoindre, à partir des réglages que vous choisissez (budget, profil) et de votre journal."
            : "pour vous un portefeuille cible et les ordres pour le rejoindre, à partir de votre budget, de votre profil et de votre journal."}</p>
        ${S.docs?.avertissement ? `<div class="doc-texte small muted">${esc(S.docs.avertissement.texte)}</div>`
          : `<p class="small muted">${AVERT()} Les performances passées ne préjugent
          pas des performances futures. Vos données (profil, journal) ne sont visibles que par vous.</p>`}
        ${S.docs?.cgu ? `<p class="small"><button class="btn link" type="button" id="voir-cgu">${esc(S.docs.cgu.titre)} (version ${esc(S.docs.cgu.version)})</button>
          ${p.cgu_acceptee_le ? `<span class="muted">acceptée le ${new Date(p.cgu_acceptee_le).toLocaleDateString("fr-FR")}</span>` : ""}</p>` : ""}
        <div class="actions"><button class="btn" id="logout">${DEMO ? "Quitter la démo" : "Se déconnecter"}</button>
          ${DEMO ? "" : `<button class="btn link small" id="logout-partout">Me déconnecter de tous mes appareils</button>`}</div>
        ${DEMO ? "" : `<p class="small muted">Téléphone perdu, ordinateur partagé : « tous mes appareils » ferme aussi les sessions ouvertes ailleurs, en moins d'une heure.</p>`}
      </div>`;
    const f = $("#f-profil", v);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const upd = { budget: Math.max(0, +f.budget.value || 0), profil: f.profil.value || "equilibre", recevoir_email: f.recevoir_email.checked };
      if (S.coffre) { upd.budget_mode = f.budget_mode.value; if (f.felicitations) upd.felicitations = f.felicitations.checked; }
      const fin = occupe(ev.submitter || $('[type="submit"]', f));
      try {
        await api.saveProfil(S.user.id, upd);
        const changed = upd.profil !== S.profil.profil;
        Object.assign(S.profil, upd);
        if (changed && S.seance) S.cibles = await ciblesLisibles(S.seance.date, upd.profil);
        fin("✓ Enregistré");
        confirmeForm(f, `la ${SIM() ? "simulation" : "proposition"} sera recalculée ce soir`);
      } catch (err) { fin(); toast("Enregistrement impossible : " + err.message); }
    });
    const fi = $("#f-identite", v);
    if (fi) chargerTel().then((lib) => {
      if (!fi.isConnected) return;
      $(".ident", fi).innerHTML = champsIdentite(p, lib);
      brancherIdentite(fi, lib);
      fi.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const upd = lireIdentite(fi, lib), msg = $(".msg", fi);
        if (typeof upd === "string") { msg.textContent = upd; return; }
        msg.textContent = "";
        const fin = occupe(ev.submitter || $('[type="submit"]', fi));
        try { await api.saveProfil(S.user.id, upd); Object.assign(S.profil, upd); fin("✓ Enregistré"); confirmeForm(fi, ""); }
        catch (err) { fin(); msg.textContent = "Enregistrement impossible : " + err.message; }
      });
    });
    $("#f-univers", v)?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fu = ev.currentTarget, upd = lireUnivers(fu);
      if (typeof upd === "string") { toast(upd); return; }
      const fin = occupe(ev.submitter || $('[type="submit"]', fu));
      try {
        await api.saveProfil(S.user.id, upd);
        Object.assign(S.profil, upd);
        fin("✓ Enregistré");
        confirmeForm(fu, `${SIM() ? "la simulation" : "la proposition"} en tiendra compte ce soir, l'estimation immédiate tout de suite`);
      } catch (err) { fin(); toast("Enregistrement impossible : " + err.message); }
    });
    $("#logout", v).addEventListener("click", () => api.logout());
    $("#logout-partout", v)?.addEventListener("click", async () => {
      if (!confirm("Vous déconnecter de tous vos appareils ?\n\nTéléphone, ordinateur, tablette : il faudra vous reconnecter partout avec votre adresse e-mail.")) return;
      try { await api.logoutPartout(); } catch (e) { toast("Déconnexion impossible : " + e.message); }
    });
    $("#voir-cgu", v)?.addEventListener("click", () => showCgu(S.docs.cgu, false));
    v.querySelectorAll("[data-essai]").forEach((b) => b.addEventListener("click", () => {
      const tr = trophees(epargne()), e = b.dataset.essai;
      if (e === "jour") { location.hash = "portefeuille"; setTimeout(() => feter(5000), 300); }
      else if (e === "perdue") { S.demoPerdue = true; location.hash = "portefeuille"; setTimeout(() => (S.demoPerdue = false), 800); }
      else bravo([{ serie: { titre: "7 jours d'affilée", marque: "7", metal: "argent", msg: "Petit à petit, l'oiseau fait son nid : 7 jours sans interruption. Continuez sur cette lancée !", ok: true },
        objectif: { titre: "Objectif atteint", marque: "100%", metal: "platine", msg: "Vous avez mis de côté 500 000 F : objectif atteint. Bravo pour votre discipline !", ok: true },
        seuil: tr.find((t) => t.id === "seuil") }[e]].map((t) => ({ ...t, ok: true })));
    }));
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
        const fin = occupe(ev.submitter || $('[type="submit"]', fp));
        try { await api.savePlan(plan); S.coffre.plan = plan; vProfil(); confirmeForm($("#f-plan"), "votre rythme d'épargne est mis à jour"); }
        catch (e) { fin(); toast("Enregistrement impossible : " + e.message); }
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
      g += `<path class="line" pathLength="1" stroke="${col}" d="${pts[k].map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")}"/>`;
    g += `<g class="end">${ends.map((e) => `<text x="${Wd - R + 6}" y="${e.yy + 4}"><tspan fill="${e.col}">●</tspan> ${P(e.v)}</text>`).join("")}</g>`;
    g += `<g class="hover" visibility="hidden"><line class="cross" y1="${T}" y2="${Ht - B}"/>${SERIES.filter(([k]) => has[k]).map(([k, , col]) => `<circle class="dot" r="4" fill="${col}" data-k="${k}"/>`).join("")}</g>`;
    const label = `Performance cumulée du ${D(dates[1])} au ${D(dates[dates.length - 1])} : ` + SERIES.filter(([k]) => has[k]).map(([k, n]) => `${n} ${P(pts[k][pts[k].length - 1])}`).join(", ");
    return { html: `<div class="chart"><svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="${esc(label)}">${g}<rect class="hit" x="${L}" y="${T}" width="${Wd - L - R}" height="${Ht - T - B}" fill="transparent"/></svg><div class="tip" hidden></div></div>`,
             pts, dates, x, y, Wd, has };
  }

  function vPerformance() {
    if (!acces(1) && S.ui.perf === 0) S.ui.perf = 63;          // Découverte : les 3 derniers mois
    const v = $("#v-performance");
    const secours = !(S.prop?.contenu?.historique || []).length && S.histSecours;
    const hist = ((secours ? S.histSecours.historique : S.prop?.contenu?.historique) || []).filter((r) => r.date);
    const ix = {};
    for (const r of S.indices || []) (ix[r.code] ||= new Map()).set(r.date, r);
    let h = `<h1 id="h-perf">Performance</h1>`;
    if (secours) h += `<div class="notice">Le calcul du ${D(S.prop.date)} n'a pas mis à jour l'historique de performance :
      les chiffres ci-dessous s'arrêtent au ${D(hist[hist.length - 1]?.date)}. Ils se compléteront au prochain calcul réussi.</div>`;
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
    h += `<div class="seg scroll" role="group" aria-label="Période">${PERIODES.map(([k, t]) => !acces(1) && k === 0
      ? `<button type="button" data-formules aria-label="${t} : disponible avec Essentiel">🔒 ${t}</button>`
      : `<button type="button" data-perf="${k}" aria-pressed="${S.ui.perf === k}">${t}</button>`).join("")}</div>
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
    let ch = null;
    if (n === 1) {
      // Une seule séance : la BRVM ne publie qu'un cours de clôture par jour, il n'y a donc pas de courbe à tracer
      // à l'intérieur de la journée. On compare la séance en barres : portefeuille, BRVM 30, BRVM Composite.
      const barres = [["Portefeuille", pf, "var(--s1)"], ["BRVM 30", b30, "var(--s2)"], ["BRVM Composite", bc, "var(--s3)"]];
      const max = Math.max(0.001, ...barres.map(([, v2]) => (ok(v2) ? Math.abs(v2) : 0)));
      h += `<div class="card"><h2>La séance du ${D(last.date)} en un coup d'œil</h2>
        <ul class="seance-barres" aria-label="Variation de la séance">${barres.map(([t, v2, col]) => `<li><span class="sb-lbl">${t}</span>
          <span class="sb-piste">${ok(v2) ? `<i class="${v2 >= 0 ? "pos" : "neg"}" style="width:${(Math.abs(v2) / max) * 50}%;background:${col}"></i>` : ""}</span>
          <b class="num ${cls(v2)}">${P2(v2)}</b></li>`).join("")}</ul>
        <p class="small muted">La BRVM publie un cours de clôture par séance : il n'y a pas de courbe à l'intérieur d'une journée.
          Choisissez « 5 séances » ou plus pour voir l'évolution dans le temps.</p></div>`;
    } else {
      const chartRows = rows.length >= 5 ? rows : hist.slice(-21);
      ch = perfChart(chartRows, ix);
      h += `<div class="card"><h2>Évolution comparée</h2>
        <div class="legend">${SERIES.map(([, n2, col]) => `<span><i class="s" style="background:${col}"></i>${n2}</span>`).join("")}</div>${ch.html}
        <p class="small muted">Performance cumulée${chartRows === rows ? "" : " sur le dernier mois"}, en partant de 0 %. Touchez le graphique pour le détail d'un jour.</p></div>`;
    }
    const nTab = S.ui.perfRows || 10, tab = hist.slice(-nTab).reverse();
    h += `<div class="card"><h2>Jour par jour</h2><div class="tbl" role="region" aria-label="Gain par séance" tabindex="0"><table>
      <thead><tr><th scope="col">Séance</th><th scope="col">Gain (F)</th><th scope="col">Portef.</th><th scope="col">BRVM 30</th><th scope="col">Compos.</th></tr></thead>
      <tbody>${tab.map((r) => { const a = ix.BRVM30?.get(r.date)?.variation, c2 = ix.BRVMC?.get(r.date)?.variation;
        return `<tr><th scope="row">${Dc(r.date)}</th><td class="${cls(r.gain)}">${ok(r.gain) ? (r.gain > 0 ? "+" : "") + N(r.gain) : "–"}</td><td class="${cls(r.pct)}">${P2(r.pct)}</td><td>${P2(a)}</td><td>${P2(c2)}</td></tr>`; }).join("")}</tbody></table></div>
      ${hist.length > nTab ? `<div class="actions"><button class="btn small" id="perf-more">Afficher plus de séances</button></div>` : ""}
      ${typeof S.prop?.contenu?.historique_recalcule === "string" ? `<div class="notice small">Les séances depuis le <b>${D(S.prop.contenu.historique_recalcule)}</b>
        ont été recalculées ce soir : une opération de cette date a été ajoutée, modifiée ou supprimée dans votre journal. Les séances antérieures n'ont pas changé.</div>` : ""}
      <p class="small muted">Chaque séance publiée reste figée. Elle n'est recalculée que si vous ajoutez, modifiez ou supprimez une opération de cette date ou d'avant.</p></div>`;
    v.innerHTML = h;
    v.querySelectorAll("[data-perf]").forEach((b) => b.addEventListener("click", () => { S.ui.perf = +b.dataset.perf; vPerformance(); }));
    $("#perf-more", v)?.addEventListener("click", () => { S.ui.perfRows = (S.ui.perfRows || 10) + 20; vPerformance(); });
    // info-bulle : le jour le plus proche du doigt ou de la souris
    const svg = $(".chart svg", v);
    if (!svg || !ch) return;                                 // vue « séance » : pas de courbe, pas d'info-bulle
    const tip = $(".chart .tip", v), hov = $(".hover", svg);
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
      if (prop.length) html += `<optgroup label="${SIM() ? "Les mieux notés ce soir" : "Proposés ce soir"}">${prop.map(opt).join("")}</optgroup>`;
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
    if (r?.decision) parts.push(`appréciation : ${libDecision(r.decision).toLowerCase()}`);
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
    libelleOp();
  }
  // Le bouton dit ce qui va être enregistré, avec le montant : « Enregistrer l'achat · 503 250 F »
  const LIB_OP = { ACHAT: "l'achat", VENTE: "la vente", DIVIDENDE: "le dividende", DEPOT: "le dépôt", RETRAIT: "le retrait", FRAIS: "les frais", SOLDE: "le solde" };
  function libelleOp() {
    const b = $("#op-ok");
    if (!b || b.getAttribute("aria-busy")) return;
    if (fop.dataset.dupOk) { b.textContent = "Enregistrer quand même"; return; }
    const t = opType(), q = +fop.quantite.value || 0, p = +fop.prix.value || 0, brut = q * p;
    const fee = fop.frais.value !== "" ? +fop.frais.value : brut * FEES, m = +fop.montant.value || 0;
    const montant = t === "ACHAT" ? brut + fee : t === "VENTE" ? brut - fee : m;
    b.textContent = `Enregistrer ${LIB_OP[t] || "l'opération"}${montant > 0 ? " · " + F(montant) : ""}`;
  }
  function syncOpForm() {
    const t = opType();
    const titre = ["ACHAT", "VENTE", "DIVIDENDE"].includes(t);
    fop.querySelectorAll('[data-for="titre"]').forEach((e) => (e.hidden = !titre));
    $('[data-for="cat"]', fop).hidden = t !== "ACHAT";
    // les champs se déplient au fil des réponses : quantité et prix seulement une fois le titre choisi
    const trade = ["ACHAT", "VENTE"].includes(t);
    fop.querySelectorAll('[data-for="qp"]').forEach((e) => (e.hidden = !trade || !fop.ticker.value));
    $('[data-for="montant"]', fop).hidden = ["ACHAT", "VENTE"].includes(t);
    $('[data-for="vers-epargne"]', fop).hidden = !(t === "RETRAIT" && S.coffre);
    if (titre) remplirTitres(fop.ticker.value || null);
    total();
  }
  function openOp(pre = {}) {
    fop.reset();
    delete fop.dataset.dupOk; delete fop.dataset.prixAuto; delete fop.dataset.depuisOrdre;
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
    $(".op-plus", fop).open = false;
    fop.querySelectorAll('[data-for="qp"]').forEach((e) => (e.hidden = !["ACHAT", "VENTE"].includes(opType()) || !fop.ticker.value));
    infoTitre(!pre.prix);
    dlg.showModal();
  }
  fop.querySelectorAll('[name="type"]').forEach((r) => r.addEventListener("change", () => { fop.ticker.value = ""; fop.quantite.value = ""; fop.prix.value = ""; syncOpForm(); }));
  fop.querySelectorAll('[name="cat"]').forEach((r) => r.addEventListener("change", () => { S.ui.opCat = opCat(); $("#op-q").value = ""; remplirTitres(null); }));
  $("#op-q").addEventListener("input", () => remplirTitres(fop.ticker.value || null));
  fop.ticker.addEventListener("change", () => {
    fop.quantite.value = opType() === "VENTE" ? "" : fop.quantite.value;
    const trade = ["ACHAT", "VENTE"].includes(opType());
    fop.querySelectorAll('[data-for="qp"]').forEach((e) => (e.hidden = !trade || !fop.ticker.value));
    infoTitre(true);
  });
  fop.prix.addEventListener("input", () => { delete fop.dataset.prixAuto; total(); });
  fop.quantite.addEventListener("input", total);
  fop.frais.addEventListener("input", total);
  fop.montant.addEventListener("input", libelleOp);
  fop.addEventListener("input", () => { if (fop.dataset.dupOk) { delete fop.dataset.dupOk; $(".msg", fop).textContent = ""; libelleOp(); } });
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
        if (op.quantite > held + 1e-9) return err(`Vous ne détenez que ${N(held)} ${S.names.get(op.ticker) || op.ticker}.`);
      }
      // la vente (ou un achat daté après une vente déjà notée) doit rester possible à chaque date du journal
      const v = venteImpossible([...S.ops, { ...op, date: op.date || today() }]);
      if (v) return err(`${texteVenteImpossible(v)} Enregistrez d'abord l'achat correspondant, ou corrigez la date.`);
    } else {
      op.montant = num("montant");
      if (!(op.montant > 0)) return err("Indiquez un montant positif.");
      if (t === "DIVIDENDE" && !op.ticker) return err("Choisissez le titre qui a versé le dividende ou le coupon.");
      if (t !== "DIVIDENDE") op.ticker = null;
    }
    const dup = S.ops.some((o) => o.date === op.date && o.type === op.type && (o.ticker || null) === op.ticker
      && +o.quantite === +op.quantite && +o.prix === +op.prix && +o.montant === +op.montant);
    if (dup && !fop.dataset.dupOk) { fop.dataset.dupOk = "1"; libelleOp(); return err("Une opération identique existe déjà ce jour-là. Si c'est bien une deuxième opération, appuyez sur « Enregistrer quand même »."); }
    delete fop.dataset.dupOk;
    const versEpargne = t === "RETRAIT" && S.coffre && fop.vers_epargne.checked;
    const avant = replay(S.ops).cash, ids = new Set(S.ops.map((o) => o.id));
    const fin = occupe($("#op-ok"));
    try {
      await api.addOperation(op);
      if (versEpargne) {
        await api.addMouvement({ date: op.date, type: "VERSEMENT", montant: op.montant, source: "banque", note: "Retiré de ma SGI" });
        S.coffre = await api.coffre(S.user.id);
      }
      S.ops = await api.operations(S.user.id);
      fin();
      dlg.close();
      render();
      const nouvelle = S.ops.find((o) => !ids.has(o.id));
      confirmerOperation(op, nouvelle, avant, !versEpargne);
      window.dispatchEvent(new CustomEvent("brvm:operation", { detail: { type: op.type, depuisOrdre: !!fop.dataset.depuisOrdre } }));
      if (nouvelle && tab() === "portefeuille") montrerOperation(nouvelle.id);
    } catch (e) { fin(); libelleOp(); err("Enregistrement impossible : " + e.message); }
  });
  function confirmerOperation(op, o, avant, annulable) {
    const apres = replay(S.ops).cash;
    const msg = {
      ACHAT: `Achat de ${N(op.quantite)} ${op.ticker} à ${F(op.prix)} enregistré`,
      VENTE: `Vente de ${N(op.quantite)} ${op.ticker} à ${F(op.prix)} enregistrée`,
      DIVIDENDE: `Dividende de ${F(op.montant)}${op.ticker ? " sur " + op.ticker : ""} enregistré`,
      DEPOT: `Dépôt de ${F(op.montant)} enregistré`, RETRAIT: `Retrait de ${F(op.montant)} enregistré`,
      FRAIS: `Frais de ${F(op.montant)} enregistrés`, SOLDE: `Solde de ${F(op.montant)} enregistré`,
    }[op.type] || "Opération enregistrée";
    const actions = [];
    if (o && annulable) actions.push({ label: "Annuler", fn: () => annulerOperation(o) });
    if (o) actions.push({ label: "Voir", fn: () => montrerOperation(o.id) });
    const progres = progresApres(op);
    const dispo = Math.abs(apres - avant) >= 1 ? `Disponible chez ma SGI : ${F(avant)} → ${F(apres)}` : "";
    toast(msg, { detail: [progres, dispo].filter(Boolean).join(" · "), actions });
  }
  // Après chaque enregistrement, un point de progrès plutôt qu'un simple accusé de réception
  function progresApres(op) {
    const L = replay(S.ops), nb = L.positions.length;
    const mois = new Date().toISOString().slice(0, 7);
    if (op.type === "DEPOT") {
      const ceMois = S.ops.filter((o) => o.type === "DEPOT" && String(o.date).startsWith(mois)).reduce((a, o) => a + (+o.montant || 0), 0);
      return `Total envoyé à votre SGI : ${F(L.apports)}${ceMois > +op.montant ? `, dont ${F(ceMois)} ce mois-ci` : ""}`;
    }
    if (op.type === "ACHAT") {
      const premier = S.ops.filter((o) => o.type === "ACHAT").length === 1;
      return premier ? "Votre premier titre : bienvenue parmi les actionnaires de la BRVM !" : `Votre portefeuille compte maintenant ${nb} titre${nb > 1 ? "s" : ""}`;
    }
    if (op.type === "DIVIDENDE") return `Dividendes et coupons reçus depuis le début : ${F(L.dividendes)}`;
    if (op.type === "VENTE") {
      const avant = replay(S.ops.filter((o) => !(o.date === op.date && o.type === "VENTE" && o.ticker === op.ticker && +o.quantite === +op.quantite))).realise;
      const r = L.realise - avant;
      return r > 0 ? `Plus-value réalisée sur cette vente : +${F(r)}` : "";
    }
    return "";
  }
  async function annulerOperation(o) {
    try {
      await api.deleteOperation(o.id);
      S.ops = await api.operations(S.user.id);
      render();
      toast("Opération annulée : elle a été retirée du journal.");
    } catch (e) { toast("Annulation impossible : " + e.message); }
  }
  // Va au journal, fait défiler jusqu'à la ligne et la surligne un instant
  function montrerOperation(id) {
    const aller = () => {
      const li = document.querySelector(`[data-op-row="${CSS.escape(String(id))}"]`);
      if (!li) return;
      li.scrollIntoView({ block: "center", behavior: CALME ? "auto" : "smooth" });
      li.classList.remove("surligne"); void li.offsetWidth; li.classList.add("surligne");
      li.setAttribute("tabindex", "-1"); li.focus({ preventScroll: true });
    };
    if (tab() !== "portefeuille") { location.hash = "portefeuille"; setTimeout(aller, 350); } else setTimeout(aller, 50);
  }

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
    const fin = occupe($("#cf-ok"));
    let enregistre = false;
    try {
      if (cfMode === "verser") {
        await api.addMouvement({ date, type: "VERSEMENT", montant, source: fcf.source.value });
        enregistre = true;
        S.feteMontant = montant;
      } else if (cfMode === "reprendre") {
        if (montant > ep.solde) return err(`Vous avez ${F(ep.solde)} mis de côté.`);
        await api.addMouvement({ date, type: "RETRAIT", montant });
        enregistre = true;
        toast(`${F(montant)} repris de votre épargne.`);
      } else {
        if (montant > ep.solde) return err(`Vous avez ${F(ep.solde)} mis de côté. Pour de l'argent venant d'ailleurs, utilisez « Opération chez ma SGI » → Argent versé à ma SGI.`);
        await api.envoyerSgi(date, montant);                     // une seule transaction : épargne et journal ensemble
        enregistre = true;
        S.ops = await api.operations(S.user?.id);
        toast(`${F(montant)} envoyés à votre SGI : vos ordres sont recalculés.`);
      }
      S.coffre = await api.coffre(S.user?.id);
      dcf.close();
      render();
      feter(cfMode === "verser" ? S.feteMontant : 0);
      window.dispatchEvent(new CustomEvent("brvm:coffre", { detail: { mode: cfMode } }));
    } catch (e) {
      console.error("Coffre", e);
      if (!enregistre) err("Enregistrement impossible : " + e.message);
      else { if (dcf.open) dcf.close(); toast("Mouvement enregistré.", { detail: "L'affichage se mettra à jour au prochain chargement de la page." }); }
    }
    finally { fin(); }
  });

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-recap")) return ouvrirRecap();
    if (b.hasAttribute("data-formules")) return voirFormules();
    if (b.hasAttribute("data-ouvrir-sim")) { S.ui.pfOnglet = "simulateur"; location.hash = "portefeuille"; return; }
    if (b.hasAttribute("data-export-journal")) return exporterJournal();
    if (b.id === "bravo-partager") return partagerTrophee(S.bravoTrophee);
    if (b.dataset.partager) return partagerTrophee(trophees(epargne()).find((x) => x.id === b.dataset.partager));
    if (b.dataset.coffre === "plan") { location.hash = "profil"; setTimeout(() => { const f = $("#f-plan"); f?.closest("details")?.setAttribute("open", ""); f?.scrollIntoView({ block: "start" }); }, 120); }
    else if (b.dataset.coffre) { if ($("#dlg-bravo").open) $("#dlg-bravo").close(); if ($("#dlg-recap")?.open) $("#dlg-recap").close(); openCoffre(b.dataset.coffre); }
    else if (b.dataset.alerte !== undefined) {
      const a = S.alertesMap?.get(b.dataset.alerte);
      if (a) showInfo(`${S.names.get(a.ticker) || a.ticker} : ${NIVEAUX[a.alerte]?.t || a.alerte}`,
        `<p>${esc(motifAlerte(a.motif))}</p>${ok(a.plancher) ? `<p class="small muted">Plancher suiveur : ${F(a.plancher)}. Il monte avec le plus haut cours atteint depuis l'achat et ne redescend jamais.</p>` : ""}
        <p class="small muted">Une alerte est un signal à examiner, jamais une vente automatique. ${AVERT()}</p>`);
    }
    else if (b.dataset.op !== undefined) openOp(b.dataset.op ? { type: b.dataset.op } : {});
    else if (b.dataset.ordre !== undefined) {
      const o = S.ordres[+b.dataset.ordre];
      openOp({ type: o.sens, ticker: o.code, quantite: String(o.quantite), prix: String(o.prix_limite) });
      fop.dataset.depuisOrdre = "1";
    } else if (b.dataset.ligne !== undefined) {
      const l = S.lines[+b.dataset.ligne];
      openOp({ type: "ACHAT", ticker: l.code, quantite: String(l.quantite), prix: String(l.prix) });
    } else if (b.dataset.del !== undefined) {
      const reste = S.ops.filter((o) => String(o.id) !== String(b.dataset.del));
      const v = venteImpossible(reste);
      if (v && !venteImpossible(S.ops)) return toast("Suppression impossible", { detail: `Sans cette opération : ${texteVenteImpossible(v)} Supprimez d'abord cette vente.` });
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
      if (el.dataset.unite) el.innerHTML = montantHtml(to * e); else el.textContent = F(to * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // Coffre flottant : seulement sur les écrans où l'on épargne (Aujourd'hui, Mon épargne, Mes cercles)
  function majCoffre() {
    const t = tab(), o = S.ui.pfOnglet || "placements";
    const fab = $("#fab-coffre"), showFab = !!S.coffre && (t === "aujourdhui" || (t === "portefeuille" && (o === "epargne" || o === "cercles")));
    fab.hidden = !showFab;
    document.body.classList.toggle("has-fab", showFab);
    const aFaire = !!epargne()?.aFaire;
    $(".fab-dot", fab).hidden = !aFaire;
    fab.setAttribute("aria-label", aFaire ? "Noter mon épargne (pas encore notée pour cette période)" : "Noter mon épargne");
  }
  window.addEventListener("brvm:maj", () => { if (S.user) majCoffre(); });
  // Titres épinglés par l'utilisateur (menu latéral) : gardés sur cet appareil
  const cleEpingles = () => "bafi-epingles-" + (S.user?.id || "demo");
  function epingles() { try { return JSON.parse(localStorage.getItem(cleEpingles()) || "[]"); } catch (e) { return []; } }
  const estEpingle = (c) => epingles().includes(c);
  function basculerEpingle(c) {
    const l = epingles(), i = l.indexOf(c);
    if (i >= 0) l.splice(i, 1); else l.push(c);
    try { localStorage.setItem(cleEpingles(), JSON.stringify(l.slice(-8))); } catch (e) { /* stockage plein ou bloqué */ }
    return i < 0;
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-epingler]");
    if (!b) return;
    const c = b.dataset.epingler, on = basculerEpingle(c), nom = S.names.get(c) || c;
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${on ? "Retirer des épinglés" : "Épingler dans le menu"} : ${nom}`);
    b.querySelector("span").textContent = on ? "Épinglé" : "Épingler";
    toast(on ? `${nom} est épinglé dans le menu.` : `${nom} n'est plus épinglé.`);
  });
  function allerPf(o, code) {
    S.ui.pfOnglet = o;
    const fin = () => {
      window.dispatchEvent(new Event("brvm:maj"));
      if (!code) return;
      const li = document.getElementById("pos-" + code);
      if (!li) return;
      li.scrollIntoView({ block: "center", behavior: CALME ? "auto" : "smooth" });
      li.classList.remove("pos-vise"); void li.offsetWidth; li.classList.add("pos-vise");
    };
    if (location.hash.slice(1) === "portefeuille") { render(); setTimeout(fin, 50); }
    else { location.hash = "portefeuille"; setTimeout(fin, 350); }
  }
  function render() {
    const t = tab();
    for (const k of TABS) $("#v-" + k).hidden = k !== t;
    document.querySelectorAll("[data-tab]").forEach((a) => (a.dataset.tab === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    try { VIEWS[t](); }
    catch (e) {
      console.error("Écran", t, e);
      $("#v-" + t).insertAdjacentHTML("afterbegin", `<div class="notice">Une partie de cet écran n'a pas pu s'afficher. Rechargez la page ;
        si le problème continue, signalez-le avec l'heure et l'écran concerné.</div>`);
    }
    majCoffre();
    if (current !== t) {                                   // transition douce et compteur, sauf « mouvement réduit »
      const v = $("#v-" + t);
      v.classList.remove("v-in"); void v.offsetWidth; v.classList.add("v-in");
      // première visite de l'onglet : cartes en cascade, barres et courbes qui se dessinent (une seule fois)
      v.classList.toggle("cascade", !S.vus.has(t));
      if (!S.vus.has(t)) {
        [...v.children].slice(0, 8).forEach((c, i) => c.style.setProperty("--i", i));
        S.vus.add(t);
        setTimeout(() => v.classList.remove("cascade"), 1400);   // une saisie ensuite ne rejoue pas l'animation
      }
      v.querySelectorAll("[data-count]").forEach(countUp);
    }
    if (current && current !== t) { $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0); }
    current = t;
    if (S.alertesCle !== cleJournal()) chargerAlertes().then(() => { if (S.user && tab() === t && ["aujourdhui", "portefeuille"].includes(t)) VIEWS[t](); signalerAssistant(); });
    signalerAssistant();
  }
  window.addEventListener("hashchange", () => { if (S.user) render(); });

  // ---------------------------------------------------------------- démarrage
  // Fractionnements d'actions (ex. Sonatel) : les cours passés sont ajustés par le moteur ; le journal l'est ici de la même façon,
  // pour les opérations antérieures : quantité × facteur, prix ÷ facteur. Le montant investi ne change pas, ni la base.
  function ajusterFractionnements(ops) {
    if (!Array.isArray(ops) || !S.fract?.length) return ops;
    return ops.map((o) => {
      if (!o.ticker || !["ACHAT", "VENTE", "DIVIDENDE"].includes(o.type)) return o;
      const f = S.fract.filter((x) => x.ticker === o.ticker && String(o.date) < String(x.date)).reduce((a, x) => a * +x.facteur, 1);
      return f === 1 ? o : { ...o, quantite: o.quantite != null ? +o.quantite * f : o.quantite, prix: o.prix != null ? +o.prix / f : o.prix,
        _fract: { f, date: S.fract.find((x) => x.ticker === o.ticker && String(o.date) < String(x.date)).date } };
    });
  }

  // Formule de l'utilisateur (abonnements.sql). Sans le fichier SQL, S.abo reste vide et tout est accessible, comme avant.
  async function chargerFormule() {
    try { S.abo = await api.maFormule(); } catch (e) { S.abo = null; return; }
    try { S.tarifs = await api.tarifs(); } catch (e) { S.tarifs = null; }        // tarifs par défaut tant que la table manque
    let code = null;
    try { code = localStorage.getItem("brvm-parrain"); } catch (e) { /* rien */ }
    if (code && !DEMO) { try { await api.definirParrain(code); localStorage.removeItem("brvm-parrain"); } catch (e) { /* réessayé plus tard */ } }
  }
  const NIVEAU = { decouverte: 0, essentiel: 1, investisseur: 2 };
  const NOM_FORMULE = { decouverte: "Découverte", essentiel: "Essentiel", investisseur: "Investisseur" };
  const acces = (min) => !S.abo || (NIVEAU[S.abo.formule] ?? 0) >= min;
  // Encart « disponible avec … » : il dit ce que l'on gagnerait, et mène aux formules
  const verrou = (min, quoi) => `<div class="verrou"><span class="vr-ic" aria-hidden="true">🔒</span><span>${esc(quoi)} :
    disponible avec la formule <b>${min >= 2 ? "Investisseur" : "Essentiel"}</b>.</span><button type="button" class="btn link small" data-formules>Voir les formules</button></div>`;

  function voirFormules() {
    try { sessionStorage.setItem("brvm-rubrique", "abo"); } catch (e) { /* rien */ }
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    if (location.hash === "#profil") window.dispatchEvent(new Event("brvm:maj")); else location.hash = "profil";
    setTimeout(() => { const d = $('#v-profil details[data-rub="abo"]'); if (d) { d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); } }, 400);
  }
  function exporterJournal() {
    const cols = ["date", "type", "ticker", "quantite", "prix", "frais", "montant", "note"];
    const cel = (v) => { const t = v == null ? "" : String(v); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const csv = "\ufeff" + [cols.join(";"), ...S.ops.map((o) => cols.map((c) => cel(o[c])).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `bafibourse-journal-${today()}.csv`; document.body.append(a); a.click(); a.remove();
    toast("Journal exporté.", { detail: "Le fichier s'ouvre dans Excel, LibreOffice ou Google Sheets." });
  }

  // Un onglet laissé ouvert ne recharge rien de lui-même (aucune interrogation régulière du serveur). Au retour, après
  // 30 minutes cachées : une seule petite requête « quelle est la dernière séance ? » ; nouvelle séance ou plus de 6 h
  // d'absence (le journal a pu changer sur un autre appareil) → rechargement, annoncé à l'utilisateur.
  let cacheDepuis = 0, rafraichit = false;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { cacheDepuis = Date.now(); return; }
    const absent = cacheDepuis ? Date.now() - cacheDepuis : 0;
    cacheDepuis = 0;
    if (DEMO || !S.user || rafraichit || absent < 30 * 60e3 || !api.seanceRecente) return;
    rafraichit = true;
    try {
      const d = await api.seanceRecente();
      const nouvelle = d && S.seance?.date && d > S.seance.date;
      if (nouvelle || absent > 6 * 3600e3) {
        await loadAll(); render();
        if (nouvelle) toast(`Nouvelle séance du ${D(d)}`, { detail: "Vos chiffres sont à jour." });
      }
    } catch (e) { /* hors connexion : on réessaiera au prochain retour */ }
    rafraichit = false;
  });

  async function loadAll() {
    const uid = S.user.id;
    try { S.fract = api.fractionnements ? await api.fractionnements() : []; } catch (e) { S.fract = []; }   // fractionnements.sql absent
    await chargerMode();
    try { S.coffre = api.coffre ? await api.coffre(uid) : null; } catch (e) { S.coffre = null; }
    await chargerFormule();
    if (S.coffre) chargerFetes();   // épargne : absente si epargne.sql n'est pas installé
    try { const [sg, ge] = await Promise.all([api.sgi(), api.gestionnaires()]); S.univ = { sgi: (sg || []).map((x) => x.nom), paysSgi: new Map((sg || []).map((x) => [x.nom, x.pays || ""])), gest: ge || [] }; }
    catch (e) { S.univ = null; }     // univers.sql pas encore installé
    S.paysGest = new Map((S.univ?.gest || []).filter((g) => g.pays).map((g) => [g.gestionnaire, g.pays]));
    try { S.paysTitres = new Map(((await api.titresPays()) || []).map((x) => [x.code, x.pays])); } catch (e) { S.paysTitres = new Map(); }
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
        api.table("opcvm_analyse", seance.date), ciblesLisibles(seance.date, S.profil.profil)]);
      for (const r of [...(a || []), ...(o || []), ...(f || [])]) r.nom = nomLisible(r.nom);
      for (const x of [...(S.prop?.contenu?.ordres || []), ...(S.prop?.contenu?.proposition?.lignes || [])]) if (x.libelle) x.libelle = nomLisible(x.libelle);
      S.mk = { actions: a || [], obligations: o || [], opcvm: f || [] };
      S.cibles = c || [];
      try { S.indices = await api.indices(); } catch (e) { S.indices = []; }   // table pas encore créée
      S.prices = new Map(); S.names = new Map(); S.classes = new Map(); S.decisions = new Map();
      S.actions = new Map(S.mk.actions.map((r) => [r.code, r]));
      for (const r of S.mk.actions) { S.prices.set(r.code, r.cours); S.names.set(r.code, r.nom); S.classes.set(r.code, "actions"); S.decisions.set(r.code, r.decision); }
      for (const r of S.mk.obligations) { S.prices.set(r.code, r.prix); S.names.set(r.code, r.nom); S.classes.set(r.code, "obligations"); S.decisions.set(r.code, r.decision); }
      for (const r of S.mk.opcvm) { S.prices.set(r.code, r.vl); S.names.set(r.code, r.nom); S.classes.set(r.code, r.classe); S.decisions.set(r.code, r.decision); }
      S.lignesMk = new Map([...S.mk.actions.map((r) => [r.code, ["actions", r]]), ...S.mk.obligations.map((r) => [r.code, ["obligations", r]]),
        ...S.mk.opcvm.map((r) => [r.code, ["opcvm", r]])]);
    }
    await completerCours();
    await chargerAlertes();
    // Le dernier calcul n'a pas d'historique de performance : on garde le plus récent disponible, signalé comme tel
    S.histSecours = null;
    if (S.prop && !(S.prop.contenu?.historique || []).length) {
      try { S.histSecours = await api.historiqueSecours(S.user.id); } catch (e) { S.histSecours = null; }
    }
  }
  // Un titre détenu peut manquer dans l'analyse du jour (fonds qui n'a pas publié sa valeur liquidative,
  // obligation non cotée ce jour-là…). Sans cours, il compterait pour 0 F et fausserait le total et le gain :
  // on prend son dernier cours connu, signalé comme tel. À défaut, il est compté à son prix d'achat.
  S.coursAnciens = new Map();
  async function completerCours() {
    S.coursAnciens = new Map();
    if (!S.seance) return;
    const manquants = replay(S.ops).positions.filter((p) => !ok(S.prices.get(p.code))).map((p) => p.code);
    await Promise.all(manquants.map(async (code) => {
      try {
        const d = await api.dernierCours(code, S.seance.date);
        if (!d || !ok(d.cours)) return;
        S.prices.set(code, d.cours); S.coursAnciens.set(code, d.date);
        if (!S.names.has(code) && d.nom) S.names.set(code, nomLisible(d.nom));
        if (!S.classes.has(code)) S.classes.set(code, d.classe === "actions" ? "actions" : d.classe === "obligations" ? "obligations" : "opcvm");
      } catch (e) { /* pas de cours ancien : compté au prix d'achat */ }
    }));
  }

  // Lit le mode (lisible sans connexion) et adapte les textes statiques marqués data-sim ; « proposition » par défaut
  async function chargerMode() {
    if (!DEMO) try { MODE = (await api.mode()) === "simulation" ? "simulation" : "proposition"; } catch (e) { /* fonction pas encore installée */ }
    document.querySelectorAll("[data-sim]").forEach((el) => {
      el.dataset.prop ??= el.textContent;
      el.textContent = SIM() ? el.dataset.sim : el.dataset.prop;
    });
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
    const ss = (k) => { try { const x = sessionStorage.getItem(k); sessionStorage.removeItem(k); return x; } catch (e) { return null; } };
    try { localStorage.setItem("brvm-a-un-compte", "1"); } catch (e) { /* stockage indisponible */ }
    const cgu = S.docs?.cgu, accepte = +ss("brvm-cgu-acceptee") || 0, inscription = ss("brvm-inscription");
    if (cgu && accepte === cgu.version && (+S.profil.cgu_version || 0) < cgu.version) {      // case cochée à la création du compte
      const upd = { cgu_version: cgu.version, cgu_acceptee_le: new Date().toISOString() };
      try { await api.saveProfil(S.user.id, upd); Object.assign(S.profil, upd); } catch (e) { /* demandée ci-dessous */ }
    }
    if (cgu && (+S.profil.cgu_version || 0) < cgu.version && !(await showCgu(cgu, true))) return;
    const plusTard = (() => { try { return sessionStorage.getItem("brvm-ob-plus-tard"); } catch (e) { return null; } })();
    if (("onboarding_etape" in S.profil && !S.profil.onboarding_fini_le && !plusTard) || (DEMO && new URLSearchParams(location.search).has("onboarding"))) {
      await onboarding();
      return;
    }
    if (inscription && S.profil.onboarding_fini_le) setTimeout(() => toast("Vous aviez déjà un compte avec cette adresse : bienvenue !"), 600);
    document.querySelectorAll(".tabs-top, .tabs-bottom").forEach((n) => (n.hidden = false));
    if (!TABS.includes(location.hash.slice(1))) history.replaceState(null, "", location.pathname + location.search + "#aujourdhui");
    render();
    window.BRVM_APP = { demo: DEMO, demander: (body) => api.assistant(body), contexte: contexteAssistant, suggestions: suggestionsAssistant,
                        // prise en main (tutoriel.js)
                        tab, aller: (t) => { if (location.hash.slice(1) !== t) location.hash = t; }, render, toast, sim: () => SIM(),
                        ouvrirOperation: (type) => openOp({ type }), nbOps: () => S.ops.length,
                        // menu latéral (navigation.js) : épinglés, récents, documents légaux
                        epingles: () => epingles().map((c) => ({ code: c, nom: S.names?.get(c) || c })),
                        ongletPf: () => S.ui.pfOnglet || "placements", allerPf,
                        recents: () => S.ops.slice().sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 3)
                          .map((o) => ({ type: TYPES_OP[o.type] || o.type, nom: o.ticker ? (S.names?.get(o.ticker) || o.ticker) : "", date: o.date })),
                        documents: () => S.docs || {}, voirDocument: (d) => showCgu(d, false),
                        allerEpargne: () => allerPf("epargne"),
                        faits: () => ({ depot: S.ops.some((o) => o.type === "DEPOT" || o.type === "SOLDE"), achat: S.ops.some((o) => o.type === "ACHAT"),
                                        plan: S.coffre ? !!S.coffre.plan : null }),
                        tutoriel: etatTutoriel, sauverTutoriel,
                        // avis (avis.js)
                        monAvis: () => api.monAvis(), donnerAvis: (a) => api.donnerAvis(a),
                        noterDemandeAvis: (d) => api.noterDemandeAvis(d).catch(() => {}),
                        alerteRouge: () => (S.alertes || []).some((a) => a.alerte === "ROUGE"),
                        celebrer: (t) => bravo([t]),
                        rappels: () => api.rappels(), sauverRappels: (x) => api.sauverRappels(x), abonnerPush: (a) => api.abonnerPush(a),
                        desabonnerPush: (e) => api.desabonnerPush(e), essaiRappel: () => api.essaiRappel(),
                        telephone: () => S.profil?.telephone || "",
                        // cercles d'épargne (cercles.js) : seulement des indicateurs de régularité, jamais de montant
                        cercles: () => api.cercles(), creerCercle: (n, o) => api.creerCercle(n, o), apercuCercle: (c) => api.apercuCercle(c),
                        rejoindreCercle: (c) => api.rejoindreCercle(c), quitterCercle: (id) => api.quitterCercle(id),
                        publierRegularite: (x) => api.publierRegularite(x),
                        cerclesPublics: (o, r, t) => api.cerclesPublics(o, r, t), demanderAdhesion: (i, m) => api.demanderAdhesion(i, m),
                        annulerDemande: (i) => api.annulerDemande(i), mesDemandes: () => api.mesDemandes(), demandesRecues: () => api.demandesRecues(),
                        repondreDemande: (i, ok) => api.repondreDemande(i, ok), signalerCercle: (i, m) => api.signalerCercle(i, m),
                        publierCercle: (i, p, t) => api.publierCercle(i, p, t),
                        // abonnements (abonnement.js, assistant.js, import.js, rappels.js, cercles.js)
                        abo: () => S.abo, tarifs: () => S.tarifs, acces: (n) => acces(n), nomFormule: (f) => NOM_FORMULE[f] || f, voirFormules: () => voirFormules(),
                        rechargerFormule: async () => { await chargerFormule(); window.dispatchEvent(new Event("brvm:formule")); },
                        noterUsage: (k, n = 1) => { if (S.abo?.usage) { const q = S.abo.quotas?.[k] ?? 0, u = S.abo.usage[k] ?? 0;
                          if (u + n <= q) S.abo.usage[k] = u + n; else if (k !== "approfondies" && S.abo.credits) S.abo.credits[k] = Math.max(0, (S.abo.credits[k] || 0) - n); } },
                        demanderAbonnement: (d) => api.demanderAbonnement(d), payer: (o) => api.payer(o), verifierPaiement: (t) => api.verifierPaiement(t),
                        profil: () => S.profil, email: () => S.user?.email || "",
                        saveProfil: async (p) => { await api.saveProfil(S.user.id, p); Object.assign(S.profil, p); window.dispatchEvent(new Event("brvm:profil")); },
                        regularite: () => {
                          const ep = epargne(); if (!ep?.plan?.montant) return null;
                          const mois = today().slice(0, 7);
                          const jours = new Set((ep.mv || []).filter((m) => m.type === "VERSEMENT" && String(m.date).startsWith(mois)).map((m) => m.date)).size;
                          // régularité du mois selon son propre rythme : périodes tenues / périodes attendues
                          // (la période en cours ne compte que si elle est déjà tenue : on ne pénalise pas la journée qui n'est pas finie)
                          const pl = ep.plan, r = pl.rythme || "mensuel", cur = periode(today(), r), debutK = periode(pl.debut || today(), r);
                          const faits = new Set((ep.mv || []).filter((m) => m.type === "VERSEMENT").map((m) => periode(m.date, r)));
                          const dansMois = (k) => (k.length === 7 ? k === mois : k.slice(0, 7) === mois);
                          let tenues = 0, attendues = 0;
                          for (let k = cur, i = 0; i < 40 && k >= debutK && dansMois(k); i++, k = prevPeriode(k, r, pl)) {
                            if (faits.has(k)) { tenues++; attendues++; } else if (k !== cur) attendues++;
                          }
                          return { serie: ep.serie || 0, record: ep.record || 0, unite: ep.unite || "jour", jours_mois: Math.min(31, jours), mois,
                                   tenues_mois: tenues, attendues_mois: attendues,
                                   regularite: ep.total ? Math.round((ep.tenus / ep.total) * 1000) / 1000 : null };
                        },
                        portrait: () => voirPortrait(),
                        // état d'une rubrique du Profil, en une phrase (sommaire.js)
                        etatRubrique: (k) => {
                          const p = S.profil || {}, pl = S.coffre?.plan || {};
                          if (k === "abo" && S.abo) { const a = S.abo, j = a.fin ? Math.max(0, Math.ceil((new Date(a.fin) - Date.now()) / 864e5)) : 0;
                            return `${NOM_FORMULE[a.formule]}${a.essai ? ` · essai, encore ${j} jour${j > 1 ? "s" : ""}` : a.formule !== "decouverte" && a.fin ? ` · jusqu'au ${new Date(a.fin).toLocaleDateString("fr-FR")}` : " · gratuite"}`; }
                          if (k === "plan") return +pl.montant > 0 ? `${F(pl.montant)} ${RYTHMES[pl.rythme]?.[0] || ""}${+pl.objectif > 0 ? ` · objectif ${F(pl.objectif)}` : ""}` : "Pas encore de rythme choisi";
                          if (k === "invest") return `Profil ${PROFILS[p.profil]?.t || "équilibré"} · montant ${p.budget_mode === "auto" ? "automatique" : p.budget ? F(p.budget) : "à saisir"}`;
                          if (k === "coord") return [p.prenom, p.nom].filter(Boolean).join(" ") || "Prénom, nom, téléphone";
                          if (k === "comptes") return (p.mes_sgi || []).length ? `${p.mes_sgi.length} SGI · comptes et placements` : "Vos SGI et vos placements";
                          return "";
                        },
                        // import des documents de la SGI (import.js)
                        lireDocument: (type, d) => api.lireDocument(type, d),
                        titres: () => [...S.mk.actions.map((r) => ({ code: r.code, nom: r.nom, classe: "actions" })),
                                       ...S.mk.obligations.map((r) => ({ code: r.code, nom: r.nom, classe: "obligations" })),
                                       ...S.mk.opcvm.map((r) => ({ code: r.code, nom: r.nom, classe: "opcvm" }))],
                        nomTitre: (c) => S.names.get(c) || c,
                        cours: (c) => S.prices.get(c), seance: () => S.seance?.date || null,
                        operations: () => S.ops,
                        journal: () => { const L = replay(S.ops); return { positions: L.positions.map((x) => ({ code: x.code, quantite: x.quantite })), cash: L.cash }; },
                        ajouterOperations: async (ops) => { const ids = await api.addOperations(ops); S.ops = await api.operations(S.user.id); render(); return ids; },
                        supprimerOperations: async (ids) => { for (const id of ids) await api.deleteOperation(id); S.ops = await api.operations(S.user.id); render(); },
                        fermerOperation: () => $("#dlg-op").open && $("#dlg-op").close(),
                        controleVentes: (nouvelles) => { const v = venteImpossible([...S.ops, ...nouvelles]); return v ? texteVenteImpossible(v) : ""; },
                        nomAffiche: () => (S.profil?.prenom ? [S.profil.prenom, S.profil?.nom ? S.profil.nom.trim().charAt(0).toUpperCase() + "." : ""].filter(Boolean).join(" ") : DEMO ? "Utilisateur D." : ""),
                        joursInscription: () => {
                          const d = S.profil?.onboarding_fini_le || S.profil?.cree_le;
                          return d ? Math.floor((Date.now() - new Date(d)) / 864e5) : 0;
                        },
                        evenement: (e, x) => { api.evenementTutoriel(e, x ?? null).catch(() => {}); },
                        prenom: () => S.profil?.prenom || "", urgentes: () => (S.alertes || []).filter((a) => NIVEAUX[a.alerte]?.urgent).length };
    window.dispatchEvent(new Event("brvm:pret"));
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

  // Connexion : « Créer mon compte » ou « J'ai déjà un compte » ; code à 6 chiffres reçu par e-mail (le lien marche aussi)
  function showLogin() {
    $("#loading").hidden = true;
    $("#v-connexion").hidden = false;
    const fl = $("#f-login"), fc = $("#f-code"), m = $(".msg", fl);
    let mode = location.hash === "#connexion" ? "connexion" : location.hash === "#inscription" ? "inscription"
      : (() => { try { return localStorage.getItem("brvm-a-un-compte") ? "connexion" : "inscription"; } catch (e) { return "inscription"; } })();
    let cgu = null, wait = 0;
    const regler = () => {
      const ins = mode === "inscription";
      document.querySelectorAll("[data-auth]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.auth === mode)));
      $("#auth-titre").textContent = ins ? "Créer mon compte gratuit" : "Me connecter";
      $("#auth-aide").textContent = ins ? "Votre adresse e-mail sert d'identifiant : pas de mot de passe à retenir."
        : "Saisissez l'adresse de votre compte : nous vous envoyons un lien de connexion.";
      $("#auth-cgu").hidden = !ins || !cgu;
      if (cgu) $("#lire-cgu").textContent = cgu.titre || "conditions d'utilisation";
      m.textContent = "";
    };
    document.querySelectorAll("[data-auth]").forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.auth; fc.hidden = true; fl.hidden = false; regler();
      history.replaceState(null, "", location.pathname + location.search + "#" + mode);
      fl.email.focus();
    }));
    $("#lire-cgu").addEventListener("click", (ev) => { ev.preventDefault(); if (cgu) showCgu(cgu, false); });
    api.documents().then((docs) => { cgu = (docs || []).find((d) => d.type === "cgu") || null; regler(); }).catch(() => {});
    regler();
    try {
      const retour = new URLSearchParams(location.hash.replace(/^#/, "") || location.search);
      if (retour.get("error_code") || retour.get("error")) {
        m.textContent = /expired|not_found|invalid/i.test(retour.get("error_code") + " " + retour.get("error_description"))
          ? "Ce lien de connexion n'est plus valable : il a déjà servi, ou un e-mail plus récent l'a remplacé. Utilisez le dernier e-mail reçu, ou demandez-en un nouveau."
          : "La connexion par le lien n'a pas abouti. Demandez un nouvel e-mail, puis saisissez son code.";
        history.replaceState(null, "", location.pathname + location.search.replace(/[?&]error[^&]*/g, ""));
      }
    } catch (e) { /* adresse illisible : rien à signaler */ }
    const bouton = fl.querySelector("button[type=submit]"), label = bouton.textContent, renvoi = $("#code-renvoi");
    const attendre = (sec) => {
      wait = sec;
      const tick = () => {
        if (wait <= 0) { bouton.disabled = renvoi.disabled = false; bouton.textContent = label; renvoi.textContent = "Renvoyer l'e-mail"; return; }
        bouton.textContent = `Nouvel envoi possible dans ${wait} s`;
        renvoi.textContent = `Renvoyer l'e-mail (${wait--} s)`;
        setTimeout(tick, 1000);
      };
      bouton.disabled = renvoi.disabled = true; tick();
    };
    const envoyer = async () => {
      const email = fl.email.value.trim(), creer = mode === "inscription";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { m.textContent = "Adresse e-mail invalide."; return; }
      if (creer && cgu && !fl.cgu.checked) { m.textContent = "Acceptez les conditions d'utilisation pour créer votre compte."; return; }
      bouton.disabled = true;
      try {
        await api.login(email, creer);
        try {
          if (creer && cgu) sessionStorage.setItem("brvm-cgu-acceptee", String(cgu.version));
          if (creer) sessionStorage.setItem("brvm-inscription", "1");
        } catch (e) { /* stockage indisponible */ }
        m.textContent = "";
        $("#code-email").textContent = email;
        $(".msg", fc).textContent = "";
        fl.hidden = true; $(".auth-choix").hidden = true;          // une seule chose à faire : ouvrir l'e-mail
        fc.hidden = false;
        fc.code.value = "";
        setTimeout(() => fc.code.focus(), 50);          // le code d'abord : il ne dépend pas du navigateur qui s'ouvre
        attendre(60);                                  // évite les demandes répétées (limite d'envoi)
      } catch (e) {
        const msg = String(e.message || e);
        bouton.disabled = false;
        if (!creer && /signup|not allowed|not found|otp_disabled/i.test(msg)) {
          m.innerHTML = `Aucun compte avec cette adresse. <button class="btn link" type="button" id="vers-inscription">Créer un compte avec cette adresse</button>`;
          $("#vers-inscription").addEventListener("click", () => { mode = "inscription"; regler(); history.replaceState(null, "", location.pathname + location.search + "#inscription"); });
        } else if (/rate limit|too many|429|security purposes/i.test(msg)) {
          m.textContent = "Trop de demandes en peu de temps. Si vous avez déjà reçu un e-mail, touchez son lien ; sinon réessayez dans quelques minutes.";
          fc.hidden = false; attendre(60);
        } else if (/fetch|network|failed to fetch|load failed/i.test(msg)) {
          m.textContent = "Pas de connexion internet pour le moment : vérifiez votre réseau, puis réessayez.";
        } else m.textContent = "L'e-mail n'a pas pu être envoyé. Réessayez dans quelques minutes ; si cela continue, écrivez-nous. (" + msg + ")";
      }
    };
    fl.addEventListener("submit", (ev) => { ev.preventDefault(); envoyer(); });
    $("#code-renvoi").addEventListener("click", () => envoyer());
    $("#code-modifier").addEventListener("click", () => { fc.hidden = true; fl.hidden = false; $(".auth-choix").hidden = false; fl.email.focus(); });
    fc.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const mc = $(".msg", fc), code = fc.code.value.replace(/\s/g, "");
      if (!/^[0-9]{6,10}$/.test(code)) { mc.textContent = "Saisissez le code reçu par e-mail (6 chiffres), ou touchez simplement le lien de l'e-mail."; return; }
      try { await api.verify(fl.email.value.trim(), code); }
      catch (e) { mc.textContent = /expired|invalid|not found/i.test(String(e.message)) ? "Code incorrect ou expiré : vérifiez qu'il vient du dernier e-mail reçu, ou demandez-en un nouveau." : "Code refusé : " + e.message; }
    });
  }


  // Démo : une barre permanente pour passer à l'inscription, et, à la première visite, deux portes
  function demoAccueil() {
    if (!DEMO) return;
    $("main")?.insertAdjacentHTML("afterbegin", `<div class="demo-barre" role="note"><span>Démonstration · données fictives${DEMO_DEBUT ? " · premiers jours" : ""}</span>
      <span class="demo-act"><a class="btn small primary" href="../#tarifs">Voir les offres</a><a class="demo-quitter" href="../">Quitter</a></span></div>`);
    // au bout de 3 minutes d'exploration : une seule invitation, si rien d'autre n'est affiché
    setTimeout(() => {
      if (window.BafiCalme && !window.BafiCalme.autorise("demo")) return;
      window.BafiCalme?.consomme("demo");
      toast("Ce portefeuille pourrait être le vôtre", { detail: "Gratuit pour commencer, et 14 jours d'Essentiel offerts.",
        actions: [{ label: "Voir les offres", fn: () => (location.href = "../#tarifs") }] });
    }, 180000);
    let vu = false;
    try { vu = !!sessionStorage.getItem("brvm-demo-porte"); sessionStorage.setItem("brvm-demo-porte", "1"); } catch (e) { vu = true; }
    if (vu || new URLSearchParams(location.search).get("demo") !== "1") return;
    document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-portes" aria-labelledby="portes-t"><div class="portes">
      <h2 id="portes-t">Que voulez-vous découvrir ?</h2>
      <p class="small muted">Une démonstration avec des données fictives : rien n'est enregistré.</p>
      <button type="button" class="porte" data-porte="debut"><b>Mes premiers jours</b><span>Un compte qui démarre : un premier versement, un premier achat, une semaine d'épargne.</span></button>
      <button type="button" class="porte" data-porte="avance"><b>Un portefeuille suivi depuis deux ans</b><span>Positions, dividendes, trophées, cercle d'épargne : tout ce que l'outil apporte avec le temps.</span></button>
    </div></dialog>`);
    const d = $("#dlg-portes");
    d.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-porte]");
      if (!b) return;
      if (b.dataset.porte === "debut") location.href = "?demo=debut" + location.hash;
      else d.close();
    });
    d.showModal();
  }

  // ---------------------------------------------------------------- un seul onglet après le lien de l'e-mail
  // Le lien de l'e-mail s'ouvre toujours dans un nouvel onglet. L'onglet resté sur l'écran de connexion se connecte
  // alors tout seul ; le nouvel onglet propose de se fermer, pour ne pas garder deux pages BafiBourse ouvertes.
  const canal = "BroadcastChannel" in window ? new BroadcastChannel("bafibourse-connexion") : null;
  function attendreConnexionAilleurs() {
    if (DEMO) return;
    const reprendre = () => { location.hash = "aujourdhui"; location.reload(); };
    if (canal) canal.onmessage = (ev) => { if (ev.data === "connecte") { canal.postMessage("attendait"); reprendre(); } };
    addEventListener("storage", (ev) => { if (/^sb-.+-auth-token$/.test(ev.key || "") && ev.newValue) reprendre(); });   // navigateurs sans canal
  }
  async function signalerConnexion() {
    if (!canal || !VIENT_DU_LIEN) return;
    let autre = false;
    canal.onmessage = (ev) => { if (ev.data === "attendait") autre = true; };
    canal.postMessage("connecte");
    await new Promise((ok) => setTimeout(ok, 700));
    if (!autre) return;                                   // pas d'autre onglet : on continue ici normalement
    document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-un-onglet" aria-labelledby="uo-t"><div class="portes">
      <h2 id="uo-t">Vous êtes connecté ✓</h2>
      <p>Votre page BafiBourse précédente vient de se connecter, elle aussi. Vous pouvez fermer celle-ci et y revenir.</p>
      <button type="button" class="btn primary" data-uo="fermer">Fermer cette page</button>
      <button type="button" class="btn" data-uo="rester">Continuer ici</button>
      <p class="small muted uo-aide" hidden>Votre navigateur ne permet pas de fermer la page automatiquement : fermez cet onglet, puis revenez à la page BafiBourse précédente.</p>
    </div></dialog>`);
    const d = $("#dlg-un-onglet");
    d.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-uo]");
      if (!b) return;
      if (b.dataset.uo === "rester") return d.close();
      window.close();
      setTimeout(() => { $(".uo-aide", d).hidden = false; }, 300);
    });
    d.showModal();
  }

  async function init() {
    $("#badge-demo").hidden = !DEMO;
    demoAccueil();
    if (DEMO) document.title = "Démo – BafiBourse";
    showAnnonce();
    chargerMode();
    try {
      api.onAuth((s) => { if (s?.user) start(s.user); });
      const s = await api.session();
      if (s?.user) { start(s.user); signalerConnexion(); } else { showLogin(); attendreConnexionAilleurs(); }
    } catch (e) {
      $("#loading").textContent = "Impossible de joindre le service : " + e.message;
    }
  }
  init();
})();
