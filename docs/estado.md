# Cerquita · Estado

Actualizado: 2026-11-18. Se **reescribe** en cada tarea (máx. 100 líneas, sin historial; el historial está en git y `docs/progreso.md`).

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
- **Funciones cerradas sin sesión**: `anon` y PUBLIC ya no ejecutan ninguna función de `public`; la app con sesión conserva sus RPC.

## Desplegado (producción del piloto)
- **Backend:** Supabase `cerquita` (`dknxuxrylnncbdzjqagh`, São Paulo, plan gratis). 16 migraciones, seed de Huancayo, 29 tablas con RLS, 4 tareas cron.
- **Auth:** proveedor Phone activo con Twilio (cuenta trial: solo SMS a números verificados) + números de prueba con OTP fijo (los cargó el dueño).
- **Notificaciones:** Edge Function `send-push` v1 activa (sin JWT, valida secreto de Vault); `push_function_url` fijada; cron `dispatch-push` cada minuto.
- **APK Android:** build 2 (0.1.0), 35,7 MB, apunta a producción. Enlace en `docs/produccion.md` → “APK del piloto”.
- **Panel:** https://cerquita-nine.vercel.app (Vercel, rama `main`, carpeta `apps/admin`; solo URL + clave publicable). Sin sesión redirige a `/login`.
- **AAB (Google Play):** EAS `@holdingidn/cerquita`, perfil `production`, versionCode 2, llave de firma creada y guardada en EAS. Build `a1a6c154` terminado (versión 0.1.0, commit `106fcc4`); el `.aab` se descarga desde la página del build en expo.dev. No se instala directo en el teléfono: es para subir a Google Play.

## Pruebas (última corrida)
- e2e: 112 pasos (2026-11-18, local); suma reclamo y reporte desde la app y en el panel reclamos, reportes, lista negra, tarifario y parámetros con revisora y admin.
- CI en `main` (commit `cce8272`, 2026-11-17): unitarias, pgTAP completo (prelaunch 52) y e2e. Todo en verde.
- e2e confirma que el DNI se abre con URL firmada por la sesión de soporte (sin `service_role`) y que la vista queda registrada.
- Producción (transacción revertida): un pro con DNI ya visto por soporte elimina su cuenta; documentos 0, vistas conservadas 1, perfil anonimizado.
- Producción: `send-push` con secreto de Vault → 200 `{"sent":0}`; con secreto falso o sin secreto → 401 (repetido tras el cierre de permisos).
- Producción (clave anónima, 2026-11-17): `my_account` y `sos_open_alerts` → 401 “permission denied”; lectura pública de oficios → 200.
- APK build 2: arranque en emulador Android 14 OK (pantalla de ingreso).
- **No probado todavía:** ingreso real con los números de prueba, cámara, GPS en segundo plano, push en un teléfono y flujo completo en físico.

## Avance técnico del piloto (A)
Regla: "verificado" solo si se recorrió en celular o en el panel. Código, pruebas unitarias/pgTAP y llamadas a producción cuentan como "sin verificar". El e2e corre la app exportada para web: no cuenta como celular. Pesos: alto 3, medio 2, bajo 1 (total 48).

| Funcionalidad | Peso | Estado | Fuente |
| --- | --- | --- | --- |
| Panel: acceso solo soporte y revisión de verificación | alto | Verificado | e2e Fases 3–4 (CI verde en `cce8272`) |
| Panel: DNI con URL firmada y vista registrada | alto | Verificado | e2e (CI verde en `cce8272`) |
| Panel: reclamos, reportes, lista negra, tarifario, parámetros | medio | Verificado | e2e Fase 9 (112 pasos, local y CI) |
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
| App: notificaciones push | alto | Pendiente | Sin FCM; no llegan a teléfonos |
| App: antifraude GPS en segundo plano | alto | Pendiente | P2 del roadmap |
| Backend: matching y libro de comisiones en el servidor | alto | Sin verificar | pgTAP en CI |
| Backend: cola y envío push (`send-push`) | medio | Sin verificar | 200/401 en producción |
| Backend: limpieza de Storage | bajo | Pendiente | Action sin activar |

