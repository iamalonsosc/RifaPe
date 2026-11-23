begin;
create function public.eliminar_rifa_sin_movimientos(p_rifa uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $func$
begin
 perform bloquear_rifa(p_rifa);
 if exists(select from reserva where id_rifa=p_rifa) or exists(select from venta where id_rifa=p_rifa) then raise exception 'Esta rifa ya tiene movimientos y debe conservar su historial'; end if;
 delete from premio_rifa where id_rifa=p_rifa;
 delete from plantilla_boleto where id_rifa=p_rifa;
 delete from configuracion_transmision where id_rifa=p_rifa;
 delete from numero_rifa where id_rifa=p_rifa;
 delete from rifa where id_rifa=p_rifa;
end
$func$;
revoke all on function public.eliminar_rifa_sin_movimientos from public, anon, authenticated;
grant execute on function public.eliminar_rifa_sin_movimientos to authenticated;
commit;
