// =======================================
// nyamo-ui/state.js
// Nyamo UI Kernel - State & Focus Management
// =======================================

/**
 * @fileoverview
 * - グローバル状態の管理 (StateManager)
 * - フォーカス可能要素のキャッシュ (FocusableCache)
 * - シンプルな履歴バッファ (CircularBuffer 相当)
//  *
 * 依存:
 * - DOM API のみ
 */

import { FeatureDetector, FOCUSABLE_SELECTORS } from './core.js';

// =======================================
// 内部用 CircularBuffer（State 用）
// =======================================

/**
 * @template T
 */
class StateHistoryBuffer {
  /**
   * @param {number} [size]
   */
  constructor(size = 20) {
    // size に変な値（NaN, Infinity, オブジェクト等）が来ても死なないようにガード
    const n = Number(size);
    if (!Number.isFinite(n) || n <= 0) {
      this.size = 20;
    } else {
      this.size = Math.floor(n) || 20;
    }

    /** @type {T[]} */
    this.buffer = new Array(this.size);
    /** @type {number} */
    this.index = 0;
    /** @type {number} */
    this.length = 0;
  }

  /**
   * @param {T} value
   */
  push(value) {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.size;
    if (this.length < this.size) {
      this.length += 1;
    }
  }

  /**
   * @returns {T[]}
   */
  toArray() {
    const result = [];
    for (let i = 0; i < this.length; i++) {
      const idx = (this.index - this.length + i + this.size) % this.size;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  clear() {
    this.buffer = new Array(this.size);
    this.index = 0;
    this.length = 0;
  }
}

// =======================================
// FocusableCache
// =======================================

/**
 * フォーカス可能要素のキャッシュ。
 *
 * - container (HTMLElement) ごとに WeakMap で保持
 * - LayerManager / StateManager から利用される
 */
export class FocusableCache {
  /**
   * @param {FeatureDetector} [featureDetector]
   */
  constructor(featureDetector = new FeatureDetector()) {
    /** @type {WeakMap<HTMLElement, HTMLElement[]>} */
    this.cache = new WeakMap();
    /** @type {WeakMap<HTMLElement, MutationObserver>} */
    this.observers = new WeakMap();
    this.featureDetector = featureDetector;
  }

  /**
   * 新 API: get
   * @param {HTMLElement} container
   * @returns {HTMLElement[]}
   */
  get(container) {
    if (!container) return [];

    const cached = this.cache.get(container);
    if (cached) return cached;

    const scanned = this._scan(container);
    this.cache.set(container, scanned);
    this._ensureObserver(container);
    return scanned;
  }

  /**
   * 旧API互換: 古い LayerManager 実装から呼ばれる用
   * @param {HTMLElement} container
   * @returns {HTMLElement[]}
   */
  getFocusable(container) {
    // 旧API -> 新API のラッパ
    return this.get(container);
  }

  /**
   * DOM を走査してフォーカス可能要素を列挙
   * @param {HTMLElement} container
   * @returns {HTMLElement[]}
   * @private
   */
  _scan(container) {
    if (!container || typeof container.querySelectorAll !== 'function') {
      return [];
    }

    const nodes = /** @type {NodeListOf<HTMLElement>} */ (
      container.querySelectorAll(FOCUSABLE_SELECTORS)
    );

    return Array.from(nodes).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('aria-hidden') !== 'true',
    );
  }

  /**
   * @param {HTMLElement} container
   * @private
   */
  _ensureObserver(container) {
    if (this.observers.has(container)) return;
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(() => {
      this.cache.set(container, this._scan(container));
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    this.observers.set(container, observer);
  }

  /**
   * @param {HTMLElement} container
   */
  registerContainer(container) {
    if (!container) return;
    const focusables = this._scan(container);
    this.cache.set(container, focusables);
    this._ensureObserver(container);
  }

  /**
   * @param {HTMLElement} container
   */
  unregisterContainer(container) {
    if (!container) return;
    const obs = this.observers.get(container);
    if (obs) {
      obs.disconnect();
      this.observers.delete(container);
    }
    this.cache.delete(container);
  }

  /**
   * NOTE: 互換用に残しておくが、内部的には get() を使う。
   * @param {HTMLElement} container
   * @returns {HTMLElement[]}
   */
  getFocusables(container) {
    return this.get(container);
  }

  /**
   * clear() は WeakMap を新しいインスタンスに差し替えるだけの
   * シンプル仕様にして、安全に全解放する。
   */
  clear() {
    try {
      this._disconnectAllObservers();
    } catch {
      // 何があってもここでは落とさない
    }

    this.cache = new WeakMap();
    this.observers = new WeakMap();
  }

  _disconnectAllObservers() {
    const obs = this.observers;
    // WeakMap には forEach がないが、
    // 将来 Map 化された場合も考慮して best-effort にしておく。
    if (obs && typeof obs.forEach === 'function') {
      obs.forEach((observer) => {
        if (observer && typeof observer.disconnect === 'function') {
          observer.disconnect();
        }
      });
    }
  }
}

// =======================================
// EventManager (簡易イベントバス・P0テスト用)
// =======================================

/**
 * ごくシンプルなイベントバス。
 */
export class EventManager {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.handlers = new Map();
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (typeof handler !== 'function') return;
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(event);
    }
  }

  /**
   * @param {string} event
   * @param {*} payload
   */
  emit(event, payload) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch {
        // P0 ではエラーを握りつぶしてよい
      }
    }
  }

  clear() {
    this.handlers.clear();
  }
}

