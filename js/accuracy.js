// 生成物（tools/evaluate.mjs write が tools/corpus/eval-pg98.txt から作る。手で編集しない）
// 総当たりの1位が正解になった割合（%）。[英字の数, 割合]。各300回、乱数の種 20261004
globalThis.AffineAccuracy = {
  source: 'Project Gutenberg #98 A Tale of Two Cities (tools/corpus/eval-pg98.txt)',
  trials: 300,
  spaces: [[6, 67.0], [8, 81.0], [10, 88.7], [15, 98.3], [20, 100.0], [30, 100.0]],
  noSpaces: [[6, 46.0], [8, 68.3], [10, 81.7], [15, 95.3], [20, 98.3], [30, 100.0]]
};
