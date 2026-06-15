import type { ReactNode } from 'react';
import type { State, StepStatus } from './types';
import { formatNumber, formatTick } from './format';

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
  value?: number;
  label?: string;
  state?: State;
  showPct?: boolean;
}

export interface GaugeProps {
  value?: number;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  state?: State;
}

export interface PieChartProps {
  slices?: PieSlice[];
  data?: PieSlice[];
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
  steps?: StepItem[];
  items?: StepItem[];
  data?: StepItem[];
}

export interface ChartProps {
  kind?: 'line' | 'bar' | 'area';
  data?: { x: string | number; y: number }[];
  points?: { x: string | number; y: number }[];
  unit?: string;
  label?: string;
  state?: State;
}

export interface WaveformProps {
  samples?: number[];
  data?: number[];
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
  items?: { k?: string; v?: string; label?: string; value?: string }[];
  data?: { k?: string; v?: string; label?: string; value?: string }[];
}

export interface RadialMeterProps {
  value?: number;
  max?: number;
  label?: string;
  unit?: string;
  state?: State;
}

export interface SparklineProps {
  samples?: number[];
  data?: number[];
  label?: string;
  state?: State;
}

export interface RadialBreakdownItem {
  label?: string;
  value?: number;
  state?: State;
}

export interface RadialBreakdownProps {
  items?: RadialBreakdownItem[];
  data?: RadialBreakdownItem[];
  label?: string;
  unit?: string;
  state?: State;
}

const DEFAULT_STATE: State = 'info';
const CAT_PALETTE_SIZE = 8;

type PieSlice = {
  label?: string;
  name?: string;
  value?: number;
  state?: State;
};

