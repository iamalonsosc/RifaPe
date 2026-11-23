begin;
revoke create on schema public from public, anon, authenticated;
create function public.crear_perfil_autorizado() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.raw_app_meta_data->>'rol_rifafacil'='administradora' then
 insert into public.perfil(id_perfil,nombre) values(new.id,split_part(new.email,'@',1)) on conflict(id_perfil) do nothing;
 end if; return new;
end $$;
create trigger crear_perfil_autorizado after insert or update of raw_app_meta_data on auth.users for each row execute function public.crear_perfil_autorizado();
create function public.actualizar_fecha_modificacion() returns trigger language plpgsql set search_path='' as $$
begin new.fecha_modificacion=now(); return new; end $$;
create trigger actualizar_fecha_modificacion before update on public.rifa for each row execute function public.actualizar_fecha_modificacion();
create trigger actualizar_fecha_modificacion before update on public.perfil for each row execute function public.actualizar_fecha_modificacion();
create trigger actualizar_fecha_modificacion before update on public.configuracion_transmision for each row execute function public.actualizar_fecha_modificacion();
create function public.bloquear_rifa(p_rifa uuid, p_abierta boolean default true) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_estado text;
begin
 select estado into strict v_estado from rifa where id_rifa=p_rifa and id_perfil=auth.uid() for update;
 if p_abierta and v_estado<>'activa' then raise exception 'La rifa ya inició su sorteo'; end if;
end
$func$;
revoke all on function public.bloquear_rifa from public, anon, authenticated;

