#!/usr/bin/env bash
# Start the TokenSentry single-host Compose deployment.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env is missing. Copy .env.example and configure the required values."
  exit 1
fi

for domain in api.tokensentry.ai app.tokensentry.ai tokensentry.ai; do
  cert="certbot_conf/live/$domain"
  if [ ! -f "$cert/fullchain.pem" ] || [ ! -f "$cert/privkey.pem" ]; then
    echo "ERROR: TLS certificate for $domain is missing from $cert."
    echo "Provision the initial certificates before starting the Compose stack."
    exit 1
  fi
done

if [ ! -f nginx/ssl/dhparam.pem ]; then
  echo "Generating 2048-bit NGINX Diffie-Hellman parameters..."
  mkdir -p nginx/ssl
  openssl dhparam -out nginx/ssl/dhparam.pem 2048
fi

docker compose pull --quiet postgres valkey nginx certbot pgbackup

echo "Starting PostgreSQL and Valkey..."
docker compose up -d postgres valkey

echo "Building and starting TokenSentry services..."
docker compose up -d --build

echo "Checking API readiness..."
api_ready=0
for attempt in {1..12}; do
  if docker compose exec -T api node -e "fetch('http://localhost:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    api_ready=1
    break
  fi
  echo "Waiting for API readiness (attempt $attempt/12)..."
  sleep 5
done

if [ "$api_ready" -ne 1 ]; then
  echo "ERROR: API did not become ready. Check docker compose logs api."
  exit 1
fi

echo "TokenSentry API is ready."
docker compose ps
