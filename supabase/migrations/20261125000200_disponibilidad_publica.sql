begin;
alter table public.rifa
  add column token_disponibilidad uuid not null unique default gen_random_uuid(),
  add column disponibilidad_habilitada boolean not null default false,
  add column mostrar_foto_publica boolean not null default true,
  add column mostrar_precio_publico boolean not null default true,
  add column mostrar_fecha_publica boolean not null default true,
  add column mostrar_premios_publicos boolean not null default true,
  add column fecha_configuracion_publica timestamptz;

-- La difusión puede revocarse incluso después del sorteo o de una anulación.
create or replace function public.proteger_configuracion() returns trigger
language plpgsql set search_path='' as $$
declare editables constant text[] := array['estado','fecha_modificacion','ventas_abiertas',
  'token_disponibilidad','disponibilidad_habilitada','mostrar_foto_publica',
  'mostrar_precio_publico','mostrar_fecha_publica','mostrar_premios_publicos','fecha_configuracion_publica'];
begin
  if tg_table_name='rifa' then
    if new.estado in ('anulada','terminada') then new.ventas_abiertas:=false; end if;
    if old.estado<>'activa' and (to_jsonb(new)-editables) is distinct from (to_jsonb(old)-editables)
      then raise exception 'Configuración fijada'; end if;
  elsif exists(select from public.sorteo where id_rifa=coalesce(new.id_rifa,old.id_rifa)) then
    if tg_op<>'UPDATE' or (to_jsonb(new)-'estado') is distinct from (to_jsonb(old)-'estado')
      then raise exception 'Premios fijados'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

-- Cada actualización modifica solo las opciones enviadas y bloquea la fila de su propietaria.
create function public.configurar_disponibilidad(p_rifa uuid, p_habilitada boolean default null,
  p_foto boolean default null, p_precio boolean default null, p_fecha boolean default null,
  p_premios boolean default null, p_regenerar boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
  update public.rifa set
    disponibilidad_habilitada=coalesce(p_habilitada,disponibilidad_habilitada),
    mostrar_foto_publica=coalesce(p_foto,mostrar_foto_publica),
    mostrar_precio_publico=coalesce(p_precio,mostrar_precio_publico),
    mostrar_fecha_publica=coalesce(p_fecha,mostrar_fecha_publica),
    mostrar_premios_publicos=coalesce(p_premios,mostrar_premios_publicos),
    token_disponibilidad=case when p_regenerar then gen_random_uuid() else token_disponibilidad end,
    fecha_configuracion_publica=clock_timestamp()
  where id_rifa=p_rifa and id_perfil=auth.uid() returning token_disponibilidad into strict token;
  return token;
end $$;
revoke all on function public.configurar_disponibilidad from public,anon,authenticated;
grant execute on function public.configurar_disponibilidad to authenticated;

create function privado.catalogo_premios(p_rifa uuid, p_revelar_sorteados boolean)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'orden',orden_sorteo,'nombre',case when oculto then 'Premio sorpresa' else nombre end,
    'descripcion',case when not oculto then descripcion end,
    'imagen',case when not oculto then imagen_url end,'sorpresa',oculto
  ) order by orden_sorteo),'[]') from (
    select p.*, es_sorpresa and not (p_revelar_sorteados and estado='sorteado') as oculto
    from public.premio_rifa p where id_rifa=p_rifa
  ) premios;
$$;
revoke all on function privado.catalogo_premios from public,anon,authenticated;

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
   'premios_publicos',privado.catalogo_premios(r.id_rifa,true),
 'numeros_anulados',(select coalesce(jsonb_agg(distinct (x.datos_emision_historicos->>'numero')::int order by (x.datos_emision_historicos->>'numero')::int),'[]') from public.vw_boletos_rifa x where x.id_rifa=b.id_rifa and x.id_persona=b.id_persona and x.estado='anulado' and not exists(select from public.vw_numeros_grupo n where n.id_rifa=x.id_rifa and n.id_persona=x.id_persona and n.numero=(x.datos_emision_historicos->>'numero')::int)),
 'modalidad',c.modalidad,'enlace_mapa',case when t.mostrar_lugar and c.modalidad='presencial' then c.enlace_mapa end,
   'destino',case when c.modalidad='tiktok' then 'https://www.tiktok.com/@'||regexp_replace(c.usuario_tiktok,'[^A-Za-z0-9._]','','g') when c.modalidad in ('teams','meet','otro') then c.enlace_reunion end
 ) from public.vw_boletos_rifa b join public.rifa r using(id_rifa) join public.plantilla_boleto t using(id_rifa)
 join public.configuracion_transmision c using(id_rifa) where b.token_publico=p_token;
$$;

create function public.consultar_disponibilidad(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'nombre',r.nombre,'estado',r.estado,
    'foto',case when r.mostrar_foto_publica then r.imagen_premio_url end,
    'fecha',case when r.mostrar_fecha_publica then r.fecha_sorteo end,
    'precio',case when r.mostrar_precio_publico then
      case when r.estado='en_sorteo' and r.ventas_abiertas then r.precio_en_vivo else r.precio_numero end end,
    'premios',case when r.mostrar_premios_publicos then privado.catalogo_premios(r.id_rifa,false) end,
    'numeros',case when r.estado in ('activa','en_sorteo') then (
      select coalesce(jsonb_agg(case when n.estado='disponible' and
        (r.estado='activa' or r.ventas_abiertas) then n.numero else -n.numero end order by n.numero),'[]')
      from public.numero_rifa n where n.id_rifa=r.id_rifa
    ) end
  )) from public.rifa r where r.token_disponibilidad=p_token and r.disponibilidad_habilitada;
$$;
revoke all on function public.consultar_disponibilidad from public,anon,authenticated;
grant execute on function public.consultar_disponibilidad to service_role;
notify pgrst, 'reload schema';
commit;
