import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, core, load } from './load.js';
import { evaluate, readCorpus, renderAccuracy } from '../tools/evaluate.mjs';

const C = core();
const ACC = load('js/accuracy.js').AffineAccuracy;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const DOCS = {
  ja: {
    file: 'README.md', switcher: '[English](README.en.md) · 日本語', day: '**Day049 - 生成AIで作るセキュリティツール100**',
    images: /^assets\/screenshot\d*\.png$/,
    sec: { math: '🧮 数学的背景', examples: '📝 具体例', crack: '🔬 総当たり解読の仕組みと正答率', tree: '📁 ディレクトリー構造', about: '🛠️ このツールについて',
      solve: '✍️ 手で解く（既知の組・クリブ・頻度による仮定）', quiz: '🎓 練習問題' },
    heads: { examples: '平文', accuracy: '英字の数', crib: '英字の数（空白なし）' },
    claims: ['99.3%', '56.2%', '約16万字', '275語', '×4', '差が3未満'],
    solveClaims: ['差11の逆元19', 'a ≡ 3 × 19 ≡ 5', 'b ≡ 2 − 5 × 4 ≡ 8', '12個のaがどれも鍵', '上位6文字から30通り', 'C→Hを足す', 'a=3、b=1に決まる',
      'THATは200字でも{THAT200}しか', '組は6つまで'],
    quizClaims: ['問題番号1の問5は`{cipher}`（a={a}、b={b}、平文は{plain}）', '例文{n}文', '1〜{max}']
  },
  en: {
    file: 'README.en.md', switcher: 'English · [日本語](README.md)', day: '**Day049 - 100 Security Tools with Generative AI**',
    images: /^assets\/en\/screenshot\d*\.png$/,
    sec: { math: '🧮 Mathematical background', examples: '📝 Examples', crack: '🔬 How the brute-force attack works and how accurate it is',
      tree: '📁 Directory structure', about: '🛠️ About this tool', solve: '✍️ Solve by hand (known pairs, cribs and frequency guesses)',
      quiz: '🎓 Practice' },
    heads: { examples: 'Plaintext', accuracy: 'Letters', crib: 'Letters (no spaces)' },
    claims: ['99.3%', '56.2%', 'about 160,000 letters', '275 words', '4 × the number', 'under 3'],
    solveClaims: ['the inverse 19 of the difference 11', 'a ≡ 3 × 19 ≡ 5', 'b ≡ 2 − 5 × 4 ≡ 8', 'all 12 values of a', '30 guesses from the six',
      'Adding C→H', 'the key is a=3 and b=1', 'Only {THAT200} of the 200-letter texts contained THAT', 'Up to six pairs'],
    quizClaims: ['Q5 of question number 1 is `{cipher}` (a={a}, b={b}; the plaintext is {plain})', 'from {n} English proverbs', '(1 to {max})']
  }
};
for (const d of Object.values(DOCS)) d.text = read(d.file);

function section(text, heading) {
  const i = text.indexOf(`\n## ${heading}`);
  assert.ok(i >= 0, heading);
  const rest = text.slice(i + 1);
  const end = rest.indexOf('\n## ', 3);
  return end < 0 ? rest : rest.slice(0, end);
}

function table(text, firstHeader) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`| ${firstHeader} |`));
  assert.ok(start >= 0, firstHeader);
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
  return rows;
}

