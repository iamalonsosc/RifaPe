begin;

-- Un tipo nulo representa el interruptor apagado, también en las rifas históricas.
alter table public.rifa
  add column tipo_metodo_pago text,
  add column nombre_metodo_pago text,
  add column referencia_pago text,
  add constraint metodo_pago_valido check (
    case when tipo_metodo_pago is null then nombre_metodo_pago is null and referencia_pago is null
      when tipo_metodo_pago in ('Yape','Plin') then nombre_metodo_pago is null
        and referencia_pago is not null and referencia_pago ~ '^9[0-9]{8}$'
      when tipo_metodo_pago='Otros' then nombre_metodo_pago is not null and length(trim(nombre_metodo_pago)) between 1 and 64
        and referencia_pago is not null and length(trim(referencia_pago)) between 1 and 100
      else false end
  );

create function privado.metodo_pago(r public.rifa) returns jsonb language sql immutable set search_path='' as $$
  select case when r.tipo_metodo_pago is not null then jsonb_build_object(
    'tipo',r.tipo_metodo_pago,'nombre',coalesce(r.nombre_metodo_pago,r.tipo_metodo_pago),'referencia',r.referencia_pago) end
$$;

revoke all on function privado.metodo_pago(public.rifa) from public,anon,authenticated;

-- La sobrecarga conserva la firma de clientes anteriores y delega el bloqueo y la propiedad.
create function public.guardar_rifa_ofertas(p_nombre text,p_precio numeric,p_cantidad integer,p_fecha timestamptz,
  p_regla text,p_descripcion text,p_imagen text,p_rifa uuid,p_ofertas jsonb,p_metodo_pago jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  id uuid;
  tipo text := p_metodo_pago->>'tipo';
  v_nombre text := trim(regexp_replace(p_metodo_pago->>'nombre','[[:space:]]+',' ','g'));
  referencia text := trim(regexp_replace(p_metodo_pago->>'referencia','[[:space:]]+',' ','g'));
begin
  if p_metodo_pago is not null then
    if tipo is null or tipo not in ('Yape','Plin','Otros') then raise exception 'Selecciona un método de pago'; end if;
    if jsonb_typeof(p_metodo_pago->'referencia') is distinct from 'string' then raise exception 'Escribe la referencia de pago como texto'; end if;
    if tipo='Otros' then
      if jsonb_typeof(p_metodo_pago->'nombre') is distinct from 'string' or length(v_nombre) not between 1 and 64
        then raise exception 'Escribe el nombre del método (hasta 64 caracteres)'; end if;
      if length(referencia) not between 1 and 100 then raise exception 'Escribe la referencia de pago (hasta 100 caracteres)'; end if;
    else
      v_nombre := null;
      if referencia !~ '^9[0-9]{8}$' then raise exception 'El celular debe comenzar con 9 y tener nueve dígitos'; end if;
    end if;
  end if;
  id := public.guardar_rifa_ofertas(p_nombre,p_precio,p_cantidad,p_fecha,p_regla,p_descripcion,p_imagen,p_rifa,p_ofertas);
  update public.rifa set tipo_metodo_pago=tipo,nombre_metodo_pago=v_nombre,referencia_pago=referencia where id_rifa=id;
  return id;
end $$;
revoke all on function public.guardar_rifa_ofertas(text,numeric,integer,timestamptz,text,text,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.guardar_rifa_ofertas(text,numeric,integer,timestamptz,text,text,text,uuid,jsonb,jsonb) to authenticated;

-- Una fila por operación evita multiplicar los importes por los números del boleto.
create function privado.importes_boleto(p_rifa uuid,p_persona uuid)
returns table(total numeric,saldo numeric) language sql stable security invoker set search_path='' as $$
  select coalesce(sum(importe),0), coalesce(sum(pendiente),0) from (
    select v.total importe, greatest(0,v.total-public.cobro_vigente(v.id_venta)) pendiente
      from public.venta v where v.id_rifa=p_rifa and v.id_persona=p_persona and v.estado<>'cancelada'
    union all
    select importe,importe from public.reserva s
      cross join lateral (select (public.cotizar_numeros(
        (select count(*)::integer from public.detalle_reserva d where d.id_reserva=s.id_reserva),
        s.precio_unitario,s.ofertas_pactadas)->>'total')::numeric importe) cotizacion
      where s.id_rifa=p_rifa and s.id_persona=p_persona and s.estado='activa'
        and (s.fecha_vencimiento is null or s.fecha_vencimiento>statement_timestamp())
        and exists(select from public.vw_boletos_rifa b where b.id_reserva=s.id_reserva and b.estado='emitido')
  ) operaciones
$$;
revoke all on function privado.importes_boleto(uuid,uuid) from public,anon,authenticated;

create function privado.importes_boleto_propietaria(p_rifa uuid,p_persona uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select (select to_jsonb(i) from privado.importes_boleto(p_rifa,p_persona) i)
    from public.rifa r where r.id_rifa=p_rifa and r.id_perfil=auth.uid()
$$;
revoke all on function privado.importes_boleto_propietaria(uuid,uuid) from public,anon;
grant execute on function privado.importes_boleto_propietaria(uuid,uuid) to authenticated;

create or replace view public.vw_comprobantes_operacion with (security_invoker=true) as
select g.*, (select jsonb_agg(jsonb_build_object('numero',n.numero,'estado_numero',
  case when n.estado_numero='reservado' then 'reservado' else v.estado end) order by n.numero)
  from public.vw_numeros_grupo n left join public.vw_numeros_por_persona v
  using(id_rifa,id_persona,numero) where n.id_persona=g.id_persona and n.id_rifa=g.id_rifa) estados_numeros,
  case when r.tipo_metodo_pago is not null then privado.importes_boleto_propietaria(g.id_rifa,g.id_persona) end importes
from public.vw_comprobantes g join public.rifa r using(id_rifa);

create or replace function public.consultar_boleto(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 select datos || jsonb_strip_nulls(jsonb_build_object(
   'metodo_pago',privado.metodo_pago(r),
   'tiene_abonos',i.total>i.saldo,
   'saldo_pendiente',i.saldo)) into datos from public.rifa r
   left join lateral privado.importes_boleto(g.id_rifa,g.id_persona) i on r.tipo_metodo_pago is not null
   where r.id_rifa=g.id_rifa;
 return datos||jsonb_build_object('codigo',coalesce(individual.token_publico,g.token_grupo),'codigo_grupo',g.token_grupo,'numero',coalesce((individual.datos_emision_historicos->>'numero')::integer,g.numeros[1]),'numeros',g.numeros,'estado','emitido','estado_rifa',g.estado_rifa,'estados_numeros',(select jsonb_agg(to_jsonb(n)-'id_rifa'-'id_persona' order by numero) from public.vw_numeros_grupo n where n.id_rifa=g.id_rifa and n.id_persona=g.id_persona));
end $$;

create or replace function public.consultar_disponibilidad(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'metodo_pago',case when r.estado in ('activa','en_sorteo') then privado.metodo_pago(r) end,
    'nombre',r.nombre,'estado',r.estado,
    'foto',case when r.mostrar_foto_publica then r.imagen_premio_url end,
    'fecha',case when r.mostrar_fecha_publica then r.fecha_sorteo end,
    'precio',case when r.mostrar_precio_publico then
      case when r.estado='en_sorteo' and r.ventas_abiertas then r.precio_en_vivo else r.precio_numero end end,
    'premios',case when r.mostrar_premios_publicos then privado.catalogo_premios(r.id_rifa,false) end
  )) || case when r.estado in ('activa','en_sorteo') then (
    select jsonb_build_object(
      'numeros', coalesce(jsonb_agg(case when n.estado='disponible' and
        (r.estado='activa' or r.ventas_abiertas) then n.numero else -n.numero end order by n.numero),'[]'),
      'reservados', coalesce(jsonb_agg(n.numero order by n.numero)
        filter(where n.estado='reservado' and e.id_numero_rifa is null),'[]'),
      'comprados_emitidos', coalesce(jsonb_agg(n.numero order by n.numero)
        filter(where n.estado='vendido' or (n.estado='reservado' and e.id_numero_rifa is not null)),'[]')
    )
    from public.numero_rifa n
    left join (
      select distinct d.id_numero_rifa from public.reserva s
      join public.detalle_reserva d using(id_reserva)
      join public.boleto b using(id_detalle_reserva)
      where s.id_rifa=r.id_rifa and s.estado='activa' and b.estado='emitido'
        and (s.fecha_vencimiento is null or s.fecha_vencimiento>statement_timestamp())
    ) e using(id_numero_rifa)
    where n.id_rifa=r.id_rifa
  ) else '{}'::jsonb end
  from public.rifa r where r.token_disponibilidad=p_token and r.disponibilidad_habilitada;
$$;
commit;
