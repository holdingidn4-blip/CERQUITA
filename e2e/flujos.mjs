// Pruebas de navegación de punta a punta (fases 3 y 4) con Playwright.
//
// Requisitos (ver README): Supabase local recién reseteado, el panel en ADMIN_URL
// (next build && next start) y la app exportada para web en MOBILE_URL.
//   pnpm db:reset && pnpm e2e
//
// Cada número de prueba pide código una sola vez (el servidor limita a uno cada 60 s).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ADMIN = process.env.ADMIN_URL ?? 'http://127.0.0.1:3001';
const MOBILE = process.env.MOBILE_URL ?? 'http://127.0.0.1:8099';
const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const OTP = '123456';

let passed = 0;
const ok = (message) => {
  passed += 1;
  console.log(`✓ ${message}`);
};
const check = (condition, message) => {
  if (!condition) throw new Error(`FALLA: ${message}`);
  ok(message);
};
const sql = (query) => execFileSync('psql', [DB_URL, '-Atc', query], { encoding: 'utf8' }).trim();

const executablePath = ['/opt/pw-browsers/chromium'].find(
  (p) => process.env.CI !== 'true' && existsSync(p),
);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const jsErrors = [];

async function adminLogin(page, phone) {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=tel]', phone);
  await page.click('button:has-text("Recibir código")');
  await page.fill('input[autocomplete=one-time-code]', OTP);
  await page.click('button:has-text("Ingresar")');
}

