'use client';

// ============================================================================
// PUNTO CERO v2 · PANEL DE MODERACIÓN — ARCHIVO ÚNICO
// ----------------------------------------------------------------------------
// Va en components/PanelModeracion.tsx y se monta desde app/moderacion/page.tsx.
//
// Se mantiene separado de la plataforma pública a propósito: si se fusionara
// con ella, el código de moderación se descargaría en el navegador de cada
// visitante, incluidos los nombres de las acciones y la forma de las consultas.
// No es un agujero de seguridad —el servidor sigue exigiendo autorización—
// pero no hay ninguna razón para regalar ese mapa.
//
// Requiere haber ejecutado supabase/schema.sql y supabase/moderacion.sql.
// Dependencias externas: react, @supabase/supabase-js.
// ============================================================================

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';


// ==========================================================================
// 1 · TIPOS Y CATÁLOGOS   (era lib/tipos.ts)
// ==========================================================================

// ============================================================================
// Tipos y catálogos compartidos · v2 (modelo anónimo)
// ============================================================================

export type EstadoSolicitud = 'PENDIENTE' | 'EN_PROCESO' | 'RESUELTO';

export type TipoAyuda = 'ALIMENTOS' | 'SALUD' | 'ALBERGUE' | 'RESCATE' | 'HERRAMIENTAS';

export type MotivoReporte =
  | 'DATOS_PERSONALES'
  | 'CONTENIDO_FALSO'
  | 'DUPLICADO'
  | 'OFENSIVO'
  | 'ESTAFA'
  | 'OTRO';

export type TipoEvento =
  | 'REGISTRADA'
  | 'APOYO_COMPROMETIDO'
  | 'APOYO_ENTREGADO'
  | 'RESUELTA'
  | 'EN_REVISION'
  | 'SUPRIMIDA';

/** Nunca incluye nombre, documento ni teléfono en claro. */
export interface Solicitud {
  id: string;
  folio: string;
  alias_referencia: string;
  tiene_telefono: boolean;
  departamento: string;
  municipio: string;
  direccion_referencia: string;
  latitud: number | null;
  longitud: number | null;
  tipo_ayuda: TipoAyuda;
  descripcion: string;
  personas_afectadas: number;
  estado: EstadoSolicitud;
  imagen_ruta: string | null;
  creado_en: string;
  actualizado_en: string;
  total_colaboraciones: number;
}

export interface Colaboracion {
  id: string;
  solicitud_id: string;
  alias_colaborador: string;
  organizacion: string | null;
  apoyo_brindado: string;
  estado_resultante: EstadoSolicitud;
  creado_en: string;
}

export interface EventoHistorial {
  id: number;
  folio: string;
  alias: string;
  municipio: string;
  departamento: string;
  tipo_ayuda: TipoAyuda;
  evento: TipoEvento;
  detalle: string | null;
  ocurrido_en: string;
}

export interface Estadisticas {
  pendientes: number;
  en_proceso: number;
  resueltas: number;
  total: number;
  personas_por_atender: number;
}

export interface NuevaSolicitud {
  alias: string;
  departamento: string;
  municipio: string;
  direccion_referencia: string;
  tipo_ayuda: TipoAyuda;
  descripcion: string;
  personas_afectadas: number;
  telefono: string | null;
  latitud: number | null;
  longitud: number | null;
  imagen_ruta: string | null;
  consentimiento: boolean;
}

export interface NuevaColaboracion {
  solicitud_id: string;
  alias: string;
  apoyo: string;
  estado: Exclude<EstadoSolicitud, 'PENDIENTE'>;
  organizacion?: string;
  telefono?: string;
  consentimiento: boolean;
}

// ---------------------------------------------------------------------------
// Estados.
// La paleta de marca es blanco / rojo / azul. Para el estado RESUELTO se usa
// un verde sobrio: en rojo o azul se leería como un tercer nivel de urgencia,
// y el cierre de un punto tiene que distinguirse de un vistazo. Además del
// color, cada estado lleva etiqueta escrita y un patrón distinto en la franja,
// para que se entienda sin depender de la visión cromática.
// ---------------------------------------------------------------------------

