// ================================
// Nyamo UI Kernel - core.js
// 基本プリミティブ & 共通ユーティリティ
// ================================

/**
 * @typedef {Object} KernelConfig
 * @property {boolean} [debug]
 * @property {boolean} [safeMode]
 * @property {boolean} [closeOnEscape]
 * @property {boolean} [a11yChecks]
 * @property {boolean} [enablePlugins]
 * @property {boolean} [performanceMonitoring]
 * @property {{ closeKey?: string }} [shortcuts]
 * @property {number}  [maxToasts]         // ← ToastManager 用
 * @property {Object}  [sanitize]          // ← HTMLSanitizer 用
 */

/**
 * @typedef {Object} FeatureSupport
 * @property {boolean} cancelIdleCallback
 * @property {boolean} intersectionObserver
 * @property {boolean} resizeObserver
 * @property {boolean} animations
 * @property {boolean} dialogElement
 */

// ================================
// DEFAULTS
// ================================

/**
 * @type {{

 *   VERSION: string;
 *   CONFIG: KernelConfig;
 *   EVENTS: Record<string, string>;
 *   TOAST: { DURATION: number; MAX_VISIBLE: number; TYPES: string[] };
 *   SHEET: { DEFAULT_DIRECTION: string; DIRECTIONS: string[] };
 * }}
 */
export const DEFAULTS = {
  VERSION: '3.4.0',
  CONFIG: {
    debug: false,
    safeMode: true,
    closeOnEscape: true,
    a11yChecks: true,
    enablePlugins: true,
    performanceMonitoring: false,
    maxToasts: 2, // ← P0 テストで期待される maxToasts デフォルト
    shortcuts: {
      closeKey: 'Escape',
    },
  },
  EVENTS: {
    STATE_CHANGE: 'state:change',

    DIALOG_OPEN: 'dialog:open',
    DIALOG_CLOSE: 'dialog:close',

    SHEET_OPEN: 'sheet:open',
    SHEET_CLOSE: 'sheet:close',

    TOAST_SHOW: 'toast:show',
    TOAST_HIDE: 'toast:hide',

    LOADER_SHOW: 'loader:show',
    LOADER_HIDE: 'loader:hide',

    CONFIRM_RESOLVE: 'confirm:resolve',
  },
  TOAST: {
    DURATION: 3000,
    MAX_VISIBLE: 2,
    TYPES: ['info', 'success', 'error', 'warning'],
  },
  SHEET: {
    DEFAULT_DIRECTION: 'right',
    DIRECTIONS: ['right', 'left', 'bottom'],
  },
};

// ================================
// CLASSNAMES
// ================================

/**
 * UI で使うクラス名を一元管理
 * （tests 側からも参照される想定）
 */
export const CLASSNAMES = {
  ROOT: 'ny-root',

  OVERLAY: 'ny-overlay',

  DIALOG: 'ny-dialog',
  DIALOG_BODY: 'ny-dialog-body',
  DIALOG_TITLE: 'ny-dialog-title',
  CLOSE_BTN: 'ny-close-btn',

  SHEET: 'ny-sheet',
  SHEET_FROM_LEFT: 'ny-from-left',
  SHEET_FROM_RIGHT: 'ny-from-right',
  SHEET_FROM_BOTTOM: 'ny-from-bottom',

  TOAST_CONTAINER: 'ny-toast-container',
  TOAST: 'ny-toast',
  TOAST_SUCCESS: 'ny-toast-success',
  TOAST_ERROR: 'ny-toast-error',

  LOADER: 'ny-loader',
  SPINNER: 'ny-spinner',

  // v3.3 以降で使う追加系（ui.js 互換のため）
  VISIBLE: 'ny-visible',
  NO_SCROLL: 'ny-no-scroll',
};

// ================================
// NyamoError
// ================================

/**
 * @typedef {Object} NyamoErrorOptions
 * @property {string} [code]
 * @property {'info'|'warning'|'error'|'critical'} [severity]
 * @property {any} [context]
 */

/**
 * Nyamo 専用の Error 型。
 * コア / カーネル / インフラ層で共通して使う。
 *
 * - new NyamoError(message)
 * - new NyamoError(message, 'SOME_CODE')
 * - new NyamoError(message, { code, severity, context })
 */
