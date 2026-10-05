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

  // ===== 手で解く（既知平文・頻度による仮定） =====
  // 1文字の英字を 0〜25 に。英字1文字でなければ null
  function letterIndex(ch) {
    const s = String(ch ?? '').trim();
    if (s.length !== 1) return null;
    const code = s.toUpperCase().charCodeAt(0);
    return code >= 65 && code <= 90 ? code - 65 : null;
  }

  // 既知の2組（平文字 p → 暗号文字 c）から鍵を解く。
  // 2つの式を引くと c1 − c2 ≡ a·(p1 − p2) (mod 26)。これを a について解き、b = c1 − a·p1。
  // 平文字の差 dp が26と互いに素なら a は1つ。g = gcd(dp, 26) > 1 なら、解は g 個か、なし（26と互いに素な a だけが鍵になる）
  function solveFromPairs(p1, c1, p2, c2) {
    const [P1, C1, P2, C2] = [p1, c1, p2, c2].map(letterIndex);
    if ([P1, C1, P2, C2].includes(null)) return { ok: false, reason: 'notLetter', keys: [] };
    const dp = mod(P1 - P2, N);
    const dc = mod(C1 - C2, N);
    const base = { p: [P1, P2], c: [C1, C2], dp, dc, keys: [] };
    if (dp === 0) return { ...base, ok: false, reason: dc === 0 ? 'samePair' : 'contradiction' };
    const g = gcd(dp, N);
    if (dc % g !== 0) return { ...base, ok: false, g, reason: 'noSolution' };
    const m = N / g;
    const inv = modInverse(dp / g, m);
    const a0 = mod((dc / g) * inv, m);
    const candidates = Array.from({ length: g }, (_, k) => a0 + k * m);
    const keys = candidates.filter(isValidA).map((a) => ({ a, b: mod(C1 - a * P1, N) }));
    const reason = keys.length === 0 ? 'noValidA' : keys.length > 1 ? 'several' : null;
    return { ...base, ok: keys.length > 0, g, m, inv, a0, candidates, keys, reason };
  }

  // 暗号文の英字の出現数（多い順。同じ数なら A に近い順）
  function letterFrequencies(text) {
    const counts = new Array(N).fill(0);
    for (const ch of String(text ?? '')) {
      const code = ch.toUpperCase().charCodeAt(0);
      if (code >= 65 && code <= 90) counts[code - 65]++;
    }
    return counts.map((n, i) => ({ i, n })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n || x.i - y.i);
  }

  // 多い文字を E・T と仮定して鍵を解く手順。多い順に上位 HYPOTHESIS_LETTERS（6）文字から、
  // （1位→E, 2位→T）・（2位→E, 1位→T）・（1位→E, 3位→T）… の順に試し、それぞれの鍵で戻した文の英語らしさを付ける
  const HYPOTHESIS_LETTERS = 6;
  const E = 4;
  const T = 19;
  function frequencyHypotheses(cipher, letters = HYPOTHESIS_LETTERS) {
    const freq = letterFrequencies(cipher).slice(0, letters);
    const order = [];
    for (let s = 1; s < freq.length; s++) for (let i = 0; i < s; i++) order.push([i, s], [s, i]);
    const text = prefixByLetters(String(cipher ?? ''), SCORE_LETTERS);
    return order.map(([i, j], k) => {
      const ce = freq[i];
      const ct = freq[j];
      const L = (i) => String.fromCharCode(65 + i);
      const solved = solveFromPairs(L(E), L(ce.i), L(T), L(ct.i));
      const keys = solved.keys.map((key) => {
        const preview = applyMap(text, decryptMap(key.a, key.b));
        return { ...key, preview, score: englishScore(preview).score };
      });
      return { step: k + 1, cipherE: ce.i, cipherT: ct.i, countE: ce.n, countT: ct.n, solved, keys };
    });
  }

  // ===== 手で解く: 3つ目以降の組で絞り込む =====
  // 既知の組（平文字 → 暗号文字）がいくつあっても解く。最初の組と、平文字が最初と違う最初の組の2つで鍵を解き（solveFromPairs）、
  // 残りの組で a·p + b ≡ c を満たす鍵だけを残す（鍵が残らなくなったら、そこで止める）。同じ組の重複は1つとみなし、同じ平文字に別の暗号文字があれば矛盾
  function solveFromKnown(pairs) {
    const idx = pairs.map(([p, c]) => [letterIndex(p), letterIndex(c)]);
    const bad = idx.findIndex(([p, c]) => p === null || c === null);
    if (bad >= 0) return { ok: false, reason: 'notLetter', pair: bad, checks: [], keys: [] };
    for (let j = 1; j < idx.length; j++) {
      const i = idx.slice(0, j).findIndex(([p, c]) => p === idx[j][0] && c !== idx[j][1]);
      if (i >= 0) return { ok: false, reason: 'contradiction', conflict: [i, j], checks: [], keys: [] };
    }
    const second = idx.findIndex(([p]) => p !== idx[0][0]);
    if (second < 0) return { ok: false, reason: 'samePair', checks: [], keys: [] };
    const base = solveFromPairs(...[idx[0], idx[second]].flat().map((i) => String.fromCharCode(65 + i)));
    const head = { base, basePairs: [0, second], checks: [] };
    if (!base.ok) return { ...head, ok: false, reason: base.reason, keys: [] };
    let keys = base.keys;
    idx.forEach(([p, c], k) => {
      if (!keys.length || k === 0 || k === second || idx.slice(0, k).some(([q]) => q === p)) return;
      const got = (key) => mod(key.a * p + key.b, N);
      const kept = keys.filter((key) => got(key) === c);
      const removed = keys.filter((key) => got(key) !== c).map((key) => ({ ...key, got: got(key) }));
      head.checks.push({ pair: k, p, c, before: keys.length, kept, removed });
      keys = kept;
    });
    const reason = keys.length === 0 ? 'eliminated' : keys.length > 1 ? 'several' : null;
    return { ...head, ok: keys.length > 0, reason, keys };
  }

  // ===== 手で解く: 既知の単語（クリブ）を当てる =====
  // 文字列の英字だけを 0〜25 の並びにする（大文字・小文字を区別しない）
  function lettersOf(text) {
    const out = [];
    for (const ch of String(text ?? '')) {
      const code = ch.toUpperCase().charCodeAt(0);
      if (code >= 65 && code <= 90) out.push(code - 65);
    }
    return out;
  }

  // 単語と、暗号文の pos からの並びで、同じ文字の位置がそろうか（1対1の置き換えなら、同じ文字は同じ文字に、違う文字は違う文字になる）
  function samePattern(word, seq, pos) {
    const toCipher = new Array(N).fill(-1);
    const toPlain = new Array(N).fill(-1);
    for (let k = 0; k < word.length; k++) {
      const p = word[k];
      const c = seq[pos + k];
      if (toCipher[p] === -1 && toPlain[c] === -1) {
        toCipher[p] = c;
        toPlain[c] = p;
      } else if (toCipher[p] !== c || toPlain[c] !== p) {
        return false;
      }
    }
    return true;
  }

  // 平文に含まれていそうな単語（クリブ）を、暗号文の英字の並びの各位置に当てる。
  // 1) 文字の並びがそろう位置だけを残す 2) 単語の1文字目と、1文字目と違う最初の文字の2組から鍵を解く 3) 残りの文字で確かめる。
  // 合った鍵ごとに位置（英字の何字目か、0 から）をまとめ、戻した文の英語らしさの順に並べる。英字以外の文字は単語・暗号文とも無視する
  function cribSearch(cipher, crib) {
    const word = lettersOf(crib);
    const wordText = word.map((i) => String.fromCharCode(65 + i)).join('');
    if (word.length < 2) return { ok: false, reason: 'cribShort', word: wordText, results: [] };
    const second = word.findIndex((x) => x !== word[0]);
    if (second < 0) return { ok: false, reason: 'cribSame', word: wordText, results: [] };
    const seq = lettersOf(cipher);
    if (seq.length < word.length) return { ok: false, reason: 'cribLong', word: wordText, letters: seq.length, results: [] };
    const L = (i) => String.fromCharCode(65 + i);
    const positions = seq.length - word.length + 1;
    const rejected = { pattern: 0, noKey: 0, mismatch: 0 };
    const found = new Map();
    let matched = 0;
    for (let pos = 0; pos < positions; pos++) {
      if (!samePattern(word, seq, pos)) {
        rejected.pattern++;
        continue;
      }
      const r = solveFromPairs(L(word[0]), L(seq[pos]), L(word[second]), L(seq[pos + second]));
      if (!r.ok) {
        rejected.noKey++;
        continue;
      }
      const keys = r.keys.filter((key) => word.every((p, k) => mod(key.a * p + key.b, N) === seq[pos + k]));
      if (!keys.length) {
        rejected.mismatch++;
        continue;
      }
      matched++;
      for (const key of keys) {
        const id = key.a * N + key.b;
        if (!found.has(id)) found.set(id, { a: key.a, b: key.b, positions: [] });
        found.get(id).positions.push(pos);
      }
    }
    const text = prefixByLetters(String(cipher ?? ''), SCORE_LETTERS);
    const results = [...found.values()].map((k) => {
      const preview = applyMap(text, decryptMap(k.a, k.b));
      return { ...k, preview, score: englishScore(preview).score };
    });
    results.sort((x, y) => y.score - x.score || y.positions.length - x.positions.length || x.a - y.a || x.b - y.b);
    return { ok: true, word: wordText, second, letters: seq.length, positions, rejected, matched, results };
  }

  // クリブを pos に当てたときの組（平文字 → 暗号文字）。同じ平文字は1つにまとめ、最大 max 組
  function cribPairsAt(cipher, crib, pos, max = 6) {
    const word = lettersOf(crib);
    const seq = lettersOf(cipher);
    const pairs = [];
    const seen = new Set();
    word.forEach((p, k) => {
      if (seen.has(p) || pairs.length >= max || pos + k >= seq.length) return;
      seen.add(p);
      pairs.push([String.fromCharCode(65 + p), String.fromCharCode(65 + seq[pos + k])]);
    });
    return pairs;
  }

  // ===== 練習問題（問題番号ごとに同じ問題が出る） =====
  // 短い暗号文の問題に使う英語のことわざ・定番の例文（大文字・空白区切り）。どれも総当たりの1位で元に戻り、1位と2位の差が3以上（test/quiz.test.js）
  const PROVERBS = [
    'KNOWLEDGE IS POWER', 'TIME IS MONEY', 'PRACTICE MAKES PERFECT', 'BETTER LATE THAN NEVER', 'ACTIONS SPEAK LOUDER THAN WORDS',
    'THE EARLY BIRD CATCHES THE WORM', 'WHERE THERE IS A WILL THERE IS A WAY', 'HONESTY IS THE BEST POLICY', 'ALL THAT GLITTERS IS NOT GOLD',
    'A FRIEND IN NEED IS A FRIEND INDEED', 'LOOK BEFORE YOU LEAP', 'EASY COME EASY GO', 'NO NEWS IS GOOD NEWS', 'SLOW AND STEADY WINS THE RACE',
    'THE PEN IS MIGHTIER THAN THE SWORD', 'ROME WAS NOT BUILT IN A DAY', 'TWO HEADS ARE BETTER THAN ONE', 'WHEN IN ROME DO AS THE ROMANS DO',
    'BIRDS OF A FEATHER FLOCK TOGETHER', 'THE BEST THINGS IN LIFE ARE FREE', 'PRACTICE WHAT YOU PREACH', 'SEEING IS BELIEVING',
    'FORTUNE FAVORS THE BOLD', 'A PICTURE IS WORTH A THOUSAND WORDS', 'MEET ME AFTER THE TOGA PARTY', 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG'
  ];
  const QUIZ_MAX_SEED = 999999;

  // 問題番号から決まる乱数（xorshift32。番号をかき混ぜてから使う）
  function quizRandom(seed) {
    let s = (Math.imul(Number(seed) >>> 0, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
    const next = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 4; i++) next();
    return next;
  }

  // 5問: 逆元・1文字の暗号化・1文字の復号・既知の2組から鍵・短い暗号文から鍵。a=1・25 は手で計算しても練習にならないので使わない
  function makeQuiz(seed) {
    const rnd = quizRandom(seed);
    const int = (n) => Math.floor(rnd() * n);
    const pick = (xs) => xs[int(xs.length)];
    const A = VALID_A.filter((a) => a !== 1 && a !== 25);
    const key = () => ({ a: pick(A), b: int(N) });
    const inv = pick(A);
    const enc = { ...key(), m: int(N) };
    const dec = { ...key(), c: int(N) };
    const two = key();
    const p1 = int(N);
    let p2 = int(N);
    while (gcd(p1 - p2, N) !== 1) p2 = int(N);
    const text = { ...key(), plain: pick(PROVERBS) };
    return [
      { type: 'inverse', a: inv, answer: modInverse(inv) },
      { type: 'encrypt', a: enc.a, b: enc.b, m: enc.m, answer: mod(enc.a * enc.m + enc.b, N) },
      { type: 'decrypt', a: dec.a, b: dec.b, c: dec.c, answer: decryptMap(dec.a, dec.b)[dec.c] },
      { type: 'pairs', pairs: [p1, p2].map((p) => [p, mod(two.a * p + two.b, N)]), answer: { a: two.a, b: two.b } },
      { type: 'text', plain: text.plain, cipher: encrypt(text.plain, text.a, text.b), answer: { a: text.a, b: text.b } }
    ];
  }

  // 答え合わせ。逆元は整数、1文字の問題は英字1文字（大文字・小文字を問わない）、鍵の問題は { a, b } の整数
  function checkQuizAnswer(q, input) {
    const int = (s) => (/^[+-]?[0-9]+$/.test(String(s ?? '').trim()) ? Number(String(s).trim()) : null);
    if (q.type === 'inverse') return int(input) === q.answer;
    if (q.type === 'encrypt' || q.type === 'decrypt') return letterIndex(input) === q.answer;
    return int(input && input.a) === q.answer.a && int(input && input.b) === q.answer.b;
  }

  // ===== URL で受け取る（「#」より後ろを先に読む。シリーズのほかのツールと同じ） =====
  function linkParams(search, hash) {
    const fromHash = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    return fromHash.has('text') ? fromHash : new URLSearchParams(search || '');
  }

  // 読み込んだ text を「?」と「#」の両方から消したときのパス。text がなければ null
  function urlWithoutText(href) {
    const url = new URL(href);
    const fromHash = new URLSearchParams(url.hash.slice(1));
    const inHash = fromHash.has('text');
    if (!url.searchParams.has('text') && !inHash) return null;
    url.searchParams.delete('text');
    fromHash.delete('text');
    const hash = inHash ? fromHash.toString() : url.hash.slice(1);
    return url.pathname + url.search + (hash ? `#${hash}` : '');
  }

  globalThis.AffineCore = {
    N, VALID_A, MAX_TEXT, SCORE_LETTERS, WORD_WEIGHT, CLOSE_MARGIN, COMMON_WORDS, HYPOTHESIS_LETTERS,
    mod, gcd, egcd, modInverse, isValidA, parseKey, encryptMap, decryptMap, applyMap, preprocess, encrypt, decrypt,
    letterSet, letterCount, fullwidthLetterCount, mappingRows, bigramScore, wordHits, englishScore, prefixByLetters, bruteForce,
    letterIndex, solveFromPairs, letterFrequencies, frequencyHypotheses, linkParams, urlWithoutText,
    solveFromKnown, lettersOf, samePattern, cribSearch, cribPairsAt, PROVERBS, QUIZ_MAX_SEED, quizRandom, makeQuiz, checkQuizAnswer
  };
})();
