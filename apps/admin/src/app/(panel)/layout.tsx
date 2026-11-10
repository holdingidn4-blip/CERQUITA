import { maskPhone } from '@cerquita/shared';
import Link from 'next/link';

import { createClient, requireStaff } from '@/lib/supabase/server';

import { signOut } from '../actions';
import styles from './panel.module.css';

const STAFF_LABELS = { reviewer: 'Revisor', support: 'Soporte', admin: 'Administrador' } as const;

export default async function PanelLayout({ children }: LayoutProps<'/'>) {
  const staff = await requireStaff();
  const supabase = await createClient();
  const { count } = await supabase
    .from('pro_trades')
    .select('id', { count: 'exact', head: true })
    .in('status', ['submitted', 'in_review']);
  const { data: me } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', staff.userId)
    .maybeSingle();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Cerquita · Admin</div>
        <nav className={styles.nav} aria-label="Secciones">
          <Link href="/verificacion" className={styles.navItem}>
            Verificación <span className={styles.count}>{count ?? 0}</span>
          </Link>
          <span className={`${styles.navItem} ${styles.navSoon}`} title="Fase 7">
            Constancias
          </span>
          <span className={`${styles.navItem} ${styles.navSoon}`} title="Fase 8">
            Alertas SOS
          </span>
          <span className={`${styles.navItem} ${styles.navSoon}`} title="Fase 7">
            Parámetros
          </span>
        </nav>
        <div className={styles.me}>
          <span>
            {STAFF_LABELS[staff.staffRole]}: {me?.full_name ?? maskPhone(staff.phone)}
          </span>
          <form action={signOut}>
            <button className={styles.signOut}>Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
