# Cerquita · Estado

Actualizado: 2026-11-15. Se **reescribe** en cada tarea (máx. 100 líneas, sin historial; el historial está en git y `docs/progreso.md`).

## Implementado
- Monorepo pnpm: app Expo (`apps/mobile`), panel Next.js (`apps/admin`), lógica compartida (`packages/shared`), Supabase (13 migraciones).
- Ingreso por SMS (OTP), selector Cliente/Profesional, hook que solo admite +51 9XXXXXXXX, roles de soporte.
- Registro del profesional y verificación por oficio: 9 oficios, 4 categorías, requisitos por categoría, cola y revisión en el panel.
- Pedidos: tarifario sin regateo, fotos, video de diagnóstico (15 s, 48 h), visita de diagnóstico S/ 20, programación.
- Matching en el servidor: oficio aprobado + en línea + radio + sin pausa/bloqueo; lista negra de direcciones.
- Cotizaciones: una por pro, dentro del tarifario; aceptación congela precio y tasa; dirección exacta solo tras aceptar.
- Servicio: código de 4 dígitos, ubicación en vivo, reevaluación en sitio con materiales y boleta, cierre y confirmación.
- Comisión 10 % solo sobre mano de obra; libro inmutable; pausa por deuda (S/ 30, 3 días); tarifa de visita.
- Pagos de comisión por Yape/Plin/transferencia con constancia y aprobación de soporte; datos de cobro en Parámetros.
- Chat interno con filtro de teléfonos, correos y palabras clave; el teléfono nunca se muestra.
- Puntos del cliente, ranking de profesionales, reclamos, reportar/bloquear, tickets de soporte.
- Seguridad: SOS, contactos de confianza, eliminar cuenta, antifraude GPS (bypass), suspensión manual, reversión de asientos.
- Notificaciones push: cola `notification_outbox`, cron y Edge Function `send-push` (código listo, sin desplegar).
- Panel: Buscar, Verificación, Constancias, SOS, Sospechas, Soporte, Reportes, Reclamos, Lista negra, Tarifario, Parámetros, fichas.
- Mapa: sin clave de Google Maps en Android se muestra una vista simple (la app ya no depende de la clave).

## Desplegado (producción del piloto)
- **Backend:** Supabase `cerquita` (`dknxuxrylnncbdzjqagh`, São Paulo, plan gratis). 13 migraciones, seed de Huancayo, 29 tablas con RLS, 4 tareas cron.
- **APK Android:** build 2 (0.1.0), 35,7 MB, arm64 + armv7, apunta a producción. Enlace y procedimiento en `docs/produccion.md` → “APK del piloto”.
- El APK se compila en GitHub Actions (`.github/workflows/android-apk.yml`) al subir una rama `apk/<carpeta>` y se publica en Storage (`app-releases`).

## Pruebas (última corrida)
- CI en `main` (commit `0403642`, 2026-11-15): 153 unitarias, pgTAP completo y 92 pasos e2e. Todo en verde.
- APK build 2: arranque en emulador Android 14 (API 34) OK; muestra la pantalla de ingreso. Verificado: enlace 200, ABIs y URL de producción dentro del APK.
- Producción: lectura anónima de oficios OK; lectura anónima de pedidos rechazada (401).
- **No probado todavía:** ingreso real, cámara, GPS en segundo plano, push y flujo completo en un teléfono físico.

## Incompleto
- **Ingreso por celular sin configurar en producción** (Supabase → Authentication → Phone). Hasta entonces nadie puede entrar a la app.
- **Panel sin publicar:** Vercel no tiene GitHub conectado ni token. Además hay que quitar su dependencia de la llave `service_role`.
- Edge Function `send-push` sin desplegar; `push_function_url` y el secreto de Vault vacíos.
- Sin proyecto de EAS (el dueño no entregó token de Expo): sin push ni actualizaciones OTA. El APK va firmado con la llave de depuración.
- Sin proveedor de SMS real, sin clave de Google Maps, sin Firebase/FCM, sin Sentry.
- Captcha documentado pero no conectado. Limpieza de Storage en GitHub Actions sin activar.
- Tarifario y catálogo de producción con valores estimados. Términos y privacidad en borrador.
- Proyecto `cerquita-demo` (`vfquejeijminjxxyozqg`): pausado y vacío; se puede borrar.
- iOS: requiere cuenta de Apple Developer.

## Errores conocidos
- **Confirmado:** `delete_my_account` falla para un pro cuyos documentos ya vio soporte (“document_access_log es inmutable”): la cascada al borrar `verification_documents` choca con el trigger. Falta migración de corrección.
- El token personal de Supabase guardado en el entorno es inválido (5 intentos): no usar la API de administración; el SQL de producción se aplica con el conector (ver `docs/produccion.md`).
- En este entorno los `git push` de etiquetas fallan; usar ramas. Docker no arranca solo y muere a las 2 h.
- `docs/demo/cerquita-demo.html` es una simulación: muestra teléfonos y simplifica la reevaluación.

## Última tarea
- Hecho: documentación de contexto, backend de producción cargado, primer APK publicado y probado en emulador.
- Siguiente: migración `pilot_fixes` (eliminar cuenta + panel sin `service_role`), desplegar `send-push`, publicar el panel cuando haya acceso a Vercel.
