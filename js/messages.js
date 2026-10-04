// 画面の文言（日本語・英語で同じキー）。t(key, vars, lang) で {name} を値に置き換える。globalThis.AffineMessages に置く
(() => {
  'use strict';

  const ja = {
    'ui.subtitle': '古典暗号「アフィン暗号」を学習・体験できるツール',
    'ui.tabsLabel': '機能の切り替え',
    'ui.repo': '🔗 GitHubリポジトリ',
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
    'key.b': 'b',
    'ui.langButton': 'English',
    'ui.langLabel': 'Switch to English',
    'theme.toDark': 'ダークモードに切り替える',
    'theme.toLight': 'ライトモードに切り替える'
  };

  const en = {
    'ui.subtitle': 'A tool to learn and try the classical affine cipher',
    'ui.tabsLabel': 'Choose a function',
    'ui.repo': '🔗 GitHub repository',
    'tab.encrypt': 'Encrypt',
    'tab.decrypt': 'Decrypt',
    'tab.crack': 'Brute force',
    'tab.learn': 'Learn',
    'enc.heading': 'Encrypt',
    'enc.input': 'Plaintext',
    'enc.placeholder': 'Enter the plaintext',
    'dec.heading': 'Decrypt',
    'dec.input': 'Ciphertext',
    'dec.placeholder': 'Enter the ciphertext',
    'crack.heading': 'Brute-force attack',
    'crack.lead': 'Decrypts the ciphertext with all 312 keys (12 choices of a × 26 of b) and ranks the results by how English they look.',
    'crack.legend': 'English score = sum of log-likelihoods of adjacent letter pairs + 4 × common English words (higher looks more English). '
      + 'Words = number of common English words (2+ letters).',
    'learn.heading': 'Learn',
    'key.hint': 'Valid values of a are 1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23 and 25 (coprime to 26); b is an integer from 0 to 25.',
    'opt.stripSpaces': 'Remove spaces',
    'opt.stripSymbols': 'Remove symbols (keep only letters and spaces)',
    'btn.encrypt': 'Encrypt',
    'btn.decrypt': 'Decrypt',
    'btn.crack': 'Analyze',
    'btn.copy': '📋 Copy',
    'btn.sync': '🔄 Use the ciphertext and key from the Encrypt tab',
    'btn.set': 'Show in table',
    'out.cipher': 'Ciphertext',
    'out.plain': 'Decrypted text',
    'out.candidates': 'Candidates',

    'err.empty': 'Enter {name}.',
    'err.notInteger': '{name} must be an integer.',
    'err.aRange': 'a must be an integer from 1 to 25.',
    'err.bRange': 'b must be an integer from 0 to 25.',
    'warn.notCoprime': 'a={a} is not coprime to 26 (gcd({a}, 26) = {gcd}). '
      + 'Encryption is not one-to-one: two or more plaintext letters map to the same ciphertext letter, so it cannot be decrypted.',
    'warn.decryptBlocked': 'a={a} is not coprime to 26 (gcd({a}, 26) = {gcd}), so it has no inverse a⁻¹ and cannot decrypt. Choose a valid a.',
    'note.notInjective': 'Because a is not coprime to 26, this ciphertext cannot be turned back (red rows in the table).',
    'note.fullwidth': '{n} full-width letters are not converted. Change them to half-width letters to convert them.',
    'err.tooLong': 'Longer than {max} characters ({n}).',
    'err.noLetters': 'There are no letters (A–Z).',

    'map.heading': 'Mapping table (a={a}, b={b}, n=26)',
    'map.dup': 'Red rows are letters that share a ciphertext letter with another plaintext letter (not one-to-one).',
    'map.left': 'A–M',
    'map.right': 'N–Z',
    'map.plain': 'Plain',
    'map.cipher': 'Cipher',
    'map.caption': 'Mapping of {range}',

    'crack.status': 'Decrypted {letters} letters with all 312 keys and listed the top {top} by English score.',
    'crack.statusScored': 'Scored the first {scored} of {letters} letters and listed the top {top} by English score.',
    'crack.close': 'The gap between the first and second candidates is only {margin}, so they are hard to tell apart. Read the lower candidates too.',
    'crack.short': 'With only {letters} letters, the first candidate can be wrong. '
      + 'On the evaluation text, the first candidate was correct {rate}% of the time at {len} letters ({spaces}).',
    'crack.spaces': 'with word spaces',
    'crack.noSpaces': 'without spaces',
    'crack.col.rank': 'Rank',
    'crack.col.a': 'a',
    'crack.col.b': 'b',
    'crack.col.score': 'English score',
    'crack.col.words': 'Words',
    'crack.col.text': 'Decrypted text (start)',
    'crack.col.action': 'Action',
    'crack.caption': 'Brute-force candidates (top {top})',

    'toast.copied': 'Copied to the clipboard.',
    'toast.copyFailed': 'Could not copy. Select the field and copy it.',
    'toast.synced': 'Filled in the ciphertext and key.',
    'toast.noCipher': 'Make a ciphertext on the Encrypt tab first.',
    'toast.set': 'Set a={a}, b={b} in the mapping table.',
    'key.a': 'a',
    'key.b': 'b',
    'ui.langButton': '日本語',
    'ui.langLabel': '日本語に切り替える',
    'theme.toDark': 'Switch to dark mode',
    'theme.toLight': 'Switch to light mode'
  };

  const MESSAGES = { ja, en };

  function t(key, vars = {}, lang) {
    const dict = MESSAGES[lang || (globalThis.AffineI18n && globalThis.AffineI18n.lang) || 'ja'] || ja;
    let text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
    return text;
  }

  globalThis.AffineMessages = { MESSAGES, t };
})();