type StepItem = {
  name?: string;
  label?: string;
  status?: StepStatus;
  state?: State;
  description?: string;
};

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
  const normalized = toPercent(value ?? 0);
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className={`hud-progress hud-state-${state}`}>
      {(label || showPct) && (
        <div className="hud-progress-head">
          {label && <span>{label}</span>}
          {showPct && <span>{Math.round(normalized)}%</span>}
        </div>
      )}
      <progress value={normalized} max={100} aria-label={label} />
      <div className="hud-progress-scale" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} style={{ insetInlineStart: `${tick}%` }} />
        ))}
      </div>
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
  const displayValue = Number.isFinite(value) ? Number(value) : min;
  const pct = normalize(displayValue, min, max);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);
  const pointer = gaugePointer(pct);

  return (
    <div className={`hud-gauge hud-state-${state}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={label}>
        <g className="hud-gauge-rings" aria-hidden="true">
          <circle className="hud-gauge-ring" cx="60" cy="60" r="30" />
          <circle className="hud-gauge-ring" cx="60" cy="60" r="18" />
        </g>
        <g className="hud-gauge-ticks" aria-hidden="true">
          {gaugeTicks(16).map((tick) => (
            <line
              key={tick.index}
              className={tick.major ? 'is-major' : undefined}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
            />
          ))}
        </g>
        <circle className="hud-gauge-track" cx="60" cy="60" r={radius} />
        <circle
          className="hud-gauge-fill"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
        />
        <line
          className="hud-gauge-pointer"
          x1={pointer.x1}
          y1={pointer.y1}
          x2={pointer.x2}
          y2={pointer.y2}
        />
      </svg>
      <div className="hud-gauge-readout">
        <span>{formatNumber(displayValue)}</span>
        {unit && <small>{unit}</small>}
      </div>
      {label && <div className="hud-label">{label}</div>}
    </div>
  );
}

export function PieChart({
  slices,
  data,
  label,
  state = DEFAULT_STATE,
}: PieChartProps) {
  const safeSlices = asArray(slices ?? data)
    .map((slice, index) => ({
      label: slice.label ?? slice.name ?? `Slice ${index + 1}`,
      value: Number.isFinite(slice.value) ? Number(slice.value) : 0,
      state: slice.state,
    }))
    .filter((slice) => slice.value > 0)
    // State colors carry meaning (caution/critical are warnings), so slices
    // without an explicit state get a neutral series palette instead.
    // 상태가 명시되면 의미색(state), 아니면 비의미 categorical 팔레트(--cat-*).
    .map((slice, index) => ({
      ...slice,
      tone: slice.state
        ? `hud-state-${slice.state}`
        : `hud-cat-${index % CAT_PALETTE_SIZE}`,
    }));
  const total = safeSlices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;

  if (total <= 0 || safeSlices.length === 0) {
    return <div className="hud-empty">No slices</div>;
  }

  const segments = safeSlices.map((slice, index) => {
    const previousTotal = safeSlices
      .slice(0, index)
      .reduce((sum, previous) => sum + previous.value, 0);
    const length = (slice.value / total) * circumference;
    const dashOffset = -(previousTotal / total) * circumference;

    return {
      ...slice,
      length,
      dashOffset,
      remainder: circumference - length,
      pct: Math.round((slice.value / total) * 100),
    };
  });

  return (
    <div className={`hud-pie hud-state-${state}`}>
      {label && <div className="hud-label">{label}</div>}
      <div className="hud-pie-body">
        <svg viewBox="0 0 120 120" role="img" aria-label={label}>
          <g className="hud-pie-radar" aria-hidden="true">
            <circle cx="60" cy="60" r="18" />
            <circle cx="60" cy="60" r="38" />
            <path d="M60 18 V102 M18 60 H102 M30 30 L90 90 M90 30 L30 90" />
          </g>
          <circle className="hud-pie-track" cx="60" cy="60" r={radius} />
          {segments.map((slice, index) => (
            <circle
              key={`${index}-${slice.label}`}
              className={`hud-pie-segment ${slice.tone}`}
              cx="60"
              cy="60"
              r={radius}
              strokeDasharray={`${slice.length} ${slice.remainder}`}
              strokeDashoffset={slice.dashOffset}
            />
          ))}
          <circle className="hud-pie-core" cx="60" cy="60" r="24" />
          <text className="hud-pie-total" x="60" y="62">
            {formatNumber(total)}
          </text>
        </svg>
        <dl className="hud-pie-legend">
          {segments.map((slice, index) => (
            <div key={`${index}-${slice.label}`}>
              <dt className={slice.tone}>
                <span aria-hidden="true" />
                {slice.label}
              </dt>
              <dd>{slice.pct}%</dd>
            </div>
          ))}
        </dl>
      </div>
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
  const numericDelta = typeof delta === 'number' ? delta : undefined;

  return (
    <div className={`hud-stat hud-state-${state}`}>
      <div className="hud-label">{label}</div>
      <div className="hud-stat-value">
        <span>{formatNumber(value)}</span>
        {unit && <small>{unit}</small>}
      </div>
      {numericDelta !== undefined && (
        <div className={`hud-delta ${numericDelta >= 0 ? 'is-up' : 'is-down'}`}>
          {numericDelta >= 0 ? '+' : ''}
          {formatNumber(numericDelta)}
        </div>
      )}
    </div>
  );
}

export function Steps({ steps, items, data }: StepsProps) {
  const safeSteps = asArray(steps ?? items ?? data);

  if (safeSteps.length === 0) {
    return <div className="hud-empty">No steps</div>;
  }

  return (
    <ol className="hud-steps">
      {safeSteps.map((step, index) => {
        const name = step.name ?? step.label ?? 'Untitled step';
        const status = normalizeStepStatus(step.status ?? step.state);

        return (
          <li key={`${index}-${name}`} className={`is-${status}`}>
            <span className="hud-step-dot" aria-hidden="true" />
            <span className="hud-step-body">
              <span>{name}</span>
              {step.description && (
                <span className="hud-step-desc">{step.description}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Chart({
  kind = 'line',
  data,
  points: pointData,
  unit,
  label,
  state = DEFAULT_STATE,
}: ChartProps) {
  const entries = asArray(data ?? pointData);
  const points = chartPoints(entries);
  const yns = entries.map((point) => point.y).filter((y) => Number.isFinite(y));
  const yMin = yns.length ? Math.min(...yns) : 0;
  const yMax = yns.length ? Math.max(...yns) : 0;
  const baselineY = chartBaselineY(yns);
  // 촘촘한 스펙트럼은 마커가 "구슬 목걸이"로 라인을 덮는다 → 마커를 끄고,
  // line이면 보조 area를 깔아 가독성을 살린다(kind는 존중).
  const dense = points.length > 24;
  const showMarkers = kind !== 'bar' && !dense;
  const showArea = kind === 'area' || (kind === 'line' && dense);
  const midIndex = Math.floor((entries.length - 1) / 2);

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
          <path className="hud-chart-axis" d="M8 8 V64 H152" />
          {kind === 'bar' ? (
            points.map((point, index) => (
              <rect
                key={`${point.x}-${point.y}-${index}`}
                className={`hud-chart-bar hud-heat-${heatIndex(entries[index]?.y, yMin, yMax)}`}
                x={point.x - point.barWidth / 2}
                y={Math.min(point.y, baselineY)}
                width={point.barWidth}
                height={Math.max(1, Math.abs(baselineY - point.y))}
                rx="2"
              />
            ))
          ) : (
            <>
              {showArea && (
                <path
                  className="hud-chart-area"
                  d={`${linePath(points)} L ${points[points.length - 1].x} 72 L ${points[0].x} 72 Z`}
                />
              )}
              <path className="hud-chart-line" d={linePath(points)} />
              {showMarkers && (
                <g className="hud-chart-points">
                  {points.map((point, index) => (
                    <circle
                      key={`${point.x}-${point.y}-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="2.4"
                    />
                  ))}
                </g>
              )}
            </>
          )}
          <g className="hud-chart-ylabels" aria-hidden="true">
            <text x="10" y="13">
              {formatTick(yMax)}
            </text>
            <text x="10" y="62">
              {formatTick(yMin)}
            </text>
          </g>
          <g className="hud-chart-xlabels" aria-hidden="true">
            <text x="8" y="71">
              {formatTick(entries[0].x)}
            </text>
            {entries.length > 2 && (
              <text x="80" y="71" textAnchor="middle">
                {formatTick(entries[midIndex].x)}
              </text>
            )}
            {entries.length > 1 && (
              <text x="152" y="71" textAnchor="end">
                {formatTick(entries[entries.length - 1].x)}
              </text>
            )}
          </g>
        </svg>
      )}
    </div>
  );
}

