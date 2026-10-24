/* Vitrine : animations (GSAP + ScrollTrigger) et petites lectures publiques (chiffres de la dernière séance, CGU).
 * Amélioration progressive : la page est complète sans ce script. Les animations ne tournent que si boot.js a posé
 * .js-anim (pas de « mouvement réduit ») ; seuls transform et opacity sont animés. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const ANIM = root.classList.contains("js-anim") && window.gsap && window.ScrollTrigger;
  const CALME = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;   // pas de défilement automatique
  const CFG = window.BRVM_CONFIG || {};
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

  // ------------------------------------------------------------ lectures publiques (clé « publishable », sans compte)
  async function rest(path, opts = {}) {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) throw new Error("configuration absente");
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(CFG.supabaseUrl + "/rest/v1/" + path, { ...opts, signal: ctl.signal,
        headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json", ...(opts.headers || {}) } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // ------------------------------------------------------------ odomètre (chiffres clés)
  // La cible est lue dans data-to : si les vrais chiffres arrivent pendant l'animation, ils la remplacent.
  $$(".odo").forEach((el) => (el.dataset.to = el.textContent.replace(/\D/g, "")));
  function odometer(el, delay = 0) {
    const to = +el.dataset.to || 0;
    if (!ANIM) { el.textContent = nf.format(to); return; }
    el._tw?.kill();
    const o = { v: +el.textContent.replace(/\D/g, "") || 0 };
    el._tw = gsap.to(o, { v: to, duration: 1.4, delay, ease: "power3.out", snap: { v: 1 },
      onUpdate: () => { el.textContent = nf.format(o.v); } });
  }
  async function stats() {
    const els = $$(".odo");
    if (!els.length) return;                       // plus de compteurs sur la vitrine : rien à mettre à jour
    try {
      const s = await rest("rpc/stats_publiques", { method: "POST", body: "{}" });
      if (!s || !s.date) throw new Error("aucune séance");
      els.forEach((el, i) => { el.dataset.to = +s[el.dataset.k] || 0; if (!ANIM || el.dataset.started) odometer(el, ANIM ? 0.1 * i : 0); });
      $("#stats-src").textContent = `Chiffres de la dernière séance publiée, le ${new Date(s.date + "T00:00:00").toLocaleDateString("fr-FR")}.`;
    } catch (e) { /* hors ligne ou fonction pas encore installée : on garde l'exemple de démonstration */ }
  }

  // ------------------------------------------------------------ avis des utilisateurs : carrousel des 10 meilleurs
  // Défilement automatique toutes les 7 s, seulement si la section est visible, jamais si l'appareil demande
  // de réduire les animations ; il s'arrête au survol, au toucher, au clavier, et se met en pause d'un bouton.
  const ETOILE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.35 2.85 1-6L3.3 9.6l6-.9z"/></svg>';
  const etoiles = (n) => `<span class="et" role="img" aria-label="${n} sur 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= Math.round(n) ? "on" : ""}">${ETOILE}</i>`).join("")}</span>`;
  const echapper = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  async function avis() {
    let a;
    try { a = await rest("rpc/avis_publics", { method: "POST", body: "{}" }); } catch (e) { return; }   // pas encore installé
    const liste = a?.carrousel || [];
    if (liste.length < 3) return;                                   // trop peu d'avis : la section reste masquée
    const sec = $("#avis"), piste = $(".car-piste", sec), points = $(".car-points", sec);
    if (a.nombre >= 5 && a.moyenne) $(".avis-moy", sec).innerHTML =
      `${etoiles(a.moyenne)} <b>${String(a.moyenne).replace(".", ",")} sur 5</b> <span class="muted">· moyenne de ${a.nombre} avis</span>`;
    const mois = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "";
    const initiales = (n) => String(n || "?").split(/\s+/).map((m) => m.charAt(0)).join("").slice(0, 2).toUpperCase();
    piste.innerHTML = liste.map((x, i) => `<figure class="avis-carte" role="group" aria-roledescription="avis" aria-label="Avis ${i + 1} sur ${liste.length}">
        ${etoiles(x.note)}<blockquote>« ${echapper(x.commentaire)} »</blockquote>
        <figcaption><span class="av-avatar" aria-hidden="true">${echapper(initiales(x.nom))}</span>
          <span><b>${echapper(x.nom)}</b><small>${[x.ville, mois(x.date)].filter(Boolean).map(echapper).join(" · ")}</small></span></figcaption></figure>`).join("");
    points.innerHTML = liste.map((x, i) => `<button type="button" class="car-point" data-i="${i}" aria-label="Avis ${i + 1}"></button>`).join("");
    sec.hidden = false; $("[data-avis-lien]").hidden = false;

    const cartes = [...piste.children];
    const actuel = () => { const g = piste.scrollLeft + 4; let k = 0; cartes.forEach((c, i) => { if (c.offsetLeft - piste.offsetLeft <= g) k = i; }); return k; };
    const aller = (i) => { const c = cartes[(i + cartes.length) % cartes.length]; piste.scrollTo({ left: c.offsetLeft - piste.offsetLeft, behavior: CALME ? "auto" : "smooth" }); };
    const majPoints = () => { const k = actuel(); points.querySelectorAll(".car-point").forEach((p, i) => p.setAttribute("aria-current", i === k ? "true" : "false")); };
    piste.addEventListener("scroll", () => requestAnimationFrame(majPoints), { passive: true }); majPoints();
    // dernière carte entièrement visible → on repart du début
    const auBout = () => piste.scrollLeft + piste.clientWidth >= piste.scrollWidth - 8;
    const suivant = () => (auBout() ? aller(0) : aller(actuel() + 1));
    $('[data-car="prec"]', sec).addEventListener("click", () => aller(actuel() - 1));
    $('[data-car="suiv"]', sec).addEventListener("click", suivant);
    points.addEventListener("click", (ev) => { const p = ev.target.closest(".car-point"); if (p) aller(+p.dataset.i); });

    const bPause = $('[data-car="pause"]', sec);
    let enPause = CALME, survol = false, visible = false, minuteur = null;
    const majPause = () => {
      bPause.setAttribute("aria-pressed", String(enPause));
      bPause.setAttribute("aria-label", enPause ? "Relancer le défilement automatique" : "Mettre en pause le défilement automatique");
      bPause.classList.toggle("lecture", enPause);
    };
    majPause();
    bPause.addEventListener("click", () => { enPause = !enPause; majPause(); });
    const car = $(".car", sec);
    car.addEventListener("pointerenter", () => (survol = true)); car.addEventListener("pointerleave", () => (survol = false));
    car.addEventListener("focusin", () => (survol = true)); car.addEventListener("focusout", () => (survol = false));
    piste.addEventListener("touchstart", () => { enPause = true; majPause(); }, { passive: true });   // l'utilisateur prend la main
    new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.4 }).observe(car);
    minuteur = setInterval(() => { if (!enPause && !survol && visible && !document.hidden) suivant(); }, 7000);
  }

  // ------------------------------------------------------------ mode des portefeuilles (console → Moteur)
  // « simulation » : les textes marqués data-sim remplacent ceux qui parlent de proposition
  async function mode() {
    try {
      if ((await rest("rpc/mode_recommandation", { method: "POST", body: "{}" })) !== "simulation") return;
      $$("[data-sim]").forEach((el) => { el.textContent = el.dataset.sim; });
    } catch (e) { /* hors ligne ou fonction pas encore installée : textes par défaut */ }
  }

  // ------------------------------------------------------------ conditions d'utilisation (si publiées)
  async function cgu() {
    try {
      const [d] = await rest("documents_legaux?select=titre,version,texte,publie_le&type=eq.cgu&order=version.desc&limit=1");
      if (!d) return;
      const b = $("#voir-cgu");
      b.textContent = `${d.titre} (version ${d.version})`;
      b.hidden = false;
      b.addEventListener("click", () => {
        $("#dlg-cgu-title").textContent = d.titre;
        $("#dlg-cgu-sub").textContent = `Version ${d.version} du ${new Date(d.publie_le).toLocaleDateString("fr-FR")}`;
        $("#dlg-cgu-texte").textContent = d.texte;
        $("#dlg-cgu").showModal();
      });
    } catch (e) { /* pas de CGU publiées */ }
  }

  // ------------------------------------------------------------ anneau d'allocation (données lues dans le tableau)
  const PROFILS = { prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique" };
  const rows = $$(".alloc tbody tr"), arcs = $$(".donut .arc"), sw = rows.map((r) => $(".sw", r));
  const weights = (p) => rows.map((r) => +r.dataset[p] || 0);
  const D = { w: weights("equilibre"), prog: ANIM ? 0 : 1, profil: "equilibre" };
  function draw() {
    let c = 0;
    D.w.forEach((w, i) => {
      const local = Math.min(1, Math.max(0, D.prog * arcs.length - i));          // apparition décalée de chaque arc
      const len = Math.max(0, w * local - 0.8);
      arcs[i].setAttribute("stroke-dasharray", `${len.toFixed(2)} ${(100 - len).toFixed(2)}`);
      arcs[i].setAttribute("stroke-dashoffset", (-c).toFixed(2));
      if (ANIM) sw[i].style.transform = `scale(${local.toFixed(3)})`;               // légende en décalé (stagger), texte toujours lisible
      c += w;
    });
    $("[data-center]").textContent = Math.round(D.w[0] * Math.min(1, D.prog * arcs.length)) + " %";
  }
  function setProfil(p) {
    D.profil = p;
    $$(".m-viz [data-profil]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.profil === p));
    $$("[data-profil-label]").forEach((n) => (n.textContent = PROFILS[p]));
    rows.forEach((r) => { $(".f", r).textContent = r.dataset[p + "F"]; $(".w", r).textContent = r.dataset[p] + " %"; });
    const to = weights(p);
    if (!ANIM) { D.w = to; draw(); return; }
    const from = D.w.slice(), o = { t: 0 };
    gsap.to(o, { t: 1, duration: 0.6, ease: "power2.inOut", overwrite: true,
      onUpdate: () => { D.w = from.map((f, i) => f + (to[i] - f) * o.t); draw(); } });
  }
  $$(".m-viz [data-profil]").forEach((b) => b.addEventListener("click", () => setProfil(b.dataset.profil)));

  // ------------------------------------------------------------ aperçu : changement de classe d'actifs en fondu
  // (la hauteur change après le clic de l'utilisateur : ce n'est pas un décalage de mise en page au sens du CLS)
  const tbls = $$(".apercu-tbl > table");
  $$(".apercu [data-cl]").forEach((b) => b.addEventListener("click", () => {
    $$(".apercu [data-cl]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    tbls.forEach((t) => {
      const on = t.dataset.tbl === b.dataset.cl;
      t.classList.remove("is-in");
      t.hidden = !on;
      if (on) { void t.offsetWidth; t.classList.add("is-in"); }
    });
  }));

  // ------------------------------------------------------------ typographie cinétique : découpage mot par mot
  function split(h) {
    const txt = h.textContent.trim().replace(/\s+/g, " ");
    h.textContent = "";
    const sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = txt;
    const vis = document.createElement("span"); vis.setAttribute("aria-hidden", "true");
    txt.split(" ").forEach((w, i, a) => {
      const o = document.createElement("span"); o.className = "w";
      const n = document.createElement("span"); n.className = "wi"; n.textContent = w;
      o.append(n); vis.append(o); if (i < a.length - 1) vis.append(" ");
    });
    h.append(sr, vis);
    return $$(".wi", h);
  }

  // ------------------------------------------------------------ animations
  // ------------------------------------------------------------ BafiBot : une conversation qui se joue quand on la regarde
  // Les bulles arrivent une à une, avec « BafiBot écrit… » ; rejouée à chaque retour ; figée si l'on réduit les animations.
  function conversationBafiBot() {
    const fil = $(".bb-fil"), av = $(".bb-avatar"), etat = $(".bb-etat");
    if (!fil || CALME) return;
    const bulles = [...fil.querySelectorAll(".bb-b")];
    let jeton = 0;
    const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
    async function jouer() {
      const moi = ++jeton;
      fil.classList.add("anime");
      bulles.forEach((b) => b.classList.remove("vu"));
      av?.classList.remove("salue"); void av?.offsetWidth; av?.classList.add("salue");
      await pause(500);
      for (const b of bulles) {
        if (moi !== jeton) return;
        if (b.classList.contains("bot")) {
          const f = document.createElement("p"); f.className = "bb-b bot frappe vu"; f.innerHTML = "<i></i><i></i><i></i>";
          b.before(f); if (etat) etat.textContent = "écrit…";
          await pause(1300); f.remove(); if (etat) etat.textContent = "en ligne";
          if (moi !== jeton) return;
        }
        b.classList.add("vu");
        await pause(b.classList.contains("bot") ? 1700 : 700);
      }
    }
    new IntersectionObserver(([e]) => { if (e.isIntersecting) jouer(); else { jeton++; fil.querySelectorAll(".frappe").forEach((f) => f.remove()); } },
      { threshold: 0.45 }).observe(fil);
  }
  // Final : le bouton « Créer mon compte » appelle l'action (deux pulsations)
  function fete() {
    const b = $(".commencer .cta .btn.primary");
    if (!b || CALME) return;
    b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse");
  }

  // ------------------------------------------------------------ Cercles : les membres arrivent en orbite, l'anneau se remplit,
  // puis, toutes les quelques secondes, un membre « épargne » : un « +1 jour » s'envole et le compteur avance. Rejoué à chaque retour.
  function cerclesAnimes() {
    const sc = $(".cv-scene");
    if (!sc || CALME) return;
    const compte = $(".cv-compte", sc), jauge = $(".cv-jauge", sc), membres = [...sc.querySelectorAll(".cv-membre")];
    const TOTAL = 60, C = 553;
    let n = 41, minuterie = 0, debut = 0;
    const regler = (v) => { compte.textContent = v; jauge.style.strokeDashoffset = String(C * (1 - v / TOTAL)); };
    function epargne() {
      if (n >= 46) return;
      const m = membres[(Math.random() * membres.length) | 0], r = m.getBoundingClientRect(), rs = sc.getBoundingClientRect();
      const p = document.createElement("span"); p.className = "cv-plus"; p.textContent = "+1 jour";
      p.style.left = `${r.left - rs.left + 14}px`; p.style.top = `${r.top - rs.top - 8}px`;
      sc.append(p); setTimeout(() => p.remove(), 1400);
      n += 1; setTimeout(() => regler(n), 500);
    }
    function jouer() {
      clearInterval(minuterie); clearTimeout(debut);
      sc.classList.remove("joue"); jauge.style.strokeDashoffset = ""; void sc.offsetWidth;
      n = 41; compte.textContent = "0";
      sc.classList.add("joue");
      // le compteur monte jusqu'à 41 pendant que l'anneau se remplit
      const t0 = performance.now();
      (function pas(t) { const k = Math.min(1, (t - t0) / 1500); compte.textContent = Math.round(41 * (1 - Math.pow(1 - k, 3))); if (k < 1 && sc.classList.contains("joue")) requestAnimationFrame(pas); })(t0);
      requestAnimationFrame(() => (jauge.style.strokeDashoffset = String(C * (1 - 41 / TOTAL))));
      debut = setTimeout(() => { minuterie = setInterval(epargne, 2600); }, 2200);
    }
    function arreter() { clearInterval(minuterie); clearTimeout(debut); sc.classList.remove("joue"); sc.querySelectorAll(".cv-plus").forEach((p) => p.remove()); }
    sc.classList.add("anime");
    new IntersectionObserver(([e]) => (e.isIntersecting ? jouer() : arreter()), { threshold: 0.35 }).observe(sc);
  }

  function animate() {
    gsap.registerPlugin(ScrollTrigger);
    // Téléphone : la barre d'adresse qui apparaît ou disparaît ne doit pas recalculer les animations (petits sauts)
    ScrollTrigger.config({ ignoreMobileResize: true });
    const mm = gsap.matchMedia();

    // Hero : titre mot par mot, puis le reste, puis l'odomètre
    const hero = $(".hero"), words = split($(".hero-title"));
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    gsap.set($(".hero-title"), { opacity: 1 });
    tl.fromTo($(".eyebrow", hero), { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 })
      .fromTo(words, { yPercent: 105 }, { yPercent: 0, duration: 0.8, stagger: 0.055 }, 0.05)
      .fromTo([$(".lead", hero), $(".cta", hero), $(".stats", hero), $(".stats-src", hero)], { y: 18, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.08 }, "-=0.45");
    tl.fromTo($$(".bf-ic", hero), { scale: 0.4, rotate: -12 }, { scale: 1, rotate: 0, duration: 0.6, stagger: 0.12, ease: "back.out(2.2)" }, "-=0.4");
    $$(".odo").forEach((el, i) => { el.textContent = "0"; tl.add(() => { el.dataset.started = 1; odometer(el, 0.1 * i); }, 0.5); });

    // Titres de section : mot par mot, rejoué dans les deux sens (en descendant comme en remontant)
    $$(".display").forEach((h) => {
      const ws = split(h);
      const tw = gsap.fromTo(ws, { yPercent: 105 }, { yPercent: 0, duration: 0.7, stagger: 0.04, ease: "power3.out", paused: true });
      ScrollTrigger.create({ trigger: h, start: "top 88%", end: "bottom 8%",
        onEnter: () => tw.restart(), onEnterBack: () => tw.restart(), onLeaveBack: () => tw.pause(0) });
    });

    // Apparitions au défilement : depuis le bas en descendant, depuis le haut en remontant, rejouées à chaque passage
    gsap.set("[data-reveal]", { opacity: 0, y: 28, scale: 0.985 });
    const montre = (els, dy) => gsap.fromTo(els, { opacity: 0, y: dy, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.09, ease: "power3.out", overwrite: true });
    const cache = (els, dy) => gsap.to(els, { opacity: 0, y: dy, duration: 0.25, overwrite: true });
    ScrollTrigger.batch("[data-reveal]", { start: "top 92%", end: "bottom 6%",
      onEnter: (els) => montre(els, 28), onEnterBack: (els) => montre(els, -28),
      onLeave: (els) => cache(els, -20), onLeaveBack: (els) => cache(els, 20) });

    // Les téléphones et la conversation flottent légèrement au défilement (grand écran)
    mm.add("(min-width: 900px)", () => {
      $$(".ha-tel, .bb-chat").forEach((el) => gsap.fromTo(el, { y: 40 }, { y: -40, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.8 } }));
    });

    // « Aujourd'hui » : le total du téléphone défile jusqu'à sa valeur, à chaque passage
    const val = $(".aujourdhui-v .ha-val"), cible = 2661821;
    if (val?.firstChild) {
      const o = { v: 0 };
      const compte = () => gsap.fromTo(o, { v: cible * 0.82 }, { v: cible, duration: 1.4, ease: "power2.out",
        onUpdate: () => (val.firstChild.nodeValue = new Intl.NumberFormat("fr-FR").format(Math.round(o.v)).replace(/\u202f/g, " ")) });
      ScrollTrigger.create({ trigger: val, start: "top 85%", end: "bottom 10%", onEnter: compte, onEnterBack: compte });
    }

    // Import : l'avis glisse, il est « lu » (balayage), puis l'opération reconnue apparaît
    const pap = $(".imp-papier"), res = $(".imp-resultat"), fl = $(".imp-fleche");
    if (pap && res) {
      const scan = document.createElement("span"); scan.className = "scan"; pap.append(scan);
      const tli = gsap.timeline({ paused: true })
        .fromTo(pap, { x: -40, rotate: -9, opacity: 0 }, { x: 0, rotate: -2, opacity: 1, duration: 0.6, ease: "power3.out" })
        .fromTo(scan, { top: "-20%" }, { top: "105%", duration: 1, ease: "sine.inOut" })
        .fromTo(fl, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(3)" }, "-=0.2")
        .fromTo(res, { x: 40, opacity: 0, scale: 0.94 }, { x: 0, opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.6)" })
        .fromTo(".ir-ok", { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(3)" }, "-=0.2")
        .fromTo(".ir-b", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 });
      ScrollTrigger.create({ trigger: ".imp-demo", start: "top 80%", end: "bottom 10%",
        onEnter: () => tli.restart(), onEnterBack: () => tli.restart(), onLeaveBack: () => tli.pause(0) });
    }

    // Prêt à commencer : le bouton qui appelle
    ScrollTrigger.create({ trigger: ".commencer", start: "top 70%", onEnter: fete, onEnterBack: () => {} });

    // Épargne : jauge et barre qui se remplissent (dans les deux sens)
    const fills = $$(".epargne-v .ev-jauge i, .epargne-v .ev-barre i");
    const remplir = gsap.fromTo(fills, { scaleX: 0 }, { scaleX: 1, duration: 0.9, stagger: 0.15, ease: "power2.out", paused: true });
    const fab = gsap.fromTo(".ev-fab", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)", paused: true, delay: 0.5 });
    ScrollTrigger.create({ trigger: ".epargne-v .ev-grid", start: "top 80%", end: "bottom 10%",
      onEnter: () => { remplir.restart(); fab.restart(true); }, onEnterBack: () => { remplir.restart(); fab.restart(true); },
      onLeaveBack: () => { remplir.pause(0); fab.pause(0); } });

    // Méthode : bureau = anneau assemblé au défilement (scrub) + étape active ; mobile = assemblage à l'entrée
    draw();
    mm.add("(min-width: 900px)", () => {
      $$(".m-step").forEach((s) => ScrollTrigger.create({ trigger: s, start: "top 55%", end: "bottom 55%",
        onToggle: (st) => s.classList.toggle("is-active", st.isActive) }));
      ScrollTrigger.create({ trigger: ".m-steps", start: "top 65%", endTrigger: '[data-step="3"]', end: "center 55%",
        scrub: 0.6, onUpdate: (st) => { D.prog = st.progress; draw(); } });
      return () => $$(".m-step").forEach((s) => s.classList.remove("is-active"));
    });
    mm.add("(max-width: 899px)", () => {
      ScrollTrigger.create({ trigger: ".m-viz", start: "top 75%", once: true,
        onEnter: () => gsap.to(D, { prog: 1, duration: 1.4, ease: "power2.out", onUpdate: draw }) });
    });
  }

  // Après déconnexion : message ; déjà connecté (session Supabase dans ce navigateur) : « Mon espace »
  try {
    if (new URLSearchParams(location.search).has("deconnecte")) {
      const m = $("#v-msg"); m.textContent = "Vous êtes déconnecté. À bientôt !"; m.hidden = false;
      history.replaceState(null, "", location.pathname + location.hash);
    }
    const cle = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    const session = cle && JSON.parse(localStorage.getItem(cle));
    if (session?.expires_at && session.expires_at * 1000 > Date.now() - 7 * 864e5) {   // jeton renouvelable
      $("[data-espace]").textContent = "Mon espace";
      $("[data-espace-cta]").textContent = "Ouvrir mon espace";
    }
  } catch (e) { /* stockage indisponible : affichage par défaut */ }

  if (ANIM) animate(); else draw();
  conversationBafiBot();
  cerclesAnimes();
  // « Pour les curieux » : à l'ouverture, les blocs repliés s'affichent et les animations se recalent
  document.getElementById("curieux")?.addEventListener("toggle", (ev) => {
    if (!ev.target.open) return;
    ev.target.querySelectorAll("[data-reveal]").forEach((e) => { e.style.opacity = 1; e.style.transform = "none"; });
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
  if (location.hash === "#curieux" || location.hash === "#methode" || location.hash === "#apercu") { const d = document.getElementById("curieux"); if (d) d.open = true; }
  stats();
  mode();
  avis();
  cgu();

  // Noms des titres en casse normale (« SERVAIR ABIDJAN CI » → « Servair Abidjan CI »)
  const SIGLES = new Set(["CI", "BF", "SN", "ML", "NE", "TG", "BJ", "SA", "FCP", "SICAV", "UEMOA", "BOA", "CIE", "SIB", "SGB", "SGBC", "NSIA", "BICI", "BIIC", "CRRH", "SODE"]);
  const ACC = { ETAT: "État", SOCIETE: "Société", GENERALE: "Générale", SENEGAL: "Sénégal", COTE: "Côte", BENIN: "Bénin", MONETAIRE: "Monétaire", TOTALENERGIES: "TotalEnergies" };
  const PETITS = new Set(["de", "du", "des", "la", "le", "les", "et", "of", "the", "d", "l"]);
  const lisible = (t) => {
    const l = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (l.length < 4 || l !== l.toUpperCase()) return t;
    return t.split(/(\s+)/).map((m, i) => {
      if (/^\s+$/.test(m) || /\d/.test(m)) return m;
      const nu = m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z'’-]/gi, "");
      if (SIGLES.has(nu)) return m;
      if (ACC[nu]) return ACC[nu];
      const b = m.toLowerCase();
      if (i > 0 && PETITS.has(b)) return b;
      return b.replace(/(^|[-'’])(\p{L})/gu, (_, s1, c) => s1 + c.toUpperCase());
    }).join("");
  };
  document.querySelectorAll(".apercu-tbl tbody td:nth-child(2), .apercu-tbl tbody th").forEach((td) => {
    if (td.children.length === 0) td.textContent = lisible(td.textContent);
  });
})();
