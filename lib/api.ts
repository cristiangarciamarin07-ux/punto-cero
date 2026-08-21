// ============================================================================
// Capa de acceso a datos · v2
// Un solo punto de contacto con Supabase. Sin credenciales responde desde un
// almacén en memoria con datos de muestra (modo demostración).
// ============================================================================

import { supabase, MODO_DEMO } from './supabaseClient';
import { VERSION_POLITICA } from './legal';
import {
  Colaboracion,
  Estadisticas,
  EventoHistorial,
  MotivoReporte,
  NuevaColaboracion,
  NuevaSolicitud,
  ORDEN_ESTADO,
  Solicitud,
} from './tipos';

const COLUMNAS =
  'id,folio,alias_referencia,tiene_telefono,departamento,municipio,' +
  'direccion_referencia,latitud,longitud,tipo_ayuda,descripcion,' +
  'personas_afectadas,estado,imagen_ruta,creado_en,actualizado_en,total_colaboraciones';

const BUCKET = 'evidencias';

// ---------------------------------------------------------------------------
// Datos de demostración
// ---------------------------------------------------------------------------

const haceMin = (m: number) => new Date(Date.now() - m * 60000).toISOString();
let folioDemo = 1042;
let eventoDemo = 100;

const demoSolicitudes: Solicitud[] = [
  {
    id: 'demo-1', folio: 'AYU-01038', alias_referencia: 'Tienda El Roble',
    tiene_telefono: true, departamento: 'Quindío', municipio: 'Armenia',
    direccion_referencia: 'Barrio La Patria, esquina de la calle 26 con carrera 19',
    latitud: 4.5339, longitud: -75.6811, tipo_ayuda: 'ALIMENTOS',
    descripcion: 'Somos 6 personas, tres son menores. Llevamos dos días sin agua potable ni mercado.',
    personas_afectadas: 6, estado: 'PENDIENTE', imagen_ruta: null,
    creado_en: haceMin(22), actualizado_en: haceMin(22), total_colaboraciones: 0,
  },
  {
    id: 'demo-2', folio: 'AYU-01039', alias_referencia: 'Salón comunal Cuba',
    tiene_telefono: true, departamento: 'Risaralda', municipio: 'Pereira',
    direccion_referencia: 'Cancha del barrio Cuba, frente al salón comunal',
    latitud: 4.7935, longitud: -75.7175, tipo_ayuda: 'SALUD',
    descripcion: 'Necesitamos gasas, suero fisiológico y analgésicos para el punto de primeros auxilios.',
    personas_afectadas: 40, estado: 'EN_PROCESO', imagen_ruta: null,
    creado_en: haceMin(95), actualizado_en: haceMin(30), total_colaboraciones: 1,
  },
  {
    id: 'demo-3', folio: 'AYU-01040', alias_referencia: 'Casa 2 vía Villamaría',
    tiene_telefono: false, departamento: 'Caldas', municipio: 'Manizales',
    direccion_referencia: 'Vía a Villamaría, kilómetro 3, casa de tapia con techo caído',
    latitud: 5.0448, longitud: -75.5085, tipo_ayuda: 'HERRAMIENTAS',
    descripcion: 'Se cayó el muro trasero. Hacen falta palas, carretilla y alguien que sepa apuntalar.',
    personas_afectadas: 4, estado: 'PENDIENTE', imagen_ruta: null,
    creado_en: haceMin(160), actualizado_en: haceMin(160), total_colaboraciones: 0,
  },
  {
    id: 'demo-4', folio: 'AYU-01041', alias_referencia: 'Escuela Alto Nápoles',
    tiene_telefono: true, departamento: 'Valle del Cauca', municipio: 'Cali',
    direccion_referencia: 'Comuna 18, sector Alto Nápoles, subiendo por la escuela',
    latitud: 3.3855, longitud: -76.5580, tipo_ayuda: 'ALBERGUE',
    descripcion: 'Cuatro familias durmiendo a la intemperie. Faltan carpas y cobijas para los niños.',
    personas_afectadas: 17, estado: 'RESUELTO', imagen_ruta: null,
    creado_en: haceMin(320), actualizado_en: haceMin(75), total_colaboraciones: 2,
  },
];

