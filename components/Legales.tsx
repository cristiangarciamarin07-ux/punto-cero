'use client';

// ============================================================================
// Presentación de los textos legales. El contenido vive en lib/legal.ts para
// que abogados y equipo de comunicaciones lo editen sin tocar componentes.
// ============================================================================

import { AVISO_PRIVACIDAD, RESPONSABLE, Seccion, TERMINOS_USO, VERSION_POLITICA } from '@/lib/legal';

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
