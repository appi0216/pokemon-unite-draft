# 条件付きCSSの証明状況

## 2026-10-19 一括整理

全16 CSSを構文解析し、以前確認した「削除済みUIクラス」の一覧と現行ソースを再照合した。必須の正条件に該当する87セレクター分岐を10ファイルから除去。CSSルール数は1978から1941、公開CSSは185.94KBから181.34KBへ減少。

`:not()`は削除根拠にしない。`:is()`・`:where()`・`:has()`では全選択肢が成立不能な場合に限り成立不能と判定する。複数セレクターのうち使用中の分岐は維持する。判定器には否定・混合選択肢・関係条件の回帰検査を入れた。

根拠と保持分岐は `CONDITIONAL-CSS-BATCH-DECISIONS.json`。2316分岐は「不要と証明できないため保持」であり、全分岐の個別必要性を証明したという意味ではない。削除根拠は現行アプリと過去にレビューした旧UIクラス契約に限定され、将来の外部DOM挿入・拡張機能まで保証しない。

`scripts/prune-proven-obsolete-css.mjs --check` を公開前検査に追加し、同じ旧指定の再混入を検出する。全条件の全称証明は引き続き未完了だが、今回の根拠範囲で削除可能な分岐は一括処理した。

## 2026-10-18 時点の記録（以下は当時の状態）

2026-10-18。**全件の不要性の証明は未完了。不要という前提も置かない。**

`node scripts/inventory-conditional-css.mjs` によりsrc内16 CSSファイルの1978ルールを一覧化した。従来の旧CSS9ファイルだけでなく、追加したレスポンシブ指定とPWAも対象。キーフレームも含む広い上限集合であり、1978件すべてが条件付き指定という意味ではない。

`CONDITIONAL-CSS-INVENTORY.json` は各ルールのファイル、行、祖先の条件、宣言、クラス名のソース参照候補、入力ファイルのSHA-256を収録。すべて `unproven-retained` として出力する。文字列検索を構文解析・到達可能性解析・カスケード同値証明として扱わない。この一覧生成自体は証明作業の完了ではない。

## 不要と決めつけられない具体例

- `src/responsive-controls.css` の `.pokemon-card:focus-visible` はキーボードのフォーカス表示を指定する。通常のDOM一致集計だけで削除可とは判断できない。
- `src/pwa/install.css` の `.pwa-panel button:disabled` に対し、`src/pwa/AppInstallPanel.tsx` は `disabled={!status.online}` を生成する。オフラインの状態を含む確認が必要。
- `src/ui-tokens.css` の `@media(pointer:coarse)` は入力機器による条件。デスクトップの通常マウス検証では全状態をカバーしない。

## 削除の証明に必要なもの

対象リビジョン、対応ブラウザー・環境、到達可能なDOMと保存データ、動的クラス生成を固定する。その範囲で、対象のセレクターと環境条件が同時に成立不能、または削除前後のカスケード結果が全対象状態で同値であることを示す。スクリーンショット比較や有限回の操作試験だけを全称証明と呼ばない。

今回、実装CSSの変更・削除・公開は行っていない。既存の160状態試験を今回の全件証明として再利用しない。新しい一覧は証拠整理のためのものであり、旧記録の COMPLETE を拡張するものではない。

## 2026-10-19 更新と再発防止

個別比較第2件：`.app .pokemon-grid .pokemon-card:focus-visible` は保持。キーボード入力後のフォーカスで条件成立を確認し、ルール除去でoutline-offsetが-3pxから-2pxに変化、復元で-3pxへ戻った（Chromium/WebKit）。表示差があるという証拠であり、ルール内の全宣言が個別に不可欠、または差が重大という意味ではない。

個別比較第1件：`src/ui-tokens.css` の `@media(pointer:coarse) .app` は保持。390×844・タッチ条件で該当宣言だけを一時削除すると並び替えボタンが44pxから30pxへ変わり、復元で44pxに戻ることをChromium/WebKitで確認。`tests/browser/css-necessity.mjs` で再実行可能。これにより「どの状態でも不要」という仮説はこの1件について棄却できる。残りのルールを必要・不要と証明したわけではない。

現行ソースに合わせて一覧を更新した。条件種別と過去の未一致集計への該当を追加。過去の未一致情報は現行状態での使用・不要判定ではない。入力ソースと過去集計のハッシュを保存し、`node scripts/inventory-conditional-css.mjs --check` で一覧の陳腐化を検出する。ハッシュは改行形式を正規化し、Windowsと公開環境で比較可能にした。

旧9ファイルの再監査では完全一致重複ルール0、現在のファイル間同一セレクター・条件候補78組。元の113組は削除前の歴史的母集団であり、78組と直接同一視しない。今回も不要性未証明の指定は保持した。

## 一括整理後の検証

2026-10-19: build、24件の単体試験、6件のオフライン試験、不要指定再混入検査、一覧鮮度検査が合格。Chromium/WebKitでホーム4サイズ・ダイアログ3サイズ・文字200%・条件付き指定の除去復元比較が合格。画面遷移は両エンジン計160状態でissues/errorsなし。667px横画面の画像も確認。有限試験であり全状態証明ではない。

