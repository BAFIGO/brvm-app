/* BafiBourse – qui navigue : photo (ou initiales) et prénom dans l'en-tête, en-tête du Profil avec la formule,
 * changement de photo (recadrée et réduite à 256 pixels dans le navigateur, jamais envoyée en grand). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let app = null;
  const TEINTES = [230, 330, 190, 150, 25, 270, 200];
  function initiales(p) {
    const t = [p?.prenom, p?.nom].filter(Boolean).map((x) => x.trim()[0]).join("") || (app?.email?.() || "?")[0];
    return t.toUpperCase().slice(0, 2);
  }
  function avatar(p, taille) {
    if (p?.avatar && /^data:image\/(jpeg|png|webp);base64,/.test(p.avatar)) return `<img class="av-img" src="${p.avatar}" alt="" width="${taille}" height="${taille}">`;
    const h = TEINTES[[...(p?.prenom || app?.email?.() || "x")].reduce((a, c) => a + c.charCodeAt(0), 0) % TEINTES.length];
    return `<span class="av-ini" style="--h:${h}">${esc(initiales(p))}</span>`;
  }
  window.BafiAvatar = (taille) => avatar(app?.profil?.(), taille);
  // En-tête : « c'est moi qui navigue »
  function entete() {
    const bar = $(".topbar"), p = app?.profil?.();
    if (!bar || !p) return;
    let moi = $(".moi", bar);
    if (!moi) { bar.insertAdjacentHTML("beforeend", `<a class="moi" href="#profil"></a>`); moi = $(".moi", bar); }
    const prenom = p.prenom || (app.email() || "").split("@")[0];
    moi.innerHTML = `${avatar(p, 32)}<span class="moi-nom">${esc(prenom)}</span>`;
    moi.setAttribute("aria-label", `Mon profil : ${prenom}`);
  }
  // En-tête du Profil : photo, nom, adresse, formule
  function tete() {
    const v = $("#v-profil"), p = app?.profil?.();
    if (!v || v.hidden || !p) return;
    $(".profil-tete", v)?.remove();
    const a = app.abo?.();
    v.querySelector("h1")?.insertAdjacentHTML("afterend", `<div class="profil-tete">
      <label class="pt-photo" title="Changer ma photo">${avatar(p, 72)}<span class="pt-modif" aria-hidden="true">✎</span>
        <input type="file" accept="image/*" data-photo hidden><span class="sr-only">Changer ma photo de profil</span></label>
      <div class="pt-txt"><b>${esc([p.prenom, p.nom].filter(Boolean).join(" ") || "Mon profil")}</b><span class="small muted">${esc(app.email())}</span>
        ${a ? `<span class="pt-formule f-${esc(a.formule)}">${esc(app.nomFormule(a.formule))}${a.essai ? " · essai" : ""}</span>` : ""}</div>
      ${p.avatar ? `<button type="button" class="btn link small pt-suppr" data-photo-suppr>Retirer la photo</button>` : ""}</div>`);
  }
  // Photo : recadrage carré au centre, 256 px, JPEG : environ 20 Ko enregistrés dans le profil
  async function reduire(fichier) {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); });
    const c = Math.min(img.naturalWidth, img.naturalHeight), cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    cv.getContext("2d").drawImage(img, (img.naturalWidth - c) / 2, (img.naturalHeight - c) / 2, c, c, 0, 0, 256, 256);
    return cv.toDataURL("image/jpeg", 0.82);
  }
  document.addEventListener("change", async (ev) => {
    const inp = ev.target.closest("[data-photo]");
    if (!inp || !inp.files?.[0] || !app) return;
    try {
      const url = await reduire(inp.files[0]);
      await app.saveProfil({ avatar: url });
      app.toast("Photo de profil enregistrée.");
    } catch (e) { app.toast("Photo non enregistrée : " + (e.message || "format illisible")); }
  });
  document.addEventListener("click", async (ev) => {
    if (!ev.target.closest("[data-photo-suppr]") || !app) return;
    try { await app.saveProfil({ avatar: null }); } catch (e) { app.toast("Impossible : " + e.message); }
  });
  const tout = () => { entete(); if (app?.tab() === "profil") tete(); };
  window.addEventListener("brvm:profil", tout);
  window.addEventListener("brvm:formule", tout);
  window.addEventListener("brvm:maj", () => setTimeout(tout, 20));
  window.addEventListener("brvm:pret", () => { app = window.BRVM_APP?.profil ? window.BRVM_APP : null; tout(); });
})();
