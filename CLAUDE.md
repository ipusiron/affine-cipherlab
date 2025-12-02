# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
**Affine CipherLab** - an educational web tool for learning the Affine Cipher (古典暗号). Part of the "生成AIで作るセキュリティツール100" project (Day049).

## Architecture
Single-page vanilla JavaScript application with no build process or external dependencies.

**File Structure:**
- `index.html` - 4-tab layout (暗号化/復号/総当たり解読/座学)
- `js/script.js` - Core logic wrapped in IIFE with `"use strict"`
- `css/style.css` - Responsive styling with `prefers-color-scheme` dark mode

## Development
- **Run locally**: Open `index.html` directly in browser or use any static server
- **Deploy**: GitHub Pages at ipusiron.github.io/affine-cipherlab/

## Key Implementation Details

**Cryptographic Functions (js/script.js):**
- `gcd(a, b)` / `egcd(a, b)` - GCD and Extended Euclidean Algorithm
- `modInverse(a, m)` - Modular inverse calculation
- `encryptChar` / `decryptChar` - Per-character transformation preserving case
- `bruteForceAffine(cipher)` - Tests all 312 (a,b) combinations

**Constraints:**
- Valid 'a' values: `{1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25}` (coprime with 26)
- Formula: `E(x) = (a·x + b) mod 26`, `D(y) = a⁻¹·(y - b) mod 26`

**Brute Force Scoring:**
- `scoreCandidate(text)` uses chi-square test against English letter frequencies (`ENG_FREQ`)
- Matches against 300-word common English word list (`CONNON_WORDS`)
- Score formula: `hits * 10 + (500 / (1 + chi))`

**Input Validation:**
- `hasMultibyteChars()` - Rejects non-ASCII input (Japanese, etc.)
- `validateA()` - Checks if 'a' is coprime with 26
- All DOM updates use `createElement` / `textContent` (XSS-safe)

**UI Patterns:**
- Tab state managed via `.active` class toggling
- Parameter sync between Encrypt/Decrypt tabs via `syncAB()`
- Mapping table highlights via `highlightRows()` / `pulseRow()`
- Toast notifications via `showToast()`

## Security Notes
- CSP headers configured in `<meta>` tags
- No `innerHTML` usage - all DOM manipulation is safe
- Clipboard API with fallback for older browsers