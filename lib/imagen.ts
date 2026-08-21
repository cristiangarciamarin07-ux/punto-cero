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

// El límite de 3 MB es del BUCKET, es decir del archivo que sale de aquí, no
// del que elige la persona. Aplicarlo a la entrada era un error de diseño: una
// cámara de celular actual produce JPEG de 4 a 12 MB, así que rechazaba
// prácticamente cualquier foto tomada en el momento. Tras redimensionar a
// 1600 px y recomprimir, el resultado suele pesar entre 150 y 500 KB.
export const MAX_ENTRADA = 30 * 1024 * 1024; // solo para no cargar en memoria algo absurdo
export const MAX_SALIDA = 3 * 1024 * 1024;   // lo que acepta el bucket

// Escalones de calidad. Se prueba el primero; si el resultado no cabe, se baja
// al siguiente. En la práctica nunca pasa del primero.
const ESCALONES: { lado: number; calidad: number }[] = [
  { lado: 1600, calidad: 0.82 },
  { lado: 1280, calidad: 0.75 },
  { lado: 1024, calidad: 0.68 },
  { lado: 800, calidad: 0.6 },
];

const FIRMAS: { tipo: string; bytes: number[] }[] = [
  { tipo: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
];

/**
 * Los iPhone guardan en HEIC salvo que se cambie el ajuste. Chrome y Firefox
 * no saben decodificarlo, así que conviene detectarlo para dar una salida
 * concreta en vez de un «archivo no válido» que no ayuda a nadie.
 */
function esHeic(cabecera: Uint8Array): boolean {
  const marca = String.fromCharCode(...cabecera.slice(4, 12));
  return marca.startsWith('ftyp') && /heic|heif|mif1|msf1/.test(marca.slice(4));
}

export interface ResultadoImagen {
  archivo: File;
  vistaPrevia: string;
  bytesOriginales: number;
  bytesFinales: number;
}

/** Lee la firma binaria real del archivo. */
async function tipoReal(archivo: File): Promise<string | null> {
  const cabecera = new Uint8Array(await archivo.slice(0, 12).arrayBuffer());
  if (esHeic(cabecera)) return 'image/heic';
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
  if (archivo.size > MAX_ENTRADA) {
    throw new Error(
      `La foto pesa ${(archivo.size / 1048576).toFixed(0)} MB, demasiado para procesarla en el navegador.`,
    );
  }
  if (archivo.size === 0) throw new Error('El archivo está vacío.');

  const tipo = await tipoReal(archivo);
  if (tipo === 'image/heic') {
    throw new Error(
      'Tu iPhone está guardando las fotos en formato HEIC, que el navegador no puede leer. ' +
        'Entra a Ajustes → Cámara → Formatos y elige «Más compatible». Las fotos nuevas ya funcionarán.',
    );
  }
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

    let blob: Blob | null = null;
    for (const escalon of ESCALONES) {
      const escala = Math.min(1, escalon.lado / Math.max(img.width, img.height));
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

      blob = await new Promise<Blob | null>((ok) =>
        lienzo.toBlob(ok, 'image/jpeg', escalon.calidad),
      );
      if (blob && blob.size <= MAX_SALIDA) break;
    }

    if (!blob) throw new Error('No pudimos procesar la imagen.');
    if (blob.size > MAX_SALIDA) {
      throw new Error('No pudimos reducir la foto lo suficiente. Intenta con otra.');
    }

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
