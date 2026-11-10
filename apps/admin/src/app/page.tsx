import { colors } from '@cerquita/shared';
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

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 style={{ color: colors.primary }}>Cerquita</h1>
        <p>Panel de soporte</p>
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
