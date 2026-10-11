-- ============================================================
-- TBK — Modèles d'emails configurables pour les relances
-- d'inscription saison (cotisation manquante, certificat médical
-- attendu, QS Sport attendu, inscription validée / bienvenue).
-- Le contenu est modifiable depuis Administration, avec des
-- variables ({prenom}, {nom}, {montant}, {email}, {url_site})
-- remplacées automatiquement à l'envoi.
-- ============================================================

create table if not exists public.inscriptions_email_templates (
  cle text primary key,
  sujet text not null,
  corps text not null,
  updated_at timestamptz not null default now()
);

alter table public.inscriptions_email_templates enable row level security;
grant select, update on public.inscriptions_email_templates to authenticated;

drop policy if exists "email_templates_lecture" on public.inscriptions_email_templates;
create policy "email_templates_lecture"
  on public.inscriptions_email_templates for select
  using (public.current_user_has_access('inscriptions') or public.current_user_has_access('administration'));

drop policy if exists "email_templates_ecriture" on public.inscriptions_email_templates;
create policy "email_templates_ecriture"
  on public.inscriptions_email_templates for update
  using (public.current_user_has_access('inscriptions') or public.current_user_has_access('administration'))
  with check (public.current_user_has_access('inscriptions') or public.current_user_has_access('administration'));

insert into public.inscriptions_email_templates (cle, sujet, corps) values
('cotisation_absente', 'TBK — Cotisation en attente', 'Bonjour {prenom},

Nous n''avons pas encore reçu le règlement de votre cotisation ({montant} €) pour la saison au TBK.

Merci de nous la faire parvenir dès que possible afin de finaliser votre inscription.

Sportivement,
Le bureau du TBK'),

('certificat_medical_attendu', 'TBK — Certificat médical attendu', 'Bonjour {prenom},

Votre inscription au TBK nécessite un certificat médical de non contre-indication à la pratique du badminton / tennis de table.

Merci de nous le faire parvenir dès que possible.

Sportivement,
Le bureau du TBK'),

('qs_sport_attendu', 'TBK — Questionnaire de santé attendu', 'Bonjour {prenom},

Votre inscription au TBK nécessite le questionnaire de santé (QS Sport) complété.

Merci de nous le faire parvenir dès que possible.

Sportivement,
Le bureau du TBK'),

('inscription_validee', 'TBK — Bienvenue au club !', 'Bonjour {prenom},

Votre inscription au TBK est maintenant validée : vous êtes officiellement membre du club pour cette saison !

Pour accéder à votre espace membre, rendez-vous sur {url_site}
- Si vous n''avez pas encore de compte sur le site, créez-en un avec votre adresse email ({email}) depuis la page de connexion.
- Si vous avez déjà un compte mais avez oublié votre mot de passe, utilisez le lien "Mot de passe oublié" sur la page de connexion.

Sportivement,
Le bureau du TBK')

on conflict (cle) do nothing;
