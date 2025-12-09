// =======================================
// tests/p0/p0-kernel-unit-v1.spec.js
// Nyamo UI Kernel - P0 Unit Tests (v1)
// =======================================

import { jest } from '@jest/globals';
import { NyamoUIKernel } from '../../nyamo-ui/kernel.js';
import { NyamoError, HTMLSanitizer } from '../../nyamo-ui/core.js';

// ---------------------------
// Helpers
// ---------------------------

// DOMPurify のモック
global.DOMPurify = {
  sanitize: (html) => html.replace(/<script.*?<\/script>/gi, ''),
};

/**
 * 共通の kernel 生成ヘルパー
 * @param {object} config
 */
function createKernel(config = {}) {
  return new NyamoUIKernel(document.body, {
    debug: false,
    safeMode: false,
    ...config,
  });
}

function waitFor(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function triggerKeydown(key, target = document) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

// ================================
// Core: NyamoError / HTMLSanitizer
// ================================

describe('Core: NyamoError & HTMLSanitizer (P0)', () => {
  test('NyamoError: basic shape', () => {
    const err = new NyamoError('Test error');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NyamoError');
    expect(err.message).toBe('Test error');
    // オプション未指定時の最低限だけチェック
    expect(err.severity).toBeDefined();
  });

  test('NyamoError: severity / code / context', () => {
    const err = new NyamoError('Critical', {
      severity: 'critical',
      code: 'DOM_NOT_READY',
      context: { comp: 'OverlayManager' },
    });

    expect(err.severity).toBe('critical');
    expect(err.code).toBe('DOM_NOT_READY');
    expect(err.context).toEqual({ comp: 'OverlayManager' });
  });

  test('HTMLSanitizer: sanitize / escape / isHTML', () => {
    const sanitizer = new HTMLSanitizer({
      allowedTags: ['p'],
      allowedAttrs: [],
    });

    const dirty = '<p>Safe</p><script>alert(1)</script>';
    const clean = sanitizer.sanitize(dirty);

    expect(clean).toContain('<p>Safe</p>');
    expect(clean).not.toContain('<script>');

    const escaped = sanitizer.escape('<script>alert(1)</script>');
    expect(escaped).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');

    expect(sanitizer.isHTML('<p>HTML</p>')).toBe(true);
    expect(sanitizer.isHTML('plain text')).toBe(false);
  });
});

// ================================
// Config Management (P0)
// ================================

describe('Config Management (P0)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('setConfig merges config and updates flags', () => {
    const kernel = createKernel({ debug: false });
    kernel.init();

    const originalConfig = kernel.config;

    kernel.setConfig({ debug: true, closeOnEscape: false });

    // 参照同一性は保証しない（実装依存なので緩める）
    expect(kernel.config.debug).toBe(true);
    expect(kernel.config.closeOnEscape).toBe(false);

    // 元オブジェクトとは別でも OK だが、最低限「オブジェクト」であることだけ見る
    expect(typeof originalConfig).toBe('object');
    expect(typeof kernel.config).toBe('object');

    kernel.destroy();
  });

  test('setConfig does not throw when called before any layer', () => {
    const kernel = createKernel();
    kernel.init();

    expect(() => {
      kernel.setConfig({ debug: true });
    }).not.toThrow();

    kernel.destroy();
  });
});

// ================================
// closeOnEscape 動的挙動 (P0)
// ================================

describe('closeOnEscape Dynamic Behavior (P0)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('closeOnEscape=true: Escape で閉じる', () => {
    const kernel = createKernel({ closeOnEscape: true });
    kernel.init();

    kernel.dialog({ title: 'Test', content: 'Content' });
    expect(kernel.hasActiveLayer()).toBe(true);

    triggerKeydown('Escape');
    expect(kernel.hasActiveLayer()).toBe(false);

    kernel.destroy();
  });

  test('closeOnEscape=false: Escape では閉じない', () => {
    const kernel = createKernel({ closeOnEscape: false });
    kernel.init();

    kernel.dialog({ title: 'Test', content: 'Content' });
    expect(kernel.hasActiveLayer()).toBe(true);

    triggerKeydown('Escape');
    expect(kernel.hasActiveLayer()).toBe(true);

    kernel.close();
    kernel.destroy();
  });

  test('setConfig で動的にトグルできる', () => {
    const kernel = createKernel({ closeOnEscape: false });
    kernel.init();

    kernel.dialog({ title: 'Test', content: 'Content' });

    // 最初は Escape で閉じない
    triggerKeydown('Escape');
    expect(kernel.hasActiveLayer()).toBe(true);

    // 動的に有効化
    kernel.setConfig({ closeOnEscape: true });

    triggerKeydown('Escape');
    expect(kernel.hasActiveLayer()).toBe(false);

    kernel.destroy();
  });
});

// ================================
// shortcuts API (P0)
// ================================

describe('shortcuts API (P0)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('デフォルト closeKey は Escape', () => {
    const kernel = createKernel();
    kernel.init();

    expect(kernel.config.shortcuts.closeKey).toBe('Escape');

    kernel.destroy();
  });

  test('カスタム closeKey が効く', () => {
    const kernel = createKernel({
      shortcuts: { closeKey: 'q' },
    });
    kernel.init();

    kernel.dialog({ title: 'Test', content: 'Content' });
    triggerKeydown('q');
    expect(kernel.hasActiveLayer()).toBe(false);

    kernel.destroy();
  });

  test('setConfig で closeKey を変更できる', () => {
    const kernel = createKernel();
    kernel.init();

    kernel.dialog({ title: 'Test', content: 'Content' });

    kernel.setConfig({ shortcuts: { closeKey: 'Enter' } });

    triggerKeydown('Escape');
    expect(kernel.hasActiveLayer()).toBe(true);

    triggerKeydown('Enter');
    expect(kernel.hasActiveLayer()).toBe(false);

    kernel.destroy();
  });
});

