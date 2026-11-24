// F7 · Revisión de pantallas: recorre la app (como teléfono Android) y el panel en modo claro y oscuro,
// guarda capturas y busca problemas visibles: desplazamiento horizontal, texto cortado, contraste bajo,
// botones pequeños o sin nombre (axe-core, reglas WCAG AA).
//
// Requisitos: igual que el e2e (Supabase local recién reseteado, panel y export web corriendo).
//   pnpm db:reset && node e2e/pantallas.mjs <carpeta-de-salida>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { chromium, devices } from 'playwright';

const require = createRequire(import.meta.url);
const ADMIN = process.env.ADMIN_URL ?? 'http://127.0.0.1:3001';
const MOBILE = process.env.MOBILE_URL ?? 'http://127.0.0.1:8099';
const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const OUT = process.argv[2] ?? 'pantallas';
const OTP = '123456';
const AXE = require.resolve('axe-core/axe.min.js');
const RULES = ['color-contrast', 'target-size', 'label', 'button-name', 'image-alt', 'link-name'];
mkdirSync(OUT, { recursive: true });

const sql = (query) => execFileSync('psql', [DB_URL, '-Atc', query], { encoding: 'utf8' }).trim();
const executablePath = ['/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ANDROID = { ...devices['Pixel 7'], geolocation: { latitude: -12.0651, longitude: -75.2049 } };

// ───────── Datos de ejemplo para que las pantallas tengan contenido ─────────
const CLIENT = '11111111-1111-1111-1111-111111111111';
const PRO = '22222222-2222-2222-2222-222222222222';
const GAS = sql("select id from public.trades where slug = 'gasfiteria'");
sql(`insert into public.pro_presence (pro_id, online, radius_m, last_point)
  values ('${PRO}', true, 5000, 'SRID=4326;POINT(-75.2049 -12.0651)')
  on conflict (pro_id) do update set online = true, last_point = excluded.last_point`);
const job = (description, status) =>
  sql(`with j as (
    insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
    select '${CLIENT}', id, '${description}', 8000, 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Los Pinos 245'
    from public.trades where slug = 'gasfiteria' returning id
  ), o as (
    insert into public.offers (job_id, pro_id, price_cents, eta_minutes, message, status)
    select id, '${PRO}', 9500, 30, 'Llevo los repuestos.', ${status === 'published' ? "'pending'" : "'accepted'"} from j returning id, job_id
  ) select job_id || '|' || id from o`).split('|');
const [ofertas, ofertaId] = job('Cambiar el caño de la cocina que gotea.', 'published');
const [enCamino] = job('La terma no calienta el agua.', 'on_the_way');
const [terminado] = job('Destapar el desagüe del baño.', 'finished');
const [confirmado] = job('Revisar la presión de la ducha.', 'confirmed');
const nuevo = sql(`with j as (
    insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
    select '${CLIENT}', id, 'Instalar una llave de paso nueva.', 8000, 'SRID=4326;POINT(-75.2045 -12.0655)', 'Jr. Ica 120'
    from public.trades where slug = 'gasfiteria' returning id
  ) select id from j`);
for (const [id, status] of [
  [enCamino, 'on_the_way'],
  [terminado, 'finished'],
  [confirmado, 'confirmed'],
]) {
  sql(`update public.jobs set status = '${status}', accepted_offer_id = (select id from public.offers where job_id = '${id}'),
    final_price_cents = 9500, labor_cents = 9500, commission_rate_bps = 1000, security_code = '4821',
    final_proposed_cents = 9500, promised_arrival_at = now() + interval '20 minutes', assigned_at = now()
    where id = '${id}'`);
}
sql(`insert into public.job_messages (job_id, sender_id, body) values
  ('${enCamino}', '${CLIENT}', 'Hola, el timbre es el 302.'), ('${enCamino}', '${PRO}', 'Llego en 5 minutos.')`);
sql(`insert into public.trainings (city_slug, title, description, starts_at, place, points, quiz, created_by)
  values ('huancayo', 'Seguridad eléctrica en casa', 'Charla práctica para técnicos.', now(), 'Local comunal de El Tambo', 100,
  '[{"q":"¿Qué haces antes de tocar un cable?","options":["Nada","Corto la luz"],"answer":1}]', '${PRO}')`);

// ───────── Revisión de una pantalla ─────────
const results = [];
async function review(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const clipped = [...document.querySelectorAll('div, span, a, button')]
      .filter((el) => {
        const s = getComputedStyle(el);
        const text = (el.childElementCount === 0 ? el.textContent : '')?.trim();
        return (
          text &&
          s.overflow === 'hidden' &&
          el.scrollWidth > el.clientWidth + 2 &&
          s.textOverflow !== 'ellipsis'
        );
      })
      .slice(0, 5)
      .map((el) => el.textContent?.trim().slice(0, 60));
    return { horizontalScroll: doc.scrollWidth > doc.clientWidth + 1, clipped };
  });
  await page.addScriptTag({ path: AXE });
  const { axe, incomplete } = await page.evaluate(async (rules) => {
    const res = await window.axe.run(document, { runOnly: { type: 'rule', values: rules } });
    const sample = (v) =>
      v.nodes.slice(0, 3).map((n) => ({
        target: n.target.join(' '),
        summary: n.failureSummary?.split('\n')[1]?.trim() ?? n.any[0]?.message,
        html: n.html.slice(0, 120),
      }));
    return {
      axe: res.violations.map((v) => ({ rule: v.id, count: v.nodes.length, sample: sample(v) })),
      // "Incompleto": axe no pudo decidir (p. ej. texto sobre un degradado); se revisa en la captura.
      incomplete: res.incomplete.map((v) => ({
        rule: v.id,
        count: v.nodes.length,
        sample: sample(v),
      })),
    };
  }, RULES);
  results.push({ name, url: page.url(), ...layout, axe, incomplete });
  const flags = [
    layout.horizontalScroll && 'scroll horizontal',
    layout.clipped.length && `texto cortado ×${layout.clipped.length}`,
    ...axe.map((v) => `${v.rule} ×${v.count}`),
    ...incomplete.map((v) => `revisar ${v.rule} ×${v.count}`),
  ].filter(Boolean);
  console.log(
    `${flags.length ? '⚠' : '✓'} ${name}${flags.length ? ` · ${flags.join(' · ')}` : ''}`,
  );
}

