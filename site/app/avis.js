/* BafiBourse – avis des utilisateurs : note de 1 à 5 étoiles et commentaire.
 * • La fenêtre de notation s'ouvre d'elle-même juste après un moment de réussite (jamais lié à un gain en bourse) :
 *   trophée d'épargne, épargne envoyée à la SGI, dividende enregistré, premier achat suivi d'une proposition
 *   (à la visite suivante), fidélité (5 jours de visite sur 14), premiers pas terminés depuis 7 jours.
 * • Règles : 7 jours après l'inscription et 3 opérations notées ; aucune autre fenêtre ouverte, pas de visite guidée,
 *   pas d'alerte rouge ; une demande tous les 30 jours au plus, 3 par an au plus ; plus jamais une fois l'avis donné
 *   ou après « Ne plus me demander ».
 * • Dans le Profil : donner ou modifier son avis à tout moment, et voir s'il est publié.
 * • Chaque demande est notée avec son déclencheur (table avis_demandes) pour mesurer ce qui fonctionne.
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
        <p class="av-intro" hidden></p>
        <fieldset class="av-etoiles">
          <legend>Votre note</legend>
          <div class="av-rangee">${[1, 2, 3, 4, 5].map((n) => `
            <label class="av-etoile"><input type="radio" name="note" value="${n}">
              <span class="sr-only">${n} étoile${n > 1 ? "s" : ""} : ${NOTES[n]}</span>${ETOILE}</label>`).join("")}</div>
          <p class="av-libelle" aria-live="polite"></p>
        </fieldset>
        <fieldset class="av-reco">
          <legend>Recommanderiez-vous BafiBourse à un proche ? <span class="muted">(facultatif)</span></legend>
          <div class="av-echelle">${Array.from({ length: 11 }, (_, n) => `<label><input type="radio" name="reco" value="${n}"><span>${n}</span></label>`).join("")}</div>
          <div class="av-bornes small muted" aria-hidden="true"><span>Pas du tout</span><span>Certainement</span></div>
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
        <p class="av-jamais-l" hidden><button type="button" class="btn link small av-jamais">Ne plus me demander</button></p>
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
  let declencheur = null, repondu = false;              // déclencheur de la fenêtre en cours (null : ouverte depuis le Profil)
  const journal = (reponse, note) => declencheur && app.noterDemandeAvis({ declencheur, reponse, note: note ?? null });
  $(".av-annuler", dlg).addEventListener("click", () => { if (declencheur && !repondu) { repondu = true; journal("plus_tard"); } dlg.close(); });
  $(".av-jamais", dlg).addEventListener("click", () => {
    if (declencheur && !repondu) { repondu = true; journal("jamais"); }
    app.sauverTutoriel({ ...(app.tutoriel() || {}), avis_jamais: true });
    dlg.close();
  });
  dlg.addEventListener("close", () => { if (declencheur && !repondu) journal("fermee"); declencheur = null; });

  const INTROS = {
    trophee: "Bravo pour ce trophée ! Vous avez un instant pour noter BafiBourse ?",
    transfert: "Votre épargne est en route vers votre SGI. Que pensez-vous de BafiBourse ?",
    dividende: "Un dividende de plus dans votre journal. Que pensez-vous de BafiBourse ?",
    achat: "Vous avez suivi une proposition jusqu'à l'achat. Que pensez-vous de BafiBourse ?",
    fidelite: "Vous suivez votre épargne régulièrement. Que pensez-vous de BafiBourse ?",
    premiers_pas: "Vous utilisez BafiBourse depuis quelques jours. Qu'en pensez-vous ?",
  };
  function ouvrir(note, decl = null) {
    const a = avis || {};
    declencheur = decl; repondu = false;
    $(".av-intro", dlg).hidden = !decl; $(".av-intro", dlg).textContent = decl ? INTROS[decl] || "" : "";
    $(".av-jamais-l", dlg).hidden = !decl;
    f.reset();
    const n = note || a.note;
    if (n) f.note.value = String(n);
    f.commentaire.value = a.commentaire || "";
    if (a.recommandation != null) f.reco.value = String(a.recommandation);
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
    if (decl) journal("proposee");
  }

  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const note = +(f.note.value || 0), msg = $(".msg", dlg);
    if (!note) { msg.textContent = "Choisissez une note de 1 à 5 étoiles."; return; }
    const envoi = { note, commentaire: f.commentaire.value.trim() || null, publication: f.publication.checked, ville: f.ville.value.trim() || null,
                    recommandation: f.reco.value === "" ? null : +f.reco.value };
    const avant = ok.textContent;
    ok.disabled = true; ok.setAttribute("aria-busy", "true"); ok.textContent = "Envoi…";
    try {
      const r = await app.donnerAvis(envoi);
      avis = { ...envoi, statut: r?.statut || "prive" };
      if (declencheur && !repondu) { repondu = true; journal("donnee", note); }
      dlg.close();
      const fan = envoi.recommandation >= 9;
      app.toast("Merci pour votre avis !", { detail: fan ? "Et merci de nous recommander : partagez BafiBourse avec un proche en une touche."
        : avis.statut === "en_attente" ? "Il apparaîtra sur le site après relecture par l'équipe."
        : envoi.publication ? "Pour être publié, un commentaire doit compter au moins 20 caractères." : "Il aide l'équipe à améliorer BafiBourse.",
        actions: fan ? [{ label: "Recommander à un proche", fn: recommander }] : [] });
      app.render();
    } catch (e) { msg.textContent = "Envoi impossible : " + e.message; }
    finally { ok.disabled = false; ok.removeAttribute("aria-busy"); ok.textContent = avant; }
  });

  // Partage de l'application (sans montant) : menu de partage du téléphone, sinon WhatsApp
  async function recommander() {
    const url = "https://bafigo.github.io/brvm-app/";
    const texte = "J'utilise BafiBourse pour épargner chaque jour et suivre mes placements à la BRVM. Essaie, c'est gratuit : " + url;
    try { if (navigator.share) return await navigator.share({ text: texte }); } catch (e) { if (e.name === "AbortError") return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(texte), "_blank", "noopener");
  }

  // ---------------------------------------------------------------- déclencheurs automatiques
  const JOUR = 864e5;
  const etat = () => app.tutoriel() || {};
  const sauver = (maj) => app.sauverTutoriel({ ...etat(), ...maj });
  function peutDemander() {
    if (!app || !charge || avis) return false;
    const e = etat();
    if (e.avis_jamais) return false;
    if (document.querySelector("dialog[open]") || ($("#tuto") && !$("#tuto").hidden)) return false;
    if (app.alerteRouge?.()) return false;
    if (!app.demo && (app.joursInscription() < 7 || app.nbOps() < 3)) return false;
    const d = (e.avis_demandes || []).filter((t) => Date.now() - t < 365 * JOUR);
    if (d.some((t) => Date.now() - t < 30 * JOUR) || d.length >= 3) return false;
    if (e.avis_plus_tard && Date.now() - e.avis_plus_tard < 30 * JOUR) return false;
    return true;
  }
  // Propose la notation après un court délai (le temps de lire la confirmation) ; « une fois » : déclencheur à usage unique
  function proposer(decl, delai = 900, uneFois = false) {
    setTimeout(() => {
      if (!peutDemander()) return;
      const e = etat();
      if (uneFois && e.avis_vus?.[decl]) return;
      sauver({ avis_demandes: [...(e.avis_demandes || []).filter((t) => Date.now() - t < 365 * JOUR), Date.now()],
               avis_vus: { ...(e.avis_vus || {}), [decl]: 1 } });
      ouvrir(null, decl);
    }, delai);
  }
  // « Plus tard » : la prochaine demande attendra 30 jours
  $(".av-annuler", dlg).addEventListener("click", () => { if (declencheur) sauver({ avis_plus_tard: Date.now() }); });

  // 1. trophée d'épargne : après la fermeture de l'écran « Bravo »
  document.addEventListener("close", (ev) => { if (ev.target?.id === "dlg-bravo") proposer("trophee", 700); }, true);
  // 2. épargne envoyée à la SGI, 3. dividende, 4. premier achat suivi d'une proposition (proposé à la visite suivante)
  window.addEventListener("brvm:coffre", (ev) => { if (ev.detail?.mode === "transfert") proposer("transfert", 2500); });
  window.addEventListener("brvm:operation", (ev) => {
    const d = ev.detail || {};
    if (d.type === "DIVIDENDE") proposer("dividende", 3000);
    if (d.type === "ACHAT" && d.depuisOrdre && !etat().avis_vus?.achat && app) sauver({ avis_attente: "achat" });
  });
  // À l'ouverture : achat en attente, 5. fidélité, 6. premiers pas terminés depuis 7 jours
  function auDemarrage() {
    const e = etat(), jour = new Date().toISOString().slice(0, 10);
    const visites = [...new Set([...(e.visites || []), jour])].filter((d) => Date.now() - new Date(d) < 14 * JOUR);
    if (visites.join() !== (e.visites || []).join()) sauver({ visites });
    if (e.avis_attente) { sauver({ avis_attente: null }); return proposer(e.avis_attente, 2500, true); }
    if (visites.length >= 5 && !e.avis_vus?.fidelite) return proposer("fidelite", 2500, true);
    if (e.liste === "terminee" && (!e.liste_le || Date.now() - e.liste_le >= 7 * JOUR) && !e.avis_vus?.premiers_pas)
      return proposer("premiers_pas", 2500, true);
  }

  // ---------------------------------------------------------------- carte dans le Profil
  const etoilesFixes = (n) => `<span class="av-fixes" role="img" aria-label="${n} sur 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}">${ETOILE}</i>`).join("")}</span>`;
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
    const b = ev.target.closest("[data-av]");
    if (!b || !app) return;
    if (b.dataset.av === "ouvrir") return ouvrir();
  });
  window.addEventListener("brvm:maj", () => {
    if (!app || !charge) return;
    setTimeout(() => { if (app.tab() === "profil") carteProfil(); }, 0);
  });
  window.addEventListener("brvm:pret", async () => {
    app = window.BRVM_APP;
    if (!app?.monAvis) { app = null; return; }
    try { avis = await app.monAvis(); charge = true; }
    catch (e) { return; }                                  // avis.sql pas encore installé : rien n'est affiché
    window.dispatchEvent(new Event("brvm:maj"));
    auDemarrage();
  });
})();
