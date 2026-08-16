# Versión de archivo único

Dos archivos con **todo** el código TypeScript/React dentro. Sin imports a
otros archivos del proyecto: solo a `react`, `@supabase/supabase-js` y `leaflet`.

| Archivo | Va en | Contiene |
|---|---|---|
| `PlataformaAyuda.tsx` | `components/PlataformaAyuda.tsx` | tipos, municipios, textos legales, saneamiento de imágenes, cliente Supabase, capa de datos, mapa e interfaz pública |
| `PanelModeracion.tsx` | `components/PanelModeracion.tsx` | tipos, cliente, capa de datos de moderación y panel completo |

## Diferencia con la versión en módulos

Solo una, y es en el mapa. `react-leaflet` obliga a que el mapa viva en su
propio archivo, porque `next/dynamic` con `ssr: false` necesita un módulo
aparte que cargar. Aquí el mapa se monta con **Leaflet directamente**, cargando
la librería dentro de un `useEffect`, que solo corre en el navegador.

Efecto secundario útil: **ya no hace falta `react-leaflet`**. Puedes quitarlo
de las dependencias si usas esta versión.

Los globos del mapa se construyen con `createElement` y `textContent`, no con
cadenas de HTML. La descripción la escribe un desconocido: metida como
`innerHTML`, un `<img src=x onerror=...>` se ejecutaría.

## Lo que estos dos archivos NO reemplazan

Son componentes de React. Estas otras piezas siguen haciendo falta:

```
app/layout.tsx        fuentes y metadatos
app/globals.css       tokens de color y estilos del mapa   ← imprescindible
app/page.tsx          import PlataformaAyuda from '@/components/PlataformaAyuda'
app/moderacion/page.tsx
next.config.js        cabeceras de seguridad, CSP, HSTS
middleware.ts         redirección a HTTPS
tailwind.config.ts    (solo con Tailwind 3)
supabase/schema.sql   la base de datos
supabase/moderacion.sql
```

Sin `globals.css` el proyecto compila pero sale sin estilos: los tokens de
color (`--azul`, `--rojo`, `--nieve`) y las clases de los pines viven ahí.

## Cuál elegir

Para arrancar y ver algo funcionando, esta. Para un proyecto que vaya a
mantenerse en el tiempo, la versión en módulos: es más fácil de revisar, de
probar por partes y de repartir entre varias personas. Las dos producen
exactamente la misma aplicación.
