// Affine CipherLab - script.js (v1)
// 4タブ構成 / 暗号化・復号・総当たり（簡易） / 写像表レンダリング
// index.html 側の要素IDと対応しています。
// ※ index.html の <script> 参照が js/main.js になっている場合は js/script.js に変更してください。

(() => {
  "use strict";

  // ------------------------------
  // 定数・ユーティリティ
  // ------------------------------
  const N = 26;
  const VALID_A = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];

  const ENG_FREQ = {
    A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228, G: 2.015,
    H: 6.094, I: 6.966, J: 0.153, K: 0.772, L: 4.025, M: 2.406, N: 6.749,
    O: 7.507, P: 1.929, Q: 0.095, R: 5.987, S: 6.327, T: 9.056, U: 2.758,
    V: 0.978, W: 2.360, X: 0.150, Y: 1.974, Z: 0.074
  };

  const CONNON_WORDS = [
    // Most common words (1-50)
    "THE","AND","TO","OF","IN","IT","IS","THAT","AS","ON","WITH","THIS","BE","FOR","ARE","WAS","BY","YOU","NOT","OR",
    "HAVE","FROM","ONE","HAD","BUT","WORD","WERE","WE","WHEN","YOUR","CAN","SAID","THERE","EACH","WHICH","SHE","DO",
    "HOW","THEIR","IF","WILL","UP","OTHER","ABOUT","OUT","MANY","THEN","THEM","THESE","SO","SOME","HER","WOULD",
    
    // Common words (51-100)
    "MAKE","LIKE","INTO","HIM","HAS","TWO","MORE","GO","NO","WAY","COULD","MY","THAN","FIRST","WATER","BEEN","CALL",
    "WHO","ITS","NOW","FIND","LONG","DOWN","DAY","DID","GET","COME","MADE","MAY","PART","NEW","SOUND","TAKE","ONLY",
    
    // Useful words (101-150)
    "LITTLE","WORK","KNOW","PLACE","YEAR","LIVE","ME","BACK","GIVE","MOST","VERY","AFTER","THING","OUR","JUST","NAME",
    "GOOD","SENTENCE","MAN","THINK","SAY","GREAT","WHERE","HELP","THROUGH","MUCH","BEFORE","LINE","RIGHT","TOO","MEAN",
    
    // Additional common words (151-200)
    "OLD","ANY","SAME","TELL","BOY","FOLLOW","CAME","WANT","SHOW","ALSO","AROUND","FORM","THREE","SMALL","SET","PUT",
    "END","WHY","AGAIN","TURN","HERE","OFF","WENT","MOVE","TRY","KIND","HAND","PICTURE","CHANGE","PLAY","SPELL","AIR",
    
    // More words (201-250)
    "AWAY","ANIMAL","HOUSE","POINT","PAGE","LETTER","MOTHER","ANSWER","FOUND","STUDY","STILL","LEARN","SHOULD","AMERICA",
    "WORLD","HIGH","EVERY","NEAR","ADD","FOOD","BETWEEN","OWN","BELOW","COUNTRY","PLANT","LAST","SCHOOL","FATHER","KEEP",
    "TREE","NEVER","START","CITY","EARTH","EYE","LIGHT","THOUGHT","HEAD","UNDER","STORY","SAW","LEFT","DONT","FEW",
    
    // Final batch (251-300)
    "WHILE","ALONG","MIGHT","CLOSE","SOMETHING","SEEM","NEXT","HARD","OPEN","EXAMPLE","BEGIN","LIFE","ALWAYS","THOSE","BOTH",
    "PAPER","TOGETHER","GOT","GROUP","OFTEN","RUN","IMPORTANT","UNTIL","CHILDREN","SIDE","FEET","CAR","MILE","NIGHT","WALK",
    "WHITE","SEA","BEGAN","GROW","TOOK","RIVER","FOUR","CARRY","STATE","ONCE","BOOK","HEAR","STOP","WITHOUT","SECOND",
    "LATER","MISS","IDEA","ENOUGH","EAT","FACE","WATCH","FAR","INDIAN","REALLY","ALMOST","LET","ABOVE","GIRL","SOMETIMES",
    "MOUNTAIN","CUT","YOUNG","TALK","SOON","LIST","SONG","BEING","LEAVE","FAMILY","HELLO","LOVE","TIME","BAD","LARGE",
    "ABLE","WOMAN","HISTORY","WELL","NEED","DIFFERENT"
  ];

  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));

  const mod = (n, m) => ((n % m) + m) % m;

  const gcd = (a, b) => {
    a = Math.abs(a); b = Math.abs(b);
    while (b !== 0) {
      const t = b; b = a % b; a = t;
    }
    return a;
  };

  // 拡張ユークリッド互除法: ax + by = g (=gcd(a,b)) を返す
  const egcd = (a, b) => {
    if (b === 0) return { g: a, x: 1, y: 0 };
    const { g, x: x1, y: y1 } = egcd(b, a % b);
    return { g, x: y1, y: x1 - Math.floor(a / b) * y1 };
  };

  const modInverse = (a, m) => {
    const { g, x } = egcd(mod(a, m), m);
    if (g !== 1) return null;
    return mod(x, m);
  };

  const isAlpha = (ch) => /^[A-Za-z]$/.test(ch);
  const toIndex = (ch) => ch.toUpperCase().charCodeAt(0) - 65;
  const fromIndex = (i, upper = true) => String.fromCharCode((upper ? 65 : 97) + mod(i, 26));

  // 2バイト文字（日本語等）検出
  const hasMultibyteChars = (text) => {
    for (const ch of text) {
      // ASCII範囲外の文字を検出
      if (ch.charCodeAt(0) > 127) {
        return true;
      }
    }
    return false;
  };

  const preserveCaseNap = (srcChar, idx) => {
    const isUpper = srcChar === srcChar.toUpperCase();
    return fromIndex(idx, isUpper);
  };

  // ------------------------------
  // バリデーション / アラート
  // ------------------------------
  const ensureAlertBox = (sectionEl, alertType = "default") => {
    const className = alertType === "input" ? "alert-input" : "alert";
    let alert = sectionEl.querySelector(`.${className}`);
    if (!alert) {
      alert = document.createElement("div");
      alert.className = `alert ${className}`;
      alert.style.display = "none";
      sectionEl.prepend(alert);
    }
    return alert;
  };

  const showAlert = (sectionEl, msg, type = "error", alertType = "default") => {
    const box = ensureAlertBox(sectionEl, alertType);
    box.textContent = msg;
    box.classList.toggle("success", type === "success");
    box.classList.toggle("warning", type === "warning");
    box.style.display = "block";
  };

  const clearAlert = (sectionEl, alertType = "default") => {
    const className = alertType === "input" ? "alert-input" : "alert";
    const box = sectionEl.querySelector(`.${className}`);
    if (box) box.style.display = "none";
  };

  const validateA = (a) => VALID_A.includes(mod(a, N));

  // 入力テキスト検証とボタン制御
  const validateInputAndToggleButton = (textArea, button, sectionEl) => {
    const text = textArea.value || "";
    const trimmedText = text.trim();
    const hasMultibyte = hasMultibyteChars(text);
    
    if (hasMultibyte) {
      showAlert(sectionEl, "⚠️ エラー: 日本語等の2バイト文字が含まれています。半角文字のみ入力してください。", "error", "input");
      button.disabled = true;
      return false;
    } else if (trimmedText === "") {
      // 空の場合はエラーメッセージは出さないが、ボタンは無効化
      clearAlert(sectionEl, "input");
      button.disabled = true;
      return false;
    } else {
      clearAlert(sectionEl, "input");
      button.disabled = false;
      return true;
    }
  };

  // ------------------------------
  // 写像表レンダリング
  // ------------------------------
  const createNappingColumn = (rowData, imageCount, isValid, title) => {
    const column = document.createElement("div");
    column.className = "mapping-column";
    
    const titleDiv = document.createElement("div");
    titleDiv.style.cssText = "font-size:12px; color:var(--muted); margin-bottom:4px; text-align:center; font-weight:600;";
    titleDiv.textContent = title;
    column.appendChild(titleDiv);
    
    const tableEl = document.createElement("table");
    tableEl.className = "mapping-table";
    tableEl.style.cssText = "width:100%; border-collapse:collapse; font-size:12px;";
    
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.style.cssText = "text-align:left; border-bottom:1px solid var(--border);";
    
    const headers = ["Plain", "→", "Cipher"];
    headers.forEach(text => {
      const th = document.createElement("th");
      th.style.cssText = "padding:4px 6px; font-size:11px; color:var(--muted);";
      th.textContent = text;
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    tableEl.appendChild(thead);
    
    const tbody = document.createElement("tbody");
    tableEl.appendChild(tbody);
    
    rowData.forEach(({ m, c }) => {
      const tr = document.createElement("tr");
      tr.className = "mapping-row";
      tr.dataset.m = String(m);
      tr.dataset.c = String(c);

      // 非単射（重複像）を薄赤で示す
      const dup = imageCount.get(c) > 1 && !isValid;
      if (dup) tr.style.background = "color-mix(in srgb, var(--danger) 10%, var(--card))";

      const cells = [
        { text: `${fromIndex(m)}(${m})`, style: "padding:4px 6px;" },
        { text: "→", style: "padding:4px 6px; text-align:center;" },
        { text: `${fromIndex(c)}(${c})`, style: "padding:4px 6px; font-weight:600;" }
      ];
      
      cells.forEach(({ text, style }) => {
        const td = document.createElement("td");
        td.style.cssText = style;
        td.textContent = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    
    column.appendChild(tableEl);
    return column;
  };
  const renderMapping = (container, a, b) => {
    if (!container) return;
    a = Number(a); b = Number(b);
    const good = validateA(a);
    const headerMsg = `写像表 (a=${a}, b=${b}, n=${N}) ${good ? "" : "※ aとnが互いに素でないため単射になりません"}`;    

    // 変換テーブル
    const rows = [];
    const imageCount = new Map();
    for (let m = 0; m < 26; m++) {
      const c = mod(a * m + b, N);
      rows.push({ m, c });
      imageCount.set(c, (imageCount.get(c) || 0) + 1);
    }

    const table = document.createElement("div");
    const headerDiv = document.createElement("div");
    headerDiv.style.cssText = "margin-bottom:8px; font-size:13px; color: var(--muted);";
    headerDiv.textContent = headerMsg;
    table.appendChild(headerDiv);
    
    // 2列レイアウトコンテナ
    const tablesContainer = document.createElement("div");
    tablesContainer.className = "mapping-tables-container";
    
    // 左列 (A-N) と右列 (N-Z) を作成
    const leftColumn = createNappingColumn(rows.slice(0, 13), imageCount, validateA(a), "A-N");
    const rightColumn = createNappingColumn(rows.slice(13, 26), imageCount, validateA(a), "N-Z");
    
    tablesContainer.appendChild(leftColumn);
    tablesContainer.appendChild(rightColumn);
    table.appendChild(tablesContainer);

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(table);
  };

  const pulseRow = (container, predicate) => {
    if (!container) return;
    const rows = $$(".mapping-row", container);
    rows.forEach((r) => r.style.outline = "none");

    const target = rows.find(predicate);
    if (target) {
      target.style.transition = "outline .15s ease, background .15s ease";
      target.style.outline = "3px solid color-mix(in srgb, var(--accent) 55%, transparent)";
      target.style.background = "color-mix(in srgb, var(--accent) 12%, var(--card))";
      setTimeout(() => {
        target.style.outline = "none";
        target.style.background = "";
      }, 600);
    }
  };

  // 持続的ハイライト（入力変更まで残る）
  const highlightRow = (container, predicate) => {
    if (!container) return;
    const rows = $$(".mapping-row", container);
    // 既存のハイライトをクリア
    rows.forEach((r) => {
      r.classList.remove("highlighted");
      r.style.outline = "";
      r.style.background = "";
    });

    const target = rows.find(predicate);
    if (target) {
      target.classList.add("highlighted");
      target.style.outline = "2px solid var(--accent)";
      target.style.background = "color-mix(in srgb, var(--accent) 15%, var(--card))";
    }
  };

  // 複数行を持続的ハイライト
  const highlightRows = (container, indices) => {
    if (!container || !indices || indices.size === 0) return;
    const rows = $$(".mapping-row", container);
    // 既存のハイライトをクリア
    rows.forEach((r) => {
      r.classList.remove("highlighted");
      r.style.outline = "";
      r.style.background = "";
    });

    // 指定されたインデックスの行をハイライト
    rows.forEach((row) => {
      const m = Number(row.dataset.m);
      if (indices.has(m)) {
        row.classList.add("highlighted");
        row.style.outline = "2px solid var(--accent)";
        row.style.background = "color-mix(in srgb, var(--accent) 15%, var(--card))";
      }
    });
  };

  // ハイライトをクリア
  const clearHighlight = (container) => {
    if (!container) return;
    const rows = $$(".mapping-row", container);
    rows.forEach((r) => {
      r.classList.remove("highlighted");
      r.style.outline = "";
      r.style.background = "";
    });
  };

  // ------------------------------
  // 核心: 暗号化 / 復号
  // ------------------------------
  const encryptChar = (ch, a, b) => {
    if (!isAlpha(ch)) return ch;
    const m = toIndex(ch);
    const c = mod(a * m + b, N);
    return preserveCaseNap(ch, c);
  };

  const decryptChar = (ch, a, b) => {
    if (!isAlpha(ch)) return ch;
    const c = toIndex(ch);
    const inv = modInverse(a, N);
    if (inv == null) return ch; // 逆元なし
    const m = mod(inv * (c - b), N);
    return preserveCaseNap(ch, m);
  };

  const stripSpaces = (text) => {
    return text.replace(/\s+/g, '');
  };

  const stripSymbols = (text) => {
    return text.replace(/[^A-Za-z\s]/g, '');
  };

  const processText = (text, stripSpacesFlag, stripSymbolsFlag) => {
    let processed = text;
    if (stripSpacesFlag) {
      processed = stripSpaces(processed);
    }
    if (stripSymbolsFlag) {
      processed = stripSymbols(processed);
    }
    return processed;
  };

  const encryptText = (text, a, b, mappingContainer, stripSpacesFlag = false, stripSymbolsFlag = false) => {
    const processedText = processText(text, stripSpacesFlag, stripSymbolsFlag);
    let out = "";
    const usedIndices = new Set();
    
    for (const ch of processedText) {
      const enc = encryptChar(ch, a, b);
      out += enc;

      // 使用された文字のインデックスを記録
      if (isAlpha(ch)) {
        usedIndices.add(toIndex(ch));
      }
    }
    
    // 使用されたすべての文字を持続的ハイライト
    if (usedIndices.size > 0 && mappingContainer) {
      highlightRows(mappingContainer, usedIndices);
    }
    
    return out;
  };

  const decryptText = (text, a, b, mappingContainer, stripSpacesFlag = false, stripSymbolsFlag = false) => {
    const processedText = processText(text, stripSpacesFlag, stripSymbolsFlag);
    const inv = modInverse(a, N);
    let out = "";
    const usedIndices = new Set();
    
    for (const ch of processedText) {
      const dec = decryptChar(ch, a, b);
      out += dec;

      // 使用された文字のインデックスを記録（復号では暗号文に対応する平文インデックス）
      if (isAlpha(ch) && inv != null) {
        const c = toIndex(ch);
        // m = a^{-1}(c - b) mod n
        const m = mod(inv * (c - b), N);
        usedIndices.add(m);
      }
    }
    
    // 使用されたすべての文字を持続的ハイライト
    if (usedIndices.size > 0 && mappingContainer) {
      highlightRows(mappingContainer, usedIndices);
    }
    
    return out;
  };

  // ------------------------------
  // 総当たり（簡易スコア）
  // ------------------------------
  const scoreCandidate = (text) => {
    const up = text.toUpperCase();
    // 単語ヒット数
    let hits = 0;
    for (const w of CONNON_WORDS) {
      // 重複ヒットも加点
      const regex = new RegExp(`\\b${w}\\b`, "g");
      const match = up.match(regex);
      if (match) hits += match.length;
    }

    // カイ二乗（小さいほど良い）
    const counts = {};
    let letters = 0;
    for (const ch of up) {
      if (isAlpha(ch)) {
        counts[ch] = (counts[ch] || 0) + 1;
        letters++;
      }
    }
    let chi = 0;
    if (letters > 0) {
      for (const k in ENG_FREQ) {
        const expected = (ENG_FREQ[k] / 100) * letters;
        const observed = counts[k] || 0;
        chi += ((observed - expected) ** 2) / (expected || 1);
      }
    }

    // 総合スコア（大きいほど良い）：単語ヒットを強め、カイ二乗の小ささを加点に変換
    const score = hits * 10 + (letters > 0 ? (500 / (1 + chi)) : 0);
    return { hits, chi, score };
  };

  const bruteForceAffine = (cipher) => {
    const results = [];
    for (const a of VALID_A) {
      const inv = modInverse(a, N);
      for (let b = 0; b < N; b++) {
        const plain = decryptText(cipher, a, b, null);
        const { score, hits, chi } = scoreCandidate(plain);
        results.push({ a, b, plain, score, hits, chi });
      }
    }
    results.sort((p, q) => q.score - p.score);
    return results;
  };

  // ------------------------------
  // コピー機能とトースト
  // ------------------------------
  const showToast = (message) => {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    // 新しいトーストを作成
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // 3秒後に自動削除
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3000);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('クリップボードにコピーしました');
    } catch (err) {
      // fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        showToast('クリップボードにコピーしました');
      } catch (err) {
        showToast('コピーに失敗しました');
      }
      textArea.remove();
    }
  };

  // ------------------------------
  // イベント配線
  // ------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    // タブ切替
    const tabButtons = $$(".tab-button");
    const tabContents = $$(".tab-content");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.tab;
        tabButtons.forEach(b => b.classList.toggle("active", b === btn));
        tabContents.forEach(sec => sec.classList.toggle("active", sec.id === id));
      });
    });

    // 各要素
    const encryptSec = $("#encrypt");
    const decryptSec = $("#decrypt");
    const crackSec = $("#crack");

    const aEnc = $("#a-encrypt");
    const bEnc = $("#b-encrypt");
    const aDec = $("#a-decrypt");
    const bDec = $("#b-decrypt");

    const pt = $("#plaintext");
    const encBtn = $("#encrypt-btn");
    const ct = $("#ciphertext");
    const stripSpacesEncrypt = $("#strip-spaces-encrypt");
    const stripSymbolsEncrypt = $("#strip-symbols-encrypt");

    const ctIn = $("#ciphertext-input");
    const decBtn = $("#decrypt-btn");
    const ptOut = $("#plaintext-output");
    const stripSpacesDecrypt = $("#strip-spaces-decrypt");
    const stripSymbolsDecrypt = $("#strip-symbols-decrypt");

    const crackIn = $("#crack-input");
    const crackBtn = $("#crack-btn");
    const crackResults = $("#crack-results");
    const syncCipherBtn = $("#sync-cipher-btn");

    const mapEnc = $("#mapping-encrypt");
    const mapDec = $("#mapping-decrypt");
    const mapCrk = $("#mapping-crack");

    // a,b の同期（Encrypt/Decrypt 双方向）
    const syncAB = (src) => {
      const aVal = Number(src === "enc" ? aEnc.value : aDec.value);
      const bVal = Number(src === "enc" ? bEnc.value : bDec.value);
      if (src === "enc") {
        aDec.value = String(aVal);
        bDec.value = String(bVal);
      } else {
        aEnc.value = String(aVal);
        bEnc.value = String(bVal);
      }
      // 写像表再描画
      renderMapping(mapEnc, aVal, bVal);
      renderMapping(mapDec, aVal, bVal);
      renderMapping(mapCrk, aVal, bVal);
      // バリデーション表示
      const good = validateA(aVal);
      [encryptSec, decryptSec, crackSec].forEach(sec => {
        if (!sec) return;
        if (!good) {
          showAlert(sec, `⚠️ 警告: a と n=26 が互いに素ではありません（gcd(a,26) = ${gcd(aVal, 26)}）。単射にならないため復号が困難になります。有効な a は {${VALID_A.join(", ")}} です。`, "warning");
        } else {
          clearAlert(sec);
        }
      });
    };

    // 初期レンダリング
    renderMapping(mapEnc, Number(aEnc.value), Number(bEnc.value));
    renderMapping(mapDec, Number(aDec.value), Number(bDec.value));
    renderMapping(mapCrk, Number(aEnc.value), Number(bEnc.value));

    // テキスト入力の2バイト文字検証とハイライトクリア
    pt?.addEventListener("input", () => {
      validateInputAndToggleButton(pt, encBtn, encryptSec);
      clearHighlight(mapEnc); // 入力変更時にハイライトをクリア
    });
    ctIn?.addEventListener("input", () => {
      validateInputAndToggleButton(ctIn, decBtn, decryptSec);
      clearHighlight(mapDec); // 入力変更時にハイライトをクリア
    });
    crackIn?.addEventListener("input", () => {
      validateInputAndToggleButton(crackIn, crackBtn, crackSec);
    });

    // 初期状態でボタン状態を設定（syncABより前に実行）
    if (pt && encBtn) validateInputAndToggleButton(pt, encBtn, encryptSec);
    if (ctIn && decBtn) validateInputAndToggleButton(ctIn, decBtn, decryptSec);
    if (crackIn && crackBtn) validateInputAndToggleButton(crackIn, crackBtn, crackSec);

    // パラメーター同期（ボタン状態設定後に実行）
    syncAB("enc");

    // 入力変更イベント
    [aEnc, bEnc].forEach(inp => {
      inp.addEventListener("input", () => syncAB("enc"));
      inp.addEventListener("change", () => syncAB("enc"));
    });
    [aDec, bDec].forEach(inp => {
      inp.addEventListener("input", () => syncAB("dec"));
      inp.addEventListener("change", () => syncAB("dec"));
    });

    // 暗号化
    encBtn?.addEventListener("click", () => {
      // 2バイト文字チェック
      if (!validateInputAndToggleButton(pt, encBtn, encryptSec)) {
        return; // 2バイト文字がある場合は処理中止
      }
      
      const a = Number(aEnc.value), b = Number(bEnc.value);
      if (!validateA(a)) {
        showAlert(encryptSec, `⚠️ 警告: a と n=26 が互いに素ではありません（gcd(a,26) = ${gcd(a, 26)}）。単射にならないため復号が困難になります。有効な a は {${VALID_A.join(", ")}} です。`, "warning");
        // 警告を出しつつ暗号化は実行する
      } else {
        clearAlert(encryptSec);
      }
      const text = pt.value ?? "";
      const shouldStripSpaces = stripSpacesEncrypt?.checked ?? false;
      const shouldStripSymbols = stripSymbolsEncrypt?.checked ?? false;
      const out = encryptText(text, a, b, mapEnc, shouldStripSpaces, shouldStripSymbols);
      ct.value = out;
    });

    // 復号
    decBtn?.addEventListener("click", () => {
      // 2バイト文字チェック
      if (!validateInputAndToggleButton(ctIn, decBtn, decryptSec)) {
        return; // 2バイト文字がある場合は処理中止
      }
      
      const a = Number(aDec.value), b = Number(bDec.value);
      if (!validateA(a)) {
        showAlert(decryptSec, `a と n=26 が互いに素ではありません（gcd(a,26) = ${gcd(a, 26)}）。有効な a は {${VALID_A.join(", ")}} です。`);
        return;
      }
      const inv = modInverse(a, N);
      if (inv == null) {
        showAlert(decryptSec, "a の逆元 a⁻¹ が存在しないため復号できません。");
        return;
      }
      clearAlert(decryptSec);
      const text = ctIn.value ?? "";
      const shouldStripSpaces = stripSpacesDecrypt?.checked ?? false;
      const shouldStripSymbols = stripSymbolsDecrypt?.checked ?? false;
      const out = decryptText(text, a, b, mapDec, shouldStripSpaces, shouldStripSymbols);
      ptOut.value = out;
    });

    // 総当たり
    crackBtn?.addEventListener("click", () => {
      // 2バイト文字チェック
      if (!validateInputAndToggleButton(crackIn, crackBtn, crackSec)) {
        return; // 2バイト文字がある場合は処理中止
      }
      
      const cipher = (crackIn.value ?? "").trim();
      if (!cipher) {
        showAlert(crackSec, "暗号文を入力してください。");
        return;
      }
      clearAlert(crackSec);

      const results = bruteForceAffine(cipher).slice(0, 20); // 上位20件
      while (crackResults.firstChild) {
        crackResults.removeChild(crackResults.firstChild);
      }

      // テーブル作成
      const table = document.createElement("table");
      table.className = "crack-results-table";
      table.style.cssText = "width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px;";

      // ヘッダー作成
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      headerRow.style.cssText = "background: var(--bg); border-bottom: 2px solid var(--border);";

      const headers = ["順位", "a", "b", "Score", "Hits", "Chi", "復号結果", "操作"];
      headers.forEach(text => {
        const th = document.createElement("th");
        th.style.cssText = "padding: 8px 6px; text-align: center; font-weight: 600; color: var(--muted); border-right: 1px solid var(--border);";
        if (text === "復号結果") th.style.cssText += " width: 40%;";
        th.textContent = text;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // ボディ作成
      const tbody = document.createElement("tbody");
      results.forEach(({ a, b, plain, score, hits, chi }, index) => {
        const row = document.createElement("tr");
        row.style.cssText = "border-bottom: 1px solid var(--border);";
        if (index % 2 === 0) row.style.background = "color-mix(in srgb, var(--bg) 30%, var(--card))";

        const cells = [
          { text: String(index + 1), style: "padding: 8px 6px; text-align: center; font-weight: 600;" },
          { text: String(a), style: "padding: 8px 6px; text-align: center; font-family: monospace;" },
          { text: String(b), style: "padding: 8px 6px; text-align: center; font-family: monospace;" },
          { text: score.toFixed(1), style: "padding: 8px 6px; text-align: center; font-weight: 600; color: var(--accent);" },
          { text: String(hits), style: "padding: 8px 6px; text-align: center;" },
          { text: chi.toFixed(1), style: "padding: 8px 6px; text-align: center;" },
          { text: plain, style: "padding: 8px 6px; font-family: monospace; word-break: break-all; max-width: 200px;" },
        ];

        cells.forEach(({ text, style }) => {
          const td = document.createElement("td");
          td.style.cssText = style + " border-right: 1px solid var(--border);";
          td.textContent = text;
          row.appendChild(td);
        });

        // 操作ボタンのセル
        const actionTd = document.createElement("td");
        actionTd.style.cssText = "padding: 8px 6px; text-align: center;";
        
        const viewBtn = document.createElement("button");
        viewBtn.textContent = "📊";
        viewBtn.title = "写像表で確認";
        viewBtn.style.cssText = "padding: 4px 6px; font-size: 12px; background: var(--accent); color: white; border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;";
        viewBtn.addEventListener("click", () => {
          aEnc.value = String(a);
          bEnc.value = String(b);
          aDec.value = String(a);
          bDec.value = String(b);
          syncAB("enc");
          renderMapping(mapCrk, a, b);
          showToast(`パラメーター(a=${a}, b=${b})を設定しました`);
        });

        actionTd.appendChild(viewBtn);
        row.appendChild(actionTd);
        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      crackResults.appendChild(table);
    });

    // コピーボタンのイベント
    $$(".copy-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        const targetElement = $(`#${targetId}`);
        if (targetElement) {
          copyToClipboard(targetElement.value);
        }
      });
    });

    // 同期ボタンのイベント
    syncCipherBtn?.addEventListener("click", () => {
      const cipherText = ct.value || "";
      if (!cipherText.trim()) {
        showToast("暗号化タブで暗号文を生成してください");
        return;
      }
      ctIn.value = cipherText;
      // a, b パラメータも同期
      aDec.value = aEnc.value;
      bDec.value = bEnc.value;
      syncAB("dec");
      // 暗号文セット後にボタン状態を更新
      validateInputAndToggleButton(ctIn, decBtn, decryptSec);
      showToast("暗号文とパラメータを同期しました");
    });

    // テキスト入力中に写像を軽くハイライト（最後の文字を対象）
    const highlightLastChar = (textarea, mapContainer, direction, aProvider, bProvider) => {
      textarea.addEventListener("keyup", () => {
        const val = textarea.value ?? "";
        if (!val.length) return;
        const ch = val[val.length - 1];
        if (!isAlpha(ch)) return;
        const a = Number(aProvider().value);
        const b = Number(bProvider().value);
        if (!validateA(a)) return;
        if (direction === "enc") {
          const x = toIndex(ch);
          pulseRow(mapContainer, (r) => Number(r.dataset.x) === x);
        } else {
          const inv = modInverse(a, N);
          if (inv == null) return;
          const y = toIndex(ch);
          const x = mod(inv * (y - b), N);
          pulseRow(mapContainer, (r) => Number(r.dataset.x) === x);
        }
      });
    };

    if (pt && mapEnc) highlightLastChar(pt, mapEnc, "enc", () => aEnc, () => bEnc);
    if (ctIn && mapDec) highlightLastChar(ctIn, mapDec, "dec", () => aDec, () => bDec);
  });
})();
