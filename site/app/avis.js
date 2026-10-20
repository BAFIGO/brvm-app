/* BafiBourse – avis des utilisateurs : note de 1 à 5 étoiles et commentaire.
 * • Invitation discrète sur l'écran Aujourd'hui, une fois l'application vraiment utilisée
 *   (7 jours après l'inscription et 3 opérations notées) ; « Plus tard » la reporte de 60 jours.
 * • Dans le Profil : donner ou modifier son avis à tout moment, et voir s'il est publié.
 * • Rien n'est publié sans l'accord de l'utilisateur ni sans relecture dans la console (avis.sql). */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NOTES = ["", "Décevant", "Moyen", "Bien", "Très bien", "Excellent"];
  const STATUTS = { en_attente: "En cours de relecture avant publication", publie: "Publié sur le site BafiBourse",
                    refuse: "Non publié sur le site", prive: "Gardé privé : lu seulement par l'équipe" };
  const ETOILE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.35 2.85 1-6L3.3 9.6l6-.9z"/></svg>`;
  let app = null, avis, charge = false;

  // ---------------------------------------------------------------- fenêtre de notation
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="dlg-avis" aria-labelledby="av-titre">
      <form method="dialog" novalidate>
        <h2 id="av-titre">Votre avis sur BafiBourse</h2>
        <fieldset class="av-etoiles">
          <legend>Votre note</legend>
          <div class="av-rangee">${[1, 2, 3, 4, 5].map((n) => `
            <label class="av-etoile"><input type="radio" name="note" value="${n}">
              <span class="sr-only">${n} étoile${n > 1 ? "s" : ""} : ${NOTES[n]}</span>${ETOILE}</label>`).join("")}</div>
          <p class="av-libelle" aria-live="polite"></p>
        </fieldset>
        <label for="av-texte">Votre commentaire <span class="muted">(facultatif)</span></label>
        <textarea id="av-texte" name="commentaire" rows="4" maxlength="400" placeholder="Ce qui vous aide, ce qui vous manque…"></textarea>
        <p class="small muted av-compte" aria-live="polite"></p>
        <p class="small av-ameliorer" hidden>Dites-nous ce que nous pouvons améliorer : chaque avis est lu par l'équipe.</p>
        <label class="av-accord"><input type="checkbox" name="publication">
          <span>J'accepte que ce commentaire soit publié sur le site BafiBourse sous le nom <b class="av-nom"></b>, après relecture.</span></label>
        <div class="av-ville" hidden>
          <label for="av-ville">Votre ville <span class="muted">(facultatif, affichée avec votre nom)</span></label>
          <input id="av-ville" name="ville" maxlength="40" autocomplete="address-level2">
        </div>
        <p class="small muted">N'indiquez ni montant, ni gain, ni information personnelle : ces avis ne sont pas publiés.</p>
        <p class="msg err" role="status" aria-live="polite"></p>
        <div class="actions"><button type="button" class="btn av-annuler">Plus tard</button>
          <button type="submit" class="btn primary av-ok" value="ok">Envoyer mon avis</button></div>
      </form>
    </dialog>`);
  const dlg = $("#dlg-avis"), f = $("form", dlg);
  const libelle = $(".av-libelle", dlg), compte = $(".av-compte", dlg), ok = $(".av-ok", dlg);

  function majEtoiles() {
    const n = +(f.note.value || 0);
    dlg.querySelectorAll(".av-etoile").forEach((l, i) => l.classList.toggle("on", i < n));
    libelle.textContent = n ? `${n} sur 5 : ${NOTES[n]}` : "Touchez une étoile pour noter.";
    $(".av-ameliorer", dlg).hidden = !(n && n <= 3);
  }
  function majTexte() {
    const l = f.commentaire.value.trim().length;
    compte.textContent = `${l} / 400 caractères${f.publication.checked && l < 20 ? " · 20 au moins pour être publié" : ""}`;
  }
  dlg.addEventListener("change", (ev) => {
    if (ev.target.name === "note") majEtoiles();
    if (ev.target.name === "publication") { $(".av-ville", dlg).hidden = !f.publication.checked; majTexte(); }
  });
  f.commentaire.addEventListener("input", majTexte);
  $(".av-annuler", dlg).addEventListener("click", () => dlg.close());

  function ouvrir(note) {
    const a = avis || {};
    f.reset();
    const n = note || a.note;
    if (n) f.note.value = String(n);
    f.commentaire.value = a.commentaire || "";
    f.publication.checked = !!a.publication;
    f.ville.value = a.ville || "";
    $(".av-ville", dlg).hidden = !f.publication.checked;
    const nom = app.nomAffiche();
    $(".av-nom", dlg).textContent = nom ? `« ${nom} »` : "« votre prénom »";
    f.publication.disabled = !nom;                     // sans prénom au profil, pas de publication possible
    $(".av-sans-nom", dlg)?.remove();
    if (!nom) $(".av-accord", dlg).insertAdjacentHTML("afterend", `<p class="small muted av-sans-nom">Pour publier votre commentaire, ajoutez d'abord votre prénom dans le Profil.</p>`);
    $(".msg", dlg).textContent = "";
    ok.textContent = avis ? "Mettre à jour mon avis" : "Envoyer mon avis";
    majEtoiles(); majTexte();
    dlg.showModal();
    (n ? f.commentaire : dlg.querySelector('[name="note"]')).focus();
  }

  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const note = +(f.note.value || 0), msg = $(".msg", dlg);
    if (!note) { msg.textContent = "Choisissez une note de 1 à 5 étoiles."; return; }
    const envoi = { note, commentaire: f.commentaire.value.trim() || null, publication: f.publication.checked, ville: f.ville.value.trim() || null };
    const avant = ok.textContent;
    ok.disabled = true; ok.setAttribute("aria-busy", "true"); ok.textContent = "Envoi…";
    try {
      const r = await app.donnerAvis(envoi);
      avis = { ...envoi, statut: r?.statut || "prive" };
      dlg.close();
      app.toast("Merci pour votre avis !", { detail: avis.statut === "en_attente"
        ? "Il apparaîtra sur le site après relecture par l'équipe."
        : envoi.publication ? "Pour être publié, un commentaire doit compter au moins 20 caractères." : "Il aide l'équipe à améliorer BafiBourse." });
      app.render();
    } catch (e) { msg.textContent = "Envoi impossible : " + e.message; }
    finally { ok.disabled = false; ok.removeAttribute("aria-busy"); ok.textContent = avant; }
  });

  // ---------------------------------------------------------------- invitation sur Aujourd'hui, carte dans le Profil
  const etoilesFixes = (n) => `<span class="av-fixes" role="img" aria-label="${n} sur 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}">${ETOILE}</i>`).join("")}</span>`;
  function inviter() {
    const v = $("#v-aujourdhui");
    if (!v || v.hidden || $(".av-invite", v) || avis) return;
    const e = app.tutoriel() || {};
    if (e.avis_plus_tard && Date.now() - e.avis_plus_tard < 60 * 864e5) return;
    if (!app.demo && (app.joursInscription() < 7 || app.nbOps() < 3)) return;
    const html = `<div class="card av-invite"><h2>Que pensez-vous de BafiBourse ?</h2>
      <p class="small muted">Votre note nous aide à améliorer l'application, et peut aider d'autres épargnants à se lancer.</p>
      <div class="av-rangee" role="group" aria-label="Noter BafiBourse">${[1, 2, 3, 4, 5].map((n) =>
        `<button type="button" class="av-etoile" data-av-note="${n}" aria-label="${n} étoile${n > 1 ? "s" : ""} : ${NOTES[n]}">${ETOILE}</button>`).join("")}</div>
      <button type="button" class="btn link small" data-av="plus-tard">Plus tard</button></div>`;
    const apres = $(".tuto-liste", v) || $(".synthese", v);
    if (apres) apres.insertAdjacentHTML("afterend", html); else v.insertAdjacentHTML("beforeend", html);
  }
  function carteProfil() {
    const v = $("#v-profil");
    if (!v || v.hidden || $(".av-profil", v)) return;
    const st = avis?.statut;
    const html = `<div class="card av-profil"><h2>Votre avis</h2>
      ${avis ? `<p>${etoilesFixes(avis.note)} <span class="small muted">${esc(STATUTS[st] || "")}</span></p>
        ${avis.commentaire ? `<p class="small">« ${esc(avis.commentaire)} »</p>` : ""}`
      : `<p class="small muted">Notez BafiBourse de 1 à 5 étoiles et dites-nous ce que vous en pensez.</p>`}
      <div class="actions"><button type="button" class="btn" data-av="ouvrir">${avis ? "Modifier mon avis" : "Donner mon avis"}</button></div></div>`;
    const aide = $(".tuto-aide", v);
    if (aide) aide.insertAdjacentHTML("beforebegin", html); else v.insertAdjacentHTML("beforeend", html);
  }

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-av-note], [data-av]");
    if (!b || !app) return;
    if (b.dataset.avNote) return ouvrir(+b.dataset.avNote);
    if (b.dataset.av === "ouvrir") return ouvrir();
    if (b.dataset.av === "plus-tard") {
      const e = { ...(app.tutoriel() || {}), avis_plus_tard: Date.now() };
      app.sauverTutoriel(e);
      b.closest(".av-invite")?.remove();
    }
  });
  window.addEventListener("brvm:maj", () => {
    if (!app || !charge) return;
    setTimeout(() => { const t = app.tab(); if (t === "aujourdhui") inviter(); else if (t === "profil") carteProfil(); }, 0);
  });
  window.addEventListener("brvm:pret", async () => {
    app = window.BRVM_APP;
    if (!app?.monAvis) { app = null; return; }
    try { avis = await app.monAvis(); charge = true; }
    catch (e) { return; }                                  // avis.sql pas encore installé : rien n'est affiché
    window.dispatchEvent(new Event("brvm:maj"));
  });
})();
