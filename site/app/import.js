/* BafiBourse – import des documents de la SGI : avis d'exécution, relevés de compte, avis de dividende.
 * L'utilisateur choisit un fichier (PDF ou photo) ou photographie son avis ; la fonction « lire-document » le fait lire
 * par l'API Claude ; l'application rapproche les titres des codes BRVM, repère les doublons et les montants douteux,
 * puis affiche un écran de vérification. Rien n'est enregistré sans validation, et l'import s'annule d'une touche.
 * Le document n'est jamais conservé : seules les opérations validées entrent dans le journal. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const F = (v) => (v === null || v === undefined || !isFinite(+v) ? "–" : nf.format(Math.round(+v)) + " F");
  const D = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR") : "");
  const auj = () => new Date().toISOString().slice(0, 10);
  const TYPES = { ACHAT: "Achat", VENTE: "Vente", DIVIDENDE: "Dividende", DEPOT: "Versement", RETRAIT: "Retrait", FRAIS: "Frais" };
  const TITRE = (t) => t === "ACHAT" || t === "VENTE" || t === "DIVIDENDE";
  const NATURES = { avis_execution: "Avis d'exécution", releve_compte: "Relevé de compte", avis_dividende: "Avis de dividende", autre: "Document" };
  let app = null, lignes = [], controles = [], erreurs = [];

  // ---------------------------------------------------------------- fenêtre
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="dlg-import" aria-labelledby="imp-titre">
      <div class="imp">
        <h2 id="imp-titre">Importer un document de ma SGI</h2>
        <section class="imp-choix">
          <p>Avis d'exécution, relevé de compte ou avis de dividende : BafiBourse lit le document et prépare les opérations.
            <b>Vous vérifiez tout avant l'enregistrement.</b></p>
          <div class="imp-boutons">
            <label class="btn primary imp-btn"><input type="file" accept="application/pdf,image/*" multiple data-imp="fichier">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/></svg>
              Choisir un fichier (PDF ou photo)</label>
            <label class="btn imp-btn"><input type="file" accept="image/*" capture="environment" data-imp="photo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
              Prendre une photo de l'avis</label>
          </div>
          <p class="small muted">Pour une photo : document posé à plat, bien éclairé, entièrement dans le cadre.
            Plusieurs fichiers peuvent être choisis à la fois.</p>
          <p class="small muted">Le document est lu puis oublié : seules les opérations que vous validez sont enregistrées.
            Vos nom, adresse et numéro de compte ne sont pas repris.</p>
          <div class="actions"><button type="button" class="btn" data-imp="fermer">Fermer</button></div>
        </section>
        <section class="imp-lecture" hidden aria-live="polite"><div class="imp-roue" aria-hidden="true"></div><p class="imp-etat"></p></section>
        <section class="imp-revue" hidden>
          <p class="imp-resume" aria-live="polite"></p>
          <div class="imp-docs"></div>
          <ul class="imp-liste"></ul>
          <div class="imp-ctrl"></div>
          <p class="msg err" role="status" aria-live="polite"></p>
          <div class="actions"><button type="button" class="btn" data-imp="fermer">Annuler</button>
            <button type="button" class="btn primary" data-imp="enregistrer">Enregistrer</button></div>
        </section>
      </div>
    </dialog>`);
  const dlg = $("#dlg-import");
  const etape = (n) => ["choix", "lecture", "revue"].forEach((k) => ($(`.imp-${k}`, dlg).hidden = k !== n));

  function ouvrir() {
    if (!app) return;
    app.fermerOperation?.();
    lignes = []; controles = []; erreurs = [];
    dlg.querySelectorAll("input[type=file]").forEach((i) => (i.value = ""));
    etape("choix");
    dlg.showModal();
  }

  // ---------------------------------------------------------------- préparation des fichiers
  const versBase64 = (blob) => new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => ko(new Error("Lecture du fichier impossible"));
    r.readAsDataURL(blob);
  });
  // Photo réduite à 2 200 pixels de côté au plus : plus légère à envoyer, tout aussi lisible
  async function reduire(fichier) {
    try {
      const img = await createImageBitmap(fichier);
      const k = Math.min(1, 2200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
      return { type: "image/jpeg", donnees: await versBase64(blob) };
    } catch (e) { return { type: fichier.type || "image/jpeg", donnees: await versBase64(fichier) }; }
  }
  async function lire(fichiers) {
    if (!fichiers.length) return;
    etape("lecture");
    const docs = [];
    for (let i = 0; i < fichiers.length; i++) {
      const f = fichiers[i];
      $(".imp-etat", dlg).textContent = `Lecture de « ${f.name || "photo"} »${fichiers.length > 1 ? ` (${i + 1} sur ${fichiers.length})` : ""}… quelques secondes.`;
      try {
        const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");
        if (pdf && f.size > 6.5e6) throw new Error("PDF trop lourd (6 Mo au plus)");
        const { type, donnees } = pdf ? { type: "application/pdf", donnees: await versBase64(f) } : await reduire(f);
        docs.push({ nom: f.name || "Photo", res: await app.lireDocument(type, donnees) });
      } catch (e) { erreurs.push(`${f.name || "Photo"} : ${e.message}`); }
    }
    preparer(docs);
    afficher();
    etape("revue");
  }

  // ---------------------------------------------------------------- rapprochement des titres avec les codes BRVM
  const PAYS = new Set(["CI", "COTE", "IVOIRE", "D", "SENEGAL", "BURKINA", "FASO", "MALI", "NIGER", "TOGO", "BENIN", "GUINEE", "BISSAU", "SA", "SN", "BF", "ML", "NE", "TG", "BJ"]);
  const VIDES = new Set(["DE", "DU", "DES", "LA", "LE", "LES", "ET", "L", "THE", "OF"]);
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const mots = (t) => norm(t).split(" ").filter((m) => m && !VIDES.has(m));
  function rapprocher(libelle) {
    const doc = mots(libelle);
    if (!doc.length) return { code: "", sur: false };
    const coeurDoc = doc.filter((m) => !PAYS.has(m)), paysDoc = doc.filter((m) => PAYS.has(m));
    let meilleurs = [];
    for (const t of app.titres()) {
      if (doc.includes(norm(t.code))) { meilleurs.push({ t, s: 2 }); continue; }
      const cand = mots(t.nom), coeur = cand.filter((m) => !PAYS.has(m));
      if (!coeur.length || !coeurDoc.length) continue;
      const commun = coeurDoc.filter((m) => coeur.includes(m)).length;
      if (!commun) continue;
      const s = commun / new Set([...coeurDoc, ...coeur]).size + 0.15 * paysDoc.filter((m) => cand.includes(m)).length;
      meilleurs.push({ t, s });
    }
    meilleurs.sort((a, b) => b.s - a.s);
    const [a, b] = meilleurs;
    if (!a || a.s < 0.5) return { code: "", sur: false };
    return { code: a.t.code, sur: !(b && a.s - b.s < 0.05) };
  }

  // ---------------------------------------------------------------- lignes à vérifier
  function preparer(docs) {
    const deja = app.operations(), lot = [];
    const meme = (o, x) => o.type === x.type && o.date === x.date && (o.ticker || "") === (x.code || "")
      && (TITRE(x.type) && x.type !== "DIVIDENDE" ? +o.quantite === +x.quantite : Math.abs(+o.montant - +x.montant) < 1);
    lignes = [];
    for (const d of docs) {
      const nature = NATURES[d.res?.document?.nature] || "Document";
      if (d.res?.remarques) erreurs.push(`${d.nom} : ${d.res.remarques}`);
      for (const o of d.res?.operations || []) {
        const x = { doc: `${nature} · ${d.nom}`, type: TYPES[o.type] ? o.type : "FRAIS", date: (o.date || "").slice(0, 10), titreLu: o.titre || "",
                    code: "", sur: true, quantite: o.quantite ? Math.abs(+o.quantite) : null, prix: o.cours ?? null, frais: o.frais ?? null,
                    montant: o.montant_net ?? o.montant_brut ?? null, brut: o.montant_brut ?? null,
                    note: [o.libelle, o.reference ? `avis n° ${o.reference}` : ""].filter(Boolean).join(" · ").slice(0, 120) || null, alertes: [], sel: true };
        if (TITRE(x.type) && x.titreLu) Object.assign(x, rapprocher(x.titreLu));
        if (deja.some((op) => meme(op, x)) || lot.some((y) => meme({ ...y, ticker: y.code }, x))) { x.sel = false; x.doublon = true; }
        lot.push(x); lignes.push(x);
      }
      const pos = d.res?.positions || [], liq = d.res?.liquidites;
      if (pos.length || liq?.montant != null) controles.push({ doc: `${nature} · ${d.nom}`, pos, liq });
    }
    lignes.forEach(verifier);
  }
  // Points à vérifier d'une ligne (recalculés à chaque modification)
  function verifier(x) {
    const a = [];
    if (x.doublon) a.push("Déjà dans votre journal : décochée pour éviter un doublon.");
    if (!x.date) a.push("Date manquante.");
    else if (x.date > auj()) a.push("Date dans le futur.");
    if (TITRE(x.type) && !x.code) a.push(x.titreLu ? `Titre « ${x.titreLu} » non reconnu : choisissez-le dans la liste.` : "Choisissez le titre.");
    else if (TITRE(x.type) && !x.sur) a.push(`Titre « ${x.titreLu} » rapproché de ${app.nomTitre(x.code)} : vérifiez.`);
    if (x.type === "ACHAT" || x.type === "VENTE") {
      if (!(x.quantite > 0) || !(x.prix > 0)) a.push("Quantité ou cours manquant.");
      else if (x.brut && Math.abs(x.quantite * x.prix - x.brut) > Math.max(2, x.brut * 0.01)) a.push(`Montant à vérifier : ${nf.format(x.quantite)} × ${F(x.prix)} ne donne pas ${F(x.brut)}.`);
      if (x.frais == null) a.push("Frais non trouvés : estimés à 1,3 % si vous laissez vide.");
    } else if (!(x.montant > 0)) a.push("Montant manquant.");
    x.alertes = a;
    x.bloquant = !x.date || x.date > auj() || (TITRE(x.type) && !x.code) || ((x.type === "ACHAT" || x.type === "VENTE") ? !(x.quantite > 0) || !(x.prix > 0) : !(x.montant > 0));
  }

  // ---------------------------------------------------------------- écran de vérification
  const options = (code) => {
    const t = app.titres().slice().sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr"));
    return `<option value="">Choisir le titre…</option>` + t.map((x) => `<option value="${esc(x.code)}"${x.code === code ? " selected" : ""}>${esc(x.nom)} (${esc(x.code)})</option>`).join("");
  };
  const champ = (k, i, lib, v, attrs = "") => `<label class="imp-ch">${lib}<input data-k="${k}" data-i="${i}" ${attrs} value="${v ?? ""}"></label>`;
  function ligneHtml(x, i) {
    const trade = x.type === "ACHAT" || x.type === "VENTE";
    return `<li class="imp-op${x.sel ? "" : " off"}${x.alertes.length ? " a-voir" : ""}" data-i="${i}">
      <div class="imp-tete"><label class="imp-sel"><input type="checkbox" data-k="sel" data-i="${i}"${x.sel ? " checked" : ""}${x.bloquant ? " disabled" : ""}>
          <span class="sr-only">Importer cette opération</span></label>
        <select data-k="type" data-i="${i}" aria-label="Type d'opération">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${k === x.type ? " selected" : ""}>${t}</option>`).join("")}</select>
        <input type="date" data-k="date" data-i="${i}" value="${x.date}" max="${auj()}" aria-label="Date"></div>
      ${TITRE(x.type) ? `<label class="imp-ch imp-titre">Titre${x.titreLu ? ` <span class="muted">(lu : ${esc(x.titreLu)})</span>` : ""}<select data-k="code" data-i="${i}">${options(x.code)}</select></label>` : ""}
      <div class="imp-champs">${trade
        ? champ("quantite", i, "Quantité", x.quantite, 'type="number" min="0" step="any" inputmode="decimal"') + champ("prix", i, "Cours (F)", x.prix, 'type="number" min="0" step="any" inputmode="decimal"')
          + champ("frais", i, "Frais (F)", x.frais, 'type="number" min="0" step="any" inputmode="decimal"')
        : champ("montant", i, "Montant (F)", x.montant, 'type="number" min="0" step="any" inputmode="decimal"')}</div>
      ${x.note ? `<p class="small muted imp-note">${esc(x.note)}</p>` : ""}
      ${x.alertes.map((a) => `<p class="imp-alerte">${esc(a)}</p>`).join("")}</li>`;
  }
  function majPied() {
    const n = lignes.filter((x) => x.sel && !x.bloquant).length;
    const b = $('[data-imp="enregistrer"]', dlg);
    b.disabled = !n; b.textContent = n ? `Enregistrer ${n > 1 ? `les ${n} opérations` : "l'opération"}` : "Rien à enregistrer";
  }
  function afficher() {
    const n = lignes.length;
    $(".imp-resume", dlg).innerHTML = n ? `<b>${n} opération${n > 1 ? "s" : ""} trouvée${n > 1 ? "s" : ""}.</b> Vérifiez-les, corrigez si besoin, puis enregistrez.`
      : "<b>Aucune opération trouvée dans ce document.</b>";
    $(".imp-docs", dlg).innerHTML = erreurs.map((e) => `<p class="imp-alerte">${esc(e)}</p>`).join("");
    $(".imp-liste", dlg).innerHTML = lignes.map(ligneHtml).join("");
    $(".imp-ctrl", dlg).innerHTML = controlesHtml();
    $(".msg", dlg).textContent = "";
    majPied();
  }
  // Contrôle : positions et liquidités de la SGI comparées au journal
  function controlesHtml() {
    if (!controles.length) return "";
    const j = app.journal();
    return controles.map((c) => {
      const lignesPos = c.pos.map((p) => {
        const r = rapprocher(p.titre), enJournal = r.code ? (j.positions.find((x) => x.code === r.code)?.quantite || 0) : null;
        const ecart = enJournal === null ? null : +p.quantite - enJournal;
        return `<tr><th scope="row">${esc(r.code ? app.nomTitre(r.code) : p.titre)}</th><td class="num">${nf.format(p.quantite)}</td>
          <td class="num">${enJournal === null ? "?" : nf.format(enJournal)}</td><td class="num ${ecart ? "neg" : ""}">${ecart === null ? "–" : ecart ? (ecart > 0 ? "+" : "") + nf.format(ecart) : "✓"}</td></tr>`;
      }).join("");
      return `<details class="aide imp-controle"><summary>Contrôle avec ${esc(c.doc)}</summary>
        ${lignesPos ? `<div class="scroll-x"><table class="decomp"><thead><tr><th>Titre</th><th class="num">SGI</th><th class="num">Journal</th><th class="num">Écart</th></tr></thead><tbody>${lignesPos}</tbody></table></div>
          <p class="small muted">Positions de la SGI à la date du relevé, comparées à votre journal d'aujourd'hui (avant cet import).</p>` : ""}
        ${c.liq?.montant != null ? `<p class="small">Liquidités chez la SGI${c.liq.date ? ` au ${D(c.liq.date)}` : ""} : <b>${F(c.liq.montant)}</b> ·
          disponible selon votre journal aujourd'hui : <b>${F(j.cash)}</b>.</p>` : ""}</details>`;
    }).join("");
  }

  // Modification d'un champ : on met à jour la ligne et ses points à vérifier
  dlg.addEventListener("change", (ev) => {
    const el = ev.target, i = el.dataset.i, k = el.dataset.k;
    if (el.dataset.imp === "fichier" || el.dataset.imp === "photo") return lire([...el.files]);
    if (i === undefined) return;
    const x = lignes[+i];
    if (k === "sel") x.sel = el.checked;
    else if (k === "type" || k === "date" || k === "code") { x[k] = el.value; if (k === "code") x.sur = true; }
    else x[k] = el.value === "" ? null : +el.value;
    if (k !== "sel") { x.doublon = x.doublon && k !== "date" && k !== "type"; const avant = x.bloquant; verifier(x); if (avant && !x.bloquant) x.sel = true; }
    const li = $(`.imp-op[data-i="${i}"]`, dlg);
    if (k === "sel") { li.classList.toggle("off", !x.sel); return majPied(); }
    if (k === "type" || k === "code" || x.bloquant !== undefined) { li.outerHTML = ligneHtml(x, +i); majPied(); }
  });

  // ---------------------------------------------------------------- enregistrement (tout ou rien) et annulation
  dlg.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-imp]");
    if (!b) return;
    if (b.dataset.imp === "fermer") return dlg.close();
    if (b.dataset.imp !== "enregistrer") return;
    const choisies = lignes.filter((x) => x.sel && !x.bloquant);
    // une vente ne peut dépasser ce qui est détenu (journal + achats du même import, dans l'ordre des dates)
    const j = app.journal(), stock = new Map(j.positions.map((p) => [p.code, p.quantite]));
    for (const x of [...choisies].sort((a, b) => a.date.localeCompare(b.date))) {
      if (x.type === "ACHAT") stock.set(x.code, (stock.get(x.code) || 0) + x.quantite);
      if (x.type === "VENTE") {
        const q = stock.get(x.code) || 0;
        if (x.quantite > q + 1e-9) { $(".msg", dlg).textContent = `Vente de ${nf.format(x.quantite)} ${app.nomTitre(x.code)} le ${D(x.date)} : vous n'en détenez que ${nf.format(q)}. Importez d'abord l'achat, ou décochez cette vente.`; return; }
        stock.set(x.code, q - x.quantite);
      }
    }
    const ops = choisies.map((x) => {
      const trade = x.type === "ACHAT" || x.type === "VENTE";
      return { date: x.date, type: x.type, ticker: TITRE(x.type) ? x.code : null, quantite: trade ? x.quantite : null, prix: trade ? x.prix : null,
               frais: trade ? x.frais : null, montant: trade ? null : x.montant, note: ("Import · " + (x.note || "document de la SGI")).slice(0, 140) };
    });
    b.disabled = true; b.textContent = "Enregistrement…";
    try {
      const ids = await app.ajouterOperations(ops);
      dlg.close();
      app.toast(`${ops.length > 1 ? `${ops.length} opérations importées` : "Opération importée"}`, {
        detail: "Votre journal et vos calculs sont à jour.",
        actions: ids?.length ? [{ label: "Annuler l'import", fn: async () => { await app.supprimerOperations(ids); app.toast("Import annulé."); } }] : [] });
      window.dispatchEvent(new CustomEvent("brvm:import", { detail: { n: ops.length } }));
    } catch (e) { $(".msg", dlg).textContent = "Enregistrement impossible : " + e.message; majPied(); }
  });

  document.addEventListener("click", (ev) => { if (ev.target.closest("[data-import]")) ouvrir(); });
  window.addEventListener("brvm:pret", () => { app = window.BRVM_APP?.lireDocument ? window.BRVM_APP : null; });
})();
