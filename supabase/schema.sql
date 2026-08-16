-- ============================================================================
-- PUNTO CERO v2 · Red ciudadana de apoyo tras el sismo
-- Esquema PostgreSQL / Supabase con controles de Habeas Data
-- ----------------------------------------------------------------------------
-- Marco legal: Ley 1581 de 2012, Decreto 1377 de 2013 y Ley 1266 de 2008.
--
-- Principios del modelo:
--   1. ANONIMATO POR DISEÑO. No existe columna de nombre ni de documento.
--      El punto se identifica por un alias o referencia del lugar.
--   2. MINIMIZACIÓN. Solo se almacena lo necesario para llevar la ayuda.
--      El teléfono es opcional y, si se entrega, se guarda cifrado.
--   3. CONSENTIMIENTO VERIFICABLE. Ninguna fila entra sin aceptación expresa,
--      y queda constancia de qué versión de la política se aceptó.
--   4. REVERSIBILIDAD. Quien registró puede revocar y suprimir sus datos con
--      el token que recibe, sin necesidad de cuenta.
--   5. TRAZABILIDAD PÚBLICA SIN EXPOSICIÓN. El historial muestra alias, zona y
--      evolución de la ayuda; nunca contacto ni ubicación exacta.
--
-- Ejecutar completo en: Supabase Studio → SQL Editor → Run
--
-- Revisión 2026-08-16: el archivo se ejecutó completo contra PostgreSQL 16 en
-- una sola transacción, igual que hace el editor de Supabase, y se probaron
-- las funciones una por una. Cuatro defectos corregidos en esa pasada:
--   · condición de excepción `undefined_schema`, que no existe en PostgreSQL
--   · `create or replace view` insertando una columna en medio
--   · `id` como parámetro de salida chocando con la columna `id`
--   · un CASE devolviendo `text` donde la columna es un enum
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 0. LLAVE DE CIFRADO (Supabase Vault)
-- ----------------------------------------------------------------------------
-- La llave NUNCA vive en el código ni en variables del frontend. Se guarda en
-- Vault, cifrada con la llave maestra del proyecto, y solo la leen funciones
-- SECURITY DEFINER que corren como `postgres`.
-- ============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'punto_cero_clave_contacto') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'punto_cero_clave_contacto',
      'Llave simétrica para cifrar el teléfono opcional de las solicitudes'
    );
  end if;
exception
  -- PostgreSQL no tiene una condición llamada `undefined_schema`. Si Vault no
  -- está disponible, lo que se levanta es `invalid_schema_name`.
  when invalid_schema_name or undefined_table or undefined_function
    or insufficient_privilege then
    raise notice 'Vault no disponible: crea el secreto punto_cero_clave_contacto antes de producción.';
end $$;

create or replace function public.fn_clave_contacto()
returns text
language plpgsql security definer set search_path = vault, public as $$
declare v text;
begin
  select decrypted_secret into v
  from vault.decrypted_secrets
  where name = 'punto_cero_clave_contacto';

  if v is null then
    raise exception 'CLAVE_NO_CONFIGURADA: crea el secreto punto_cero_clave_contacto en Vault.';
  end if;
  return v;
end $$;

revoke all on function public.fn_clave_contacto() from public, anon, authenticated;

-- ============================================================================
-- 1. TIPOS
-- ============================================================================

