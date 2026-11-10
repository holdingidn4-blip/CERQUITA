# Cerquita · Progreso del MVP

Última actualización: fase 5 terminada (10 de noviembre de 2026). Plan completo en `documento-tecnico.md`.

| Fase | Estado | Criterio de cierre | Cómo se comprueba |
| --- | --- | --- | --- |
| 1. Base del proyecto | ✅ | La app abre en Expo y el panel corre en local | `pnpm check`, `expo export`, `next build` |
| 2. Esquema y seguridad | ✅ | Pruebas de RLS que fallan si un cliente lee pedidos ajenos | `pnpm db:test` (`rls.test.sql`) |
| 3. Ingreso y roles | ✅ | Ingreso por SMS, modo Cliente/Profesional y panel solo para soporte | `auth.test.sql`, `pnpm db:smoke`, `pnpm e2e` |
| 4. Registro y verificación | ✅ | Un oficio aprobado aparece “en observación” y pasa a pleno con 3 calificaciones de 4★ o más | `verification.test.sql`, `pnpm e2e` |
| 5. Pedidos y ofertas | ✅ | Reparto solo a oficio aprobado, en línea y dentro del radio; el cliente acepta y se congelan precio y tasa | `orders.test.sql`, `pnpm e2e` |
| 6. Servicio en curso | ⏳ | — | — |
| 7. Comisión | ⏳ | — | — |
| 8. Seguridad y publicación | ⏳ | — | — |

## Pruebas

| Tipo | Cantidad | Comando |
| --- | --- | --- |
| Unitarias (`packages/shared`) | 100 | `pnpm test` |
| Base de datos (pgTAP: RLS, ingreso, verificación, pedidos) | 148 | `pnpm db:test` |
| Humo del ingreso por SMS (Auth local) | 7 | `pnpm db:smoke` |
| Navegación de punta a punta (app web + panel) | 57 | `pnpm e2e` |

Para `pnpm e2e`: `pnpm db:start && pnpm db:reset`, el panel con `next build && next start --port 3001` y la app con
`expo export --platform web` servida en el puerto 8099 (ver `e2e/flujos.mjs`). El CI hace todo esto en el job `e2e`.

## Fase 5 · Qué se construyó

**Servidor** (`supabase/migrations/20261110000600_orders_offers.sql`)
- Todas las lecturas para la app pasan por funciones que devuelven solo lo necesario: distancias redondeadas a 50 m y nombres cortos (“Carlos M.”). Nunca coordenadas de un profesional, dirección exacta ni teléfono.
- `nearby_pros_summary(punto, radio)`: cuántos profesionales verificados en línea hay por oficio (pantalla 1).
- `price_hint(oficio)`: rango habitual (percentiles 25–75) de los últimos 90 días; solo con 5 pedidos o más.
- `nearby_jobs()`: solicitudes para el profesional (pantalla 7), con la misma regla 4 de la RLS (oficio aprobado + en línea + radio) y su oferta si ya cotizó.
- `job_offers(pedido)`: ofertas para el dueño del pedido (pantalla 3), con calificación, trabajos hechos y distancia del pro al pedido.
- `pro_profile(pro)`: perfil público (pantalla 4) solo de profesionales con algún oficio aprobado.
- `accept_offer(oferta)`: solo el cliente; bloquea el pedido, acepta la oferta, rechaza las demás y **congela** `final_price_cents` y `commission_rate_bps` (leída de `settings`).
- `private.commission_cents()`: fórmula única de la comisión (la usará la fase 7), con su gemela en `packages/shared` probada con los mismos casos.
- Triggers: cancelar el pedido vence las ofertas pendientes; retirar la última oferta devuelve el pedido a “Publicado”; las fotos solo pueden estar en `job-photos/<pedido>/`.

**App**
- Pantalla 1: ubicación con permiso (solo en primer plano), mapa con tu radio, oficios con “N cerca” y tus pedidos activos.
- Pantalla 2: descripción, hasta 3 fotos, dirección + referencia, precio en soles y rango habitual. El servidor guarda la zona redondeada a ~110 m.
- Pantalla 3: ofertas con “Tu precio” / “Contraoferta”, distancia y llegada estimada, mensaje del pro, ver perfil, aceptar y cancelar pedido. Se actualiza sola cada 5 s.
- Pantalla 4: perfil con calificación, trabajos, reseñas y “Aceptar y contratar”.
- Pantalla 7: interruptor “En línea” (guarda la ubicación actual), solicitudes cercanas, “Aceptar S/ X”, “Cotizar” y retirar oferta.
- Pantalla 8: precios sugeridos, monto libre, comisión con la tasa de `settings` y lo que recibirá, mensaje opcional. Fotos del pedido con URL firmada.
- Pantalla 5 provisional: tras aceptar se ven precio, dirección y teléfono (enmascarado). El seguimiento llega en la fase 6.

