begin;
alter table public.reserva alter column fecha_vencimiento drop not null, add column ofertas_pactadas jsonb,
 add column tarifa_heredada boolean not null default false;
-- Las reservas heredadas ya guardan su precio base. Conservamos las ofertas
-- aplicables en la actualización para que las ediciones futuras no las afecten.
update public.reserva set tarifa_heredada=true, ofertas_pactadas=public.ofertas_vigentes(id_rifa) where estado='activa';
alter table public.rifa add column permitir_ventas_sorteo boolean not null default false,
 add column ventas_abiertas boolean not null default false, add column precio_en_vivo numeric(12,2) check(precio_en_vivo>0);
alter table public.venta add column responsable_anulacion uuid references public.perfil, add column estado_antes_anulacion text, add column durante_sorteo boolean not null default false, add column motivo_anulacion text;
alter table public.extraccion_sorteo add column numeros_elegibles integer[];
alter table public.configuracion_transmision drop constraint configuracion_transmision_modalidad_check,
 add check(modalidad in ('sin_definir','presencial','teams','meet','tiktok','otro'));

create function public.configurar_ventas_sorteo(p_rifa uuid,p_permitir boolean,p_precio numeric) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin perform bloquear_rifa(p_rifa);
 if p_permitir and (p_precio is null or p_precio<=0 or p_precio<>round(p_precio,2)) then raise exception 'Precio inválido';end if;
 update rifa set permitir_ventas_sorteo=p_permitir,precio_en_vivo=case when p_permitir then p_precio end where id_rifa=p_rifa;
