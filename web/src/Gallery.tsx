import {
  Alert,
  Badge,
  Chart,
  Gauge,
  KeyValue,
  Panel,
  ProgressBar,
  Stat,
  StatusPanel,
  Steps,
  Waveform,
  type Size,
  type State,
} from './hud';

const STATES: State[] = ['stable', 'info', 'caution', 'critical'];
const SIZES: Size[] = ['sm', 'md', 'lg'];

const STATE_COPY: Record<State, { label: string; value: string; hint: string }> =
  {
    stable: {
      label: 'stable',
      value: 'NOMINAL',
      hint: '파랑: 안정 상태',
    },
    info: {
      label: 'info',
      value: 'SYNC',
      hint: '청록: 일반 정보',
    },
    caution: {
      label: 'caution',
      value: 'CHECK',
      hint: '주황: 주의 필요',
    },
    critical: {
      label: 'critical',
      value: 'FAULT',
      hint: '빨강: 실패 또는 경고',
    },
  };

const buildSteps = [
  { name: 'Install deps', status: 'done' as const },
  { name: 'Typecheck', status: 'done' as const },
  { name: 'Build bundle', status: 'active' as const },
  { name: 'Deploy gate', status: 'pending' as const },
  { name: 'Smoke test', status: 'failed' as const },
];

const chartData = [
  { x: 'parse', y: 18 },
  { x: 'plan', y: 42 },
  { x: 'render', y: 35 },
  { x: 'heal', y: 54 },
  { x: 'ready', y: 76 },
];

const waveformSamples = [
  0.1, 0.6, -0.2, 0.9, -0.7, 0.25, 0.4, -0.45, 0.8, -0.1, 0.35, -0.8,
  0.2, 0.7, -0.35, 0.15,
];

export function Gallery() {
  return (
    <div className="gallery-shell">
      <header className="gallery-header">
        <a href="/" className="gallery-back">
          J.A.R.V.I.S
        </a>
        <div>
          <h1>HUD Primitive Gallery</h1>
          <p>Design tokens and allowed components for generated HUD output.</p>
        </div>
        <div className="gallery-size-row" aria-label="size tokens">
          {SIZES.map((size) => (
            <Badge key={size} text={size} state="info" />
          ))}
        </div>
      </header>

      <main className="gallery-main">
        {STATES.map((state) => (
          <section key={state} className="gallery-state-section">
            <div className="gallery-section-head">
              <Badge text={state} state={state} />
              <span>{STATE_COPY[state].hint}</span>
            </div>

            <div className="hud-grid">
              <Panel title="StatusPanel" state={state}>
                <StatusPanel
                  label={STATE_COPY[state].label}
                  value={STATE_COPY[state].value}
                  state={state}
                  hint={STATE_COPY[state].hint}
                />
              </Panel>

              <Panel title="ProgressBar + Gauge" state={state}>
                <ProgressBar
                  label="Build progress"
                  value={68}
                  state={state}
                  showPct
                />
                <Gauge
                  label="Confidence"
                  value={82}
                  min={0}
                  max={100}
                  unit="%"
                  state={state}
                />
              </Panel>

              <Panel title="Stat + Badge + KeyValue" state={state}>
                <Stat
                  label="Latency"
                  value={124}
                  unit="ms"
                  delta={state === 'critical' ? -18 : 7}
                  state={state}
                />
                <Badge text="primitive" state={state} />
                <KeyValue
                  items={[
                    { k: 'scope', v: 'hud' },
                    { k: 'source', v: 'props' },
                    { k: 'state', v: state },
                  ]}
                />
              </Panel>

              <Panel title="Build Status Demo" state={state} span={2}>
                <Steps steps={buildSteps} />
                <ProgressBar
                  label="Demo hook"
                  value={74}
                  state={state}
                  showPct
                />
              </Panel>

              <Panel title="Alert" state={state}>
                <Alert
                  severity={state}
                  title={`${state.toUpperCase()} signal`}
                  message="Fallback-ready message surface for generated HUDs."
                />
              </Panel>

              <Panel title="Chart" state={state} span={2}>
                <Chart
                  kind={state === 'stable' ? 'line' : state === 'info' ? 'area' : 'bar'}
                  data={chartData}
                  unit="ops"
                  label="Task telemetry"
                  state={state}
                />
              </Panel>

              <Panel title="Waveform" state={state}>
                <Waveform
                  samples={waveformSamples}
                  label="Voice envelope"
                  state={state}
                />
              </Panel>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
