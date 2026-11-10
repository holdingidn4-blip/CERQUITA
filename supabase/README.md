# supabase/

- `migrations/` — esquema SQL y políticas RLS (fase 2 en adelante).
- `tests/` — pruebas de base de datos con pgTAP (`supabase test db`), incluidas las de RLS.
- `functions/` — Edge Functions en TypeScript (libro de comisiones, reparto, SOS).
- `seed.sql` — datos de prueba que carga `supabase db reset`.

## Local

Necesitas Docker para levantar Supabase en local:

```bash
pnpm dlx supabase@3 start      # levanta Postgres, Auth, Storage, Realtime y Studio
pnpm dlx supabase@3 db reset   # aplica migraciones y seed
pnpm dlx supabase@3 test db    # corre las pruebas de RLS
pnpm dlx supabase@3 stop
```

`supabase start` imprime la URL y la anon key locales; cópialas en `apps/mobile/.env.local` y `apps/admin/.env.local`.

## Proyecto remoto

```bash
pnpm dlx supabase@3 login
pnpm dlx supabase@3 link --project-ref <ref-del-proyecto>
pnpm dlx supabase@3 db push
```
