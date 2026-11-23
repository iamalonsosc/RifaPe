begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.perfil (
  id_perfil uuid primary key references auth.users(id),
  nombre text not null,
  fecha_creacion timestamptz not null default now(),
  fecha_modificacion timestamptz not null default now()
);
alter table public.perfil enable row level security;
revoke all on public.perfil from public, anon, authenticated;
grant select on public.perfil to authenticated;
create policy lectura_propietaria on public.perfil for select to authenticated using (id_perfil=auth.uid());


create table public.persona (
  id_persona uuid primary key default gen_random_uuid(),
  id_perfil uuid not null references public.perfil(id_perfil),
  nombres text not null check(trim(nombres)<>''),
  apellidos text,
  telefono text,
  fecha_creacion timestamptz not null default now()
);
alter table public.persona enable row level security;
revoke all on public.persona from public, anon, authenticated;
grant select on public.persona to authenticated;
create policy lectura_propietaria on public.persona for select to authenticated using (id_perfil=auth.uid());
create index on public.persona(id_perfil);

create table public.rifa (
  id_rifa uuid primary key default gen_random_uuid(),
  id_perfil uuid not null references public.perfil(id_perfil),
  nombre text not null check(trim(nombre)<>''),
  descripcion text,
  precio_numero numeric(12,2) not null check(precio_numero>0),
  cantidad_numeros integer not null check(cantidad_numeros between 1 and 100000),
  fecha_sorteo timestamptz not null,
  estado text not null default 'activa' check (estado in ('activa','en_sorteo','terminada')),
  imagen_premio_url text,
  regla_ganador text not null check(regla_ganador in ('numero','persona','repeticion')),
  modo_ejecucion text not null default 'individual' check(modo_ejecucion='individual'),
  fecha_creacion timestamptz not null default now(),
  fecha_modificacion timestamptz not null default now()
);
alter table public.rifa enable row level security;
revoke all on public.rifa from public, anon, authenticated;
grant select on public.rifa to authenticated;
create policy lectura_propietaria on public.rifa for select to authenticated using (id_perfil=auth.uid());
create index on public.rifa(id_perfil);

create table public.premio_rifa (
  id_premio_rifa uuid primary key default gen_random_uuid(),
  id_rifa uuid not null references public.rifa(id_rifa),
  nombre text not null check(trim(nombre)<>''),
  descripcion text,
  imagen_url text,
  orden_sorteo integer not null check(orden_sorteo>0),
  es_sorpresa boolean not null default false,
  numero_extraccion_ganadora integer not null default 1 check(numero_extraccion_ganadora>0),
  estado text not null default 'pendiente' check (estado in ('pendiente','sorteado')),
  unique(id_rifa,orden_sorteo) deferrable initially deferred
);
alter table public.premio_rifa enable row level security;
revoke all on public.premio_rifa from public, anon, authenticated;
grant select on public.premio_rifa to authenticated;
create policy lectura_propietaria on public.premio_rifa for select to authenticated using (id_rifa in (select id_rifa from public.rifa));
create index on public.premio_rifa(id_rifa);

create table public.numero_rifa (
  id_numero_rifa uuid primary key default gen_random_uuid(),
  id_rifa uuid not null references public.rifa(id_rifa),
  numero integer not null check(numero>0),
  estado text not null default 'disponible' check (estado in ('disponible','reservado','vendido')),
  fecha_creacion timestamptz not null default now(),
  unique(id_rifa,numero)
);
alter table public.numero_rifa enable row level security;
revoke all on public.numero_rifa from public, anon, authenticated;
grant select on public.numero_rifa to authenticated;
create policy lectura_propietaria on public.numero_rifa for select to authenticated using (id_rifa in (select id_rifa from public.rifa));
create index on public.numero_rifa(id_rifa);

create table public.reserva (
  id_reserva uuid primary key default gen_random_uuid(),
  id_rifa uuid not null references public.rifa(id_rifa),
  id_persona uuid not null references public.persona(id_persona),
  estado text not null default 'activa' check (estado in ('activa','liberada','vencida','convertida')),
  fecha_vencimiento timestamptz not null,
  fecha_creacion timestamptz not null default now()
);
alter table public.reserva enable row level security;
revoke all on public.reserva from public, anon, authenticated;
grant select on public.reserva to authenticated;
create policy lectura_propietaria on public.reserva for select to authenticated using (id_rifa in (select id_rifa from public.rifa));
create index on public.reserva(id_rifa);
create index on public.reserva(id_persona);

create table public.detalle_reserva (
  id_detalle_reserva uuid primary key default gen_random_uuid(),
  id_reserva uuid not null references public.reserva(id_reserva),
  id_numero_rifa uuid not null references public.numero_rifa(id_numero_rifa),
  unique(id_reserva,id_numero_rifa)
);
alter table public.detalle_reserva enable row level security;
revoke all on public.detalle_reserva from public, anon, authenticated;
grant select on public.detalle_reserva to authenticated;
create policy lectura_propietaria on public.detalle_reserva for select to authenticated using (id_reserva in (select id_reserva from public.reserva));
create index on public.detalle_reserva(id_reserva);
create index on public.detalle_reserva(id_numero_rifa);

