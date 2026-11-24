begin;
alter table public.rifa drop constraint rifa_estado_check, add check(estado in ('activa','en_sorteo','terminada','anulada'));
alter table public.sorteo drop constraint sorteo_estado_check,add check(estado in ('en_curso','terminado','anulado'));
alter table public.rifa add column token_consulta uuid not null default gen_random_uuid() unique;
create table public.anulacion_rifa(id_rifa uuid primary key references public.rifa,motivo text not null,fecha_anulacion timestamptz not null default now(),id_perfil uuid not null references public.perfil);
create table public.oferta_rifa(id_oferta uuid primary key default gen_random_uuid(),id_rifa uuid not null references public.rifa on delete cascade,cantidad integer not null check(cantidad>=2),precio numeric(12,2) not null check(precio>0),activa boolean not null default true);
create unique index oferta_activa_cantidad on public.oferta_rifa(id_rifa,cantidad) where activa;
alter table public.venta add column precio_base numeric(12,2), add column ofertas_originales jsonb not null default '[]';
alter table public.detalle_venta drop constraint detalle_venta_precio_unitario_check,add check(precio_unitario>=0);
alter table public.devolucion drop constraint devolucion_id_pago_key;
create table public.ajuste_venta(id_ajuste uuid primary key default gen_random_uuid(),id_venta uuid not null references public.venta,id_perfil uuid not null references public.perfil,fecha timestamptz not null default now(),motivo text not null,total_anterior numeric not null,total_nuevo numeric not null,detalle_anterior jsonb not null);
create table public.boleto_grupo(id_rifa uuid not null references public.rifa,id_persona uuid not null references public.persona,token_grupo uuid unique not null default gen_random_uuid(),primary key(id_rifa,id_persona));
alter table public.anulacion_rifa enable row level security;
revoke all on public.anulacion_rifa from public,anon,authenticated;
grant select on public.anulacion_rifa to authenticated;
create policy lectura_propietaria on public.anulacion_rifa for select to authenticated using (id_rifa in(select id_rifa from public.rifa));
alter table public.oferta_rifa enable row level security;
revoke all on public.oferta_rifa from public,anon,authenticated;
grant select on public.oferta_rifa to authenticated;
create policy lectura_propietaria on public.oferta_rifa for select to authenticated using (id_rifa in(select id_rifa from public.rifa));
alter table public.ajuste_venta enable row level security;
revoke all on public.ajuste_venta from public,anon,authenticated;
grant select on public.ajuste_venta to authenticated;
create policy lectura_propietaria on public.ajuste_venta for select to authenticated using (id_venta in(select id_venta from public.venta));
alter table public.boleto_grupo enable row level security;
revoke all on public.boleto_grupo from public,anon,authenticated;
grant select on public.boleto_grupo to authenticated;
create policy lectura_propietaria on public.boleto_grupo for select to authenticated using (id_rifa in(select id_rifa from public.rifa));
create function public.guardar_rifa_ofertas(p_nombre text,p_precio numeric,p_cantidad integer,p_fecha timestamptz,p_regla text,p_descripcion text,p_imagen text,p_rifa uuid,p_ofertas jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare id uuid; o record;
begin
 id:=guardar_rifa(p_nombre,p_precio,p_cantidad,p_fecha,p_regla,p_descripcion,p_imagen,p_rifa);
 if jsonb_typeof(p_ofertas)<>'array' or p_ofertas is null then raise exception 'Lista de ofertas inválida'; end if;
 if exists(select 1 from jsonb_to_recordset(p_ofertas) x(cantidad integer,activa boolean) where activa group by cantidad having count(*)>1) then raise exception 'Existe más de una oferta activa para la misma cantidad';end if;
 update oferta_rifa set activa=false where id_rifa=id;
 for o in select * from jsonb_to_recordset(p_ofertas) as x(id_oferta uuid,cantidad integer,precio numeric,activa boolean) loop
 if o.precio<=0 or round(o.precio,2)<>o.precio or (o.activa and o.precio>=p_precio*o.cantidad) then raise exception 'Revisa el precio promocional'; end if;
 if o.id_oferta is null then insert into oferta_rifa(id_rifa,cantidad,precio,activa) values(id,o.cantidad,o.precio,o.activa);
 else update oferta_rifa set cantidad=o.cantidad,precio=o.precio,activa=o.activa where id_oferta=o.id_oferta and id_rifa=id;
 if not found then raise exception 'Oferta inválida'; end if; end if;
 end loop;return id;
end $$;

-- Programación dinámica sobre cantidades. Cada transición consume números distintos.
create function public.cotizar_numeros(p_cantidad integer,p_base numeric,p_ofertas jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare costos numeric[]:=array_fill(0::numeric,array[p_cantidad+1],array[0]); paso integer[]:=array_fill(1,array[p_cantidad+1],array[0]); packs integer[]; precios numeric[]; usos integer[]; i integer;j integer;n integer;total numeric;aplicadas jsonb:='[]';
begin
 select array_agg(x.cantidad order by x.cantidad),array_agg(x.precio order by x.cantidad) into packs,precios from jsonb_to_recordset(p_ofertas) x(cantidad integer,precio numeric) where x.cantidad<=p_cantidad and x.precio<p_base*x.cantidad;
 if packs is null then return jsonb_build_object('total',p_base*p_cantidad,'ofertas','[]'::jsonb); end if;
 usos:=array_fill(0,array[cardinality(packs)]);
 for i in 1..p_cantidad loop
 costos[i]:=costos[i-1]+p_base;
 for j in 1..cardinality(packs) loop
 exit when packs[j]>i;
 if costos[i-packs[j]]+precios[j]<costos[i] then costos[i]:=costos[i-packs[j]]+precios[j]; paso[i]:=packs[j];end if;
 end loop;end loop;
 total:=costos[p_cantidad];n:=p_cantidad;
 while n>0 loop i:=paso[n];if i>1 then j:=array_position(packs,i);usos[j]:=usos[j]+1;end if;n:=n-i;end loop;
 for j in 1..cardinality(packs) loop if usos[j]>0 then aplicadas:=aplicadas||jsonb_build_object('cantidad',packs[j],'precio',precios[j],'veces',usos[j]);end if;end loop;
 return jsonb_build_object('total',total,'ofertas',aplicadas);
end $$;

create function public.ofertas_vigentes(p_rifa uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('cantidad',cantidad,'precio',precio) order by cantidad),'[]') from public.oferta_rifa where id_rifa=p_rifa and activa
$$;
create function public.cotizar_compra(p_rifa uuid,p_cantidad integer) returns jsonb language sql stable security definer set search_path='' as $func$
 select public.cotizar_numeros(least(greatest(p_cantidad,0),cantidad_numeros),precio_numero,public.ofertas_vigentes(p_rifa)) from public.rifa where id_rifa=p_rifa and id_perfil=auth.uid()
$func$;
create or replace function public.registrar_venta(p_rifa uuid,p_persona uuid,p_numeros uuid[],p_reserva uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_id uuid; v_precio numeric; tarifas jsonb; importe numeric; cant integer:=cardinality(p_numeros);
begin perform public.bloquear_rifa(p_rifa); if not exists(select from persona where id_persona=p_persona and id_perfil=auth.uid()) then raise exception 'Participante inválido'; end if; perform limpiar_reservas(p_rifa);
 if p_reserva is not null then
 if not exists(select from reserva where id_reserva=p_reserva and id_rifa=p_rifa and id_persona=p_persona and estado='activa') then raise exception 'Reserva inválida'; end if;
 if exists(select id_numero_rifa from detalle_reserva where id_reserva=p_reserva except select unnest(p_numeros)) or exists(select unnest(p_numeros) except select id_numero_rifa from detalle_reserva where id_reserva=p_reserva) then raise exception 'Los números deben coincidir con la reserva'; end if;
 perform cerrar_reserva(p_reserva,'convertida');
 end if;
 if cardinality(p_numeros) is null or cardinality(p_numeros)=0 or cardinality(p_numeros)<>(select count(*) from numero_rifa where id_rifa=p_rifa and id_numero_rifa=any(p_numeros) and estado='disponible') then raise exception 'Selección vacía, duplicada o no disponible'; end if;
 select coalesce((select precio_unitario from reserva where id_reserva=p_reserva),precio_numero)
 into v_precio from rifa where id_rifa=p_rifa;
 tarifas:=ofertas_vigentes(p_rifa); importe:=(cotizar_numeros(cant,v_precio,tarifas)->>'total')::numeric;
 insert into venta(id_rifa,id_persona,total,precio_base,ofertas_originales) values(p_rifa,p_persona,importe,v_precio,tarifas) returning id_venta into v_id;
 insert into detalle_venta(id_venta,id_numero_rifa,precio_unitario) select v_id,n,(floor(importe*100/cant)+case when pos<=mod(importe*100,cant) then 1 else 0 end)/100 from unnest(p_numeros) with ordinality as x(n,pos);
 update numero_rifa set estado='vendido' where id_numero_rifa=any(p_numeros); 
 update boleto b set id_detalle_venta=d.id_detalle_venta,id_detalle_reserva=null
 from detalle_venta d join detalle_reserva dr using(id_numero_rifa)
 where d.id_venta=v_id and dr.id_reserva=p_reserva and b.id_detalle_reserva=dr.id_detalle_reserva;
 return v_id;
end
$func$;
insert into public.boleto_grupo(id_rifa,id_persona) select distinct id_rifa,id_persona from public.vw_boletos_rifa;
create function public.agrupar_al_emitir() returns trigger language plpgsql set search_path='' as $$
begin insert into public.boleto_grupo(id_rifa,id_persona) select id_rifa,id_persona from public.vw_boletos_rifa where id_boleto=new.id_boleto on conflict do nothing;return new;end $$;
create trigger agrupar_al_emitir after insert on public.boleto for each row execute function public.agrupar_al_emitir();

create or replace view public.vw_detalle_ventas with(security_invoker=true) as
select v.id_venta,v.id_rifa,v.id_persona,v.estado,v.total,v.fecha_venta,v.fecha_cancelacion,d.id_detalle_venta,d.precio_unitario,n.numero,n.id_numero_rifa,d.estado estado_detalle from public.venta v join public.detalle_venta d using(id_venta) join public.numero_rifa n using(id_numero_rifa);
create or replace view public.vw_numeros_por_persona with(security_invoker=true) as select * from public.vw_detalle_ventas where estado<>'cancelada' and estado_detalle='activo';

create view public.vw_numeros_grupo with(security_invoker=true) as
select id_rifa,id_persona,numero,'asignado'::text estado_numero from public.vw_numeros_por_persona
union all select id_rifa,id_persona,(datos_emision_historicos->>'numero')::int,'reservado' from public.vw_boletos_rifa where id_reserva is not null and estado='emitido';
revoke all on public.vw_numeros_grupo from public,anon,authenticated;
grant select on public.vw_numeros_grupo to authenticated;
create view public.vw_comprobantes with(security_invoker=true) as
select g.*,r.estado estado_rifa,coalesce(ns.numeros,'{}'::integer[]) numeros,
 case when ns.numeros is null or r.estado='anulada' then 'anulado' else 'emitido' end estado,
 b.token_publico token_individual,b.datos_emision_historicos
 from public.boleto_grupo g join public.rifa r using(id_rifa)
 cross join lateral(select array_agg(numero order by numero) numeros from public.vw_numeros_grupo n where n.id_rifa=g.id_rifa and n.id_persona=g.id_persona) ns
 join lateral(select token_publico,datos_emision_historicos from public.vw_boletos_rifa x where x.id_rifa=g.id_rifa and x.id_persona=g.id_persona order by (x.estado='emitido') desc,fecha_emision,id_boleto limit 1)b on true;
revoke all on public.vw_comprobantes from public,anon,authenticated;
grant select on public.vw_comprobantes to authenticated;
alter function public.consultar_boleto(uuid) rename to datos_boleto_individual;
create function public.consultar_boleto(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.vw_comprobantes; individual public.vw_boletos_rifa; datos jsonb;
begin
 select * into g from public.vw_comprobantes where token_grupo=p_token;
 if not found then
 select * into individual from public.vw_boletos_rifa where token_publico=p_token;
 if not found then
 select jsonb_build_object('tipo','rifa','nombre',r.nombre,'estado',r.estado,'fecha',r.fecha_sorteo,'precio',r.precio_numero,'ofertas',case when r.estado='activa' then public.ofertas_vigentes(r.id_rifa) else '[]'::jsonb end) into datos from public.rifa r where r.token_consulta=p_token;return datos;
 end if;
 select * into g from public.vw_comprobantes where id_rifa=individual.id_rifa and id_persona=individual.id_persona;
 if individual.estado='anulado' then return jsonb_build_object('estado','anulado','estado_rifa',g.estado_rifa);end if;
 end if;
 if g.estado='anulado' then return jsonb_build_object('estado','anulado','estado_rifa',g.estado_rifa);end if;
 datos:=public.datos_boleto_individual(g.token_individual);
 return datos||jsonb_build_object('codigo',coalesce(individual.token_publico,g.token_grupo),'codigo_grupo',g.token_grupo,'numero',coalesce((individual.datos_emision_historicos->>'numero')::integer,g.numeros[1]),'numeros',g.numeros,'estado','emitido','estado_rifa',g.estado_rifa,'estados_numeros',(select jsonb_agg(to_jsonb(n)-'id_rifa'-'id_persona' order by numero) from public.vw_numeros_grupo n where n.id_rifa=g.id_rifa and n.id_persona=g.id_persona));
end $$;
revoke all on function public.consultar_boleto from public,anon,authenticated;
grant execute on function public.consultar_boleto to service_role;
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
   'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g') when c.modalidad in ('teams','otro') then c.enlace_reunion end
 ) from public.vw_boletos_rifa b join public.rifa r using(id_rifa) join public.plantilla_boleto t using(id_rifa)
 join public.configuracion_transmision c using(id_rifa) where b.token_publico=p_token;
$$;
create function public.cobro_vigente(p_venta uuid) returns numeric language sql stable security invoker set search_path='' as $$
select coalesce(sum(p.importe-coalesce((select sum(d.importe) from public.devolucion d where d.id_pago=p.id_pago),0)),0) from public.pago p where p.id_venta=p_venta
$$;
create function public.preparar_devolucion(p_venta uuid,p_importe numeric,p_motivo text) returns void language plpgsql set search_path=pg_catalog,public,pg_temp as $$
declare fila record; restante numeric:=p_importe; parte numeric;
begin
 for fila in select p.id_pago,p.importe-coalesce((select sum(d.importe) from devolucion d where d.id_pago=p.id_pago),0) libre from pago p where p.id_venta=p_venta order by p.fecha_pago desc,p.id_pago loop
 exit when restante<=0;parte:=least(restante,fila.libre);
 if parte>0 then insert into devolucion(id_pago,importe,motivo) values(fila.id_pago,parte,p_motivo);restante:=restante-parte;end if;
 end loop;
 if restante>0 then raise exception 'Reembolso superior al dinero recibido'; end if;
end $$;
create function public.baja_venta(p_venta uuid,p_motivo text) returns void language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
 update venta set estado='cancelada',fecha_cancelacion=now() where id_venta=p_venta and estado<>'cancelada';if not found then return;end if;
 update numero_rifa set estado='disponible' where id_numero_rifa in(select id_numero_rifa from detalle_venta where id_venta=p_venta and estado='activo');
 update detalle_venta set estado='cancelado' where id_venta=p_venta and estado='activo';
 update boleto set estado='anulado' where id_detalle_venta in(select id_detalle_venta from detalle_venta where id_venta=p_venta);
 perform preparar_devolucion(p_venta,cobro_vigente(p_venta),p_motivo);
end $$;
create or replace function public.cancelar_venta(p_venta uuid,p_motivo text) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin perform bloquear_rifa((select id_rifa from venta where id_venta=p_venta));perform baja_venta(p_venta,p_motivo);end $$;
create function public.ajustar_numeros_venta(p_venta uuid,p_detalles uuid[],p_confirmar boolean default false,p_motivo text default null,p_total_esperado numeric default null,p_cobrado_esperado numeric default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v venta; restantes int; seleccionados int; nuevo numeric; cobrado numeric;antes jsonb;
begin perform bloquear_rifa((select id_rifa from venta where id_venta=p_venta));select * into strict v from venta where id_venta=p_venta;
 select count(*) filter(where not(id_detalle_venta=any(p_detalles))),count(*) filter(where id_detalle_venta=any(p_detalles)),jsonb_agg(to_jsonb(d)) into restantes,seleccionados,antes from detalle_venta d where id_venta=p_venta and estado='activo';
 if v.estado='cancelada' or seleccionados=0 or seleccionados is distinct from cardinality(p_detalles) then raise exception 'Selección inválida';end if;
 nuevo:=(cotizar_numeros(restantes,coalesce(v.precio_base,(select max(precio_unitario) from detalle_venta where id_venta=p_venta)),v.ofertas_originales)->>'total')::numeric;
 cobrado:=cobro_vigente(p_venta);
 if p_confirmar then
 if nullif(trim(p_motivo),'') is null or nuevo is distinct from p_total_esperado or cobrado is distinct from p_cobrado_esperado then raise exception 'Revisa el importe actualizado y el motivo';end if;
 insert into ajuste_venta(id_venta,id_perfil,motivo,total_anterior,total_nuevo,detalle_anterior) values(p_venta,auth.uid(),p_motivo,v.total,nuevo,antes);
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
create function public.anular_rifa(p_rifa uuid,p_motivo text,p_confirmacion text default null) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r rifa;
begin perform bloquear_rifa(p_rifa,false);select * into strict r from rifa where id_rifa=p_rifa;
 if r.estado not in ('activa','en_sorteo') or nullif(trim(p_motivo),'') is null then raise exception 'Estado o motivo inválido';end if;
 if r.estado='en_sorteo' and p_confirmacion is distinct from r.nombre then raise exception 'Escribe el nombre de la rifa para confirmar';end if;
 insert into anulacion_rifa(id_rifa,motivo,id_perfil) values(p_rifa,trim(p_motivo),auth.uid());
 perform cerrar_reserva(id_reserva,'liberada') from reserva where id_rifa=p_rifa and estado='activa';
 perform baja_venta(id_venta,p_motivo) from venta where id_rifa=p_rifa and estado<>'cancelada';
 update sorteo set estado='anulado',fecha_fin=now() where id_rifa=p_rifa and estado='en_curso';
 update rifa set estado='anulada' where id_rifa=p_rifa;
end $$;
create or replace function public.bloquear_rifa(p_rifa uuid, p_abierta boolean default true) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v_estado text;
begin
 select estado into strict v_estado from rifa where id_rifa=p_rifa and id_perfil=auth.uid() for update;
 if v_estado='anulada' then raise exception 'Rifa anulada';end if;
 if p_abierta and v_estado<>'activa' then raise exception 'La rifa ya inició su sorteo'; end if;
end
$func$;
create or replace function public.confirmar_devolucion(p_devolucion uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin perform 1 from rifa r join venta v using(id_rifa) join pago p using(id_venta) join devolucion d using(id_pago) where d.id_devolucion=p_devolucion and r.id_perfil=auth.uid() for update of r; if not found then raise exception 'Devolución inválida';end if;
 update devolucion set estado='realizada',fecha_devolucion=now() where id_devolucion=p_devolucion and estado='pendiente'; end
$func$;
create or replace function public.confirmar_pago(p_venta uuid,p_importe numeric,p_medio text,p_referencia text default null) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v venta; v_cobrado numeric;
begin perform bloquear_rifa((select id_rifa from venta where id_venta=p_venta)); select * into strict v from venta where id_venta=p_venta;
 v_cobrado:=cobro_vigente(p_venta);
 if v.estado<>'pendiente' or p_importe<>round(p_importe,2) or v_cobrado+p_importe>v.total then raise exception 'Importe o estado de venta inválido'; end if;
 insert into pago(id_venta,importe,medio_pago,referencia) values(p_venta,p_importe,p_medio,p_referencia);
 if v_cobrado+p_importe=v.total then update venta set estado='pagada' where id_venta=p_venta; perform emitir_boletos(p_venta); end if;
end
$func$;
create or replace function public.emitir_boletos(p_venta uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
declare v venta;
begin select * into strict v from venta where id_venta=p_venta; perform bloquear_rifa(v.id_rifa,false);
 if (select estado from venta where id_venta=p_venta)='cancelada' then raise exception 'Venta cancelada'; end if;
 insert into boleto(id_detalle_venta,datos_emision_historicos)
 select d.id_detalle_venta,jsonb_build_object('participante',concat_ws(' ',p.nombres,p.apellidos),'numero',n.numero,'rifa',r.nombre,'fecha',r.fecha_sorteo,'premio',(select string_agg(case when es_sorpresa then 'Premio sorpresa' else nombre end,', ' order by orden_sorteo) from premio_rifa where id_rifa=r.id_rifa),'plantilla',to_jsonb(t)-'id_rifa'-'id_plantilla_boleto')
 from detalle_venta d join numero_rifa n using(id_numero_rifa) join rifa r using(id_rifa) join plantilla_boleto t using(id_rifa) join persona p on p.id_persona=v.id_persona where d.id_venta=p_venta and d.estado='activo' on conflict(id_detalle_venta) do nothing;
end
$func$;
create or replace view public.vw_pagos_pendientes with(security_invoker=true) as select v.id_venta,v.id_rifa,v.id_persona,v.estado,v.total,v.fecha_venta,v.fecha_cancelacion,v.total-public.cobro_vigente(v.id_venta) saldo from public.venta v where v.estado='pendiente';
create or replace view public.vw_resumen_rifa with (security_invoker=true) as select r.id_rifa,r.nombre,r.estado,r.fecha_sorteo,r.cantidad_numeros,
 count(*) filter(where n.estado='disponible') disponibles,count(*) filter(where n.estado='reservado') reservados,count(*) filter(where n.estado='vendido') vendidos,
 case when r.estado='anulada' then 0 else coalesce((select sum(p.importe) from public.pago p join public.venta v using(id_venta) where v.id_rifa=r.id_rifa),0)-coalesce((select sum(d.importe) from public.devolucion d join public.pago using(id_pago) join public.venta v using(id_venta) where v.id_rifa=r.id_rifa and d.estado='realizada'),0) end recaudacion
 from public.rifa r left join public.numero_rifa n using(id_rifa) group by r.id_rifa;
create or replace view public.vw_historial_ganadores with (security_invoker=true) as select s.id_rifa,p.nombre premio,p.orden_sorteo,n.numero,v.id_persona,concat_ws(' ',a.nombres,a.apellidos) participante,res.fecha_resultado from public.resultado_sorteo res join public.sorteo s using(id_sorteo) join public.premio_rifa p using(id_premio_rifa) join public.extraccion_sorteo e on e.id_extraccion=res.id_extraccion join public.numero_rifa n on n.id_numero_rifa=e.id_numero_rifa join public.detalle_venta d on d.id_numero_rifa=n.id_numero_rifa and exists(select from public.participacion_sorteo ps where ps.id_sorteo=s.id_sorteo and ps.id_detalle_venta=d.id_detalle_venta) join public.venta v using(id_venta) join public.persona a using(id_persona);
revoke all on function public.guardar_rifa_ofertas from public,anon,authenticated;
grant execute on function public.guardar_rifa_ofertas to authenticated;
revoke all on function public.ofertas_vigentes from public,anon,authenticated;
grant execute on function public.ofertas_vigentes to authenticated;
revoke all on function public.cotizar_compra from public,anon,authenticated;
grant execute on function public.cotizar_compra to authenticated;
revoke all on function public.cotizar_numeros from public,anon,authenticated;
revoke all on function public.agrupar_al_emitir from public,anon,authenticated;
revoke all on function public.cobro_vigente from public,anon,authenticated;
grant execute on function public.cobro_vigente to authenticated;
revoke all on function public.preparar_devolucion from public,anon,authenticated;
revoke all on function public.baja_venta from public,anon,authenticated;
revoke all on function public.ajustar_numeros_venta from public,anon,authenticated;
grant execute on function public.ajustar_numeros_venta to authenticated;
revoke all on function public.anular_rifa from public,anon,authenticated;
grant execute on function public.anular_rifa to authenticated;
create function public.registrar_venta_cotizada(p_rifa uuid,p_persona uuid,p_numeros uuid[],p_total numeric,p_reserva uuid default null) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare id uuid;
begin
 id:=registrar_venta(p_rifa,p_persona,p_numeros,p_reserva);
 if (select total from venta where id_venta=id) is distinct from p_total then raise exception 'El precio cambió. Revisa la cotización antes de confirmar.';end if;
 perform emitir_boletos(id);return id;
end $$;
revoke all on function public.registrar_venta_cotizada from public,anon,authenticated;
grant execute on function public.registrar_venta_cotizada to authenticated;
create function public.cotizar_reserva(p_reserva uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.cotizar_numeros((select count(*)::int from public.detalle_reserva where id_reserva=p_reserva),s.precio_unitario,public.ofertas_vigentes(s.id_rifa)) from public.reserva s join public.rifa r using(id_rifa) where s.id_reserva=p_reserva and r.id_perfil=auth.uid()
$$;
revoke all on function public.cotizar_reserva from public,anon,authenticated;
grant execute on function public.cotizar_reserva to authenticated;
create function public.resumen_anulacion(p_rifa uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with personas as(select id_persona from public.venta where id_rifa=p_rifa and estado<>'cancelada' union select id_persona from public.reserva where id_rifa=p_rifa and estado='activa')
 select jsonb_build_object('asignados',vendidos+reservados,'personas',(select count(*) from personas),'cobrado',recaudacion) from public.vw_resumen_rifa where id_rifa=p_rifa
$$;
revoke all on function public.resumen_anulacion from public,anon,authenticated;
grant execute on function public.resumen_anulacion to authenticated;
revoke all on function public.datos_boleto_individual from public,anon,authenticated,service_role;
create view public.vw_estados_rifa with(security_invoker=true) as
select r.id_rifa,s.fecha_inicio,s.fecha_fin,a.fecha_anulacion,a.motivo,
 coalesce((select sum(d.importe) from public.devolucion d join public.pago using(id_pago) join public.venta v using(id_venta) where v.id_rifa=r.id_rifa and d.estado='pendiente'),0) por_devolver,
 coalesce((select sum(d.importe) from public.devolucion d join public.pago using(id_pago) join public.venta v using(id_venta) where v.id_rifa=r.id_rifa and d.estado='realizada'),0) devuelto
from public.rifa r left join public.sorteo s using(id_rifa) left join public.anulacion_rifa a using(id_rifa);
revoke all on public.vw_estados_rifa from public,anon,authenticated;
grant select on public.vw_estados_rifa to authenticated;
create view public.vw_pagos_historicos with(security_invoker=true) as
select p.*,coalesce((select a.total_anterior from public.ajuste_venta a where a.id_venta=p.id_venta and a.fecha>=p.fecha_pago order by a.fecha limit 1),v.total) total_historico from public.pago p join public.venta v using(id_venta);
revoke all on public.vw_pagos_historicos from public,anon,authenticated; grant select on public.vw_pagos_historicos to authenticated;
create or replace view public.vw_recaudacion_diaria with(security_invoker=true) as
select v.id_rifa,(p.fecha_pago at time zone 'America/Lima')::date dia,sum(p.importe-coalesce((select sum(d.importe) from public.devolucion d where d.id_pago=p.id_pago),0)) importe
from public.pago p join public.venta v using(id_venta) where v.estado<>'cancelada' group by 1,2;
commit;
