import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Redirección a HTTPS y refuerzo de cabeceras en el borde.
// Vercel y Cloudflare ya redirigen, pero en un despliegue propio detrás de un
// proxy esta comprobación es la que evita que el tráfico viaje en claro.
// ============================================================================

export function middleware(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto');
  const host = req.headers.get('host') ?? '';
  const esLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (proto === 'http' && !esLocal) {
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noai, noimageai');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
