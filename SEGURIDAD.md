# Controles de seguridad y cumplimiento · Punto Cero v2

Documento para quien despliega, audita o recibe la plataforma. Describe qué
protege cada control, dónde vive en el código y qué queda pendiente.

---

## 1. Habeas Data (Ley 1581 de 2012, Decreto 1377 de 2013)

| Exigencia legal | Implementación | Dónde |
|---|---|---|
| Aviso de privacidad visible antes de recoger datos | Bloque fijo en los dos formularios + documento completo enlazado desde el aviso y el pie | `components/Legales.tsx`, `lib/legal.ts` |
| Autorización previa, expresa e informada | Casilla obligatoria, **sin premarcar**. El formulario no envía sin ella y la base rechaza `consentimiento <> true` | `PlataformaAyuda.tsx`, restricción `check` en `solicitudes_ayuda` |
| Constancia de la autorización | Tabla `registro_consentimientos` con folio, contexto, finalidad, versión y fecha. Sobrevive a la supresión | `schema.sql` §3 |
| Finalidad determinada y limitada | Declarada en el aviso y repetida en la casilla: coordinar la entrega de ayuda. Nada más | `lib/legal.ts` |
| Derechos de consulta, rectificación, supresión y revocación | Sección «Gestionar mi registro» con folio + clave, sin cuenta | `revocar_consentimiento()`, `cerrar_solicitud()` |
| Prohibición de datos sensibles | No se piden. El aviso lo declara y pide no escribirlos | Modelo de datos |
| Responsable identificable | Constante `RESPONSABLE` — **hay que completarla antes de publicar** | `lib/legal.ts` |

**Versionado del consentimiento.** `VERSION_POLITICA` en el frontend debe
coincidir con `version_politica()` en la base. Si cambias un texto legal y no
subes la versión, quedan consentimientos asociados a un texto que la persona
nunca leyó. Si la subes solo en un lado, la base rechaza los registros con
`POLITICA_DESACTUALIZADA` hasta que se sincronicen: falla ruidosamente, que es
lo que se quiere aquí.

---

## 2. Anonimato

No existe columna de nombre ni de documento. El punto se identifica con un
alias de lugar («Tienda El Roble», «Casa 2»).

Tres barreras impiden que un dato personal entre por la puerta de atrás:

1. **Cliente** — `revisarAlias()` avisa antes de enviar.
2. **Base** — restricciones `check` que rechazan seis o más dígitos seguidos,
   arrobas y los patrones `CC`, `cédula`, `NIT` seguidos de número.
3. **Comunidad** — el motivo de reporte «Expone datos personales» está primero
   en la lista.

El teléfono es opcional. Si se entrega:

- Se cifra con `pgp_sym_encrypt` usando una llave que vive en **Supabase Vault**,
  nunca en el código ni en variables del frontend.
- La columna es `bytea` y ninguna vista pública la expone.
- Solo se descifra en `obtener_contacto()`, que registra cada consulta en
  `accesos_contacto`. Un scraping masivo deja rastro de cada acceso.

La verificación 3 de `seguridad/verificar-rls.sql` falla si alguien añade una
columna con `nombre`, `cedula`, `documento` o `identifica` en el nombre.

---

## 3. Cifrado en tránsito y en reposo

