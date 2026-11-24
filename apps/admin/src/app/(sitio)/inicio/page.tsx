import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import styles from '../sitio.module.css';

export const metadata: Metadata = {
  title: 'Cerquita · Servicios del hogar en Huancayo',
  description:
    'Tú pones el precio y profesionales verificados por oficio te responden. Gasfiteros, electricistas, carpinteros y más, cerquita de ti.',
  robots: { index: true, follow: true },
};

// Enlace de descarga (Google Play o prueba cerrada): se define al publicar; mientras tanto, "próximamente".
const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? '';

/** Íconos de trazo simple (mismo estilo que la app). */
function Icon({ d }: { d: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
const I = {
  shield: 'M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z M9 12l2 2 4-4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6z',
  chat: 'M4 5h16v11H8l-4 4z',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z M12 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  sos: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 8v5 M12 16h.01',
  cap: 'M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5',
  coin: 'M12 3a9 9 0 100 18 9 9 0 000-18z M9 10h6 M9 14h6',
};

function Card({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <article className={styles.card}>
      <div className={styles.icon}>
        <Icon d={icon} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

/** Landing pública: llamada a la acción para clientes y profesionales, confianza y capacitaciones. */
export default function Inicio() {
  const download = DOWNLOAD_URL || '#empezar';
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={`${styles.wrap} ${styles.heroInner}`}>
          <nav className={styles.nav} aria-label="Cerquita">
            <a href="/inicio" className={styles.brand}>
              <span className={styles.logo}>
                <Icon d={I.pin} />
              </span>
              Cerquita
            </a>
          </nav>
          <span className={styles.kicker}>Piloto en Huancayo</span>
          <h1 className={styles.h1}>Servicios del hogar, cerquita de ti.</h1>
          <p className={styles.lead}>
            Tú pones el precio. Gasfiteros, electricistas, carpinteros y más, verificados por
            oficio, te responden desde tu zona. Pagas directo al terminar.
          </p>
          <div className={styles.ctas}>
            <a className={styles.ctaMain} href={download} data-testid="cta-cliente">
              Necesito un servicio
            </a>
            <a className={styles.ctaAlt} href="#profesionales" data-testid="cta-profesional">
              Soy profesional
            </a>
          </div>
          <div className={styles.pills}>
            <span>✓ Verificados por oficio</span>
            <span>✓ Sin adelantos</span>
            <span>✓ Pagas al terminar</span>
          </div>
        </div>
      </header>

      <main className={styles.wrap}>
        <section className={styles.section} aria-labelledby="como">
          <h2 id="como" className={styles.h2}>
            Así de simple
          </h2>
          <p className={styles.sub}>
            Pide en un minuto, compara y elige. Sin llamadas ni regateos.
          </p>
          <div className={styles.grid}>
            <Card icon={I.pin} title="1. Cuenta qué necesitas">
              Elige el oficio, describe el problema con una foto y pon tu precio dentro del
              tarifario de la ciudad.
            </Card>
            <Card icon={I.star} title="2. Compara y acepta">
              Ves el desglose (visita, mano de obra, materiales y movilidad), la calificación y el
              nivel de cada profesional. Aceptas con un botón.
            </Card>
            <Card icon={I.coin} title="3. Paga al terminar">
              Confirmas el trabajo con fotos de antes y después y pagas directo al profesional:
              efectivo, Yape o Plin.
            </Card>
          </div>
        </section>

        <section className={styles.section} id="confianza" aria-labelledby="conf">
          <h2 id="conf" className={styles.h2}>
            Confianza en cada visita
          </h2>
          <p className={styles.sub}>Cuidamos a clientes y profesionales por igual.</p>
          <div className={styles.grid}>
            <Card icon={I.shield} title="Verificación por oficio">
              Identidad con DNI y selfie, experiencia revisada por una persona y antecedentes en los
              oficios de mayor riesgo.
            </Card>
            <Card icon={I.star} title="Calificaciones de ida y vuelta">
              Cliente y profesional se califican solo después de un trabajo confirmado en la app.
            </Card>
            <Card icon={I.eye} title="Primer trabajo supervisado">
              Revisamos llegada, trato, que se haga lo acordado y la seguridad. También al azar en
              oficios de riesgo.
            </Card>
            <Card icon={I.chat} title="Tu número queda privado">
              Todo se conversa por el chat de la app. La dirección exacta solo la ve quien
              aceptaste.
            </Card>
            <Card icon={I.sos} title="Botón SOS">
              En un servicio en curso, una alerta avisa a soporte y a tus contactos de confianza.
            </Card>
          </div>
        </section>

        <section className={styles.section} id="profesionales" aria-labelledby="pros">
          <h2 id="pros" className={styles.h2}>
            ¿Eres profesional?
          </h2>
          <p className={styles.sub}>
            Recibe trabajos cerca de ti, cobra directo y crece con tu reputación.
          </p>
          <div className={styles.grid}>
            <Card icon={I.shield} title="Registro paso a paso">
              Seis pasos con ayuda en cada uno. Sin papeleo: fotos desde tu celular.
            </Card>
            <Card icon={I.coin} title="Comisión justa">
              10 % solo sobre la mano de obra. Los materiales no pagan comisión.
            </Card>
            <Card icon={I.star} title="Niveles y prioridad">
              Nuevo, Verificado, De confianza y Destacado. Más nivel, más arriba en las ofertas.
            </Card>
          </div>
        </section>

        <section className={styles.band} id="capacitaciones" aria-labelledby="cap">
          <div className={styles.icon}>
            <Icon d={I.cap} />
          </div>
          <h2 id="cap" className={styles.h2}>
            Capacitaciones
          </h2>
          <p className={styles.sub}>
            Charlas gratuitas por ciudad y oficio: seguridad, atención al cliente y buenas
            prácticas. Registras tu asistencia con un código o QR, respondes un cuestionario corto y
            recibes tu certificado y puntos que suben tu nivel.
          </p>
          <p className={styles.note}>
            Canje de premios: próximamente. Los puntos no se compran ni se cambian por dinero.
          </p>
        </section>

        <section className={styles.section} id="empezar" aria-labelledby="emp">
          <h2 id="emp" className={styles.h2}>
            Empieza hoy
          </h2>
          <p className={styles.sub}>
            {DOWNLOAD_URL
              ? 'Descarga la app e ingresa con tu número de celular.'
              : 'Muy pronto en Google Play. Durante el piloto en Huancayo, el equipo de Cerquita comparte el enlace de prueba.'}
          </p>
          <div className={`${styles.faq}`}>
            <details>
              <summary>¿Cuánto cuesta usar Cerquita?</summary>
              <p>
                Para clientes es gratis. El profesional paga 10 % de la mano de obra de los trabajos
                que hace por la app.
              </p>
            </details>
            <details>
              <summary>¿Cómo pago el servicio?</summary>
              <p>
                Directo al profesional al terminar: efectivo, Yape o Plin. Cerquita no recibe ese
                pago.
              </p>
            </details>
            <details>
              <summary>¿Qué pasa si el profesional no llega?</summary>
              <p>
                Pasada la tolerancia puedes elegir a otro profesional sin costo, y recibes un cupón
                que asume Cerquita.
              </p>
            </details>
          </div>
        </section>

        <footer className={styles.footer}>
          <p>
            Cerquita es una plataforma intermediaria: conecta clientes con profesionales
            independientes. La calidad del trabajo es responsabilidad del profesional; si hay un
            problema, repórtalo desde la app.
          </p>
          <p>© {new Date().getFullYear()} Cerquita · Huancayo, Perú</p>
        </footer>
      </main>
    </div>
  );
}
