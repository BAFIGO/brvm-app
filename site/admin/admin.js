/* Console d'administration BRVM Portefeuille.
 * Aucune décision de sécurité n'est prise ici : chaque action appelle une fonction admin_* de Supabase,
 * qui vérifie la permission et la double authentification (supabase/admin.sql). L'interface ne fait
 * qu'afficher ou masquer selon les permissions renvoyées par admin_moi().
 * Mode démo : ?demo=1 (données fictives, rien n'est enregistré). */
(() => {
  "use strict";
  const CFG = window.BRVM_CONFIG;
  const DEMO = new URLSearchParams(location.search).has("demo");
  const TABS = ["tableau", "utilisateurs", "habilitations", "audit"];
  const NEED = { tableau: "dashboard.read", utilisateurs: "users.read", habilitations: "roles.read", audit: "audit.read" };
  const ACTIONS = {
    "users.read_portfolio": "Consultation d'un portefeuille", "users.suspend": "Suspension d'un compte",
    "users.reactivate": "Réactivation d'un compte", "users.delete": "Suppression d'un compte",
    "users.export": "Export des données d'un client", "roles.assign": "Attribution d'un rôle", "roles.revoke": "Retrait d'un rôle",
  };

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
  const msgErr = (e) => String(e?.message || e || "Erreur inconnue").replace(/^.*?:\s(?=Accès|Double|Indiquez|Vous|Impossible|La confirmation|Aucun)/, "");
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
    return {
      session: async () => ({ user: { id: "f6", email: "admin@exemple.org" } }), login: async () => {}, logout: async () => { location.href = location.pathname; },
      aal: async () => ({ currentLevel: "aal2", nextLevel: "aal2" }), factors: async () => ({ totp: [], all: [] }),
      moi: async () => ({ email: "admin@exemple.org", mfa: true, roles: ["Super-administrateur"], permissions: perms.map((p) => p.code) }),
      tableau: async () => ({ utilisateurs: users.length, nouveaux_7j: 2, actifs_7j: 4, actifs_30j: 6, avec_portefeuille: 4, operations: 55, email_soir: 5,
        suspendus: users.filter((u) => u.suspendu).length, profils: { equilibre: 3, dynamique: 2, prudent: 1 }, budget_total: 17000000,
        derniere_seance: d(1).slice(0, 10), publie_le: d(0.6), propositions_seance: 6,
        seances: [1, 2, 3, 4, 5].map((j) => ({ date: d(j).slice(0, 10), publie_le: d(j - 0.4), modele_valide: false, nb_actions: 48, nb_obligations: 200, nb_opcvm: 125, propositions: 6 })) }),
      utilisateurs: async (q) => users.filter((u) => !q || u.email.includes(q)),
      portefeuille: async (u, motif) => { log("users.read_portfolio", u, motif); return { proposition: { valeur: 2661821, tresorerie: 1877765, positions: [] }, operations: [] }; },
      suspendre: async (u, s, motif) => { find(u).suspendu = s; log(s ? "users.suspend" : "users.reactivate", u, motif); },
      supprimer: async (u, conf, motif) => { const x = find(u); if (conf.toLowerCase() !== x.email) throw new Error("La confirmation ne correspond pas à l'adresse du compte"); users.splice(users.indexOf(x), 1); log("users.delete", u, motif); },
      exporter: async (u, motif) => { log("users.export", u, motif); return { compte: find(u), operations: [], exporte_le: new Date().toISOString() }; },
      habilitations: async () => ({ roles, permissions: perms, matrice: Object.entries(M).flatMap(([r, ps]) => ps.map((p) => [r, p])), attributions: attrib }),
      attribuer: async (email, role, exp, motif) => { attrib.push({ user_id: "x" + attrib.length, email, role, accorde_le: new Date().toISOString(), expire_le: exp, accorde_par: "admin@exemple.org" }); log("roles.assign", email, motif, { role }); },
      retirer: async (u, role, motif) => { attrib.splice(attrib.findIndex((a) => a.user_id === u && a.role === role), 1); log("roles.revoke", u, motif, { role }); },
      audit: async () => audit,
    };
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
          <td>${u.suspendu ? `<span class="status ko">Suspendu</span>` : `<span class="status ok">Actif</span>`}</td>
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
  const VIEWS = { tableau: vTableau, utilisateurs: vUtilisateurs, habilitations: vHabilitations, audit: vAudit };

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
      gate(`<div class="card narrow"><h1>Accès réservé</h1><p>Votre compte n'a aucun rôle d'administration.</p><p><a href="../">Retour à l'application</a></p></div>`);
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

  async function init() {
    if (DEMO) document.title = "Démo – " + document.title;
    $("#logout").addEventListener("click", () => api.logout());
    try {
      const s = await api.session();
      if (s?.user) await enter(); else loginScreen();
    } catch (e) { gate(`<div class="notice bad">Impossible de joindre le service : ${esc(msgErr(e))}</div>`); }
  }
  init();
})();