create function public.crear_numeros_rifa(p_rifa uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin
 perform public.bloquear_rifa(p_rifa);
 insert into numero_rifa(id_rifa,numero) select p_rifa,n from generate_series(coalesce((select max(numero) from numero_rifa where id_rifa=p_rifa),0)+1,(select cantidad_numeros from rifa where id_rifa=p_rifa)) n;
end
$func$;
revoke all on function public.crear_numeros_rifa from public, anon, authenticated;
grant execute on function public.crear_numeros_rifa to authenticated;
create function public.guardar_rifa(p_nombre text,p_precio numeric,p_cantidad integer,p_fecha timestamptz,p_regla text,p_descripcion text default null,p_imagen text default null,p_rifa uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin
 if p_rifa is null then
 insert into rifa(id_perfil,nombre,precio_numero,cantidad_numeros,fecha_sorteo,regla_ganador,descripcion,imagen_premio_url) values(auth.uid(),p_nombre,p_precio,p_cantidad,p_fecha,p_regla,p_descripcion,p_imagen) returning id_rifa into p_rifa;
 insert into plantilla_boleto(id_rifa) values(p_rifa);
 insert into configuracion_transmision(id_rifa) values(p_rifa);
 else
 perform public.bloquear_rifa(p_rifa);
 if p_cantidad<(select cantidad_numeros from rifa where id_rifa=p_rifa) then raise exception 'Solo se permite ampliar la numeración'; end if;
 update rifa set nombre=p_nombre,precio_numero=p_precio,cantidad_numeros=p_cantidad,fecha_sorteo=p_fecha,regla_ganador=p_regla,descripcion=p_descripcion,imagen_premio_url=p_imagen where id_rifa=p_rifa;
 end if;
 perform crear_numeros_rifa(p_rifa); return p_rifa;
end
$func$;
revoke all on function public.guardar_rifa from public, anon, authenticated;
grant execute on function public.guardar_rifa to authenticated;
create function public.guardar_premio(p_rifa uuid,p_nombre text,p_orden integer,p_extraccion integer,p_sorpresa boolean,p_imagen text default null,p_descripcion text default null,p_premio uuid default null) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_anterior integer;
begin perform public.bloquear_rifa(p_rifa);
 if p_premio is null then
 update premio_rifa set orden_sorteo=orden_sorteo+1 where id_rifa=p_rifa and orden_sorteo>=p_orden;
 insert into premio_rifa(id_rifa,nombre,orden_sorteo,numero_extraccion_ganadora,es_sorpresa,imagen_url,descripcion) values(p_rifa,p_nombre,p_orden,p_extraccion,p_sorpresa,p_imagen,p_descripcion);
 else
 select orden_sorteo into strict v_anterior from premio_rifa where id_premio_rifa=p_premio and id_rifa=p_rifa;
 update premio_rifa set orden_sorteo=orden_sorteo+case when v_anterior>p_orden then 1 else -1 end where id_rifa=p_rifa and id_premio_rifa<>p_premio and orden_sorteo between least(v_anterior,p_orden) and greatest(v_anterior,p_orden);
 update premio_rifa set nombre=p_nombre,orden_sorteo=p_orden,numero_extraccion_ganadora=p_extraccion,es_sorpresa=p_sorpresa,imagen_url=p_imagen,descripcion=p_descripcion where id_premio_rifa=p_premio;
 end if;
end
$func$;
revoke all on function public.guardar_premio from public, anon, authenticated;
grant execute on function public.guardar_premio to authenticated;
create function public.eliminar_premio(p_rifa uuid,p_premio uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform public.bloquear_rifa(p_rifa); delete from premio_rifa where id_premio_rifa=p_premio and id_rifa=p_rifa; end
$func$;
revoke all on function public.eliminar_premio from public, anon, authenticated;
grant execute on function public.eliminar_premio to authenticated;
create function public.guardar_persona(p_nombres text,p_apellidos text default null,p_telefono text default null,p_persona uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin
 if p_persona is null then insert into persona(id_perfil,nombres,apellidos,telefono) values(auth.uid(),p_nombres,p_apellidos,p_telefono) returning id_persona into p_persona;
 else if not exists(select from persona where id_persona=p_persona and id_perfil=auth.uid()) then raise exception 'Participante inválido'; end if; update persona set nombres=p_nombres,apellidos=p_apellidos,telefono=p_telefono where id_persona=p_persona; end if;
 return p_persona;
end
$func$;
revoke all on function public.guardar_persona from public, anon, authenticated;
grant execute on function public.guardar_persona to authenticated;
create function public.cerrar_reserva(p_reserva uuid,p_estado text) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin
 update reserva set estado=p_estado where id_reserva=p_reserva and estado='activa';
 if found then update numero_rifa set estado='disponible' where id_numero_rifa in(select id_numero_rifa from detalle_reserva where id_reserva=p_reserva); end if;
end
$func$;
revoke all on function public.cerrar_reserva from public, anon, authenticated;

create function public.limpiar_reservas(p_rifa uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare fila record;
begin for fila in select id_reserva from reserva where id_rifa=p_rifa and estado='activa' and fecha_vencimiento<=clock_timestamp() loop perform cerrar_reserva(fila.id_reserva,'vencida'); end loop; end
$func$;
revoke all on function public.limpiar_reservas from public, anon, authenticated;

create function public.vencer_reservas() returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare fila record;
begin for fila in select id_rifa from rifa where estado='activa' order by id_rifa for update skip locked loop perform limpiar_reservas(fila.id_rifa); end loop; end
$func$;
revoke all on function public.vencer_reservas from public, anon, authenticated;

create function public.liberar_reserva(p_reserva uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform bloquear_rifa((select id_rifa from reserva where id_reserva=p_reserva)); perform cerrar_reserva(p_reserva,'liberada'); end
$func$;
revoke all on function public.liberar_reserva from public, anon, authenticated;
grant execute on function public.liberar_reserva to authenticated;
create function public.reservar_numeros(p_rifa uuid,p_persona uuid,p_numeros uuid[],p_vencimiento timestamptz) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid;
begin perform public.bloquear_rifa(p_rifa); if not exists(select from persona where id_persona=p_persona and id_perfil=auth.uid()) then raise exception 'Participante inválido'; end if;
 perform limpiar_reservas(p_rifa);
 if cardinality(p_numeros) is null or cardinality(p_numeros)=0 or cardinality(p_numeros)<>(select count(*) from numero_rifa where id_rifa=p_rifa and id_numero_rifa=any(p_numeros) and estado='disponible') then raise exception 'Selección vacía, duplicada o no disponible'; end if;
 if p_vencimiento<=clock_timestamp() then raise exception 'Indica un vencimiento futuro'; end if;
 insert into reserva(id_rifa,id_persona,fecha_vencimiento) values(p_rifa,p_persona,p_vencimiento) returning id_reserva into v_id;
 insert into detalle_reserva(id_reserva,id_numero_rifa) select v_id,unnest(p_numeros);
 update numero_rifa set estado='reservado' where id_numero_rifa=any(p_numeros);
 return v_id;
end
$func$;
revoke all on function public.reservar_numeros from public, anon, authenticated;
grant execute on function public.reservar_numeros to authenticated;
create function public.registrar_venta(p_rifa uuid,p_persona uuid,p_numeros uuid[],p_reserva uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid; v_precio numeric;
begin perform public.bloquear_rifa(p_rifa); if not exists(select from persona where id_persona=p_persona and id_perfil=auth.uid()) then raise exception 'Participante inválido'; end if; perform limpiar_reservas(p_rifa);
 if p_reserva is not null then
 if not exists(select from reserva where id_reserva=p_reserva and id_rifa=p_rifa and id_persona=p_persona and estado='activa') then raise exception 'Reserva inválida'; end if;
 if exists(select id_numero_rifa from detalle_reserva where id_reserva=p_reserva except select unnest(p_numeros)) or exists(select unnest(p_numeros) except select id_numero_rifa from detalle_reserva where id_reserva=p_reserva) then raise exception 'Los números deben coincidir con la reserva'; end if;
 perform cerrar_reserva(p_reserva,'convertida');
 end if;
 if cardinality(p_numeros) is null or cardinality(p_numeros)=0 or cardinality(p_numeros)<>(select count(*) from numero_rifa where id_rifa=p_rifa and id_numero_rifa=any(p_numeros) and estado='disponible') then raise exception 'Selección vacía, duplicada o no disponible'; end if;
 select precio_numero into v_precio from rifa where id_rifa=p_rifa;
 insert into venta(id_rifa,id_persona,total) values(p_rifa,p_persona,v_precio*cardinality(p_numeros)) returning id_venta into v_id;
 insert into detalle_venta(id_venta,id_numero_rifa,precio_unitario) select v_id,n,v_precio from unnest(p_numeros) n;
 update numero_rifa set estado='vendido' where id_numero_rifa=any(p_numeros); return v_id;
end
$func$;
revoke all on function public.registrar_venta from public, anon, authenticated;
grant execute on function public.registrar_venta to authenticated;
create function public.emitir_boletos(p_venta uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v venta;
begin select * into strict v from venta where id_venta=p_venta; perform bloquear_rifa(v.id_rifa,false);
 if (select estado from venta where id_venta=p_venta)<>'pagada' then raise exception 'Venta sin pago completo'; end if;
 insert into boleto(id_detalle_venta,datos_emision_historicos)
 select d.id_detalle_venta,jsonb_build_object('participante',concat_ws(' ',p.nombres,p.apellidos),'numero',n.numero,'rifa',r.nombre,'fecha',r.fecha_sorteo,'premio',(select string_agg(case when es_sorpresa then 'Premio sorpresa' else nombre end,', ' order by orden_sorteo) from premio_rifa where id_rifa=r.id_rifa),'plantilla',to_jsonb(t)-'id_rifa'-'id_plantilla_boleto')
 from detalle_venta d join numero_rifa n using(id_numero_rifa) join rifa r using(id_rifa) join plantilla_boleto t using(id_rifa) join persona p on p.id_persona=v.id_persona where d.id_venta=p_venta on conflict(id_detalle_venta) do nothing;
end
$func$;
revoke all on function public.emitir_boletos from public, anon, authenticated;
grant execute on function public.emitir_boletos to authenticated;
create function public.confirmar_pago(p_venta uuid,p_importe numeric,p_medio text,p_referencia text default null) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v venta; v_cobrado numeric;
begin perform bloquear_rifa((select id_rifa from venta where id_venta=p_venta)); select * into strict v from venta where id_venta=p_venta;
 select coalesce(sum(importe),0) into v_cobrado from pago where id_venta=p_venta;
 if v.estado<>'pendiente' or p_importe<>round(p_importe,2) or v_cobrado+p_importe>v.total then raise exception 'Importe o estado de venta inválido'; end if;
 insert into pago(id_venta,importe,medio_pago,referencia) values(p_venta,p_importe,p_medio,p_referencia);
 if v_cobrado+p_importe=v.total then update venta set estado='pagada' where id_venta=p_venta; perform emitir_boletos(p_venta); end if;
end
$func$;
revoke all on function public.confirmar_pago from public, anon, authenticated;
grant execute on function public.confirmar_pago to authenticated;
create function public.cancelar_venta(p_venta uuid,p_motivo text) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform bloquear_rifa((select id_rifa from venta where id_venta=p_venta));
 update venta set estado='cancelada',fecha_cancelacion=now() where id_venta=p_venta and estado<>'cancelada';
 if not found then return; end if;
 update detalle_venta set estado='cancelado' where id_venta=p_venta;
 update numero_rifa set estado='disponible' where id_numero_rifa in(select id_numero_rifa from detalle_venta where id_venta=p_venta);
 update boleto set estado='anulado' where id_detalle_venta in(select id_detalle_venta from detalle_venta where id_venta=p_venta);
 insert into devolucion(id_pago,importe,motivo) select id_pago,importe,p_motivo from pago where id_venta=p_venta;
end
$func$;
revoke all on function public.cancelar_venta from public, anon, authenticated;
grant execute on function public.cancelar_venta to authenticated;
create function public.confirmar_devolucion(p_devolucion uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform bloquear_rifa((select v.id_rifa from devolucion d join pago using(id_pago) join venta v using(id_venta) where d.id_devolucion=p_devolucion),false);
 update devolucion set estado='realizada',fecha_devolucion=now() where id_devolucion=p_devolucion and estado='pendiente'; end
$func$;
revoke all on function public.confirmar_devolucion from public, anon, authenticated;
grant execute on function public.confirmar_devolucion to authenticated;
commit;
