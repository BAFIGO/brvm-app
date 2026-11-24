/* Bafi Finance – catalogue des messages audio « Écouter · 1 min » (2026.11).
 * Partagé par l'application (bouton Écouter) et la console d'administration (Communication › Messages audio).
 * Chaque message est un fichier déposé dans le stockage public « audios » de Supabase, sous le nom
 * « <langue>/<clé> » (ex. fr/depense, wo/depense). Le texte ci-dessous est le script de référence en français :
 * il s'affiche sous le bouton (« Lire le texte ») et sert à l'enregistrement ; la version wolof est adaptée
 * à l'oral par un locuteur natif, avec les mêmes idées. */
window.BAFI_AUDIOS = {
  langues: { fr: "Français", wo: "Wolof" },
  cles: {
    jour: {
      titre: "Ce que je peux dépenser aujourd'hui",
      ou: "Aujourd'hui, sous le montant du jour",
      texte: "Bonjour, c'est Bim Bim. Ce gros chiffre, c'est ce que vous pouvez dépenser aujourd'hui, sans vous mettre en difficulté. "
        + "Comment on le calcule ? On part de ce qui rentre dans le mois. On met d'abord de côté la part que vous gardez. "
        + "Puis on partage le reste entre les jours qui restent. Si vous dépensez moins aujourd'hui, demain vous aurez un peu plus. "
        + "Si vous dépensez plus, demain ce sera un peu moins. C'est tout. Pour que ce chiffre soit juste, notez ce que vous gagnez "
        + "et ce que vous dépensez, chaque jour, même les petites sommes. Une journée sans dépense ? Touchez « Rien à noter » : "
        + "votre série continue.",
    },
    gagne: {
      titre: "Ce que je gagne",
      ou: "Écran J'ai gagné",
      texte: "Ce que vous gagnez, c'est tout l'argent qui rentre. Le salaire, bien sûr. La recette de la journée, si vous avez un commerce. "
        + "Mais aussi l'argent envoyé par la famille, une prime, une petite vente. Tout compte, même les petites sommes. "
        + "Dès que l'argent rentre, touchez « J'ai gagné », tapez le montant, choisissez l'image. C'est fait. "
        + "Et pensez à garder tout de suite une petite part : c'est le moment le plus facile pour mettre de côté.",
    },
    depense: {
      titre: "C'est quoi une dépense ?",
      ou: "Écran J'ai dépensé",
      texte: "Une dépense, c'est tout l'argent qui sort. Il y a les grosses dépenses, celles qu'on voit : le loyer, l'école, l'électricité. "
        + "Et il y a les petites, qu'on oublie : un taxi à 500, un café à 200, du crédit à 1 000. "
        + "Une à une, elles ne font pas peur. Mais en un mois, les petites dépenses font souvent une grosse somme. "
        + "Notez-les en un geste : le montant, puis l'image. Ce n'est pas pour vous juger. C'est pour voir clair, "
        + "et savoir où va votre argent.",
    },
    garde: {
      titre: "Épargner, c'est garder d'abord",
      ou: "Créer mon budget, écran Je garde d'abord",
      texte: "Beaucoup se disent : j'épargnerai ce qui reste. Mais à la fin du mois, il ne reste souvent rien. "
        + "L'astuce, c'est de garder d'abord. Dès que l'argent rentre, une part va de côté. Ensuite, on dépense le reste. "
        + "Pas besoin de grosses sommes : 500 francs par jour, c'est 15 000 francs par mois. "
        + "D'abord, vous remplissez votre sécurité, pour les imprévus. Puis vous gardez pour vos projets. "
        + "Comme la tortue : lentement, mais tous les jours.",
    },
    projet: {
      titre: "Un projet, c'est quoi ?",
      ou: "Je garde, Mes projets",
      texte: "Un projet, c'est une bonne raison de garder. La Tabaski, la rentrée des enfants, le Magal, un téléphone, un commerce. "
        + "Un bon projet a trois choses : un nom, un montant et une date. Par exemple : le mouton de Tabaski, 150 000 francs, en juin. "
        + "Avec ces trois choses, Bafi Finance vous dit combien garder chaque jour pour être prêt à temps. "
        + "Un projet clair rend l'effort plus facile. Choisissez le vôtre.",
    },
    sgi: {
      titre: "C'est quoi une SGI ?",
      ou: "Je fais grandir, étape 3",
      texte: "Pour acheter des actions à la bourse régionale, la BRVM, on passe par une SGI : une société de gestion et d'intermédiation. "
        + "C'est un peu comme une banque pour la bourse. Vous ouvrez un compte chez elle, vous y envoyez votre argent, "
        + "et elle passe vos ordres d'achat et de vente. Bafi Finance ne garde jamais votre argent : c'est vous qui l'envoyez à votre SGI. "
        + "Notre rôle, c'est de vous aider à suivre vos placements et à comprendre. Attention : à la bourse, la valeur peut baisser. "
        + "On n'y place que l'argent dont on n'a pas besoin avant plusieurs années, une fois sa sécurité remplie.",
    },
  },
};
