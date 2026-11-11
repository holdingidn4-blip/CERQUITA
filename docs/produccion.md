# Cerquita · Producción y pre-lanzamiento

## 1. Supabase (base, funciones y cron)

| Paso | Cómo |
| --- | --- |
| Proyecto | Crear el proyecto en la región más cercana (São Paulo, `sa-east-1`). Plan con backups diarios. |
| Migraciones | `bash scripts/deploy-production.sh` (vincula, `db push --dry-run`, pide confirmación y aplica las 13 migraciones). Habilita `pg_cron` y `pg_net`. |
| Cron | Quedan programados: `purge-job-tracks` (rastro GPS a 30 días), `detect-bypass` (cada 5 min), `dispatch-push` (cada minuto) y `purge-outbox` (30 días). Verificar en Dashboard → Integrations → Cron. |
| Edge Function | `send-push` (Expo Push). El script la despliega, guarda `PUSH_FUNCTION_SECRET` en secrets y en Vault, y fija `settings.push_function_url`. |
| SMS | Dashboard → Authentication → Providers → Phone: Twilio (o MessageBird/Vonage) con las credenciales de `.env.production.example`. Plantilla: “Tu código de Cerquita es {{ .Code }}. No lo compartas con nadie.” **No** cargar los números de `test_otp`. |
| Anti-abuso SMS | Dashboard → Authentication → Hooks → **Before user created** → `public.hook_before_user_created` (solo +51 9XXXXXXXX). Rate limits sugeridos: SMS 60/h, sign-in 10 por 5 min por IP, verificaciones 15 por 5 min por IP. Captcha: Turnstile u hCaptcha (Supabase no soporta reCAPTCHA v3); exige enviar `captchaToken` desde la app y el panel. |
| Storage | Los buckets se crean con las migraciones. La limpieza (`storage-cleanup.yml`) corre cada hora: activar con la variable `STORAGE_CLEANUP_ENABLED=true` y los secretos `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en GitHub. |
| Datos del piloto | `supabase/seed_huancayo_production.sql` (lo corre el script). **Valores estimados: validarlos antes.** Datos de Yape/Plin en el panel → Parámetros. |
| Soporte | `ADMIN_PHONES` / `REVIEWER_PHONES` → `node apps/admin/scripts/seed-staff.mjs` (lo corre el script). |

## 2. App móvil (EAS)

```bash
cd apps/mobile
npx eas-cli@latest init                 # crea el proyecto y su EAS_PROJECT_ID
npx eas-cli@latest env:create --environment production   # cada variable de .env.production.example (bloque App móvil)
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform android   # prueba interna de Google Play
npx eas-cli@latest submit --profile production --platform ios       # TestFlight
npx eas-cli@latest update --channel production --message "fix: ..."  # corrección OTA (expo-updates)
```

- **Push:** iOS necesita la clave APNs (EAS la genera en el primer build). Android, las credenciales FCM v1 en EAS (`eas credentials`).
- **Ubicación en segundo plano:** Google Play exige declarar `ACCESS_BACKGROUND_LOCATION` con un video del flujo (pantalla 13 → permiso). Apple revisa el texto de `NSLocationAlwaysAndWhenInUseUsageDescription`.
- **Sentry:** `EXPO_PUBLIC_SENTRY_DSN` activa el registro; `SENTRY_ORG`, `SENTRY_PROJECT` y `SENTRY_AUTH_TOKEN` suben los source maps.

## 3. Panel de soporte (Next.js)

Hosting con Node 22 (Vercel u otro). Variables: bloque “Panel admin” de `.env.production.example`. Proteger con dominio propio y, si se puede, acceso por IP o SSO. Los errores del servidor salen como JSON en los logs (`src/instrumentation.ts`).

## 4. Checklist manual antes de publicar

### Cuentas y tiendas
- [ ] Apple Developer Program (USD 99/año): persona u organización (con D-U-N-S si es empresa).
- [ ] Google Play Console (USD 25): cuenta de organización recomendada; verificación de identidad.
- [ ] Prueba cerrada de Google Play: **12 testers durante 14 días seguidos** antes de producción.
- [ ] Ficha de las tiendas: capturas, descripción, clasificación de contenido, “Seguridad de los datos” (Play) y “Privacy Nutrition Labels” (Apple), justificación de ubicación en segundo plano.
- [ ] Ajustar `bundleIdentifier`/`package` (`pe.cerquita.app`) si cambia el titular.

### Legal (Perú)
- [ ] Términos y Política de privacidad **revisados por un abogado** (borrador en `docs/legal/terminos-borrador.md`) y publicados en web → `EXPO_PUBLIC_*_URL`.
- [ ] Registro del banco de datos personales ante la Autoridad Nacional de Protección de Datos Personales (Ley 29733).
- [ ] Libro de Reclamaciones virtual (Indecopi) enlazado desde la app y la web.
- [ ] Definir el Seguro Cerquita y la Garantía por 30 días antes de mostrarlos como beneficio.
- [ ] Plazos de retención de datos y protocolo de aviso de filtración en 48 h.

### Credenciales de producción
- [ ] Proveedor SMS contratado con remitente para Perú y presupuesto mensual.
- [ ] Yape/Plin/cuenta de la empresa cargados en Parámetros (y QR).
- [ ] Clave de Google Maps restringida a la app Android.
- [ ] Proyecto de Sentry (móvil) y DSN.
- [ ] Token de acceso de Expo para push.
- [ ] Rotar las claves locales de ejemplo: ninguna clave de desarrollo en producción.

### Datos del piloto
- [ ] Validar el tarifario de Huancayo con profesionales del rubro.
- [ ] Validar precios de referencia de Promart, Sodimac y Maestro.
- [ ] Números de emergencia 105, 116 y 106 verificados.
- [ ] Alta de los primeros administradores y revisores.