end $$;
create function public.cambiar_apertura_ventas(p_rifa uuid,p_abrir boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin perform bloquear_rifa(p_rifa,false);
 update rifa set ventas_abiertas=p_abrir where id_rifa=p_rifa and estado='en_sorteo' and permitir_ventas_sorteo and exists(select from premio_rifa where id_rifa=p_rifa and estado='pendiente');
 if not found then raise exception 'El sorteo no admite ventas';end if;
end $$;
create function public.bloquear_para_venta(p_rifa uuid) returns void language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin perform bloquear_rifa(p_rifa,false);
 if not exists(select from rifa where id_rifa=p_rifa and (estado='activa' or (estado='en_sorteo' and permitir_ventas_sorteo and ventas_abiertas and exists(select from premio_rifa where id_rifa=p_rifa and estado='pendiente')))) then raise exception 'Ventas cerradas';end if;
end $$;
revoke all on function public.bloquear_para_venta,public.configurar_ventas_sorteo,public.cambiar_apertura_ventas from public,anon,authenticated;
grant execute on function public.configurar_ventas_sorteo,public.cambiar_apertura_ventas to authenticated;
create or replace function public.reservar_numeros(p_rifa uuid,p_persona uuid,p_numeros uuid[],p_vencimiento timestamptz) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid;
begin perform public.bloquear_rifa(p_rifa); if not exists(select from persona where id_persona=p_persona and id_perfil=auth.uid()) then raise exception 'Participante inválido'; end if;
 perform limpiar_reservas(p_rifa);
 if cardinality(p_numeros) is null or cardinality(p_numeros)=0 or cardinality(p_numeros)<>(select count(*) from numero_rifa where id_rifa=p_rifa and id_numero_rifa=any(p_numeros) and estado='disponible') then raise exception 'Selección vacía, duplicada o no disponible'; end if;
 if p_vencimiento<=clock_timestamp() then raise exception 'Indica un vencimiento futuro'; end if;
 insert into reserva(id_rifa,id_persona,fecha_vencimiento,ofertas_pactadas) values(p_rifa,p_persona,p_vencimiento,public.ofertas_vigentes(p_rifa)) returning id_reserva into v_id;
 insert into detalle_reserva(id_reserva,id_numero_rifa) select v_id,unnest(p_numeros);
 update numero_rifa set estado='reservado' where id_numero_rifa=any(p_numeros);
 return v_id;
end
$func$;
create or replace function public.vencer_reservas() returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare fila record;
begin for fila in select id_rifa from rifa where estado in ('activa','en_sorteo') order by id_rifa for update skip locked loop perform limpiar_reservas(fila.id_rifa); end loop; end
$func$;
create or replace function public.iniciar_sorteo(p_rifa uuid) returns uuid
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
 if not (select permitir_ventas_sorteo from rifa where id_rifa=p_rifa) then perform cerrar_reserva(id_reserva,'liberada') from reserva where id_rifa=p_rifa and estado='activa'; end if;
 insert into sorteo(id_rifa,regla_ganador_fijada,modo_ejecucion_fijado) select id_rifa,regla_ganador,modo_ejecucion from rifa where id_rifa=p_rifa returning id_sorteo into v_id;
 insert into participacion_sorteo select v_id,id_detalle_venta from vw_numeros_por_persona where id_rifa=p_rifa and estado='pagada';
 update rifa set estado='en_sorteo',ventas_abiertas=permitir_ventas_sorteo where id_rifa=p_rifa; return v_id;
end
$func$;
create or replace function public.registrar_venta(p_rifa uuid,p_persona uuid,p_numeros uuid[],p_reserva uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid; v_precio numeric; tarifas jsonb; importe numeric; cant integer:=cardinality(p_numeros);
begin perform public.bloquear_para_venta(p_rifa); if not exists(select from persona where id_persona=p_persona and id_perfil=auth.uid()) then raise exception 'Participante inválido'; end if; perform limpiar_reservas(p_rifa);
 if p_reserva is not null then
 if not exists(select from reserva where id_reserva=p_reserva and id_rifa=p_rifa and id_persona=p_persona and estado='activa') then raise exception 'Reserva inválida'; end if;
 if exists(select id_numero_rifa from detalle_reserva where id_reserva=p_reserva except select unnest(p_numeros)) or exists(select unnest(p_numeros) except select id_numero_rifa from detalle_reserva where id_reserva=p_reserva) then raise exception 'Los números deben coincidir con la reserva'; end if;
 perform cerrar_reserva(p_reserva,'convertida');
 end if;
 if cardinality(p_numeros) is null or cardinality(p_numeros)=0 or cardinality(p_numeros)<>(select count(*) from numero_rifa where id_rifa=p_rifa and id_numero_rifa=any(p_numeros) and estado='disponible') then raise exception 'Selección vacía, duplicada o no disponible'; end if;
 select coalesce((select precio_unitario from reserva where id_reserva=p_reserva),case when estado='en_sorteo' then precio_en_vivo else precio_numero end)
 into v_precio from rifa where id_rifa=p_rifa;
 select case when p_reserva is not null then coalesce((select ofertas_pactadas from reserva where id_reserva=p_reserva),ofertas_vigentes(p_rifa)) when estado='en_sorteo' then '[]'::jsonb else ofertas_vigentes(p_rifa) end into tarifas from rifa where id_rifa=p_rifa; importe:=(cotizar_numeros(cant,v_precio,tarifas)->>'total')::numeric;
 insert into venta(id_rifa,id_persona,total,precio_base,ofertas_originales,durante_sorteo) values(p_rifa,p_persona,importe,v_precio,tarifas,(select estado='en_sorteo' from rifa where id_rifa=p_rifa)) returning id_venta into v_id;
 insert into detalle_venta(id_venta,id_numero_rifa,precio_unitario) select v_id,n,(floor(importe*100/cant)+case when pos<=mod(importe*100,cant) then 1 else 0 end)/100 from unnest(p_numeros) with ordinality as x(n,pos);
 update numero_rifa set estado='vendido' where id_numero_rifa=any(p_numeros); 
 update boleto b set id_detalle_venta=d.id_detalle_venta,id_detalle_reserva=null
 from detalle_venta d join detalle_reserva dr using(id_numero_rifa)
 where d.id_venta=v_id and dr.id_reserva=p_reserva and b.id_detalle_reserva=dr.id_detalle_reserva;
 return v_id;
end
$func$;
create or replace function public.cotizar_reserva(p_reserva uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.cotizar_numeros((select count(*)::int from public.detalle_reserva where id_reserva=p_reserva),s.precio_unitario,coalesce(s.ofertas_pactadas,public.ofertas_vigentes(s.id_rifa))) from public.reserva s join public.rifa r using(id_rifa) where s.id_reserva=p_reserva and r.id_perfil=auth.uid()
$$;
create or replace function public.cotizar_compra(p_rifa uuid,p_cantidad integer) returns jsonb language sql stable security definer set search_path='' as $func$
 select public.cotizar_numeros(least(greatest(p_cantidad,0),cantidad_numeros),case when estado='en_sorteo' then precio_en_vivo else precio_numero end,case when estado='en_sorteo' then '[]'::jsonb else public.ofertas_vigentes(p_rifa) end) from public.rifa where id_rifa=p_rifa and id_perfil=auth.uid()
$func$;
create or replace function public.confirmar_pago(p_venta uuid,p_importe numeric,p_medio text,p_referencia text default null) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v venta; v_cobrado numeric;
begin perform bloquear_para_venta((select id_rifa from venta where id_venta=p_venta)); select * into strict v from venta where id_venta=p_venta;
 v_cobrado:=cobro_vigente(p_venta);
 if v.estado<>'pendiente' or p_importe<>round(p_importe,2) or v_cobrado+p_importe>v.total then raise exception 'Importe o estado de venta inválido'; end if;
 insert into pago(id_venta,importe,medio_pago,referencia) values(p_venta,p_importe,p_medio,p_referencia);
 if v_cobrado+p_importe=v.total then update venta set estado='pagada' where id_venta=p_venta; perform emitir_boletos(p_venta);
 insert into participacion_sorteo(id_sorteo,id_detalle_venta) select s.id_sorteo,d.id_detalle_venta from sorteo s join detalle_venta d on d.id_venta=p_venta and d.estado='activo' where s.id_rifa=v.id_rifa and s.estado='en_curso' on conflict do nothing; end if;
end
$func$;
create or replace function public.baja_venta(p_venta uuid,p_motivo text) returns void language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 update venta set estado='cancelada',fecha_cancelacion=now(),motivo_anulacion=p_motivo,responsable_anulacion=auth.uid(),estado_antes_anulacion=estado where id_venta=p_venta and estado<>'cancelada';if not found then return;end if;
 update numero_rifa set estado='disponible' where id_numero_rifa in(select id_numero_rifa from detalle_venta where id_venta=p_venta and estado='activo');
 update detalle_venta set estado='cancelado' where id_venta=p_venta and estado='activo';
 update boleto set estado='anulado' where id_detalle_venta in(select id_detalle_venta from detalle_venta where id_venta=p_venta);
 perform preparar_devolucion(p_venta,cobro_vigente(p_venta),p_motivo);
end $$;
create or replace function public.resumen_candidatos(p_rifa uuid,p_premio uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select case when (select estado from public.rifa where id_rifa=p_rifa)='activa' then
 (select jsonb_build_object('estado_rifa','activa','extracciones',0,'inscritos',count(*),'numeros',count(*),
 'muestra',coalesce(array_agg(numero order by numero),'{}')) from public.vw_numeros_por_persona where id_rifa=p_rifa and estado='pagada')
 else jsonb_build_object('numeros',count(*),'participantes',count(distinct c.id_persona),
 'estado_rifa',(select estado from public.rifa where id_rifa=p_rifa),
 'extracciones',(select count(*) from public.vw_selecciones_rifa where id_rifa=p_rifa),
 'ultimo_premio',(select id_premio_rifa from public.vw_selecciones_rifa where id_rifa=p_rifa order by fecha_extraccion desc, orden_extraccion desc limit 1),
 'muestra',coalesce(array_agg(n.numero order by n.numero),'{}'), 'inscritos',(select count(*) from public.participacion_sorteo ps join public.sorteo so using(id_sorteo) where so.id_rifa=p_rifa),'vendidos',(select count(*) from public.numero_rifa where id_rifa=p_rifa and estado='vendido'),'abiertas',(select ventas_abiertas from public.rifa where id_rifa=p_rifa)) end
 from public.sorteo s cross join lateral public.candidatos_premio(s.id_sorteo,p_premio) c
 join public.numero_rifa n using(id_numero_rifa) where s.id_rifa=p_rifa;
$$;
create or replace function public.extraer_numero_sorteo(p_rifa uuid,p_premio uuid,p_orden integer,p_solicitud uuid) returns public.extraccion_sorteo
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_s sorteo; v_p premio_rifa; v_e extraccion_sorteo; v_n uuid; v_orden integer; elegibles integer[];
begin perform bloquear_rifa(p_rifa,false);
 select * into strict v_s from sorteo where id_rifa=p_rifa;
 select * into v_e from extraccion_sorteo where id_solicitud=p_solicitud and id_sorteo=v_s.id_sorteo and id_premio_rifa=p_premio and orden_extraccion=p_orden;
 if found then return v_e; end if;
 select * into v_p from premio_rifa where id_rifa=p_rifa and estado='pendiente' order by orden_sorteo limit 1;
 select count(*)+1 into v_orden from extraccion_sorteo where id_premio_rifa=p_premio;
 if v_s.estado<>'en_curso' or v_p.id_premio_rifa is distinct from p_premio or v_orden is distinct from p_orden then raise exception 'Actualiza el historial de extracciones'; end if;
 select array_agg(n.numero order by n.numero) into elegibles from candidatos_premio(v_s.id_sorteo,p_premio) c join numero_rifa n using(id_numero_rifa);
 select id_numero_rifa into v_n from numero_rifa where id_rifa=p_rifa and numero=any(elegibles) and cardinality(elegibles)>=v_p.numero_extraccion_ganadora-v_orden+1 order by extensions.gen_random_bytes(16) limit 1;
 if v_n is null then raise exception 'Números insuficientes para %',v_p.nombre; end if;
 insert into extraccion_sorteo(id_sorteo,id_premio_rifa,id_numero_rifa,orden_extraccion,es_ganadora,id_solicitud,numeros_elegibles) values(v_s.id_sorteo,p_premio,v_n,v_orden,v_orden=v_p.numero_extraccion_ganadora,p_solicitud,elegibles) returning * into v_e;
 if v_e.es_ganadora then
 insert into resultado_sorteo(id_sorteo,id_premio_rifa,id_extraccion) values(v_s.id_sorteo,p_premio,v_e.id_extraccion);
 update premio_rifa set estado='sorteado' where id_premio_rifa=p_premio;
 if not exists(select from premio_rifa where id_rifa=p_rifa and estado='pendiente') then update rifa set ventas_abiertas=false where id_rifa=p_rifa and ventas_abiertas;end if; end if;
 return v_e;
end
$func$;
create or replace function public.datos_boleto_individual(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
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
   'premios_publicos',(select coalesce(jsonb_agg(jsonb_build_object('orden',p.orden_sorteo,'nombre',case when p.es_sorpresa and p.estado='pendiente' then 'Premio sorpresa' else p.nombre end,'descripcion',case when not p.es_sorpresa or p.estado='sorteado' then p.descripcion end,'imagen',case when not p.es_sorpresa or p.estado='sorteado' then p.imagen_url end,'sorpresa',p.es_sorpresa and p.estado='pendiente') order by p.orden_sorteo),'[]') from public.premio_rifa p where p.id_rifa=r.id_rifa),
 'numeros_anulados',(select coalesce(jsonb_agg(distinct (x.datos_emision_historicos->>'numero')::int order by (x.datos_emision_historicos->>'numero')::int),'[]') from public.vw_boletos_rifa x where x.id_rifa=b.id_rifa and x.id_persona=b.id_persona and x.estado='anulado' and not exists(select from public.vw_numeros_grupo n where n.id_rifa=x.id_rifa and n.id_persona=x.id_persona and n.numero=(x.datos_emision_historicos->>'numero')::int)),
 'modalidad',c.modalidad,'enlace_mapa',case when t.mostrar_lugar and c.modalidad='presencial' then c.enlace_mapa end,
   'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g') when c.modalidad in ('teams','meet','otro') then c.enlace_reunion end
 ) from public.vw_boletos_rifa b join public.rifa r using(id_rifa) join public.plantilla_boleto t using(id_rifa)
 join public.configuracion_transmision c using(id_rifa) where b.token_publico=p_token;
$$;
alter table public.reserva add column fecha_cambio timestamptz;
update public.reserva r set fecha_cambio=(select max(a.fecha_creacion) from public.auditoria a where a.entidad='reserva' and a.id_registro=r.id_reserva and a.datos_anteriores->>'estado' is distinct from a.datos_nuevos->>'estado' and a.datos_nuevos->>'estado'=r.estado) where r.estado<>'activa';
create function public.fechar_reserva() returns trigger language plpgsql set search_path='' as $$begin new.fecha_cambio:=clock_timestamp();return new;end $$;
create trigger fechar_reserva before update of estado on public.reserva for each row when(old.estado<>new.estado) execute function public.fechar_reserva();
create or replace view public.vw_resumen_rifa with (security_invoker=true) as select r.id_rifa,r.nombre,r.estado,r.fecha_sorteo,r.cantidad_numeros,
 count(*) filter(where n.estado='disponible') disponibles,count(*) filter(where n.estado='reservado') reservados,count(*) filter(where n.estado='vendido') vendidos,
 case when r.estado='anulada' then 0 else coalesce((select sum(public.cobro_vigente(v.id_venta)) from public.venta v where v.id_rifa=r.id_rifa and v.estado<>'cancelada'),0) end recaudacion
 from public.rifa r left join public.numero_rifa n using(id_rifa) group by r.id_rifa;
create or replace function public.proteger_configuracion() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='rifa' then
 if new.estado in ('anulada','terminada') then new.ventas_abiertas:=false;end if;
 if old.estado<>'activa' and (to_jsonb(new)-'estado'-'fecha_modificacion'-'ventas_abiertas') is distinct from (to_jsonb(old)-'estado'-'fecha_modificacion'-'ventas_abiertas') then raise exception 'Configuración fijada'; end if;
 elsif exists(select from public.sorteo where id_rifa=coalesce(new.id_rifa,old.id_rifa)) then
 if tg_op<>'UPDATE' or (to_jsonb(new)-'estado') is distinct from (to_jsonb(old)-'estado') then raise exception 'Premios fijados'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
update public.venta v set estado_antes_anulacion=a.datos_anteriores->>'estado',responsable_anulacion=a.id_perfil from public.auditoria a where a.entidad='venta' and a.id_registro=v.id_venta and a.datos_nuevos->>'estado'='cancelada' and a.datos_anteriores->>'estado'<>'cancelada' and v.estado='cancelada';

-- Los clientes antiguos conservan la firma anterior. Los nuevos verifican lo mostrado bajo el mismo bloqueo de la extracción.
create function public.extraer_numero_sorteo(p_rifa uuid,p_premio uuid,p_orden integer,p_solicitud uuid,p_elegibles integer[]) returns public.extraccion_sorteo
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actual integer[]; registrada extraccion_sorteo;
begin
 perform bloquear_rifa(p_rifa,false);
 select e.* into registrada from extraccion_sorteo e join sorteo s using(id_sorteo)
 where s.id_rifa=p_rifa and e.id_solicitud=p_solicitud and e.id_premio_rifa=p_premio and e.orden_extraccion=p_orden;
 if found then return registrada; end if;
 select array_agg(n.numero order by n.numero) into actual from sorteo s cross join lateral candidatos_premio(s.id_sorteo,p_premio) c join numero_rifa n using(id_numero_rifa) where s.id_rifa=p_rifa;
 if actual is distinct from p_elegibles then raise exception 'Los números elegibles cambiaron. Revisa la esfera y vuelve a sortear.';end if;
 return extraer_numero_sorteo(p_rifa,p_premio,p_orden,p_solicitud);
end $$;
revoke all on function public.extraer_numero_sorteo(uuid,uuid,integer,uuid,integer[]) from public,anon,authenticated;
grant execute on function public.extraer_numero_sorteo(uuid,uuid,integer,uuid,integer[]) to authenticated;
alter table public.ajuste_venta add column numeros_retirados integer[];
create or replace function public.ajustar_numeros_venta(p_venta uuid,p_detalles uuid[],p_confirmar boolean default false,p_motivo text default null,p_total_esperado numeric default null,p_cobrado_esperado numeric default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v venta; restantes int; seleccionados int; nuevo numeric; cobrado numeric;antes jsonb;
begin perform bloquear_rifa((select id_rifa from venta where id_venta=p_venta));select * into strict v from venta where id_venta=p_venta;
 select count(*) filter(where not(id_detalle_venta=any(p_detalles))),count(*) filter(where id_detalle_venta=any(p_detalles)),jsonb_agg(to_jsonb(d)) into restantes,seleccionados,antes from detalle_venta d where id_venta=p_venta and estado='activo';
 if v.estado='cancelada' or seleccionados=0 or seleccionados is distinct from cardinality(p_detalles) then raise exception 'Selección inválida';end if;
 nuevo:=(cotizar_numeros(restantes,coalesce(v.precio_base,(select max(precio_unitario) from detalle_venta where id_venta=p_venta)),v.ofertas_originales)->>'total')::numeric;
 cobrado:=cobro_vigente(p_venta);
 if p_confirmar then
 if nullif(trim(p_motivo),'') is null or nuevo is distinct from p_total_esperado or cobrado is distinct from p_cobrado_esperado then raise exception 'Revisa el importe actualizado y el motivo';end if;
 insert into ajuste_venta(id_venta,id_perfil,motivo,total_anterior,total_nuevo,detalle_anterior,numeros_retirados) values(p_venta,auth.uid(),p_motivo,v.total,nuevo,antes,array(select n.numero from detalle_venta d join numero_rifa n using(id_numero_rifa) where d.id_detalle_venta=any(p_detalles) order by n.numero));
 if restantes=0 then perform baja_venta(p_venta,p_motivo);else
 update numero_rifa set estado='disponible' where id_numero_rifa in(select id_numero_rifa from detalle_venta where id_detalle_venta=any(p_detalles));
 update detalle_venta set estado='cancelado' where id_detalle_venta=any(p_detalles);
 update boleto set estado='anulado' where id_detalle_venta=any(p_detalles);
 with orden as(select id_detalle_venta,row_number() over(order by id_numero_rifa) pos from detalle_venta where id_venta=p_venta and estado='activo')
 update detalle_venta d set precio_unitario=(floor(nuevo*100/restantes)+case when pos<=mod(nuevo*100,restantes) then 1 else 0 end)/100 from orden where orden.id_detalle_venta=d.id_detalle_venta;
 update venta set total=nuevo,estado=case when cobrado>=nuevo then 'pagada' else 'pendiente' end where id_venta=p_venta;
 perform preparar_devolucion(p_venta,greatest(0,cobrado-nuevo),p_motivo);
 if cobrado>=nuevo then perform emitir_boletos(p_venta);end if;
 end if;end if;
 return jsonb_build_object('total',nuevo,'cobrado',cobrado,'devolver',greatest(0,cobrado-nuevo),'saldo',greatest(0,nuevo-cobrado));
end $$;
-- Recuperar los números de ajustes antiguos cuando existe una lista posterior verificable.
with sucesivos as (
 select a.*,lead(detalle_anterior) over(partition by id_venta order by fecha,id_ajuste) siguientes from public.ajuste_venta a
), historicos as (
 select a.id_ajuste,a.detalle_anterior,coalesce(a.siguientes,case when v.estado<>'cancelada' then coalesce((select jsonb_agg(to_jsonb(d)) from public.detalle_venta d where d.id_venta=v.id_venta and d.estado='activo'),'[]') end) despues
 from sucesivos a join public.venta v using(id_venta) where a.total_nuevo>0
)
update public.ajuste_venta a set numeros_retirados=array(select n.numero from jsonb_array_elements(h.detalle_anterior) antes join public.numero_rifa n on n.id_numero_rifa=(antes->>'id_numero_rifa')::uuid where not exists(select from jsonb_array_elements(h.despues) nuevo where nuevo->>'id_detalle_venta'=antes->>'id_detalle_venta') order by n.numero)
from historicos h where a.id_ajuste=h.id_ajuste and h.despues is not null;
create view public.vw_anulaciones_parciales with(security_invoker=true) as
select a.id_ajuste,a.id_venta,v.id_rifa,v.id_persona,a.id_perfil,a.fecha,a.motivo,a.total_anterior,a.total_nuevo,v.fecha_venta,a.numeros_retirados
from public.ajuste_venta a join public.venta v using(id_venta) where a.total_nuevo>0;
revoke all on public.vw_anulaciones_parciales from public,anon,authenticated;
grant select on public.vw_anulaciones_parciales to authenticated;
create or replace view public.vw_detalle_ventas with(security_invoker=true) as
select v.id_venta,v.id_rifa,v.id_persona,v.estado,v.total,v.fecha_venta,v.fecha_cancelacion,d.id_detalle_venta,d.precio_unitario,n.numero,n.id_numero_rifa,d.estado estado_detalle,v.estado_antes_anulacion,v.motivo_anulacion,v.responsable_anulacion,b.id_boleto,coalesce((select a.total_anterior from public.ajuste_venta a where a.id_venta=v.id_venta order by a.fecha,a.id_ajuste limit 1),v.total) total_original from public.venta v join public.detalle_venta d using(id_venta) join public.numero_rifa n using(id_numero_rifa) left join public.boleto b using(id_detalle_venta);
create or replace function public.finalizar_sorteo(p_rifa uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform bloquear_rifa(p_rifa,false);
 if not exists(select from sorteo where id_rifa=p_rifa) or exists(select from premio_rifa where id_rifa=p_rifa and estado='pendiente') then raise exception 'Faltan premios por sortear'; end if;
 perform cerrar_reserva(id_reserva,'liberada') from reserva where id_rifa=p_rifa and estado='activa';
 update sorteo set estado='terminado',fecha_fin=now() where id_rifa=p_rifa and estado='en_curso';
 update rifa set estado='terminada',ventas_abiertas=false where id_rifa=p_rifa and estado='en_sorteo'; end
$func$;
create or replace function public.liberar_reserva(p_reserva uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r uuid;
begin select id_rifa into strict r from reserva where id_reserva=p_reserva;perform bloquear_rifa(r,false);
 if not exists(select from rifa where id_rifa=r and estado in ('activa','en_sorteo')) then raise exception 'Rifa cerrada'; end if;
 perform cerrar_reserva(p_reserva,'liberada');
end $$;
create view public.vw_historial_reservas with (security_invoker=true) as
select r.*, case when r.estado='activa' then (public.cotizar_reserva(r.id_reserva)->>'total')::numeric end saldo
from public.reserva r;
revoke all on public.vw_historial_reservas from public,anon,authenticated;
grant select on public.vw_historial_reservas to authenticated;

create view public.vw_comprobantes_operacion with (security_invoker=true) as
select g.*, (select jsonb_agg(jsonb_build_object('numero',n.numero,'estado_numero',
  case when n.estado_numero='reservado' then 'reservado' else v.estado end) order by n.numero)
  from public.vw_numeros_grupo n left join public.vw_numeros_por_persona v
  using(id_rifa,id_persona,numero) where n.id_persona=g.id_persona and n.id_rifa=g.id_rifa) estados_numeros
from public.vw_comprobantes g;
revoke all on public.vw_comprobantes_operacion from public,anon,authenticated;
grant select on public.vw_comprobantes_operacion to authenticated;
commit;

