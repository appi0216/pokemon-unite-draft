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

## 入力機器によるサイズ変数の範囲（2026-10-20）

workspace-layout.cssのpointer:fine/max-height:500pxとpointer:coarseの--control-sizeを667×375・home/draft・Chromium/WebKitで個別除去復元。8比較のうちhome4件は変数文字列が変化し、draft4件は後方指定が優先して差なし。復元一致。変数の文字列差は最終寸法差を証明しないため両ルールともunproven-retainedを維持。ドラフトだけの上書き根拠でホーム共用指定を削除しない。tests/browser/css-pointer.mjsで再現可能。

## 入力機器指定の実寸確認（2026-10-20）

css-pointer.mjsにヘッダーボタン寸法を追加。667×375・fine pointer・homeで除去前36×36、除去後44×44、復元36×36をChromium/WebKitで確認。fine/短い画面ルールをretain-observed-effectへ変更。coarse側は今回の寸法差なしのため未証明保持のまま。

## Coarse pointer size expression — 2026-10-20

`workspace-layout.css` repeats the base `.app` control size under `(pointer: coarse)` as `max(44px, clamp(44px, calc(36px + 1vw), 52px))`. In engines supporting both functions this equals the base clamp for every viewport width: the inner clamp is never below 44px. The intervening fine-pointer override cannot match coarse pointer. Later draft overrides remain unchanged. No TypeScript reader of this custom property's string or CSSOM was found in src.

`tests/browser/css-coarse-equivalence.mjs` removes/restores exactly that candidate at runtime, checks the active pointer predicate and exactly one rule, and compares 11 computed geometry/font properties on every app element. Chromium and WebKit, six viewports (320/390/667/800/1001/1600 widths, including short landscape), home and draft: 24/24 comparisons equal and restoration equal. Results are in `.artifacts/css-coarse-equivalence/results.json`.

Decision: retain pending compatibility scope. This establishes supported-math equivalence and finite rendered comparisons, not all-browser/all-state unusedness. Custom properties accept token streams even when a consuming property cannot evaluate a math function; a partial-support engine can therefore treat the original nested expression differently from the base expression. No minimum CSS engine support contract exists. Do not silently broaden this conclusion to older engines, pseudo-elements, or future string readers. No application CSS was changed.

## 完全一致する条件付き宣言の統合（2026-10-20）

adaptive-ui.css / workspace-layout.css内の8宣言を削除。祖先メディア条件・セレクター・プロパティ・値・重要度が完全一致し、同じ非レイヤー領域で後方の指定が必ず優先されるものに限定。異なる値の互換フォールバックや異なる条件・レイヤーは対象外。3つの空ルールを除去し1931ルール、CSS180.23KB。削除箇所と優先される箇所はEXACT-CONDITIONAL-DUPLICATES.jsonに保存。check-exact-conditional-duplicates.mjsを公開前検査へ追加。現在の静的読み込み順が根拠であり、外部CSSOM操作や将来の読み込み変更まで含む全件証明ではない。

## 旧CSS内の完全重複（2026-10-20）

旧9ファイルを同じlegacyレイヤーとして確認し、interaction-upgrades.cssのヘッダー指定4宣言を削除。900px以下・680px以下の各条件で、同じセレクター・値・優先度のgrid-template-columns/padding-inlineが同一ファイルの後方で必ず上書きされる。LEGACY-EXACT-CONDITIONAL-DUPLICATES.jsonに元位置と後方位置を保存。空ルール2つを除去し1929ルール、CSS179.94KB。Chromium/WebKitの320/390/667/844/1440幅でホーム・ドラフトの固定ヘッダー/フッター、操作領域の重なり、横向きの操作サイズを検証し合格。全件証明への拡張はしない。

## 完全重複の継続検査範囲（2026-10-20）

check-exact-conditional-duplicates.mjsを14ファイルへ拡張。main.tsxの直接importとlegacy.cssの9つのlayer(legacy) importを実際の順番で読み、legacyと非レイヤーを分けて検査する。メディア条件の祖先列・セレクター・プロパティ・値・重要度が完全一致する重複は現在0件。既に実行済みの一括書き換えモードは撤去し、公開前の読み取り専用検査にした。異なる条件・値の意味的な重複、supports/container/入れ子レイヤー、PWA CSSの全状態判定はこの結果に含まない。0件という結果を全CSSの不要性証明や監査完了と呼ばない。

## PWAのキーボードフォーカス（2026-10-20）

.pwa-panel button:focus-visibleを保持。Tab入力後に更新確認ボタンへフォーカスし、疑似クラスの成立を確認。指定だけを除去するとoutline色がrgb(246,245,248)からrgb(213,198,255)に変わり、復元で戻ることを両ブラウザーで確認。css-pwa-focus.mjsで再現可能。retain-observed-effectへ分類するが、各宣言の不可欠性や色の優劣を証明したものではない。アプリCSS変更なし。

## 監査件数の構造化（2026-10-20）

条件付きインベントリは全1926 CSSルールを含むため、全件を「条件付き」と数えるのは不正確。生成レポートへ測定可能な範囲を併記した: media条件723、cascade layer内63、keyframe step21、selector中に疑似状態/要素表記を含む436、属性selector46。分類は重複し得る。これらは到達可能性や不要性の証明ではない。特にクラス状態は字句条件に含まれず、supports/container等の現行件数0も将来や外部スタイルを保証しない。proofCompleteはfalseのまま。inventory --checkで再生成の一致を検査する。カスタムプロパティ名はルールごとの宣言一覧に加えて、TS/TSX/JSON/CSSを横断する境界一致の参照位置インデックスを保存する。これは文字列上の参照候補であり、値の展開やランタイム効果の証明ではない。

