begin;
alter table public.rifa add column incluir_numeros_sin_pagar boolean not null default false;

create function public.configurar_participacion(p_rifa uuid, p_incluir boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform bloquear_rifa(p_rifa);
 update rifa set incluir_numeros_sin_pagar=p_incluir where id_rifa=p_rifa;
end $$;
revoke all on function public.configurar_participacion from public,anon,authenticated;
grant execute on function public.configurar_participacion to authenticated;

create view public.vw_asignaciones_elegibles with (security_invoker=true) as
 select v.id_rifa,v.id_numero_rifa,v.numero,v.id_persona
 from public.vw_numeros_por_persona v join public.rifa r using(id_rifa)
 where v.estado='pagada' or (r.incluir_numeros_sin_pagar and v.estado='pendiente')
 union all
 select s.id_rifa,n.id_numero_rifa,n.numero,s.id_persona
 from public.reserva s join public.rifa r using(id_rifa)
 join public.detalle_reserva d using(id_reserva) join public.numero_rifa n using(id_numero_rifa)
 where r.incluir_numeros_sin_pagar and s.estado='activa' and n.estado='reservado'
 and (s.fecha_vencimiento is null or s.fecha_vencimiento>statement_timestamp());
revoke all on public.vw_asignaciones_elegibles from public,anon,authenticated;
grant select on public.vw_asignaciones_elegibles to authenticated;

-- La asignación de un número puede cambiar tras vencer una reserva.
alter table public.extraccion_sorteo add column id_persona uuid references public.persona;
update public.extraccion_sorteo e set id_persona=v.id_persona
 from public.participacion_sorteo ps join public.detalle_venta d using(id_detalle_venta)
 join public.venta v using(id_venta)
 where ps.id_sorteo=e.id_sorteo and d.id_numero_rifa=e.id_numero_rifa;

create or replace view public.vw_historial_ganadores with (security_invoker=true) as
 select s.id_rifa,p.nombre premio,p.orden_sorteo,n.numero,e.id_persona,
 concat_ws(' ',a.nombres,a.apellidos) participante,res.fecha_resultado
 from public.resultado_sorteo res join public.sorteo s using(id_sorteo)
 join public.premio_rifa p using(id_premio_rifa)
 join public.extraccion_sorteo e using(id_extraccion)
 join public.numero_rifa n using(id_numero_rifa) join public.persona a on a.id_persona=e.id_persona;

create or replace function public.candidatos_premio(p_sorteo uuid,p_premio uuid)
returns table(id_numero_rifa uuid,id_persona uuid) language sql stable security invoker
set search_path=pg_catalog,public,pg_temp as $$
 select a.id_numero_rifa,a.id_persona from sorteo s join vw_asignaciones_elegibles a using(id_rifa)
 where s.id_sorteo=p_sorteo and not exists (
   select from extraccion_sorteo e where e.id_sorteo=s.id_sorteo and (
     (e.id_premio_rifa=p_premio and e.id_numero_rifa=a.id_numero_rifa)
     or (e.es_ganadora and (
       (s.regla_ganador_fijada='numero' and e.id_numero_rifa=a.id_numero_rifa)
       or (s.regla_ganador_fijada='persona' and e.id_persona=a.id_persona)
     ))
   )
 );
$$;
create or replace function public.iniciar_sorteo(p_rifa uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid; v_regla text; v_total integer; v_grupos integer[]; v_previo integer:=0; v_disponibles integer; premio record;
begin perform bloquear_rifa(p_rifa,false);
 select id_sorteo into v_id from sorteo where id_rifa=p_rifa;
 if found then return v_id; end if;
 select regla_ganador into v_regla from rifa where id_rifa=p_rifa;
 select sum(c),array_agg(c order by c desc) into v_total,v_grupos from (select count(*)::integer c from vw_asignaciones_elegibles where id_rifa=p_rifa group by id_persona) g;
 if not exists(select from premio_rifa where id_rifa=p_rifa) then raise exception 'Agrega al menos un premio'; end if;
 for premio in select * from premio_rifa where id_rifa=p_rifa order by orden_sorteo loop
 v_disponibles:=coalesce(v_total,0)-case v_regla when 'numero' then v_previo when 'persona' then coalesce((select sum(c) from unnest(v_grupos[1:v_previo]) c),0) else 0 end;
 if v_disponibles<premio.numero_extraccion_ganadora then raise exception 'El premio % requiere % números y solo se garantizan % con la regla %',premio.nombre,premio.numero_extraccion_ganadora,v_disponibles,v_regla; end if;
 v_previo:=v_previo+1;
 end loop;
 if not (select permitir_ventas_sorteo or incluir_numeros_sin_pagar from rifa where id_rifa=p_rifa) then perform cerrar_reserva(id_reserva,'liberada') from reserva where id_rifa=p_rifa and estado='activa'; end if;
 insert into sorteo(id_rifa,regla_ganador_fijada,modo_ejecucion_fijado) select id_rifa,regla_ganador,modo_ejecucion from rifa where id_rifa=p_rifa returning id_sorteo into v_id;
 insert into participacion_sorteo select v_id,id_detalle_venta from vw_numeros_por_persona where id_rifa=p_rifa and estado='pagada';
 update rifa set estado='en_sorteo',ventas_abiertas=permitir_ventas_sorteo where id_rifa=p_rifa; return v_id;
end
$func$;
create or replace function public.resumen_candidatos(p_rifa uuid,p_premio uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when (select estado from public.rifa where id_rifa=p_rifa)='activa' then
 (select jsonb_build_object('estado_rifa','activa','extracciones',0,'inscritos',count(*),'numeros',count(*),
 'muestra',coalesce(array_agg(numero order by numero),'{}')) from public.vw_asignaciones_elegibles where id_rifa=p_rifa)
 else jsonb_build_object('numeros',count(*),'participantes',count(distinct c.id_persona),
 'estado_rifa',(select estado from public.rifa where id_rifa=p_rifa),
 'extracciones',(select count(*) from public.vw_selecciones_rifa where id_rifa=p_rifa),
 'ultimo_premio',(select id_premio_rifa from public.vw_selecciones_rifa where id_rifa=p_rifa order by fecha_extraccion desc, orden_extraccion desc limit 1),
 'muestra',coalesce(array_agg(n.numero order by n.numero),'{}'), 'inscritos',(select count(*) from public.vw_asignaciones_elegibles where id_rifa=p_rifa),'vendidos',(select count(*) from public.numero_rifa where id_rifa=p_rifa and estado='vendido'),'abiertas',(select ventas_abiertas from public.rifa where id_rifa=p_rifa)) end
 from public.sorteo s cross join lateral public.candidatos_premio(s.id_sorteo,p_premio) c
 join public.numero_rifa n using(id_numero_rifa) where s.id_rifa=p_rifa;
$$;
create or replace function public.extraer_numero_sorteo(p_rifa uuid,p_premio uuid,p_orden integer,p_solicitud uuid) returns public.extraccion_sorteo
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_s sorteo; v_p premio_rifa; v_e extraccion_sorteo; v_n uuid; v_persona uuid; v_orden integer; elegibles integer[];
begin perform bloquear_rifa(p_rifa,false);
 select * into strict v_s from sorteo where id_rifa=p_rifa;
 select * into v_e from extraccion_sorteo where id_solicitud=p_solicitud and id_sorteo=v_s.id_sorteo and id_premio_rifa=p_premio and orden_extraccion=p_orden;
 if found then return v_e; end if;
 select * into v_p from premio_rifa where id_rifa=p_rifa and estado='pendiente' order by orden_sorteo limit 1;
 select count(*)+1 into v_orden from extraccion_sorteo where id_premio_rifa=p_premio;
 if v_s.estado<>'en_curso' or v_p.id_premio_rifa is distinct from p_premio or v_orden is distinct from p_orden then raise exception 'Actualiza el historial de extracciones'; end if;
 select array_agg(n.numero order by n.numero) into elegibles from candidatos_premio(v_s.id_sorteo,p_premio) c join numero_rifa n using(id_numero_rifa);
 select id_numero_rifa,id_persona into v_n,v_persona from vw_asignaciones_elegibles where id_rifa=p_rifa and numero=any(elegibles) and cardinality(elegibles)>=v_p.numero_extraccion_ganadora-v_orden+1 order by extensions.gen_random_bytes(16) limit 1;
 if v_n is null then raise exception 'Números insuficientes para %',v_p.nombre; end if;
 insert into extraccion_sorteo(id_sorteo,id_premio_rifa,id_numero_rifa,orden_extraccion,es_ganadora,id_solicitud,numeros_elegibles,id_persona) values(v_s.id_sorteo,p_premio,v_n,v_orden,v_orden=v_p.numero_extraccion_ganadora,p_solicitud,elegibles,v_persona) returning * into v_e;
 if v_e.es_ganadora then
 insert into resultado_sorteo(id_sorteo,id_premio_rifa,id_extraccion) values(v_s.id_sorteo,p_premio,v_e.id_extraccion);
 update premio_rifa set estado='sorteado' where id_premio_rifa=p_premio;
 if not exists(select from premio_rifa where id_rifa=p_rifa and estado='pendiente') then update rifa set ventas_abiertas=false where id_rifa=p_rifa and ventas_abiertas;end if; end if;
 return v_e;
end
$func$;
notify pgrst, 'reload schema';
commit;
