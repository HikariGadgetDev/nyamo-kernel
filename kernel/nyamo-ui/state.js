// nyamo-ui/state.js

import { DEFAULTS, FOCUSABLE_SELECTORS, CircularBuffer, FeatureDetector, EventEmitter } from './core.js';

/**
 * Cache for focusable elements with automatic invalidation
 */
export class FocusableCache {
  constructor(featureDetector = new FeatureDetector()) {
    this.cache = new WeakMap();
    this.observers = new WeakMap();
    this.featureDetector = featureDetector;
  }

  get(container) {
    if (!container) return [];
    if (!this.cache.has(container)) {
      this.refresh(container);
      if (this.featureDetector.isSupported('mutationObserver')) {
        this.observe(container);
      }
    }
    return this.cache.get(container) || [];
  }

  refresh(container) {
    if (!container) return;
    const elements = Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS));
    this.cache.set(container, elements);
  }

  observe(container) {
    if (this.observers.has(container)) return;
    const observer = new MutationObserver(() => {
      this.refresh(container);
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'tabindex', 'href'],
    });
    this.observers.set(container, observer);
  }

  unobserve(container) {
    const observer = this.observers.get(container);
    if (observer) {
      observer.disconnect();
      this.observers.delete(container);
    }
    this.cache.delete(container);
  }

  clear() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = new WeakMap();
    this.cache = new WeakMap();
  }
}

/**
 * State management with diff-based history
 */
export class StateManager extends EventEmitter {
  constructor(config, featureDetector = new FeatureDetector()) {
    super();
    this.config = config;
    this.featureDetector = featureDetector;

    this.state = {
      activeLayer: null,
      toasts: [],
      plugins: new Map(),
      theme: {},
    };

    this.history = new CircularBuffer(config.stateHistorySize || 50);
    this.pendingUpdates = [];
    this.scheduledUpdate = null;
  }

  getState() {
    return { ...this.state };
  }

  setState(updates) {
    if (this.config.batchUpdates && this.featureDetector.isSupported('requestIdleCallback')) {
      this.pendingUpdates.push(updates);
      if (!this.scheduledUpdate) {
        this.scheduledUpdate = requestIdleCallback(() => {
          this.flushUpdates();
        }, { timeout: 50 });
      }
    } else {
      this.applyUpdate(updates);
    }
  }

  flushUpdates() {
    if (this.pendingUpdates.length === 0) return;
    const merged = Object.assign({}, ...this.pendingUpdates);
    this.pendingUpdates = [];
    this.scheduledUpdate = null;
    this.applyUpdate(merged);
  }

  applyUpdate(updates) {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };

    if (this.config.useDiffHistory) {
      const diff = this._computeDiff(oldState, updates);
      this.history.push({ timestamp: Date.now(), diff });
    } else {
      this.history.push({
        timestamp: Date.now(),
        oldState,
        newState: { ...this.state },
      });
    }

    this.emit(DEFAULTS.EVENTS.STATE_CHANGE, {
      oldState,
      newState: this.state,
    });
  }

  _computeDiff(oldState, updates) {
    const diff = {};
    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        if (oldState[key] !== updates[key]) {
          diff[key] = {
            old: oldState[key],
            new: updates[key],
          };
        }
      }
    }
    return diff;
  }

  getHistory() {
    return this.history.toArray();
  }

  clearHistory() {
    this.history.clear();
  }

  clear() {
    this.pendingUpdates = [];
    if (this.scheduledUpdate && this.featureDetector.isSupported('cancelIdleCallback')) {
      cancelIdleCallback(this.scheduledUpdate);
    }
    this.scheduledUpdate = null;

    this.state = {
      activeLayer: null,
      toasts: [],
      plugins: new Map(),
      theme: {},
    };
    this.clearHistory();
  }
}

/**
 * Event listener management with automatic cleanup
 */
export class EventManager {
  constructor() {
    this.listeners = new WeakMap();
    this.handlerRefs = new Map();
  }

  register(element, event, handler, options) {
    if (!element) return null;
    const handlerId = Symbol('handler');

    if (!this.listeners.has(element)) {
      this.listeners.set(element, new Map());
    }

    const elementListeners = this.listeners.get(element);
    if (!elementListeners.has(event)) {
      elementListeners.set(event, new Map());
    }

    elementListeners.get(event).set(handlerId, { handler, options });
    this.handlerRefs.set(handlerId, { element, event, handler });

    element.addEventListener(event, handler, options);
    return handlerId;
  }

  unregister(handlerId) {
    if (!handlerId || !this.handlerRefs.has(handlerId)) return;
    const { element, event, handler } = this.handlerRefs.get(handlerId);
    element.removeEventListener(event, handler);

    const elementListeners = this.listeners.get(element);
    if (elementListeners) {
      const eventListeners = elementListeners.get(event);
      if (eventListeners) {
        eventListeners.delete(handlerId);
      }
    }
    this.handlerRefs.delete(handlerId);
  }

  unregisterAll(element) {
    if (!element || !this.listeners.has(element)) return;
    const elementListeners = this.listeners.get(element);
    elementListeners.forEach((eventMap, event) => {
      eventMap.forEach(({ handler }) => {
        element.removeEventListener(event, handler);
      });
    });
    this.listeners.delete(element);
  }

  clear() {
    this.handlerRefs.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.handlerRefs.clear();
    this.listeners = new WeakMap();
  }
}