| Capa | Mecanismo |
|---|---|
| Tránsito navegador ↔ sitio | TLS del proveedor (Vercel/Cloudflare emiten Let's Encrypt automáticamente) + `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` |
| Tránsito sitio ↔ base | Supabase solo acepta conexiones TLS |
| Reposo, disco completo | Cifrado AES-256 de la infraestructura de Supabase |
| Reposo, campo sensible | Cifrado simétrico adicional del teléfono con llave en Vault |
| Redirección | `middleware.ts` fuerza 308 de http a https en el borde |

**Un certificado no se genera desde el código.** Lo emite el proveedor. Lo que
sí depende de nosotros es obligar su uso, y de eso se encarga HSTS: una vez el
navegador ve la cabecera, se niega a conectarse por http durante dos años,
aunque el usuario escriba la dirección a mano.

---

## 4. Cabeceras y CSP

Definidas en `next.config.js`: CSP, HSTS, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (cámara y
micrófono denegados; geolocalización solo desde el propio origen),
`Cross-Origin-Opener-Policy`. `poweredByHeader: false` evita anunciar la
versión de Next.js.

**Desarrollo y producción tienen CSP distintas.** El hot-reload evalúa código
en tiempo de ejecución, así que en desarrollo se añade `'unsafe-eval'`; en
producción no. Si se unifican por descuido, `npm run dev` sirve una página en
blanco con «Refused to evaluate a string as JavaScript» en la consola.

Pendiente: eliminar `'unsafe-inline'` de `script-src` en producción. Requiere
CSP con nonce por petición desde `middleware.ts`.

---

## 5. Carga de imágenes

Cuatro capas, de la más débil a la más fuerte:

1. `accept="image/jpeg,image/png,image/webp"` — comodidad, no seguridad: se
   salta desde las herramientas del navegador.
2. **Firma binaria** — `lib/imagen.ts` lee los primeros bytes. Un PHP renombrado
   a `.jpg` se rechaza aquí, porque la extensión miente y los números mágicos no.
3. **Re-codificación en canvas** — el control que de verdad importa. El archivo
   que se sube no es el que eligió la persona: son píxeles redibujados y vueltos
   a comprimir como JPEG. Cualquier carga incrustada (polyglot JPEG/HTML, payload
   en un bloque EXIF) desaparece. De paso se elimina la geolocalización que las
   cámaras guardan por defecto, que es un problema de privacidad tan serio como
   el de seguridad.
4. **Servidor** — el bucket `evidencias` acepta solo `image/jpeg`, máximo 3 MB,
   únicamente dentro de `solicitudes/`. Sin políticas de `UPDATE` ni `DELETE`:
   una evidencia subida no se sobrescribe desde el cliente.

SVG se rechaza siempre: es XML que puede ejecutar scripts.

---

## 6. Base de datos

- **RLS activo** en las seis tablas. El rol `anon` no tiene ningún privilegio
  directo: `revoke all`. Toda lectura pasa por vistas y toda escritura por
  funciones `SECURITY DEFINER` validadas.
- **`search_path` fijo** en cada función `SECURITY DEFINER`. Sin eso, un
  esquema controlado por el atacante puede secuestrar las llamadas internas.
- **El estado no se edita a mano.** Un trigger lo recalcula con
  `greatest(estado, estado_resultante)`: solo avanza.
- **Moderación automática.** Tres reportes retiran el punto de la vista pública
  y dejan constancia en el historial.
- **Límite de escritura.** Máximo 20 registros por municipio por minuto.

---

## 7. Pruebas de vulnerabilidad

```bash
npm run seguridad:auditoria                        # dependencias
npm run seguridad:pruebas                          # Playwright, 12 pruebas
bash seguridad/escanear.sh https://tu-sitio.app    # escaneo completo
# y en Supabase → SQL Editor: seguridad/verificar-rls.sql
```

`escanear.sh` encadena seis bloques: `npm audit`, gitleaks (secretos en el
repo, más una comprobación propia de que `service_role` no aparece en el
código), Semgrep con reglas OWASP Top Ten, testssl.sh sobre el certificado,
verificación de cabeceras y ZAP baseline. Cada bloque es independiente: si
falta una herramienta, avisa y sigue.

`pruebas-seguridad.spec.ts` cubre lo que se rompe sin darse cuenta al tocar el
código: cabeceras presentes, HTML escapado y no ejecutado, PHP renombrado y SVG
rechazados, consentimiento obligatorio, y —con credenciales— que la llave
`anon` no lee la tabla base, que las vistas no filtran `telefono_cifrado` ni
`token_gestion`, y que la RPC rechaza el registro sin consentimiento.

> **Advertencia legal.** Estos scripts solo deben apuntar a infraestructura
> propia. Escanear sistemas ajenos sin autorización escrita es delito en
> Colombia (Ley 1273 de 2009).

---

## 8. Antes de publicar

- [ ] Completar `RESPONSABLE` en `lib/legal.ts` con datos reales.
- [ ] Revisar los textos legales con un abogado. Los de este repositorio son un
      punto de partida técnico, no asesoría jurídica.
- [ ] Confirmar que existe el secreto `punto_cero_clave_contacto` en Vault.
- [ ] Ejecutar `verificar-rls.sql` y comprobar que los ocho controles pasan.
- [ ] Ejecutar `escanear.sh` contra la URL de producción.
- [ ] Definir quién modera. La moderación automática gana tiempo; no sustituye
      a una persona revisando.
- [ ] Añadir límite por IP en el borde (Vercel Edge Middleware o Cloudflare):
      el freno actual es por municipio y se puede evadir.
- [ ] Registrar la base ante la SIC si el volumen lo exige, y definir el
      procedimiento de atención de consultas y reclamos.
- [ ] Definir política de retención: estos datos no deberían vivir para siempre
      después de la emergencia.
