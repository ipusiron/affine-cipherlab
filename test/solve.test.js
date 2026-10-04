import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from './load.js';
import { readCorpus, xorshift32 } from '../tools/evaluate.mjs';

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

// 312 通りの鍵のうち、すべての組（平文字 → 暗号文字）を満たすもの
const KEYS = C.VALID_A.flatMap((a) => Array.from({ length: 26 }, (_, b) => [a, b]));
const naive = (pairs) => KEYS.filter(([a, b]) => pairs.every(([p, c]) => C.mod(a * C.letterIndex(p) + b, 26) === C.letterIndex(c)));

test('組が2つなら、solveFromKnown は solveFromPairs と同じ鍵・同じ理由になる（決まった種で2,000通り）', () => {
  const rnd = xorshift32(20261005);
  const L = () => String.fromCharCode(65 + Math.floor(rnd() * 26));
  for (let i = 0; i < 2000; i++) {
    const [p1, c1, p2, c2] = [L(), L(), L(), L()];
    const two = C.solveFromPairs(p1, c1, p2, c2);
    const known = C.solveFromKnown([[p1, c1], [p2, c2]]);
    assert.deepEqual([keysOf(known), known.reason], [keysOf(two), two.reason], `${p1}${c1}${p2}${c2}`);
  }
});

test('組が3つ以上でも、残る鍵は312通りの鍵をすべて試した結果と一致する（決まった種で3,000通り、正しい組も混ぜる）', () => {
  const rnd = xorshift32(20261006);
  const int = (n) => Math.floor(rnd() * n);
  const L = (i) => String.fromCharCode(65 + i);
  for (let i = 0; i < 3000; i++) {
    const [a, b] = KEYS[int(KEYS.length)];
    const pairs = Array.from({ length: 3 + int(4) }, () => {
      const p = int(26);
      return [L(p), L(rnd() < 0.8 ? C.mod(a * p + b, 26) : int(26))];
    });
    const r = C.solveFromKnown(pairs);
    if (r.reason === 'samePair') continue;
    assert.deepEqual(keysOf(r), r.reason === 'contradiction' ? [] : naive(pairs), JSON.stringify(pairs));
    if (r.reason !== 'contradiction') assert.equal(r.ok, naive(pairs).length > 0);
  }
});

test('差が13の2組では12個残る鍵が、3つ目の組で1つに決まる。どれも満たさない組なら鍵は残らない', () => {
  const r = C.solveFromKnown([['A', 'B'], ['N', 'O'], ['C', 'H']]);
  assert.deepEqual([keysOf(r), r.reason, r.basePairs], [[[3, 1]], null, [0, 1]]);
  assert.deepEqual(r.checks.map((c) => [c.pair, c.p, c.c, c.before, c.kept.length, c.removed.length]), [[2, 2, 7, 12, 1, 11]]);
  assert.ok(r.checks[0].removed.every((k) => k.got === C.mod(k.a * 2 + k.b, 26) && k.got !== 7));
  const none = C.solveFromKnown([['A', 'B'], ['N', 'O'], ['C', 'A']]);
  assert.deepEqual([none.ok, none.reason, none.keys], [false, 'eliminated', []]);
});

test('同じ組の重複は1つとみなし、同じ平文字に別の暗号文字は矛盾（どの組か返す）。英字でない欄も組の番号を返す', () => {
  const dup = C.solveFromKnown([['E', 'C'], ['E', 'C'], ['T', 'Z'], ['T', 'Z']]);
  assert.deepEqual([keysOf(dup), dup.basePairs, dup.checks], [[[5, 8]], [0, 2], []]);
  const bad = C.solveFromKnown([['E', 'C'], ['T', 'Z'], ['E', 'D']]);
  assert.deepEqual([bad.reason, bad.conflict], ['contradiction', [0, 2]]);
  assert.deepEqual([C.solveFromKnown([['E', 'C'], ['T', '']]).reason, C.solveFromKnown([['E', 'C'], ['T', '']]).pair], ['notLetter', 1]);
  assert.equal(C.solveFromKnown([['E', 'C'], ['E', 'C'], ['E', 'C']]).reason, 'samePair');
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
