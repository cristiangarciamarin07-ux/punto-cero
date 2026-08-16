/** @type {import('next').NextConfig} */

// ============================================================================
// Cabeceras de seguridad.
// ----------------------------------------------------------------------------
// Sobre el certificado SSL: un certificado no se genera desde el código. Lo
// emite el proveedor donde se despliega (Vercel, Netlify y Cloudflare lo hacen
// automático con Let's Encrypt). Lo que sí depende de nosotros es OBLIGAR su
// uso, y eso es lo que hace HSTS: una vez el navegador ve esta cabecera, se
// niega a volver a conectarse por http durante dos años, aunque el usuario
// escriba la dirección a mano o siga un enlace inseguro.
// ============================================================================

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co';
const enDesarrollo = process.env.NODE_ENV !== 'production';

// El hot-reload de Next.js evalúa código en tiempo de ejecución, así que en
// desarrollo hace falta 'unsafe-eval'. En producción NO se incluye: si esta
// distinción se pierde, `npm run dev` sirve una página en blanco y la consola
// muestra "Refused to evaluate a string as JavaScript".
const scriptSrc = enDesarrollo
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  // Next.js inyecta scripts en línea para la hidratación. Para eliminar
  // 'unsafe-inline' en producción hay que pasar a CSP con nonce por petición
  // desde middleware.ts; queda anotado en README-SEGURIDAD.md.
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Teselas de OpenStreetMap, evidencias del bucket y data: para las vistas
  // previas locales antes de subir.
  `img-src 'self' data: blob: https://*.tile.openstreetmap.org ${supabaseHost}`,
  `connect-src 'self' ${supabaseHost} wss://*.supabase.co${enDesarrollo ? ' ws://localhost:*' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(enDesarrollo ? [] : ['upgrade-insecure-requests']),
].join('; ');

const cabeceras = [
  // Fuerza HTTPS durante 2 años, incluidos subdominios.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Ni cámara ni micrófono. La geolocalización sí, es la función del botón
  // "Usar mi ubicación", pero solo desde el propio origen.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // no anunciar la tecnología ni su versión
  compress: true,
  images: { formats: ['image/webp'] },
  async headers() {
    return [{ source: '/:path*', headers: cabeceras }];
  },
};

module.exports = nextConfig;