async function appLogin(phone, role) {
  const ctx = await browser.newContext({
    ...ANDROID,
    permissions: ['geolocation'],
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss());
  await page.goto(`${MOBILE}/`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="9XX XXX XXX"]', phone);
  await page.click(`text=${role}`);
  await page.click('text=Recibir código por SMS');
  await page.waitForSelector('text=Código que te enviamos');
  await page.fill('input[autocomplete=sms-otp]', OTP);
  await page.click('text=Ingresar');
  await page.waitForTimeout(2500);
  return ctx;
}
async function sweep(ctx, routes, prefix) {
  for (const scheme of ['light', 'dark']) {
    const c = await browser.newContext({
      ...ANDROID,
      permissions: ['geolocation'],
      colorScheme: scheme,
      storageState: await ctx.storageState(),
    });
    const page = await c.newPage();
    page.on('dialog', (d) => d.dismiss());
    for (const [name, path] of routes) {
      await page.goto(`${MOBILE}${path}`, { waitUntil: 'networkidle' });
      await review(page, `${prefix}-${name}-${scheme === 'light' ? 'claro' : 'oscuro'}`);
    }
    await c.close();
  }
}

// Sin sesión.
{
  for (const scheme of ['light', 'dark']) {
    const c = await browser.newContext({ ...ANDROID, colorScheme: scheme });
    const page = await c.newPage();
    await page.goto(`${MOBILE}/`, { waitUntil: 'networkidle' });
    await review(page, `app-ingreso-${scheme === 'light' ? 'claro' : 'oscuro'}`);
    await c.close();
  }
}

const client = await appLogin('900000001', 'Necesito un servicio');
await sweep(
  client,
  [
    ['inicio', '/inicio'],
    ['pedido-nuevo', `/pedido/nuevo?trade=${GAS}`],
    ['pedido-sin-oficio', '/pedido/nuevo'],
    ['ofertas', `/pedido/${ofertas}/ofertas`],
    ['perfil-pro', `/profesional/${PRO}?offer=${ofertaId}&job=${ofertas}`],
    ['servicio-en-camino', `/servicio/${enCamino}`],
    ['chat', `/chat/${enCamino}`],
    ['confirmar', `/servicio/${terminado}/confirmar`],
    ['calificar', `/servicio/${confirmado}/calificar`],
    ['ajustes', '/ajustes'],
    ['ayuda', '/ajustes/ayuda'],
    ['contactos', '/ajustes/contactos'],
    ['terminos', '/ajustes/terminos'],
    ['sos', '/sos'],
  ],
  'cliente',
);

const pro = await appLogin('900000002', 'Ofrezco mis servicios');
await sweep(
  pro,
  [
    ['solicitudes', '/solicitudes'],
    ['cotizar', `/solicitudes/${nuevo}/cotizar`],
    ['trabajo', `/trabajo/${enCamino}`],
    ['oficios', '/oficios'],
    ['comision', '/comision'],
    ['pagar-comision', '/comision/pagar'],
    ['capacitaciones', '/capacitaciones'],
    ['llegadas', '/llegadas'],
  ],
  'pro',
);

const proNuevo = await appLogin('900000003', 'Ofrezco mis servicios');
await sweep(proNuevo, [['registro-paso-1', '/registro']], 'pro-nuevo');

// Panel (escritorio) y landing.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=tel]', '900000008');
  await page.click('button:has-text("Recibir código")');
  await page.fill('input[autocomplete=one-time-code]', OTP);
  await page.click('button:has-text("Ingresar")');
  await page.waitForURL('**/verificacion');
  for (const scheme of ['light', 'dark']) {
    const c = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: scheme,
      storageState: await ctx.storageState(),
    });
    const p = await c.newPage();
    for (const path of [
      '/verificacion',
      '/constancias',
      '/supervision',
      '/capacitaciones',
      '/lista-negra',
      '/apelaciones',
      '/metricas',
      '/sistema',
      '/parametros',
      `/pedidos/${enCamino}`,
      `/usuarios/${PRO}`,
    ]) {
      await p.goto(`${ADMIN}${path}`, { waitUntil: 'networkidle' });
      await review(
        p,
        `panel${path.replaceAll('/', '-').replace(/-[0-9a-f-]{36}$/, '')}-${scheme === 'light' ? 'claro' : 'oscuro'}`,
      );
    }
    await c.close();
  }
  for (const [scheme, vp] of [
    ['light', ANDROID],
    ['dark', ANDROID],
  ]) {
    const c = await browser.newContext({ ...vp, colorScheme: scheme });
    const p = await c.newPage();
    await p.goto(`${ADMIN}/inicio`, { waitUntil: 'networkidle' });
    await review(p, `landing-${scheme === 'light' ? 'claro' : 'oscuro'}`);
    await c.close();
  }
}

writeFileSync(join(OUT, 'resultado.json'), JSON.stringify(results, null, 2));
const withIssues = results.filter((r) => r.horizontalScroll || r.clipped.length || r.axe.length);
console.log(
  `\n${results.length} pantallas revisadas · ${withIssues.length} con observaciones · detalle en ${join(OUT, 'resultado.json')}`,
);
await browser.close();
