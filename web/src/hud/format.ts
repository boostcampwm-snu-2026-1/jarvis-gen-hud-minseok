/**
 * 표시용 숫자 포맷 헬퍼 — Chart 축 라벨·Gauge·Stat·KeyValue 공용.
 *
 * **표시 전용**이다. 끝 0 제거·유효숫자 캡·비유한값 안전 처리만 하며, 원본
 * data.* 값은 절대 바꾸지 않는다(예: 라벨/리드아웃에 0.49219 → 0.492).
 * (프리미티브 컴포넌트 파일과 분리 — react-refresh가 컴포넌트 외 export를 싫어함.)
 */
export function formatNumber(value: unknown, maxSig = 4): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (Number.isInteger(value) && abs < 1e6) return String(value);
  if (abs >= 1e6 || abs < 1e-3) {
    return trimMantissaZeros(value.toExponential(Math.max(0, maxSig - 1)));
  }
  return trimTrailingZeros(value.toPrecision(maxSig));
}

/** 축 틱 라벨 — 숫자는 짧게(≤3 유효숫자), 카테고리(문자열)는 그대로. */
export function formatTick(value: string | number): string {
  return typeof value === 'number' ? formatNumber(value, 3) : value;
}

function trimTrailingZeros(text: string): string {
  if (!text.includes('.')) return text;
  return text.replace(/\.?0+$/, '');
}

function trimMantissaZeros(text: string): string {
  const [mantissa, exponent] = text.split(/[eE]/);
  return exponent === undefined
    ? trimTrailingZeros(mantissa)
    : `${trimTrailingZeros(mantissa)}e${exponent}`;
}
