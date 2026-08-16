# Punto Cero v2 · Red ciudadana de apoyo tras el sismo

Plataforma pública y gratuita para coordinar ayuda humanitaria en Colombia,
**sin recoger nombres ni documentos de identidad**.

Los detalles de seguridad y cumplimiento están en **[SEGURIDAD.md](SEGURIDAD.md)**.
La puesta en marcha paso a paso está en **Guia-instalacion-Punto-Cero.docx**.

## Arranque rápido

```bash
npm install
npm run dev          # funciona sin base de datos, en modo demostración
```

Para conectar la base real: crea un proyecto en Supabase, ejecuta
`supabase/schema.sql`, copia las llaves a `.env.local` y reinicia.

## Qué cambió respecto a la v1

| | v1 | v2 |
|---|---|---|
| Identificación | Nombre completo obligatorio | Alias del lugar; sin nombres ni documentos |
| Teléfono | Obligatorio, en claro | Opcional, cifrado con llave en Vault |
| Consentimiento | No existía | Casilla obligatoria + constancia versionada |
| Imágenes | No | JPEG re-codificado, sin metadata, máximo 3 MB |
| Moderación | No | Reporte ciudadano; tres reportes ocultan el punto |
| Historial | Solo por ficha | Sección pública e inmutable |
| Cabeceras | Por defecto | CSP, HSTS, nosniff, frame-deny, permissions |
| Pruebas | No | Escaneo, Playwright y verificación SQL |
| Paleta | Ámbar de señalética | Blanco, rojo y azul de campaña solidaria |

## Estructura

```
app/            layout, página y estilos
components/     PlataformaAyuda · MapaSolicitudes · Legales
lib/            tipos · colombia · legal · imagen · api · supabaseClient
supabase/       schema.sql
seguridad/      escanear.sh · pruebas-seguridad.spec.ts · verificar-rls.sql
capturas/       vistas de la interfaz funcionando
```

## Decisiones de diseño

**Paleta.** Blanco dominante para que el contenido respire y se lea a pleno
sol; azul para la estructura; rojo reservado a lo que exige acción, nunca
decorativo. Ningún emblema ni símbolo protegido por los Convenios de Ginebra:
la marca es una onda sísmica de geometría propia.

**El verde de «Resuelto» es una desviación deliberada.** Con solo rojo y azul,
un punto cerrado se leería como un tercer nivel de urgencia. Además del color,
cada estado lleva etiqueta escrita y una trama distinta en la franja lateral,
para que se distinga sin depender de la visión cromática.

**Tipografía.** Archivo para títulos, del registro visual de las organizaciones
humanitarias; IBM Plex Sans para el cuerpo, legible a 12 px y con buena
acentuación en español; IBM Plex Mono para folios y coordenadas.

## Pendientes antes de producción

Están listados con casillas al final de [SEGURIDAD.md](SEGURIDAD.md). Los tres
que no se pueden saltar: completar el responsable en `lib/legal.ts`, revisar
los textos legales con un abogado, y definir quién modera.

## Licencia y datos

Cartografía © colaboradores de OpenStreetMap (ODbL). La atribución está en el
`TileLayer`; no la quites. Con mucho tráfico, no uses los tiles públicos de
OSM: contrata MapTiler, Stadia o levanta un servidor propio.
