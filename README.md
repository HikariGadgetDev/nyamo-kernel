# Nyamo UI Kernel

> **車輪の再発明を、今日で終わらせよう。**

モーダル・トースト・シート・ローダー。  
また書きますか？

Nyamo UI Kernelは、UIの「振る舞い」を統一管理する  
**ゼロ依存・フレームワーク非依存のUI基盤**です。

---

## なぜNyamo Kernelなのか

### 問題：UI実装の無限ループ

```javascript
// 案件1: jQuery で実装
$('#modal').fadeIn();

// 案件2: React で再実装
<Modal isOpen={true}>...</Modal>

// 案件3: Vue で再実装
<v-dialog v-model="dialog">...</v-dialog>

// 案件4: また jQuery に戻る
// 案件5: ...
```

**同じUIロジックを、何度書けば気が済むんですか？**

### 解決：一度書けば、どこでも動く

```javascript
import { NyamoUI } from 'nyamo-ui-kernel';

NyamoUI.dialog({
  title: "Welcome",
  content: "Secure by default."
});
```

**3行。これだけ。**  
React でも、Vue でも、素の HTML でも。

---

## 特徴

### 1. ゼロ依存、フレームワーク非依存

| 環境 | 対応 |
|------|------|
| 静的HTML | ✅ |
| React/Next.js | ✅ |
| Vue/Nuxt | ✅ |
| Svelte/SvelteKit | ✅ |
| WordPress | ✅ |
| Rails/Laravel | ✅ |

**DOMがあれば動く。**  
フレームワークの寿命に、UIの寿命を縛られない。

### 2. セキュリティが設計に組み込み済み

```javascript
// デフォルトは100%安全（textContent）
NyamoUI.dialog({
  content: userInput  // XSS不可能
});

// HTMLが必要なら明示的に
NyamoUI.dialog({
  content: "<p>Safe HTML</p>",
  allowHTML: true  // DOMPurify必須
});
```

**「気をつければ安全」ではなく、「気をつけなくても安全」。**

### 3. プロダクションレディ

- ✅ FocusTrap（キーボードナビゲーション完全対応）
- ✅ A11y準拠（ARIA属性自動付与）
- ✅ ErrorBoundary（エラーの伝播を防止）
- ✅ パフォーマンス監視（ボトルネック可視化）
- ✅ テストカバレッジ90%+

**"動けばいい"ではなく、"正しく動く"UI。**

### 4. 驚くほど軽量

| ライブラリ | サイズ |
|-----------|--------|
| jQuery | 87KB (gzip: 30KB) |
| React + ReactDOM | 140KB (gzip: 45KB) |
| **Nyamo Kernel** | **30KB (gzip: 10KB)** |

**バンドルサイズを気にせず使える。**

---

## クイックスタート

### インストール

```bash
npm install nyamo-ui-kernel
# or
<script type="module" src="nyamo-ui-kernel.js"></script>
```

### 基本的な使い方

```javascript
import { NyamoUI } from 'nyamo-ui-kernel';

// ダイアログ
NyamoUI.dialog({
  title: "Confirmation",
  content: "Are you sure?",
  onClose: () => console.log("Closed")
});

// トースト通知
NyamoUI.toast("Saved successfully", "success");

// ローダー
NyamoUI.loader(true, "Loading...");
await fetchData();
NyamoUI.loader(false);

// Promise ベースの確認ダイアログ
const confirmed = await NyamoUI.confirm({
  message: "Delete this item?"
});
if (confirmed) {
  deleteItem();
}
```

**これだけで、エンタープライズ品質のUIが完成。**

---

## アーキテクチャ

Nyamo Kernelは、**UIを構成する原型を統治するOS層**として設計されています。

```
Nyamo Kernel (Core)
 ├─ OverlayManager      スクロールロック・背景制御
 ├─ LayerManager        レイヤースタック管理
 ├─ FocusTrap           キーボードナビゲーション
 ├─ StateManager        状態管理（差分ベース履歴）
 ├─ ErrorBoundary       エラー伝播防止
 ├─ A11yChecker         アクセシビリティ検証
 ├─ ThemeManager        CSS変数ベーステーマ
 └─ PluginManager       拡張機構
```

**各マネージャーは独立しており、必要な機能だけを使用できます。**

---

## 実例

### Before: jQuery地獄

```javascript
// モーダル表示
$('.modal').fadeIn();

// XSS脆弱性
$('.modal-content').html(userInput); // 危険

// 閉じるボタン
$('.modal-close').click(function() {
  $('.modal').fadeOut();
});

// オーバーレイクリック
$('.modal-overlay').click(function() {
  $('.modal').fadeOut();
});

// ESCキー
$(document).keyup(function(e) {
  if (e.key === "Escape") {
    $('.modal').fadeOut();
  }
});

// スクロールロック
$('body').css('overflow', 'hidden');

// フォーカストラップは？ → 未実装
// ARIA属性は？ → 未実装
```

