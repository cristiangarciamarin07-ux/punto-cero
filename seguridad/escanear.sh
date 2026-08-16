#!/usr/bin/env bash
# ============================================================================
# Escaneo de vulnerabilidades · Punto Cero
# ----------------------------------------------------------------------------
# Uso:   ./seguridad/escanear.sh https://tu-sitio.vercel.app
#        ./seguridad/escanear.sh http://localhost:3000     (durante desarrollo)
#
# Requiere: node, npm y docker. Las herramientas pesadas corren en contenedor
# para no ensuciar la máquina. Cada bloque es independiente: si una herramienta
# no está disponible, el script avisa y sigue con las demás.
#
# ESTE SCRIPT SOLO DEBE APUNTAR A SITIOS PROPIOS. Escanear infraestructura
# ajena sin autorización escrita es un delito en Colombia (Ley 1273 de 2009).
# ============================================================================

set -uo pipefail

OBJETIVO="${1:-http://localhost:3000}"
SALIDA="seguridad/informes/$(date +%Y%m%d-%H%M)"
mkdir -p "$SALIDA"

azul() { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }
falla() { printf '\033[1;31m  ✗ %s\033[0m\n' "$1"; }
ok() { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }

echo "Objetivo: $OBJETIVO"
echo "Informes: $SALIDA"

# ---------------------------------------------------------------------------
azul "1/6 · Dependencias con vulnerabilidades conocidas"
npm audit --audit-level=moderate --json > "$SALIDA/npm-audit.json" 2>/dev/null
CRIT=$(node -e "try{const a=require('./$SALIDA/npm-audit.json');const v=a.metadata.vulnerabilities;console.log((v.critical||0)+(v.high||0))}catch(e){console.log(0)}")
if [ "$CRIT" -gt 0 ]; then
  falla "$CRIT vulnerabilidades altas o críticas. Revisa $SALIDA/npm-audit.json"
  npm audit --audit-level=high || true
else
  ok "Sin vulnerabilidades altas ni críticas en dependencias"
fi

# ---------------------------------------------------------------------------
azul "2/6 · Secretos filtrados en el repositorio"
if command -v docker >/dev/null; then
  docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect \
    --source=/repo --no-git --redact --report-path=/repo/"$SALIDA"/gitleaks.json \
    && ok "Sin secretos expuestos" || falla "Posibles secretos: revisa $SALIDA/gitleaks.json"
else
  falla "docker no disponible; omitido gitleaks"
fi

# Comprobación propia: la llave service_role jamás debe estar en el código.
if grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
     -e 'service_role' -e 'SERVICE_ROLE' . 2>/dev/null | grep -v 'seguridad/' | grep -v '.md:'; then
  falla "Aparece 'service_role' en el código. Esa llave salta todas las protecciones."
else
  ok "La llave service_role no aparece en el código"
fi

# ---------------------------------------------------------------------------
azul "3/6 · Análisis estático del código (Semgrep, reglas OWASP)"
if command -v docker >/dev/null; then
  docker run --rm -v "$PWD:/src" returntocorp/semgrep semgrep \
    --config=p/owasp-top-ten --config=p/react --config=p/typescript \
    --error --json --output=/src/"$SALIDA"/semgrep.json /src \
    && ok "Sin hallazgos de Semgrep" || falla "Hallazgos en $SALIDA/semgrep.json"
else
  falla "docker no disponible; omitido semgrep"
fi

# ---------------------------------------------------------------------------
azul "4/6 · Configuración TLS y certificado"
if [[ "$OBJETIVO" == https://* ]]; then
  HOST=$(echo "$OBJETIVO" | sed -E 's#https://([^/]+).*#\1#')
  if command -v docker >/dev/null; then
    docker run --rm drwetter/testssl.sh --quiet --color 0 \
      --severity MEDIUM "$HOST" > "$SALIDA/testssl.txt" 2>&1 \
      && ok "TLS revisado: $SALIDA/testssl.txt" || falla "Revisa $SALIDA/testssl.txt"
  fi
  echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates > "$SALIDA/certificado.txt" 2>/dev/null \
    && ok "Certificado: $(grep notAfter "$SALIDA/certificado.txt")"
else
  falla "Objetivo en http: se omite el análisis de TLS (normal en localhost)"
fi

# ---------------------------------------------------------------------------
azul "5/6 · Cabeceras de seguridad"
CAB=$(curl -sSI "$OBJETIVO" 2>/dev/null)
echo "$CAB" > "$SALIDA/cabeceras.txt"
for h in "strict-transport-security" "content-security-policy" "x-content-type-options" \
         "x-frame-options" "referrer-policy" "permissions-policy"; do
  if echo "$CAB" | grep -qi "^$h:"; then ok "$h"; else falla "Falta $h"; fi
done
if echo "$CAB" | grep -qi "^x-powered-by:"; then
  falla "x-powered-by revela la tecnología: desactiva poweredByHeader"
else
  ok "Sin x-powered-by"
fi

# ---------------------------------------------------------------------------
azul "6/6 · Escaneo dinámico OWASP ZAP (baseline)"
if command -v docker >/dev/null; then
  docker run --rm -v "$PWD/$SALIDA:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
    zap-baseline.py -t "$OBJETIVO" -r zap.html -I \
    && ok "Informe ZAP: $SALIDA/zap.html" || falla "ZAP encontró avisos: $SALIDA/zap.html"
else
  falla "docker no disponible; omitido ZAP"
fi

azul "Listo. Revisa $SALIDA"
