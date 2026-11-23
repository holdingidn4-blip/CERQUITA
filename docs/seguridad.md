# Cerquita · Seguridad (F1, 2026-11-23)

Evidencia real de cada punto. Las pruebas en producción corrieron dentro de transacciones revertidas: no quedó ningún dato de prueba (se comprobó con una consulta posterior: 0 usuarios de prueba).

| # | Qué se pidió | Evidencia | Resultado |
| --- | --- | --- | --- |
| 1 | Eliminar la cuenta de un profesional con documentos ya revisados | Producción: pro con DNI + vista registrada por soporte → `delete_my_account()` como ese pro | Documentos 0 · vista de soporte conservada 1 · perfil anonimizado · acceso bloqueado (sin teléfono, `banned_until = infinity`). **OK** |
| 2 | El panel no usa `service_role` | Código: el panel solo lee `NEXT_PUBLIC_SUPABASE_URL`, `…ANON_KEY`/`…PUBLISHABLE_KEY` y `…PROXY_PATH`; los documentos se firman con la sesión de soporte. Se borró el script viejo `storage-cleanup.mjs` (usaba la llave) | **OK en código.** En Vercel siguen variables secretas que puso la integración de Supabase y no se usan: las borra el dueño (lista abajo) |
| 3 | Funciones con permiso público y advisors | Producción: `anon` ejecuta 0 funciones de `public`. `authenticated` ejecuta 59 RPC `security definer`: todas son de la app o del panel y validan sesión o rol adentro. Con un usuario común: las 14 de soporte responden 42501 o vacío; `pro_debt` de otro pro → 42501 | **OK.** Se retiró `job_counterpart_phone` (siempre devolvía null). Advisors corregidos: 33 claves foráneas sin índice → 0; 5 tablas con dos políticas para la misma acción → 0 (migración `20261123000100`, mismas reglas de acceso, prueba `hardening` 14/14 y e2e 154 en verde) |
| 4 | Panel desplegado sin sesión ni datos de otros roles | Vercel: `/parametros`, `/usuarios/<id>` y `/documentos/<id>` sin sesión → `/login` (`x-matched-path: /login`). e2e: profesional sin rol → `/no-autorizado`; la revisora ve parámetros y tarifario en solo lectura; la base rechaza igual (punto 3) | **OK** |
| 5 | Enlace público del APK | El APK no trae secretos (URL + clave publicable, que son públicas) y sin código SMS no se entra. **Riesgo real encontrado:** el APK del CI va firmado con la llave de depuración de la plantilla, que es pública: alguien podría firmar una app falsa que se instale encima como "actualización" | **Aceptable para el piloto solo hasta F8**: el APK de pruebas nuevo se compila con EAS y la llave privada que ya está en EAS (la misma del AAB). Al cambiar de llave hay que desinstalar el APK anterior una vez |

## Avisos que quedan y por qué
- **83 "Signed-In Users Can Execute SECURITY DEFINER Function"** (59 en F1 + 24 de F3 y F4): intencionales. Son la API de la app (la lógica vive en la base). Cada una valida `auth.uid()` o el rol de soporte (`private.is_support()` en lista negra, supervisión y capacitaciones; pgTAP `reputation` y `trainings` prueban 42501 con usuario común y con la revisora); ver prueba del punto 3.
- **`notification_outbox` con RLS y sin políticas (INFO):** intencional. Nadie la lee desde la app; solo funciones del servidor.
- **Protección de contraseñas filtradas:** no aplica, el ingreso es solo por SMS.
- **10 índices sin uso (INFO):** normal sin tráfico real; se revisan con datos del piloto.

## Lo que hace el dueño
1. Vercel → proyecto `cerquita` → Settings → Environment Variables (https://vercel.com/holdingidn4-3141/cerquita/settings/environment-variables): borrar `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DATABASE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_PUBLISHABLE_KEY`. **No borrar** las tres `NEXT_PUBLIC_SUPABASE_*`. No desconectar la integración entera: también trajo las `NEXT_PUBLIC_*`.
2. Decidir si se activa el borrado de archivos huérfanos (`storage_cleanup_enabled = 1` en Panel → Parámetros). Hoy solo cuenta. Mientras esté en 0, las fotos de DNI de una cuenta eliminada siguen en Storage (privadas) aunque ya no tengan fila.
3. Autorizar (o no) borrar los APK viejos (builds 2, 3 y 4) cuando exista el APK firmado con EAS.
