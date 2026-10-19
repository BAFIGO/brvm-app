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
  const ICONE_ENVOI = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/></svg>`;

  // ---------------------------------------------------------------- interface (créée une seule fois)
  document.body.insertAdjacentHTML("beforeend", `
    <button id="fab-ia" class="fab-ia" type="button" aria-haspopup="dialog" aria-controls="dlg-ia" hidden>
      ${VISAGE}<span class="ia-badge" hidden></span>
    </button>
    <dialog id="dlg-ia" class="ia" aria-labelledby="ia-titre">
      <div class="ia-tete">
        <span class="ia-avatar">${VISAGE}</span>
        <div class="ia-titres"><h2 id="ia-titre">Assistant</h2>
          <p class="small muted">Répond avec vos données et l'actualité publiée</p></div>
        <button type="button" class="ia-fermer" aria-label="Fermer l'assistant">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="ia-fil" role="log" aria-live="polite" aria-label="Conversation" tabindex="0"></div>
      <div class="ia-sugg" role="group" aria-label="Questions proposées"></div>
      <form class="ia-saisie" novalidate>
        <label for="ia-q" class="sr-only">Votre question</label>
        <textarea id="ia-q" rows="1" maxlength="500" placeholder="Posez votre question…" autocomplete="off"></textarea>
        <button type="button" class="ia-micro" aria-label="Dicter ma question" aria-pressed="false" hidden>${ICONE_MICRO}</button>
        <button type="submit" class="ia-envoyer" aria-label="Envoyer">${ICONE_ENVOI}</button>
      </form>
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
    d.innerHTML = qui === "moi" ? `<span class="sr-only">Vous : </span>${html}` : `<span class="sr-only">Assistant : </span>${html}`;
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
  async function poser(question) {
    question = String(question || "").trim();
    const app = window.BRVM_APP;
    if (!question || enCours || !app) return;
    enCours = true; envoyer.disabled = true;
    champ.value = ""; ajusterChamp();
    bulle("moi", esc(question));
    const attente = bulle("ia attente", `<span class="ia-points" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">L'assistant prépare sa réponse…</span>`);
    try {
      const rep = await app.demander({ question, historique: histo.slice(-MAX_HISTO), contexte: app.contexte(question) });
      attente.remove();
      const texte = rep?.texte || "Je n'ai pas de réponse pour le moment.";
      bulle("ia", formater(texte) + sources(rep?.sources));
      histo.push({ role: "user", content: question }, { role: "assistant", content: texte });
      window.dispatchEvent(new Event("brvm:question"));      // prise en main : « poser une question au robot » est fait
    } catch (e) {
      attente.remove();
      const absent = e.status === 404 || /not found|failed to send|fetch/i.test(e.message || "");
      bulle("ia erreur", `<p>${absent
        ? "L'assistant n'est pas encore activé. L'administrateur doit installer la fonction « assistant » dans Supabase."
        : esc(e.message || "La réponse n'a pas pu être obtenue.")}</p><p class="small">Réessayez dans un instant.</p>`);
    } finally {
      enCours = false; envoyer.disabled = false;
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

  // ---------------------------------------------------------------- dictée (seulement si le navigateur la propose)
  const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Reco) {
    let reco = null;
    micro.hidden = false;
    const arreter = () => { micro.setAttribute("aria-pressed", "false"); micro.setAttribute("aria-label", "Dicter ma question"); reco = null; };
    micro.addEventListener("click", () => {
      if (reco) { reco.stop(); return; }
      reco = new Reco();
      reco.lang = "fr-FR"; reco.interimResults = true; reco.continuous = false;
      const avant = champ.value ? champ.value.trim() + " " : "";
      reco.onresult = (ev) => {
        champ.value = avant + [...ev.results].map((r) => r[0].transcript).join("");
        ajusterChamp();
      };
      reco.onerror = (ev) => { if (ev.error === "not-allowed") bulle("ia erreur", "<p>Le micro est bloqué : autorisez-le dans les réglages du navigateur, ou tapez votre question.</p>"); };
      reco.onend = () => { arreter(); champ.focus(); };     // la question n'est pas envoyée seule : on peut la relire
      micro.setAttribute("aria-pressed", "true"); micro.setAttribute("aria-label", "Arrêter la dictée");
      try { reco.start(); } catch (e) { arreter(); }
    });
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
  window.addEventListener("brvm:ouvrir-assistant", () => { if (!fab.hidden) ouvrir(); });
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
    fab.setAttribute("aria-label", n ? `Ouvrir l'assistant (${n} alerte${n > 1 ? "s" : ""} à regarder)` : "Ouvrir l'assistant");
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
    document.body.classList.toggle("fabs-caches", dy > 0 && y > 160 && !enBas && !focus);
    dernierY = y;
  }, { passive: true });
  window.addEventListener("brvm:maj", majBouton);
  if (window.BRVM_APP) majBouton();
})();
