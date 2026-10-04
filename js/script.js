// Affine CipherLab の画面の処理。計算は js/affine-core.js、文言は js/messages.js、言語は js/i18n.js
// 画面に入れる文字列はすべて textContent で入れる（HTML として解釈しない）
(() => {
  'use strict';

  const C = globalThis.AffineCore;
  const I18n = globalThis.AffineI18n;
  const t = (key, vars) => globalThis.AffineMessages.t(key, vars);
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const TOP = 20;
  const SECTIONS = ['encrypt', 'decrypt'];
  const state = { crack: null, crackText: '', toastTimer: null, pairs: null, freq: null, freqText: '' };
  const FREQUENCY_ANALYZER = 'https://ipusiron.github.io/frequency-analyzer/';
  const FREQUENCY_MAX = 5000;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const letterName = (i) => String.fromCharCode(65 + i);

  // ===== タブ（WAI-ARIA のタブ。矢印・Home・End で移る） =====
  function initTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      for (const b of tabs) {
        const on = b === tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        const panel = $(b.getAttribute('aria-controls'));
        panel.hidden = !on;
        panel.classList.toggle('active', on);
      }
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(tabs[next], true);
      });
    });
    return { select: (id) => select($(`tab-${id}`)) };
  }

  // ===== 警告の欄（鍵の欄と入力の欄を分ける） =====
  function showAlert(box, text, level) {
    box.textContent = text;
    box.hidden = !text;
    box.classList.toggle('error', level === 'error');
    box.classList.toggle('warning', level === 'warning');
  }

  // 鍵の欄を読み、鍵の警告を出す。復号タブでは、互いに素でない a はエラー
  function readKeys(section) {
    const aIn = $(`a-${section}`);
    const bIn = $(`b-${section}`);
    const pa = C.parseKey(aIn.value, 'a');
    const pb = C.parseKey(bIn.value, 'b');
    const msgs = [];
    let level = '';
    for (const [p, name] of [[pa, 'a'], [pb, 'b']]) {
      if (p.ok) continue;
      msgs.push(t(`err.${p.error}`, { name }));
      level = 'error';
    }
    aIn.setAttribute('aria-invalid', String(!pa.ok || (section === 'decrypt' && Boolean(pa.warning))));
    bIn.setAttribute('aria-invalid', String(!pb.ok));
    if (pa.ok && pa.warning) {
      msgs.push(t(section === 'decrypt' ? 'warn.decryptBlocked' : 'warn.notCoprime', { a: pa.value, gcd: pa.gcd }));
      if (!level) level = section === 'decrypt' ? 'error' : 'warning';
    }
    showAlert($(`key-alert-${section}`), msgs.join(' '), level);
    return { ok: pa.ok && pb.ok, a: pa.value, b: pb.value, invertible: pa.ok && !pa.warning };
  }

  // 入力の警告（長すぎる・全角英字がある）。英字以外の文字はそのまま残すので拒否しない
  function checkText(section, textarea) {
    const text = textarea.value;
    const msgs = [];
    let level = '';
    if (text.length > C.MAX_TEXT) {
      msgs.push(t('err.tooLong', { max: fmt(C.MAX_TEXT), n: fmt(text.length) }));
      level = 'error';
    }
    const fullwidth = C.fullwidthLetterCount(text);
    if (fullwidth) {
      msgs.push(t('note.fullwidth', { n: fmt(fullwidth) }));
      if (!level) level = 'warning';
    }
    showAlert($(`input-alert-${section}`), msgs.join(' '), level);
    return text.trim() !== '' && text.length <= C.MAX_TEXT;
  }

  // ===== 写像表 =====
  function renderMapping(container, keys) {
    container.replaceChildren();
    if (!keys.ok) return;
    const rows = C.mappingRows(keys.a, keys.b);
    container.append(el('p', 'map-heading', t('map.heading', { a: keys.a, b: keys.b })));
    if (rows.some((r) => r.duplicate)) container.append(el('p', 'map-note', t('map.dup')));
    const wrap = el('div', 'mapping-tables');
    for (const [range, part] of [[t('map.left'), rows.slice(0, 13)], [t('map.right'), rows.slice(13)]]) {
      const table = el('table', 'mapping-table');
      table.append(el('caption', '', t('map.caption', { range })));
      const head = el('tr');
      for (const label of [t('map.plain'), '→', t('map.cipher')]) {
        const th = el('th', '', label);
        th.scope = 'col';
        head.append(th);
      }
      const thead = el('thead');
      thead.append(head);
      const tbody = el('tbody');
      for (const r of part) {
        const tr = el('tr', `mapping-row${r.duplicate ? ' duplicate' : ''}`);
        tr.dataset.m = String(r.m);
        tr.append(el('td', '', `${letterName(r.m)} (${r.m})`), el('td', 'arrow', '→'), el('td', 'cipher', `${letterName(r.c)} (${r.c})`));
        tbody.append(tr);
      }
      table.append(thead, tbody);
      wrap.append(table);
    }
    container.append(wrap);
  }

  // 使った平文字の行を残る強調にする
  function highlightRows(container, indices) {
    for (const row of container.querySelectorAll('.mapping-row')) row.classList.toggle('highlighted', indices.has(Number(row.dataset.m)));
  }

  // 入力した最後の文字の行を一瞬だけ強調する
  function pulseRow(container, m) {
    const row = container.querySelector(`.mapping-row[data-m="${m}"]`);
    if (!row) return;
    row.classList.remove('pulse');
    void row.offsetWidth;
    row.classList.add('pulse');
    setTimeout(() => row.classList.remove('pulse'), 600);
  }

  function lastLetterIndex(text) {
    for (let i = text.length - 1; i >= 0; i--) {
      const code = text[i].toUpperCase().charCodeAt(0);
      if (code >= 65 && code <= 90) return code - 65;
    }
    return null;
  }

  // ===== 暗号化・復号 =====
  const optsOf = (section) => ({ stripSpaces: $(`strip-spaces-${section}`).checked, stripSymbols: $(`strip-symbols-${section}`).checked });

  function refreshEncrypt() {
    const keys = readKeys('encrypt');
    const textOk = checkText('encrypt', $('plaintext'));
    $('encrypt-btn').disabled = !(keys.ok && textOk);
    renderMapping($('mapping-encrypt'), keys);
    return keys;
  }

  function refreshDecrypt() {
    const keys = readKeys('decrypt');
    const textOk = checkText('decrypt', $('ciphertext-input'));
    $('decrypt-btn').disabled = !(keys.ok && keys.invertible && textOk);
    renderMapping($('mapping-decrypt'), keys);
    return keys;
  }

  function refreshCrack() {
    $('crack-btn').disabled = !checkText('crack', $('crack-input'));
    renderMapping($('mapping-crack'), readKeysQuiet());
  }

  // 総当たりタブの写像表は、暗号化タブと同じ鍵を使う（警告は出さない）
  function readKeysQuiet() {
    const pa = C.parseKey($('a-encrypt').value, 'a');
    const pb = C.parseKey($('b-encrypt').value, 'b');
    return { ok: pa.ok && pb.ok, a: pa.value, b: pb.value };
  }

  // a・b は暗号化タブと復号タブで同じ値にそろえる
  function syncKeys(from) {
    const to = from === 'encrypt' ? 'decrypt' : 'encrypt';
    $(`a-${to}`).value = $(`a-${from}`).value;
    $(`b-${to}`).value = $(`b-${from}`).value;
    refreshEncrypt();
    refreshDecrypt();
    refreshCrack();
  }

  function setKeys(a, b) {
    for (const s of SECTIONS) {
      $(`a-${s}`).value = String(a);
      $(`b-${s}`).value = String(b);
    }
    refreshEncrypt();
    refreshDecrypt();
    refreshCrack();
  }

  function encrypt() {
    const keys = refreshEncrypt();
    if (!keys.ok) return;
    const opts = optsOf('encrypt');
    const text = $('plaintext').value;
    $('ciphertext').value = C.encrypt(text, keys.a, keys.b, opts);
    $('encrypt-note').textContent = keys.invertible ? '' : t('note.notInjective');
    highlightRows($('mapping-encrypt'), C.letterSet(C.preprocess(text, opts)));
  }

  function decrypt() {
    const keys = refreshDecrypt();
    if (!keys.ok || !keys.invertible) return;
    const out = C.decrypt($('ciphertext-input').value, keys.a, keys.b, optsOf('decrypt'));
    $('plaintext-output').value = out;
    highlightRows($('mapping-decrypt'), C.letterSet(out));
  }

  // ===== 総当たり =====
  function accuracyNote(r, text) {
    const acc = globalThis.AffineAccuracy;
    if (!acc || r.letters >= 20) return '';
    const spaced = /[A-Za-z]\s+[A-Za-z]/.test(text);
    const table = spaced ? acc.spaces : acc.noSpaces;
    let bucket = table[0];
    for (const row of table) if (row[0] <= r.letters) bucket = row;
    return t('crack.short', { letters: r.letters, len: bucket[0], spaces: t(spaced ? 'crack.spaces' : 'crack.noSpaces'), rate: bucket[1].toFixed(1) });
  }

  function crack() {
    const text = $('crack-input').value;
    if (!checkText('crack', $('crack-input'))) return;
    if (!C.letterCount(text)) {
      showAlert($('input-alert-crack'), t('err.noLetters'), 'error');
      state.crack = null;
      renderCrack();
      return;
    }
    state.crack = C.bruteForce(text);
    state.crackText = text;
    renderCrack();
  }

  function renderCrack() {
    const status = $('crack-status');
    const box = $('crack-results');
    status.replaceChildren();
    box.replaceChildren();
    const r = state.crack;
    if (!r) return;
    const top = Math.min(TOP, r.results.length);
    status.append(el('p', '', r.letters > r.scored
      ? t('crack.statusScored', { letters: fmt(r.letters), scored: fmt(r.scored), top })
      : t('crack.status', { letters: fmt(r.letters), top })));
    if (r.close) status.append(el('p', 'warn', t('crack.close', { margin: r.margin.toFixed(2) })));
    const note = accuracyNote(r, state.crackText);
    if (note) status.append(el('p', 'warn', note));

    const table = el('table', 'crack-table');
    table.append(el('caption', 'visually-hidden', t('crack.caption', { top })));
    const cols = ['rank', 'a', 'b', 'score', 'words', 'text', 'action'];
    const head = el('tr');
    for (const c of cols) {
      const th = el('th', `col-${c}`, t(`crack.col.${c}`));
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    r.results.slice(0, top).forEach((x, i) => {
      const tr = el('tr', i === 0 ? 'top' : '');
      const preview = x.preview.length > 80 ? `${x.preview.slice(0, 80)}…` : x.preview;
      const values = [String(i + 1), String(x.a), String(x.b), x.score.toFixed(1), String(x.words), preview];
      values.forEach((v, j) => {
        const td = el('td', `col-${cols[j]}`, v);
        td.dataset.label = t(`crack.col.${cols[j]}`);
        tr.append(td);
      });
      const action = el('td', 'col-action');
      action.dataset.label = t('crack.col.action');
      const btn = el('button', 'small-btn', t('btn.set'));
      btn.type = 'button';
      btn.addEventListener('click', () => {
        setKeys(x.a, x.b);
        toast(t('toast.set', { a: x.a, b: x.b }));
      });
      action.append(btn);
      tr.append(action);
      tbody.append(tr);
    });
    table.append(thead, tbody);
    box.append(table);
    renderCrackLinks();
  }

  function newTabLink(text, href) {
    const a = el('a', '', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  // 暗号文を「#」より後ろに入れて Day009 で開く（サーバーへは送られない）。5,000字を超えるときは渡さずに開く
  function renderCrackLinks() {
    const box = $('crack-links');
    box.replaceChildren();
    if (!state.crack) return;
    const text = state.crackText;
    const href = text.length <= FREQUENCY_MAX ? `${FREQUENCY_ANALYZER}#text=${encodeURIComponent(text)}` : FREQUENCY_ANALYZER;
    box.append(newTabLink(t('crack.freqLink'), href));
    if (text.length > FREQUENCY_MAX) box.append(el('span', 'hint', ` ${t('crack.freqTooLong')}`));
  }

  // ===== 手で解く: 既知の2文字から鍵を解く =====
  const letterLabel = (i) => `${letterName(i)}(${i})`;

  function solvePairs() {
    const values = ['p1', 'c1', 'p2', 'c2'].map((id) => $(id).value);
    state.pairs = C.solveFromPairs(...values);
    renderPairs();
  }

  function renderPairs() {
    const box = $('solve-result');
    box.replaceChildren();
    const r = state.pairs;
    if (!r) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const list = (xs) => xs.join(', ');
    if (r.reason === 'notLetter') {
      box.append(el('p', 'warn', t('solve.err.notLetter')));
      return;
    }
    const [P1, P2] = r.p;
    const [C1, C2] = r.c;
    const steps = el('ol', 'steps');
    const step = (text) => steps.append(el('li', '', text));
    step(t('solve.stepEq', { c1: letterLabel(C1), p1: letterLabel(P1), c2: letterLabel(C2), p2: letterLabel(P2) }));
    if (r.reason === 'samePair' || r.reason === 'contradiction') {
      box.append(steps, el('p', 'warn', t(`solve.err.${r.reason}`)));
      return;
    }
    step(t('solve.stepSub', { dc: r.dc, dp: r.dp }));
    if (r.reason === 'noSolution') {
      box.append(steps, el('p', 'warn', t('solve.err.noSolution', { dp: r.dp, dc: r.dc, g: r.g })));
      return;
    }
    if (r.g === 1) step(t('solve.stepInv', { dp: r.dp, dc: r.dc, inv: r.inv, a: r.a0 }));
    else step(t('solve.stepGcd', { dp: r.dp, dc: r.dc, g: r.g, m: r.m, a0: r.a0, list: list(r.candidates) }));
    if (r.reason === 'noValidA') {
      box.append(steps, el('p', 'warn', t('solve.err.noValidA', { list: list(r.candidates) })));
      return;
    }
    for (const k of r.keys.slice(0, 3)) step(t('solve.stepB', { a: k.a, c1v: C1, p1v: P1, b: k.b }));
    box.append(steps);
    box.append(el('p', r.keys.length > 1 ? 'warn' : 'ok', r.keys.length > 1
      ? t('solve.several', { n: r.keys.length })
      : t('solve.one', { a: r.keys[0].a, b: r.keys[0].b })));
    const keys = el('div', 'key-buttons');
    for (const k of r.keys) {
      const btn = el('button', 'small-btn', t('btn.useKeyAB', { a: k.a, b: k.b }));
      btn.type = 'button';
      btn.addEventListener('click', () => {
        setKeys(k.a, k.b);
        toast(t('toast.setFrom', { a: k.a, b: k.b }));
      });
      keys.append(btn);
    }
    box.append(keys);
  }

  // ===== 手で解く: 多い文字を E・T と仮定する =====
  function frequency() {
    const text = $('freq-input').value;
    if (!checkText('solve', $('freq-input'))) return;
    if (!C.letterCount(text)) {
      showAlert($('input-alert-solve'), t('err.noLetters'), 'error');
      state.freq = null;
      renderFreq();
      return;
    }
    state.freqText = text;
    state.freq = C.frequencyHypotheses(text);
    renderFreq();
  }

  function freqNote(letters) {
    const rows = (globalThis.AffineAccuracy && globalThis.AffineAccuracy.frequency) || [];
    if (!rows.length) return '';
    let row = rows[0];
    for (const r of rows) if (r[0] <= letters) row = r;
    return t('solve.freqNote', { len: row[0], within: row[2].toFixed(1), first: row[1].toFixed(1) });
  }

  function renderFreq() {
    const status = $('freq-status');
    const box = $('freq-results');
    status.replaceChildren();
    box.replaceChildren();
    const hs = state.freq;
    if (!hs) return;
    const letters = C.letterCount(state.freqText);
    const top = C.letterFrequencies(state.freqText).slice(0, C.HYPOTHESIS_LETTERS).map((f) => `${letterName(f.i)} ${f.n}`);
    status.append(el('p', '', t('solve.freqTop', { list: top.join(', ') })));
    const all = hs.flatMap((h) => h.keys.map((k) => ({ ...k, step: h.step })));
    const best = all.length ? all.reduce((p, q) => (q.score > p.score ? q : p)) : null;
    status.append(el('p', best ? 'ok' : 'warn', best ? t('solve.freqBest', { step: best.step, a: best.a, b: best.b }) : t('solve.freqNone')));
    if (letters < 50) status.append(el('p', 'warn', t('solve.freqFew', { letters })));
    status.append(el('p', 'hint', freqNote(letters)));

    const table = el('table', 'crack-table freq-table');
    table.append(el('caption', 'visually-hidden', t('solve.caption')));
    const cols = ['step', 'e', 't', 'key', 'score', 'text', 'action'];
    const head = el('tr');
    for (const c of cols) {
      const th = el('th', `col-${c}`, t(`solve.col.${c}`));
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const h of hs) {
      const k = h.keys[0];
      const tr = el('tr', best && k && k.a === best.a && k.b === best.b ? 'top' : '');
      const values = [String(h.step), `${letterName(h.cipherE)} (${h.countE})`, `${letterName(h.cipherT)} (${h.countT})`,
        k ? `a=${k.a}, b=${k.b}` : t('solve.notKey', { a: h.solved.candidates ? h.solved.candidates[0] : '?' }),
        k ? k.score.toFixed(1) : '—', k ? (k.preview.length > 60 ? `${k.preview.slice(0, 60)}…` : k.preview) : '—'];
      values.forEach((v, j) => {
        const td = el('td', `col-${cols[j]}`, v);
        td.dataset.label = t(`solve.col.${cols[j]}`);
        tr.append(td);
      });
      const action = el('td', 'col-action');
      action.dataset.label = t('solve.col.action');
      if (k) {
        const btn = el('button', 'small-btn', t('btn.useKey'));
        btn.type = 'button';
        btn.addEventListener('click', () => {
          setKeys(k.a, k.b);
          toast(t('toast.setFrom', { a: k.a, b: k.b }));
        });
        action.append(btn);
      }
      tr.append(action);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.append(table);
  }

  // ===== 座学: 逆元の計算機 =====
  function initCalc() {
    const select = $('calc-a');
    for (let a = 1; a <= 25; a++) {
      const opt = el('option', '', String(a));
      opt.value = String(a);
      select.append(opt);
    }
    select.value = '5';
    select.addEventListener('change', renderCalc);
  }

  function renderCalc() {
    const a = Number($('calc-a').value);
    const box = $('calc-result');
    box.replaceChildren();
    const { g, rows } = C.egcd(26, a);
    const table = el('table', 'calc-table');
    table.append(el('caption', 'visually-hidden', t('calc.caption', { a })));
    const head = el('tr');
    for (const c of ['r', 'q', 's', 't']) {
      const th = el('th', '', t(`calc.col.${c}`));
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const r of rows) {
      const tr = el('tr', r.r === 1 ? 'top' : '');
      for (const v of [r.r, r.q === null ? '—' : r.q, r.s, r.t]) tr.append(el('td', '', String(v)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.append(table);
    if (g === 1) {
      const tRow = rows.find((r) => r.r === 1).t;
      const inv = C.mod(tRow, 26);
      box.append(el('p', 'ok', t('calc.inv', { t: tRow, inv, a, prod: a * inv, k: (a * inv - 1) / 26 })));
    } else {
      box.append(el('p', 'warn', t('calc.noInv', { a, g })));
    }
  }

  // ===== URL で受け取る（#text= を先に読む） =====
  function applyUrl(tabs) {
    const params = C.linkParams(window.location.search, window.location.hash);
    const cleaned = C.urlWithoutText(window.location.href);
    if (cleaned !== null) {
      try {
        history.replaceState(history.state, '', cleaned);
      } catch {
        // 消せない環境でも、読み込みはそのまま続ける
      }
    }
    const text = params.get('text');
    if (!text || !text.trim()) return;
    $('crack-input').value = text.slice(0, C.MAX_TEXT);
    tabs.select('crack');
    crack();
    $('crack-status').prepend(el('p', 'hint', t('note.fromUrl')));
  }

  // ===== コピー・トースト =====
  function toast(message) {
    const box = $('toast');
    box.textContent = message;
    box.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      box.hidden = true;
      box.textContent = '';
    }, 3000);
  }

  async function copyFrom(id) {
    const field = $(id);
    try {
      await navigator.clipboard.writeText(field.value);
      toast(t('toast.copied'));
    } catch {
      field.focus();
      field.select();
      toast(t('toast.copyFailed'));
    }
  }

  // ===== 言語を切り替えたあとの描き直し =====
  function renderAll() {
    I18n.applyStaticText();
    // 前の言語の知らせは閉じる
    $('toast').hidden = true;
    $('toast').textContent = '';
    globalThis.AffineTheme.refresh($('btn-theme'));
    refreshEncrypt();
    refreshDecrypt();
    refreshCrack();
    renderCrack();
    renderPairs();
    renderFreq();
    renderCalc();
    const keys = readKeysQuiet();
    if ($('ciphertext').value && keys.ok) $('encrypt-note').textContent = C.isValidA(keys.a) ? '' : t('note.notInjective');
  }

  document.addEventListener('DOMContentLoaded', () => {
    I18n.init();
    I18n.applyStaticText();
    globalThis.AffineTheme.refresh($('btn-theme'));
    const tabs = initTabs();
    $('btn-theme').addEventListener('click', () => globalThis.AffineTheme.toggle($('btn-theme')));
    $('btn-lang').addEventListener('click', () => {
      I18n.set(I18n.lang === 'ja' ? 'en' : 'ja');
      renderAll();
    });

    for (const s of SECTIONS) {
      for (const k of ['a', 'b']) $(`${k}-${s}`).addEventListener('input', () => syncKeys(s));
    }
    $('plaintext').addEventListener('input', () => {
      const keys = refreshEncrypt();
      const m = lastLetterIndex($('plaintext').value);
      if (keys.ok && m !== null) pulseRow($('mapping-encrypt'), m);
    });
    $('ciphertext-input').addEventListener('input', () => {
      const keys = refreshDecrypt();
      const c = lastLetterIndex($('ciphertext-input').value);
      if (keys.ok && keys.invertible && c !== null) pulseRow($('mapping-decrypt'), C.decryptMap(keys.a, keys.b)[c]);
    });
    $('crack-input').addEventListener('input', refreshCrack);
    $('encrypt-btn').addEventListener('click', encrypt);
    $('decrypt-btn').addEventListener('click', decrypt);
    $('crack-btn').addEventListener('click', crack);
    $('solve-btn').addEventListener('click', solvePairs);
    for (const id of ['p1', 'c1', 'p2', 'c2']) $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') solvePairs();
    });
    $('freq-btn').addEventListener('click', frequency);
    $('freq-input').addEventListener('input', () => checkText('solve', $('freq-input')));
    $('freq-from-crack').addEventListener('click', () => {
      $('freq-input').value = $('crack-input').value;
      checkText('solve', $('freq-input'));
    });
    for (const btn of document.querySelectorAll('.preset-btn')) {
      btn.addEventListener('click', () => {
        setKeys(Number(btn.dataset.a), Number(btn.dataset.b));
        toast(t('toast.set', { a: btn.dataset.a, b: btn.dataset.b }));
      });
    }
    initCalc();
    renderCalc();
    for (const btn of document.querySelectorAll('.copy-btn[data-target]')) btn.addEventListener('click', () => copyFrom(btn.dataset.target));
    $('sync-cipher-btn').addEventListener('click', () => {
      if (!$('ciphertext').value.trim()) {
        toast(t('toast.noCipher'));
        return;
      }
      $('ciphertext-input').value = $('ciphertext').value;
      syncKeys('encrypt');
      toast(t('toast.synced'));
    });

    refreshEncrypt();
    refreshDecrypt();
    refreshCrack();
    applyUrl(tabs);
    globalThis.AffineApp = { renderAll };
    document.documentElement.dataset.ready = 'true';
  });
})();
