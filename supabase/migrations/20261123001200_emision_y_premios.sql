begin;
alter table public.premio_destacado drop constraint premio_destacado_prioridad_check, add check(prioridad>0);
-- Fijar el precio ofrecido desde la reserva hasta su conversión.
alter table public.reserva add column precio_unitario numeric(12,2);
update public.reserva s set precio_unitario=r.precio_numero from public.rifa r where r.id_rifa=s.id_rifa;
alter table public.reserva alter column precio_unitario set not null;
create function public.fijar_precio_reserva() returns trigger language plpgsql set search_path='' as $$
begin
 select precio_numero into strict new.precio_unitario from public.rifa where id_rifa=new.id_rifa;
 return new;
end $$;
revoke all on function public.fijar_precio_reserva from public,anon,authenticated;
create trigger fijar_precio_reserva before insert on public.reserva for each row execute function public.fijar_precio_reserva();
alter table public.boleto alter column id_detalle_venta drop not null,
 add column id_detalle_reserva uuid unique references public.detalle_reserva,
 add check(num_nonnulls(id_detalle_venta,id_detalle_reserva)=1);
create policy lectura_reserva on public.boleto for select to authenticated using
 (id_detalle_reserva in(select id_detalle_reserva from public.detalle_reserva));
create view public.vw_boletos_rifa with(security_invoker=true) as
select b.id_boleto,b.id_detalle_venta,b.id_detalle_reserva,b.token_publico,b.fecha_emision,b.datos_emision_historicos,
 case when r.estado='activa' and r.fecha_vencimiento<=now() then 'anulado' else b.estado end estado,
 coalesce(v.id_rifa,r.id_rifa) id_rifa,coalesce(v.id_persona,r.id_persona) id_persona,v.id_venta,r.id_reserva
from public.boleto b left join public.detalle_venta dv using(id_detalle_venta)
 left join public.venta v using(id_venta) left join public.detalle_reserva dr using(id_detalle_reserva)
 left join public.reserva r using(id_reserva);
revoke all on public.vw_boletos_rifa from public,anon,authenticated;
grant select on public.vw_boletos_rifa to authenticated;
create function public.anular_boletos_reserva() returns trigger language plpgsql set search_path='' as $$
begin
 update public.boleto set estado='anulado' where id_detalle_reserva in
 (select id_detalle_reserva from public.detalle_reserva where id_reserva=new.id_reserva);
 return new;
end $$;
revoke all on function public.anular_boletos_reserva from public,anon,authenticated;
create trigger anular_boletos_reserva after update of estado on public.reserva for each row
 when (new.estado not in ('activa','convertida')) execute function public.anular_boletos_reserva();
alter table public.pago add column id_perfil_registro uuid references public.perfil;
update public.pago p set id_perfil_registro=a.id_perfil from public.auditoria a
 where a.entidad='pago' and a.accion='INSERT' and a.id_registro=p.id_pago;
alter table public.pago alter column id_perfil_registro set default auth.uid();
create or replace function public.guardar_premio_con_prioridad(p_rifa uuid,p_nombre text,p_orden integer,p_extraccion integer,p_sorpresa boolean,p_imagen text,p_descripcion text,p_premio uuid,p_prioridad integer)
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
 if ocupado is not null then
   if anterior is null then raise exception 'La prioridad ya está ocupada. Elige una libre.'; end if;
   update public.premio_destacado set prioridad=anterior where id_premio_rifa=ocupado;
 end if;
 insert into public.premio_destacado values(p_premio,p_rifa,p_prioridad)
 on conflict(id_premio_rifa) do update set prioridad=excluded.prioridad;