export const ESTADOS: Record<
  EstadoSolicitud,
  { etiqueta: string; hex: string; clase: string; punto: string }
> = {
  PENDIENTE: {
    etiqueta: 'Sin atender',
    hex: '#D0202F',
    clase: 'bg-rojo/10 text-rojo-oscuro border-rojo/35',
    punto: 'bg-rojo',
  },
  EN_PROCESO: {
    etiqueta: 'En camino',
    hex: '#0B3C7A',
    clase: 'bg-azul/10 text-azul border-azul/35',
    punto: 'bg-azul',
  },
  RESUELTO: {
    etiqueta: 'Resuelto',
    hex: '#147A54',
    clase: 'bg-verde/10 text-verde border-verde/35',
    punto: 'bg-verde',
  },
};

export const ORDEN_ESTADO: Record<EstadoSolicitud, number> = {
  PENDIENTE: 0,
  EN_PROCESO: 1,
  RESUELTO: 2,
};

export const TIPOS_AYUDA: Record<
  TipoAyuda,
  { etiqueta: string; glifo: string; ayuda: string }
> = {
  ALIMENTOS: {
    etiqueta: 'Alimentos y agua',
    glifo: '🍲',
    ayuda: 'Mercados, agua potable, comida preparada',
  },
  SALUD: {
    etiqueta: 'Salud y medicinas',
    glifo: '✚',
    ayuda: 'Medicamentos, curaciones, atención médica',
  },
  ALBERGUE: {
    etiqueta: 'Albergue y abrigo',
    glifo: '⌂',
    ayuda: 'Carpas, colchonetas, cobijas, techo temporal',
  },
  RESCATE: {
    etiqueta: 'Rescate y mascotas',
    glifo: '⚑',
    ayuda: 'Personas atrapadas, animales, evacuación',
  },
  HERRAMIENTAS: {
    etiqueta: 'Herramientas y remoción',
    glifo: '⚒',
    ayuda: 'Palas, picas, escombros, apuntalamiento',
  },
};

export const MOTIVOS_REPORTE: Record<MotivoReporte, string> = {
  DATOS_PERSONALES: 'Expone datos personales (nombre, cédula, dirección exacta)',
  CONTENIDO_FALSO: 'La información parece falsa o no corresponde',
  DUPLICADO: 'Ya existe otro punto igual',
  OFENSIVO: 'Contenido ofensivo o inapropiado',
  ESTAFA: 'Parece un intento de estafa',
  OTRO: 'Otro motivo',
};

export const EVENTOS: Record<TipoEvento, { etiqueta: string; color: string }> = {
  REGISTRADA: { etiqueta: 'Necesidad registrada', color: 'bg-rojo' },
  APOYO_COMPROMETIDO: { etiqueta: 'Apoyo comprometido', color: 'bg-azul' },
  APOYO_ENTREGADO: { etiqueta: 'Apoyo entregado', color: 'bg-verde' },
  RESUELTA: { etiqueta: 'Punto cerrado', color: 'bg-verde' },
  EN_REVISION: { etiqueta: 'Retirada para revisión', color: 'bg-gris' },
  SUPRIMIDA: { etiqueta: 'Datos suprimidos', color: 'bg-gris' },
};

export const LISTA_TIPOS = Object.keys(TIPOS_AYUDA) as TipoAyuda[];
export const LISTA_ESTADOS = Object.keys(ESTADOS) as EstadoSolicitud[];
export const LISTA_MOTIVOS = Object.keys(MOTIVOS_REPORTE) as MotivoReporte[];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function tiempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

export function telefonoValido(valor: string): boolean {
  const limpio = valor.replace(/[\s()-]/g, '');
  return /^(\+?57)?[0-9]{7,10}$/.test(limpio);
}

/**
 * El alias es la única identificación del punto y no debe contener datos
 * personales. Se rechaza lo que la base también rechaza, para dar el aviso
 * antes de enviar y no después.
 */
