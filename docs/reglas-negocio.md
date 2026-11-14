# Cerquita · Reglas de negocio

Fuente de verdad funcional. Quien valida cada regla es **el servidor** (migraciones SQL: RLS y funciones); la app solo la refleja. Si este archivo y las migraciones difieren, mandan las migraciones y hay que corregir este archivo.

Equivalencias: “orders” = `jobs` · “commission ledger” = `wallet_entries` · “pro” = profesional.

## 1. Actores y acceso
- **Usuario:** celular peruano (+51 9XXXXXXXX) + código SMS de 6 dígitos. Otros países se rechazan (`hook_before_user_created`). Una misma cuenta puede actuar como cliente o profesional (`profiles.active_role`).
- **Soporte:** `app_metadata.staff_role` ∈ `reviewer`, `support`, `admin`. Los tres revisan oficios, constancias, SOS, sospechas, reportes, reclamos y tickets (`is_staff()`). Solo `admin` edita parámetros, tarifario y catálogo, suspende usuarios y revierte asientos (`is_admin()`).
- Los roles de soporte solo los asigna el service role (`set_staff_role`, script `staff:set` / `seed-staff.mjs`). El panel muestra “Sin acceso” a cualquier otro usuario.

## 2. Oficios y verificación por oficio
- 9 oficios en 4 categorías (`trades.category`) con su unidad de cobro (`pricing_unit`): técnicos (gasfitería, electricidad, hogar · por trabajo), construcción (albañilería, carpintería, pintura · por trabajo), servicio del hogar (limpieza · por hora; cuidado · por día) y choferes (chofer · por hora).
- La verificación es **por oficio** (`pro_trades`), no por persona. Requisitos (`trade_requirements()`), exigidos al enviar y al aprobar:
  - Todos: identidad = DNI frente, DNI reverso, selfie y antecedentes.
  - Técnicos y construcción: ≥ 2 evidencias del oficio (`min_trade_evidence`): foto de trabajo, certificado, referencia o cuestionario.
  - Choferes: licencia de conducir + récord de conductor (MTC/SAT).
  - Servicio del hogar: antecedentes policiales + penales + 2 referencias (`domestic_min_references`).
- Estados: `draft` → `submitted` (`submit_pro_trade`) → `in_review` → `approved_observation` | `needs_info` (motivo obligatorio; puede reenviar) | `rejected` (motivo obligatorio; reintento a los 30 días, `reject_retry_days`). Con 3 calificaciones de ≥ 4★ (`full_approval_ratings`, `full_approval_min_stars`) pasa a `approved_full`. `suspended`: por soporte, por antifraude o al eliminar la cuenta.
- Solo `approved_observation` y `approved_full` reciben pedidos de ese oficio.
- Documentos: bucket privado `verification/<usuario>/…`. Soporte los abre con URL firmada de corta vida y cada vista queda en `document_access_log` (inmutable).

## 3. Pedidos
- El cliente publica: oficio, descripción, hasta 6 fotos, precio que ofrece, cantidad de horas o días si aplica, dirección exacta y cuándo (`schedule_kind`: ahora, hoy más tarde o programado hasta 30 días con `scheduled_for`).
- **Tarifario sin regateo** (`trade_rate_cards` por oficio, ciudad y unidad): el pedido no puede bajar del mínimo × unidades. Ciudad y moneda se fijan al publicar (`active_city`, `currency_code`).
- **Privacidad:** el servidor guarda la zona redondeada a 3 decimales (~100 m) y la dirección exacta aparte; nadie la ve hasta que el cliente acepta una oferta.
- **Diagnóstico exprés:** video opcional de ≤ 15 s en el bucket privado `temp_media`; deja de poder abrirse a las 48 h y se borra.
- **Visita de diagnóstico presencial:** S/ 20 (`diagnostic_visit_fee_cents`). Si el cliente cancela tras la llegada, debe S/ 20; si se hace el trabajo, se descuenta de la mano de obra.
- Un cliente no puede cotizar su propio pedido.

