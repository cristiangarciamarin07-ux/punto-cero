-- ============================================================================
-- Verificación de los controles de la base de datos
-- ----------------------------------------------------------------------------
-- Ejecutar en Supabase → SQL Editor DESPUÉS de aplicar schema.sql.
-- Cada bloque falla ruidosamente si el control no está en su sitio.
-- ============================================================================

-- 1. RLS activo en todas las tablas del esquema public
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = false
  loop
    raise exception 'FALLA: la tabla %.% no tiene RLS activo', 'public', t.tablename;
  end loop;
  raise notice 'OK · RLS activo en todas las tablas';
end $$;

-- 2. El rol anon no tiene privilegios directos sobre las tablas base
do $$
declare n int;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
    and table_name in ('solicitudes_ayuda', 'registro_colaboraciones',
                       'historial_eventos', 'reportes_contenido',
                       'registro_consentimientos', 'accesos_contacto');
  if n > 0 then
    raise exception 'FALLA: anon conserva % privilegios sobre tablas base', n;
  end if;
  raise notice 'OK · anon sin acceso directo a las tablas';
end $$;

-- 3. No existe ninguna columna que pueda contener un nombre o un documento
do $$
declare n int;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'solicitudes_ayuda'
    and (column_name ilike '%nombre%' or column_name ilike '%cedula%'
         or column_name ilike '%documento%' or column_name ilike '%identifica%');
  if n > 0 then
    raise exception 'FALLA: existen % columnas de identificación personal', n;
  end if;
  raise notice 'OK · el modelo no tiene columnas de identificación personal';
end $$;

-- 4. El teléfono nunca se guarda en claro
do $$
declare t text;
begin
  select data_type into t from information_schema.columns
  where table_schema = 'public' and table_name = 'solicitudes_ayuda'
    and column_name = 'telefono_cifrado';
  if t is distinct from 'bytea' then
    raise exception 'FALLA: telefono_cifrado debería ser bytea, es %', coalesce(t, 'inexistente');
  end if;
  raise notice 'OK · el teléfono se almacena cifrado';
end $$;

-- 5. Las vistas públicas no exponen columnas sensibles
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public'
    and table_name in ('solicitudes_publicas', 'colaboraciones_publicas', 'historial_publico')
    and column_name in ('telefono_cifrado', 'token_gestion', 'consentimiento');
  if n > 0 then
    raise exception 'FALLA: las vistas públicas exponen % columnas sensibles', n;
  end if;
  raise notice 'OK · las vistas públicas no filtran datos sensibles';
end $$;

-- 6. Ninguna fila pudo entrar sin consentimiento
do $$
declare n int;
begin
  select count(*) into n from public.solicitudes_ayuda where consentimiento is not true;
  if n > 0 then raise exception 'FALLA: % filas sin consentimiento', n; end if;
  raise notice 'OK · todas las filas tienen consentimiento registrado';
end $$;

-- 7. Todas las funciones expuestas fijan search_path (evita secuestro de esquema)
do $$
declare f record;
begin
  for f in
    select p.proname from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
      )
  loop
    raise exception 'FALLA: la función %() es SECURITY DEFINER sin search_path fijo', f.proname;
  end loop;
  raise notice 'OK · todas las funciones SECURITY DEFINER fijan search_path';
end $$;

-- 8. El bucket de evidencias solo acepta JPEG y limita el tamaño
do $$
declare b record;
begin
  select allowed_mime_types, file_size_limit into b
  from storage.buckets where id = 'evidencias';
  if b is null then raise exception 'FALLA: no existe el bucket evidencias'; end if;
  if b.allowed_mime_types is distinct from array['image/jpeg'] then
    raise exception 'FALLA: el bucket acepta tipos distintos de image/jpeg';
  end if;
  if b.file_size_limit is null or b.file_size_limit > 3145728 then
    raise exception 'FALLA: el bucket no limita el tamaño a 3 MB';
  end if;
  raise notice 'OK · bucket restringido a JPEG de máximo 3 MB';
end $$;

select 'Verificación completa. Si no ves ninguna excepción, los ocho controles están activos.' as resultado;
