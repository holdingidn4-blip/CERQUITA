import {
  dayLabel,
  formatDuration,
  formatShare,
  METRIC_WINDOWS,
  metricWindow,
  type PilotMetrics,
} from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';
import { DailyChart } from './daily-chart';
import m from './metricas.module.css';

export const metadata: Metadata = { title: 'Métricas · Cerquita Panel' };

function Tile({
  label,
  value,
  sub,
  id,
}: {
  label: string;
  value: string;
  sub: string;
  id: string;
}) {
  return (
    <div className={m.tile} data-testid={id}>
      <span className={m.tileLabel}>{label}</span>
      <span className={m.tileValue}>{value}</span>
      <span className={m.tileSub}>{sub}</span>
    </div>
  );
}

export default async function Metricas({ searchParams }: PageProps<'/metricas'>) {
  const { dias } = await searchParams;
  const days = metricWindow(dias);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pilot_metrics', { p_days: days });

  const header = (
    <>
      <h1 className={styles.h1}>Métricas del piloto</h1>
      <nav className={m.filters} aria-label="Periodo">
        {METRIC_WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/metricas?dias=${w}`}
            className={m.filter}
            aria-current={w === days ? 'page' : undefined}
          >
            Últimos {w} días
          </Link>
        ))}
      </nav>
    </>
  );
  if (error || !data) {
    return (
      <>
        {header}
        <p role="alert" className={styles.muted}>
          No se pudieron cargar las métricas. Vuelve a intentarlo en un momento.
        </p>
      </>
    );
  }

  const metrics = data as unknown as PilotMetrics;
  const t = metrics.totals;
  const daily = metrics.daily ?? [];
  const period = `${dayLabel(metrics.from)} al ${dayLabel(metrics.to)}`;

  return (
    <>
      {header}
      <p className={styles.muted}>Del {period} · hora de Lima · todos los oficios</p>
      <section className={m.tiles} aria-label="Resumen del periodo">
        <Tile
          id="m-publicados"
          label="Pedidos publicados"
          value={String(t.published)}
          sub={period}
        />
        <Tile
          id="m-con-oferta"
          label="Recibieron oferta"
          value={formatShare(t.with_offer, t.published)}
          sub={`${t.with_offer} de ${t.published}`}
        />
        <Tile
          id="m-contratados"
          label="Contratados"
          value={formatShare(t.hired, t.published)}
          sub={`${t.hired} de ${t.published}`}
        />
        <Tile
          id="m-primera-oferta"
          label="Primera oferta (mediana)"
          value={formatDuration(t.median_first_offer_min)}
          sub={
            t.p90_first_offer_min === null
              ? 'Aún no hay ofertas'
              : t.p90_first_offer_min < 1
                ? '9 de cada 10 en menos de 1 min'
                : `9 de cada 10 en ${formatDuration(t.p90_first_offer_min)} o menos`
          }
        />
        <Tile
          id="m-terminados"
          label="Terminados"
          value={String(t.completed)}
          sub={`${formatShare(t.completed, t.published)} de los publicados`}
        />
        <Tile
          id="m-cancelados"
          label="Cancelados"
          value={String(t.cancelled)}
          sub={`${formatShare(t.cancelled, t.published)} de los publicados`}
        />
      </section>

      <section className={m.card} aria-labelledby="t-por-dia">
        <h2 id="t-por-dia" className={m.h2}>
          Pedidos publicados por día
        </h2>
        <p className={m.note}>Pasa el cursor o usa Tab sobre un día para ver el detalle.</p>
        {t.published === 0 && <p className={m.note}>Todavía no hay pedidos en este periodo.</p>}
        <DailyChart daily={daily} />
        <details className={m.tableWrap}>
          <summary>Ver la tabla por día</summary>
          <table className={styles.table} data-testid="tabla-metricas">
            <thead>
              <tr>
                <th>Día</th>
                <th>Publicados</th>
                <th>Con oferta</th>
                <th>Contratados</th>
                <th>Terminados</th>
                <th>Cancelados</th>
                <th>Primera oferta</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  <td className={m.num}>{d.published}</td>
                  <td className={m.num}>{d.with_offer}</td>
                  <td className={m.num}>{d.hired}</td>
                  <td className={m.num}>{d.completed}</td>
                  <td className={m.num}>{d.cancelled}</td>
                  <td className={m.num}>{formatDuration(d.median_first_offer_min)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <p className={m.note}>
        <strong>Contratado:</strong> el cliente aceptó una oferta, aunque después el profesional no
        llegara o se cancelara. <strong>Primera oferta:</strong> tiempo desde que se publicó el
        pedido hasta la primera cotización (mediana: la mitad de los pedidos la recibió en ese
        tiempo o menos).
      </p>
    </>
  );
}
