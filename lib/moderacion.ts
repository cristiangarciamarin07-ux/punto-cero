// ============================================================================
// Capa de datos del panel de moderación
// ----------------------------------------------------------------------------
// Autenticación por código de un solo uso (Supabase Auth) y autorización por
// la tabla `moderadores`. Estar autenticado no da acceso a nada: si el correo
// no está en la lista, `mi_perfil_moderador()` devuelve vacío y el panel no
// pinta ni una fila.
// ============================================================================

import { supabase, MODO_DEMO } from './supabaseClient';
import { TipoAyuda } from './tipos';

export type RolModerador = 'REVISOR' | 'COORDINADOR';

export type AccionModeracion =
  | 'RESTAURAR'
  | 'OCULTAR'
  | 'SUPRIMIR'
  | 'VERIFICAR'
  | 'QUITAR_VERIFICACION'
  | 'DESCARTAR_REPORTES';

export interface PerfilModerador {
  correo: string;
  alias: string;
  organizacion: string | null;
  rol: RolModerador;
}

export interface PuntoEnCola {
  id: string;
  folio: string;
  alias_referencia: string;
  departamento: string;
  municipio: string;
  direccion_referencia: string;
  tipo_ayuda: TipoAyuda;
  descripcion: string;
  personas_afectadas: number;
  imagen_ruta: string | null;
  estado: string;
  moderacion: 'VISIBLE' | 'EN_REVISION' | 'OCULTA';
  verificada: boolean;
  tiene_telefono: boolean;
  reportes_recibidos: number;
  creado_en: string;
  motivos: string[] | null;
  detalles: string[] | null;
  ultimo_reporte: string | null;
  pendientes: number;
}

export interface EntradaBitacora {
  id: number;
  folio: string;
  moderador: string;
  accion: AccionModeracion;
  motivo: string;
  ocurrido_en: string;
}

export interface MiembroEquipo {
  correo: string;
  alias: string;
  organizacion: string | null;
  rol: RolModerador;
  activo: boolean;
  creado_en: string;
  ultimo_acceso: string | null;
}

export interface ResumenModeracion {
  en_revision: number;
  reportados_visibles: number;
  verificados: number;
  reportes_pendientes: number;
}

export const ACCIONES: Record<AccionModeracion, { etiqueta: string; explicacion: string; tono: 'verde' | 'azul' | 'rojo' }> = {
  VERIFICAR: {
    etiqueta: 'Verificar',
    explicacion: 'Confirmas que el punto es real. Aparece con sello y vuelve al tablero.',
    tono: 'verde',
  },
  RESTAURAR: {
    etiqueta: 'Restaurar',
    explicacion: 'Los reportes no procedían. El punto vuelve al tablero sin sello.',
    tono: 'azul',
  },
  DESCARTAR_REPORTES: {
    etiqueta: 'Descartar reportes',
    explicacion: 'Pone el contador en cero. Útil contra reportes en masa malintencionados.',
    tono: 'azul',
  },
  QUITAR_VERIFICACION: {
    etiqueta: 'Quitar sello',
    explicacion: 'El punto sigue publicado, pero deja de aparecer como verificado.',
    tono: 'azul',
  },
  OCULTAR: {
    etiqueta: 'Ocultar',
    explicacion: 'Sale del tablero. Los datos se conservan por si hay que revisarlo después.',
    tono: 'rojo',
  },
  SUPRIMIR: {
    etiqueta: 'Suprimir datos',
    explicacion: 'Borra contacto, foto, ubicación y texto. Irreversible. Úsala cuando el punto expone datos personales.',
    tono: 'rojo',
  },
};

// ---------------------------------------------------------------------------
// Datos de demostración
// ---------------------------------------------------------------------------

const haceMin = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const demoPerfil: PerfilModerador = {
  correo: 'coordinacion@ejemplo.org',
  alias: 'Coordinación',
  organizacion: 'Organización de ejemplo',
  rol: 'COORDINADOR',
};

