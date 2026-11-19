'use client';

import { dayLabel, formatDuration, niceTicks, type PilotDay } from '@cerquita/shared';
import { useState } from 'react';

import m from './metricas.module.css';

const W = 880;
const H = 240;
const PAD = { top: 20, right: 8, bottom: 28, left: 36 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BASE = PAD.top + PLOT_H;

/** Columna con 4 px redondeados arriba y base recta. */
function columnPath(x: number, top: number, width: number): string {
  const r = Math.min(4, width / 2, BASE - top);
  return `M${x},${BASE}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${BASE}Z`;
}

function describe(d: PilotDay): string {
  const first =
    d.median_first_offer_min === null
      ? 'sin ofertas'
      : `primera oferta en ${formatDuration(d.median_first_offer_min)} (mediana)`;
  return `${dayLabel(d.day)}: ${d.published} publicados, ${d.with_offer} con oferta, ${d.hired} contratados, ${d.completed} terminados, ${d.cancelled} cancelados; ${first}`;
}

/** Pedidos publicados por día: una serie, detalle por barra al pasar el cursor o con Tab. */
export function DailyChart({ daily }: { daily: PilotDay[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...daily.map((d) => d.published));
  const ticks = niceTicks(max);
  const top = ticks.at(-1) ?? 1;
  const band = PLOT_W / Math.max(1, daily.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => BASE - (v / top) * PLOT_H;
  const labelEvery = Math.ceil(daily.length / 8);
  const peak = max > 0 ? daily.map((d) => d.published).lastIndexOf(max) : -1;
  const shown = active === null ? null : daily[active];

  return (
    <div className={m.chartWrap}>
      <svg
        className={m.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label="Pedidos publicados por día"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className={m.grid} x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className={m.axisText} x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {daily.map((d, i) => {
          const cx = PAD.left + band * i + band / 2;
          const labelled = (daily.length - 1 - i) % labelEvery === 0;
          return (
            <g key={d.day}>
              {d.published > 0 && (
                <path
                  className={i === active ? m.barActive : m.bar}
                  d={columnPath(cx - barW / 2, y(d.published), barW)}
                />
              )}
              {i === peak && (
                <text className={m.valueText} x={cx} y={y(d.published) - 6} textAnchor="middle">
                  {d.published}
                </text>
              )}
              {labelled && (
                <text className={m.axisText} x={cx} y={H - 8} textAnchor="middle">
                  {dayLabel(d.day)}
                </text>
              )}
              <rect
                className={m.hit}
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={PLOT_H}
                tabIndex={0}
                role="img"
                aria-label={describe(d)}
                data-testid={`dia-${d.day}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
      </svg>
      {shown && active !== null && (
        <Tooltip
          day={shown}
          x={(PAD.left + band * active + band / 2) / W}
          top={y(shown.published) / H}
        />
      )}
    </div>
  );
}

function Tooltip({ day, x, top }: { day: PilotDay; x: number; top: number }) {
  // Cerca de los bordes el globo se apoya hacia adentro para no salirse del panel.
  const shift = x < 0.15 ? '0%' : x > 0.85 ? '-100%' : '-50%';
  return (
    <div
      className={m.tooltip}
      role="status"
      style={{
        left: `${x * 100}%`,
        top: `calc(${top * 100}% - 10px)`,
        transform: `translate(${shift}, -100%)`,
      }}
    >
      <span className={m.tooltipDay}>{dayLabel(day.day)}</span>
      <span>
        <i className={m.key} aria-hidden />
        <strong>{day.published}</strong> publicados
      </span>
      <span>
        <strong>{day.with_offer}</strong> con oferta · <strong>{day.hired}</strong> contratados
      </span>
      <span>
        <strong>{day.completed}</strong> terminados · <strong>{day.cancelled}</strong> cancelados
      </span>
      <span>
        Primera oferta: <strong>{formatDuration(day.median_first_offer_min)}</strong>
      </span>
    </div>
  );
}
