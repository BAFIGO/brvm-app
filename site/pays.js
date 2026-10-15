/* Pays d'un titre de la BRVM, pour afficher un drapeau (application et console).
 * Déduit sans rien stocker : code des actions, émetteur des obligations, société de gestion des FCP.
 * Les corrections faites dans la console (table titres_pays) passent avant. « UEMOA » = émetteur régional. */
window.BRVM_PAYS = (() => {
  const LETTRE = { C: "CI", S: "SN", B: "BJ", M: "ML", N: "NE", T: "TG" };
  const MOTS = [["IVOIRE", "CI"], ["ETAT DE CI", "CI"], ["SENEGAL", "SN"], ["SENELEC", "SN"], ["SONATEL", "SN"], ["DAKAR", "SN"],
    ["BURKINA", "BF"], ["SONABHY", "BF"], ["MALI", "ML"], ["BENIN", "BJ"], ["TOGO", "TG"], ["BISSAU", "GW"]];
  const TRESOR = { TPCI: "CI", TPSN: "SN", TPBF: "BF", TPML: "ML", TPNE: "NE", TPTG: "TG", TPBJ: "BJ", TPGB: "GW" };
  const SIGLE = { CI: "CI", SN: "SN", BF: "BF", ML: "ML", BN: "BJ", BJ: "BJ", TG: "TG" };   // « … NSIA BANQUE CI »
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

  // Actions : dernière lettre du code BRVM (SNTS → Sénégal, ORAC → Côte d'Ivoire), « BF » pour le Burkina Faso
  function action(code) {
    const c = norm(code);
    if (c.endsWith("BF")) return "BF";
    return LETTRE[c.slice(-1)] || null;
  }
  // Obligations : régionales → UEMOA ; sinon le pays cité par l'émetteur (ETAT DU MALI, TPCI, … CI)
  function obligation(code, emetteur, categorie) {
    if (categorie === "regional") return "UEMOA";
    const e = norm(emetteur), c = norm(code);
    for (const [k, v] of Object.entries(TRESOR)) if (e.startsWith(k) || c.startsWith(k)) return v;
    if (/\bNIGER\b/.test(e)) return "NE";
    for (const [m, v] of MOTS) if (e.includes(m)) return v;
    const fin = e.split(/\s+/).pop();
    return SIGLE[fin] || null;
  }
  const drapeau = (iso) => (iso && /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : "");
  // corrections : Map code → pays ; gestionnaires : Map nom → pays
  function de(classe, r, corrections, gestionnaires) {
    const code = r.code || r.ticker;
    if (corrections?.has(code)) return corrections.get(code);
    if (classe === "actions") return action(code);
    if (classe === "obligations") return obligation(code, r.emetteur, r.categorie);
    return gestionnaires?.get(r.gestionnaire) || null;
  }
  // Petit repère à placer devant un nom de titre (vide si pays inconnu)
  function marque(pays, nomPays) {
    if (!pays) return "";
    if (pays === "UEMOA") return `<span class="pays-titre uemoa" title="Émetteur régional (UEMOA)">UEMOA</span> `;
    return `<span class="pays-titre drapeau" title="${nomPays ? nomPays(pays) : pays}" aria-label="${nomPays ? nomPays(pays) : pays}">${drapeau(pays)}</span> `;
  }
  return { action, obligation, de, marque, drapeau };
})();
