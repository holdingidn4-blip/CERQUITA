# Cerquita · Documento técnico de arranque (MVP)

Versión del 9 de noviembre de 2026. La versión editable está en Claude Docs; este archivo es la copia para el repositorio.

## Decisión de stack

**Elegimos React Native con Expo y TypeScript.** La app, el backend y el panel admin quedan en un solo lenguaje, y Expo compila la versión de iPhone en la nube sin una Mac propia.

| Criterio | React Native + Expo | Flutter |
| --- | --- | --- |
| Lenguaje | TypeScript, el mismo del backend y del panel web | Dart, solo para la app; el panel admin iría en otro lenguaje |
| Compilar para iPhone | EAS Build compila en la nube; no necesitas Mac para el día a día | Necesitas Mac propia o un servicio de compilación en la nube |
| Ubicación en segundo plano | expo-location + expo-task-manager con servicio en primer plano y notificación visible | geolocator + servicio en primer plano; madurez parecida |
| Mapas | react-native-maps (Google Maps en Android, Apple o Google en iOS) | google_maps_flutter |
| Correcciones sin pasar por la tienda | Actualizaciones OTA de JavaScript con EAS Update | No hay equivalente oficial |
| Rendimiento en Android económico | Suficiente para listas, mapa y formularios; hay que medirlo | Algo más fluido en animaciones |

Flutter sería igual de válido. La ventaja que inclina la balanza es un solo lenguaje para todo, sobre todo si programas con ayuda de IA: un solo repositorio que Claude Code entiende de punta a punta. Confirma la versión vigente de Expo SDK al crear el proyecto.

**Resto del stack:** Supabase (Postgres, autenticación por SMS, almacenamiento privado, tiempo real y funciones en el servidor) y un panel admin en Next.js. Todo en un monorepo.

## Arquitectura

```
App móvil (Expo) ──► Google Maps (mapa y distancias)
      │                                  Panel admin (Next.js)
      ▼                                          │
┌──────────────────────── Supabase ─────────────▼──────────┐
│ Auth (SMS, roles) · Postgres (15 tablas + RLS)            │
│ Storage (bucket privado) · Realtime (canal por pedido)    │
│ Functions (libro de comisiones, reparto, SOS)             │
└───────────────────────────┬──────────────────────────────┘
                            ▼
              Proveedor SMS / WhatsApp (código de ingreso, avisos SOS)
```

La app y el panel solo leen y escriben a través de Supabase con políticas RLS; las reglas de dinero, reparto y SOS viven en funciones del servidor. Los builds y las actualizaciones OTA salen de EAS hacia Google Play y App Store.

## Pantallas del MVP

El MVP tiene 20 pantallas móviles y un panel web; `design/pantallas/` tiene el diseño de cada una.