const demoColaboraciones: Colaboracion[] = [
  {
    id: 'col-1', solicitud_id: 'demo-2', alias_colaborador: 'Brigada Andes',
    organizacion: 'Cruz Roja Risaralda',
    apoyo_brindado: 'Salimos con un kit de curaciones y dos camillas. Llegamos en una hora.',
    estado_resultante: 'EN_PROCESO', creado_en: haceMin(30),
  },
  {
    id: 'col-2', solicitud_id: 'demo-4', alias_colaborador: 'Vecina de la 18',
    organizacion: null, apoyo_brindado: 'Llevé 8 cobijas y 4 colchonetas.',
    estado_resultante: 'EN_PROCESO', creado_en: haceMin(140),
  },
  {
    id: 'col-3', solicitud_id: 'demo-4', alias_colaborador: 'JAC Comuna 18',
    organizacion: 'Junta de Acción Comunal',
    apoyo_brindado: 'Entregadas 4 carpas familiares. Las familias ya están bajo techo.',
    estado_resultante: 'RESUELTO', creado_en: haceMin(75),
  },
];

const demoHistorial: EventoHistorial[] = [
  { id: 4, folio: 'AYU-01041', alias: 'Escuela Alto Nápoles', municipio: 'Cali', departamento: 'Valle del Cauca', tipo_ayuda: 'ALBERGUE', evento: 'APOYO_ENTREGADO', detalle: 'JAC Comuna 18: Entregadas 4 carpas familiares.', ocurrido_en: haceMin(75) },
  { id: 3, folio: 'AYU-01039', alias: 'Salón comunal Cuba', municipio: 'Pereira', departamento: 'Risaralda', tipo_ayuda: 'SALUD', evento: 'APOYO_COMPROMETIDO', detalle: 'Brigada Andes: kit de curaciones y dos camillas.', ocurrido_en: haceMin(30) },
  { id: 2, folio: 'AYU-01040', alias: 'Casa 2 vía Villamaría', municipio: 'Manizales', departamento: 'Caldas', tipo_ayuda: 'HERRAMIENTAS', evento: 'REGISTRADA', detalle: 'Necesidad registrada para 4 persona(s)', ocurrido_en: haceMin(160) },
  { id: 1, folio: 'AYU-01038', alias: 'Tienda El Roble', municipio: 'Armenia', departamento: 'Quindío', tipo_ayuda: 'ALIMENTOS', evento: 'REGISTRADA', detalle: 'Necesidad registrada para 6 persona(s)', ocurrido_en: haceMin(22) },
];

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listarSolicitudes(): Promise<Solicitud[]> {
  if (MODO_DEMO || !supabase) return [...demoSolicitudes].sort(porUrgencia);

  const { data, error } = await supabase
    .from('solicitudes_publicas')
    .select(COLUMNAS)
    .order('creado_en', { ascending: false })
    .limit(500);

  if (error) throw new Error(traducir(error.message));
  return (data as unknown as Solicitud[]).sort(porUrgencia);
}

export async function listarColaboraciones(solicitudId: string): Promise<Colaboracion[]> {
  if (MODO_DEMO || !supabase) {
    return demoColaboraciones
      .filter((c) => c.solicitud_id === solicitudId)
      .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  }

  const { data, error } = await supabase
    .from('colaboraciones_publicas')
    .select('*')
    .eq('solicitud_id', solicitudId)
    .order('creado_en', { ascending: true });

  if (error) throw new Error(traducir(error.message));
  return data as Colaboracion[];
}

export async function listarHistorial(limite = 60): Promise<EventoHistorial[]> {
  if (MODO_DEMO || !supabase) return demoHistorial.slice(0, limite);

  const { data, error } = await supabase
    .from('historial_publico')
    .select('*')
    .order('ocurrido_en', { ascending: false })
    .limit(limite);

  if (error) throw new Error(traducir(error.message));
  return data as EventoHistorial[];
}

/** Revela el teléfono cifrado. Cada consulta queda auditada en el servidor. */
export async function revelarTelefono(solicitudId: string): Promise<string | null> {
  if (MODO_DEMO || !supabase) {
    const mapa: Record<string, string> = {
      'demo-1': '310 456 7890', 'demo-2': '315 998 8776', 'demo-4': '320 445 5667',
    };
    return mapa[solicitudId] ?? null;
  }

  const { data, error } = await supabase.rpc('obtener_contacto', {
    p_solicitud_id: solicitudId,
  });
  if (error) throw new Error(traducir(error.message));
  return (data as string) ?? null;
}

