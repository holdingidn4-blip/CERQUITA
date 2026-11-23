// Pruebas de navegación de punta a punta (fases 3 a 8) con Playwright.
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
// Huancayo (ciudad del piloto).
const GEO = { latitude: -12.0651, longitude: -75.2049 };
const phonePage = async () => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: GEO,
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => jsErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  return page;
};

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
  const pedroCodeAt = Date.now();
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
  const client = await phonePage();
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
  await client.waitForSelector('text=¿Qué necesitas hoy?');
  ok('la sesión persiste al recargar');

  // ─────────────── Fase 4 · Registro del profesional (asistente de 6 pasos) ───────────────
  const pro = await phonePage();
  const until = async (query, expected) => {
    for (let i = 0; i < 100; i++) {
      if (sql(query) === expected) return;
      await pro.waitForTimeout(100);
    }
    throw new Error(`Esperaba ${expected} en: ${query} (hay ${sql(query)})`);
  };
  const next = (label = 'Seguir') => pro.getByRole('button', { name: label, exact: true }).click();
  await mobileLogin(pro, '900000003', 'Ofrezco mis servicios');
  await pro.waitForURL('**/registro');
  await pro.waitForSelector('text=Paso 1 de 6 · Tus datos y DNI');
  ok('pro nuevo empieza el registro en el paso 1 de 6');
  await pro.click('text=¿Por qué te pedimos esto?');
  await pro.waitForSelector('text=Tu DNI no se muestra a nadie');
  ok('cada paso explica por qué pide los datos');
  await pro.fill('[aria-label="Nombre y apellido"]', 'Luis Quispe');
  await pro.fill('[aria-label="Número de DNI"]', '45678901');
  await pro.fill('[aria-label="Día de nacimiento"]', '01');
  await pro.fill('[aria-label="Mes de nacimiento"]', '01');
  await pro.fill('[aria-label="Año de nacimiento"]', String(new Date().getFullYear() - 17));
  await next('Guardar y seguir');
  await pro.waitForSelector('text=Debes ser mayor de 18 años para ofrecer servicios en Cerquita');
  ok('no deja registrarse a un menor de 18 (lo valida el servidor)');
  await pro.fill('[aria-label="Año de nacimiento"]', '1990');
  await next('Guardar y seguir');
  await pro.waitForSelector('text=Falta tomar las fotos de tu DNI y tu selfie');
  const proId = sql("select id from public.profiles where phone = '51900000003'");
  check(
    sql(
      `select dni_number || '|' || birth_date from public.pro_identity where pro_id = '${proId}'`,
    ) === '45678901|1990-01-01',
    'guarda DNI y fecha de nacimiento',
  );
  const docs = (kind, extra = '') =>
    `select count(*) from public.verification_documents where pro_id = '${proId}' and kind = '${kind}'${extra}`;
  await uploadPhoto(pro, '', 'dni_front.jpg', '[aria-label="Tomar foto: DNI (frente)"]');
  await until(docs('dni_front'), '1');
  await uploadPhoto(pro, '', 'dni_back.jpg', '[aria-label="Tomar foto: DNI (reverso)"]');
  await until(docs('dni_back'), '1');
  await uploadPhoto(pro, '', 'selfie.jpg', '[aria-label="Tomar foto: Selfie sosteniendo tu DNI"]');
  await until(docs('selfie'), '1');
  await next('Guardar y seguir');
  await pro.waitForSelector('text=Paso 2 de 6 · Tus oficios');
  ok('sube DNI y selfie y pasa a elegir oficios');

  await pro.click('[role=checkbox][aria-label="Gasfitero"]');
  await pro.waitForSelector('text=¿Qué trabajos haces?');
  await next();
  await pro.waitForSelector('text=Marca al menos un trabajo que haces en cada oficio.');
  ok('pide elegir al menos una especialidad');
  await pro.click('[role=checkbox]:has-text("Agua y desagüe")');
  await until(
    `select count(*) from public.pro_trade_specialties s join public.pro_trades p on p.id = s.pro_trade_id where p.pro_id = '${proId}'`,
    '1',
  );
  await next();
  await pro.waitForSelector('text=Paso 3 de 6 · Pruebas de tu trabajo');
  ok('elige Gasfitero (riesgo alto) y su especialidad');

  const photoButton = '[aria-label="Tomar o elegir foto: Fotos de tus trabajos"]';
  await pro.click('text=Ver cómo tomar una buena foto');
  await pro.waitForSelector('text=Así no');
  ok('muestra ejemplos de foto buena y mala');
  await uploadPhoto(pro, '', 'trabajo1.jpg', photoButton);
  await until(docs('work_photo'), '1');
  await pro.reload();
  await pro.waitForSelector('text=Paso 3 de 6 · Pruebas de tu trabajo');
  ok('al volver retoma en el paso donde se quedó (autoguardado)');
  await uploadPhoto(pro, '', 'trabajo2.jpg', photoButton);
  await until(docs('work_photo'), '2');
  await uploadPhoto(
    pro,
    '',
    'trabajo1.jpg',
    '[aria-label="Tomar o elegir foto: Certificado técnico"]',
  );
  await until(docs('certificate'), '1');
  await pro.click('[aria-label="Grabar video: Video de 1 a 3 minutos"]');
  await pro.waitForSelector('text=Video de verificación');
  await uploadPhoto(pro, '', 'video.webm', 'text=Elegir video');
  await until(docs('verification_video', ' and duration_seconds between 60 and 70'), '1');
  ok('sube 2 fotos, certificado técnico y video de verificación (65 s)');
  await next();
  await pro.waitForSelector('text=Paso 4 de 6 · Antecedentes');
  await uploadPhoto(
    pro,
    '',
    'antecedentes.jpg',
    '[aria-label="Tomar o elegir foto: Certificado de antecedentes penales"]',
  );
  await until(docs('background'), '1');
  await next();
  await pro.waitForSelector('text=Paso 5 de 6 · Zona de trabajo');
  await pro.click('[role=radio]:has-text("Hasta 5 km")');
  await until(
    `select coalesce(radius_m, 0) from public.pro_presence where pro_id = '${proId}'`,
    '5000',
  );
  await next();
  await pro.waitForSelector('text=Paso 6 de 6 · Revisa y envía');
  check(
    sql(
      `select count(*) from storage.objects where bucket_id = 'verification' and name like '${proId}/%'`,
    ) === '8',
    'los 8 archivos están en storage dentro de su carpeta',
  );
  await next('Enviar a revisión');
  await pro.waitForURL('**/oficios');
  await pro.waitForSelector('text=En revisión · te avisamos en 24 h');
  ok('envía a revisión y ve "En revisión · te avisamos en 24 h"');
  check(
    sql(`select radius_m from public.pro_presence where pro_id = '${proId}'`) === '5000',
    'guarda la zona de trabajo (5 km)',
  );

  // ─────────────── Fase 4 · Revisión en el panel ───────────────
  await admin.goto(`${ADMIN}/verificacion`, { waitUntil: 'networkidle' });
  check(
    await admin.isVisible('li:has-text("Luis Quispe · Gasfitero") >> text=Riesgo alto'),
    'la cola muestra el riesgo del oficio',
  );
  await admin.click('text=Luis Quispe · Gasfitero');
  await admin.waitForSelector('text=En revisión');
  ok('al abrir el caso pasa a "En revisión"');
  check(
    /45678901.*mayor de edad ✓/.test(await admin.locator('[data-testid=dni-datos]').innerText()),
    'soporte ve DNI, edad y que es mayor de edad',
  );
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

  await admin.click('button:has-text("Pedir más evidencia")');
  await admin.waitForSelector('text=Escribe el motivo');
  ok('pedir datos sin motivo muestra error');
  await admin.fill('textarea[name=reason]', 'Sube una foto tuya en el lugar del trabajo.');
  await admin.click('button:has-text("Pedir más evidencia")');
  await admin.waitForSelector('text=Pedimos más evidencia al profesional');
  ok('pide más evidencia con motivo');

  await pro.reload();
  await pro.waitForSelector('text=Te pedimos más pruebas');
  check(
    await pro.isVisible('text=Sube una foto tuya en el lugar del trabajo.'),
    'el pro ve el motivo del revisor',
  );
  await pro.click('text=Revisar y enviar');
  await pro.waitForSelector('text=Paso 6 de 6 · Revisa y envía');
  await pro.click('[aria-label^="Pruebas: Gasfitero"]');
  await pro.waitForSelector('text=El revisor pide: “Sube una foto tuya en el lugar del trabajo.”');
  await uploadPhoto(pro, '', 'trabajo1.jpg', photoButton);
  await until(docs('work_photo'), '3');
  await next();
  await pro.waitForSelector('text=Paso 4 de 6 · Antecedentes');
  await next();
  await next();
  await pro.waitForSelector('text=Paso 6 de 6 · Revisa y envía');
  await next('Enviar a revisión');
  await pro.waitForSelector('text=En revisión · te avisamos en 24 h');
  ok('sube más evidencia y reenvía');

  await admin.goto(`${ADMIN}/verificacion`, { waitUntil: 'networkidle' });
  check(await admin.isVisible('text=Reenviado'), 'la cola marca el caso como reenviado');
  await admin.click('text=Luis Quispe · Gasfitero');
  await admin.click('button:has-text("Aprobar (en observación)")');
  await admin.waitForSelector('text=marca el resultado de antecedentes');
  ok('aprobar exige el resultado de antecedentes');
  await admin.check('[aria-label="Antecedentes: Apto"]');
  await admin.click('button:has-text("Aprobar (en observación)")');
  await admin.waitForSelector('text=Oficio aprobado: queda en observación.');
  ok('la revisora aprueba con antecedentes "apto"');
  check(
    sql(docs('background')) === '0' &&
      sql(
        `select result from public.pro_background_checks b join public.pro_trades p on p.id = b.pro_trade_id where p.pro_id = '${proId}'`,
      ) === 'apto',
    'se guarda solo el resultado y el certificado se borra',
  );
  check(
    sql(
      `select count(*) from public.pro_trade_events e join public.pro_trades p on p.id = e.pro_trade_id where p.pro_id = '${proId}' and e.actor_id is not null`,
    ) === '7',
    'historial: creado, enviado, en revisión, más evidencia, reenviado, en revisión y aprobado, con responsable',
  );
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

  // ─────────────── Fase 5 · El cliente publica un pedido ───────────────
  await client.goto(`${MOBILE}/inicio`, { waitUntil: 'networkidle' });
  await client.click('text=Usar mi ubicación');
  await client.waitForSelector('text=1 profesional verificado a menos de 3 km');
  ok('inicio con ubicación: cuenta los profesionales en línea cerca');
  await client.click('[aria-label="Pedir Gasfitero"]');
  await client.waitForURL('**/pedido/nuevo**');
  await client.waitForSelector('text=Solo el profesional que aceptes verá tu dirección exacta.');
  await client.fill(
    'textarea',
    'Se filtra agua debajo del lavadero de la cocina, gotea desde ayer.',
  );
  await uploadPhoto(client, 'Agregar foto', 'trabajo1.jpg');
  await client.waitForSelector('[aria-label="Foto del pedido"]');
  await client.fill('input[autocomplete=street-address]', 'Jr. Los Pinos 245');
  await client.fill('[aria-label="Referencia"]', 'Dpto. 302 · Cocina');
  await client.click('text=Buscar profesionales cerca');
  await client.waitForSelector('text=Pon un precio entre');
  ok('valida el precio');
  await client.fill('[aria-labelledby=price-label]', '80');
  await client.click('text=Buscar profesionales cerca');
  await client.waitForURL('**/ofertas');
  await client.waitForSelector('text=Buscando gasfiteros cerca…');
  ok('publica el pedido y espera ofertas');
  const jobId = sql("select id from public.jobs where description like 'Se filtra agua%'");
  check(
    sql(`select offered_price_cents || '|' || status from public.jobs where id = '${jobId}'`) ===
      '8000|published',
    'el pedido queda publicado con S/ 80 en céntimos',
  );
  check(
    sql(
      `select extensions.st_astext(approx_point::extensions.geometry) from public.jobs where id = '${jobId}'`,
    ) === 'POINT(-75.205 -12.065)',
    'el servidor guarda solo la zona aproximada',
  );
  check(
    sql(
      `select count(*) from storage.objects where bucket_id = 'job-photos' and name like '${jobId}/%'`,
    ) === '1',
    'la foto queda en job-photos dentro de la carpeta del pedido',
  );

  // ─────────────── Fase 5 · El profesional cotiza ───────────────
  await pro.goto(`${MOBILE}/solicitudes`, { waitUntil: 'networkidle' });
  await pro.waitForSelector('text=Desconectado');
  await pro.click('[aria-label="En línea"]');
  await pro.waitForSelector('text=Se filtra agua debajo del lavadero de la cocina');
  ok('el pro se pone en línea y ve el pedido cercano');
  check(!(await pro.isVisible('text=Jr. Los Pinos')), 'no ve la dirección exacta antes de aceptar');
  check(await pro.isVisible('text=Carla C. · Nuevo'), 've el nombre corto del cliente');
  await pro.click('text=Cotizar');
  await pro.waitForSelector('text=Tu cotización');
  await pro.waitForSelector('img[src*="/object/sign/job-photos/"]', { state: 'attached' });
  ok('ve la foto del pedido con URL firmada');
  await pro.click('[role=radio]:has-text("S/ 95")');
  await pro.waitForSelector('text=Comisión de la app (10 %)');
  check(await pro.isVisible('text=− S/ 9.50'), 'muestra la comisión del 10 % (S/ 9.50)');
  check(await pro.isVisible('text=S/ 85.50'), 'y lo que recibirá (S/ 85.50)');
  await pro.click('[role=radio]:has-text("30 min")');
  await pro.waitForSelector(
    'text=Si no llegas a tiempo, el cliente puede elegir a otro profesional.',
  );
  ok('el pro indica en cuánto llega (30 min)');
  await pro.fill('[aria-labelledby=msg-label]', 'Llevo los repuestos.');
  await pro.click('text=Enviar cotización');
  await pro.waitForURL('**/solicitudes');
  await pro.waitForSelector('text=Oferta enviada: S/ 95.00');
  ok('envía la cotización');
  // Segundo profesional (Pedro, del seed) acepta el precio del cliente.
  sql(
    `insert into public.offers (job_id, pro_id, price_cents) values ('${jobId}', '22222222-2222-2222-2222-222222222222', 8000)`,
  );

  // ─────────────── Fase 5 · El cliente compara y acepta ───────────────
  await client.waitForSelector('text=2 gasfiteros respondieron', { timeout: 15000 });
  ok('el cliente ve las ofertas sin recargar');
  check(await client.isVisible('text=Tu precio'), 'marca la oferta con su precio');
  check(await client.isVisible('text=Contraoferta'), 'y la contraoferta');
  check(await client.isVisible('text=“Llevo los repuestos.”'), 'con el mensaje del pro');
  check(
    await client.isVisible('[data-testid=oferta]:has-text("Luis Q.") >> text=llega en 30 min'),
    'y en cuánto llega',
  );
  await client.click('[data-testid=oferta]:has-text("Luis Q.") >> text=Ver perfil');
  await client.waitForSelector('text=Identidad verificada');
  check(await client.isVisible('text=Luis Quispe'), 'abre el perfil del profesional');
  await client.click('text=Aceptar y contratar');
  await client.waitForURL('**/servicio/**');
  await client.waitForSelector('text=Luis aceptó tu pedido');
  check(
    (await client.locator('text=S/ 95.00 >> visible=true').count()) > 0,
    'tras aceptar ve el servicio con el precio acordado',
  );
  check(
    await client.isVisible('[data-testid=llegada] >> text=Llegada acordada'),
    'y la hora de llegada acordada',
  );
  check(
    sql(
      `select status || '|' || final_price_cents || '|' || commission_rate_bps from public.jobs where id = '${jobId}'`,
    ) === 'accepted|9500|1000',
    'el pedido queda aceptado con precio y tasa congelados',
  );
  check(
    sql(
      `select status from public.offers where job_id = '${jobId}' and pro_id = '22222222-2222-2222-2222-222222222222'`,
    ) === 'rejected',
    'la otra oferta queda rechazada',
  );
  await pro.reload();
  await pro.waitForSelector('text=Solicitudes cerca de ti');
  check(
    (await pro.locator('[data-testid=solicitud]').count()) === 0,
    'el pedido aceptado sale de las solicitudes',
  );

  // ─────────────── Fase 6 · Servicio en curso ───────────────
  await pro.click('text=Servicio en curso · Aceptado');
  await pro.waitForURL('**/trabajo/**');
  await pro.waitForSelector('text=Jr. Los Pinos 245 · Dpto. 302 · Cocina');
  ok('el pro asignado ve la dirección exacta y el servicio');
  check(
    sql(`select count(*) from public.job_tracks where job_id = '${jobId}'`) === '0',
    'antes de salir no se comparte ubicación',
  );
  await pro.click('text=Ir al domicilio');
  await pro.waitForSelector('text=En camino · GPS activo, el cliente te ve');
  ok('"Ir al domicilio" inicia el viaje');
  for (
    let i = 0;
    i < 50 && sql(`select count(*) from public.job_tracks where job_id = '${jobId}'`) === '0';
    i++
  ) {
    await pro.waitForTimeout(200);
  }
  check(
    Number(sql(`select count(*) from public.job_tracks where job_id = '${jobId}'`)) > 0,
    'el pro envía su ubicación',
  );
  const code = sql(`select security_code from public.jobs where id = '${jobId}'`);
  await client.waitForSelector(`[aria-label="Código de seguridad ${code.split('').join(' ')}"]`, {
    timeout: 15000,
  });
  ok('el cliente ve el código de seguridad');
  await client.waitForSelector('text=Luis viene en camino');
  await client.waitForSelector('[aria-label="Mapa: Ubicación de Luis"]', { timeout: 15000 });
  check(
    (await client.locator('text=/Llega en \\d+ min/ >> visible=true').count()) > 0,
    'y la posición en vivo con tiempo de llegada',
  );

  await client.click('text=Mensaje');
  await client.waitForURL('**/chat/**');
  await client.fill(
    '[aria-label="Escribe un mensaje"]',
    'Pásame tu WhatsApp, mi número es 987 654 321',
  );
  await client.click('[aria-label="Enviar"]');
  await client.waitForSelector('text=no se pueden compartir números de teléfono');
  ok('el chat bloquea teléfonos y WhatsApp');
  await client.fill('[aria-label="Escribe un mensaje"]', 'Toca el timbre 302');
  await client.click('[aria-label="Enviar"]');
  await client.waitForSelector('[data-testid=mensaje]:has-text("Toca el timbre 302")');
  await pro.click('text=Mensaje');
  await pro.waitForSelector('text=Toca el timbre 302', { timeout: 15000 });
  await pro.fill('[aria-label="Escribe un mensaje"]', 'Llego en 5 minutos');
  await pro.click('[aria-label="Enviar"]');
  await client.waitForSelector('text=Llego en 5 minutos', { timeout: 15000 });
  ok('chat entre cliente y profesional en vivo');
  await pro.goBack();
  await client.goBack();

  await pro.fill('[aria-labelledby=code-label]', code === '0000' ? '1111' : '0000');
  await pro.click('text=Llegué al domicilio');
  await pro.waitForSelector('text=El código no coincide');
  ok('un código equivocado no marca la llegada');
  await pro.fill('[aria-labelledby=code-label]', code);
  await pro.click('text=Llegué al domicilio');
  await pro.waitForSelector('text=Monto final');
  ok('con el código correcto queda "En el domicilio"');
  await client.waitForSelector('text=Luis llegó a tu domicilio', { timeout: 15000 });
  ok('el cliente ve la llegada');

  await pro.click('text=Terminado');
  await pro.waitForSelector('text=Esperando que el cliente confirme el monto');
  const tracksAtFinish = sql(`select count(*) from public.job_tracks where job_id = '${jobId}'`);
  await client.waitForURL('**/confirmar', { timeout: 15000 });
  await client.waitForSelector('text=Luis marcó el trabajo como terminado');
  check(
    (await client.locator('text=Coincide con lo acordado >> visible=true').count()) > 0,
    'el cliente ve el monto final igual al acordado',
  );
  await client.click('text=Confirmar S/ 95');
  await client.waitForURL('**/calificar');
  check(
    sql(`select status || '|' || final_price_cents from public.jobs where id = '${jobId}'`) ===
      'confirmed|9500',
    'el servicio queda Confirmado con S/ 95',
  );
  await pro.waitForTimeout(2000);
  check(
    sql(`select count(*) from public.job_tracks where job_id = '${jobId}'`) === tracksAtFinish,
    'tras Terminado se corta la ubicación',
  );

  // ─────────────── Fase 7 · Calificación, comisión y constancia ───────────────
  await client.waitForSelector('text=¿Cómo fue el servicio?');
  await client.click('[role=radio]:has-text("Yape")');
  await client.click('[aria-label="5 estrellas"]');
  await client.click('[role=checkbox]:has-text("Puntual")');
  await client.fill('[aria-label="Comentario (opcional)"]', 'Llegó puntual y dejó todo limpio.');
  await client.click('text=Enviar calificación');
  await client.waitForURL('**/inicio');
  check(
    sql(`select status from public.jobs where id = '${jobId}'`) === 'rated',
    'el cliente califica y el pedido queda Calificado',
  );
  check(
    sql(
      `select stars || '|' || payment_method_used from public.ratings where job_id = '${jobId}'`,
    ) === '5|yape',
    'con 5 estrellas y medio de pago Yape',
  );
  const luisId = sql("select id from public.profiles where phone = '51900000003'");
  check(
    sql(
      `select amount_cents from public.wallet_entries where idempotency_key = 'job:${jobId}:commission'`,
    ) === '-950',
    'al confirmar se anotó la comisión de S/ 9.50 en el libro',
  );

  await pro.goto(`${MOBILE}/comision`, { waitUntil: 'networkidle' });
  await pro.waitForSelector('text=Comisión de servicio');
  check(
    (await pro.locator('text=−S/ 9.50 >> visible=true').count()) > 0,
    'el pro ve el movimiento en Mi comisión',
  );
  check((await pro.locator('text=S/ 9.50 >> visible=true').count()) > 0, 'y su comisión pendiente');
  await pro.click('text=Pagar comisión');
  await pro.waitForSelector('text=Paga a Cerquita por Yape');
  check(!(await pro.isVisible('text=/comprar saldo|recarga/i')), 'sin compras dentro de la app');
  await pro.fill('[aria-label="Monto pagado"]', '9.50');
  await pro.fill('[aria-label="Código de operación"]', 'OP-77812');
  await uploadPhoto(pro, '', 'trabajo2.jpg', 'text=Subir constancia');
  await pro.waitForSelector('[aria-label="Constancia"]');
  await pro.click('text=Enviar constancia');
  await pro.waitForURL('**/comision');
  await pro.waitForSelector('text=En revisión');
  ok('el pro sube la constancia de pago');
  check(
    await pro.isVisible('text=/Te respondemos en menos de/'),
    'y ve en cuánto tiempo le responde soporte',
  );

  await admin.goto(`${ADMIN}/constancias`, { waitUntil: 'networkidle' });
  await admin.waitForSelector('text=OP-77812');
  check(
    await admin.isVisible(
      'tr:has-text("OP-77812") [data-testid=plazo-constancia]:has-text("Vence en")',
    ),
    'soporte ve el plazo de respuesta de la constancia',
  );
  sql(
    `update public.payment_proofs set created_at = now() - interval '3 hours' where operation_code = 'OP-77812'`,
  );
  await admin.reload({ waitUntil: 'networkidle' });
  check(
    (await admin.isVisible(
      'tr:has-text("OP-77812") [data-testid=plazo-constancia]:has-text("Vencida hace")',
    )) && (await admin.isVisible('[data-testid=resumen-constancias]:has-text("1 vencida")')),
    'y la marca como vencida cuando pasa el plazo',
  );
  const [proofTab] = await Promise.all([
    admin.context().waitForEvent('page'),
    admin.click('text=OP-77812'),
  ]);
  await proofTab.waitForLoadState();
  check(
    proofTab.url().includes('/storage/v1/object/sign/payment-proofs/'),
    'soporte ve la constancia con URL firmada',
  );
  await proofTab.close();
  await admin.click('tr:has-text("OP-77812") >> button:has-text("Aprobar")');
  await admin.waitForSelector('text=Aprobada: se creó el abono en el libro.');
  check(
    sql(
      `select coalesce(sum(amount_cents), 0) from public.wallet_entries where professional_id = '${luisId}'`,
    ) === '0',
    'aprobar crea el payment_credit y la deuda queda en S/ 0',
  );

  // ─────────────── Fase 7 · El profesional no llega: el cliente cambia de profesional ───────────────
  const job2 = sql(
    `with ins as (
       insert into public.jobs (client_id, trade_id, description, offered_price_cents, approx_point, exact_address)
       values ('11111111-1111-1111-1111-111111111111', (select id from public.trades where slug = 'gasfiteria'),
         'La terma no calienta el agua.', 8000, 'SRID=4326;POINT(-75.2049 -12.0651)', 'Jr. Los Pinos 245')
       returning id
     ) select id from ins`,
  );
  await pro.goto(`${MOBILE}/solicitudes/${job2}/cotizar`, { waitUntil: 'networkidle' });
  await pro.waitForSelector('text=Tu cotización');
  await pro.fill('[aria-label="Tu cotización en soles"]', '80');
  await pro.click('[role=radio]:has-text("15 min")');
  await pro.click('text=Enviar cotización');
  await pro.waitForURL('**/solicitudes');
  sql(
    `insert into public.offers (job_id, pro_id, price_cents, eta_minutes) values ('${job2}', '22222222-2222-2222-2222-222222222222', 8500, 45)`,
  );
  await client.goto(`${MOBILE}/pedido/${job2}/ofertas`, { waitUntil: 'networkidle' });
  await client.waitForSelector('[data-testid=oferta]:has-text("Luis Q.") >> text=llega en 15 min');
  await client.click('[data-testid=oferta]:has-text("Luis Q.") >> text=Aceptar');
  await client.waitForURL(`**/servicio/${job2}`);
  await client.waitForSelector('[data-testid=llegada] >> text=Faltan');
  check(
    !(await client.isVisible('text=Cambiar de profesional')),
    'a tiempo, no se ofrece cambiar de profesional',
  );
  sql(
    `update public.jobs set promised_arrival_at = now() - interval '20 minutes' where id = '${job2}'`,
  );
  await client.reload({ waitUntil: 'networkidle' });
  await client.waitForSelector('text=no llegó a la hora acordada');
  ok('pasada la tolerancia, el cliente ve que no llegó');
  await client.click('text=Cambiar de profesional');
  await client.waitForURL(`**/pedido/${job2}/ofertas`);
  await client.waitForSelector('[data-testid=oferta]:has-text("Pedro")');
  check(
    sql(
      `select o.status || '|' || (select count(*) from public.pro_no_shows n where n.offer_id = o.id) from public.offers o where o.job_id = '${job2}' and o.pro_id = '${luisId}'`,
    ) === 'no_show|1',
    'cambia de profesional: la falta queda registrada',
  );
  check(
    sql(`select status from public.jobs where id = '${job2}'`) === 'with_offers',
    'y el pedido vuelve a la otra oferta',
  );
  await pro.goto(`${MOBILE}/solicitudes`, { waitUntil: 'networkidle' });
  await pro.waitForSelector('[data-testid=aviso-llegadas] >> text=Llevas 1 de 3');
  ok('el profesional ve su llegada incumplida');

  // ─────────────── Fase 7 · Reevaluación en el domicilio y cancelación con tarifa de visita ───────────────
  await client.click('[data-testid=oferta]:has-text("Pedro") >> text=Aceptar');
  await client.waitForURL(`**/servicio/${job2}`);
  const pedro = await phonePage();
  // El número de Pedro ya pidió un código al inicio (panel): el servidor exige 60 s entre códigos.
  await pedro.waitForTimeout(Math.max(0, 62000 - (Date.now() - pedroCodeAt)));
  await mobileLogin(pedro, '900000002', 'Ofrezco mis servicios');
  await pedro.waitForURL('**/solicitudes');
  await pedro.goto(`${MOBILE}/trabajo/${job2}`, { waitUntil: 'networkidle' });
  await pedro.click('text=Ir al domicilio');
  await pedro.waitForSelector('text=En camino · GPS activo, el cliente te ve');
  await pedro.fill(
    '[aria-labelledby=code-label]',
    sql(`select security_code from public.jobs where id = '${job2}'`),
  );
  await pedro.click('text=Llegué al domicilio');
  await pedro.waitForSelector('text=Monto final');
  await pedro.click('text=Reevaluar en sitio');
  await pedro.waitForSelector('[data-testid=reevaluar]');
  await pedro.fill('[aria-labelledby=labor-label]', '100');
  await pedro.click('[role=radio]:has-text("Los compra el profesional")');
  await pedro.fill('[aria-label="Buscar en el catálogo"]', 'Vainsa');
  await pedro.click('text=/Vainsa Llave de paso/ >> nth=0');
  await uploadPhoto(pedro, '', 'trabajo2.jpg', 'text=Subir foto de la boleta');
  await pedro.waitForSelector('text=Boleta subida ✓');
  await pedro.click('text=Enviar reevaluación al cliente');
  await pedro.waitForSelector('text=Esperando que el cliente responda tu reevaluación');
  ok('el pro reevalúa en sitio con materiales del catálogo y boleta');
  await client.waitForSelector('[data-testid=alerta-reevaluacion]', { timeout: 15000 });
  await client.click('text=Aprobar S/ 115.90');
  await client.waitForSelector('text=Precio aprobado', { timeout: 15000 });
  check(
    sql(
      `select status || '|' || labor_cents || '|' || materials_cents || '|' || materials_provided_by from public.jobs where id = '${job2}'`,
    ) === 'price_renegotiated|10000|1590|pro',
    'el cliente aprueba: mano de obra S/ 100 + materiales S/ 15.90 con boleta',
  );
  await client.click('text=Cancelar (pagas la visita)');
  await client.fill('[aria-label="Motivo de la cancelación"]', 'Lo resuelvo otro día.');
  await client.click('text=/Cancelar y pagar visita/');
  await client.waitForSelector('text=Cancelaste después de la llegada', { timeout: 15000 });
  const visitFee = Number(sql(`select visit_fee_cents from public.jobs where id = '${job2}'`));
  check(visitFee > 0, 'cancelar en el domicilio cobra la tarifa de visita');
  check(
    sql(
      `select amount_cents from public.wallet_entries where idempotency_key = 'job:${job2}:visit'`,
    ) === String(-Math.round(visitFee / 10)),
    'y anota la comisión del 10 % sobre la visita',
  );
  await pedro.reload({ waitUntil: 'networkidle' });
  await pedro.waitForSelector('text=El cliente canceló en el domicilio');
  ok('el pro ve que el cliente le debe la visita');

  // ─────────────── Fase 7 · Pedido programado con visita de diagnóstico ───────────────
  await client.goto(`${MOBILE}/inicio`, { waitUntil: 'networkidle' });
  await client.click('[aria-label="Pedir Gasfitero"]');
  await client.waitForURL('**/pedido/nuevo**');
  await client.fill('textarea', 'Revisar por qué baja la presión del agua en la ducha.');
  await client.click('[role=checkbox]:has-text("Visita de diagnóstico presencial")');
  await client.click('[role=radio]:has-text("Programado")');
  await client.click('[role=radio]:has-text("10:00")');
  const dayChips = client.locator('[role=radio]', {
    hasText: /^(dom|lun|mar|mié|jue|vie|sáb) \d{1,2} [a-z]{3}$/,
  });
  await dayChips.nth(1).click();
  await client.fill('input[autocomplete=street-address]', 'Jr. Los Pinos 245');
  await client.click('text=Buscar profesionales cerca');
  await client.waitForURL('**/ofertas');
  const job3 = sql(
    "select id from public.jobs where description like 'Revisar por qué baja la presión%'",
  );
  // Se eligió 10:00 y después el segundo día (pasado mañana): la hora debe pasar a ese día.
  check(
    sql(
      `select schedule_kind || '|' || diagnostic_visit || '|' || (to_char(scheduled_for at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') = to_char((now() at time zone 'America/Lima')::date + 2, 'YYYY-MM-DD') || ' 10:00') from public.jobs where id = '${job3}'`,
    ) === 'scheduled|true|true',
    'pedido programado con visita: al cambiar de día se conserva la hora elegida',
  );
  await pro.goto(`${MOBILE}/solicitudes/${job3}/cotizar`, { waitUntil: 'networkidle' });
  await pro.waitForSelector('text=/la hora que eligió el cliente/');
  check(
    !(await pro.isVisible('text=¿En cuánto llegas?')),
    'en un pedido programado el pro no elige hora de llegada',
  );
  check(
    await pro.isVisible('text=/Visita de diagnóstico: desde S\\/ 20\\.00/'),
    'la visita de diagnóstico se cotiza desde la tarifa de visita, no desde el mínimo del oficio',
  );
  await pro.fill('[aria-label="Tu cotización en soles"]', '20');
  await pro.click('text=Enviar cotización');
  await pro.waitForURL('**/solicitudes');
  await client.waitForSelector('[data-testid=oferta]:has-text("Luis Q.")', { timeout: 15000 });
  await client.click('[data-testid=oferta]:has-text("Luis Q.") >> text=Aceptar');
  await client.waitForURL(`**/servicio/${job3}`);
  check(
    sql(
      `select (promised_arrival_at = scheduled_for)::text from public.jobs where id = '${job3}'`,
    ) === 'true',
    'la llegada acordada es la hora programada',
  );
  check(
    sql(`select final_price_cents from public.jobs where id = '${job3}'`) === '2000',
    'la visita de diagnóstico se acepta a S/ 20',
  );
  await client.click('text=Cancelar pedido');
  await client.fill('[aria-label="Motivo de la cancelación"]', 'Ya lo arreglé yo.');
  await client.click('text=Confirmar cancelación');
  await client.waitForSelector('text=Servicio cancelado', { timeout: 15000 });
  check(
    sql(
      `select status || '|' || coalesce(visit_fee_cents::text, 'sin visita') from public.jobs where id = '${job3}'`,
    ) === 'cancelled|sin visita',
    'cancelar antes de la llegada no cobra visita',
  );

  // Pausa por deuda (pantalla 16): una deuda grande sin días de gracia.
  sql(`update public.settings set value = '0' where key = 'grace_days'`);
  sql(`select private.wallet_post('${luisId}', 'commission_debit', -4000, 'e2e:deuda')`);
  await pro.goto(`${MOBILE}/solicitudes`, { waitUntil: 'networkidle' });
  await pro.waitForSelector('text=Tus nuevas ofertas están en pausa');
  check(
    await pro.isVisible('text=Para reactivarte, paga más de S/ 10.00'),
    'en pausa: le dice cuánto pagar para reactivarse',
  );
  sql(`update public.settings set value = '3' where key = 'grace_days'`);

  // ─────────────── Fase 7 · Reclamo y reporte desde la app ───────────────
  await client.goto(`${MOBILE}/servicio/${jobId}`, { waitUntil: 'networkidle' });
  await client.click('text=Reportar un problema');
  await client.fill('[aria-label="Describe el problema"]', 'La fuga volvió al día siguiente.');
  await client.click('text=Enviar reclamo');
  await client.waitForSelector('text=Recibimos tu reclamo');
  check(
    sql(`select status from public.claims where job_id = '${jobId}'`) === 'open',
    'el cliente envía un reclamo del servicio',
  );
  await client.goto(`${MOBILE}/profesional/${luisId}`, { waitUntil: 'networkidle' });
  await client.click('text=Reportar o bloquear a Luis');
  await client.click('[role=radio]:has-text("Pidió pagar o coordinar fuera de la app")');
  await client.fill('[aria-label="Detalles del reporte"]', 'Me pidió pagarle por fuera de la app.');
  await client.click('text=Reportar y bloquear');
  await client.waitForSelector('text=Reportaste y bloqueaste a Luis');
  check(
    sql(
      `select count(*) from public.user_blocks where blocker_id = '11111111-1111-1111-1111-111111111111' and blocked_id = '${luisId}'`,
    ) === '1',
    'el cliente reporta y bloquea al profesional',
  );

  // ─────────────── Fase 9 · Panel: reclamos, reportes y lista negra ───────────────
  await admin.goto(`${ADMIN}/reclamos`, { waitUntil: 'networkidle' });
  const claim = admin.locator('[data-testid=reclamo]:has-text("La fuga volvió al día siguiente.")');
  await claim.waitFor();
  check(
    await claim.locator('text=Carla Cliente → Luis Quispe').isVisible(),
    'soporte ve el reclamo con cliente y técnico',
  );
  const viewsBefore = Number(
    sql(
      `select count(*) from public.document_access_log l join public.verification_documents d on d.id = l.document_id where d.pro_id = '${luisId}'`,
    ),
  );
  const [claimDoc] = await Promise.all([
    admin.context().waitForEvent('page'),
    claim.locator('text=Ver >> nth=0').click(),
  ]);
  await claimDoc.waitForLoadState();
  check(
    claimDoc.url().includes('/storage/v1/object/sign/verification/'),
    'abre la identidad del técnico con URL firmada',
  );
  await claimDoc.close();
  check(
    Number(
      sql(
        `select count(*) from public.document_access_log l join public.verification_documents d on d.id = l.document_id where d.pro_id = '${luisId}'`,
      ),
    ) ===
      viewsBefore + 1,
    'y esa vista queda registrada',
  );
  await claim.locator('button:has-text("Resolver")').click();
  await claim.locator('text=Escribe la resolución.').waitFor();
  ok('resolver sin texto muestra error');
  await claim.locator('[aria-label="Resolución"]').fill('Luis vuelve a revisar la fuga sin costo.');
  await claim.locator('button:has-text("Resolver")').click();
  await admin.waitForURL('**/reclamos?hecho=1');
  await admin.waitForSelector('[data-testid=reclamo] >> text=Resuelto');
  check(
    sql(`select status || '|' || resolution from public.claims where job_id = '${jobId}'`) ===
      'resolved|Luis vuelve a revisar la fuga sin costo.',
    'soporte resuelve el reclamo con su resolución',
  );

  await admin.goto(`${ADMIN}/reportes`, { waitUntil: 'networkidle' });
  const report = admin.locator('[data-testid=reporte]:has-text("Me pidió pagarle por fuera")');
  await report.waitFor();
  await report.locator('button:has-text("Revisado")').click();
  await report.locator('text=Estado o nota inválidos').waitFor();
  ok('revisar un reporte sin nota muestra error');
  await report.locator('[aria-label="Nota (obligatoria)"]').fill('Advertimos al profesional.');
  await report.locator('button:has-text("Revisado")').click();
  await report.locator('td:text-is("Revisado")').waitFor();
  check(
    sql(`select status || '|' || note from public.user_reports where reported_id = '${luisId}'`) ===
      'reviewed|Advertimos al profesional.',
    'soporte marca el reporte como revisado con nota',
  );

  await admin.goto(`${ADMIN}/lista-negra`, { waitUntil: 'networkidle' });
  const fillBlacklist = async (lat) => {
    await admin.fill('[aria-label="Latitud"]', lat);
    await admin.fill('[aria-label="Longitud"]', '-75.2100');
    await admin.fill('[aria-label="Dirección"]', 'Jr. Prueba 999');
    await admin.fill('[aria-label="Motivo"]', 'Asalto a un técnico');
    await admin.click('button:has-text("Agregar")');
  };
  await fillBlacklist('abc');
  await admin.waitForSelector('text=Coordenadas inválidas');
  ok('valida las coordenadas de la lista negra');
  await fillBlacklist('-12.0700');
  await admin.waitForURL('**/lista-negra?hecho=agregada');
  await admin.waitForSelector('text=Dirección agregada.');
  check(
    sql(
      `select active::text from public.blacklisted_locations where address_text = 'Jr. Prueba 999'`,
    ) === 'true',
    'agrega una dirección a la lista negra',
  );
  await admin.click('tr:has-text("Jr. Prueba 999") >> button:has-text("Desactivar")');
  await admin.waitForSelector('tr:has-text("Jr. Prueba 999") >> text=Inactiva');
  check(
    sql(
      `select active::text from public.blacklisted_locations where address_text = 'Jr. Prueba 999'`,
    ) === 'false',
    'y la desactiva',
  );

  // ─────────────── Fase 9 · Panel: tarifario y parámetros (solo admin edita) ───────────────
  await admin.goto(`${ADMIN}/parametros`, { waitUntil: 'networkidle' });
  check(
    (await admin.isVisible('text=Solo un administrador puede cambiarlos.')) &&
      (await admin.locator('[aria-label="reject_retry_days"]').first().isDisabled()),
    'la revisora ve los parámetros en solo lectura',
  );
  await admin.goto(`${ADMIN}/tarifario`, { waitUntil: 'networkidle' });
  check(
    await admin.isVisible('text=Solo un administrador puede editar.'),
    'la revisora ve el tarifario sin poder editar',
  );

  const boss = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await adminLogin(boss, '900000008');
  await boss.waitForURL('**/verificacion');
  await boss.goto(`${ADMIN}/parametros`, { waitUntil: 'networkidle' });
  const retryDays = sql(
    `select value from public.settings where key = 'reject_retry_days' and scope = 'global'`,
  );
  const retryForm = boss.locator('form:has([aria-label="reject_retry_days"])').first();
  await retryForm.locator('[aria-label="reject_retry_days"]').fill('dos');
  await retryForm.locator('button:has-text("Guardar")').click();
  await retryForm.locator('text=Debe ser un número entero.').waitFor();
  ok('un parámetro numérico rechaza texto');
  await retryForm.locator('[aria-label="reject_retry_days"]').fill(String(Number(retryDays) + 1));
  await retryForm.locator('button:has-text("Guardar")').click();
  await retryForm.locator('text=Guardado').waitFor();
  check(
    sql(
      `select value from public.settings where key = 'reject_retry_days' and scope = 'global'`,
    ) === String(Number(retryDays) + 1),
    'el admin cambia un parámetro y queda en settings',
  );
  sql(
    `update public.settings set value = '${retryDays}' where key = 'reject_retry_days' and scope = 'global'`,
  );

  await boss.goto(`${ADMIN}/tarifario`, { waitUntil: 'networkidle' });
  const [cardId, cardLabel] = sql(
    'select id, label from public.trade_rate_cards order by trade_id, id limit 1',
  ).split('|');
  const card = boss.locator(`[data-testid=tarifa]:has-text("${cardLabel}")`).first();
  const fillCard = async (min, sug, max) => {
    await card.locator('[aria-label="Mínimo"]').fill(min);
    await card.locator('[aria-label="Sugerido"]').fill(sug);
    await card.locator('[aria-label="Máximo"]').fill(max);
    await card.locator('[aria-label="Visita"]').fill('30');
    await card.locator('button:has-text("Guardar")').click();
  };
  await fillCard('50', '40', '30');
  await card.locator('text=Montos en soles: mínimo ≤ sugerido ≤ máximo.').waitFor();
  ok('el tarifario exige mínimo ≤ sugerido ≤ máximo');
  await fillCard('40', '90', '260');
  await card.locator('text=Guardado: rige desde ahora para pedidos nuevos.').waitFor();
  check(
    sql(
      `select min_cents || '|' || suggested_cents || '|' || max_cents || '|' || visit_fee_cents from public.trade_rate_cards where id = ${cardId}`,
    ) === '4000|9000|26000|3000',
    'el admin actualiza una tarifa en céntimos',
  );

  const addMaterial = boss.locator('form:has([aria-label="Marca"])');
  const fillMaterial = async (store) => {
    await addMaterial.locator('[aria-label="Tienda (promart, sodimac, maestro…)"]').fill(store);
    await addMaterial.locator('[aria-label="Marca"]').fill('Pavco');
    await addMaterial.locator('[aria-label="Nombre del material"]').fill('Codo PVC 1/2 pulgada');
    await addMaterial.locator('[aria-label="Unidad"]').fill('unidad');
    await addMaterial.locator('[aria-label="Precio S/"]').fill('2.50');
    await addMaterial.locator('button:has-text("Agregar material")').click();
  };
  await fillMaterial('mercado');
  await addMaterial.locator('text=Tienda: promart, sodimac, maestro, ferreteria u otro.').waitFor();
  ok('el catálogo valida la tienda');
  await fillMaterial('promart');
  await addMaterial.locator('text=Material agregado.').waitFor();
  check(
    sql(
      `select reference_price_cents from public.materials_catalog where name = 'Codo PVC 1/2 pulgada'`,
    ) === '250',
    'el admin agrega un material al catálogo en céntimos',
  );

  // ─────────────── Fase 9 · Panel: métricas del piloto ───────────────
  await boss.goto(`${ADMIN}/metricas?dias=14`, { waitUntil: 'networkidle' });
  const since14 = `((now() at time zone 'America/Lima')::date - 13)::timestamp at time zone 'America/Lima'`;
  const [published14, hired14] = sql(
    `select count(*) || '|' || count(*) filter (where exists (select 1 from public.offers o where o.job_id = j.id and o.status in ('accepted', 'no_show'))) from public.jobs j where j.created_at >= ${since14}`,
  ).split('|');
  const tileValue = async (id) =>
    (await boss.locator(`[data-testid=${id}]`).innerText()).split('\n').map((s) => s.trim());
  check(
    (await tileValue('m-publicados'))[1] === published14 && Number(published14) > 0,
    `métricas: pedidos publicados en 14 días (${published14}) iguales a la base`,
  );
  check(
    (await tileValue('m-contratados'))[2] === `${hired14} de ${published14}`,
    'métricas: contratados con oferta aceptada',
  );
  await boss.locator('[data-testid^=dia-]').last().focus();
  await boss.locator('[role=status]:has-text("Primera oferta:")').waitFor();
  ok('métricas: con Tab sobre un día se ve su detalle');
  await boss.click('summary:has-text("Ver la tabla por día")');
  check(
    (await boss.locator('[data-testid=tabla-metricas] tbody tr').count()) === 14,
    'métricas: la tabla trae una fila por día',
  );
  await boss.click('a:has-text("Últimos 7 días")');
  await boss.waitForURL('**/metricas?dias=7');
  await boss.click('summary:has-text("Ver la tabla por día")');
  check(
    (await boss.locator('[data-testid=tabla-metricas] tbody tr').count()) === 7,
    'métricas: el periodo cambia a 7 días',
  );

  // ─────────────── Fase 9 · Panel: estado del sistema (cron, cola y llamadas) ───────────────
  await boss.goto(`${ADMIN}/sistema`, { waitUntil: 'networkidle' });
  check(
    (await boss.locator('[data-testid^=tarea-]').count()) ===
      Number(sql(`select count(*) from cron.job`)),
    'sistema: lista todas las tareas programadas',
  );
  check(
    await boss
      .locator(
        '[data-testid=tarea-dispatch-push] :text-matches("Bien|Corriendo|Aún no corre|Falló")',
      )
      .isVisible(),
    'sistema: cada tarea muestra su estado con texto',
  );
  check(
    (await boss.locator('[data-testid=cola-pendientes]').innerText()).split('\n')[1].trim() ===
      sql(`select count(*) from public.notification_outbox where status = 'pending'`),
    'sistema: pendientes en la cola iguales a la base',
  );
  check(
    (await boss.locator('[data-testid=sistema-ok], [data-testid=sistema-avisos]').count()) === 1,
    'sistema: resumen “todo en orden” o lista de avisos',
  );

  // ─────────────── Fase 9 · Panel: búsqueda, ficha de usuario y detalle de pedido ───────────────
  await boss.goto(`${ADMIN}/buscar?q=Luis`, { waitUntil: 'networkidle' });
  await boss.click('[data-testid=resultado]:has-text("Luis Quispe")');
  await boss.waitForURL(`**/usuarios/${luisId}`);
  check(
    (await boss.isVisible('text=/Gasfitero \\(Aprobada · en observación\\)/')) &&
      (await boss.isVisible(
        '[data-testid=llegadas-incumplidas]:has-text("Llegadas incumplidas en 30 días: 1")',
      )) &&
      (await boss.isVisible('text=/Pidió pagar o coordinar fuera de la app · Revisado/')),
    'la ficha del profesional muestra oficios, faltas y reportes con texto legible',
  );
  const debtRow = boss.locator('tr:has-text("e2e:deuda")');
  await debtRow
    .locator('[aria-label="Motivo de la reversión"]')
    .fill('Deuda cargada por error en la prueba.');
  await debtRow.locator('button:has-text("Revertir")').click();
  // Al revertir, el formulario se reemplaza por “Revertido” en la misma fila.
  await debtRow.locator('text=Revertido').waitFor();
  check(
    sql(
      `select count(*) from public.wallet_entries where professional_id = '${luisId}' and type = 'reversal'`,
    ) === '1',
    'el admin revierte un asiento del libro (sin borrarlo)',
  );
  await boss.goto(`${ADMIN}/usuarios/22222222-2222-2222-2222-222222222222`, {
    waitUntil: 'networkidle',
  });
  await boss.fill('[aria-label="Motivo"]', 'Prueba de suspensión');
  await boss.click('button:has-text("Suspender cuenta")');
  await boss.waitForSelector('text=Cuenta suspendida.');
  check(
    sql(
      `select (suspended_at is not null)::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'`,
    ) === 'true',
    'el admin suspende una cuenta con motivo',
  );
  await boss.reload({ waitUntil: 'networkidle' });
  await boss.fill('[aria-label="Motivo"]', 'Fin de la prueba');
  await boss.click('button:has-text("Levantar suspensión")');
  await boss.waitForSelector('text=Suspensión levantada.');
  check(
    sql(
      `select (suspended_at is null)::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'`,
    ) === 'true',
    'y levanta la suspensión',
  );
  await boss.goto(`${ADMIN}/pedidos/${job2}`, { waitUntil: 'networkidle' });
  check(
    (await boss.isVisible('text=/Estado Cancelado/')) && (await boss.isVisible('text=/No llegó/')),
    'el detalle del pedido muestra el estado y la oferta de quien no llegó',
  );

  // ─────────────── Fase 9 · Panel: sospecha de bypass (detección real) ───────────────
  // Pedro se queda quieto en el domicilio del pedido cancelado más de 15 minutos.
  sql(`update public.jobs set cancelled_at = now() - interval '25 minutes' where id = '${job2}'`);
  sql(
    `insert into public.pro_presence (pro_id, online, radius_m, last_point, still_since)
     select '22222222-2222-2222-2222-222222222222', true, 5000, approx_point, now() - interval '26 minutes' from public.jobs where id = '${job2}'
     on conflict (pro_id) do update set last_point = excluded.last_point, still_since = excluded.still_since`,
  );
  check(
    sql('select private.detect_bypass()') === '1',
    'el antifraude detecta al pro quieto en el domicilio',
  );
  await admin.goto(`${ADMIN}/sospechas`, { waitUntil: 'networkidle' });
  const suspicion = admin.locator('[data-testid=sospecha]:has-text("Pedro")');
  await suspicion.waitFor();
  await suspicion.locator('button:has-text("Descartar")').click();
  await suspicion.locator('text=Escribe una nota.').waitFor();
  await suspicion
    .locator('[aria-label="Nota de la revisión"]')
    .fill('Esperaba un taxi en la puerta.');
  await suspicion.locator('button:has-text("Descartar")').click();
  await admin.waitForURL('**/sospechas?hecho=descartada');
  check(
    sql(`select status from public.bypass_suspicions where job_id = '${job2}'`) === 'dismissed',
    'soporte descarta la sospecha con nota',
  );

  // ─────────────── Fase 8 · Contactos, SOS y eliminar cuenta ───────────────
  await client.goto(`${MOBILE}/ajustes/contactos`, { waitUntil: 'networkidle' });
  await client.fill('[aria-label="Nombre del contacto"]', 'Mamá');
  await client.fill('[aria-label="Celular del contacto"]', '911 111 111');
  await client.fill('[aria-label="Relación"]', 'mamá');
  await client.click('text=Agregar contacto');
  await client.waitForSelector('[data-testid=contacto]:has-text("Mamá")');
  ok('agrega un contacto de confianza');

  await client.goto(`${MOBILE}/sos`, { waitUntil: 'networkidle' });
  await client.waitForSelector('text=Avisaremos a soporte y a tus contactos de confianza.');
  ok('SOS: cuenta regresiva con opción de cancelar');
  await client.waitForSelector('text=Soporte ya recibió tu alerta', { timeout: 15000 });
  check(await client.isVisible('text=Mamá'), 'muestra a quién avisar');
  const carlaId = '11111111-1111-1111-1111-111111111111';
  check(
    sql(`select status from public.sos_alerts where user_id = '${carlaId}'`) === 'open',
    'la alerta queda abierta para soporte',
  );
  await admin.goto(`${ADMIN}/sos`, { waitUntil: 'networkidle' });
  await admin.waitForSelector('[data-testid=alerta-sos]:has-text("Carla Cliente")');
  check(
    await admin.isVisible('text=Ver ubicación en el mapa'),
    'soporte ve la alerta con ubicación',
  );
  await admin.fill('[aria-label="Nota de cierre"]', 'Llamamos a Carla: todo bien.');
  await admin.click('text=Cerrar alerta');
  await admin.waitForSelector('text=Alerta cerrada con nota.');
  check(
    sql(`select status || '|' || note from public.sos_alerts where user_id = '${carlaId}'`) ===
      'closed|Llamamos a Carla: todo bien.',
    'soporte cierra la alerta con nota',
  );

  // ─────────────── Fase 8 · Ayuda: plazo de respuesta y respuesta de soporte ───────────────
  await client.goto(`${MOBILE}/ajustes/ayuda`, { waitUntil: 'networkidle' });
  await client.fill('[aria-label="Asunto"]', 'No veo mi pedido anterior');
  await client.fill(
    '[aria-label="Describe el problema"]',
    'Ayer hice un pedido y ya no aparece en mi inicio.',
  );
  await client.click('text=Enviar');
  await client.waitForSelector('text=Te respondemos aquí en menos de 8 h.');
  check(
    await client.isVisible(
      '[data-testid=ticket]:has-text("No veo mi pedido anterior") >> text=/Te respondemos en menos de/',
    ),
    'el usuario envía una consulta y ve en cuánto le responden',
  );
  await admin.goto(`${ADMIN}/soporte`, { waitUntil: 'networkidle' });
  const ticket = admin.locator('[data-testid=ticket]:has-text("No veo mi pedido anterior")');
  await ticket.waitFor();
  check(
    await ticket.locator('[data-testid=plazo-ticket]:has-text("Vence en")').isVisible(),
    'soporte ve el plazo del ticket',
  );
  await ticket
    .locator('[aria-label="Respuesta para el usuario"]')
    .fill('Lo revisamos: el pedido se canceló porque cambiaste de profesional.');
  await ticket.locator('button:has-text("Responder") >> nth=0').click();
  await ticket.locator('text=Respuesta enviada.').waitFor();
  check(
    sql(`select status from public.support_tickets where subject = 'No veo mi pedido anterior'`) ===
      'answered',
    'soporte responde el ticket',
  );
  await client.reload({ waitUntil: 'networkidle' });
  await client.waitForSelector('[data-testid=ticket] >> text=Respuesta de soporte');
  ok('el usuario ve la respuesta en la app');

  await client.goto(`${MOBILE}/ajustes`, { waitUntil: 'networkidle' });
  await client.waitForSelector('text=1 de 3');
  await client.click('text=Eliminar cuenta');
  await client.waitForURL('**/ingreso');
  check(
    sql(
      `select (deleted_at is not null)::text || '|' || coalesce(full_name, '') from public.profiles where id = '${carlaId}'`,
    ) === 'true|',
    'elimina su cuenta desde la app y el perfil queda anonimizado',
  );
  check(
    sql(`select coalesce(phone, '') from auth.users where id = '${carlaId}'`) === '',
    'la cuenta de acceso queda sin teléfono',
  );
  check(
    sql(`select count(*) from public.trusted_contacts where user_id = '${carlaId}'`) === '0',
    'se borran sus contactos',
  );
  await client.goto(`${MOBILE}/inicio`);
  await client.waitForURL('**/ingreso');
  ok('sin sesión, las rutas protegidas vuelven al ingreso');

  // La limpieza la hace la Edge Function storage-cleanup con pg_cron; aquí se consulta la misma
  // función que usa para contar huérfanos (solo el servidor puede llamarla).
  const orphans = Number(sql(`select count(*) from public.storage_orphans()`));
  check(
    Number.isInteger(orphans) &&
      orphans >= 0 &&
      sql(`select count(*) from cron.job where jobname = 'storage-cleanup'`) === '1',
    'la limpieza de Storage está programada y cuenta huérfanos (modo prueba)',
  );

  // ─────────────── Fase 3 · Cerrar sesión ───────────────
  await pro.goto(`${MOBILE}/ajustes`);
  await pro.click('text=Cerrar sesión');
  await pro.waitForURL('**/ingreso');
  await pro.goto(`${MOBILE}/solicitudes`);
  await pro.waitForURL('**/ingreso');
  ok('cerrar sesión y rutas protegidas → /ingreso');

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