| # | Pantalla | Rol | Ruta sugerida | Qué resuelve |
| --- | --- | --- | --- | --- |
| 0 | Ingreso con celular | Ambos | `/(auth)/ingreso` | Código por SMS y elección de rol |
| 1 | Inicio con mapa | Cliente | `/(cliente)/inicio` | Profesionales cerca y acceso a pedir |
| 2 | Nuevo pedido y precio | Cliente | `/(cliente)/pedido/nuevo` | Oficio, descripción, fotos y precio ofrecido |
| 3 | Ofertas recibidas | Cliente | `/(cliente)/pedido/[id]/ofertas` | Comparar y aceptar una oferta |
| 4 | Perfil del profesional | Cliente | `/(cliente)/profesional/[id]` | Calificaciones, oficios verificados |
| 5 | En camino | Cliente | `/(cliente)/servicio/[id]` | Mapa en vivo, código de seguridad, SOS |
| 11 | Confirmar monto final | Cliente | `/(cliente)/servicio/[id]/confirmar` | Cliente aprueba el monto que marca el profesional |
| 6 | Calificar servicio | Cliente | `/(cliente)/servicio/[id]/calificar` | Medio de pago usado y calificación |
| 9 | Registro del profesional | Profesional | `/(pro)/registro` | Oficios, identidad y evidencia |
| 12 | Mis oficios y verificación | Profesional | `/(pro)/oficios` | Estado de cada oficio y motivo del revisor |
| 13 | Aviso de ubicación | Profesional | `/(pro)/permiso-ubicacion` | Explicación propia antes del permiso del sistema |
| 7 | Solicitudes cercanas | Profesional | `/(pro)/solicitudes` | Pedidos filtrados por oficio, línea y radio |
| 8 | Enviar cotización | Profesional | `/(pro)/solicitudes/[id]/cotizar` | Precio, comisión 10 % y neto |
| 10 | Servicio en curso | Profesional | `/(pro)/servicio/[id]` | “Ir al domicilio”, “Llegué”, “Terminado”, SOS |
| 14 | Mi comisión | Profesional | `/(pro)/comision` | Pendiente, límite y movimientos del libro |
| 15 | Pagar comisión | Profesional | `/(pro)/comision/pagar` | Yape, Plin o transferencia y constancia |
| 16 | Ofertas pausadas | Profesional | estado de `/(pro)/solicitudes` | Bloqueo de cotizar al pasar el límite |
| 17 | SOS activado | Ambos | modal global | Cuenta regresiva, aviso a contactos y soporte |
| 18 | Contactos de confianza | Ambos | `/ajustes/contactos` | Hasta 3 contactos para SOS |
| 19 | Cuenta y privacidad | Ambos | `/ajustes` | Cambio de rol, políticas, eliminar cuenta |
| 20 | Panel admin | Soporte | web `/admin` | Cola de verificación, constancias, alertas SOS, parámetros |

Las rutas siguen el estilo de Expo Router (carpetas por grupo de rol). Son una propuesta; se pueden ajustar al crear el proyecto.

## Modelo de datos

Quince tablas en Postgres cubren el MVP; los montos van siempre en céntimos de sol (`int`), nunca con decimales.

| Tabla | Campos principales | Notas |
| --- | --- | --- |
| `profiles` | id (= auth.users), phone, full_name, active_role (client/pro), avatar_url, deleted_at | Un usuario puede tener ambos roles |
| `trades` | id, slug, name | Catálogo: gasfitería, electricidad, carpintería, pintura, hogar |
| `pro_trades` | id, pro_id, trade_id, status, reviewed_by, reviewed_at, reason, good_ratings_count | Verificación POR OFICIO; ver estados |
| `verification_documents` | id, pro_id, pro_trade_id?, kind (dni_front, dni_back, selfie, background, work_photo, certificate, reference, quiz), storage_path, created_at | Bucket privado; nunca URL pública |
| `document_access_log` | id, document_id, viewer_id, viewed_at | Quién vio qué documento sensible |
| `pro_presence` | pro_id, online, radius_m, last_point (geography), updated_at | Solo última posición; sin historial fuera de servicio |
| `jobs` | id, client_id, trade_id, description, photos, offered_price_cents, approx_point, exact_address (oculta), status, accepted_offer_id, final_price_cents, commission_rate_bps, created_at | Dirección exacta visible solo tras aceptar |
| `offers` | id, job_id, pro_id, price_cents, message, status, created_at | El precio y la tasa se congelan al aceptar |
| `job_tracks` | job_id, point, recorded_at | Rastro corto del servicio; borrado programado a 30 días |
| `wallet_entries` | id, professional_id, job_id?, type, amount_cents, balance_after_cents, external_ref, idempotency_key (único), created_at, created_by | Libro inmutable; ver reglas de comisión |
| `payment_proofs` | id, professional_id, method (yape/plin/transfer), operation_code, amount_cents, image_path, status, reviewed_by | Constancias que el panel aprueba |
| `ratings` | id, job_id, from_id, to_id, stars, tags, comment | Solo trabajos confirmados en la app |
| `trusted_contacts` | id, user_id, name, phone, relation | Máximo 3 por usuario |
| `sos_alerts` | id, job_id, user_id, status, opened_at, closed_at, closed_by, note | Alerta visible en el panel |
| `settings` | key, value, scope (ciudad/oficio) | Tasa 10 %, límite S/ 30, 3 días de gracia, promoción |