const noCode = (md) => md.replace(/```[\s\S]*?```/g, '');
const h2 = (md) => noCode(md).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
const headings = (md) => noCode(md).split('\n').filter((l) => /^#{1,4} /.test(l));

test('YAML メタデータの構造（キーの順、ブロック形式のリスト、固定の値）。YAML は README.md だけに置く', () => {
  const m = DOCS.ja.text.match(/^<!--\n---\n([\s\S]*?)\n---\n-->\n/);
  assert.ok(m, 'YAML block');
  const keys = [...m[1].matchAll(/^([a-z_]+):/gm)].map((x) => x[1]);
  assert.deepEqual(keys, ['id', 'slug', 'title', 'subtitle_ja', 'subtitle_en', 'description_ja', 'description_en', 'category_ja', 'category_en',
    'difficulty', 'tags', 'repo_url', 'demo_url', 'hub']);
  for (const k of ['category_ja', 'category_en', 'tags']) assert.match(m[1], new RegExp(`^${k}:\\n  - `, 'm'), k);
  assert.match(m[1], /^id: day049$/m);
  assert.match(m[1], /^slug: affine-cipherlab$/m);
  assert.match(m[1], /^hub: true$/m);
  assert.doesNotMatch(DOCS.en.text, /^<!--/);
});

test('日英の README は同じ見出しを同じ順に持つ（階層と絵文字がそろう）', () => {
  const ja = headings(DOCS.ja.text);
  const en = headings(DOCS.en.text);
  assert.equal(en.length, ja.length);
  ja.forEach((h, i) => {
    assert.equal(en[i].match(/^#+/)[0], h.match(/^#+/)[0], `${h} / ${en[i]}`);
    const first = [...h.replace(/^#+ /, '')][0];
    if (/^#{2,3} /.test(h) && /\p{Extended_Pictographic}/u.test(first)) assert.equal([...en[i].replace(/^#+ /, '')][0], first, `${h} / ${en[i]}`);
  });
});

for (const [lang, d] of Object.entries(DOCS)) {
  test(`${d.file}: シリーズ標準の構成（前半と後半の見出しの順、Day の表記、言語の切り替え、プロジェクトのリンク）`, () => {
    const heads = h2(d.text);
    assert.ok(d.text.includes(d.switcher));
    assert.match(d.text, /\n# Affine CipherLab - .+\n/);
    assert.ok(d.text.includes(d.day));
    assert.ok(heads[0].startsWith('🌐'));
    assert.ok(heads[1].startsWith('📸'));
    assert.deepEqual(heads.slice(-4).map((h) => [...h][0]), ['📁', '💻', '📄', '🛠']);
    for (const icon of ['✨', '📖', '🎯', '🔒', '⚠', '🧪']) assert.ok(heads.some((h) => h.startsWith(icon)), icon);
    assert.match(section(d.text, d.sec.about), /https:\/\/akademeia\.info\/\?page_id=42163/);
    for (const b of ['stars', 'forks', 'last-commit', 'license']) assert.ok(d.text.includes(`img.shields.io/github/${b}/ipusiron/affine-cipherlab`), b);
    // 監査で直した記載が戻っていない（実装と違う例・機能、辞書の語数）
    assert.doesNotMatch(d.text, /MJWWF|Mjwwf|SKTDMFXKTDVT|300語|300-word|帯グラフ|円周|カイ二乗|chi-square/);
  });

  test(`${d.file}: 強調は1節に2か所まで、箇条書きの項目名を太字にしない、文末にコロンを置かない`, () => {
    for (const h of h2(d.text)) {
      const n = (section(d.text, h).match(/\*\*[^*\n]+\*\*/g) || []).length;
      assert.ok(n <= 2, `${h}: ${n}`);
    }
    assert.doesNotMatch(d.text, /^\s*- \*\*/m);
    if (lang === 'ja') assert.doesNotMatch(noCode(d.text).replace(/<!--[\s\S]*?-->/, ''), /[：:]$/m);
  });

  test(`${d.file}: 具体例と逆元の表は実装と一致する`, () => {
    const rows = table(section(d.text, d.sec.examples), d.heads.examples);
    assert.equal(rows.length, 8);
    for (const [plain, a, b, cipher] of rows) assert.equal(C.encrypt(plain, Number(a), Number(b)), cipher, plain);
    const math = section(d.text, d.sec.math);
    const lines = math.split('\n');
    const i = lines.findIndex((l) => l.startsWith('| a |'));
    const as = lines[i].split('|').slice(2, -1).map((c) => Number(c.trim()));
    const inv = lines[i + 2].split('|').slice(2, -1).map((c) => Number(c.trim()));
    assert.deepEqual(as, C.VALID_A);
    assert.deepEqual(inv, C.VALID_A.map((a) => C.modInverse(a)));
  });

  test(`${d.file}: 正答率の表は js/accuracy.js と一致し、本文の数値は実装の値と一致する`, () => {
    const sec = section(d.text, d.sec.crack);
    const rows = table(sec, d.heads.accuracy);
    assert.deepEqual(rows.map((r) => Number(r[0])), ACC.spaces.map((x) => x[0]));
    rows.forEach((r, i) => {
      assert.equal(r[1], `${ACC.spaces[i][1].toFixed(1)}%`);
      assert.equal(r[2], `${ACC.noSpaces[i][1].toFixed(1)}%`);
    });
    for (const c of d.claims) assert.ok(sec.includes(c), c);
  });

  test(`${d.file}: 手で解くの節の表と途中式は実装と一致する`, () => {
    const sec = section(d.text, d.sec.solve);
    const rows = table(sec, d.heads.accuracy);
    assert.deepEqual(rows.map((r) => Number(r[0])), ACC.frequency.map((x) => x[0]));
    rows.forEach((r, i) => assert.deepEqual([r[1], r[2]], [`${ACC.frequency[i][1].toFixed(1)}%`, `${ACC.frequency[i][2].toFixed(1)}%`]));
    const that200 = `${ACC.crib.THAT.find((r) => r[0] === 200)[1].toFixed(1)}%`;
    for (const c of d.solveClaims.map((x) => x.replace('{THAT200}', that200))) assert.ok(sec.includes(c), c);
    const cribRows = table(sec, d.heads.crib);
    assert.deepEqual(cribRows.map((r) => Number(r[0])), ACC.crib.THE.map((x) => x[0]));
    cribRows.forEach((r, i) => {
      const [the, that] = [ACC.crib.THE[i], ACC.crib.THAT[i]];
      assert.deepEqual(r.slice(1), [`${the[1].toFixed(1)}%`, the[2].toFixed(2), `${that[1].toFixed(1)}%`, that[2].toFixed(2)]);
    });
    // 「単語を含めば、どの長さでも英語らしさの1位が正解だった」
    for (const row of [...ACC.crib.THE, ...ACC.crib.THAT]) assert.equal(row[3], 100);
    assert.deepEqual(C.solveFromKnown([['A', 'B'], ['N', 'O'], ['C', 'H']]).keys, [{ a: 3, b: 1 }]);
    const one = C.solveFromPairs('E', 'C', 'T', 'Z');
    assert.deepEqual([one.dp, one.inv, one.dc, one.keys[0].a, one.keys[0].b], [11, 19, 3, 5, 8]);
    assert.equal(C.solveFromPairs('A', 'B', 'N', 'O').keys.length, 12);
    assert.equal(C.HYPOTHESIS_LETTERS * (C.HYPOTHESIS_LETTERS - 1), 30);
  });

  test(`${d.file}: 練習問題の節の例は、問題番号1の実際の問題と一致する`, () => {
    const sec = section(d.text, d.sec.quiz);
    const q = C.makeQuiz(1)[4];
    const vars = { cipher: q.cipher, a: q.answer.a, b: q.answer.b, plain: q.plain, n: C.PROVERBS.length, max: C.QUIZ_MAX_SEED };
    for (const c of d.quizClaims) {
      const text = Object.entries(vars).reduce((x, [k, v]) => x.split(`{${k}}`).join(String(v)), c);
      assert.ok(sec.includes(text), text);
    }
  });

  test(`${d.file}: ディレクトリー構造にすべてのファイルとディレクトリーが載り、全行に説明がある`, () => {
    const block = section(d.text, d.sec.tree).match(/```\n([\s\S]*?)```/)[1];
    const lines = block.split('\n').filter((l) => l.trim()).slice(1);
    const listed = new Set();
    for (const line of lines) {
      const m = line.match(/[├└]── ([^\s#]+)\s+# \S/);
      assert.ok(m, `説明のない行: ${line}`);
      listed.add(m[1].replace(/\/$/, ''));
    }
    const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      .filter((x) => !['.git', 'node_modules', '.claude'].includes(x.name))
      .flatMap((x) => (x.isDirectory() ? [x.name, ...walk(path.join(dir, x.name))] : [x.name]));
    const all = walk('.');
    for (const name of all) assert.ok(listed.has(name), `ツリーにない: ${name}`);
    for (const name of listed) assert.ok(all.includes(name), `実在しない: ${name}`);
    assert.equal(new Set(lines.map((l) => l.indexOf(' # '))).size, 1);
  });
}

test('js/accuracy.js は tools/evaluate.mjs write の出力と一致する（評価用の英文、決まった種。総当たりと頻度による仮定）', () => {
  assert.equal(read('js/accuracy.js'), renderAccuracy());
});

test('本文の数値: 差の境目3で、学習用の英文の1位の正答率は差3以上99.3%・3未満56.2%。学習用の英字は約16万字、単語は275語', () => {
  const corpus = readCorpus('train-pg1342.txt');
  const all = [...evaluate(corpus, { spaces: true }), ...evaluate(corpus, { spaces: false })].flatMap((r) => r.margins);
  const rate = (xs) => (100 * xs.filter((m) => m.ok).length / xs.length).toFixed(1);
  assert.equal(rate(all.filter((m) => m.margin >= C.CLOSE_MARGIN)), '99.3');
  assert.equal(rate(all.filter((m) => m.margin < C.CLOSE_MARGIN)), '56.2');
  const letters = read('tools/corpus/train-pg1342.txt').replace(/[^A-Z]/g, '').length;
  assert.equal(Math.round(letters / 10000), 16);
  assert.equal(C.COMMON_WORDS.length, 275);
});

test('画像: 参照はすべて実在し、日本語版は assets/、英語版は assets/en/ の画像を使う。参照していない PNG は置かない', () => {
  const refs = {};
  for (const [lang, d] of Object.entries(DOCS)) {
    refs[lang] = [...d.text.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)].map((m) => m[1]);
    assert.equal(refs[lang].length, 8, lang);
    for (const r of refs[lang]) {
      assert.ok(fs.existsSync(path.join(ROOT, r)), r);
      assert.match(r, d.images, r);
      assert.ok(fs.statSync(path.join(ROOT, r)).size <= 300 * 1024, r);
    }
  }
  const pngs = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.png')).map((f) => `${dir}/${f}`).sort();
  assert.deepEqual(pngs('assets'), [...new Set(refs.ja)].sort());
  assert.deepEqual(pngs('assets/en'), [...new Set(refs.en)].sort());
});
