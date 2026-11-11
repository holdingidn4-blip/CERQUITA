// Crea (o actualiza) los usuarios iniciales de soporte por celular y les asigna su rol.
// Uso: ADMIN_PHONES=+519..., REVIEWER_PHONES=+519...,+519... node apps/admin/scripts/seed-staff.mjs
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. Ingresan luego con su SMS normal.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const list = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean);
const wanted = [
  ...list(process.env.ADMIN_PHONES).map((p) => [p, 'admin']),
  ...list(process.env.REVIEWER_PHONES).map((p) => [p, 'reviewer']),
];
if (wanted.length === 0) {
  console.error('Define ADMIN_PHONES y/o REVIEWER_PHONES (+519XXXXXXXX separados por coma)');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
for (const [raw, role] of wanted) {
  const phone = raw.startsWith('51') ? raw : `51${raw}`;
  if (!/^519\d{8}$/.test(phone)) {
    console.error(`✗ ${raw}: no es un celular peruano`);
    process.exitCode = 1;
    continue;
  }
  let { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (!profile) {
    const { data, error } = await supabase.auth.admin.createUser({
      phone: `+${phone}`,
      phone_confirm: true,
    });
    if (error) {
      console.error(`✗ ${phone}: ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    profile = { id: data.user.id };
  }
  const { error } = await supabase.rpc('set_staff_role', { p_user: profile.id, p_role: role });
  console.log(error ? `✗ ${phone}: ${error.message}` : `✓ ${phone} → ${role}`);
  if (error) process.exitCode = 1;
}
