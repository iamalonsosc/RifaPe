begin;
create view public.vw_detalle_ventas with (security_invoker=true) as
select v.*,d.id_detalle_venta,d.precio_unitario,n.numero,n.id_numero_rifa from public.venta v join public.detalle_venta d using(id_venta) join public.numero_rifa n using(id_numero_rifa);
create view public.vw_numeros_por_persona with (security_invoker=true) as select * from public.vw_detalle_ventas where estado<>'cancelada';
create view public.vw_pagos_pendientes with (security_invoker=true) as select v.*,v.total-coalesce((select sum(importe) from public.pago p where p.id_venta=v.id_venta),0) saldo from public.venta v where v.estado='pendiente';
create view public.vw_recaudacion_diaria with (security_invoker=true) as select v.id_rifa,(p.fecha_pago at time zone 'America/Lima')::date dia,sum(p.importe) importe from public.pago p join public.venta v using(id_venta) group by 1,2;
create view public.vw_resumen_rifa with (security_invoker=true) as select r.id_rifa,r.nombre,r.estado,r.fecha_sorteo,r.cantidad_numeros,
 count(*) filter(where n.estado='disponible') disponibles,count(*) filter(where n.estado='reservado') reservados,count(*) filter(where n.estado='vendido') vendidos,
 coalesce((select sum(p.importe) from public.pago p join public.venta v using(id_venta) where v.id_rifa=r.id_rifa),0)-coalesce((select sum(d.importe) from public.devolucion d join public.pago using(id_pago) join public.venta v using(id_venta) where v.id_rifa=r.id_rifa and d.estado='realizada'),0) recaudacion
 from public.rifa r left join public.numero_rifa n using(id_rifa) group by r.id_rifa;
