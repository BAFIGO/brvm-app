/* Chargé en premier, de façon synchrone (quelques lignes) :
 * 1. un lien de connexion qui arrive sur la vitrine (ancienne adresse de l'application) est renvoyé vers app/ ;
 * 2. la classe js-anim prépare les animations, sauf si l'utilisateur a demandé moins de mouvement.
 *    Filet de sécurité : sans GSAP au bout de 3 s, la classe est retirée et tout reste visible. */
(function () {
  var h = location.hash, q = location.search;
  if (/(access_token|error_description|refresh_token)=/.test(h) || /[?&](code|token_hash)=/.test(q)) {
    location.replace("app/" + q + h);
    return;
  }
  var root = document.documentElement;
  if (window.matchMedia && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("js-anim");
    setTimeout(function () { if (!window.gsap || !window.ScrollTrigger) root.classList.remove("js-anim"); }, 3000);
  }
})();
