import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from './load.js';

const C = core();
// 既知解答は Python（pow(a, -1, 26)・別に書いた暗号化・拡張ユークリッド）で計算した値（ref/day049/known_answers.py）
const INVERSE = { 1: 1, 3: 9, 5: 21, 7: 15, 9: 3, 11: 19, 15: 7, 17: 23, 19: 11, 21: 5, 23: 17, 25: 25 };
const CASES = [
  ['HELLO', 5, 8, 'RCLLA'], ['Hello World!', 5, 8, 'Rclla Oaplx!'], ['CRYPTOGRAPHY', 5, 8, 'SPYFZAMPIFRY'],
  ['Mixed-Case Text', 5, 8, 'Qwtcx-Siuc Zctz'], ['HELLO', 1, 3, 'KHOOR'], ['HELLO', 1, 13, 'URYYB'], ['HELLO', 25, 25, 'SVOOL'],
  ['HELLO', 3, 0, 'VMHHQ'], ['Don’t panic, café 123', 7, 3, 'Yxq’g edqhr, rdmé 123']
];

test('a の候補は 26 と互いに素な12個、逆元は Python の pow(a, -1, 26) と一致する', () => {
  assert.deepEqual(C.VALID_A, [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25]);
  for (const a of C.VALID_A) {
    assert.equal(C.modInverse(a), INVERSE[a], String(a));
    assert.equal((a * C.modInverse(a)) % 26, 1);
  }
  for (const a of [2, 4, 13, 26]) assert.equal(C.modInverse(a), null, String(a));
  assert.equal(C.VALID_A.length * 26, 312);
});

test('暗号化は既知解答と一致し、復号で元に戻る（大文字・小文字を保ち、英字以外はそのまま）', () => {
  for (const [plain, a, b, cipher] of CASES) {
    assert.equal(C.encrypt(plain, a, b), cipher, `${plain} ${a} ${b}`);
    assert.equal(C.decrypt(cipher, a, b), plain, `${cipher} ${a} ${b}`);
  }
  assert.equal(C.decrypt('ABC', 2, 3), null);
});

test('アトバシュは a=25・b=25（A↔Z）、シーザーは a=1・b=3', () => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  assert.equal(C.encrypt(abc, 25, 25), [...abc].reverse().join(''));
  assert.equal(C.encrypt(abc, 1, 3), 'DEFGHIJKLMNOPQRSTUVWXYZABC');
});

test('拡張ユークリッドの途中の行は Python と一致し、各行で a·s + b·t = r', () => {
  const rows = (a, b) => C.egcd(a, b).rows.map((r) => [r.r, r.q, r.s, r.t]);
  assert.deepEqual(rows(26, 5), [[26, null, 1, 0], [5, null, 0, 1], [1, 5, 1, -5], [0, 5, -5, 26]]);
  assert.deepEqual(rows(5, 26), [[5, null, 1, 0], [26, null, 0, 1], [5, 0, 1, 0], [1, 5, -5, 1], [0, 5, 26, -5]]);
  for (const a of [5, 7, 11, 25]) {
    const { g, x, y, rows: rs } = C.egcd(26, a);
    assert.equal(g, 1);
    assert.equal(26 * x + a * y, 1);
    for (const r of rs) assert.equal(26 * r.s + a * r.t, r.r);
  }
});

test('鍵の入力は整数だけ。a は1〜25（互いに素でなければ警告つき）、b は0〜25', () => {
  assert.deepEqual(C.parseKey('5', 'a'), { ok: true, value: 5 });
  assert.deepEqual(C.parseKey(' 25 ', 'b'), { ok: true, value: 25 });
  assert.deepEqual(C.parseKey('2', 'a'), { ok: true, value: 2, warning: 'notCoprime', gcd: 2 });
  assert.deepEqual(C.parseKey('13', 'a'), { ok: true, value: 13, warning: 'notCoprime', gcd: 13 });
  const bad = [['2.5', 'a', 'notInteger'], ['', 'a', 'empty'], ['abc', 'b', 'notInteger'], ['0', 'a', 'aRange'],
    ['26', 'a', 'aRange'], ['-1', 'b', 'bRange'], ['26', 'b', 'bRange'], ['1e1', 'a', 'notInteger']];
  for (const [raw, kind, error] of bad) assert.deepEqual(C.parseKey(raw, kind), { ok: false, error }, `${raw} ${kind}`);
});

test('写像表: a=2 は13個の暗号文字にしか写らず全行が重複、a=5 は重複なし', () => {
  const rows = C.mappingRows(2, 3);
  assert.deepEqual([...new Set(rows.map((r) => r.c))].sort((x, y) => x - y), [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25]);
  assert.ok(rows.every((r) => r.duplicate));
  assert.ok(C.mappingRows(5, 8).every((r) => !r.duplicate));
  assert.deepEqual(C.mappingRows(5, 8).slice(0, 3).map((r) => [r.m, r.c]), [[0, 8], [1, 13], [2, 18]]);
});

test('前処理（空白・記号の除去）、英字の数、全角英字の数', () => {
  const t = 'Hello, World! 123 テスト';
  assert.equal(C.preprocess(t, { stripSpaces: true }), 'Hello,World!123テスト');
  assert.equal(C.preprocess(t, { stripSymbols: true }), 'Hello World  ');
  assert.equal(C.preprocess(t, { stripSpaces: true, stripSymbols: true }), 'HelloWorld');
  assert.equal(C.letterCount(t), 10);
  assert.equal(C.fullwidthLetterCount('Ｈｅｌｌｏ abc'), 5);
  assert.deepEqual([...C.letterSet('Abca!')].sort(), [0, 1, 2]);
});
