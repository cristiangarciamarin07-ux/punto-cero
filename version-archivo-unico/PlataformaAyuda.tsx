'use client';

// ============================================================================
// PUNTO CERO v2 · PLATAFORMA PÚBLICA — ARCHIVO ÚNICO
// ----------------------------------------------------------------------------
// Todo el código TypeScript/React de la parte pública vive aquí: tipos,
// catálogos, división político-administrativa, textos legales, saneamiento de
// imágenes, cliente de Supabase, capa de datos, mapa e interfaz.
//
// Esta versión existe para simplificar el arranque. Para un proyecto que vaya
// a mantenerse en el tiempo, la versión en módulos separados es mejor: es más
// fácil de revisar, de probar por partes y de repartir entre varias personas.
//
// SIGUE NECESITANDO, aparte de este archivo:
//   app/layout.tsx        fuentes y metadatos
//   app/globals.css       tokens de color y estilos del mapa
//   app/page.tsx          import PlataformaAyuda from '@/components/PlataformaAyuda'
//   next.config.js        cabeceras de seguridad, CSP, HSTS
//   middleware.ts         redirección a HTTPS
//   supabase/schema.sql   la base de datos
//
// Dependencias externas: react, @supabase/supabase-js, leaflet.
// (react-leaflet NO hace falta en esta versión: el mapa se monta con Leaflet
//  directamente, y así todo cabe en un archivo.)
// ============================================================================

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type * as LeafletTipos from 'leaflet';
import 'leaflet/dist/leaflet.css';


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
// 2 · DEPARTAMENTOS Y MUNICIPIOS   (era lib/colombia.ts)
// ==========================================================================

// ============================================================================
// División político-administrativa de Colombia (DANE)
// ----------------------------------------------------------------------------
// Cobertura ampliada en el cinturón sísmico (Eje Cafetero, Valle, Cauca,
// Nariño, Santanderes, Chocó, Huila, Tolima, Antioquia y Cundinamarca) y
// cabeceras + municipios principales en el resto.
//
// Para cargar los 1.122 municipios oficiales, reemplaza este objeto con el
// dataset abierto de datos.gov.co (recurso "Departamentos y municipios de
// Colombia") manteniendo la misma forma: Record<string, string[]>.
// ============================================================================

export const DEPARTAMENTOS_MUNICIPIOS: Record<string, string[]> = {
  Amazonas: ['Leticia', 'Puerto Nariño'],

  Antioquia: [
    'Medellín', 'Bello', 'Itagüí', 'Envigado', 'Apartadó', 'Turbo', 'Rionegro',
    'Sabaneta', 'Copacabana', 'La Estrella', 'Caldas', 'Girardota', 'Barbosa',
    'Caucasia', 'Necoclí', 'Chigorodó', 'Carepa', 'Marinilla', 'La Ceja',
    'Guarne', 'Santa Fe de Antioquia', 'Puerto Berrío', 'Yarumal', 'Segovia',
    'El Bagre', 'Andes', 'Urrao', 'Amalfi', 'Sonsón', 'San Pedro de los Milagros',
  ],

  Arauca: ['Arauca', 'Arauquita', 'Saravena', 'Tame', 'Fortul', 'Puerto Rondón', 'Cravo Norte'],

  Atlántico: [
    'Barranquilla', 'Soledad', 'Malambo', 'Sabanalarga', 'Puerto Colombia',
    'Galapa', 'Baranoa', 'Palmar de Varela', 'Santo Tomás', 'Sabanagrande',
  ],

  Bolívar: [
    'Cartagena', 'Magangué', 'Turbaco', 'El Carmen de Bolívar', 'Arjona',
    'Mompós', 'San Juan Nepomuceno', 'María la Baja', 'Simití', 'Santa Rosa del Sur',
  ],

  Boyacá: [
    'Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá', 'Paipa', 'Puerto Boyacá',
    'Villa de Leyva', 'Moniquirá', 'Garagoa', 'Nobsa', 'Tibasosa', 'Samacá',
    'Ramiriquí', 'Soatá', 'Guateque',
  ],

  Caldas: [
    'Manizales', 'Villamaría', 'Chinchiná', 'La Dorada', 'Riosucio', 'Anserma',
    'Manzanares', 'Neira', 'Palestina', 'Salamina', 'Supía', 'Aguadas',
    'Pensilvania', 'Viterbo', 'Marmato', 'Aranzazu', 'Filadelfia', 'Belalcázar',
  ],

  Caquetá: ['Florencia', 'San Vicente del Caguán', 'Puerto Rico', 'La Montañita', 'Cartagena del Chairá', 'Belén de los Andaquíes'],

  Casanare: ['Yopal', 'Aguazul', 'Villanueva', 'Tauramena', 'Paz de Ariporo', 'Monterrey', 'Maní'],

  Cauca: [
    'Popayán', 'Santander de Quilichao', 'Puerto Tejada', 'Patía (El Bordo)',
    'Piendamó', 'Miranda', 'Corinto', 'Caloto', 'Cajibío', 'Silvia', 'Timbío',
    'El Tambo', 'Bolívar', 'Guapi', 'Toribío', 'Morales', 'Páez (Belalcázar)',
    'Inzá', 'Suárez', 'Buenos Aires', 'Villa Rica', 'Sotará', 'Totoró',
  ],

  Cesar: ['Valledupar', 'Aguachica', 'Agustín Codazzi', 'Bosconia', 'La Jagua de Ibirico', 'Curumaní', 'El Copey', 'Chimichagua'],

  Chocó: [
    'Quibdó', 'Istmina', 'Riosucio', 'Tadó', 'Condoto', 'Bahía Solano',
    'Nuquí', 'Acandí', 'Unguía', 'El Carmen de Atrato', 'Lloró', 'Bojayá',
    'Alto Baudó (Pie de Pató)', 'Juradó', 'Medio Atrato',
  ],

  Córdoba: ['Montería', 'Lorica', 'Cereté', 'Sahagún', 'Montelíbano', 'Tierralta', 'Planeta Rica', 'Ciénaga de Oro', 'Puerto Libertador'],

  Cundinamarca: [
    'Soacha', 'Zipaquirá', 'Facatativá', 'Chía', 'Mosquera', 'Madrid',
    'Funza', 'Fusagasugá', 'Girardot', 'Cajicá', 'Sibaté', 'Tocancipá',
    'Villeta', 'La Calera', 'Ubaté', 'Cota', 'Tenjo', 'Sopó', 'Gachetá',
    'Pacho', 'La Mesa', 'Anapoima', 'Silvania', 'Tabio', 'Guaduas',
  ],

  'Distrito Capital': ['Bogotá D.C.'],

  Guainía: ['Inírida'],

  Guaviare: ['San José del Guaviare', 'Calamar', 'El Retorno', 'Miraflores'],

  Huila: [
    'Neiva', 'Pitalito', 'Garzón', 'La Plata', 'Campoalegre', 'Gigante',
    'Palermo', 'Timaná', 'Aipe', 'Rivera', 'San Agustín', 'Isnos',
    'Acevedo', 'Suaza', 'Tello', 'Yaguará', 'Villavieja',
  ],

  'La Guajira': ['Riohacha', 'Maicao', 'Uribia', 'Manaure', 'San Juan del Cesar', 'Fonseca', 'Villanueva', 'Albania', 'Dibulla'],

  Magdalena: ['Santa Marta', 'Ciénaga', 'Fundación', 'El Banco', 'Zona Bananera', 'Plato', 'Aracataca', 'Pivijay'],

  Meta: ['Villavicencio', 'Acacías', 'Granada', 'Puerto López', 'San Martín', 'Puerto Gaitán', 'Cumaral', 'Restrepo', 'La Macarena'],

  Nariño: [
    'Pasto', 'Ipiales', 'Tumaco', 'Túquerres', 'La Unión', 'Sandoná',
    'Samaniego', 'La Cruz', 'Barbacoas', 'Buesaco', 'Consacá', 'Yacuanquer',
    'El Charco', 'Ricaurte', 'Cumbal', 'Guachucal', 'Pupiales', 'Ospina',
    'Linares', 'La Florida', 'Nariño', 'Chachagüí',
  ],

  'Norte de Santander': [
    'Cúcuta', 'Ocaña', 'Pamplona', 'Villa del Rosario', 'Los Patios',
    'Tibú', 'El Zulia', 'Chinácota', 'Ábrego', 'Sardinata', 'Convención',
    'Toledo', 'Puerto Santander', 'Cáchira', 'Salazar de las Palmas',
  ],

  Putumayo: ['Mocoa', 'Puerto Asís', 'Orito', 'Valle del Guamuez (La Hormiga)', 'Villagarzón', 'Sibundoy', 'San Miguel'],

  Quindío: [
    'Armenia', 'Calarcá', 'La Tebaida', 'Montenegro', 'Quimbaya', 'Circasia',
    'Filandia', 'Salento', 'Córdoba', 'Pijao', 'Buenavista', 'Génova',
  ],

  Risaralda: [
    'Pereira', 'Dosquebradas', 'Santa Rosa de Cabal', 'La Virginia',
    'Marsella', 'Belén de Umbría', 'Quinchía', 'Apía', 'Santuario',
    'Guática', 'Balboa', 'La Celia', 'Mistrató', 'Pueblo Rico',
  ],

  'San Andrés y Providencia': ['San Andrés', 'Providencia y Santa Catalina'],

  Santander: [
    'Bucaramanga', 'Floridablanca', 'Girón', 'Piedecuesta', 'Barrancabermeja',
    'San Gil', 'Socorro', 'Barbosa', 'Málaga', 'Vélez', 'Puerto Wilches',
    'Sabana de Torres', 'Rionegro', 'Lebrija', 'Zapatoca', 'Charalá',
    'Cimitarra', 'San Vicente de Chucurí', 'Curití', 'Barichara',
  ],

  Sucre: ['Sincelejo', 'Corozal', 'Sampués', 'San Marcos', 'Tolú', 'Since', 'Majagual', 'San Onofre'],

  Tolima: [
    'Ibagué', 'Espinal', 'Melgar', 'Honda', 'Líbano', 'Chaparral',
    'Mariquita', 'Flandes', 'Purificación', 'Fresno', 'Guamo', 'Cajamarca',
    'Lérida', 'Armero-Guayabal', 'Ortega', 'Planadas', 'Rovira', 'Venadillo',
  ],

  'Valle del Cauca': [
    'Cali', 'Buenaventura', 'Palmira', 'Tuluá', 'Buga', 'Cartago',
    'Jamundí', 'Yumbo', 'Candelaria', 'Florida', 'Pradera', 'Zarzal',
    'Roldanillo', 'La Unión', 'Sevilla', 'Caicedonia', 'Dagua', 'Bugalagrande',
    'El Cerrito', 'Ginebra', 'Andalucía', 'Restrepo', 'Yotoco', 'La Cumbre',
    'Vijes', 'Calima (El Darién)', 'Riofrío', 'Trujillo', 'Alcalá', 'Ulloa',
  ],

  Vaupés: ['Mitú', 'Carurú', 'Taraira'],

  Vichada: ['Puerto Carreño', 'La Primavera', 'Santa Rosalía', 'Cumaribo'],
};