Cada tabla lleva políticas RLS de Supabase: un cliente solo lee sus pedidos, un profesional solo ve pedidos de sus oficios aprobados, y los documentos de verificación solo los lee el rol revisor.

## Estados

**Pedido (`jobs.status`)** — la comisión nace solo cuando el cliente confirma el monto:

```
Publicado → Con ofertas → Aceptado (precio y tasa congelados) → En camino
→ En el domicilio → Terminado (lo marca el profesional)
→ Confirmado (se crea commission_debit) → Calificado

Cancelado: antes de Terminado, o vencido sin ofertas; el GPS se corta.
```

El seguimiento GPS solo existe entre Aceptado y Terminado.

**Verificación por oficio (`pro_trades.status`):** borrador → enviado → en revisión → aprobado en observación → aprobado pleno (3 calificaciones de 4★ o más). Desde en revisión también puede ir a falta información (vuelve a enviado) o rechazado (con motivo; reintenta en 30 días). Cualquier estado aprobado puede pasar a suspendido por denuncia, calificaciones bajas o documento falso.

**Profesional frente a la comisión:** activo → sobre el límite (gracia de 3 días) → ofertas pausadas → activo al quedar bajo el límite.

**Alerta SOS (`sos_alerts.status`):** cuenta regresiva → abierta (comparte cada 10 s) → cerrada por soporte con nota; o cancelada durante la cuenta regresiva.

## Reglas de comisión y libro de cuentas

La comisión es el 10 % del precio acordado y se anota como deuda del profesional; el cliente le paga al profesional fuera de la app y Cerquita nunca toca ese dinero.

1. Al aceptar una oferta se congelan `final_price_cents` y `commission_rate_bps` (1000 = 10 %).
2. El profesional marca “Terminado”; el cliente confirma el monto. Un monto distinto al acordado exige aprobación del cliente.
3. Al confirmar, una función del servidor crea un asiento `commission_debit` = precio × tasa, con `idempotency_key = job:<id>:commission` para no cobrar dos veces.
4. Si hay saldo a favor (por ejemplo `promo_credit`), el asiento lo consume primero.
5. Si la comisión pendiente supera el límite (S/ 30) durante más de 3 días, el profesional no puede enviar ofertas nuevas; los servicios ya aceptados siguen.
6. El profesional paga por Yape, Plin o transferencia y sube la constancia; el panel admin la aprueba y crea un `payment_credit`.
7. Al quedar por debajo del límite, las ofertas se reactivan solas.

**Reglas del libro (`wallet_entries`)**

- Tipos: `commission_debit`, `payment_credit`, `promo_credit`, `adjustment`, `reversal`.
- Nunca se edita ni se borra una fila; un error se corrige con un asiento `reversal`.
- `balance_after_cents` se calcula dentro de una transacción con bloqueo por profesional.
- Solo funciones del servidor escriben en el libro; la app lo lee.

**Lo que la app no debe tener:** botón de recarga, venta de créditos, destacados ni suscripciones, ni las palabras “comprar saldo”. Esto mantiene el pago fuera de Google Play Billing y de las compras de Apple (reglas 3.1.1 y 3.1.3(e)).

## Ubicación, seguridad y privacidad

La ubicación del profesional se comparte solo con un servicio aceptado y se corta sola al terminar o cancelar; el servidor, no la app, garantiza que nadie reciba posiciones ajenas.

| Momento | Quién comparte | Con quién | Intervalo propuesto |
| --- | --- | --- | --- |
| Pedido publicado | Cliente: zona aproximada | Profesionales del oficio en el radio | Una vez |
| Pro en línea sin trabajo | Profesional | Solo el servidor (el cliente ve distancia) | Al cambiar de zona |
| En camino | Profesional | El cliente del pedido | 5–10 s; 3–5 s a menos de 200 m |
| En el domicilio | Profesional | Cliente y soporte | 30–60 s |
| Terminado o cancelado | Nadie | Nadie | Se corta el envío |

Con batería bajo 20 % se duplica el intervalo; bajo 10 %, cada 60 s y aviso a ambos. Sin señal se guarda localmente y se envía al volver. Son valores de partida para medir en Android económicos.

**Implementación**

