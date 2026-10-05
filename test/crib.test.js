import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from './load.js';
import { readCorpus } from '../tools/evaluate.mjs';

const C = core();
const KEYS = C.VALID_A.flatMap((a) => Array.from({ length: 26 }, (_, b) => ({ a, b })));

// 312 通りの鍵と、すべての位置をそのまま試す（cribSearch とは別の書き方で、同じ結果になることを確かめる）
function naive(cipher, crib) {
  const word = C.lettersOf(crib);
  const seq = C.lettersOf(cipher);
  const out = new Map();
  for (const k of KEYS) {
    const enc = word.map((p) => C.mod(k.a * p + k.b, 26));
    for (let pos = 0; pos + word.length <= seq.length; pos++) {
      if (!enc.every((c, i) => c === seq[pos + i])) continue;
      const id = `${k.a},${k.b}`;
      if (!out.has(id)) out.set(id, []);
      out.get(id).push(pos);
    }
  }
  return out;
}

const byKey = (r) => new Map(r.results.map((x) => [`${x.a},${x.b}`, x.positions]));

test('クリブは、平文がその単語を含む位置で正しい鍵を見つけ、英語らしさの1位にする', () => {
  const plain = 'The quick brown fox jumps over the lazy dog, and then the dog sleeps.';
  const cipher = C.encrypt(plain, 7, 10);
  const r = C.cribSearch(cipher, 'the');
  assert.equal(r.ok, true);
  assert.equal(r.word, 'THE');
  const letters = C.lettersOf(plain).map((i) => String.fromCharCode(65 + i)).join('');
  const where = [...letters.matchAll(/(?=THE)/g)].map((m) => m.index);
  assert.deepEqual([r.results[0].a, r.results[0].b, r.results[0].positions], [7, 10, where]);
  assert.equal(r.positions, letters.length - 2);
  assert.equal(r.rejected.pattern + r.rejected.noKey + r.rejected.mismatch + r.matched, r.positions);
});

test('残る鍵と位置は、312通りの鍵ですべての位置を試した結果と一致する（同じ文字を含む単語・差が13の単語も）', () => {
  const corpus = readCorpus('eval-pg98.txt');
  for (const [start, crib, a, b] of [[1000, 'THE', 5, 8], [5000, 'THAT', 11, 3], [9000, 'AN', 3, 0], [20000, 'ATTACK', 25, 25], [30000, 'NA', 17, 9]]) {
    const cipher = C.encrypt(corpus.slice(start, start + 600).replace(/ /g, ''), a, b);
    const r = C.cribSearch(cipher, crib);
    const expected = naive(cipher, crib);
    assert.deepEqual([...byKey(r).keys()].sort(), [...expected.keys()].sort(), crib);
    for (const [id, positions] of expected) assert.deepEqual(byKey(r).get(id), positions, `${crib} ${id}`);
    const scores = r.results.map((x) => x.score);
    assert.deepEqual(scores, [...scores].sort((x, y) => y - x), crib);
  }
});

test('差が13の単語（AN）では、1つの位置に鍵が12個残ることがある', () => {
  const cipher = C.encrypt('AN', 3, 0);
  const r = C.cribSearch(cipher, 'AN');
  assert.equal(r.results.length, 12);
  assert.deepEqual(r.results.map((x) => x.positions), Array(12).fill([0]));
});

test('文字の並び: 単語で同じ文字の位置は暗号文でも同じ文字、違う文字の位置は違う文字', () => {
  const word = C.lettersOf('THAT');
  assert.equal(C.samePattern(word, C.lettersOf('XYZX'), 0), true);
  assert.equal(C.samePattern(word, C.lettersOf('XYZW'), 0), false);
  assert.equal(C.samePattern(word, C.lettersOf('XYXX'), 0), false);
  assert.equal(C.samePattern(word, C.lettersOf('QXYZX'), 1), true);
});

test('単語の英字が2字未満・すべて同じ文字・暗号文より長いときは探さない。英字以外は無視する', () => {
  assert.equal(C.cribSearch('ABC', 'A').reason, 'cribShort');
  assert.equal(C.cribSearch('ABC', ' 1-2 ').reason, 'cribShort');
  assert.equal(C.cribSearch('ABC', 'EEE').reason, 'cribSame');
  assert.equal(C.cribSearch('AB', 'THE').reason, 'cribLong');
  const cipher = C.encrypt('there is the house', 5, 8);
  assert.deepEqual(C.cribSearch(cipher, 't-h e').results, C.cribSearch(cipher, 'THE').results);
});

test('位置の組: 単語の文字と暗号文字の組を、同じ平文字は1つにまとめて最大6組', () => {
  const cipher = C.encrypt('XXATTACKATDAWN', 5, 8);
  assert.deepEqual(C.cribPairsAt(cipher, 'ATTACK', 2), [['A', 'I'], ['T', 'Z'], ['C', 'S'], ['K', 'G']]);
  assert.deepEqual(C.cribPairsAt(cipher, 'ATTACKATDAWN', 2).length, 6);
  const r = C.solveFromKnown(C.cribPairsAt(cipher, 'ATTACK', 2));
  assert.deepEqual(r.keys, [{ a: 5, b: 8 }]);
});

test('10万字の暗号文でも、クリブで正しい鍵が1位になる', () => {
  let plain = '';
  const corpus = readCorpus('eval-pg98.txt');
  while (plain.length < C.MAX_TEXT) plain += corpus;
  plain = plain.slice(0, C.MAX_TEXT);
  const r = C.cribSearch(C.encrypt(plain, 19, 4), 'THE');
  assert.deepEqual([r.results[0].a, r.results[0].b], [19, 4]);
});
