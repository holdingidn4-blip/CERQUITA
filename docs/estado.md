# Cerquita · Estado

Actualizado: 2026-11-21. Se **reescribe** en cada tarea (máx. 100 líneas, sin historial; el historial está en git y `docs/progreso.md`).

## Implementado
- Monorepo pnpm: app Expo (`apps/mobile`), panel Next.js (`apps/admin`), lógica compartida (`packages/shared`), Supabase (26 migraciones).
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
- **Funciones cerradas sin sesión**: `anon` y PUBLIC ya no ejecutan ninguna función de `public`; la app con sesión conserva sus RPC. Desde `20261118000050` las funciones **nuevas** también nacen cerradas (antes el valor global seguía dando EXECUTE a PUBLIC).
- **Tiempos de respuesta visibles:** constancias (`proof_review_hours`, 2 h) y tickets de ayuda (`support_reply_hours`, 8 h): la app dice en cuánto responde soporte y avisa si se pasa; el panel marca plazos y vencidos.
- **Inicio del cliente rediseñado:** buscador de oficios (sin tildes), íconos propios por oficio, franja “Verificados por oficio · Pagas al terminar · Sin adelantos”, pedido activo destacado y conteo de profesionales cerca arriba; el mapa queda al final.
- **Métricas del piloto (Panel → Métricas):** pedidos publicados por día, % que recibió oferta, % contratado, mediana y percentil 90 del tiempo a la primera oferta, terminados y cancelados; 7/14/30/90 días en hora de Lima, con detalle por día y tabla. Solo soporte (`pilot_metrics`).
- **Estado del sistema (Panel → Sistema):** tareas programadas con su última corrida y fallas en 24 h, cola de notificaciones (pendientes, atascadas, enviadas, fallidas) y llamadas salientes con su último error; el menú muestra cuántos avisos hay. Umbral en Parámetros (`ops_outbox_stale_minutes`, 10 min). Solo soporte (`ops_health`).
- **Recordatorios de pedidos programados:** 60 min antes (`schedule_reminder_minutes`), una sola vez por pedido: con profesional asignado avisa al cliente y al pro; sin profesional, al cliente para que elija oferta o espere. Corre cada 5 min (cron `schedule-reminders`) y llega por la cola de notificaciones (push cuando haya FCM).
- **Profesional que no llega:** el pro indica en su oferta en cuánto llega; al aceptar queda la llegada acordada. Pasada la tolerancia (15 min), el cliente cambia de profesional: el pedido vuelve a las otras ofertas, se registra la falta y con 3 en 30 días se pausan sus ofertas. El pro nuevo no ve el chat ni el GPS del anterior.

## Desplegado (producción del piloto)
- **Backend:** Supabase `cerquita` (`dknxuxrylnncbdzjqagh`, São Paulo, plan gratis). 26 migraciones (las del 18-11 y `pilot_metrics`/`ops_health`/`schedule_reminders` del 19-11 aplicadas con autorización del dueño y verificadas: mismas huellas que en local), seed de Huancayo, 30 tablas con RLS, 6 tareas cron (suman `storage-cleanup`, cada hora, y `schedule-reminders`, cada 5 min).
- **Auth:** proveedor Phone activo con Twilio (cuenta trial: solo SMS a números verificados) + números de prueba con OTP fijo (los cargó el dueño).
- **Notificaciones:** Edge Function `send-push` v1 activa (sin JWT, valida secreto de Vault); `push_function_url` fijada; cron `dispatch-push` cada minuto.
- **APK Android:** build 4 (0.1.0, commit `c6a5702`), 35,7 MB, apunta a producción; suma a lo del build 3 (profesional que no llega, inicio nuevo, plazos) la presencia en segundo plano corregida, la visita de diagnóstico publicable y el mínimo de referencias tomado de la configuración. Enlace en `docs/produccion.md` → “APK del piloto”.
- **Panel:** https://cerquita-nine.vercel.app (Vercel, rama `main`, carpeta `apps/admin`; solo URL + clave publicable). Sin sesión redirige a `/login`.
- **AAB (Google Play):** EAS `@holdingidn/cerquita`, perfil `production`, versionCode 2, llave de firma creada y guardada en EAS. Build `a1a6c154` terminado (versión 0.1.0, commit `106fcc4`); el `.aab` se descarga desde la página del build en expo.dev. No se instala directo en el teléfono: es para subir a Google Play.

