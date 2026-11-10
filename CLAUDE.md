# Cerquita — instrucciones para Claude Code

Cerquita es una app de servicios del hogar para Perú: el cliente publica un pedido con su precio, profesionales verificados por oficio responden con ofertas, y la plataforma cobra una comisión de 10 % por trabajo completado mediante un libro de cuentas del profesional.

## Referencias (léelas antes de cada fase)
- `docs/documento-tecnico.md` — stack, pantallas, modelo de datos, estados, reglas de comisión, ubicación y plan por fases. Es la fuente de verdad.
- `docs/arquitectura-seguridad-publicacion-mvp.pdf` — decisiones de negocio, reglas de las tiendas, seguridad y checklist de publicación.
- `design/pantallas/*.dc.html` — diseño de cada pantalla (HTML con estilos en línea). Úsalo para colores, textos, espaciado y jerarquía. El número de pantalla está en `design/README.md`.

## Stack
- `apps/mobile`: React Native + Expo (Expo Router, TypeScript estricto). Mapas con react-native-maps; ubicación con expo-location + expo-task-manager.
- `apps/admin`: Next.js + TypeScript (panel de verificación, constancias, SOS, parámetros).
- `supabase/`: migraciones SQL, políticas RLS, funciones (Edge Functions en TypeScript), seed.
- Monorepo con pnpm workspaces. Paquete compartido `packages/shared` para tipos y constantes.

## Reglas que no se rompen
1. Montos siempre en céntimos de sol (`int`). Nunca `float` para dinero.
2. `wallet_entries` es inmutable: solo inserts desde funciones del servidor, con `idempotency_key` único. Los errores se corrigen con `reversal`.
3. Nada de compras dentro de la app: sin recargas, créditos, destacados ni suscripciones, y sin la frase “comprar saldo”.
4. Un profesional solo ve pedidos de oficios con estado aprobado, estando en línea y dentro de su radio. Se valida en el servidor (RLS / funciones), no solo en la app.
5. La ubicación del profesional se comparte solo entre “Ir al domicilio” y “Terminado/Cancelado”. El servidor valida que quien envía es el profesional asignado.
6. DNI, selfie y antecedentes: bucket privado, URLs firmadas de corta vida, cada vista registrada en `document_access_log`.
7. Teléfono y dirección exacta ocultos hasta aceptar la oferta.
8. Textos de la app en español de Perú, tono cercano (tú).
9. Parámetros (tasa 10 %, límite S/ 30, 3 días de gracia, promoción) se leen de la tabla `settings`, nunca fijos en el código.

## Forma de trabajar
- Una fase del plan por sesión. Al empezar, resume qué vas a construir; al terminar, corre lint, typecheck y pruebas, y haz commit con un mensaje claro.
- Cada migración con su prueba de RLS (un usuario no debe poder leer datos ajenos).
- Pruebas de la lógica de comisión: cálculo, idempotencia, pausa y reactivación.
- Si algo del documento técnico no alcanza para decidir, pregunta antes de inventar; deja `TODO(decidir):` solo si te piden seguir.
- No subas secretos: usa `.env.local` (ignorado) y documenta las variables en `.env.example`.