## 旧ドラフト操作ボタンのレイアウト指定を削除（2026-10-20）

現行JSXには`.decision-main`内の`.confirm-button`のみがあり、旧指定が対象にしていた`.complete-button`、`.next-game`、`.final-image-action`は存在しない。決定ボタンの幅/高さ/文字サイズを持つ3つのカスタムプロパティと、legacyのgrid配置規則を削除した。実際の画面DOMに旧規則を再注入して除去前後を比較する`tests/browser/css-legacy-button.mjs`を追加。Chromium/WebKit各5ビューポート×選択前後の20比較で、全アプリ要素の矩形と確認ボタンの計算済みスタイルに差がなく、復元も一致した。現在のJSX、通常のCSS読み込み、およびこの有限テスト範囲に限った根拠であり、将来のDOM、外部CSSOM、未対応ブラウザーまでの証明ではない。`scripts/check-legacy-decision-layout.mjs`で旧指定の再混入をCI検査する。インベントリは1926ルールに更新。残る条件付きCSSの全状態証明は未完了。

## 狭い画面幅で重複するteam-panel余白を削除（2026-10-20）

`workspace-layout.css`の同じ`.team-panel`セレクターにある`@media (max-width: 600px)`内の`padding:10px`を削除。より広い`max-width:1000px`の同値指定が同じ非レイヤーカスケードで後にあり、600px以下の全幅を含む。狭い側の`gap:6px`とgrid行指定は異なるため保持した。Chromium/WebKitで狭い指定を一時注入して除去し、320/390/600/601/800/1000/1001pxの7幅×選択前後で全アプリ要素の矩形と両team-panelの計算済みpaddingを比較し、28/28一致・復元一致を確認。`tests/browser/css-narrow-team-padding.mjs`で再実行でき、CIは`check-narrow-breakpoint-padding.mjs`で狭いpaddingのみ再混入を防ぐ。この範囲は現行の静的カスケードと有限のブラウザー比較に限定し、全条件付きCSSの証明完了を意味しない。

## 狭幅のdecision-main配置指定を削除（2026-10-20）

`workspace-layout.css`の`@media (max-width: 600px)`内にあった`.decision-main { grid-column:2; grid-row:1 / 3; }`を削除。同じメディア条件・同じセレクターの後続ルールが`grid-area:1 / 1 / 2 / -1`を指定し、後続のショートハンドが両longhandを上書きする。より広いmax-width:1000pxの配置指定と、狭幅の後続配置は保持。現行ドラフトDOMに実在するdecision-mainを対象に、指定を除去・復元して全`.app`要素の矩形と計算済みgrid配置を比較した。Chromium/WebKit×320/390/600pxの縦画面と600px横画面、境界幅601/800/1000px×選択前後で28比較が一致し、復元も一致。`tests/browser/css-narrow-decision-main-grid.mjs`はソース指定が既にない場合、同じmax-width:600pxブロックの元位置（`.decision-extra`の直前）へ検証用に再注入して比較する。CIの`check-narrow-decision-main-grid.mjs`は削除対象の再混入を拒否し、後続の狭幅配置と広幅配置の保持を確認する。これは現在の静的CSS順と有限のブラウザー/画面状態での証拠で、全条件付きCSSの完了を意味しない。

## ホーム幅条件で上書きされる旧gap指定を削除（2026-10-20）

`refinement.css`の`.app .setup-main`内、max-width:700pxの`gap:28px`を削除。同じ`.app .setup-main`・同じmax-width:700px・同じ`legacy`レイヤーで、後から読み込まれる`setup-experience.css`が`gap:14px`を指定するため旧宣言は常に後勝ち指定に上書きされる。refinement側のmax-width:1000pxにある広幅フォールバックと、後続のmax-width:700px gap14pxは維持。CSSOM比較では既存ルール内の元の位置へgap28pxを戻して除去し、ホーム画面全要素の矩形と計算済みgapを比較。Chromium/WebKit×320/390/600/700/701/900/1000pxで14/14一致・復元一致（700px以下の8比較で条件成立、6比較は境界確認）。`tests/browser/css-setup-main-gap-cascade.mjs`で再実行でき、`scripts/check-setup-main-gap-cascade.mjs`が宣言の再混入、import順変更、勝者指定の欠落をCIで検出する。現在の静的import順とホーム画面の有限幅検証を根拠とし、全状態・全条件付きCSSの完了を意味しない。

## 狭幅でレイヤー指定を上書きする旧team-panel gapを削除（2026-10-20）

`design.css`のmax-width:900px `.team-panel`から`gap:8px`だけを削除。これは`legacy`レイヤーにあり、main.tsxで後から読み込まれる非レイヤー`workspace-layout.css`がmax-width:1000pxで同じセレクターに`gap:4px`を指定し、max-width:600pxではさらに後の`gap:6px`を指定するため、900px以下で旧gapは勝てない。周辺のlegacy grid行・paddingとmax-width:1200pxの広域gapは維持。ブラウザー比較では削除前後に両ドラフトモードの実チームパネル2個（片側が非表示となる状態を含む）を使い、旧宣言をCSSOMの同じルール位置へ戻して除去し、全`.app`要素矩形と2パネルの計算済みgapを比較した。Chromium/WebKit×320/390/600/601/800/900/901/1000px×通常/オールスター×選択前後で64/64一致・復元一致、条件成立48比較と境界16比較。`tests/browser/css-legacy-team-panel-gap.mjs`で再現でき、`scripts/check-legacy-team-panel-gap.mjs`が対象宣言の再混入、import/layer順変更、広幅・電話幅の上書き指定欠落をCIで検出する。証拠は現在の静的cascade/importと列挙した2モード・画面幅に限定し、将来の外部CSSOM変更や全条件付きCSSの完了を意味しない。
