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
const GEO = { latitude: -12.121, longitude: -77.031 };
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

  // ─────────────── Fase 4 · Registro del profesional ───────────────
  const pro = await phonePage();
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
    ) === 'POINT(-77.031 -12.121)',
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

  await admin.goto(`${ADMIN}/constancias`, { waitUntil: 'networkidle' });
  await admin.waitForSelector('text=OP-77812');
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

  const cleanup = execFileSync(
    'node',
    ['--env-file=.env.local', 'scripts/storage-cleanup.mjs', '--dry-run'],
    {
      cwd: join(dirname(FIXTURES), '..', 'apps', 'admin'),
      encoding: 'utf8',
    },
  );
  check(
    /archivos huérfanos encontrados/.test(cleanup),
    'la limpieza de Storage corre (modo prueba)',
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
