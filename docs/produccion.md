# Cerquita · Producción y pre-lanzamiento

## 0. Entornos reales (piloto)

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Base, Auth y Storage | Supabase `cerquita` · ref `dknxuxrylnncbdzjqagh` · São Paulo · plan gratis | Activo |
| App Android | APK por enlace (ver “APK del piloto”) | EAS `pilot` 2cb6a8ae (23-11, con F3); 6b8f8911 y build 4 de CI quedan como anteriores |
| Panel | Vercel · proyecto `cerquita` (rama `main`, carpeta `apps/admin`) · https://cerquita-nine.vercel.app | Desplegado (cada push a `main` despliega) |
| App Android (tiendas) | EAS · `@holdingidn/cerquita` · perfil `production` (AAB, llave de firma guardada en EAS) | Build 2 listo (`a1a6c154`, se descarga desde expo.dev) |
| Notificaciones | Edge Function `send-push` (secreto en Vault `push_function_secret`) | Activa |
| Proyecto antiguo | Supabase `cerquita-demo` (`vfquejeijminjxxyozqg`) | Pausado y vacío: se puede borrar |

URL de la API: `https://dknxuxrylnncbdzjqagh.supabase.co` · clave publicable: `sb_publishable_qRc_QYms7-tiIrZ6pBy8wQ_dItg6UcJ` (pública; va dentro de la app).

### Aplicar SQL en producción desde una sesión de Claude (sin puerto 5432 ni token personal)
**Desde el 24/11/2026, sin tablas temporales** (decisión del dueño):
1. Probar la migración en local con pgTAP (`pnpm db:reset && pnpm db:test`).
2. Aplicarla con el conector de Supabase **`apply_migration`** (nombre en snake_case y el contenido exacto del archivo). El conector registra su propia versión con la hora; **renombrar el archivo local a esa versión** para que repo y producción coincidan.
3. Verificar con `execute_sql` (solo lectura): versión registrada, objetos creados, `md5(pg_get_functiondef(...))` de las funciones tocadas igual a la local, `anon` sin ejecutar funciones y ninguna tabla sin RLS.
4. Los valores nuevos de un enum van en una migración anterior a la que los usa.
Con un token personal válido o acceso directo, usar `scripts/deploy-production.sh`.

### APK del piloto
- **EAS (llave privada, perfil `pilot`), actual:** build `2cb6a8ae` (versión 0.1.0, versionCode 4, commit `a754876`, con F3): https://expo.dev/artifacts/eas/URTB_4V9TR8KwUgor5yyPWvb8EH5BTzIGBADL-3tKNQ.apk
- Anterior EAS: build `6b8f8911` (versión 0.1.0, versionCode 3, commit `f7bf0b4`): https://expo.dev/artifacts/eas/SsUjGSY0ZqAG8mVhXqekhHnIJ2SLpNu4JMECA7Kpb74.apk — anterior a F3 (no sube fotos de antes/después): compilar uno nuevo antes de probar cierres. Quien tenga el build 4 debe desinstalarlo una vez (cambió la llave).
- Último de CI con llave de depuración (build 4, versión 0.1.0, commit `c6a5702`): `https://dknxuxrylnncbdzjqagh.supabase.co/storage/v1/object/public/app-releases/5e1760089bccbb16/cerquita-0.1.0-b4.apk`
- Anteriores: build 3 `…/app-releases/d42abfae6a1e6a66/cerquita-0.1.0-b3.apk` · build 2 `…/app-releases/4c31a5fe1f42a03a/cerquita-0.1.0-b2.apk`
- Para un build nuevo:
  1. Elegir una carpeta aleatoria (`openssl rand -hex 8`) y crear por SQL la política temporal de subida:
     `create policy "releases: subida temporal del CI" on storage.objects for insert to anon with check (bucket_id = 'app-releases' and (storage.foldername(name))[1] = '<carpeta>');`
  2. `git push origin main:refs/heads/apk/<carpeta>` (dispara `.github/workflows/android-apk.yml`; tarda unos 20 minutos).
  3. Leer `APK_URL=` en el log (`gh run view <id> --log`) y comprobar el enlace. El job “Arranque en emulador” abre la app y sube una captura.
  4. Borrar la política: `drop policy "releases: subida temporal del CI" on storage.objects;`
- El APK va firmado con la llave de depuración de la plantilla (igual en todos los builds, así se instala encima del anterior). Antes de publicar en tiendas hay que pasar a EAS o a una llave propia.
- Límite de Storage en el plan gratis: 50 MB por archivo (por eso `expo.useLegacyPackaging=true`).

