// Configuration du mode en ligne (comptes, classement, fil d'activité).
// La clé « publishable » (ou « anon ») peut être publique : ce sont les règles RLS de la base
// qui protègent les données. Ne JAMAIS mettre ici la clé « secret » / « service_role ».
window.TT_CONFIG = {
  supabaseUrl: 'https://hbeloyvmukaorsmxzuqn.supabase.co',
  supabaseKey: 'sb_publishable_zecZeDqr74C6qQcSpSdhPQ_dsqIz3BU',
  // Version exacte épinglée de supabase-js (chargée à la demande, l'app marche sans)
  supabaseJs: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.js',
};