do $$ begin
  create type estado_solicitud as enum ('PENDIENTE', 'EN_PROCESO', 'RESUELTO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_ayuda as enum ('ALIMENTOS', 'SALUD', 'ALBERGUE', 'RESCATE', 'HERRAMIENTAS');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_moderacion as enum ('VISIBLE', 'EN_REVISION', 'OCULTA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type motivo_reporte as enum (
    'DATOS_PERSONALES', 'CONTENIDO_FALSO', 'DUPLICADO', 'OFENSIVO', 'ESTAFA', 'OTRO'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_evento as enum (
    'REGISTRADA', 'APOYO_COMPROMETIDO', 'APOYO_ENTREGADO',
    'RESUELTA', 'EN_REVISION', 'SUPRIMIDA'
  );
exception when duplicate_object then null; end $$;

create sequence if not exists folio_solicitud_seq start 1001;

-- Versión vigente de la política. Al cambiar el texto legal se sube este valor:
-- así se sabe exactamente qué aceptó cada persona.
create or replace function public.version_politica()
returns text language sql immutable as $$ select '2026.08-v2'::text $$;

-- ============================================================================
-- 2. TABLA PRINCIPAL
-- ============================================================================

create table if not exists public.solicitudes_ayuda (
  id                   uuid primary key default gen_random_uuid(),
  folio                text not null unique
                       default ('AYU-' || lpad(nextval('folio_solicitud_seq')::text, 5, '0')),

  -- ---- Identificación NO personal -----------------------------------------
  -- Alias o referencia del sitio: "Tienda El Roble", "Casa 2", "Edificio Central".
  -- Las restricciones impiden colar una cédula o un correo en este campo.
  alias_referencia     text not null
                       check (char_length(btrim(alias_referencia)) between 3 and 80)
                       check (alias_referencia !~ '[0-9]{6,}')
                       check (alias_referencia !~ '@')
                       check (alias_referencia !~* '(c\.?c\.?|cedula|cédula|nit)\s*[0-9]'),

  -- ---- Contacto opcional y cifrado ----------------------------------------
  telefono_cifrado     bytea,
  tiene_telefono       boolean generated always as (telefono_cifrado is not null) stored,

  -- ---- Ubicación ----------------------------------------------------------
  departamento         text not null,
  municipio            text not null,
  direccion_referencia text not null
                       check (char_length(btrim(direccion_referencia)) between 5 and 200),
  latitud              double precision check (latitud  between -4.5 and 13.5),
  longitud             double precision check (longitud between -82.5 and -66.0),

  -- ---- Necesidad ----------------------------------------------------------
  tipo_ayuda           tipo_ayuda not null,
  descripcion          text not null
                       check (char_length(btrim(descripcion)) between 10 and 800),
  personas_afectadas   smallint not null default 1
                       check (personas_afectadas between 1 and 999),

  -- ---- Evidencia opcional -------------------------------------------------
  -- Ruta dentro del bucket `evidencias`. La imagen se re-codifica en el cliente
  -- antes de subirse, así que llega como JPEG limpio, sin EXIF ni cargas.
  imagen_ruta          text check (imagen_ruta ~ '^[a-z0-9/_-]+\.jpg$'),

  -- ---- Ciclo de vida ------------------------------------------------------
  estado               estado_solicitud  not null default 'PENDIENTE',
  moderacion           estado_moderacion not null default 'VISIBLE',
  reportes_recibidos   smallint not null default 0,

  -- ---- Habeas Data --------------------------------------------------------
  consentimiento       boolean not null check (consentimiento = true),
  politica_version     text not null,
  consentimiento_en    timestamptz not null default now(),
  revocado_en          timestamptz,

  token_gestion        uuid not null default gen_random_uuid(),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

comment on table public.solicitudes_ayuda is
  'Puntos de necesidad. Sin nombres ni documentos: la identificación es un alias de lugar.';
comment on column public.solicitudes_ayuda.telefono_cifrado is
  'Cifrado simétrico con llave de Vault. Solo accesible vía obtener_contacto(), que audita cada lectura.';

-- ============================================================================
-- 3. TABLAS DE APOYO
-- ============================================================================

create table if not exists public.registro_colaboraciones (
  id                 uuid primary key default gen_random_uuid(),
  solicitud_id       uuid not null references public.solicitudes_ayuda(id) on delete cascade,

  alias_colaborador  text not null
                     check (char_length(btrim(alias_colaborador)) between 3 and 80)
                     check (alias_colaborador !~ '[0-9]{6,}'),
  organizacion       text check (char_length(organizacion) <= 120),
  telefono_cifrado   bytea,
  apoyo_brindado     text not null
                     check (char_length(btrim(apoyo_brindado)) between 5 and 600),
  estado_resultante  estado_solicitud not null default 'EN_PROCESO'
                     check (estado_resultante in ('EN_PROCESO', 'RESUELTO')),

  consentimiento     boolean not null check (consentimiento = true),
  politica_version   text not null,
  creado_en          timestamptz not null default now()
);

-- Constancia independiente del consentimiento. Sobrevive a la supresión de la
-- solicitud, porque la ley exige poder demostrar que hubo autorización.
create table if not exists public.registro_consentimientos (
  id               bigserial primary key,
  referencia       text not null,
  contexto         text not null check (contexto in ('SOLICITUD', 'COLABORACION')),
  politica_version text not null,
  finalidad        text not null default 'Gestión y entrega de ayuda humanitaria tras el sismo',
  otorgado_en      timestamptz not null default now(),
  revocado_en      timestamptz
);

create table if not exists public.reportes_contenido (
  id           bigserial primary key,
  solicitud_id uuid not null references public.solicitudes_ayuda(id) on delete cascade,
  motivo       motivo_reporte not null,
  detalle      text check (char_length(detalle) <= 500),
  creado_en    timestamptz not null default now(),
  atendido     boolean not null default false
);

create table if not exists public.historial_eventos (
  id           bigserial primary key,
  solicitud_id uuid not null references public.solicitudes_ayuda(id) on delete cascade,
  folio        text not null,
  alias        text not null,
  municipio    text not null,
  departamento text not null,
  tipo_ayuda   tipo_ayuda not null,
  evento       tipo_evento not null,
  detalle      text,
  ocurrido_en  timestamptz not null default now()
);

comment on table public.historial_eventos is
  'Línea de tiempo pública. Solo alias y municipio: nunca contacto ni coordenadas.';

create table if not exists public.accesos_contacto (
  id            bigserial primary key,
  solicitud_id  uuid not null references public.solicitudes_ayuda(id) on delete cascade,
  consultado_en timestamptz not null default now()
);

-- ============================================================================
-- 4. ÍNDICES
-- ============================================================================

create index if not exists idx_sol_estado     on public.solicitudes_ayuda (estado) where moderacion = 'VISIBLE';
create index if not exists idx_sol_ubicacion  on public.solicitudes_ayuda (departamento, municipio);
create index if not exists idx_sol_tipo       on public.solicitudes_ayuda (tipo_ayuda);
create index if not exists idx_sol_recientes  on public.solicitudes_ayuda (creado_en desc);
create index if not exists idx_sol_geo        on public.solicitudes_ayuda (latitud, longitud) where latitud is not null;
create index if not exists idx_col_solicitud  on public.registro_colaboraciones (solicitud_id, creado_en);
create index if not exists idx_hist_tiempo    on public.historial_eventos (ocurrido_en desc);
create index if not exists idx_hist_solicitud on public.historial_eventos (solicitud_id, ocurrido_en);

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

create or replace function public.fn_touch()
returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

drop trigger if exists trg_touch on public.solicitudes_ayuda;
create trigger trg_touch before update on public.solicitudes_ayuda
  for each row execute function public.fn_touch();

-- 5.1 Evento inicial en el historial
create or replace function public.fn_historial_alta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.historial_eventos
    (solicitud_id, folio, alias, municipio, departamento, tipo_ayuda, evento, detalle)
  values
    (new.id, new.folio, new.alias_referencia, new.municipio, new.departamento,
     new.tipo_ayuda, 'REGISTRADA',
     'Necesidad registrada para ' || new.personas_afectadas || ' persona(s)');
  return new;
end $$;

drop trigger if exists trg_historial_alta on public.solicitudes_ayuda;
create trigger trg_historial_alta after insert on public.solicitudes_ayuda
  for each row execute function public.fn_historial_alta();

-- 5.2 El estado solo avanza, y cada avance queda en el historial
create or replace function public.fn_sincronizar_estado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_folio text; v_alias text; v_mun text; v_dep text; v_tipo tipo_ayuda;
begin
  update public.solicitudes_ayuda
     set estado = greatest(estado, new.estado_resultante)
   where id = new.solicitud_id
  returning folio, alias_referencia, municipio, departamento, tipo_ayuda
  into v_folio, v_alias, v_mun, v_dep, v_tipo;

  insert into public.historial_eventos
    (solicitud_id, folio, alias, municipio, departamento, tipo_ayuda, evento, detalle)
  values (
    new.solicitud_id, v_folio, v_alias, v_mun, v_dep, v_tipo,
    -- El cast es obligatorio: un CASE resuelve a `text`, y la columna es un
    -- enum. Sin él, PostgreSQL aborta con «column "evento" is of type
    -- tipo_evento but expression is of type text».
    (case when new.estado_resultante = 'RESUELTO'
          then 'APOYO_ENTREGADO' else 'APOYO_COMPROMETIDO' end)::tipo_evento,
    new.alias_colaborador || coalesce(' (' || new.organizacion || ')', '') || ': ' || new.apoyo_brindado
  );
  return new;
end $$;

drop trigger if exists trg_sincronizar_estado on public.registro_colaboraciones;
create trigger trg_sincronizar_estado after insert on public.registro_colaboraciones
  for each row execute function public.fn_sincronizar_estado();

-- 5.3 Moderación automática: tres reportes ocultan el punto hasta revisión
create or replace function public.fn_evaluar_reportes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total int; v_folio text; v_alias text; v_mun text; v_dep text; v_tipo tipo_ayuda;
begin
  update public.solicitudes_ayuda
     set reportes_recibidos = reportes_recibidos + 1
   where id = new.solicitud_id
  returning reportes_recibidos, folio, alias_referencia, municipio, departamento, tipo_ayuda
  into v_total, v_folio, v_alias, v_mun, v_dep, v_tipo;

  if v_total >= 3 then
    update public.solicitudes_ayuda
       set moderacion = 'EN_REVISION'
     where id = new.solicitud_id and moderacion = 'VISIBLE';

    insert into public.historial_eventos
      (solicitud_id, folio, alias, municipio, departamento, tipo_ayuda, evento, detalle)
    values (new.solicitud_id, v_folio, v_alias, v_mun, v_dep, v_tipo, 'EN_REVISION',
            'Retirada de la vista pública tras acumular reportes de la comunidad');
  end if;
  return new;
end $$;

drop trigger if exists trg_evaluar_reportes on public.reportes_contenido;
create trigger trg_evaluar_reportes after insert on public.reportes_contenido
  for each row execute function public.fn_evaluar_reportes();

-- ============================================================================
-- 6. VISTAS PÚBLICAS
-- ----------------------------------------------------------------------------
-- Ninguna expone telefono_cifrado ni token_gestion.
-- ============================================================================

create or replace view public.solicitudes_publicas as
select
  s.id, s.folio, s.alias_referencia, s.tiene_telefono,
  s.departamento, s.municipio, s.direccion_referencia,
  s.latitud, s.longitud, s.tipo_ayuda, s.descripcion,
  s.personas_afectadas, s.estado, s.imagen_ruta,
  s.creado_en, s.actualizado_en,
  coalesce(c.total, 0) as total_colaboraciones
from public.solicitudes_ayuda s
left join lateral (
  select count(*)::int as total
  from public.registro_colaboraciones rc where rc.solicitud_id = s.id
) c on true
where s.moderacion = 'VISIBLE' and s.revocado_en is null;

create or replace view public.colaboraciones_publicas as
select rc.id, rc.solicitud_id, rc.alias_colaborador, rc.organizacion,
       rc.apoyo_brindado, rc.estado_resultante, rc.creado_en
from public.registro_colaboraciones rc
join public.solicitudes_ayuda s on s.id = rc.solicitud_id
where s.moderacion = 'VISIBLE' and s.revocado_en is null;

create or replace view public.historial_publico as
select h.id, h.folio, h.alias, h.municipio, h.departamento,
       h.tipo_ayuda, h.evento, h.detalle, h.ocurrido_en
from public.historial_eventos h
join public.solicitudes_ayuda s on s.id = h.solicitud_id;

create or replace view public.estadisticas_ayuda as
select
  count(*) filter (where estado = 'PENDIENTE')::int  as pendientes,
  count(*) filter (where estado = 'EN_PROCESO')::int as en_proceso,
  count(*) filter (where estado = 'RESUELTO')::int   as resueltas,
  count(*)::int                                      as total,
  coalesce(sum(personas_afectadas) filter (where estado <> 'RESUELTO'), 0)::int
    as personas_por_atender
from public.solicitudes_ayuda
where moderacion = 'VISIBLE' and revocado_en is null;

-- ============================================================================
-- 7. FUNCIONES DE ESCRITURA (única puerta para el rol anon)
-- ============================================================================

-- 7.1 Registrar una necesidad
create or replace function public.crear_solicitud(
  p_alias                text,
  p_departamento         text,
  p_municipio            text,
  p_direccion_referencia text,
  p_tipo_ayuda           tipo_ayuda,
  p_descripcion          text,
  p_consentimiento       boolean,
  p_politica_version     text,
  p_personas_afectadas   smallint default 1,
  p_telefono             text default null,
  p_latitud              double precision default null,
  p_longitud             double precision default null,
  p_imagen_ruta          text default null
)
returns table (id uuid, folio text, token_gestion uuid)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_folio text; v_token uuid; v_recientes int;
begin
  if p_consentimiento is not true then
    raise exception 'CONSENTIMIENTO_REQUERIDO: no se puede registrar sin autorización expresa.';
  end if;
  if p_politica_version is distinct from public.version_politica() then
    raise exception 'POLITICA_DESACTUALIZADA: recarga la página para ver el aviso vigente.';
  end if;
  if p_telefono is not null and btrim(p_telefono) <> ''
     and btrim(p_telefono) !~ '^[0-9+()\s-]{7,20}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  select count(*) into v_recientes
  from public.solicitudes_ayuda
  where municipio = p_municipio and creado_en > now() - interval '1 minute';
  if v_recientes >= 20 then
    raise exception 'LIMITE_SOLICITUDES: demasiados registros seguidos en este municipio.';
  end if;

  insert into public.solicitudes_ayuda (
    alias_referencia, telefono_cifrado, departamento, municipio,
    direccion_referencia, tipo_ayuda, descripcion, personas_afectadas,
    latitud, longitud, imagen_ruta, consentimiento, politica_version
  ) values (
    btrim(p_alias),
    case when p_telefono is null or btrim(p_telefono) = '' then null
         else pgp_sym_encrypt(btrim(p_telefono), public.fn_clave_contacto()) end,
    p_departamento, p_municipio, btrim(p_direccion_referencia), p_tipo_ayuda,
    btrim(p_descripcion), coalesce(p_personas_afectadas, 1),
    p_latitud, p_longitud, p_imagen_ruta, true, p_politica_version
  )
  returning solicitudes_ayuda.id, solicitudes_ayuda.folio, solicitudes_ayuda.token_gestion
  into v_id, v_folio, v_token;

  insert into public.registro_consentimientos (referencia, contexto, politica_version)
  values (v_folio, 'SOLICITUD', p_politica_version);

  return query select v_id, v_folio, v_token;
end $$;

-- 7.2 Registrar un apoyo
create or replace function public.registrar_colaboracion(
  p_solicitud_id     uuid,
  p_alias            text,
  p_apoyo            text,
  p_consentimiento   boolean,
  p_politica_version text,
  p_estado           estado_solicitud default 'EN_PROCESO',
  p_organizacion     text default null,
  p_telefono         text default null
)
-- Los parámetros de salida de un `returns table` se convierten en variables
-- dentro de la función. Si se llaman igual que una columna (`id`), PostgreSQL
-- no sabe a cuál te refieres y aborta con «column reference is ambiguous».
-- Por eso el primero se llama `colaboracion_id` y las consultas van
-- cualificadas con el alias de la tabla.
returns table (colaboracion_id uuid, estado_actual estado_solicitud)
language plpgsql security definer set search_path = public as $$
declare v_estado estado_solicitud; v_mod estado_moderacion; v_nuevo uuid; v_folio text;
begin
  if p_consentimiento is not true then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
  end if;

  select s.estado, s.moderacion, s.folio into v_estado, v_mod, v_folio
  from public.solicitudes_ayuda s
  where s.id = p_solicitud_id and s.revocado_en is null;

  if v_estado is null then raise exception 'SOLICITUD_NO_ENCONTRADA'; end if;
  if v_mod <> 'VISIBLE' then raise exception 'SOLICITUD_EN_REVISION'; end if;
  if v_estado = 'RESUELTO' then raise exception 'SOLICITUD_YA_RESUELTA'; end if;

  insert into public.registro_colaboraciones (
    solicitud_id, alias_colaborador, organizacion, telefono_cifrado,
    apoyo_brindado, estado_resultante, consentimiento, politica_version
  ) values (
    p_solicitud_id, btrim(p_alias), nullif(btrim(coalesce(p_organizacion, '')), ''),
    case when p_telefono is null or btrim(p_telefono) = '' then null
         else pgp_sym_encrypt(btrim(p_telefono), public.fn_clave_contacto()) end,
    btrim(p_apoyo), coalesce(p_estado, 'EN_PROCESO'), true, p_politica_version
  ) returning registro_colaboraciones.id into v_nuevo;

  insert into public.registro_consentimientos (referencia, contexto, politica_version)
  values (v_folio, 'COLABORACION', p_politica_version);

  select s.estado into v_estado from public.solicitudes_ayuda s where s.id = p_solicitud_id;
  return query select v_nuevo, v_estado;
end $$;

-- 7.3 Revelar el teléfono cifrado (queda auditado)
create or replace function public.obtener_contacto(p_solicitud_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_cif bytea; v_mod estado_moderacion;
begin
  select telefono_cifrado, moderacion into v_cif, v_mod
  from public.solicitudes_ayuda where id = p_solicitud_id and revocado_en is null;

  if v_mod is null then raise exception 'SOLICITUD_NO_ENCONTRADA'; end if;
  if v_mod <> 'VISIBLE' then raise exception 'SOLICITUD_EN_REVISION'; end if;
  if v_cif is null then return null; end if;

  insert into public.accesos_contacto (solicitud_id) values (p_solicitud_id);
  return pgp_sym_decrypt(v_cif, public.fn_clave_contacto());
end $$;

-- 7.4 Reportar contenido inapropiado
create or replace function public.reportar_contenido(
  p_solicitud_id uuid,
  p_motivo       motivo_reporte,
  p_detalle      text default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.solicitudes_ayuda where id = p_solicitud_id) then
    raise exception 'SOLICITUD_NO_ENCONTRADA';
  end if;
  insert into public.reportes_contenido (solicitud_id, motivo, detalle)
  values (p_solicitud_id, p_motivo, nullif(btrim(coalesce(p_detalle, '')), ''));
  return true;
end $$;

-- 7.5 Cerrar la solicitud (quien la creó)
create or replace function public.cerrar_solicitud(p_folio text, p_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_folio text; v_alias text; v_mun text; v_dep text; v_tipo tipo_ayuda;
begin
  update public.solicitudes_ayuda set estado = 'RESUELTO'
   where folio = upper(btrim(p_folio)) and token_gestion = p_token and revocado_en is null
  returning id, folio, alias_referencia, municipio, departamento, tipo_ayuda
  into v_id, v_folio, v_alias, v_mun, v_dep, v_tipo;

  if v_id is null then return false; end if;

  insert into public.historial_eventos
    (solicitud_id, folio, alias, municipio, departamento, tipo_ayuda, evento, detalle)
  values (v_id, v_folio, v_alias, v_mun, v_dep, v_tipo,
          'RESUELTA', 'Cerrada por quien registró la necesidad');
  return true;
end $$;

-- 7.6 Derecho de supresión y revocación (Ley 1581, art. 8)
-- Borra contacto, coordenadas, imagen y texto libre; conserva folio y eventos
-- para no romper la trazabilidad de ayudas ya entregadas.
create or replace function public.revocar_consentimiento(p_folio text, p_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_folio text; v_mun text; v_dep text; v_tipo tipo_ayuda;
begin
  update public.solicitudes_ayuda
     set telefono_cifrado     = null,
         latitud              = null,
         longitud             = null,
         imagen_ruta          = null,
         direccion_referencia = 'Dirección suprimida a solicitud de la persona',
         alias_referencia     = 'Registro suprimido',
         descripcion          = 'Contenido suprimido a solicitud de quien lo registró.',
         moderacion           = 'OCULTA',
         revocado_en          = now()
   where folio = upper(btrim(p_folio)) and token_gestion = p_token and revocado_en is null
  returning id, folio, municipio, departamento, tipo_ayuda
  into v_id, v_folio, v_mun, v_dep, v_tipo;

  if v_id is null then return false; end if;

  update public.registro_consentimientos
     set revocado_en = now()
   where referencia = upper(btrim(p_folio)) and revocado_en is null;

  insert into public.historial_eventos
    (solicitud_id, folio, alias, municipio, departamento, tipo_ayuda, evento, detalle)
  values (v_id, v_folio, 'Registro suprimido', v_mun, v_dep, v_tipo,
          'SUPRIMIDA', 'Datos eliminados por revocación del consentimiento');
  return true;
end $$;

-- ============================================================================
-- 8. SEGURIDAD: RLS y privilegios
-- ============================================================================

alter table public.solicitudes_ayuda        enable row level security;
alter table public.registro_colaboraciones  enable row level security;
alter table public.registro_consentimientos enable row level security;
alter table public.reportes_contenido       enable row level security;
alter table public.historial_eventos        enable row level security;
alter table public.accesos_contacto         enable row level security;

-- Sin políticas para anon: RLS deniega por defecto. Toda lectura pasa por las
-- vistas (que corren con los privilegios de su dueño) y toda escritura por RPC.
revoke all on public.solicitudes_ayuda        from anon, authenticated;
revoke all on public.registro_colaboraciones  from anon, authenticated;
revoke all on public.registro_consentimientos from anon, authenticated;
revoke all on public.reportes_contenido       from anon, authenticated;
revoke all on public.historial_eventos        from anon, authenticated;
revoke all on public.accesos_contacto         from anon, authenticated;

grant select on public.solicitudes_publicas    to anon, authenticated;
grant select on public.colaboraciones_publicas to anon, authenticated;
grant select on public.historial_publico       to anon, authenticated;
grant select on public.estadisticas_ayuda      to anon, authenticated;

grant execute on function public.crear_solicitud(text, text, text, text, tipo_ayuda, text, boolean, text, smallint, text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.registrar_colaboracion(uuid, text, text, boolean, text, estado_solicitud, text, text) to anon, authenticated;
grant execute on function public.obtener_contacto(uuid) to anon, authenticated;
grant execute on function public.reportar_contenido(uuid, motivo_reporte, text) to anon, authenticated;
grant execute on function public.cerrar_solicitud(text, uuid) to anon, authenticated;
grant execute on function public.revocar_consentimiento(text, uuid) to anon, authenticated;
grant execute on function public.version_politica() to anon, authenticated;

-- ============================================================================
-- 9. ALMACENAMIENTO DE IMÁGENES
-- ----------------------------------------------------------------------------
-- El bucket rechaza en el servidor lo que el cliente ya filtró: solo JPEG,
-- máximo 3 MB, y únicamente dentro de la carpeta `solicitudes/`.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', true, 3145728, array['image/jpeg'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

drop policy if exists "subida anonima de evidencias" on storage.objects;
create policy "subida anonima de evidencias"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = 'solicitudes'
    and lower(right(name, 4)) = '.jpg'
  );

drop policy if exists "lectura publica de evidencias" on storage.objects;
create policy "lectura publica de evidencias"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'evidencias');

-- Sin políticas de UPDATE ni DELETE: una evidencia subida no se sobrescribe
-- desde el cliente.

-- ============================================================================
-- 10. TIEMPO REAL
-- ============================================================================

do $$ begin
  alter publication supabase_realtime add table public.solicitudes_ayuda;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.historial_eventos;
exception when duplicate_object then null; end $$;
