import { signOut } from '../actions';
import styles from '../login/login.module.css';

export default function NoAutorizado() {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1>Sin acceso</h1>
        <p className={styles.muted}>
          Tu cuenta no tiene un rol de soporte. Si deberías tenerlo, pide a un administrador que te
          lo asigne y vuelve a ingresar.
        </p>
        <form action={signOut}>
          <button className={styles.button}>Cerrar sesión</button>
        </form>
      </section>
    </main>
  );
}
