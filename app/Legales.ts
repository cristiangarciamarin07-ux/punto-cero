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
