-- Ejecutar como postgres después de habilitar Cron (pg_cron) en Integrations.
select cron.schedule('rifafacil_vencer_reservas','* * * * *','select public.vencer_reservas()');
