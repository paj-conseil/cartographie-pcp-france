// Configuration des cibles de prospection par bloc d'activité PCP.
// Chaque "groupe" représente un type de prescripteur/client cible.
// - naf: liste de codes NAF (activité principale) à interroger
// // - legal: liste de codes "nature juridique" INSEE (pour les collectivités, non identifiables
//   fiablement par NAF). 7210 = Commune, 7220 = Établissement public local (EPCI...).
// Un groupe peut combiner naf + legal (deux requêtes séparées, résultats fusionnés).

window.PROSPECTION_CONFIG = {
  blocs: {
    'termite_merule_ilx': {
      label: 'Termites / Mérule / ILX',
      sousTitre: 'Traitement charpentes, bois, structures',
      groupes: [
        { key: 'charpentiers', label: 'Charpentiers', naf: ['43.91A'] },
        { key: 'macons', label: 'Maçons / gros œuvre', naf: ['43.99C'] },
        { key: 'agences_immo', label: 'Agences immobilières', naf: ['68.31Z'] },
        { key: 'syndics', label: 'Syndics de copropriété', naf: ['68.32A'] },
        { key: 'municipalites', label: 'Secteur public (communes, intercommunalités)', legal: ['7210', '7346', '7347', '7348', '7343', '7345', '7353', '7312'] }
      ]
    },
    '3d': {
      label: '3D',
      sousTitre: 'Dératisation / Désinsectisation / Désinfection',
      groupes: [
        { key: 'chr', label: 'Cafés, hôtels, restaurants', naf: ['56.10A', '56.10B', '56.10C', '56.30Z', '55.10Z'] },
        { key: 'alimentaire', label: 'Magasins alimentaires (boulangerie → grande distrib.)', naf: ['47.11A', '47.11B', '47.11C', '47.11D', '47.11E', '47.11F', '47.21Z', '47.22Z', '47.23Z', '47.24Z', '47.25Z', '47.26Z', '47.29Z'] },
        { key: 'agroalim', label: 'Industrie agroalimentaire', naf: [
            '10.11Z','10.12Z','10.13A','10.13B','10.20Z','10.31Z','10.32Z','10.39A','10.39B',
            '10.41A','10.41B','10.42Z','10.51A','10.51B','10.51C','10.51D','10.52Z',
            '10.61A','10.61B','10.62Z','10.71A','10.71B','10.71C','10.71D','10.72Z','10.73Z',
            '10.81Z','10.82Z','10.83Z','10.84Z','10.85Z','10.86Z','10.89Z','10.91Z','10.92Z',
            '11.01Z','11.02A','11.02B','11.03Z','11.04Z','11.05Z','11.06Z','11.07A','11.07B'
          ] },
        { key: 'entrepots', label: 'Entrepôts / logistique', naf: ['52.10A', '52.10B'] },
        { key: 'pharma', label: 'Industrie pharmaceutique', naf: ['21.10Z', '21.20Z', '46.46Z'] },
        { key: 'sante', label: 'Établissements de santé', naf: ['86.10Z', '87.10A', '87.10B', '87.10C'] },
        { key: 'municipalites', label: 'Secteur public (communes, bâtiments publics, écoles, militaire)', legal: ['7210', '7346', '7347', '7348', '7343', '7345', '7353', '7312', '7331'], naf: ['85.10Z', '85.20Z', '85.31Z', '85.32Z', '85.41Z', '84.22Z'] },
        { key: 'syndics', label: 'Syndics / gestionnaires immobiliers', naf: ['68.32A', '68.32B'] }
      ]
    }
  },
  // Blocs pas encore définis, affichés grisés dans l'UI en attendant la logique de prescripteurs
  blocsAVenir: ['Hottes', 'Humidité', 'Assainissement', 'Isolation']
};
