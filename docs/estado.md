# Cerquita · Estado

Actualizado: 2026-11-23. Se **reescribe** en cada fase (máx. 100 líneas, sin historial; el historial está en git y `docs/progreso.md`).

## Plan de lanzamiento (F1–F8, `cerquita-prompt-lanzamiento`)
- **Fase actual:** F1 cerrada → empieza **F2** (registro del profesional paso a paso).
- **Último paso terminado:** F1 Seguridad con evidencia (`docs/seguridad.md`), migración `20261123000100` aplicada en producción.
- **Siguiente paso exacto:** F2 · diseñar el asistente de 6 pasos del registro (datos y DNI, oficios, evidencia, antecedentes, zona, revisión) sobre `apps/mobile/src/app/(pro)/registro.tsx`, con autoguardado.
- F3–F8 pendientes. Puntos de parada: pagos, cuentas del dueño, publicar en Google Play o cambios irreversibles en producción.

## Implementado
- Monorepo pnpm: app Expo (`apps/mobile`), panel Next.js (`apps/admin`), lógica compartida (`packages/shared`), Supabase (27 migraciones).
- Ingreso por SMS (OTP), modo Cliente/Profesional, hook que solo admite +51 9XXXXXXXX, roles de soporte.
- Registro del pro y verificación por oficio (9 oficios, 4 categorías, requisitos por categoría, cola y revisión en el panel).
- Pedidos: tarifario sin regateo, fotos, video (15 s, 48 h), visita de diagnóstico S/ 20, programación y recordatorio 60 min antes.
- Matching en el servidor (oficio aprobado, en línea, radio, sin pausa/bloqueo); lista negra de direcciones.
- Cotización con hora de llegada, código de 4 dígitos, ubicación en vivo, reevaluación con materiales y boleta, cierre y confirmación.
- Profesional que no llega: tolerancia 15 min, cambio de profesional, faltas (3 en 30 días pausan sus ofertas).
- Comisión 10 % solo sobre mano de obra; libro inmutable; pausa por deuda (S/ 30, 3 días); pago con constancia y aprobación.
- Chat interno con filtro; puntos, ranking, reclamos, reportar/bloquear, tickets, SOS, antifraude GPS (también en segundo plano), eliminar cuenta.
- Panel: verificación, constancias, SOS, sospechas, soporte, reportes, reclamos, lista negra, tarifario, parámetros, fichas, búsqueda, **Métricas** y **Sistema** (cron, cola y llamadas).
- **Seguridad (F1):** panel sin `service_role`; `anon` no ejecuta funciones; 59 RPC con validación interna; teléfono entre partes retirado; políticas por acción e índices en todas las claves foráneas.

## Desplegado (producción del piloto)
- **Backend:** Supabase `cerquita` (`dknxuxrylnncbdzjqagh`, São Paulo, plan gratis). 27 migraciones aplicadas y verificadas (mismas huellas que en local), seed de Huancayo, 30 tablas con RLS, 6 tareas cron.
- **Auth:** Phone con Twilio trial (solo números verificados) + números de prueba con OTP fijo.
- **Notificaciones:** Edge Function `send-push` (secreto en Vault) y cron cada minuto; falta FCM para que lleguen a Android.
- **APK:** build 4 (commit `c6a5702`), firmado con la llave de depuración: se reemplaza en F8 por un APK de EAS (ver `docs/seguridad.md`). Enlace en `docs/produccion.md`.
- **Panel:** https://cerquita-nine.vercel.app (Vercel, rama `main`). Sin sesión → `/login`.
- **AAB:** EAS `@holdingidn/cerquita`, perfil `production`, build `a1a6c154` (versionCode 2), llave en EAS.

