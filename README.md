# BRVM Portefeuille – application web

Trois parties, publiées sur `https://bafigo.github.io/brvm-app/` :

| Adresse | Contenu | Fichiers |
|---|---|---|
| `/` | Page d'accueil publique (vitrine animée) | `site/index.html`, `vitrine.css`, `vitrine.js`, `boot.js` |
| `/app/` | Application des utilisateurs | `site/app/` |
| `/admin/` | Console d'administration | `site/admin/` |

L'application (site web installable) affiche chaque soir, après la séance de la BRVM :

- **Aujourd'hui** : valeur et performance du portefeuille, ordres proposés pour rejoindre le portefeuille cible,
  ou portefeuille proposé pour votre budget si vous débutez (estimation immédiate, recalculée chaque soir) ;
- **Portefeuille** : positions valorisées au dernier cours, journal des opérations (ajout, suppression) ;
- **Marché** : actions, obligations et OPCVM avec score, décision et explications ;
- **Profil** : budget, profil de risque (prudent, équilibré, dynamique), e-mail du soir.

Démo sans compte (données fictives) : `/app/?demo=1`.

## Fonctionnement

- Site statique (HTML, CSS, JavaScript sans compilation) dans `site/`, publié sur GitHub Pages par
  `.github/workflows/pages.yml`.
- Données dans Supabase : connexion par lien envoyé par e-mail, règles de sécurité (RLS) qui limitent chaque
  utilisateur à ses propres profil, journal et propositions.
- Les analyses et propositions sont calculées chaque soir par le dépôt privé `brvm-portefeuille`
  (GitHub Actions) et écrites dans Supabase. Ce dépôt-ci ne contient **aucune donnée ni aucun secret** :
  `site/config.js` contient uniquement l'adresse du projet et la clé *publishable*, faite pour être publique.
- `site/supabase.min.js` : bibliothèque officielle `@supabase/supabase-js` 2.116.0 (licence MIT,
  `site/supabase.LICENSE.txt`), incluse pour ne dépendre d'aucun CDN.
- `site/app/demo.json` : données fictives générées par la commande `demo` de l'outil d'analyse.
- `site/vendor/` : GSAP 3.15.0 et ScrollTrigger (licence gratuite GreenSock, `GSAP.LICENSE.txt`), chargés
  **uniquement** par la vitrine. L'application n'utilise que des transitions CSS.
- Vitrine : amélioration progressive. Sans JavaScript, ou en « mouvement réduit », tout le contenu est visible
  sans animation. Les chiffres du haut viennent de la fonction publique `stats_publiques()` (dernière séance) ;
  à défaut, ceux de la démonstration, présentés comme un exemple.
- `site/boot.js` renvoie vers `/app/` un ancien lien de connexion arrivé sur la page d'accueil.

## Mise en service

1. *Settings → Pages* : Source **GitHub Actions**. Le workflow publie le site ; l'adresse est
   `https://<compte>.github.io/brvm-app/`.
2. Supabase → *Authentication → URL Configuration* :
   - *Site URL* : l'adresse ci-dessus ;
   - *Redirect URLs* : ajoutez `https://<compte>.github.io/brvm-app/**` (couvre `/app/` et `/admin/`).
3. (Conseillé) Supabase → *Authentication → Emails → Magic Link* : ajoutez `{{ .Token }}` au modèle pour que
   l'e-mail contienne aussi un code à saisir (utile quand le lien s'ouvre dans un autre navigateur).

Outil d'aide à la décision : ce n'est pas un conseil en investissement.
