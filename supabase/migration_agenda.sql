-- ============================================================
-- TBK — Page Agenda du club (Google Calendar), réservée pour
-- l'instant au profil admin
-- ============================================================

update public.roles
set pages = array_append(pages, 'agenda')
where key = 'admin' and not ('agenda' = any(pages));
