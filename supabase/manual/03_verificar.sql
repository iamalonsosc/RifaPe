select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select id_perfil,nombre from public.perfil;
select jobname,schedule,active from cron.job where jobname='rifafacil_vencer_reservas';
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='rifafacil-imagenes';
