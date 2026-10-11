-- ============================================================
-- TBK — Option "Flocage" (personnalisation du nom) sur un article
-- boutique : activable par article (case à cocher + prix, par défaut
-- 3 €), Oui/Non au moment de la commande, avec saisie du nom à floquer
-- si Oui. Activée automatiquement sur "Maillot Club Sublimé" si cet
-- article existe déjà dans votre catalogue — sinon, activable
-- manuellement sur n'importe quel article depuis le formulaire
-- d'ajout/modification.
-- ============================================================

alter table public.boutique_articles
  add column if not exists propose_flocage boolean not null default false,
  add column if not exists prix_flocage numeric(8,2) not null default 3.00;

alter table public.boutique_commandes
  add column if not exists flocage boolean not null default false,
  add column if not exists flocage_nom text,
  add column if not exists flocage_prix numeric(8,2) not null default 0;

update public.boutique_articles
set propose_flocage = true, prix_flocage = 3.00
where nom = 'Maillot Club Sublimé' and not propose_flocage;
