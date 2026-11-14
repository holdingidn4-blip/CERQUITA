# Cerquita · Flujos del producto

Diagramas de los flujos ya construidos y probados. GitHub los dibuja solo. La demo interactiva que los recorre está en [`docs/demo/cerquita-demo.html`](demo/cerquita-demo.html): ábrela con doble clic en el navegador (es una simulación con datos de ejemplo; no se conecta a la base).

## 1. De un pedido al pago de la comisión

El cliente pone su precio y solo comparte su zona aproximada. Los profesionales cotizan si tienen ese oficio aprobado, están en línea y dentro de su radio. El teléfono y la dirección exacta se muestran recién al aceptar una oferta.

```mermaid
flowchart TD
  A["Cliente publica su pedido con precio y zona aproximada"] --> B{"¿Hay profesionales del oficio en línea y cerca?"}
  B -- "No" --> W["Queda publicado y se avisa cuando alguien se conecta"]
  B -- "Sí" --> C["Profesionales verificados cotizan"]
  C --> D["Cliente compara precio, calificación y distancia"]
  D -- "Acepta una oferta" --> E["Se muestran teléfono y dirección exacta"]
  E --> F["Ir al domicilio: comparte ubicación en vivo"]
  F --> G["Llega y valida el código de 4 dígitos"]
  G --> H{"¿Cambia el trabajo en sitio?"}
  H -- "Sí" --> I["Reevaluación: mano de obra y materiales con boleta"]
  I -- "Cliente responde" --> J
  H -- "No" --> J["Profesional termina"]
  J --> K["Cliente confirma y califica"]
  K --> L["Comisión del 10 % sobre la mano de obra"]
  K --> M["Cliente gana puntos para su próximo pedido"]
```

## 2. Estados de un pedido

Cada cambio de estado lo valida el servidor. Por ejemplo, solo el profesional asignado puede marcar que llegó, y solo con el código correcto.

```mermaid
stateDiagram-v2
  state "Publicado" as published
  state "Con ofertas" as with_offers
  state "Aceptado" as accepted
  state "En camino" as on_the_way
  state "En el domicilio" as at_home
  state "Precio en revisión" as price_renegotiated
  state "Terminado" as finished
  state "Confirmado" as confirmed
  state "Calificado" as rated
  state "Cancelado" as cancelled
  [*] --> published
  published --> with_offers: llega una oferta
  with_offers --> accepted: el cliente acepta
  accepted --> on_the_way: ir al domicilio
  on_the_way --> at_home: código validado
  at_home --> price_renegotiated: el cliente aprueba la reevaluación
  price_renegotiated --> finished: terminar
  at_home --> finished: terminar
  finished --> at_home: algo falta
  finished --> confirmed: el cliente confirma
  confirmed --> rated: califica
  published --> cancelled
  with_offers --> cancelled
  accepted --> cancelled
  on_the_way --> cancelled
  at_home --> cancelled
  rated --> [*]
  cancelled --> [*]
```

## 3. Verificación del profesional

Por cada oficio: identidad (DNI, selfie y antecedentes) y al menos dos evidencias. Los documentos van a un almacenamiento privado y cada vista del equipo de soporte queda registrada.

```mermaid
stateDiagram-v2
  state "Borrador" as draft
  state "Enviado" as submitted
  state "En revisión" as in_review
  state "Faltan datos" as needs_info
  state "Aprobado con observación" as approved_observation
  state "Aprobado" as approved_full
  state "Rechazado" as rejected
  [*] --> draft
  draft --> submitted: identidad y 2 evidencias
  submitted --> in_review: soporte abre el caso
  in_review --> approved_observation: aprueba
  in_review --> needs_info: pide datos
  needs_info --> submitted: reenvía
  in_review --> rejected: rechaza
  rejected --> submitted: después de 30 días
  approved_observation --> approved_full: 3 calificaciones de 4 o más estrellas
```

## 4. Comisión y pagos

La comisión se anota en un libro de cuentas que no se puede editar. No hay compras ni recargas dentro de la app: el profesional paga por Yape, Plin o transferencia y sube su constancia.

```mermaid
sequenceDiagram
  participant C as Cliente
  participant S as Cerquita
  participant P as Profesional
  participant A as Soporte
  C->>S: Confirma el trabajo
  S->>P: Anota la comisión del 10 % de la mano de obra
  Note over S,P: Si la deuda pasa de S/ 30 hay 3 días de gracia
  Note over S,P: Luego se pausan sus cotizaciones
  P->>S: Paga por Yape o Plin y sube la constancia
  A->>S: Revisa y aprueba la constancia
  S->>P: Abona el pago y lo reactiva
```

## 5. Cómo está armado por dentro

```mermaid
flowchart LR
  APP["App Cerquita (Expo) para Android y iOS"]
  PANEL["Panel de soporte (Next.js en Vercel)"]
  subgraph SB["Supabase · São Paulo"]
    AUTH["Ingreso por SMS"]
    DB["Postgres + PostGIS con reglas de acceso por fila"]
    ST["Archivos privados: DNI, fotos y boletas"]
    RT["Tiempo real: ofertas, chat y ubicación"]
    FN["Función de notificaciones push"]
    CRON["Tareas programadas: limpieza y antifraude"]
  end
  PUSH["Expo Push"]
  SEN["Sentry: errores"]
  APP --> AUTH
  APP --> DB
  APP --> ST
  APP --> RT
  PANEL --> DB
  PANEL --> ST
  CRON --> FN
  FN --> PUSH
  PUSH --> APP
  APP -.-> SEN
```

## Dónde vive cada pieza

| Pieza | Dónde | Ahora (pruebas) | Al lanzar |
| --- | --- | --- | --- |
| Código | GitHub privado | Gratis | Gratis |
| Base, ingreso SMS y archivos | Supabase · São Paulo (`sa-east-1`) | Gratis (se pausa tras 1 semana sin uso) | Pro: USD 25/mes, copias diarias |
| Panel de soporte | Vercel (`apps/admin`) | Gratis (Hobby, uso no comercial) | Pro: USD 20/mes por persona |
| App Android e iOS | Expo EAS (Build, Submit, Update) | Gratis con cupo mensual | Gratis o plan pago según builds |
| Tiendas | Google Play · App Store | — | USD 25 una vez · USD 99/año |
| SMS | Twilio u otro con remitente en Perú | Números de prueba | Pago por mensaje |
| Errores | Sentry | Gratis | Gratis al inicio |

Precios de referencia: confírmalos antes de contratar. Pasos de despliegue en [`produccion.md`](produccion.md).
