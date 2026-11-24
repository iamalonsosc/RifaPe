begin;
-- El perfil existente ocupa la primera plaza sin cambiar su UUID ni sus datos.
alter table public.perfil add column plaza smallint;
update public.perfil set plaza=1;
alter table public.perfil alter column plaza set not null,
  add constraint perfil_plaza_valida check (plaza in (1,2)),
  add constraint perfil_plaza_unica unique(plaza);
drop index public.perfil_administradora_unica;

create or replace function public.crear_perfil_autorizado() returns trigger
language plpgsql security definer set search_path='' as $$
declare disponible smallint;
begin
 if coalesce(new.raw_app_meta_data->>'rol_rifapes',new.raw_app_meta_data->>'rol_rifafacil','') <> 'administradora' then return new; end if;
 lock table public.perfil in share row exclusive mode;
 if exists(select from public.perfil where id_perfil=new.id) then return new; end if;
 select n into disponible from generate_series(1,2) n
 where not exists(select from public.perfil p where p.plaza=n) order by n limit 1;
 if disponible is null then raise exception 'Ya están autorizadas las dos administradoras de RifaPes'; end if;
 insert into public.perfil(id_perfil,nombre,plaza) values(new.id,split_part(new.email,'@',1),disponible);
 return new;
end $$;

-- Cron y las operaciones de administración también deben auditar al propietario real.
create or replace function public.auditoria_cambios_criticos() returns trigger
language plpgsql security definer set search_path='' as $$
declare anterior jsonb; nuevo jsonb; fila jsonb; titular uuid;
begin
 if tg_op<>'INSERT' then anterior:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then nuevo:=to_jsonb(new); end if;
 fila:=coalesce(nuevo,anterior);
 case tg_table_name
 when 'rifa' then titular:=(fila->>'id_perfil')::uuid;
 when 'premio_rifa','reserva','venta','sorteo' then
   select id_perfil into strict titular from public.rifa where id_rifa=(fila->>'id_rifa')::uuid;
 when 'pago' then
   select r.id_perfil into strict titular from public.venta v join public.rifa r using(id_rifa) where v.id_venta=(fila->>'id_venta')::uuid;
 when 'devolucion' then
   select r.id_perfil into strict titular from public.pago p join public.venta v using(id_venta) join public.rifa r using(id_rifa) where p.id_pago=(fila->>'id_pago')::uuid;
 when 'extraccion_sorteo','resultado_sorteo' then
   select r.id_perfil into strict titular from public.sorteo s join public.rifa r using(id_rifa) where s.id_sorteo=(fila->>'id_sorteo')::uuid;
 else raise exception 'Entidad de auditoría desconocida';
 end case;
 insert into public.auditoria(id_perfil,entidad,id_registro,accion,datos_anteriores,datos_nuevos)
 values(titular,tg_table_name,(fila->>tg_argv[0])::uuid,tg_op,anterior,nuevo);
 return null;
end $$;
commit;