| Estado | Quién lo provoca | Dónde |
| --- | --- | --- |
| `published` | Cliente publica | insert en `jobs` |
| `with_offers` | Llega la primera oferta (vuelve a `published` si se retiran todas) | trigger |
| `accepted` | Cliente acepta una oferta: se congelan precio y tasa | `accept_offer` |
| `on_the_way` | Pro asignado toca “Ir al domicilio”; se genera el código de 4 dígitos | `start_trip` |
| `at_home` | Pro ingresa el código que le da el cliente | `arrive` |
| `price_renegotiated` | Cliente aprueba una reevaluación en sitio | `propose_reevaluation` → `answer_reevaluation` |
| `finished` | Pro termina | `finish_job` |
| `confirmed` | Cliente confirma (“algo falta” lo devuelve a `at_home`) | `confirm_job` |
| `rated` | Cliente califica | insert en `ratings` |
| `cancelled` | Cliente o pro asignado, con motivo, antes de terminar | `cancel_service` |

- Ni el cliente ni el pro cambian el estado directamente: solo por estas funciones.
- **Tarifa de visita:** si el **cliente** cancela con el pro ya en el domicilio, debe la tarifa de visita del tarifario (o `default_visit_fee_cents`, S/ 30) y Cerquita anota su comisión sobre esa tarifa (`job:<id>:visit`).

## 4. Matching (reparto de pedidos)
Un profesional ve y puede cotizar un pedido solo si se cumple **todo** (`pro_is_eligible`, RLS de `jobs` y `offers`, `nearby_jobs()`):
1. Tiene ese oficio aprobado.
2. Está en línea (`pro_presence.online`) y con ubicación reciente (`update_presence`).
3. La zona del pedido está dentro de su radio (5 km por defecto; 0,5 a 50 km).
4. No está en pausa por deuda, ni suspendido, ni bloqueado con ese cliente.
5. El pedido está `published` o `with_offers`.

- Antes de aceptar ve: descripción, fotos y video, precio, distancia redondeada a 50 m, nombre corto y calificación del cliente. No ve la dirección exacta.
- **Lista negra de direcciones** (`blacklisted_locations`, solo soporte): los pros ven “Precaución en esta dirección” en pedidos a ≤ 100 m (`blacklist_radius_m`), sin el motivo. El cliente no ve nada.
- El cliente ve cuántos profesionales verificados hay cerca por oficio (`nearby_pros_summary`), nunca sus posiciones.

## 5. Cotizaciones
- Una oferta por profesional y pedido: precio y mensaje opcional. Debe quedar entre el mínimo y el máximo del tarifario × unidades.
- Estados: `pending` → `accepted` | `rejected` (al aceptarse otra) | `withdrawn` (la retira el pro) | `expired` (pedido cancelado).
- El cliente compara precio, calificación, trabajos hechos y distancia (`job_offers`) y puede ver el perfil público del pro (`pro_profile`).
- Al aceptar (`accept_offer`): la oferta pasa a aceptada, las demás a rechazadas y el pedido guarda la mano de obra y la tasa de comisión vigente (`commission_rate_bps`).
- Desde la aceptación el pro ve la dirección exacta. **El teléfono no se muestra a ninguna de las partes**: la comunicación es solo por el chat interno.

## 6. Servicio en curso
- **Código de seguridad:** 4 dígitos, visible solo para el cliente mientras el pro va en camino. Sin el código correcto el pro no puede marcar que llegó.
- **Ubicación en vivo:** solo el pro asignado puede enviar posiciones y solo entre “Ir al domicilio” y el fin del servicio. El cliente ve la última posición y la distancia. El rastro se borra a los 30 días.
- **Reevaluación en sitio:** en el domicilio, el pro propone nueva mano de obra, quién pone los materiales, ítems del catálogo (`materials_catalog`; el servidor suma) y la boleta (`material-receipts`, obligatoria si él compra). El cliente aprueba (→ `price_renegotiated` con el nuevo desglose) o rechaza (puede cancelar pagando la visita).
- **Cierre:** el pro termina; el cliente confirma. Confirmar es idempotente: una segunda confirmación no duplica nada.
- **Calificación:** ambas partes pueden calificar un servicio confirmado (1 a 5★, etiquetas, comentario y medio de pago usado).
- **Chat:** solo entre cliente y pro asignado, con el servicio activo, vía `send_job_message()`. Bloquea teléfonos (7+ dígitos con o sin separadores), correos y palabras clave (WhatsApp, “llámame al”, “págame por fuera”…). Cada intento queda en `chat_flags`.