## Pruebas (última corrida)
- Local (2026-11-21, base reseteada): pgTAP completo 486 (14 suites; nuevas `metrics` 22, `ops` 17, `schedule` 14), e2e 154 pasos, unitarias 198. Todo en verde.
- CI en `main` (commits `92706cd` y `1533be3`, 2026-11-19): base (pgTAP completo), chequeo y e2e en verde.
- e2e suma: reevaluación en el domicilio (materiales del catálogo y boleta) aprobada por el cliente, cancelación con tarifa de visita y su comisión, y ticket de ayuda respondido desde el panel.
- CI en `main` (commit `f8a360c`, 2026-11-18): base, chequeo y e2e en verde (incluye no llega e inicio nuevo).
- e2e suma: reclamo y reporte desde la app; en el panel reclamos, reportes, lista negra, tarifario y parámetros (revisora y admin); hora de llegada en la oferta y cambio de profesional cuando no llega.
- CI en `main` (commit `cce8272`, 2026-11-17): unitarias, pgTAP completo (prelaunch 52) y e2e. Todo en verde.
- e2e confirma que el DNI se abre con URL firmada por la sesión de soporte (sin `service_role`) y que la vista queda registrada.
- Producción (transacción revertida): un pro con DNI ya visto por soporte elimina su cuenta; documentos 0, vistas conservadas 1, perfil anonimizado.
- Producción: `send-push` con secreto de Vault → 200 `{"sent":0}`; con secreto falso o sin secreto → 401 (repetido tras el cierre de permisos).
- Producción (clave anónima, 2026-11-17): `my_account` y `sos_open_alerts` → 401 “permission denied”; lectura pública de oficios → 200.
- APK build 4: arranque en emulador Android OK (pantalla de ingreso, captura revisada); enlace verificado (200, 35,7 MB). Política temporal de subida borrada.
- Producción: `pilot_metrics` y `ops_health` con huellas iguales a las locales; sin sesión no se ejecutan. Con rol de soporte (transacción revertida): 14 días con 0 pedidos; 5 tareas cron en “succeeded”, cola vacía, 6/6 llamadas HTTP con 200. `send_schedule_reminders` con huella igual a la local, sin permiso para la app; corrida de prueba revertida: 0 avisos.
- **No probado todavía:** ingreso real con los números de prueba, cámara, GPS en segundo plano, push en un teléfono y flujo completo en físico.

## Avance técnico del piloto (A)
Regla: "verificado" solo si se recorrió en celular o en el panel. Código, pruebas unitarias/pgTAP y llamadas a producción cuentan como "sin verificar". El e2e corre la app exportada para web: no cuenta como celular. Pesos: alto 3, medio 2, bajo 1 (total 57).

| Funcionalidad | Peso | Estado | Fuente |
| --- | --- | --- | --- |
| Panel: acceso solo soporte y revisión de verificación | alto | Verificado | e2e Fases 3–4 (CI verde en `cce8272`) |
| Panel: DNI con URL firmada y vista registrada | alto | Verificado | e2e (CI verde en `cce8272`) |
| Panel: reclamos, reportes, lista negra, tarifario, parámetros | medio | Verificado | e2e Fase 9 (CI verde en `f8a360c`) |
| Panel: soporte, sospechas, fichas de usuario, búsqueda y detalle de pedido | medio | Verificado | e2e Fases 8–9 (139 pasos) |
| Panel: métricas del piloto (pedidos por día, primera oferta, % contratado) | medio | Verificado | e2e Fase 9 (150 pasos) |
| Panel: estado del sistema (cron, cola de notificaciones, llamadas) | bajo | Verificado | e2e Fase 9 (154 pasos) |
| Panel en producción con ingreso real | alto | Sin verificar | Solo `/login` y redirección; falta primer admin |
| App: ingreso por SMS y modo Cliente/Profesional | alto | Sin verificar | e2e en export web |
| App: registro del profesional y evidencia | alto | Sin verificar | e2e en export web |
| App: publicar pedido | alto | Sin verificar | e2e en export web |
| App: cotizar y aceptar oferta | alto | Sin verificar | e2e en export web |
| App: servicio en curso (código, ubicación en vivo, reevaluación) | alto | Sin verificar | e2e en export web; GPS real no probado |
| App: cierre, calificación y constancia | alto | Sin verificar | e2e en export web |
| App: pausa por deuda y pago de comisión | alto | Sin verificar | e2e en export web |
| App: chat interno con filtro | medio | Sin verificar | e2e en export web |
| App: SOS, reportar/bloquear, eliminar cuenta | medio | Sin verificar | e2e en export web |
| App: el profesional no llega (hora de llegada, cambio, faltas y pausa) | alto | Sin verificar | e2e en export web y pgTAP `no_show` |
| App: notificaciones push | alto | Pendiente | Sin FCM; no llegan a teléfonos |
| App: antifraude GPS en segundo plano (en línea) | alto | Sin verificar | Corregido el 19-11: la tarea no enviaba la presencia; requiere teléfono |
| Backend: matching y libro de comisiones en el servidor | alto | Sin verificar | pgTAP en CI |
| Backend: cola y envío push (`send-push`) | medio | Sin verificar | 200/401 en producción |
| Backend: recordatorios de pedidos programados | bajo | Sin verificar | pgTAP `schedule`; el aviso llega al teléfono solo con FCM |
| Backend: limpieza de Storage | bajo | Sin verificar | Edge Function + pg_cron en producción (200/401 verificados); en modo prueba: solo cuenta hasta activar `storage_cleanup_enabled` |

