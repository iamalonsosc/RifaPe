-- Primero crea una usuaria confirmada en Authentication > Users.
-- Sustituye el UUID de ejemplo por el User UID exacto de esa cuenta.
do $$
declare elegida uuid := '00000000-0000-0000-0000-000000000000';
begin
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"rol_rifafacil":"administradora"}'::jsonb where id=elegida and email_confirmed_at is not null;
 if not found then raise exception 'Revisa el UUID y confirma el correo de la administradora'; end if;
end $$;
