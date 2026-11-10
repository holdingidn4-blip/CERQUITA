# supabase/

- `migrations/` — esquema (15 tablas), seguridad (RLS, permisos por columna, triggers) y buckets.
- `tests/` — pruebas pgTAP de RLS y reglas del servidor (`pnpm db:test`).
- `functions/` — Edge Functions (desde la fase 4).
- `seed.sql` — oficios, parámetros y usuarios de prueba (solo local).

## Comandos (requieren Docker)

```bash
pnpm db:start   # levanta Postgres, Auth, Storage y REST
pnpm db:reset   # aplica migraciones y seed
pnpm db:test    # pruebas de RLS
pnpm db:lint    # revisa funciones SQL
pnpm db:types   # regenera packages/shared/src/database.types.ts
pnpm db:smoke   # ingreso por SMS de punta a punta contra Auth local
```

## Decisiones de seguridad

| Regla | Cómo se cumple |
| --- | --- |
| 2. Libro inmutable | Sin INSERT/UPDATE/DELETE para nadie (ni service role). Solo `wallet_post_entry()` (service role), idempotente; saldo calculado en trigger con bloqueo por profesional. UPDATE/DELETE lanzan error. |
| 4. Reparto | Política de `jobs` usa `private.pro_is_eligible`: oficio aprobado + en línea + `ST_DWithin` del radio. |
| 5. Ubicación | `job_tracks` solo acepta al pro asignado con el pedido `on_the_way` o `at_home`. Borrado a 30 días con pg_cron. |
| 6. Documentos | Bucket `verification` sin lectura para nadie desde la API. Soporte llama `log_document_access()` (registra la vista) y el servidor firma la URL. |
| 7. Datos ocultos | `exact_address` sin permiso de SELECT; se lee con `job_exact_address()`. Teléfono con `job_counterpart_phone()`. Ambos solo tras aceptar. `approx_point` se redondea a ~110 m. |
| Soporte | `app_metadata.staff_role` (`reviewer`, `support`, `admin`). Solo lo fija `set_staff_role()` (service role). El panel lo valida con `getUser()` en `proxy.ts` y en cada página. |
| Ingreso | SMS OTP de 6 dígitos, un código cada 60 s. `my_account()` devuelve modo, oficios y rol de soporte. |

Consecuencia práctica: en `jobs` no uses `select('*')`; lista las columnas.