export function urlImagen(ruta: string | null): string | null {
  if (!ruta) return null;
  if (MODO_DEMO || !supabase) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/** Sube la imagen ya saneada por lib/imagen.ts. Devuelve la ruta guardada. */
export async function subirEvidencia(archivo: File): Promise<string> {
  if (MODO_DEMO || !supabase) return `solicitudes/${archivo.name}`;

  const ruta = `solicitudes/${archivo.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error('No pudimos subir la foto. ' + traducir(error.message));
  return ruta;
}

export async function crearSolicitud(
  e: NuevaSolicitud,
): Promise<{ id: string; folio: string; clave_gestion: string }> {
  if (!e.consentimiento) throw new Error('Falta autorizar el tratamiento de los datos.');

  if (MODO_DEMO || !supabase) {
    const folio = `AYU-${String(++folioDemo).padStart(5, '0')}`;
    const ahora = new Date().toISOString();
    const nueva: Solicitud = {
      id: `demo-${crypto.randomUUID()}`, folio,
      alias_referencia: e.alias, tiene_telefono: !!e.telefono,
      departamento: e.departamento, municipio: e.municipio,
      direccion_referencia: e.direccion_referencia,
      latitud: e.latitud, longitud: e.longitud, tipo_ayuda: e.tipo_ayuda,
      descripcion: e.descripcion, personas_afectadas: e.personas_afectadas,
      estado: 'PENDIENTE', imagen_ruta: e.imagen_ruta,
      creado_en: ahora, actualizado_en: ahora, total_colaboraciones: 0,
    };
    demoSolicitudes.unshift(nueva);
    demoHistorial.unshift({
      id: ++eventoDemo, folio, alias: e.alias, municipio: e.municipio,
      departamento: e.departamento, tipo_ayuda: e.tipo_ayuda, evento: 'REGISTRADA',
      detalle: `Necesidad registrada para ${e.personas_afectadas} persona(s)`,
      ocurrido_en: ahora,
    });
    return { id: nueva.id, folio, clave_gestion: 'H8K2M-4TQ9P' };
  }

  const { data, error } = await supabase.rpc('crear_solicitud', {
    p_alias: e.alias,
    p_departamento: e.departamento,
    p_municipio: e.municipio,
    p_direccion_referencia: e.direccion_referencia,
    p_tipo_ayuda: e.tipo_ayuda,
    p_descripcion: e.descripcion,
    p_consentimiento: true,
    p_politica_version: VERSION_POLITICA,
    p_personas_afectadas: e.personas_afectadas,
    p_telefono: e.telefono,
    p_latitud: e.latitud,
    p_longitud: e.longitud,
    p_imagen_ruta: e.imagen_ruta,
  });

  if (error) throw new Error(traducir(error.message));
  const fila = (Array.isArray(data) ? data[0] : data) ?? {};

  // Se acepta el nombre antiguo por si la base todavía no se ha actualizado.
  // Un comprobante sin clave deja a la persona sin forma de gestionar su punto,
  // así que aquí conviene fallar ruidosamente antes que en silencio.
  const clave = fila.clave_gestion ?? fila.token_gestion;
  if (!clave) {
    throw new Error(
      'El servidor no devolvió la clave de gestión. La base de datos está desactualizada: ' +
        'vuelve a ejecutar supabase/schema.sql completo.',
    );
  }
  return { id: fila.id, folio: fila.folio, clave_gestion: String(clave) };
}

export async function registrarColaboracion(e: NuevaColaboracion): Promise<void> {
  if (!e.consentimiento) throw new Error('Falta autorizar el tratamiento de los datos.');

  if (MODO_DEMO || !supabase) {
    const s = demoSolicitudes.find((x) => x.id === e.solicitud_id);
    if (!s) throw new Error('No encontramos ese punto.');
    if (s.estado === 'RESUELTO') throw new Error('Este punto ya fue atendido.');

    demoColaboraciones.push({
      id: crypto.randomUUID(), solicitud_id: e.solicitud_id,
      alias_colaborador: e.alias, organizacion: e.organizacion?.trim() || null,
      apoyo_brindado: e.apoyo, estado_resultante: e.estado,
      creado_en: new Date().toISOString(),
    });
    if (ORDEN_ESTADO[e.estado] > ORDEN_ESTADO[s.estado]) s.estado = e.estado;
    s.total_colaboraciones += 1;
    s.actualizado_en = new Date().toISOString();

    demoHistorial.unshift({
      id: ++eventoDemo, folio: s.folio, alias: s.alias_referencia,
      municipio: s.municipio, departamento: s.departamento, tipo_ayuda: s.tipo_ayuda,
      evento: e.estado === 'RESUELTO' ? 'APOYO_ENTREGADO' : 'APOYO_COMPROMETIDO',
      detalle: `${e.alias}: ${e.apoyo}`, ocurrido_en: new Date().toISOString(),
    });
    return;
  }

  const { error } = await supabase.rpc('registrar_colaboracion', {
    p_solicitud_id: e.solicitud_id,
    p_alias: e.alias,
    p_apoyo: e.apoyo,
    p_consentimiento: true,
    p_politica_version: VERSION_POLITICA,
    p_estado: e.estado,
    p_organizacion: e.organizacion ?? null,
    p_telefono: e.telefono ?? null,
  });
  if (error) throw new Error(traducir(error.message));
}

export async function reportarContenido(
  solicitudId: string,
  motivo: MotivoReporte,
  detalle?: string,
): Promise<void> {
  if (MODO_DEMO || !supabase) return;

  const { error } = await supabase.rpc('reportar_contenido', {
    p_solicitud_id: solicitudId,
    p_motivo: motivo,
    p_detalle: detalle ?? null,
  });
  if (error) throw new Error(traducir(error.message));
}

export async function cerrarSolicitud(folio: string, clave: string): Promise<boolean> {
  if (MODO_DEMO || !supabase) return true;
  const { data, error } = await supabase.rpc('cerrar_solicitud', {
    p_folio: folio, p_clave: clave,
  });
  if (error) throw new Error(traducir(error.message));
  return data as boolean;
}

/** Derecho de supresión y revocación (Ley 1581, art. 8). */
export async function revocarConsentimiento(folio: string, clave: string): Promise<boolean> {
  if (MODO_DEMO || !supabase) return true;
  const { data, error } = await supabase.rpc('revocar_consentimiento', {
    p_folio: folio, p_clave: clave,
  });
  if (error) throw new Error(traducir(error.message));
  return data as boolean;
}

// ---------------------------------------------------------------------------
// Tiempo real
// ---------------------------------------------------------------------------

export function escucharCambios(alCambiar: () => void): () => void {
  if (MODO_DEMO || !supabase) return () => {};

  const cliente = supabase;
  const canal = cliente
    .channel('puntos-de-apoyo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_ayuda' }, alCambiar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'historial_eventos' }, alCambiar)
    .subscribe();

  return () => {
    cliente.removeChannel(canal);
  };
}

// ---------------------------------------------------------------------------
// Apoyo
// ---------------------------------------------------------------------------

function porUrgencia(a: Solicitud, b: Solicitud) {
  const d = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado];
  return d !== 0 ? d : b.creado_en.localeCompare(a.creado_en);
}

export function calcularEstadisticas(lista: Solicitud[]): Estadisticas {
  return {
    pendientes: lista.filter((s) => s.estado === 'PENDIENTE').length,
    en_proceso: lista.filter((s) => s.estado === 'EN_PROCESO').length,
    resueltas: lista.filter((s) => s.estado === 'RESUELTO').length,
    total: lista.length,
    personas_por_atender: lista
      .filter((s) => s.estado !== 'RESUELTO')
      .reduce((n, s) => n + s.personas_afectadas, 0),
  };
}

function traducir(m: string): string {
  if (m.includes('CONSENTIMIENTO_REQUERIDO'))
    return 'Debes autorizar el tratamiento de los datos para continuar.';
  if (m.includes('POLITICA_DESACTUALIZADA'))
    return 'El aviso de privacidad cambió. Recarga la página y vuelve a enviarlo.';
  if (m.includes('LIMITE_SOLICITUDES'))
    return 'Hay demasiados registros seguidos en este municipio. Espera un momento.';
  if (m.includes('SOLICITUD_YA_RESUELTA')) return 'Este punto ya fue atendido.';
  if (m.includes('SOLICITUD_EN_REVISION'))
    return 'Este punto está retirado temporalmente mientras se revisa un reporte.';
  if (m.includes('SOLICITUD_NO_ENCONTRADA')) return 'No encontramos ese punto.';
  if (m.includes('DEMASIADOS_INTENTOS'))
    return 'Demasiados intentos fallidos con este folio. Espera quince minutos.';
  if (m.includes('TELEFONO_INVALIDO')) return 'Revisa el número: entre 7 y 10 dígitos.';
  if (m.includes('CLAVE_NO_CONFIGURADA'))
    return 'El servidor no tiene configurada la llave de cifrado. Avisa al administrador.';
  if (m.includes('alias_referencia'))
    return 'La referencia del lugar no puede contener documentos ni correos.';
  if (m.toLowerCase().includes('fetch')) return 'Sin conexión con el servidor.';
  return m;
}
