// Paramètres publics de l'application (aucun secret ici).
// La clé « publishable » est faite pour être visible : l'accès aux données est protégé par les
// règles de sécurité (RLS) de la base Supabase. Ne mettez JAMAIS la clé secrète dans ce fichier.
window.BRVM_CONFIG = {
  supabaseUrl: "https://ejdrhpxkzwipmkjqjhjx.supabase.co",
  supabaseKey: "sb_publishable_t9ioJzVSUWRDik4e55QxMg_QU6dXFDb",
  fraisCourtage: 0.013,
  vapidPublique: "BMicomj2VSAFjpnSgPx3QX-Oj4H_fIv_7QCDXg06sCtQDrQ-C6hqgJsOcGxsvpzZ8Z-ALlNJLa0Uu4mgWNa5_kU",   // clé publique des notifications (rappels du soir)   // frais SGI + BRVM + DC/BR ≈ 1,3 % TTC (même valeur que l'outil d'analyse)
};
