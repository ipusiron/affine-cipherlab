// 学習用の英文（tools/corpus/train-pg1342.txt）から、隣り合う2文字の対数尤度の表を作り js/english-data.js に書く
// 使い方: node tools/build-english.mjs（--check で、今の js/english-data.js と同じかだけを見る）
// 英字だけを並べて数える（単語の切れ目をまたぐ組も数える。空白のない暗号文にも使うため）。各組に1を足してから、前の文字ごとの割合の自然対数
import fs from 'node:fs';

export const N = 26;
export const DIGITS = 3;

export function bigramTable(corpus) {
  const letters = corpus.toUpperCase().replace(/[^A-Z]/g, '');
  const counts = new Array(N * N).fill(1);
  for (let i = 1; i < letters.length; i++) counts[(letters.charCodeAt(i - 1) - 65) * N + letters.charCodeAt(i) - 65]++;
  const table = [];
  for (let p = 0; p < N; p++) {
    const row = counts.slice(p * N, p * N + N);
    const total = row.reduce((x, y) => x + y, 0);
    for (const c of row) table.push(Number(Math.log(c / total).toFixed(DIGITS)));
  }
  return { table, letters: letters.length };
}

export function render(corpus) {
  const { table, letters } = bigramTable(corpus);
  const lines = [];
  for (let i = 0; i < table.length; i += 13) lines.push('    ' + table.slice(i, i + 13).map((v) => v.toFixed(DIGITS)).join(', '));
  return [
    '// 生成物（tools/build-english.mjs が tools/corpus/train-pg1342.txt から作る。手で編集しない）',
    `// 隣り合う2文字の対数尤度 log P(後の文字 | 前の文字)。行＝前の文字 A〜Z、列＝後の文字 A〜Z。英字${letters}字から`,
    'globalThis.AffineEnglish = {',
    "  source: 'Project Gutenberg #1342 Pride and Prejudice (tools/corpus/train-pg1342.txt)',",
    '  bigram: [',
    lines.join(',\n'),
    '  ]',
    '};',
    ''
  ].join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('build-english.mjs')) {
  const corpus = fs.readFileSync(new URL('./corpus/train-pg1342.txt', import.meta.url), 'utf8');
  const out = render(corpus);
  const dst = new URL('../js/english-data.js', import.meta.url);
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === out;
    console.log(same ? 'js/english-data.js is up to date' : 'js/english-data.js differs');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(dst, out);
  console.log(`wrote js/english-data.js (${out.length} characters)`);
}
