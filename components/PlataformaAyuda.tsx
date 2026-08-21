'use client';

// ============================================================================
// PUNTO CERO v2 · componente principal
//   Módulo 1  Pedir ayuda (anónimo, con consentimiento expreso y foto opcional)
//   Módulo 2  Consulta: mapa, lista e historial público
//   Módulo 3  Registrar apoyo
//   Módulo 4  Reporte de contenido y gestión del propio registro
// ============================================================================

import dynamic from 'next/dynamic';
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  calcularEstadisticas, cerrarSolicitud, crearSolicitud, escucharCambios,
  listarColaboraciones, listarHistorial, listarSolicitudes, registrarColaboracion,
  reportarContenido, revelarTelefono, revocarConsentimiento, subirEvidencia, urlImagen,
} from '@/lib/api';
import { MODO_DEMO } from '@/lib/supabaseClient';
import { CENTROS_DEPARTAMENTO, CENTRO_COLOMBIA, DEPARTAMENTOS, municipiosDe } from '@/lib/colombia';
import { prepararImagen } from '@/lib/imagen';
import { AVISO_CORTO } from '@/lib/legal';
import { AvisoEnFormulario, AvisoPrivacidad, TerminosUso } from './Legales';
import {
  Colaboracion, EstadoSolicitud, ESTADOS, EventoHistorial, EVENTOS, LISTA_ESTADOS,
  LISTA_MOTIVOS, LISTA_TIPOS, MOTIVOS_REPORTE, MotivoReporte, revisarAlias, Solicitud,
  telefonoValido, TipoAyuda, TIPOS_AYUDA, tiempoRelativo,
} from '@/lib/tipos';

const MapaSolicitudes = dynamic(() => import('./MapaSolicitudes'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-borde/40">
      <p className="font-display text-sm font-bold uppercase tracking-wider text-gris">
        Cargando mapa…
      </p>
    </div>
  ),
});

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
  const [comprobante, setComprobante] = useState<{ folio: string; clave: string } | null>(null);
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
    setComprobante({ folio: r.folio, clave: r.clave_gestion });
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
        {comprobante && <Comprobante folio={comprobante.folio} clave={comprobante.clave} alCerrar={() => setPanel(null)} />}
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
  const [personas, setPersonas] = useState('1');
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
        personas_afectadas: normalizarPersonas(personas),
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
          <ContadorPersonas valor={personas} alCambiar={setPersonas} />
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
          Toma la foto normal, del tamaño que sea: la reducimos aquí mismo antes de subirla.
          En el proceso se elimina toda la metadata, incluida la ubicación GPS que la cámara
          incrusta. No subas fotos con personas identificables, menores, documentos ni placas.
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
      <Campo etiqueta="Clave de gestión" ayuda="Los diez caracteres que recibiste. No importan mayúsculas, guiones ni espacios.">
        <input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="H8K2M-4TQ9P" maxLength={40}
          className={`${entrada(false)} font-mono text-lg tracking-widest`} />
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

function Comprobante({ folio, clave, alCerrar }: { folio: string; clave: string; alCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Punto Cero — folio ${folio}, clave ${clave}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-sm leading-relaxed text-azul-tinta/90">
        Tu punto ya está publicado. Anota estos dos datos o tómales una foto: son la única
        forma de volver a controlarlo, y no los podemos recuperar porque no guardamos ningún
        dato tuyo.
      </p>

      <div className="rounded-xl border-2 border-azul/25 bg-azul-suave px-4 py-5 text-center">
        <p className="font-display text-[11px] font-bold uppercase tracking-widest text-azul">Folio</p>
        <p className="mt-1 font-mono text-3xl font-medium tracking-tight text-azul-tinta">{folio}</p>

        <div className="mx-auto my-4 h-px w-24 bg-azul/20" />

        <p className="font-display text-[11px] font-bold uppercase tracking-widest text-rojo">
          Clave de gestión
        </p>
        {/* Diez caracteres en dos bloques: se copian a mano y se dictan por
            teléfono sin equivocarse. El alfabeto no tiene ni O ni I ni L. */}
        <p className="mt-1 font-mono text-3xl font-bold tracking-[0.15em] text-azul-tinta">
          {clave}
        </p>
        <p className="mt-2 text-[11px] text-gris">
          No distingue mayúsculas ni guiones. Da igual si confundes la O con el 0.
        </p>
      </div>

      <button
        onClick={copiar}
        className="w-full rounded-lg border-2 border-azul px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-azul transition hover:bg-azul hover:text-blanco"
      >
        {copiado ? 'Copiado ✓' : 'Copiar folio y clave'}
      </button>

      <p className="rounded-lg border border-borde bg-blanco px-3 py-2.5 text-[13px] leading-snug text-gris">
        Con estos dos datos puedes cerrar tu punto cuando ya no necesites ayuda, o suprimir tu
        información, desde <strong className="font-semibold text-azul-tinta">Mi registro</strong>.
      </p>

      <button
        onClick={alCerrar}
        className="w-full rounded-lg bg-azul px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta"
      >
        Ya la guardé
      </button>
    </div>
  );
}

// ============================================================================
// Piezas reutilizables
// ============================================================================

/**
 * Contador de personas.
 *
 * El campo guarda TEXTO, no un número. Con `useState(1)` y
 * `Math.max(1, Number(e.target.value) || 1)` el valor rebota a 1 en cuanto el
 * campo queda vacío, así que es imposible borrar el 1 para escribir otra cifra:
 * el usuario ve que el teclado responde pero el número nunca cambia. Guardando
 * la cadena se permite el estado intermedio vacío y se normaliza al salir del
 * campo y al enviar.
 *
 * Los botones − y + están porque este formulario se llena con una mano, en la
 * calle y con prisa; acertar en una casilla numérica de un celular no es
 * trivial en esas condiciones.
 */
function ContadorPersonas({ valor, alCambiar }: { valor: string; alCambiar: (v: string) => void }) {
  const paso = (delta: number) => {
    const n = normalizarPersonas(valor) + delta;
    alCambiar(String(Math.min(999, Math.max(1, n))));
  };

  const boton = 'grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-borde bg-blanco font-display text-xl font-bold text-azul transition hover:bg-azul hover:text-blanco disabled:opacity-40';

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => paso(-1)} aria-label="Una persona menos"
        disabled={normalizarPersonas(valor) <= 1} className={boton}>−</button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Número de personas afectadas"
        value={valor}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
          alCambiar(v);           // se admite quedar vacío mientras se escribe
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => alCambiar(String(normalizarPersonas(valor)))}
        className={`${entrada(false)} text-center font-mono text-lg`}
      />

      <button type="button" onClick={() => paso(1)} aria-label="Una persona más"
        disabled={normalizarPersonas(valor) >= 999} className={boton}>+</button>
    </div>
  );
}

/** Devuelve siempre un entero entre 1 y 999, incluso desde una cadena vacía. */
function normalizarPersonas(valor: string): number {
  const n = parseInt(valor, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(999, Math.max(1, n));
}

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