export function revisarAlias(valor: string): string | null {
  const v = valor.trim();
  if (v.length < 3) return 'Escribe una referencia del lugar, por ejemplo «Tienda El Roble».';
  if (v.length > 80) return 'Demasiado largo: usa una referencia corta.';
  if (/[0-9]{6,}/.test(v)) return 'No incluyas números de cédula ni documentos.';
  if (v.includes('@')) return 'No incluyas correos electrónicos.';
  if (/(c\.?c\.?|cedula|cédula|nit)\s*[0-9]/i.test(v)) return 'No incluyas números de documento.';
  return null;
}


// ==========================================================================
// 2 · CLIENTE DE SUPABASE   (era lib/supabaseClient.ts)
// ==========================================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Si no hay credenciales configuradas la app arranca igual, en modo demo,
 * con datos en memoria. Así el equipo de terreno puede ver y probar la
 * interfaz antes de que exista el proyecto de Supabase.
 */
export const MODO_DEMO = !url || !anonKey;

export const supabase: SupabaseClient | null = MODO_DEMO
  ? null
  : createClient(url!, anonKey!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 4 } },
    });


// ==========================================================================
// 3 · CAPA DE DATOS DE MODERACIÓN   (era lib/moderacion.ts)
// ==========================================================================

// ============================================================================
// Capa de datos del panel de moderación
// ----------------------------------------------------------------------------
// Autenticación por código de un solo uso (Supabase Auth) y autorización por
// la tabla `moderadores`. Estar autenticado no da acceso a nada: si el correo
// no está en la lista, `mi_perfil_moderador()` devuelve vacío y el panel no
// pinta ni una fila.
// ============================================================================


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


// ==========================================================================
// 4 · INTERFAZ DEL PANEL   (era components/PanelModeracion.tsx)
// ==========================================================================

// ============================================================================
// Panel de moderación
// ----------------------------------------------------------------------------
// Tres decisiones que condicionan toda la pantalla:
//
//   1. Ninguna acción se ejecuta sin motivo escrito. No es burocracia: la
//      persona que revisa a las 3 de la mañana no es la misma que responde
//      una semana después por qué se borró un punto.
//   2. La acción destacada es VERIFICAR, no OCULTAR. Un panel que solo sirve
//      para borrar entrena al equipo a borrar.
//   3. Las acciones irreversibles piden confirmación aparte y van en rojo,
//      separadas del resto.
// ============================================================================


type Seccion = 'cola' | 'bitacora' | 'equipo';

export default function PanelModeracion() {
  const [perfil, setPerfil] = useState<PerfilModerador | null>(null);
  const [comprobando, setComprobando] = useState(true);

  useEffect(() => {
    miPerfil()
      .then(setPerfil)
      .catch(() => setPerfil(null))
      .finally(() => setComprobando(false));
  }, []);

  if (comprobando) {
    return (
      <div className="grid min-h-dvh place-items-center bg-nieve">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-gris">
          Verificando acceso…
        </p>
      </div>
    );
  }

  if (!perfil) return <Acceso alEntrar={setPerfil} />;
  return <Escritorio perfil={perfil} alSalir={() => setPerfil(null)} />;
}

// ============================================================================
// Acceso
// ============================================================================