## オフライン無効ボタンの保持根拠（2026-10-20）

公開版の実際の通信切断で更新確認ボタンが無効化されることを確認。.pwa-panel button:disabled の一時除去によりopacity .5→.48、cursor default→pointer、復元で元へ戻ることをChromium/WebKitで確認した。tests/browser/css-disabled.mjsで再実行可能。この1ルールをretain-observed-effectへ分類し、CSSは削除しない。個々の宣言すべての不可欠性や、残りの全状態証明を主張するものではない。

## 強制カラーの保持根拠（2026-10-20）

setup-refresh.cssのforced-colors: active配下の2ルールを保持。ホームの選択中項目・スイッチに一致し、ルール除去でoutlineが変わり、復元で戻ることをChromium/WebKitで確認。tests/browser/css-forced-colors.mjsは実際のメディア条件成立を確認し、非対応を成功扱いしない。各ルールの効果の証拠であり、リスト内の全セレクターや全状態の必要性を証明しない。

## 高コントラストの限定比較（2026-10-20）

prefers-contrast: moreの成立を確認してドラフト初期画面で比較。:rootルール除去で計算済みカスタムプロパティが変化したが、画素上の改善・不可欠性は未証明。パネル枠線ルールは一致38要素で今回観測したborderColorに差がなかった。どちらも削除しない。特に差なしは他の画面・入力状態・サイズでの不要性を意味しない。tests/browser/css-contrast.mjs、Chromium/WebKitで復元一致。既存のunproven-retained分類を維持する。

## 上記の枠線差なし判定を訂正（2026-10-20）

前回は遷移途中の即時測定だった。除去・復元後300ms待機し、320/667/1440幅×初期/hover/選択/keyboard×Chromium/WebKitの24状態を再比較。枠線ルールを除去するとrgb(141,135,157)からrgb(60,59,68)などへ変化し、復元一致。48比較（各状態2ルール）すべて差あり。枠線ルールをretain-observed-effectに変更。rootは引き続き変数の効果のみで、画素への必要性未証明。全状態証明ではない。

## 動き抑制の重複宣言削除（2026-10-20）

main.tsxのimport順はadaptive-ui.css→setup-refresh.css→workspace-layout.css。adaptive-ui.cssとworkspace-layout.cssのprefers-reduced-motion: reduce内の全要素・before・afterセレクターは同じ。animation:none!importantとtransition:none!importantは同値・同優先度・同条件で後方のworkspace側が有効になるため、前方の2宣言だけ削除した。adaptive側のscroll-behavior:auto!importantは保持。現在の静的スタイルシート順を根拠とし、動的CSSOM削除や将来の読み込み順変更は範囲外。build/offline6件、Chromium/WebKitのhome/draftで全要素と疑似要素のanimationName none・transitionProperty noneを確認。tests/browser/reduced-motion.mjsで再現可能。

## 旧ファイル内の動き抑制重複（2026-10-20）

design.cssとui-system.cssのreduce配下の全要素・before・afterルール（各3宣言）を削除。legacy.cssが先に読み込まれ、その後adaptive-ui.cssのscroll-behavior:auto!important、workspace-layout.cssのanimation/transition:none!importantが同条件・同対象・同優先度で上書きするため。:beforeと::beforeは同じ疑似要素。現在の静的読み込み順が前提。ルール数1939、CSS181.01KB。build/offline6、Chromium/WebKit home/draftの全要素・疑似要素の動き抑制PASS。全状態のCSS全件証明には拡張しない。

## 動き抑制の優先度による整理（2026-10-20）

MOTION-DOMINANCE-DECISIONS.jsonに5宣言の対象・値を記録。reduce条件内の通常優先度のanimation/transition/transition-durationは、同条件の全要素・疑似要素に対するnone!importantに優先度で負けるため削除。通常のtransition-duration:.01msもimportant shorthandのduration:0に上書きされる。transform:noneは別の性質なので保持。現在のアプリの静的CSSを範囲とし、外部CSSOM操作は含めない。1935ルール、CSS180.50KB。build/offline6・cascade guard・両ブラウザーhome/draftのreduced-motion検証合格。

## standaloneヘッダー余白の条件付き判定（2026-10-20）

adaptive-ui.cssのdisplay-mode:standalone内.app-header padding-topは、現在のApp.tsxで常に.app[class]直下にあるheaderに一致。workspace-layout.cssのadaptive-layoutレイヤー内.app[class]>.app-header padding-block!importantが同じtopを優先する（現在の水平書字方向）。ただしレイヤー非対応環境ではそのブロックが無効となるため、この根拠だけで互換用指定の削除はしない。対応ブラウザー範囲と書字方向を固定するまではunproven-retained。今回アプリCSSの変更なし。

## ホバーの旧影指定（2026-10-20）

refinement.cssのhover:hover配下.pokemon-card:not(:disabled):hover box-shadowを削除。同条件・同セレクター・同優先度のadaptive-ui.cssのbox-shadow:noneが後から読み込まれるため常に後者が優先。現在の静的読み込み順が範囲。削除前公開版/削除後previewでChromium/WebKitのhover成立、boxShadow none・borderColor・transform noneが一致。build/offline6合格。1934ルール、CSS180.41KB。
