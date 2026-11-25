begin;
create or replace function public.consultar_disponibilidad(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
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
