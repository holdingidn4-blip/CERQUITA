import {
  ageOn,
  BACKGROUND_RESULT_LABELS,
  DOCUMENT_LABELS,
  formatClock,
  maskPhone,
  observationProgress,
  PRO_SPECIALTY_STATUS_LABELS,
  PRO_TRADE_STATUS_LABELS,
  proTradeView,
  RISK_HELP,
  RISK_LABELS,
} from '@cerquita/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCase } from '@/lib/verification';

import styles from '../../panel.module.css';
import { ActionForm } from '../../_components/action-form';
import { decideSpecialty } from '../actions';
import { ReviewForm } from './review-form';

const SPECIALTY_TONE = {
  included: 'info',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const;

export default async function Caso({ params }: PageProps<'/verificacion/[id]'>) {
  const { id } = await params;
  // Al abrir el caso, un oficio "enviado" pasa a "en revisión" (idempotente).
  const supabase = await createClient();
  await supabase.rpc('review_pro_trade', { p_pro_trade: id, p_decision: 'start' });
  const data = await getCase(id);
  if (!data) notFound();
  const risky = data.specialties.filter((s) => s.requiresReview || s.status !== 'included');

  const view = proTradeView({
    status: data.status,
    tradeName: data.tradeName,
    ratingsForFull: data.ratingsForFull,
    reason: data.reason,
  });
  const pending = data.status === 'submitted' || data.status === 'in_review';
  const history = data.otherTrades
    .map((t) => {
      const v = proTradeView({
        status: t.status,
        tradeName: t.tradeName,
        ratingsForFull: data.ratingsForFull,
        reason: null,
      });
      return `${t.tradeName} ${v.label.toLowerCase()}${t.status === 'approved_observation' ? ` (${observationProgress(t.goodRatings, data.ratingsForFull)})` : ''}`;
    })
    .join(' · ');

  return (
    <>
      <Link href="/verificacion" className={styles.back}>
        ← Cola por oficio
      </Link>
      <header className={styles.caseHeader}>
        <div>
          <h1 className={styles.h1}>
            {data.proName} · {data.tradeName}
          </h1>
          <p className={styles.muted}>
            {maskPhone(data.proPhone)}
            {history && ` · ${history}`}
          </p>
        </div>
        <span className={styles.badge} data-tone={view.tone}>
          {view.label}
        </span>
      </header>
      {data.reason && <p className={styles.muted}>Motivo anterior: “{data.reason}”</p>}

      <section className={styles.section}>
        <h2>Datos y oficio</h2>
        <dl className={styles.factList}>
          <dt>Riesgo</dt>
          <dd>
            {RISK_LABELS[data.risk]}: {RISK_HELP[data.risk]}
          </dd>
          <dt>DNI</dt>
          <dd data-testid="dni-datos">
            {data.identityData
              ? `${data.identityData.dni} · nació el ${data.identityData.birthDate.split('-').reverse().join('/')} · ${ageOn(data.identityData.birthDate, new Date(data.updatedAt))} años ${ageOn(data.identityData.birthDate, new Date(data.updatedAt)) >= 18 ? '(mayor de edad ✓)' : '(MENOR DE EDAD)'}`
              : 'Sin datos del DNI'}
          </dd>
          <dt>Trabajos</dt>
          <dd>{data.specialties.map((s) => s.name).join(', ') || 'Ninguno'}</dd>
          <dt>Antecedentes</dt>
          <dd data-testid="antecedentes-resultado">
            {data.background
              ? `${BACKGROUND_RESULT_LABELS[data.background.result]} (revisado)`
              : 'Por revisar con el certificado'}
          </dd>
        </dl>
        <p className={styles.muted}>Compara los datos con la foto del DNI antes de aprobar.</p>
      </section>

      {risky.length > 0 && (
        <section className={styles.section} data-testid="trabajos-riesgo">
          <h2>Trabajos de riesgo (se aprueban uno por uno)</h2>
          <p className={styles.muted}>
            Aprobar el oficio no aprueba estos trabajos: cada uno necesita tu decisión. Sin
            aprobación, el profesional no ve ni recibe pedidos de ese trabajo.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Trabajo</th>
                <th>Estado</th>
                <th>Decisión</th>
              </tr>
            </thead>
            <tbody>
              {risky.map((s) => (
                <tr key={s.id} data-testid="trabajo-riesgo">
                  <td>{s.name}</td>
                  <td>
                    <span className={styles.badge} data-tone={SPECIALTY_TONE[s.status]}>
                      {PRO_SPECIALTY_STATUS_LABELS[s.status]}
                    </span>
                    {s.reason && <div className={styles.muted}>Motivo: “{s.reason}”</div>}
                  </td>
                  <td>
                    <ActionForm
                      action={decideSpecialty.bind(null, data.id, s.id)}
                      placeholder="Motivo si rechazas"
                      buttons={[
                        { name: 'decision', value: 'approve', label: 'Aprobar', tone: 'primary' },
                        { name: 'decision', value: 'reject', label: 'Rechazar', tone: 'danger' },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className={styles.section}>
        <h2>Identidad</h2>
        <ul className={styles.docs}>
          {data.identity.map(({ kind, doc }) => (
            <li key={kind} className={styles.doc}>
              <span>{DOCUMENT_LABELS[kind]}</span>
              {doc ? (
                <a
                  href={`/documentos/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.docLink}
                >
                  Ver
                </a>
              ) : (
                <span className={styles.missing}>Falta</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Evidencia del oficio</h2>
        {data.evidence.length === 0 ? (
          <p className={styles.muted}>Sin evidencia.</p>
        ) : (
          <ul className={styles.docs}>
            {data.evidence.map((doc, i) => (
              <li key={doc.id} className={styles.doc}>
                <span>
                  {DOCUMENT_LABELS[doc.kind]} {i + 1}
                  {doc.description &&
                    !doc.description.startsWith('Subido desde la galería') &&
                    ` · “${doc.description}”`}
                  {doc.durationSeconds !== null && ` · ${formatClock(doc.durationSeconds)} min`}
                  {doc.description?.startsWith('Subido desde la galería') && (
                    <>
                      {' '}
                      <span
                        className={styles.badge}
                        data-tone="warning"
                        data-testid="video-galeria"
                      >
                        No se grabó en la app: revisar que sea reciente y de la persona
                      </span>
                    </>
                  )}
                </span>
                <a
                  href={`/documentos/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.docLink}
                >
                  Ver
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.rule}>
          Regla por riesgo: alto = fotos + certificado técnico; confianza = 2 referencias; habilidad
          = 3 a 5 fotos con descripción. Todos: DNI, selfie, antecedentes, especialidad y video. Al
          aprobar entra “en observación” hasta {data.ratingsForFull} calificaciones de 4★ o más.
        </p>
        {data.missing.length > 0 && (
          <p className={styles.missing}>Falta: {data.missing.join(', ')}</p>
        )}
      </section>

      <section className={styles.section}>
        <h2>Historial</h2>
        <ol className={styles.timeline} data-testid="historial">
          {data.events.map((e) => (
            <li key={e.id}>
              {new Date(e.at).toLocaleString('es-PE', {
                timeZone: 'America/Lima',
                dateStyle: 'short',
                timeStyle: 'short',
              })}{' '}
              · {e.from ? `${PRO_TRADE_STATUS_LABELS[e.from]} → ` : ''}
              {PRO_TRADE_STATUS_LABELS[e.to]} · {e.actor ?? 'sistema'}
              {e.reason && ` · “${e.reason}”`}
            </li>
          ))}
        </ol>
      </section>

      {pending ? (
        <ReviewForm id={data.id} canApprove={data.missing.length === 0} />
      ) : (
        <p className={styles.muted}>Este oficio ya fue revisado.</p>
      )}
      <p className={styles.footnote}>
        Cada vista de DNI y antecedentes queda registrada con fecha y revisor.
      </p>
    </>
  );
}
