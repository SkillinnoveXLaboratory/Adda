import { useEffect, useRef } from 'react';
import { ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, LinearScale, Tooltip } from 'chart.js';
import { cx, Icon } from './ui.jsx';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, DoughnutController, ArcElement);
Chart.defaults.font.family = 'Poppins, sans-serif';

export const SERIES = { purple: '#705ec8', cyan: '#01b8ff', green: '#2dce89', orange: '#ff5b51', amber: '#fbbf24', blue: '#1170e4', gray: '#cbd5e1' };

/**
 * Dual bar chart styled exactly like template.html "Sales activity":
 * barThickness 6, borderRadius 2, purple + cyan, light grid, Poppins 10px ticks, legend hidden (custom legend).
 */
export function BarChart({ labels, datasets, formatValue = (v) => v, height = 'h-80', ariaLabel }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    chartRef.current = new Chart(ref.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((d) => ({ label: d.label, data: d.data, backgroundColor: d.color, borderRadius: 2, barThickness: 6, maxBarThickness: 6 })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: '#2c2c2c',
            titleFont: { family: 'Poppins', size: 11, weight: '600' },
            bodyFont: { family: 'Poppins', size: 11 },
            padding: 10,
            cornerRadius: 8,
            callbacks: { label: (c) => ` ${c.dataset.label}: ${formatValue(c.parsed.y, true)}` },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, family: 'Poppins' }, color: '#9ba2b7' } },
          y: {
            beginAtZero: true,
            grid: { color: '#f1f3f8' },
            border: { display: false },
            ticks: { font: { size: 10, family: 'Poppins' }, color: '#9ba2b7', maxTicksLimit: 6, callback: (v) => formatValue(v, false) },
          },
        },
      },
    });
    return () => chartRef.current?.destroy();
    // Chart is rebuilt when data changes (small datasets; keeps code simple and glitch-free).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(labels), JSON.stringify(datasets.map((d) => d.data))]);
  return (
    <div className={cx('relative', height)}>
      <canvas ref={ref} role="img" aria-label={ariaLabel} />
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function DoughnutChart({ labels, data, colors, size = 160, centerLabel, centerValue }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const c = new Chart(ref.current.getContext('2d'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '74%',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#2c2c2c', bodyFont: { family: 'Poppins', size: 11 }, padding: 8, cornerRadius: 8 } },
      },
    });
    return () => c.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(labels), JSON.stringify(data)]);
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <canvas ref={ref} role="img" aria-label={centerLabel} />
      {centerLabel && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-gray-800">{centerValue}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{centerLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Sparkline path from real values (0..100 x, 5..35 y in a 100×40 viewBox). */
export function sparkPath(values) {
  const v = (values || []).map(Number).filter((n) => Number.isFinite(n));
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((n, i) => [(i / (v.length - 1)) * 100, 35 - ((n - min) / span) * 30]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx1 = x0 + (x1 - x0) / 2;
    d += ` C${cx1.toFixed(1)} ${y0.toFixed(1)}, ${cx1.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/**
 * Gradient metric card (template "TOP 4 METRIC GRADIENT CARDS").
 * The sparkline is drawn only from a real series; otherwise a faint icon fills that slot.
 */
export function MetricCard({ tone = 'purple', label, value, footer, footerIcon, series, icon, onClick, title, testId }) {
  const path = sparkPath(series);
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={cx(`bg-grad-${tone}`, 'metric-card relative flex min-w-0 justify-between gap-3 overflow-hidden rounded-xl p-5 text-left text-white shadow-sm', onClick && 'transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70')}
    >
      <div className="flex min-w-0 flex-col justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-snug text-white/80">{label}</p>
          <h2 className="mt-1 truncate text-2xl font-bold" data-testid={testId ? `${testId}-value` : undefined}>
            {value}
          </h2>
        </div>
        {footer && (
          <div className="mt-4 text-[11px] leading-snug text-white/90">
            {footerIcon && <Icon name={footerIcon} className="mr-1 text-[10px]" />}
            <span className="opacity-90">{footer}</span>
          </div>
        )}
      </div>
      <div className="metric-slot flex h-16 w-16 shrink-0 items-center justify-center self-center 2xl:w-24">
        {path ? (
          <svg className="h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <path d={path} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 2xl:h-12 2xl:w-12">
            <Icon name={icon || 'fa-solid fa-chart-simple'} className="text-lg text-white/90" />
          </span>
        )}
      </div>
    </Comp>
  );
}

const CIRCLES = ['bg-azea-purple', 'bg-emerald-500', 'bg-amber-400', 'bg-blue-500', 'bg-rose-500'];
/** "Recent activity" numbered-circle list from the template. */
export function ActivityList({ items }) {
  return (
    <ol className="space-y-4">
      {items.map((it, i) => (
        <li key={it.key ?? i}>
          <div
            role={it.onClick ? 'button' : undefined}
            tabIndex={it.onClick ? 0 : undefined}
            onClick={it.onClick}
            onKeyDown={it.onClick ? (e) => e.key === 'Enter' && it.onClick() : undefined}
            className={cx('flex items-start justify-between gap-2', it.onClick && '-mx-2 cursor-pointer rounded-lg px-2 py-1 hover:bg-gray-50')}
          >
            <div className="flex min-w-0 items-start space-x-3">
              <div className={cx('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', CIRCLES[i % CIRCLES.length])}>{i + 1}</div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-gray-700">
                  <span className="font-semibold">{it.title}</span>
                  {it.highlight && <span className={cx('ml-1', it.highlightClass || 'text-blue-500')}>{it.highlight}</span>}
                </p>
                {it.subtitle && <p className="mt-0.5 truncate text-[11px] text-gray-400">{it.subtitle}</p>}
              </div>
            </div>
            <span className="whitespace-nowrap pl-2 text-[11px] font-medium text-gray-400">{it.time}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
