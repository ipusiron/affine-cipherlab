import test from 'node:test';
import assert from 'node:assert/strict';
import { read, load } from './load.js';

const html = read('index.html');
const { MESSAGES } = load('js/messages.js').AffineMessages;
const SCRIPTS = ['js/script.js', 'js/affine-core.js', 'js/messages.js', 'js/i18n.js', 'js/theme.js', 'js/theme-init.js'];

test('CSP はスクリプト・スタイルを同じ場所のファイルだけに限り、unsafe-inline と外部の通信を許さない', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)[1];
  assert.equal(csp, "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    + "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(html, /X-Content-Type-Options/);
});

test('HTML に style 属性・インラインのスクリプト・イベントハンドラーがない。外部リンクは noopener noreferrer', () => {
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  for (const tag of html.match(/<script[^>]*>/g)) assert.match(tag, /src="js\/[a-z0-9-]+\.js"/, tag);
  assert.equal((html.match(/<script[^>]*>\s*[^\s<]/g) || []).length, 0);
  for (const a of html.match(/<a [^>]*target="_blank"[^>]*>/g)) assert.match(a, /rel="noopener noreferrer"/, a);
});

test('タブは WAI-ARIA の形（tablist・tab・tabpanel、aria-controls の先が実在）', () => {
  assert.match(html, /role="tablist"/);
  const tabs = [...html.matchAll(/role="tab" id="(tab-[a-z]+)" data-tab="([a-z]+)" aria-controls="([a-z]+)" aria-selected="(true|false)"/g)];
  assert.equal(tabs.length, 5);
  assert.deepEqual(tabs.map((m) => m[4]), ['true', 'false', 'false', 'false', 'false']);
  for (const [, id, , panel] of tabs) assert.match(html, new RegExp(`id="${panel}" class="tab-content[^"]*" role="tabpanel" aria-labelledby="${id}"`), id);
});

test('入力欄と出力欄には名前（label か aria-label）がある', () => {
  for (const m of html.matchAll(/<(textarea|input) ([^>]*)>/g)) {
    const attrs = m[2];
    if (/type="checkbox"/.test(attrs)) continue;
    const id = attrs.match(/id="([^"]+)"/)[1];
    assert.ok(html.includes(`for="${id}"`) || /aria-label=/.test(attrs), id);
  }
});

test('data-i18n のキーは辞書にあり、HTML に書いた日本語は辞書の日本語と同じ', () => {
  for (const m of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
    assert.ok(MESSAGES.ja[m[1]] !== undefined, m[1]);
    assert.equal(m[2].trim(), MESSAGES.ja[m[1]], m[1]);
  }
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(';')) assert.ok(MESSAGES.ja[pair.split(':')[1]] !== undefined, pair);
  }
});

test('JS は innerHTML・eval・インラインのスタイルを使わない', () => {
  for (const f of SCRIPTS) {
    const src = read(f);
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function/, f);
    assert.doesNotMatch(src, /\.style\.|setAttribute\('style'/, f);
  }
});
