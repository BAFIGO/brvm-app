/* Vitrine : animations (GSAP + ScrollTrigger) et petites lectures publiques (chiffres de la dernière séance, CGU).
 * Amélioration progressive : la page est complète sans ce script. Les animations ne tournent que si boot.js a posé
 * .js-anim (pas de « mouvement réduit ») ; seuls transform et opacity sont animés. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const ANIM = root.classList.contains("js-anim") && window.gsap && window.ScrollTrigger;
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
    try {
      const s = await rest("rpc/stats_publiques", { method: "POST", body: "{}" });
      if (!s || !s.date) throw new Error("aucune séance");
      els.forEach((el, i) => { el.dataset.to = +s[el.dataset.k] || 0; if (!ANIM || el.dataset.started) odometer(el, ANIM ? 0.1 * i : 0); });
      $("#stats-src").textContent = `Chiffres de la dernière séance publiée, le ${new Date(s.date + "T00:00:00").toLocaleDateString("fr-FR")}.`;
    } catch (e) { /* hors ligne ou fonction pas encore installée : on garde l'exemple de démonstration */ }
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
    $$(".odo").forEach((el, i) => { el.textContent = "0"; tl.add(() => { el.dataset.started = 1; odometer(el, 0.1 * i); }, 0.5); });

    // Titres de section : mot par mot, rejoué dans les deux sens (en descendant comme en remontant)
    $$(".display").forEach((h) => {
      const ws = split(h);
      const tw = gsap.fromTo(ws, { yPercent: 105 }, { yPercent: 0, duration: 0.7, stagger: 0.04, ease: "power3.out", paused: true });
      ScrollTrigger.create({ trigger: h, start: "top 88%", end: "bottom 8%",
        onEnter: () => tw.restart(), onEnterBack: () => tw.restart(),
        onLeave: () => tw.pause(0), onLeaveBack: () => tw.pause(0) });
    });

    // Apparitions au défilement : depuis le bas en descendant, depuis le haut en remontant ;
    // un bloc sorti de l'écran se cache pour pouvoir réapparaître
    gsap.set("[data-reveal]", { opacity: 0, y: 28 });
    const montre = (els, dy) => gsap.fromTo(els, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.07, ease: "power2.out", overwrite: true });
    const cache = (els, dy) => gsap.set(els, { opacity: 0, y: dy, overwrite: true });
    ScrollTrigger.batch("[data-reveal]", { start: "top 92%", end: "bottom 8%",
      onEnter: (els) => montre(els, 28), onEnterBack: (els) => montre(els, -28),
      onLeave: (els) => cache(els, -28), onLeaveBack: (els) => cache(els, 28) });

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
  stats();
  cgu();
})();
