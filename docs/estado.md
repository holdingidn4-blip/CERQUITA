# Cerquita · Estado

Actualizado: 2026-11-23. Se **reescribe** en cada fase (máx. 100 líneas, sin historial; el historial está en git y `docs/progreso.md`).

## Plan de lanzamiento (F1–F8, `cerquita-prompt-lanzamiento`)
- **Fase actual:** correcciones de la prueba en teléfono real (`cerquita-prompt-correcciones`): sección 0 cerrada; sigue la sección 1 (cámara y micrófono congelan la app).
- **Último paso terminado:** sección 0: `20261124012613_arrival_code_lock` aplicada con `apply_migration` (huella de `arrive` igual a local), tabla temporal `_deploy_staging` borrada con la aprobación del dueño. Producción: 33 migraciones, 45 tablas con RLS. Desde ahora no se usan tablas temporales (ver `docs/produccion.md`).
- **Siguiente paso exacto:** sección 1 · conectar la laptop del dueño (Remote Control) con el teléfono por USB, reproducir "Permitir cámara y micrófono" con `adb logcat` y mostrar la línea del error; revisar `apps/mobile/src/pro/onboarding/video-recorder.tsx` (permisos uno tras otro, negado/no preguntar, botón a Ajustes, respaldo de subir video).
- F8 pendiente (F7 por cerrar). Puntos de parada: pagos, cuentas del dueño, publicar en Google Play o cambios irreversibles en producción.

## Implementado
- Monorepo pnpm: app Expo (`apps/mobile`), panel Next.js (`apps/admin`), lógica compartida (`packages/shared`), Supabase (32 migraciones).
- Ingreso por SMS (OTP), modo Cliente/Profesional, hook que solo admite +51 9XXXXXXXX, roles de soporte.
- Registro del pro y verificación por oficio (9 oficios, 4 categorías, requisitos por categoría, cola y revisión en el panel).
- Pedidos: tarifario sin regateo, fotos, video (15 s, 48 h), visita de diagnóstico S/ 20, programación y recordatorio 60 min antes.
- Matching en el servidor (oficio aprobado, en línea, radio, sin pausa/bloqueo); lista negra de direcciones.
- Cotización con hora de llegada, código de 4 dígitos, ubicación en vivo, reevaluación con materiales y boleta, cierre y confirmación.
- Profesional que no llega: tolerancia 15 min, cambio de profesional, faltas (3 en 30 días pausan sus ofertas).
- Comisión 10 % solo sobre mano de obra; libro inmutable; pausa por deuda (S/ 30, 3 días); pago con constancia y aprobación.
- Chat interno con filtro; puntos, ranking, reclamos, reportar/bloquear, tickets, SOS, antifraude GPS (también en segundo plano), eliminar cuenta.
- Panel: verificación, constancias, SOS, sospechas, soporte, reportes, reclamos, lista negra, tarifario, parámetros, fichas, búsqueda, **Métricas** y **Sistema** (cron, cola y llamadas).
- **Registro del profesional (F2):** asistente de 6 pasos con autoguardado y ayuda en cada paso, ejemplos de foto buena y mala, DNI con mayor de 18, especialidades, requisitos por riesgo, video de 1–3 min grabado en la app, antecedentes solo como resultado por oficio, pantalla final con estado por oficio; panel con cola por riesgo y antigüedad, alerta a las 24 h, resultado de antecedentes e historial con responsable.
- **Cotización y cierre (F3):** oferta con visita, mano de obra, materiales y movilidad (el servidor suma y valida el tarifario solo en mano de obra); términos fijos con "plataforma intermediaria"; un botón "Acepto" que guarda monto, desglose, fecha, hora y versión (`quote_acceptances`); cada cambio de precio = cotización nueva aceptada; fotos de antes y después obligatorias para "Terminado"; confirmación del cliente con la versión aceptada; comprobante PDF para WhatsApp; portafolio solo con permiso del cliente (revocable); cupón por falta que asume Cerquita con tope mensual; el pro apela la falta y soporte decide en el panel.
- **Reputación y capacitaciones (F4):** calificación visible desde 3; niveles Nuevo, Verificado, De confianza y Destacado (trabajos + puntos, cero quejas confirmadas) con prioridad en las ofertas; lista negra de personas con motivo, plazo, DNI y dispositivo (solo hash) y apelación decidida por una persona; primer trabajo supervisado y muestreo en oficios de riesgo con checklist; capacitaciones con código o QR de un solo uso, cuestionario sin respuestas visibles, certificado PDF y puntos inmutables; canje de premios "próximamente".
- **Diseño (F5):** paleta neutra con acentos vivos (verde en claro, menta neón en oscuro), modo claro y oscuro según el sistema en app, panel y landing; textos ≥ 14 px, botones ≥ 48 px, microanimación corta que respeta "reducir movimiento"; landing pública `/inicio` (mobile first) con llamadas para cliente y profesional, confianza y capacitaciones.
- **Seguridad (F1):** panel sin `service_role`; `anon` no ejecuta funciones; 59 RPC con validación interna; teléfono entre partes retirado; políticas por acción e índices en todas las claves foráneas.

