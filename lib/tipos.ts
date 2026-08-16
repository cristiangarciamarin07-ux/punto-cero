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
