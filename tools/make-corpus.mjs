// Project Gutenberg のテキストから、採点の表づくりと評価に使う英文の抜粋を作る（開発用。画面では使わない）
// 使い方: node tools/make-corpus.mjs <pgXXXX.txt> <出力.txt>
// 本文（*** START OF … と *** END OF … の間）を大文字にし、英字以外の並びを空白1つにそろえる。
// 前付け・序文を避けるため先頭の SKIP 字を除き、次の TAKE 字ほど（単語の途中で切らない）を、1行100字前後で書き出す。
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const SKIP = 30000;
export const TAKE = 200000;

export function excerpt(raw) {
  const text = raw.replace(/\r\n?/g, '\n');
  const start = text.indexOf('\n', text.indexOf('*** START OF'));
  const end = text.indexOf('*** END OF');
  if (start < 0 || end < 0 || end <= start) throw new Error('Project Gutenberg の本文の区切りが見つからない');
  const words = text.slice(start, end).toUpperCase().replace(/[^A-Z]+/g, ' ').trim().split(' ');
  let skipped = 0;
  let i = 0;
  while (i < words.length && skipped < SKIP) skipped += words[i++].length + 1;
  const lines = [];
  let line = '';
  let taken = 0;
  for (; i < words.length && taken < TAKE; i++) {
    if (line && line.length + 1 + words[i].length > 100) {
      lines.push(line);
      line = '';
    }
    line = line ? `${line} ${words[i]}` : words[i];
    taken += words[i].length + 1;
  }
  if (taken < TAKE) throw new Error('本文が短すぎる');
  if (line) lines.push(line);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('make-corpus.mjs')) {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) {
    console.error('usage: node tools/make-corpus.mjs <pgXXXX.txt> <out.txt>');
    process.exit(2);
  }
  const raw = fs.readFileSync(src, 'utf8');
  const out = excerpt(raw);
  fs.writeFileSync(dst, out);
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  console.log(`source sha256 ${sha(fs.readFileSync(src))}`);
  console.log(`output sha256 ${sha(out)} (${out.length} characters)`);
}
