# Draft 02 — 独立した新規版

2026-10-16追加改修: ページ分割、ゲーム内表記との統一、PWA対応を実施。[最新の改修・検証記録](RELEASE-2026-10.md)。以下の初期設計を基に、主操作の文言は現在「使用禁止」「選択」です。

公開先: `/pokemon-unite-draft/v2/`。現行版も引き続き利用できます。

## 設計の起点

現行版の画面コンポーネント・CSS・デザインメモは取り込まず、`src/next/` に新規実装。共有するのはドラフトのドメイン規則、タイマー規則、102枠の名簿・画像です。ReactとLucideは一般的な実装部品として使い、表示ラベル・アイコンの意味・配置は新たに決定しました。

- [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout): 主要な内容を先頭に置き、関連した操作をまとめる。画面幅と高さ、文字サイズに対応する。
- [Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): 行動が明確な「対戦を準備」「除外する」「選出する」を使用。主操作は塗りつぶし、補助操作はアイコンまたはメニューに整理する。
- [Material Layout](https://m3.material.io/foundations/layout/layout-overview/overview): 選択コレクションとチームの補助ペインを配置。広い画面は並列、狭い画面は切り替え。低い横画面では切り替えを側面に配置する。
- [Material Color roles](https://m3.material.io/styles/color/the-color-system/key-colors-tones): 背景、サーフェス、文字、主操作、選択状態を意味ごとの変数で定義。ライトとダークの対応関係を保つ。
- [Material Motion](https://m3.material.io/styles/motion/overview/how-it-works): 実用ツールに合う控えめな状態変化。Web向けの短い色・境界線の遷移とスイッチの移動を使い、reduced-motionで無効にする。Spring実装の完全再現ではない。

アイコンは操作の意味から選択。除外は丸付きマイナス、選出はメンバー追加、ガイドは本、通常形式はターゲット、フィアレスは反復を表す記号。確定状態にはチェック、履歴には時計という一般的な意味を使用する。以前のボタン形状や配置を移植しない。

## 機能と境界

通常、オールスター、フィアレス、BO3/5/7、先攻選択、6 BAN / 10 PICK、戻す・進む、BANスキップ、チーム内の入れ替え、次試合、履歴、JSON記録の保存を用意。BAN15秒/PICK20秒、2体PICKは同一ターンの時間を共有する。時間切れのBANはスキップし、PICKは手動確定を待つ。

保存キーは `unite-draft.studio.v2`。現行版の保存は読み書きしない。現行版の大会プリセット、JSON取り込み、PNG書き出しは新規版の機能に含めていない。これらは現行版で引き続き利用できる。

独立したHTML/CSS/エントリーとPWAマニフェストを持つ。Service Workerは両ルートをキャッシュし、オフライン時にも適切な版のHTMLを返す。

## 検証

`tests/browser/studio-audit.mjs` は Chromium / WebKitで 320×568、390×844、430×932、667×375、844×390、768×1024、1024×768、1440×900を操作する。

準備、長いチーム名、検索、フィルター、200%文字、全16選択、戻す・進む、入れ替え、次試合、オールスターの過去選出制限、ダーク表示、保存復元、現行版との保存分離を確認。要素の交差、横はみ出し、文字欠け、画像失敗、通常文字での主操作の画面内表示を計測する。

別途、両エンジンの時計制御でBAN/PICK時間切れとEscapeによるダイアログ終了、通信を遮断した状態で再起動→選択→再起動→保存復元を確認する。

2026-10-16の結果: 8サイズ×2エンジンの16条件が成功。タイマー・途中の4サイズ変更・Escape操作は両エンジンで成功。通信遮断後の再起動で両エンジンとも選択1件を復元し、画像失敗0件。共通ルール20件、名簿3件、オフライン2件と本番ビルドも成功。

Windows上のブラウザーエンジンによる検証であり、物理的なiPhone・iPad・Macの操作やインストール試験ではない。文字拡大で領域が不足する場合は縦スクロールを許容する。

```sh
npm test
npm run build
npm run test:offline
node tests/browser/studio-audit.mjs
node tests/browser/studio-resize-timer.mjs
```

ブラウザー試験にはPlaywrightとChromium/WebKit、ポート5174の開発サーバーが必要。`AUDIT_URL` で公開サイトへ切り替え可能。