## 1. Supabase (base, funciones y cron)

| Paso | Cómo |
| --- | --- |
| Proyecto | Crear el proyecto en la región más cercana (São Paulo, `sa-east-1`). Plan con backups diarios. |
| Migraciones | `bash scripts/deploy-production.sh` (vincula, `db push --dry-run`, pide confirmación y aplica las 13 migraciones). Habilita `pg_cron` y `pg_net`. |
| Cron | Quedan programados: `purge-job-tracks` (rastro GPS a 30 días), `detect-bypass` (cada 5 min), `dispatch-push` (cada minuto), `purge-outbox` (30 días), `storage-cleanup` (cada hora) y `schedule-reminders` (cada 5 min). Su estado se ve en Panel → Sistema. Verificar en Dashboard → Integrations → Cron. |
| Edge Function | `send-push` (Expo Push). El script la despliega, guarda `PUSH_FUNCTION_SECRET` en secrets y en Vault, y fija `settings.push_function_url`. |
| SMS | Dashboard → Authentication → Providers → Phone: Twilio (o MessageBird/Vonage) con las credenciales de `.env.production.example`. Plantilla: “Tu código de Cerquita es {{ .Code }}. No lo compartas con nadie.” **No** cargar los números de `test_otp`. |
| Anti-abuso SMS | Dashboard → Authentication → Hooks → **Before user created** → `public.hook_before_user_created` (solo +51 9XXXXXXXX). Rate limits sugeridos: SMS 60/h, sign-in 10 por 5 min por IP, verificaciones 15 por 5 min por IP. Captcha: Turnstile u hCaptcha (Supabase no soporta reCAPTCHA v3); exige enviar `captchaToken` desde la app y el panel. |
| Storage | Los buckets se crean con las migraciones. La limpieza corre cada hora con pg_cron (`private.dispatch_storage_cleanup` → Edge Function `storage-cleanup`, secreto de Vault, sin llave en GitHub). Arranca en modo prueba: solo cuenta huérfanos; para borrarlos, Panel → Parámetros → `storage_cleanup_enabled` = 1. Deploy: `supabase functions deploy storage-cleanup --no-verify-jwt` y fijar `storage_cleanup_url`. |
| Datos del piloto | `supabase/seed_huancayo_production.sql` (lo corre el script). **Valores estimados: validarlos antes.** Datos de Yape/Plin en el panel → Parámetros. |
| Soporte | `ADMIN_PHONES` / `REVIEWER_PHONES` → `node apps/admin/scripts/seed-staff.mjs` (lo corre el script). |

## 2. App móvil (EAS)

```bash
cd apps/mobile
# Proyecto ya creado: @holdingidn/cerquita (projectId en app.json). En la sesión en la nube: EXPO_TOKEN=proxy-injected eas …
npx eas-cli@latest init                 # crea el proyecto y su EAS_PROJECT_ID
npx eas-cli@latest env:create --environment production   # cada variable de .env.production.example (bloque App móvil)
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform android   # prueba interna de Google Play
npx eas-cli@latest submit --profile production --platform ios       # TestFlight
npx eas-cli@latest update --channel production --message "fix: ..."  # corrección OTA (expo-updates)
```

- Variables ya cargadas en EAS (entorno `production`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_ENV=pilot`. El `versionCode` lo lleva EAS (`appVersionSource: remote`, `autoIncrement`).
- **Push:** iOS necesita la clave APNs (EAS la genera en el primer build). Android, las credenciales FCM v1 en EAS (`eas credentials`).
- **Ubicación en segundo plano:** Google Play exige declarar `ACCESS_BACKGROUND_LOCATION` con un video del flujo (pantalla 13 → permiso). Apple revisa el texto de `NSLocationAlwaysAndWhenInUseUsageDescription`.
- **Sentry:** `EXPO_PUBLIC_SENTRY_DSN` activa el registro; `SENTRY_ORG`, `SENTRY_PROJECT` y `SENTRY_AUTH_TOKEN` suben los source maps.

## 3. Panel de soporte (Next.js)

**Variables en Vercel (solo estas dos):** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). El panel **no** usa `SUPABASE_SERVICE_ROLE_KEY`: si la integración de Supabase la agregó, se puede borrar del proyecto de Vercel. Primer administrador: entrar una vez con el celular y asignar el rol por SQL (`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"staff_role":"admin"}' where phone = '519XXXXXXXX'`) o con `staff:set`.


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
