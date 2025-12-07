// nyamo-ui/core.js

/**
 * Core constants, utils and base classes for Nyamo UI Kernel
 */

/** @typedef {string|HTMLElement|DocumentFragment|Node} ContentInput */

export const DEFAULTS = {
  VERSION: '3.4.0',
  CONFIG: {
    debug: false,
    safeMode: true,
    animations: true,
    closeOnOverlayClick: true,
    closeOnEscape: true,
    maxToasts: 3,
    focusTrap: true,
    enablePlugins: true,
    a11yChecks: false,
    a11yAutofix: false,
    cssInJs: false,
    batchUpdates: true,
    stateHistorySize: 50,
    errorEndpoints: [],
    errorSampleRate: 1.0,
    performanceMonitoring: false,
    useDiffHistory: true,
  },
  TOAST: {
    DURATION: 2500,
    HIDE_DELAY: 350,
    TYPES: ['info', 'success', 'error', 'warning'],
  },
  SHEET: {
    DIRECTIONS: ['right', 'left', 'bottom'],
    DEFAULT_DIRECTION: 'right',
  },
  DIALOG: {
    SIZES: ['sm', 'md', 'lg', 'full'],
    DEFAULT_SIZE: 'md',
  },
  EVENTS: {
    DIALOG_OPEN: 'ny:dialog:open',
    DIALOG_CLOSE: 'ny:dialog:close',
    SHEET_OPEN: 'ny:sheet:open',
    SHEET_CLOSE: 'ny:sheet:close',
    TOAST_SHOW: 'ny:toast:show',
    TOAST_HIDE: 'ny:toast:hide',
    LOADER_SHOW: 'ny:loader:show',
    LOADER_HIDE: 'ny:loader:hide',
    STATE_CHANGE: 'ny:state:change',
    ERROR: 'ny:error',
    PERF_MARK: 'ny:perf:mark',
  },
};

export const CLASSNAMES = {
  OVERLAY: 'ny-overlay',
  VISIBLE: 'ny-visible',
  NO_SCROLL: 'ny-no-scroll',
  DIALOG: 'ny-dialog',
  SHEET: 'ny-sheet',
  TOAST: 'ny-toast',
  LOADER: 'ny-loader',
  SPINNER: 'ny-spinner',
  CLOSE_BTN: 'ny-close-btn',
};

export const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// -------------------------
// HTML Sanitizer
// -------------------------

export class HTMLSanitizer {
  static sanitize(html) {
    if (typeof html !== 'string') return '';
    if (typeof window !== 'undefined' && window.DOMPurify) {
      return window.DOMPurify.sanitize(html);
    }
    throw new Error(
      '[NyamoUI] SECURITY ERROR: DOMPurify is required when allowHTML=true.\n' +
        'Install: npm install dompurify\n' +
        'Or CDN: https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js\n' +
        'Alternatively, set allowHTML=false.'
    );
  }

  static escape(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static isHTML(content) {
    if (typeof content !== 'string') return false;
    return /<[^>]+>/.test(content);
  }

  static hasDOMPurify() {
    return typeof window !== 'undefined' && typeof window.DOMPurify !== 'undefined';
  }
}

// -------------------------
// Circular Buffer
// -------------------------

export class CircularBuffer {
  constructor(size) {
    this.buffer = new Array(size);
    this.size = size;
    this.head = 0;
    this.count = 0;
  }

  push(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }

  toArray() {
    if (this.count === 0) return [];
    if (this.count < this.size) {
      return this.buffer.slice(0, this.count);
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }

  clear() {
    this.buffer = new Array(this.size);
    this.head = 0;
    this.count = 0;
  }

  get length() {
    return this.count;
  }
}

// -------------------------
// Feature Detector
// -------------------------

export class FeatureDetector {
  constructor() {
    this.features = this.detect();
  }

  detect() {
    const hasDocument = typeof document !== 'undefined';
    const features = {
      intersectionObserver: typeof IntersectionObserver !== 'undefined',
      resizeObserver: typeof ResizeObserver !== 'undefined',
      mutationObserver: typeof MutationObserver !== 'undefined',
      performanceObserver: typeof PerformanceObserver !== 'undefined',
      requestIdleCallback: typeof requestIdleCallback !== 'undefined',
      cancelIdleCallback: typeof cancelIdleCallback !== 'undefined',
      containerQueries: this.cssSupports('container-type', 'inline-size'),
      backdropFilter: this.cssSupports('backdrop-filter', 'blur(1px)'),
      viewTransitions: hasDocument && 'startViewTransition' in document,
      customProperties: this.cssSupports('--test', '0'),
      weakRef: typeof WeakRef !== 'undefined',
      abortController: typeof AbortController !== 'undefined',
    };
    return features;
  }

  cssSupports(property, value) {
    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
    try {
      return CSS.supports(property, value);
    } catch {
      return false;
    }
  }

  isSupported(feature) {
    return !!this.features[feature];
  }

  getFeatures() {
    return { ...this.features };
  }
}

// -------------------------
// Event Emitter
// -------------------------

export class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.events.get(event);
    if (handlers) handlers.delete(handler);
  }

  once(event, handler) {
    const wrapper = (data) => {
      handler(data);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  emit(event, data) {
    const handlers = this.events.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error(`[NyamoUI] Event handler error (${event}):`, err);
      }
    });
  }

  clear() {
    this.events.clear();
  }
}

// -------------------------
// Utilities
// -------------------------

export const Utils = {
  safeExecute(fn, context, ...args) {
    if (typeof fn !== 'function') return;
    try {
      return fn.apply(context, args);
    } catch (err) {
      console.error('[NyamoUI] Callback error:', err);
      return undefined;
    }
  },

  createElement(tag, classes = [], attrs = {}) {
    const el = document.createElement(tag);
    if (classes.length > 0) el.className = classes.join(' ');
    Object.entries(attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
    return el;
  },

  appendContent(parent, content, allowHTML = false) {
    if (!content) return;
    if (typeof content === 'string') {
      if (allowHTML) {
        if (HTMLSanitizer.isHTML(content)) {
          console.warn('[NyamoUI] HTML content detected. Sanitizing with DOMPurify.');
        }
        parent.innerHTML = HTMLSanitizer.sanitize(content);
      } else {
        parent.textContent = content;
      }
    } else if (
      content instanceof HTMLElement ||
      content instanceof DocumentFragment ||
      content instanceof Node
    ) {
      parent.appendChild(content);
    }
  },

  validateEnum(value, allowed, defaultValue) {
    return allowed.includes(value) ? value : defaultValue;
  },

  doubleRAF(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
  },

  isDOMReady() {
    return typeof document !== 'undefined' && document.body !== null;
  },

  generateId() {
    return `ny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
};

// -------------------------
// Logger
// -------------------------

export class Logger {
  constructor(debug = false) {
    this.debug = debug;
  }

  setDebug(enabled) {
    this.debug = enabled;
  }

  log(...args) {
    if (this.debug) console.log('[NyamoUI]', ...args);
  }

  warn(...args) {
    console.warn('[NyamoUI]', ...args);
  }

  error(...args) {
    console.error('[NyamoUI]', ...args);
  }

  info(...args) {
    console.info('[NyamoUI]', ...args);
  }
}
