import { colors, maskPhone } from '@cerquita/shared';

import { requireStaff } from '@/lib/supabase/server';

import { signOut } from './actions';
import styles from './page.module.css';

const sections = [
  {
    title: 'Cola de verificación',
    description: 'Aprobar, pedir datos o rechazar oficios con motivo.',
    phase: 4,
  },
  {
    title: 'Constancias de pago',
    description: 'Revisar Yape, Plin y transferencias de comisión.',
    phase: 7,
  },
  { title: 'Alertas SOS', description: 'Atender y cerrar alertas con nota.', phase: 8 },
  { title: 'Parámetros', description: 'Tasa, límite, días de gracia y promoción.', phase: 7 },
];

const STAFF_LABELS = { reviewer: 'Revisor', support: 'Soporte', admin: 'Administrador' } as const;

export default async function Home() {
  const staff = await requireStaff();
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1 style={{ color: colors.primary }}>Cerquita</h1>
          <p>Panel de soporte</p>
        </div>
        <div className={styles.session}>
          <span>
            {STAFF_LABELS[staff.staffRole]} · {maskPhone(staff.phone)}
          </span>
          <form action={signOut}>
            <button className={styles.signOut}>Cerrar sesión</button>
          </form>
        </div>
      </header>
      <section className={styles.grid}>
        {sections.map((section) => (
          <article key={section.title} className={styles.card}>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
            <span className={styles.badge}>Fase {section.phase}</span>
          </article>
        ))}
      </section>
    </main>
  );
}
