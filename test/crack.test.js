import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { core, read } from './load.js';
import { render } from '../tools/build-english.mjs';
import { evaluate, readCorpus } from '../tools/evaluate.mjs';

const C = core();
const sha = (s) => createHash('sha256').update(s).digest('hex');

test('英文の抜粋は作ったときのまま（Project Gutenberg #1342・#98 から tools/make-corpus.mjs で作成）', () => {
  assert.equal(sha(read('tools/corpus/train-pg1342.txt')), '3c73d38946b91b3d059f9adb66a0937dc31db5f797b6a1bb756f849eacb53d6f');
  assert.equal(sha(read('tools/corpus/eval-pg98.txt')), '7f5c6611882a10e7a9bc0257250f186a0ddb600771361bad6d608dbba5dbcf43');
});

test('js/english-data.js は tools/build-english.mjs の出力と一致する（手で編集されていない）', () => {
  assert.equal(read('js/english-data.js'), render(read('tools/corpus/train-pg1342.txt')));
  const table = globalThis.AffineEnglish.bigram;
  assert.equal(table.length, 676);
  for (let p = 0; p < 26; p++) {
    const total = table.slice(p * 26, p * 26 + 26).reduce((x, v) => x + Math.exp(v), 0);
    assert.ok(Math.abs(total - 1) < 0.01, String(p));
  }
});

test('総当たりは312通りを英語らしさの順に並べ、短い文でも正しい鍵を1位にする', () => {
  const r = C.bruteForce('Rclla Oaplx!');
  assert.equal(r.results.length, 312);
  assert.deepEqual([r.results[0].a, r.results[0].b, r.results[0].preview], [5, 8, 'Hello World!']);
  for (let i = 1; i < r.results.length; i++) assert.ok(r.results[i - 1].score >= r.results[i].score);
  assert.equal(r.close, false);
  const long = C.bruteForce(C.encrypt('Attack at dawn. The enemy is coming from the north.', 7, 10));
  assert.deepEqual([long.results[0].a, long.results[0].b], [7, 10]);
});

test('1位と2位の差が小さいときは「見分けにくい」。同じ平文になる鍵がある文字列では差が0', () => {
  const r = C.bruteForce(C.encrypt('MEETMEATNOON', 3, 5));
  assert.equal(r.results[0].preview, 'MEETMEATNOON');
  assert.ok(r.margin < C.CLOSE_MARGIN && r.close);
  const same = C.bruteForce('AAAA');
  assert.equal(same.margin, 0);
  assert.equal(same.close, true);
});

test('採点は先頭の英字2,000字まで。長い暗号文でも鍵を当てる', () => {
  const text = readCorpus('eval-pg98.txt').slice(0, 30000);
  const r = C.bruteForce(C.encrypt(text, 11, 4));
  assert.equal(r.scored, C.SCORE_LETTERS);
  assert.ok(r.letters > C.SCORE_LETTERS);
  assert.deepEqual([r.results[0].a, r.results[0].b], [11, 4]);
  assert.equal(C.prefixByLetters('AB CD EF', 3), 'AB C');
});

test('単語の一致を足すと、空白のある短い文の正答率が上がる（学習用の英文、10字、決まった種）', () => {
  const corpus = readCorpus('train-pg1342.txt');
  const [withWords] = evaluate(corpus, { lengths: [10], trials: 150, spaces: true });
  const [bigramOnly] = evaluate(corpus, { lengths: [10], trials: 150, spaces: true, wordWeight: 0 });
  assert.ok(withWords.correct > bigramOnly.correct, `${withWords.correct} vs ${bigramOnly.correct}`);
  assert.equal(C.WORD_WEIGHT, 4);
  assert.equal(C.CLOSE_MARGIN, 3);
});
