begin;
alter table public.plantilla_boleto add column mostrar_fotos_premios boolean not null default true;

create function public.guardar_plantilla_con_fotos(p_rifa uuid,p_titulo text,p_tema text,p_premio boolean,p_lugar boolean,p_qr boolean,p_fondo text,p_fotos boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.guardar_plantilla(p_rifa,p_titulo,p_tema,p_premio,p_lugar,p_qr,p_fondo);
  update public.plantilla_boleto set mostrar_fotos_premios=p_fotos where id_rifa=p_rifa;
end $$;
revoke all on function public.guardar_plantilla_con_fotos from public,anon,authenticated;
grant execute on function public.guardar_plantilla_con_fotos to authenticated;

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
 ) end from public.boleto b join public.detalle_venta using(id_detalle_venta)
 join public.venta using(id_venta) join public.rifa r using(id_rifa) join public.plantilla_boleto t using(id_rifa)
 join public.configuracion_transmision c using(id_rifa) where b.token_publico=p_token;
$$;
commit;

