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
  const state = { crack: null, crackText: '', toastTimer: null, pairs: null, freq: null, freqText: '', crib: null, cribText: '', quiz: null };
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

  // ===== 手で解く: 既知の組から鍵を解く（2組で解き、3組目からで絞り込む） =====
  const letterLabel = (i) => `${letterName(i)}(${i})`;
  const MIN_PAIRS = 2;
  const MAX_PAIRS = 6;
  const pairRows = () => [...document.querySelectorAll('#pairs .pair')];

  function letterField(id, labelKey, value) {
    const label = el('label', '', t(labelKey));
    label.htmlFor = id;
    label.dataset.i18n = labelKey;
    const input = el('input', 'letter-input');
    input.type = 'text';
    input.id = id;
    input.maxLength = 1;
    input.value = value;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') solvePairs();
    });
    return [label, input];
  }

  // 組の行は HTML に2つあり、3つ目から6つ目までを足せる（文言は data-i18n で言語の切り替えに追従する）
  function addPairRow() {
    const n = pairRows().length + 1;
    if (n > MAX_PAIRS) return;
    const row = el('div', 'pair');
    row.dataset.pair = String(n);
    const name = el('span', 'pair-name', t(`solve.pair${n}`));
    name.dataset.i18n = `solve.pair${n}`;
    const arrow = el('span', '', '→');
    arrow.setAttribute('aria-hidden', 'true');
    row.append(name, ...letterField(`p${n}`, 'solve.plain', ''), arrow, ...letterField(`c${n}`, 'solve.cipher', ''));
    $('pairs').append(row);
    updatePairButtons();
  }

  function removePairRow() {
    const rows = pairRows();
    if (rows.length <= MIN_PAIRS) return;
    rows[rows.length - 1].remove();
    updatePairButtons();
  }

  function updatePairButtons() {
    const n = pairRows().length;
    $('add-pair').disabled = n >= MAX_PAIRS;
    $('remove-pair').disabled = n <= MIN_PAIRS;
  }

  // 組の数を pairs に合わせて値を入れる（クリブの位置から入れるとき）
  function setPairs(pairs) {
    while (pairRows().length > Math.max(MIN_PAIRS, pairs.length)) removePairRow();
    while (pairRows().length < pairs.length) addPairRow();
    pairRows().forEach((_, i) => {
      const [p, c] = pairs[i] || ['', ''];
      $(`p${i + 1}`).value = p;
      $(`c${i + 1}`).value = c;
    });
  }

  function solvePairs() {
    state.pairs = C.solveFromKnown(pairRows().map((_, i) => [$(`p${i + 1}`).value, $(`c${i + 1}`).value]));
    renderPairs();
  }

  const keyText = (k) => `a=${k.a}, b=${k.b}`;

  function keyButton(k, label) {
    const btn = el('button', 'small-btn', label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      setKeys(k.a, k.b);
      toast(t('toast.setFrom', { a: k.a, b: k.b }));
    });
    return btn;
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
    const warn = (key, vars) => el('p', 'warn', t(key, vars));
    if (r.reason === 'notLetter') {
      box.append(warn('solve.err.notLetter', { n: r.pair + 1 }));
      return;
    }
    if (r.reason === 'contradiction') {
      box.append(warn('solve.err.contradiction', { i: r.conflict[0] + 1, j: r.conflict[1] + 1 }));
      return;
    }
    if (r.reason === 'samePair') {
      box.append(warn('solve.err.samePair'));
      return;
    }
    const b = r.base;
    const [P1, P2] = b.p;
    const [C1, C2] = b.c;
    const steps = el('ol', 'steps');
    const step = (text) => steps.append(el('li', '', text));
    const [i, j] = r.basePairs.map((x) => x + 1);
    step(t('solve.stepEq', { i, j, c1: letterLabel(C1), p1: letterLabel(P1), c2: letterLabel(C2), p2: letterLabel(P2) }));
    step(t('solve.stepSub', { dc: b.dc, dp: b.dp }));
    if (b.reason === 'noSolution') {
      box.append(steps, warn('solve.err.noSolution', { dp: b.dp, dc: b.dc, g: b.g }));
      return;
    }
    if (b.g === 1) step(t('solve.stepInv', { dp: b.dp, dc: b.dc, inv: b.inv, a: b.a0 }));
    else step(t('solve.stepGcd', { dp: b.dp, dc: b.dc, g: b.g, m: b.m, a0: b.a0, list: list(b.candidates) }));
    if (b.reason === 'noValidA') {
      box.append(steps, warn('solve.err.noValidA', { list: list(b.candidates) }));
      return;
    }
    for (const k of b.keys.slice(0, 3)) step(t('solve.stepB', { a: k.a, c1v: C1, p1v: P1, b: k.b }));
    for (const c of r.checks) {
      step(t('solve.stepCheck', { n: c.pair + 1, p: letterName(c.p), c: letterName(c.c), pv: c.p, cv: c.c, before: c.before, kept: c.kept.length }));
      // 1つに決まったときは最後の結論で示すので、2〜3個残ったときだけ並べる
      if (c.kept.length > 1 && c.kept.length <= 3) step(t('solve.stepKept', { list: c.kept.map(keyText).join(' / ') }));
    }
    box.append(steps);
    if (r.reason === 'eliminated') {
      box.append(warn('solve.err.eliminated', { n: r.checks[r.checks.length - 1].pair + 1 }));
      return;
    }
    box.append(el('p', r.keys.length > 1 ? 'warn' : 'ok', r.keys.length > 1
      ? t('solve.several', { n: r.keys.length })
      : t('solve.one', { a: r.keys[0].a, b: r.keys[0].b })));
    const keys = el('div', 'key-buttons');
    for (const k of r.keys) keys.append(keyButton(k, t('btn.useKeyAB', { a: k.a, b: k.b })));
    box.append(keys);
  }

  // ===== 手で解く: 暗号文の欄（クリブと頻度の仮定で使う） =====
  function solveText() {
    const text = $('solve-input').value;
    if (!checkText('solve', $('solve-input'))) return null;
    if (!C.letterCount(text)) {
      showAlert($('input-alert-solve'), t('err.noLetters'), 'error');
      return null;
    }
    return text;
  }

  const shorten = (text, n) => (text.length > n ? `${text.slice(0, n)}…` : text);

  function resultTable(className, captionKey, prefix, cols, rows) {
    const table = el('table', className);
    table.append(el('caption', 'visually-hidden', t(captionKey, { top: rows.length })));
    const head = el('tr');
    for (const c of cols) {
      const th = el('th', `col-${c}`, t(`${prefix}.col.${c}`));
      th.scope = 'col';
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const row of rows) {
      const tr = el('tr', row.top ? 'top' : '');
      row.values.forEach((v, j) => {
        const td = el('td', `col-${cols[j]}`, v);
        td.dataset.label = t(`${prefix}.col.${cols[j]}`);
        tr.append(td);
      });
      const action = el('td', 'col-action');
      action.dataset.label = t(`${prefix}.col.action`);
      const buttons = el('div', 'action-buttons');
      buttons.append(...row.actions);
      action.append(buttons);
      tr.append(action);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    return table;
  }

  // ===== 手で解く: 既知の単語（クリブ）を当てる =====
  function crib() {
    const text = solveText();
    state.crib = text === null ? null : C.cribSearch(text, $('crib-word').value);
    state.cribText = text || '';
    renderCrib();
  }

  // 当たった位置（英字の何字目、1から）。6カ所以上は先頭5カ所と数
  function positionsText(ps) {
    const head = ps.slice(0, 5).map((x) => fmt(x + 1)).join(', ');
    if (ps.length === 1) return head;
    return t('crib.positions', { list: ps.length > 5 ? `${head}, …` : head, n: fmt(ps.length) });
  }

  function renderCrib() {
    const status = $('crib-status');
    const box = $('crib-results');
    status.replaceChildren();
    box.replaceChildren();
    const r = state.crib;
    if (!r) return;
    if (!r.ok) {
      status.append(el('p', 'warn', t(`crib.err.${r.reason}`, { n: r.word.length, letters: r.letters })));
      return;
    }
    status.append(el('p', '', t('crib.status', { letters: fmt(r.letters), positions: fmt(r.positions), word: r.word })));
    const ul = el('ul', 'crib-breakdown');
    ul.append(
      el('li', '', t('crib.pattern', { n: fmt(r.rejected.pattern) })),
      el('li', '', t('crib.noKey', { p1: r.word[0], p2: r.word[r.second], n: fmt(r.rejected.noKey) })),
      el('li', '', t('crib.mismatch', { n: fmt(r.rejected.mismatch) })),
      el('li', '', t('crib.matched', { n: fmt(r.matched) }))
    );
    status.append(ul);
    if (!r.results.length) {
      status.append(el('p', 'warn', t('crib.none', { word: r.word })));
      return;
    }
    status.append(el('p', 'ok', t('crib.found', { n: r.results.length })));
    const rows = r.results.slice(0, TOP).map((x, i) => {
      const toPairs = el('button', 'small-btn', t('btn.toPairs'));
      toPairs.type = 'button';
      toPairs.addEventListener('click', () => {
        const pos = x.positions[0];
        setPairs(C.cribPairsAt(state.cribText, r.word, pos));
        solvePairs();
        $('pairs-heading').scrollIntoView({ block: 'start' });
        toast(t('toast.toPairs', { n: fmt(pos + 1) }));
      });
      return {
        top: i === 0,
        values: [String(i + 1), keyText(x), positionsText(x.positions), x.score.toFixed(1), shorten(x.preview, 80)],
        actions: [keyButton(x, t('btn.useKey')), toPairs]
      };
    });
    box.append(resultTable('crack-table crib-table', 'crib.caption', 'crib', ['rank', 'key', 'positions', 'score', 'text', 'action'], rows));
  }

  // ===== 手で解く: 多い文字を E・T と仮定する =====
  function frequency() {
    const text = solveText();
    state.freq = text === null ? null : C.frequencyHypotheses(text);
    state.freqText = text || '';
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

  // ===== 練習問題 =====
  function randomSeed() {
    try {
      const x = new Uint32Array(1);
      crypto.getRandomValues(x);
      return (x[0] % C.QUIZ_MAX_SEED) + 1;
    } catch {
      return Math.floor(Math.random() * C.QUIZ_MAX_SEED) + 1;
    }
  }

  function loadQuiz(raw) {
    const text = String(raw ?? '').trim();
    const seed = /^[0-9]+$/.test(text) ? Number(text) : NaN;
    const ok = seed >= 1 && seed <= C.QUIZ_MAX_SEED;
    $('quiz-seed').setAttribute('aria-invalid', String(!ok));
    showAlert($('quiz-alert'), ok ? '' : t('quiz.err.seed'), ok ? '' : 'error');
    if (!ok) return;
    $('quiz-seed').value = String(seed);
    state.quiz = { seed, questions: C.makeQuiz(seed), answers: [], results: null };
    renderQuiz();
  }

  function questionText(x) {
    const L = letterName;
    if (x.type === 'inverse') return t('quiz.q.inverse', { a: x.a });
    if (x.type === 'encrypt') return t('quiz.q.encrypt', { a: x.a, b: x.b, L: L(x.m), m: x.m });
    if (x.type === 'decrypt') return t('quiz.q.decrypt', { a: x.a, b: x.b, L: L(x.c), c: x.c });
    if (x.type === 'pairs') {
      const [[p1, c1], [p2, c2]] = x.pairs;
      return t('quiz.q.pairs', { p1: L(p1), c1: L(c1), p2: L(p2), c2: L(c2) });
    }
    return t('quiz.q.text');
  }

  function answerFields(x, i) {
    const wrap = el('div', 'quiz-answer');
    const answers = state.quiz.answers;
    const field = (id, label, className, value, onInput) => {
      const lab = el('label', '', label);
      lab.htmlFor = id;
      const input = el('input', className);
      input.type = 'text';
      input.id = id;
      input.value = value ?? '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (className === 'letter-input') input.maxLength = 1;
      else input.inputMode = 'numeric';
      input.addEventListener('input', () => onInput(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkQuiz();
      });
      wrap.append(lab, input);
    };
    if (x.type === 'inverse') field(`quiz-${i}`, t('quiz.answerNumber'), 'num-input', answers[i], (v) => { answers[i] = v; });
    else if (x.type === 'encrypt' || x.type === 'decrypt') field(`quiz-${i}`, t('quiz.answerLetter'), 'letter-input', answers[i], (v) => { answers[i] = v; });
    else {
      const cur = answers[i] || { a: '', b: '' };
      answers[i] = cur;
      field(`quiz-${i}-a`, 'a', 'num-input', cur.a, (v) => { cur.a = v; });
      field(`quiz-${i}-b`, 'b', 'num-input', cur.b, (v) => { cur.b = v; });
    }
    return wrap;
  }

  const signed = (n) => (n < 0 ? `−${-n}` : String(n));

  function answerText(x) {
    if (x.type === 'inverse') return String(x.answer);
    if (x.type === 'encrypt' || x.type === 'decrypt') return letterName(x.answer);
    return keyText(x.answer);
  }

  function explanation(x) {
    if (x.type === 'inverse') {
      const prod = x.a * x.answer;
      return t('quiz.ex.inverse', { a: x.a, inv: x.answer, prod, k: (prod - 1) / 26 });
    }
    if (x.type === 'encrypt') return t('quiz.ex.encrypt', { a: x.a, m: x.m, b: x.b, v: x.a * x.m + x.b, c: x.answer, C: letterName(x.answer) });
    if (x.type === 'decrypt') {
      const inv = C.modInverse(x.a);
      return t('quiz.ex.decrypt', { a: x.a, inv, c: x.c, b: x.b, v: signed(inv * (x.c - x.b)), m: x.answer, M: letterName(x.answer) });
    }
    if (x.type === 'pairs') {
      const [[p1, c1], [p2, c2]] = x.pairs;
      const r = C.solveFromPairs(letterName(p1), letterName(c1), letterName(p2), letterName(c2));
      return t('quiz.ex.pairs', { dc: r.dc, dp: r.dp, inv: r.inv, a: x.answer.a, b: x.answer.b, c1v: c1, p1v: p1 });
    }
    return t('quiz.ex.text', { plain: x.plain });
  }

  function renderQuiz() {
    const list = $('quiz-list');
    list.replaceChildren();
    const q = state.quiz;
    if (!q) return;
    q.questions.forEach((x, i) => {
      const li = el('li', 'quiz-item');
      li.append(el('h3', 'quiz-title', t('quiz.title', { n: i + 1, title: t(`quiz.title.${x.type}`) })), el('p', 'quiz-q', questionText(x)));
      if (x.type === 'text') li.append(el('p', 'quiz-cipher', x.cipher));
      const result = el('div', 'quiz-result');
      result.id = `quiz-result-${i}`;
      li.append(answerFields(x, i), result);
      list.append(li);
    });
    renderQuizResults();
  }

  // 答え合わせの結果だけを描き直す（入力欄は作り直さないので、フォーカスが残る）
  function renderQuizResults() {
    const q = state.quiz;
    const score = $('quiz-score');
    score.replaceChildren();
    if (!q) return;
    q.questions.forEach((x, i) => {
      const box = $(`quiz-result-${i}`);
      box.replaceChildren();
      if (!q.results) return;
      const ok = q.results[i];
      box.append(el('p', ok ? 'ok' : 'warn', ok ? t('quiz.correct') : t('quiz.wrong', { answer: answerText(x) })), el('p', 'hint', explanation(x)));
    });
    if (q.results) score.append(el('p', 'ok', t('quiz.score', { n: q.results.filter(Boolean).length })));
  }

  function checkQuiz() {
    const q = state.quiz;
    if (!q) return;
    q.results = q.questions.map((x, i) => C.checkQuizAnswer(x, q.answers[i]));
    renderQuizResults();
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
    renderCrib();
    renderFreq();
    renderCalc();
    renderQuiz();
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
    $('add-pair').addEventListener('click', () => {
      addPairRow();
      $(`p${pairRows().length}`).focus();
    });
    $('remove-pair').addEventListener('click', removePairRow);
    updatePairButtons();
    $('crib-btn').addEventListener('click', crib);
    $('crib-word').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') crib();
    });
    $('freq-btn').addEventListener('click', frequency);
    $('solve-input').addEventListener('input', () => checkText('solve', $('solve-input')));
    $('solve-from-crack').addEventListener('click', () => {
      $('solve-input').value = $('crack-input').value;
      checkText('solve', $('solve-input'));
    });
    $('quiz-load').addEventListener('click', () => loadQuiz($('quiz-seed').value));
    $('quiz-seed').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadQuiz($('quiz-seed').value);
    });
    $('quiz-new').addEventListener('click', () => loadQuiz(randomSeed()));
    $('quiz-check').addEventListener('click', checkQuiz);
    loadQuiz(randomSeed());
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
