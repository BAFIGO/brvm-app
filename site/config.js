// Paramètres publics de l'application (aucun secret ici).
// La clé « publishable » est faite pour être visible : l'accès aux données est protégé par les
// règles de sécurité (RLS) de la base Supabase. Ne mettez JAMAIS la clé secrète dans ce fichier.
//
// Deux environnements, choisis selon l'adresse du site (aucun fichier à changer entre test et production) :
//   - production : bafibourse.com, et l'adresse principale brvm-app.pages.dev ;
//   - test : les versions de branche de Cloudflare (ex. dev.brvm-app.pages.dev) et l'ordinateur local.
// Renseignez TEST avec l'adresse et la clé publique du projet Supabase de test.
const BAFI_PROD = { supabaseUrl: "https://ejdrhpxkzwipmkjqjhjx.supabase.co", supabaseKey: "sb_publishable_t9ioJzVSUWRDik4e55QxMg_QU6dXFDb" };
const BAFI_TEST = { supabaseUrl: "", supabaseKey: "" };
const BAFI_EST_TEST = /^[^.]+\.[^.]+\.pages\.dev$/.test(location.hostname) || ["localhost", "127.0.0.1"].includes(location.hostname);
window.BRVM_CONFIG = {
  ...(BAFI_EST_TEST && BAFI_TEST.supabaseUrl ? BAFI_TEST : BAFI_PROD),
  // « test » : base de test ; « test-sur-production » : version de test sans base de test, branchée sur la production (prudence)
  environnement: BAFI_EST_TEST ? (BAFI_TEST.supabaseUrl ? "test" : "test-sur-production") : "production",
  fraisCourtage: 0.013,
  vapidPublique: "BMicomj2VSAFjpnSgPx3QX-Oj4H_fIv_7QCDXg06sCtQDrQ-C6hqgJsOcGxsvpzZ8Z-ALlNJLa0Uu4mgWNa5_kU",   // clé publique des notifications (rappels du soir)
  // Paiement des abonnements, en attendant l'agrégateur : numéros marchands affichés à l'utilisateur.
  // Laissez vide un moyen non utilisé : il n'est pas proposé.
  paiement: { wave: "", orange_money: "", beneficiaire: "BafiBourse" },
  // Contact et réseaux sociaux (pied de page de la vitrine) : seuls les liens remplis s'affichent.
  contact: { email: "", whatsapp: "" },
  reseaux: { facebook: "", instagram: "", linkedin: "", tiktok: "", youtube: "", x: "" },
};
