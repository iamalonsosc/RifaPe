begin;
create function public.validar_reserva() returns trigger language plpgsql set search_path='' as $$
begin if (select r.id_perfil=p.id_perfil from public.rifa r,public.persona p where r.id_rifa=new.id_rifa and p.id_persona=new.id_persona) is not true then raise exception 'Relaciones incompatibles en reserva'; end if; return new; end $$;
create trigger validar_relaciones before insert or update on public.reserva for each row execute function public.validar_reserva();
create function public.validar_venta() returns trigger language plpgsql set search_path='' as $$
begin if (select r.id_perfil=p.id_perfil from public.rifa r,public.persona p where r.id_rifa=new.id_rifa and p.id_persona=new.id_persona) is not true then raise exception 'Relaciones incompatibles en venta'; end if; return new; end $$;
create trigger validar_relaciones before insert or update on public.venta for each row execute function public.validar_venta();
create function public.validar_detalle_reserva() returns trigger language plpgsql set search_path='' as $$
begin if (select r.id_rifa=n.id_rifa from public.reserva r,public.numero_rifa n where r.id_reserva=new.id_reserva and n.id_numero_rifa=new.id_numero_rifa) is not true then raise exception 'Relaciones incompatibles en detalle_reserva'; end if; return new; end $$;
create trigger validar_relaciones before insert or update on public.detalle_reserva for each row execute function public.validar_detalle_reserva();
create function public.validar_detalle_venta() returns trigger language plpgsql set search_path='' as $$
begin if (select v.id_rifa=n.id_rifa from public.venta v,public.numero_rifa n where v.id_venta=new.id_venta and n.id_numero_rifa=new.id_numero_rifa) is not true then raise exception 'Relaciones incompatibles en detalle_venta'; end if; return new; end $$;
create trigger validar_relaciones before insert or update on public.detalle_venta for each row execute function public.validar_detalle_venta();
create function public.validar_participacion_sorteo() returns trigger language plpgsql set search_path='' as $$
begin if (select s.id_rifa=v.id_rifa and v.estado='pagada' from public.sorteo s,public.detalle_venta d join public.venta v using(id_venta) where s.id_sorteo=new.id_sorteo and d.id_detalle_venta=new.id_detalle_venta) is not true then raise exception 'Relaciones incompatibles en participacion_sorteo'; end if; return new; end $$;
create trigger validar_relaciones before insert or update on public.participacion_sorteo for each row execute function public.validar_participacion_sorteo();
create function public.validar_extraccion_sorteo() returns trigger language plpgsql set search_path='' as $$
begin if (select s.id_rifa=p.id_rifa and n.id_rifa=s.id_rifa from public.sorteo s, public.premio_rifa p,public.numero_rifa n where s.id_sorteo=new.id_sorteo and p.id_premio_rifa=new.id_premio_rifa and n.id_numero_rifa=new.id_numero_rifa) is not true then raise exception 'Relaciones incompatibles en extraccion_sorteo'; end if; return new; end $$;
create trigger validar_relaciones before insert or update on public.extraccion_sorteo for each row execute function public.validar_extraccion_sorteo();
create function public.validar_resultado_sorteo() returns trigger language plpgsql set search_path='' as $$
begin if (select e.es_ganadora and e.id_sorteo=new.id_sorteo and e.id_premio_rifa=new.id_premio_rifa from public.extraccion_sorteo e where e.id_extraccion=new.id_extraccion) is not true then raise exception 'Relaciones incompatibles en resultado_sorteo'; end if; return new; end $$;
create trigger validar_relaciones before insert or update on public.resultado_sorteo for each row execute function public.validar_resultado_sorteo();
create function public.proteger_configuracion() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='rifa' then
 if old.estado<>'activa' and (to_jsonb(new)-'estado'-'fecha_modificacion') is distinct from (to_jsonb(old)-'estado'-'fecha_modificacion') then raise exception 'Configuración fijada'; end if;
 elsif exists(select from public.sorteo where id_rifa=coalesce(new.id_rifa,old.id_rifa)) then
 if tg_op<>'UPDATE' or (to_jsonb(new)-'estado') is distinct from (to_jsonb(old)-'estado') then raise exception 'Premios fijados'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger proteger_configuracion before update on public.rifa for each row execute function public.proteger_configuracion();
create trigger proteger_configuracion before insert or update or delete on public.premio_rifa for each row execute function public.proteger_configuracion();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rifafacil-imagenes','rifafacil-imagenes',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy subir_imagen_administradora on storage.objects for insert to authenticated with check(bucket_id='rifafacil-imagenes' and (storage.foldername(name))[1]=auth.uid()::text and exists(select from public.perfil where id_perfil=auth.uid()));
commit;