let demoCola: PuntoEnCola[] = [
  {
    id: 'mod-1', folio: 'AYU-01043', alias_referencia: 'Casa del señor Pedro Gómez CC 79...',
    departamento: 'Quindío', municipio: 'Calarcá',
    direccion_referencia: 'Calle 40 # 24-18, casa azul, timbre 2',
    tipo_ayuda: 'ALIMENTOS',
    descripcion: 'Necesitamos mercado. Pregunten por Pedro Gómez, cédula 79xxxxxx, teléfono de la vecina 310...',
    personas_afectadas: 3, imagen_ruta: null, estado: 'PENDIENTE',
    moderacion: 'EN_REVISION', verificada: false, tiene_telefono: true,
    reportes_recibidos: 4, creado_en: haceMin(180),
    motivos: ['DATOS_PERSONALES', 'DATOS_PERSONALES', 'OFENSIVO'],
    detalles: ['Aparece el nombre completo y parte de la cédula de una persona.'],
    ultimo_reporte: haceMin(25), pendientes: 4,
  },
  {
    id: 'mod-2', folio: 'AYU-01044', alias_referencia: 'Punto de acopio La Ceiba',
    departamento: 'Risaralda', municipio: 'Dosquebradas',
    direccion_referencia: 'Parqueadero del polideportivo',
    tipo_ayuda: 'ALBERGUE',
    descripcion: 'Recibimos donaciones en efectivo por transferencia para comprar carpas. Escriban al número.',
    personas_afectadas: 30, imagen_ruta: null, estado: 'PENDIENTE',
    moderacion: 'EN_REVISION', verificada: false, tiene_telefono: true,
    reportes_recibidos: 3, creado_en: haceMin(260),
    motivos: ['ESTAFA', 'CONTENIDO_FALSO'],
    detalles: ['Piden plata por transferencia, eso no debería estar aquí.'],
    ultimo_reporte: haceMin(40), pendientes: 3,
  },
  {
    id: 'mod-3', folio: 'AYU-01038', alias_referencia: 'Tienda El Roble',
    departamento: 'Quindío', municipio: 'Armenia',
    direccion_referencia: 'Barrio La Patria, esquina de la calle 26 con carrera 19',
    tipo_ayuda: 'ALIMENTOS',
    descripcion: 'Somos 6 personas, tres son menores. Llevamos dos días sin agua potable ni mercado.',
    personas_afectadas: 6, imagen_ruta: null, estado: 'PENDIENTE',
    moderacion: 'VISIBLE', verificada: false, tiene_telefono: true,
    reportes_recibidos: 1, creado_en: haceMin(22),
    motivos: ['DUPLICADO'], detalles: ['Creo que ya lo reportaron desde la cuadra de al lado.'],
    ultimo_reporte: haceMin(10), pendientes: 1,
  },
];

let demoBitacora: EntradaBitacora[] = [
  {
    id: 2, folio: 'AYU-01037', moderador: 'revisora@ejemplo.org', accion: 'VERIFICAR',
    motivo: 'Confirmado por radio con la JAC del barrio. El punto existe y sigue sin atender.',
    ocurrido_en: haceMin(55),
  },
  {
    id: 1, folio: 'AYU-01035', moderador: 'coordinacion@ejemplo.org', accion: 'SUPRIMIR',
    motivo: 'La descripción incluía el número de cédula y la dirección exacta de una menor de edad.',
    ocurrido_en: haceMin(140),
  },
];

const demoEquipo: MiembroEquipo[] = [
  { correo: 'coordinacion@ejemplo.org', alias: 'Coordinación', organizacion: 'Organización de ejemplo', rol: 'COORDINADOR', activo: true, creado_en: haceMin(4000), ultimo_acceso: haceMin(2) },
  { correo: 'revisora@ejemplo.org', alias: 'Turno tarde', organizacion: 'Defensa Civil seccional', rol: 'REVISOR', activo: true, creado_en: haceMin(3000), ultimo_acceso: haceMin(55) },
];

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

