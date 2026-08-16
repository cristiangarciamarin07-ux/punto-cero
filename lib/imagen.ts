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
