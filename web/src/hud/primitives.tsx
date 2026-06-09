import type { ReactNode } from 'react';
import type { State, StepStatus } from './types';

export interface PanelProps {
  title?: string;
  state?: State;
  children: ReactNode;
  span?: 1 | 2 | 3;
}

export interface StatusPanelProps {
  label: string;
  value: string;
  state: State;
  hint?: string;
}

export interface ProgressBarProps {
  value: number;
  label?: string;
  state?: State;
  showPct?: boolean;
}

export interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  state?: State;
}

export interface StatProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  state?: State;
}

export interface StepsProps {
  steps: { name: string; status: StepStatus }[];
}

export interface ChartProps {
  kind: 'line' | 'bar' | 'area';
  data: { x: string | number; y: number }[];
  unit?: string;
  label?: string;
  state?: State;
}

export interface WaveformProps {
  samples: number[];
  label?: string;
  state?: State;
}

export interface AlertProps {
  severity: State;
  title: string;
  message?: string;
}

export interface BadgeProps {
  text: string;
  state?: State;
}

export interface KeyValueProps {
  items: { k: string; v: string }[];
}

const DEFAULT_STATE: State = 'info';

export function Panel({
  title,
  state = DEFAULT_STATE,
  children,
  span = 1,
}: PanelProps) {
  return (
    <section
      className={`hud-panel hud-state-${state} hud-panel--span-${span}`}
    >
      {title && <div className="hud-panel-title">{title}</div>}
      <div className="hud-panel-body">{children}</div>
    </section>
  );
}

export function StatusPanel({ label, value, state, hint }: StatusPanelProps) {
  return (
    <div className={`hud-status-panel hud-state-${state}`}>
      <div className="hud-label">{label}</div>
      <div className="hud-status-value">{value}</div>
      {hint && <div className="hud-hint">{hint}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  state = DEFAULT_STATE,
  showPct = false,
}: ProgressBarProps) {
  const normalized = toPercent(value);

  return (
    <div className={`hud-progress hud-state-${state}`}>
      {(label || showPct) && (
        <div className="hud-progress-head">
          {label && <span>{label}</span>}
          {showPct && <span>{Math.round(normalized)}%</span>}
        </div>
      )}
      <progress value={normalized} max={100} aria-label={label} />
    </div>
  );
}

export function Gauge({
  value,
  min = 0,
  max = 100,
  unit,
  label,
  state = DEFAULT_STATE,
}: GaugeProps) {
  const pct = normalize(value, min, max);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className={`hud-gauge hud-state-${state}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={label}>
        <circle className="hud-gauge-track" cx="60" cy="60" r={radius} />
        <circle
          className="hud-gauge-fill"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="hud-gauge-readout">
        <span>{value}</span>
        {unit && <small>{unit}</small>}
      </div>
      {label && <div className="hud-label">{label}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  delta,
  state = DEFAULT_STATE,
}: StatProps) {
  return (
    <div className={`hud-stat hud-state-${state}`}>
      <div className="hud-label">{label}</div>
      <div className="hud-stat-value">
        <span>{value}</span>
        {unit && <small>{unit}</small>}
      </div>
      {delta !== undefined && (
        <div className={`hud-delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
          {delta >= 0 ? '+' : ''}
          {delta}
        </div>
      )}
    </div>
  );
}

export function Steps({ steps }: StepsProps) {
  return (
    <ol className="hud-steps">
      {steps.map((step) => (
        <li key={`${step.name}-${step.status}`} className={`is-${step.status}`}>
          <span className="hud-step-dot" aria-hidden="true" />
          <span>{step.name}</span>
        </li>
      ))}
    </ol>
  );
}

export function Chart({
  kind,
  data,
  unit,
  label,
  state = DEFAULT_STATE,
}: ChartProps) {
  const points = chartPoints(data);

  return (
    <div className={`hud-chart hud-state-${state}`}>
      {(label || unit) && (
        <div className="hud-chart-head">
          {label && <span>{label}</span>}
          {unit && <span>{unit}</span>}
        </div>
      )}
      {points.length === 0 ? (
        <div className="hud-empty">No data</div>
      ) : (
        <svg viewBox="0 0 160 72" role="img" aria-label={label}>
          <path className="hud-chart-grid" d="M0 18 H160 M0 36 H160 M0 54 H160" />
          {kind === 'bar' ? (
            points.map((point, index) => (
              <rect
                key={`${point.x}-${point.y}-${index}`}
                className="hud-chart-bar"
                x={point.x - point.barWidth / 2}
                y={point.y}
                width={point.barWidth}
                height={72 - point.y}
                rx="2"
              />
            ))
          ) : (
            <>
              {kind === 'area' && (
                <path
                  className="hud-chart-area"
                  d={`${linePath(points)} L ${points[points.length - 1].x} 72 L ${points[0].x} 72 Z`}
                />
              )}
              <path className="hud-chart-line" d={linePath(points)} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}

export function Waveform({
  samples,
  label,
  state = DEFAULT_STATE,
}: WaveformProps) {
  const points = waveformPoints(samples);

  return (
    <div className={`hud-waveform hud-state-${state}`}>
      {label && <div className="hud-label">{label}</div>}
      {points ? (
        <svg viewBox="0 0 160 56" role="img" aria-label={label}>
          <path className="hud-waveform-mid" d="M0 28 H160" />
          <polyline className="hud-waveform-line" points={points} />
        </svg>
      ) : (
        <div className="hud-empty">No samples</div>
      )}
    </div>
  );
}

export function Alert({ severity, title, message }: AlertProps) {
  return (
    <div className={`hud-alert hud-state-${severity}`}>
      <strong>{title}</strong>
      {message && <span>{message}</span>}
    </div>
  );
}

export function Badge({ text, state = DEFAULT_STATE }: BadgeProps) {
  return <span className={`hud-badge hud-state-${state}`}>{text}</span>;
}

export function KeyValue({ items }: KeyValueProps) {
  return (
    <dl className="hud-key-value">
      {items.map((item) => (
        <div key={item.k}>
          <dt>{item.k}</dt>
          <dd>{item.v}</dd>
        </div>
      ))}
    </dl>
  );
}

function toPercent(value: number): number {
  return clamp(value, 0, 100);
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ChartPoint {
  x: number;
  y: number;
  barWidth: number;
}

function chartPoints(data: ChartProps['data']): ChartPoint[] {
  if (data.length === 0) return [];

  const values = data.map((point) => point.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = data.length === 1 ? 0 : 144 / (data.length - 1);
  const barWidth = clamp(112 / data.length, 5, 18);

  return data.map((point, index) => ({
    x: 8 + step * index,
    y: 64 - ((point.y - min) / range) * 56,
    barWidth,
  }));
}

function linePath(points: ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function waveformPoints(samples: number[]): string | undefined {
  if (samples.length === 0) return undefined;

  const max = Math.max(...samples.map((sample) => Math.abs(sample))) || 1;
  const step = samples.length === 1 ? 0 : 160 / (samples.length - 1);

  return samples
    .map((sample, index) => {
      const x = step * index;
      const y = 28 - (sample / max) * 22;
      return `${x},${y}`;
    })
    .join(' ');
}
