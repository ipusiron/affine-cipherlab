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
    sec: { math: '🧮 数学的背景', examples: '📝 具体例', crack: '🔬 総当たり解読の仕組みと正答率', tree: '📁 ディレクトリー構造', about: '🛠️ このツールについて' },
    heads: { examples: '平文', accuracy: '英字の数' },
    claims: ['99.3%', '56.2%', '約16万字', '275語', '×4', '差が3未満']
  },
  en: {
    file: 'README.en.md', switcher: 'English · [日本語](README.md)', day: '**Day049 - 100 Security Tools with Generative AI**',
    images: /^assets\/en\/screenshot\d*\.png$/,
    sec: { math: '🧮 Mathematical background', examples: '📝 Examples', crack: '🔬 How the brute-force attack works and how accurate it is',
      tree: '📁 Directory structure', about: '🛠️ About this tool' },
    heads: { examples: 'Plaintext', accuracy: 'Letters' },
    claims: ['99.3%', '56.2%', 'about 160,000 letters', '275 words', '4 × the number', 'under 3']
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

test('js/accuracy.js は tools/evaluate.mjs write の出力と一致する（評価用の英文、決まった種）', () => {
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
    assert.equal(refs[lang].length, 4, lang);
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
