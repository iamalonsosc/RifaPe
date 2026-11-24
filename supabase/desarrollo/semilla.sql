-- Solo para un proyecto de desarrollo vacío con la administradora autorizada.
begin;
select set_config('request.jwt.claim.sub',(select id_perfil::text from public.perfil where plaza=1),true);
set local role authenticated;
select public.guardar_persona('Alonso');
do $$ declare r uuid;
begin
 r:=public.guardar_rifa('Rifa de demostración',5,50,now()+interval '30 days','numero');
 perform public.guardar_premio(r,'Ventilador',1,3,false);
 perform public.guardar_premio(r,'Premio sorpresa',2,1,true);
end $$;
commit;
