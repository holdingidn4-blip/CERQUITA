# F7 · Pruebas y corrección (24/11/2026)

## Dónde se probó (sin inventar)

- **Emulador Android nativo: no verificado.** Este entorno no tiene KVM. EAS Simulator respondió `"available": false` para la cuenta `holdingidn` (no se inició nada ni se generó costo). El emulador del CI (`android-apk.yml`) solo prueba que la app arranca.
- **Lo que sí corrió:** la app exportada para web **emulando un Android** (Playwright, perfil Pixel 7: 412×915, táctil, user agent Android), con Supabase local recién reseteado, más el panel y la landing. Cuenta como "sin verificar en celular" (regla de `docs/estado.md`).
- **Compilación nativa:** el APK `pilot` de EAS compila (build `16d9dac6`, versionCode 5, con F4). No se abrió en un teléfono.

## Resultado del último ciclo

| Prueba | Resultado |
| --- | --- |
| pgTAP (base reseteada) | 652 / 652 en 20 suites (nueva `arrival_lock` 9) |
| Unitarias (`packages/shared`) | 232 / 232 (contraste AA de ambas paletas incluido) |
| Formato + lint + tipos (`pnpm check`) | OK |
| e2e `e2e/flujos.mjs` | 192 pasos OK, sin errores de JavaScript |
| Revisión de pantallas `e2e/pantallas.mjs` | 72 pantallas (app como Android, panel y landing, claro y oscuro): 0 con desplazamiento horizontal, texto cortado ni fallas axe (contraste, tamaño táctil, etiquetas, nombres de botones) |

Casos que axe no pudo decidir solo (`incomplete`): estrellas ★ y ✓ (íconos), números de los ejes del gráfico de Métricas, texto de ayuda en campos de texto y la portada de la landing sobre degradado. Revisados en las capturas: el contraste de la portada sale de los tokens (`onPrimary` sobre `primary`, ≥ 4,5:1 en ambos modos).

## Simulaciones de punta a punta (e2e en emulación Android)

| Caso pedido | Cubierto por |
| --- | --- |
| Registro de cliente y de profesional con evidencia (DNI, selfie, fotos, video) | e2e Fases 3–4 |
| Aprobación en el panel (con antecedentes e historial) | e2e Fase 4 |
| Pedido, cotización con desglose, aceptación ("Acepto") | e2e Fases 5–6 |
| Llegada con código (y código incorrecto 3 veces → bloqueo) | e2e Fase 6 **(nuevo)** |
| Reevaluación de precio en el domicilio | e2e Fase 7 |
| Cierre con fotos de antes y después | e2e Fase 6 |
| Calificación en ambos sentidos | e2e Fase 7 |
| Comisión y pago verificado (constancia + verificación del abono) | e2e Fase 7 |
| Sin internet | e2e Fase 8 **(nuevo)** |
| Código SMS incorrecto 3 veces | e2e Fase 3 **(nuevo)** |
| Profesional que no llega (cambio, cupón, apelación) | e2e Fase 7 |
| Cancelaciones (antes y después de la llegada) | e2e Fase 7 |

## Errores encontrados y corregidos

1. **El código de llegada se podía adivinar.** No tenía límite de intentos: un profesional podía probar las 10 000 combinaciones y marcar "Llegué" sin estar en la puerta. Ahora se bloquea 10 minutos tras 3 intentos fallidos (parámetros `arrival_code_max_attempts` y `arrival_code_lock_minutes`) y se avisa al cliente. El intento se guarda: un código equivocado ya no lanza error, porque el rollback borraría el contador. Migración `20261124012613` (aplicada en producción el 24/11 con huella igual a local), pgTAP `arrival_lock`, e2e.
2. **Sin internet, la app mostraba errores técnicos en inglés** ("TypeError: Failed to fetch"). Ahora todas las llamadas a Supabase dicen "Sin conexión: revisa tu internet e intenta de nuevo." y no se pierde lo escrito.
3. **El código SMS se podía probar sin un límite visible.** Tras 3 códigos equivocados la app pide uno nuevo; Supabase además limita por IP.
4. **El monto de la comisión se partía en dos líneas** ("– S/" y "9.00") en Cotizar. Las filas del desglose (Cotizar, Confirmar y la tarjeta de desglose) mantienen el monto en una línea. Pendiente: capturarlo de nuevo, porque el límite local de SMS por hora lo impidió.
5. **"Nuevo pedido" sin oficio quedaba en "…" sin salida.** Ahora muestra "Elige un oficio" con un botón a Inicio.

También salieron de los ciclos de prueba de F4 a F6, ya corregidos:

- El formulario de capacitaciones se vaciaba tras un error.
- La ficha del usuario tenía dos campos llamados "Motivo".
- Los enlaces del encabezado del pro estaban apretados.
- El panel aprobaba constancias solo con la captura.

## No corregido o no verificado (con motivo)

| Tema | Motivo | Qué hace falta |
| --- | --- | --- |
| Recorrido en emulador o teléfono Android real | Sin KVM; EAS Simulator no habilitado; el CI solo prueba el arranque | Prueba en 2 teléfonos (`docs/prueba-telefonos.md`) con el APK `16d9dac6` o el siguiente |
| Cámara, QR, video, GPS en segundo plano, Android ID y PDF nativos | Solo existen en el teléfono | Misma prueba en teléfonos |
| Push | Falta el archivo de Firebase del dueño | Pasos en `docs/servicios-externos.md` |
| SMS reales | Twilio en modo prueba (decisión del dueño) | Punto de parada de pago |
| APK anteriores con el servidor nuevo | Con código equivocado, la app vieja no muestra el mensaje (no marca la llegada, pero no explica) | Usar el APK que se compila en F8 |
| "Seguro Cerquita" y "Garantía 30 días" | Decisión legal pendiente, no es un error técnico | Abogado (bloqueo B) |