## Desplegado (producción del piloto)
- **Backend:** Supabase `cerquita` (`dknxuxrylnncbdzjqagh`, São Paulo, plan gratis). 32 migraciones aplicadas y verificadas (mismas huellas que en local), seed de Huancayo, 45 tablas, todas con RLS, 6 tareas cron.
- **Auth:** Phone con Twilio trial (solo números verificados) + números de prueba con OTP fijo.
- **Notificaciones:** Edge Function `send-push` (secreto en Vault) y cron cada minuto; el código de FCM está listo y se activa con `google-services.json` + la llave FCM V1 en EAS (pasos en `docs/servicios-externos.md`).
- **APK:** EAS perfil `pilot`, build `2cb6a8ae` (versionCode 4, con F3, commit `a754876`, llave privada de EAS; enlace en `docs/produccion.md`). Falta el de F4. Quien tenga el build 4 de CI (llave de depuración) debe desinstalarlo antes.
- **Panel:** https://cerquita-nine.vercel.app (Vercel, rama `main`). Sin sesión → `/login`. Landing pública en `/inicio` (sin sesión).
- **AAB:** EAS `@holdingidn/cerquita`, perfil `production`, build `a1a6c154` (versionCode 2), llave en EAS.

## Pruebas (última corrida)
- Local (2026-11-23, base reseteada): pgTAP 652 (20 suites; nuevas `reputation` 43, `trainings` 28 y `arrival_lock` 9), e2e 192 pasos (F4, landing, código SMS y de llegada 3 veces, sin internet), unitarias 232, revisión de 72 pantallas (`e2e/pantallas.mjs`), formato + lint + tipos. Todo en verde.
- Producción (F4): `20261124000100` y `…000200` aplicadas por tabla temporal con huella md5 (`a2008215…`, `1c287a4b…`) y registradas; 20 funciones con huella igual a local; `anon` ejecuta 0 funciones; 0 tablas sin RLS; tabla temporal borrada. F3 (`…400`) igual, 18 funciones verificadas.
- CI en `main` (`1595fa4`, 2026-11-21): base, chequeo y e2e en verde.
- Producción (F1, transacciones revertidas): borrar cuenta de pro con DNI visto → documentos 0, vista conservada, perfil anonimizado; 15 RPC de soporte con usuario común → 42501 o vacío; panel desplegado sin sesión → `/login`.
- APK build 4: arranque en emulador Android OK.
- **No probado todavía:** ingreso real con números de prueba, cámara, GPS en segundo plano, push y flujo completo en teléfonos físicos.

## Avance técnico del piloto (A)
Regla: "verificado" solo si se recorrió en celular o en el panel. Código, pgTAP y llamadas a producción cuentan como "sin verificar". El e2e corre la app exportada para web: no cuenta como celular. Pesos: alto 3, medio 2, bajo 1 (total 70).

