/* BafiBourse – glossaire au toucher.
 * Les mots techniques des écrans (SGI, OPCVM, coupon, prix limite…) sont soulignés en pointillé à leur première
 * apparition dans chaque écran ; un toucher ouvre une bulle qui les explique en une phrase, avec un lien
 * « Demander au robot » pour aller plus loin. Désactivable dans le Profil (Aide à la prise en main). */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CLE = "brvm-glossaire";
  const actif = () => { try { return localStorage.getItem(CLE) !== "non"; } catch (e) { return true; } };

  // [terme affiché, motifs reconnus, définition] — sigles en majuscules exactes, mots courants avec ou sans majuscule
  const TERMES = [
    ["SGI", ["SGI"], "Société de gestion et d'intermédiation : l'intermédiaire agréé chez qui vous ouvrez votre compte-titres et qui transmet vos ordres à la BRVM."],
    ["BRVM Composite", ["BRVM Composite"], "Indice qui regroupe toutes les actions cotées à la BRVM : il mesure l'évolution du marché dans son ensemble."],
    ["BRVM 30", ["BRVM 30"], "Indice des 30 actions les plus échangées de la BRVM."],
    ["BRVM", ["BRVM"], "Bourse régionale des valeurs mobilières : la bourse commune aux huit pays de l'UEMOA, installée à Abidjan."],
    ["OPCVM", ["OPCVM"], "Placement collectif (FCP ou SICAV) : votre argent est mis en commun avec celui d'autres épargnants et géré par des professionnels."],
    ["FCP", ["FCP"], "Fonds commun de placement : une forme d'OPCVM dont vous détenez des parts, à la valeur liquidative du jour."],
    ["SICAV", ["SICAV"], "Société d'investissement à capital variable : une forme d'OPCVM dont vous détenez des actions."],
    ["Valeur liquidative", ["valeur liquidative", "VL"], "Le prix d'une part d'OPCVM, calculé et publié régulièrement par sa société de gestion."],
    ["Prix de revient", ["PRU", "prix de revient", "en moyenne"], "Ce qu'un titre vous a coûté en moyenne, frais d'achat compris : c'est la base de calcul de votre gain ou de votre perte."],
    ["Coupon couru", ["coupon couru", "coupons courus"], "Les intérêts accumulés depuis le dernier coupon : l'acheteur d'une obligation les paie au vendeur en plus du prix."],
    ["Coupon", ["coupon", "coupons"], "L'intérêt versé régulièrement par une obligation, en général une ou deux fois par an."],
    ["Obligation", ["obligation", "obligations"], "Un prêt à un État ou à une entreprise : il rapporte des intérêts (coupons) et le capital est remboursé à l'échéance."],
    ["Échéance", ["échéance", "échéances"], "La date à laquelle une obligation est remboursée."],
    ["Dividende", ["dividende", "dividendes"], "La part du bénéfice qu'une société verse à ses actionnaires, en général une fois par an. Elle n'est jamais garantie."],
    ["Rendement", ["rendement"], "Ce qu'un placement rapporte chaque année (dividende ou intérêts), en pourcentage de son prix."],
    ["Avis d'opéré", ["avis d'opéré", "avis d'exécution"], "Le document envoyé par votre SGI après chaque achat ou vente : titre, quantité, cours et frais."],
    ["Prix limite", ["prix limite", "limite"], "Le prix maximum que vous acceptez de payer à l'achat, ou le minimum à la vente : votre ordre ne passe pas au-delà."],
    ["Cours", ["dernier cours", "cours du jour"], "Le dernier prix auquel un titre s'est échangé en bourse."],
    ["Clôture", ["clôture"], "Le cours d'un titre ou d'un indice à la fin de la séance de bourse."],
    ["Séance", ["séance"], "Une journée de cotation à la BRVM. BafiBourse refait ses calculs chaque soir de séance."],
    ["Plus-value", ["plus-value", "plus-values", "moins-value", "moins-values"], "Le gain (plus-value) ou la perte (moins-value) entre le prix de vente, ou le cours du jour, et le prix d'achat."],
    ["Liquidité", ["liquidité"], "La facilité à acheter ou vendre un titre sans faire bouger son prix. À la BRVM, beaucoup de titres s'échangent peu."],
    ["Droits de garde", ["droits de garde", "droit de garde"], "Les frais facturés par la SGI pour conserver vos titres sur votre compte."],
    ["Volatilité", ["volatilité"], "L'ampleur des variations d'un cours : plus elle est forte, plus le prix monte et descend."],
    ["Diversification", ["diversification"], "Répartir son argent sur plusieurs titres et types de placements pour limiter le risque."],
    ["Plancher", ["plancher"], "Le niveau sous lequel une alerte vous invite à examiner un titre : 15 % sous le plus haut atteint depuis votre achat. Jamais une vente automatique."],
    ["Score", ["score"], "La note sur 100 calculée chaque soir par BafiBourse (tendance, fondamentaux, dividende, valorisation, liquidité). Une aide à la décision, pas un conseil."],
  ];
  const DEF = new Map(TERMES.map(([t, , d]) => [t, d]));
  // « Le mot du soir » du récapitulatif : un terme différent chaque soir de séance
  window.BafiGlossaire = { termeDuJour: (n) => { const [t, , d] = TERMES[((n % TERMES.length) + TERMES.length) % TERMES.length]; return [t, d]; } };
  const VERS = new Map();
  // Un motif par expression ; les mots courants acceptent une majuscule initiale ; les plus longs d'abord
  const motifs = [];
  for (const [t, ms] of TERMES) for (const m of ms) {
    const sigle = m === m.toUpperCase();
    const e = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]");
    motifs.push({ t, src: sigle ? e : `[${e[0].toUpperCase()}${e[0].toLowerCase()}]${e.slice(1)}`, n: m.length });
    VERS.set(m.toLowerCase(), t);
  }
  motifs.sort((a, b) => b.n - a.n);
  const RE = new RegExp(`(?<![\\p{L}\\d])(${motifs.map((m) => m.src).join("|")})(?![\\p{L}\\d])`, "u");
  const terme = (txt) => {
    const k = txt.toLowerCase().replace(/’/g, "'");
    return VERS.get(k) || VERS.get(txt) || motifs.find((m) => new RegExp(`^${m.src}$`, "u").test(txt))?.t;
  };

  // ---------------------------------------------------------------- repérage des mots dans un écran
  const EXCLUS = "button, a, label, select, option, textarea, input, svg, h1, .num, .gl, code, script, style, [data-no-gl], .tuto-liste, .tip, .toast-act, .syn-val";
  function annoter(racine) {
    if (!racine || !actif()) return;
    const vus = new Set([...racine.querySelectorAll(".gl")].map((b) => b.dataset.gl));   // déjà soulignés dans cet écran
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim().length > 2 && !n.parentElement?.closest(EXCLUS) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const noeuds = [];
    while (w.nextNode()) noeuds.push(w.currentNode);
    for (let n of noeuds) {
      let m, garde = 0;
      while (n && (m = RE.exec(n.nodeValue)) && garde++ < 6) {
        const t = terme(m[1]);
        if (!t || vus.has(t)) {                                // déjà souligné dans cet écran : on passe la suite du texte
          const reste = n.nodeValue.slice(m.index + m[1].length);
          if (!RE.test(reste)) break;
          const suite = n.splitText(m.index + m[1].length); n = suite; continue;
        }
        vus.add(t);
        const mot = n.splitText(m.index), apres = mot.splitText(m[1].length);
        const b = document.createElement("button");
        b.type = "button"; b.className = "gl"; b.dataset.gl = t; b.setAttribute("aria-haspopup", "dialog");
        b.textContent = mot.nodeValue;
        b.setAttribute("aria-label", `${mot.nodeValue} : explication`);
        mot.replaceWith(b);
        n = apres;
      }
    }
  }
  function nettoyer(racine) { racine?.querySelectorAll(".gl").forEach((b) => b.replaceWith(document.createTextNode(b.textContent))); }

  // ---------------------------------------------------------------- bulle d'explication
  document.body.insertAdjacentHTML("beforeend", `<div id="gl-bulle" role="dialog" aria-labelledby="gl-t" hidden>
      <div class="gl-tete"><h3 id="gl-t"></h3><button type="button" class="gl-x" aria-label="Fermer l'explication">×</button></div>
      <p id="gl-d"></p><button type="button" class="btn link small gl-robot">Demander au robot</button></div>`);
  const bulle = $("#gl-bulle");
  let source = null;
  function montrer(b) {
    const t = b.dataset.gl;
    source = b;
    $("#gl-t", bulle).textContent = t;
    $("#gl-d", bulle).textContent = DEF.get(t) || "";
    $(".gl-robot", bulle).hidden = !$("#fab-ia") || $("#fab-ia").hidden;
    // la bulle s'ouvre dans la fenêtre en cours s'il y en a une (sinon elle serait sous le voile)
    const hote = b.closest("dialog[open]") || document.body;
    if (bulle.parentElement !== hote) hote.append(bulle);
    bulle.hidden = false;
    const r = b.getBoundingClientRect(), w = Math.min(320, innerWidth - 24);
    bulle.style.width = w + "px";
    const h = bulle.offsetHeight;
    bulle.style.left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12) + "px";
    bulle.style.top = (innerHeight - r.bottom > h + 16 ? r.bottom + 8 : Math.max(12, r.top - h - 8)) + "px";
    b.setAttribute("aria-expanded", "true");
    $(".gl-x", bulle).focus({ preventScroll: true });
  }
  function cacher(rendreFocus = true) {
    if (bulle.hidden) return;
    bulle.hidden = true;
    source?.setAttribute("aria-expanded", "false");
    if (rendreFocus && source?.isConnected) source.focus({ preventScroll: true });
    source = null;
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest(".gl");
    if (b) { ev.preventDefault(); ev.stopPropagation(); return source === b ? cacher() : montrer(b); }
    if (ev.target.closest(".gl-x")) return cacher();
    if (ev.target.closest(".gl-robot")) {
      const t = $("#gl-t", bulle).textContent;
      cacher(false);
      window.dispatchEvent(new CustomEvent("brvm:ouvrir-assistant", { detail: { question: `Explique-moi simplement ce qu'est : ${t}` } }));
      return;
    }
    if (!ev.target.closest("#gl-bulle")) cacher(false);
  }, true);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !bulle.hidden) { ev.stopPropagation(); cacher(); } }, true);
  addEventListener("scroll", () => cacher(false), { passive: true });
  addEventListener("resize", () => cacher(false));

  // ---------------------------------------------------------------- branchements
  const vueActive = () => document.querySelector("main > .view:not([hidden])");
  // Une seule fois : signaler que les mots marqués d'un « ? » s'expliquent d'un toucher
  function astuce() {
    try { if (localStorage.getItem("brvm-glossaire-astuce")) return; } catch (e) { return; }
    if (!document.querySelector("main > .view:not([hidden]) .gl") || (window.BafiCalme && !window.BafiCalme.autorise("astuce"))) return;
    try { localStorage.setItem("brvm-glossaire-astuce", "1"); } catch (e) { /* rien */ }
    window.BafiCalme?.consomme("astuce");
    window.BRVM_APP?.toast?.("Astuce : les mots marqués d'un « ? » s'expliquent d'un toucher.", { detail: "Touchez par exemple « SGI » ou « séance »." });
  }
  window.addEventListener("brvm:maj", () => setTimeout(() => { cacher(false); annoter(vueActive()); setTimeout(astuce, 2500); }, 30));
  // fenêtres d'explication (« Comprendre mon gain », détail d'un titre…)
  const corps = $("#dlg-info-body");
  if (corps) new MutationObserver(() => setTimeout(() => annoter(corps), 0)).observe(corps, { childList: true });

  // réglage dans le Profil (carte « Aide à la prise en main »)
  function carteReglage() {
    const c = $("#v-profil .tuto-aide");
    if (!c || $(".gl-reglage", c)) return;
    c.insertAdjacentHTML("beforeend", `<label class="switch gl-reglage"><input type="checkbox"${actif() ? " checked" : ""}>
      Souligner les mots techniques pour les expliquer d'un toucher</label>`);
    $(".gl-reglage input", c).addEventListener("change", (ev) => {
      try { localStorage.setItem(CLE, ev.target.checked ? "oui" : "non"); } catch (e) { /* stockage indisponible */ }
      document.querySelectorAll("main > .view").forEach(nettoyer);
      if (ev.target.checked) annoter(vueActive());
    });
  }
  window.addEventListener("brvm:maj", () => setTimeout(carteReglage, 60));
})();
