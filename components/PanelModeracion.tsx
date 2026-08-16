'use client';

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

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';

import { MODO_DEMO } from '@/lib/supabaseClient';
import {
  AccionModeracion, ACCIONES, anadirModerador, cerrarSesion, EntradaBitacora,
  listarBitacora, listarCola, listarEquipo, MiembroEquipo, miPerfil, moderar,
  obtenerResumen, PerfilModerador, pedirCodigo, PuntoEnCola, ResumenModeracion,
  retirarModerador, RolModerador, validarCodigo, verContacto,
} from '@/lib/moderacion';
import { MOTIVOS_REPORTE, MotivoReporte, TIPOS_AYUDA, tiempoRelativo } from '@/lib/tipos';

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