create table public.venta (
  id_venta uuid primary key default gen_random_uuid(),
  id_rifa uuid not null references public.rifa(id_rifa),
  id_persona uuid not null references public.persona(id_persona),
  estado text not null default 'pendiente' check (estado in ('pendiente','pagada','cancelada')),
  total numeric(12,2) not null check(total>0),
  fecha_venta timestamptz not null default now(),
  fecha_cancelacion timestamptz
);
alter table public.venta enable row level security;
revoke all on public.venta from public, anon, authenticated;
grant select on public.venta to authenticated;
create policy lectura_propietaria on public.venta for select to authenticated using (id_rifa in (select id_rifa from public.rifa));
create index on public.venta(id_rifa);
create index on public.venta(id_persona);

create table public.detalle_venta (
  id_detalle_venta uuid primary key default gen_random_uuid(),
  id_venta uuid not null references public.venta(id_venta),
  id_numero_rifa uuid not null references public.numero_rifa(id_numero_rifa),
  precio_unitario numeric(12,2) not null check(precio_unitario>0),
  estado text not null default 'activo' check (estado in ('activo','cancelado'))
);
alter table public.detalle_venta enable row level security;
revoke all on public.detalle_venta from public, anon, authenticated;
grant select on public.detalle_venta to authenticated;
create policy lectura_propietaria on public.detalle_venta for select to authenticated using (id_venta in (select id_venta from public.venta));
create index on public.detalle_venta(id_venta);
create index on public.detalle_venta(id_numero_rifa);

create table public.pago (
  id_pago uuid primary key default gen_random_uuid(),
  id_venta uuid not null references public.venta(id_venta),
  importe numeric(12,2) not null check(importe>0),
  medio_pago text not null check(medio_pago in ('yape','plin','efectivo','otro')),
  estado text not null default 'confirmado' check (estado in ('confirmado')),
  referencia text,
  fecha_pago timestamptz not null default now(),
  fecha_creacion timestamptz not null default now()
);
alter table public.pago enable row level security;
revoke all on public.pago from public, anon, authenticated;
grant select on public.pago to authenticated;
create policy lectura_propietaria on public.pago for select to authenticated using (id_venta in (select id_venta from public.venta));
create index on public.pago(id_venta);

create table public.devolucion (
  id_devolucion uuid primary key default gen_random_uuid(),
  id_pago uuid not null references public.pago(id_pago),
  importe numeric(12,2) not null check(importe>0),
  motivo text not null,
  fecha_devolucion timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente','realizada')),
  unique(id_pago)
);
alter table public.devolucion enable row level security;
revoke all on public.devolucion from public, anon, authenticated;
grant select on public.devolucion to authenticated;
create policy lectura_propietaria on public.devolucion for select to authenticated using (id_pago in (select id_pago from public.pago));
create index on public.devolucion(id_pago);

create table public.plantilla_boleto (
  id_plantilla_boleto uuid primary key default gen_random_uuid(),
  id_rifa uuid not null references public.rifa(id_rifa),
  unique(id_rifa),
  titulo text not null default 'Boleto de participación',
  mostrar_premio boolean not null default true,
  mostrar_lugar boolean not null default true,
  mostrar_qr boolean not null default true,
  tema text not null default 'elegante' check(tema in ('elegante','navidad','verano')),
  fondo_url text,
  configuracion_visual jsonb not null default '{}'
);
alter table public.plantilla_boleto enable row level security;
revoke all on public.plantilla_boleto from public, anon, authenticated;
grant select on public.plantilla_boleto to authenticated;
create policy lectura_propietaria on public.plantilla_boleto for select to authenticated using (id_rifa in (select id_rifa from public.rifa));
create index on public.plantilla_boleto(id_rifa);

create table public.configuracion_transmision (
  id_configuracion uuid primary key default gen_random_uuid(),
  id_rifa uuid not null references public.rifa(id_rifa),
  unique(id_rifa),
  modalidad text not null default 'presencial' check(modalidad in ('presencial','teams','tiktok','otro')),
  usuario_tiktok text,
  enlace_reunion text check(enlace_reunion ~ '^https://'),
  direccion text,
  mostrar_lugar boolean not null default true,
  fecha_modificacion timestamptz not null default now()
);
alter table public.configuracion_transmision enable row level security;
revoke all on public.configuracion_transmision from public, anon, authenticated;
grant select on public.configuracion_transmision to authenticated;
create policy lectura_propietaria on public.configuracion_transmision for select to authenticated using (id_rifa in (select id_rifa from public.rifa));
create index on public.configuracion_transmision(id_rifa);

