# 2026-10-15 UI更新

## デザインの基準

Appleの[Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)を、Webアプリの制約に合わせて適用。

- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout): 画面幅・向きへの適応、システム領域の余白、重要な操作の優先順位。
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): 操作領域の確保、明確なラベル、色以外の状態表示、キーボード操作、動きを減らす設定。
- [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): 1つの主要操作、短く明確なラベル、一般的なシンボルと操作の一貫性。

Appleの見た目そのものを複製するのではなく、既存の紫・オレンジのチーム色、ポケモン画像、ドラフトの進行順を維持した。

## 変更

- 準備画面は形式・制限時間・開始を中心にする。名前、プリセット、制限、説明は必要時に開く。
- 進行順はコンパクトな進捗表示から展開する。確定済みターンへの巻き戻しは維持。
- 一覧は画像と名前を優先し、検索の隣からフィルターを開く。
- 確定ボタンは下部。戻す・進む・リセットは名前付きアイコンに統一。
- 狭い画面ではチーム／一覧を切り替え、チームタブにも選出画像とBAN数を表示。
- 主操作は44px以上。説明は短縮しても、支援技術向けのラベル・キーボード操作は維持。
- `100dvh`、safe-area、standalone、縦スクロール、reduced-motionを使用。画面の向きを固定しない。

## CSSの境界

既存の結果画像・履歴などのスタイルを`legacy.css`のcascade layerにまとめた。
新しい共通／ドラフト画面は`adaptive-ui.css`、準備画面は`setup-refresh.css`を使う。
旧レイアウトのimportant指定に限り先頭の`adaptive-layout` layerで置き換える。

## 検証の範囲

検証結果は[UI検証記録](UI-VALIDATION.md)を参照。Windows上の実ブラウザーエンジンでの実行と、物理iPhone・iPad・Macでの実機試験は区別する。
