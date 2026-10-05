import test from 'node:test';
import assert from 'node:assert/strict';
import { read, load } from './load.js';

const { MESSAGES, t } = load('js/messages.js').AffineMessages;
// かな・カタカナ・漢字・全角の記号
const JAPANESE = new RegExp('[' + [[0x3000, 0x303f], [0x3040, 0x30ff], [0x3400, 0x9fff], [0xff00, 0xffef]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');
const placeholders = (s) => [...s.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]).sort();

test('日本語と英語の辞書は同じキーを持ち、置き場所 {name} もそろう', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.ja).sort());
  for (const k of Object.keys(MESSAGES.ja)) assert.deepEqual(placeholders(MESSAGES.en[k]), placeholders(MESSAGES.ja[k]), k);
});

test('英語の辞書に日本語の文字がない（言語の切り替えボタンの「日本語」を除く）', () => {
  for (const [k, v] of Object.entries(MESSAGES.en)) {
    if (k === 'ui.langButton' || k === 'ui.langLabel') continue;
    assert.doesNotMatch(v, JAPANESE, k);
  }
});

test('日本語の文言は、日本語と英数字のあいだに半角空白を入れない', () => {
  const bad = new RegExp(`(${JAPANESE.source} [A-Za-z0-9])|([A-Za-z0-9] ${JAPANESE.source})`);
  for (const [k, v] of Object.entries(MESSAGES.ja)) assert.doesNotMatch(v, bad, k);
});

test('画面のスクリプトが使うキーは、すべて辞書にある（組み立てるキーも含む）', () => {
  const src = ['js/script.js', 'js/theme.js'].map(read).join('\n');
  for (const m of src.matchAll(/\bt\('([a-z]+\.[A-Za-z.]+)'/g)) assert.ok(MESSAGES.ja[m[1]] !== undefined, m[1]);
  for (const e of ['empty', 'notInteger', 'aRange', 'bRange']) assert.ok(MESSAGES.ja[`err.${e}`], e);
  for (const c of ['rank', 'a', 'b', 'score', 'words', 'text', 'action']) assert.ok(MESSAGES.ja[`crack.col.${c}`], c);
  for (const c of ['rank', 'key', 'positions', 'score', 'text', 'action']) assert.ok(MESSAGES.ja[`crib.col.${c}`], c);
  for (const e of ['cribShort', 'cribSame', 'cribLong']) assert.ok(MESSAGES.ja[`crib.err.${e}`], e);
  for (const q of ['inverse', 'encrypt', 'decrypt', 'pairs', 'text']) assert.ok(MESSAGES.ja[`quiz.title.${q}`], q);
  for (let n = 1; n <= 6; n++) assert.ok(MESSAGES.ja[`solve.pair${n}`], n);
});

test('t は置き場所を値で埋め、未知のキーはキーのまま返す', () => {
  assert.equal(t('toast.set', { a: 5, b: 8 }, 'ja'), 'a=5, b=8を写像表に入れました。');
  assert.equal(t('toast.set', { a: 5, b: 8 }, 'en'), 'Set a=5, b=8 in the mapping table.');
  assert.equal(t('no.such.key', {}, 'ja'), 'no.such.key');
});
