# Cerquita

App de servicios del hogar (Android e iOS) con selector Cliente / Profesional, pedidos filtrados por oficio verificado y comisión de 10 % por trabajo completado.

## Estado
MVP completo (8 fases) + módulo Piloto Huancayo (multicategoría, reevaluación en sitio, materiales sin comisión y antifraude GPS). Lo que falta para publicar está en `docs/progreso.md` → “Checklist de publicación”. Detalle en `docs/progreso.md`. El código se construye por fases con Claude Code (ver `docs/documento-tecnico.md`, sección “Plan de trabajo”).

## Estructura
```
CLAUDE.md                 instrucciones permanentes para Claude Code
apps/
  mobile/                 app Expo (Expo Router, TypeScript estricto)
  admin/                  panel de soporte en Next.js
packages/
  shared/                 tipos de dominio, helpers de dinero en céntimos y tokens de diseño
supabase/                 config, migraciones, pruebas RLS, Edge Functions y seed
e2e/                      pruebas de navegación con Playwright
docs/
  documento-tecnico.md    stack, pantallas, datos, estados, comisión, plan
  progreso.md             estado por fase, pruebas y decisiones
  arquitectura-seguridad-publicacion-mvp.pdf
design/
  README.md               índice de pantallas
  pantallas/*.dc.html     diseño de cada pantalla (ábrelas en el navegador)
```

## Desarrollo local
Requisitos: Node.js 22, pnpm 10 (`corepack enable`) y, para Supabase local, Docker.

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp supabase/.env.example supabase/.env
pnpm db:start      # Supabase local (Docker)
pnpm mobile        # Expo: escanea el QR con Expo Go
pnpm admin         # panel en http://localhost:3001
pnpm check         # formato, lint, typecheck y pruebas (lo mismo que corre el CI)
```

Supabase local: ver `supabase/README.md`.

## Ingreso y roles (fase 3)
- **App:** celular peruano + código SMS de 6 dígitos. Al ingresar eliges “Necesito un servicio” (cliente) u “Ofrezco mis servicios” (profesional); se cambia luego en Cuenta y privacidad. Un profesional sin oficios va al registro.
- **Panel:** solo entra soporte (`app_metadata.staff_role`: `reviewer`, `support` o `admin`). El resto ve “Sin acceso”.
- **Dar rol de soporte:** la persona ingresa una vez en la app y luego `pnpm --filter @cerquita/admin staff:set +519XXXXXXXX reviewer` (usa la service role de `apps/admin/.env.local`).
- **Números de prueba locales** (código `123456`, no envían SMS): `+51 900 000 001` cliente, `+51 900 000 002` profesional con oficio, `+51 900 000 003` profesional nuevo, `+51 900 000 009` revisora y `+51 900 000 008` administrador.
- El proveedor de SMS real sigue pendiente (ver pendientes del documento técnico).

## Demo local (Huancayo)
```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.local   # pon la clave publicable de `pnpm dlx supabase@3 status`
cp apps/admin/.env.example apps/admin/.env.local     # misma clave + SUPABASE_SERVICE_ROLE_KEY (secret key local)
cp supabase/.env.example supabase/.env
pnpm db:start && pnpm db:reset                       # Supabase local con datos de prueba
pnpm dev                                             # panel (http://localhost:3001) + Expo a la vez
# o por separado: pnpm admin / pnpm mobile
```
En un teléfono con Expo Go, `EXPO_PUBLIC_SUPABASE_URL` debe usar la IP de tu computadora en la red, no 127.0.0.1.
Para terminar: Ctrl+C en `pnpm admin` y `pnpm mobile`, y `pnpm db:stop`.

## Producción
Runbook y checklists en `docs/produccion.md`; despliegue con `pnpm deploy:prod`.

## Cómo empezar con Claude Code
1. Clona el repositorio y abre Claude Code en la carpeta.
2. Pide: “Lee CLAUDE.md y docs/documento-tecnico.md y ejecuta la fase 1”.
3. Necesitarás Node.js LTS, pnpm, una cuenta de Supabase y una de Expo (EAS).
