# 2026-10-15 UI更新

## デザインの基準

Appleの[Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)と[Material Design 3](https://m3.material.io/)を、Webアプリの制約に合わせて適用。

- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout): 画面幅・向きへの適応、システム領域の余白、重要な操作の優先順位。
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): 操作領域の確保、明確なラベル、色以外の状態表示、キーボード操作、動きを減らす設定。
- [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): 1つの主要操作、短く明確なラベル、一般的なシンボルと操作の一貫性。

- Material [Layout](https://m3.material.io/foundations/layout/layout-overview/overview): 幅と高さに応じたペイン構成、関連する操作のグループ化、一貫した余白。
- Material [Color roles](https://m3.material.io/styles/color/the-color-system/key-colors-tones): 背景・コンテナ・文字・主操作の色を役割ごとに統一。チーム色は状態と確定操作に使う。
- Material [Motion](https://m3.material.io/styles/motion/overview/how-it-works): 実用的な操作に合う控えめな反応を採用。Web実装では色と境界線に140msの遷移を設定し、位置の跳ね返りは加えない。公式Springの完全実装ではない。

既存の紫・オレンジのチーム色、ポケモン画像、ドラフトの進行順を維持した。

## 変更

- 準備画面は形式・制限時間・開始を中心にする。名前、プリセット、制限、説明は必要時に開く。
- 進行順はコンパクトな進捗表示から展開する。確定済みターンへの巻き戻しは維持。
- 一覧は画像と名前を優先し、検索の隣からフィルターを開く。
- 絞り込みはフォーカスを閉じ込めるダイアログ。確定・閉じる・Escapeで一覧へ戻る。
- 操作バーは独立した通常フローの行に配置。一覧へ重なるsticky表示と固定値による画面高さの差し引きを廃止。
- 低い横画面はチーム切り替えを左、一覧を右に置く。狭い画面では検索・並び順・絞り込みを1行にまとめる。
- ドラフト中の下部フッターは省略し、通信状態と音設定はヘルプへ集約。
- 文字はrem指定で拡大可能。大きな文字で高さが足りない場合は文書を縦スクロールし、要素を重ねない。
- 確定ボタンは下部。戻す・進む・リセットは名前付きアイコンに統一。
- 狭い画面ではチーム／一覧を切り替え、チームタブにも選出画像とBAN数を表示。
- 主操作は44px以上。説明は短縮しても、支援技術向けのラベル・キーボード操作は維持。
- `100dvh`、safe-area、standalone、縦スクロール、reduced-motionを使用。画面の向きを固定しない。

## CSSの境界

既存の結果画像・履歴などのスタイルを`legacy.css`のcascade layerにまとめた。
新しい共通／ドラフト画面は`adaptive-ui.css`と領域配分を担う`workspace-layout.css`、準備画面は`setup-refresh.css`を使う。
旧レイアウトのimportant指定に限り先頭の`adaptive-layout` layerで置き換える。

## 検証の範囲

検証結果は[UI検証記録](UI-VALIDATION.md)を参照。Windows上の実ブラウザーエンジンでの実行と、物理iPhone・iPad・Macでの実機試験は区別する。