create view public.vw_historial_ganadores with (security_invoker=true) as select s.id_rifa,p.nombre premio,p.orden_sorteo,n.numero,v.id_persona,concat_ws(' ',a.nombres,a.apellidos) participante,res.fecha_resultado from public.resultado_sorteo res join public.sorteo s using(id_sorteo) join public.premio_rifa p using(id_premio_rifa) join public.extraccion_sorteo e on e.id_extraccion=res.id_extraccion join public.numero_rifa n on n.id_numero_rifa=e.id_numero_rifa join public.detalle_venta d on d.id_numero_rifa=n.id_numero_rifa and d.estado='activo' join public.venta v using(id_venta) join public.persona a using(id_persona);
revoke all on public.vw_detalle_ventas from public,anon,authenticated; grant select on public.vw_detalle_ventas to authenticated;
revoke all on public.vw_numeros_por_persona from public,anon,authenticated; grant select on public.vw_numeros_por_persona to authenticated;
revoke all on public.vw_pagos_pendientes from public,anon,authenticated; grant select on public.vw_pagos_pendientes to authenticated;
revoke all on public.vw_recaudacion_diaria from public,anon,authenticated; grant select on public.vw_recaudacion_diaria to authenticated;
revoke all on public.vw_resumen_rifa from public,anon,authenticated; grant select on public.vw_resumen_rifa to authenticated;
revoke all on public.vw_historial_ganadores from public,anon,authenticated; grant select on public.vw_historial_ganadores to authenticated;
create function public.obtener_resumen_rifa(p_rifa uuid) returns setof public.vw_resumen_rifa language sql security invoker set search_path='' as $$ select * from public.vw_resumen_rifa where id_rifa=p_rifa $$;
create function public.iniciar_sorteo(p_rifa uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid; v_regla text; v_total integer; v_grupos integer[]; v_previo integer:=0; v_disponibles integer; premio record;
begin perform bloquear_rifa(p_rifa,false);
 select id_sorteo into v_id from sorteo where id_rifa=p_rifa;
 if found then return v_id; end if;
 select regla_ganador into v_regla from rifa where id_rifa=p_rifa;
 select sum(c),array_agg(c order by c desc) into v_total,v_grupos from (select count(*)::integer c from vw_numeros_por_persona where id_rifa=p_rifa and estado='pagada' group by id_persona) g;
 if not exists(select from premio_rifa where id_rifa=p_rifa) then raise exception 'Agrega al menos un premio'; end if;
 for premio in select * from premio_rifa where id_rifa=p_rifa order by orden_sorteo loop
 v_disponibles:=coalesce(v_total,0)-case v_regla when 'numero' then v_previo when 'persona' then coalesce((select sum(c) from unnest(v_grupos[1:v_previo]) c),0) else 0 end;
 if v_disponibles<premio.numero_extraccion_ganadora then raise exception 'El premio % requiere % números y solo se garantizan % con la regla %',premio.nombre,premio.numero_extraccion_ganadora,v_disponibles,v_regla; end if;
 v_previo:=v_previo+1;
 end loop;
 perform cerrar_reserva(id_reserva,'liberada') from reserva where id_rifa=p_rifa and estado='activa';
 insert into sorteo(id_rifa,regla_ganador_fijada,modo_ejecucion_fijado) select id_rifa,regla_ganador,modo_ejecucion from rifa where id_rifa=p_rifa returning id_sorteo into v_id;
 insert into participacion_sorteo select v_id,id_detalle_venta from vw_numeros_por_persona where id_rifa=p_rifa and estado='pagada';
 update rifa set estado='en_sorteo' where id_rifa=p_rifa; return v_id;
end
$func$;
revoke all on function public.iniciar_sorteo from public, anon, authenticated;
grant execute on function public.iniciar_sorteo to authenticated;
create function public.extraer_numero_sorteo(p_rifa uuid,p_premio uuid,p_orden integer,p_solicitud uuid) returns public.extraccion_sorteo
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
 select d.id_numero_rifa from participacion_sorteo ps join detalle_venta d using(id_detalle_venta) join venta v using(id_venta)
 where ps.id_sorteo=v_s.id_sorteo and not exists(
 select from extraccion_sorteo e join detalle_venta g on g.id_numero_rifa=e.id_numero_rifa and g.estado='activo' join venta gv on gv.id_venta=g.id_venta
 where e.id_sorteo=v_s.id_sorteo and ((e.id_premio_rifa=p_premio and e.id_numero_rifa=d.id_numero_rifa) or (e.es_ganadora and ((v_s.regla_ganador_fijada='numero' and e.id_numero_rifa=d.id_numero_rifa) or (v_s.regla_ganador_fijada='persona' and gv.id_persona=v.id_persona))))))
 select id_numero_rifa into v_n from (select *,count(*) over() cantidad from candidatos) c where cantidad>=v_p.numero_extraccion_ganadora-v_orden+1 order by extensions.gen_random_bytes(16) limit 1;
 if v_n is null then raise exception 'Números insuficientes para %',v_p.nombre; end if;
 insert into extraccion_sorteo(id_sorteo,id_premio_rifa,id_numero_rifa,orden_extraccion,es_ganadora,id_solicitud) values(v_s.id_sorteo,p_premio,v_n,v_orden,v_orden=v_p.numero_extraccion_ganadora,p_solicitud) returning * into v_e;
 if v_e.es_ganadora then
 insert into resultado_sorteo(id_sorteo,id_premio_rifa,id_extraccion) values(v_s.id_sorteo,p_premio,v_e.id_extraccion);
 update premio_rifa set estado='sorteado' where id_premio_rifa=p_premio; end if;
 return v_e;
