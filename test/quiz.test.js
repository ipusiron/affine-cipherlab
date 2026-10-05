import test from 'node:test';
import assert from 'node:assert/strict';
import { core } from './load.js';

const C = core();
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

test('同じ問題番号なら同じ問題になる。問題番号1は固定（番号を共有すれば、同じ問題を解ける）', () => {
  assert.deepEqual(C.makeQuiz(42), C.makeQuiz(42));
  assert.notDeepEqual(C.makeQuiz(1), C.makeQuiz(2));
  const q = C.makeQuiz(1);
  assert.deepEqual(q.map((x) => x.type), ['inverse', 'encrypt', 'decrypt', 'pairs', 'text']);
  assert.deepEqual(q[0], { type: 'inverse', a: 3, answer: 9 });
  assert.deepEqual(q[1], { type: 'encrypt', a: 19, b: 15, m: 8, answer: 11 });
  assert.deepEqual(q[4].answer, { a: 11, b: 3 });
  assert.equal(q[4].plain, 'NO NEWS IS GOOD NEWS');
  for (const s of SEEDS) {
    const r = C.quizRandom(s);
    for (let i = 0; i < 20; i++) {
      const x = r();
      assert.ok(x >= 0 && x < 1);
    }
  }
});

test('答えは別の計算で確かめても正しい。a=1・25は使わず、既知の2組の問題は鍵が1つに決まる', () => {
  for (const s of SEEDS) {
    const [inv, enc, dec, pairs, text] = C.makeQuiz(s);
    for (const q of [inv, enc, dec, pairs.answer, text.answer]) assert.ok(C.VALID_A.includes(q.a) && q.a !== 1 && q.a !== 25, `${s}`);
    assert.equal((inv.a * inv.answer) % 26, 1);
    assert.equal(enc.answer, (enc.a * enc.m + enc.b) % 26);
    assert.equal((dec.a * dec.answer + dec.b) % 26, dec.c);
    const [[p1, c1], [p2, c2]] = pairs.pairs;
    const L = (i) => String.fromCharCode(65 + i);
    assert.deepEqual(C.solveFromPairs(L(p1), L(c1), L(p2), L(c2)).keys, [pairs.answer], `${s}`);
    assert.equal(C.decrypt(text.cipher, text.answer.a, text.answer.b), text.plain);
    assert.ok(C.PROVERBS.includes(text.plain));
  }
});

test('短い暗号文の例文は、どれも総当たりの1位で元に戻り、1位と2位の差が3以上（鍵によらず候補の集まりは同じ）', () => {
  for (const p of C.PROVERBS) {
    assert.match(p, /^[A-Z]+( [A-Z]+)*$/, p);
    for (const [a, b] of [[3, 7], [21, 20]]) {
      const r = C.bruteForce(C.encrypt(p, a, b));
      assert.equal(r.results[0].preview, p, p);
      assert.deepEqual([r.results[0].a, r.results[0].b], [a, b], p);
      assert.equal(r.close, false, p);
    }
  }
});

test('答え合わせ: 前後の空白・小文字は許し、形の違う答えは不正解', () => {
  const [inv, enc, , pairs] = C.makeQuiz(1);
  assert.equal(C.checkQuizAnswer(inv, ' 9 '), true);
  assert.equal(C.checkQuizAnswer(inv, '9.0'), false);
  assert.equal(C.checkQuizAnswer(inv, ''), false);
  assert.equal(C.checkQuizAnswer(inv, '35'), false);
  assert.equal(C.checkQuizAnswer(enc, 'l'), true);
  assert.equal(C.checkQuizAnswer(enc, 'L'), true);
  assert.equal(C.checkQuizAnswer(enc, '11'), false);
  const { a, b } = pairs.answer;
  assert.equal(C.checkQuizAnswer(pairs, { a: String(a), b: ` ${b}` }), true);
  assert.equal(C.checkQuizAnswer(pairs, { a: String(a), b: String(b + 26) }), false);
  assert.equal(C.checkQuizAnswer(pairs, { a: '', b: String(b) }), false);
  assert.equal(C.checkQuizAnswer(pairs, null), false);
});
