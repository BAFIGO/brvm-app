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
        <label for="cer-obj">Objectif commun du mois : tenir son propre rythme d'épargne…</label>
        <select id="cer-obj" name="objectif">${[[50, "La moitié du temps (50 %)"], [75, "3 fois sur 4 (75 %)"], [80, "4 fois sur 5 (80 %)"], [100, "Sans faute (100 %)"]].map(([n, t]) => `<option value="${n}"${n === 80 ? " selected" : ""}>${t}</option>`).join("")}</select>
        <p class="small muted">Chacun garde son rythme (par jour, par semaine ou par mois) : un épargnant mensuel et un épargnant quotidien
          comptent autant dans l'objectif commun.</p>
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
        objectif : chacun tient son rythme d'épargne <b>${objectifTexte(a)}</b> ce mois-ci.</p>
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
  const texteInvitation = (c) => `Rejoins mon cercle d'épargne « ${c.nom} » sur BafiBourse : chacun à son rythme, on vise de le tenir ${objectifTexte(c)} ce mois-ci, `
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
        const complet = (cercles || []).find((x) => x.id === c.id) || { ...c, objectif_pct: +f.objectif.value };
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
        // Régularité du mois : périodes tenues sur périodes attendues, chacun selon son rythme (jour, semaine ou mois)
        const ms = c.membres || [], obj = objectifPct(c);
        const tenues = ms.reduce((a, m) => a + (m.tenues || 0), 0), attendues = ms.reduce((a, m) => a + (m.attendues || 0), 0);
        const pc = attendues ? Math.round((100 * tenues) / attendues) : 0, fait = pc, but = obj;
        return `<section class="cer" aria-label="Cercle ${esc(c.nom)}">
          <div class="cer-tete"><h3>${esc(c.nom)}</h3><span class="small muted">${ms.length} membre${ms.length > 1 ? "s" : ""}</span></div>
          ${scene(c, ms, fait, but, pc)}
          <p class="small">Ensemble : <b>${pc} % de régularité</b> ce mois-ci, pour un objectif de ${obj} %${pc >= obj && attendues ? " : objectif atteint ✓" : ""}</p>
          <div class="cer-barre" role="progressbar" aria-label="Régularité commune du mois" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}" style="--obj:${obj}%">
            <i style="width:${Math.min(100, pc)}%"></i><b class="cer-cible" aria-hidden="true"></b></div>
          <ol class="cer-membres">${ms.map((m) => {
            const t = m.tenues || 0, at = m.attendues || 0, mp = at ? Math.round((100 * t) / at) : 0;
            return `<li class="${m.moi ? "moi" : ""}"><span class="cer-nom">${m.moi ? "Vous" : esc(m.pseudo)}</span>
              <span class="cer-serie">${m.serie > 0 ? `🔥 ${pl(m.serie, m.unite)}` : `<span class="muted">pas de série</span>`}</span>
              <span class="cer-jours">${at ? `<b>${t}</b>/${pl(at, m.unite)}${mp >= obj ? " ✓" : ""}` : `<span class="muted">pas encore de rythme</span>`}</span>
              <span class="cer-mini" aria-hidden="true"><i style="width:${Math.min(100, mp)}%"></i></span></li>`;
          }).join("")}</ol>
          <div class="cer-act"><button type="button" class="btn small" data-cercle="inviter" data-id="${esc(c.id)}">Inviter</button>
            <button type="button" class="btn link small" data-cercle="quitter" data-id="${esc(c.id)}">Quitter ce cercle</button></div></section>`;
      }).join("")}
      <p class="small muted">Seules la série et la régularité sont visibles des membres, jamais vos montants.</p>
      ${app.acces && !app.acces(1) ? `<div class="verrou"><span class="vr-ic" aria-hidden="true">🔒</span><span>Plusieurs cercles : disponible avec la formule <b>Essentiel</b>.</span>
        <button type="button" class="btn link small" data-formules>Voir les formules</button></div>`
      : `<div class="actions"><button type="button" class="btn small" data-cercle="creer">Créer un autre cercle</button>
        <button type="button" class="btn small" data-cercle="rejoindre">J'ai un code</button></div>`}</div>`;
  }
  // Objectif en % de régularité (cercles créés avant : un nombre de jours, ramené à 80 %)
  const objectifPct = (c) => (c.objectif_pct >= 50 ? c.objectif_pct : 80);
  const objectifTexte = (c) => ({ 50: "la moitié du temps", 75: "3 fois sur 4", 80: "4 fois sur 5", 100: "sans faute" })[objectifPct(c)] || `${objectifPct(c)} % du temps`;

  // Les membres en orbite autour de l'objectif commun : l'anneau se remplit, les bulles arrivent puis flottent ;
  // un membre dont la régularité a été mise à jour aujourd'hui porte un halo « actif aujourd'hui »
  const TEINTES = [330, 190, 150, 25, 270, 200, 230];
  function scene(c, ms, fait, but, pc) {
    const vus = ms.slice(0, 6), R = 39, C = 2 * Math.PI * 88, auj = new Date().toISOString().slice(0, 10);
    return `<div class="cer-scene" aria-hidden="true" style="--pc:${Math.min(100, pc)}">
      <div class="cs-centre"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="cs-fond"/>
        <circle cx="100" cy="100" r="88" class="cs-jauge" style="stroke-dasharray:${C.toFixed(0)};--off:${(C * (1 - Math.min(100, pc) / 100)).toFixed(0)};--c:${C.toFixed(0)}"/></svg>
        <div class="cs-info"><b>${pc} %</b><span>objectif ${but} %</span>${ms.length > 6 ? `<small>+${ms.length - 6} membres</small>` : ""}</div></div>
      ${vus.map((m, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / vus.length, x = 50 + R * Math.cos(a), y = 50 + R * Math.sin(a) * 0.92;
        const ini = m.moi ? "Vous" : String(m.pseudo || "?").split(/\s+/).map((t) => t[0]).join("").slice(0, 2).toUpperCase();
        const actif = m.maj_le && String(m.maj_le).slice(0, 10) === auj;
        return `<div class="cs-m${m.moi ? " moi" : ""}${actif ? " actif" : ""}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--d:${(i * 0.12).toFixed(2)}s;--f:${(1 + (i % 3) * 0.7).toFixed(1)}s">
          <span class="cs-av" style="--h:${TEINTES[i % TEINTES.length]}">${esc(ini)}</span>
          <span class="cs-serie">${m.serie > 0 ? `🔥 ${m.serie}` : "–"}</span></div>`;
      }).join("")}</div>`;
  }
  function animerScenes(v) {
    const scs = v.querySelectorAll(".cer-scene:not(.vue)");
    if (!scs.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { scs.forEach((x) => x.classList.add("vue", "joue")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("joue"); io.unobserve(e.target); } }), { threshold: 0.35 });
    scs.forEach((x) => { x.classList.add("vue"); io.observe(x); });
  }

  function carte() {
    const v = $("#v-portefeuille");
    if (!v || v.hidden || !charge) return;
    $(".cer-carte", v)?.remove();
    const ancre = $(".pf-ancre-cercles", v);            // seulement dans l'onglet « Mon épargne »
    if (ancre) { ancre.insertAdjacentHTML("beforebegin", carteHtml()); animerScenes(v); }
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
