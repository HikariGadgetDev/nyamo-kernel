# Nyamo UI Kernel — README（日本語 / 完全統合版）

> **vandalize the evil civilization**  
悪しき文明を破壊せよ、Web標準で世界を再構築するUIカーネル。

Nyamo UI Kernelは、モーダル／シート／トースト／ローダーといった
散在しがちなUI振る舞いを**OS のように統治するゼロ依存のUIランタイム**です。  
Web標準APIのみを基盤としフレームワーク寿命の影響を一切受けない堅牢で一貫したUI世界を提供します。

---

# 0. 序文（タグライン & 概要）

Nyamo UI kernelは一般的なUIコンポーネントライブラリではなく、  
**UI世界の“振る舞い”を規定するカーネル(Runtime Kernel)** です。

- UI の原型（Dialog / Sheet / Toast / Overlay / Loader）を OS が統治  
- 依存ゼロであらゆる技術栈に移植可能  
- npm install の強制なし
- Webpack/Vite の強制なし
- トランスパイルの強制なし
- フレームワークの強制なし
- XSS を設計段階で封殺する API  
- A11y / FocusTrap / ErrorBoundary / 性能最適化まで内蔵  


> **「UIの安全性は実装者の注意力によって実現されるのではなく、設計段階で既に保証されているべきだ」**

---

# 1. Nyamo UI Kernelとは？

Nyamo Kernel が扱うのは「コンポーネント」ではなく、  
**UI が本来持つ“普遍的な振る舞い原則(archetype)”** です。

## 1.1 UI ライブラリとの違い

| 項目 | 一般的ライブラリ | Nyamo Kernel |
|------|------------------|---------------|
| 役割 | コンポーネント提供 | UIの“振る舞い”を統治 |
| 依存 | React / Vue等 | 依存ゼロ |
| 移植性 | 中 | DOMがあれば動く |
| 安全性 | 実装者の注意任せ | API設計で強制担保 |
| UI一貫性 | 案件ごとに変動 | KernelがOS的に管理 |

## 1.2 Kernel(UI Runtime)という概念

UIの基盤となるOSロジックを持ち：

- ダイアログ / シートのレイヤー管理  
- トースト通知の制御  
- Overlayによるスクロールロック  
- Promise Confirm  
- FocusTrap  
- ErrorBoundary  
- State Manager(差分)  
- Plugin System  
- Theme System(CSS variables)

など **UIの物理法則** を統治します。

---

# 2. セキュリティ設計(XSS 無害化思想)

Nyamo Kernelは初期設計から**XSSをOS レベルで封じる**ことを目的にしています。

## 2.1 安全性を“構造”で達成する原則

- ✔ デフォルトは textContent（100%安全）  
- ✔ allowHTML: true を明示しなければ HTML 無効  
- ✔ allowHTML 時は DOMPurify を強制  
- ✔ HTMLElement の直接渡しは常に安全  
- ✔ innerHTML の危険ルートを API レベルで封印  

> 「気を付ければ安全」ではなく  
> **「気を付けなくても安全」** なUI。

## 2.2 allowHTML / DOMPurify の動作

```js
NyamoUI.dialog({
  title: "HTML",
  content: "<p><strong>安全</strong></p>",
  allowHTML: true
});
```

DOMPurify が無いときは安全な fallback と警告が行われます。

---

# 3. 使用例

## 3.1 テキストとして安全に表示
```js
NyamoUI.dialog({
  title: "こんにちは",
  content: "これは常にテキストとして表示されます。"
});
```

## 3.2 HTMLElement の利用（安全）
```js
const el = document.createElement("div");
el.innerHTML = "<p>安全な HTML</p>";
NyamoUI.dialog({ title: "HTML", content: el });
```

## 3.3 サニタイズ HTML
```js
NyamoUI.dialog({
  title: "HTML",
  content: "<p>OK</p>",
  allowHTML: true
});
```

## 3.4 Toast
```js
NyamoUI.toast("保存しました", "success");
```

## 3.5 Loader
```js
NyamoUI.loader(true, "読み込み中…");
NyamoUI.loader(false);
```

## 3.6 Promise Confirm
```js
const ok = await NyamoUI.confirm({
  message: "削除しますか？"
});
```

## 3.7 Theme
```js
NyamoUI.setTheme({
  "dialog-bg": "#1a1a1a",
  "text-primary": "#ffffff"
});
```

---

# 4. Kernel Architecture（UI OS 構造）

Nyamo Kernel は **UIを構成する原型の“物理法則”を統治するOS層**です。

```
Nyamo Kernel
 ├─ OverlayManager
 ├─ LayerManager
 ├─ ToastManager
 ├─ LoaderBuilder
 ├─ ConfirmBuilder
 ├─ StateManager
 ├─ ErrorBoundary
 ├─ ErrorReporter
 ├─ ThemeManager
 ├─ A11yChecker
 ├─ PluginManager
 └─ FocusableCache
```

---

# 5. Framework Agnostic（あらゆる技術スタックで動く）

Nyamo Kernel は **DOMがあれば動くUI OS**です。

## 5.1 対応環境
- 静的 HTML  
- React / Next.js  
- Vue  
- Svelte  
- Astro / Remix  
- Rails / Laravel SSR  

## 5.2 利点
- フレームワーク移行時もUI崩壊なし  
- 長期運用の安定性  
- 案件間 UI の一貫性  
- レガシー環境でも導入可能  

---

# 6. Nyamo Kernelが解決するUI課題

- モーダル破綻
- トースト・オーバーフロー
- フォーカス迷子問題
- innerHTML 由来のXSS
- プラグイン干渉
- CSS の属人調整
- フレームワーク移行のUI崩壊

Nyamo Kernelはこれらを
**注意ではなく“構造”で根絶します。**

---

# 7. 想定している使用状況、使用者

- 制作会社・受託チーム
- UI を統一したい全プロダクト
- フレームワーク寿命に縛られたくない全ての開発者

- 長期運用サービス
- セキュリティ重視企業
**※　テスト終了フェーズ以降の中規模開発での実用を視野に開発を進めております**

---

# 8. Appendix — Web UIを取り巻く文化背景

Nyamo Kernelの思想は、従来の「再実装文化」「属人安全性」とは異なる。

## 8.1 再実装文化 vs UI 原型統治  
案件毎にUIを都度書き直す文化からの脱却。  
**UI はOSが統治する** という新概念へ。

## 8.2 属人安全性 vs 構造安全性  
innerHTMLを避けて“慎重に実装”するのではなく、
**危険経路そのものをAPIが設計段階で封じ込める**。

## 8.3 CSS の構造課題  
- !importantの乱用
- marginの微調整ループ
- コンポーネント同士の競合
→ テーマ体系で解決。

## 8.4 FocusTrap の OS 化  
本来OSの責務をUI世界に導入。

## 8.5 技術スタック依存からの解放  
Webフレームワークの寿命とUIの寿命を切り離す。
React / Vue / Svelte / SSR / 静的HTML上で動く

## 8.6 工数モデルの終焉  
再実装の工数 → Kernelによる生産性モデルへ。

---

# 9. License
MIT License