Cálculo: verificado 13/57 = **22,8 %** · implementado sin verificar 41/57 = **71,9 %** · pendiente 3/57 = **5,3 %** (solo push, que espera Firebase). (El total sube cuando entra una fila nueva.)

## Bloqueos para lanzar (B, sin porcentaje)
- **Seguridad:** permisos públicos cerrados y verificados en producción. Falta quitar `SUPABASE_SERVICE_ROLE_KEY` y `POSTGRES_*` de Vercel (dueño). Primer admin con un número sin código fijo (dueño).
- **Cuentas:** Google Play Console, USD 25, verificación de identidad; cuenta personal exige 12 probadores × 14 días, de organización exige D-U-N-S (dueño). Desbloquea subir el AAB. Apple Developer, USD 99/año (dueño). Desbloquea iOS/TestFlight.
- **Servicios externos:** SMS con proveedor con cobertura en Perú (dueño; hoy solo números de prueba, por decisión). Firebase FCM v1 y clave de Google Maps (dueño): desbloquean push Android y mapa real. Yape/Plin y titular en Parámetros (dueño): desbloquean el cobro de comisión.
- **Legal:** términos y privacidad revisados por abogado y publicados; registro ante la ANPDP (Ley 29733); Libro de Reclamaciones; decidir Seguro Cerquita y Garantía 30 días (dueño + abogado). Desbloquea publicar en tiendas.
- **Tarifario:** validar tarifario, tarifa de visita, catálogo y precios de referencia con profesionales de Huancayo; confirmar 105/116/106 (dueño con profesionales). Desbloquea datos reales del piloto.
- **Fuera de estas categorías:** prueba en 2 teléfonos físicos con números de prueba (Claude coordina; dueño presta teléfonos). Es lo que pasa A de "sin verificar" a "verificado".
- No bloqueantes: captcha, Sentry, activar el borrado de la limpieza de Storage (Parámetros), proyecto `cerquita-demo` (`vfquejeijminjxxyozqg`, pausado; se puede borrar).
- **Decisión del dueño (2026-11-18): saldo prepago para pagar comisiones (opción B).** Lectura de trabajo: un saldo de circuito cerrado (solo lo acepta Cerquita, no es convertible a efectivo, no se transfiere ni da cambio) queda fuera de la definición de dinero electrónico (Ley 29985, art. 2 b y d), así que no exigiría licencia de la SBS. Pendiente de confirmación legal. Riesgo de tienda: confirmar que la comisión por un servicio consumido fuera de la app está exenta del cobro de Apple y Google. Condiciones: solo paga comisiones de Cerquita; sin devolución en efectivo; recarga por pasarela autorizada o agentes; tratamiento contable de anticipo de clientes. Requiere cambiar la regla 3. Mientras tanto la regla 3 sigue vigente y el piloto usa el modelo A (deuda, pausa y constancia).

## Errores conocidos
- Linter de Supabase: 56 avisos “authenticated puede ejecutar security definer”. Es intencional (son las RPC de la app y validan `auth.uid()`/rol por dentro). Otro aviso: protección de contraseñas filtradas (no aplica: el ingreso es por SMS).
- El token personal de Supabase guardado en el entorno es inválido: el SQL de producción se aplica con el conector (ver `docs/produccion.md`).
- En este entorno Docker muere a las 2 h y los `git push` de etiquetas fallan: las pruebas de base corren en el CI; los APK se disparan con ramas `apk/*`.
- `docs/demo/cerquita-demo.html` es una simulación: muestra teléfonos y simplifica la reevaluación.

## Última tarea
- **Recordatorios de pedidos programados** (roadmap P2): migración `20261119000300` con cron cada 5 min, prueba pgTAP `schedule` (14) y parámetro en el panel. Aplicada en producción (autorizado) y verificada.
- Antes, en esta tanda: métricas del piloto (Panel → Métricas), estado del sistema (Panel → Sistema) y APK build 4.
- Siguiente: registro guiado del profesional con ejemplos de evidencia (P1); prueba en 2 teléfonos con el build 4 (`docs/prueba-telefonos.md`) y primer administrador (dueño).
