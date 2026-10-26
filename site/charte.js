/* Charte graphique active : « indigo » (nouvelle charte à l'essai) ou « vert » (charte d'origine).
 *
 * POUR REVENIR À L'ANCIENNE CHARTE POUR TOUT LE MONDE : remplacer "indigo" par "vert" sur la ligne ci-dessous,
 * puis « Commit changes ». Rien d'autre à modifier : les deux chartes restent disponibles.
 *
 * Pour comparer sur son propre téléphone sans rien changer pour les autres, ajouter à l'adresse :
 *   ?charte=vert    ou    ?charte=indigo    (le choix est retenu sur cet appareil)
 *   ?charte=defaut  (oublie le choix et revient à la charte choisie ci-dessous)
 * Chargé en premier, de façon synchrone, pour éviter tout clignotement de couleurs. */
(function () {
  var DEFAUT = "indigo";
  var CHARTES = { vert: "#0f5c4d", indigo: "#25347e" };
  var choix = DEFAUT, cle = "brvm-charte";
  try {
    var demande = new URLSearchParams(location.search).get("charte");
    if (demande === "defaut") localStorage.removeItem(cle);
    else if (CHARTES[demande]) localStorage.setItem(cle, demande);
    var memo = localStorage.getItem(cle);
    if (CHARTES[memo]) choix = memo;
  } catch (e) { /* navigateur sans stockage : charte par défaut */ }
  var root = document.documentElement;
  root.setAttribute("data-charte", choix);
  // Couleur de la barre du navigateur et logo assortis à la charte
  document.addEventListener("DOMContentLoaded", function () {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", CHARTES[choix]);
    if (choix !== "vert") document.querySelectorAll('img[src$="icon.svg"]').forEach(function (img) {
      img.src = img.getAttribute("src").replace(/icon\.svg$/, "icon-" + choix + ".svg");
    });
  });
})();

// Bandeau d'environnement : visible sur toutes les pages d'une version de test, jamais en production
(function () {
  // config.js est chargé après ce fichier : on attend que la page soit prête pour lire l'environnement
  const poser = () => {
    const env = (window.BRVM_CONFIG || {}).environnement;
    if (!env || env === "production" || document.getElementById("bandeau-env")) return;
    const b = document.createElement("div");
    b.id = "bandeau-env"; b.setAttribute("role", "status");
    b.textContent = env === "test" ? "Version de test · base de test : vos essais n'affectent pas la production"
      : "Version de test branchée sur la base de PRODUCTION : utilisez la démo, ou renseignez la base de test dans config.js";
    Object.assign(b.style, { position: "sticky", top: "0", zIndex: "50", padding: "6px 12px", textAlign: "center", fontWeight: "700",
      fontSize: ".82rem", color: env === "test" ? "#fff" : "#141729", background: env === "test" ? "hsl(268 55% 52%)" : "hsl(35 92% 55%)" });
    document.body.prepend(b);
  };
  if (document.readyState !== "loading") poser(); else document.addEventListener("DOMContentLoaded", poser);
})();
