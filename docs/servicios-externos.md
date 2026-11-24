# Servicios externos (F6)

Precios consultados el **24/11/2026** en las páginas oficiales enlazadas. Cambian sin aviso: revísalos antes de pagar. Nada de esto está contratado. **Punto de parada:** cualquier paso que pida tarjeta o pago lo haces tú.

## 1. Notificaciones push (Firebase + Expo): gratis

**Estado del código: listo.** La app registra el token al iniciar sesión (`apps/mobile/src/lib/notifications.ts`), la base encola avisos (`notification_outbox`) y la Edge Function `send-push` los envía cada minuto por Expo Push. Falta solo registrar la app en Firebase Cloud Messaging (FCM), que en Android es obligatorio para que lleguen.

- Costo: Cloud Messaging figura como “No-cost” en el plan gratuito Spark, “No payment method needed” ([firebase.google.com/pricing](https://firebase.google.com/pricing)).
- Guía oficial que seguimos: [docs.expo.dev/push-notifications/fcm-credentials](https://docs.expo.dev/push-notifications/fcm-credentials/).

**Pasos para ti (unos 15 minutos):**

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) con la cuenta de Google del negocio → **Crear un proyecto** → nombre `Cerquita` → Google Analytics: puedes desactivarlo → plan **Spark** (gratis).
2. En el proyecto: ⚙ **Configuración del proyecto** → **General** → **Agregar app** → **Android** → nombre del paquete **`pe.cerquita.app`** (exacto) → **Registrar app** → **Descargar `google-services.json`**. Este archivo **no es secreto** (Expo indica que se puede guardar en el repositorio).
3. ⚙ **Configuración del proyecto** → **Cuentas de servicio** → **Generar nueva clave privada** → **Generar clave**. Se descarga un JSON: **este sí es secreto**. No lo mandes por chat ni lo subas a GitHub.
4. Sube la clave secreta a EAS: [expo.dev → cerquita → Credentials](https://expo.dev/accounts/holdingidn/projects/cerquita/credentials) → **Android** → `pe.cerquita.app` → **Service credentials** → **FCM V1 service account key** → **Add a service account key** → sube el JSON del paso 3 → **Save**.
5. Pásame `google-services.json` (el del paso 2). Yo lo dejo en `apps/mobile/google-services.json`, activo `GOOGLE_SERVICES_JSON=./google-services.json` en los perfiles de `eas.json` y compilo un APK nuevo. Si prefieres no pasármelo: en [expo.dev → cerquita → Environment variables](https://expo.dev/accounts/holdingidn/projects/cerquita/environment-variables) crea `GOOGLE_SERVICES_JSON`, tipo **File**, entornos *preview* y *production*.

**Cómo lo probamos:** APK nuevo en 2 teléfonos → ingresar y aceptar el permiso → el cliente publica un pedido → al pro le llega “Pedido nuevo cerca”. Panel → **Sistema** muestra la cola y si hubo errores.

## 2. SMS para el ingreso (OTP): recomendación y punto de parada

Hoy el ingreso usa Twilio en modo prueba (solo números verificados) y números de prueba con código fijo. Para abrir al público hace falta enviar SMS reales a Perú.

| Proveedor | Precio por SMS a Perú (oficial) | ¿Funciona directo con Supabase? |
| --- | --- | --- |
| **Twilio Programmable Messaging** | **USD 0.2476** por mensaje; USD 0.001 por mensaje fallido; número internacional USD 1.15/mes ([twilio.com/…/pricing/pe](https://www.twilio.com/en-us/sms/pricing/pe), “Pricing current as of November 2026”) | **Sí** (ya está configurado en modo prueba) |
| Twilio Verify | USD 0.05 por verificación exitosa **+** el costo del SMS del país ([twilio.com/verify/pricing](https://www.twilio.com/en-us/verify/pricing)) ≈ USD 0.30 por código | Sí |
| Plivo | Movistar USD 0.1850 · Claro USD 0.2000 · “Others” (Entel) USD 0.3500 · Viettel (Bitel) USD 0.3800 ([plivo.com/sms/pricing/pe](https://www.plivo.com/sms/pricing/pe/)) | No: requiere programar un *Send SMS Hook* |
| Vonage, AWS | No publican la tarifa de Perú en su web (Vonage la da en el panel; AWS en un CSV) | Vonage sí; AWS no |
| WhatsApp (vía Twilio) | Tarifa de Perú no confirmada (Meta la publica en una hoja descargable) | Sí, como canal de Twilio |

Supabase trae Twilio, Twilio Verify, MessageBird, Textlocal y Vonage; cualquier otro necesita el *Send SMS Hook* ([supabase.com/docs/…/send-sms-hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook)).

**Recomendación: Twilio Programmable Messaging** (no Verify). Es lo que ya funciona sin cambiar código. Plivo ahorra algo en Movistar y Claro pero cobra más en Entel y Bitel, y obliga a programar y mantener el hook. Verify suma USD 0.05 por código sin beneficio para nosotros.

**Costo estimado del piloto:** las sesiones duran semanas, así que el SMS se usa al ingresar por primera vez o al cambiar de teléfono. Con 150 personas y unos 1,5 SMS por persona al mes ≈ **225 SMS ≈ USD 56 al mes**, más USD 1.15 del número. Supuesto, no medición: el panel de Métricas mostrará el uso real.

**Para no llevarte sorpresas:** en Supabase → Authentication → Rate Limits pon un tope de SMS por hora (por ejemplo, 30).

**Punto de parada (pago):** pasar Twilio a cuenta pagada pide tarjeta y saldo. Cuando decidas:
1. [console.twilio.com](https://console.twilio.com) → **Upgrade account** → agrega tarjeta y saldo inicial (el monto mínimo lo muestra Twilio; no lo confirmé).
2. Compra un número con SMS hacia Perú y crea un **Messaging Service** con ese número.
3. Supabase → [Authentication → Sign In / Providers → Phone](https://supabase.com/dashboard/project/dknxuxrylnncbdzjqagh/auth/providers): Twilio con *Account SID*, *Auth Token* y *Messaging Service SID* (los secretos se pegan solo ahí).
4. Avísame y pruebo el ingreso con un número real tuyo. No pruebo números de terceros.

## 3. Google Maps: costo estimado S/ 0 en el piloto

- La app solo muestra mapas en Android (`react-native-maps`); **no usa geocodificación ni autocompletado** (esas sí se cobran).
- Página oficial: “All mobile usage of the Maps SDK for Android is unlimited” ([developers.google.com/…/usage-and-billing](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing)). Solo se cobraría Street View, que no usamos.
- Aun así Google exige una **cuenta de facturación** (pide tarjeta). Es un paso tuyo, aunque el costo esperado sea 0.
- **Código listo:** sin clave, la app usa una vista simple; con `GOOGLE_MAPS_ANDROID_API_KEY` en EAS se activa el mapa (`app.config.ts`).

**Pasos (cuando quieras el mapa):**
1. [console.cloud.google.com](https://console.cloud.google.com) → proyecto nuevo `cerquita` → **Facturación** → vincula una cuenta (tarjeta) → crea una **alerta de presupuesto** de USD 1.
2. **APIs y servicios** → habilita **Maps SDK for Android**.
3. **Credenciales** → **Crear clave de API** → restringe a **Apps de Android**: paquete `pe.cerquita.app` + huella SHA-1 de la llave de firma (la ves en expo.dev → Credentials → Android; para Play, la de *App signing* de Play Console) → restringe la API a **Maps SDK for Android**.
4. [expo.dev → Environment variables](https://expo.dev/accounts/holdingidn/projects/cerquita/environment-variables) → `GOOGLE_MAPS_ANDROID_API_KEY`, visibilidad **Secret**, entornos preview y production. Luego compilo el APK.

## 4. Yape/Plin

**Hoy (manual, listo):** el profesional paga su comisión por Yape, Plin o transferencia a la cuenta de Cerquita (datos en Panel → Parámetros) y sube la constancia con su n.° de operación (no se repite). Soporte la revisa en Panel → **Constancias**. **Desde F6, aprobar exige marcar “Verifiqué el abono en la cuenta de Cerquita (monto, fecha y n.° de operación)”**: la captura sola no es prueba, porque se puede editar. El abono queda en el libro (`payment_credit`) y nunca se borra.

**Para automatizarlo después (Culqi, de BCP, cobra con Yape):**
- Afiliación en línea en afiliate.culqi.com, con validación de 1 a 3 días hábiles. Las llaves (pública y privada, de prueba y de producción) llegan al CulqiPanel ([docs.culqi.com/…/pagos-online](https://docs.culqi.com/es/documentacion/pagos-online/)).
- Yape por API: el cliente da su número y el **código de aprobación de 6 dígitos** de su app Yape; el cobro se hace en el servidor con la llave privada ([docs.culqi.com/…/tokens-yape](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape)).
- Si integramos por API directa, Culqi pide el formulario **PCI DSS SAQ-D**. Con su Checkout no hace falta manejar esos datos.
- **Datos que te pedirán (prepáralos):** RUC y razón social (las fuentes no coinciden en si es obligatorio: confírmalo con Culqi), DNI del representante, cuenta bancaria a nombre del titular, correo y celular del negocio, y la web con términos y privacidad publicados (F8 los deja en la landing). Pregunta además la comisión por cobro con Yape, que no está publicada.
- **Plin:** no encontré una API pública oficial para comercios. Pregúntale a Culqi o Izipay si lo cobran por QR. Hasta entonces sigue el flujo manual.
- **Antes de cobrar dentro de la app:** sigue vigente la regla 3 (sin compras dentro de la app). Pagar la comisión con Culqi es pago de un servicio físico, pero hay que confirmarlo con un abogado y con las políticas de Google Play (decisión del 18/11 sobre saldo prepago, pendiente).
