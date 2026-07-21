// Configuration des cibles de prospection par bloc d'activité PCP.
// Chaque bloc contient des "groupes" (catégories), eux-mêmes composés de
// "sousCategories" sélectionnables individuellement pour affiner la recherche.
// - naf: liste de codes NAF (activité principale) à interroger
// - legal: liste de codes "nature juridique" INSEE (secteur public / logement social,
//   non identifiables fiablement par NAF seul). Ex : 7210 = Commune, 7364 = Office public de l'habitat.
// Une sous-catégorie peut combiner naf + legal (deux requêtes séparées, résultats fusionnés).

window.PROSPECTION_CONFIG = {
  blocs: {
    'termite_merule_ilx': {
      label: 'Termites / Mérule / ILX',
      sousTitre: 'Traitement charpentes, bois, structures',
      groupes: [
        {
          key: 'construction',
          label: 'Construction',
          sousCategories: [
            { key: 'charpentiers', label: 'Charpentiers', naf: ['43.91A', '43.91B'] },
            { key: 'macons', label: 'Maçons / gros œuvre', naf: ['43.99B', '43.99C'] }
          ]
        },
        {
          key: 'gestion_immo',
          label: 'Gestion immobilière',
          sousCategories: [
            { key: 'agences_immo', label: 'Agences immobilières', naf: ['68.31Z'] },
            { key: 'syndics', label: 'Syndics de copropriété', naf: ['68.32A'] },
            { key: 'diagnostiqueur', label: 'Diagnostiqueur immobilier', naf: ['71.20B'] }
          ]
        },
        {
          key: 'services_publics',
          label: 'Secteur public',
          sousCategories: [
            { key: 'mairie', label: 'Mairie', legal: ['7210'] },
            { key: 'collectivites', label: 'Collectivités / intercommunalités', legal: ['7346', '7347', '7348', '7343', '7345', '7353', '7312'] }
          ]
        }
      ]
    },
    '3d': {
      label: '3D',
      sousTitre: 'Dératisation / Désinsectisation / Désinfection',
      groupes: [
        {
          key: 'agroalim',
          label: 'Industrie agroalimentaire',
          sousCategories: [
            { key: 'viande_poisson', label: 'Viande et poisson', naf: ['10.11Z', '10.12Z', '10.13A', '10.13B', '10.20Z'] },
            { key: 'fruits_legumes_huiles', label: 'Fruits, légumes, huiles', naf: ['10.31Z', '10.32Z', '10.39A', '10.39B', '10.41A', '10.41B', '10.42Z'] },
            { key: 'laitier', label: 'Produits laitiers', naf: ['10.51A', '10.51B', '10.51C', '10.51D', '10.52Z'] },
            { key: 'cereales_boulangerie', label: 'Céréales, boulangerie, pâtisserie', naf: ['10.61A', '10.61B', '10.62Z', '10.71A', '10.71B', '10.71C', '10.71D', '10.72Z', '10.73Z'] },
            { key: 'autres_alim', label: 'Autres produits alimentaires', naf: ['10.81Z', '10.82Z', '10.83Z', '10.84Z', '10.85Z', '10.86Z', '10.89Z', '10.91Z', '10.92Z'] },
            { key: 'boissons', label: 'Boissons', naf: ['11.01Z', '11.02A', '11.02B', '11.03Z', '11.04Z', '11.05Z', '11.06Z', '11.07A', '11.07B'] }
          ]
        },
        {
          key: 'pharma',
          label: 'Industrie pharmaceutique',
          sousCategories: [
            { key: 'fabrication_pharma', label: 'Fabrication', naf: ['21.10Z', '21.20Z'] },
            { key: 'gros_pharma', label: 'Commerce de gros pharmaceutique', naf: ['46.46Z'] }
          ]
        },
        {
          key: 'sante',
          label: 'Santé',
          sousCategories: [
            { key: 'hopitaux', label: 'Hôpitaux / cliniques', naf: ['86.10Z'] },
            { key: 'medecins', label: 'Médecins / dentistes', naf: ['86.21Z', '86.22A', '86.22B', '86.22C', '86.23Z'] },
            { key: 'autres_sante', label: 'Autres activités de santé', naf: ['86.90A', '86.90B', '86.90C', '86.90D', '86.90E', '86.90F'] },
            { key: 'ehpad', label: 'EHPAD / hébergement médicalisé', naf: ['87.10A', '87.10B', '87.10C'] },
            { key: 'hebergement_social', label: 'Hébergement social / handicap', naf: ['87.20Z', '87.30A', '87.30B', '87.90A', '87.90B'] },
            { key: 'aide_domicile_creches', label: 'Aide à domicile / crèches', naf: ['88.10A', '88.10B', '88.10C', '88.91A', '88.91B'] }
          ]
        },
        {
          key: 'agriculture',
          label: 'Agriculture',
          sousCategories: [
            { key: 'cultures', label: 'Cultures', naf: ['01.11Z', '01.13Z', '01.21Z', '01.24Z'] },
            { key: 'elevage', label: 'Élevage', naf: ['01.41Z', '01.42Z', '01.43Z', '01.44Z', '01.45Z', '01.46Z', '01.47Z', '01.49Z', '01.50Z'] },
            { key: 'services_agricoles', label: 'Services agricoles', naf: ['01.61Z', '01.62Z', '01.63Z'] }
          ]
        },
        {
          key: 'commerce_alim',
          label: 'Commerce alimentaire',
          sousCategories: [
            { key: 'grande_distrib', label: 'Grande distribution / supérettes', naf: ['47.11A', '47.11B', '47.11C', '47.11D', '47.11E', '47.11F'] },
            { key: 'commerces_specialises_alim', label: 'Boulangerie, boucherie, primeur...', naf: ['47.21Z', '47.22Z', '47.23Z', '47.24Z', '47.25Z', '47.26Z', '47.29Z'] }
          ]
        },
        {
          key: 'commerce_non_alim',
          label: 'Commerce non-alimentaire',
          sousCategories: [
            { key: 'grands_magasins', label: 'Grands magasins / bazars', naf: ['47.19Z'] },
            { key: 'equipement_info', label: 'Équipement info / électroménager', naf: ['47.41Z', '47.42Z', '47.43Z'] },
            { key: 'bricolage_meubles', label: 'Quincaillerie, bricolage, meubles', naf: ['47.51Z', '47.52Z', '47.53Z', '47.54Z', '47.59Z'] },
            { key: 'livres_loisirs', label: 'Livres, loisirs, culture', naf: ['47.64Z', '47.65Z'] },
            { key: 'habillement', label: 'Habillement, chaussures, santé-beauté', naf: ['47.71Z', '47.72A', '47.72B', '47.75Z', '47.76Z', '47.77Z', '47.78A', '47.78B', '47.78C'] },
            { key: 'marches_vad', label: 'Marchés / vente à distance', naf: ['47.79Z'] }
          ]
        },
        {
          key: 'chr',
          label: 'Cafés, hôtels, restaurants',
          sousCategories: [
            { key: 'restaurants', label: 'Restaurants', naf: ['56.10A', '56.10B', '56.10C'] },
            { key: 'bars', label: 'Bars / débits de boissons', naf: ['56.30Z'] },
            { key: 'hotels', label: 'Hôtels', naf: ['55.10Z'] }
          ]
        },
        {
          key: 'construction',
          label: 'Construction / BTP',
          sousCategories: [
            { key: 'architectes', label: 'Architectes', naf: ['71.11Z'] },
            { key: 'constructeurs', label: 'Constructeurs / promoteurs', naf: ['41.20A', '41.20B'] },
            { key: 'macons', label: 'Maçons / gros œuvre', naf: ['43.99B', '43.99C'] },
            { key: 'charpentiers', label: 'Charpentiers', naf: ['43.91A', '43.91B'] },
            { key: 'genie_civil', label: 'Génie civil / VRD', naf: ['42.11Z', '42.12Z', '42.13A', '42.13B', '42.21Z', '42.22Z', '42.99Z'] },
            { key: 'second_oeuvre', label: 'Second œuvre', naf: ['43.21A', '43.21B', '43.22A', '43.22B', '43.29A', '43.29B', '43.31Z', '43.32B', '43.32C', '43.33Z', '43.34Z', '43.39Z'] }
          ]
        },
        {
          key: 'logistique',
          label: 'Logistique',
          sousCategories: [
            { key: 'entrepots', label: 'Entrepôts', naf: ['52.10A', '52.10B'] },
            { key: 'transport_routier', label: 'Transport routier de marchandises', naf: ['49.41A', '49.41B', '49.42Z'] },
            { key: 'affretement', label: 'Organisation des transports / affrètement', naf: ['52.21Z', '52.29A', '52.29B'] },
            { key: 'messagerie', label: 'Messagerie / courrier', naf: ['53.20Z'] }
          ]
        },
        {
          key: 'gestion_bureaux',
          label: 'Gestion immobilière, bureaux',
          sousCategories: [
            { key: 'syndics', label: 'Syndics de copropriété', naf: ['68.32A'] },
            { key: 'agences_immo', label: 'Agences immobilières', naf: ['68.31Z'] },
            { key: 'diagnostiqueur', label: 'Diagnostiqueur immobilier', naf: ['71.20B'] },
            { key: 'property_facility_manager', label: 'Property / facility manager, gestionnaire immobilier', naf: ['68.20A', '68.20B', '68.32B', '82.11Z'] }
          ]
        },
        {
          key: 'services_publics',
          label: 'Services publics',
          sousCategories: [
            { key: 'mairie', label: 'Mairie', legal: ['7210'] },
            { key: 'collectivites', label: 'Collectivités / intercommunalités', legal: ['7346', '7347', '7348', '7343', '7345', '7353', '7312'] },
            { key: 'ecoles_publiques', label: 'Écoles publiques', legal: ['7331'] },
            { key: 'ecoles_privees', label: 'Écoles privées', naf: ['85.10Z', '85.20Z', '85.31Z', '85.32Z', '85.41Z'] },
            { key: 'musees', label: 'Musées / établissements culturels', naf: ['91.01Z', '91.02Z', '91.03Z', '91.04Z'] },
            { key: 'defense', label: 'Défense / militaire', legal: ['7150'] }
          ]
        },
        {
          key: 'logement_social',
          label: 'Logement social',
          sousCategories: [
            { key: 'oph', label: 'Offices publics de l\'habitat', legal: ['7364'] },
            { key: 'bailleurs_sociaux', label: 'Bailleurs sociaux', naf: ['68.20A'] }
          ]
        },
        {
          key: 'infrastructures',
          label: 'Infrastructures',
          sousCategories: [
            { key: 'reseaux_transport', label: 'Réseaux transport (routes, rail, ponts)', naf: ['42.11Z', '42.12Z', '42.13A', '42.13B'] },
            { key: 'reseaux_fluides', label: 'Réseaux fluides, énergie, télécom', naf: ['42.21Z', '42.22Z'] },
            { key: 'gestion_infra_transport', label: 'Gestion d\'infrastructures (gares, aéroports, ports)', naf: ['52.21Z', '52.22Z', '52.23Z'] }
          ]
        }
      ]
    }
  },
  // Blocs pas encore définis, affichés grisés dans l'UI en attendant la logique de prescripteurs
  blocsAVenir: ['Hottes', 'Humidité', 'Assainissement', 'Isolation']
};
