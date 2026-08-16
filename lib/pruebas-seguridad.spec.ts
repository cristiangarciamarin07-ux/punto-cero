// ============================================================================
// Pruebas de seguridad automatizadas · Playwright
// ----------------------------------------------------------------------------
//   npx playwright test seguridad/pruebas-seguridad.spec.ts
//
// Verifican los controles que se pueden romper sin darse cuenta al tocar el
// código: cabeceras, escapado de HTML, validación de archivos y aislamiento de
// la base. Convertirlas en un paso obligatorio del despliegue es lo que evita
// que una regresión llegue a producción.
// ============================================================================

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ---------------------------------------------------------------------------
test.describe('Cabeceras de seguridad', () => {
  test('la respuesta incluye todas las cabeceras defensivas', async ({ request }) => {
    const r = await request.get(BASE);
    const h = r.headers();

    expect(h['content-security-policy'], 'falta CSP').toBeTruthy();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).toContain("object-src 'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toContain('strict-origin');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['x-powered-by'], 'no debe revelar la tecnología').toBeUndefined();
  });

  test('HSTS presente en despliegues https', async ({ request }) => {
    test.skip(!BASE.startsWith('https'), 'solo aplica sobre TLS');
    const h = (await request.get(BASE)).headers();
    expect(h['strict-transport-security']).toContain('max-age=');
    const edad = Number(h['strict-transport-security'].match(/max-age=(\d+)/)?.[1] ?? 0);
    expect(edad, 'HSTS debe durar al menos un año').toBeGreaterThanOrEqual(31536000);
  });
});

// ---------------------------------------------------------------------------
test.describe('Inyección de contenido', () => {
  test('el texto con HTML se escapa, no se ejecuta', async ({ page }) => {
    let alertaDisparada = false;
    page.on('dialog', async (d) => { alertaDisparada = true; await d.dismiss(); });

    await page.goto(BASE);
    await page.getByRole('button', { name: 'Necesito ayuda' }).first().click();

    const carga = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    await page.locator('div[role=dialog] textarea').first().fill(carga);
    await page.waitForTimeout(600);

    expect(alertaDisparada, 'se ejecutó script inyectado').toBe(false);
    // React escapa por defecto: el texto debe seguir siendo texto.
    const valor = await page.locator('div[role=dialog] textarea').first().inputValue();
    expect(valor).toContain('<script>');
    expect(await page.locator('div[role=dialog] script').count()).toBe(0);
  });

  test('la búsqueda no interpreta HTML', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('input[type=search]').fill('<b>negrita</b>');
    await page.waitForTimeout(400);
    expect(await page.locator('main b').count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
test.describe('Carga de archivos', () => {
  test('rechaza un archivo que se hace pasar por imagen', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Necesito ayuda' }).first().click();

    // Un PHP renombrado a .jpg: la extensión miente, la firma binaria no.
    await page.locator('div[role=dialog] input[type=file]').setInputFiles({
      name: 'malicioso.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('<?php system($_GET["c"]); ?>'),
    });

    await expect(page.locator('div[role=dialog]')).toContainText(/no es una imagen válida/i);
  });

  test('rechaza SVG, que puede ejecutar scripts', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Necesito ayuda' }).first().click();
    await page.locator('div[role=dialog] input[type=file]').setInputFiles({
      name: 'vector.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    await expect(page.locator('div[role=dialog]')).toContainText(/no es una imagen válida/i);
  });

  test('el campo de archivo solo acepta tipos de imagen', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Necesito ayuda' }).first().click();
    const accept = await page.locator('div[role=dialog] input[type=file]').getAttribute('accept');
    expect(accept).toBe('image/jpeg,image/png,image/webp');
  });
});

// ---------------------------------------------------------------------------
test.describe('Consentimiento obligatorio', () => {
  test('no se puede publicar sin marcar la autorización', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Necesito ayuda' }).first().click();
    const d = page.locator('div[role=dialog]');

    await d.locator('input').first().fill('Tienda El Roble');
    await d.locator('select').nth(0).selectOption('Quindío');
    await d.locator('select').nth(1).selectOption('Armenia');
    await d.locator('input').nth(3).fill('Barrio La Patria, calle 26');
    await d.getByText('Alimentos y agua', { exact: true }).click();
    await d.locator('textarea').first().fill('Necesitamos agua potable y mercado para seis personas.');

    await d.getByRole('button', { name: /Publicar solicitud/i }).click();
    await expect(d).toContainText(/autorización expresa/i);
  });
});

// ---------------------------------------------------------------------------
test.describe('Aislamiento de la base de datos', () => {
  test.skip(!SUPABASE_URL || !ANON, 'requiere credenciales de Supabase');

  const cab = { apikey: ANON!, Authorization: `Bearer ${ANON!}` };

  test('la llave anon no puede leer la tabla base', async ({ request }) => {
    const r = await request.get(`${SUPABASE_URL}/rest/v1/solicitudes_ayuda?select=*`, { headers: cab });
    expect([401, 403, 404]).toContain(r.status());
  });

  test('la vista pública no expone el teléfono cifrado ni el token', async ({ request }) => {
    const r = await request.get(`${SUPABASE_URL}/rest/v1/solicitudes_publicas?select=*&limit=1`, { headers: cab });
    expect(r.ok()).toBe(true);
    const cuerpo = JSON.stringify(await r.json());
    expect(cuerpo).not.toContain('telefono_cifrado');
    expect(cuerpo).not.toContain('token_gestion');
    expect(cuerpo).not.toContain('nombre');
  });

  test('la llave anon no puede insertar directamente', async ({ request }) => {
    const r = await request.post(`${SUPABASE_URL}/rest/v1/solicitudes_ayuda`, {
      headers: { ...cab, 'Content-Type': 'application/json' },
      data: { alias_referencia: 'Intruso', departamento: 'X', municipio: 'Y' },
    });
    expect(r.ok()).toBe(false);
  });

  test('la RPC rechaza el registro sin consentimiento', async ({ request }) => {
    const r = await request.post(`${SUPABASE_URL}/rest/v1/rpc/crear_solicitud`, {
      headers: { ...cab, 'Content-Type': 'application/json' },
      data: {
        p_alias: 'Prueba', p_departamento: 'Quindío', p_municipio: 'Armenia',
        p_direccion_referencia: 'Calle 26', p_tipo_ayuda: 'ALIMENTOS',
        p_descripcion: 'Prueba automatizada de seguridad',
        p_consentimiento: false, p_politica_version: '2026.08-v2',
      },
    });
    expect(r.ok()).toBe(false);
    expect(await r.text()).toContain('CONSENTIMIENTO_REQUERIDO');
  });

  test('el bucket rechaza archivos que no sean JPEG', async ({ request }) => {
    const r = await request.post(`${SUPABASE_URL}/storage/v1/object/evidencias/solicitudes/prueba.php`, {
      headers: { ...cab, 'Content-Type': 'application/x-php' },
      data: '<?php echo 1; ?>',
    });
    expect(r.ok()).toBe(false);
  });
});