export class NyamoError extends Error {
  /**
   * @param {string} message
   * @param {string | NyamoErrorOptions} [options='NYAMO_ERROR']
   */
  constructor(message, options = 'NYAMO_ERROR') {
    super(message);
    this.name = 'NyamoError';

    /** @type {string} */
    this.code = 'NYAMO_ERROR';
    /** @type {'info'|'warning'|'error'|'critical'} */
    this.severity = 'error';
    /** @type {any} */
    this.context = undefined;

    if (typeof options === 'string') {
      this.code = options || 'NYAMO_ERROR';
    } else if (options && typeof options === 'object') {
      if (options.code) this.code = options.code;
      if (options.severity) this.severity = options.severity;
      if (Object.prototype.hasOwnProperty.call(options, 'context')) {
        this.context = options.context;
      }
    }
  }

  /**
   * シンプルなアサーションヘルパ。
   * @param {boolean} condition
   * @param {string} message
   * @param {string | NyamoErrorOptions} [options]
   */
  static assert(condition, message, options) {
    if (!condition) {
      throw new NyamoError(message, options);
    }
  }
}

// ================================
// EventEmitter
// ================================

/**
 * シンプルな EventEmitter 実装（Node ライク API）
 */
export class EventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._events = new Map();
  }

  /**
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  on(event, listener) {
    if (!this._events.has(event)) {
      this._events.set(event, new Set());
    }
    this._events.get(event).add(listener);
    return this;
  }

  /**
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  off(event, listener) {
    const listeners = this._events.get(event);
    if (!listeners) return this;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this._events.delete(event);
    }
    return this;
  }

  /**
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  /**
   * @param {string} event
   * @param {...any} args
   * @returns {this}
   */
  emit(event, ...args) {
    const listeners = this._events.get(event);
    if (!listeners || listeners.size === 0) return this;
    // emit 中に off が走っても安全なようにコピー
    for (const listener of Array.from(listeners)) {
      try {
        listener(...args);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[NyamoUI][EventEmitter] listener error', err);
      }
    }
    return this;
  }

  /**
   * 全イベントリスナー削除
   * @returns {this}
   */
  clear() {
    this._events.clear();
    return this;
  }

  /**
   * Node 互換 alias
   * @returns {this}
   */
  removeAllListeners() {
    return this.clear();
  }
}

// ================================
// Logger
// ================================

export class Logger {
  /**
   * @param {boolean} [debug=false]
   */
  constructor(debug = false) {
    this.debug = !!debug;
  }

  /**
   * @param {boolean} debug
   */
  setDebug(debug) {
    this.debug = !!debug;
  }

  /**
   * @param {any[]} args
   * @returns {any[]}
   * @private
   */
  _tag(args) {
    return ['[NyamoUI]', ...args];
  }

  log(...args) {
    if (!this.debug) return;
    // eslint-disable-next-line no-console
    console.log(...this._tag(args));
  }

  warn(...args) {
    // eslint-disable-next-line no-console
    console.warn(...this._tag(args));
  }

  error(...args) {
    // eslint-disable-next-line no-console
    console.error(...this._tag(args));
  }
}

// ================================
// FeatureDetector
// ================================

export class FeatureDetector {
  constructor() {
    /** @type {FeatureSupport} */
    this.features = {
      cancelIdleCallback:
        typeof window !== 'undefined' &&
        typeof window.cancelIdleCallback === 'function',
      intersectionObserver:
        typeof window !== 'undefined' && 'IntersectionObserver' in window,
      resizeObserver:
        typeof window !== 'undefined' && 'ResizeObserver' in window,
      animations:
        typeof document !== 'undefined' &&
        typeof document.createElement === 'function' &&
        'animate' in document.createElement('div'),
      dialogElement: typeof HTMLDialogElement !== 'undefined',
    };
  }

  /**
   * @param {keyof FeatureSupport} feature
   * @returns {boolean}
   */
  isSupported(feature) {
    return !!this.features[feature];
  }

  /**
   * @returns {FeatureSupport}
   */
  getFeatures() {
    return { ...this.features };
  }
}

// ================================
// CircularBuffer
// ================================

/**
 * @template T
 */