// =======================================
// StateManager
// =======================================

/**
 * @typedef {Object} KernelState
 * @property {string|null} activeLayer
 * @property {number} layerDepth
 * @property {boolean} hasOverlay
 */

/**
 * Kernel 全体の状態管理。
 * - activeLayer / 深さなどを集中管理
 * - 履歴は StateHistoryBuffer で保持（デバッグ用）
 * - 自身も「イベントソース」として動く（.on() が使える）
 */
export class StateManager {
  /**
   * @param {Partial<KernelState>} [initial]
   * @param {number} [historySize]
   */
  constructor(initial = {}, historySize = 20) {
    /** @type {KernelState} */
    this.state = {
      activeLayer: null,
      layerDepth: 0,
      hasOverlay: false,
      ...initial,
    };

    // historySize に変な値が来ても安全にフォールバック
    const n = Number(historySize);
    const safeSize =
      Number.isFinite(n) && n > 0 ? Math.floor(n) || 20 : 20;

    /** @type {StateHistoryBuffer<KernelState>} */
    this.history = new StateHistoryBuffer(safeSize);
    this.history.push({ ...this.state });

    // 内部イベントバス
    /** @type {EventManager} */
    this._events = new EventManager();
  }

  /**
   * @returns {KernelState}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * @param {Partial<KernelState>} patch
   */
  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.history.push({ ...this.state });
    this._notifyStateChange();
  }

  clear() {
    this.state = {
      activeLayer: null,
      layerDepth: 0,
      hasOverlay: false,
    };
    this.history.clear();
    this.history.push({ ...this.state });
    this._notifyStateChange();
  }

  /**
   * @returns {KernelState[]}
   */
  getHistory() {
    return this.history.toArray();
  }

  // --------- Event-like API (for kernel.js) ---------

  /**
   * kernel 側から:
   *   this.stateManager.on(DEFAULTS.EVENTS.STATE_CHANGE, handler);
   * のように呼ばれる前提。
   *
   * @param {string} event
   * @param {(state: KernelState) => void} handler
   */
  on(event, handler) {
    this._events.on(event, handler);
  }

  /**
   * @param {string} event
   * @param {(state: KernelState) => void} handler
   */
  off(event, handler) {
    this._events.off(event, handler);
  }

  /**
   * 状態が変わったときに、登録されている全イベント名に対し
   * 「現在の state」を payload として emit する。
   * （P0 では STATE_CHANGE 1種類のみ想定）
   */
  _notifyStateChange() {
    const snapshot = this.getState();
    for (const [eventName] of this._events.handlers) {
      this._events.emit(eventName, snapshot);
    }
  }
}
