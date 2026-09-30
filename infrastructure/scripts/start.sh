#!/bin/bash
# ═══════════════════════════════════════════════════════════
# TokenSentry — Production Startup Script
# ═══════════════════════════════════════════════════════════
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== TokenSentry Production Startup ==="

# 1. Generate DH param if missing
if [ ! -f nginx/ssl/dhparam.pem ]; then
  echo "[1/6] Generating DH param (2048-bit)..."
  mkdir -p nginx/ssl
  openssl dhparam -out nginx/ssl/dhparam.pem 2048
else
  echo "[1/6] DH param exists, skipping"
fi

# 2. Check .env
if [ ! -f .env ]; then
  echo "[2/6] ERROR: .env file not found. Copy .env.example and fill in secrets."
  exit 1
fi
echo "[2/6] .env file found"

# 3. Pull images
echo "[3/6] Pulling Docker images..."
docker compose pull --quiet 2>/dev/null || true

# 4. Start infrastructure (PG + Valkey first, then everything else)
echo "[4/6] Starting services..."
docker compose up -d postgres valkey
echo "  Waiting for postgres..."
sleep 5

# 5. Build and start remaining services
docker compose up -d --build

# 6. Verify health
echo "[5/6] Verifying health..."
for i in {1..12}; do
  sleep 5
  STATUS=$(curl -sf http://localhost:3000/health/ready 2>/dev/null || echo "")
  if echo "$STATUS" | grep -q '"status":"ok"'; then
    echo "  API healthy"
    break
  fi
  echo "  Waiting for API... (attempt $i/12)"
done

if curl -sf -o /dev/null http://localhost:3001; then
  echo "  Dashboard responding"
fi

# 7. Issuing SSL (first run only)
echo "[6/6] Checking SSL certificates..."
if [ ! -d "certbot_conf/live" ]; then
  echo "  No SSL certs found. Issuing..."
  docker compose run --rm certbot certonly --webroot \
    -w /var/www/certbot \
    -d api.tokensentry.ai -d app.tokensentry.ai \
    -d tokensentry.ai -d www.tokensentry.ai \
    --email "${CERTBOT_EMAIL:-admin@tokensentry.ai}" \
    --agree-tos --non-interactive || echo "  SSL issuance skipped (DNS may not be ready)"
fi

docker compose restart nginx

echo ""
echo "=== Startup Complete ==="
echo "  API:       https://api.tokensentry.ai/health/ready"
echo "  Dashboard: https://app.tokensentry.ai"
echo "  Website:   https://tokensentry.ai"
echo ""
echo "  View logs: docker compose logs --tail=50 -f api"
