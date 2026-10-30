/* BafiBourse – assistant (robot de discussion).
 * Bouton fixe en bas à droite → fenêtre de discussion avec questions proposées, saisie et dictée facultative.
 * Les réponses viennent de la fonction Supabase « assistant » (clé de l'API Claude gardée sur le serveur).
 * app.js fournit window.BRVM_APP (données de l'écran) puis émet « brvm:pret » ; « brvm:maj » à chaque affichage. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CALME = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const MAX_HISTO = 8;                         // échanges renvoyés au serveur pour garder le fil de la conversation

  const VISAGE = `<svg viewBox="0 0 32 32" aria-hidden="true" class="ia-visage">
      <path d="M16 3.5v3.2"/><circle cx="16" cy="3" r="1.4" class="plein"/>
      <rect x="5" y="7.5" width="22" height="18" rx="7"/>
      <g class="yeux"><ellipse cx="11.8" cy="15.6" rx="1.7" ry="2.1" class="plein"/><ellipse cx="20.2" cy="15.6" rx="1.7" ry="2.1" class="plein"/></g>
      <path d="M12.5 20.6c1.9 1.5 5.1 1.5 7 0"/><path d="M2.5 14.5v5M29.5 14.5v5"/></svg>`;
  const ICONE_MICRO = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`;
  const ICONE_ENVOI = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>`;
  const ICONE_PLUS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
  const ICONE_X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  const ONDE = Array.from({ length: 18 }, (_, i) => `<i style="--k:${i}"></i>`).join("");

  // ---------------------------------------------------------------- interface (créée une seule fois)
  document.body.insertAdjacentHTML("beforeend", `
    <button id="fab-ia" class="fab-ia" type="button" aria-haspopup="dialog" aria-controls="dlg-ia" hidden>
      ${VISAGE}<span class="ia-badge" hidden></span>
    </button>
    <dialog id="dlg-ia" class="ia" aria-labelledby="ia-titre">
      <div class="ia-tete">
        <span class="ia-avatar">${VISAGE}</span>
        <div class="ia-titres"><h2 id="ia-titre"><span class="marque-bot"><b class="mb-bafi">Bafi</b>Bot</span></h2>
          <p class="small muted">Votre assistant : il répond avec vos chiffres et l'actualité publiée</p></div>
        <button type="button" class="ia-fermer" aria-label="Fermer BafiBot">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="ia-fil" role="log" aria-live="polite" aria-label="Conversation" tabindex="0"></div>
      <div class="ia-sugg" role="group" aria-label="Questions proposées"></div>
      <form class="ia-saisie" novalidate>
        <label for="ia-q" class="sr-only">Votre question</label>
        <textarea id="ia-q" rows="1" maxlength="500" placeholder="Écrivez ou dictez votre question…" autocomplete="off"></textarea>
        <div class="ia-barre">
          <button type="button" class="ia-plus" aria-label="Joindre l'avis de ma SGI (photo ou PDF)" data-import="">${ICONE_PLUS}</button>
          <button type="button" class="ia-annuler" aria-label="Annuler la dictée" hidden>${ICONE_X}</button>
          <span class="ia-onde" aria-hidden="true">${ONDE}</span>
          <span class="ia-ecoute sr-only" aria-live="polite"></span>
          <button type="button" class="ia-micro" aria-label="Dicter ma question" aria-pressed="false" hidden>${ICONE_MICRO}</button>
          <button type="submit" class="ia-envoyer" aria-label="Envoyer">${ICONE_ENVOI}</button>
        </div>
      </form>
      <div class="ia-quota" aria-live="polite"><span class="iq-txt"></span>
        <label class="iq-appro" hidden><input type="checkbox" id="ia-appro"> Analyse approfondie <span class="iq-appro-n"></span></label></div>
      <p class="ia-avert">Aide à la décision, pas un conseil en investissement. Vérifiez toujours avant de passer un ordre.</p>
    </dialog>`);

  const fab = $("#fab-ia"), dlg = $("#dlg-ia"), fil = $(".ia-fil", dlg), sugg = $(".ia-sugg", dlg);
  const form = $(".ia-saisie", dlg), champ = $("#ia-q"), micro = $(".ia-micro", dlg), envoyer = $(".ia-envoyer", dlg);
  const histo = [];               // [{ role: "user" | "assistant", content }]
  let enCours = false, accueilFait = false, dernierCompte = 0;

  // ---------------------------------------------------------------- mise en forme des réponses (gras, listes, paragraphes)
  function formater(t) {
    const lignes = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split("\n");
    let h = "", liste = false;
    for (const l of lignes) {
      const m = l.match(/^\s*[-•*]\s+(.*)$/);
      if (m) { if (!liste) { h += "<ul>"; liste = true; } h += `<li>${m[1]}</li>`; continue; }
      if (liste) { h += "</ul>"; liste = false; }
      if (l.trim()) h += `<p>${l}</p>`;
    }
    return h + (liste ? "</ul>" : "");
  }
  function bulle(qui, html) {
    const d = document.createElement("div");
    d.className = "ia-msg " + qui;
    d.innerHTML = qui === "moi" ? `<span class="sr-only">Vous : </span>${html}` : `<span class="sr-only">BafiBot : </span>${html}`;
    fil.append(d);
    fil.scrollTop = fil.scrollHeight;
    return d;
  }
  function sources(list) {
    if (!list?.length) return "";
    return `<div class="ia-sources"><span>Sources</span><ul>${list.slice(0, 4).map((s) => {
      let site = ""; try { site = new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) { /* adresse invalide */ }
      return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.titre || site)}</a>${site ? ` <span class="muted">(${esc(site)})</span>` : ""}</li>`;
    }).join("")}</ul></div>`;
  }

  // ---------------------------------------------------------------- questions proposées
  function afficherSuggestions() {
    const app = window.BRVM_APP;
    const list = app ? app.suggestions() : [];
    sugg.innerHTML = list.map((q) => `<button type="button" class="ia-chip">${esc(q)}</button>`).join("");
    sugg.hidden = !list.length;
  }
  sugg.addEventListener("click", (ev) => { const b = ev.target.closest(".ia-chip"); if (b) poser(b.textContent); });

  // ---------------------------------------------------------------- envoi d'une question
  // Quota du mois : « 63 questions restantes » ; à 80 % consommé, l'alerte devient visible
  function majQuota() {
    const a = window.BRVM_APP?.abo?.(), z = $(".ia-quota", dlg);
    if (!z) return;
    if (!a) { z.hidden = true; return; }
    const q = a.quotas || {}, u = a.usage || {}, c = a.credits || {};
    const reste = Math.max(0, (q.questions || 0) - (u.questions || 0)) + (c.questions || 0);
    const bas = reste <= Math.ceil((q.questions || 0) * 0.2);
    z.hidden = false; z.classList.toggle("bas", bas);
    $(".iq-txt", z).innerHTML = reste > 0 ? `${reste} question${reste > 1 ? "s" : ""} restante${reste > 1 ? "s" : ""} ce mois-ci`
      + (bas ? ` · <button type="button" class="btn link small" data-formules>plus de questions</button>` : "")
      : `Plus de question ce mois-ci · <button type="button" class="btn link small" data-formules>voir les packs</button>`;
    const ra = Math.max(0, (q.approfondies || 0) - (u.approfondies || 0));
    $(".iq-appro", z).hidden = !(q.approfondies > 0);
    $(".iq-appro-n", z).textContent = `(${ra} restante${ra > 1 ? "s" : ""})`;
    $("#ia-appro").disabled = ra <= 0;
  }
  window.addEventListener("brvm:pret", () => setTimeout(majQuota, 300));
  fab?.addEventListener("click", () => setTimeout(majQuota, 50));

  async function poser(question) {
    question = String(question || "").trim();
    const app = window.BRVM_APP;
    if (!question || enCours || !app) return;
    enCours = true; envoyer.disabled = true;
    champ.value = ""; ajusterChamp();
    bulle("moi", esc(question));
    const attente = bulle("ia attente", `<span class="ia-points" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">BafiBot prépare sa réponse…</span>`);
    try {
      const approfondie = !!$("#ia-appro")?.checked && !$(".iq-appro", dlg).hidden;
      const rep = await app.demander({ question, historique: histo.slice(-MAX_HISTO), contexte: app.contexte(question), approfondie });
      if ($("#ia-appro")) $("#ia-appro").checked = false;
      app.noterUsage?.(approfondie ? "approfondies" : "questions");
      attente.remove();
      const texte = rep?.texte || "Je n'ai pas de réponse pour le moment.";
      bulle("ia", formater(texte) + sources(rep?.sources));
      histo.push({ role: "user", content: question }, { role: "assistant", content: texte });
      window.dispatchEvent(new Event("brvm:question"));      // prise en main : « poser une question au robot » est fait
    } catch (e) {
      attente.remove();
      if (e.quota) {                                           // quota du mois atteint : trois choix, jamais de blocage sans issue
        bulle("ia erreur", `<p>${esc(e.message)}</p><p class="small">Vous pouvez attendre le 1er du mois, prendre un pack de 50 questions (500 F),
          ou passer à une formule supérieure.</p><p><button type="button" class="btn small primary" data-formules>Voir les formules et les packs</button></p>`);
        app.rechargerFormule?.().then(majQuota);
        return;
      }
      const absent = e.status === 404 || /not found|failed to send|fetch/i.test(e.message || "");
      bulle("ia erreur", `<p>${absent
        ? "L'assistant n'est pas encore activé. L'administrateur doit installer la fonction « assistant » dans Supabase."
        : esc(e.message || "La réponse n'a pas pu être obtenue.")}</p><p class="small">Réessayez dans un instant.</p>`);
    } finally {
      enCours = false; envoyer.disabled = false;
      majQuota();
      afficherSuggestions();
      if (!matchMedia("(pointer: coarse)").matches) champ.focus();    // sur téléphone, le clavier ne se rouvre pas tout seul
    }
  }
  form.addEventListener("submit", (ev) => { ev.preventDefault(); poser(champ.value); });
  champ.addEventListener("keydown", (ev) => {           // Entrée envoie, Maj + Entrée passe à la ligne
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); poser(champ.value); }
  });
  function ajusterChamp() { champ.style.height = "auto"; champ.style.height = Math.min(champ.scrollHeight, 120) + "px"; }
  champ.addEventListener("input", ajusterChamp);

  // ---------------------------------------------------------------- « + » : joindre l'avis de sa SGI (import.js ouvre sa fenêtre)
  $(".ia-plus", dlg).addEventListener("click", () => dlg.close());

  // ---------------------------------------------------------------- dictée (seulement si le navigateur la propose)
  // Pendant l'écoute : l'onde s'anime, le micro devient « arrêter » (carré) et le « + » devient « annuler » (×).
  // La question dictée n'est jamais envoyée seule : on la relit, puis on touche la flèche.
  const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Reco) {
    let reco = null, avant = "", annule = false;
    const plus = $(".ia-plus", dlg), annuler = $(".ia-annuler", dlg), ecoute = $(".ia-ecoute", dlg);
    const ICONE_STOP = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" class="plein"/></svg>`;
    micro.hidden = false;
    const etat = (on) => {
      form.classList.toggle("dicte", on);
      plus.hidden = on; annuler.hidden = !on;
      micro.setAttribute("aria-pressed", String(on));
      micro.setAttribute("aria-label", on ? "Arrêter la dictée" : "Dicter ma question");
      micro.innerHTML = on ? ICONE_STOP : ICONE_MICRO;
      ecoute.textContent = on ? "BafiBot vous écoute" : "";
    };
    const arreter = () => { etat(false); reco = null; };
    micro.addEventListener("click", () => {
      if (reco) { reco.stop(); return; }
      reco = new Reco();
      reco.lang = "fr-FR"; reco.interimResults = true; reco.continuous = false;
      avant = champ.value ? champ.value.trim() + " " : ""; annule = false;
      reco.onresult = (ev) => {
        if (annule) return;
        champ.value = avant + [...ev.results].map((r) => r[0].transcript).join("");
        ajusterChamp();
      };
      reco.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed")
          bulle("ia erreur", "<p>Le micro n'est pas disponible ici : autorisez-le dans les réglages, ou utilisez le micro de votre clavier.</p>");
      };
      reco.onend = () => { arreter(); if (!annule) champ.focus(); };
      etat(true);
      try { reco.start(); } catch (e) { arreter(); }
    });
    annuler.addEventListener("click", () => {
      annule = true; champ.value = avant.trim(); ajusterChamp();
      try { reco?.abort(); } catch (e) { /* déjà arrêtée */ }
      arreter(); micro.focus();
    });
    dlg.addEventListener("close", () => { if (reco) { annule = true; try { reco.abort(); } catch (e) { /* déjà arrêtée */ } arreter(); } });
  }

  // ---------------------------------------------------------------- ouverture / fermeture
  function ouvrir() {
    const app = window.BRVM_APP;
    if (!accueilFait && app) {
      const p = app.prenom(), n = app.urgentes();
      bulle("ia", formater(`Bonjour${p ? " " + p : ""} ! Je peux vous parler de votre portefeuille, de vos alertes, du marché du jour ou d'un titre précis.`
        + (n ? `\n\nVous avez **${n} alerte${n > 1 ? "s" : ""}** à regarder.` : "")
        + (app.demo ? "\n\nVous êtes en démonstration : les réponses utilisent des données fictives." : "")));
      accueilFait = true;
    }
    afficherSuggestions();
    dlg.showModal();
    if (!matchMedia("(pointer: coarse)").matches) champ.focus();
  }
  fab.addEventListener("click", ouvrir);
  window.addEventListener("brvm:ouvrir-assistant", (ev) => {
    if (fab.hidden) return;
    ouvrir();
    if (ev.detail?.question) setTimeout(() => poser(ev.detail.question), 250);   // premiers pas : question posée en une touche
  });
  $(".ia-fermer", dlg).addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });     // toucher le fond ferme
  dlg.addEventListener("close", () => fab.focus());

  // ---------------------------------------------------------------- bouton : badge des alertes, clin d'œil discret
  function cligner() {
    if (CALME) return;
    fab.classList.remove("cligne", "regarde"); void fab.offsetWidth; fab.classList.add("cligne");
  }
  function majBouton() {
    const app = window.BRVM_APP;
    if (!app) return;
    fab.hidden = false;
    document.body.classList.add("has-ia");
    const n = app.urgentes(), badge = $(".ia-badge", fab);
    badge.hidden = !n; badge.textContent = n > 9 ? "9+" : String(n);
    fab.setAttribute("aria-label", n ? `Ouvrir BafiBot (${n} alerte${n > 1 ? "s" : ""} à regarder)` : "Ouvrir BafiBot");
    if (n > dernierCompte) cligner();          // une seule animation, seulement quand il y a du nouveau
    dernierCompte = n;
  }
  // ---------------------------------------------------------------- petites animations d'ambiance (robot et coffre)
  // Discrètes et limitées : la première vers 10 s, puis une toutes les 20 à 40 s, 6 au plus par visite, jamais pendant que l'utilisateur
  // fait défiler, touche l'écran ou tape, ni quand la fenêtre est ouverte ou l'onglet caché.
  // Rien du tout si le téléphone demande de réduire les animations.
  const MAX_AMBIANCE = 6;
  let ambianceFaites = 0, derniereActivite = Date.now();
  for (const ev of ["scroll", "touchstart", "keydown", "pointerdown"])
    window.addEventListener(ev, () => { derniereActivite = Date.now(); }, { passive: true });
  const coffre = () => { const f = document.getElementById("fab-coffre"); return f && !f.hidden ? f : null; };
  function rejouer(el, classe) { el.classList.remove("cligne", "regarde", "allume"); void el.offsetWidth; el.classList.add(classe); }
  function jouerAmbiance() {
    if (CALME || ambianceFaites >= MAX_AMBIANCE) return;
    if (document.hidden || dlg.open || fab.hidden || Date.now() - derniereActivite < 4000) { planifierAmbiance(); return; }
    // le robot et le coffre jouent chacun leur tour ; le robot alterne clin d'œil et coup d'œil
    const c = coffre() && ambianceFaites % 2 === 0 ? "coffre" : (ambianceFaites % 4 < 2 ? "cligne" : "regarde");
    if (c === "coffre") {
      const cadran = coffre().querySelector("svg circle");
      if (cadran) { cadran.classList.add("cadran"); rejouer(coffre(), "allume"); }
    } else rejouer(fab, c);
    ambianceFaites++;
    planifierAmbiance();
  }
  function planifierAmbiance() {          // la première arrive vite (8 à 12 s), les suivantes toutes les 20 à 40 s
    if (!CALME && ambianceFaites < MAX_AMBIANCE) setTimeout(jouerAmbiance, ambianceFaites ? 20000 + Math.random() * 20000 : 8000 + Math.random() * 4000);
  }

  window.addEventListener("brvm:pret", () => { majBouton(); setTimeout(cligner, 900); planifierAmbiance(); });

  // ---------------------------------------------------------------- boutons flottants : ils s'effacent quand on descend
  // pour ne pas cacher les chiffres, et reviennent dès qu'on remonte ou qu'on arrive en bas de la page.
  let dernierY = scrollY;
  addEventListener("scroll", () => {
    const y = scrollY, dy = y - dernierY;
    if (Math.abs(dy) < 8) return;
    const enBas = innerHeight + y >= document.documentElement.scrollHeight - 40;
    const focus = document.activeElement?.closest?.(".fab, .fab-ia");
    const tuto = document.getElementById("tuto"), guide = tuto && !tuto.hidden;
    document.body.classList.toggle("fabs-caches", !guide && dy > 0 && y > 160 && !enBas && !focus);
    dernierY = y;
  }, { passive: true });
  window.addEventListener("brvm:maj", majBouton);
  if (window.BRVM_APP) majBouton();
})();