export const DEPARTAMENTOS = Object.keys(DEPARTAMENTOS_MUNICIPIOS).sort((a, b) =>
  a.localeCompare(b, 'es'),
);

export function municipiosDe(departamento: string): string[] {
  return [...(DEPARTAMENTOS_MUNICIPIOS[departamento] ?? [])].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
}

// Centro aproximado por departamento: reencuadra el mapa al filtrar.
export const CENTROS_DEPARTAMENTO: Record<string, [number, number]> = {
  Amazonas: [-3.4653, -70.2], Antioquia: [6.2518, -75.5636], Arauca: [7.0847, -70.7591],
  Atlántico: [10.9685, -74.7813], Bolívar: [10.3910, -75.4794], Boyacá: [5.5353, -73.3678],
  Caldas: [5.0703, -75.5138], Caquetá: [1.6144, -75.6062], Casanare: [5.3378, -72.3959],
  Cauca: [2.4448, -76.6147], Cesar: [10.4631, -73.2532], Chocó: [5.6947, -76.6611],
  Córdoba: [8.7479, -75.8814], Cundinamarca: [4.8143, -74.3547], 'Distrito Capital': [4.7110, -74.0721],
  Guainía: [3.8653, -67.9239], Guaviare: [2.5729, -72.6459], Huila: [2.9273, -75.2819],
  'La Guajira': [11.5449, -72.9072], Magdalena: [11.2408, -74.1990], Meta: [4.1420, -73.6266],
  Nariño: [1.2136, -77.2811], 'Norte de Santander': [7.8891, -72.4967], Putumayo: [1.1519, -76.6479],
  Quindío: [4.5339, -75.6811], Risaralda: [4.8133, -75.6961], 'San Andrés y Providencia': [12.5567, -81.7185],
  Santander: [7.1193, -73.1227], Sucre: [9.3047, -75.3978], Tolima: [4.4389, -75.2322],
  'Valle del Cauca': [3.4516, -76.5320], Vaupés: [1.2538, -70.2340], Vichada: [6.1890, -67.4859],
};

// Encuadre por defecto: los Andes centrales colombianos.
export const CENTRO_COLOMBIA: [number, number] = [4.5709, -74.2973];


// ==========================================================================
// 3 · TEXTOS LEGALES   (era lib/legal.ts)
// ==========================================================================

// ============================================================================
// Textos legales · Ley 1581 de 2012 y Decreto 1377 de 2013
// ----------------------------------------------------------------------------
// La versión debe coincidir con la que devuelve version_politica() en la base.
// Si cambias un texto, sube la versión: la base rechaza registros que declaren
// una versión distinta a la vigente, y así el consentimiento guardado siempre
// corresponde al texto que la persona realmente leyó.
//
// ANTES DE PUBLICAR: reemplaza RESPONSABLE y CANAL_ATENCION por los datos
// reales de la organización que despliega la plataforma. Sin un responsable
// identificable no se cumple el artículo 13 del Decreto 1377.
// ============================================================================

export const VERSION_POLITICA = '2026.08-v2';

export const RESPONSABLE = {
  nombre: '[Nombre de la organización responsable]',
  canal: '[correo de contacto para ejercer derechos]',
  ciudad: '[ciudad], Colombia',
};

export const AVISO_CORTO =
  'Al enviar este formulario autorizas de forma expresa que la información se publique y se use únicamente para coordinar la entrega de ayuda tras el sismo.';

export const FINALIDAD_UNICA =
  'Coordinar y hacer seguimiento a la entrega de ayuda humanitaria tras el sismo. Ninguna otra.';

export interface Seccion {
  titulo: string;
  parrafos: string[];
}

export const AVISO_PRIVACIDAD: Seccion[] = [
  {
    titulo: 'Qué datos pedimos y cuáles no',
    parrafos: [
      'Esta plataforma no pide tu nombre, tu cédula ni ningún documento de identidad. El punto se identifica con un alias o una referencia del lugar, como «Tienda El Roble», «Edificio Central» o «Casa 2».',
      'Recogemos: el alias, el departamento y municipio, una referencia de la zona, el tipo de ayuda que necesitas, una descripción escrita por ti, el número de personas afectadas y, si decides darlas, coordenadas aproximadas y una foto.',
      'El teléfono es opcional. Si lo entregas, se guarda cifrado y no aparece en el listado público: solo se muestra a quien pulsa «Mostrar contacto», y cada una de esas consultas queda registrada.',
      'No pedimos ni almacenamos datos sensibles en el sentido del artículo 5 de la Ley 1581: no preguntamos por salud, origen étnico, orientación sexual, afiliación política, religiosa ni sindical. Te pedimos que tampoco los escribas en la descripción.',
    ],
  },
  {
    titulo: 'Para qué se usan',
    parrafos: [
      'Únicamente para coordinar la entrega de ayuda humanitaria tras el sismo y para llevar un historial público que permita verificar qué se pidió y qué se entregó.',
      'No se usan con fines comerciales, publicitarios, políticos ni estadísticos por fuera de la emergencia. No se venden, no se ceden a terceros y no alimentan ningún perfil de usuario.',
    ],
  },
  {
    titulo: 'Qué queda público',
    parrafos: [
      'Son públicos: el alias, el municipio, la referencia de la zona, el tipo de ayuda, la descripción, el número de personas afectadas, la foto si la subiste y la evolución del punto.',
      'No son públicos: el teléfono, la clave de gestión que recibes al registrar, ni ningún identificador que permita rastrearte.',
      'Piénsalo antes de escribir: la descripción y la foto las verá cualquiera. No incluyas nombres de personas, placas, documentos ni la dirección exacta de tu vivienda si eso te expone.',
    ],
  },
  {
    titulo: 'Tus derechos',
    parrafos: [
      'Puedes conocer, actualizar, rectificar y suprimir tu información, y revocar esta autorización en cualquier momento, sin dar explicaciones y sin costo.',
      'Para hacerlo no necesitas cuenta: al registrar recibes un folio y una clave de gestión. Con esos dos datos puedes cerrar tu punto o suprimir su contenido desde la sección «Gestionar mi registro».',
      'Al suprimir se borran el teléfono, las coordenadas, la foto, la dirección y la descripción. Se conserva el folio y la constancia de que hubo una ayuda, sin ningún dato tuyo, para que el historial público siga siendo verificable.',
    ],
  },
  {
    titulo: 'Quién responde',
    parrafos: [
      `Responsable del tratamiento: ${RESPONSABLE.nombre}, ${RESPONSABLE.ciudad}. Canal de atención: ${RESPONSABLE.canal}.`,
      'La veracidad y la calidad de lo que se publica es responsabilidad exclusiva de quien hace el registro. La plataforma es un tablero abierto: no verifica, no valida y no certifica la información que ingresan terceros.',
      'Si crees que un punto expone datos personales o es falso, usa el botón «Reportar» que aparece en cada ficha. Con tres reportes el punto se retira automáticamente de la vista pública hasta que alguien lo revise.',
    ],
  },
];

export const TERMINOS_USO: Seccion[] = [
  {
    titulo: 'Qué es esta plataforma',
    parrafos: [
      'Punto Cero es un tablero público y gratuito donde cualquier persona puede publicar una necesidad y cualquier otra puede responder. Es una herramienta de coordinación ciudadana.',
      'No es un organismo de socorro, no despacha brigadas y no garantiza que alguien vaya a atender un punto. Si hay personas atrapadas o heridas de gravedad, la llamada al 123 va primero, siempre.',
    ],
  },
  {
    titulo: 'Contenido de terceros',
    parrafos: [
      'Todo lo que aparece publicado fue ingresado por usuarios. La plataforma no genera, no revisa previamente y no avala ese contenido.',
      'Quien publica es el único responsable de la veracidad, exactitud y legalidad de lo que escribe o sube, y responde por los daños que se deriven de información falsa o del uso indebido de datos de terceros.',
      'La plataforma y quienes la operan no responden por decisiones tomadas con base en la información publicada, ni por lo que ocurra en los encuentros que se acuerden a través de ella.',
    ],
  },
  {
    titulo: 'Uso aceptable',
    parrafos: [
      'Está prohibido: publicar datos personales de terceros sin su autorización, suplantar a otra persona u organización, usar la plataforma para estafar o pedir dinero, subir contenido ofensivo, y extraer masivamente la información publicada.',
      'La plataforma puede retirar cualquier contenido reportado o que incumpla estas reglas, sin aviso previo.',
    ],
  },
  {
    titulo: 'Verifica antes de encontrarte con alguien',
    parrafos: [
      'Confirma con quién hablas antes de entregar o recibir ayuda. Prefiere lugares visibles y acompañamiento. Desconfía de quien pida dinero, datos bancarios o documentos.',
      'Ninguna persona de esta plataforma te pedirá jamás una contraseña, un código de verificación ni datos de tu tarjeta.',
    ],
  },
  {
    titulo: 'Imágenes',
    parrafos: [
      'Al subir una foto declaras que la tomaste tú o que tienes permiso para publicarla, y que no aparecen en ella personas identificables sin su autorización, menores de edad, documentos ni placas.',
      'Las fotos se reprocesan antes de subirse: se elimina toda la metadata, incluida la ubicación GPS que las cámaras incrustan por defecto.',
    ],
  },
];


// ==========================================================================
// 4 · SANEAMIENTO DE IMÁGENES   (era lib/imagen.ts)
// ==========================================================================

// ============================================================================
// Validación y saneamiento de imágenes en el cliente
// ----------------------------------------------------------------------------
// Tres capas antes de que un archivo llegue al servidor:
//
//   1. Tipo real por número mágico, no por extensión ni por file.type, que el
//      navegador toma del nombre y por tanto puede mentir.
//   2. Tamaño y dimensiones acotados.
//   3. RE-CODIFICACIÓN en canvas. Este es el control que de verdad importa:
//      el archivo que se sube no es el que eligió la persona, sino píxeles
//      redibujados y vueltos a comprimir. Cualquier carga incrustada (un
//      polyglot JPEG/HTML, un PHP camuflado, un payload en un bloque EXIF) se
//      pierde en el proceso. De paso desaparece la geolocalización que las
//      cámaras de celular guardan en la metadata.
//
// SVG se rechaza siempre: es un documento XML que puede ejecutar scripts.
// ============================================================================

