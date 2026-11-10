# Cerquita

App de servicios del hogar (Android e iOS) con selector Cliente / Profesional, pedidos filtrados por oficio verificado y comisión de 10 % por trabajo completado.

## Estado
Repositorio inicial: documentación y diseño. El código se construye por fases con Claude Code (ver `docs/documento-tecnico.md`, sección “Plan de trabajo”).

## Estructura
```
CLAUDE.md                 instrucciones permanentes para Claude Code
docs/
  documento-tecnico.md    stack, pantallas, datos, estados, comisión, plan
  arquitectura-seguridad-publicacion-mvp.pdf
design/
  README.md               índice de pantallas
  pantallas/*.dc.html     diseño de cada pantalla (ábrelas en el navegador)
```
Las carpetas `apps/mobile`, `apps/admin`, `supabase/` y `packages/shared` se crean en la fase 1.

## Cómo empezar con Claude Code
1. Clona el repositorio y abre Claude Code en la carpeta.
2. Pide: “Lee CLAUDE.md y docs/documento-tecnico.md y ejecuta la fase 1”.
3. Necesitarás Node.js LTS, pnpm, una cuenta de Supabase y una de Expo (EAS).
