// 画面と同じ通常のスクリプト（js/*.js）を、開発用スクリプトの中に読み込む
import fs from 'node:fs';
import vm from 'node:vm';

export function loadCore() {
  for (const f of ['js/english-data.js', 'js/affine-core.js']) {
    const url = new URL(`../${f}`, import.meta.url);
    if (fs.existsSync(url)) vm.runInThisContext(fs.readFileSync(url, 'utf8'), { filename: f });
  }
  return globalThis.AffineCore;
}
