/* BafiBourse – « Mon abonnement » (rubrique du Profil).
 * Formule en cours et jours restants, consommation du mois (BafiBot, pages importées), les trois formules, les packs,
 * le parrainage. En attendant l'agrégateur, « Choisir » enregistre une demande ; la console l'active à réception du paiement. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("fr-FR");
  const F = (n) => nf.format(n).replace(/\u202f/g, " ") + " F";
  let app = null;

  // Lien de parrainage : le code attend la connexion ou l'inscription
  try {
    const c = new URLSearchParams(location.search).get("parrain");
    if (c) { localStorage.setItem("brvm-parrain", c.toUpperCase().slice(0, 12)); const u = new URL(location.href); u.searchParams.delete("parrain"); history.replaceState(null, "", u.pathname + u.search + u.hash); }
  } catch (e) { /* stockage indisponible */ }

  const DEF_PRIX = { essentiel_mois: ["Essentiel · 1 mois", 1000, 1], essentiel_3mois: ["Essentiel · 3 mois", 2700, 3], essentiel_an: ["Essentiel · 1 an", 10000, 12],
    investisseur_mois: ["Investisseur · 1 mois", 3000, 1], investisseur_an: ["Investisseur · 1 an", 30000, 12],
    pack_questions: ["Pack BafiBot · 50 questions", 500, 0, 50, 0], pack_pages: ["Pack import · 20 pages", 500, 0, 0, 20] };
  const DEF_Q = { decouverte: { questions: 10, questions_debut: 20, approfondies: 0, pages: 2 }, essentiel: { questions: 100, questions_debut: 0, approfondies: 0, pages: 15 },
    investisseur: { questions: 300, questions_debut: 0, approfondies: 20, pages: 40 } };
  // Offres actives : { objet: [libellé, prix, durée en mois, questions du pack, pages du pack] }
  function offres() {
    const t = app?.tarifs?.()?.tarifs;
    if (!t?.length) return DEF_PRIX;
    return Object.fromEntries(t.map((x) => [x.objet, [x.libelle, x.prix, x.duree_mois, x.credit_questions, x.credit_pages]]));
  }
  function quotas() {
    const q = app?.tarifs?.()?.quotas;
    return q?.length ? Object.fromEntries(q.map((x) => [x.formule, x])) : DEF_Q;
  }
  function formules() {
    const o = offres(), q = quotas(), n = (v) => nf.format(v);
    const d = q.decouverte, e = q.essentiel, i = q.investisseur;
    return [
      { k: "decouverte", nom: "Découverte", mois: 0, an: 0, pour: "Pour découvrir et prendre l'habitude",
        points: ["Coffre, séries, trophées, point du soir",
                 d.questions_debut > d.questions ? `BafiBot : ${n(d.questions_debut)} questions la 1re semaine, puis ${n(d.questions)} par mois` : `BafiBot : ${n(d.questions)} questions par mois`,
                 `${n(d.pages)} page${d.pages > 1 ? "s" : ""} importée${d.pages > 1 ? "s" : ""} par mois`, "Score, santé financière et tendance de chaque action", "1 cercle d'épargne"] },
      { k: "essentiel", nom: "Essentiel", mois: o.essentiel_mois?.[1], an: o.essentiel_an?.[1], pour: "Pour épargner et investir sereinement", reco: true,
        points: [`BafiBot : ${n(e.questions)} questions par mois`, `${n(e.pages)} pages importées par mois`, "Ce qui fait la note de chaque action",
                 "Performance complète, simulation, export du journal", "Cercles illimités, rappel WhatsApp"] },
      { k: "investisseur", nom: "Investisseur", mois: o.investisseur_mois?.[1], an: o.investisseur_an?.[1], pour: "Pour suivre plusieurs lignes en détail",
        points: [`BafiBot : ${n(i.questions)} questions${i.approfondies ? `, dont ${n(i.approfondies)} approfondies` : ""}`, `${n(i.pages)} pages importées par mois`,
                 "Analyses financières complètes : ratios, états financiers", "Comparateurs obligations et OPCVM", "Rapport mensuel, seuils d'alerte personnalisés"] },
    ].filter((f) => f.k === "decouverte" || f.mois != null);
  }
  const libObjet = (k) => offres()[k]?.[0] || k;
  const jours = (d) => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 864e5));

  function barre(lib, u, q, credit) {
    if (!q && !credit) return "";
    const pc = q ? Math.min(100, Math.round((u / q) * 100)) : 100;
    return `<div class="ab-conso"><div class="ab-l"><span>${lib}</span><b>${nf.format(Math.min(u, q))} / ${nf.format(q)}</b></div>
      <div class="ab-barre${pc >= 80 ? " haute" : ""}"><i style="width:${pc}%"></i></div>${credit ? `<p class="small muted">+ ${nf.format(credit)} en réserve (pack)</p>` : ""}</div>`;
  }

  function carteHtml(a) {
    const f = a.formule, nom = app.nomFormule(f);
    const etat = f === "decouverte" ? "Formule gratuite" : a.essai ? `Essai offert · encore ${jours(a.fin)} jour${jours(a.fin) > 1 ? "s" : ""}`
      : a.fin ? `Jusqu'au ${new Date(a.fin).toLocaleDateString("fr-FR")}` : "";
    const q = a.quotas || {}, u = a.usage || {}, c = a.credits || {};
    const lien = `${location.origin}${location.pathname}?parrain=${encodeURIComponent(a.code_parrain || "")}`;
    return `<div class="card abo-carte"><h2>Mon abonnement</h2>
      <div class="ab-tete f-${esc(f)}"><span class="ab-badge">${esc(nom)}</span><span class="small">${esc(etat)}</span></div>
      ${a.essai ? `<p class="small">Pendant l'essai, vous profitez de tout l'Essentiel. Ensuite, vous repassez en Découverte, sans rien payer ni perdre vos données.</p>` : ""}
      ${a.demande ? `<div class="notice small">Demande en cours : <b>${esc(libObjet(a.demande.objet))}</b>, envoyée le ${new Date(a.demande.cree_le).toLocaleDateString("fr-FR")}. Elle sera activée dès réception de votre paiement.</div>` : ""}
      <h3>Ce mois-ci</h3>
      ${barre("Questions à BafiBot", u.questions || 0, q.questions || 0, c.questions)}
      ${q.approfondies ? barre("Questions approfondies", u.approfondies || 0, q.approfondies) : ""}
      ${barre("Pages importées", u.pages || 0, q.pages || 0, c.pages)}
      <h3>Les formules</h3>
      <div class="ab-formules">${formules().map((x) => `<div class="ab-f${x.k === f ? " actuelle" : ""}${x.reco ? " reco" : ""}">
          ${x.reco ? `<span class="ab-reco">Le plus choisi</span>` : ""}
          <b class="ab-nom">${x.nom}</b><span class="ab-prix">${x.mois ? `${F(x.mois)}<small> / mois</small>` : "Gratuit"}</span>
          ${x.an ? `<span class="small muted">ou ${F(x.an)} par an${x.mois && x.an < 12 * x.mois ? ` (${Math.round(12 - x.an / x.mois)} mois offerts)` : ""}</span>` : x.mois ? "" : `<span class="small muted">Pour toujours</span>`}
          <p class="small">${x.pour}</p><ul>${x.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          ${x.k === f && !a.essai ? `<span class="ab-actuel">Votre formule</span>` : x.mois ? `<button type="button" class="btn${x.reco ? " primary" : ""}" data-abo="${x.k}">Choisir ${x.nom}</button>` : ""}
        </div>`).join("")}</div>
      <h3>Les packs</h3>
      <div class="ab-packs">${[["pack_questions", 3, "questions à BafiBot"], ["pack_pages", 4, "pages à importer"]].filter(([k]) => offres()[k]).map(([k, i, lib]) =>
        `<button type="button" class="ab-pack" data-abo-objet="${k}"><b>${nf.format(offres()[k][i] || 0)} ${lib}</b><span>${F(offres()[k][1])} · valables 3 mois</span></button>`).join("")}</div>
      <h3>Parrainez vos proches</h3>
      <p class="small">Quand un proche inscrit avec votre lien prend une formule payante, vous recevez <b>un mois d'Essentiel offert</b>.
        ${a.filleuls ? `Déjà ${a.filleuls} filleul${a.filleuls > 1 ? "s" : ""} inscrit${a.filleuls > 1 ? "s" : ""}.` : ""}</p>
      <div class="ab-parrain"><code>${esc(a.code_parrain || "")}</code><button type="button" class="btn small" data-abo-partager="${esc(lien)}">Partager mon lien</button></div>
      <p class="small muted">Les formules payantes donnent accès à des outils et à de l'information, jamais à un conseil en investissement personnalisé.</p>
    </div>`;
  }

  // Fenêtre de demande : durée, moyen de paiement, référence
  document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-abo" aria-labelledby="abo-t"><form method="dialog" novalidate>
      <h2 id="abo-t">Choisir une formule</h2><div class="abo-corps"></div><p class="msg err" role="status" aria-live="polite"></p>
      <div class="actions"><button type="button" class="btn" data-abo-fermer>Annuler</button><button type="submit" class="btn primary">Envoyer ma demande</button></div>
    </form></dialog>`);
  const dlg = $("#dlg-abo"), f = $("form", dlg);
  function ouvrir(formule, objet) {
    const cfg = (window.BRVM_CONFIG || {}).paiement || {};
    const OBJETS = offres();
    const durees = objet ? [objet] : Object.keys(OBJETS).filter((k) => k.startsWith(formule + "_"));
    const moyens = [["wave", "Wave", cfg.wave], ["orange_money", "Orange Money", cfg.orange_money]].filter(([, , n]) => n);
    $("#abo-t", dlg).textContent = objet?.startsWith("pack") ? "Prendre un pack" : `Choisir ${app.nomFormule(formule)}`;
    $(".abo-corps", dlg).innerHTML = `
      <fieldset class="abo-durees"><legend>${objet?.startsWith("pack") ? "Pack" : "Durée"}</legend>${durees.map((d, i) => `<label class="abo-d">
        <input type="radio" name="objet" value="${d}"${i === durees.length - 1 || durees.length === 1 ? " checked" : ""}>
        <span><b>${esc(OBJETS[d][0])}</b><span>${F(OBJETS[d][1])}${OBJETS[d][2] > 1 ? " · un seul paiement" : ""}</span></span></label>`).join("")}</fieldset>
      ${moyens.length ? `<p>Payez le montant choisi par ${moyens.map(([, n, num]) => `<b>${n}</b> au <b>${esc(num)}</b>`).join(" ou par ")}
        (bénéficiaire : ${esc(cfg.beneficiaire || "BafiBourse")}), puis indiquez la référence de la transaction.</p>
        <label>Moyen de paiement <select name="moyen">${moyens.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}<option value="autre">Autre</option></select></label>
        <label>Référence de la transaction <input name="reference" maxlength="60" autocomplete="off" placeholder="Ex. TX2410…"></label>`
      : `<p>Le paiement en ligne arrive très bientôt. Envoyez votre demande : notre équipe vous contacte pour le règlement par Wave ou Orange Money.</p>`}
      <p class="small muted">La formule est activée dès réception du paiement, en général sous 24 h. Les montants s'entendent toutes taxes comprises.</p>`;
    $(".msg", dlg).textContent = "";
    dlg.showModal();
  }
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const objet = f.objet?.value, b = f.querySelector('button[type="submit"]');
    if (!objet) return;
    b.disabled = true;
    try {
      await app.demanderAbonnement({ objet, moyen: f.moyen?.value || null, reference: f.reference?.value.trim() || null });
      dlg.close();
      await app.rechargerFormule();
      app.toast("Demande envoyée.", { detail: "Votre formule sera activée dès réception du paiement." });
    } catch (e) { $(".msg", dlg).textContent = "Envoi impossible : " + e.message; }
    b.disabled = false;
  });
  dlg.addEventListener("click", (ev) => { if (ev.target.closest("[data-abo-fermer]")) dlg.close(); });

  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-abo], [data-abo-objet], [data-abo-partager]");
    if (!b || !app) return;
    if (b.dataset.abo) return ouvrir(b.dataset.abo);
    if (b.dataset.aboObjet) return ouvrir(null, b.dataset.aboObjet);
    const lien = b.dataset.aboPartager, texte = `Je mets de côté chaque jour et je suis mes placements à la BRVM avec BafiBourse. Inscris-toi avec mon lien : ${lien}`;
    try { if (navigator.share) return await navigator.share({ text: texte }); } catch (e) { if (e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(lien); app.toast("Lien de parrainage copié."); } catch (e) { window.open("https://wa.me/?text=" + encodeURIComponent(texte), "_blank", "noopener"); }
  });

  function carte() {
    const v = $("#v-profil"), a = app?.abo?.();
    if (!v || v.hidden || !a) return;
    v.querySelector(".abo-carte")?.remove();
    const tete = v.querySelector(".profil-tete");
    if (tete) tete.insertAdjacentHTML("afterend", carteHtml(a)); else v.querySelector("h1")?.insertAdjacentHTML("afterend", carteHtml(a));
  }
  window.addEventListener("brvm:maj", () => setTimeout(() => { if (app?.tab() === "profil") carte(); }, 40));
  window.addEventListener("brvm:formule", () => { if (app?.tab() === "profil") carte(); });
  window.addEventListener("brvm:pret", () => { app = window.BRVM_APP?.abo ? window.BRVM_APP : null; });
})();
