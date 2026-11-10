// Asigna o quita un rol de soporte a un usuario por su celular.
// Uso: pnpm --filter @cerquita/admin staff:set +51987654321 reviewer|support|admin|none
// Requiere SUPABASE_SERVICE_ROLE_KEY en apps/admin/.env.local (nunca la subas al repo).
import { createClient } from '@supabase/supabase-js';

const [, , rawPhone, role] = process.argv;
const roles = ['reviewer', 'support', 'admin', 'none'];
if (!rawPhone || !roles.includes(role)) {
  console.error('Uso: staff:set <celular> <reviewer|support|admin|none>');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const phone = rawPhone.replace(/\D/g, '').replace(/^(9\d{8})$/, '51$1');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: profile, error: findError } = await supabase
  .from('profiles')
  .select('id')
  .eq('phone', phone)
  .maybeSingle();
if (findError || !profile) {
  console.error(
    `No hay una cuenta con el celular ${phone}. La persona debe ingresar una vez en la app.`,
  );
  process.exit(1);
}
const { error } = await supabase.rpc('set_staff_role', {
  p_user: profile.id,
  p_role: role === 'none' ? null : role,
});
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Listo: ${phone} → ${role}. Debe volver a ingresar para que el cambio aplique.`);
