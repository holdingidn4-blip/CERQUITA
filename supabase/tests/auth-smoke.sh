#!/usr/bin/env bash
# Prueba de humo del ingreso por SMS contra Supabase local (pnpm db:smoke).
# Usa los números de [auth.sms.test_otp]; no envía SMS reales.
set -euo pipefail
API=${SUPABASE_URL:-http://127.0.0.1:54321}
KEY=${SUPABASE_ANON_KEY:-$(supabase status -o json 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["ANON_KEY"])')}
fail() { echo "✗ $1"; exit 1; }
ok() { echo "✓ $1"; }
post() { curl -s -o /tmp/cerquita-smoke.json -w '%{http_code}' -H "apikey: $KEY" -H 'content-type: application/json' "$@"; }
field() { python3 -c "import json;d=json.load(open('/tmp/cerquita-smoke.json'));print(d$1 if not isinstance(d,list) else d[0]$1)" 2>/dev/null || true; }

login() { # $1 teléfono E.164
  [ "$(post "$API/auth/v1/otp" -d "{\"phone\":\"$1\"}")" = 200 ] || fail "pedir código para $1"
  [ "$(post "$API/auth/v1/verify" -d "{\"phone\":\"$1\",\"token\":\"123456\",\"type\":\"sms\"}")" = 200 ] || fail "verificar $1"
  field '["access_token"]'
}
account() { post "$API/rest/v1/rpc/my_account" -H "Authorization: Bearer $1" -X POST >/dev/null; }

[ "$(post "$API/auth/v1/verify" -d '{"phone":"+51900000001","token":"000000","type":"sms"}')" != 200 ] \
  && ok "un código incorrecto se rechaza" || fail "aceptó un código incorrecto"

T=$(login +51900000001); [ -n "$T" ] && ok "cliente ingresa con SMS"
account "$T"; [ "$(field '["active_role"]')" = client ] && ok "my_account: modo cliente" || fail "modo cliente"

[ "$(post "$API/rest/v1/profiles?id=eq.11111111-1111-1111-1111-111111111111" -X PATCH -H "Authorization: Bearer $T" -d '{"active_role":"pro"}')" = 204 ] \
  && ok "cambia a modo profesional" || fail "cambio de modo"
account "$T"; [ "$(field '["active_role"]')" = pro ] || fail "no guardó el modo"
post "$API/rest/v1/profiles?id=eq.11111111-1111-1111-1111-111111111111" -X PATCH -H "Authorization: Bearer $T" -d '{"active_role":"client"}' >/dev/null

T2=$(login +51900000002); account "$T2"
[ "$(field '["has_pro_trades"]')" = True ] && ok "profesional con oficios" || fail "pro sin oficios"

T9=$(login +51900000009); account "$T9"
[ "$(field '["staff_role"]')" = reviewer ] && ok "soporte recibe staff_role en el token" || fail "staff_role"
[ "$(post "$API/rest/v1/rpc/set_staff_role" -H "Authorization: Bearer $T" -d '{"p_user":"11111111-1111-1111-1111-111111111111","p_role":"admin"}')" != 200 ] \
  && ok "un cliente no puede darse rol de soporte" || fail "escalada de privilegios"
echo "Ingreso por SMS: todo bien"
