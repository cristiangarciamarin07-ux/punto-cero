-- ============================================================================
-- PUNTO CERO · Módulo de moderación
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUÉS de schema.sql, en Supabase → SQL Editor.
--
-- Revisión 2026-08-16: el archivo se ejecutó completo contra PostgreSQL 16 en
-- una sola transacción, igual que hace el editor de Supabase, y se probaron
-- las funciones una por una. Cuatro defectos corregidos en esa pasada:
--   · condición de excepción `undefined_schema`, que no existe en PostgreSQL
--   · `create or replace view` insertando una columna en medio
--   · `id` como parámetro de salida chocando con la columna `id`
--   · un CASE devolviendo `text` donde la columna es un enum
--
-- Modelo de acceso, en dos capas separadas a propósito:
--
--   AUTENTICACIÓN  la resuelve Supabase Auth con un código de un solo uso
--                  enviado por correo. No hay contraseñas que rotar, filtrar
--                  ni reutilizar, que es el fallo más común en equipos que se
--                  arman con prisa durante una emergencia.
--
--   AUTORIZACIÓN   la resuelve la tabla `moderadores`. Estar autenticado no
--                  da absolutamente nada: el correo tiene que estar en la
--                  lista y activo. Separar las dos capas permite revocar a
--                  alguien en un segundo, sin tocar su cuenta.
--
-- Ninguna acción de moderación se ejecuta sin motivo escrito y sin quedar
-- registrada en `acciones_moderacion`, que nadie puede editar ni borrar.
-- ============================================================================

-- ============================================================================
-- 1. NUEVO CAMPO: verificación en terreno
-- ----------------------------------------------------------------------------
-- La acción positiva del panel. Ocultar puntos falsos ayuda; confirmar que un
-- punto es real ayuda más, porque le dice a los voluntarios dónde ir primero.
-- ============================================================================

alter table public.solicitudes_ayuda
  add column if not exists verificada boolean not null default false,
  add column if not exists verificada_en timestamptz;

-- ============================================================================
-- 2. EQUIPO DE MODERACIÓN
-- ============================================================================

do $$ begin
  create type rol_moderador as enum ('REVISOR', 'COORDINADOR');
exception when duplicate_object then null; end $$;

create table if not exists public.moderadores (
  id             uuid primary key default gen_random_uuid(),
  correo         text not null unique check (correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  alias          text not null check (char_length(btrim(alias)) between 2 and 60),
  organizacion   text,
  rol            rol_moderador not null default 'REVISOR',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  ultimo_acceso  timestamptz
);

comment on table public.moderadores is
  'Lista de autorización. Estar autenticado en Supabase no basta: el correo debe estar aquí y activo.';

-- Bitácora inmutable. Sin política de update ni delete para nadie.
create table if not exists public.acciones_moderacion (
  id           bigserial primary key,
  solicitud_id uuid references public.solicitudes_ayuda(id) on delete set null,
  folio        text not null,
  moderador    text not null,
  accion       text not null check (accion in
                 ('RESTAURAR', 'OCULTAR', 'SUPRIMIR', 'VERIFICAR', 'QUITAR_VERIFICACION', 'DESCARTAR_REPORTES')),
  motivo       text not null check (char_length(btrim(motivo)) between 5 and 500),
  ocurrido_en  timestamptz not null default now()
);

create index if not exists idx_acciones_tiempo on public.acciones_moderacion (ocurrido_en desc);
create index if not exists idx_moderadores_correo on public.moderadores (lower(correo)) where activo;

-- ============================================================================
-- 3. FUNCIONES DE AUTORIZACIÓN
-- ============================================================================

create or replace function public.correo_sesion()
returns text language sql stable as $$
  select lower(nullif(coalesce(auth.jwt() ->> 'email', ''), ''));
$$;

create or replace function public.es_moderador()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.moderadores
    where lower(correo) = public.correo_sesion() and activo
  );
$$;

create or replace function public.es_coordinador()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.moderadores
    where lower(correo) = public.correo_sesion() and activo and rol = 'COORDINADOR'
  );
$$;

