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

## P1 · Primeras semanas del piloto
- [ ] Captcha (Turnstile u hCaptcha) y límites de envío de SMS.
- [ ] Sentry en la app (DSN) para ver fallas en los teléfonos.
- [ ] Activar la limpieza de Storage en GitHub Actions.
- [ ] Vigilar la cola de notificaciones y las tareas programadas (cron).
- [x] Plazos de respuesta visibles para constancias y tickets de ayuda, con vencidos en el panel.
- [ ] Métricas del piloto en el panel: pedidos por día, tiempo a la primera oferta, % contratado.
- [ ] Registro guiado del profesional con ejemplos de evidencia.
- [ ] Validar la duración del video en el servidor.
- [ ] **(D)** Supabase Pro (copias de seguridad diarias) antes de acumular datos reales.
- [ ] **(D)** Prueba cerrada de Google Play: 12 personas durante 14 días.
- [ ] **(D)** Registro del banco de datos personales (Ley 29733) y Libro de Reclamaciones.
- [ ] **(D)** Comprobantes de pago por la comisión (SUNAT), con un contador.

## P2 · Antes de abrir al público
- [ ] **(D)** iOS: cuenta de Apple Developer, build y TestFlight.
- [ ] Publicación en Google Play (producción) y App Store.
- [ ] Envío de posición en segundo plano fuera de un servicio (antifraude), con su texto en la política de privacidad.
- [ ] Recordatorios para pedidos programados.
- [ ] Sentry en el panel.
- [ ] Dominio propio para el panel y las páginas legales.

## P3 · Después
- [ ] Segunda ciudad (`settings` con `city:<slug>` y su tarifario).
- [ ] Pagos en línea, si las reglas de las tiendas y la parte legal lo permiten.
- [ ] Beneficios por nivel del profesional y programa de referidos.
- [ ] Web para clientes.
- [ ] Actualizar la demo simulada (`docs/demo/`) para que refleje el chat sin teléfono.
