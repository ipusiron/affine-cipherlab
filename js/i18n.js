// 言語の選択と、HTML に書いた静的な文言（data-i18n・data-i18n-attr）の差し替え。globalThis.AffineI18n に置く
(() => {
  'use strict';

  const STORAGE_KEY = 'affine-cipherlab-lang';
  const LANGS = ['ja', 'en'];

  // ?lang= → 保存した選択 → ブラウザーの言語（ja で始まれば日本語、ほかは英語）
  function detectLanguage(search, stored, navigatorLanguage) {
    const q = new URLSearchParams(search || '').get('lang');
    if (LANGS.includes(q)) return q;
    if (LANGS.includes(stored)) return stored;
    return String(navigatorLanguage || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  }

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function store(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // 保存できない環境では、そのページの間だけ切り替える
    }
  }

  // data-i18n="key" は textContent、data-i18n-attr="attr:key;attr:key" は属性。座学の本文は lang ごとの article を出し分ける
  function applyStaticText(root = document) {
    const t = globalThis.AffineMessages.t;
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      }
    }
    for (const el of root.querySelectorAll('[data-lang]')) el.hidden = el.dataset.lang !== api.lang;
    document.documentElement.lang = api.lang;
  }

  const api = {
    lang: 'ja',
    LANGS,
    detectLanguage,
    init() {
      const wanted = detectLanguage(location.search, readStored(), navigator.language);
      api.lang = globalThis.AffineMessages.MESSAGES[wanted] ? wanted : 'ja';
      return api.lang;
    },
    set(lang) {
      if (!LANGS.includes(lang) || !globalThis.AffineMessages.MESSAGES[lang]) return;
      api.lang = lang;
      store(lang);
    },
    applyStaticText
  };

  globalThis.AffineI18n = api;
})();
