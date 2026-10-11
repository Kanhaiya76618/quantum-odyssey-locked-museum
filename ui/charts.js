// Small ink-drawn SVG charts.
import { s } from './dom.js';

/**
 * Interference fringe: P(bright) against phase.
 * opts: { free:{phase:p}, watch:{phase:p}, current, showWatch }
 */
export function fringeChart(opts) {
  const W = 520;
  const H = 260;
  const P = { l: 52, r: 16, t: 16, b: 44 };
  const x = (deg) => P.l + (deg / 360) * (W - P.l - P.r);
  const y = (p) => H - P.b - p * (H - P.t - P.b);
  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
    'aria-label': 'Chance of the bright port against phase. Solid line: interference theory. Dashed line: with a which-path detector. Dots: measured.',
  });
  for (const p of [0, 0.5, 1]) {
    svg.append(s('line', { x1: P.l, x2: W - P.r, y1: y(p), y2: y(p), class: 'grid' }));
    svg.append(s('text', { x: P.l - 8, y: y(p) + 4, class: 'tick', 'text-anchor': 'end' }, `${p * 100}%`));
  }
  for (const d of [0, 90, 180, 270, 360]) {
    svg.append(s('text', { x: x(d), y: H - P.b + 20, class: 'tick', 'text-anchor': 'middle' }, `${d}°`));
  }
  let path = '';
  for (let d = 0; d <= 360; d += 4) {
    path += `${d ? 'L' : 'M'}${x(d).toFixed(1)},${y(Math.cos((d * Math.PI) / 360) ** 2).toFixed(1)}`;
  }
  svg.append(s('path', { d: path, class: 'theory-quantum' }));
  if (opts.showWatch) {
    svg.append(s('line', { x1: x(0), x2: x(360), y1: y(0.5), y2: y(0.5), class: 'theory-classical' }));
    for (const [deg, p] of Object.entries(opts.watch || {})) {
      svg.append(s('rect', {
        x: x(+deg) - 5, y: y(p) - 5, width: 10, height: 10,
        class: +deg === opts.current ? 'mark-classical current' : 'mark-classical',
      }));
    }
  }
  for (const [deg, p] of Object.entries(opts.free || {})) {
    svg.append(s('circle', {
      cx: x(+deg), cy: y(p), r: +deg === opts.current ? 7.5 : 5.5,
      class: +deg === opts.current ? 'mark-quantum current' : 'mark-quantum',
    }));
  }
  svg.append(s('text', { x: W - P.r, y: H - 6, class: 'axis', 'text-anchor': 'end' }, 'path difference (phase)'));
  return svg;
}

/**
 * A horizontal scale with labelled marks and a measured value with an error bar.
 * opts: { min, max, marks:[{v,label,cls}], value, err, label }
 */
export function gauge(opts) {
  const W = 520;
  const H = 120;
  const P = { l: 20, r: 20 };
  const x = (v) => P.l + ((v - opts.min) / (opts.max - opts.min)) * (W - P.l - P.r);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart gauge', role: 'img', 'aria-label': opts.label });
  svg.append(s('line', { x1: x(opts.min), x2: x(opts.max), y1: 70, y2: 70, class: 'axis-line' }));
  for (const m of opts.marks) {
    svg.append(s('line', { x1: x(m.v), x2: x(m.v), y1: 52, y2: 88, class: `gauge-mark ${m.cls || ''}` }));
    const anchor = m.anchor || 'middle';
    svg.append(s('text', { x: x(m.v) + (anchor === 'end' ? 6 : anchor === 'start' ? -6 : 0), y: 108, class: `tick ${m.cls || ''}`, 'text-anchor': anchor }, m.label));
  }
  if (opts.value !== null && opts.value !== undefined) {
    const lo = Math.max(opts.min, opts.value - (opts.err || 0));
    const hi = Math.min(opts.max, opts.value + (opts.err || 0));
    svg.append(s('line', { x1: x(lo), x2: x(hi), y1: 70, y2: 70, class: 'gauge-err' }));
    svg.append(s('path', { d: `M${x(opts.value)},62 l-9,-16 l18,0 Z`, class: 'gauge-pointer' }));
    svg.append(s('text', { x: x(opts.value), y: 36, class: 'gauge-value', 'text-anchor': 'middle' }, opts.valueLabel));
  }
  return svg;
}

/**
 * Bars with 95% intervals against a reference line.
 * rows: [{label, value, ci:[lo,hi]}], ref: {v, label}
 */
export function barsWithLimit(rows, ref, label) {
  const W = 520;
  const rowH = 34;
  const labelW = 120;
  const H = rows.length * rowH + 40;
  const x = (v) => labelW + v * (W - labelW - 60);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart bars', role: 'img', 'aria-label': label });
  rows.forEach((r, i) => {
    const yy = 10 + i * rowH;
    svg.append(s('text', { x: 0, y: yy + 20, class: 'row-label' }, r.label));
    svg.append(s('rect', { x: labelW, y: yy + 7, width: Math.max(1, x(r.value) - labelW), height: rowH - 14, class: 'bar-quantum' }));
    if (r.ci) svg.append(s('line', { x1: x(r.ci[0]), x2: x(r.ci[1]), y1: yy + rowH / 2, y2: yy + rowH / 2, class: 'whisker' }));
    svg.append(s('text', { x: x(Math.max(r.value, r.ci ? r.ci[1] : 0)) + 6, y: yy + 21, class: 'value' }, `${(100 * r.value).toFixed(1)}%`));
  });
  if (ref) {
    const top = 6;
    const bottom = 10 + rows.length * rowH;
    svg.append(s('line', { x1: x(ref.v), x2: x(ref.v), y1: top, y2: bottom, class: 'limit-line' }));
    svg.append(s('text', { x: x(ref.v), y: bottom + 18, class: 'tick classical', 'text-anchor': 'middle' }, ref.label));
  }
  return svg;
}
