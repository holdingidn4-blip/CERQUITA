# Cerquita · Estado

Actualizado: 2026-11-14. Se **reescribe** en cada tarea (máx. 100 líneas, sin historial; el historial está en git y `docs/progreso.md`).

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
- Notificaciones push: cola `notification_outbox`, cron y Edge Function `send-push` (código listo).
- Panel: Buscar, Verificación, Constancias, SOS, Sospechas, Soporte, Reportes, Reclamos, Lista negra, Tarifario, Parámetros, fichas de usuario y pedido.
- Infra en código: `eas.json`, `app.config.ts`, `scripts/deploy-production.sh`, seed de Huancayo, `seed-staff.mjs`, CI en GitHub Actions.
- Pruebas (última corrida completa: commit `4211d0a`, 2026-11-10): 153 unitarias, 378 pgTAP, 7 de humo SMS, 92 pasos e2e. Todo en verde.
- Documentación: `CLAUDE.md`, `docs/reglas-negocio.md`, `docs/roadmap.md`, `docs/flujos.md`, `docs/produccion.md`, demo simulada en `docs/demo/`.

## Incompleto
- **Nada está desplegado todavía.** Proyecto Supabase de producción `cerquita` (`dknxuxrylnncbdzjqagh`, São Paulo, plan gratis) creado y vacío.
- Proyecto `cerquita-demo` (`vfquejeijminjxxyozqg`): pausado y vacío; se puede borrar.
- Panel sin publicar (Vercel sin GitHub conectado: hace falta token de Vercel o conectar el repositorio).
- App nunca compilada ni probada en un teléfono real: solo se probó el export web. Cámara, GPS en segundo plano, mapas y push no están validados en dispositivo.
- Proveedor de SMS real sin contratar (local usa números de prueba).
- Sin clave de Google Maps para Android: `MapView` puede cerrar la app sin clave (falta una vista alternativa).
- Sin Firebase/FCM: las notificaciones push de Android no llegarán hasta configurarlo.
- Edge Function `send-push` nunca ejecutada (el entorno local no tiene edge-runtime); solo pruebas de su lógica pura.
- Captcha (Turnstile/hCaptcha) documentado pero no conectado en la app ni en el panel.
- Sentry sin DSN. Limpieza de Storage en GitHub Actions sin activar.
- Tarifario y catálogo de producción con valores estimados.
- Términos y privacidad en borrador; “Seguro Cerquita” y “Garantía 30 días” sin definir.
- La duración del video se valida en la app, no en el servidor.
- iOS: requiere cuenta de Apple Developer.

## Errores conocidos
- Por confirmar: `delete_my_account` fallaría para un pro cuyos documentos ya vio soporte (el borrado en cascada choca con `document_access_log` inmutable).
- pgTAP y e2e no se han vuelto a correr desde `4211d0a`; después solo hubo cambios de configuración del panel/app (`c1e8af0`) y documentación.
- `docs/demo/cerquita-demo.html` es una simulación: muestra teléfonos y simplifica la reevaluación. No usar como referencia de reglas.
- En este entorno Docker no arranca solo y Postgres directo (5432) no es alcanzable: el SQL de producción va por la API de Supabase.

## Última tarea
- Hecho: documentación de contexto (`CLAUDE.md`, reglas de negocio, estado y roadmap).
- En curso: P0 del roadmap, despliegue real (backend, panel y APK Android).