## Decisiones tomadas en la fase 5
- **Actualización por consulta periódica** (5 s en ofertas, 10 s en solicitudes) en lugar de Realtime: la fase 6 abre el canal por pedido.
- **Mapa:** `react-native-maps` en el teléfono; en web (pruebas) se muestra un marcador simple. En Android publicado hará falta una clave de Google Maps.
- **El mapa no muestra marcadores de profesionales**: el documento técnico dice que el cliente solo ve distancia. Se muestran conteos por oficio.
- **Sin “¿Cuándo? Ahora / Hoy / Programar”** de la pantalla 2: no hay columna en `jobs`. Queda como pendiente por decidir.
- **Sin “Experiencia”, “Especialidades” ni “Trabajos recientes”** en la pantalla 4: no hay datos en el modelo; las fotos de verificación son privadas.
- **Oficios del diseño fuera del catálogo** (Cerrajero, Jardinero, Más): no se muestran.
- **Comisión con empate de medio céntimo a favor del profesional.** Confirmar en la fase 7.
- **Pausa de ofertas por deuda** (pantalla 16): se aplica en la fase 7, junto con el libro.

## Fase 4 · Qué se construyó

**Servidor** (`supabase/migrations/20261110000500_verification.sql`)
- Catálogo con `trades.pro_name` (“Gasfitero”, “Electricista”…). Oficios y parámetros se crean en la migración, así existen también en producción.
- Parámetros nuevos en `settings`: `full_approval_ratings` (3), `full_approval_min_stars` (4), `min_trade_evidence` (2), `reject_retry_days` (30).
- El profesional solo crea borradores y los borra mientras sean borradores. El estado ya no se cambia directamente: solo por funciones.
- `submit_pro_trade()`: exige DNI frente y reverso, selfie, antecedentes y al menos 2 evidencias del oficio; tras un rechazo, espera 30 días.
- `review_pro_trade()` (solo soporte): `start` (enviado → en revisión), `approve` (→ en observación, vuelve a validar la evidencia), `needs_info` y `reject` (motivo obligatorio). Registra quién revisó y cuándo.
- Trigger en `ratings`: cada calificación de 4★ o más del cliente al profesional asignado suma; al llegar a 3, el oficio pasa a aprobado pleno.
- `my_verification()`: identidad verificada (algún oficio aprobado) y documentos de identidad que faltan.

**App** (pantallas 9 y 12)
- Registro en pasos: nombre como en el DNI → oficios, identidad, pruebas del oficio y zona de trabajo (1, 3, 5 o 10 km).
- Fotos desde cámara o galería (`expo-image-picker`), subidas a `verification/<id del pro>/…`. El pro no puede volver a leerlas.
- Mis oficios: estado de cada oficio con texto del diseño, motivo del revisor, “Subir más evidencia” y “Enviar a revisión”, avance “N de 3” en observación.

**Panel** (pantalla 20, sección Verificación)
- Cola por oficio (más antiguos primero) con evidencia y “Enviado/Reenviado hace…”.
- Caso: identidad, evidencia, historial de otros oficios, motivo y las tres decisiones.
- “Ver” un documento pasa por `/documentos/[id]`: registra la vista en `document_access_log` como el revisor y redirige a una URL firmada de 60 s. La service role solo se usa en el servidor para firmar.

## Decisiones tomadas en esta fase
- **Identidad verificada** se deriva de tener algún oficio aprobado (aprobar exige revisar la identidad), sin una tabla nueva.
- **“Otro” oficio** del diseño no se incluyó: no está en el catálogo. Se agrega como fila de `trades` si se decide.
- **Abrir un caso** lo pasa a “En revisión” automáticamente.
- **Archivos de un borrador borrado** quedan en storage (las filas sí se borran). Limpieza pendiente para la fase 8.

## Pendientes por decidir (no frenan la fase 6)
- “¿Cuándo?” del nuevo pedido (ahora, hoy o programado): requiere un campo nuevo en `jobs`.
- Clave de Google Maps para Android (EAS) antes de publicar.
- Precio máximo de un trabajo “en observación” (pantalla 12; hoy el texto no muestra monto).
- Proveedor de SMS real (hoy Twilio con credenciales de relleno en local).
- URLs definitivas de términos y privacidad.
- Trabajos sin comisión de la promoción de lanzamiento (`launch_promo_jobs` = 0).
- Resto de la lista en `documento-tecnico.md` → “Pendientes por decidir”.