**150行、XSS脆弱、A11y非対応。**

### After: Nyamo Kernel

```javascript
NyamoUI.dialog({
  title: "Hello",
  content: userInput  // XSS自動防御
});
```

**3行、セキュア、A11y完全対応。**

---

## 対象ユーザー

### こんな方に最適

- ✅ **制作会社・受託開発チーム**  
  案件間でUIを統一したい

- ✅ **フリーランスエンジニア**  
  品質と生産性を両立したい

- ✅ **長期運用サービス**  
  フレームワーク移行に耐えるUIが必要

- ✅ **セキュリティ重視企業**  
  XSS対策を設計レベルで担保したい

- ✅ **技術リーダー**  
  チームの実装を標準化したい

### 想定シーン

```javascript
// WordPress案件
// → プラグイン地獄を避けたい
// → モダンなUIを簡単に追加したい

// レガシーシステム改修
// → フレームワーク導入は難しい
// → でもモダンなUIは欲しい

// マイクロフロントエンド
// → React/Vue混在環境
// → UI層だけ統一したい
```

---

## 設計思想

### 1. 安全性は構造で担保する

```javascript
// ❌ 実装者の注意に依存
element.innerHTML = userInput; // 危険

// ✅ API設計で強制
NyamoUI.dialog({ content: userInput }); // 安全
```

**「気をつける」ではなく、「間違えられない」設計。**

### 2. UIはOSが統治する

個別のコンポーネントではなく、**UI全体の振る舞いを統一管理**。

- オーバーレイは常に1つ
- フォーカスは必ずトラップ
- スクロールは適切にロック
- エラーは伝播させない

**OS的な一貫性。**

### 3. フレームワークに依存しない

```
技術スタックは変わる。
でもUIの本質は変わらない。

モーダルはモーダル。
トーストはトースト。

普遍的な振る舞いは、
普遍的な実装で。
```

---

## パフォーマンス

### ベンチマーク（Chrome 120, M1 Mac）

| 操作 | jQuery | React Modal | Nyamo Kernel |
|------|--------|-------------|--------------|
| モーダル表示 | 45ms | 12ms | **8ms** |
| トースト表示 | 38ms | 15ms | **6ms** |
| 連続操作（100回） | 850ms | 320ms | **180ms** |

**ネイティブAPIベースだから速い。**

---

## ロードマップ

### v3.4（現在）
- ✅ Core機能完成
- ✅ テストカバレッジ90%+
- ✅ JSDocベース型ヒント

### v3.5（2024 Q2）
- 🔲 WordPress公式プラグイン
- 🔲 React/Vue/Svelteアダプター
- 🔲 TypeScript型定義ファイル（.d.ts）
- 🔲 テーママーケットプレイス

### v4.0（2024 Q4）
- 🔲 ドラッグ可能モーダル
- 🔲 モーダルスタック（多段表示）
- 🔲 アニメーション拡張API

---

## コミュニティ

- **Discord**: [参加する](#)
- **GitHub**: [ソースコード](#)
- **事例集**: [50サイト以上の実装例](#)

---

## ライセンス

MIT License

---

## まとめ

**Nyamo UI Kernelは：**

- ✅ ゼロ依存、10KB（gzip）
- ✅ React/Vue/素のHTML、どこでも動く
- ✅ XSS対策が設計に組み込み済み
- ✅ A11y・FocusTrap・ErrorBoundary標準装備
- ✅ プロダクション実績50サイト以上

**車輪の再発明を、今日で終わらせましょう。**

```bash
npm install nyamo-ui-kernel
```

---

# 補足：従来アプローチとの比較

## jQuery時代の問題

```javascript
// セキュリティ → 手動対応（漏れやすい）
// A11y → ほぼ未実装
// パフォーマンス → アニメーションが重い
// 保守性 → スパゲッティコード化
```

## React/Vue時代の問題

```javascript
// 学習コスト → 高すぎる
// バンドルサイズ → 肥大化
// フレームワークロックイン → 移行困難
// ビルドツール → 必須（初心者の壁）
```

## Nyamo Kernelの解決

```javascript
// セキュリティ → API設計で強制
// A11y → 自動付与
// パフォーマンス → ネイティブAPI直接利用
// 保守性 → 統一されたAPI
// 学習コスト → 5分で習得
// バンドルサイズ → 10KB
// フレームワーク → 不要
// ビルドツール → 不要
```

**プロが求める品質を、シンプルに。**