export class CircularBuffer {
  /**
   * @param {number} capacity
   */
  constructor(capacity) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('CircularBuffer requires positive capacity');
    }
    this.capacity = capacity;
    /** @type {Array<T | undefined>} */
    this.buffer = new Array(capacity);
    this.start = 0;
    this.length = 0;
  }

  /**
   * @param {T} value
   */
  push(value) {
    const index = (this.start + this.length) % this.capacity;
    this.buffer[index] = value;
    if (this.length < this.capacity) {
      this.length++;
    } else {
      this.start = (this.start + 1) % this.capacity;
    }
  }

  /**
   * @returns {T[]}
   */
  toArray() {
    /** @type {T[]} */
    const result = [];
    for (let i = 0; i < this.length; i++) {
      const index = (this.start + i) % this.capacity;
      const value = this.buffer[index];
      if (typeof value !== 'undefined') {
        result.push(value);
      }
    }
    return result;
  }

  clear() {
    this.buffer = new Array(this.capacity);
    this.start = 0;
    this.length = 0;
  }
}

// ================================
// Focusable selectors
// ================================

/**
 * @type {string}
 */
export const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

// ================================
// Utils
// ================================

let _idCounter = 0;

/**
 * 雑多なユーティリティ（ui.js / tests から参照される）
 */
export const Utils = {
  /**
   * requestAnimationFrame ラッパ
   * @param {FrameRequestCallback} cb
   * @returns {number}
   */
  nextFrame(cb) {
    if (typeof requestAnimationFrame === 'function') {
      return requestAnimationFrame(cb);
    }
    return setTimeout(() => cb(performance.now()), 16);
  },

  /**
   * 2 回連続 rAF 実行（DOM 反映後にクラス付けたい時など）
   * @param {Function} cb
   */
  doubleRAF(cb) {
    Utils.nextFrame(() => {
      Utils.nextFrame(() => cb());
    });
  },

  /**
   * requestIdleCallback ラッパ（なければ setTimeout）
   * @param {IdleRequestCallback} cb
   * @returns {number}
   */
  requestIdle(cb) {
    if (typeof requestIdleCallback === 'function') {
      return requestIdleCallback(cb);
    }
    return setTimeout(() => {
      cb(
        /** @type {IdleDeadline} */ ({
          didTimeout: false,
          timeRemaining() {
            return 50;
          },
        }),
      );
    }, 1);
  },

  /**
   * @template T
   * @param {T | T[]} value
   * @returns {T[]}
   */
  toArray(value) {
    return Array.isArray(value) ? value : [value];
  },

  /**
   * @param {any} value
   * @returns {boolean}
   */
  isHTMLElement(value) {
    return (
      typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
    );
  },

  /**
   * DOM 構築ヘルパ
   * @param {string} tag
   * @param {string | string[]} [classNames]
   * @param {Record<string, any>} [attrs]
   * @returns {HTMLElement}
   */
  createElement(tag, classNames, attrs = {}) {
    if (typeof document === 'undefined' || !document.createElement) {
      throw new Error('DOM not available');
    }
    const el = document.createElement(tag);

    /** @type {string[]} */
    const classes = Array.isArray(classNames)
      ? classNames.filter(Boolean).map(String)
      : typeof classNames === 'string'
      ? classNames.split(/\s+/).filter(Boolean)
      : [];

    if (classes.length) {
      el.classList.add(...classes);
      // `ny-dialog-title` など「単一クラス名」のときは id も揃えて付ける
      if (!('id' in attrs) && classes.length === 1 && /^ny-/.test(classes[0])) {
        el.id = classes[0];
      }
    }

    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null) continue;
      if (key === 'text') {
        el.textContent = String(value);
      } else if (key === 'html') {
        el.innerHTML = String(value);
      } else if (key in el) {
        try {
          // @ts-ignore
          el[key] = value;
        } catch {
          el.setAttribute(key, String(value));
        }
      } else {
        el.setAttribute(key, String(value));
      }
    }

    return el;
  },

  /**
   * HTML / テキスト挿入ヘルパ
   * allowHTML=true のときは HTMLSanitizer 経由で innerHTML に入れる
   *
   * @param {HTMLElement} container
   * @param {any} content
   * @param {boolean} [allowHTML=false]
   * @param {{ sanitize?: (input: string) => string }|null} [htmlSanitizer]
   */
  appendContent(container, content, allowHTML = false, htmlSanitizer = null) {
    if (!container) return;

    if (content == null) {
      container.textContent = '';
      return;
    }

    const isNode =
      typeof Node !== 'undefined' && content instanceof Node;

    if (!allowHTML) {
      // 完全テキスト扱い
      if (isNode) {
        container.textContent = content.textContent || '';
      } else {
        container.textContent = String(content);
      }
      return;
    }

    // allowHTML=true → sanitize して innerHTML に流す
    /** @type {string} */
    let htmlStr;
    if (isNode) {
      const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (doc) {
        const tmp = doc.createElement('div');
        tmp.appendChild(content.cloneNode(true));
        htmlStr = tmp.innerHTML;
      } else {
        htmlStr = content.textContent || '';
      }
    } else {
      htmlStr = String(content);
    }

    if (htmlSanitizer && typeof htmlSanitizer.sanitize === 'function') {
      container.innerHTML = htmlSanitizer.sanitize(htmlStr);
    } else {
      // フォールバック: script だけ殺す
      if (typeof document === 'undefined') {
        container.innerHTML = htmlStr.replace(
          /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
          '',
        );
      } else {
        const fallback = new HTMLSanitizer();
        container.innerHTML = fallback.sanitize(htmlStr);
      }
    }
  },

  /**
   * enum 値バリデーション
   * @template T
   * @param {T} value
   * @param {T[]} allowed
   * @param {T} fallback
   * @returns {T}
   */
  validateEnum(value, allowed, fallback) {
    if (!Array.isArray(allowed) || allowed.length === 0) return fallback;
    return allowed.includes(value) ? value : fallback;
  },

  /**
   * 安全に callback を実行するヘルパ
   * @param {Function | undefined | null} fn
   * @param {any} [context]
   * @param {...any} args
   */
  safeExecute(fn, context, ...args) {
    if (typeof fn !== 'function') return;
    try {
      return fn.apply(context ?? null, args);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[NyamoUI][safeExecute] callback error', err);
    }
  },

  /**
   * シンプルなユニーク ID 生成
   * @returns {string}
   */
  generateId() {
    _idCounter += 1;
    return `ny-${_idCounter}`;
  },

  /**
   * DOM が ready かどうか
   * @returns {boolean}
   */
  isDOMReady() {
    if (typeof document === 'undefined') return false;
    const rs = document.readyState;
    return rs === 'interactive' || rs === 'complete';
  },
};