Cálculo: verificado 8/48 = **16,7 %** · implementado sin verificar 33/48 = **68,8 %** · pendiente 7/48 = **14,6 %**.

## Bloqueos para lanzar (B, sin porcentaje)
- **Seguridad:** permisos públicos cerrados y verificados en producción. Falta quitar `SUPABASE_SERVICE_ROLE_KEY` y `POSTGRES_*` de Vercel (dueño). Primer admin con un número sin código fijo (dueño).
- **Cuentas:** Google Play Console, USD 25, verificación de identidad; cuenta personal exige 12 probadores × 14 días, de organización exige D-U-N-S (dueño). Desbloquea subir el AAB. Apple Developer, USD 99/año (dueño). Desbloquea iOS/TestFlight.
- **Servicios externos:** SMS con proveedor con cobertura en Perú (dueño; hoy solo números de prueba, por decisión). Firebase FCM v1 y clave de Google Maps (dueño): desbloquean push Android y mapa real. Yape/Plin y titular en Parámetros (dueño): desbloquean el cobro de comisión.
- **Legal:** términos y privacidad revisados por abogado y publicados; registro ante la ANPDP (Ley 29733); Libro de Reclamaciones; decidir Seguro Cerquita y Garantía 30 días (dueño + abogado). Desbloquea publicar en tiendas.
- **Tarifario:** validar tarifario, tarifa de visita, catálogo y precios de referencia con profesionales de Huancayo; confirmar 105/116/106 (dueño con profesionales). Desbloquea datos reales del piloto.
- **Fuera de estas categorías:** prueba en 2 teléfonos físicos con números de prueba (Claude coordina; dueño presta teléfonos). Es lo que pasa A de "sin verificar" a "verificado".
- No bloqueantes: captcha, Sentry, limpieza de Storage, proyecto `cerquita-demo` (`vfquejeijminjxxyozqg`, pausado; se puede borrar).
- **Decisión del dueño (2026-11-18): saldo prepago para pagar comisiones (opción B).** Lectura de trabajo: un saldo de circuito cerrado (solo lo acepta Cerquita, no es convertible a efectivo, no se transfiere ni da cambio) queda fuera de la definición de dinero electrónico (Ley 29985, art. 2 b y d), así que no exigiría licencia de la SBS. Pendiente de confirmación legal. Riesgo de tienda: confirmar que la comisión por un servicio consumido fuera de la app está exenta del cobro de Apple y Google. Condiciones: solo paga comisiones de Cerquita; sin devolución en efectivo; recarga por pasarela autorizada o agentes; tratamiento contable de anticipo de clientes. Requiere cambiar la regla 3. Mientras tanto la regla 3 sigue vigente y el piloto usa el modelo A (deuda, pausa y constancia).

## Errores conocidos
- Linter de Supabase: 56 avisos “authenticated puede ejecutar security definer”. Es intencional (son las RPC de la app y validan `auth.uid()`/rol por dentro). Otro aviso: protección de contraseñas filtradas (no aplica: el ingreso es por SMS).
- El token personal de Supabase guardado en el entorno es inválido: el SQL de producción se aplica con el conector (ver `docs/produccion.md`).
- En este entorno Docker muere a las 2 h y los `git push` de etiquetas fallan: las pruebas de base corren en el CI; los APK se disparan con ramas `apk/*`.
- `docs/demo/cerquita-demo.html` es una simulación: muestra teléfonos y simplifica la reevaluación.

## Última tarea
- Medición de avance separada en A (técnico, con pesos y fuentes) y B (bloqueos para lanzar).
- Cierre de permisos en producción (autorizado por el dueño). La primera migración (`20261117000100`, solo `anon`) no bastaba: `anon` heredaba EXECUTE de PUBLIC. La segunda (`20261117000200`) quita PUBLIC y da grant explícito a las dos RPC de reevaluación que dependían de él.
- Verificado: `anon` 0 funciones; `authenticated` conserva las 56 RPC; hook de Auth y `send-push` intactos. pgTAP `prelaunch` sube a 52 (corre en el CI).
- Panel desplegado en Vercel y primer AAB de producción compilado en EAS (variables de producción cargadas en EAS).
- Siguiente: primer administrador; Google Play (cuenta del dueño) y subir el AAB a prueba interna/cerrada.
