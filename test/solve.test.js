import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from './load.js';
import { readCorpus } from '../tools/evaluate.mjs';

const C = core();
const keysOf = (r) => r.keys.map((k) => [k.a, k.b]);

// 既知解答は Python で 312 通りを総当たりし、2つの式を満たす鍵をすべて集めた値（ref/day049/known_pairs.py）
test('既知の2組から鍵を解く: 差が26と互いに素なら1つ、差が偶数なら候補2つのうち互いに素な1つ', () => {
  const r1 = C.solveFromPairs('E', 'C', 'T', 'Z');
  assert.deepEqual(keysOf(r1), [[5, 8]]);
  assert.deepEqual([r1.dp, r1.dc, r1.g, r1.reason], [11, 3, 1, null]);
  const r2 = C.solveFromPairs('A', 'D', 'C', 'R');
  assert.deepEqual(keysOf(r2), [[7, 3]]);
  assert.deepEqual([r2.g, r2.candidates], [2, [7, 20]]);
});

test('差が13の組では、解が12個（鍵が決まらない）か、なし', () => {
  const many = C.solveFromPairs('A', 'B', 'N', 'O');
  assert.deepEqual(keysOf(many), C.VALID_A.map((a) => [a, 1]));
  assert.equal(many.reason, 'several');
  const none = C.solveFromPairs('A', 'B', 'N', 'D');
  assert.deepEqual([none.ok, none.reason, none.keys], [false, 'noSolution', []]);
});

test('解いた a が26と互いに素でないときは鍵にならない。同じ平文字に別の暗号文字は矛盾、同じ組は情報なし', () => {
  const r = C.solveFromPairs('E', 'A', 'T', 'C');
  assert.deepEqual([r.ok, r.reason, r.candidates], [false, 'noValidA', [14]]);
  assert.equal(C.solveFromPairs('E', 'A', 'E', 'B').reason, 'contradiction');
  assert.equal(C.solveFromPairs('E', 'A', 'E', 'A').reason, 'samePair');
  assert.equal(C.solveFromPairs('E', 'AB', 'T', '1').reason, 'notLetter');
  assert.deepEqual(keysOf(C.solveFromPairs('e', 'c', 't', 'z')), [[5, 8]]);
});

test('頻度による仮定は多い順の上位6文字から30通り、（1位,2位）（2位,1位）（1位,3位）…の順。解いた鍵は E・T をその文字に写す', () => {
  const plain = readCorpus('eval-pg98.txt').slice(0, 3000);
  const cipher = C.encrypt(plain, 11, 7);
  const freq = C.letterFrequencies(cipher);
  for (let i = 1; i < freq.length; i++) assert.ok(freq[i - 1].n > freq[i].n || (freq[i - 1].n === freq[i].n && freq[i - 1].i < freq[i].i));
  const hs = C.frequencyHypotheses(cipher);
  assert.equal(hs.length, 30);
  const [f0, f1, f2] = freq.map((f) => f.i);
  assert.deepEqual(hs.slice(0, 4).map((h) => [h.cipherE, h.cipherT]), [[f0, f1], [f1, f0], [f0, f2], [f2, f0]]);
  for (const h of hs) {
    for (const k of h.keys) assert.deepEqual([C.mod(k.a * 4 + k.b, 26), C.mod(k.a * 19 + k.b, 26)], [h.cipherE, h.cipherT]);
    assert.ok(h.keys.length <= 1);
  }
  const best = hs.flatMap((h) => h.keys).reduce((p, q) => (q.score > p.score ? q : p));
  assert.deepEqual([best.a, best.b], [11, 7]);
});

test('URL の #text= を先に読み、なければ ?text=。読み込んだ text は「?」と「#」から消す', () => {
  assert.equal(C.linkParams('?text=QUERY', '#text=HASH').get('text'), 'HASH');
  assert.equal(C.linkParams('?text=QUERY', '').get('text'), 'QUERY');
  assert.equal(C.linkParams('?lang=en', '#top').has('text'), false);
  const base = 'https://ipusiron.github.io/affine-cipherlab/';
  assert.equal(C.urlWithoutText(`${base}?lang=en#text=ABC`), '/affine-cipherlab/?lang=en');
  assert.equal(C.urlWithoutText(`${base}?text=ABC#x=1`), '/affine-cipherlab/#x=1');
  assert.equal(C.urlWithoutText(`${base}?lang=en`), null);
});
