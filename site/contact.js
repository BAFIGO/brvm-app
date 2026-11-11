// BafiBourse – Nous contacter, signaler un problème, proposer une idée, petite question après une nouveauté.
// Un seul module pour la vitrine, l'écran de connexion et l'application. Fonctionne SANS compte :
// le message passe par la fonction envoyer_message (28-contact-retours.sql), avec la clé publique du site.
(() => {
  const WHATSAPP = "221773388068";                       // numéro professionnel (sans « + » ni espaces)
  const cfg = () => window.BRVM_CONFIG || {};
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const version = () => ((document.querySelector('script[src*="?v="]')?.getAttribute("src") || "").split("v=")[1] || "");
  // jeton de l'utilisateur connecté, s'il y en a un (le message est alors rattaché à son compte)
  function jeton() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { const t = JSON.parse(localStorage.getItem(k)); if (t?.access_token && (t.expires_at || 0) * 1000 > Date.now()) return t.access_token; }
      }
    } catch (e) { /* navigation privée */ }
    return null;
  }
  async function envoyer(p) {
    const c = cfg();
    if (!c.supabaseUrl) throw new Error("Service indisponible pour le moment.");
    const r = await fetch(`${c.supabaseUrl}/rest/v1/rpc/envoyer_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.supabaseKey, Authorization: `Bearer ${jeton() || c.supabaseKey}` },
      body: JSON.stringify({ p: { ...p, version: version(), appareil: navigator.userAgent.slice(0, 200) } }),
    });
    if (!r.ok) { let m = ""; try { m = (await r.json()).message; } catch (e) { /* */ } throw new Error(m || "Envoi impossible, réessayez dans un instant."); }
    return r.json();
  }
  const TITRES = {
    contact: ["Nous contacter", "Une question sur BafiBourse, votre abonnement ou un partenariat ? Nous répondons sous 48 h."],
    probleme: ["Signaler un problème", "Dites-nous ce qui ne va pas : l'écran et la version de l'application sont joints automatiquement."],
    idee: ["Proposer une idée", "Une fonction qui vous manque, une amélioration ? Toutes les idées sont lues."],
  };
  const SUJETS = { contact: ["Une question", "Mon abonnement", "Un problème", "Un partenariat", "Autre"], idee: ["Budget", "Épargne", "Bourse", "Bim Bim", "Autre"] };
  let dlg = null;
  function ouvrir(type = "contact", o = {}) {
    if (!dlg) {
      document.body.insertAdjacentHTML("beforeend", `<dialog id="dlg-contact" class="ct-dlg" aria-labelledby="ct-t"><form class="ct-f" novalidate>
        <h2 id="ct-t"></h2><p class="ct-intro"></p>
        <label class="ct-sujet">Sujet<select name="sujet"></select></label>
        <div class="ct-id"><label>Votre nom <small>(facultatif)</small><input name="nom" maxlength="80" autocomplete="name"></label>
          <label>E-mail ou numéro WhatsApp<input name="coordonnee" maxlength="120" autocomplete="email" placeholder="pour vous répondre"></label></div>
        <label>Votre message<textarea name="message" rows="5" maxlength="3000" required></textarea></label>
        <input name="site" tabindex="-1" autocomplete="off" aria-hidden="true" class="ct-piege">
        <p class="ct-msg" role="alert"></p>
        <div class="ct-b"><button type="button" class="ct-annuler">Annuler</button><button type="submit" class="ct-ok">Envoyer</button></div>
        <p class="ct-wa">Plus rapide : <a href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">écrivez-nous sur WhatsApp</a> (+221 77 338 80 68)</p>
      </form></dialog>`);
      dlg = document.getElementById("dlg-contact");
      dlg.querySelector(".ct-annuler").addEventListener("click", () => dlg.close());
      dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });
      dlg.querySelector("form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = ev.currentTarget, b = f.querySelector(".ct-ok"), msg = f.querySelector(".ct-msg");
        msg.textContent = "";
        if (f.message.value.trim().length < 2) { msg.textContent = "Écrivez votre message."; f.message.focus(); return; }
        if (dlg.dataset.type === "contact" && !jeton() && !f.coordonnee.value.trim()) { msg.textContent = "Indiquez un e-mail ou un numéro WhatsApp pour que nous puissions vous répondre."; f.coordonnee.focus(); return; }
        b.disabled = true;
        try {
          await envoyer({ type: dlg.dataset.type, sujet: f.sujet.value, theme: dlg.dataset.type === "idee" ? f.sujet.value : null, nom: f.nom.value.trim(),
                          coordonnee: f.coordonnee.value.trim(), message: f.message.value.trim(), site: f.site.value,
                          ecran: dlg.dataset.ecran || location.hash.slice(1) || "accueil", depuis: dlg.dataset.depuis });
          f.innerHTML = `<h2>Merci, c'est reçu.</h2><p>${dlg.dataset.type === "contact" ? "Nous vous répondons sous 48 h." : "Votre message aide à améliorer BafiBourse."}</p>
            <div class="ct-b"><button type="button" class="ct-ok" onclick="this.closest('dialog').close()">Fermer</button></div>`;
          setTimeout(() => { dlg?.remove(); dlg = null; }, 300000);
        } catch (e) { msg.textContent = e.message; b.disabled = false; }
      });
      dlg.addEventListener("close", () => { if (!dlg?.querySelector("textarea")) { dlg?.remove(); dlg = null; } });
    }
    const [t, intro] = TITRES[type] || TITRES.contact, f = dlg.querySelector("form"), connecte = !!jeton();
    dlg.dataset.type = type; dlg.dataset.ecran = o.ecran || ""; dlg.dataset.depuis = o.depuis || (location.pathname.includes("/app") ? (connecte ? "application" : "connexion") : "vitrine");
    dlg.querySelector("#ct-t").textContent = t; dlg.querySelector(".ct-intro").textContent = intro;
    const sj = SUJETS[type];
    f.querySelector(".ct-sujet").hidden = !sj; f.sujet.innerHTML = (sj || [""]).map((s) => `<option>${esc(s)}</option>`).join("");
    f.querySelector(".ct-id").hidden = connecte && type !== "contact";          // connecté : on sait déjà qui écrit
    f.message.placeholder = type === "probleme" ? "Ce que vous faisiez, ce qui s'est passé…" : type === "idee" ? "Votre idée en quelques mots…" : "Votre question…";
    dlg.showModal(); setTimeout(() => f.message.focus(), 60);
  }
  // Petite question après une nouveauté, une seule fois par question
  function question(cle, texte) {
    try { if (localStorage.getItem("bafi-q-" + cle)) return; localStorage.setItem("bafi-q-" + cle, "1"); } catch (e) { return; }
    const box = document.createElement("div");
    box.className = "ct-q"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", texte);
    box.innerHTML = `<p><b>${esc(texte)}</b></p><div class="ct-q-b">${[["oui", "Oui"], ["un_peu", "Un peu"], ["non", "Non"]].map(([v, l]) =>
      `<button type="button" data-r="${v}">${l}</button>`).join("")}<button type="button" class="ct-q-x" aria-label="Fermer">×</button></div>`;
    document.body.appendChild(box);
    box.addEventListener("click", async (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.r) { try { await envoyer({ type: "avis_rapide", theme: cle, message: b.dataset.r, ecran: location.hash.slice(1), depuis: "application" }); } catch (e) { /* sans gravité */ }
        box.innerHTML = "<p><b>Merci !</b></p>"; setTimeout(() => box.remove(), 1500); }
      else box.remove();
    });
  }
  window.BafiContact = { ouvrir, question, whatsapp: `https://wa.me/${WHATSAPP}` };
  // tout lien ou bouton portant data-contact="contact|probleme|idee" ouvre la fenêtre
  document.addEventListener("click", (ev) => { const a = ev.target.closest?.("[data-contact]"); if (a) { ev.preventDefault(); ouvrir(a.dataset.contact || "contact"); } });
})();
