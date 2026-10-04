// 画面の文言（日本語・英語で同じキー）。t(key, vars, lang) で {name} を値に置き換える。globalThis.AffineMessages に置く
(() => {
  'use strict';

  const ja = {
    'ui.subtitle': '古典暗号「アフィン暗号」を学習・体験できるツール',
    'ui.tabsLabel': '機能の切り替え',
    'ui.repo': '🔗 GitHubリポジトリはこちら',
    'tab.encrypt': '暗号化',
    'tab.decrypt': '復号',
    'tab.crack': '総当たり解読',
    'tab.learn': '座学',
    'enc.heading': '暗号化（Encrypt）',
    'enc.input': '平文',
    'enc.placeholder': '平文を入力してください',
    'dec.heading': '復号（Decrypt）',
    'dec.input': '暗号文',
    'dec.placeholder': '暗号文を入力してください',
    'crack.heading': '総当たり解読（Crack）',
    'crack.lead': '暗号文を312通り（aの候補12個 × bの26通り）の鍵ですべて復号し、英語らしい順に並べます。',
    'crack.legend': '英語らしさ＝隣り合う2文字の対数尤度の和＋よく使う英単語の数×4（大きいほど英語らしい）。単語＝よく使う英単語（2文字以上）の数。',
    'learn.heading': '座学（Learn）',
    'key.hint': '有効なaは1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25（26と互いに素な数）、bは0〜25の整数です。',
    'opt.stripSpaces': '空白を除去',
    'opt.stripSymbols': '記号を除去（英字と空白だけを残す）',
    'btn.encrypt': '暗号化',
    'btn.decrypt': '復号',
    'btn.crack': '解析する',
    'btn.copy': '📋 コピー',
    'btn.sync': '🔄 暗号化タブの暗号文と鍵を入れる',
    'btn.set': '写像表で見る',
    'out.cipher': '暗号文',
    'out.plain': '復号結果',
    'out.candidates': '候補',

    'err.empty': '{name}を入れてください。',
    'err.notInteger': '{name}は整数で入れてください。',
    'err.aRange': 'aは1〜25の整数で入れてください。',
    'err.bRange': 'bは0〜25の整数で入れてください。',
    'warn.notCoprime': 'a={a}は26と互いに素ではありません（gcd({a}, 26) = {gcd}）。暗号化は単射にならず、同じ暗号文字に2つ以上の平文字が写るため、復号できません。',
    'warn.decryptBlocked': 'a={a}は26と互いに素ではないので（gcd({a}, 26) = {gcd}）、逆元a⁻¹がなく復号できません。有効なaを選んでください。',
    'note.notInjective': 'aが26と互いに素ではないため、この暗号文は元に戻せません（写像表の赤い行）。',
    'note.fullwidth': '全角英字{n}字は変換しません。半角に直すと変換できます。',
    'err.tooLong': '{max}字を超えています（{n}字）。',
    'err.noLetters': '英字（A〜Z）がありません。',

    'map.heading': '写像表（a={a}, b={b}, n=26）',
    'map.dup': '赤い行は、同じ暗号文字に2つ以上の平文字が写る行です（単射でない）。',
    'map.left': 'A〜M',
    'map.right': 'N〜Z',
    'map.plain': '平文',
    'map.cipher': '暗号文',
    'map.caption': '{range}の写像',

    'crack.status': '英字{letters}字を312通りの鍵で復号し、英語らしい順に上位{top}件を出しました。',
    'crack.statusScored': '英字{letters}字のうち先頭{scored}字で採点し、英語らしい順に上位{top}件を出しました。',
    'crack.close': '1位と2位の差が{margin}と小さく、見分けにくい結果です。2位以下の候補も読んで確かめてください。',
    'crack.short': '英字が{letters}字と少ないため、外れることがあります。評価用の英文では、{len}字（{spaces}）のとき1位が正解だったのは{rate}%でした。',
    'crack.spaces': '単語の空白あり',
    'crack.noSpaces': '空白なし',
    'crack.col.rank': '順位',
    'crack.col.a': 'a',
    'crack.col.b': 'b',
    'crack.col.score': '英語らしさ',
    'crack.col.words': '単語',
    'crack.col.text': '復号結果（先頭）',
    'crack.col.action': '操作',
    'crack.caption': '総当たりの候補（上位{top}件）',

    'toast.copied': 'クリップボードにコピーしました。',
    'toast.copyFailed': 'コピーできませんでした。欄を選んでコピーしてください。',
    'toast.synced': '暗号文と鍵を入れました。',
    'toast.noCipher': '先に暗号化タブで暗号文を作ってください。',
    'toast.set': 'a={a}, b={b}を写像表に入れました。',
    'key.a': 'a',
    'key.b': 'b'
  };

  const MESSAGES = { ja };

  function t(key, vars = {}, lang) {
    const dict = MESSAGES[lang || (globalThis.AffineI18n && globalThis.AffineI18n.lang) || 'ja'] || ja;
    let text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
    return text;
  }

  globalThis.AffineMessages = { MESSAGES, t };
})();