## 7. Comisión y libro de cuentas
- **Comisión = 10 % solo sobre la mano de obra** (`jobs.labor_cents`). Los materiales (`materials_cents`) no pagan comisión.
- Cálculo en céntimos enteros: `(mano_de_obra × tasa_bps + 4999) / 10000`. La tasa (`commission_rate_bps`, 1000 = 10 %) se congela al aceptar la oferta.
- Se anota al **confirmar** el cliente (`job:<id>:commission`). La tarifa de visita genera su propio asiento (`job:<id>:visit`).
- `wallet_entries` es inmutable: solo inserts desde funciones del servidor, con `idempotency_key` único y saldo calculado con bloqueo por profesional. Tipos: `commission_debit` (−), `payment_credit` (+), `promo_credit` (+), `adjustment`, `reversal`.
- Los errores se corrigen con un asiento de reversión (`admin_reverse_entry`, solo admin, idempotente y auditado en `admin_actions`). Nunca se edita ni se borra.
- **Deuda:** si lo pendiente supera `debt_limit_cents` (S/ 30) durante más de `grace_days` (3 días), el pro queda **en pausa**: no puede cotizar. Se reactiva solo cuando un pago aprobado lo deja dentro del límite. Con `grace_days = 0` la pausa es inmediata.
- **Promoción de lanzamiento:** `launch_promo_jobs` primeros trabajos sin comisión (se abona como `promo_credit`). Hoy 0.

## 8. Pagos
- **Cliente → profesional:** directo (efectivo, Yape, Plin o transferencia). Cerquita no toca ese dinero.
- **Profesional → Cerquita (comisión):** paga por Yape, Plin o transferencia a la cuenta de la empresa y sube su constancia (medio, código de operación, monto y captura). El código de operación no se puede repetir por medio.
- Soporte revisa la constancia (`review_payment_proof`): aprobar abona `payment_credit` por el monto; rechazar exige motivo.
- Los datos de cobro de la empresa se leen de `settings` (`yape_number`, `plin_number`, `yape_qr_url`, `plin_qr_url`, `account_holder`, `bank_account`) y se cargan en Panel → Parámetros.
- **Prohibido** (reglas de las tiendas): compras dentro de la app, recargas, créditos, destacados, suscripciones y la frase “comprar saldo”.

## 9. Puntos y ranking
- **Puntos Cerquita** (`points_entries`, inmutable): el cliente gana 1 punto por cada S/ 1 de mano de obra confirmada (`points_per_sol`). 1 punto = S/ 0,05 (`point_value_cents`); tope 20 % de la mano de obra (`max_points_discount_pct`).
- El descuento por puntos (`apply_points`) lo asume Cerquita: se abona al pro como `promo_credit`. Los puntos no se compran.
- **Ranking de profesionales** (`pro_ranking`): trabajos × 10 + calificación × 20 − sospechas de bypass × 50. Niveles: Nuevo (< 80), Bronce (≥ 80), Plata (≥ 250), Oro (≥ 600).

