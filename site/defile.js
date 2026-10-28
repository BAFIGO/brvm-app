/* BafiBourse – aide au défilement : deux petits boutons ↑ ↓ qui apparaissent quand on fait défiler une longue page,
 * puis s'effacent après quelques secondes d'immobilité, pour ne jamais gêner la lecture ni les images.
 *   ↑ : revenir en haut de la page.
 *   ↓ : vitrine → section suivante ; application → bas de la page.
 * Réglage par l'attribut data-mode du script : « sections » (vitrine) ou « page » (application). */
(function () {
  "use strict";
  var script = document.currentScript, mode = (script && script.dataset.mode) || "page";
  var calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function poser() {
    var nav = document.createElement("div");
    nav.className = "defile"; nav.setAttribute("role", "group"); nav.setAttribute("aria-label", "Se déplacer dans la page");
    nav.innerHTML = '<button type="button" class="defile-b" data-defile="haut" aria-label="Revenir en haut de la page">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>' +
      '<button type="button" class="defile-b" data-defile="bas" aria-label="' + (mode === "sections" ? "Aller à la section suivante" : "Aller en bas de la page") + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button>';
    document.body.appendChild(nav);
    var minuteur = 0, haut = nav.children[0], bas = nav.children[1];
    function etat() {
      var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
      var long = max > window.innerHeight * 1.2;                      // inutile sur une page courte
      haut.disabled = y < 200; bas.disabled = y > max - 120;
      return long && y > 300;
    }
    function montrer() {
      if (!etat()) { nav.classList.remove("on"); return; }
      nav.classList.add("on");
      clearTimeout(minuteur);
      minuteur = setTimeout(function () { if (!nav.matches(":hover") && !nav.contains(document.activeElement)) nav.classList.remove("on"); }, 2500);
    }
    window.addEventListener("scroll", montrer, { passive: true });
    nav.addEventListener("focusin", function () { nav.classList.add("on"); });
    nav.addEventListener("mouseleave", montrer);
    function sectionSuivante() {
      var limite = window.scrollY + 90;
      var secs = Array.prototype.slice.call(document.querySelectorAll("main section[id], main > section, footer"));
      for (var i = 0; i < secs.length; i++) {
        var top = secs[i].getBoundingClientRect().top + window.scrollY;
        if (top > limite && secs[i].offsetHeight > 40) return top - 70;
      }
      return document.documentElement.scrollHeight;
    }
    nav.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-defile]");
      if (!b) return;
      var cible = b.dataset.defile === "haut" ? 0 : (mode === "sections" ? sectionSuivante() : document.documentElement.scrollHeight);
      window.scrollTo({ top: cible, behavior: calme ? "auto" : "smooth" });
      setTimeout(montrer, 400);
    });
    // sur l'application, la page change sans rechargement : on recalcule à chaque changement d'onglet
    window.addEventListener("hashchange", function () { nav.classList.remove("on"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poser); else poser();
})();
