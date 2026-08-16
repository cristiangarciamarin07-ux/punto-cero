'use client';

// ============================================================================
// Mapa interactivo (Leaflet + OpenStreetMap).
// Se carga con dynamic({ ssr: false }) desde el padre porque Leaflet necesita
// `window`. Los pines solo muestran alias y municipio: nunca contacto.
// ============================================================================

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { CENTRO_COLOMBIA } from '@/lib/colombia';
import { ESTADOS, Solicitud, TIPOS_AYUDA, tiempoRelativo } from '@/lib/tipos';

interface Props {
  solicitudes: Solicitud[];
  centro: [number, number];
  zoom: number;
  alSeleccionar: (s: Solicitud) => void;
}

function crearPin(s: Solicitud): L.DivIcon {
  const { hex } = ESTADOS[s.estado];
  const glifo = TIPOS_AYUDA[s.tipo_ayuda].glifo;
  const pulso = s.estado === 'PENDIENTE' ? 'pin-pulso' : '';

  return L.divIcon({
    className: 'pin-terreno',
    html: `
      <div class="pin-envoltura ${pulso}">
        <span class="pin-halo" style="background:${hex}"></span>
        <span class="pin-cuerpo" style="background:${hex}">
          <span class="pin-glifo">${glifo}</span>
        </span>
      </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
  });
}

function Reencuadrar({ centro, zoom }: { centro: [number, number]; zoom: number }) {
  const mapa = useMap();
  useEffect(() => {
    mapa.flyTo(centro, zoom, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centro[0], centro[1], zoom]);
  return null;
}

export default function MapaSolicitudes({ solicitudes, centro, zoom, alSeleccionar }: Props) {
  const conCoordenadas = useMemo(
    () => solicitudes.filter((s) => s.latitud !== null && s.longitud !== null),
    [solicitudes],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={centro ?? CENTRO_COLOMBIA}
        zoom={zoom}
        scrollWheelZoom
        className="h-full w-full"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Reencuadrar centro={centro} zoom={zoom} />

        {conCoordenadas.map((s) => (
          <Marker
            key={s.id}
            position={[s.latitud as number, s.longitud as number]}
            icon={crearPin(s)}
            keyboard
            alt={`${TIPOS_AYUDA[s.tipo_ayuda].etiqueta} en ${s.municipio}`}
          >
            <Popup>
              <div className="w-56 font-body">
                <p className="font-mono text-[11px] tracking-wider text-gris">{s.folio}</p>
                <p className="mt-0.5 font-display text-base font-bold leading-tight text-azul-tinta">
                  {TIPOS_AYUDA[s.tipo_ayuda].etiqueta}
                </p>
                <p className="mt-1 text-xs font-medium text-azul">{s.alias_referencia}</p>
                <p className="text-xs text-gris">
                  {s.municipio}, {s.departamento} · {tiempoRelativo(s.creado_en)}
                </p>
                <p className="mt-2 line-clamp-3 text-xs leading-snug text-azul-tinta">
                  {s.descripcion}
                </p>
                <button
                  type="button"
                  onClick={() => alSeleccionar(s)}
                  className="mt-3 w-full rounded-md bg-azul px-3 py-2 font-display text-xs font-bold uppercase tracking-wider text-blanco transition hover:bg-azul-tinta"
                >
                  Ver ficha completa
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {conCoordenadas.length === 0 && (
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