- Un canal de Supabase Realtime por pedido; una función valida que el pedido esté aceptado y que quien envía sea el profesional asignado.
- Se guarda solo la última posición y un rastro corto en `job_tracks`, que se borra a los 30 días.
- El seguimiento en segundo plano empieza con “Ir al domicilio”, con notificación visible, y termina con “Llegué” o al cancelar.
- Antes del permiso del sistema se muestra la pantalla 13; si eligen “Ahora no”, la app sigue funcionando sin insistir.

**SOS**

- Toque largo de 2 s, cuenta regresiva de 5 s con “Cancelar”.
- Envía ubicación y datos del servicio a hasta 3 contactos (SMS o enlace de WhatsApp) y crea una alerta en el panel.
- Comparte ubicación cada 10 s hasta que soporte cierre la alerta con una nota.
- Los botones 105, 116 y 106 abren el marcador; la app nunca llama sola. Verifica los números antes de publicar.

**Otras reglas**

- Teléfono del otro oculto hasta aceptar; chat y llamadas pasan por la app.
- Código de seguridad de 4 dígitos que el cliente da al llegar el profesional.
- DNI, selfie y antecedentes en un bucket privado con URLs firmadas de corta vida y registro de acceso.
- Eliminar cuenta desde la app (exigencia de Apple 5.1.1(v)).
- Plazos de retención y aviso de filtración en 48 horas: definir con un abogado (Ley 29733 y su reglamento).

## Plan de trabajo en Claude Code

Ocho fases, cada una cerrada con una prueba concreta antes de pasar a la siguiente; pide a Claude Code una fase por sesión y que haga commit al terminarla.

1. **Base del proyecto.** Monorepo con `apps/mobile` (Expo), `apps/admin` (Next.js) y `supabase/` (migraciones y funciones). Lint, TypeScript estricto, CI básico.
   - Terminado cuando: la app abre en Expo Go y el panel corre en local.
2. **Esquema y seguridad.** Migraciones de las 15 tablas, políticas RLS, buckets privados y datos de prueba.
   - Terminado cuando: hay pruebas de RLS que fallan si un cliente lee pedidos ajenos.
3. **Ingreso y roles.** SMS por Supabase Auth, perfil, selector Cliente/Profesional (pantallas 0 y 19).
4. **Registro y verificación.** Pantallas 9 y 12, subida de evidencia, cola del panel admin con aprobar, pedir datos y rechazar.
   - Terminado cuando: un oficio aprobado aparece “en observación” y pasa a pleno con 3 calificaciones de 4★ o más.
5. **Pedidos y ofertas.** Pantallas 1 a 4, 7 y 8; reparto solo a oficio aprobado, en línea y dentro del radio.
6. **Servicio en curso.** Pantallas 5, 10, 11 y 6; aviso de ubicación (13), seguimiento en tiempo real, código de seguridad, confirmación del monto.
7. **Comisión.** Libro, pantallas 14 a 16, constancias en el panel, pausa y reactivación automática.
   - Terminado cuando: un servicio de punta a punta deja el asiento correcto y una segunda confirmación no duplica el cobro.
8. **Seguridad y publicación.** SOS (17, 18), eliminar cuenta, políticas legales, builds con EAS, prueba cerrada en Google Play y TestFlight.

La prueba cerrada de Google Play exige 12 testers durante 14 días seguidos en cuentas personales nuevas: reclútalos durante la fase 5.

## Pendientes por decidir

Estas decisiones no frenan las fases 1 a 4, pero sí la publicación.

- [ ] Precio máximo de un trabajo “en observación” (la pantalla 12 lo deja como [PRECIO MÁXIMO EN OBSERVACIÓN])
- [ ] Número, QR y titular de Yape/Plin de la empresa para la pantalla 15
- [ ] Cuántos trabajos sin comisión tiene la promoción de lanzamiento
- [ ] Proveedor de SMS y su costo (ingreso y SOS)
- [ ] Cuenta personal u organización en las tiendas, y titular legal
- [ ] URLs definitivas de términos y política de privacidad (hoy son de ejemplo)
- [ ] Plazos de retención de datos con un abogado
- [ ] Distrito piloto y los dos primeros oficios
