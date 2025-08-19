# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is **Affine CipherLab** - an educational web tool for learning and experiencing the Affine Cipher, a classical cryptographic algorithm. The tool is part of the "生成AIで作るセキュリティツール100" (100 Security Tools Made with Generative AI) project.

## Core Functionality
The application provides 4 main tabs:
1. **Encryption** - Encrypt text with affine cipher and visualize character mappings
2. **Decryption** - Decrypt ciphertext using modular inverse
3. **Brute Force Crack** - Try all 312 possible (a,b) key combinations  
4. **Learn** - Educational content about affine cipher mathematics

## Architecture
- **Single-page application** with vanilla JavaScript
- **No build process** - runs directly in browser
- **File structure**:
  - `index.html` - Main HTML with 4-tab layout
  - `js/script.js` - Core logic (encryption/decryption, GCD, modular inverse, brute force)
  - `css/style.css` - Responsive styling with automatic dark mode support
  
## Key Technical Details
- **Affine cipher formula**: `E(x) = (a·x + b) mod 26`
- **Valid 'a' values**: {1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25} (must be coprime with 26)
- **Modular inverse** calculation using Extended Euclidean Algorithm
- **Brute force scoring** based on English letter frequency and common words

## Development Commands
Since this is a static site with no build process:
- **Run locally**: Open `index.html` directly in browser or use any static server
- **Deploy**: Host files on GitHub Pages (already configured at ipusiron.github.io/affine-cipherlab/)

## Important Notes
- CSS includes automatic dark mode via `prefers-color-scheme`
- Mapping visualization highlights character transformations in real-time
- No external dependencies - pure vanilla JavaScript implementation
- All DOM manipulation uses safe methods (createElement, textContent) to prevent XSS
- Security headers configured for safe GitHub Pages deployment