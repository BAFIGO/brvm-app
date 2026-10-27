/* Console d'administration BafiBourse.
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
  const NEED = { tableau: "dashboard.read", utilisateurs: "users.read", abonnements: "abonnements.manage", avis: "avis.moderate",
    donnees: "market.read", traitements: "batch.read", moteur: "engine.params", univers: "engine.params", communication: "comms.manage",
    conformite: "compliance.manage", habilitations: "roles.read", audit: "audit.read" };
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
      logoutInactif: async () => { await sb.auth.signOut(); location.hash = ""; location.replace(location.pathname + "?inactif=1"); },
      aal: async () => { const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); if (error) throw error; return data; },
      factors: async () => { const { data, error } = await sb.auth.mfa.listFactors(); if (error) throw error; return data; },
      unenroll: async (factorId) => sb.auth.mfa.unenroll({ factorId }),
      enroll: async () => { const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "BRVM admin " + new Date().toISOString().slice(0, 16) }); if (error) throw error; return data; },
      verify: async (factorId, code) => { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw error; },
      refresh: async () => sb.auth.refreshSession(),
      moi: () => rpc("admin_moi"),
      tableau: () => rpc("admin_tableau_de_bord"),
      priseEnMain: (j) => rpc("admin_prise_en_main", { p_jours: j }),
      avis: (st) => rpc("admin_avis", { p_statut: st }),
      abonnements: () => rpc("admin_abonnements"),
      traiterDemande: (id, activer) => rpc("admin_traiter_demande", { p_id: id, p_activer: activer }),
      tarifs: () => rpc("admin_tarifs"),
      formules: (ids) => rpc("admin_formules", { p_ids: ids }),
      abonnes: () => rpc("admin_abonnes"),
      abonnement: (u) => rpc("admin_abonnement", { p_user: u }),
      definirFormule: (u, f, fin, motif) => rpc("admin_definir_formule", { p_user: u, p_formule: f, p_fin: fin, p_motif: motif }),
      crediter: (u, q, pg, motif) => rpc("admin_crediter", { p_user: u, p_questions: q, p_pages: pg, p_motif: motif }),
      modifierTarif: (objet, prix, actif) => rpc("admin_modifier_tarif", { p_objet: objet, p_prix: prix, p_actif: actif }),
      modifierQuotas: (f, q) => rpc("admin_modifier_quotas", { p_formule: f, p_questions: q.questions, p_questions_debut: q.questions_debut,
                                                                p_approfondies: q.approfondies, p_pages: q.pages }),
      modererAvis: (id, dec, motif) => rpc("admin_moderer_avis", { p_id: id, p_decision: dec, p_motif: motif || null }),
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
      univers: () => rpc("admin_univers"),
      modifierGestionnaire: (g, motif) => rpc("admin_modifier_gestionnaire", { p_gestionnaire: g.gestionnaire, p_sgo_directe: g.sgo_directe,
        p_distributeurs: g.distributeurs, p_confirme: g.confirme, p_note: g.note || null, p_motif: motif }),
      pays: (type, code, pays, motif) => rpc("admin_pays", { p_type: type, p_code: code, p_pays: pays, p_motif: motif }),
      sgi: (nom, actif, motif, pays) => rpc("admin_sgi", { p_nom: nom, p_actif: actif, p_motif: motif, ...(pays ? { p_pays: pays } : {}) }),
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
      ["compliance.manage", "Conformité", "Versions des CGU et des avertissements"], ["avis.moderate", "Communication", "Modérer les avis des utilisateurs"], ["abonnements.manage", "Utilisateurs", "Gérer les abonnements et les demandes de paiement"]].map(([code, module, libelle], i) => ({ code, module, libelle, ordre: i }));
    const M = { super_admin: perms.map((p) => p.code), admin: ["dashboard.read", "users.read", "users.read_pii", "users.read_portfolio", "users.suspend", "users.delete", "users.export", "roles.read", "market.read", "engine.params", "batch.read", "batch.run", "comms.manage"],
      analyste: ["dashboard.read", "market.read", "market.correct", "engine.params", "batch.read", "batch.run"], support: ["dashboard.read", "users.read", "users.read_portfolio", "users.export"],
      conformite: ["dashboard.read", "users.read", "users.read_pii", "users.read_portfolio", "users.export", "roles.read", "market.read", "batch.read", "audit.read", "compliance.manage"], observateur: ["dashboard.read"] };
    const attrib = [{ user_id: "f6", email: "admin@exemple.org", role: "super_admin", accorde_le: d(60), expire_le: null, accorde_par: null }];
    M.admin.push("avis.moderate", "abonnements.manage");
    const TARIFS_DEMO = [["essentiel_mois", "Essentiel · 1 mois", 1000, 1], ["essentiel_3mois", "Essentiel · 3 mois", 2700, 3], ["essentiel_an", "Essentiel · 1 an", 10000, 12],
      ["investisseur_mois", "Investisseur · 1 mois", 3000, 1], ["investisseur_an", "Investisseur · 1 an", 30000, 12],
      ["pack_questions", "Pack BafiBot · 50 questions", 500, 0], ["pack_pages", "Pack import · 20 pages", 500, 0]].map(([objet, libelle, prix, duree_mois]) => ({ objet, libelle, prix, duree_mois, actif: true }));
    const QUOTAS_DEMO = [{ formule: "decouverte", questions: 10, questions_debut: 20, approfondies: 0, pages: 2 },
      { formule: "essentiel", questions: 100, questions_debut: 0, approfondies: 0, pages: 15 }, { formule: "investisseur", questions: 300, questions_debut: 0, approfondies: 20, pages: 40 }];
    const AV = [
      ["a1", "Awa D.", "Dakar", 5, "Enfin une application qui m'aide à épargner chaque mois sans me perdre dans les chiffres. Le coffre m'a donné une vraie discipline.", "publie", true, 12],
      ["a2", "Koffi A.", "Abidjan", 5, "Les explications sont claires, même pour un débutant. Je comprends enfin ce que je possède chez ma SGI.", "publie", false, 20],
      ["a3", "Mariam S.", "Bamako", 4, "Très pratique pour suivre mon portefeuille le soir. J'aimerais des notifications sur le téléphone.", "publie", false, 34],
      ["a4", "Yao K.", "Lomé", 5, "Le robot répond vite et avec mes vrais chiffres, c'est bluffant.", "en_attente", false, 2],
      ["a5", "Fatou N.", "Thiès", 2, "Trop de choses sur l'écran au début, je me suis perdue.", "prive", false, 5],
      ["a6", "Ibrahima B.", null, 4, "J'ai gagné 25 % en trois mois grâce à l'outil !", "en_attente", false, 1],
    ].map(([id, nom, ville, note, commentaire, statut, mis_en_avant, j]) => ({ id, nom, ville, note, commentaire, statut, mis_en_avant, publication: statut !== "prive", modifie_le: d(j), motif_refus: null }));
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
      { cle: "titres_exclus", libelle: "Actions exclues des propositions", unite: "", type: "codes", defaut: [], aide: "Codes BRVM jamais proposés à l'achat (ex. données douteuses, opération sur titre en cours)." },
      { cle: "mode_recommandation", libelle: "Mode des portefeuilles", unite: "", type: "choix", defaut: "proposition",
        options: [{ valeur: "proposition", libelle: "Proposition : l'application propose un portefeuille" }, { valeur: "simulation", libelle: "Simulation : l'utilisateur fixe ses règles, l'outil calcule" }],
        aide: "Bascule de prudence réglementaire. En simulation, l'application et l'e-mail du soir présentent un calcul fait à partir des réglages de l'utilisateur, jamais une recommandation. Effet immédiat dans l'application, au prochain traitement pour l'e-mail." }]
      .map((p) => ({ ...p, valeur: null, modifie_le: null, modifie_par: null }));
    const univers = { sgi: [["Alpha Bourse", "CI"], ["Beta Securities", "SN"], ["Gamma Finance", "CI"], ["Omega Capital", null]].map(([nom, pays]) => ({ nom, pays, actif: true })),
      gestionnaires: [["ALPHA AM", ["Alpha Bourse"], 5], ["BETA GESTION", ["Beta Securities"], 4], ["DELTA ASSET", [], 3], ["GAMMA CAPITAL", ["Gamma Finance"], 4], ["OMEGA FINANCE", ["Omega Capital"], 4]]
        .map(([gestionnaire, distributeurs, fonds]) => ({ gestionnaire, distributeurs, fonds, sgo_directe: true, confirme: false,
          note: distributeurs.length ? "Lien de groupe supposé, à confirmer" : "Distributeurs à renseigner", modifie_le: null, modifie_par: null })),
      inconnus: ["SIGMA AM"], titres_pays: [],
      titres: [{ classe: "actions", code: "SNTS", nom: "SONATEL SENEGAL" }, { classe: "actions", code: "ORAC", nom: "ORANGE CI" },
        { classe: "obligations", code: "TPCI.O1", nom: "TPCI 6,10 % 2023-2030", emetteur: "TPCI", categorie: "etat" },
        { classe: "obligations", code: "BOAD.O3", nom: "BOAD 5,95 % 2021-2031", emetteur: "BOAD", categorie: "regional" },
        { classe: "obligations", code: "PAD.O1", nom: "PAD 6,60 % 2020-2027", emetteur: "PAD", categorie: "prive" }] };
    const traitements = [1, 2, 3, 4].map((j, i) => ({ id: 10 - i, debut: d(j - 0.2), fin: d(j - 0.21), statut: j === 3 ? "echec" : "succes", declencheur: "planifié",
      seance: j === 3 ? null : d(j).slice(0, 10), details: j === 3 ? { erreur: "Échec de la collecte ou de l'analyse", duree_s: 412 } : { propositions: 6, utilisateurs: 6, duree_s: 268 } }));
    const annonces = [];
    const docs = [];
    const o = {
      session: async () => ({ user: { id: "f6", email: "admin@exemple.org" } }), login: async () => {}, logout: async () => { location.href = location.pathname; },
      aal: async () => ({ currentLevel: "aal2", nextLevel: "aal2" }), factors: async () => ({ totp: [], all: [] }),
      moi: async () => ({ email: "admin@exemple.org", mfa: true, roles: [roles.find((r) => r.code === role).libelle], permissions: M[role] }),
      abonnements: async () => ({ repartition: { decouverte: 412, essentiel: 38, investisseur: 9 }, essais: 57,
        demandes: [{ id: 1, user_id: "a1", email: "awa.diop@exemple.sn", objet: "essentiel_an", montant: 10000, moyen: "wave", reference: "TX24101893", cree_le: new Date(Date.now() - 36e5).toISOString() },
                   { id: 2, email: "koffi.a@exemple.ci", objet: "pack_questions", moyen: "orange_money", reference: "OM5521", cree_le: new Date(Date.now() - 864e5).toISOString() }] }),
      traiterDemande: async () => {},
      tarifs: async () => ({ tarifs: TARIFS_DEMO, quotas: QUOTAS_DEMO }),
      formules: async (ids) => Object.fromEntries(ids.map((id, i) => [id, { formule: ["essentiel", "decouverte", "investisseur", "decouverte"][i % 4],
        fin: new Date(Date.now() + (20 - i) * 864e5).toISOString(), essai: i % 4 === 0 }])),
      abonnes: async () => [{ user_id: "a1", email: "awa.diop@exemple.sn", formule: "essentiel", effective: "essentiel", fin: new Date(Date.now() + 340 * 864e5).toISOString(), essai: false, source: "paiement" },
        { user_id: "a2", email: "koffi.a@exemple.ci", formule: "investisseur", effective: "investisseur", fin: new Date(Date.now() + 22 * 864e5).toISOString(), essai: false, source: "paiement" },
        { user_id: "a3", email: "mariam.s@exemple.ml", formule: "essentiel", effective: "essentiel", fin: new Date(Date.now() + 9 * 864e5).toISOString(), essai: true, source: "essai" }],
      abonnement: async (u) => ({ user_id: u, email: "awa.diop@exemple.sn", formule: "essentiel", souscrite: "essentiel", fin: new Date(Date.now() + 340 * 864e5).toISOString(),
        essai: false, source: "paiement", quotas: { questions: 100, approfondies: 0, pages: 15 }, usage: { questions: 37, approfondies: 0, pages: 4 },
        credits: { questions: 50, pages: 0, expire_le: new Date(Date.now() + 60 * 864e5).toISOString() }, parrain: "koffi.a@exemple.ci", filleuls: 2,
        demandes: [{ objet: "essentiel_an", montant: 10000, statut: "activee", moyen: "wave", reference: "TX24101893", cree_le: new Date(Date.now() - 2 * 864e5).toISOString(), traite_le: new Date(Date.now() - 864e5).toISOString() }] }),
      definirFormule: async () => {}, crediter: async () => {},
      modifierTarif: async (objet, prix, actif) => { const t = TARIFS_DEMO.find((x) => x.objet === objet); t.prix = prix; t.actif = actif; },
      modifierQuotas: async (f, q) => Object.assign(QUOTAS_DEMO.find((x) => x.formule === f), q),
      avis: async (st) => {
        need("avis.moderate");
        const rep = [1, 2, 3, 4, 5].map((n) => AV.filter((a) => a.note === n).length);
        return { stats: { nombre: AV.length, moyenne: +(AV.reduce((x, a) => x + a.note, 0) / AV.length).toFixed(2),
                          reco_reponses: 5, reco_promoteurs: 3, reco_passifs: 1, reco_detracteurs: 1, reco_indice: 40,
                          en_attente: AV.filter((a) => a.statut === "en_attente").length, publies: AV.filter((a) => a.statut === "publie").length, repartition: rep },
                 declencheurs: [
                   { declencheur: "trophee", proposees: 18, donnees: 9, plus_tard: 6, jamais: 1, note: 4.6 },
                   { declencheur: "transfert", proposees: 11, donnees: 5, plus_tard: 4, jamais: 0, note: 4.4 },
                   { declencheur: "fidelite", proposees: 9, donnees: 3, plus_tard: 5, jamais: 1, note: 4.0 },
                   { declencheur: "dividende", proposees: 4, donnees: 2, plus_tard: 2, jamais: 0, note: 4.5 },
                   { declencheur: "premiers_pas", proposees: 7, donnees: 2, plus_tard: 3, jamais: 2, note: 3.5 },
                   { declencheur: "achat", proposees: 3, donnees: 1, plus_tard: 1, jamais: 0, note: 5 }],
                 avis: AV.filter((a) => (st === "tous" ? a.statut !== "prive" : a.statut === st)) };
      },
      modererAvis: async (id, dec, motif) => {
        need("avis.moderate");
        const a = AV.find((x) => x.id === id);
        if (!a) throw new Error("Avis introuvable");
        if (dec === "refuser" && !motif) throw new Error("Motif obligatoire pour refuser un avis");
        if (dec === "publier") a.statut = "publie";
        if (dec === "refuser") { a.statut = "refuse"; a.mis_en_avant = false; a.motif_refus = motif; }
        if (dec === "depublier") { a.statut = "en_attente"; a.mis_en_avant = false; }
        if (dec === "mettre_en_avant") a.mis_en_avant = true;
        if (dec === "retirer_avant") a.mis_en_avant = false;
      },
      priseEnMain: async (j) => {
        const k = j / 30, x = (v) => Math.round(v * k);
        return { jours: j, cohorte: x(40), visite: { proposee: x(38), commencee: x(29), terminee: x(19), passee: x(8), plus_tard: x(9) },
          entonnoir: [29, 27, 24, 21, 19].map((n, i) => ({ etape: i + 1, n: x(n) })),
          premiers_pas: { depot: x(26), achat: x(15), alertes: x(18), robot: x(12), plan: x(14), liste: x(7) },
          activation_7j: x(22), achat_14j: x(13), delai_depot_h: 30, delai_achat_h: 120, relances: x(4), liste_masquee: x(5),
          guides: { depot: x(14), achat: x(11), alertes: x(16), robot: x(9), epargne: x(8) },
          astuces: { portefeuille: x(30), marche: x(26), performance: x(17) },
          semaines: [4, 3, 2, 1].map((w, i) => ({ semaine: d(w * 7).slice(0, 10), inscrits: 8 + i * 2, visite_terminee: 3 + i, activation_7j: 4 + i, achat_14j: 2 + i })) };
      },
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
      univers: async () => { need("engine.params"); return univers; },
      pays: async (type, code, pays, motif) => {
        need("engine.params");
        if (type === "gestionnaire") { const g = univers.gestionnaires.find((x) => x.gestionnaire === code); if (!g) throw new Error("Gestionnaire inconnu"); g.pays = pays; }
        else {
          univers.titres_pays = univers.titres_pays.filter((x) => x.code !== code.toUpperCase());
          if (pays) univers.titres_pays.push({ code: code.toUpperCase(), pays, modifie_le: new Date().toISOString(), modifie_par: "admin@exemple.org" });
        }
        log("engine.params", "pays : " + code, motif);
      },
      modifierGestionnaire: async (g, motif) => {
        need("engine.params");
        if (g.distributeurs.some((x) => !univers.sgi.some((y) => y.nom === x))) throw new Error("SGI inconnue : ajoutez-la d'abord à la liste");
        const i = univers.gestionnaires.findIndex((x) => x.gestionnaire === g.gestionnaire);
        const row = { ...(univers.gestionnaires[i] || { fonds: 1 }), ...g, modifie_le: new Date().toISOString(), modifie_par: "admin@exemple.org" };
        if (i < 0) univers.gestionnaires.push(row); else univers.gestionnaires[i] = row;
        univers.inconnus = univers.inconnus.filter((x) => x !== g.gestionnaire);
        log("engine.params", "univers : " + g.gestionnaire, motif);
      },
      sgi: async (nom, actif, motif, pays) => {
        need("engine.params");
        if (nom.trim().length < 2) throw new Error("Nom de SGI attendu (2 à 80 caractères)");
        const x = univers.sgi.find((y) => y.nom === nom.trim());
        if (x) Object.assign(x, { actif, pays: pays || x.pays });
        else univers.sgi.push({ nom: nom.trim(), actif, pays: pays || null }), univers.sgi.sort((a, b) => a.nom.localeCompare(b.nom));
        log("engine.params", "univers : SGI " + nom, motif);
      },
      modifierParametre: async (cle, val, motif) => {
        need("engine.params");
        const p = params.find((x) => x.cle === cle);
        if (val !== null && p.type === "choix" && !p.options.some((o) => o.valeur === val)) throw new Error("Choix inconnu");
        if (val !== null && !["codes", "choix"].includes(p.type) && (val < p.min || val > p.max)) throw new Error(`Valeur hors bornes (${p.min} à ${p.max})`);
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
  // Inactivité : la console donne accès aux comptes de tous les utilisateurs ; un poste laissé ouvert se déconnecte
  // après 30 minutes sans action, avec un avertissement une minute avant (et un bouton pour rester).
  const INACTIF_MS = 30 * 60e3, AVERTIR_MS = 60e3;
  let derniereAction = Date.now(), minuteurInactif = 0;
  function surveillerInactivite() {
    if (DEMO || minuteurInactif) return;
    const actif = () => { derniereAction = Date.now(); const b = $("#inactif"); if (b) b.remove(); };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => document.addEventListener(t, actif, { passive: true }));
    minuteurInactif = setInterval(() => {
      const ecoule = Date.now() - derniereAction;
      if (ecoule >= INACTIF_MS) { clearInterval(minuteurInactif); api.logoutInactif(); return; }
      if (ecoule >= INACTIF_MS - AVERTIR_MS && !$("#inactif")) {
        document.body.insertAdjacentHTML("beforeend", `<div id="inactif" class="inactif" role="alertdialog" aria-live="assertive" aria-labelledby="inactif-t">
          <p id="inactif-t"><b>Déconnexion dans une minute</b><br><span class="small">Sans action de votre part, la console se ferme pour protéger les données des utilisateurs.</span></p>
          <button type="button" class="btn primary" id="inactif-ok">Rester connecté</button></div>`);
        $("#inactif-ok").addEventListener("click", actif);
        $("#inactif-ok").focus();
      }
    }, 15e3);
  }

  // Séance attendue : la BRVM publie du lundi au vendredi ; la séance du jour est attendue après 23 h (heure de Dakar, UTC).
  // Le week-end, la dernière séance attendue est donc celle du vendredi : pas de fausse alerte le samedi et le dimanche.
  function seanceAttendue(now = new Date()) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (now.getUTCHours() < 23) d.setUTCDate(d.getUTCDate() - 1);
    while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  const LIB_PROFIL = { prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique" };
  // Compteurs des choses à faire (pour le tableau de bord et les pastilles du menu)
  async function aTraiter() {
    const r = { demandes: null, avis: null };
    if (S.can("abonnements.manage")) try { const a = await api.abonnements(); r.demandes = (a.demandes || []).length; r.repartition = a.repartition; } catch (e) { /* SQL non installé */ }
    if (S.can("avis.moderate")) try { const a = await api.avis("en_attente"); r.avis = a.stats?.en_attente ?? (a.avis || []).filter((x) => x.statut === "en_attente").length; } catch (e) { /* SQL non installé */ }
    return r;
  }
  function pastilles(r) {
    const mettre = (tab, n) => { const a = document.querySelector(`#nav [data-tab="${tab}"]`); if (!a) return;
      a.querySelector(".nav-n")?.remove(); if (n > 0) a.insertAdjacentHTML("beforeend", `<span class="nav-n" aria-label="${n} à traiter">${n}</span>`); };
    mettre("abonnements", r.demandes || 0); mettre("avis", r.avis || 0);
  }

  async function vTableau() {
    const v = $("#v-tableau");
    v.innerHTML = `<h1 id="h-tableau">Tableau de bord</h1><p class="muted">Chargement…</p>`;
    const [t, at] = await Promise.all([api.tableau(), aTraiter()]);
    pastilles(at);
    const actifs = t.utilisateurs - t.suspendus, attendue = seanceAttendue();
    const enRetard = !t.derniere_seance || t.derniere_seance < attendue;
    const manquantes = !enRetard && t.propositions_seance < actifs ? actifs - t.propositions_seance : 0;
    // ---- À traiter : uniquement ce qui demande une action, avec le bouton qui y mène
    const taches = [];
    if (enRetard) taches.push(["ko", "⚠", t.derniere_seance ? `Séance du ${D(attendue)} non publiée` : "Aucune séance publiée",
      `Dernière publication : séance du ${D(t.derniere_seance)}, ${DT(t.publie_le)}. Vérifiez le traitement du soir.`, "#traitements", "Voir les traitements"]);
    if (manquantes) taches.push(["att", "!", `${N(manquantes)} proposition${manquantes > 1 ? "s" : ""} non calculée${manquantes > 1 ? "s" : ""}`,
      `${N(t.propositions_seance)} propositions pour ${N(actifs)} comptes actifs sur la dernière séance.`, "#traitements", "Voir les traitements"]);
    if (at.demandes) taches.push(["att", "F", `${N(at.demandes)} demande${at.demandes > 1 ? "s" : ""} d'abonnement`,
      "Vérifiez le paiement reçu, puis activez.", "#abonnements", "Traiter"]);
    if (at.avis) taches.push(["att", "★", `${N(at.avis)} avis à modérer`, "Publiez ou refusez les avis en attente.", "#avis", "Modérer"]);
    const prof = Object.entries(t.profils || {}).map(([k, n]) => `${esc(LIB_PROFIL[k] || k)} ${N(n)}`).join(" · ") || "–";
    const rp = at.repartition || null, payants = rp ? (rp.essentiel || 0) + (rp.investisseur || 0) : null;
    const tile = (lbl, val, sub = "") => `<div class="tile"><div class="lbl">${lbl}</div><div class="val">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
    const seances = t.seances || [];
    const ligneSeance = (s) => `<tr><td>${D(s.date)}</td><td>${DT(s.publie_le)}</td><td class="num">${N(s.nb_actions)}</td>
      <td class="num">${N(s.nb_obligations)}</td><td class="num">${N(s.nb_opcvm)}</td><td class="num">${N(s.propositions)}</td>
      <td>${s.modele_valide ? `<span class="chip ok">validé</span>` : `<span class="chip neutre">non validé</span>`}</td></tr>`;
    v.innerHTML = `<h1 id="h-tableau">Tableau de bord</h1>
      <section class="bloc-actions" aria-labelledby="h-a-traiter"><h2 id="h-a-traiter">À traiter${taches.length ? ` <span class="h-n">${taches.length}</span>` : ""}</h2>
        ${taches.length ? `<ul class="taches">${taches.map(([niv, ic, titre, sous, lien, cta]) => `<li class="tache ${niv}"><span class="t-ic" aria-hidden="true">${ic}</span>
            <div class="t-txt"><b>${esc(titre)}</b><span>${esc(sous)}</span></div><a class="btn small${niv === "ko" ? " primary" : ""}" href="${lien}">${cta}</a></li>`).join("")}</ul>`
          : `<p class="rien">✓ Rien à traiter. ${t.derniere_seance ? `Séance du ${D(t.derniere_seance)} publiée ${DT(t.publie_le)} ; prochaine attendue ${new Date().getUTCDay() >= 5 || new Date().getUTCDay() === 0 ? "lundi soir" : "ce soir"}.` : ""}</p>`}
      </section>
      <section aria-labelledby="h-indic"><h2 id="h-indic" class="section-t">Indicateurs</h2>
        <div class="tiles tiles-4">
          ${tile("Utilisateurs", N(t.utilisateurs), `+${N(t.nouveaux_7j)} cette semaine${t.suspendus ? ` · ${N(t.suspendus)} suspendu${t.suspendus > 1 ? "s" : ""}` : ""}`)}
          ${tile("Actifs sur 7 jours", N(t.actifs_7j), `${N(t.actifs_30j)} sur 30 jours`)}
          ${tile("Avec un portefeuille", N(t.avec_portefeuille), `${N(t.operations)} opérations enregistrées`)}
          ${payants != null ? tile("Formules payantes ou essai", N(payants), `Essentiel ${N(rp.essentiel || 0)} · Investisseur ${N(rp.investisseur || 0)}`)
            : tile("E-mail du soir", N(t.email_soir), "abonnés actifs")}
        </div>
        <p class="small muted indic-plus">Budget déclaré : <b>${F(t.budget_total)}</b> (${prof}) · E-mail du soir : <b>${N(t.email_soir)}</b> abonnés.</p>
      </section>
      <div class="card"><h2>Séances publiées</h2><div class="scroll-x"><table class="dtable">
        <thead><tr><th>Séance</th><th>Publiée le</th><th class="num">Actions</th><th class="num">Obligations</th><th class="num">OPCVM</th><th class="num">Propositions</th><th>Modèle prédictif</th></tr></thead>
        <tbody>${seances.slice(0, 5).map(ligneSeance).join("") || `<tr><td colspan="7" class="muted">Aucune séance.</td></tr>`}</tbody></table></div>
        ${seances.length > 5 ? `<details class="plus"><summary>Voir les ${seances.length - 5} séances précédentes</summary><div class="scroll-x"><table class="dtable"><tbody>${seances.slice(5).map(ligneSeance).join("")}</tbody></table></div></details>` : ""}</div>
      <div class="card" id="pem" aria-labelledby="h-pem"><h2 id="h-pem">Prise en main des nouveaux utilisateurs</h2><p class="muted">Chargement…</p></div>`;
    afficherPriseEnMain(30);
  }

  // ---------------------------------------------------------------- abonnements (abonnements.sql)
  // En attendant l'agrégateur : l'utilisateur paie par Wave ou Orange Money et indique la référence ; on active après vérification.
  const OBJ_ABO = { essentiel_mois: "Essentiel · 1 mois · 1 000 F", essentiel_3mois: "Essentiel · 3 mois · 2 700 F", essentiel_an: "Essentiel · 1 an · 10 000 F",
    investisseur_mois: "Investisseur · 1 mois · 3 000 F", investisseur_an: "Investisseur · 1 an · 30 000 F",
    pack_questions: "Pack 50 questions · 500 F", pack_pages: "Pack 20 pages · 500 F" };
  const MOYEN = { wave: "Wave", orange_money: "Orange Money", autre: "Autre" };
  async function afficherAbonnements() {
    const c = $("#abo-adm");
    if (!c) return;
    const titre = `<h2 id="h-abo">Abonnements</h2>`;
    let r;
    try { r = await api.abonnements(); }
    catch (e) { c.innerHTML = `${titre}<p class="small muted">Abonnements indisponibles : exécutez le fichier abonnements.sql dans Supabase. (${esc(e.message)})</p>`; return; }
    const rp = r.repartition || {}, tot = (rp.decouverte || 0) + (rp.essentiel || 0) + (rp.investisseur || 0);
    const revenu = (rp.essentiel || 0) * 1000 + (rp.investisseur || 0) * 3000;
    c.innerHTML = `${titre}
      <div class="tiles">
        <div class="tile"><div class="lbl">Découverte</div><div class="val">${N(rp.decouverte || 0)}</div><div class="sub">gratuit</div></div>
        <div class="tile"><div class="lbl">Essentiel</div><div class="val">${N(rp.essentiel || 0)}</div><div class="sub">dont ${N(r.essais || 0)} en essai de 14 jours</div></div>
        <div class="tile"><div class="lbl">Investisseur</div><div class="val">${N(rp.investisseur || 0)}</div><div class="sub">${tot ? Math.round((100 * ((rp.essentiel || 0) + (rp.investisseur || 0))) / tot) : 0} % des comptes sur une formule payante ou en essai</div></div>
        <div class="tile"><div class="lbl">Revenu mensuel indicatif</div><div class="val">${N(revenu)} F</div><div class="sub">au tarif mensuel, essais compris</div></div>
      </div>
      <h3>Demandes à traiter (${(r.demandes || []).length})</h3>
      ${(r.demandes || []).length ? `<ul class="list">${r.demandes.map((d) => `<li><div class="main"><div class="name">${esc(OBJ_ABO[d.objet] || d.objet)}</div>
          <div class="sub">${d.montant != null ? `<b>${N(d.montant)} F</b> · ` : ""}${esc(d.email)} · ${esc(MOYEN[d.moyen] || "moyen non précisé")}${d.reference ? ` · référence <b>${esc(d.reference)}</b>` : ""} · ${DT(d.cree_le)}</div></div>
          <div class="right"><button class="btn small primary" data-abo-act="${d.id}">Paiement reçu : activer</button>
          <button class="btn small" data-abo-ref="${d.id}">Refuser</button>${d.user_id ? `<button class="btn small" data-gerer="${esc(d.user_id)}">Fiche</button>` : ""}</div></li>`).join("")}</ul>`
        : `<p class="small muted">Aucune demande en attente.</p>`}
      <p class="small muted">Vérifiez la réception du paiement (montant et référence) dans votre compte Wave ou Orange Money avant d'activer.
        L'activation prolonge la formule en cours et, au premier abonnement payant d'un filleul, offre un mois d'Essentiel à son parrain.</p>`;
    c.insertAdjacentHTML("beforeend", `<div id="abonnes-adm"></div><div id="tarifs-adm"><p class="muted small">Chargement des tarifs…</p></div>`);
    afficherAbonnes();
    afficherTarifs();
    c.querySelectorAll(".list [data-gerer]").forEach((b) => b.addEventListener("click", () => gererAbonnement(b.dataset.gerer)));
    c.querySelectorAll("[data-abo-act], [data-abo-ref]").forEach((b) => b.addEventListener("click", async () => {
      const activer = !!b.dataset.aboAct, id = +(b.dataset.aboAct || b.dataset.aboRef);
      if (!activer && !confirm("Refuser cette demande ? L'utilisateur pourra en faire une nouvelle.")) return;
      b.disabled = true;
      try { await api.traiterDemande(id, activer); toast(activer ? "Formule activée." : "Demande refusée."); afficherAbonnements(); aTraiter().then(pastilles); }
      catch (e) { toast("Impossible : " + e.message); b.disabled = false; }
    }));
  }

  const puceFormule = (f, essai) => `<span class="chip f-${esc(f)}">${esc(NOMS_F[f] || f)}${essai ? " · essai" : ""}</span>`;
  // Les abonnés (formules payantes, essais, fins récentes) avec un accès direct à leur fiche
  async function afficherAbonnes() {
    const z = $("#abonnes-adm");
    if (!z) return;
    let l;
    try { l = await api.abonnes(); } catch (e) { z.innerHTML = `<p class="small muted">Liste des abonnés indisponible : relancez abonnements.sql (section 6).</p>`; return; }
    const auj = Date.now();
    z.innerHTML = `<h3>Abonnés (${l.length})</h3>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Compte</th><th>Formule</th><th>Jusqu'au</th><th>Origine</th><th></th></tr></thead>
      <tbody>${l.map((a) => { const fini = a.fin && new Date(a.fin) < auj;
        return `<tr><td>${esc(a.email)}</td><td>${puceFormule(a.formule, a.essai)}${fini ? ` <span class="status ko">terminé</span>` : ""}</td>
          <td>${a.fin ? D(a.fin) : "–"}</td><td class="small">${esc({ essai: "Essai offert", paiement: "Paiement", console: "Console", parrainage: "Parrainage" }[a.source] || a.source || "")}</td>
          <td><button class="btn small" data-gerer="${esc(a.user_id)}">Gérer</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">Aucun abonné pour l'instant.</td></tr>`}</tbody></table></div>`;
    z.querySelectorAll("[data-gerer]").forEach((b) => b.addEventListener("click", () => gererAbonnement(b.dataset.gerer)));
  }
  // Fiche abonnement d'un utilisateur : formule, fin, consommation, crédits, parrainage, historique ; changer la formule ou offrir des crédits
  async function gererAbonnement(uid) {
    let a;
    try { a = await api.abonnement(uid); } catch (e) { return toast("Fiche indisponible : " + msgErr(e)); }
    const q = a.quotas || {}, u = a.usage || {}, cr = a.credits || {};
    const finDefaut = a.fin && new Date(a.fin) > Date.now() ? a.fin.slice(0, 10) : new Date(Date.now() + 31 * 864e5).toISOString().slice(0, 10);
    const r = await ask({ title: "Abonnement de " + a.email, ok: "Enregistrer les changements",
      body: `<div class="abo-fiche">
        <p>${puceFormule(a.formule, a.essai)} ${a.formule !== "decouverte" && a.fin ? `jusqu'au <b>${D(a.fin)}</b>` : "formule gratuite"}
          · origine : ${esc({ essai: "essai offert", paiement: "paiement", console: "console", parrainage: "parrainage" }[a.source] || "–")}</p>
        <table class="dtable"><tbody>
          <tr><th>Questions à BafiBot ce mois-ci</th><td class="num">${N(u.questions)} / ${N(q.questions)}</td></tr>
          ${q.approfondies ? `<tr><th>Questions approfondies</th><td class="num">${N(u.approfondies)} / ${N(q.approfondies)}</td></tr>` : ""}
          <tr><th>Pages importées ce mois-ci</th><td class="num">${N(u.pages)} / ${N(q.pages)}</td></tr>
          <tr><th>Crédits des packs</th><td class="num">${N(cr.questions)} questions · ${N(cr.pages)} pages${cr.expire_le ? ` (jusqu'au ${D(cr.expire_le)})` : ""}</td></tr>
          <tr><th>Parrainage</th><td>${a.parrain ? `parrainé par ${esc(a.parrain)} · ` : ""}${N(a.filleuls)} filleul${a.filleuls > 1 ? "s" : ""}</td></tr>
        </tbody></table>
        ${(a.demandes || []).length ? `<details><summary>Historique des demandes (${a.demandes.length})</summary><ul class="list">${a.demandes.map((d) => `<li><div class="main">
          <div class="name">${esc(OBJ_ABO[d.objet] || d.objet)}${d.montant != null ? ` · ${N(d.montant)} F` : ""}</div>
          <div class="sub">${esc({ en_attente: "en attente", activee: "activée", refusee: "refusée" }[d.statut] || d.statut)} · envoyée ${DT(d.cree_le)}${d.reference ? ` · réf. ${esc(d.reference)}` : ""}</div></div></li>`).join("")}</ul></details>` : ""}
        <h3>Changer la formule</h3>
        <div class="grid-role"><label>Formule<select name="formule">${["decouverte", "essentiel", "investisseur"].map((f) =>
          `<option value="${f}"${f === a.formule ? " selected" : ""}>${NOMS_F[f]}</option>`).join("")}</select></label>
          <label>Jusqu'au<input type="date" name="fin" value="${finDefaut}"></label></div>
        <h3>Offrir des crédits (valables 3 mois)</h3>
        <div class="grid-role"><label>Questions<input type="number" name="cq" min="0" max="2000" value="0"></label>
          <label>Pages<input type="number" name="cp" min="0" max="500" value="0"></label></div>
        <p class="small muted">Découverte remet le compte en formule gratuite. Chaque changement est tracé dans le journal d'audit avec le motif.</p></div>`,
      validate: ({ form }) => {
        if (form.formule.value !== "decouverte" && (!form.fin.value || new Date(form.fin.value) <= new Date())) return "Indiquez une date de fin future.";
        if (+form.cq.value < 0 || +form.cp.value < 0) return "Les crédits ne peuvent pas être négatifs.";
        return null;
      } });
    if (!r) return;
    const f = r.form, formule = f.formule.value, fin = f.fin.value ? f.fin.value + "T23:59:59Z" : null;
    const change = formule !== a.formule || (formule !== "decouverte" && f.fin.value !== (a.fin || "").slice(0, 10));
    try {
      if (change) await api.definirFormule(uid, formule, formule === "decouverte" ? null : fin, r.motif);
      if (+f.cq.value > 0 || +f.cp.value > 0) await api.crediter(uid, +f.cq.value, +f.cp.value, r.motif);
      toast(change || +f.cq.value || +f.cp.value ? "Abonnement mis à jour." : "Aucun changement.");
      afficherAbonnes();
      if (location.hash === "#utilisateurs") vUtilisateurs();
    } catch (e) { toast("Action refusée : " + msgErr(e)); }
  }

  // Tarifs et quotas : modifiés ici, ils s'affichent aussitôt sur la vitrine et dans l'application
  const NOMS_F = { decouverte: "Découverte", essentiel: "Essentiel", investisseur: "Investisseur" };
  async function afficherTarifs() {
    const z = $("#tarifs-adm");
    if (!z) return;
    let r;
    try { r = await api.tarifs(); }
    catch (e) { z.innerHTML = `<p class="small muted">Tarifs non modifiables : relancez le fichier abonnements.sql (section 5). (${esc(e.message)})</p>`; return; }
    const champ = (attrs) => `<input type="number" min="0" step="1" inputmode="numeric" ${attrs} style="width:7.5em">`;
    z.innerHTML = `<h3>Tarifs</h3>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Offre</th><th>Durée ou contenu</th><th class="num">Prix (F CFA TTC)</th><th>Proposée</th><th></th></tr></thead>
      <tbody>${(r.tarifs || []).map((t) => `<tr data-objet="${esc(t.objet)}"><td>${esc(t.libelle)}</td>
        <td class="small">${t.duree_mois ? `${t.duree_mois} mois` : "pack, valable 3 mois"}</td>
        <td class="num">${champ(`data-k="prix" value="${t.prix}" aria-label="Prix ${esc(t.libelle)}"`)}</td>
        <td><label class="small" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-k="actif" style="width:18px;height:18px"${t.actif ? " checked" : ""}> oui</label></td>
        <td><button class="btn small" data-tarif-ok>Enregistrer</button></td></tr>`).join("")}</tbody></table></div>
      <h3>Quotas mensuels par formule</h3>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Formule</th><th class="num">Questions à BafiBot</th><th class="num">1re semaine</th>
        <th class="num">Dont approfondies</th><th class="num">Pages importées</th><th></th></tr></thead>
      <tbody>${(r.quotas || []).map((q) => `<tr data-formule="${esc(q.formule)}"><td>${esc(NOMS_F[q.formule] || q.formule)}</td>
        <td class="num">${champ(`data-k="questions" value="${q.questions}" aria-label="Questions ${esc(q.formule)}"`)}</td>
        <td class="num">${champ(`data-k="questions_debut" value="${q.questions_debut}" aria-label="Questions la première semaine ${esc(q.formule)}"`)}</td>
        <td class="num">${champ(`data-k="approfondies" value="${q.approfondies}" aria-label="Questions approfondies ${esc(q.formule)}"`)}</td>
        <td class="num">${champ(`data-k="pages" value="${q.pages}" aria-label="Pages ${esc(q.formule)}"`)}</td>
        <td><button class="btn small" data-quota-ok>Enregistrer</button></td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">Les changements s'affichent aussitôt sur la vitrine et dans l'application, et sont tracés dans le journal d'audit.
        Une demande déjà envoyée garde le prix affiché au moment de l'envoi. « 1re semaine » ne s'applique qu'à Découverte (0 : désactivé).
        Une offre décochée n'est plus proposée. Chaque question rapide coûte environ 1 à 2 F, une approfondie environ 25 F, une page importée 10 à 20 F.</p>`;
    z.querySelectorAll("[data-tarif-ok]").forEach((b) => b.addEventListener("click", async () => {
      const tr = b.closest("tr"), prix = +tr.querySelector('[data-k="prix"]').value, actif = tr.querySelector('[data-k="actif"]').checked;
      if (!Number.isInteger(prix) || prix < 0) return toast("Prix invalide.");
      b.disabled = true;
      try { await api.modifierTarif(tr.dataset.objet, prix, actif); toast("Tarif enregistré."); } catch (e) { toast("Impossible : " + e.message); }
      b.disabled = false;
    }));
    z.querySelectorAll("[data-quota-ok]").forEach((b) => b.addEventListener("click", async () => {
      const tr = b.closest("tr"), q = {};
      for (const k of ["questions", "questions_debut", "approfondies", "pages"]) q[k] = +tr.querySelector(`[data-k="${k}"]`).value;
      if (Object.values(q).some((v) => !Number.isInteger(v) || v < 0)) return toast("Valeur invalide.");
      b.disabled = true;
      try { await api.modifierQuotas(tr.dataset.formule, q); toast("Quotas enregistrés."); } catch (e) { toast("Impossible : " + e.message); }
      b.disabled = false;
    }));
  }

  // ---------------------------------------------------------------- modération des avis (avis.sql)
  // Les 10 meilleurs avis publiés (notés 4 ou 5) défilent sur la vitrine ; « mettre en avant » leur donne un léger bonus.
  const ET = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const DECL_AV = { trophee: "Trophée d'épargne gagné", transfert: "Épargne envoyée à la SGI", dividende: "Dividende enregistré",
                    achat: "Premier achat suivi d'une proposition", fidelite: "Fidélité (5 jours de visite sur 14)", premiers_pas: "Premiers pas terminés depuis 7 jours" };
  const STATUT_AV = { en_attente: "En attente", publie: "Publié", refuse: "Refusé", prive: "Privé" };
  async function afficherAvis(st) {
    const c = $("#avis-adm");
    if (!c) return;
    const titre = `<h2 id="h-avis">Avis des utilisateurs</h2>`;
    let r;
    try { r = await api.avis(st); }
    catch (e) { c.innerHTML = `${titre}<p class="small muted">Avis indisponibles : exécutez le fichier avis.sql dans Supabase. (${esc(e.message)})</p>`; return; }
    const s = r.stats || {}, rep = s.repartition || [0, 0, 0, 0, 0], max = Math.max(1, ...rep);
    const onglets = [["en_attente", "En attente"], ["publie", "Publiés"], ["refuse", "Refusés"], ["prive", "Privés"], ["tous", "Tous"]]
      .map(([k, l]) => `<button type="button" class="btn small${k === st ? " primary" : ""}" data-avst="${k}" aria-pressed="${k === st}">${l}</button>`).join(" ");
    const ligne = (a) => `<li><div class="main">
        <div class="name"><span aria-label="${a.note} sur 5" style="color:hsl(35 92% 45%)">${ET(a.note)}</span> ${esc(a.nom || "Sans nom")}${a.ville ? ` · ${esc(a.ville)}` : ""}
          ${a.mis_en_avant ? `<span class="status ok">mis en avant</span>` : ""} <span class="status ${a.statut === "publie" ? "ok" : a.statut === "refuse" ? "ko" : "att"}">${STATUT_AV[a.statut] || a.statut}</span></div>
        <div class="sub">${a.commentaire ? "« " + esc(a.commentaire) + " »" : "<i>Sans commentaire</i>"}${a.recommandation != null ? ` · recommandation ${a.recommandation}/10` : ""}</div>
        <div class="sub muted">${D(a.modifie_le)}${a.motif_refus ? ` · motif du refus : ${esc(a.motif_refus)}` : ""}</div></div>
      <div class="right">${a.statut === "en_attente" ? `<button type="button" class="btn small primary" data-avd="publier" data-id="${esc(a.id)}">Publier</button>
          <button type="button" class="btn small" data-avd="refuser" data-id="${esc(a.id)}">Refuser</button>` : ""}
        ${a.statut === "publie" ? `<button type="button" class="btn small" data-avd="${a.mis_en_avant ? "retirer_avant" : "mettre_en_avant"}" data-id="${esc(a.id)}">${a.mis_en_avant ? "Retirer de la une" : "Mettre en avant"}</button>
          <button type="button" class="btn small" data-avd="depublier" data-id="${esc(a.id)}">Dépublier</button>` : ""}
        ${a.statut === "refuse" && a.publication ? `<button type="button" class="btn small" data-avd="publier" data-id="${esc(a.id)}">Publier</button>` : ""}</div></li>`;
    c.innerHTML = `${titre}
      <div class="tiles">
        <div class="tile"><div class="lbl">Note moyenne</div><div class="val">${s.moyenne ? String(s.moyenne).replace(".", ",") : "–"} / 5</div><div class="sub">${N(s.nombre)} avis, publiés ou non</div></div>
        <div class="tile"><div class="lbl">À relire</div><div class="val">${N(s.en_attente)}</div><div class="sub">avis en attente de publication</div></div>
        <div class="tile"><div class="lbl">Publiés</div><div class="val">${N(s.publies)}</div><div class="sub">les 10 meilleurs (4 et 5 étoiles) défilent sur la vitrine</div></div>
        <div class="tile"><div class="lbl">Indice de recommandation</div><div class="val">${s.reco_reponses ? (s.reco_indice > 0 ? "+" : "") + N(s.reco_indice) : "–"}</div>
          <div class="sub">${s.reco_reponses ? `${N(s.reco_promoteurs)} promoteurs (9-10), ${N(s.reco_passifs)} passifs (7-8), ${N(s.reco_detracteurs)} détracteurs (0-6) sur ${N(s.reco_reponses)} réponses` : "pas encore de réponse"}</div></div>
      </div>
      <p class="small muted">Indice de recommandation : part des promoteurs moins part des détracteurs, de −100 à +100. Au-dessus de 0, plus de fans que de déçus ; au-dessus de +30, très bon.</p>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Note</th><th class="num">Avis</th><th>Répartition</th></tr></thead><tbody>
        ${[5, 4, 3, 2, 1].map((n) => `<tr><td>${ET(n)}</td><td class="num">${N(rep[n - 1])}</td>
          <td><span style="display:inline-block;height:8px;border-radius:4px;background:hsl(35 92% 52%);width:${Math.round((rep[n - 1] / max) * 160)}px"></span></td></tr>`).join("")}</tbody></table></div>
      ${(r.declencheurs || []).length ? `<h3>Quand la notation est proposée</h3>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Moment</th><th class="num">Proposée</th><th class="num">Avis donnés</th>
        <th class="num">Taux</th><th class="num">Note moyenne</th><th class="num">« Plus tard »</th><th class="num">« Ne plus demander »</th></tr></thead><tbody>
        ${r.declencheurs.map((x) => `<tr><td>${esc(DECL_AV[x.declencheur] || x.declencheur)}</td><td class="num">${N(x.proposees)}</td><td class="num">${N(x.donnees)}</td>
          <td class="num">${x.proposees ? Math.round((x.donnees / x.proposees) * 100) + " %" : "–"}</td><td class="num">${x.note ? String(x.note).replace(".", ",") : "–"}</td>
          <td class="num">${N(x.plus_tard)}</td><td class="num">${N(x.jamais)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">La fenêtre s'ouvre seule après un moment de réussite, au plus une fois par mois et trois fois par an par utilisateur. Un taux faible ou beaucoup de « Ne plus demander » : ce moment est à revoir.</p>` : ""}
      <p class="small muted">À ne pas publier : montants ou promesses de gain, recommandation d'un titre, informations personnelles, propos injurieux. Un avis refusé demande un motif, noté au journal d'audit.</p>
      <div class="actions" role="group" aria-label="Filtrer les avis">${onglets}</div>
      <ul class="list">${(r.avis || []).map(ligne).join("") || `<li class="muted">Aucun avis dans cette catégorie.</li>`}</ul>`;
    c.querySelectorAll("[data-avst]").forEach((b) => b.addEventListener("click", () => afficherAvis(b.dataset.avst)));
    c.querySelectorAll("[data-avd]").forEach((b) => b.addEventListener("click", async () => {
      const dec = b.dataset.avd, refus = dec === "refuser";
      const v = await ask({ title: { publier: "Publier cet avis sur la vitrine ?", refuser: "Refuser cet avis", depublier: "Retirer cet avis de la vitrine ?",
        mettre_en_avant: "Mettre cet avis en avant ?", retirer_avant: "Retirer la mise en avant ?" }[dec],
        body: refus ? "<p>Le motif est noté au journal d'audit et reste visible dans la console.</p>" : "", motif: refus, ok: refus ? "Refuser" : "Confirmer", danger: refus });
      if (!v) return;
      try { await api.modererAvis(b.dataset.id, dec, v.motif); toast("Avis mis à jour."); afficherAvis(st); }
      catch (e) { toast("Action impossible : " + e.message); }
    }));
  }

  // ---------------------------------------------------------------- suivi de qualité de la prise en main (tutoriel.sql)
  // Cohorte : comptes ayant terminé leur inscription sur la période. Objectifs indicatifs, à ajuster avec l'expérience.
  const OBJ_PEM = [
    { cle: "demarrage", lbl: "Visite commencée", obj: 0.7, aide: "parmi les visites proposées" },
    { cle: "completion", lbl: "Visite terminée", obj: 0.6, aide: "parmi les visites commencées" },
    { cle: "activation", lbl: "Activation sous 7 jours", obj: 0.5, aide: "au moins une opération notée" },
    { cle: "achat", lbl: "Premier achat sous 14 jours", obj: 0.35, aide: "parmi les nouveaux comptes" },
    { cle: "liste", lbl: "Premiers pas tous faits", obj: 0.3, aide: "parmi les nouveaux comptes" },
    { cle: "masquee", lbl: "Liste masquée", obj: 0.2, inverse: true, aide: "signal de gêne : plus bas, c'est mieux" },
  ];
  const ETAPES_PEM = ["Aujourd'hui", "Noter vos opérations", "Le marché", "Votre coffre", "Votre assistant"];
  const PAS_PEM = { depot: "Noter l'argent versé à la SGI", achat: "Premier achat", alertes: "Découvrir les alertes",
                    robot: "Question au robot", plan: "Rythme d'épargne", liste: "Tous les premiers pas" };
  const duree = (h) => (h === null || h === undefined ? "–" : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`);
  async function afficherPriseEnMain(j) {
    const c = $("#pem");
    if (!c) return;
    const titre = `<h2 id="h-pem">Prise en main des nouveaux utilisateurs</h2>`;
    let t;
    try { t = await api.priseEnMain(j); }
    catch (e) { c.innerHTML = `${titre}<p class="small muted">Indicateurs indisponibles : exécutez le fichier tutoriel.sql dans Supabase. (${esc(e.message)})</p>`; return; }
    if (!c.isConnected) return;
    const n = +t.cohorte || 0, v = t.visite || {}, pp = t.premiers_pas || {};
    const taux = { demarrage: [v.commencee, v.proposee], completion: [v.terminee, v.commencee], activation: [t.activation_7j, n],
                   achat: [t.achat_14j, n], liste: [pp.liste, n], masquee: [t.liste_masquee, n] };
    const tuile = (o) => {
      const [a, b] = taux[o.cle], r = b ? a / b : null;
      const etat = r === null ? ["att", "pas encore de données"]
        : (o.inverse ? r <= o.obj : r >= o.obj) ? ["ok", "objectif atteint"]
        : (o.inverse ? r <= o.obj * 1.5 : r >= o.obj * 0.75) ? ["att", "proche de l'objectif"] : ["ko", "sous l'objectif"];
      return `<div class="tile"><div class="lbl">${esc(o.lbl)}</div><div class="val">${P(r, 0)}</div>
        <div class="sub">${N(a)} sur ${N(b)} · ${esc(o.aide)}</div>
        <div class="sub"><span class="status ${etat[0]}">${esc(etat[1])}</span> · objectif ${o.inverse ? "≤" : "≥"} ${P(o.obj, 0)}</div></div>`;
    };
    const periode = [7, 30, 90].map((x) => `<button type="button" class="btn small${x === j ? " primary" : ""}" data-pem="${x}" aria-pressed="${x === j}">${x} jours</button>`).join(" ");
    const ent = t.entonnoir || [], dep = +v.commencee || 0;
    c.innerHTML = `${titre}
      <p class="small muted">Comptes ayant terminé leur inscription sur les ${N(t.jours)} derniers jours : <b>${N(n)}</b>.
        ${n && n < 10 ? "Échantillon encore faible : interpréter avec prudence." : ""}</p>
      <div class="actions" role="group" aria-label="Période">${periode}</div>
      <div class="tiles">${OBJ_PEM.map(tuile).join("")}</div>
      <h3>Visite guidée : où les utilisateurs s'arrêtent</h3>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Étape</th><th class="num">Utilisateurs</th><th class="num">Part des visites commencées</th><th class="num">Perte depuis l'étape précédente</th></tr></thead>
        <tbody>${ent.map((e, i) => `<tr><td>${e.etape}. ${esc(ETAPES_PEM[i] || "")}</td><td class="num">${N(e.n)}</td><td class="num">${P(dep ? e.n / dep : null, 0)}</td>
          <td class="num">${i ? P(ent[i - 1].n ? (ent[i - 1].n - e.n) / ent[i - 1].n : null, 0) : "–"}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">Proposées ${N(v.proposee)} · commencées ${N(v.commencee)} · terminées ${N(v.terminee)} · passées en cours ${N(v.passee)} · « plus tard » ${N(v.plus_tard)} · relancées depuis le Profil ${N(t.relances)}</p>
      <h3>Premiers pas</h3>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Premier pas</th><th class="num">Faits</th><th class="num">Part des nouveaux comptes</th><th class="num">Guide ouvert</th></tr></thead>
        <tbody>${Object.entries(PAS_PEM).map(([k, lbl]) => `<tr><td>${esc(lbl)}</td><td class="num">${N(pp[k])}</td><td class="num">${P(n ? pp[k] / n : null, 0)}</td>
          <td class="num">${k === "liste" ? "–" : N((t.guides || {})[k === "plan" ? "epargne" : k] || 0)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">Délai médian entre l'inscription et le premier versement noté : <b>${duree(t.delai_depot_h)}</b> ; et le premier achat : <b>${duree(t.delai_achat_h)}</b>.
        Astuces vues : ${Object.entries(t.astuces || {}).map(([k, x]) => `${esc(k)} ${N(x)}`).join(" · ") || "–"}.</p>
      <h3>Évolution par semaine d'inscription</h3>
      <div class="scroll-x"><table class="dtable"><thead><tr><th>Semaine du</th><th class="num">Inscrits</th><th class="num">Visite terminée</th><th class="num">Activation 7 j</th><th class="num">Achat 14 j</th></tr></thead>
        <tbody>${(t.semaines || []).map((w) => `<tr><td>${D(w.semaine)}</td><td class="num">${N(w.inscrits)}</td><td class="num">${P(w.inscrits ? w.visite_terminee / w.inscrits : null, 0)}</td>
          <td class="num">${P(w.inscrits ? w.activation_7j / w.inscrits : null, 0)}</td><td class="num">${P(w.inscrits ? w.achat_14j / w.inscrits : null, 0)}</td></tr>`).join("")
          || `<tr><td colspan="5" class="muted">Aucune inscription sur la période.</td></tr>`}</tbody></table></div>
      <p class="small muted">Lecture : une forte perte à une étape de la visite signale un texte à revoir ; un guide souvent ouvert mais rarement suivi d'effet signale une action trop difficile.
        Aucune donnée individuelle n'est affichée.</p>`;
    c.querySelectorAll("[data-pem]").forEach((b) => b.addEventListener("click", () => afficherPriseEnMain(+b.dataset.pem)));
  }

  async function vUtilisateurs(reload = true) {
    const v = $("#v-utilisateurs");
    if (reload) { v.innerHTML = `<h1 id="h-utilisateurs">Utilisateurs</h1><p class="muted">Chargement…</p>`; S.users = await api.utilisateurs(S.q);
      S.formules = {};
      if (S.can("abonnements.manage") && S.users.length) try { S.formules = await api.formules(S.users.map((u) => u.id)) || {}; } catch (e) { S.formules = {}; } }
    const c = S.can, fo = (id) => S.formules?.[id];
    v.innerHTML = `<h1 id="h-utilisateurs">Utilisateurs</h1>
      <form class="toolbar" id="f-q" role="search"><input type="search" name="q" placeholder="Rechercher par adresse e-mail" value="${esc(S.q)}" aria-label="Rechercher par adresse e-mail">
        <button class="btn" type="submit">Rechercher</button></form>
      <p class="small muted">${S.users.length} compte${S.users.length > 1 ? "s" : ""}${c("users.read_pii") ? "" : " · adresses masquées (permission « voir l'e-mail complet » requise)"}</p>
      <div class="card scroll-x"><table class="dtable">
        <thead><tr><th>Compte</th><th>Inscrit</th><th>Dernière connexion</th>${c("abonnements.manage") ? "<th>Formule</th>" : ""}<th>Profil</th><th class="num">Budget</th><th class="num">Opérations</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${S.users.map((u) => `<tr>
          <td>${esc(u.email)}${u.a_un_role ? ` <span class="chip">admin</span>` : ""}</td><td>${D(u.inscrit_le)}</td><td>${ago(u.derniere_connexion)}</td>
          ${c("abonnements.manage") ? `<td>${fo(u.id) ? `${puceFormule(fo(u.id).formule, fo(u.id).essai)}${fo(u.id).formule !== "decouverte" && fo(u.id).fin ? `<div class="small muted">jusqu'au ${D(fo(u.id).fin)}</div>` : ""}` : "–"}</td>` : ""}
          <td>${esc(u.profil || "–")}</td><td class="num">${F(u.budget)}</td><td class="num">${N(u.operations)}</td>
          <td>${u.suspendu ? `<span class="status ko">Suspendu</span>` : `<span class="status ok">Actif</span>`}${u.cgu_version ? `<div class="small muted">CGU v${esc(u.cgu_version)}</div>` : ""}</td>
          <td><div class="row-actions">
            ${c("abonnements.manage") ? `<button class="btn small" data-act="abonnement" data-id="${esc(u.id)}">Abonnement</button>` : ""}
            ${c("users.read_portfolio") ? `<button class="btn small" data-act="voir" data-id="${esc(u.id)}">Portefeuille</button>` : ""}
            ${c("users.export") ? `<button class="btn small" data-act="export" data-id="${esc(u.id)}">Exporter</button>` : ""}
            ${c("users.suspend") ? `<button class="btn small" data-act="${u.suspendu ? "reactiver" : "suspendre"}" data-id="${esc(u.id)}">${u.suspendu ? "Réactiver" : "Suspendre"}</button>` : ""}
            ${c("users.delete") ? `<button class="btn small danger" data-act="supprimer" data-id="${esc(u.id)}">Supprimer</button>` : ""}
          </div></td></tr>`).join("") || `<tr><td colspan="9" class="muted">Aucun compte.</td></tr>`}</tbody></table></div>`;
    $("#f-q", v).addEventListener("submit", (ev) => { ev.preventDefault(); S.q = ev.target.q.value.trim(); vUtilisateurs(); });
    v.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => userAction(b.dataset.act, S.users.find((u) => u.id === b.dataset.id))));
  }

  async function userAction(act, u) {
    try {
      if (act === "abonnement") return gererAbonnement(u.id);
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
    const aff = (p, val) => (val == null ? "–" : p.type === "taux" ? P(val) : p.type === "codes" ? (val.length ? val.join(", ") : "aucune")
      : p.type === "choix" ? (p.options.find((o) => o.valeur === val)?.libelle || val) : F(val));
    const brut = (p, val) => (val == null ? "" : p.type === "taux" ? +(val * 100).toFixed(2) : p.type === "codes" ? val.join(", ") : val);
    v.innerHTML = `<h1 id="h-moteur">Paramètres du moteur</h1>
      <p class="small muted">Appliqués au prochain traitement du soir, pour les portefeuilles cibles et les propositions de l'application (le mode des portefeuilles s'applique aussi tout de suite dans l'application). Chaque modification est consignée.</p>
      ${ps.map((p) => `<form class="card" data-cle="${esc(p.cle)}" novalidate><h2>${esc(p.libelle)}</h2><p class="small muted">${esc(p.aide)}</p>
        <p class="small">Valeur actuelle : <b>${esc(aff(p, p.valeur ?? p.defaut))}</b> ${p.valeur == null ? `<span class="chip">par défaut</span>`
          : `<span class="chip warn">modifiée</span> <span class="muted">le ${DT(p.modifie_le)} par ${esc(p.modifie_par || "–")} · défaut ${esc(aff(p, p.defaut))}</span>`}</p>
        ${p.type === "choix" ? `<label>Nouvelle valeur<select name="val">${p.options.map((o) => `<option value="${esc(o.valeur)}"${o.valeur === (p.valeur ?? p.defaut) ? " selected" : ""}>${esc(o.libelle)}</option>`).join("")}</select></label>`
        : `<label>Nouvelle valeur${p.type === "taux" ? " (en %)" : p.type === "codes" ? " (codes séparés par des virgules)" : " (F)"}
          <input name="val" value="${esc(brut(p, p.valeur ?? p.defaut))}" ${p.type === "codes" ? 'autocapitalize="characters"' : 'inputmode="decimal"'} autocomplete="off"></label>`}
        ${!["codes", "choix"].includes(p.type) ? `<p class="small muted">Entre ${esc(aff(p, p.min))} et ${esc(aff(p, p.max))}.</p>` : ""}
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
        if (p.type === "choix") {
          val = f.val.value;
        } else if (p.type === "codes") {
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

  // ------------------------------------------------------------ univers accessible : où souscrire les FCP (engine.params)
  const PAYS_UEMOA = { CI: "Côte d'Ivoire", SN: "Sénégal", ML: "Mali", BF: "Burkina Faso", NE: "Niger", TG: "Togo", BJ: "Bénin", GW: "Guinée-Bissau" };
  const drapeau = (iso) => (iso ? String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "");
  const choixPays = (cur, titre = "Pays du siège", vide = "Non renseigné", regional = false) => `<label>${titre}<select name="pays"><option value="">${vide}</option>
    ${regional ? `<option value="UEMOA"${cur === "UEMOA" ? " selected" : ""}>UEMOA (émetteur régional)</option>` : ""}${Object.entries(PAYS_UEMOA)
    .map(([k, t]) => `<option value="${k}"${k === cur ? " selected" : ""}>${drapeau(k)} ${esc(t)}</option>`).join("")}</select></label>`;
  const libPays = (c) => (c === "UEMOA" ? "UEMOA" : c ? `${drapeau(c)} ${PAYS_UEMOA[c] || c}` : "–");
  // Pays des titres : ceux que l'application ne sait pas déduire, et les corrections déjà faites
  function carteTitres(u) {
    const P = window.BRVM_PAYS;
    if (!P || !u.titres) return "";
    const corr = new Map((u.titres_pays || []).map((x) => [x.code, x.pays]));
    const manquants = u.titres.filter((t) => !corr.has(t.code) && !P.de(t.classe, t, corr, null));
    return `<div class="card"><h2>Pays des titres</h2>
      <p class="small muted">L'application déduit le drapeau du code des actions, de l'émetteur des obligations (UEMOA pour les émetteurs régionaux)
        et du pays de la société de gestion pour les FCP. Corrigez ici ce qu'elle ne trouve pas ou trouve mal.</p>
      ${manquants.length ? `<p class="small"><b>${N(manquants.length)} titre(s) sans pays :</b></p><div class="chips">${manquants.map((t) =>
        `<button class="chip warn" type="button" data-titre="${esc(t.code)}" title="${esc(t.nom || "")}">${esc(t.code)}</button>`).join(" ")}</div>`
        : `<p class="small">Tous les titres du jour ont un pays.</p>`}
      ${corr.size ? `<p class="small" style="margin-top:12px"><b>Corrections (${N(corr.size)}) :</b></p><div class="chips">${[...corr].map(([c, p]) =>
        `<button class="chip" type="button" data-titre="${esc(c)}">${esc(c)} · ${esc(libPays(p))}</button>`).join(" ")}</div>` : ""}
      <form id="f-titre" class="grid2" novalidate style="margin-top:12px"><label>Corriger un titre (code BRVM)<input name="code" maxlength="20" autocomplete="off" autocapitalize="characters" placeholder="ex. SNTS"></label>
        <div class="actions" style="align-self:end"><button class="btn" type="submit">Choisir le pays…</button></div></form></div>`;
  }

  async function vUnivers() {
    const v = $("#v-univers");
    v.innerHTML = `<h1 id="h-univers">Univers accessible</h1><p class="muted">Chargement…</p>`;
    const u = await api.univers();
    const actives = u.sgi.filter((x) => x.actif);
    const chip = (g) => g.confirme ? `<span class="chip">confirmé</span>` : `<span class="chip warn">à confirmer</span>`;
    v.innerHTML = `<h1 id="h-univers">Univers accessible</h1>
      <p class="small muted">Où souscrire les FCP de chaque société de gestion. Les utilisateurs déclarent leurs SGI dans leur profil :
        le portefeuille ne retient alors que les FCP qu'ils peuvent souscrire. Effet au prochain traitement du soir ; chaque modification est consignée.</p>
      ${u.inconnus.length ? `<div class="notice">Nouveaux gestionnaires dans les données du jour, à renseigner :
        ${u.inconnus.map((n) => `<button class="btn link" type="button" data-nouveau="${esc(n)}">${esc(n)}</button>`).join(" · ")}</div>` : ""}
      <div class="card"><h2>Gestionnaires d'OPCVM (${u.gestionnaires.length})</h2>
        <p class="small muted">${u.gestionnaires.filter((g) => g.confirme).length} confirmé(s) sur ${u.gestionnaires.length}. Les liens préremplis sont des liens de groupe probables : vérifiez-les auprès des sociétés de gestion.</p>
        <ul class="list">${u.gestionnaires.map((g, i) => `<li><div class="main"><div class="name">${esc(g.gestionnaire)} ${chip(g)}</div>
          <div class="sub">${g.pays ? drapeau(g.pays) + " · " : ""}${N(g.fonds)} fonds · ${g.distributeurs.length ? "via " + esc(g.distributeurs.join(", ")) : "aucune SGI renseignée"}${g.sgo_directe ? " · souscription directe possible" : ""}${g.note ? " · " + esc(g.note) : ""}</div></div>
          <div class="right"><button class="btn small" type="button" data-g="${i}">Modifier…</button></div></li>`).join("")}</ul></div>
      ${carteTitres(u)}
      <div class="card"><h2>SGI proposées dans les profils (${actives.length})</h2>
        <p class="small muted">Le drapeau aide les utilisateurs à trouver les SGI de leur pays. Touchez une SGI pour indiquer son pays ou la retirer des profils.</p>
        <div class="chips">${u.sgi.map((x) => `<button class="chip drapeau${x.actif ? "" : " sell"}" type="button" data-sgi="${esc(x.nom)}">${x.pays ? drapeau(x.pays) + " " : "❔ "}${esc(x.nom)}${x.actif ? "" : " (retirée)"}</button>`).join(" ")}</div>
        <form id="f-sgi" class="grid2" novalidate style="margin-top:12px"><label>Ajouter une SGI<input name="nom" maxlength="80" autocomplete="off" placeholder="Nom de la SGI"></label>
          ${choixPays("")}<div class="actions" style="align-self:end"><button class="btn primary" type="submit">Ajouter…</button></div></form></div>`;
    const editerTitre = async (code, cur, nom) => {
      const r = await ask({ title: "Pays de " + code + (nom ? " · " + nom : ""), ok: "Enregistrer",
        body: choixPays(cur || "", "Pays (drapeau dans l'application)", "Automatique (déduit du code ou de l'émetteur)", true) });
      if (!r) return;
      try { await api.pays("titre", code, r.form.pays.value || null, r.motif); toast("Pays enregistré."); vUnivers(); }
      catch (e) { toast("Action refusée : " + msgErr(e)); }
    };
    v.querySelectorAll("[data-titre]").forEach((b) => b.addEventListener("click", () => {
      const t = (u.titres || []).find((x) => x.code === b.dataset.titre);
      editerTitre(b.dataset.titre, (u.titres_pays || []).find((x) => x.code === b.dataset.titre)?.pays, t?.nom);
    }));
    $("#f-titre", v)?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const code = ev.currentTarget.code.value.trim().toUpperCase();
      if (!code) { toast("Indiquez le code du titre."); return; }
      editerTitre(code, (u.titres_pays || []).find((x) => x.code === code)?.pays);
    });
    const editer = async (g) => {
      const r = await ask({ title: "Où souscrire : " + g.gestionnaire, ok: "Enregistrer",
        body: `<fieldset class="fs"><legend>SGI qui distribuent ses fonds</legend>${actives.map((x) => `<label class="switch"><input type="checkbox" name="d" value="${esc(x.nom)}"${g.distributeurs.includes(x.nom) ? " checked" : ""}> ${esc(x.nom)}</label>`).join("")}</fieldset>
          <label class="switch"><input type="checkbox" name="sgo"${g.sgo_directe !== false ? " checked" : ""}> Souscription directe auprès de la société de gestion</label>
          <label class="switch"><input type="checkbox" name="conf"${g.confirme ? " checked" : ""}> Informations vérifiées</label>
          ${"pays" in g || DEMO ? choixPays(g.pays || "", "Pays de la société de gestion (drapeau des FCP)") : ""}
          <label>Note (facultatif)<input name="note" maxlength="200" value="${esc(g.note || "")}"></label>` });
      if (!r) return;
      const f = r.form;
      try {
        await api.modifierGestionnaire({ gestionnaire: g.gestionnaire, distributeurs: [...f.querySelectorAll('[name="d"]:checked')].map((x) => x.value),
          sgo_directe: f.sgo.checked, confirme: f.conf.checked, note: f.note.value.trim() }, r.motif);
        if (f.pays && (f.pays.value || null) !== (g.pays || null)) await api.pays("gestionnaire", g.gestionnaire, f.pays.value || null, r.motif);
        toast("Gestionnaire enregistré."); vUnivers();
      } catch (e) { toast("Action refusée : " + msgErr(e)); }
    };
    v.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => editer(u.gestionnaires[+b.dataset.g])));
    v.querySelectorAll("[data-nouveau]").forEach((b) => b.addEventListener("click", () =>
      editer({ gestionnaire: b.dataset.nouveau, distributeurs: [], sgo_directe: true, confirme: false, note: "" })));
    v.querySelectorAll("[data-sgi]").forEach((b) => b.addEventListener("click", async () => {
      const x = u.sgi.find((y) => y.nom === b.dataset.sgi);
      const r = await ask({ title: x.nom, ok: "Enregistrer",
        body: `${choixPays(x.pays || "")}<label class="switch"><input type="checkbox" name="actif"${x.actif ? " checked" : ""}> Proposée dans les profils</label>
          <p class="small muted">Retirée, elle n'est plus proposée ; les utilisateurs qui l'ont déjà choisie la gardent.</p>` });
      if (!r) return;
      try { await api.sgi(x.nom, r.form.actif.checked, r.motif, r.form.pays.value || null); toast("SGI mise à jour."); vUnivers(); }
      catch (e) { toast("Action refusée : " + msgErr(e)); }
    }));
    $("#f-sgi", v).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nom = ev.currentTarget.nom.value.trim(), pays = ev.currentTarget.pays.value;
      if (nom.length < 2) { toast("Indiquez le nom de la SGI."); return; }
      const r = await ask({ title: "Ajouter une SGI", ok: "Ajouter", body: `<p>${pays ? drapeau(pays) + " " : ""}<b>${esc(nom)}</b> sera proposée dans les profils.</p>` });
      if (!r) return;
      try { await api.sgi(nom, true, r.motif, pays || null); toast("SGI ajoutée."); vUnivers(); } catch (e) { toast("Action refusée : " + msgErr(e)); }
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
  async function vAbonnements() {
    $("#v-abonnements").innerHTML = `<h1 id="h-abonnements">Abonnements</h1>
      <p class="muted page-intro">Activez les demandes après vérification du paiement, gérez les abonnés, ajustez les tarifs et les quotas.</p>
      <div class="card" id="abo-adm" aria-labelledby="h-abo"><h2 id="h-abo">Demandes et abonnés</h2><p class="muted">Chargement…</p></div>`;
    await afficherAbonnements();
  }
  async function vAvis() {
    $("#v-avis").innerHTML = `<h1 id="h-avis-p">Avis des utilisateurs</h1>
      <p class="muted page-intro">Publiez ou refusez les avis en attente ; les meilleurs défilent sur la vitrine.</p>
      <div class="card" id="avis-adm" aria-labelledby="h-avis"><h2 id="h-avis">Avis</h2><p class="muted">Chargement…</p></div>`;
    await afficherAvis("en_attente");
  }
  const VIEWS = { tableau: vTableau, utilisateurs: vUtilisateurs, abonnements: vAbonnements, avis: vAvis, donnees: vDonnees, traitements: vTraitements, moteur: vMoteur, univers: vUnivers,
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
  const gate = (html) => { $("#gate").hidden = false;
    $("#gate").innerHTML = (QS.has("inactif") ? `<p class="notice small" role="status">Vous avez été déconnecté après 30 minutes d'inactivité, pour protéger les données des utilisateurs. Reconnectez-vous pour continuer.</p>` : "") + html; };

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
    document.querySelectorAll("#nav .nav-groupe").forEach((g) => { let n = g.nextElementSibling, vis = false;
      while (n && !n.classList.contains("nav-groupe")) { if (!n.hidden) vis = true; n = n.nextElementSibling; } g.hidden = !vis; });
    aTraiter().then(pastilles).catch(() => {});
    surveillerInactivite();
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
