# Cerquita — instrucciones para Claude Code

Marketplace de servicios del hogar para Perú (piloto en Huancayo). El cliente publica un pedido con su precio; profesionales verificados **por oficio** cotizan; el cliente paga directo al profesional (efectivo, Yape o Plin) y Cerquita cobra **10 % solo sobre la mano de obra** mediante un libro de cuentas del profesional.

## Qué leer al empezar (en este orden y nada más)
1. `docs/estado.md` — qué funciona, qué falta, errores conocidos y la última tarea (máx. 100 líneas).
2. `docs/roadmap.md` — la siguiente tarea por prioridad (P0 → P3).
3. `docs/reglas-negocio.md` — solo la sección del módulo que vayas a tocar.

Bajo demanda: `docs/produccion.md` (despliegue y entornos), `docs/flujos.md` (diagramas), `docs/documento-tecnico.md` (diseño original del MVP), `design/pantallas/*.dc.html` (pantallas; índice en `design/README.md`). `docs/progreso.md` es historial por fase: no leerlo completo.

No inspecciones el repositorio “para entender el proyecto”: esos tres archivos son el contexto. Abre código solo del módulo de la tarea.

## Arquitectura real
No hay servidor propio: **todo el backend es Supabase** y la lógica de negocio vive en la base (funciones SQL + RLS). Las apps son clientes delgados.

| Ruta | Qué es |
| --- | --- |
| `apps/mobile` | App Expo SDK 58 (Expo Router, RN 0.88, TS estricto). Rutas: `(auth)`, `(cliente)`, `(pro)`, `(seguridad)`, `ajustes`, `chat`. Usa `supabase-js` directo: tablas con RLS y RPC. |
| `apps/admin` | Panel de soporte Next.js 16 (`src/proxy.ts`, `@supabase/ssr`, server actions). Solo entra `app_metadata.staff_role` ∈ reviewer, support, admin. |
| `packages/shared` | Tipos de dominio, dinero en céntimos, textos legales, tokens de diseño y lógica pura con pruebas (vitest). `database.types.ts` se genera (`pnpm db:types`). |
| `supabase/migrations` | 13 migraciones (esquema → pre-lanzamiento). Toda regla de negocio se valida aquí. |
| `supabase/tests` | pgTAP por módulo: rls, auth, verification, orders, service, ledger, privacy, pilot, express, prelaunch. |
| `supabase/functions/send-push` | Única Edge Function: envía la cola `notification_outbox` por Expo Push. |
| `supabase/seed.sql` · `seed_huancayo_production.sql` | Datos demo locales · datos iniciales del piloto (idempotente). |
| `e2e/flujos.mjs` | Playwright: 92 pasos sobre la app (export web) y el panel. |
| `scripts/` | Despliegue. |

Supabase: Postgres 17 + PostGIS · RLS en todas las tablas con permisos por columna · funciones `security definer` con helpers en el esquema `private` (no expuesto) · pg_cron + pg_net + Vault · Realtime solo en `job_messages`, `job_tracks` y `offers` (`jobs` a propósito no) · Storage privado (`verification`, `job-photos`, `payment-proofs`, `material-receipts`, `temp_media`; `avatars` público) · Auth por SMS OTP con el hook `hook_before_user_created` (solo +51 9XXXXXXXX).

Equivalencias de nombres: “orders” = `jobs` · “commission ledger” = `wallet_entries`.

## Stack (no se cambia sin justificación escrita y aprobada)
pnpm 10 workspaces · Node 22 · TypeScript estricto · Expo / EAS (build y update) · react-native-maps · expo-location + expo-task-manager · expo-notifications · Sentry · Next.js 16 · Supabase · pgTAP · vitest · Playwright · GitHub Actions.

## Comandos
```bash
pnpm install
pnpm db:start && pnpm db:reset    # Supabase local (Docker) con datos demo
pnpm dev                          # panel en :3001 + Expo
pnpm test                         # unitarias (packages/shared)
pnpm db:test                      # pgTAP completo · un módulo: pnpm dlx supabase@3 test db supabase/tests/<módulo>.test.sql
pnpm e2e                          # requiere el panel en :3001 y el export web de la app en :8099
pnpm check                        # formato + lint + typecheck + unitarias (igual que el CI)
pnpm db:types                     # regenerar tipos después de una migración
```
Cuentas demo **locales** (código `123456`): +51 900 000 001 cliente · 002 profesional aprobado · 003 profesional nuevo · 009 revisora · 008 admin.

## Reglas de negocio que no se rompen
1. Dinero siempre en céntimos (`int`). Nunca `float`.
2. `wallet_entries` y `points_entries` son inmutables: solo inserts desde funciones del servidor con `idempotency_key`; los errores se corrigen con `reversal`.
3. Sin compras dentro de la app (recargas, créditos, destacados, suscripciones) ni la frase “comprar saldo”.
4. Un profesional solo ve y cotiza pedidos de oficios aprobados, estando en línea, dentro de su radio y sin pausa por deuda. Se valida en el servidor, no solo en la app.
5. La ubicación del profesional se comparte con el cliente solo entre “Ir al domicilio” y “Terminado/Cancelado”.
6. DNI, selfie y antecedentes: bucket privado, URL firmada de corta vida y cada vista registrada en `document_access_log`.
7. Dirección exacta oculta hasta aceptar la oferta. El teléfono nunca se muestra entre las partes: todo va por el chat interno con filtro.
8. Textos en español de Perú, de tú.
9. Los parámetros (tasa, límites, tarifas, datos de cobro) se leen de `settings` (`city:<slug>` pisa a `global`), nunca fijos en el código.
10. La comisión es 10 % solo sobre `labor_cents`; los materiales no pagan comisión.

Detalle y parámetros: `docs/reglas-negocio.md`.

## Reglas permanentes de trabajo
- No reconstruir ni duplicar lo que ya existe. No cambiar el stack sin justificación.
- Una tarea por vez. Si va a tocar más de 5 archivos, avisar antes de empezar.
- Nunca desactivar RLS, exponer secretos, hacer migraciones destructivas ni cambios en producción sin autorización explícita del dueño.
- No inventar resultados de pruebas. Ejecutar solo las del módulo tocado y decir cuáles no se corrieron.
- Responder con diffs y resúmenes, no con archivos completos.
- Reporte final con este formato: **IMPLEMENTADO / ARCHIVOS / VALIDACIÓN / PENDIENTE**.
- Al terminar cada tarea, actualizar `docs/estado.md` (se reescribe, no acumula historial) y marcar `docs/roadmap.md`.
- Cada migración nueva lleva su prueba pgTAP de RLS; la lógica de dinero lleva pruebas de cálculo, idempotencia, pausa y reactivación.
- Una migración ya aplicada en producción no se edita: se agrega otra.
- Si las reglas de negocio no alcanzan para decidir, preguntar antes de inventar.
- Secretos solo en `.env.local` o en los gestores (EAS, Vercel, Supabase). Documentar los nombres en `.env.example` y `.env.production.example`.
- Commits pequeños, en inglés, con prefijo convencional (`feat:`, `fix:`, `docs:`…).

## Entorno de sesión en la nube (para no redescubrirlo)
- Docker no arranca solo: iniciar `dockerd` y luego `npx supabase@3 start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta`.
- Comandos locales de Expo: anteponer `EXPO_OFFLINE=1`.
- La red solo permite los hosts del entorno y no hay Postgres directo (5432): en producción el SQL se aplica por la API de administración de Supabase (ver `docs/produccion.md`).
- Los procesos en segundo plano mueren a las 2 horas.
