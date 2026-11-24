begin;
alter table public.configuracion_transmision add column enlace_mapa text;
create function public.guardar_transmision(p_rifa uuid,p_modalidad text,p_usuario text,p_enlace text,p_direccion text,p_mapa text) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare mapa text := case when p_modalidad='presencial' then nullif(trim(p_mapa),'') end;
begin
  perform public.bloquear_rifa(p_rifa,false);
  if mapa is not null and mapa !~* '^https://(maps\.app\.goo\.gl/[^[:space:]]+|goo\.gl/maps/[^[:space:]]+|(www\.)?google\.(com|com\.pe)/maps([/?#][^[:space:]]*)?|maps\.google\.(com|com\.pe)([/?#][^[:space:]]*)?)$' then
    raise exception 'Pega el enlace de Google Maps usando la opción Compartir del mapa.';
  end if;
  update public.configuracion_transmision set modalidad=p_modalidad, usuario_tiktok=p_usuario,
    enlace_reunion=p_enlace, direccion=p_direccion, enlace_mapa=mapa where id_rifa=p_rifa;
end $$;
revoke all on function public.guardar_transmision(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.guardar_transmision(uuid,text,text,text,text,text) to authenticated;
create or replace function public.guardar_transmision(p_rifa uuid,p_modalidad text,p_usuario text,p_enlace text,p_direccion text) returns void
language sql security invoker set search_path='' as $$
  select public.guardar_transmision(p_rifa,p_modalidad,p_usuario,p_enlace,p_direccion,null);
$$;
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
   'modalidad',c.modalidad,'enlace_mapa',case when t.mostrar_lugar and c.modalidad='presencial' then c.enlace_mapa end,
   'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g') when c.modalidad in ('teams','meet','otro') then c.enlace_reunion end
 ) from public.vw_boletos_rifa b join public.rifa r using(id_rifa) join public.plantilla_boleto t using(id_rifa)
 join public.configuracion_transmision c using(id_rifa) where b.token_publico=p_token;
$$;
commit;
