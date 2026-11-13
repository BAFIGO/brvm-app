/* BafiBourse – assistant (robot de discussion).
 * Bouton fixe en bas à droite → fenêtre de discussion avec questions proposées, saisie et dictée facultative.
 * Les réponses viennent de la fonction Supabase « assistant » (clé de l'API Claude gardée sur le serveur).
 * app.js fournit window.BRVM_APP (données de l'écran) puis émet « brvm:pret » ; « brvm:maj » à chaque affichage. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CALME = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const MAX_HISTO = 8;                         // échanges renvoyés au serveur pour garder le fil de la conversation

  // Bim Bim, la petite tortue de BafiBourse (patience et discipline). Chaque dessin a son propre dégradé (identifiant unique).
  let nTortue = 0;
  const tortue = (cls = "ia-tortue") => { const id = "tt" + (++nTortue); return `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="tt-h"/><stop offset="1" class="tt-b"/></linearGradient></defs><g class="tt-corps"><ellipse class="tt-sol" cx="16" cy="27.2" rx="10.5" ry="1"/><path class="tt-patte g tt-peau" d="M9.9 21.9c-2.7.3-4.8 2.2-5 4.5h5.1c.1-1.5.6-2.6 1.3-3.5z"/><path class="tt-patte d tt-peau" d="M22.1 21.9c2.7.3 4.8 2.2 5 4.5h-5.1c-.1-1.5-.6-2.6-1.3-3.5z"/><path class="tt-bord" d="M3.7 19C5.9 22.5 26.1 22.5 28.3 19" fill="url(#${id})"/><ellipse class="tt-creux" cx="16" cy="19.5" rx="5.6" ry="2.4"/><g class="tt-tete"><ellipse class="tt-peau" cx="16" cy="21.5" rx="4.8" ry="4.45"/><g class="tt-yeux"><ellipse class="tt-oeil" cx="14.2" cy="20.9" rx=".88" ry="1.08"/><ellipse class="tt-oeil" cx="17.8" cy="20.9" rx=".88" ry="1.08"/><circle class="tt-lum" cx="14.5" cy="20.5" r=".32"/><circle class="tt-lum" cx="18.1" cy="20.5" r=".32"/></g><path class="tt-bouche" d="M15 23.3c.6.42 1.4.42 2 0"/><ellipse class="tt-joue" cx="13" cy="22.9" rx=".85" ry=".55"/><ellipse class="tt-joue" cx="19" cy="22.9" rx=".85" ry=".55"/></g><path class="tt-dome" d="M2.5 18.6C2.5 11.5 8.5 7.5 16 7.5S29.5 11.5 29.5 18.6Q16 14.9 2.5 18.6Z" fill="url(#${id})"/><path class="tt-ecailles" d="M13.7 8.4h4.6l1.55 2.7-1.55 2.7h-4.6L12.15 11.1z M12.15 11.1L6 13.5 M19.85 11.1L26 13.5 M13.7 13.8l-1.2 2.6 M18.3 13.8l1.2 2.6"/><path class="tt-reflet" d="M6.2 13.4C7.6 10.9 10.2 9.3 12.8 8.7"/></g></svg>`; };
  const ICONE_MICRO = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`;
  const ICONE_ENVOI = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>`;
  const ICONE_PLUS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
  const ICONE_X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  const ICONE_PHOTO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
  const ICONE_DOC = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>`;
  const ICONE_GRAPHE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15l3-3 3 3 4-5"/></svg>`;
  const ONDE = Array.from({ length: 18 }, (_, i) => `<i style="--k:${i}"></i>`).join("");

  // ---------------------------------------------------------------- interface (créée une seule fois)
  document.body.insertAdjacentHTML("beforeend", `
    <button id="fab-ia" class="fab-ia" type="button" aria-haspopup="dialog" aria-controls="dlg-ia" hidden>
      ${tortue()}<span class="ia-badge" hidden></span>
    </button>
    <dialog id="dlg-ia" class="ia" aria-labelledby="ia-titre">
      <div class="ia-tete">
        <span class="ia-avatar">${tortue()}</span>
        <div class="ia-titres"><h2 id="ia-titre"><span class="marque-bot"><b class="mb-bafi">Bim</b> Bim</span></h2>
          <p class="small muted">Votre petite tortue : pas à pas, avec vos chiffres</p></div>
        <button type="button" class="ia-agrandir" aria-label="Agrandir la conversation" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
        <button type="button" class="ia-fermer" aria-label="Fermer Bim Bim">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="ia-fil" role="log" aria-live="polite" aria-label="Conversation" tabindex="0"></div>
      <div class="ia-sugg" role="group" aria-label="Questions proposées"></div>
      <form class="ia-saisie" novalidate>
        <label for="ia-q" class="sr-only">Votre question</label>
        <textarea id="ia-q" rows="1" maxlength="500" placeholder="Écrivez ou dictez votre question…" autocomplete="off"></textarea>
        <div class="ia-barre">
          <button type="button" class="ia-plus" aria-label="Joindre un avis ou un relevé" aria-haspopup="true" aria-expanded="false">${ICONE_PLUS}</button>
          <button type="button" class="ia-annuler" aria-label="Annuler la dictée" hidden>${ICONE_X}</button>
          <button type="button" class="ia-appro" aria-pressed="false" hidden><svg class="ia-mini" viewBox="0 0 24 24" aria-hidden="true"><circle class="fond" cx="12" cy="12" r="9"/><circle class="arc" cx="12" cy="12" r="9"/></svg><span>Approfondir</span><b class="ia-appro-n"></b></button>
          <span class="ia-onde" aria-hidden="true">${ONDE}</span>
          <span class="ia-ecoute sr-only" aria-live="polite"></span>
          <button type="button" class="ia-micro" aria-label="Dicter ma question" aria-pressed="false" hidden>${ICONE_MICRO}</button>
          <span class="ia-envoi"><svg class="ia-anneau" viewBox="0 0 52 52" aria-hidden="true"><circle class="fond" cx="26" cy="26" r="23.5"/><circle class="arc" cx="26" cy="26" r="23.5"/></svg>
            <button type="submit" class="ia-envoyer" aria-label="Envoyer">${ICONE_ENVOI}</button>
            <button type="button" class="ia-cpt" aria-expanded="false" hidden></button></span>
        </div>
        <div class="ia-pop" role="status" hidden></div>
        <div class="ia-feuille" hidden>
          <button type="button" class="ia-opt" data-import=""><span class="ia-opt-ic">${ICONE_PHOTO}</span><span><b>Prendre en photo</b><small>Un avis d'opération ou un relevé de ma SGI</small></span></button>
          <button type="button" class="ia-opt" data-import=""><span class="ia-opt-ic">${ICONE_DOC}</span><span><b>Choisir un PDF ou une image</b><small>Relevé trimestriel, avis de dividende, capture d'écran</small></span></button>
          <button type="button" class="ia-opt" disabled><span class="ia-opt-ic i">${ICONE_GRAPHE}</span><span><b>Un graphique ou un tableau <em>Bientôt</em></b><small>Bim Bim le lira et vous l'expliquera</small></span></button>
        </div>
        <input type="checkbox" id="ia-appro" hidden>
      </form>
      <div class="ia-bas" hidden></div>
      <div class="ia-pied"><p class="ia-avert">Pas un conseil en investissement.</p>
      <div class="ia-histo" hidden><button type="button" class="btn link small ia-effacer">Effacer mon historique</button>
        <span class="ia-conf" hidden><span class="small">Effacer vos 50 derniers échanges, sur tous vos appareils ?</span>
          <button type="button" class="btn small danger ia-oui">Effacer</button><button type="button" class="btn small ia-non">Annuler</button></span></div></div>
    </dialog>`);

  const fab = $("#fab-ia"), dlg = $("#dlg-ia"), fil = $(".ia-fil", dlg), sugg = $(".ia-sugg", dlg);
  // Agrandir / réduire : la conversation peut occuper tout l'écran pour lire confortablement les réponses
  $(".ia-agrandir", dlg).addEventListener("click", (ev) => {
    const b = ev.currentTarget, p = !dlg.classList.contains("plein");
    dlg.classList.toggle("plein", p); b.setAttribute("aria-pressed", String(p));
    b.setAttribute("aria-label", p ? "Réduire la conversation" : "Agrandir la conversation");
    try { localStorage.setItem("bafibot-plein", p ? "1" : ""); } catch (e) { /* navigation privée */ }
  });
  try { if (localStorage.getItem("bafibot-plein")) { dlg.classList.add("plein"); $(".ia-agrandir", dlg).setAttribute("aria-pressed", "true"); } } catch (e) { /* */ }
  const form = $(".ia-saisie", dlg), champ = $("#ia-q"), micro = $(".ia-micro", dlg), envoyer = $(".ia-envoyer", dlg);
  const histo = [];               // [{ role: "user" | "assistant", content }]
  let enCours = false, accueilFait = false, dernierCompte = 0;
  // Historique gardé par la base (50 derniers échanges) et alertes déjà vues : les mêmes sur tous les appareils.
  // Si la table n'est pas encore installée, Bim Bim fonctionne comme avant (conversation gardée le temps de la visite).
  let anciens = [], vues = null, histoPret = null;
  function chargerHisto() {
    const b = window.BRVM_APP?.bafibot;
    if (!b || histoPret) return histoPret;
    histoPret = Promise.allSettled([b.histo(), b.etat()]).then(([h, e]) => {
      if (h.status === "fulfilled" && Array.isArray(h.value)) anciens = h.value.slice().reverse();
      vues = e.status === "fulfilled" ? new Set(e.value?.alertes_vues || []) : null;
      majBouton();
    });
    return histoPret;
  }

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
    d.innerHTML = qui === "moi" ? `<span class="sr-only">Vous : </span>${html}` : `<span class="sr-only">Bim Bim : </span>${html}`;
    fil.append(d);
    fil.scrollTop = fil.scrollHeight;
    return d;
  }
  function sources(list) {
    if (!list?.length) return "";
    return `<div class="ia-sources"><span>Sources</span><ul>${list.slice(0, 4).map((s) => {
      let site = "", u = null; try { u = new URL(s.url); site = u.hostname.replace(/^www\./, ""); } catch (e) { /* adresse invalide */ }
      if (!u || !/^https?:$/.test(u.protocol)) return "";
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
  // Compteurs : un anneau ambre autour du bouton d'envoi (questions du mois) et un mini-anneau sur « Approfondir »
  const ARC = 2 * Math.PI * 23.5, ARC_MINI = 2 * Math.PI * 9;
  let infoQuota = "", infoAppro = "", tPop = 0;
  function majQuota() {
    const a = window.BRVM_APP?.abo?.(), cpt = $(".ia-cpt", dlg), envoi = $(".ia-envoi", dlg), bas = $(".ia-bas", dlg), appro = $(".ia-appro", dlg);
    if (!a) { cpt.hidden = true; envoi.classList.remove("compte"); bas.hidden = true; appro.hidden = true; return; }
    const q = a.quotas || {}, u = a.usage || {}, c = a.credits || {};
    const total = (q.questions || 0) + (c.questions || 0), reste = Math.max(0, (q.questions || 0) - (u.questions || 0)) + (c.questions || 0);
    const faible = reste <= Math.ceil(total * 0.2);
    envoi.classList.add("compte"); envoi.classList.toggle("bas", faible);
    $(".ia-anneau .arc", dlg).style.strokeDasharray = `${(total ? (ARC * Math.min(reste, total)) / total : 0).toFixed(1)} ${ARC.toFixed(1)}`;
    cpt.hidden = false; cpt.textContent = reste > 99 ? "99+" : String(reste);
    cpt.setAttribute("aria-label", `${reste} question${reste > 1 ? "s" : ""} restante${reste > 1 ? "s" : ""} ce mois-ci : voir le détail`);
    infoQuota = `<b>${reste} question${reste > 1 ? "s" : ""}</b> restante${reste > 1 ? "s" : ""} sur ${total} ce mois-ci.<span>Elles reviennent le 1er du mois prochain. Besoin de plus ? Pack de 50 questions : 500 F.</span>`;
    bas.hidden = !faible;
    bas.innerHTML = reste > 0 ? `Plus que <b>${reste} question${reste > 1 ? "s" : ""}</b> ce mois-ci. <button type="button" class="btn link small" data-formules>Ajouter 50 questions (500 F)</button>`
      : `Plus de question ce mois-ci. <button type="button" class="btn link small" data-formules>Voir les packs</button>`;
    const ra = Math.max(0, (q.approfondies || 0) - (u.approfondies || 0));
    appro.hidden = !(q.approfondies > 0);
    appro.disabled = ra <= 0;
    if (ra <= 0) $("#ia-appro").checked = false;
    $(".ia-mini .arc", appro).style.strokeDasharray = `${(q.approfondies ? (ARC_MINI * ra) / q.approfondies : 0).toFixed(1)} ${ARC_MINI.toFixed(1)}`;
    $(".ia-appro-n", appro).textContent = String(ra);
    appro.setAttribute("aria-pressed", String($("#ia-appro").checked));
    appro.setAttribute("aria-label", `Approfondir la question (${ra} restante${ra > 1 ? "s" : ""} ce mois-ci)`);
    infoAppro = `<b>Approfondir</b> : une réponse plus complète, avec les comptes et l'actualité de la société. <b>${ra} sur ${q.approfondies || 0}</b> restante${ra > 1 ? "s" : ""} ce mois-ci.`;
  }
  function montrerPop(html, cote) {
    const pop = $(".ia-pop", dlg);
    pop.innerHTML = html; pop.dataset.cote = cote; pop.hidden = false;
    clearTimeout(tPop); tPop = setTimeout(() => (pop.hidden = true), 6000);
  }
  $(".ia-cpt", dlg).addEventListener("click", (ev) => {
    const pop = $(".ia-pop", dlg), b = ev.currentTarget, ouvert = !pop.hidden && pop.dataset.cote === "droite";
    if (ouvert) { pop.hidden = true; b.setAttribute("aria-expanded", "false"); } else { montrerPop(infoQuota, "droite"); b.setAttribute("aria-expanded", "true"); }
  });
  $(".ia-appro", dlg).addEventListener("click", (ev) => {
    const b = ev.currentTarget; if (b.disabled) return;
    const on = !$("#ia-appro").checked; $("#ia-appro").checked = on; b.setAttribute("aria-pressed", String(on));
    if (on) montrerPop(infoAppro, "gauche"); else $(".ia-pop", dlg).hidden = true;
  });
  // « + » : joindre un avis ou un relevé (la fenêtre d'import s'ouvre), le reste viendra
  $(".ia-plus", dlg).addEventListener("click", (ev) => {
    const f = $(".ia-feuille", dlg), ouvrir = f.hidden; f.hidden = !ouvrir; ev.currentTarget.setAttribute("aria-expanded", String(ouvrir));
    if (ouvrir) f.querySelector(".ia-opt:not([disabled])")?.focus();
  });
  $(".ia-feuille", dlg).addEventListener("click", (ev) => { if (ev.target.closest("[data-import]")) { $(".ia-feuille", dlg).hidden = true; dlg.close(); } });
  dlg.addEventListener("click", (ev) => {
    if (!ev.target.closest(".ia-feuille, .ia-plus")) { $(".ia-feuille", dlg).hidden = true; $(".ia-plus", dlg).setAttribute("aria-expanded", "false"); }
    if (!ev.target.closest(".ia-pop, .ia-cpt, .ia-appro")) $(".ia-pop", dlg).hidden = true;
  });
  window.addEventListener("brvm:pret", () => setTimeout(majQuota, 300));
  fab?.addEventListener("click", () => setTimeout(majQuota, 50));

  // ---------------------------------------------------------------- « J'ai payé 2 500 F de taxi » : noté dans le budget, sans question décomptée
  function carteOp(html) { const d = document.createElement("div"); d.className = "ia-carte"; d.innerHTML = html; fil.append(d); fil.scrollTop = fil.scrollHeight; return d; }
  function memoriser(question, texte) {
    histo.push({ role: "user", content: question }, { role: "assistant", content: texte });
    window.BRVM_APP?.bafibot?.ajouter([{ role: "user", contenu: question }, { role: "assistant", contenu: texte }]).then(() => { $(".ia-histo", dlg).hidden = false; }).catch(() => {});
  }
  async function enregistrerOp(question, op, carte) {
    const B = window.BafiBudget, rev = op.type === "revenu";
    try {
      const r = await B.noterOperation(op);
      const montant = `${rev ? "+" : "−"}${nf.format(op.montant)} F`;
      carte.innerHTML = `<p class="ia-carte-h"><span class="ia-ok" aria-hidden="true">✓</span>${rev ? "Revenu noté" : "Dépense notée"} dans votre budget</p>
        <div class="ia-carte-l"><span><b>${esc(r.libelle)}</b><small>Aujourd'hui</small></span><b class="num${rev ? " good" : ""}">${montant}</b></div>
        <div class="ia-carte-act"><button type="button" class="btn link small" data-iaop="modifier">Modifier</button><button type="button" class="btn link small" data-iaop="annuler">Annuler</button><span class="small muted ia-minuteur">annulable 10 s</span></div>`;
      const fin = setTimeout(() => { const a = carte.querySelector('[data-iaop="annuler"]'); a?.remove(); const m = carte.querySelector(".ia-minuteur"); if (m) m.textContent = "à retrouver dans Mon budget"; }, 10000);
      carte.addEventListener("click", async (ev) => {
        const b = ev.target.closest("[data-iaop]"); if (!b) return;
        b.disabled = true; clearTimeout(fin);
        try { await B.annulerOperation(r.id); } catch (e) { bulle("ia erreur", "<p>Je n'ai pas pu retirer cette opération. Vous pouvez la supprimer dans Mon budget.</p>"); return; }
        if (b.dataset.iaop === "annuler") { carte.innerHTML = `<p class="ia-carte-h">Annulé : rien n'est enregistré.</p>`; return; }
        carte.innerHTML = `<p class="ia-carte-h">Corrigez le montant ou la catégorie, puis enregistrez.</p>`;
        dlg.close(); B.ouvrirSaisie(op);
      });
      const texte = rev ? `C'est noté ! Votre plan dit de garder **${nf.format(r.garder)} F** d'abord, avant les dépenses.`
        : `Il vous reste **${nf.format(Math.round(r.duJour))} F** à dépenser aujourd'hui. Rien n'a été compté sur vos questions.`;
      const d = bulle("ia", formater(texte));
      if (rev && r.garder > 0) {
        d.insertAdjacentHTML("beforeend", `<div class="ia-choix"><button type="button" class="ia-chip on" data-garder="${r.garder}">Je garde ${nf.format(r.garder)} F</button><button type="button" class="ia-chip" data-plus-tard>Plus tard</button></div>`);
        d.addEventListener("click", (ev) => {
          if (ev.target.closest("[data-garder]")) { dlg.close(); B.garder(+ev.target.closest("[data-garder]").dataset.garder); }
          if (ev.target.closest("[data-plus-tard]")) ev.target.closest(".ia-choix").remove();
        });
      }
      memoriser(question, `${rev ? "Revenu" : "Dépense"} noté${rev ? "" : "e"} : ${r.libelle}, ${montant}. ${texte.replace(/\*\*/g, "")}`);
      window.dispatchEvent(new Event("brvm:question"));
    } catch (e) { carte.remove(); bulle("ia erreur", `<p>${esc("Je n'ai pas pu l'enregistrer : " + (e.message || e))}</p><p class="small">Vous pouvez la noter avec « J'ai dépensé » ou « J'ai gagné ».</p>`); }
  }
  function traiterOperation(question, op) {
    champ.value = ""; ajusterChamp();
    bulle("moi", esc(question));
    if (!window.BafiBudget?.pret?.()) { bulle("ia", formater("Pour noter vos dépenses et vos revenus, commencez d'abord votre budget : menu ☰ > Mon budget.")); return; }
    if (op.sur) { enregistrerOp(question, op, carteOp(`<p class="ia-carte-h">J'enregistre…</p>`)); return; }
    const rev = op.type === "revenu";
    const carte = carteOp(`<p class="ia-carte-h"><span>${rev ? "Un revenu" : "Une dépense"} de <b class="num">${nf.format(op.montant)} F</b> : dans quelle catégorie ?</span></p>
      <div class="ia-choix">${op.choix.map(([k, l]) => `<button type="button" class="ia-chip${k === op.cat ? " on" : ""}" data-cat="${esc(k)}" aria-pressed="${k === op.cat}">${esc(l)}</button>`).join("")}</div>
      <div class="ia-carte-act"><button type="button" class="btn link small" data-iaop="ok">Enregistrer</button><button type="button" class="btn link small" data-iaop="question">Ce n'est pas une ${rev ? "recette" : "dépense"}</button></div>`);
    bulle("ia muet", `<p class="small muted">Quand je ne suis pas sûr, je vous demande avant d'enregistrer.</p>`);
    carte.addEventListener("click", (ev) => {
      const c = ev.target.closest("[data-cat]");
      if (c) { op.cat = c.dataset.cat; carte.querySelectorAll("[data-cat]").forEach((x) => { const on = x === c; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }); return; }
      const b = ev.target.closest("[data-iaop]"); if (!b) return;
      if (b.dataset.iaop === "ok") { carte.innerHTML = `<p class="ia-carte-h">J'enregistre…</p>`; enregistrerOp(question, op, carte); }
      else { carte.remove(); fil.lastElementChild?.classList.contains("muet") && fil.lastElementChild.remove(); fil.lastElementChild?.remove(); poser(question, true); }
    });
  }

  async function poser(question, brut = false) {
    question = String(question || "").trim();
    const app = window.BRVM_APP;
    if (!question || enCours || !app) return;
    const op = !brut && window.BafiBudget?.comprendre?.(question);
    if (op) { traiterOperation(question, op); return; }
    enCours = true; envoyer.disabled = true;
    champ.value = ""; ajusterChamp();
    bulle("moi", esc(question));
    const attente = bulle("ia attente", `${tortue("ia-tortue reflechit")}<span class="ia-reflechit" aria-hidden="true">Bim Bim réfléchit…</span><span class="sr-only">Bim Bim prépare sa réponse…</span>`);
    try {
      const approfondie = !!$("#ia-appro")?.checked && !$(".ia-appro", dlg).hidden;
      const rep = await app.demander({ question, historique: histo.slice(-MAX_HISTO), contexte: app.contexte([question, ...histo.filter((h) => h.role === "user").slice(-2).map((h) => h.content)].join(" \n ")), approfondie });
      if ($("#ia-appro")) $("#ia-appro").checked = false;
      app.noterUsage?.(approfondie ? "approfondies" : "questions");
      attente.remove();
      const texte = rep?.texte || "Je n'ai pas de réponse pour le moment.";
      bulle("ia", formater(texte) + sources(rep?.sources));
      histo.push({ role: "user", content: question }, { role: "assistant", content: texte });
      const src = (rep?.sources || []).slice(0, 4).map((x) => ({ titre: String(x.titre || "").slice(0, 200), url: String(x.url || "").slice(0, 500) }));
      app.bafibot?.ajouter([{ role: "user", contenu: question }, { role: "assistant", contenu: texte.slice(0, 20000), sources: src.length ? src : null }])
        .then(() => { $(".ia-histo", dlg).hidden = false; }).catch(() => { /* table pas encore installée : rien n'est gardé */ });
      window.dispatchEvent(new Event("brvm:question"));      // prise en main : « poser une question à Bim Bim » est fait
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
      ecoute.textContent = on ? "Bim Bim vous écoute" : "";
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
  async function ouvrir() {
    const app = window.BRVM_APP;
    if (!accueilFait && app) {
      await Promise.race([chargerHisto(), new Promise((ok) => setTimeout(ok, 1500))]);
      if (anciens.length) {
        const sep = document.createElement("p"); sep.className = "ia-sep small muted"; sep.textContent = "Vos échanges précédents"; fil.append(sep);
        for (const m of anciens) {
          if (m.role === "user") bulle("moi", esc(m.contenu)); else bulle("ia", formater(m.contenu) + sources(m.sources));
          histo.push({ role: m.role, content: m.contenu });
        }
        const sep2 = document.createElement("p"); sep2.className = "ia-sep small muted"; sep2.textContent = "Aujourd'hui"; fil.append(sep2);
        $(".ia-histo", dlg).hidden = false;
      }
      const p = app.prenom(), n = app.urgentes();
      bulle("ia", formater(`Bonjour${p ? " " + p : ""} ! Je suis **Bim Bim**, votre petite tortue : pas à pas, je vous aide à garder et à investir. Je peux vous parler de votre portefeuille, de vos alertes, du marché du jour ou d'un titre précis.`
        + (n ? `\n\nVous avez **${n} alerte${n > 1 ? "s" : ""}** à regarder.` : "")
        + (app.demo ? "\n\nVous êtes en démonstration : les réponses utilisent des données fictives." : "")));
      accueilFait = true;
    }
    afficherSuggestions();
    marquerVues();
    if (!dlg.open) dlg.showModal();
    fil.scrollTop = fil.scrollHeight;
    if (!matchMedia("(pointer: coarse)").matches) champ.focus();
  }
  fab.addEventListener("click", ouvrir);
  window.addEventListener("brvm:ouvrir-assistant", (ev) => {
    if (fab.hidden) return;
    ouvrir().then(() => { if (ev.detail?.question) setTimeout(() => poser(ev.detail.question), 250); });   // premiers pas : question posée en une touche
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
    const cles = app.clesUrgentes?.() || [], n = vues ? cles.filter((k) => !vues.has(k)).length : app.urgentes(), badge = $(".ia-badge", fab);
    badge.hidden = !n; badge.textContent = n > 9 ? "9+" : String(n);
    fab.setAttribute("aria-label", n ? `Ouvrir Bim Bim (${n} nouvelle${n > 1 ? "s" : ""} alerte${n > 1 ? "s" : ""})` : "Ouvrir Bim Bim");
    if (n > dernierCompte && !CALME) { fab.classList.remove("cligne", "regarde", "saut"); void fab.offsetWidth; fab.classList.add("saut"); }   // un petit saut, seulement quand il y a du nouveau
    dernierCompte = n;
    window.dispatchEvent(new CustomEvent("bafi:alertes", { detail: { n } }));   // pastille de l'icône et de l'onglet (rappels.js)
  }
  // ---------------------------------------------------------------- petites animations d'ambiance (robot et coffre)
  // Discrètes et limitées : la première vers 10 s, puis une toutes les 20 à 40 s, 6 au plus par visite, jamais pendant que l'utilisateur
  // fait défiler, touche l'écran ou tape, ni quand la fenêtre est ouverte ou l'onglet caché.
  // Rien du tout si le téléphone demande de réduire les animations.
  const MAX_AMBIANCE = 3;
  let ambianceFaites = 0, derniereActivite = Date.now();
  for (const ev of ["scroll", "touchstart", "keydown", "pointerdown"])
    window.addEventListener(ev, () => { derniereActivite = Date.now(); }, { passive: true });
  const coffre = () => { const f = document.getElementById("fab-coffre"); return f && !f.hidden ? f : null; };
  function rejouer(el, classe) { el.classList.remove("cligne", "regarde", "allume", "saut"); void el.offsetWidth; el.classList.add(classe); }
  function jouerAmbiance() {
    if (CALME || ambianceFaites >= MAX_AMBIANCE) return;
    if (document.hidden || dlg.open || fab.hidden || Date.now() - derniereActivite < 4000) { planifierAmbiance(); return; }
    // Bim Bim et le coffre jouent chacun leur tour ; Bim Bim alterne clin d'œil et coup d'œil
    const c = coffre() && ambianceFaites % 2 === 0 ? "coffre" : (ambianceFaites % 4 < 2 ? "cligne" : "regarde");
    if (c === "coffre") {
      const cadran = coffre().querySelector("svg circle");
      if (cadran) { cadran.classList.add("cadran"); rejouer(coffre(), "allume"); }
    } else rejouer(fab, c);
    ambianceFaites++;
    planifierAmbiance();
  }
  function planifierAmbiance() {          // la première arrive vite (8 à 12 s), les suivantes toutes les 20 à 40 s
    if (!CALME && ambianceFaites < MAX_AMBIANCE) setTimeout(jouerAmbiance, ambianceFaites ? 45000 + Math.random() * 45000 : 20000 + Math.random() * 10000);
  }

  // ouvrir Bim Bim = avoir vu les alertes du moment (la liste est remplacée, les anciennes alertes en sortent)
  function marquerVues() {
    const app = window.BRVM_APP, cles = app?.clesUrgentes?.() || [];
    if (!app?.bafibot) return;
    const avant = vues ? [...vues].sort().join(",") : null;
    vues = new Set(cles);
    majBouton();
    if (avant !== [...vues].sort().join(",")) app.bafibot.vu(cles.slice(0, 200)).catch(() => { /* table pas encore installée */ });
  }
  // effacer l'historique : deux gestes (Effacer, puis confirmer)
  const zH = $(".ia-histo", dlg);
  $(".ia-effacer", zH).addEventListener("click", () => { $(".ia-conf", zH).hidden = false; $(".ia-effacer", zH).hidden = true; $(".ia-non", zH).focus(); });
  $(".ia-non", zH).addEventListener("click", () => { $(".ia-conf", zH).hidden = true; $(".ia-effacer", zH).hidden = false; $(".ia-effacer", zH).focus(); });
  $(".ia-oui", zH).addEventListener("click", async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try {
      await window.BRVM_APP.bafibot.effacer();
      anciens = []; histo.length = 0; fil.innerHTML = ""; accueilFait = false;
      zH.hidden = true; $(".ia-conf", zH).hidden = true; $(".ia-effacer", zH).hidden = false;
      bulle("ia", formater("Votre historique est effacé, sur tous vos appareils."));
      champ.focus();
    } catch (e) { bulle("ia erreur", `<p>L'historique n'a pas pu être effacé. Réessayez dans un instant.</p>`); }
    finally { b.disabled = false; }
  });

  // pas de réseau : Bim Bim rentre la tête et les pattes ; elle ressort au retour du réseau
  const reseau = () => fab.classList.toggle("horsligne", navigator.onLine === false);
  addEventListener("offline", reseau); addEventListener("online", reseau); reseau();

  window.addEventListener("brvm:pret", () => { majBouton(); chargerHisto(); setTimeout(cligner, 900); planifierAmbiance(); });

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

// Les boutons flottants (Bim Bim, coffre) se replient quand on fait défiler vers le bas — ils ne masquent plus
// les montants — et reviennent dès qu'on remonte, ou en haut et en bas de page.
(() => {
  let y0 = scrollY, tic = false;
  addEventListener("scroll", () => {
    if (tic) return; tic = true;
    requestAnimationFrame(() => {
      const y = scrollY, dy = y - y0, bas = innerHeight + y >= document.documentElement.scrollHeight - 40;
      if (y < 120 || bas || dy < -6) document.body.classList.remove("fab-cache");
      else if (dy > 6) document.body.classList.add("fab-cache");
      if (Math.abs(dy) > 6) y0 = y;
      tic = false;
    });
  }, { passive: true });
  addEventListener("hashchange", () => document.body.classList.remove("fab-cache"));
})();
