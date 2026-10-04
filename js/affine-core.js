// Affine CipherLab の計算部（DOM に依存しない通常のスクリプト。file:// でも動く）。globalThis.AffineCore に置く
// 英字（A〜Z・a〜z）だけを変換し、大文字・小文字を保つ。ほかの文字（数字・記号・日本語など）はそのまま残す
(() => {
  'use strict';

  const N = 26;
  // 26 と互いに素な a（12個）。鍵は 12 × 26 ＝ 312 通り
  const VALID_A = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
  const MAX_TEXT = 100000;
  // 総当たりの採点に使う先頭の英字の数（長い暗号文でも速く終わるように。英文なら数百字で十分に当たる）
  const SCORE_LETTERS = 2000;
  // 単語の一致1つあたりの加点（隣り合う2文字の対数尤度と同じ単位）。tools/evaluate.mjs tune で学習用の英文から決めた
  const WORD_WEIGHT = 4;
  // 1位と2位の差がこれ未満なら「見分けにくい」と知らせる。tools/evaluate.mjs tune で学習用の英文から決めた
  const CLOSE_MARGIN = 3;

  // よく使う英単語（2文字以上）。空白で区切られた暗号文の総当たりで、単語の一致を数える
  const COMMON_WORDS = [
    'THE', 'AND', 'TO', 'OF', 'IN', 'IT', 'IS', 'THAT', 'AS', 'ON', 'WITH', 'THIS', 'BE', 'FOR', 'ARE', 'WAS', 'BY', 'YOU', 'NOT', 'OR',
    'HAVE', 'FROM', 'ONE', 'HAD', 'BUT', 'WORD', 'WERE', 'WE', 'WHEN', 'YOUR', 'CAN', 'SAID', 'THERE', 'EACH', 'WHICH', 'SHE', 'DO',
    'HOW', 'THEIR', 'IF', 'WILL', 'UP', 'OTHER', 'ABOUT', 'OUT', 'MANY', 'THEN', 'THEM', 'THESE', 'SO', 'SOME', 'HER', 'WOULD',
    'MAKE', 'LIKE', 'INTO', 'HIM', 'HAS', 'TWO', 'MORE', 'GO', 'NO', 'WAY', 'COULD', 'MY', 'THAN', 'FIRST', 'WATER', 'BEEN', 'CALL',
    'WHO', 'ITS', 'NOW', 'FIND', 'LONG', 'DOWN', 'DAY', 'DID', 'GET', 'COME', 'MADE', 'MAY', 'PART', 'NEW', 'SOUND', 'TAKE', 'ONLY',
    'LITTLE', 'WORK', 'KNOW', 'PLACE', 'YEAR', 'LIVE', 'ME', 'BACK', 'GIVE', 'MOST', 'VERY', 'AFTER', 'THING', 'OUR', 'JUST', 'NAME',
    'GOOD', 'SENTENCE', 'MAN', 'THINK', 'SAY', 'GREAT', 'WHERE', 'HELP', 'THROUGH', 'MUCH', 'BEFORE', 'LINE', 'RIGHT', 'TOO', 'MEAN',
    'OLD', 'ANY', 'SAME', 'TELL', 'BOY', 'FOLLOW', 'CAME', 'WANT', 'SHOW', 'ALSO', 'AROUND', 'FORM', 'THREE', 'SMALL', 'SET', 'PUT',
    'END', 'WHY', 'AGAIN', 'TURN', 'HERE', 'OFF', 'WENT', 'MOVE', 'TRY', 'KIND', 'HAND', 'PICTURE', 'CHANGE', 'PLAY', 'SPELL', 'AIR',
    'AWAY', 'ANIMAL', 'HOUSE', 'POINT', 'PAGE', 'LETTER', 'MOTHER', 'ANSWER', 'FOUND', 'STUDY', 'STILL', 'LEARN', 'SHOULD', 'AMERICA',
    'WORLD', 'HIGH', 'EVERY', 'NEAR', 'ADD', 'FOOD', 'BETWEEN', 'OWN', 'BELOW', 'COUNTRY', 'PLANT', 'LAST', 'SCHOOL', 'FATHER', 'KEEP',
    'TREE', 'NEVER', 'START', 'CITY', 'EARTH', 'EYE', 'LIGHT', 'THOUGHT', 'HEAD', 'UNDER', 'STORY', 'SAW', 'LEFT', 'DONT', 'FEW',
    'WHILE', 'ALONG', 'MIGHT', 'CLOSE', 'SOMETHING', 'SEEM', 'NEXT', 'HARD', 'OPEN', 'EXAMPLE', 'BEGIN', 'LIFE', 'ALWAYS', 'THOSE', 'BOTH',
    'PAPER', 'TOGETHER', 'GOT', 'GROUP', 'OFTEN', 'RUN', 'IMPORTANT', 'UNTIL', 'CHILDREN', 'SIDE', 'FEET', 'CAR', 'MILE', 'NIGHT', 'WALK',
    'WHITE', 'SEA', 'BEGAN', 'GROW', 'TOOK', 'RIVER', 'FOUR', 'CARRY', 'STATE', 'ONCE', 'BOOK', 'HEAR', 'STOP', 'WITHOUT', 'SECOND',
    'LATER', 'MISS', 'IDEA', 'ENOUGH', 'EAT', 'FACE', 'WATCH', 'FAR', 'INDIAN', 'REALLY', 'ALMOST', 'LET', 'ABOVE', 'GIRL', 'SOMETIMES',
    'MOUNTAIN', 'CUT', 'YOUNG', 'TALK', 'SOON', 'LIST', 'SONG', 'BEING', 'LEAVE', 'FAMILY', 'HELLO', 'LOVE', 'TIME', 'BAD', 'LARGE',
    'ABLE', 'WOMAN', 'HISTORY', 'WELL', 'NEED', 'DIFFERENT'
  ];
  const WORD_SET = new Set(COMMON_WORDS);

  const mod = (n, m) => ((n % m) + m) % m;

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) [a, b] = [b, a % b];
    return a;
  }

  // 拡張ユークリッドの互除法: a·x + b·y = g（＝gcd(a, b)）となる x, y を返す。
  // rows は途中の行（余り r、商 q、係数 s・t。各行で a·s + b·t = r）で、座学の表に使う
  function egcd(a, b) {
    const rows = [{ r: a, q: null, s: 1, t: 0 }, { r: b, q: null, s: 0, t: 1 }];
    while (rows[rows.length - 1].r !== 0) {
      const [p, c] = rows.slice(-2);
      const q = Math.floor(p.r / c.r);
      rows.push({ r: p.r - q * c.r, q, s: p.s - q * c.s, t: p.t - q * c.t });
    }
    const last = rows[rows.length - 2];
    return { g: last.r, x: last.s, y: last.t, rows };
  }

  // a の逆元（a·a⁻¹ ≡ 1 mod m）。なければ null
  function modInverse(a, m = N) {
    const { g, x } = egcd(mod(a, m), m);
    return g === 1 ? mod(x, m) : null;
  }

  const isValidA = (a) => VALID_A.includes(a);

  // 鍵の入力を読む。整数だけを受け付け、a は1〜25、b は0〜25。
  // a が 26 と互いに素でないときは値を返しつつ notCoprime を付ける（暗号化は単射でない例として見せられる）
  function parseKey(raw, kind) {
    const s = String(raw ?? '').trim();
    if (!/^[+-]?\d+$/.test(s)) return { ok: false, error: s ? 'notInteger' : 'empty' };
    const value = Number(s);
    if (kind === 'a') {
      if (value < 1 || value > 25) return { ok: false, error: 'aRange' };
      return isValidA(value) ? { ok: true, value } : { ok: true, value, warning: 'notCoprime', gcd: gcd(value, N) };
    }
    if (value < 0 || value > 25) return { ok: false, error: 'bRange' };
    return { ok: true, value };
  }

  // 暗号化の写像（平文の文字 0〜25 → 暗号文の文字）
  const encryptMap = (a, b) => Array.from({ length: N }, (_, m) => mod(a * m + b, N));

  // 復号の写像（暗号文の文字 → 平文の文字）。a に逆元がなければ null
  function decryptMap(a, b) {
    const inv = modInverse(a);
    return inv === null ? null : Array.from({ length: N }, (_, c) => mod(inv * (c - b), N));
  }

  // 英字だけを写像で置き換える（大文字・小文字を保つ）
  function applyMap(text, map) {
    let out = '';
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) out += String.fromCharCode(65 + map[code - 65]);
      else if (code >= 97 && code <= 122) out += String.fromCharCode(97 + map[code - 97]);
      else out += ch;
    }
    return out;
  }

  // 「空白を除去」「記号を除去」（記号の除去は英字と空白以外をすべて除く。数字・日本語も消える）
  function preprocess(text, { stripSpaces = false, stripSymbols = false } = {}) {
    let t = String(text ?? '');
    if (stripSpaces) t = t.replace(/\s+/g, '');
    if (stripSymbols) t = t.replace(/[^A-Za-z\s]/g, '');
    return t;
  }

  const encrypt = (text, a, b, opts) => applyMap(preprocess(text, opts), encryptMap(a, b));

  function decrypt(text, a, b, opts) {
    const map = decryptMap(a, b);
    return map ? applyMap(preprocess(text, opts), map) : null;
  }

  // 文字列に出てくる英字（0〜25、大文字・小文字を区別しない）
  function letterSet(text) {
    const set = new Set();
    for (const ch of String(text ?? '')) {
      const code = ch.toUpperCase().charCodeAt(0);
      if (code >= 65 && code <= 90) set.add(code - 65);
    }
    return set;
  }

  function letterCount(text) {
    let n = 0;
    for (const ch of String(text ?? '')) {
      const code = ch.charCodeAt(0);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) n++;
    }
    return n;
  }

  // 全角英字（Ａ〜Ｚ・ａ〜ｚ）の数。変換しないので、半角に直すよう知らせる
  function fullwidthLetterCount(text) {
    let n = 0;
    for (const ch of String(text ?? '')) {
      const code = ch.charCodeAt(0);
      if ((code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a)) n++;
    }
    return n;
  }

  // 写像表の行。a が互いに素でないと、同じ暗号文字に複数の平文字が写る（duplicate）
  function mappingRows(a, b) {
    const map = encryptMap(a, b);
    const count = new Array(N).fill(0);
    for (const c of map) count[c]++;
    return map.map((c, m) => ({ m, c, duplicate: count[c] > 1 }));
  }

  // ===== 英語らしさ（総当たりの採点） =====
  const bigramTable = () => globalThis.AffineEnglish.bigram;

  // 英字だけを並べたときの、隣り合う2文字の対数尤度の和（学習用の英文の表から）
  function bigramScore(text) {
    const table = bigramTable();
    let prev = -1;
    let sum = 0;
    let pairs = 0;
    for (const ch of text) {
      const code = ch.toUpperCase().charCodeAt(0);
      if (code < 65 || code > 90) continue;
      const x = code - 65;
      if (prev >= 0) {
        sum += table[prev * N + x];
        pairs++;
      }
      prev = x;
    }
    return { sum, pairs };
  }

  // 英字以外で区切った語のうち、よく使う英単語（2文字以上）の数
  function wordHits(text) {
    let hits = 0;
    for (const w of String(text).toUpperCase().split(/[^A-Z]+/)) if (w.length >= 2 && WORD_SET.has(w)) hits++;
    return hits;
  }

  function englishScore(text, wordWeight = WORD_WEIGHT) {
    const { sum, pairs } = bigramScore(text);
    const words = wordHits(text);
    return { score: sum + wordWeight * words, bigram: sum, pairs, words };
  }

  // 先頭から英字が count 字になるまでの部分
  function prefixByLetters(text, count) {
    let n = 0;
    let i = 0;
    for (; i < text.length && n < count; i++) {
      const code = text.charCodeAt(i);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) n++;
    }
    return text.slice(0, i);
  }

  // 312 通りの鍵をすべて試し、英語らしさの高い順に並べる。採点は先頭 SCORE_LETTERS 字まで
  function bruteForce(cipher, { wordWeight = WORD_WEIGHT } = {}) {
    const text = String(cipher ?? '');
    const prefix = prefixByLetters(text, SCORE_LETTERS);
    const results = [];
    for (const a of VALID_A) {
      for (let b = 0; b < N; b++) {
        const preview = applyMap(prefix, decryptMap(a, b));
        const s = englishScore(preview, wordWeight);
        results.push({ a, b, preview, ...s });
      }
    }
    results.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
    const margin = results[0].score - results[1].score;
    const letters = letterCount(text);
    return { results, margin, close: margin < CLOSE_MARGIN, letters, scored: Math.min(letters, SCORE_LETTERS) };
  }

  globalThis.AffineCore = {
    N, VALID_A, MAX_TEXT, SCORE_LETTERS, WORD_WEIGHT, CLOSE_MARGIN, COMMON_WORDS,
    mod, gcd, egcd, modInverse, isValidA, parseKey, encryptMap, decryptMap, applyMap, preprocess, encrypt, decrypt,
    letterSet, letterCount, fullwidthLetterCount, mappingRows, bigramScore, wordHits, englishScore, prefixByLetters, bruteForce
  };
})();