| Funcionalidad | Peso | Estado | Fuente |
| --- | --- | --- | --- |
| Panel: acceso solo soporte y revisión de verificación | alto | Verificado | e2e Fases 3–4 (CI) |
| Panel: DNI con URL firmada y vista registrada | alto | Verificado | e2e (CI) |
| Panel: reclamos, reportes, lista negra, tarifario, parámetros | medio | Verificado | e2e Fase 9 (CI) |
| Panel: soporte, sospechas, fichas, búsqueda y detalle de pedido | medio | Verificado | e2e Fases 8–9 |
| Panel: métricas del piloto | medio | Verificado | e2e Fase 9 |
| Panel: estado del sistema | bajo | Verificado | e2e Fase 9 |
| Panel: cola por riesgo, antecedentes e historial de verificación | medio | Verificado | e2e Fase 4 |
| Panel: apelaciones de llegadas incumplidas | bajo | Verificado | e2e Fase 7 |
| Panel: supervisión, capacitaciones con QR y lista negra de personas | medio | Verificado | e2e Fase 10 (186 pasos) |
| Panel en producción con ingreso real | alto | Sin verificar | Solo `/login`; falta primer admin |
| App: ingreso por SMS y modo Cliente/Profesional | alto | Sin verificar | e2e en export web |
| App: registro del profesional en 6 pasos (DNI +18, especialidades, video) | alto | Sin verificar | e2e en export web; cámara y video reales no probados |
| App: publicar pedido | alto | Sin verificar | e2e en export web |
| App: cotizar y aceptar oferta | alto | Sin verificar | e2e en export web |
| App: desglose, "Acepto" versionado, fotos antes/después, comprobante PDF, cupón y apelación | alto | Sin verificar | e2e en export web; cámara y PDF reales no probados |
| App: nivel, capacitaciones (código/QR, cuestionario, certificado) y restricción con apelación | alto | Sin verificar | e2e en export web; QR con cámara, Android ID y PDF reales no probados |
| App: servicio en curso (código, ubicación en vivo, reevaluación) | alto | Sin verificar | e2e en export web; GPS real no probado |
| App: cierre, calificación y constancia | alto | Sin verificar | e2e en export web |
| App: pausa por deuda y pago de comisión | alto | Sin verificar | e2e en export web |
| App: chat interno con filtro | medio | Sin verificar | e2e en export web |
| App: SOS, reportar/bloquear, eliminar cuenta | medio | Sin verificar | e2e; borrado de cuenta probado en producción |
| App: el profesional no llega | alto | Sin verificar | e2e y pgTAP `no_show` |
| App: notificaciones push | alto | Pendiente | Sin FCM |
| App: antifraude GPS en segundo plano | alto | Sin verificar | Requiere teléfono |
| Backend: matching y libro de comisiones | alto | Sin verificar | pgTAP en CI |
| Backend: permisos, políticas e índices (advisors) | medio | Sin verificar | pgTAP `hardening` y consultas en producción |
| Backend: cola y envío push (`send-push`) | medio | Sin verificar | 200/401 en producción |
| Backend: recordatorios de pedidos programados | bajo | Sin verificar | pgTAP `schedule` |
| Backend: limpieza de Storage | bajo | Sin verificar | En modo prueba (solo cuenta) |

Cálculo: verificado 18/70 = **25,7 %** · implementado sin verificar 49/70 = **70,0 %** · pendiente 3/70 = **4,3 %** (push, espera Firebase).

## Bloqueos para lanzar (B, sin porcentaje)
- **Seguridad (dueño):** borrar en Vercel las 13 variables que no se usan (lista en `docs/seguridad.md`); primer admin con un número sin código fijo; decidir si se activa el borrado de archivos huérfanos.
- **Cuentas (dueño):** Google Play Console (USD 25): desbloquea subir el AAB y la prueba cerrada (12 personas × 14 días si es cuenta personal). Apple Developer (USD 99/año), solo si hay iOS.
- **Servicios externos (dueño, pasos y precios en `docs/servicios-externos.md`):** Firebase (gratis) y llave FCM V1 en EAS; Twilio pagado (≈ USD 0.25 por SMS a Perú, ~USD 56/mes estimado en el piloto; **punto de parada**); Google Maps (uso gratis en Android, pide cuenta de facturación); datos de Yape/Plin y titular en Parámetros.
- **Legal (dueño + abogado):** términos y privacidad publicados (F8 los redacta); registro ANPDP (Ley 29733); Libro de Reclamaciones; Seguro y Garantía 30 días.
- **Cupón por falta (dueño):** confirmar monto (S/ 10) y tope mensual (S/ 500) en Panel → Parámetros; lo paga Cerquita como crédito al profesional.
- **Tarifario (dueño + profesionales):** validar tarifas, visita, catálogo y precios de referencia de Huancayo.
- **Prueba en 2 teléfonos físicos** (`docs/prueba-telefonos.md`): es lo que pasa A a "verificado".
- **Decisión 2026-11-18, saldo prepago (opción B):** pendiente de confirmación legal y de tiendas; mientras tanto rige la regla 3 (modelo A: deuda, pausa y constancia).

## Errores conocidos
- Advisors: 83 avisos de RPC `security definer` intencionales (cada una valida quién llama; justificados en `docs/seguridad.md`); `notification_outbox` sin políticas a propósito (solo la usa el servidor).
- El token personal de Supabase del entorno es inválido: el SQL de producción se aplica con el conector.
- En este entorno Docker muere al reiniciar el contenedor y el proxy bloquea la API de secretos de GitHub y descargas de artefactos.
- `docs/demo/cerquita-demo.html` es una simulación antigua.
