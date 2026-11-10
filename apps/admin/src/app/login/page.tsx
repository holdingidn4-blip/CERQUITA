import type { Metadata } from 'next';

import { LoginForm } from './login-form';
import styles from './login.module.css';

export const metadata: Metadata = { title: 'Ingresar · Cerquita Panel' };

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1>Cerquita</h1>
        <p className={styles.muted}>Panel de soporte. Ingresa con tu celular registrado.</p>
        <LoginForm />
      </section>
    </main>
  );
}