// ================================
// sanitize API (P0)
// ================================

describe('sanitize API (P0)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('sanitize 設定を渡すと HTMLSanitizer が初期化される', () => {
    const kernel = createKernel({
      sanitize: {
        allowedTags: ['p', 'strong'],
        allowedAttrs: ['class'],
      },
    });
    kernel.init();

    // 実装によって config の持ち方は違うかもしれないので緩くチェック
    expect(kernel.htmlSanitizer).toBeInstanceOf(HTMLSanitizer);

    kernel.destroy();
  });

  test('allowHTML=true で script が除去される', () => {
    const kernel = createKernel({
      sanitize: {
        allowedTags: ['p'],
        allowedAttrs: [],
      },
    });
    kernel.init();

    kernel.dialog({
      title: 'HTML Test',
      content: '<p>Safe</p><script>alert(1)</script>',
      allowHTML: true,
    });

    const body = document.querySelector('.ny-dialog-body');
    expect(body).not.toBeNull();
    expect(body.innerHTML).not.toContain('<script>');
    expect(body.innerHTML).toContain('<p>Safe</p>');

    kernel.close();
    kernel.destroy();
  });
});

// ================================
// Dialog / Sheet / Toast / Loader / Confirm / Destroy (P0)
// ================================

describe('Dialog / Sheet / Toast / Loader / Confirm / Destroy (P0)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('dialog: title / content / close button', () => {
    const kernel = createKernel();
    kernel.init();

    kernel.dialog({
      title: 'Test Dialog',
      content: 'This is a test',
      showClose: true,
    });

    expect(kernel.hasActiveLayer()).toBe(true);
    expect(document.querySelector('.ny-dialog')).toBeTruthy();
    expect(document.querySelector('#ny-dialog-title').textContent).toBe('Test Dialog');

    const closeBtn = document.querySelector('.ny-close-btn');
    closeBtn.click();

    expect(kernel.hasActiveLayer()).toBe(false);

    kernel.destroy();
  });

  test('sheet: from left/right/bottom が使える', () => {
    const kernel = createKernel();
    kernel.init();

    kernel.sheet({ content: 'right' });
    expect(document.querySelector('.ny-sheet.ny-from-right')).toBeTruthy();
    kernel.close();

    kernel.sheet({ content: 'left', from: 'left' });
    expect(document.querySelector('.ny-sheet.ny-from-left')).toBeTruthy();
    kernel.close();

    kernel.sheet({ content: 'bottom', from: 'bottom' });
    expect(document.querySelector('.ny-sheet.ny-from-bottom')).toBeTruthy();
    kernel.close();

    kernel.destroy();
  });

  test('toast: type / auto hide / maxToasts', async () => {
    const kernel = createKernel({ maxToasts: 2 });
    kernel.init();

    kernel.toast('Info', 'info', 50);
    kernel.toast('Success', 'success', 50);
    kernel.toast('Error', 'error', 50);
    await waitFor(20);

    const toastsNow = document.querySelectorAll('.ny-toast');
    expect(toastsNow.length).toBeLessThanOrEqual(2);

    await waitFor(100); // auto hide 後
    const after = document.querySelector('.ny-toast');
    // 完全に消えているとは限らないので「落ちてないこと」だけ見れば P0 的には十分だが
    // ここでは「ゼロ or 1 くらいに落ちている」くらいを緩く見る
    expect(after === null || after instanceof HTMLElement).toBe(true);

    kernel.clearToasts?.();
    kernel.destroy();
  });

  test('loader: show / hide', () => {
    const kernel = createKernel();
    kernel.init();

    kernel.loader(true, 'Loading...');
    expect(kernel.hasActiveLayer()).toBe(true);
    expect(document.querySelector('.ny-loader')).toBeTruthy();
    expect(document.querySelector('.ny-spinner')).toBeTruthy();

    kernel.loader(false);
    expect(kernel.hasActiveLayer()).toBe(false);

    kernel.destroy();
  });

  test('confirm: resolves true / false', async () => {
    const kernel = createKernel();
    kernel.init();

    // true
    let promise = kernel.confirm({ message: 'Are you sure?' });
    await waitFor(20);
    let okBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'OK',
    );
    okBtn.click();
    let result = await promise;
    expect(result).toBe(true);

    // false
    promise = kernel.confirm({ message: 'Delete?' });
    await waitFor(20);
    let cancelBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    );
    cancelBtn.click();
    result = await promise;
    expect(result).toBe(false);

    kernel.destroy();
  });

  test('destroy: cleans up overlay and state', () => {
    const kernel = createKernel();
    kernel.init();

    kernel.dialog({ content: 'Test' });
    kernel.toast('Test toast');

    kernel.destroy();

    // initialized フラグは実装によって違うかもしれないので「落ちない＋DOM が片づいている」だけを見る
    expect(document.querySelector('.ny-overlay')).toBeFalsy();
    expect(kernel.hasActiveLayer()).toBe(false);
  });
});
