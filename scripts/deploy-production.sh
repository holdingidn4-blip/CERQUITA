#!/usr/bin/env bash
# Despliegue a producción de Supabase: migraciones, Edge Function, secretos y datos del piloto.
# Uso: set -a; source .env.production; set +a; bash scripts/deploy-production.sh
# Requiere: supabase CLI con login (supabase login) y las variables de .env.production.example.
set -euo pipefail
: "${SUPABASE_PROJECT_REF:?Falta SUPABASE_PROJECT_REF}"
: "${SUPABASE_DB_PASSWORD:?Falta SUPABASE_DB_PASSWORD}"
: "${PUSH_FUNCTION_SECRET:?Falta PUSH_FUNCTION_SECRET}"
SB="pnpm dlx supabase@3"

echo "1/6 · Vincular proyecto ${SUPABASE_PROJECT_REF}"
$SB link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

echo "2/6 · Migraciones pendientes (revisión previa)"
$SB db push --dry-run
read -r -p "¿Aplicar estas migraciones en PRODUCCIÓN? (escribe si) " ok
[ "$ok" = "si" ] || { echo "Cancelado."; exit 1; }
$SB db push   # incluye pg_cron y pg_net (purga de ubicaciones, antifraude y envío push)

echo "3/6 · Edge Function send-push"
$SB functions deploy send-push --no-verify-jwt --project-ref "$SUPABASE_PROJECT_REF"
$SB secrets set --project-ref "$SUPABASE_PROJECT_REF" PUSH_FUNCTION_SECRET="$PUSH_FUNCTION_SECRET" ${EXPO_ACCESS_TOKEN:+EXPO_ACCESS_TOKEN="$EXPO_ACCESS_TOKEN"}

echo "4/6 · Vault y URL de la función (pg_cron la llama cada minuto)"
DB_URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
psql "${DATABASE_URL:-$DB_URL}" -v ON_ERROR_STOP=1 -v secret="$PUSH_FUNCTION_SECRET" -v url="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/send-push" <<'SQL'
select vault.create_secret(:'secret', 'push_function_secret')
where not exists (select 1 from vault.secrets where name = 'push_function_secret');
update public.settings set value = to_jsonb(:'url'::text) where key = 'push_function_url' and scope = 'global';
SQL

echo "5/6 · Datos del piloto Huancayo (tarifario y catálogo: revisa los valores antes)"
psql "${DATABASE_URL:-$DB_URL}" -v ON_ERROR_STOP=1 -f supabase/seed_huancayo_production.sql

echo "6/6 · Usuarios de soporte (admin y reviewer)"
NEXT_PUBLIC_SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co" node apps/admin/scripts/seed-staff.mjs

echo "Listo. Pendiente manual: proveedor SMS y hook “before user created” en el Dashboard (ver docs/produccion.md)."
