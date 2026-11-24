/* Bafi Finance – « Écouter · 1 min » (2026.11) : l'application parle, en français ou en wolof.
 * Un emplacement <span data-ecoute="clé"></span> posé dans un écran devient un bouton seulement si le fichier
 * audio existe dans le stockage public « audios » (déposé depuis la console d'administration). Rien n'est
 * téléchargé avant qu'on touche « Écouter » ; le navigateur garde ensuite le fichier en cache. */
(() => {
  "use strict";
  const CFG = window.BRVM_CONFIG || {}, CAT = window.BAFI_AUDIOS || { langues: {}, cles: {} };
  const DEMO = new URLSearchParams(location.search).has("demo");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dispo = { fr: new Set(), wo: new Set() };
  let charge = false, audio = null, enCours = null;              // enCours : { cle, bouton }
  const langue = () => { try { return localStorage.getItem("bafi-langue-audio") || "fr"; } catch (e) { return "fr"; } };
  const url = (l, cle) => `${CFG.supabaseUrl}/storage/v1/object/public/audios/${encodeURIComponent(l)}/${encodeURIComponent(cle)}`;

  // quels messages existent : une liste par langue, une fois par ouverture de l'application
  async function charger() {
    if (DEMO || !CFG.supabaseUrl || !CFG.supabaseKey) return;
    await Promise.all(Object.keys(dispo).map(async (l) => {
      try {
        const r = await fetch(`${CFG.supabaseUrl}/storage/v1/object/list/audios`, {
          method: "POST", headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: l, limit: 200, offset: 0 }) });
        if (!r.ok) return;
        for (const o of await r.json()) if (o?.name && CAT.cles[o.name]) dispo[l].add(o.name);
      } catch (e) { /* hors connexion : pas de bouton */ }
    }));
    charge = true;
    remplir(document);
  }
  const langues = (cle) => Object.keys(dispo).filter((l) => dispo[l].has(cle));
  const ICO = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  };
  function boite(cle) {
    const ls = langues(cle), c = CAT.cles[cle];
    if (!ls.length || !c) return "";
    const l = ls.includes(langue()) ? langue() : ls[0];
    return `<div class="ec-boite"><button type="button" class="ec-btn" data-ec-jouer="${esc(cle)}" aria-pressed="false" aria-label="Écouter : ${esc(c.titre)}">
        <span class="ec-ic">${ICO.play}</span><span class="ec-t">Écouter · 1 min</span></button>
      ${ls.length > 1 ? `<span class="ec-langues" role="radiogroup" aria-label="Langue">${ls.map((x) => `<button type="button" role="radio" aria-checked="${x === l}" data-ec-langue="${x}">${esc(CAT.langues[x] || x)}</button>`).join("")}</span>` : ""}
      <details class="ec-texte"><summary>Lire le texte${l !== "fr" ? " (en français)" : ""}</summary><p>${esc(c.texte)}</p></details></div>`;
  }
  // remplit les emplacements présents (et ceux qui apparaissent ensuite : écrans redessinés, fenêtres)
  function remplir(racine) {
    if (!charge) return;
    racine.querySelectorAll?.("[data-ecoute]").forEach((n) => {
      const cle = n.dataset.ecoute;
      if (n.dataset.ecRempli === cle) return;
      const h = boite(cle);
      if (h) { n.dataset.ecRempli = cle; n.innerHTML = h; }
    });
  }
  function arreter() {
    if (audio) audio.pause();
    if (enCours?.bouton) etat(enCours.bouton, false);
    enCours = null;
  }
  function etat(b, joue) {
    b.setAttribute("aria-pressed", String(joue));
    b.querySelector(".ec-ic").innerHTML = joue ? ICO.pause : ICO.play;
    b.querySelector(".ec-t").textContent = joue ? "Pause" : "Écouter · 1 min";
  }
  document.addEventListener("click", (ev) => {
    const lg = ev.target.closest("[data-ec-langue]");
    if (lg) {
      try { localStorage.setItem("bafi-langue-audio", lg.dataset.ecLangue); } catch (e) { /* rien */ }
      arreter();
      document.querySelectorAll("[data-ecoute]").forEach((n) => { n.dataset.ecRempli = ""; });
      remplir(document);
      return;
    }
    const b = ev.target.closest("[data-ec-jouer]");
    if (!b) return;
    const cle = b.dataset.ecJouer;
    if (enCours?.bouton === b && audio && !audio.paused) { arreter(); return; }
    arreter();
    const ls = langues(cle), l = ls.includes(langue()) ? langue() : ls[0];
    if (!l) return;
    audio = audio || new Audio();
    audio.preload = "none";
    audio.src = url(l, cle);
    audio.onended = arreter;
    audio.onerror = () => { arreter(); window.BRVM_APP?.toast?.("Le message n'a pas pu être lu. Vérifiez votre connexion."); };
    enCours = { cle, bouton: b }; etat(b, true);
    audio.play().catch(() => arreter());
  });
  // un écran qui change arrête le message en cours
  window.addEventListener("hashchange", arreter);
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.("[data-ecoute]")) remplir(n.parentNode || document); else remplir(n); } })
    .observe(document.body, { childList: true, subtree: true });
  window.addEventListener("brvm:pret", charger, { once: true });
  window.BafiEcoute = { remplir: () => remplir(document), disponibles: () => ({ fr: [...dispo.fr], wo: [...dispo.wo] }) };
})();
