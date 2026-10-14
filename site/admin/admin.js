/* Console d'administration BRVM Portefeuille.
 * Aucune décision de sécurité n'est prise ici : chaque action appelle une fonction admin_* de Supabase,
 * qui vérifie la permission et la double authentification (supabase/admin.sql). L'interface ne fait
 * qu'afficher ou masquer selon les permissions renvoyées par admin_moi().
 * Mode démo : ?demo=1 (données fictives, rien n'est enregistré). */
(() => {
  "use strict";
  const CFG = window.BRVM_CONFIG;
  const QS = new URLSearchParams(location.search);
  const DEMO = QS.has("demo");
  // Écran → permission requise (doit refléter la matrice de supabase/admin.sql ; la base revérifie tout)
  const NEED = { tableau: "dashboard.read", utilisateurs: "users.read", donnees: "market.read", traitements: "batch.read",
    moteur: "engine.params", communication: "comms.manage", conformite: "compliance.manage", habilitations: "roles.read", audit: "audit.read" };
  const TABS = Object.keys(NEED);
  const ACTIONS = {
    "users.read_portfolio": "Consultation d'un portefeuille", "users.suspend": "Suspension d'un compte",
    "users.reactivate": "Réactivation d'un compte", "users.delete": "Suppression d'un compte",
    "users.export": "Export des données d'un client", "roles.assign": "Attribution d'un rôle", "roles.revoke": "Retrait d'un rôle",
    "market.correct": "Correction d'une donnée de marché", "engine.params": "Modification d'un paramètre du moteur",
    "batch.run": "Relance du traitement", "comms.publish": "Publication d'une annonce", "comms.withdraw": "Retrait d'une annonce",
    "compliance.publish": "Publication d'un document légal",
  };
  const DECISIONS = ["ACHAT FORT", "ACHAT", "CONSERVER", "SURVEILLER", "ALLÉGER", "VENDRE", "ÉVITER", "ÉVITER (données)"];
  const CHAMPS = { actions_analyse: ["cours", "decision"], obligations_analyse: ["prix", "cours", "decision"], opcvm_analyse: ["vl", "decision"] };
  const STATUTS = { demande: ["att", "Demandé"], en_cours: ["att", "En cours"], succes: ["ok", "Réussi"], echec: ["ko", "Échec"] };
  const NIVEAUX = { info: "Information", attention: "Attention", maintenance: "Maintenance" };

  // ------------------------------------------------------------ utilitaires
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const N = (v) => (v === null || v === undefined || !isFinite(+v) ? "–" : nf.format(+v));
  const F = (v) => (v === null || v === undefined || !isFinite(+v) ? "–" : nf.format(Math.round(+v)) + " F");
  const DT = (v) => (v ? new Date(v).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "–");
  const D = (v) => (v ? new Date(String(v).length === 10 ? v + "T00:00:00" : v).toLocaleDateString("fr-FR") : "–");
  const ago = (v) => {
    if (!v) return "jamais";
    const h = (Date.now() - new Date(v)) / 36e5;
    return h < 1 ? "il y a moins d'1 h" : h < 48 ? `il y a ${Math.round(h)} h` : `il y a ${Math.round(h / 24)} j`;
  };
  function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4000); }
  const msgErr = (e) => String(e?.message || e || "Erreur inconnue").replace(/^.*?:\s(?=Accès|Double|Indiquez|Vous|Impossible|La confirmation|Aucun|Relance|Un traitement)/, "");
  const P = (v, d = 1) => (v === null || v === undefined || !isFinite(+v) ? "–" : (+v * 100).toLocaleString("fr-FR", { maximumFractionDigits: d }) + " %");
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------ accès aux données
  function supaApi() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    });
    const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
    return {
      session: async () => (await sb.auth.getSession()).data.session,
      login: async (email) => { const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error; },
      logout: async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); },
      aal: async () => { const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); if (error) throw error; return data; },
      factors: async () => { const { data, error } = await sb.auth.mfa.listFactors(); if (error) throw error; return data; },
      unenroll: async (factorId) => sb.auth.mfa.unenroll({ factorId }),
      enroll: async () => { const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "BRVM admin " + new Date().toISOString().slice(0, 16) }); if (error) throw error; return data; },
      verify: async (factorId, code) => { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw error; },
      refresh: async () => sb.auth.refreshSession(),
      moi: () => rpc("admin_moi"),
      tableau: () => rpc("admin_tableau_de_bord"),
      utilisateurs: (q) => rpc("admin_utilisateurs", { p_recherche: q || null }),
      portefeuille: (u, motif) => rpc("admin_portefeuille", { p_user: u, p_motif: motif }),
      suspendre: (u, s, motif) => rpc("admin_suspendre", { p_user: u, p_suspendre: s, p_motif: motif }),
      supprimer: (u, conf, motif) => rpc("admin_supprimer", { p_user: u, p_confirmation: conf, p_motif: motif }),
      exporter: (u, motif) => rpc("admin_exporter", { p_user: u, p_motif: motif }),
      habilitations: () => rpc("admin_habilitations"),
      attribuer: (email, role, exp, motif) => rpc("admin_attribuer_role", { p_email: email, p_role: role, p_expire: exp, p_motif: motif }),
      retirer: (u, role, motif) => rpc("admin_retirer_role", { p_user: u, p_role: role, p_motif: motif }),
      audit: (n) => rpc("admin_audit", { p_limite: n }),
      donnees: (d) => rpc("admin_donnees", { p_date: d || null }),
      corriger: (t, d, code, champ, val, motif) => rpc("admin_corriger", { p_tableau: t, p_date: d, p_code: code, p_champ: champ, p_valeur: val, p_motif: motif }),
      parametres: () => rpc("admin_parametres"),
      modifierParametre: (cle, val, motif) => rpc("admin_modifier_parametre", { p_cle: cle, p_valeur: val, p_motif: motif }),
      traitements: () => rpc("admin_traitements"),
      relancer: (motif) => rpc("admin_relancer", { p_motif: motif }),
      annonces: () => rpc("admin_annonces"),
      publierAnnonce: (m, niveau, fin, motif) => rpc("admin_publier_annonce", { p_message: m, p_niveau: niveau, p_fin: fin, p_motif: motif }),
      retirerAnnonce: (id, motif) => rpc("admin_retirer_annonce", { p_id: id, p_motif: motif }),
      documents: () => rpc("admin_documents"),
      publierDocument: (type, titre, texte, motif) => rpc("admin_publier_document", { p_type: type, p_titre: titre, p_texte: texte, p_motif: motif }),
    };
  }

  function demoApi() {
    const now = Date.now(), d = (j) => new Date(now - j * 864e5).toISOString();
    const users = [
      ["a1", "aminata.k@exemple.org", 40, 0.1, "equilibre", 3000000, 14], ["b2", "koffi.y@exemple.org", 25, 2, "dynamique", 10000000, 32],
      ["c3", "fatou.d@exemple.org", 12, 1, "prudent", 1500000, 6], ["d4", "moussa.t@exemple.org", 6, 6, "equilibre", 500000, 0],
      ["e5", "awa.s@exemple.org", 2, 2, "dynamique", 2000000, 3], ["f6", "admin@exemple.org", 60, 0, "equilibre", 0, 0],
    ].map(([id, email, ins, co, profil, budget, ops]) => ({ id, email, inscrit_le: d(ins), derniere_connexion: d(co), profil, budget,
      recevoir_email: true, suspendu: false, operations: ops, derniere_proposition: ops ? d(1).slice(0, 10) : null, a_un_role: id === "f6" }));
    const audit = [];
    const log = (action, cible, motif, details) => audit.unshift({ id: audit.length + 1, quand: new Date().toISOString(), acteur_email: "admin@exemple.org", action, cible, motif, details });
    log("roles.assign", "admin@exemple.org", "Mise en service de la console", { role: "super_admin" });
    const roles = [["super_admin", "Super-administrateur"], ["admin", "Administrateur plateforme"], ["analyste", "Analyste marché"],
      ["support", "Support utilisateurs"], ["conformite", "Conformité / Auditeur"], ["observateur", "Observateur"]].map(([code, libelle], i) => ({ code, libelle, ordre: i + 1 }));
    const perms = [["dashboard.read", "Tableau de bord", "Voir les indicateurs agrégés"], ["users.read", "Utilisateurs", "Lister et rechercher les utilisateurs"],
      ["users.read_pii", "Utilisateurs", "Voir l'adresse e-mail complète"], ["users.read_portfolio", "Utilisateurs", "Voir le portefeuille d'un client (motif obligatoire)"],
      ["users.suspend", "Utilisateurs", "Suspendre / réactiver un compte"], ["users.delete", "Utilisateurs", "Supprimer un compte (droit à l'effacement)"],
      ["users.export", "Utilisateurs", "Exporter les données d'un client (droit d'accès)"], ["roles.read", "Habilitations", "Consulter la matrice et les attributions"],
      ["roles.assign", "Habilitations", "Attribuer / retirer un rôle"], ["market.read", "Données", "Voir les séances publiées et la qualité des données"],
      ["market.correct", "Données", "Corriger une donnée de marché"], ["engine.params", "Moteur", "Modifier les paramètres du moteur"],
      ["batch.read", "Traitements", "Voir l'historique des traitements"], ["batch.run", "Traitements", "Relancer le traitement du soir"],
      ["comms.manage", "Communication", "Bannière, maintenance, modèles d'e-mail"], ["audit.read", "Audit", "Consulter et exporter le journal d'audit"],
      ["compliance.manage", "Conformité", "Versions des CGU et des avertissements"]].map(([code, module, libelle], i) => ({ code, module, libelle, ordre: i }));
    const M = { super_admin: perms.map((p) => p.code), admin: ["dashboard.read", "users.read", "users.read_pii", "users.read_portfolio", "users.suspend", "users.delete", "users.export", "roles.read", "market.read", "engine.params", "batch.read", "batch.run", "comms.manage"],
      analyste: ["dashboard.read", "market.read", "market.correct", "engine.params", "batch.read", "batch.run"], support: ["dashboard.read", "users.read", "users.read_portfolio", "users.export"],
      conformite: ["dashboard.read", "users.read", "users.read_pii", "users.read_portfolio", "users.export", "roles.read", "market.read", "batch.read", "audit.read", "compliance.manage"], observateur: ["dashboard.read"] };
    const attrib = [{ user_id: "f6", email: "admin@exemple.org", role: "super_admin", accorde_le: d(60), expire_le: null, accorde_par: null }];
    const find = (id) => users.find((u) => u.id === id);
    const role = M[QS.get("role")] ? QS.get("role") : "super_admin";
    const can = (p) => M[role].includes(p);
    const need = (p) => { if (!can(p)) throw new Error(`Accès refusé : permission ${p} requise`); };
    const mask = (e) => (can("users.read_pii") ? e : e.slice(0, 2) + "•••@" + e.split("@")[1]);
    const jour = d(1).slice(0, 10);
    const actions = [["BICC", "BICI CI", 19500, 0.012, "ACHAT"], ["ORAC", "ORANGE CI", 15200, -0.004, "CONSERVER"], ["SDSC", "AFRICA GLOBAL LOGISTICS CI", 1650, 0.095, "ACHAT"],
      ["SGBC", "SOCIETE GENERALE CI", 28900, 0.021, "ACHAT FORT"], ["SNTS", "SONATEL SENEGAL", 25300, 0, null], ["SIVC", "AIR LIQUIDE CI", 900, -0.02, "ÉVITER"]]
      .map(([code, nom, cours, var_1j, decision]) => ({ code, nom, cours: code === "SNTS" ? null : cours, var_1j, decision, score: 55 }));
    const obligations = [{ code: "TPCI.O1", nom: "TPCI 6,10 % 2023-2030", prix: 10150, cours: 10000, decision: "ACHAT" }, { code: "EOS.O2", nom: "EOS 6,50 % 2022-2029", prix: null, cours: null, decision: "SURVEILLER" }];
    const opcvm = [{ code: "FCP-SEC", nom: "FCP Sécurité", vl: 13250, date_vl: d(3).slice(0, 10), decision: "ACHAT" }, { code: "FCP-ACT", nom: "FCP Actions UEMOA", vl: 5120, date_vl: d(45).slice(0, 10), decision: "ÉVITER (VL non publiée)" }];
    const corrections = [];
    const params = [{ cle: "min_ligne_fcfa", libelle: "Montant minimal d'une ligne proposée", unite: "F", type: "nombre", defaut: 50000, min: 10000, max: 1000000, aide: "Sous ce montant, une ligne n'est pas proposée (frais minimum des SGI). Plus élevé = moins de lignes." },
      { cle: "poids_max_secteur", libelle: "Poids maximal d'un secteur (poche actions)", unite: "%", type: "taux", defaut: 0.4, min: 0.2, max: 1, aide: "Limite la concentration sectorielle des actions proposées." },
      { cle: "seuil_ordre_pct", libelle: "Ordre minimal (part du portefeuille)", unite: "%", type: "taux", defaut: 0.02, min: 0, max: 0.1, aide: "Les ajustements plus petits sont ignorés pour éviter des frais inutiles." },
      { cle: "titres_exclus", libelle: "Actions exclues des propositions", unite: "", type: "codes", defaut: [], aide: "Codes BRVM jamais proposés à l'achat (ex. données douteuses, opération sur titre en cours)." }]
      .map((p) => ({ ...p, valeur: null, modifie_le: null, modifie_par: null }));
    const traitements = [1, 2, 3, 4].map((j, i) => ({ id: 10 - i, debut: d(j - 0.2), fin: d(j - 0.21), statut: j === 3 ? "echec" : "succes", declencheur: "planifié",
      seance: j === 3 ? null : d(j).slice(0, 10), details: j === 3 ? { erreur: "Échec de la collecte ou de l'analyse", duree_s: 412 } : { propositions: 6, utilisateurs: 6, duree_s: 268 } }));
    const annonces = [];
    const docs = [];
    const o = {
      session: async () => ({ user: { id: "f6", email: "admin@exemple.org" } }), login: async () => {}, logout: async () => { location.href = location.pathname; },
      aal: async () => ({ currentLevel: "aal2", nextLevel: "aal2" }), factors: async () => ({ totp: [], all: [] }),
      moi: async () => ({ email: "admin@exemple.org", mfa: true, roles: [roles.find((r) => r.code === role).libelle], permissions: M[role] }),
      tableau: async () => ({ utilisateurs: users.length, nouveaux_7j: 2, actifs_7j: 4, actifs_30j: 6, avec_portefeuille: 4, operations: 55, email_soir: 5,
        suspendus: users.filter((u) => u.suspendu).length, profils: { equilibre: 3, dynamique: 2, prudent: 1 }, budget_total: 17000000,
        derniere_seance: d(1).slice(0, 10), publie_le: d(0.6), propositions_seance: 6,
        seances: [1, 2, 3, 4, 5].map((j) => ({ date: d(j).slice(0, 10), publie_le: d(j - 0.4), modele_valide: false, nb_actions: 48, nb_obligations: 200, nb_opcvm: 125, propositions: 6 })) }),
      utilisateurs: async (q) => users.filter((u) => !q || u.email.includes(q)).map((u) => ({ ...u, email: mask(u.email), cgu_version: docs.length ? 1 : null })),
      portefeuille: async (u, motif) => { log("users.read_portfolio", u, motif); return { proposition: { valeur: 2661821, tresorerie: 1877765, positions: [] }, operations: [] }; },
      suspendre: async (u, s, motif) => { find(u).suspendu = s; log(s ? "users.suspend" : "users.reactivate", u, motif); },
      supprimer: async (u, conf, motif) => { const x = find(u); if (conf.toLowerCase() !== x.email) throw new Error("La confirmation ne correspond pas à l'adresse du compte"); users.splice(users.indexOf(x), 1); log("users.delete", u, motif); },
      exporter: async (u, motif) => { log("users.export", u, motif); return { compte: { ...find(u), email: mask(find(u).email) }, operations: [], exporte_le: new Date().toISOString() }; },
      habilitations: async () => ({ roles, permissions: perms, matrice: Object.entries(M).flatMap(([r, ps]) => ps.map((p) => [r, p])), attributions: attrib }),
      attribuer: async (email, role, exp, motif) => { attrib.push({ user_id: "x" + attrib.length, email, role, accorde_le: new Date().toISOString(), expire_le: exp, accorde_par: "admin@exemple.org" }); log("roles.assign", email, motif, { role }); },
      retirer: async (u, role, motif) => { attrib.splice(attrib.findIndex((a) => a.user_id === u && a.role === role), 1); log("roles.revoke", u, motif, { role }); },
      audit: async () => audit,
      donnees: async () => {
        need("market.read");
        const ctl = (libelle, grave, codes) => ({ libelle, grave, codes });
        return { date: jour, seances: [1, 2, 3, 4, 5].map((j) => ({ date: d(j).slice(0, 10), publie_le: d(j - 0.4), nb_actions: 48, nb_obligations: 200, nb_opcvm: 125 })),
          controles: [ctl("Actions sans cours", true, actions.filter((a) => !(a.cours > 0)).map((a) => a.code)),
            ctl("Variation hors fourchette BRVM (±7,5 %)", true, actions.filter((a) => Math.abs(a.var_1j) > 0.0751).map((a) => a.code)),
            ctl("Actions sans historique de cours", false, []), ctl("Obligations sans prix", true, obligations.filter((o) => !(o.prix > 0)).map((o) => o.code)),
            ctl("OPCVM : valeur liquidative de plus de 30 jours", false, ["FCP-ACT"]), ctl("Indices BRVM absents pour la séance", false, [])],
          actions, obligations, opcvm, indices: [{ code: "BRVM30", cloture: 158.2, variation: 0.004 }, { code: "BRVMC", cloture: 301.7, variation: 0.006 }], corrections };
      },
      corriger: async (t, dt, code, champ, val, motif) => {
        need("market.correct");
        const rows = { actions_analyse: actions, obligations_analyse: obligations, opcvm_analyse: opcvm }[t];
        const r = rows.find((x) => x.code === code);
        const v = champ === "decision" ? val : +String(val).replace(",", ".");
        if (champ !== "decision" && !(v > 0)) throw new Error("Indiquez un nombre positif");
        corrections.unshift({ quand: new Date().toISOString(), par: "admin@exemple.org", tableau: t, date: dt, code, champ, ancienne: r[champ], nouvelle: String(v), motif });
        r[champ] = v; log("market.correct", code, motif, { champ });
      },
      parametres: async () => { need("engine.params"); return params; },
      modifierParametre: async (cle, val, motif) => {
        need("engine.params");
        const p = params.find((x) => x.cle === cle);
        if (val !== null && p.type !== "codes" && (val < p.min || val > p.max)) throw new Error(`Valeur hors bornes (${p.min} à ${p.max})`);
        log("engine.params", cle, motif, { avant: p.valeur, apres: val }); Object.assign(p, { valeur: val, modifie_le: new Date().toISOString(), modifie_par: "admin@exemple.org" });
      },
      traitements: async () => { need("batch.read"); return { relance_configuree: true, traitements }; },
      relancer: async (motif) => {
        need("batch.run");
        if (traitements[0]?.statut === "demande") throw new Error("Un traitement est déjà demandé ou en cours : patientez quelques minutes");
        traitements.unshift({ id: 11, debut: new Date().toISOString(), statut: "demande", declencheur: "console", demande_par: "admin@exemple.org", details: { motif } }); log("batch.run", "11", motif);
      },
      annonces: async () => { need("comms.manage"); return annonces; },
      publierAnnonce: async (m, niveau, fin, motif) => {
        need("comms.manage"); annonces.forEach((a) => (a.actif = a.en_cours = false));
        annonces.unshift({ id: annonces.length + 1, message: m, niveau, debut: new Date().toISOString(), fin, actif: true, en_cours: true, cree_par: "admin@exemple.org" }); log("comms.publish", String(annonces.length), motif);
      },
      retirerAnnonce: async (id, motif) => { need("comms.manage"); Object.assign(annonces.find((a) => a.id === id), { actif: false, en_cours: false }); log("comms.withdraw", String(id), motif); },
      documents: async () => { need("compliance.manage"); const v = Math.max(0, ...docs.filter((x) => x.type === "cgu").map((x) => x.version)) || null; return { documents: docs, cgu_version: v, comptes: users.length, acceptee: v ? 2 : 0 }; },
      publierDocument: async (type, titre, texte, motif) => {
        need("compliance.manage"); const version = docs.filter((x) => x.type === type).length + 1;
        docs.unshift({ id: docs.length + 1, type, version, titre, texte, publie_le: new Date().toISOString(), publie_par: "admin@exemple.org" }); log("compliance.publish", `${type} v${version}`, motif); return version;
      },
    };
    // Même contrôle que la base : la démo par rôle refuse ce que le rôle n'a pas
    const REQ = { tableau: "dashboard.read", utilisateurs: "users.read", portefeuille: "users.read_portfolio", suspendre: "users.suspend", supprimer: "users.delete",
      exporter: "users.export", habilitations: "roles.read", attribuer: "roles.assign", retirer: "roles.assign", audit: "audit.read" };
    for (const [k, p] of Object.entries(REQ)) { const f = o[k]; o[k] = async (...a) => { need(p); return f(...a); }; }
    o.role = role; o.roles = roles;
    return o;
  }

  const api = DEMO ? demoApi() : supaApi();
  const S = { moi: null, can: () => false, users: [], q: "" };

  // ------------------------------------------------------------ dialogue de confirmation (motif)
  function ask({ title, body = "", motif = true, ok = "Confirmer", danger = false, validate }) {
    return new Promise((resolve) => {
      const dlg = $("#dlg"), f = $("#dlg-form");
      $("#dlg-title").textContent = title;
      $("#dlg-body").innerHTML = body;
      $("#dlg-motif-l").hidden = !motif;
      f.motif.value = "";
      $(".msg", f).textContent = "";
      const b = $("#dlg-ok"); b.textContent = ok; b.classList.toggle("danger", danger);
      const onSubmit = (ev) => {
        if (ev.submitter?.value !== "ok") return;
        ev.preventDefault();
        const vals = { motif: f.motif.value.trim(), form: f };
        if (motif && !vals.motif) { $(".msg", f).textContent = "Le motif est obligatoire."; return; }
        const err = validate?.(vals);
        if (err) { $(".msg", f).textContent = err; return; }
        cleanup(); dlg.close(); resolve(vals);
      };
      const onClose = () => { cleanup(); resolve(null); };
      const cleanup = () => { f.removeEventListener("submit", onSubmit); dlg.removeEventListener("close", onClose); };
      f.addEventListener("submit", onSubmit);
      dlg.addEventListener("close", onClose);
      dlg.showModal();
      (body.includes("<input") ? $("#dlg-body input", f) : f.motif).focus();
    });
  }

  // ------------------------------------------------------------ vues
  async function vTableau() {
    const v = $("#v-tableau");
    v.innerHTML = `<h1 id="h-tableau">Tableau de bord</h1><p class="muted">Chargement…</p>`;
    const t = await api.tableau();
    const age = t.publie_le ? (Date.now() - new Date(t.publie_le)) / 36e5 : Infinity;
    const actifs = t.utilisateurs - t.suspendus;
    const etat = !t.derniere_seance ? ["ko", "Aucune séance publiée"]
      : age > 30 ? ["ko", `Dernière publication ${ago(t.publie_le)} : le traitement du soir a peut-être échoué`]
      : t.propositions_seance < actifs ? ["att", `${t.propositions_seance} propositions pour ${actifs} comptes actifs`]
      : ["ok", "Données à jour, toutes les propositions calculées"];
    const tile = (lbl, val, sub = "") => `<div class="tile"><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
    const prof = Object.entries(t.profils || {}).map(([k, n]) => `${esc(k)} ${N(n)}`).join(" · ") || "–";
    v.innerHTML = `<h1 id="h-tableau">Tableau de bord</h1>
      <div class="card"><span class="status ${etat[0]}">${esc(etat[1])}</span>
        <p class="small muted">Dernière séance : ${D(t.derniere_seance)} · publiée ${DT(t.publie_le)}</p></div>
      <div class="tiles">
        ${tile("Utilisateurs", N(t.utilisateurs), `+${N(t.nouveaux_7j)} cette semaine`)}
        ${tile("Actifs 7 jours", N(t.actifs_7j), `${N(t.actifs_30j)} sur 30 jours`)}
        ${tile("Avec un portefeuille", N(t.avec_portefeuille), `${N(t.operations)} opérations`)}
        ${tile("Budget déclaré", F(t.budget_total), prof)}
        ${tile("E-mail du soir", N(t.email_soir), "abonnés actifs")}
        ${tile("Comptes suspendus", N(t.suspendus))}
      </div>
      <div class="card"><h2>Séances publiées</h2><div class="scroll-x"><table class="dtable">
        <thead><tr><th>Séance</th><th>Publiée le</th><th class="num">Actions</th><th class="num">Obligations</th><th class="num">OPCVM</th><th class="num">Propositions</th><th>Modèle prédictif</th></tr></thead>
        <tbody>${(t.seances || []).map((s) => `<tr><td>${D(s.date)}</td><td>${DT(s.publie_le)}</td><td class="num">${N(s.nb_actions)}</td>
          <td class="num">${N(s.nb_obligations)}</td><td class="num">${N(s.nb_opcvm)}</td><td class="num">${N(s.propositions)}</td>
          <td>${s.modele_valide ? "validé" : "non validé"}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Aucune séance.</td></tr>`}</tbody></table></div></div>`;
  }

  async function vUtilisateurs(reload = true) {
    const v = $("#v-utilisateurs");
    if (reload) { v.innerHTML = `<h1 id="h-utilisateurs">Utilisateurs</h1><p class="muted">Chargement…</p>`; S.users = await api.utilisateurs(S.q); }
    const c = S.can;
    v.innerHTML = `<h1 id="h-utilisateurs">Utilisateurs</h1>
      <form class="toolbar" id="f-q" role="search"><input type="search" name="q" placeholder="Rechercher par adresse e-mail" value="${esc(S.q)}" aria-label="Rechercher par adresse e-mail">
        <button class="btn" type="submit">Rechercher</button></form>
      <p class="small muted">${S.users.length} compte${S.users.length > 1 ? "s" : ""}${c("users.read_pii") ? "" : " · adresses masquées (permission « voir l'e-mail complet » requise)"}</p>
      <div class="card scroll-x"><table class="dtable">
        <thead><tr><th>Compte</th><th>Inscrit</th><th>Dernière connexion</th><th>Profil</th><th class="num">Budget</th><th class="num">Opérations</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${S.users.map((u) => `<tr>
          <td>${esc(u.email)}${u.a_un_role ? ` <span class="chip">admin</span>` : ""}</td><td>${D(u.inscrit_le)}</td><td>${ago(u.derniere_connexion)}</td>
          <td>${esc(u.profil || "–")}</td><td class="num">${F(u.budget)}</td><td class="num">${N(u.operations)}</td>
          <td>${u.suspendu ? `<span class="status ko">Suspendu</span>` : `<span class="status ok">Actif</span>`}${u.cgu_version ? `<div class="small muted">CGU v${esc(u.cgu_version)}</div>` : ""}</td>
          <td><div class="row-actions">
            ${c("users.read_portfolio") ? `<button class="btn small" data-act="voir" data-id="${esc(u.id)}">Portefeuille</button>` : ""}
            ${c("users.export") ? `<button class="btn small" data-act="export" data-id="${esc(u.id)}">Exporter</button>` : ""}
            ${c("users.suspend") ? `<button class="btn small" data-act="${u.suspendu ? "reactiver" : "suspendre"}" data-id="${esc(u.id)}">${u.suspendu ? "Réactiver" : "Suspendre"}</button>` : ""}
            ${c("users.delete") ? `<button class="btn small danger" data-act="supprimer" data-id="${esc(u.id)}">Supprimer</button>` : ""}
          </div></td></tr>`).join("") || `<tr><td colspan="8" class="muted">Aucun compte.</td></tr>`}</tbody></table></div>`;
    $("#f-q", v).addEventListener("submit", (ev) => { ev.preventDefault(); S.q = ev.target.q.value.trim(); vUtilisateurs(); });
    v.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => userAction(b.dataset.act, S.users.find((u) => u.id === b.dataset.id))));
  }

  async function userAction(act, u) {
    try {
      if (act === "voir") {
        const r = await ask({ title: "Consulter le portefeuille", body: `<p>Compte <b>${esc(u.email)}</b>. Cette consultation sera consignée dans le journal d'audit.</p>`, ok: "Consulter" });
        if (!r) return;
        const p = await api.portefeuille(u.id, r.motif);
        const c = p.proposition || {};
        await ask({ title: "Portefeuille de " + u.email, motif: false, ok: "Fermer",
          body: `<p>Valeur ${F(c.valeur)} · trésorerie ${F(c.tresorerie)} · ${N((c.positions || []).length)} positions · ${N((p.operations || []).length)} opérations</p>
            <details><summary>Données détaillées</summary><pre class="json">${esc(JSON.stringify(p, null, 2))}</pre></details>` });
      } else if (act === "export") {
        const r = await ask({ title: "Exporter les données du client", body: `<p>Export complet (compte, profil, opérations, propositions) de <b>${esc(u.email)}</b>, au format JSON.</p>`, ok: "Exporter" });
        if (!r) return;
        const data = await api.exporter(u.id, r.motif);
        download(`export-${u.id}.json`, JSON.stringify(data, null, 2), "application/json");
        toast("Export téléchargé et consigné.");
      } else if (act === "suspendre" || act === "reactiver") {
        const s = act === "suspendre";
        const r = await ask({ title: s ? "Suspendre le compte" : "Réactiver le compte", ok: s ? "Suspendre" : "Réactiver", danger: s,
          body: s ? `<p><b>${esc(u.email)}</b> ne pourra plus modifier ses données et ne recevra plus de proposition. Réversible.</p>` : `<p>Réactiver <b>${esc(u.email)}</b>.</p>` });
        if (!r) return;
        await api.suspendre(u.id, s, r.motif);
        toast(s ? "Compte suspendu." : "Compte réactivé.");
        await vUtilisateurs();
      } else if (act === "supprimer") {
        const r = await ask({ title: "Supprimer définitivement le compte", ok: "Supprimer définitivement", danger: true,
          body: `<p class="notice bad">Irréversible : le compte, le profil, le journal d'opérations et les propositions de <b>${esc(u.email)}</b> seront effacés.</p>
            <label>Retapez l'adresse e-mail du compte pour confirmer<input name="conf" autocomplete="off"></label>`,
          validate: ({ form }) => (!form.conf.value.trim() ? "Retapez l'adresse e-mail." : null) });
        if (!r) return;
        await api.supprimer(u.id, r.form.conf.value.trim(), r.motif);
        toast("Compte supprimé.");
        await vUtilisateurs();
      }
    } catch (e) { toast("Action refusée : " + msgErr(e)); }
  }

  async function vHabilitations() {
    const v = $("#v-habilitations");
    v.innerHTML = `<h1 id="h-habilitations">Habilitations</h1><p class="muted">Chargement…</p>`;
    const h = await api.habilitations();
    const has = new Set((h.matrice || []).map(([r, p]) => r + "|" + p));
    const roles = h.roles || [];
    let rows = "", mod = "";
    for (const p of h.permissions || []) {
      if (p.module !== mod) { mod = p.module; rows += `<tr class="mod"><td colspan="${roles.length + 1}">${esc(mod)}</td></tr>`; }
      rows += `<tr><td>${esc(p.libelle)}<div class="small muted">${esc(p.code)}</div></td>${roles.map((r) => has.has(r.code + "|" + p.code)
        ? `<td class="yes" aria-label="autorisé">✓</td>` : `<td class="no" aria-label="non autorisé">–</td>`).join("")}</tr>`;
    }
    const canAssign = S.can("roles.assign");
    v.innerHTML = `<h1 id="h-habilitations">Habilitations</h1>
      <div class="card"><h2>Personnes habilitées</h2><div class="scroll-x"><table class="dtable">
        <thead><tr><th>Compte</th><th>Rôle</th><th>Accordé le</th><th>Par</th><th>Expire le</th>${canAssign ? "<th></th>" : ""}</tr></thead>
        <tbody>${(h.attributions || []).map((a) => `<tr><td>${esc(a.email)}</td><td>${esc(roles.find((r) => r.code === a.role)?.libelle || a.role)}</td>
          <td>${D(a.accorde_le)}</td><td>${esc(a.accorde_par || "–")}</td><td>${a.expire_le ? D(a.expire_le) : "sans limite"}</td>
          ${canAssign ? `<td><button class="btn small" data-retirer="${esc(a.user_id)}" data-role="${esc(a.role)}" data-email="${esc(a.email)}">Retirer</button></td>` : ""}</tr>`).join("")}</tbody></table></div>
        ${canAssign ? `<form id="f-role" class="grid-role" novalidate><h3>Attribuer un rôle</h3>
          <label>Adresse e-mail du compte<input name="email" type="email" required placeholder="la personne doit s'être connectée une fois"></label>
          <label>Rôle<select name="role">${roles.map((r) => `<option value="${esc(r.code)}">${esc(r.libelle)}</option>`).join("")}</select></label>
          <label>Expiration (facultatif)<input name="exp" type="date"></label>
          <div class="actions"><button class="btn primary" type="submit">Attribuer…</button></div></form>` : ""}
      </div>
      <div class="card"><h2>Matrice des habilitations</h2>
        <p class="small muted">Définie dans la base (supabase/admin.sql) : c'est elle qui s'applique, quelle que soit l'interface.</p>
        <div class="scroll-x"><table class="dtable matrix"><thead><tr><th>Permission</th>${roles.map((r) => `<th title="${esc(r.description || "")}">${esc(r.libelle)}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    v.querySelectorAll("[data-retirer]").forEach((b) => b.addEventListener("click", async () => {
      const r = await ask({ title: "Retirer le rôle", body: `<p>Retirer le rôle <b>${esc(b.dataset.role)}</b> à <b>${esc(b.dataset.email)}</b> ?</p>`, ok: "Retirer", danger: true });
      if (!r) return;
      try { await api.retirer(b.dataset.retirer, b.dataset.role, r.motif); toast("Rôle retiré."); vHabilitations(); } catch (e) { toast("Action refusée : " + msgErr(e)); }
    }));
    $("#f-role", v)?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, email = f.email.value.trim(), role = f.role.value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Adresse e-mail invalide."); return; }
      const lib = roles.find((x) => x.code === role)?.libelle || role;
      const r = await ask({ title: "Attribuer un rôle", body: `<p>Donner le rôle <b>${esc(lib)}</b> à <b>${esc(email)}</b>${f.exp.value ? ` jusqu'au ${D(f.exp.value)}` : ""} ?</p>`, ok: "Attribuer" });
      if (!r) return;
      try { await api.attribuer(email, role, f.exp.value ? f.exp.value + "T23:59:59Z" : null, r.motif); toast("Rôle attribué."); vHabilitations(); }
      catch (e) { toast("Action refusée : " + msgErr(e)); }
    });
  }

  async function vAudit() {
    const v = $("#v-audit");
    v.innerHTML = `<h1 id="h-audit">Journal d'audit</h1><p class="muted">Chargement…</p>`;
    const rows = await api.audit(500);
    v.innerHTML = `<h1 id="h-audit">Journal d'audit</h1>
      <div class="toolbar"><p class="small muted" style="margin:0">${rows.length} dernières actions d'administration. Ce journal ne peut être ni modifié ni effacé.</p>
        <button class="btn small" id="csv" style="margin-left:auto">Exporter en CSV</button></div>
      <div class="card scroll-x"><table class="dtable"><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Cible</th><th>Motif</th><th>Détails</th></tr></thead>
      <tbody>${rows.map((a) => `<tr><td>${DT(a.quand)}</td><td>${esc(a.acteur_email || "–")}</td><td>${esc(ACTIONS[a.action] || a.action)}</td>
        <td>${esc(a.cible || "–")}</td><td>${esc(a.motif || "–")}</td><td class="small">${a.details ? esc(JSON.stringify(a.details)) : ""}</td></tr>`).join("")
        || `<tr><td colspan="6" class="muted">Aucune action consignée.</td></tr>`}</tbody></table></div>`;
    $("#csv", v).addEventListener("click", () => {
      const q = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
      const csv = ["quand;acteur;action;cible;motif;details", ...rows.map((a) => [a.quand, a.acteur_email, a.action, a.cible, a.motif, a.details ? JSON.stringify(a.details) : ""].map(q).join(";"))].join("\n");
      download(`audit-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + csv, "text/csv");
    });
  }

  // ------------------------------------------------------------ données de marché (market.read / market.correct)
  async function vDonnees(date) {
    const v = $("#v-donnees");
    v.innerHTML = `<h1 id="h-donnees">Données de marché</h1><p class="muted">Chargement…</p>`;
    const x = await api.donnees(date);
    const canFix = S.can("market.correct");
    const u = (S.dn ??= { cl: "actions_analyse", q: "" });
    const graves = (x.controles || []).filter((c) => c.grave && c.codes.length).length;
    const autres = (x.controles || []).filter((c) => !c.grave && c.codes.length).length;
    const rows = { actions_analyse: x.actions, obligations_analyse: x.obligations, opcvm_analyse: x.opcvm }[u.cl] || [];
    const prix = { actions_analyse: "cours", obligations_analyse: "prix", opcvm_analyse: "vl" }[u.cl];
    const shown = rows.filter((r) => !u.q || (r.code + " " + (r.nom || "")).toLowerCase().includes(u.q.toLowerCase()));
    v.innerHTML = `<h1 id="h-donnees">Données de marché</h1>
      <div class="toolbar"><label class="small" style="margin:0">Séance <select id="dn-date" style="width:auto;display:inline-block">${(x.seances || []).map((s) =>
        `<option value="${esc(s.date)}"${s.date === x.date ? " selected" : ""}>${D(s.date)}</option>`).join("")}</select></label>
        <span class="small muted">${(x.indices || []).map((i) => `${esc(i.code)} ${N(i.cloture)} (${P(i.variation)})`).join(" · ")}</span></div>
      <div class="card"><h2>Contrôles de qualité</h2>
        <p><span class="status ${graves ? "ko" : autres ? "att" : "ok"}">${graves ? `${graves} anomalie${graves > 1 ? "s" : ""} à corriger` : autres ? "Points d'attention" : "Aucune anomalie détectée"}</span></p>
        <ul class="list">${(x.controles || []).map((c) => `<li><div class="main"><div>${esc(c.libelle)}</div>
          ${c.codes.length ? `<div class="chips">${c.codes.map((k) => `<span class="chip ${c.grave ? "sell" : "warn"}">${esc(k)}</span>`).join("")}</div>` : ""}</div>
          <div class="right"><span class="status ${!c.codes.length ? "ok" : c.grave ? "ko" : "att"}">${N(c.codes.length)}</span></div></li>`).join("")}</ul></div>
      <div class="card"><h2>Données publiées</h2>
        <div class="toolbar"><div class="seg" role="group" aria-label="Classe d'actifs">${[["actions_analyse", "Actions"], ["obligations_analyse", "Obligations"], ["opcvm_analyse", "OPCVM"]]
          .map(([k, l]) => `<button type="button" data-cl="${k}" aria-pressed="${u.cl === k}">${l}</button>`).join("")}</div>
          <input type="search" id="dn-q" placeholder="Code ou nom" value="${esc(u.q)}" aria-label="Filtrer par code ou nom"></div>
        ${canFix ? `<p class="small muted">Corriger modifie la donnée publiée de la séance (visible tout de suite dans l'application) ; l'ancienne valeur est conservée. Pour qu'un titre ne soit plus proposé durablement, utilisez <b>Moteur → Actions exclues</b>.</p>` : ""}
        <div class="scroll-x"><table class="dtable"><thead><tr><th>Code</th><th>Nom</th><th class="num">${prix === "vl" ? "VL" : prix === "prix" ? "Prix" : "Cours"}</th>
          ${u.cl === "actions_analyse" ? `<th class="num">Var. jour</th>` : u.cl === "opcvm_analyse" ? "<th>Date VL</th>" : `<th class="num">Cours</th>`}<th>Décision</th>${canFix ? "<th></th>" : ""}</tr></thead>
        <tbody>${shown.map((r) => `<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.nom || "")}</td><td class="num">${N(r[prix])}</td>
          ${u.cl === "actions_analyse" ? `<td class="num">${P(r.var_1j)}</td>` : u.cl === "opcvm_analyse" ? `<td>${D(r.date_vl)}</td>` : `<td class="num">${N(r.cours)}</td>`}
          <td>${esc(r.decision || "–")}</td>${canFix ? `<td><button class="btn small" data-fix="${esc(r.code)}">Corriger</button></td>` : ""}</tr>`).join("")
          || `<tr><td colspan="6" class="muted">Aucune ligne.</td></tr>`}</tbody></table></div></div>
      <div class="card"><h2>Corrections</h2><div class="scroll-x"><table class="dtable"><thead><tr><th>Quand</th><th>Par</th><th>Séance</th><th>Titre</th><th>Champ</th><th>Avant → après</th><th>Motif</th></tr></thead>
        <tbody>${(x.corrections || []).map((c) => `<tr><td>${DT(c.quand)}</td><td>${esc(c.par || "–")}</td><td>${D(c.date)}</td><td>${esc(c.code)}</td><td>${esc(c.champ)}</td>
          <td>${esc(c.ancienne ?? "–")} → <b>${esc(c.nouvelle)}</b></td><td>${esc(c.motif)}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Aucune correction.</td></tr>`}</tbody></table></div></div>`;
    $("#dn-date", v).addEventListener("change", (e) => vDonnees(e.target.value));
    v.querySelectorAll("[data-cl]").forEach((b) => b.addEventListener("click", () => { u.cl = b.dataset.cl; vDonnees(x.date); }));
    $("#dn-q", v).addEventListener("change", (e) => { u.q = e.target.value.trim(); vDonnees(x.date); });
    v.querySelectorAll("[data-fix]").forEach((b) => b.addEventListener("click", async () => {
      const r = rows.find((y) => y.code === b.dataset.fix), champs = CHAMPS[u.cl];
      const res = await ask({ title: `Corriger ${r.code} (séance du ${D(x.date)})`, ok: "Corriger",
        body: `<label>Champ<select name="champ">${champs.map((c) => `<option value="${c}">${c === "decision" ? "Décision" : c === "vl" ? "Valeur liquidative" : c === "prix" ? "Prix" : "Cours"} (actuel : ${esc(c === "decision" ? r[c] || "–" : N(r[c]))})</option>`).join("")}</select></label>
          <label>Nouvelle valeur<input name="val" autocomplete="off" inputmode="decimal" list="dn-dec"></label><datalist id="dn-dec">${DECISIONS.map((d) => `<option value="${esc(d)}">`).join("")}</datalist>
          <p class="small muted">Décisions possibles : ${DECISIONS.map(esc).join(", ")}.</p>`,
        validate: ({ form }) => {
          const val = form.val.value.trim();
          if (!val) return "Indiquez la nouvelle valeur.";
          if (form.champ.value === "decision" ? !DECISIONS.includes(val) : !(+val.replace(",", ".") > 0)) return form.champ.value === "decision" ? "Décision inconnue." : "Indiquez un nombre positif.";
          return null;
        } });
      if (!res) return;
      try { await api.corriger(u.cl, x.date, r.code, res.form.champ.value, res.form.val.value.trim(), res.motif); toast("Correction enregistrée."); vDonnees(x.date); }
      catch (e) { toast("Action refusée : " + msgErr(e)); }
    }));
  }

  // ------------------------------------------------------------ traitements (batch.read / batch.run)
  async function vTraitements() {
    const v = $("#v-traitements");
    v.innerHTML = `<h1 id="h-traitements">Traitements</h1><p class="muted">Chargement…</p>`;
    const x = await api.traitements();
    const canRun = S.can("batch.run");
    const t = x.traitements || [];
    const dur = (s) => (s == null ? "–" : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);
    v.innerHTML = `<h1 id="h-traitements">Traitements</h1>
      <div class="card"><p class="small">Le traitement du soir collecte les données, publie la séance puis calcule la proposition de chaque utilisateur.
        Il s'exécute automatiquement à 15 h 30 et 19 h 00 (GMT) les jours de séance.</p>
        ${canRun ? (x.relance_configuree ? `<div class="actions" style="justify-content:flex-start"><button class="btn primary" id="relancer">Relancer le traitement maintenant…</button></div>`
          : `<div class="notice">Relance depuis la console non configurée : ajoutez le jeton GitHub dans le coffre-fort Supabase (voir docs/ADMIN.md, « Relance du traitement »).
             En attendant : <a href="https://github.com/BAFIGO/brvm-portefeuille/actions/workflows/quotidien.yml" target="_blank" rel="noopener">GitHub → Actions → Run workflow</a>.</div>`) : ""}</div>
      <div class="card scroll-x"><table class="dtable"><thead><tr><th>Début</th><th>Statut</th><th>Déclencheur</th><th>Séance</th><th class="num">Propositions</th><th class="num">Durée</th><th>Détail</th></tr></thead>
        <tbody>${t.map((r) => { const st = STATUTS[r.statut] || ["att", r.statut], d = r.details || {};
          return `<tr><td>${DT(r.debut)}</td><td><span class="status ${st[0]}">${st[1]}</span></td>
            <td>${esc(r.declencheur || "–")}${r.demande_par ? `<div class="small muted">${esc(r.demande_par)}</div>` : ""}</td><td>${D(r.seance)}</td>
            <td class="num">${d.propositions != null ? `${N(d.propositions)} / ${N(d.utilisateurs)}` : "–"}</td><td class="num">${dur(d.duree_s)}</td>
            <td class="small">${esc(d.erreur || d.motif || "")}${d.lien ? ` <a href="${esc(d.lien)}" target="_blank" rel="noopener">journal ↗</a>` : ""}</td></tr>`; }).join("")
          || `<tr><td colspan="7" class="muted">Aucun traitement enregistré pour l'instant (l'historique démarre au prochain traitement du soir).</td></tr>`}</tbody></table></div>`;
    $("#relancer", v)?.addEventListener("click", async () => {
      const r = await ask({ title: "Relancer le traitement", ok: "Relancer",
        body: `<p>Le traitement complet est lancé sur GitHub (quelques minutes) : collecte, publication de la séance et propositions de tous les utilisateurs.</p>` });
      if (!r) return;
      try { await api.relancer(r.motif); toast("Relance demandée : suivez son avancement ici."); vTraitements(); }
      catch (e) { toast("Action refusée : " + msgErr(e)); }
    });
  }

  // ------------------------------------------------------------ paramètres du moteur (engine.params)
  async function vMoteur() {
    const v = $("#v-moteur");
    v.innerHTML = `<h1 id="h-moteur">Paramètres du moteur</h1><p class="muted">Chargement…</p>`;
    const ps = await api.parametres();
    const aff = (p, val) => (val == null ? "–" : p.type === "taux" ? P(val) : p.type === "codes" ? (val.length ? val.join(", ") : "aucune") : F(val));
    const brut = (p, val) => (val == null ? "" : p.type === "taux" ? +(val * 100).toFixed(2) : p.type === "codes" ? val.join(", ") : val);
    v.innerHTML = `<h1 id="h-moteur">Paramètres du moteur</h1>
      <p class="small muted">Appliqués au prochain traitement du soir, pour les portefeuilles cibles et les propositions de l'application. Chaque modification est consignée.</p>
      ${ps.map((p) => `<form class="card" data-cle="${esc(p.cle)}" novalidate><h2>${esc(p.libelle)}</h2><p class="small muted">${esc(p.aide)}</p>
        <p class="small">Valeur actuelle : <b>${esc(aff(p, p.valeur ?? p.defaut))}</b> ${p.valeur == null ? `<span class="chip">par défaut</span>`
          : `<span class="chip warn">modifiée</span> <span class="muted">le ${DT(p.modifie_le)} par ${esc(p.modifie_par || "–")} · défaut ${esc(aff(p, p.defaut))}</span>`}</p>
        <label>Nouvelle valeur${p.type === "taux" ? " (en %)" : p.type === "codes" ? " (codes séparés par des virgules)" : " (F)"}
          <input name="val" value="${esc(brut(p, p.valeur ?? p.defaut))}" ${p.type === "codes" ? 'autocapitalize="characters"' : 'inputmode="decimal"'} autocomplete="off"></label>
        ${p.type !== "codes" ? `<p class="small muted">Entre ${esc(aff(p, p.min))} et ${esc(aff(p, p.max))}.</p>` : ""}
        <div class="actions">${p.valeur != null ? `<button class="btn" type="button" data-defaut>Rétablir le défaut</button>` : ""}<button class="btn primary" type="submit">Enregistrer…</button></div></form>`).join("")}`;
    const save = async (p, val, titre) => {
      const r = await ask({ title: titre, ok: "Enregistrer", body: `<p>${esc(p.libelle)} : <b>${esc(aff(p, val ?? p.defaut))}</b>${val == null ? " (valeur par défaut)" : ""}.</p>` });
      if (!r) return;
      try { await api.modifierParametre(p.cle, val, r.motif); toast("Paramètre enregistré."); vMoteur(); } catch (e) { toast("Action refusée : " + msgErr(e)); }
    };
    v.querySelectorAll("form[data-cle]").forEach((f) => {
      const p = ps.find((x) => x.cle === f.dataset.cle);
      f.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const raw = f.val.value.trim();
        let val;
        if (p.type === "codes") {
          val = [...new Set(raw.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
          if (val.some((c) => !/^[A-Z0-9]{2,12}$/.test(c))) { toast("Codes BRVM attendus (lettres et chiffres)."); return; }
        } else {
          val = +raw.replace(",", ".").replace(/\s/g, "");
          if (!raw || !isFinite(val)) { toast("Nombre attendu."); return; }
          if (p.type === "taux") val = +(val / 100).toFixed(4);
          if (val < p.min || val > p.max) { toast(`Entre ${aff(p, p.min)} et ${aff(p, p.max)}.`); return; }
        }
        save(p, val, "Modifier un paramètre");
      });
      $("[data-defaut]", f)?.addEventListener("click", () => save(p, null, "Rétablir la valeur par défaut"));
    });
  }

  // ------------------------------------------------------------ communication (comms.manage)
  async function vCommunication() {
    const v = $("#v-communication");
    v.innerHTML = `<h1 id="h-communication">Communication</h1><p class="muted">Chargement…</p>`;
    const as = await api.annonces();
    const cur = as.find((a) => a.en_cours);
    v.innerHTML = `<h1 id="h-communication">Communication</h1>
      <div class="card"><h2>Bannière en cours</h2>${cur ? `<div class="notice ${cur.niveau === "info" ? "info" : cur.niveau === "maintenance" ? "bad" : ""}"><b>${esc(NIVEAUX[cur.niveau])}</b> · ${esc(cur.message)}</div>
        <p class="small muted">Depuis le ${DT(cur.debut)}${cur.fin ? ` · jusqu'au ${DT(cur.fin)}` : " · sans date de fin"}</p>
        <div class="actions" style="justify-content:flex-start"><button class="btn danger" data-retirer="${cur.id}">Retirer la bannière…</button></div>`
        : `<p class="muted">Aucune bannière affichée dans l'application.</p>`}</div>
      <form class="card" id="f-annonce" novalidate><h2>Publier une bannière</h2>
        <p class="small muted">Affichée en haut de l'application pour tous les utilisateurs (et sur l'écran de connexion). Elle remplace la bannière en cours.</p>
        <label>Message (500 caractères au plus)<textarea name="message" maxlength="500" rows="3" required></textarea></label>
        <div class="grid2"><label>Niveau<select name="niveau">${Object.entries(NIVEAUX).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
          <label>Fin d'affichage (facultatif)<input name="fin" type="datetime-local"></label></div>
        <div class="actions"><button class="btn primary" type="submit">Publier…</button></div></form>
      <div class="card"><h2>Historique</h2><div class="scroll-x"><table class="dtable"><thead><tr><th>Publiée le</th><th>Niveau</th><th>Message</th><th>Par</th><th>État</th></tr></thead>
        <tbody>${as.map((a) => `<tr><td>${DT(a.cree_le || a.debut)}</td><td>${esc(NIVEAUX[a.niveau] || a.niveau)}</td><td>${esc(a.message)}</td><td>${esc(a.cree_par || "–")}</td>
          <td>${a.en_cours ? `<span class="status ok">Affichée</span>` : `<span class="muted">Terminée</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Aucune annonce.</td></tr>`}</tbody></table></div></div>`;
    $("[data-retirer]", v)?.addEventListener("click", async (e) => {
      const r = await ask({ title: "Retirer la bannière", ok: "Retirer", danger: true });
      if (!r) return;
      try { await api.retirerAnnonce(+e.target.dataset.retirer, r.motif); toast("Bannière retirée."); vCommunication(); } catch (err) { toast("Action refusée : " + msgErr(err)); }
    });
    $("#f-annonce", v).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target, m = f.message.value.trim(), fin = f.fin.value ? new Date(f.fin.value).toISOString() : null;
      if (!m) { toast("Message obligatoire."); return; }
      if (fin && new Date(fin) <= new Date()) { toast("La date de fin doit être dans le futur."); return; }
      const r = await ask({ title: "Publier la bannière", ok: "Publier", body: `<div class="notice ${f.niveau.value === "info" ? "info" : f.niveau.value === "maintenance" ? "bad" : ""}"><b>${esc(NIVEAUX[f.niveau.value])}</b> · ${esc(m)}</div>` });
      if (!r) return;
      try { await api.publierAnnonce(m, f.niveau.value, fin, r.motif); toast("Bannière publiée."); vCommunication(); } catch (e) { toast("Action refusée : " + msgErr(e)); }
    });
  }

  // ------------------------------------------------------------ conformité (compliance.manage)
  async function vConformite() {
    const v = $("#v-conformite");
    v.innerHTML = `<h1 id="h-conformite">Conformité</h1><p class="muted">Chargement…</p>`;
    const x = await api.documents();
    const docs = x.documents || [];
    const last = (t) => docs.filter((d) => d.type === t).sort((a, b) => b.version - a.version)[0];
    const cgu = last("cgu"), av = last("avertissement");
    v.innerHTML = `<h1 id="h-conformite">Conformité</h1>
      <div class="tiles">
        <div class="tile"><div class="lbl">Conditions d'utilisation</div><div class="val">${cgu ? "v" + cgu.version : "–"}</div><div class="sub">${cgu ? "publiées le " + D(cgu.publie_le) : "aucune version publiée"}</div></div>
        <div class="tile"><div class="lbl">Acceptation de la version en cours</div><div class="val">${cgu ? `${N(x.acceptee)} / ${N(x.comptes)}` : "–"}</div><div class="sub">comptes actifs</div></div>
        <div class="tile"><div class="lbl">Avertissement</div><div class="val">${av ? "v" + av.version : "–"}</div><div class="sub">${av ? "publié le " + D(av.publie_le) : "texte par défaut de l'application"}</div></div>
      </div>
      <form class="card" id="f-doc" novalidate><h2>Publier une nouvelle version</h2>
        <p class="small muted">Une version publiée n'est jamais modifiée. Nouvelles CGU : chaque utilisateur doit les accepter à sa prochaine connexion. Avertissement : affiché dans l'onglet Profil.</p>
        <div class="grid2"><label>Document<select name="type"><option value="cgu">Conditions d'utilisation</option><option value="avertissement">Avertissement (risques)</option></select></label>
          <label>Titre<input name="titre" maxlength="120" value="Conditions d'utilisation"></label></div>
        <label>Texte<textarea name="texte" rows="10" required></textarea></label>
        <div class="actions"><button class="btn primary" type="submit">Publier…</button></div></form>
      <div class="card"><h2>Versions publiées</h2><ul class="list">${docs.map((d) => `<li><div class="main"><details><summary><b>${esc(d.titre)}</b> · v${d.version}</summary>
          <div class="doc-texte small">${esc(d.texte)}</div></details><div class="sub">${d.type === "cgu" ? "Conditions d'utilisation" : "Avertissement"} · ${DT(d.publie_le)} · ${esc(d.publie_par || "–")}</div></div></li>`).join("")
        || `<li class="muted">Aucun document publié.</li>`}</ul></div>`;
    const f = $("#f-doc", v);
    f.type.addEventListener("change", () => { f.titre.value = f.type.value === "cgu" ? "Conditions d'utilisation" : "Avertissement sur les risques"; });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const titre = f.titre.value.trim(), texte = f.texte.value.trim();
      if (!titre || texte.length < 20) { toast("Titre et texte (20 caractères au moins) obligatoires."); return; }
      const r = await ask({ title: "Publier une nouvelle version", ok: "Publier",
        body: `<p><b>${esc(titre)}</b>${f.type.value === "cgu" ? " : tous les utilisateurs devront l'accepter à leur prochaine connexion." : "."}</p>` });
      if (!r) return;
      try { const n = await api.publierDocument(f.type.value, titre, texte, r.motif); toast(`Version ${n} publiée.`); vConformite(); } catch (e) { toast("Action refusée : " + msgErr(e)); }
    });
  }
  const VIEWS = { tableau: vTableau, utilisateurs: vUtilisateurs, donnees: vDonnees, traitements: vTraitements, moteur: vMoteur,
    communication: vCommunication, conformite: vConformite, habilitations: vHabilitations, audit: vAudit };

  // ------------------------------------------------------------ navigation
  function allowedTabs() { return TABS.filter((t) => S.can(NEED[t])); }
  async function render() {
    const tabs = allowedTabs();
    const h = location.hash.slice(1), t = tabs.includes(h) ? h : tabs[0];
    for (const k of TABS) $("#v-" + k).hidden = k !== t;
    document.querySelectorAll("[data-tab]").forEach((a) => (a.dataset.tab === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    try { await VIEWS[t](); } catch (e) { $("#v-" + t).innerHTML = `<div class="notice bad">Chargement impossible : ${esc(msgErr(e))}</div>`; }
  }
  window.addEventListener("hashchange", () => { if (S.moi) render(); });

  // ------------------------------------------------------------ porte d'entrée : connexion → droits → MFA
  const gate = (html) => { $("#gate").hidden = false; $("#gate").innerHTML = html; };

  function loginScreen() {
    gate(`<div class="card narrow"><h1>Administration</h1><p>Connectez-vous avec l'adresse de votre compte administrateur.</p>
      <form id="f-login" novalidate><label for="email">Adresse e-mail</label><input id="email" name="email" type="email" autocomplete="email" required>
      <button class="btn primary" type="submit">Recevoir mon lien de connexion</button><p class="msg" role="status"></p></form></div>`);
    $("#f-login").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const m = $("#f-login .msg");
      try { await api.login(ev.target.email.value.trim()); m.textContent = "Lien envoyé : ouvrez l'e-mail sur cet appareil."; }
      catch (e) { m.textContent = "Envoi impossible : " + msgErr(e); }
    });
  }

  async function mfaScreen() {
    const f = await api.factors();
    const verified = (f.totp || []).filter((x) => x.status === "verified");
    let factorId, enrollHtml = "";
    if (verified.length) factorId = verified[0].id;
    else {
      for (const x of (f.all || []).filter((x) => x.status === "unverified")) await api.unenroll(x.id);   // tentatives inachevées
      const e = await api.enroll();
      factorId = e.id;
      enrollHtml = `<div class="mfa"><img src="${esc(e.totp.qr_code)}" alt="QR code à scanner avec votre application d'authentification">
        <div><p><b>Première connexion à l'administration :</b> activez la double authentification.</p>
        <ol class="small"><li>Installez une application d'authentification (Google Authenticator, Microsoft Authenticator, Authy…).</li>
        <li>Scannez ce QR code, ou saisissez la clé : <div class="secret">${esc(e.totp.secret)}</div></li>
        <li>Saisissez le code à 6 chiffres affiché par l'application.</li></ol></div></div>`;
    }
    gate(`<div class="card narrow" style="max-width:640px"><h1>Double authentification</h1>${enrollHtml ||
      "<p>Saisissez le code à 6 chiffres de votre application d'authentification.</p>"}
      <form id="f-mfa" novalidate><label for="code">Code à 6 chiffres</label>
      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
      <button class="btn primary" type="submit">Valider</button><p class="msg err" role="alert"></p></form></div>`);
    $("#code").focus();
    $("#f-mfa").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const code = ev.target.code.value.replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) { $("#f-mfa .msg").textContent = "Le code comporte 6 chiffres."; return; }
      try { await api.verify(factorId, code); await enter(); }
      catch (e) { $("#f-mfa .msg").textContent = "Code refusé : " + msgErr(e); }
    });
  }

  async function enter() {
    let moi;
    try { moi = await api.moi(); }
    catch (e) {
      gate(`<div class="card narrow"><h1>Administration indisponible</h1><p>${esc(msgErr(e))}</p>
        <p class="small muted">Si la fonction admin_moi est introuvable, exécutez supabase/admin.sql dans Supabase.</p></div>`);
      return;
    }
    $("#who").hidden = false; $("#who-email").textContent = moi.email || "";
    if (!moi.permissions?.length) {
      gate(`<div class="card narrow"><h1>Accès réservé</h1><p>Votre compte n'a aucun rôle d'administration.</p><p><a href="../app/">Retour à l'application</a></p></div>`);
      return;
    }
    const aal = await api.aal();
    if (aal.currentLevel !== "aal2") { await mfaScreen(); return; }
    if (!moi.mfa) { await api.refresh?.(); moi = await api.moi(); }
    S.moi = moi;
    const perms = new Set(moi.permissions);
    S.can = (p) => perms.has(p);
    $("#gate").hidden = true;
    document.querySelectorAll("#nav [data-perm]").forEach((a) => (a.hidden = !S.can(a.dataset.perm)));
    $("#nav").hidden = false;
    render();
  }

  function demoRolePicker() {
    const w = document.createElement("label");
    w.className = "small demo-role";
    w.innerHTML = `<span class="demo-role-l">Rôle simulé</span> <select aria-label="Rôle simulé">${api.roles.map((r) => `<option value="${esc(r.code)}"${r.code === api.role ? " selected" : ""}>${esc(r.libelle)}</option>`).join("")}</select>`;
    $("select", w).addEventListener("change", (e) => { QS.set("role", e.target.value); location.search = QS.toString(); });
    $("#who").prepend(w);
  }

  async function init() {
    if (DEMO) { document.title = "Démo – " + document.title; demoRolePicker(); }
    $("#logout").addEventListener("click", () => api.logout());
    try {
      const s = await api.session();
      if (s?.user) await enter(); else loginScreen();
    } catch (e) { gate(`<div class="notice bad">Impossible de joindre le service : ${esc(msgErr(e))}</div>`); }
  }
  init();
})();