export function Waveform({
  samples,
  data,
  label,
  state = DEFAULT_STATE,
}: WaveformProps) {
  const points = waveformPoints(asArray(samples ?? data));

  return (
    <div className={`hud-waveform hud-state-${state}`}>
      {label && <div className="hud-label">{label}</div>}
      {points ? (
        <svg viewBox="0 0 160 56" role="img" aria-label={label}>
          <path className="hud-waveform-band" d="M0 14 H160 M0 42 H160" />
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

export function KeyValue({ items, data }: KeyValueProps) {
  const safeItems = asArray(items ?? data);

  if (safeItems.length === 0) {
    return <div className="hud-empty">No items</div>;
  }

  return (
    <dl className="hud-key-value">
      {safeItems.map((item, index) => (
        <div key={`${index}-${item.k ?? item.label}`}>
          <dt>{item.k ?? item.label}</dt>
          <dd>{formatNumber(item.v ?? item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * RadialMeter — 동심 레이더 KPI. 단일 핵심 수치 + 맥락("47 INCIDENTS").
 * 중앙 readout = value, 링 채움 = value/max. 손 SVG(동심 틱 링 + 진행 아크).
 */
export function RadialMeter({
  value,
  max = 100,
  label,
  unit,
  state = DEFAULT_STATE,
}: RadialMeterProps) {
  const current = Number.isFinite(value) ? Number(value) : 0;
  const safeMax = Number.isFinite(max) && Number(max) > 0 ? Number(max) : 100;
  const pct = clamp(current / safeMax, 0, 1);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className={`hud-radial hud-state-${state}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={label}>
        <g className="hud-radial-rings" aria-hidden="true">
          <circle cx="60" cy="60" r="52" />
          <circle cx="60" cy="60" r="34" />
        </g>
        <g className="hud-radial-ticks" aria-hidden="true">
          {gaugeTicks(24).map((tick) => (
            <line
              key={tick.index}
              className={tick.major ? 'is-major' : undefined}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
            />
          ))}
        </g>
        <circle className="hud-radial-track" cx="60" cy="60" r={radius} />
        <circle
          className="hud-radial-fill"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="hud-radial-readout">
        <span className="hud-radial-value">{formatNumber(current)}</span>
        {unit && <small>{unit}</small>}
      </div>
      {label && <div className="hud-label hud-radial-label">{label}</div>}
    </div>
  );
}

/**
 * Sparkline — 인라인 미니 트렌드(축·마커 없음). 스탯 행/타일 옆 작은 추세.
 * Waveform에서 chrome을 제거한 판. samples = data.*.
 */
export function Sparkline({
  samples,
  data,
  label,
  state = DEFAULT_STATE,
}: SparklineProps) {
  const points = sparkPoints(asArray(samples ?? data));

  return (
    <div className={`hud-sparkline hud-state-${state}`}>
      {label && <span className="hud-label">{label}</span>}
      {points ? (
        <svg
          viewBox="0 0 120 28"
          role="img"
          aria-label={label}
          preserveAspectRatio="none"
        >
          <polyline className="hud-sparkline-line" points={points} />
        </svg>
      ) : (
        <div className="hud-empty">No samples</div>
      )}
    </div>
  );
}

/**
 * RadialBreakdown — 허브 둘레 카테고리 스포크(ATT&CK 룩) + 중앙 합계.
 * 스포크 길이 = 값, 색은 state가 있으면 의미색, 없으면 categorical(--cat-*).
 */
export function RadialBreakdown({
  items,
  data,
  label,
  unit,
  state = DEFAULT_STATE,
}: RadialBreakdownProps) {
  const entries = asArray(items ?? data).map((item, index) => ({
    label: item.label ?? `Item ${index + 1}`,
    value: Number.isFinite(item.value) ? Number(item.value) : 0,
    state: item.state,
  }));

  if (entries.length === 0) {
    return <div className="hud-empty">No items</div>;
  }

  const total = entries.reduce((sum, item) => sum + item.value, 0);
  const maxValue = Math.max(...entries.map((item) => item.value), 0) || 1;
  const cx = 100;
  const cy = 100;
  const minR = 28;
  const maxR = 70;

  const spokes = entries.map((item, index) => {
    const angle = ((index / entries.length) * 360 - 90) * (Math.PI / 180);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const length = minR + (item.value / maxValue) * (maxR - minR);
    const tone = item.state
      ? `hud-state-${item.state}`
      : `hud-cat-${index % CAT_PALETTE_SIZE}`;
    const anchor: 'start' | 'middle' | 'end' =
      cos > 0.33 ? 'start' : cos < -0.33 ? 'end' : 'middle';
    return {
      label: item.label,
      value: item.value,
      tone,
      anchor,
      ex: cx + cos * length,
      ey: cy + sin * length,
      lx: cx + cos * (maxR + 12),
      ly: cy + sin * (maxR + 12),
    };
  });

  return (
    <div className={`hud-radial-breakdown hud-state-${state}`}>
      {label && <div className="hud-label">{label}</div>}
      <svg viewBox="0 0 200 200" role="img" aria-label={label}>
        <g className="hud-rb-rings" aria-hidden="true">
          <circle cx={cx} cy={cy} r={maxR} />
          <circle cx={cx} cy={cy} r={(minR + maxR) / 2} />
        </g>
        {spokes.map((spoke, index) => (
          <g
            key={`${index}-${spoke.label}`}
            className={`hud-rb-spoke ${spoke.tone}`}
          >
            <line x1={cx} y1={cy} x2={spoke.ex} y2={spoke.ey} />
            <circle cx={spoke.ex} cy={spoke.ey} r="3.4" />
            <text
              className="hud-rb-label"
              x={spoke.lx}
              y={spoke.ly}
              textAnchor={spoke.anchor}
            >
              {spoke.label}
            </text>
            <text
              className="hud-rb-value"
              x={spoke.lx}
              y={spoke.ly + 9}
              textAnchor={spoke.anchor}
            >
              {formatNumber(spoke.value)}
            </text>
          </g>
        ))}
        <circle className="hud-rb-core" cx={cx} cy={cy} r={minR - 6} />
        <text className="hud-rb-total" x={cx} y={unit ? cy - 2 : cy}>
          {formatNumber(total)}
        </text>
        {unit && (
          <text className="hud-rb-unit" x={cx} y={cy + 11}>
            {unit}
          </text>
        )}
      </svg>
    </div>
  );
}

function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 100);
}

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
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
  if (!data || data.length === 0) return [];

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

function chartBaselineY(values: number[]): number {
  if (values.length === 0) return 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min >= 0) return 64;
  if (max <= 0) return 8;
  return 64 - ((0 - min) / (max - min)) * 56;
}

/** 값을 0..4 sequential 램프 인덱스로(heat 막대 색). 범위 0이면 중간. */
function heatIndex(value: number | undefined, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || max <= min) {
    return 2;
  }
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(4, Math.round(normalized * 4)));
}

function gaugeTicks(count: number): {
  index: number;
  major: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = ((index / count) * 360 - 90) * (Math.PI / 180);
    const major = index % 4 === 0;
    const outer = 54;
    const inner = major ? 47 : 50;
    return {
      index,
      major,
      x1: 60 + Math.cos(angle) * inner,
      y1: 60 + Math.sin(angle) * inner,
      x2: 60 + Math.cos(angle) * outer,
      y2: 60 + Math.sin(angle) * outer,
    };
  });
}

function gaugePointer(pct: number): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const angle = (pct * 360 - 90) * (Math.PI / 180);
  return {
    x1: 60 + Math.cos(angle) * 38,
    y1: 60 + Math.sin(angle) * 38,
    x2: 60 + Math.cos(angle) * 54,
    y2: 60 + Math.sin(angle) * 54,
  };
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

function sparkPoints(samples: number[]): string | undefined {
  if (samples.length === 0) return undefined;
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  const range = max - min || 1;
  const step = samples.length === 1 ? 0 : 120 / (samples.length - 1);
  return samples
    .map((sample, index) => {
      const x = step * index;
      const y = 26 - ((sample - min) / range) * 24;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStepStatus(status: StepItem['status'] | StepItem['state']): StepStatus {
  if (status === 'stable') return 'done';
  if (status === 'info') return 'active';
  if (status === 'caution') return 'caution';
  if (status === 'critical') return 'failed';
  if (
    status === 'done' ||
    status === 'active' ||
    status === 'pending' ||
    status === 'failed'
  ) {
    return status;
  }
  return 'pending';
}