function Acceso({ alEntrar }: { alEntrar: (p: PerfilModerador) => void }) {
  const [fase, setFase] = useState<'correo' | 'codigo'>('correo');
  const [correo, setCorreo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      if (fase === 'correo') {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) {
          throw new Error('Escribe un correo válido.');
        }
        await pedirCodigo(correo);
        setFase('codigo');
      } else {
        await validarCodigo(correo, codigo);
        const p = await miPerfil();
        if (!p) {
          await cerrarSesion();
          throw new Error(
            'Entraste correctamente, pero tu correo no está en la lista de moderación. Pide a la coordinación que te añada.',
          );
        }
        alEntrar(p);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-azul px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5 text-blanco">
          <span aria-hidden className="onda-sismica" />
          <div className="leading-none">
            <p className="font-display text-lg font-extrabold tracking-tight">Punto Cero</p>
            <p className="mt-1 text-[11px] font-medium text-blanco/70">Panel de moderación</p>
          </div>
        </div>

        <form onSubmit={enviar} className="rounded-xl bg-blanco p-6 shadow-xl">
          <h1 className="font-display text-xl font-extrabold text-azul-tinta">
            {fase === 'correo' ? 'Entrar al panel' : 'Escribe el código'}
          </h1>
          <p className="mt-1.5 text-sm leading-snug text-gris">
            {fase === 'correo'
              ? 'Te enviamos un código de un solo uso al correo. No hay contraseñas que recordar ni que se puedan filtrar.'
              : `Revisa la bandeja de ${correo}. El código vence en pocos minutos.`}
          </p>

          {fase === 'correo' ? (
            <label className="mt-5 block">
              <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">
                Correo autorizado
              </span>
              <input
                type="email" value={correo} onChange={(e) => setCorreo(e.target.value)}
                autoComplete="email" autoFocus placeholder="tu@organizacion.org"
                className="w-full rounded-lg border border-borde px-3 py-3 text-[15px] outline-none focus:border-azul focus:ring-2 focus:ring-azul/15"
              />
            </label>
          ) : (
            <label className="mt-5 block">
              <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">
                Código de seis dígitos
              </span>
              <input
                value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000"
                className="w-full rounded-lg border border-borde px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-azul focus:ring-2 focus:ring-azul/15"
              />
            </label>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-rojo/40 bg-rojo/8 px-3 py-2.5 text-sm leading-snug text-rojo-oscuro">
              {error}
            </p>
          )}

          <button type="submit" disabled={ocupado}
            className="mt-5 w-full rounded-lg bg-azul px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta disabled:opacity-60">
            {ocupado ? 'Un momento…' : fase === 'correo' ? 'Enviarme el código' : 'Entrar'}
          </button>

          {fase === 'codigo' && (
            <button type="button" onClick={() => { setFase('correo'); setCodigo(''); setError(null); }}
              className="mt-3 w-full font-display text-xs font-bold uppercase tracking-wider text-gris underline underline-offset-4 hover:text-azul">
              Usar otro correo
            </button>
          )}

          <p className="mt-5 border-t border-borde pt-4 text-[11px] leading-snug text-gris">
            Este panel no crea cuentas. Si tu correo no fue invitado desde Supabase y añadido a la
            lista de moderación, no podrás entrar aunque el código sea correcto.
          </p>
        </form>

        {MODO_DEMO && (
          <p className="mt-4 rounded-lg bg-blanco/10 px-3 py-2 text-center text-xs text-blanco/80">
            Modo demostración: cualquier correo entra como coordinación.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Escritorio
// ============================================================================

function Escritorio({ perfil, alSalir }: { perfil: PerfilModerador; alSalir: () => void }) {
  const [seccion, setSeccion] = useState<Seccion>('cola');
  const [cola, setCola] = useState<PuntoEnCola[]>([]);
  const [bitacora, setBitacora] = useState<EntradaBitacora[]>([]);
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [resumen, setResumen] = useState<ResumenModeracion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esCoordinador = perfil.rol === 'COORDINADOR';

  const cargar = useCallback(async () => {
    try {
      setError(null);
      const [c, b, r] = await Promise.all([listarCola(), listarBitacora(), obtenerResumen()]);
      setCola(c); setBitacora(b); setResumen(r);
      if (esCoordinador) setEquipo(await listarEquipo());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [esCoordinador]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function aplicar(punto: PuntoEnCola, accion: AccionModeracion, motivo: string) {
    await moderar(punto.id, accion, motivo);
    setAviso(`${ACCIONES[accion].etiqueta} aplicado a ${punto.folio}. Queda en la bitácora.`);
    await cargar();
  }

  async function salir() {
    await cerrarSesion();
    alSalir();
  }

  return (
    <div className="min-h-dvh bg-nieve text-azul-tinta">
      <header className="sticky top-0 z-30 bg-azul-tinta text-blanco">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="onda-sismica" />
            <div className="leading-none">
              <p className="font-display text-base font-extrabold tracking-tight">Panel de moderación</p>
              <p className="mt-1 text-[11px] text-blanco/65">
                {perfil.alias} · {esCoordinador ? 'Coordinación' : 'Revisión'}
                {perfil.organizacion ? ` · ${perfil.organizacion}` : ''}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/" className="rounded-md border border-blanco/25 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-blanco/85 transition hover:bg-blanco/10">
              Ver tablero
            </a>
            <button onClick={salir} className="rounded-md bg-blanco/15 px-3 py-2 font-display text-xs font-bold uppercase tracking-wider transition hover:bg-blanco/25">
              Salir
            </button>
          </div>
        </div>
      </header>

      {resumen && (
        <div className="border-b border-borde bg-blanco">
          <dl className="mx-auto grid w-full max-w-5xl grid-cols-4 divide-x divide-borde px-4 sm:px-6">
            {[
              { n: resumen.en_revision, t: 'Retirados', c: 'text-rojo' },
              { n: resumen.reportados_visibles, t: 'Reportados', c: 'text-azul' },
              { n: resumen.reportes_pendientes, t: 'Reportes sin ver', c: 'text-azul-tinta' },
              { n: resumen.verificados, t: 'Verificados', c: 'text-verde' },
            ].map((c) => (
              <div key={c.t} className="px-1 py-2.5 text-center sm:px-3">
                <dd className={`font-display text-xl font-extrabold tabular-nums sm:text-2xl ${c.c}`}>{c.n}</dd>
                <dt className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gris sm:text-[11px]">{c.t}</dt>
              </div>
            ))}
          </dl>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        {MODO_DEMO && (
          <p className="mb-4 rounded-lg border border-dashed border-azul/30 bg-azul-suave px-3 py-2 text-xs">
            <strong className="font-semibold">Modo demostración.</strong> Los cambios no se guardan.
          </p>
        )}

        <div role="tablist" className="mb-4 inline-flex rounded-lg border border-borde bg-blanco p-0.5">
          {([['cola', 'Cola'], ['bitacora', 'Bitácora'], ...(esCoordinador ? [['equipo', 'Equipo']] : [])] as [Seccion, string][]).map(([v, t]) => (
            <button key={v} role="tab" aria-selected={seccion === v} onClick={() => setSeccion(v)}
              className={`rounded-md px-4 py-1.5 font-display text-sm font-bold tracking-wide transition ${seccion === v ? 'bg-azul text-blanco' : 'text-gris hover:text-azul'}`}>
              {t}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-rojo/40 bg-rojo/8 px-3 py-2.5 text-sm text-rojo-oscuro">
            {error} <button onClick={cargar} className="underline underline-offset-2">Reintentar</button>
          </p>
        )}

        {cargando ? (
          <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-borde/60" />)}</div>
        ) : seccion === 'cola' ? (
          <Cola puntos={cola} alAplicar={aplicar} />
        ) : seccion === 'bitacora' ? (
          <Bitacora entradas={bitacora} />
        ) : (
          <Equipo miembros={equipo} yo={perfil.correo} alCambiar={cargar} alAvisar={setAviso} />
        )}
      </main>

      {aviso && (
        <div role="status" className="fixed inset-x-4 bottom-6 z-[1200] rounded-lg bg-verde px-4 py-3 text-sm font-medium text-blanco shadow-xl sm:inset-x-auto sm:right-6 sm:max-w-md">
          {aviso}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Cola de revisión
// ============================================================================

function Cola({ puntos, alAplicar }: { puntos: PuntoEnCola[]; alAplicar: (p: PuntoEnCola, a: AccionModeracion, m: string) => Promise<void> }) {
  if (puntos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-borde bg-blanco px-6 py-14 text-center">
        <p className="font-display text-2xl font-bold text-verde">Cola vacía</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gris">
          Ningún punto reportado ni retirado. Cuando alguien reporte contenido, aparecerá aquí
          ordenado por urgencia.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {puntos.map((p) => <li key={p.id}><TarjetaRevision punto={p} alAplicar={alAplicar} /></li>)}
    </ul>
  );
}

function TarjetaRevision({ punto, alAplicar }: { punto: PuntoEnCola; alAplicar: (p: PuntoEnCola, a: AccionModeracion, m: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('');
  const [pendiente, setPendiente] = useState<AccionModeracion | null>(null);
  const [confirmando, setConfirmando] = useState<AccionModeracion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telefono, setTelefono] = useState<string | null>(null);

  const retirado = punto.moderacion !== 'VISIBLE';
  const conteo: Record<string, number> = {};
  (punto.motivos ?? []).forEach((m) => { conteo[m] = (conteo[m] ?? 0) + 1; });

  async function ejecutar(accion: AccionModeracion) {
    setError(null);
    if (motivo.trim().length < 5) {
      return setError('Escribe el motivo. Queda en la bitácora y es lo que permite revisar la decisión después.');
    }
    const irreversible = accion === 'SUPRIMIR';
    if (irreversible && confirmando !== accion) {
      return setConfirmando(accion);
    }
    setPendiente(accion);
    try {
      await alAplicar(punto, accion, motivo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendiente(null);
      setConfirmando(null);
    }
  }

  const acciones: AccionModeracion[] = retirado
    ? ['VERIFICAR', 'RESTAURAR', 'OCULTAR', 'SUPRIMIR']
    : punto.verificada
      ? ['QUITAR_VERIFICACION', 'DESCARTAR_REPORTES', 'OCULTAR', 'SUPRIMIR']
      : ['VERIFICAR', 'DESCARTAR_REPORTES', 'OCULTAR', 'SUPRIMIR'];

  return (
    <article className={`overflow-hidden rounded-xl border bg-blanco shadow-sm ${retirado ? 'border-rojo/40' : 'border-borde'}`}>
      <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${retirado ? 'bg-rojo/8' : 'bg-azul-suave'}`}>
        <span className="font-mono text-xs tracking-wider text-azul-tinta">{punto.folio}</span>
        <span className={`rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${retirado ? 'bg-rojo text-blanco' : 'bg-azul text-blanco'}`}>
          {retirado ? 'Retirado del tablero' : 'Publicado'}
        </span>
        {punto.verificada && (
          <span className="rounded-full bg-verde px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-blanco">Verificado</span>
        )}
        <span className="ml-auto font-mono text-[11px] text-gris">
          {punto.reportes_recibidos} reporte{punto.reportes_recibidos === 1 ? '' : 's'} · último {punto.ultimo_reporte ? tiempoRelativo(punto.ultimo_reporte) : '—'}
        </span>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-bold leading-tight text-azul-tinta">
            <span aria-hidden className="mr-1.5">{TIPOS_AYUDA[punto.tipo_ayuda].glifo}</span>
            {TIPOS_AYUDA[punto.tipo_ayuda].etiqueta}
          </h3>
          <p className="mt-1 font-display text-sm font-semibold text-azul">{punto.alias_referencia}</p>
          <p className="text-xs text-gris">{punto.municipio}, {punto.departamento} · {punto.personas_afectadas} pers. · {tiempoRelativo(punto.creado_en)}</p>
          <p className="mt-2 rounded-lg bg-nieve p-3 text-sm leading-snug text-azul-tinta">{punto.descripcion}</p>
          <p className="mt-2 text-xs text-gris">{punto.direccion_referencia}</p>

          {punto.tiene_telefono && (
            <p className="mt-2 text-xs">
              {telefono ? (
                <span className="font-mono text-azul-tinta">{telefono}</span>
              ) : (
                <button onClick={() => verContacto(punto.id).then(setTelefono)}
                  className="font-display text-[11px] font-bold uppercase tracking-wider text-azul underline underline-offset-4">
                  Ver contacto (queda auditado)
                </button>
              )}
            </p>
          )}
        </div>

        <div>
          <p className="font-display text-xs font-bold uppercase tracking-wider text-gris">Motivos reportados</p>
          <ul className="mt-2 space-y-1.5">
            {Object.entries(conteo).map(([m, n]) => (
              <li key={m} className="flex items-start gap-2 text-sm leading-snug">
                <span className="mt-0.5 rounded bg-rojo px-1.5 font-mono text-[11px] font-medium text-blanco">{n}</span>
                <span className="text-azul-tinta">{MOTIVOS_REPORTE[m as MotivoReporte] ?? m}</span>
              </li>
            ))}
          </ul>

          {punto.detalles && punto.detalles.length > 0 && (
            <>
              <p className="mt-3 font-display text-xs font-bold uppercase tracking-wider text-gris">Comentarios</p>
              <ul className="mt-1.5 space-y-1.5">
                {punto.detalles.map((d, i) => (
                  <li key={i} className="border-l-2 border-borde pl-2.5 text-sm italic leading-snug text-gris">{d}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-borde bg-nieve p-4">
        <label className="block">
          <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">
            Motivo de la decisión (obligatorio)
          </span>
          <textarea value={motivo} onChange={(e) => { setMotivo(e.target.value.slice(0, 500)); setConfirmando(null); }}
            rows={2} placeholder="Confirmado por radio con la JAC del barrio. El punto existe."
            className="w-full rounded-lg border border-borde bg-blanco px-3 py-2.5 text-sm outline-none focus:border-azul focus:ring-2 focus:ring-azul/15" />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {acciones.map((a) => {
            const meta = ACCIONES[a];
            const esta = confirmando === a;
            const clase = meta.tono === 'verde'
              ? 'bg-verde text-blanco hover:brightness-110'
              : meta.tono === 'rojo'
                ? 'border-2 border-rojo text-rojo hover:bg-rojo hover:text-blanco'
                : 'border border-azul/40 text-azul hover:bg-azul hover:text-blanco';
            return (
              <button key={a} onClick={() => ejecutar(a)} disabled={pendiente !== null} title={meta.explicacion}
                className={`rounded-lg px-3.5 py-2.5 font-display text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 ${esta ? 'bg-rojo text-blanco' : clase}`}>
                {pendiente === a ? 'Aplicando…' : esta ? '¿Seguro? Pulsa otra vez' : meta.etiqueta}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] leading-snug text-gris">
          {confirmando
            ? ACCIONES[confirmando].explicacion
            : 'Pasa el cursor sobre cada botón para ver qué hace. Suprimir borra los datos y no se puede deshacer.'}
        </p>

        {error && <p role="alert" className="mt-2 text-xs font-medium text-rojo">{error}</p>}
      </div>
    </article>
  );
}

// ============================================================================
// Bitácora
// ============================================================================

function Bitacora({ entradas }: { entradas: EntradaBitacora[] }) {
  if (entradas.length === 0) {
    return <Panel>Todavía no se ha tomado ninguna decisión de moderación.</Panel>;
  }
  return (
    <div className="rounded-xl border border-borde bg-blanco p-5">
      <p className="mb-4 text-sm leading-snug text-gris">
        Registro de cada decisión, con quién la tomó y por qué. Nadie puede editarlo ni borrarlo,
        tampoco la coordinación. Es lo que permite responder cuando alguien pregunta por qué
        desapareció su punto.
      </p>
      <ol className="space-y-4 border-l-2 border-borde pl-5">
        {entradas.map((e) => (
          <li key={e.id} className="relative">
            <span aria-hidden className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-blanco ${
              ACCIONES[e.accion]?.tono === 'rojo' ? 'bg-rojo' : ACCIONES[e.accion]?.tono === 'verde' ? 'bg-verde' : 'bg-azul'}`} />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-sm font-bold text-azul-tinta">{ACCIONES[e.accion]?.etiqueta ?? e.accion}</span>
              <span className="font-mono text-[11px] tracking-wider text-gris">{e.folio}</span>
              <span className="ml-auto font-mono text-[11px] text-gris">{tiempoRelativo(e.ocurrido_en)}</span>
            </div>
            <p className="text-xs font-medium text-azul">{e.moderador}</p>
            <p className="mt-0.5 text-sm leading-snug text-azul-tinta/85">{e.motivo}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ============================================================================
// Equipo
// ============================================================================

function Equipo({ miembros, yo, alCambiar, alAvisar }: { miembros: MiembroEquipo[]; yo: string; alCambiar: () => Promise<void>; alAvisar: (m: string) => void }) {
  const [correo, setCorreo] = useState('');
  const [alias, setAlias] = useState('');
  const [organizacion, setOrganizacion] = useState('');
  const [rol, setRol] = useState<RolModerador>('REVISOR');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function anadir(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim())) return setError('Correo no válido.');
    if (alias.trim().length < 2) return setError('Escribe un alias para identificar el turno o la persona.');
    setOcupado(true);
    try {
      await anadirModerador(correo.trim(), alias.trim(), rol, organizacion.trim() || undefined);
      setCorreo(''); setAlias(''); setOrganizacion('');
      alAvisar('Moderador añadido a la lista.');
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function retirar(c: string) {
    setError(null);
    try {
      await retirarModerador(c);
      alAvisar('Acceso retirado.');
      await alCambiar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-borde bg-blanco p-5">
        <h2 className="font-display text-lg font-bold text-azul-tinta">Quién puede moderar</h2>
        <p className="mt-1 text-sm leading-snug text-gris">
          Añadir un correo aquí no crea la cuenta. Antes hay que invitarlo desde Supabase →
          Authentication → Users. Son dos pasos a propósito: así retirar a alguien es inmediato y
          no depende de borrar su cuenta.
        </p>

        <ul className="mt-4 divide-y divide-borde">
          {miembros.map((m) => (
            <li key={m.correo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-azul-tinta">
                  {m.alias}
                  <span className={`ml-2 rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${m.rol === 'COORDINADOR' ? 'bg-azul text-blanco' : 'bg-azul-suave text-azul'}`}>
                    {m.rol === 'COORDINADOR' ? 'Coordinación' : 'Revisión'}
                  </span>
                  {!m.activo && <span className="ml-2 text-xs font-medium text-gris">(retirado)</span>}
                </p>
                <p className="font-mono text-xs text-gris">{m.correo}</p>
                <p className="text-[11px] text-gris">
                  {m.organizacion ? `${m.organizacion} · ` : ''}
                  {m.ultimo_acceso ? `activo ${tiempoRelativo(m.ultimo_acceso)}` : 'nunca ha entrado'}
                </p>
              </div>
              {m.activo && m.correo !== yo && (
                <button onClick={() => retirar(m.correo)}
                  className="font-display text-xs font-bold uppercase tracking-wider text-rojo underline underline-offset-4 hover:text-rojo-oscuro">
                  Retirar acceso
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={anadir} className="rounded-xl border border-borde bg-blanco p-5">
        <h2 className="font-display text-lg font-bold text-azul-tinta">Añadir a alguien</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">Correo</span>
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="persona@organizacion.org"
              className="w-full rounded-lg border border-borde px-3 py-2.5 text-sm outline-none focus:border-azul focus:ring-2 focus:ring-azul/15" />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">Alias</span>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Turno noche"
              className="w-full rounded-lg border border-borde px-3 py-2.5 text-sm outline-none focus:border-azul focus:ring-2 focus:ring-azul/15" />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">Organización</span>
            <input value={organizacion} onChange={(e) => setOrganizacion(e.target.value)} placeholder="Opcional"
              className="w-full rounded-lg border border-borde px-3 py-2.5 text-sm outline-none focus:border-azul focus:ring-2 focus:ring-azul/15" />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">Rol</span>
            <select value={rol} onChange={(e) => setRol(e.target.value as RolModerador)}
              className="w-full rounded-lg border border-borde bg-nieve px-3 py-2.5 text-sm outline-none focus:border-azul focus:ring-2 focus:ring-azul/15">
              <option value="REVISOR">Revisión · atiende la cola</option>
              <option value="COORDINADOR">Coordinación · además administra el equipo</option>
            </select>
          </label>
        </div>

        {error && <p role="alert" className="mt-3 text-sm font-medium text-rojo">{error}</p>}

        <button type="submit" disabled={ocupado}
          className="mt-4 rounded-lg bg-azul px-5 py-3 font-display text-sm font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta disabled:opacity-60">
          {ocupado ? 'Añadiendo…' : 'Añadir a la lista'}
        </button>
      </form>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-borde bg-blanco px-6 py-12 text-center text-sm text-gris">
      {children}
    </div>
  );
}