export const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
export const LADO_MAXIMO = 1600;          // px
export const CALIDAD = 0.82;

const FIRMAS: { tipo: string; bytes: number[] }[] = [
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

export interface ResultadoImagen {
  archivo: File;
  vistaPrevia: string;
  bytesOriginales: number;
  bytesFinales: number;
}

/** Lee la firma binaria real del archivo. */
async function tipoReal(archivo: File): Promise<string | null> {
  const cabecera = new Uint8Array(await archivo.slice(0, 12).arrayBuffer());
  for (const f of FIRMAS) {
    if (f.bytes.every((b, i) => cabecera[i] === b)) {
      if (f.tipo === 'image/webp') {
        const cola = String.fromCharCode(...cabecera.slice(8, 12));
        return cola === 'WEBP' ? 'image/webp' : null;
      }
      return f.tipo;
    }
  }
  return null;
}

export async function prepararImagen(archivo: File): Promise<ResultadoImagen> {
  if (archivo.size > MAX_BYTES) {
    throw new Error(
      `La foto pesa ${(archivo.size / 1048576).toFixed(1)} MB. El máximo es 3 MB.`,
    );
  }
  if (archivo.size === 0) throw new Error('El archivo está vacío.');

  const tipo = await tipoReal(archivo);
  if (!tipo) {
    throw new Error(
      'Ese archivo no es una imagen válida. Solo se aceptan fotos JPG, PNG o WEBP.',
    );
  }

  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => mal(new Error('No pudimos leer la imagen. Intenta con otra foto.'));
      el.src = url;
    });

    if (img.width < 80 || img.height < 80) {
      throw new Error('La imagen es demasiado pequeña para servir de evidencia.');
    }
    if (img.width * img.height > 50_000_000) {
      throw new Error('La imagen tiene demasiados píxeles. Usa una foto normal de celular.');
    }

    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const ancho = Math.round(img.width * escala);
    const alto = Math.round(img.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Tu navegador no permite procesar la imagen.');

    // Fondo blanco: los PNG con transparencia quedarían negros al pasar a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((ok) =>
      lienzo.toBlob(ok, 'image/jpeg', CALIDAD),
    );
    if (!blob) throw new Error('No pudimos procesar la imagen.');
    if (blob.size > MAX_BYTES) throw new Error('La foto sigue pesando demasiado.');

    const nombre = `${crypto.randomUUID()}.jpg`;
    return {
      archivo: new File([blob], nombre, { type: 'image/jpeg' }),
      vistaPrevia: URL.createObjectURL(blob),
      bytesOriginales: archivo.size,
      bytesFinales: blob.size,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}


// ==========================================================================
// 5 · CLIENTE DE SUPABASE   (era lib/supabaseClient.ts)
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
// 6 · CAPA DE DATOS   (era lib/api.ts)
// ==========================================================================

// ============================================================================
// Capa de acceso a datos · v2
// Un solo punto de contacto con Supabase. Sin credenciales responde desde un
// almacén en memoria con datos de muestra (modo demostración).
// ============================================================================


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
): Promise<{ id: string; folio: string; token_gestion: string }> {
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
    return { id: nueva.id, folio, token_gestion: 'demo-token-0000' };
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
  return Array.isArray(data) ? data[0] : data;
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

export async function cerrarSolicitud(folio: string, token: string): Promise<boolean> {
  if (MODO_DEMO || !supabase) return true;
  const { data, error } = await supabase.rpc('cerrar_solicitud', {
    p_folio: folio, p_token: token,
  });
  if (error) throw new Error(traducir(error.message));
  return data as boolean;
}

/** Derecho de supresión y revocación (Ley 1581, art. 8). */
export async function revocarConsentimiento(folio: string, token: string): Promise<boolean> {
  if (MODO_DEMO || !supabase) return true;
  const { data, error } = await supabase.rpc('revocar_consentimiento', {
    p_folio: folio, p_token: token,
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
  if (m.includes('TELEFONO_INVALIDO')) return 'Revisa el número: entre 7 y 10 dígitos.';
  if (m.includes('CLAVE_NO_CONFIGURADA'))
    return 'El servidor no tiene configurada la llave de cifrado. Avisa al administrador.';
  if (m.includes('alias_referencia'))
    return 'La referencia del lugar no puede contener documentos ni correos.';
  if (m.toLowerCase().includes('fetch')) return 'Sin conexión con el servidor.';
  return m;
}


// ==========================================================================
// 7 · MAPA   (era components/MapaSolicitudes.tsx)
// ==========================================================================

// ----------------------------------------------------------------------------
// Mapa montado con Leaflet directamente, sin react-leaflet.
//
// Por qué así: react-leaflet obliga a que el mapa viva en su propio archivo,
// porque `next/dynamic` con `ssr: false` necesita un módulo aparte que cargar.
// Leaflet toca `window` al importarse, así que no puede evaluarse en el
// servidor. La solución que permite tenerlo todo aquí es cargar la librería
// dentro de un useEffect —que solo corre en el navegador— y manejar el mapa a
// mano. El CSS sí se importa arriba de forma estática: es una hoja de estilos,
// no toca `window` y Next la extrae en tiempo de compilación.
//
// El contenido de los globos se construye con createElement y textContent, no
// con cadenas de HTML. La descripción la escribe un desconocido: si se metiera
// como innerHTML, un `<img src=x onerror=...>` se ejecutaría. Con textContent
// el navegador lo trata como texto, siempre.
// ----------------------------------------------------------------------------

interface PropsMapa {
  solicitudes: Solicitud[];
  centro: [number, number];
  zoom: number;
  alSeleccionar: (s: Solicitud) => void;
}

function MapaSolicitudes({ solicitudes, centro, zoom, alSeleccionar }: PropsMapa) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletTipos.Map | null>(null);
  const capa = useRef<LeafletTipos.LayerGroup | null>(null);
  const leaflet = useRef<typeof LeafletTipos | null>(null);
  const alSeleccionarRef = useRef(alSeleccionar);
  const [listo, setListo] = useState(false);

  // Mantiene fresca la función sin volver a montar el mapa en cada render.
  useEffect(() => {
    alSeleccionarRef.current = alSeleccionar;
  }, [alSeleccionar]);

  // 1 · Montaje: una sola vez, ya en el navegador.
  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelado || !contenedor.current || mapa.current) return;

      leaflet.current = L;
      mapa.current = L.map(contenedor.current, {
        preferCanvas: true,
        scrollWheelZoom: true,
      }).setView(centro, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapa.current);

      capa.current = L.layerGroup().addTo(mapa.current);
      setListo(true);
    })();

    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2 · Reencuadre cuando cambian los filtros.
  useEffect(() => {
    if (!listo || !mapa.current) return;
    mapa.current.flyTo(centro, zoom, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, centro[0], centro[1], zoom]);

  // 3 · Pines: se redibujan cuando cambia la lista.
  useEffect(() => {
    const L = leaflet.current;
    if (!listo || !L || !capa.current) return;

    capa.current.clearLayers();

    solicitudes
      .filter((s) => s.latitud !== null && s.longitud !== null)
      .forEach((s) => {
        const estado = ESTADOS[s.estado];
        const tipo = TIPOS_AYUDA[s.tipo_ayuda];

        // Solo valores propios del catálogo: aquí no entra texto del usuario.
        const icono = L.divIcon({
          className: 'pin-terreno',
          html:
            `<div class="pin-envoltura ${s.estado === 'PENDIENTE' ? 'pin-pulso' : ''}">` +
            `<span class="pin-halo" style="background:${estado.hex}"></span>` +
            `<span class="pin-cuerpo" style="background:${estado.hex}">` +
            `<span class="pin-glifo">${tipo.glifo}</span></span></div>`,
          iconSize: [34, 42],
          iconAnchor: [17, 40],
          popupAnchor: [0, -36],
        });

        const marcador = L.marker([s.latitud as number, s.longitud as number], {
          icon: icono,
          keyboard: true,
          alt: `${tipo.etiqueta} en ${s.municipio}`,
        });

        marcador.bindPopup(construirGlobo(s, () => alSeleccionarRef.current(s)));
        capa.current!.addLayer(marcador);
      });
  }, [listo, solicitudes]);

  const conCoordenadas = useMemo(
    () => solicitudes.filter((s) => s.latitud !== null && s.longitud !== null),
    [solicitudes],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={contenedor} className="h-full w-full" />

      {!listo && (
        <div className="absolute inset-0 grid place-items-center bg-borde/40">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-gris">
            Cargando mapa…
          </p>
        </div>
      )}

      {listo && conCoordenadas.length === 0 && (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-lg border border-borde bg-blanco/95 p-4 text-center shadow-lg">
          <p className="font-display text-sm font-bold text-azul-tinta">
            Ningún punto con coordenadas en este filtro
          </p>
          <p className="mt-1 text-xs text-gris">
            Cambia los filtros o abre la vista de lista: allí aparecen también los puntos
            registrados solo con referencia del sector.
          </p>
        </div>
      )}
    </div>
  );
}

/** Construye el globo con nodos del DOM. Nada de innerHTML con datos ajenos. */
function construirGlobo(s: Solicitud, alAbrir: () => void): HTMLElement {
  const caja = document.createElement('div');
  caja.className = 'w-56 font-body';

  const folio = document.createElement('p');
  folio.className = 'font-mono text-[11px] tracking-wider text-gris';
  folio.textContent = s.folio;

  const titulo = document.createElement('p');
  titulo.className = 'mt-0.5 font-display text-base font-bold leading-tight text-azul-tinta';
  titulo.textContent = TIPOS_AYUDA[s.tipo_ayuda].etiqueta;

  const alias = document.createElement('p');
  alias.className = 'mt-1 text-xs font-medium text-azul';
  alias.textContent = s.alias_referencia;

  const lugar = document.createElement('p');
  lugar.className = 'text-xs text-gris';
  lugar.textContent = `${s.municipio}, ${s.departamento} · ${tiempoRelativo(s.creado_en)}`;

  const desc = document.createElement('p');
  desc.className = 'mt-2 line-clamp-3 text-xs leading-snug text-azul-tinta';
  desc.textContent = s.descripcion;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className =
    'mt-3 w-full rounded-md bg-azul px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta';
  boton.textContent = 'Ver ficha completa';
  boton.addEventListener('click', alAbrir);

  caja.append(folio, titulo, alias, lugar, desc, boton);
  return caja;
}


