/* BafiBourse – le Profil en sommaire : chaque carte devient une rubrique repliée, une ligne avec son état
 * (« 2 500 F par jour · objectif 500 000 F »), rangée par fréquence d'usage. Une seule rubrique ouverte à la fois.
 * Fonctionne aussi pour les cartes ajoutées par les autres modules (rappels, avis, aide). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // [clé, titre, ordre, reconnaissance de la carte]
  const RUBRIQUES = [
    ["abo", "Mon abonnement", 0, (c) => c.classList.contains("abo-carte")],
    ["plan", "Mon épargne", 1, (c) => c.id === "f-plan"],
    ["rappels", "Mes rappels du soir", 2, (c) => c.classList.contains("rp-carte")],
    ["invest", "Mon profil d'investisseur", 3, (c) => c.id === "f-profil"],
    ["comptes", "Mes comptes et placements", 4, (c) => c.id === "f-univers"],
    ["coord", "Mes informations", 5, (c) => c.id === "f-identite"],
    ["aide", "Aide et prise en main", 6, (c) => c.classList.contains("tuto-aide")],
    ["avis", "Donner mon avis", 7, (c) => c.classList.contains("av-profil")],
    ["demo", "Essayer les félicitations", 8, (c) => /félicitations/i.test(c.querySelector("h2")?.textContent || "") && !c.id],
    ["apropos", "À propos, conditions et déconnexion", 9, (c) => /À propos/.test(c.querySelector("h2")?.textContent || "")],
  ];
  const ouverte = () => { try { return sessionStorage.getItem("brvm-rubrique") || ""; } catch (e) { return ""; } };
  function etat(k, carte) {
    const app = window.BRVM_APP;
    if (k === "rappels") {
      const h = carte.querySelector('[data-rp="heure"]')?.value, push = /Activées/.test(carte.textContent), wa = carte.querySelector('[data-rp="whatsapp"]')?.checked;
      return [h ? `À ${h.replace(":", " h ")}` : "", push ? "notifications activées" : "", wa ? "WhatsApp" : ""].filter(Boolean).join(" · ") || "Pas encore activés";
    }
    if (k === "avis") return carte.querySelector(".av-fixes") ? `${carte.querySelector(".av-fixes").getAttribute("aria-label")} · ${carte.querySelector(".small.muted")?.textContent || ""}` : "Pas encore donné";
    if (k === "aide") return "Visite guidée, portrait, glossaire";
    if (k === "demo") return "Démonstration uniquement";
    if (k === "apropos") return "Version, conditions d'utilisation, déconnexion";
    return app?.etatRubrique?.(k) || "";
  }
  function ranger() {
    const v = $("#v-profil");
    if (!v || v.hidden) return;
    let som = $(".sommaire", v);
    if (!som) { som = document.createElement("div"); som.className = "sommaire"; ($(".profil-tete", v) || $("h1", v))?.after(som); }
    else if ($(".profil-tete", v) && som.previousElementSibling !== $(".profil-tete", v)) $(".profil-tete", v).after(som);
    // une rubrique = une seule carte : une carte glissée par un autre module ressort, une rubrique vide disparaît
    som.querySelectorAll("details.rubrique").forEach((d) => {
      const cartes = [...d.querySelectorAll(":scope > .card")];
      if (!cartes.length) return d.remove();
      const test = RUBRIQUES.find(([k]) => k === d.dataset.rub)?.[3];
      const garde = cartes.find((c) => test?.(c)) || cartes[0];          // la carte de la rubrique reste, les autres ressortent
      cartes.filter((c) => c !== garde).forEach((c) => v.append(c));
    });
    for (const carte of [...v.children]) {
      if (!carte.matches?.(".card")) continue;
      const r = RUBRIQUES.find(([, , , test]) => test(carte));
      const [k, titre, ordre] = r || ["autre" + Math.random().toString(36).slice(2, 6), carte.querySelector("h2")?.textContent || "Réglages", 10];
      const d = document.createElement("details");
      d.className = "rubrique"; d.dataset.rub = k; d.dataset.ordre = ordre;
      d.innerHTML = `<summary><span class="rub-t">${esc(titre)}</span><span class="rub-e">${esc(etat(k, carte))}</span></summary>`;
      d.append(carte);
      if (ouverte() === k) d.open = true;
      const apres = [...som.children].find((x) => +x.dataset.ordre > ordre);
      som.insertBefore(d, apres || null);
      d.addEventListener("toggle", () => {
        if (!d.open) return;
        try { sessionStorage.setItem("brvm-rubrique", k); } catch (e) { /* rien */ }
        som.querySelectorAll("details.rubrique[open]").forEach((x) => x !== d && (x.open = false));   // une seule ouverte
      });
    }
    // mettre à jour les états (après un enregistrement, par exemple)
    som.querySelectorAll("details.rubrique").forEach((d) => { const c = d.querySelector(".card"); if (c) d.querySelector(".rub-e").textContent = etat(d.dataset.rub, c); });
  }
  let prevu = 0;
  const planifier = () => { clearTimeout(prevu); prevu = setTimeout(ranger, 30); };
  const v = document.getElementById("v-profil");
  if (v) new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => n.classList?.contains("card")))) planifier(); })
    .observe(v, { childList: true, subtree: true });
  window.addEventListener("brvm:maj", () => setTimeout(ranger, 150));
  // un réglage modifié dans une rubrique : son état se met à jour
  v?.addEventListener("change", () => setTimeout(ranger, 400));
})();
