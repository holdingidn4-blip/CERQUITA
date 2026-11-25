# Cerquita · Roadmap

Prioridades: **P0** bloquea el inicio del piloto · **P1** primeras semanas del piloto · **P2** antes de abrir al público · **P3** después.
Marcas: `[ ]` pendiente · `[x]` hecho · **(D)** depende del dueño (cuentas, pagos o decisiones legales).

## P0 · Para arrancar el piloto en Huancayo
- [x] Backend de producción en Supabase (`cerquita`): 13 migraciones, seed de Huancayo y cron.
- [x] Desplegar `send-push` con su secreto en Vault y fijar `push_function_url`.
- [x] **(D)** Activar el ingreso por celular en Supabase (Phone + Twilio trial + números de prueba).
- [ ] **(D)** Activar el hook `hook_before_user_created` (Authentication → Hooks).
- [x] Panel publicado en Vercel (https://cerquita-nine.vercel.app) con solo URL + clave publicable.
- [x] Quitar del panel la dependencia de `SUPABASE_SERVICE_ROLE_KEY` (URL firmada con la sesión de soporte + política con vista registrada).
- [x] Revocar EXECUTE de `anon`/PUBLIC en las funciones del esquema `public` (aplicado en producción; `anon` ejecuta 0 funciones).
- [ ] Primer administrador: el dueño entra una vez y se le asigna `staff_role = admin` por SQL.
- [x] APK Android instalable por enlace, apuntando a producción (GitHub Actions + Storage; build 2).
- [x] Proyecto EAS (`@holdingidn/cerquita`), variables de producción y llave de firma definitiva en EAS; primer AAB compilado (build `a1a6c154`).
- [x] Vista alternativa cuando no hay clave de Google Maps (que la app no se cierre).
- [x] Corregir `delete_my_account` con documentos ya vistos por soporte.
- [x] El profesional no llega: hora de llegada en la oferta, cambio de profesional, faltas y pausa (en producción desde el 18-11).
- [x] Privilegios por defecto: las funciones nuevas nacen cerradas sin sesión (en producción desde el 18-11).
- [ ] **(D)** Cupón para el cliente cuando el profesional no llega: decidir quién lo paga.
- [ ] Prueba de punta a punta en 2 teléfonos reales: registro, verificación, pedido, cotización, GPS, chat, cierre, comisión y pago.
- [ ] **(D)** Proveedor de SMS con cobertura en Perú cargado en Supabase Auth (hasta entonces solo entran números de prueba).
- [ ] **(D)** Números reales del administrador, revisores y primeros probadores.
- [ ] **(D)** Datos de Yape/Plin y titular en Panel → Parámetros.
- [ ] **(D)** Clave de Google Maps para Android.
- [ ] **(D)** Firebase (FCM v1) para las notificaciones push de Android.
- [ ] **(D)** Validar tarifario, tarifa de visita y catálogo con profesionales de Huancayo.
- [ ] **(D)** Términos y política de privacidad publicados; decidir “Seguro Cerquita” y “Garantía 30 días” o retirar el aviso.

## Lanzamiento (F1–F8)
- [x] F1 Seguridad con evidencia (`docs/seguridad.md`): borrar cuenta, panel sin `service_role`, permisos y advisors, panel desplegado, enlace del APK.
- [x] F2 Registro del profesional paso a paso y usabilidad de la app del pro (asistente de 6 pasos, riesgo, video, antecedentes por oficio, cola del panel, "Qué sigue").
- [x] F3 Cotización con desglose, aceptación con versión y cierre con fotos y comprobante (cupón por falta que asume Cerquita, apelación en el panel, portafolio con permiso).
- [x] F4 Reputación, niveles, lista negra con apelación y capacitaciones (supervisión del primer trabajo, códigos/QR de un solo uso, certificado y puntos; canje “próximamente”).
- [x] F5 Diseño (tokens únicos claro/oscuro con contraste AA, app/panel/landing, landing pública `/inicio`).
- [x] F6 Push listo (falta el archivo de Firebase del dueño), comparación de SMS con recomendación, Maps sin costo de uso, Yape/Plin manual con verificación del abono (`docs/servicios-externos.md`).
- [ ] F7 Ciclo de pruebas y corrección.

## Correcciones de la prueba en teléfono (`cerquita-prompt-correcciones`)
- [x] 0 Producción al día: migración `…012613` aplicada y registrada; tabla temporal borrada; migraciones solo por `apply_migration`.
- [ ] 1 Cámara y micrófono del video: corregido en código y APK `834dded0`; **falta probarlo en el teléfono con `adb logcat`**.
- [ ] 2 Nuevo ingreso (degradado, radar, interruptor, celular con formato, OTP de 6 casillas): hecho y con e2e; **falta en el teléfono**.
- [ ] 3 App del pro con barra inferior, tarjeta de nivel y pasos de verificación: hecho y con e2e; **falta en el teléfono**.
- [ ] 4 Catálogo de trabajos (8–12 por oficio, buscador, "Otro trabajo" en revisión, edición en el panel, trabajos de riesgo aprobados aparte): hecho y con e2e; **falta en el teléfono**.
- [ ] 5 Landing nueva (Lighthouse ≥ 90 en móvil) y menú del panel por áreas.
- [ ] 6 Flujo completo en el teléfono con capturas (incluye el error 5 de F7: comisión en dos líneas).
- [ ] F8 Google Play: AAB, APK de EAS, ficha, privacidad y términos, prueba cerrada.

## P1 · Primeras semanas del piloto
- [ ] Captcha (Turnstile u hCaptcha) y límites de envío de SMS.
- [ ] Sentry en la app (DSN) para ver fallas en los teléfonos.
- [x] Limpieza de Storage con Edge Function y pg_cron (sin llave en GitHub); en modo prueba hasta activar `storage_cleanup_enabled`.
- [x] Vigilar la cola de notificaciones y las tareas programadas (cron): Panel → Sistema, con avisos en el menú.
- [x] Plazos de respuesta visibles para constancias y tickets de ayuda, con vencidos en el panel.
- [x] Métricas del piloto en el panel: pedidos por día, tiempo a la primera oferta, % contratado (Panel → Métricas, 7/14/30/90 días).
- [x] Registro guiado del profesional con ejemplos de evidencia (F2).
- [ ] Validar la duración del video en el servidor.
- [ ] **(D)** Supabase Pro (copias de seguridad diarias) antes de acumular datos reales.
- [ ] **(D)** Prueba cerrada de Google Play: 12 personas durante 14 días.
- [ ] **(D)** Registro del banco de datos personales (Ley 29733) y Libro de Reclamaciones.
- [ ] **(D)** Comprobantes de pago por la comisión (SUNAT), con un contador.

## P2 · Antes de abrir al público
- [ ] **(D)** iOS: cuenta de Apple Developer, build y TestFlight.
- [ ] Publicación en Google Play (producción) y App Store.
- [x] Envío de posición en segundo plano con el pro en línea (antifraude y reparto), corregido el 19-11; falta probarlo en teléfono.
- [ ] **(D)** Texto del uso del GPS en segundo plano en la política de privacidad (abogado).
- [x] Recordatorios para pedidos programados (cron cada 5 min, una vez por pedido, `schedule_reminder_minutes` antes).
- [ ] Sentry en el panel.
- [ ] Dominio propio para el panel y las páginas legales.

## P3 · Después
- [ ] Segunda ciudad (`settings` con `city:<slug>` y su tarifario).
- [ ] Pagos en línea, si las reglas de las tiendas y la parte legal lo permiten.
- [ ] Beneficios por nivel del profesional y programa de referidos.
- [ ] Web para clientes.
- [ ] Actualizar la demo simulada (`docs/demo/`) para que refleje el chat sin teléfono.
