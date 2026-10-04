// 総当たりの1位が正解になる割合を、決まった種の乱数で測る（README の表とテストで使う）
// 使い方: node tools/evaluate.mjs tune（学習用の英文で単語の重みと「見分けにくい」の境目を選ぶ）
//         node tools/evaluate.mjs eval（評価用の英文で長さ別の正答率を出す）
//         node tools/evaluate.mjs write（その正答率を js/accuracy.js に書く）
//         node tools/evaluate.mjs freq（多い文字を E・T と仮定する手順の正答率を出す）
//         node tools/evaluate.mjs crib（既知の単語 THE・THAT を当てたとき、残る鍵の数を出す）
import fs from 'node:fs';
import { loadCore } from './load-core.mjs';

export const SEED = 20261004;
export const TRIALS = 300;
export const LENGTHS = [6, 8, 10, 15, 20, 30];

export function xorshift32(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export const readCorpus = (name) => fs.readFileSync(new URL(`./corpus/${name}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');

// 英文の抜粋から、単語の切れ目で始まり英字が len 字になるまでの平文を取り、鍵を選んで暗号化する
export function samples(corpus, len, trials, spaces, seed = SEED) {
  const C = loadCore();
  const rnd = xorshift32(seed + len * 7919 + (spaces ? 1 : 0));
  const out = [];
  for (let t = 0; t < trials; t++) {
    let i = corpus.indexOf(' ', Math.floor(rnd() * (corpus.length - 1000))) + 1;
    let plain = '';
    let n = 0;
    while (n < len) {
      const ch = corpus[i++];
      if (ch !== ' ') n++;
      plain += ch;
    }
    plain = plain.trim();
    if (!spaces) plain = plain.replace(/ /g, '');
    const a = C.VALID_A[Math.floor(rnd() * 12)];
    const b = Math.floor(rnd() * 26);
    out.push({ plain, a, b, cipher: C.encrypt(plain, a, b) });
  }
  return out;
}

// 長さごとの1位の正答率（平文が元に戻ったか）と、1位と2位の差
export function evaluate(corpus, { lengths = LENGTHS, trials = TRIALS, spaces = true, wordWeight, seed = SEED } = {}) {
  const C = loadCore();
  const rows = [];
  for (const len of lengths) {
    let correct = 0;
    const margins = [];
    for (const s of samples(corpus, len, trials, spaces, seed)) {
      const r = C.bruteForce(s.cipher, wordWeight === undefined ? {} : { wordWeight });
      const ok = r.results[0].preview === s.plain;
      if (ok) correct++;
      margins.push({ margin: r.margin, ok });
    }
    rows.push({ len, correct, trials, margins });
  }
  return rows;
}

// 多い文字を E・T と仮定する手順で、1つ目の仮定が正解だった割合と、仮定のどれかに正解があった割合
export const FREQ_LENGTHS = [50, 100, 200, 500, 1000];
export function evaluateFrequency(corpus, { lengths = FREQ_LENGTHS, trials = TRIALS, seed = SEED } = {}) {
  const C = loadCore();
  return lengths.map((len) => {
    let first = 0;
    let within = 0;
    for (const s of samples(corpus, len, trials, true, seed)) {
      const hit = C.frequencyHypotheses(s.cipher).findIndex((h) => h.keys.some((k) => k.a === s.a && k.b === s.b));
      if (hit === 0) first++;
      if (hit >= 0) within++;
    }
    return { len, first, within, trials };
  });
}

// 既知の単語（クリブ）を当てる手順。空白なしの暗号文で、平文がその単語を含んだ割合と、含んだときに残った鍵の数の平均・1位が正解の割合
export const CRIB_WORDS = ['THE', 'THAT'];
export const CRIB_LENGTHS = [50, 100, 200, 500];
export function evaluateCrib(corpus, { words = CRIB_WORDS, lengths = CRIB_LENGTHS, trials = TRIALS, seed = SEED } = {}) {
  const C = loadCore();
  return words.map((word) => ({
    word,
    rows: lengths.map((len) => {
      let contained = 0;
      let keys = 0;
      let top = 0;
      for (const s of samples(corpus, len, trials, false, seed)) {
        if (!s.plain.includes(word)) continue;
        const r = C.cribSearch(s.cipher, word);
        contained++;
        keys += r.results.length;
        if (r.results[0].a === s.a && r.results[0].b === s.b) top++;
      }
      return { len, contained, keys, top, trials };
    })
  }));
}

function tune() {
  const corpus = readCorpus('train-pg1342.txt');
  console.log('単語の重み（学習用の英文、空白あり、長さ 6・8・10・15・20 の平均）');
  for (const w of [0, 1, 2, 3, 4, 6, 8]) {
    const rows = evaluate(corpus, { lengths: [6, 8, 10, 15, 20], spaces: true, wordWeight: w });
    const mean = rows.reduce((p, r) => p + r.correct / r.trials, 0) / rows.length;
    console.log(`  w=${w}: ${rows.map((r) => `${r.len}字 ${(100 * r.correct / r.trials).toFixed(1)}%`).join(' / ')}  平均 ${(100 * mean).toFixed(1)}%`);
  }
  const all = [...evaluate(corpus, { spaces: true }), ...evaluate(corpus, { spaces: false })].flatMap((r) => r.margins);
  console.log(`1位と2位の差の境目（今の重み、空白あり・なし、${all.length}件）`);
  for (const t of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const below = all.filter((m) => m.margin < t);
    const above = all.filter((m) => m.margin >= t);
    const rate = (xs) => (xs.length ? (100 * xs.filter((m) => m.ok).length / xs.length).toFixed(1) : '—');
    console.log(`  差<${t}: ${below.length}件・1位が正解 ${rate(below)}%  ／  差≥${t}: ${above.length}件・1位が正解 ${rate(above)}%`);
  }
}

// 評価用の英文での正答率を js/accuracy.js の形にする（画面で「英字が少ないと外れやすい」と知らせるのに使う）
export function renderAccuracy() {
  const corpus = readCorpus('eval-pg98.txt');
  const pct = (n, total) => (100 * n / total).toFixed(1);
  const rate = (rows) => rows.map((r) => `[${r.len}, ${pct(r.correct, r.trials)}]`).join(', ');
  return [
    '// 生成物（tools/evaluate.mjs write が tools/corpus/eval-pg98.txt から作る。手で編集しない）',
    `// 総当たりの1位が正解になった割合（%）。[英字の数, 割合]。各${TRIALS}回、乱数の種 ${SEED}`,
    'globalThis.AffineAccuracy = {',
    "  source: 'Project Gutenberg #98 A Tale of Two Cities (tools/corpus/eval-pg98.txt)',",
    `  trials: ${TRIALS},`,
    `  spaces: [${rate(evaluate(corpus, { spaces: true }))}],`,
    `  noSpaces: [${rate(evaluate(corpus, { spaces: false }))}],`,
    '  // 多い文字を E・T と仮定する手順: [英字の数, 1つ目の仮定が正解の割合, 30通りのどれかに正解がある割合]',
    `  frequency: [${evaluateFrequency(corpus).map((r) => `[${r.len}, ${pct(r.first, r.trials)}, ${pct(r.within, r.trials)}]`).join(', ')}],`,
    '  // 既知の単語を当てる手順（空白なし）: { 単語: [[英字の数, 平文が単語を含んだ割合, 含んだときに残った鍵の数の平均, 含んだときに1位が正解の割合]] }',
    '  crib: {',
    evaluateCrib(corpus).map((c) => `    ${c.word}: [${c.rows.map((r) => `[${r.len}, ${pct(r.contained, r.trials)}, `
      + `${(r.keys / r.contained).toFixed(2)}, ${pct(r.top, r.contained)}]`).join(', ')}]`).join(`,${String.fromCharCode(10)}`),
    '  }',
    '};',
    ''
  ].join(String.fromCharCode(10));
}

if (process.argv[1] && process.argv[1].endsWith('evaluate.mjs')) {
  if (process.argv[2] === 'tune') tune();
  else if (process.argv[2] === 'write') {
    fs.writeFileSync(new URL('../js/accuracy.js', import.meta.url), renderAccuracy());
    console.log('wrote js/accuracy.js');
  } else if (process.argv[2] === 'freq') {
    for (const r of evaluateFrequency(readCorpus('eval-pg98.txt'))) {
      console.log(`${r.len}字: 1つ目の仮定が正解 ${(100 * r.first / r.trials).toFixed(1)}% / どれかに正解 ${(100 * r.within / r.trials).toFixed(1)}%`);
    }
  } else if (process.argv[2] === 'crib') {
    for (const c of evaluateCrib(readCorpus('eval-pg98.txt'))) {
      for (const r of c.rows) {
        console.log(`${c.word} ${r.len}字: 含む ${(100 * r.contained / r.trials).toFixed(1)}% / 残る鍵 平均 ${(r.keys / r.contained).toFixed(2)}`
          + ` / 1位が正解 ${(100 * r.top / r.contained).toFixed(1)}%`);
      }
    }
  } else {
    const corpus = readCorpus('eval-pg98.txt');
    for (const spaces of [true, false]) {
      const rows = evaluate(corpus, { spaces });
      console.log(`${spaces ? '空白あり' : '空白なし'}: ${rows.map((r) => `${r.len}字 ${(100 * r.correct / r.trials).toFixed(1)}%`).join(' / ')}`);
    }
  }
}
