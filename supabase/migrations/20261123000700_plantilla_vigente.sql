begin;

create or replace function public.consultar_boleto(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b.estado = 'anulado' then jsonb_build_object('estado','anulado')
    else
      (b.datos_emision_historicos - 'plantilla' - 'premio')
      || case when t.mostrar_premio then jsonb_build_object('premio',b.datos_emision_historicos->'premio') else '{}'::jsonb end
      || jsonb_build_object(
        'plantilla',to_jsonb(t) - 'id_rifa' - 'id_plantilla_boleto',
        'estado',b.estado,'codigo',b.token_publico,
        'direccion',case when t.mostrar_lugar and c.modalidad='presencial' then c.direccion end,
        'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g')
                       when c.modalidad in ('teams','otro') then c.enlace_reunion end)
    end
  from public.boleto b
  join public.detalle_venta d using(id_detalle_venta)
  join public.venta v using(id_venta)
  join public.plantilla_boleto t using(id_rifa)
  join public.configuracion_transmision c using(id_rifa)
  where b.token_publico=p_token
$$;
revoke all on function public.consultar_boleto(uuid) from public, anon, authenticated;
grant execute on function public.consultar_boleto(uuid) to service_role;
commit;
