import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './load.js';

const css = read('css/style.css');

function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// 文字の色と背景の色の組（画面で実際に重なるもの）
const PAIRS = [
  ['text', 'bg'], ['text', 'card'], ['muted', 'card'], ['muted', 'bg'], ['muted', 'row-alt'], ['text', 'row-alt'],
  ['accent-text', 'card'], ['accent-text', 'bg'], ['accent-text', 'accent-weak'], ['on-accent', 'accent'],
  ['error-text', 'error-bg'], ['error-text', 'card'], ['warn-text', 'warn-bg'], ['text', 'dup-bg'], ['text', 'hl-bg'], ['bg', 'text']
];

test('ライトとダークの配色は、文字と背景のコントラストが4.5:1以上', () => {
  const light = tokens(':root');
  const dark = tokens(':root[data-theme="dark"]');
  for (const [name, set] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg] of PAIRS) {
      const r = ratio(set[fg], set[bg]);
      assert.ok(r >= 4.5, `${name} ${fg} on ${bg}: ${r.toFixed(2)}`);
    }
  }
});

test('OS の設定によるダークと、手動のダークは同じ値', () => {
  const start = css.indexOf(':root:not([data-theme="light"]) {');
  const block = css.slice(start, css.indexOf('}', start));
  const os = Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const s2 = css.indexOf(':root[data-theme="dark"] {');
  const manual = Object.fromEntries([...css.slice(s2, css.indexOf('}', s2)).matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  assert.deepEqual(os, manual);
});
