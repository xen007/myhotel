export type GuideStep = {
  text: string;
  route?: string;
  targets: string[];
  action?: string;
  click?: boolean;
};

export type GuideTour = {
  id: string;
  title: string;
  roles?: string[];
  keywords: string[];
  steps: GuideStep[];
};

const STAFF_DESK = ['receptionist', 'manager', 'owner'];

export const TOURS: GuideTour[] = [
  {
    id: 'reservation',
    title: 'Créer une réservation',
    roles: STAFF_DESK,
    keywords: ['reservation', 'reserver', 'séjour', 'sejour', 'client devant', 'chambre pour', 'check-in', 'check in', 'arrivee', 'enregistrer', 'accueillir', 'badge', 'installer'],
    steps: [
      {
        text: 'Le client est devant vous. Touchez Réservations. C’est le premier geste : tout le séjour se crée dans cet écran.',
        targets: ['guide-tab-reservations', 'guide-nav-reservations'],
        click: true,
      },
      {
        text: 'Demandez au client le type de chambre souhaité, puis touchez la carte correspondante. Elle indique combien de chambres sont libres, occupées ou en entretien.',
        route: '/reservations',
        action: 'show-rooms',
        targets: ['guide-room-type'],
        click: true,
      },
      {
        text: 'Choisissez une chambre marquée Disponible, puis touchez Réserver. Ne prenez pas une chambre occupée, en entretien ou fermée.',
        route: '/reservations',
        action: 'open-type',
        targets: ['guide-book'],
        click: true,
      },
      {
        text: 'Demandez le nom de famille et écrivez-le dans ce champ. Ne le répétez pas à voix haute si d’autres clients sont dans le hall.',
        route: '/reservations',
        action: 'open-book',
        targets: ['guide-guest-name'],
        click: false,
      },
      {
        text: 'Écrivez ensuite le prénom de la personne qui sera titulaire du séjour.',
        targets: ['guide-guest-first'],
        click: false,
      },
      {
        text: 'Notez le numéro de téléphone. Il sert à joindre le client plus tard. Il reste sur la fiche : je ne le répète pas.',
        targets: ['guide-guest-phone'],
        click: false,
      },
      {
        text: 'Demandez la carte nationale d’identité et saisissez le numéro ici. C’est une information confidentielle : elle ne doit pas sortir de ce formulaire.',
        targets: ['guide-guest-doc'],
        click: false,
      },
      {
        text: 'Indiquez le jour d’arrivée. Si le client arrive aujourd’hui, laissez la date déjà proposée.',
        targets: ['guide-in-date'],
        click: false,
      },
      {
        text: 'Indiquez l’heure d’arrivée. L’heure habituelle est 14 h. Si la chambre n’est pas encore libre, prenez l’heure proposée plus tard.',
        targets: ['guide-in-time'],
        click: false,
      },
      {
        text: 'Indiquez le jour de départ, c’est-à-dire le matin où le client quitte la chambre.',
        targets: ['guide-out-date'],
        click: false,
      },
      {
        text: 'Indiquez l’heure de départ. L’heure habituelle est 12 h, sauf accord différent avec le client.',
        targets: ['guide-out-time'],
        click: false,
      },
      {
        text: 'Relisez le tarif affiché dans cette fenêtre, puis touchez Confirmer la réservation. Les badges à imprimer s’affichent juste après.',
        targets: ['guide-confirm'],
        click: true,
      },
    ],
  },
  {
    id: 'cancel',
    title: 'Annuler ou retrouver une réservation',
    roles: STAFF_DESK,
    keywords: ['annuler', 'annulation', 'modifier reservation', 'liste reservation', 'retrouver un client'],
    steps: [
      {
        text: 'Ouvrez Réservations.',
        targets: ['guide-tab-reservations', 'guide-nav-reservations'],
      },
      {
        text: 'Passez sur Liste réservation. Vous voyez le client, la chambre, les dates et le statut.',
        route: '/reservations',
        action: 'show-list',
        targets: ['guide-view-stays'],
      },
      {
        text: 'Cherchez le nom ou le téléphone dans ce champ, puis utilisez Annuler sur la ligne. Une confirmation s’affiche avant de valider.',
        targets: ['guide-stay-search'],
        click: false,
      },
    ],
  },
  {
    id: 'clients',
    title: 'Créer un client',
    roles: STAFF_DESK,
    keywords: ['nouveau client', 'fiche client', 'creer un client', 'clients'],
    steps: [
      {
        text: 'Ouvrez Clients. La fiche du compte est distincte de la réservation.',
        targets: ['guide-nav-clients', 'guide-tab-clients', 'guide-page'],
      },
      {
        text: 'La recherche filtre par nom, e-mail ou téléphone. Le bouton Filtrer applique le critère.',
        route: '/clients',
        targets: ['guide-clients-search', 'guide-filter', 'guide-page'],
        click: false,
      },
      {
        text: 'Touchez Nouveau client. Le formulaire s’ouvre : ne le fermez pas avant la fin.',
        route: '/clients',
        action: 'open-client',
        targets: ['guide-new-client', 'guide-page'],
        click: true,
      },
      { text: 'Saisissez le nom de famille.', targets: ['guide-client-last', 'guide-new-client'], click: false },
      { text: 'Saisissez le prénom.', targets: ['guide-client-first', 'guide-new-client'], click: false },
      { text: 'Saisissez l’e-mail. C’est l’identifiant de connexion du client.', targets: ['guide-client-email', 'guide-new-client'], click: false },
      { text: 'Saisissez le téléphone.', targets: ['guide-client-phone', 'guide-new-client'], click: false },
      { text: 'Choisissez un mot de passe d’au moins 8 caractères, puis confirmez-le dans le champ suivant.', targets: ['guide-client-pass', 'guide-client-pass2'], click: false },
      { text: 'Touchez Créer le compte. Le client apparaît dans la liste, sans que le guide ne relise ses coordonnées.', targets: ['guide-client-save', 'guide-new-client'], click: true },
    ],
  },
  {
    id: 'sale',
    title: 'Encaisser une vente',
    roles: STAFF_DESK,
    keywords: ['vente', 'encaisser', 'caisse', 'boutique', 'produit', 'pos', 'facture'],
    steps: [
      {
        text: 'Ouvrez Ventes. C’est la caisse de la réception, distincte de la caisse du restaurant.',
        targets: ['guide-tab-pos', 'guide-nav-pos', 'guide-page'],
      },
      {
        text: 'Recherchez le produit, puis touchez Filtrer. Un article en rupture ne se vend pas.',
        route: '/pos',
        targets: ['guide-pos-search', 'guide-filter', 'guide-page'],
        click: false,
      },
      {
        text: 'Touchez le produit pour l’ajouter au panier. Répétez pour chaque article.',
        targets: ['guide-product', 'guide-page'],
        click: true,
      },
      {
        text: 'Historique relit les ventes déjà passées. Factures ouvre les pièces. Notes montre ce qui reste à régler sur une chambre.',
        targets: ['guide-pos-history', 'guide-pos-invoices', 'guide-pos-notes', 'guide-page'],
        click: false,
      },
      {
        text: 'Ouvrez le panier.',
        targets: ['guide-cart', 'guide-page'],
        click: true,
      },
      {
        text: 'Indiquez la chambre si le client est en séjour, puis Encaisser. Porter sur la note ajoute le montant à sa facture. Le guide ne lit pas le total.',
        route: '/pos',
        action: 'open-cart',
        targets: ['guide-pay'],
        click: false,
      },
    ],
  },
  {
    id: 'report',
    title: 'Lire ou sortir un rapport',
    roles: ['receptionist', 'manager', 'owner'],
    keywords: ['rapport', 'statistique', 'chiffre', 'occupation', 'imprimer', 'pdf', 'bilan'],
    steps: [
      {
        text: 'Ouvrez Rapports. La réception y voit la journée. La gérance et le propriétaire choisissent la période et le type.',
        targets: ['guide-nav-reports', 'guide-tab-reports'],
      },
      {
        text: 'Choisissez le type de rapport et les dates. Le tableau se met à jour tout seul.',
        route: '/reports',
        targets: ['guide-report-filters', 'guide-page'],
        click: false,
      },
      {
        text: 'Zone impression. Imprimer ou Télécharger produit le PDF. Le guide ne lit pas les montants : vous les voyez vous-même dans le tableau.',
        targets: ['guide-print', 'guide-page'],
      },
    ],
  },
  {
    id: 'message',
    title: 'Écrire à l’équipe',
    roles: ['receptionist', 'housekeeping', 'manager', 'owner', 'restaurant', 'client'],
    keywords: ['message', 'messagerie', 'ecrire', 'contacter', 'collègue', 'collegue'],
    steps: [
      {
        text: 'Ouvrez Messagerie.',
        targets: ['guide-tab-messages', 'guide-nav-messages', 'guide-tab-desk', 'guide-nav-desk'],
      },
      {
        text: 'MyHotel IA est épinglé en haut : il montre les étapes, il ne donne aucune donnée. Nouveau ouvre un échange avec un collègue.',
        route: '/messages',
        targets: ['guide-ai-thread', 'guide-new-thread', 'guide-page'],
      },
      {
        text: 'Écrivez dans la zone du bas, puis envoyez. Le fichier joint se choisit à côté du texte. Ne mettez pas de pièce d’identité dans le message.',
        targets: ['guide-composer', 'guide-page'],
        click: false,
      },
    ],
  },
  {
    id: 'housekeeping',
    title: 'Prendre une chambre en sales',
    roles: ['housekeeping', 'manager', 'owner'],
    keywords: ['sale', 'sales', 'menage', 'nettoyage', 'gouvernante', 'entretien', 'chambre a faire'],
    steps: [
      {
        text: 'Ouvrez Sales. Chaque carte est une chambre à traiter.',
        targets: ['guide-nav-housekeeping', 'guide-tab-housekeeping', 'guide-page'],
      },
      {
        text: 'Recherchez la chambre, puis Filtrer. Les filtres sont Urgence, Non pris en charge, En cours et, pour la gérance, Maintenance.',
        route: '/housekeeping',
        targets: ['guide-hk-search', 'guide-filter', 'guide-page'],
        click: false,
      },
      {
        text: 'Sur la carte : Résoudre prend la chambre en charge, Signaler ouvre un incident, Prête clôture le ménage. Ne marquez pas prête une chambre encore occupée.',
        targets: ['guide-hk-card', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'issue',
    title: 'Signaler un problème',
    roles: ['housekeeping', 'manager', 'owner'],
    keywords: ['signalement', 'panne', 'probleme', 'incident', 'casse'],
    steps: [
      {
        text: 'Ouvrez Signalements. Un agent voit les siens. La gérance voit tout l’hôtel.',
        targets: ['guide-nav-issues', 'guide-tab-issues', 'guide-page'],
      },
      {
        text: 'Filtrez par Ouverts, En attente ou Résolus, puis recherchez une chambre ou un agent.',
        route: '/issues',
        targets: ['guide-issue-search', 'guide-filter', 'guide-page'],
        click: false,
      },
      {
        text: 'Sur la carte : En attente met le dossier de côté, Résoudre le clôture, Rouvrir le rend à nouveau ouvert.',
        targets: ['guide-issue-card', 'guide-issue-resolve', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'rooms',
    title: 'Consulter les chambres',
    roles: STAFF_DESK,
    keywords: ['fiche chambre', 'chambres', 'tarif nuit', 'photo chambre'],
    steps: [
      {
        text: 'Ouvrez Chambres. Ici se gèrent les fiches, pas les séjours.',
        targets: ['guide-nav-rooms', 'guide-tab-rooms', 'guide-page'],
      },
      {
        text: 'Recherchez un numéro, puis filtrez par Disponible, Occupée, Réservée, Nettoyage, Maintenance ou Hors service.',
        route: '/rooms',
        targets: ['guide-filter', 'guide-page'],
        click: false,
      },
      {
        text: 'Créer : touchez Ajouter. La fiche demande le numéro, le type, l’étage, la capacité et le prix, puis Enregistrer.',
        targets: ['guide-room-add', 'guide-page'],
        click: true,
      },
      {
        text: 'Écrivez le numéro de la chambre, puis touchez Enregistrer.',
        route: '/rooms/form',
        targets: ['guide-room-number', 'guide-room-save'],
        click: false,
      },
      {
        text: 'Lire : revenez à la liste et touchez Voir sur la chambre. La fiche montre l’état, les photos et les séjours.',
        route: '/rooms',
        targets: ['guide-room-see', 'guide-room-card'],
        click: true,
      },
      {
        text: 'Modifier : touchez Modifier. Les mêmes champs se rouvrent. Terminez par Enregistrer.',
        route: '/rooms',
        targets: ['guide-room-edit', 'guide-room-card'],
        click: true,
      },
      {
        text: 'Retirer : touchez Hors service. La chambre quitte la vente jusqu’à En service. Ce n’est pas un effacement de l’historique.',
        targets: ['guide-room-off', 'guide-room-card'],
        click: true,
      },
    ],
  },
  {
    id: 'planning',
    title: 'Voir le planning',
    roles: ['receptionist', 'housekeeping', 'manager', 'owner'],
    keywords: ['planning', 'horaire', 'shift', 'tache', 'qui travaille'],
    steps: [
      {
        text: 'Ouvrez Planning. L’employé y voit son planning. La gérance répartit le travail.',
        targets: ['guide-nav-schedule', 'guide-tab-schedule', 'guide-page'],
      },
      {
        text: 'Horaire crée ou modifie un shift. Tâche ajoute un travail à faire. Semaine et Suivante changent la période affichée.',
        route: '/schedule',
        targets: ['guide-shift-add', 'guide-shift-task', 'guide-page'],
        click: true,
      },
      {
        text: 'Touchez une case du tableau pour affecter la personne, puis enregistrez. Sur une tâche, Démarrer puis Terminer font avancer le statut.',
        targets: ['guide-page', 'guide-shift-add'],
        click: false,
      },
    ],
  },
  {
    id: 'stock',
    title: 'Économat',
    roles: ['manager', 'owner'],
    keywords: ['economat', 'stock hotel', 'magasin', 'inventaire'],
    steps: [
      {
        text: 'Ouvrez Économat. C’est le stock de l’hôtel, distinct du stock cuisine.',
        targets: ['guide-nav-stock'],
      },
      {
        text: 'Recherchez le produit, puis Filtrer. Magasin, Catégorie et Historique sont en haut. Ajouter ouvre la fiche : nom, lot, stock, minimum et prix.',
        route: '/stock',
        action: 'open-stock',
        targets: ['guide-stock-add', 'guide-stock-store', 'guide-filter', 'guide-page'],
      },
    ],
  },
  {
    id: 'staff',
    title: 'Gérer le personnel',
    roles: ['owner'],
    keywords: ['personnel', 'employe', 'embauche', 'compte employe'],
    steps: [
      {
        text: 'Ouvrez Personnel. Seul le propriétaire gère les comptes de l’équipe.',
        targets: ['guide-nav-staff'],
      },
      {
        text: 'Filtrez par rôle, puis Ajouter. Saisissez le nom, l’e-mail, le téléphone, le rôle et le mot de passe. Bannir coupe l’accès sans effacer l’historique.',
        route: '/staff',
        action: 'open-staff',
        targets: ['guide-staff-add', 'guide-staff-name', 'guide-filter', 'guide-page'],
      },
    ],
  },
  {
    id: 'payroll',
    title: 'Paie',
    roles: ['owner'],
    keywords: ['paie', 'salaire', 'indemnite'],
    steps: [
      {
        text: 'Ouvrez Paie. L’écran est réservé au propriétaire : la période, les fiches du personnel, puis l’export. Le guide ne lit aucun salaire.',
        targets: ['guide-nav-payroll', 'guide-page'],
      },
      {
        text: 'Les montants suivent les fiches du personnel. Vérifiez la période avant d’exporter. Le guide ne prononce aucun chiffre.',
        route: '/payroll',
        targets: ['guide-page'],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Paramètres de l’hôtel',
    roles: ['owner'],
    keywords: ['parametre', 'logo', 'societe', 'coordonnee', 'cachet'],
    steps: [
      {
        text: 'Ouvrez Paramètres. Seul le propriétaire modifie l’identité de l’hôtel.',
        targets: ['guide-nav-settings', 'guide-page'],
      },
      {
        text: 'Renseignez le nom commercial, la raison sociale, l’adresse, la ville, le pays, le téléphone, l’e-mail, le site, le NIF, le RCCM et le slogan.',
        route: '/settings',
        targets: ['guide-settings-name', 'guide-page'],
        click: false,
      },
      {
        text: 'Le logo et le cachet se déposent dans la même page. Ils sortent sur les factures, les badges et les PDF. Terminez par Enregistrer.',
        targets: ['guide-settings-save', 'guide-settings-name'],
        click: true,
      },
    ],
  },
  {
    id: 'orders',
    title: 'Commandes restaurant',
    roles: ['restaurant', 'owner'],
    keywords: ['commande', 'salle', 'table restaurant', 'ticket cuisine'],
    steps: [
      {
        text: 'Ouvrez Commandes. Chaque ticket est une commande de salle ou de chambre.',
        targets: ['guide-tab-orders', 'guide-nav-orders', 'guide-page'],
      },
      {
        text: 'Les pastilles filtrent l’état. Lisez le nom, la chambre, le mode de paiement et le détail des lignes. Le guide ne prononce pas le total.',
        route: '/orders',
        targets: ['guide-order-card', 'guide-page'],
        click: false,
      },
      {
        text: 'Le bouton du ticket avance l’étape : En cuisine, puis Servir, puis Encaisser ou Clôturer. Une commande déjà réglée n’a plus d’action.',
        targets: ['guide-order-next', 'guide-order-card', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'service',
    title: 'Vente restaurant',
    roles: ['restaurant', 'owner'],
    keywords: ['addition', 'vente restaurant', 'encaisser plat'],
    steps: [
      {
        text: 'Ouvrez Vente, la caisse du restaurant.',
        targets: ['guide-tab-service', 'guide-nav-service'],
      },
      {
        text: 'Touchez un plat pour l’ajouter, puis touchez Panier.',
        route: '/service',
        targets: ['guide-service-cart', 'guide-filter'],
        click: true,
      },
      {
        text: 'Touchez Encaisser, ou Noter · plus tard pour porter l’addition sur la chambre. Le guide ne lit pas le montant.',
        action: 'open-service-cart',
        targets: ['guide-service-pay', 'guide-service-cart'],
        click: true,
      },
    ],
  },
  {
    id: 'menu',
    title: 'Carte du restaurant',
    roles: ['restaurant', 'manager', 'owner'],
    keywords: ['carte', 'menu', 'plat', 'prix plat'],
    steps: [
      {
        text: 'Ouvrez Menu pour la carte.',
        targets: ['guide-nav-restaurant'],
      },
      {
        text: 'Créer : touchez Publier. La fiche demande le nom, le prix et le détail, puis Enregistrer.',
        route: '/restaurant',
        action: 'open-dish',
        targets: ['guide-dish-add'],
        click: true,
      },
      {
        text: 'Modifier : touchez Modifier sur le plat.',
        targets: ['guide-dish-edit'],
        click: true,
      },
    ],
  },
  {
    id: 'daily',
    title: 'Menu du jour',
    roles: ['restaurant', 'owner'],
    keywords: ['menu du jour', 'plat du jour', 'suggestion du jour'],
    steps: [
      {
        text: 'Ouvrez Menu du jour.',
        targets: ['guide-tab-daily', 'guide-nav-daily'],
      },
      {
        text: 'Touchez Menu du jour sur le plat à proposer aujourd’hui.',
        route: '/daily',
        targets: ['guide-dish-day', 'guide-filter'],
        click: true,
      },
      {
        text: 'Touchez Modifier pour changer le plat.',
        targets: ['guide-dish-edit'],
        click: true,
      },
      {
        text: 'Touchez Annuler pour le retirer du jour.',
        targets: ['guide-dish-off'],
        click: true,
      },
    ],
  },
  {
    id: 'drinks',
    title: 'Boissons',
    roles: ['restaurant', 'owner'],
    keywords: ['boisson', 'bar', 'boire'],
    steps: [
      {
        text: 'Ouvrez Boisson.',
        targets: ['guide-nav-drinks'],
      },
      {
        text: 'Créer : touchez Ajouter, puis enregistrez le nom et le prix.',
        route: '/drinks',
        action: 'open-dish',
        targets: ['guide-dish-add'],
        click: true,
      },
      {
        text: 'Modifier : touchez Modifier sur la boisson.',
        targets: ['guide-dish-edit'],
        click: true,
      },
      {
        text: 'Retirer de la vente : touchez Disponible ou Indisponible.',
        targets: ['guide-filter', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'kitchen',
    title: 'Stock cuisine',
    roles: ['restaurant', 'owner'],
    keywords: ['stock cuisine', 'rupture cuisine', 'magasin cuisine'],
    steps: [
      {
        text: 'Ouvrez Gestion stock, côté cuisine.',
        targets: ['guide-nav-kitchen'],
      },
      {
        text: 'Recherchez un produit, puis Filtrer par matières, préparés ou rupture. Ajouter ouvre la fiche. Une rupture ici retire le plat correspondant de la vente.',
        route: '/kitchen',
        action: 'open-kitchen',
        targets: ['guide-kitchen-add', 'guide-filter', 'guide-page'],
      },
    ],
  },
  {
    id: 'note',
    title: 'Voir ma note',
    roles: ['client'],
    keywords: ['note', 'facture', 'addition', 'ce que je dois'],
    steps: [
      {
        text: 'Ouvrez Note. Le cadre entoure le raccourci, puis la page affiche vos nuitées et vos consommations. Je ne lis aucun montant.',
        targets: ['guide-tab-note', 'guide-nav-note', 'guide-page'],
        route: '/note',
      },
    ],
  },
  {
    id: 'clean',
    title: 'Demander le nettoyage',
    roles: ['client'],
    keywords: ['nettoyage', 'menage chambre', 'serviette', 'housekeeping client'],
    steps: [
      {
        text: 'Ouvrez Nettoyage.',
        targets: ['guide-tab-clean', 'guide-nav-clean', 'guide-page'],
        route: '/clean',
      },
      {
        text: 'Touchez Demander le nettoyage. L’équipe des sales reçoit la demande pour votre chambre.',
        targets: ['guide-clean-ask', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'desk',
    title: 'Écrire à la réception',
    roles: ['client'],
    keywords: ['reception', 'ecrire a l hotel', 'question sejour'],
    steps: [
      {
        text: 'Ouvrez Messagerie.',
        targets: ['guide-tab-desk', 'guide-nav-desk', 'guide-page'],
        route: '/desk',
      },
      {
        text: 'Écrivez dans la zone Votre message, puis envoyez. Le cadre reste sur le champ.',
        targets: ['guide-desk-input', 'guide-page'],
        click: false,
      },
    ],
  },
  {
    id: 'stay',
    title: 'Historique du séjour',
    roles: ['client'],
    keywords: ['historique', 'mes sejours', 'anciens sejours'],
    steps: [
      {
        text: 'Ouvrez Historique pour les séjours passés et en cours.',
        targets: ['guide-nav-stay'],
        route: '/stay',
      },
    ],
  },
  {
    id: 'table',
    title: 'Commander au restaurant',
    roles: ['client'],
    keywords: ['commander', 'restaurant client', 'plat'],
    steps: [
      {
        text: 'Ouvrez Restaurant.',
        targets: ['guide-tab-table', 'guide-nav-table', 'guide-page'],
        route: '/table',
      },
      {
        text: 'Touchez Ajouter sur le plat choisi.',
        targets: ['guide-client-add', 'guide-page'],
        click: true,
      },
      {
        text: 'Touchez Panier.',
        targets: ['guide-table-cart', 'guide-page'],
        click: true,
      },
      {
        text: 'Touchez Commander. La salle reçoit la demande.',
        targets: ['guide-client-send', 'guide-table-cart'],
        click: true,
      },
    ],
  },
  {
    id: 'browse',
    title: 'Voir les chambres',
    keywords: ['voir les chambres', 'reserver en ligne', 'visiteur', 'site'],
    steps: [
      {
        text: 'Touchez Réserver un séjour pour ouvrir les chambres disponibles.',
        targets: ['guide-book-stay', 'guide-nav-browse'],
      },
      {
        text: 'Touchez Voir pour la fiche, ou Réserver pour choisir les dates puis Confirmer.',
        route: '/browse',
        targets: ['guide-filter', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'welcome',
    title: 'Page d’accueil',
    keywords: ['accueil public', 'page d accueil', 'bienvenue'],
    steps: [
      {
        text: 'Vous êtes sur l’accueil public. Réserver un séjour ouvre les chambres. Connexion est en haut de la page.',
        targets: ['guide-book-stay', 'guide-login', 'guide-page'],
        route: '/welcome',
      },
    ],
  },
  {
    id: 'about',
    title: 'À propos',
    keywords: ['a propos', 'histoire hotel', 'presentation hotel'],
    steps: [
      {
        text: 'Ouvrez À propos. Cette page présente l’hôtel. Elle ne contient aucune donnée de client.',
        targets: ['guide-nav-about', 'guide-tab-about', 'guide-page'],
        route: '/about',
      },
    ],
  },
  {
    id: 'prestations',
    title: 'Services',
    keywords: ['prestation', 'services hotel', 'spa'],
    steps: [
      {
        text: 'Ouvrez Services pour voir les prestations proposées aux visiteurs.',
        targets: ['guide-nav-prestations', 'guide-tab-prestations', 'guide-page'],
        route: '/prestations',
      },
    ],
  },
  {
    id: 'reviews',
    title: 'Témoignages',
    keywords: ['temoignage', 'avis client', 'commentaire'],
    steps: [
      {
        text: 'Ouvrez Témoignages pour lire les avis publiés.',
        targets: ['guide-nav-reviews', 'guide-tab-reviews', 'guide-page'],
        route: '/reviews',
      },
    ],
  },
  {
    id: 'carte',
    title: 'Carte publique',
    keywords: ['carte publique', 'menu public', 'voir le restaurant'],
    steps: [
      {
        text: 'Ouvrez la carte du restaurant visible par les visiteurs.',
        targets: ['guide-nav-carte', 'guide-tab-carte', 'guide-page'],
        route: '/carte',
      },
    ],
  },
  {
    id: 'visit',
    title: 'Visite du site',
    keywords: ['visite rapide', 'visiter le site', 'decouvrir', 'parcourir le site', 'cote visiteur'],
    steps: [
      { text: 'Touchez Réserver un séjour.', targets: ['guide-book-stay', 'guide-page'], route: '/welcome' },
      { text: 'Touchez Chambres.', targets: ['guide-nav-browse', 'guide-tab-browse', 'guide-page'], route: '/browse' },
      { text: 'Touchez Voir pour ouvrir une fiche.', targets: ['guide-filter', 'guide-page'], route: '/browse' },
      { text: 'Touchez Restaurant.', targets: ['guide-nav-carte', 'guide-tab-carte', 'guide-page'], route: '/carte' },
      { text: 'Touchez Services.', targets: ['guide-nav-prestations', 'guide-tab-prestations', 'guide-page'], route: '/prestations' },
      { text: 'Touchez Connexion.', targets: ['guide-login', 'guide-page'], route: '/welcome' },
    ],
  },
  {
    id: 'visit-client',
    title: 'Visite de mon espace',
    roles: ['client'],
    keywords: ['visite', 'visiter', 'mon espace', 'parcourir', 'ou aller'],
    steps: [
      { text: 'Touchez Chambres.', targets: ['guide-client-rooms', 'guide-tab-home', 'guide-page'], route: '/home' },
      { text: 'Touchez Commander.', targets: ['guide-client-order', 'guide-page'], route: '/home' },
      { text: 'Touchez Réception.', targets: ['guide-client-desk', 'guide-page'], route: '/home' },
      { text: 'Ouvrez Note.', targets: ['guide-tab-note', 'guide-nav-note', 'guide-page'], route: '/note' },
      { text: 'Touchez Ajouter sur un plat.', targets: ['guide-client-add', 'guide-tab-table', 'guide-page'], route: '/table' },
      { text: 'Touchez Panier.', targets: ['guide-table-cart', 'guide-page'], route: '/table' },
      { text: 'Touchez Demander le nettoyage.', targets: ['guide-clean-ask', 'guide-tab-clean', 'guide-page'], route: '/clean' },
    ],
  },
  {
    id: 'login',
    title: 'Se connecter',
    keywords: ['connexion', 'se connecter', 'mot de passe', 'email', 'identifiant'],
    steps: [
      {
        text: 'Ouvrez Connexion.',
        targets: ['guide-login', 'guide-page'],
        route: '/login',
      },
      {
        text: 'Saisissez l’e-mail du compte.',
        targets: ['guide-email', 'guide-page'],
        click: false,
      },
      {
        text: 'Saisissez le mot de passe. S’il est oublié, le lien au-dessus du bouton indique de contacter la réception.',
        targets: ['guide-password', 'guide-email'],
        click: false,
      },
      {
        text: 'Touchez Se connecter. Chaque rôle arrive sur son propre tableau de bord.',
        targets: ['guide-login-submit', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'home',
    title: 'Tableau de bord',
    roles: ['receptionist', 'manager', 'housekeeping', 'owner', 'restaurant'],
    keywords: ['tableau de bord', 'accueil equipe', 'mon rapport', 'journee'],
    steps: [
      {
        text: 'Ouvrez le tableau de bord.',
        targets: ['guide-nav-home', 'guide-tab-home', 'guide-page'],
        route: '/home',
      },
      {
        text: 'Touchez Mon rapport si vous êtes à la réception. Les autres rôles lisent leurs cartes ici. Je ne lis aucun chiffre.',
        targets: ['guide-day-report', 'guide-page'],
        click: true,
      },
    ],
  },
  {
    id: 'tour',
    title: 'Visite de l’espace',
    keywords: ['visite', 'par ou commencer', 'presenter', 'aide generale', 'comment ca marche', 'menu general', 'ou cliquer'],
    steps: [
      {
        text: 'Le menu porte vos écrans. Sur téléphone, le bouton menu en bas ouvre le reste. Sur grand écran, la liste est à gauche.',
        targets: ['guide-menu', 'guide-nav-home', 'guide-tab-home'],
      },
      {
        text: 'Touchez le tableau de bord. Dites ensuite le module, ou « tous les modules » pour enchaîner chaque étape.',
        route: '/home',
        targets: ['guide-nav-home', 'guide-tab-home', 'guide-day-report', 'guide-page'],
      },
    ],
  },
];

export function fold(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canRun(tour: GuideTour, role?: string | null) {
  if (!tour.roles?.length) return true;
  if (!role) return tour.id === 'login' || tour.id === 'browse' || tour.id === 'tour';
  if (role === 'owner') return true;
  return tour.roles.includes(role);
}

const FAMILY: Record<string, string> = {
  reservation: 'stay',
  cancel: 'stay',
  rooms: 'stay',
  browse: 'stay',
  clients: 'guest',
  sale: 'cash',
  service: 'cash',
  report: 'report',
  message: 'msg',
  desk: 'msg',
  housekeeping: 'hk',
  clean: 'hk',
  issue: 'issue',
  planning: 'plan',
  stock: 'stock',
  kitchen: 'stock',
  staff: 'hr',
  payroll: 'hr',
  settings: 'settings',
  orders: 'resto',
  menu: 'resto',
  daily: 'resto',
  drinks: 'resto',
  carte: 'resto',
  table: 'resto',
  note: 'bill',
  stay: 'bill',
  login: 'auth',
  welcome: 'public',
  home: 'home',
  visit: 'visit',
  'visit-client': 'visit',
  about: 'public',
  prestations: 'public',
  reviews: 'public',
  tour: 'meta',
};

function scoreTour(tour: GuideTour, hay: string) {
  let score = 0;
  let at = hay.length;
  for (const word of tour.keywords) {
    const folded = fold(word);
    const index = folded ? hay.indexOf(folded) : -1;
    if (index < 0) continue;
    score += folded.length > 10 ? 4 : folded.length > 6 ? 3 : 2;
    if (index < at) at = index;
  }
  if (hay.includes(fold(tour.title))) score += 3;
  if (tour.id === 'cancel' && /annul/.test(hay)) score += 5;
  if (tour.id === 'reservation' && /annul/.test(hay)) score -= 4;
  if (tour.id === 'housekeeping' && /\bventes?\b/.test(hay) && !/\bsales\b/.test(hay)) score -= 4;
  if (tour.id === 'sale' && /\bsales\b/.test(hay)) score -= 4;
  if (tour.id === 'sale' && /restaurant|plat|boisson|addition/.test(hay)) score -= 3;
  if (tour.id === 'service' && /restaurant|plat|boisson|addition/.test(hay)) score += 4;
  if (tour.id === 'rooms' && roleStaffStay(hay)) score += 2;
  if (tour.id === 'browse' && /client|employe|personnel|reception/.test(hay)) score -= 3;
  if (tour.id === 'tour' && score > 0 && /reservation|vente|rapport|message|chambre|commande|client/.test(hay)) score -= 3;
  return { score, at };
}

function roleStaffStay(hay: string) {
  return /fiche|tarif|photo|ajouter|categorie|hors service/.test(hay);
}

const FULL_SKIP = new Set(['tour', 'visit', 'visit-client', 'login']);

export function wantsFull(text: string) {
  return /parcours|tous les modules|toutes les etapes|presente tout|montre tout|guide complet/.test(fold(text));
}

export function fullTour(role?: string | null): GuideTour {
  const steps = TOURS.filter((tour) => !FULL_SKIP.has(tour.id) && canRun(tour, role)).flatMap((tour) => tour.steps);
  return {
    id: 'parcours',
    title: 'Tous les modules',
    keywords: [],
    steps: steps.length ? steps : tourById('tour')?.steps || [],
  };
}

export function matchTour(text: string, role?: string | null) {
  return composeTour(text, role);
}

export function composeTour(text: string, role?: string | null) {
  const hay = fold(text);
  if (!hay) return null;
  const hits = TOURS.map((tour) => {
    if (!canRun(tour, role) || tour.id === 'tour') return null;
    const scored = scoreTour(tour, hay);
    return scored.score >= 2 ? { tour, ...scored } : null;
  }).filter((item): item is { tour: GuideTour; score: number; at: number } => !!item);
  hits.sort((a, b) => b.score - a.score || a.at - b.at);
  const picked: { tour: GuideTour; score: number; at: number }[] = [];
  for (const hit of hits) {
    const family = FAMILY[hit.tour.id] || hit.tour.id;
    const same = picked.find((item) => (FAMILY[item.tour.id] || item.tour.id) === family);
    if (same) continue;
    if (picked.length && Math.abs(hit.at - picked[0].at) < 6 && !/ puis | ensuite | apres | et | aussi /.test(` ${hay} `)) continue;
    picked.push(hit);
    if (picked.length === 3) break;
  }
  picked.sort((a, b) => a.at - b.at);
  if (!picked.length) return null;
  if (picked.length === 1) return picked[0].tour;
  return {
    id: `combo-${picked.map((item) => item.tour.id).join('-')}`,
    title: picked.map((item) => item.tour.title).join(' · '),
    keywords: [],
    steps: picked.flatMap((item) => item.tour.steps),
  };
}

export function suggestionsFor(role?: string | null) {
  const all = [
    { label: 'Tous les modules', id: 'parcours' },
    { label: 'Visite', id: role === 'client' ? 'visit-client' : role ? 'tour' : 'visit' },
    { label: 'Réserver', id: 'reservation' },
    { label: 'Vente', id: 'sale' },
    { label: 'Rapport', id: 'report' },
    { label: 'Message', id: 'message' },
    { label: 'Sales', id: 'housekeeping' },
    { label: 'Commande', id: 'orders' },
    { label: 'Ma note', id: 'note' },
    { label: 'Personnel', id: 'staff' },
    { label: 'Connexion', id: 'login' },
    { label: 'Chambres', id: 'browse' },
  ];
  return all.filter((item) => {
    if (item.id === 'parcours') return true;
    const tour = TOURS.find((entry) => entry.id === item.id);
    return tour ? canRun(tour, role) : false;
  }).slice(0, 5);
}

export function tourById(id?: string | null) {
  return TOURS.find((tour) => tour.id === id) ?? null;
}