-- Devuelve quién soy, o null si el correo autenticado no está autorizado.
-- Es lo primero que llama el panel: si responde null, no se pinta nada.
create or replace function public.mi_perfil_moderador()
returns table (correo text, alias text, organizacion text, rol rol_moderador)
language plpgsql security definer set search_path = public as $$
begin
  update public.moderadores m set ultimo_acceso = now()
   where lower(m.correo) = public.correo_sesion() and m.activo;

  return query
  select m.correo, m.alias, m.organizacion, m.rol
  from public.moderadores m
  where lower(m.correo) = public.correo_sesion() and m.activo;
end $$;

-- ============================================================================
-- 4. VISTAS DEL PANEL
-- ----------------------------------------------------------------------------
-- Cada vista lleva `where public.es_moderador()`. Aunque alguien consiguiera
-- privilegios de lectura sobre la vista, sin estar en la lista recibe cero
-- filas: la comprobación viaja dentro de la consulta, no en la capa de red.
-- ============================================================================

create or replace view public.cola_moderacion as
select
  s.id, s.folio, s.alias_referencia, s.departamento, s.municipio,
  s.direccion_referencia, s.tipo_ayuda, s.descripcion, s.personas_afectadas,
  s.imagen_ruta, s.estado, s.moderacion, s.verificada, s.tiene_telefono,
  s.reportes_recibidos, s.creado_en,
  r.motivos, r.detalles, r.ultimo_reporte, r.pendientes
from public.solicitudes_ayuda s
join lateral (
  select
    array_agg(distinct rc.motivo::text)                          as motivos,
    array_remove(array_agg(rc.detalle order by rc.creado_en), null) as detalles,
    max(rc.creado_en)                                            as ultimo_reporte,
    count(*) filter (where not rc.atendido)::int                 as pendientes
  from public.reportes_contenido rc
  where rc.solicitud_id = s.id
) r on true
where public.es_moderador()
  and s.revocado_en is null
  and (s.reportes_recibidos > 0 or s.moderacion <> 'VISIBLE');

create or replace view public.bitacora_moderacion as
select a.id, a.folio, a.moderador, a.accion, a.motivo, a.ocurrido_en
from public.acciones_moderacion a
where public.es_moderador()
order by a.ocurrido_en desc;

create or replace view public.equipo_moderacion as
select m.correo, m.alias, m.organizacion, m.rol, m.activo, m.creado_en, m.ultimo_acceso
from public.moderadores m
where public.es_coordinador();

create or replace view public.resumen_moderacion as
select
  count(*) filter (where s.moderacion = 'EN_REVISION')::int as en_revision,
  count(*) filter (where s.reportes_recibidos > 0 and s.moderacion = 'VISIBLE')::int as reportados_visibles,
  count(*) filter (where s.verificada)::int as verificados,
  (select count(*) from public.reportes_contenido where not atendido)::int as reportes_pendientes
from public.solicitudes_ayuda s
where public.es_moderador() and s.revocado_en is null;

-- ============================================================================
-- 5. ACCIONES
-- ============================================================================

