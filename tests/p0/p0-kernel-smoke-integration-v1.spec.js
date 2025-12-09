// =======================================
// tests/p0/p0-kernel-smoke-integration-v1.spec.js
// Nyamo UI Kernel - P0 Smoke & Integration (v1)
// =======================================

import { jest } from '@jest/globals';
import { NyamoUIKernel } from '../../nyamo-ui/kernel.js';

// ---------------------------
// Helpers
// ---------------------------

function createKernel(config = {}) {
  return new NyamoUIKernel(document.body, config);
}

function waitFor(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

global.DOMPurify = {
  sanitize: (html) => html.replace(/<script.*?<\/script>/gi, ''),
};

// ================================
// Smoke Tests
// ================================

describe('Nyamo UI Kernel - Smoke (P0 / v1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('init / destroy が例外なく動く', () => {
    const kernel = createKernel();
    expect(() => {
      kernel.init();
      kernel.destroy();
    }).not.toThrow();
  });

  test('dialog を何度も開閉できる', () => {
    const kernel = createKernel();
    kernel.init();

    for (let i = 0; i < 5; i++) {
      kernel.dialog({ content: `Dialog ${i}` });
      expect(kernel.hasActiveLayer()).toBe(true);
      kernel.close();
      expect(kernel.hasActiveLayer()).toBe(false);
    }

    kernel.destroy();
  });

  test('多数の toast を連続生成しても落ちない', async () => {
    const kernel = createKernel({ maxToasts: 3 });
    kernel.init();

    for (let i = 0; i < 10; i++) {
      kernel.toast(`Toast ${i}`);
    }

    await waitFor(50);

    const toasts = document.querySelectorAll('.ny-toast');
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts.length).toBeLessThanOrEqual(3);

    kernel.clearToasts?.();
    kernel.destroy();
  });

  test('setConfig を運用中に呼んでも落ちない', () => {
    const kernel = createKernel();
    kernel.init();

    kernel.dialog({ content: 'Test' });
    expect(() => {
      kernel.setConfig({ debug: true });
      kernel.close();
      kernel.setConfig({ closeOnEscape: false });
      kernel.dialog({ content: 'Test 2' });
    }).not.toThrow();

    kernel.close();
    kernel.destroy();
  });

  test('safeMode で onOpen エラーを飲み込む', () => {
    const kernel = createKernel({ safeMode: true });
    kernel.init();

    expect(() => {
      kernel.dialog({
        content: 'Test',
        onOpen: () => {
          throw new Error('Test error');
        },
      });
    }).not.toThrow();

    kernel.close();
    kernel.destroy();
  });

  test('plugin registration / unregistration', () => {
    const kernel = createKernel({ enablePlugins: true });
    kernel.init();

    const plugin = {
      name: 'test-plugin',
      install: jest.fn(),
      uninstall: jest.fn(),
    };

    kernel.use(plugin);
    expect(plugin.install).toHaveBeenCalled();

    kernel.unuse('test-plugin');
    expect(plugin.uninstall).toHaveBeenCalled();

    kernel.destroy();
  });
});

// ================================
// Integration: Full Workflow
// ================================

describe('Nyamo UI Kernel - Integration: Full Workflow (P0 / v1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('loader → dialog → toast → confirm → sheet の一連フロー', async () => {
    const kernel = createKernel();
    kernel.init();

    // 1. Loader
    kernel.loader(true, 'Loading data...');
    expect(kernel.hasActiveLayer()).toBe(true);

    await waitFor(30);

    // 2. Dialog
    kernel.loader(false);
    kernel.dialog({
      title: 'Data Loaded',
      content: 'Process completed successfully',
    });

    expect(kernel.hasActiveLayer()).toBe(true);

    // 3. Toast
    kernel.close();
    kernel.toast('Success!', 'success');

    await waitFor(20);
    expect(document.querySelector('.ny-toast')).toBeTruthy();

    // 4. Confirm
    const confirmPromise = kernel.confirm({
      message: 'Continue?',
    });

    await waitFor(20);
    const okBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'OK',
    );
    okBtn.click();

    const confirmed = await confirmPromise;
    expect(confirmed).toBe(true);

    // 5. Sheet
    kernel.sheet({
      content: 'Final step',
      from: 'bottom',
    });

    expect(kernel.hasActiveLayer()).toBe(true);

    kernel.close();
    kernel.destroy();
  });
});