end $$;
create or replace function public.registrar_venta(p_rifa uuid,p_persona uuid,p_numeros uuid[],p_reserva uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid; v_precio numeric;
begin perform public.bloquear_rifa(p_rifa); if not exists(select from persona where id_persona=p_persona and id_perfil=auth.uid()) then raise exception 'Participante inválido'; end if; perform limpiar_reservas(p_rifa);
 if p_reserva is not null then
 if not exists(select from reserva where id_reserva=p_reserva and id_rifa=p_rifa and id_persona=p_persona and estado='activa') then raise exception 'Reserva inválida'; end if;
 if exists(select id_numero_rifa from detalle_reserva where id_reserva=p_reserva except select unnest(p_numeros)) or exists(select unnest(p_numeros) except select id_numero_rifa from detalle_reserva where id_reserva=p_reserva) then raise exception 'Los números deben coincidir con la reserva'; end if;
 perform cerrar_reserva(p_reserva,'convertida');
 end if;
 if cardinality(p_numeros) is null or cardinality(p_numeros)=0 or cardinality(p_numeros)<>(select count(*) from numero_rifa where id_rifa=p_rifa and id_numero_rifa=any(p_numeros) and estado='disponible') then raise exception 'Selección vacía, duplicada o no disponible'; end if;
 select coalesce((select precio_unitario from reserva where id_reserva=p_reserva),precio_numero)
 into v_precio from rifa where id_rifa=p_rifa;
 insert into venta(id_rifa,id_persona,total) values(p_rifa,p_persona,v_precio*cardinality(p_numeros)) returning id_venta into v_id;
 insert into detalle_venta(id_venta,id_numero_rifa,precio_unitario) select v_id,n,v_precio from unnest(p_numeros) n;
 update numero_rifa set estado='vendido' where id_numero_rifa=any(p_numeros); 
 update boleto b set id_detalle_venta=d.id_detalle_venta,id_detalle_reserva=null
 from detalle_venta d join detalle_reserva dr using(id_numero_rifa)
 where d.id_venta=v_id and dr.id_reserva=p_reserva and b.id_detalle_reserva=dr.id_detalle_reserva;
 return v_id;
end
$func$;
create or replace function public.emitir_boletos(p_venta uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v venta;
begin select * into strict v from venta where id_venta=p_venta; perform bloquear_rifa(v.id_rifa,false);
 if (select estado from venta where id_venta=p_venta)='cancelada' then raise exception 'Venta cancelada'; end if;
 insert into boleto(id_detalle_venta,datos_emision_historicos)
 select d.id_detalle_venta,jsonb_build_object('participante',concat_ws(' ',p.nombres,p.apellidos),'numero',n.numero,'rifa',r.nombre,'fecha',r.fecha_sorteo,'premio',(select string_agg(case when es_sorpresa then 'Premio sorpresa' else nombre end,', ' order by orden_sorteo) from premio_rifa where id_rifa=r.id_rifa),'plantilla',to_jsonb(t)-'id_rifa'-'id_plantilla_boleto')
 from detalle_venta d join numero_rifa n using(id_numero_rifa) join rifa r using(id_rifa) join plantilla_boleto t using(id_rifa) join persona p on p.id_persona=v.id_persona where d.id_venta=p_venta on conflict(id_detalle_venta) do nothing;
end
$func$;
create or replace function public.emitir_boletos_reserva(p_reserva uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v reserva;
begin select * into strict v from reserva where id_reserva=p_reserva; perform bloquear_rifa(v.id_rifa,false);
 select * into strict v from reserva where id_reserva=p_reserva;
 if v.estado<>'activa' or v.fecha_vencimiento<=clock_timestamp() then raise exception 'Reserva vencida o cerrada'; end if;
 insert into boleto(id_detalle_reserva,datos_emision_historicos)
 select d.id_detalle_reserva,jsonb_build_object('participante',concat_ws(' ',p.nombres,p.apellidos),'numero',n.numero,'rifa',r.nombre,'fecha',r.fecha_sorteo,'premio',(select string_agg(case when es_sorpresa then 'Premio sorpresa' else nombre end,', ' order by orden_sorteo) from premio_rifa where id_rifa=r.id_rifa),'plantilla',to_jsonb(t)-'id_rifa'-'id_plantilla_boleto')
 from detalle_reserva d join numero_rifa n using(id_numero_rifa) join rifa r using(id_rifa) join plantilla_boleto t using(id_rifa) join persona p on p.id_persona=v.id_persona where d.id_reserva=p_reserva on conflict(id_detalle_reserva) do nothing;
end
$func$;
revoke all on function public.emitir_boletos_reserva from public,anon,authenticated;
grant execute on function public.emitir_boletos_reserva to authenticated;
create or replace function public.consultar_boleto(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when b.estado='anulado' then jsonb_build_object('estado','anulado')
 else jsonb_build_object(
   'estado',b.estado,'codigo',b.token_publico,'numero',b.datos_emision_historicos->'numero',
   'participante',b.datos_emision_historicos->'participante','rifa',r.nombre,'fecha',r.fecha_sorteo,
   'imagen',r.imagen_premio_url,'plantilla',to_jsonb(t)-'id_rifa'-'id_plantilla_boleto',
   'destacados',case when t.mostrar_premio then (select coalesce(jsonb_agg(case when p.es_sorpresa then 'Premio sorpresa' else p.nombre end order by p.prioridad),'[]') from public.vw_premios_rifa p where p.id_rifa=r.id_rifa and p.prioridad is not null) end,
   'fotos_destacadas',case when t.mostrar_premio and t.mostrar_fotos_premios then (
      select jsonb_agg(case when p.es_sorpresa then null else p.imagen_url end order by p.prioridad)
      from public.vw_premios_rifa p where p.id_rifa=r.id_rifa and p.prioridad is not null
   ) end,
   'mas_premios',t.mostrar_premio and exists(select from public.vw_premios_rifa p where p.id_rifa=r.id_rifa and p.prioridad is null),
   'direccion',case when t.mostrar_lugar and c.modalidad='presencial' then c.direccion end,
   'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g') when c.modalidad in ('teams','otro') then c.enlace_reunion end
 ) end from public.vw_boletos_rifa b join public.rifa r using(id_rifa) join public.plantilla_boleto t using(id_rifa)
 join public.configuracion_transmision c using(id_rifa) where b.token_publico=p_token;
$$;
create function public.candidatos_premio(p_sorteo uuid,p_premio uuid)
returns table(id_numero_rifa uuid,id_persona uuid) language sql stable security invoker
set search_path=pg_catalog,public,pg_temp as $$
select d.id_numero_rifa,v.id_persona from participacion_sorteo ps join detalle_venta d using(id_detalle_venta) join venta v using(id_venta)
 join sorteo v_s using(id_sorteo) where ps.id_sorteo=p_sorteo and not exists(
 select from extraccion_sorteo e join detalle_venta g on g.id_numero_rifa=e.id_numero_rifa and g.estado='activo' join venta gv on gv.id_venta=g.id_venta
 where e.id_sorteo=v_s.id_sorteo and ((e.id_premio_rifa=p_premio and e.id_numero_rifa=d.id_numero_rifa) or (e.es_ganadora and ((v_s.regla_ganador_fijada='numero' and e.id_numero_rifa=d.id_numero_rifa) or (v_s.regla_ganador_fijada='persona' and gv.id_persona=v.id_persona)))));
$$;
revoke all on function public.candidatos_premio from public,anon,authenticated;
grant execute on function public.candidatos_premio to authenticated;
create function public.resumen_candidatos(p_rifa uuid,p_premio uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('numeros',count(*),'participantes',count(distinct c.id_persona),
 'muestra',(array_agg(n.numero order by n.numero))[1:12])
 from public.sorteo s cross join lateral public.candidatos_premio(s.id_sorteo,p_premio) c
 join public.numero_rifa n using(id_numero_rifa) where s.id_rifa=p_rifa;
$$;
revoke all on function public.resumen_candidatos from public,anon,authenticated;
grant execute on function public.resumen_candidatos to authenticated;
create or replace function public.extraer_numero_sorteo(p_rifa uuid,p_premio uuid,p_orden integer,p_solicitud uuid) returns public.extraccion_sorteo
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_s sorteo; v_p premio_rifa; v_e extraccion_sorteo; v_n uuid; v_orden integer;
begin perform bloquear_rifa(p_rifa,false);
 select * into strict v_s from sorteo where id_rifa=p_rifa;
 select * into v_e from extraccion_sorteo where id_solicitud=p_solicitud and id_sorteo=v_s.id_sorteo and id_premio_rifa=p_premio and orden_extraccion=p_orden;
 if found then return v_e; end if;
 select * into v_p from premio_rifa where id_rifa=p_rifa and estado='pendiente' order by orden_sorteo limit 1;
 select count(*)+1 into v_orden from extraccion_sorteo where id_premio_rifa=p_premio;
 if v_s.estado<>'en_curso' or v_p.id_premio_rifa is distinct from p_premio or v_orden is distinct from p_orden then raise exception 'Actualiza el historial de extracciones'; end if;
 with candidatos as (
 select id_numero_rifa from public.candidatos_premio(v_s.id_sorteo,p_premio))
 select id_numero_rifa into v_n from (select *,count(*) over() cantidad from candidatos) c where cantidad>=v_p.numero_extraccion_ganadora-v_orden+1 order by extensions.gen_random_bytes(16) limit 1;
 if v_n is null then raise exception 'Números insuficientes para %',v_p.nombre; end if;
 insert into extraccion_sorteo(id_sorteo,id_premio_rifa,id_numero_rifa,orden_extraccion,es_ganadora,id_solicitud) values(v_s.id_sorteo,p_premio,v_n,v_orden,v_orden=v_p.numero_extraccion_ganadora,p_solicitud) returning * into v_e;
 if v_e.es_ganadora then
 insert into resultado_sorteo(id_sorteo,id_premio_rifa,id_extraccion) values(v_s.id_sorteo,p_premio,v_e.id_extraccion);
 update premio_rifa set estado='sorteado' where id_premio_rifa=p_premio; end if;
 return v_e;
end
$func$;
-- Cada puesto se guarda como un premio editable y conserva el motor oficial.
create function public.agregar_puestos(p_rifa uuid,p_tercero text,p_segundo text,p_primero text)
returns void language plpgsql security definer set search_path='' as $$
declare inicio integer;
begin
 perform public.bloquear_rifa(p_rifa);
 if nullif(trim(p_tercero),'') is null or nullif(trim(p_segundo),'') is null or nullif(trim(p_primero),'') is null then
   raise exception 'Indica el premio de cada puesto';
 end if;
 select coalesce(max(orden_sorteo),0) into inicio from public.premio_rifa where id_rifa=p_rifa;
 perform public.guardar_premio(p_rifa,'Tercer puesto · '||trim(p_tercero),inicio+1,1,false);
 perform public.guardar_premio(p_rifa,'Segundo puesto · '||trim(p_segundo),inicio+2,1,false);
 perform public.guardar_premio(p_rifa,'Primer puesto · '||trim(p_primero),inicio+3,1,false);
end $$;
revoke all on function public.agregar_puestos from public,anon,authenticated;
grant execute on function public.agregar_puestos to authenticated;
create view public.vw_selecciones_rifa with(security_invoker=true) as
select e.*,s.id_rifa,n.numero from public.extraccion_sorteo e
 join public.sorteo s using(id_sorteo) join public.numero_rifa n using(id_numero_rifa);
revoke all on public.vw_selecciones_rifa from public,anon,authenticated;
grant select on public.vw_selecciones_rifa to authenticated;
alter table public.plantilla_boleto alter column titulo set default 'Boleto de participación';
update public.plantilla_boleto set titulo='Boleto de participación'
 where titulo='Boleto de participaci'||chr(195)||chr(179)||'n';
commit;