// ================================
// HTMLSanitizer
// ================================

/**
 * DOMPurify 連携用の薄いラッパ
 * - window.DOMPurify があればそれを使う
 * - なければ「HTMLは残しつつ script だけ殺す」フォールバック
 * - escape() / isHTML() も P0 用に実装
 */
export class HTMLSanitizer {
  /**
   * @param {Object} [config={}]
   */
  constructor(config = {}) {
    this.config = config;
    /** @type {any | null} */
    this.domPurify =
      typeof window !== 'undefined' && window.DOMPurify
        ? window.DOMPurify
        : null;
  }

  /**
   * 危険な要素だけ除去して HTML を返す
   * @param {string | Node} input
   * @returns {string}
   */
  sanitize(input) {
    if (input == null) return '';

    /** @type {string} */
    let str;
    if (typeof input === 'string') {
      str = input;
    } else if (typeof document !== 'undefined' && input instanceof Node) {
      const div = document.createElement('div');
      div.appendChild(input.cloneNode(true));
      str = div.innerHTML;
    } else {
      str = String(input);
    }

    // DOMPurify があればそれを優先
    if (this.domPurify && typeof this.domPurify.sanitize === 'function') {
      return this.domPurify.sanitize(str, this.config);
    }

    // フォールバック:
    // - <script> / <style> を完全除去
    // - on* 属性を除去
    // - それ以外のタグは残す
    if (typeof document === 'undefined') {
      return str.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    }

    const tmp = document.createElement('div');
    tmp.innerHTML = str;

    tmp.querySelectorAll('script, style').forEach((el) => el.remove());

    const all = tmp.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        if (/^on/i.test(attr.name)) {
          el.removeAttribute(attr.name);
        }
      }
    }

    return tmp.innerHTML;
  }

  /**
   * 完全にエスケープしてプレーンテキストとして出したい時用
   * @param {string} input
   * @returns {string}
   */
  escape(input) {
    if (input == null) return '';
    const str = String(input);

    if (typeof document === 'undefined') {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 文字列が「HTMLっぽいか」をざっくり判定
   * @param {string} value
   * @returns {boolean}
   */
  isHTML(value) {
    if (value == null) return false;
    return /<\/?[a-z][\s\S]*>/i.test(String(value));
  }
}
