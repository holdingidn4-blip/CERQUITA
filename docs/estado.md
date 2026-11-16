# Cerquita · Estado

Actualizado: 2026-11-16. Se **reescribe** en cada tarea (máx. 100 líneas, sin historial; el historial está en git y `docs/progreso.md`).

## Implementado
- Monorepo pnpm: app Expo (`apps/mobile`), panel Next.js (`apps/admin`), lógica compartida (`packages/shared`), Supabase (14 migraciones).
- Ingreso por SMS (OTP), selector Cliente/Profesional, hook que solo admite +51 9XXXXXXXX, roles de soporte.
- Registro del profesional y verificación por oficio: 9 oficios, 4 categorías, requisitos por categoría, cola y revisión en el panel.
- Pedidos: tarifario sin regateo, fotos, video de diagnóstico (15 s, 48 h), visita de diagnóstico S/ 20, programación.
- Matching en el servidor: oficio aprobado + en línea + radio + sin pausa/bloqueo; lista negra de direcciones.
- Cotizaciones, servicio con código de 4 dígitos, ubicación en vivo, reevaluación con materiales y boleta, cierre y confirmación.
- Comisión 10 % solo sobre mano de obra; libro inmutable; pausa por deuda (S/ 30, 3 días); tarifa de visita.
- Pagos de comisión por Yape/Plin/transferencia con constancia y aprobación de soporte.
- Chat interno con filtro; puntos, ranking, reclamos, reportar/bloquear, tickets, SOS, antifraude GPS, eliminar cuenta.
- Panel completo (verificación, constancias, SOS, sospechas, soporte, reportes, reclamos, lista negra, tarifario, parámetros, fichas).
- **El panel ya no usa la llave `service_role`**: firma las URL de documentos con la sesión de soporte (política de Storage que exige vista registrada < 2 min).
- **Eliminar cuenta corregido**: el registro de vistas de documentos ya no se borra en cascada (inmutable, se conserva).
- **Notificaciones**: `send-push` valida su secreto contra Vault (`push_secret_matches`); no hay secretos en variables.

## Desplegado (producción del piloto)
- **Backend:** Supabase `cerquita` (`dknxuxrylnncbdzjqagh`, São Paulo, plan gratis). 14 migraciones, seed de Huancayo, 29 tablas con RLS, 4 tareas cron.
- **Auth:** proveedor Phone activo con Twilio (cuenta trial: solo SMS a números verificados) + números de prueba con OTP fijo (los cargó el dueño).
- **Notificaciones:** Edge Function `send-push` v1 activa (sin JWT, valida secreto de Vault); `push_function_url` fijada; cron `dispatch-push` cada minuto.
- **APK Android:** build 2 (0.1.0), 35,7 MB, apunta a producción. Enlace en `docs/produccion.md` → “APK del piloto”.
- **Panel:** proyecto Vercel `cerquita` creado por el dueño (repo, rama `main`, carpeta `apps/admin`, integración Supabase). **Sin desplegar** a la espera del dueño.

## Pruebas (última corrida)
- CI en `main` (commit `b603aff`, 2026-11-16): 153 unitarias, pgTAP completo (privacy 30, prelaunch 48, rls 64…) y 92 pasos e2e. Todo en verde.
- e2e confirma que el DNI se abre con URL firmada por la sesión de soporte (sin `service_role`) y que la vista queda registrada.
- Producción (transacción revertida): un pro con DNI ya visto por soporte elimina su cuenta; documentos 0, vistas conservadas 1, perfil anonimizado.
- Producción: `send-push` con secreto de Vault → 200 `{"sent":0}`; con secreto falso o sin secreto → 401.
- APK build 2: arranque en emulador Android 14 OK (pantalla de ingreso).
- **No probado todavía:** ingreso real con los números de prueba, cámara, GPS en segundo plano, push en un teléfono y flujo completo en físico.

## Incompleto
- Panel sin desplegar (decisión del dueño, tras estos arreglos). Falta asignar el primer administrador (el dueño entra una vez y se le da el rol por SQL).
- Push no llegará a teléfonos hasta tener proyecto EAS (token de Expo) y Firebase/FCM: la función y la cola ya funcionan.
- Twilio trial: SMS reales solo a números verificados; el piloto usa números de prueba de Supabase.
- Sin clave de Google Maps (vista simple de mapa), sin Sentry, captcha no conectado, limpieza de Storage en GitHub Actions sin activar.
- Tarifario y catálogo de producción con valores estimados (siguiente revisión con el dueño).
- Términos y privacidad en borrador; “Seguro Cerquita” y “Garantía 30 días” sin definir. iOS requiere Apple Developer.
- Proyecto `cerquita-demo` (`vfquejeijminjxxyozqg`): pausado y vacío; se puede borrar.

## Errores conocidos
- **Login por SMS no funciona en el APK (confirmado 2026-11-16):** Twilio rechaza el Auth Token guardado en Supabase (error 20003, cuenta AC3fdaeb…). Todo número falla con “No pudimos enviar el SMS”. Los números de prueba estándar (51900000001, 002, 003, 008, 009) tampoco están configurados en producción. Corregir en Supabase → Authentication → Providers → Phone: Auth Token de Twilio, SID de la cuenta y, en “Test phone numbers and OTPs”, los números exactos (51 + celular, sin +) con su código y sin fecha vencida.
- **Aviso de seguridad (previo, no explotable hoy):** 56 funciones `security definer` se pueden llamar con la clave anónima porque PostgreSQL da EXECUTE a PUBLIC por defecto. Todas validan `auth.uid()`/soporte por dentro; falta revocarlo (P0 del roadmap).
- Vercel: el conector de esta sesión necesita autorización del equipo `holdingidn4-3141` para leer el proyecto (enlace de un solo uso).
- El token personal de Supabase guardado en el entorno es inválido: el SQL de producción se aplica con el conector (ver `docs/produccion.md`).
- En este entorno Docker muere a las 2 h y los `git push` de etiquetas fallan: las pruebas de base corren en el CI; los APK se disparan con ramas `apk/*`.
- `docs/demo/cerquita-demo.html` es una simulación: muestra teléfonos y simplifica la reevaluación.

## Última tarea
- Diagnóstico del login por SMS: la app y el servidor están bien; falla el Auth Token de Twilio en Supabase y faltan los números de prueba en producción. Lo debe corregir el dueño (son sus credenciales).
- Siguiente: confirmar login con números de prueba; luego el panel en Vercel (pendiente de autorizar el equipo).
