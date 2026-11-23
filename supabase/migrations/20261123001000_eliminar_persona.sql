begin;
create function public.eliminar_persona(p_persona uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from public.persona where id_persona=p_persona and id_perfil=auth.uid();
  if not found then raise exception 'No se encontró el participante.'; end if;
exception when foreign_key_violation then
  raise exception 'Este participante tiene ventas o reservas registradas. Puedes editar su ficha, pero se debe conservar su historial.';
end $$;
revoke all on function public.eliminar_persona(uuid) from public,anon,authenticated;
grant execute on function public.eliminar_persona(uuid) to authenticated;
commit;