create or replace function public.moderar_solicitud(
  p_solicitud_id uuid,
  p_accion       text,
  p_motivo       text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_correo text; v_folio text;
begin
  if not public.es_moderador() then
    raise exception 'NO_AUTORIZADO: tu correo no está en la lista de moderación.';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'MOTIVO_REQUERIDO: toda acción de moderación necesita una justificación escrita.';
  end if;

  v_correo := public.correo_sesion();

  select folio into v_folio from public.solicitudes_ayuda
   where id = p_solicitud_id and revocado_en is null;
  if v_folio is null then
    raise exception 'SOLICITUD_NO_ENCONTRADA';
  end if;

  case upper(btrim(p_accion))
    when 'RESTAURAR' then
      update public.solicitudes_ayuda set moderacion = 'VISIBLE' where id = p_solicitud_id;
      update public.reportes_contenido set atendido = true where solicitud_id = p_solicitud_id;

    when 'OCULTAR' then
      update public.solicitudes_ayuda set moderacion = 'OCULTA' where id = p_solicitud_id;
      update public.reportes_contenido set atendido = true where solicitud_id = p_solicitud_id;
      insert into public.historial_eventos
        (solicitud_id, folio, alias, municipio, departamento, tipo_ayuda, evento, detalle)
      select id, folio, alias_referencia, municipio, departamento, tipo_ayuda,
             'EN_REVISION', 'Retirada por moderación'
      from public.solicitudes_ayuda where id = p_solicitud_id;

    when 'SUPRIMIR' then
      -- Mismo efecto que la revocación del titular: se borran los datos, se
      -- conserva el folio para que el historial siga siendo verificable.
      update public.solicitudes_ayuda
         set telefono_cifrado = null, latitud = null, longitud = null,
             imagen_ruta = null,
             direccion_referencia = 'Suprimida por moderación',
             alias_referencia = 'Registro suprimido',
             descripcion = 'Contenido suprimido por moderación.',
             moderacion = 'OCULTA', verificada = false, revocado_en = now()
       where id = p_solicitud_id;
      update public.reportes_contenido set atendido = true where solicitud_id = p_solicitud_id;
      insert into public.historial_eventos
        (solicitud_id, folio, alias, municipio, departamento, tipo_ayuda, evento, detalle)
      select id, folio, 'Registro suprimido', municipio, departamento, tipo_ayuda,
             'SUPRIMIDA', 'Datos eliminados por moderación'
      from public.solicitudes_ayuda where id = p_solicitud_id;

    when 'VERIFICAR' then
      update public.solicitudes_ayuda
         set verificada = true, verificada_en = now(), moderacion = 'VISIBLE'
       where id = p_solicitud_id;
      update public.reportes_contenido set atendido = true where solicitud_id = p_solicitud_id;

    when 'QUITAR_VERIFICACION' then
      update public.solicitudes_ayuda
         set verificada = false, verificada_en = null where id = p_solicitud_id;

    when 'DESCARTAR_REPORTES' then
      update public.reportes_contenido set atendido = true where solicitud_id = p_solicitud_id;
      update public.solicitudes_ayuda
         set reportes_recibidos = 0, moderacion = 'VISIBLE'
       where id = p_solicitud_id;

    else
      raise exception 'ACCION_DESCONOCIDA: %', p_accion;
  end case;

  insert into public.acciones_moderacion (solicitud_id, folio, moderador, accion, motivo)
  values (p_solicitud_id, v_folio, v_correo, upper(btrim(p_accion)), btrim(p_motivo));

  return true;
end $$;

-- Ver el contacto desde el panel también queda auditado, igual que en el
-- tablero público. La moderación no es una llave maestra.
create or replace function public.contacto_para_moderacion(p_solicitud_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_cif bytea;
begin
  if not public.es_moderador() then
    raise exception 'NO_AUTORIZADO';
  end if;
  select telefono_cifrado into v_cif from public.solicitudes_ayuda where id = p_solicitud_id;
  if v_cif is null then return null; end if;
  insert into public.accesos_contacto (solicitud_id) values (p_solicitud_id);
  return pgp_sym_decrypt(v_cif, public.fn_clave_contacto());
end $$;

-- ============================================================================
-- 6. GESTIÓN DEL EQUIPO (solo coordinación)
-- ============================================================================

create or replace function public.registrar_moderador(
  p_correo       text,
  p_alias        text,
  p_rol          rol_moderador default 'REVISOR',
  p_organizacion text default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_coordinador() then
    raise exception 'NO_AUTORIZADO: solo la coordinación puede añadir moderadores.';
  end if;

  insert into public.moderadores (correo, alias, rol, organizacion)
  values (lower(btrim(p_correo)), btrim(p_alias), p_rol, nullif(btrim(coalesce(p_organizacion, '')), ''))
  on conflict (correo) do update
    set activo = true, alias = excluded.alias, rol = excluded.rol,
        organizacion = excluded.organizacion;
  return true;
end $$;

create or replace function public.desactivar_moderador(p_correo text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_quedan int;
begin
  if not public.es_coordinador() then
    raise exception 'NO_AUTORIZADO';
  end if;
  if lower(btrim(p_correo)) = public.correo_sesion() then
    raise exception 'NO_PUEDES_DESACTIVARTE: pide a otra persona de coordinación que lo haga.';
  end if;

  -- Nunca dejar el proyecto sin nadie que pueda administrar el equipo.
  select count(*) into v_quedan from public.moderadores
   where activo and rol = 'COORDINADOR' and lower(correo) <> lower(btrim(p_correo));
  if v_quedan = 0 then
    raise exception 'ULTIMO_COORDINADOR: debe quedar al menos una persona con rol de coordinación.';
  end if;

  update public.moderadores set activo = false where lower(correo) = lower(btrim(p_correo));
  return true;
end $$;

-- ============================================================================
-- 7. SEGURIDAD
-- ============================================================================

alter table public.moderadores        enable row level security;
alter table public.acciones_moderacion enable row level security;

-- Sin políticas: nadie llega a las tablas directamente, ni siquiera un
-- moderador autenticado. Todo pasa por las vistas y las funciones.
revoke all on public.moderadores        from anon, authenticated;
revoke all on public.acciones_moderacion from anon, authenticated;

-- Las vistas del panel NO se otorgan a anon. Solo a sesiones autenticadas, y
-- aun así devuelven cero filas si el correo no está en la lista.
revoke all on public.cola_moderacion     from anon;
revoke all on public.bitacora_moderacion from anon;
revoke all on public.equipo_moderacion   from anon;
revoke all on public.resumen_moderacion  from anon;

grant select on public.cola_moderacion     to authenticated;
grant select on public.bitacora_moderacion to authenticated;
grant select on public.equipo_moderacion   to authenticated;
grant select on public.resumen_moderacion  to authenticated;

grant execute on function public.mi_perfil_moderador()                     to authenticated;
grant execute on function public.moderar_solicitud(uuid, text, text)       to authenticated;
grant execute on function public.contacto_para_moderacion(uuid)            to authenticated;
grant execute on function public.registrar_moderador(text, text, rol_moderador, text) to authenticated;
grant execute on function public.desactivar_moderador(text)                to authenticated;

revoke all on function public.es_moderador()    from anon;
revoke all on function public.es_coordinador()  from anon;

-- ============================================================================
-- 8. LA VISTA PÚBLICA APRENDE EL SELLO DE VERIFICACIÓN
-- ============================================================================

-- `create or replace view` solo deja AÑADIR columnas al final; insertar
-- `verificada` en medio da «cannot change name of view column». Por eso se
-- borra y se vuelve a crear. Sin cascade a propósito: si algún día otra vista
-- depende de esta, queremos enterarnos aquí y no perderla en silencio.
drop view if exists public.solicitudes_publicas;

create view public.solicitudes_publicas as
select
  s.id, s.folio, s.alias_referencia, s.tiene_telefono,
  s.departamento, s.municipio, s.direccion_referencia,
  s.latitud, s.longitud, s.tipo_ayuda, s.descripcion,
  s.personas_afectadas, s.estado, s.imagen_ruta, s.verificada,
  s.creado_en, s.actualizado_en,
  coalesce(c.total, 0) as total_colaboraciones
from public.solicitudes_ayuda s
left join lateral (
  select count(*)::int as total
  from public.registro_colaboraciones rc where rc.solicitud_id = s.id
) c on true
where s.moderacion = 'VISIBLE' and s.revocado_en is null;

grant select on public.solicitudes_publicas to anon, authenticated;

-- ============================================================================
-- 9. PRIMERA PERSONA DE COORDINACIÓN
-- ----------------------------------------------------------------------------
-- Descomenta, pon el correo real y ejecuta esta única línea. A partir de ahí
-- el resto del equipo se administra desde el panel, sin volver al SQL Editor.
--
-- Ese correo debe existir además como usuario en Authentication → Users
-- (botón «Invite user»), porque el panel solo permite entrar a cuentas ya
-- creadas: así nadie puede darse de alta solo.
-- ============================================================================

-- insert into public.moderadores (correo, alias, rol, organizacion)
-- values ('coordinacion@tuorganizacion.org', 'Coordinación', 'COORDINADOR', 'Nombre de la organización')
-- on conflict (correo) do update set rol = 'COORDINADOR', activo = true;