## 10. Seguridad, privacidad y confianza
- RLS activa en todas las tablas, con permisos por columna. Nunca se desactiva.
- **Presencia:** del pro en línea se guarda solo la última posición (sin historial), para el reparto y el antifraude.
- **Antifraude GPS** (`detect_bypass`, cada 5 min): pedido cancelado y pro ≥ 15 min a ≤ 150 m del domicilio → `bypass_suspicions`. Con 2 en 7 días se suspenden sus oficios. Soporte confirma o descarta (descartar levanta la suspensión).
- **SOS:** toque largo, cuenta regresiva de 5 s, alerta a soporte con ubicación cada 10 s, aviso a hasta 3 contactos de confianza y accesos a 105, 116 y 106. Solo soporte cierra la alerta, con nota.
- **Reportar y bloquear:** requieren un pedido en común. El bloqueo corta chat, ofertas, pedidos visibles y notificaciones entre ambos. Soporte revisa en Panel → Reportes.
- **Reclamos** (`file_claim`): solo por servicios hechos en la app. Soporte ve los documentos verificados del pro (vista registrada) y resuelve; el DNI no se entrega directo al cliente.
- **Suspensión manual** (`admin_set_suspension`, solo admin): bloquea el ingreso y queda auditada.
- **Eliminar cuenta** (`delete_my_account`): no procede con un servicio en curso; anonimiza y bloquea la cuenta; conserva el libro de comisiones por obligación legal.
- **Archivos:** todos los buckets son privados salvo `avatars`. La limpieza de huérfanos y de videos vencidos corre cada hora.
- **Soporte al usuario:** tickets por categoría (`support_tickets`); la respuesta llega por notificación.

## 11. Notificaciones
- Eventos que encolan en `notification_outbox`: pedido nuevo (pros elegibles cercanos), oferta recibida, mensaje de chat, aceptado, en camino, llegó, reevaluación, precio aprobado, terminado, confirmado, cancelado y respuesta de soporte.
- `pg_cron` llama cada minuto a la Edge Function `send-push` (Expo Push, lotes de 100, 3 reintentos, borra tokens dados de baja). Un bloqueo entre usuarios también corta las notificaciones.

## 12. Parámetros (`settings`)
Se leen con `setting_int` / `setting_text`: primero `city:<ciudad>`, luego `global`. Nunca se fijan en el código.

| Clave | Valor inicial | Uso |
| --- | --- | --- |
| `commission_rate_bps` | 1000 | Comisión (10 %) |
| `debt_limit_cents` · `grace_days` | 3000 · 3 | Límite de deuda y días de gracia |
| `launch_promo_jobs` | 0 | Trabajos iniciales sin comisión |
| `full_approval_ratings` · `full_approval_min_stars` | 3 · 4 | Paso a aprobación plena |
| `min_trade_evidence` · `domestic_min_references` | 2 · 2 | Evidencias y referencias mínimas |
| `reject_retry_days` | 30 | Espera para reenviar un oficio rechazado |
| `active_city` · `currency_code` | huancayo · PEN | Ciudad y moneda del piloto |
| `default_visit_fee_cents` · `diagnostic_visit_fee_cents` | 3000 · 2000 (Huancayo) | Tarifa de visita y visita de diagnóstico |
| `bypass_radius_m` · `bypass_minutes` · `bypass_max_per_week` | 150 · 15 · 2 | Antifraude GPS |
| `blacklist_radius_m` | 100 | Aviso de precaución |
| `temp_media_hours` · `max_video_seconds` | 48 · 15 | Video de diagnóstico |
| `points_per_sol` · `point_value_cents` · `max_points_discount_pct` | 1 · 5 · 20 | Puntos |
| `yape_number`, `plin_number`, `yape_qr_url`, `plin_qr_url`, `account_holder`, `bank_account` | vacío | Datos de cobro de la empresa |
| `push_function_url` | vacío | URL de `send-push` (se fija al desplegar) |

## 13. Decisiones abiertas (del dueño)
- “Seguro Cerquita” y “Garantía por 30 días” aparecen en avisos de la app pero **no están definidos**: definirlos con un abogado o retirar el texto antes de abrir al público.
- Tarifario y precios del catálogo de producción son **estimados**: validarlos con profesionales de Huancayo.
- Términos y política de privacidad: borrador en `docs/legal/terminos-borrador.md`, falta revisión legal (Ley 29733, uso del GPS para antifraude).
- Comprobantes de pago por la comisión (SUNAT): por definir con un contador.
