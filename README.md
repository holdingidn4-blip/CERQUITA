# Cerquita

App de servicios del hogar (Android e iOS) con selector Cliente / Profesional, pedidos filtrados por oficio verificado y comisión de 10 % por trabajo completado.

## Estado
Fase 1 (base del proyecto) terminada. El código se construye por fases con Claude Code (ver `docs/documento-tecnico.md`, sección “Plan de trabajo”).

## Estructura
```
CLAUDE.md                 instrucciones permanentes para Claude Code
apps/
  mobile/                 app Expo (Expo Router, TypeScript estricto)
  admin/                  panel de soporte en Next.js
packages/
  shared/                 tipos de dominio, helpers de dinero en céntimos y tokens de diseño
supabase/                 config, migraciones, pruebas RLS, Edge Functions y seed
docs/
  documento-tecnico.md    stack, pantallas, datos, estados, comisión, plan
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
pnpm mobile        # Expo: escanea el QR con Expo Go
pnpm admin         # panel en http://localhost:3001
pnpm check         # formato, lint, typecheck y pruebas (lo mismo que corre el CI)
```

Supabase local: ver `supabase/README.md`.

## Cómo empezar con Claude Code
1. Clona el repositorio y abre Claude Code en la carpeta.
2. Pide: “Lee CLAUDE.md y docs/documento-tecnico.md y ejecuta la fase 1”.
3. Necesitarás Node.js LTS, pnpm, una cuenta de Supabase y una de Expo (EAS).
