begin;
-- La prioridad visual y el orden del sorteo se administran independientemente.
alter table public.premio_rifa add constraint premio_de_rifa unique(id_rifa,id_premio_rifa);
create table public.premio_destacado (
  id_premio_rifa uuid primary key,
  id_rifa uuid not null,
  prioridad integer not null check(prioridad between 1 and 5),
  foreign key(id_rifa,id_premio_rifa) references public.premio_rifa(id_rifa,id_premio_rifa) on delete cascade,
  unique(id_rifa,prioridad) deferrable initially deferred
);
alter table public.premio_destacado enable row level security;
revoke all on public.premio_destacado from public,anon,authenticated;
grant select on public.premio_destacado to authenticated;
create policy lectura_propietaria on public.premio_destacado for select to authenticated
using(id_rifa in (select id_rifa from public.rifa));
-- Mantener una selección visible para las rifas ya registradas.
insert into public.premio_destacado
select id_premio_rifa,id_rifa,posicion from (
 select p.*,row_number() over(partition by id_rifa order by orden_sorteo) posicion from public.premio_rifa p
) anteriores where posicion<=5;

create view public.vw_premios_rifa with(security_invoker=true) as
select p.*,d.prioridad from public.premio_rifa p left join public.premio_destacado d using(id_rifa,id_premio_rifa);
revoke all on public.vw_premios_rifa from public,anon,authenticated;
grant select on public.vw_premios_rifa to authenticated;

create function public.guardar_premio_con_prioridad(p_rifa uuid,p_nombre text,p_orden integer,p_extraccion integer,p_sorpresa boolean,p_imagen text,p_descripcion text,p_premio uuid,p_prioridad integer)
returns void language plpgsql security definer set search_path='' as $$
declare anterior integer; ocupado uuid;
begin
 perform public.bloquear_rifa(p_rifa);
 perform public.guardar_premio(p_rifa,p_nombre,p_orden,p_extraccion,p_sorpresa,p_imagen,p_descripcion,p_premio);
 if p_premio is null then
   select id_premio_rifa into strict p_premio from public.premio_rifa where id_rifa=p_rifa and orden_sorteo=p_orden;
 end if;
 select prioridad into anterior from public.premio_destacado where id_premio_rifa=p_premio;
 if p_prioridad is null then
   delete from public.premio_destacado where id_premio_rifa=p_premio;
   return;
 end if;
 select id_premio_rifa into ocupado from public.premio_destacado where id_rifa=p_rifa and prioridad=p_prioridad and id_premio_rifa<>p_premio;
 if anterior is null and (select count(*) from public.premio_destacado where id_rifa=p_rifa)>=5 then
   raise exception 'Ya hay cinco premios destacados. Desactiva uno antes de agregar otro.';
 end if;
 if ocupado is not null then
   if anterior is null then raise exception 'La prioridad ya está ocupada. Elige una libre.'; end if;
   update public.premio_destacado set prioridad=anterior where id_premio_rifa=ocupado;
 end if;
 insert into public.premio_destacado values(p_premio,p_rifa,p_prioridad)
 on conflict(id_premio_rifa) do update set prioridad=excluded.prioridad;
end $$;
revoke all on function public.guardar_premio_con_prioridad from public,anon,authenticated;
grant execute on function public.guardar_premio_con_prioridad to authenticated;

create or replace function public.consultar_boleto(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when b.estado='anulado' then jsonb_build_object('estado','anulado')
 else jsonb_build_object(
   'estado',b.estado,'codigo',b.token_publico,'numero',b.datos_emision_historicos->'numero',
   'participante',b.datos_emision_historicos->'participante','rifa',r.nombre,'fecha',r.fecha_sorteo,
   'imagen',r.imagen_premio_url,'plantilla',to_jsonb(t)-'id_rifa'-'id_plantilla_boleto',
   'destacados',case when t.mostrar_premio then (select coalesce(jsonb_agg(case when p.es_sorpresa then 'Premio sorpresa' else p.nombre end order by p.prioridad),'[]') from public.vw_premios_rifa p where p.id_rifa=r.id_rifa and p.prioridad is not null) end,
   'mas_premios',t.mostrar_premio and exists(select from public.vw_premios_rifa p where p.id_rifa=r.id_rifa and p.prioridad is null),
   'direccion',case when t.mostrar_lugar and c.modalidad='presencial' then c.direccion end,
   'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g') when c.modalidad in ('teams','otro') then c.enlace_reunion end
 ) end from public.boleto b join public.detalle_venta using(id_detalle_venta)
 join public.venta using(id_venta) join public.rifa r using(id_rifa) join public.plantilla_boleto t using(id_rifa)
 join public.configuracion_transmision c using(id_rifa) where b.token_publico=p_token;
$$;
commit;
