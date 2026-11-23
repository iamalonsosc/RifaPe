begin;
create schema if not exists privado;
revoke all on schema privado from public,anon,authenticated;
create table privado.limite_consulta(clave text primary key, ventana timestamptz not null, cantidad integer not null);
alter table privado.limite_consulta enable row level security;
create function public.permitir_consulta(p_clave text) returns boolean language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 delete from privado.limite_consulta where ventana<now()-interval '2 minutes';
 insert into privado.limite_consulta values(p_clave,date_trunc('minute',now()),1)
 on conflict(clave) do update set cantidad=case when limite_consulta.ventana=excluded.ventana then limite_consulta.cantidad+1 else 1 end,ventana=excluded.ventana returning cantidad into total;
 return total<=60;
end $$;
revoke all on function public.permitir_consulta from public,anon,authenticated;
grant execute on function public.permitir_consulta to service_role;
commit;