end
$func$;
revoke all on function public.extraer_numero_sorteo from public, anon, authenticated;
grant execute on function public.extraer_numero_sorteo to authenticated;
create function public.finalizar_sorteo(p_rifa uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform bloquear_rifa(p_rifa,false);
 if not exists(select from sorteo where id_rifa=p_rifa) or exists(select from premio_rifa where id_rifa=p_rifa and estado='pendiente') then raise exception 'Faltan premios por sortear'; end if;
 update sorteo set estado='terminado',fecha_fin=now() where id_rifa=p_rifa and estado='en_curso';
 update rifa set estado='terminada' where id_rifa=p_rifa and estado='en_sorteo'; end
$func$;
revoke all on function public.finalizar_sorteo from public, anon, authenticated;
grant execute on function public.finalizar_sorteo to authenticated;
create function public.guardar_plantilla(p_rifa uuid,p_titulo text,p_tema text,p_premio boolean,p_lugar boolean,p_qr boolean,p_fondo text) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform bloquear_rifa(p_rifa); update plantilla_boleto set titulo=p_titulo,tema=p_tema,mostrar_premio=p_premio,mostrar_lugar=p_lugar,mostrar_qr=p_qr,fondo_url=p_fondo where id_rifa=p_rifa; end
$func$;
revoke all on function public.guardar_plantilla from public, anon, authenticated;
grant execute on function public.guardar_plantilla to authenticated;
create function public.guardar_transmision(p_rifa uuid,p_modalidad text,p_usuario text,p_enlace text,p_direccion text) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform bloquear_rifa(p_rifa,false); update configuracion_transmision set modalidad=p_modalidad,usuario_tiktok=p_usuario,enlace_reunion=p_enlace,direccion=p_direccion where id_rifa=p_rifa; end
$func$;
revoke all on function public.guardar_transmision from public, anon, authenticated;
grant execute on function public.guardar_transmision to authenticated;
create function public.consultar_boleto(p_token uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v jsonb;
begin select case when b.estado='anulado' then jsonb_build_object('estado','anulado') else (case when (b.datos_emision_historicos#>>'{plantilla,mostrar_premio}')::boolean then b.datos_emision_historicos else b.datos_emision_historicos-'premio' end)||jsonb_build_object('estado',b.estado,'codigo',b.token_publico,'direccion',case when (b.datos_emision_historicos#>>'{plantilla,mostrar_lugar}')::boolean and c.modalidad='presencial' then c.direccion end,'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g') when c.modalidad in ('teams','otro') then c.enlace_reunion end) end into v from boleto b join detalle_venta d using(id_detalle_venta) join venta vta using(id_venta) join configuracion_transmision c using(id_rifa) where b.token_publico=p_token; return v; end
$func$;
revoke all on function public.consultar_boleto from public, anon, authenticated;
grant execute on function public.consultar_boleto to service_role;
create function public.auditoria_cambios_criticos() returns trigger language plpgsql security definer set search_path='' as $$
declare anterior jsonb; nuevo jsonb; titular uuid;
begin
 if tg_op<>'INSERT' then anterior:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then nuevo:=to_jsonb(new); end if;
 select id_perfil into strict titular from public.perfil;
 insert into public.auditoria(id_perfil,entidad,id_registro,accion,datos_anteriores,datos_nuevos) values(titular,tg_table_name,((coalesce(nuevo,anterior))->>tg_argv[0])::uuid,tg_op,anterior,nuevo); return null; end $$;
create trigger auditoria_cambios_criticos after insert or update or delete on public.rifa for each row execute function public.auditoria_cambios_criticos('id_rifa');
create trigger auditoria_cambios_criticos after insert or update or delete on public.premio_rifa for each row execute function public.auditoria_cambios_criticos('id_premio_rifa');
create trigger auditoria_cambios_criticos after insert or update or delete on public.reserva for each row execute function public.auditoria_cambios_criticos('id_reserva');
create trigger auditoria_cambios_criticos after insert or update or delete on public.venta for each row execute function public.auditoria_cambios_criticos('id_venta');
create trigger auditoria_cambios_criticos after insert or update or delete on public.pago for each row execute function public.auditoria_cambios_criticos('id_pago');
create trigger auditoria_cambios_criticos after insert or update or delete on public.devolucion for each row execute function public.auditoria_cambios_criticos('id_devolucion');
create trigger auditoria_cambios_criticos after insert or update or delete on public.sorteo for each row execute function public.auditoria_cambios_criticos('id_sorteo');
create trigger auditoria_cambios_criticos after insert or update or delete on public.extraccion_sorteo for each row execute function public.auditoria_cambios_criticos('id_extraccion');
create trigger auditoria_cambios_criticos after insert or update or delete on public.resultado_sorteo for each row execute function public.auditoria_cambios_criticos('id_resultado');
commit;