## Pruebas (última corrida)
- Local (2026-11-23, base reseteada): pgTAP 497 (15 suites; nueva `hardening` 14), e2e 154 pasos, unitarias 198. Todo en verde.
- CI en `main` (`1595fa4`, 2026-11-21): base, chequeo y e2e en verde.
- Producción (F1, transacciones revertidas): borrar cuenta de pro con DNI visto → documentos 0, vista conservada, perfil anonimizado; 15 RPC de soporte con usuario común → 42501 o vacío; panel desplegado sin sesión → `/login`.
- APK build 4: arranque en emulador Android OK.
- **No probado todavía:** ingreso real con números de prueba, cámara, GPS en segundo plano, push y flujo completo en teléfonos físicos.

## Avance técnico del piloto (A)
Regla: "verificado" solo si se recorrió en celular o en el panel. Código, pgTAP y llamadas a producción cuentan como "sin verificar". El e2e corre la app exportada para web: no cuenta como celular. Pesos: alto 3, medio 2, bajo 1 (total 59).

| Funcionalidad | Peso | Estado | Fuente |
| --- | --- | --- | --- |
| Panel: acceso solo soporte y revisión de verificación | alto | Verificado | e2e Fases 3–4 (CI) |
| Panel: DNI con URL firmada y vista registrada | alto | Verificado | e2e (CI) |
| Panel: reclamos, reportes, lista negra, tarifario, parámetros | medio | Verificado | e2e Fase 9 (CI) |
| Panel: soporte, sospechas, fichas, búsqueda y detalle de pedido | medio | Verificado | e2e Fases 8–9 |
| Panel: métricas del piloto | medio | Verificado | e2e Fase 9 |
| Panel: estado del sistema | bajo | Verificado | e2e Fase 9 |
| Panel en producción con ingreso real | alto | Sin verificar | Solo `/login`; falta primer admin |
| App: ingreso por SMS y modo Cliente/Profesional | alto | Sin verificar | e2e en export web |
| App: registro del profesional y evidencia | alto | Sin verificar | e2e en export web |
| App: publicar pedido | alto | Sin verificar | e2e en export web |
| App: cotizar y aceptar oferta | alto | Sin verificar | e2e en export web |
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

Cálculo: verificado 13/59 = **22,0 %** · implementado sin verificar 43/59 = **72,9 %** · pendiente 3/59 = **5,1 %** (push, espera Firebase).

## Bloqueos para lanzar (B, sin porcentaje)
- **Seguridad (dueño):** borrar en Vercel las 13 variables que no se usan (lista en `docs/seguridad.md`); primer admin con un número sin código fijo; decidir si se activa el borrado de archivos huérfanos.
- **Cuentas (dueño):** Google Play Console (USD 25): desbloquea subir el AAB y la prueba cerrada (12 personas × 14 días si es cuenta personal). Apple Developer (USD 99/año), solo si hay iOS.
- **Servicios externos (dueño):** SMS con cobertura en Perú; Firebase FCM (push); clave de Google Maps; datos de Yape/Plin y titular en Parámetros.
- **Legal (dueño + abogado):** términos y privacidad publicados (F8 los redacta); registro ANPDP (Ley 29733); Libro de Reclamaciones; Seguro y Garantía 30 días.
- **Tarifario (dueño + profesionales):** validar tarifas, visita, catálogo y precios de referencia de Huancayo.
- **Prueba en 2 teléfonos físicos** (`docs/prueba-telefonos.md`): es lo que pasa A a "verificado".
- **Decisión 2026-11-18, saldo prepago (opción B):** pendiente de confirmación legal y de tiendas; mientras tanto rige la regla 3 (modelo A: deuda, pausa y constancia).

## Errores conocidos
- Advisors: 59 avisos de RPC `security definer` intencionales (justificados en `docs/seguridad.md`).
- El token personal de Supabase del entorno es inválido: el SQL de producción se aplica con el conector.
- En este entorno Docker muere al reiniciar el contenedor y el proxy bloquea la API de secretos de GitHub y descargas de artefactos.
- `docs/demo/cerquita-demo.html` es una simulación antigua.