async function mobileLogin(page, phone, role) {
  await page.goto(`${MOBILE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Recibir código por SMS');
  await page.fill('input[placeholder="9XX XXX XXX"]', phone);
  await page.click(`text=${role}`);
  await page.click('text=Recibir código por SMS');
  await page.waitForSelector('text=Código que te enviamos');
  await page.fill('input[autocomplete=sms-otp]', OTP);
  await page.click('text=Ingresar');
}

async function uploadPhoto(
  page,
  buttonLabel,
  file,
  selector = `[aria-label="${buttonLabel}"] >> nth=0`,
) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(selector)]);
  await chooser.setFiles(join(FIXTURES, file));
}

try {
  // ─────────────── Fase 3 · Panel: acceso solo para soporte ───────────────
  const outsider = await (await browser.newContext()).newPage();
  await outsider.goto(`${ADMIN}/`, { waitUntil: 'networkidle' });
  check(outsider.url().endsWith('/login'), 'panel sin sesión → /login');
  await adminLogin(outsider, '900 000 002');
  await outsider.waitForURL('**/no-autorizado');
  ok('profesional sin rol de soporte → /no-autorizado');

  const admin = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await adminLogin(admin, '900000009');
  await admin.waitForURL('**/verificacion');
  check(
    await admin.isVisible('text=Revisor: Rita Revisora'),
    'revisora entra al panel y ve su rol',
  );
  check(
    await admin.isVisible('text=Pedro Gasfitero · Electricista'),
    'la cola muestra el oficio enviado del seed',
  );

  // ─────────────── Fase 3 · App: ingreso, modos y sesión ───────────────
  const client = await browser.newPage({ viewport: { width: 390, height: 844 } });
  client.on('pageerror', (e) => jsErrors.push(e.message));
  await client.goto(`${MOBILE}/`, { waitUntil: 'networkidle' });
  await client.waitForSelector('text=Recibir código por SMS');
  check(client.url().endsWith('/ingreso'), 'app sin sesión → /ingreso');
  await client.click('text=Recibir código por SMS');
  check(await client.isVisible('text=Escribe un celular de 9 dígitos'), 'valida el celular');
  await client.fill('input[placeholder="9XX XXX XXX"]', '900000001');
  await client.click('text=Ofrezco mis servicios');
  await client.click('text=Recibir código por SMS');
  await client.waitForSelector('text=Código que te enviamos');
  check(await client.isVisible('text=+51 9** *** 001'), 'muestra el número enmascarado');
  await client.fill('input[autocomplete=sms-otp]', '000000');
  await client.click('text=Ingresar');
  await client.waitForSelector('text=El código venció');
  ok('código incorrecto muestra error');
  await client.fill('input[autocomplete=sms-otp]', OTP);
  await client.click('text=Ingresar');
  await client.waitForURL('**/registro');
  ok('"Ofrezco mis servicios" sin oficios → registro');
  await client.goto(`${MOBILE}/ajustes`);
  await client.waitForSelector('text=Carla Cliente');
  await client.click('[role=radio]:has-text("Cliente")');
  await client.waitForURL('**/inicio');
  ok('cambio a modo Cliente → /inicio');
  await client.reload();
  await client.waitForSelector('text=Inicio con mapa');
  ok('la sesión persiste al recargar');
  await client.goto(`${MOBILE}/ajustes`);
  await client.click('text=Cerrar sesión');
  await client.waitForURL('**/ingreso');
  await client.goto(`${MOBILE}/solicitudes`);
  await client.waitForURL('**/ingreso');
  ok('cerrar sesión y rutas protegidas → /ingreso');

  // ─────────────── Fase 4 · Registro del profesional ───────────────
  const pro = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pro.on('pageerror', (e) => jsErrors.push(e.message));
  await mobileLogin(pro, '900000003', 'Ofrezco mis servicios');
  await pro.waitForURL('**/registro');
  await pro.waitForSelector('text=Paso 1 de 3');
  ok('pro nuevo empieza el registro en el paso 1');
  await pro.fill('input[autocomplete=name]', 'Luis Quispe');
  await pro.click('text=Continuar');
  await pro.waitForSelector('text=Paso 2 de 3 · Verificación');
  await pro.click('[role=checkbox]:has-text("Gasfitero")');
  await pro.waitForSelector('text=Prueba de tu oficio');
  ok('elige el oficio Gasfitero');
  await pro.click('text=Continuar');
  await pro.waitForSelector('text=Te falta:');
  ok('no deja continuar sin documentos');

  await uploadPhoto(pro, 'Subir DNI (frente)', 'dni_front.jpg');
  await pro.waitForSelector('[aria-label="Subir DNI (frente)"]', { state: 'detached' });
  await uploadPhoto(pro, 'Subir DNI (reverso)', 'dni_back.jpg');
  await pro.waitForSelector('[aria-label="Subir DNI (reverso)"]', { state: 'detached' });
  await uploadPhoto(pro, 'Subir Selfie sosteniendo tu DNI', 'selfie.jpg');
  await pro.waitForSelector('[aria-label="Subir Selfie sosteniendo tu DNI"]', {
    state: 'detached',
  });
  await uploadPhoto(pro, 'Subir Certificado de antecedentes', 'antecedentes.jpg');
  await pro.waitForSelector('[aria-label="Subir Certificado de antecedentes"]', {
    state: 'detached',
  });
  ok('sube DNI, selfie y antecedentes al bucket privado');
  await uploadPhoto(pro, 'Subir Gasfitero', 'trabajo1.jpg');
  await pro.waitForSelector('text=1 de 2');
  await uploadPhoto(pro, 'Subir Gasfitero', 'trabajo2.jpg');
  await pro.waitForSelector('text=2 de 2');
  ok('sube dos pruebas del oficio');
  const proId = sql("select id from public.profiles where phone = '51900000003'");
  check(
    sql(
      `select count(*) from storage.objects where bucket_id = 'verification' and name like '${proId}/%'`,
    ) === '6',
    'los 6 archivos están en storage dentro de su carpeta',
  );
  await pro.click('[role=radio]:has-text("hasta 5 km")');
  for (
    let i = 0;
    i < 50 &&
    sql(`select coalesce(radius_m, 0) from public.pro_presence where pro_id = '${proId}'`) !==
      '5000';
    i++
  ) {
    await pro.waitForTimeout(100);
  }
  await pro.click('text=Continuar');
  await pro.waitForURL('**/oficios');
  await pro.waitForSelector('text=Enviado');
  ok('envía a revisión y ve "Enviado" en Mis oficios');
  check(
    sql(`select radius_m from public.pro_presence where pro_id = '${proId}'`) === '5000',
    'guarda la zona de trabajo (5 km)',
  );

  // ─────────────── Fase 4 · Revisión en el panel ───────────────
  await admin.goto(`${ADMIN}/verificacion`, { waitUntil: 'networkidle' });
  await admin.click('text=Luis Quispe · Gasfitero');
  await admin.waitForSelector('text=En revisión');
  ok('al abrir el caso pasa a "En revisión"');
  await pro.reload();
  await pro.waitForSelector('text=Un revisor del rubro está mirando');
  ok('el pro ve "En revisión" en su app');

  const [docTab] = await Promise.all([
    admin.context().waitForEvent('page'),
    admin.click('li:has-text("DNI (frente)") >> text=Ver'),
  ]);
  await docTab.waitForLoadState();
  check(
    docTab.url().includes('/storage/v1/object/sign/verification/'),
    'el DNI se abre con URL firmada',
  );
  const docResponse = await docTab.request.get(docTab.url());
  check(
    docResponse.status() === 200 && docResponse.headers()['content-type'] === 'image/jpeg',
    'la URL firmada entrega la imagen',
  );
  await docTab.close();
  check(
    sql(
      `select count(*) from public.document_access_log l join public.verification_documents d on d.id = l.document_id where d.pro_id = '${proId}'`,
    ) === '1',
    'la vista queda en document_access_log',
  );
  const unsigned = await admin.request.get(
    `http://127.0.0.1:54321/storage/v1/object/public/verification/${proId}/x.jpg`,
  );
  check(unsigned.status() >= 400, 'el bucket no es público');

  await admin.click('button:has-text("Pedir más datos")');
  await admin.waitForSelector('text=Escribe el motivo');
  ok('pedir datos sin motivo muestra error');
  await admin.fill('textarea[name=reason]', 'Sube una foto tuya en el lugar del trabajo.');
  await admin.click('button:has-text("Pedir más datos")');
  await admin.waitForSelector('text=Pedimos más datos al profesional');
  ok('pide más datos con motivo');

  await pro.reload();
  await pro.waitForSelector('text=Falta información');
  check(
    await pro.isVisible('text=Sube una foto tuya en el lugar del trabajo.'),
    'el pro ve el motivo del revisor',
  );
  await uploadPhoto(pro, '', 'trabajo1.jpg', 'text=Subir más evidencia');
  await pro.waitForSelector('text=Evidencia: 3 de 2');
  await pro.click('text=Enviar a revisión');
  await pro.waitForSelector('text=Enviado');
  ok('sube más evidencia y reenvía');

  await admin.goto(`${ADMIN}/verificacion`, { waitUntil: 'networkidle' });
  check(await admin.isVisible('text=Reenviado'), 'la cola marca el caso como reenviado');
  await admin.click('text=Luis Quispe · Gasfitero');
  await admin.click('button:has-text("Aprobar (en observación)")');
  await admin.waitForSelector('text=Oficio aprobado: queda en observación.');
  ok('la revisora aprueba');
  if (process.env.SCREENSHOT_DIR) {
    await admin.screenshot({ path: `${process.env.SCREENSHOT_DIR}/admin-cola.png` });
  }

  await pro.reload();
  await pro.waitForSelector('text=En observación');
  check(
    await pro.isVisible('text=Identidad verificada'),
    'el pro ve "En observación" e identidad verificada',
  );
  check(await pro.isVisible('text=0 de 3'), 'muestra el avance hacia aprobado pleno (0 de 3)');

  check(
    jsErrors.length === 0,
    `sin errores de JavaScript${jsErrors.length ? `: ${jsErrors.join(' | ')}` : ''}`,
  );
  console.log(`\n${passed} pasos OK`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