/** Envía el código de un solo uso. `shouldCreateUser: false` impide el autoalta. */
export async function pedirCodigo(correo: string): Promise<void> {
  if (MODO_DEMO || !supabase) return;
  const { error } = await supabase.auth.signInWithOtp({
    email: correo.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(traducir(error.message));
}

export async function validarCodigo(correo: string, codigo: string): Promise<void> {
  if (MODO_DEMO || !supabase) return;
  const { error } = await supabase.auth.verifyOtp({
    email: correo.trim().toLowerCase(),
    token: codigo.trim(),
    type: 'email',
  });
  if (error) throw new Error(traducir(error.message));
}

export async function cerrarSesion(): Promise<void> {
  if (MODO_DEMO || !supabase) return;
  await supabase.auth.signOut();
}

/** Devuelve null si no hay sesión, o si la hay pero el correo no está autorizado. */
export async function miPerfil(): Promise<PerfilModerador | null> {
  if (MODO_DEMO || !supabase) return demoPerfil;

  const { data: sesion } = await supabase.auth.getSession();
  if (!sesion.session) return null;

  const { data, error } = await supabase.rpc('mi_perfil_moderador');
  if (error) throw new Error(traducir(error.message));
  const fila = Array.isArray(data) ? data[0] : data;
  return fila ?? null;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listarCola(): Promise<PuntoEnCola[]> {
  if (MODO_DEMO || !supabase) return [...demoCola].sort(porPrioridad);

  const { data, error } = await supabase
    .from('cola_moderacion')
    .select('*')
    .order('ultimo_reporte', { ascending: false })
    .limit(200);

  if (error) throw new Error(traducir(error.message));
  return (data as PuntoEnCola[]).sort(porPrioridad);
}

export async function listarBitacora(limite = 50): Promise<EntradaBitacora[]> {
  if (MODO_DEMO || !supabase) return demoBitacora;
  const { data, error } = await supabase
    .from('bitacora_moderacion').select('*').limit(limite);
  if (error) throw new Error(traducir(error.message));
  return data as EntradaBitacora[];
}

export async function listarEquipo(): Promise<MiembroEquipo[]> {
  if (MODO_DEMO || !supabase) return demoEquipo;
  const { data, error } = await supabase
    .from('equipo_moderacion').select('*').order('creado_en', { ascending: true });
  if (error) throw new Error(traducir(error.message));
  return data as MiembroEquipo[];
}

export async function obtenerResumen(): Promise<ResumenModeracion> {
  if (MODO_DEMO || !supabase) {
    return {
      en_revision: demoCola.filter((p) => p.moderacion === 'EN_REVISION').length,
      reportados_visibles: demoCola.filter((p) => p.moderacion === 'VISIBLE' && p.reportes_recibidos > 0).length,
      verificados: 1,
      reportes_pendientes: demoCola.reduce((n, p) => n + p.pendientes, 0),
    };
  }
  const { data, error } = await supabase.from('resumen_moderacion').select('*').single();
  if (error) throw new Error(traducir(error.message));
  return data as ResumenModeracion;
}

export async function verContacto(solicitudId: string): Promise<string | null> {
  if (MODO_DEMO || !supabase) return '310 456 7890';
  const { data, error } = await supabase.rpc('contacto_para_moderacion', {
    p_solicitud_id: solicitudId,
  });
  if (error) throw new Error(traducir(error.message));
  return (data as string) ?? null;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export async function moderar(
  solicitudId: string,
  accion: AccionModeracion,
  motivo: string,
): Promise<void> {
  if (motivo.trim().length < 5) {
    throw new Error('Escribe el motivo de la decisión: queda en la bitácora pública del equipo.');
  }

  if (MODO_DEMO || !supabase) {
    const p = demoCola.find((x) => x.id === solicitudId);
    if (!p) return;
    if (accion === 'SUPRIMIR' || accion === 'OCULTAR') {
      demoCola = demoCola.filter((x) => x.id !== solicitudId);
    } else if (accion === 'VERIFICAR') {
      p.verificada = true; p.moderacion = 'VISIBLE'; p.pendientes = 0; p.reportes_recibidos = 0;
    } else if (accion === 'QUITAR_VERIFICACION') {
      p.verificada = false;
    } else {
      p.moderacion = 'VISIBLE'; p.pendientes = 0; p.reportes_recibidos = 0;
      demoCola = demoCola.filter((x) => x.id !== solicitudId);
    }
    demoBitacora = [
      { id: Date.now(), folio: p.folio, moderador: demoPerfil.correo, accion, motivo: motivo.trim(), ocurrido_en: new Date().toISOString() },
      ...demoBitacora,
    ];
    return;
  }

  const { error } = await supabase.rpc('moderar_solicitud', {
    p_solicitud_id: solicitudId,
    p_accion: accion,
    p_motivo: motivo.trim(),
  });
  if (error) throw new Error(traducir(error.message));
}

export async function anadirModerador(
  correo: string, alias: string, rol: RolModerador, organizacion?: string,
): Promise<void> {
  if (MODO_DEMO || !supabase) return;
  const { error } = await supabase.rpc('registrar_moderador', {
    p_correo: correo, p_alias: alias, p_rol: rol, p_organizacion: organizacion ?? null,
  });
  if (error) throw new Error(traducir(error.message));
}

export async function retirarModerador(correo: string): Promise<void> {
  if (MODO_DEMO || !supabase) return;
  const { error } = await supabase.rpc('desactivar_moderador', { p_correo: correo });
  if (error) throw new Error(traducir(error.message));
}

// ---------------------------------------------------------------------------

function porPrioridad(a: PuntoEnCola, b: PuntoEnCola) {
  const urgencia = (p: PuntoEnCola) => (p.moderacion === 'EN_REVISION' ? 0 : 1);
  const d = urgencia(a) - urgencia(b);
  if (d !== 0) return d;
  return (b.ultimo_reporte ?? '').localeCompare(a.ultimo_reporte ?? '');
}

function traducir(m: string): string {
  if (m.includes('NO_AUTORIZADO'))
    return 'Tu correo no está autorizado para moderar. Pide a la coordinación que te añada.';
  if (m.includes('MOTIVO_REQUERIDO'))
    return 'Toda acción necesita un motivo escrito de al menos cinco caracteres.';
  if (m.includes('ULTIMO_COORDINADOR'))
    return 'Debe quedar al menos una persona con rol de coordinación.';
  if (m.includes('NO_PUEDES_DESACTIVARTE'))
    return 'No puedes retirarte a ti mismo. Pide a otra persona de coordinación que lo haga.';
  if (m.includes('Signups not allowed') || m.includes('User not found'))
    return 'Ese correo no tiene cuenta. La coordinación debe invitarlo desde Supabase antes de que pueda entrar.';
  if (m.includes('Token has expired') || m.includes('invalid'))
    return 'El código no es válido o ya venció. Pide uno nuevo.';
  if (m.includes('rate limit') || m.includes('Email rate'))
    return 'Demasiados intentos seguidos. Espera un minuto.';
  if (m.toLowerCase().includes('fetch')) return 'Sin conexión con el servidor.';
  return m;
}
