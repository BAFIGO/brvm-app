/* BafiBourse – cercles d'épargne entre proches, inspirés de la tontine.
 * Des proches se fixent un objectif commun de jours d'épargne par mois et voient la régularité de chacun :
 * série en cours, jours d'épargne du mois. Jamais aucun montant, et l'argent reste chez chacun.
 * Carte dans Portefeuille (sous « Mon épargne »), invitation par lien ou par code. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pl = (n, u) => `${n} ${u === "mois" ? "mois" : u + (n > 1 ? "s" : "")}`;
  const CLE = "brvm-cercle-invite";
  let app = null, cercles = null, charge = false, invitationVue = false;

  // Lien d'invitation : on garde le code le temps de la connexion ou de l'inscription
  try {
    const code = new URLSearchParams(location.search).get("cercle");
    if (code) {
      localStorage.setItem(CLE, code.toUpperCase().slice(0, 12));
      const u = new URL(location.href); u.searchParams.delete("cercle"); history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
  } catch (e) { /* stockage indisponible */ }

  // ---------------------------------------------------------------- fenêtre (créer, rejoindre, inviter)
  document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-cercle" aria-labelledby="cer-t"><form method="dialog" novalidate>
      <h2 id="cer-t"></h2><div class="cer-corps"></div><p class="msg err" role="status" aria-live="polite"></p>
      <div class="actions"><button type="button" class="btn" data-cer="fermer">Fermer</button><button type="submit" class="btn primary cer-ok"></button></div>
    </form></dialog>`);
  const dlg = $("#dlg-cercle"), f = $("form", dlg);
  let mode = null, cible = null;
  function ouvrir(m, opts = {}) {
    mode = m; cible = opts;
    $(".msg", dlg).textContent = "";
    const ok = $(".cer-ok", dlg);
    ok.hidden = false;
    if (m === "creer") {
      $("#cer-t", dlg).textContent = "Créer un cercle d'épargne";
      $(".cer-corps", dlg).innerHTML = `<p class="small">Invitez vos proches à épargner avec vous : chacun chez soi, chacun à son rythme, avec un objectif commun.</p>
        <label for="cer-nom">Nom du cercle</label><input id="cer-nom" name="nom" maxlength="40" placeholder="Les amis de la fac, La famille…" required>
        <label for="cer-obj">Objectif par personne et par mois</label>
        <select id="cer-obj" name="objectif">${[8, 10, 15, 20].map((n) => `<option value="${n}"${n === 15 ? " selected" : ""}>${n} jours d'épargne</option>`).join("")}</select>
        <p class="small muted">Les membres voient la série et les jours d'épargne de chacun. Jamais aucun montant.</p>`;
      ok.textContent = "Créer le cercle";
    } else if (m === "rejoindre") {
      $("#cer-t", dlg).textContent = "Rejoindre un cercle";
      $(".cer-corps", dlg).innerHTML = `<label for="cer-code">Code d'invitation</label>
        <input id="cer-code" name="code" maxlength="12" autocapitalize="characters" autocomplete="off" placeholder="Ex. A1B2C3D4" required value="${esc(opts.code || "")}">
        <p class="small muted">Le code vous a été envoyé par la personne qui vous invite.</p>`;
      ok.textContent = "Rejoindre";
    } else if (m === "invitation") {
      const a = opts.apercu;
      $("#cer-t", dlg).textContent = "Invitation à un cercle d'épargne";
      $(".cer-corps", dlg).innerHTML = `<p>Vous êtes invité à rejoindre <b>« ${esc(a.nom)} »</b> : ${a.membres} membre${a.membres > 1 ? "s" : ""},
        objectif de <b>${a.objectif_jours} jours d'épargne</b> par personne et par mois.</p>
        <p class="small muted">Les membres verront votre série et vos jours d'épargne du mois. Jamais vos montants : votre argent reste chez vous.</p>`;
      ok.textContent = "Rejoindre le cercle";
    } else if (m === "inviter") {
      const c = opts.cercle, lien = lienInvitation(c.code);
      $("#cer-t", dlg).textContent = `Inviter dans « ${c.nom} »`;
      $(".cer-corps", dlg).innerHTML = `<p>Envoyez ce lien à vos proches, ou donnez-leur le code :</p>
        <p class="cer-code" aria-label="Code d'invitation">${esc(c.code)}</p>
        <div class="cer-partage"><button type="button" class="btn primary" data-cer="partager">Partager l'invitation</button>
          <a class="btn" href="https://wa.me/?text=${encodeURIComponent(texteInvitation(c))}" target="_blank" rel="noopener">WhatsApp</a>
          <button type="button" class="btn" data-cer="copier">Copier le lien</button></div>
        <p class="small muted">${esc(lien)}</p>`;
      ok.hidden = true;
    }
    dlg.showModal();
    dlg.querySelector("input, select, .btn.primary")?.focus();
  }
  const lienInvitation = (code) => `${location.origin}${location.pathname}?cercle=${encodeURIComponent(code)}`;
  const texteInvitation = (c) => `Rejoins mon cercle d'épargne « ${c.nom} » sur BafiBourse : on vise ${c.objectif_jours} jours d'épargne chacun ce mois-ci, `
    + `chacun chez soi, sans jamais montrer de montant. Code : ${c.code} · ${lienInvitation(c.code)}`;

  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $(".msg", dlg), ok = $(".cer-ok", dlg);
    ok.disabled = true;
    try {
      if (mode === "creer") {
        const nom = f.nom.value.trim();
        if (nom.length < 2) throw new Error("Donnez un nom au cercle.");
        const c = await app.creerCercle(nom, +f.objectif.value);
        await recharger();
        const complet = (cercles || []).find((x) => x.id === c.id) || { ...c, objectif_jours: +f.objectif.value };
        ouvrir("inviter", { cercle: complet });
        app.toast("Cercle créé : invitez vos proches !");
      } else if (mode === "rejoindre" || mode === "invitation") {
        const code = mode === "rejoindre" ? f.code.value.trim() : cible.code;
        if (!code) throw new Error("Saisissez le code d'invitation.");
        const r = await app.rejoindreCercle(code);
        try { localStorage.removeItem(CLE); } catch (e) { /* rien */ }
        dlg.close();
        await recharger(); await publier();
        app.toast(r.deja ? `Vous faites déjà partie de « ${r.nom} ».` : `Bienvenue dans « ${r.nom} » !`, { detail: "Votre régularité compte maintenant pour tout le cercle." });
      }
    } catch (e) { msg.textContent = e.message; }
    ok.disabled = false;
  });
  dlg.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-cer]");
    if (!b) return;
    if (b.dataset.cer === "fermer") {
      if (mode === "invitation") try { localStorage.removeItem(CLE); } catch (e) { /* rien */ }
      return dlg.close();
    }
    const c = cible?.cercle;
    if (b.dataset.cer === "partager" && c) {
      try { if (navigator.share) return await navigator.share({ text: texteInvitation(c) }); } catch (e) { if (e.name === "AbortError") return; }
      b.dataset.cer = "copier";
    }
    if (b.dataset.cer === "copier" && c) {
      try { await navigator.clipboard.writeText(lienInvitation(c.code)); app.toast("Lien copié."); } catch (e) { app.toast("Copie impossible : sélectionnez le lien à la main."); }
    }
  });

  // ---------------------------------------------------------------- la carte dans Portefeuille
  function carteHtml() {
    if (!cercles?.length) return `<div class="card cer-carte" aria-labelledby="h-cer"><h2 id="h-cer">Épargner à plusieurs</h2>
      <p>Créez un <b>cercle d'épargne</b> avec vos proches : un objectif commun de jours d'épargne par mois, et chacun voit la régularité des autres.</p>
      <p class="small muted">Comme une tontine, mais sans argent qui circule : chacun épargne chez soi, et aucun montant n'est jamais partagé.</p>
      <div class="actions"><button type="button" class="btn primary" data-cercle="creer">Créer un cercle</button>
        <button type="button" class="btn" data-cercle="rejoindre">J'ai un code</button></div></div>`;
    return `<div class="card cer-carte" aria-labelledby="h-cer"><h2 id="h-cer">Mes cercles d'épargne</h2>
      ${cercles.map((c) => {
        const ms = c.membres || [], obj = c.objectif_jours, fait = ms.reduce((a, m) => a + Math.min(m.jours_mois || 0, obj), 0), but = obj * Math.max(1, ms.length);
        const pc = Math.round((fait / but) * 100);
        return `<section class="cer" aria-label="Cercle ${esc(c.nom)}">
          <div class="cer-tete"><h3>${esc(c.nom)}</h3><span class="small muted">${ms.length} membre${ms.length > 1 ? "s" : ""}</span></div>
          <p class="small">Ensemble : <b>${fait} jours d'épargne sur ${but}</b> ce mois-ci (${obj} par personne)</p>
          <div class="cer-barre" role="progressbar" aria-label="Objectif commun du mois" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}"><i style="width:${Math.min(100, pc)}%"></i></div>
          <ol class="cer-membres">${ms.map((m) => {
            const j = m.jours_mois || 0;
            return `<li class="${m.moi ? "moi" : ""}"><span class="cer-nom">${m.moi ? "Vous" : esc(m.pseudo)}</span>
              <span class="cer-serie">${m.serie > 0 ? `🔥 ${pl(m.serie, m.unite)}` : `<span class="muted">pas de série</span>`}</span>
              <span class="cer-jours"><b>${j}</b>/${obj} j${j >= obj ? " ✓" : ""}</span>
              <span class="cer-mini" aria-hidden="true"><i style="width:${Math.min(100, (j / obj) * 100)}%"></i></span></li>`;
          }).join("")}</ol>
          <div class="cer-act"><button type="button" class="btn small" data-cercle="inviter" data-id="${esc(c.id)}">Inviter</button>
            <button type="button" class="btn link small" data-cercle="quitter" data-id="${esc(c.id)}">Quitter ce cercle</button></div></section>`;
      }).join("")}
      <p class="small muted">Seules la série et les jours d'épargne sont visibles des membres, jamais vos montants.</p>
      <div class="actions"><button type="button" class="btn small" data-cercle="creer">Créer un autre cercle</button>
        <button type="button" class="btn small" data-cercle="rejoindre">J'ai un code</button></div></div>`;
  }
  function carte() {
    const v = $("#v-portefeuille");
    if (!v || v.hidden || !charge) return;
    $(".cer-carte", v)?.remove();
    const ep = $(".trophees", v)?.closest(".card");
    if (ep) ep.insertAdjacentHTML("afterend", carteHtml()); else v.insertAdjacentHTML("beforeend", carteHtml());
  }

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-cercle]");
    if (!b || !app) return;
    const a = b.dataset.cercle, c = (cercles || []).find((x) => x.id === b.dataset.id);
    if (a === "creer") return ouvrir("creer");
    if (a === "rejoindre") return ouvrir("rejoindre");
    if (a === "inviter" && c) return ouvrir("inviter", { cercle: c });
    if (a === "quitter" && c) {
      if (!confirm(`Quitter le cercle « ${c.nom} » ? Vous pourrez le rejoindre à nouveau avec son code.`)) return;
      try { await app.quitterCercle(c.id); await recharger(); app.toast("Vous avez quitté le cercle."); } catch (e) { app.toast("Impossible : " + e.message); }
    }
  });

  // ---------------------------------------------------------------- données
  async function recharger() {
    try { cercles = await app.cercles(); charge = true; } catch (e) { charge = false; return; }   // cercles.sql pas encore installé
    if (app.tab() === "portefeuille") carte();
  }
  // Publie sa propre régularité (série, jours du mois), seulement si l'on fait partie d'au moins un cercle
  async function publier() {
    if (!cercles?.length) return;
    const r = app.regularite();
    if (r) try { await app.publierRegularite(r); } catch (e) { /* réessai à la prochaine ouverture */ }
  }
  async function proposerInvitation() {
    const ob = $("#v-onboarding");
    if (invitationVue || !charge || document.querySelector("dialog[open]") || ($("#tuto") && !$("#tuto").hidden) || (ob && !ob.hidden)) return;
    let code = null;
    try { code = localStorage.getItem(CLE); } catch (e) { /* rien */ }
    if (!code) return;
    invitationVue = true;
    try {
      const a = await app.apercuCercle(code);
      if (!a) { localStorage.removeItem(CLE); return app.toast("Ce lien d'invitation n'est plus valable."); }
      if (a.deja) { localStorage.removeItem(CLE); return; }
      ouvrir("invitation", { apercu: a, code });
    } catch (e) { invitationVue = false; }
  }

  window.addEventListener("brvm:maj", () => setTimeout(() => {
    if (!app) return;
    if (app.tab() === "portefeuille") carte();
    proposerInvitation();
  }, 90));
  window.addEventListener("brvm:coffre", () => setTimeout(async () => { await publier(); await recharger(); }, 400));
  window.addEventListener("brvm:pret", async () => {
    app = window.BRVM_APP?.cercles ? window.BRVM_APP : null;
    if (!app) return;
    await recharger();
    await publier();
    setTimeout(proposerInvitation, 1500);
  });
})();
