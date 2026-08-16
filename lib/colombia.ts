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