create table public.boleto (
  id_boleto uuid primary key default gen_random_uuid(),
  id_detalle_venta uuid not null references public.detalle_venta(id_detalle_venta),
  unique(id_detalle_venta),
  token_publico uuid not null unique default gen_random_uuid(),
  estado text not null default 'emitido' check (estado in ('emitido','anulado')),
  fecha_emision timestamptz not null default now(),
  datos_emision_historicos jsonb not null
);
alter table public.boleto enable row level security;
revoke all on public.boleto from public, anon, authenticated;
grant select on public.boleto to authenticated;
create policy lectura_propietaria on public.boleto for select to authenticated using (id_detalle_venta in (select id_detalle_venta from public.detalle_venta));
create index on public.boleto(id_detalle_venta);

create table public.sorteo (
  id_sorteo uuid primary key default gen_random_uuid(),
  id_rifa uuid not null references public.rifa(id_rifa),
  unique(id_rifa),
  estado text not null default 'en_curso' check (estado in ('en_curso','terminado')),
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  regla_ganador_fijada text not null,
  modo_ejecucion_fijado text not null
);
alter table public.sorteo enable row level security;
revoke all on public.sorteo from public, anon, authenticated;
grant select on public.sorteo to authenticated;
create policy lectura_propietaria on public.sorteo for select to authenticated using (id_rifa in (select id_rifa from public.rifa));
create index on public.sorteo(id_rifa);

create table public.participacion_sorteo (
  id_sorteo uuid not null references public.sorteo(id_sorteo),
  id_detalle_venta uuid not null references public.detalle_venta(id_detalle_venta),
  primary key(id_sorteo,id_detalle_venta)
);
alter table public.participacion_sorteo enable row level security;
revoke all on public.participacion_sorteo from public, anon, authenticated;
grant select on public.participacion_sorteo to authenticated;
create policy lectura_propietaria on public.participacion_sorteo for select to authenticated using (id_sorteo in (select id_sorteo from public.sorteo));
create index on public.participacion_sorteo(id_sorteo);
create index on public.participacion_sorteo(id_detalle_venta);

create table public.extraccion_sorteo (
  id_extraccion uuid primary key default gen_random_uuid(),
  id_sorteo uuid not null references public.sorteo(id_sorteo),
  id_premio_rifa uuid not null references public.premio_rifa(id_premio_rifa),
  id_numero_rifa uuid not null references public.numero_rifa(id_numero_rifa),
  orden_extraccion integer not null,
  es_ganadora boolean not null,
  fecha_extraccion timestamptz not null default now(),
  id_solicitud uuid not null unique,
  unique(id_premio_rifa,orden_extraccion),
  unique(id_premio_rifa,id_numero_rifa)
);
alter table public.extraccion_sorteo enable row level security;
revoke all on public.extraccion_sorteo from public, anon, authenticated;
grant select on public.extraccion_sorteo to authenticated;
create policy lectura_propietaria on public.extraccion_sorteo for select to authenticated using (id_sorteo in (select id_sorteo from public.sorteo));
create index on public.extraccion_sorteo(id_sorteo);
create index on public.extraccion_sorteo(id_premio_rifa);
create index on public.extraccion_sorteo(id_numero_rifa);

create table public.resultado_sorteo (
  id_resultado uuid primary key default gen_random_uuid(),
  id_sorteo uuid not null references public.sorteo(id_sorteo),
  id_premio_rifa uuid not null references public.premio_rifa(id_premio_rifa),
  id_extraccion uuid not null references public.extraccion_sorteo(id_extraccion),
  unique(id_premio_rifa),
  unique(id_extraccion),
  fecha_resultado timestamptz not null default now()
);
alter table public.resultado_sorteo enable row level security;
revoke all on public.resultado_sorteo from public, anon, authenticated;
grant select on public.resultado_sorteo to authenticated;
create policy lectura_propietaria on public.resultado_sorteo for select to authenticated using (id_sorteo in (select id_sorteo from public.sorteo));
create index on public.resultado_sorteo(id_sorteo);
create index on public.resultado_sorteo(id_premio_rifa);
create index on public.resultado_sorteo(id_extraccion);

create table public.auditoria (
  id_auditoria uuid primary key default gen_random_uuid(),
  id_perfil uuid not null references public.perfil(id_perfil),
  entidad text not null,
  id_registro uuid not null,
  accion text not null,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  fecha_creacion timestamptz not null default now()
);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from public, anon, authenticated;
grant select on public.auditoria to authenticated;
create policy lectura_propietaria on public.auditoria for select to authenticated using (id_perfil=auth.uid());
create index on public.auditoria(id_perfil);
create unique index perfil_administradora_unica on public.perfil ((true));
create unique index venta_activa_por_numero on public.detalle_venta(id_numero_rifa) where estado='activo';
create index on public.reserva(fecha_vencimiento) where estado='activa';
create index on public.rifa(estado,fecha_sorteo);
commit;