// ==========================================================================
// 8 · DOCUMENTOS LEGALES EN PANTALLA   (era components/Legales.tsx)
// ==========================================================================

// ============================================================================
// Presentación de los textos legales. El contenido vive en lib/legal.ts para
// que abogados y equipo de comunicaciones lo editen sin tocar componentes.
// ============================================================================


function Documento({ secciones, pie }: { secciones: Seccion[]; pie: string }) {
  return (
    <div className="space-y-6">
      {secciones.map((s) => (
        <section key={s.titulo}>
          <h3 className="font-display text-lg font-bold text-azul">{s.titulo}</h3>
          {s.parrafos.map((p, i) => (
            <p key={i} className="mt-2 text-[15px] leading-relaxed text-azul-tinta/90">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="border-t border-borde pt-4 font-mono text-xs text-gris">{pie}</p>
    </div>
  );
}

export function AvisoPrivacidad() {
  return (
    <Documento
      secciones={AVISO_PRIVACIDAD}
      pie={`Versión ${VERSION_POLITICA} · Ley 1581 de 2012 y Decreto 1377 de 2013 · Responsable: ${RESPONSABLE.nombre}`}
    />
  );
}

export function TerminosUso() {
  return (
    <Documento
      secciones={TERMINOS_USO}
      pie={`Versión ${VERSION_POLITICA} · Al usar la plataforma aceptas estos términos.`}
    />
  );
}

/** Bloque compacto que se muestra dentro de cada formulario. */
export function AvisoEnFormulario({ alVerCompleto }: { alVerCompleto: () => void }) {
  return (
    <div className="rounded-lg border border-azul/20 bg-azul-suave px-4 py-3">
      <p className="font-display text-xs font-bold uppercase tracking-wider text-azul">
        Tratamiento de datos · Ley 1581 de 2012
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-azul-tinta/85">
        No pedimos tu nombre ni tu cédula. Los datos que escribas se usan
        <strong className="font-semibold"> solo para coordinar la entrega de ayuda</strong> y
        se publican en el tablero. El teléfono es opcional, se guarda cifrado y no aparece en
        el listado.
      </p>
      <button
        type="button"
        onClick={alVerCompleto}
        className="mt-2 font-display text-xs font-bold uppercase tracking-wider text-azul underline underline-offset-4 hover:text-rojo"
      >
        Leer el aviso completo
      </button>
    </div>
  );
}


// ==========================================================================
// 9 · INTERFAZ PRINCIPAL   (era components/PlataformaAyuda.tsx)
// ==========================================================================

// ============================================================================
// PUNTO CERO v2 · componente principal
//   Módulo 1  Pedir ayuda (anónimo, con consentimiento expreso y foto opcional)
//   Módulo 2  Consulta: mapa, lista e historial público
//   Módulo 3  Registrar apoyo
//   Módulo 4  Reporte de contenido y gestión del propio registro
// ============================================================================


type Vista = 'lista' | 'mapa' | 'historial';
type Panel = null | 'solicitar' | 'colaborar' | 'reportar' | 'comprobante' | 'privacidad' | 'terminos' | 'gestionar';

interface Filtros {
  departamento: string;
  municipio: string;
  tipo: TipoAyuda | '';
  estado: EstadoSolicitud | '';
  busqueda: string;
}

const SIN_FILTROS: Filtros = { departamento: '', municipio: '', tipo: '', estado: '', busqueda: '' };

// ============================================================================

export default function PlataformaAyuda() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [historial, setHistorial] = useState<EventoHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [vista, setVista] = useState<Vista>('lista');
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [seleccion, setSeleccion] = useState<Solicitud | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [comprobante, setComprobante] = useState<{ folio: string; token: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setErrorCarga(null);
      const [s, h] = await Promise.all([listarSolicitudes(), listarHistorial()]);
      setSolicitudes(s);
      setHistorial(h);
    } catch (e) {
      setErrorCarga((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    return escucharCambios(cargar);
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6500);
    return () => clearTimeout(t);
  }, [aviso]);

  const filtradas = useMemo(() => {
    const q = filtros.busqueda.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (filtros.departamento && s.departamento !== filtros.departamento) return false;
      if (filtros.municipio && s.municipio !== filtros.municipio) return false;
      if (filtros.tipo && s.tipo_ayuda !== filtros.tipo) return false;
      if (filtros.estado && s.estado !== filtros.estado) return false;
      if (q) {
        const heno = `${s.folio} ${s.alias_referencia} ${s.municipio} ${s.departamento} ${s.direccion_referencia} ${s.descripcion}`;
        if (!heno.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [solicitudes, filtros]);

  const estadisticas = useMemo(() => calcularEstadisticas(solicitudes), [solicitudes]);

  const encuadre = useMemo<{ centro: [number, number]; zoom: number }>(() => {
    const geo = filtradas.filter((s) => s.latitud && s.longitud);
    if (geo.length === 1) return { centro: [geo[0].latitud!, geo[0].longitud!], zoom: 15 };
    if (filtros.departamento && CENTROS_DEPARTAMENTO[filtros.departamento])
      return { centro: CENTROS_DEPARTAMENTO[filtros.departamento], zoom: 9 };
    if (geo.length > 1) {
      const lat = geo.reduce((n, s) => n + s.latitud!, 0) / geo.length;
      const lng = geo.reduce((n, s) => n + s.longitud!, 0) / geo.length;
      return { centro: [lat, lng], zoom: 7 };
    }
    return { centro: CENTRO_COLOMBIA, zoom: 6 };
  }, [filtradas, filtros.departamento]);

  const activos = Object.values(filtros).filter((v) => v !== '').length;

  // -- Acciones -------------------------------------------------------------

  async function alEnviarSolicitud(datos: Parameters<typeof crearSolicitud>[0]) {
    const r = await crearSolicitud(datos);
    setComprobante({ folio: r.folio, token: r.token_gestion });
    setPanel('comprobante');
    await cargar();
  }

  async function alRegistrarApoyo(datos: Parameters<typeof registrarColaboracion>[0]) {
    await registrarColaboracion(datos);
    setPanel(null);
    setAviso(
      datos.estado === 'RESUELTO'
        ? 'Apoyo registrado. El punto queda cerrado y visible en el historial.'
        : 'Apoyo registrado. El punto queda reservado para que nadie repita el viaje.',
    );
    const frescas = await listarSolicitudes();
    setSolicitudes(frescas);
    setHistorial(await listarHistorial());
    setSeleccion(frescas.find((s) => s.id === datos.solicitud_id) ?? null);
  }

  async function alReportar(motivo: MotivoReporte, detalle: string) {
    if (!seleccion) return;
    await reportarContenido(seleccion.id, motivo, detalle || undefined);
    setPanel(null);
    setSeleccion(null);
    setAviso('Gracias. El reporte quedó registrado y será revisado.');
    await cargar();
  }

  return (
    <div className="min-h-dvh bg-nieve text-azul-tinta">
      <Encabezado
        alPedirAyuda={() => setPanel('solicitar')}
        alGestionar={() => setPanel('gestionar')}
      />
      <Marquesina datos={estadisticas} />

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6">
        {MODO_DEMO && (
          <p className="mb-4 rounded-lg border border-dashed border-azul/30 bg-azul-suave px-3 py-2 text-xs leading-snug">
            <strong className="font-semibold">Modo demostración.</strong> Los datos viven en
            memoria y se pierden al recargar. Configura{' '}
            <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code> para
            conectar la base real.
          </p>
        )}

        <Pestanas vista={vista} alCambiar={setVista} conteo={filtradas.length} total={solicitudes.length} />

        {vista !== 'historial' && (
          <BarraFiltros filtros={filtros} alCambiar={setFiltros} activos={activos} alLimpiar={() => setFiltros(SIN_FILTROS)} />
        )}

        {errorCarga && (
          <Alerta tono="rojo">
            No pudimos traer los puntos. {errorCarga}{' '}
            <button onClick={cargar} className="underline underline-offset-2">Reintentar</button>
          </Alerta>
        )}

        {cargando ? (
          <Esqueleto />
        ) : vista === 'historial' ? (
          <Historial eventos={historial} />
        ) : vista === 'mapa' ? (
          <div className="h-[62vh] min-h-[380px] overflow-hidden rounded-xl border border-borde shadow-sm sm:h-[68vh]">
            <MapaSolicitudes
              solicitudes={filtradas}
              centro={encuadre.centro}
              zoom={encuadre.zoom}
              alSeleccionar={setSeleccion}
            />
          </div>
        ) : filtradas.length === 0 ? (
          <Vacio hayFiltros={activos > 0} alLimpiar={() => setFiltros(SIN_FILTROS)} alPedirAyuda={() => setPanel('solicitar')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {filtradas.map((s) => (
              <li key={s.id}>
                <Ficha solicitud={s} alAbrir={() => setSeleccion(s)} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-blanco/95 px-4 py-3 backdrop-blur sm:hidden">
        <button
          onClick={() => setPanel('solicitar')}
          className="w-full rounded-lg bg-rojo px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-blanco shadow-sm transition active:scale-[0.99]"
        >
          Necesito ayuda
        </button>
      </div>

      {aviso && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-[1200] rounded-lg bg-verde px-4 py-3 text-sm font-medium text-blanco shadow-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm">
          {aviso}
        </div>
      )}

      <Hoja abierta={!!seleccion && panel === null} titulo={seleccion ? `Ficha ${seleccion.folio}` : ''} alCerrar={() => setSeleccion(null)}>
        {seleccion && (
          <Detalle
            solicitud={seleccion}
            alColaborar={() => setPanel('colaborar')}
            alReportar={() => setPanel('reportar')}
          />
        )}
      </Hoja>

      <Hoja abierta={panel === 'solicitar'} titulo="Pedir ayuda" alCerrar={() => setPanel(null)}>
        <FormularioSolicitud alEnviar={alEnviarSolicitud} alVerPrivacidad={() => setPanel('privacidad')} />
      </Hoja>

      <Hoja abierta={panel === 'colaborar' && !!seleccion} titulo="Registrar mi apoyo" alCerrar={() => setPanel(null)}>
        {seleccion && (
          <FormularioColaboracion solicitud={seleccion} alEnviar={alRegistrarApoyo} alVerPrivacidad={() => setPanel('privacidad')} />
        )}
      </Hoja>

      <Hoja abierta={panel === 'reportar' && !!seleccion} titulo="Reportar este punto" alCerrar={() => setPanel(null)}>
        {seleccion && <FormularioReporte solicitud={seleccion} alEnviar={alReportar} />}
      </Hoja>

      <Hoja abierta={panel === 'comprobante' && !!comprobante} titulo="Solicitud publicada" alCerrar={() => setPanel(null)}>
        {comprobante && <Comprobante folio={comprobante.folio} token={comprobante.token} alCerrar={() => setPanel(null)} />}
      </Hoja>

      <Hoja abierta={panel === 'gestionar'} titulo="Gestionar mi registro" alCerrar={() => setPanel(null)}>
        <Gestionar alTerminar={(m) => { setPanel(null); setAviso(m); cargar(); }} />
      </Hoja>

      <Hoja abierta={panel === 'privacidad'} titulo="Aviso de privacidad" alCerrar={() => setPanel(null)}>
        <AvisoPrivacidad />
      </Hoja>

      <Hoja abierta={panel === 'terminos'} titulo="Términos de uso" alCerrar={() => setPanel(null)}>
        <TerminosUso />
      </Hoja>

      <Pie alVerPrivacidad={() => setPanel('privacidad')} alVerTerminos={() => setPanel('terminos')} alGestionar={() => setPanel('gestionar')} />
    </div>
  );
}

// ============================================================================
// Cabecera
// ============================================================================

function Encabezado({ alPedirAyuda, alGestionar }: { alPedirAyuda: () => void; alGestionar: () => void }) {
  return (
    <header className="sticky top-0 z-30 bg-azul text-blanco">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="onda-sismica" />
          <div className="leading-none">
            <p className="font-display text-lg font-extrabold tracking-tight sm:text-xl">Punto Cero</p>
            <p className="mt-1 text-[11px] font-medium text-blanco/70">
              Red ciudadana de apoyo tras el sismo
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={alGestionar}
            className="hidden rounded-md border border-blanco/30 px-3 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-blanco/90 transition hover:bg-blanco/10 md:block"
          >
            Mi registro
          </button>
          <a
            href="tel:123"
            className="rounded-md bg-blanco px-2.5 py-1.5 text-center font-display text-[11px] font-bold uppercase leading-tight tracking-wider text-rojo transition hover:bg-blanco/90"
          >
            Emergencia<span className="block font-mono text-base">123</span>
          </a>
          <button
            onClick={alPedirAyuda}
            className="hidden rounded-md bg-rojo px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-blanco transition hover:bg-rojo-oscuro sm:block"
          >
            Necesito ayuda
          </button>
        </div>
      </div>
    </header>
  );
}

function Marquesina({ datos }: { datos: ReturnType<typeof calcularEstadisticas> }) {
  const celdas = [
    { n: datos.pendientes, t: 'Sin atender', c: 'text-rojo' },
    { n: datos.en_proceso, t: 'En camino', c: 'text-azul' },
    { n: datos.resueltas, t: 'Resueltos', c: 'text-verde' },
    { n: datos.personas_por_atender, t: 'Personas esperando', c: 'text-azul-tinta' },
  ];
  return (
    <div className="border-b border-borde bg-blanco">
      <dl className="mx-auto grid w-full max-w-6xl grid-cols-4 divide-x divide-borde px-4 sm:px-6">
        {celdas.map((c) => (
          <div key={c.t} className="px-1 py-2.5 text-center sm:px-3">
            <dd className={`font-display text-xl font-extrabold tabular-nums sm:text-2xl ${c.c}`}>{c.n}</dd>
            <dt className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gris sm:text-[11px]">{c.t}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ============================================================================
// Navegación y filtros
// ============================================================================

function Pestanas({ vista, alCambiar, conteo, total }: { vista: Vista; alCambiar: (v: Vista) => void; conteo: number; total: number }) {
  const etiquetas: Record<Vista, string> = { lista: 'Lista', mapa: 'Mapa', historial: 'Historial' };
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-xs uppercase tracking-wider text-gris">
        {vista === 'historial' ? 'Registro público de la ayuda' : `${conteo} de ${total} puntos`}
      </p>
      <div role="tablist" aria-label="Cómo ver la información" className="inline-flex rounded-lg border border-borde bg-blanco p-0.5">
        {(['lista', 'mapa', 'historial'] as Vista[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={vista === v}
            onClick={() => alCambiar(v)}
            className={`rounded-md px-3.5 py-1.5 font-display text-sm font-bold tracking-wide transition sm:px-4 ${
              vista === v ? 'bg-azul text-blanco' : 'text-gris hover:text-azul'
            }`}
          >
            {etiquetas[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

function BarraFiltros({ filtros, alCambiar, activos, alLimpiar }: { filtros: Filtros; alCambiar: (f: Filtros) => void; activos: number; alLimpiar: () => void }) {
  const municipios = filtros.departamento ? municipiosDe(filtros.departamento) : [];
  return (
    <section aria-label="Filtros" className="mb-4 rounded-xl border border-borde bg-blanco p-3">
      <input
        type="search"
        value={filtros.busqueda}
        onChange={(e) => alCambiar({ ...filtros, busqueda: e.target.value })}
        placeholder="Buscar por folio, alias, barrio o descripción"
        className="mb-2.5 w-full rounded-lg border border-borde bg-nieve px-3 py-2.5 text-sm outline-none transition placeholder:text-gris/70 focus:border-azul focus:ring-2 focus:ring-azul/15"
      />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Selector etiqueta="Departamento" valor={filtros.departamento} onChange={(v) => alCambiar({ ...filtros, departamento: v, municipio: '' })} opciones={DEPARTAMENTOS.map((d) => ({ valor: d, texto: d }))} todos="Todos" />
        <Selector etiqueta="Municipio" valor={filtros.municipio} onChange={(v) => alCambiar({ ...filtros, municipio: v })} opciones={municipios.map((m) => ({ valor: m, texto: m }))} todos={filtros.departamento ? 'Todos' : 'Elige departamento'} desactivado={!filtros.departamento} />
        <Selector etiqueta="Tipo de ayuda" valor={filtros.tipo} onChange={(v) => alCambiar({ ...filtros, tipo: v as TipoAyuda | '' })} opciones={LISTA_TIPOS.map((t) => ({ valor: t, texto: TIPOS_AYUDA[t].etiqueta }))} todos="Todos" />
        <Selector etiqueta="Estado" valor={filtros.estado} onChange={(v) => alCambiar({ ...filtros, estado: v as EstadoSolicitud | '' })} opciones={LISTA_ESTADOS.map((e) => ({ valor: e, texto: ESTADOS[e].etiqueta }))} todos="Todos" />
      </div>
      {activos > 0 && (
        <button onClick={alLimpiar} className="mt-2.5 font-display text-xs font-bold uppercase tracking-wider text-azul underline underline-offset-4 hover:text-rojo">
          Quitar filtros ({activos})
        </button>
      )}
    </section>
  );
}

function Esqueleto() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => <li key={i} className="h-40 animate-pulse rounded-xl bg-borde/60" />)}
    </ul>
  );
}

function Vacio({ hayFiltros, alLimpiar, alPedirAyuda }: { hayFiltros: boolean; alLimpiar: () => void; alPedirAyuda: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-borde bg-blanco px-6 py-12 text-center">
      <p className="font-display text-2xl font-bold text-azul-tinta">
        {hayFiltros ? 'Ningún punto con estos filtros' : 'Todavía no hay puntos publicados'}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gris">
        {hayFiltros ? 'Amplía la zona o el tipo de ayuda para ver más solicitudes.' : 'Cuando alguien reporte una necesidad, aparecerá aquí en segundos.'}
      </p>
      <button onClick={hayFiltros ? alLimpiar : alPedirAyuda} className="mt-5 rounded-lg bg-azul px-5 py-3 font-display text-sm font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta">
        {hayFiltros ? 'Quitar filtros' : 'Publicar una necesidad'}
      </button>
    </div>
  );
}

// ============================================================================
// Tarjeta
// ============================================================================

function Ficha({ solicitud, alAbrir }: { solicitud: Solicitud; alAbrir: () => void }) {
  const estado = ESTADOS[solicitud.estado];
  const tipo = TIPOS_AYUDA[solicitud.tipo_ayuda];
  const franja = solicitud.estado === 'PENDIENTE' ? 'franja-pendiente' : solicitud.estado === 'EN_PROCESO' ? 'franja-en-proceso' : 'franja-resuelto';

  return (
    <button onClick={alAbrir} className="group relative flex w-full gap-3 overflow-hidden rounded-xl border border-borde bg-blanco p-4 pl-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-azul">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-2.5 ${franja}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] tracking-wider text-gris">{solicitud.folio}</span>
          <span className={`rounded-full border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider ${estado.clase}`}>
            {estado.etiqueta}
          </span>
        </div>

        <h3 className="mt-1.5 font-display text-lg font-bold leading-tight text-azul-tinta">
          <span aria-hidden className="mr-1.5">{tipo.glifo}</span>{tipo.etiqueta}
        </h3>

        <p className="mt-1 font-display text-sm font-semibold text-azul">{solicitud.alias_referencia}</p>
        <p className="text-xs font-medium text-gris">{solicitud.municipio}, {solicitud.departamento}</p>
        <p className="mt-2 line-clamp-2 text-sm leading-snug text-azul-tinta/85">{solicitud.descripcion}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-gris">
          <span>{solicitud.personas_afectadas} pers.</span>
          <span aria-hidden>·</span>
          <span>{tiempoRelativo(solicitud.creado_en)}</span>
          {solicitud.total_colaboraciones > 0 && (
            <><span aria-hidden>·</span><span className="text-azul">{solicitud.total_colaboraciones} apoyo{solicitud.total_colaboraciones === 1 ? '' : 's'}</span></>
          )}
          <span className="ml-auto flex gap-2">
            {solicitud.imagen_ruta && <span>Foto</span>}
            {solicitud.latitud && <span>GPS</span>}
          </span>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Detalle
// ============================================================================

function Detalle({ solicitud, alColaborar, alReportar }: { solicitud: Solicitud; alColaborar: () => void; alReportar: () => void }) {
  const [apoyos, setApoyos] = useState<Colaboracion[] | null>(null);
  const [telefono, setTelefono] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const estado = ESTADOS[solicitud.estado];
  const tipo = TIPOS_AYUDA[solicitud.tipo_ayuda];
  const foto = urlImagen(solicitud.imagen_ruta);

  useEffect(() => {
    let vivo = true;
    setApoyos(null);
    setTelefono(null);
    listarColaboraciones(solicitud.id).then((d) => vivo && setApoyos(d));
    return () => { vivo = false; };
  }, [solicitud.id]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider ${estado.clase}`}>{estado.etiqueta}</span>
          <span className="font-mono text-xs tracking-wider text-gris">Actualizado {tiempoRelativo(solicitud.actualizado_en)}</span>
        </div>
        <h3 className="mt-2 font-display text-2xl font-extrabold leading-tight text-azul-tinta">
          <span aria-hidden className="mr-2">{tipo.glifo}</span>{tipo.etiqueta}
        </h3>
        <p className="mt-1 font-display text-base font-semibold text-azul">{solicitud.alias_referencia}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-azul-tinta/90">{solicitud.descripcion}</p>
      </div>

      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt={`Evidencia del punto ${solicitud.folio}`} className="w-full rounded-lg border border-borde" loading="lazy" referrerPolicy="no-referrer" />
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-borde py-4 text-sm">
        <Dato titulo="Personas afectadas" valor={`${solicitud.personas_afectadas}`} />
        <Dato titulo="Registrado" valor={tiempoRelativo(solicitud.creado_en)} />
        <Dato titulo="Ubicación" ancho valor={`${solicitud.municipio}, ${solicitud.departamento}`} />
        <Dato titulo="Referencia del sector" ancho valor={solicitud.direccion_referencia} />
        {solicitud.latitud && (
          <Dato titulo="Coordenadas" ancho valor={
            <a href={`https://www.openstreetmap.org/?mlat=${solicitud.latitud}&mlon=${solicitud.longitud}#map=17/${solicitud.latitud}/${solicitud.longitud}`} target="_blank" rel="noreferrer noopener" className="font-mono text-xs underline underline-offset-2">
              {solicitud.latitud.toFixed(5)}, {solicitud.longitud!.toFixed(5)} ↗
            </a>
          } />
        )}
        <Dato titulo="Contacto" ancho valor={
          !solicitud.tiene_telefono ? (
            <span className="text-gris">Sin teléfono. Coordina por el punto de encuentro.</span>
          ) : telefono ? (
            <a href={`tel:${telefono.replace(/\s/g, '')}`} className="font-mono underline underline-offset-2">{telefono}</a>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-gris">•••••••••</span>
              <button
                onClick={() => { setPidiendo(true); revelarTelefono(solicitud.id).then(setTelefono).finally(() => setPidiendo(false)); }}
                disabled={pidiendo}
                className="rounded border border-azul/30 px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-azul transition hover:bg-azul hover:text-blanco disabled:opacity-50"
              >
                {pidiendo ? 'Abriendo…' : 'Mostrar contacto'}
              </button>
              <span className="w-full text-[11px] text-gris">Se guarda cifrado. Cada consulta queda registrada.</span>
            </span>
          )
        } />
      </dl>

      <section>
        <h4 className="font-display text-sm font-bold uppercase tracking-wider text-gris">Cadena de apoyos</h4>
        {apoyos === null ? (
          <p className="mt-3 text-sm text-gris">Cargando…</p>
        ) : apoyos.length === 0 ? (
          <p className="mt-3 text-sm text-gris">
            Nadie ha respondido todavía. Si vas para allá, regístralo aquí para que otra
            brigada no repita el mismo viaje.
          </p>
        ) : (
          <ol className="mt-3 space-y-4 border-l-2 border-borde pl-5">
            {apoyos.map((c) => (
              <li key={c.id} className="relative">
                <span aria-hidden className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-nieve ${ESTADOS[c.estado_resultante].punto}`} />
                <p className="font-display text-base font-bold text-azul-tinta">
                  {c.alias_colaborador}
                  {c.organizacion && <span className="ml-2 font-body text-xs font-medium text-gris">{c.organizacion}</span>}
                </p>
                <p className="mt-0.5 text-sm leading-snug text-azul-tinta/85">{c.apoyo_brindado}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-gris">
                  {ESTADOS[c.estado_resultante].etiqueta} · {tiempoRelativo(c.creado_en)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {solicitud.estado === 'RESUELTO' ? (
        <p className="rounded-lg border border-verde/30 bg-verde/10 px-4 py-3 text-sm text-verde">
          Este punto ya fue atendido. Busca otro que siga pendiente.
        </p>
      ) : (
        <button onClick={alColaborar} className="w-full rounded-lg bg-azul px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta">
          Quiero colaborar con este punto
        </button>
      )}

      <div className="border-t border-borde pt-4">
        <p className="text-xs leading-snug text-gris">
          La información de este punto la escribió quien lo registró. La plataforma no la
          verifica. Si expone datos personales, parece falsa o es una estafa, repórtala.
        </p>
        <button onClick={alReportar} className="mt-2 font-display text-xs font-bold uppercase tracking-wider text-rojo underline underline-offset-4 hover:text-rojo-oscuro">
          Reportar este punto
        </button>
      </div>
    </div>
  );
}

function Dato({ titulo, valor, ancho }: { titulo: string; valor: ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? 'col-span-2' : ''}>
      <dt className="font-display text-[11px] font-bold uppercase tracking-wider text-gris">{titulo}</dt>
      <dd className="mt-0.5 text-azul-tinta">{valor}</dd>
    </div>
  );
}

// ============================================================================
// Historial público
// ============================================================================

function Historial({ eventos }: { eventos: EventoHistorial[] }) {
  if (eventos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-borde bg-blanco px-6 py-12 text-center">
        <p className="font-display text-xl font-bold text-azul-tinta">El historial está vacío</p>
        <p className="mt-2 text-sm text-gris">Aquí quedará registrado todo lo que se pida y todo lo que se entregue.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-borde bg-blanco p-5">
      <p className="mb-4 text-sm leading-snug text-gris">
        Registro abierto de lo que ha pasado en la plataforma. Muestra el alias y el municipio
        de cada punto, nunca contacto ni ubicación exacta. No se puede editar ni borrar: es la
        forma de comprobar que la ayuda llegó.
      </p>
      <ol className="space-y-4 border-l-2 border-borde pl-5">
        {eventos.map((e) => (
          <li key={e.id} className="relative">
            <span aria-hidden className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-blanco ${EVENTOS[e.evento].color}`} />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-sm font-bold text-azul-tinta">{EVENTOS[e.evento].etiqueta}</span>
              <span className="font-mono text-[11px] tracking-wider text-gris">{e.folio}</span>
              <span className="ml-auto font-mono text-[11px] text-gris">{tiempoRelativo(e.ocurrido_en)}</span>
            </div>
            <p className="text-xs font-medium text-azul">
              {e.alias} · {e.municipio}, {e.departamento} · {TIPOS_AYUDA[e.tipo_ayuda].etiqueta}
            </p>
            {e.detalle && <p className="mt-0.5 text-sm leading-snug text-azul-tinta/85">{e.detalle}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ============================================================================
// Módulo 1 · Formulario de solicitud
// ============================================================================

function FormularioSolicitud({
  alEnviar, alVerPrivacidad,
}: {
  alEnviar: (d: Parameters<typeof crearSolicitud>[0]) => Promise<void>;
  alVerPrivacidad: () => void;
}) {
  const [alias, setAlias] = useState('');
  const [telefono, setTelefono] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [tipo, setTipo] = useState<TipoAyuda | ''>('');
  const [descripcion, setDescripcion] = useState('');
  const [personas, setPersonas] = useState(1);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gps, setGps] = useState<'inactivo' | 'buscando' | 'error'>('inactivo');
  const [foto, setFoto] = useState<{ archivo: File; url: string; kb: number } | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  function ubicarme() {
    if (!('geolocation' in navigator)) return setGps('error');
    setGps('buscando');
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setGps('inactivo'); },
      () => setGps('error'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErrorFoto(null);
    try {
      const r = await prepararImagen(f);
      setFoto({ archivo: r.archivo, url: r.vistaPrevia, kb: Math.round(r.bytesFinales / 1024) });
    } catch (err) {
      setFoto(null);
      setErrorFoto((err as Error).message);
    }
  }

  function validar() {
    const e: Record<string, string> = {};
    const alertaAlias = revisarAlias(alias);
    if (alertaAlias) e.alias = alertaAlias;
    if (telefono.trim() && !telefonoValido(telefono)) e.telefono = 'Revisa el número o déjalo vacío.';
    if (!departamento) e.departamento = 'Elige el departamento.';
    if (!municipio) e.municipio = 'Elige el municipio.';
    if (direccion.trim().length < 5) e.direccion = 'Una referencia para poder llegar.';
    if (!tipo) e.tipo = 'Elige el tipo de ayuda.';
    if (descripcion.trim().length < 10) e.descripcion = 'Cuenta en una frase qué hace falta.';
    if (!acepta) e.acepta = 'Necesitamos tu autorización expresa para publicar el punto.';
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setFallo(null);
    if (!validar()) return;
    setEnviando(true);
    try {
      let rutaImagen: string | null = null;
      if (foto) rutaImagen = await subirEvidencia(foto.archivo);
      await alEnviar({
        alias: alias.trim(),
        departamento, municipio,
        direccion_referencia: direccion.trim(),
        tipo_ayuda: tipo as TipoAyuda,
        descripcion: descripcion.trim(),
        personas_afectadas: personas,
        telefono: telefono.trim() || null,
        latitud: coords?.lat ?? null,
        longitud: coords?.lng ?? null,
        imagen_ruta: rutaImagen,
        consentimiento: true,
      });
    } catch (err) {
      setFallo((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <p className="rounded-lg border border-rojo/30 bg-rojo/5 px-3 py-2.5 text-sm leading-snug">
        Si hay personas atrapadas o heridas de gravedad, llama primero al{' '}
        <a href="tel:123" className="font-semibold text-rojo underline underline-offset-2">123</a>.
        Este formulario coordina ayuda comunitaria, no reemplaza a los organismos de socorro.
      </p>

      <AvisoEnFormulario alVerCompleto={alVerPrivacidad} />

      <Campo
        etiqueta="Alias o referencia del lugar"
        ayuda="No escribas tu nombre ni tu cédula. Usa algo que sirva para ubicar el sitio: «Tienda El Roble», «Edificio Central», «Casa 2»."
        error={errores.alias}
      >
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Tienda El Roble" maxLength={80} className={entrada(!!errores.alias)} />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Teléfono (opcional)" ayuda="Se guarda cifrado y no aparece en el listado." error={errores.telefono}>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="Puedes dejarlo vacío" className={entrada(!!errores.telefono)} />
        </Campo>
        <Campo etiqueta="Personas afectadas">
          <input type="number" min={1} max={999} value={personas} onChange={(e) => setPersonas(Math.max(1, Number(e.target.value) || 1))} className={entrada(false)} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Departamento" error={errores.departamento}>
          <select value={departamento} onChange={(e) => { setDepartamento(e.target.value); setMunicipio(''); }} className={entrada(!!errores.departamento)}>
            <option value="">Elige…</option>
            {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Municipio" error={errores.municipio}>
          <select value={municipio} onChange={(e) => setMunicipio(e.target.value)} disabled={!departamento} className={entrada(!!errores.municipio)}>
            <option value="">{departamento ? 'Elige…' : 'Elige departamento'}</option>
            {municipiosDe(departamento).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Campo>
      </div>

      <Campo etiqueta="Referencia del sector" ayuda="Un dato para llegar: barrio, esquina, tienda o colegio cercano. No hace falta la dirección exacta de tu casa." error={errores.direccion}>
        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Barrio La Patria, calle 26 con carrera 19" maxLength={200} className={entrada(!!errores.direccion)} />
      </Campo>

      <div className="rounded-lg border border-borde bg-blanco p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-wider text-azul-tinta">Coordenadas GPS</p>
            <p className="mt-0.5 text-xs text-gris">
              {coords ? 'Guardadas. El punto saldrá exacto en el mapa.' : 'Opcional, pero acelera mucho la llegada de la brigada.'}
            </p>
          </div>
          <button type="button" onClick={ubicarme} disabled={gps === 'buscando'} className="shrink-0 rounded-md border border-azul/30 bg-blanco px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-azul transition hover:bg-azul hover:text-blanco disabled:opacity-50">
            {gps === 'buscando' ? 'Buscando…' : coords ? 'Actualizar' : 'Usar mi ubicación'}
          </button>
        </div>
        {coords && <p className="mt-2 font-mono text-xs text-verde">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
        {gps === 'error' && <p className="mt-2 text-xs text-rojo">No pudimos leer la ubicación. Activa el GPS y da permiso, o sigue solo con la referencia.</p>}
      </div>

      <Campo etiqueta="¿Qué necesitan?" error={errores.tipo}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LISTA_TIPOS.map((t) => {
            const activo = tipo === t;
            return (
              <button key={t} type="button" onClick={() => setTipo(t)} aria-pressed={activo}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${activo ? 'border-azul bg-azul text-blanco' : 'border-borde bg-blanco hover:border-azul/50'}`}>
                <span aria-hidden className="text-lg leading-none">{TIPOS_AYUDA[t].glifo}</span>
                <span>
                  <span className="block font-display text-sm font-bold leading-tight">{TIPOS_AYUDA[t].etiqueta}</span>
                  <span className={`block text-[11px] leading-snug ${activo ? 'text-blanco/70' : 'text-gris'}`}>{TIPOS_AYUDA[t].ayuda}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Campo>

      <Campo etiqueta="Describe la necesidad" ayuda={`${descripcion.length}/800 caracteres. No incluyas nombres de personas ni documentos.`} error={errores.descripcion}>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value.slice(0, 800))} rows={4} placeholder="Somos 6 personas, tres son menores. Llevamos dos días sin agua potable." className={entrada(!!errores.descripcion)} />
      </Campo>

      <div className="rounded-lg border border-borde bg-blanco p-3">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-azul-tinta">Foto (opcional)</p>
        <p className="mt-0.5 text-xs leading-snug text-gris">
          JPG, PNG o WEBP, máximo 3 MB. Antes de subirla eliminamos toda la metadata,
          incluida la ubicación GPS que la cámara incrusta. No subas fotos con personas
          identificables, menores, documentos ni placas.
        </p>

        {foto ? (
          <div className="mt-3 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.url} alt="Vista previa de la foto seleccionada" className="h-24 w-24 rounded-lg border border-borde object-cover" />
            <div className="flex-1">
              <p className="font-mono text-xs text-verde">Procesada · {foto.kb} KB · JPEG sin metadata</p>
              <button type="button" onClick={() => setFoto(null)} className="mt-2 font-display text-xs font-bold uppercase tracking-wider text-rojo underline underline-offset-4">
                Quitar foto
              </button>
            </div>
          </div>
        ) : (
          <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-azul/40 bg-nieve px-4 py-4 font-display text-sm font-bold uppercase tracking-wider text-azul transition hover:bg-azul-suave">
            Elegir o tomar foto
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={alElegirFoto} className="sr-only" />
          </label>
        )}
        {errorFoto && <p className="mt-2 text-xs text-rojo">{errorFoto}</p>}
      </div>

      <div className={`rounded-lg border p-3 ${errores.acepta ? 'border-rojo bg-rojo/5' : 'border-borde bg-blanco'}`}>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-rojo" />
          <span className="text-[13px] leading-snug text-azul-tinta">
            <strong className="font-semibold">Autorizo de forma expresa</strong> el tratamiento de esta
            información con la única finalidad de coordinar la entrega de ayuda tras el sismo, en
            los términos del aviso de privacidad. Declaro que los datos son veraces, que no incluyen
            información de terceros sin su permiso, y entiendo que puedo revocar esta autorización
            cuando quiera con el folio y la clave que recibiré.
          </span>
        </label>
        {errores.acepta && <p className="mt-2 text-xs font-medium text-rojo">{errores.acepta}</p>}
      </div>

      {fallo && <Alerta tono="rojo">{fallo}</Alerta>}

      <button type="submit" disabled={enviando} className="w-full rounded-lg bg-rojo px-4 py-4 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:bg-rojo-oscuro disabled:opacity-60">
        {enviando ? 'Publicando…' : 'Publicar solicitud'}
      </button>

      <p className="text-center text-[11px] leading-snug text-gris">{AVISO_CORTO}</p>
    </form>
  );
}

// ============================================================================
// Módulo 3 · Colaboración
// ============================================================================

function FormularioColaboracion({
  solicitud, alEnviar, alVerPrivacidad,
}: {
  solicitud: Solicitud;
  alEnviar: (d: Parameters<typeof registrarColaboracion>[0]) => Promise<void>;
  alVerPrivacidad: () => void;
}) {
  const [alias, setAlias] = useState('');
  const [telefono, setTelefono] = useState('');
  const [organizacion, setOrganizacion] = useState('');
  const [apoyo, setApoyo] = useState('');
  const [estado, setEstado] = useState<'EN_PROCESO' | 'RESUELTO'>('EN_PROCESO');
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    const a = revisarAlias(alias);
    if (a) e.alias = a;
    if (telefono.trim() && !telefonoValido(telefono)) e.telefono = 'Revisa el número o déjalo vacío.';
    if (apoyo.trim().length < 5) e.apoyo = 'Cuenta qué vas a llevar o qué entregaste.';
    if (!acepta) e.acepta = 'Necesitamos tu autorización para publicar el apoyo.';
    setErrores(e);
    if (Object.keys(e).length) return;

    setEnviando(true);
    setFallo(null);
    try {
      await alEnviar({
        solicitud_id: solicitud.id,
        alias: alias.trim(),
        apoyo: apoyo.trim(),
        estado,
        organizacion: organizacion.trim() || undefined,
        telefono: telefono.trim() || undefined,
        consentimiento: true,
      });
    } catch (err) {
      setFallo((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div className="rounded-lg border border-borde bg-blanco p-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-gris">{solicitud.folio}</p>
        <p className="mt-0.5 font-display text-base font-bold leading-tight text-azul-tinta">
          {TIPOS_AYUDA[solicitud.tipo_ayuda].etiqueta} · {solicitud.municipio}
        </p>
        <p className="mt-1 text-xs text-gris">{solicitud.alias_referencia} — {solicitud.direccion_referencia}</p>
      </div>

      <AvisoEnFormulario alVerCompleto={alVerPrivacidad} />

      <Campo etiqueta="Alias tuyo o de la brigada" ayuda="Tampoco aquí hace falta tu nombre real." error={errores.alias}>
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Brigada Andes" maxLength={80} className={entrada(!!errores.alias)} />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Teléfono (opcional)" error={errores.telefono}>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="Puedes dejarlo vacío" className={entrada(!!errores.telefono)} />
        </Campo>
        <Campo etiqueta="Organización" ayuda="Opcional">
          <input value={organizacion} onChange={(e) => setOrganizacion(e.target.value)} placeholder="Cruz Roja, JAC, particular…" maxLength={120} className={entrada(false)} />
        </Campo>
      </div>

      <Campo etiqueta="¿Qué apoyo vas a brindar?" error={errores.apoyo}>
        <textarea value={apoyo} onChange={(e) => setApoyo(e.target.value.slice(0, 600))} rows={3} placeholder="Llevo 10 mercados y 20 garrafas de agua. Salgo en una hora." className={entrada(!!errores.apoyo)} />
      </Campo>

      <Campo etiqueta="¿En qué momento estás?">
        <div className="grid grid-cols-2 gap-2">
          {([
            ['EN_PROCESO', 'Voy en camino', 'El punto queda reservado para que nadie repita el viaje.'],
            ['RESUELTO', 'Ya lo entregué', 'El punto se cierra y sale de la lista de pendientes.'],
          ] as const).map(([valor, titulo, ayuda]) => {
            const activo = estado === valor;
            return (
              <button key={valor} type="button" onClick={() => setEstado(valor)} aria-pressed={activo}
                className={`rounded-lg border px-3 py-3 text-left transition ${activo ? (valor === 'RESUELTO' ? 'border-verde bg-verde text-blanco' : 'border-azul bg-azul text-blanco') : 'border-borde bg-blanco hover:border-azul/50'}`}>
                <span className="block font-display text-sm font-bold">{titulo}</span>
                <span className={`mt-0.5 block text-[11px] leading-snug ${activo ? 'text-blanco/75' : 'text-gris'}`}>{ayuda}</span>
              </button>
            );
          })}
        </div>
      </Campo>

      <div className={`rounded-lg border p-3 ${errores.acepta ? 'border-rojo bg-rojo/5' : 'border-borde bg-blanco'}`}>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-azul" />
          <span className="text-[13px] leading-snug text-azul-tinta">
            <strong className="font-semibold">Autorizo</strong> que este apoyo se publique en el
            historial con la única finalidad de coordinar la ayuda. Si dejo teléfono, entiendo que se
            guarda cifrado y solo se muestra a quien lo consulte desde la ficha.
          </span>
        </label>
        {errores.acepta && <p className="mt-2 text-xs font-medium text-rojo">{errores.acepta}</p>}
      </div>

      {fallo && <Alerta tono="rojo">{fallo}</Alerta>}

      <button type="submit" disabled={enviando} className="w-full rounded-lg bg-azul px-4 py-4 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta disabled:opacity-60">
        {enviando ? 'Registrando…' : 'Registrar mi apoyo'}
      </button>
    </form>
  );
}

// ============================================================================
// Módulo 4 · Reporte de contenido
// ============================================================================

function FormularioReporte({ solicitud, alEnviar }: { solicitud: Solicitud; alEnviar: (m: MotivoReporte, d: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState<MotivoReporte | ''>('');
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!motivo) return setError('Elige un motivo.');
    setEnviando(true);
    setError(null);
    try {
      await alEnviar(motivo, detalle.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <p className="rounded-lg border border-borde bg-blanco px-3 py-2.5 text-sm leading-snug text-gris">
        Estás reportando el punto <span className="font-mono text-azul-tinta">{solicitud.folio}</span>.
        Con tres reportes el punto se retira automáticamente de la vista pública hasta que alguien
        lo revise. Los reportes son anónimos.
      </p>

      <Campo etiqueta="¿Cuál es el problema?">
        <div className="space-y-2">
          {LISTA_MOTIVOS.map((m) => (
            <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${motivo === m ? 'border-rojo bg-rojo/5' : 'border-borde bg-blanco hover:border-rojo/40'}`}>
              <input type="radio" name="motivo" checked={motivo === m} onChange={() => setMotivo(m)} className="mt-0.5 h-4 w-4 shrink-0 accent-rojo" />
              <span className="text-sm leading-snug text-azul-tinta">{MOTIVOS_REPORTE[m]}</span>
            </label>
          ))}
        </div>
      </Campo>

      <Campo etiqueta="Detalle (opcional)" ayuda="No copies aquí los datos personales que estás reportando.">
        <textarea value={detalle} onChange={(e) => setDetalle(e.target.value.slice(0, 500))} rows={3} className={entrada(false)} />
      </Campo>

      {error && <Alerta tono="rojo">{error}</Alerta>}

      <button type="submit" disabled={enviando} className="w-full rounded-lg bg-rojo px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:bg-rojo-oscuro disabled:opacity-60">
        {enviando ? 'Enviando…' : 'Enviar reporte'}
      </button>
    </form>
  );
}

// ============================================================================
// Gestión del propio registro: derechos del titular
// ============================================================================

function Gestionar({ alTerminar }: { alTerminar: (mensaje: string) => void }) {
  const [folio, setFolio] = useState('');
  const [token, setToken] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function accion(cual: 'cerrar' | 'suprimir') {
    setError(null);
    if (!folio.trim() || !token.trim()) return setError('Escribe el folio y la clave de gestión.');
    if (cual === 'suprimir' && !confirmar) return setError('Marca la casilla para confirmar la supresión.');
    setOcupado(true);
    try {
      const ok = cual === 'cerrar'
        ? await cerrarSolicitud(folio.trim(), token.trim())
        : await revocarConsentimiento(folio.trim(), token.trim());
      if (!ok) return setError('El folio y la clave no coinciden, o el registro ya fue suprimido.');
      alTerminar(cual === 'cerrar' ? 'Tu punto quedó marcado como resuelto.' : 'Tus datos fueron suprimidos.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-azul-tinta/90">
        Con el folio y la clave que recibiste al registrar puedes cerrar tu punto o suprimir tu
        información. No necesitas cuenta y no te pedimos ningún dato personal para hacerlo.
      </p>

      <Campo etiqueta="Folio">
        <input value={folio} onChange={(e) => setFolio(e.target.value.toUpperCase())} placeholder="AYU-01038" className={`${entrada(false)} font-mono`} />
      </Campo>
      <Campo etiqueta="Clave de gestión">
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className={`${entrada(false)} font-mono text-xs`} />
      </Campo>

      <button onClick={() => accion('cerrar')} disabled={ocupado} className="w-full rounded-lg bg-verde px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:brightness-110 disabled:opacity-60">
        Ya no necesito ayuda: cerrar el punto
      </button>

      <div className="rounded-lg border border-rojo/30 bg-rojo/5 p-3">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-rojo">
          Revocar y suprimir mis datos
        </p>
        <p className="mt-1 text-xs leading-snug text-azul-tinta/85">
          Se borran el teléfono, las coordenadas, la foto, la referencia y la descripción, y el punto
          sale del tablero. Se conserva el folio y la constancia de la ayuda ya entregada, sin ningún
          dato tuyo, para que el historial siga siendo verificable. Es irreversible.
        </p>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-rojo" />
          <span className="text-[13px] text-azul-tinta">Entiendo que esta acción no se puede deshacer.</span>
        </label>
        <button onClick={() => accion('suprimir')} disabled={ocupado} className="mt-3 w-full rounded-lg border-2 border-rojo px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-rojo transition hover:bg-rojo hover:text-blanco disabled:opacity-60">
          Suprimir mi información
        </button>
      </div>

      {error && <Alerta tono="rojo">{error}</Alerta>}
    </div>
  );
}

// ============================================================================
// Comprobante
// ============================================================================

function Comprobante({ folio, token, alCerrar }: { folio: string; token: string; alCerrar: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="rounded-xl border-2 border-dashed border-azul/30 bg-azul-suave px-4 py-6">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-azul">Tu folio</p>
        <p className="mt-1 font-mono text-4xl font-medium tracking-tight text-azul-tinta">{folio}</p>
      </div>

      <p className="text-sm leading-relaxed text-azul-tinta/90">
        Ya está publicado. Anota o toma foto de estos dos datos: son la única forma de volver a
        controlar tu registro, y no los podemos recuperar porque no guardamos ningún dato tuyo.
      </p>

      <div className="rounded-lg border border-rojo/30 bg-rojo/5 p-3 text-left">
        <p className="font-display text-[11px] font-bold uppercase tracking-wider text-rojo">
          Clave de gestión · guárdala ahora
        </p>
        <p className="mt-1 break-all font-mono text-xs text-azul-tinta">{token}</p>
        <p className="mt-1.5 text-[11px] leading-snug text-gris">
          Con el folio y esta clave puedes cerrar tu punto o suprimir tu información desde
          «Mi registro», en cualquier momento.
        </p>
      </div>

      <button onClick={alCerrar} className="w-full rounded-lg bg-azul px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta">
        Ya la guardé
      </button>
    </div>
  );
}

// ============================================================================
// Piezas reutilizables
// ============================================================================

function entrada(conError: boolean) {
  return `w-full rounded-lg border bg-blanco px-3 py-3 text-[15px] text-azul-tinta outline-none transition placeholder:text-gris/60 focus:ring-2 disabled:bg-borde/40 disabled:text-gris ${
    conError ? 'border-rojo focus:border-rojo focus:ring-rojo/20' : 'border-borde focus:border-azul focus:ring-azul/15'
  }`;
}

function Campo({ etiqueta, ayuda, error, children }: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-display text-xs font-bold uppercase tracking-wider text-azul">{etiqueta}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-rojo">{error}</span>
        : ayuda ? <span className="mt-1 block text-xs leading-snug text-gris">{ayuda}</span> : null}
    </label>
  );
}

function Selector({ etiqueta, valor, onChange, opciones, todos, desactivado }: { etiqueta: string; valor: string; onChange: (v: string) => void; opciones: { valor: string; texto: string }[]; todos: string; desactivado?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block font-display text-[10px] font-bold uppercase tracking-wider text-gris">{etiqueta}</span>
      <select value={valor} disabled={desactivado} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-borde bg-nieve px-2.5 py-2.5 text-sm text-azul-tinta outline-none transition focus:border-azul focus:ring-2 focus:ring-azul/15 disabled:text-gris/50">
        <option value="">{todos}</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </label>
  );
}

function Alerta({ tono, children }: { tono: 'rojo' | 'azul'; children: ReactNode }) {
  const c = tono === 'rojo' ? 'border-rojo/40 bg-rojo/8 text-rojo-oscuro' : 'border-azul/40 bg-azul/8 text-azul';
  return <p role="alert" className={`rounded-lg border px-3 py-2.5 text-sm ${c}`}>{children}</p>;
}

function Hoja({ abierta, titulo, alCerrar, children }: { abierta: boolean; titulo: string; alCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  }, [abierta, alCerrar]);

  if (!abierta) return null;

  return (
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="animar-entrada absolute inset-0 bg-azul-tinta/60 backdrop-blur-[2px]" onClick={alCerrar} />
      <div ref={ref} tabIndex={-1}
        className="animar-hoja absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl bg-nieve shadow-2xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(32rem,100vw)] sm:rounded-none sm:rounded-l-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-borde bg-blanco px-5 py-4">
          <h2 className="font-display text-lg font-extrabold text-azul-tinta">{titulo}</h2>
          <button onClick={alCerrar} aria-label="Cerrar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-borde text-lg leading-none text-gris transition hover:bg-azul hover:text-blanco">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function Pie({ alVerPrivacidad, alVerTerminos, alGestionar }: { alVerPrivacidad: () => void; alVerTerminos: () => void; alGestionar: () => void }) {
  return (
    <footer className="bg-azul-tinta px-4 py-8 text-blanco/75 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-3 text-xs leading-relaxed">
        <p className="font-display text-base font-bold tracking-tight text-blanco">Punto Cero</p>
        <p>
          Plataforma pública y gratuita. No pedimos nombre ni cédula, no recolectamos datos
          sensibles y no usamos la información con fines comerciales. La veracidad de lo publicado
          es responsabilidad exclusiva de quien hace el registro.
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
          <button onClick={alVerPrivacidad} className="font-display font-bold uppercase tracking-wider text-blanco underline underline-offset-4 hover:text-blanco/70">Aviso de privacidad</button>
          <button onClick={alVerTerminos} className="font-display font-bold uppercase tracking-wider text-blanco underline underline-offset-4 hover:text-blanco/70">Términos de uso</button>
          <button onClick={alGestionar} className="font-display font-bold uppercase tracking-wider text-blanco underline underline-offset-4 hover:text-blanco/70">Gestionar mi registro</button>
        </nav>
        <p className="pt-1">Emergencias: 123 · Cruz Roja Colombiana: 132 · Defensa Civil: 144 · Bomberos: 119</p>
        <p className="text-blanco/45">Cartografía © colaboradores de OpenStreetMap. Sitio servido exclusivamente por HTTPS.</p>
      </div>
    </footer>
  );
}
