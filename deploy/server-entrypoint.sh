#!/bin/sh
set -e

echo "Applying database migrations..."
node_modules/.bin/prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "Seeding demo data (idempotent)..."
  node_modules/.bin/tsx prisma/seed.ts
fi

exec "$@"
