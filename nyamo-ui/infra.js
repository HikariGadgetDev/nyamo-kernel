// nyamo-ui/infra.js

/**
 * Infrastructure layer:
 * - PerformanceMonitor
 * - ErrorReporter
 * - ErrorBoundary
 * - A11yChecker
 * - IntersectionManager
 * - ThemeManager
 * - PluginManager
 */

import {
  DEFAULTS,
  FOCUSABLE_SELECTORS,
  CircularBuffer,
  FeatureDetector,
  Logger,
  EventEmitter,
  Utils,
} from './core.js';

// ================================
// Performance Monitor
// ================================

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  /**
   * @param {import('./core.js').KernelConfig} config
   * @param {Logger} logger
   * @param {FeatureDetector} [featureDetector]
   */
  constructor(config, logger = new Logger(), featureDetector = new FeatureDetector()) {
    this.config = config;
    this.logger = logger;
    this.featureDetector = featureDetector;
    this.marks = new Map();
    this.observer = null;
    this.pendingMeasures = [];
  }

  /**
   * Initialize performance monitoring
   */
  init() {
    if (!this.config.performanceMonitoring) return;
    if (!this.featureDetector.isSupported('performanceObserver')) {
      this.logger.warn('PerformanceObserver not supported');
      return;
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name.startsWith('ny:')) {
            this.logger.log(`⚡ ${entry.name}: ${entry.duration.toFixed(2)}ms`);
          }
        }
      });

      this.observer.observe({ entryTypes: ['measure'] });
    } catch (err) {
      this.logger.error('Failed to init PerformanceObserver:', err);
    }
  }

  /**
   * Mark performance start point
   * @param {string} name
   */
  mark(name) {
    if (!this.config.performanceMonitoring) return;

    const markName = `ny:${name}:start`;
    this.marks.set(name, markName);

    try {
      performance.mark(markName);
    } catch (err) {
      if (this.config.debug) {
        this.logger.warn('Performance mark failed:', err);
      }
    }
  }

  /**
   * Measure from mark
   * @param {string} name
   */
  measure(name) {
    if (!this.config.performanceMonitoring) return;

    const markName = this.marks.get(name);
    if (!markName) return;

    if (this.featureDetector.isSupported('requestIdleCallback')) {
      this.pendingMeasures.push({ name, markName });
      requestIdleCallback(() => this._flushMeasures(), { timeout: 100 });
    } else {
      this._performMeasure(name, markName);
    }
  }

  /**
   * @private
   */
  _flushMeasures() {
    if (this.pendingMeasures.length === 0) return;
    const measures = [...this.pendingMeasures];
    this.pendingMeasures = [];

    measures.forEach(({ name, markName }) => {
      this._performMeasure(name, markName);
    });
  }

  /**
   * @private
   */
  _performMeasure(name, markName) {
    try {
      performance.measure(`ny:${name}`, markName);
      performance.clearMarks(markName);
      this.marks.delete(name);
    } catch (err) {
      if (this.config.debug) {
        this.logger.warn('Performance measure failed:', err);
      }
    }
  }

  /**
   * @returns {Array<{name: string, duration: number, startTime: number}>}
   */
  getMetrics() {
    if (typeof performance === 'undefined') return [];

    try {
      return performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith('ny:'))
        .map((entry) => ({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime,
        }));
    } catch {
      return [];
    }
  }

  clear() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.marks.clear();
    this.pendingMeasures = [];

    try {
      performance.clearMarks();
      performance.clearMeasures();
    } catch (err) {
      if (this.config.debug) {
        this.logger.warn('Performance clear failed:', err);
      }
    }
  }
}

// ================================
// Error Reporter
// ================================

/**
 * Error reporting utility
 */
export class ErrorReporter {
  /**
   * @param {import('./core.js').KernelConfig} config
   * @param {Logger} logger
   */
  constructor(config, logger = new Logger()) {
    this.config = config;
    this.logger = logger;
    this.queue = [];
    this.sending = false;
  }

  /**
   * @param {Error} error
   * @param {Record<string, any>} [context={}]
   * @returns {Promise<void>}
   */
  async report(error, context = {}) {
    const { errorEndpoints, errorSampleRate } = this.config;

    if (!errorEndpoints || errorEndpoints.length === 0) return;
    if (Math.random() > errorSampleRate) return;

    const payload = {
      message: error.message,
      stack: error.stack,
      context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      timestamp: Date.now(),
      version: DEFAULTS.VERSION,
    };

    this.queue.push(payload);
    if (!this.sending) {
      this.flush();
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.queue.length === 0) return;

    this.sending = true;
    const batch = [...this.queue];
    this.queue = [];

    const { errorEndpoints } = this.config;

    try {
      await Promise.allSettled(
        errorEndpoints.map((url) =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ errors: batch }),
            keepalive: true,
          }).catch((err) => {
            this.logger.warn('Error reporting failed:', err);
          })
        )
      );
    } catch (err) {
      this.logger.error('Error reporting batch failed:', err);
    } finally {
      this.sending = false;
    }
  }
}

// ================================
// Error Boundary
// ================================

/**
 * Error boundary for safe execution
 */
export class ErrorBoundary extends EventEmitter {
  /**
   * @param {Logger} logger
   * @param {ErrorReporter} errorReporter
   */
  constructor(logger, errorReporter) {
    super();
    this.logger = logger;
    this.errorReporter = errorReporter;
    this.errors = new CircularBuffer(100);
    this.safeMode = true; // default: swallow & report
  }

  /**
   * @param {boolean} enabled
   */
  setSafeMode(enabled) {
    this.safeMode = enabled;
  }

  /**
   * Wrap sync function
   * @param {Function} fn
   * @param {any} [context=null]
   * @returns {Function}
   */
  wrap(fn, context = null) {
    return (...args) => {
      try {
        return fn.apply(context, args);
      } catch (error) {
        this.handleError(error, { fn: fn.name, args });
        if (!this.safeMode) {
          throw error;
        }
        return undefined;
      }
    };
  }

  /**
   * Wrap async function
   * @param {Function} fn
   * @param {any} [context=null]
   * @returns {Function}
   */
  wrapAsync(fn, context = null) {
    return async (...args) => {
      try {
        return await fn.apply(context, args);
      } catch (error) {
        this.handleError(error, { fn: fn.name, args });
        if (!this.safeMode) {
          throw error;
        }
        return undefined;
      }
    };
  }

  /**
   * @param {Error} error
   * @param {Record<string, any>} [context={}]
   */
  handleError(error, context = {}) {
    this.logger.error('Caught error:', error, context);

    const errorData = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now(),
    };

    this.errors.push(errorData);
    this.emit(DEFAULTS.EVENTS.ERROR, errorData);

    if (this.errorReporter) {
      this.errorReporter.report(error, context);
    }
  }

  /**
   * @returns {Array<Object>}
   */
  getErrors() {
    return this.errors.toArray();
  }

  clearErrors() {
    this.errors.clear();
  }
}

// ================================
// Accessibility Checker & Fixer
// ================================

/**
 * Accessibility checker and auto-fixer
 */
export class A11yChecker {
  /**
   * @param {Logger} logger
   * @param {import('./core.js').KernelConfig} config
   */
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
  }

  /**
   * Check element for accessibility issues
   * @param {HTMLElement} element
   * @returns {Array<Object>}
   */
  check(element) {
    const issues = [];

    if (element.hasAttribute('role')) {
      const role = element.getAttribute('role');
      if (!this.isValidRole(role)) {
        issues.push({ type: 'invalid-role', element, role });
      }
    }

    if (element.getAttribute('role') === 'dialog' &&
        element.getAttribute('aria-modal') !== 'true') {
      issues.push({ type: 'missing-aria-modal', element });
    }

    const focusable = element.querySelectorAll(FOCUSABLE_SELECTORS);
    if (focusable.length === 0) {
      issues.push({ type: 'no-focusable', element });
    }

    const inputs = element.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => {
      if (
        !input.hasAttribute('aria-label') &&
        !input.hasAttribute('aria-labelledby') &&
        !this.hasAssociatedLabel(input)
      ) {
        issues.push({ type: 'missing-label', element: input });
      }
    });

    if (issues.length > 0) {
      this.logger.warn('A11y issues found:', issues);
      if (this.config.a11yAutofix) {
        this.autofix(element, issues);
      }
    }

    return issues;
  }

  /**
   * Auto-fix issues
   * @param {HTMLElement} _element
   * @param {Array<Object>} issues
   */
  autofix(_element, issues) {
    issues.forEach((issue) => {
      try {
        switch (issue.type) {
          case 'missing-aria-modal':
            issue.element.setAttribute('aria-modal', 'true');
            this.logger.log('Auto-fixed: Added aria-modal="true"');
            break;
          case 'missing-label': {
            const placeholder = issue.element.getAttribute('placeholder');
            if (placeholder) {
              issue.element.setAttribute('aria-label', placeholder);
              this.logger.log('Auto-fixed: Added aria-label from placeholder');
            }
            break;
          }
          case 'invalid-role':
            issue.element.removeAttribute('role');
            this.logger.log('Auto-fixed: Removed invalid role');
            break;
          default:
            break;
        }
      } catch (err) {
        this.logger.error('Auto-fix failed:', err);
      }
    });
  }

  /**
   * @param {string|null} role
   * @returns {boolean}
   */
  isValidRole(role) {
    if (!role) return false;
    const validRoles = [
      'alert', 'dialog', 'alertdialog', 'status', 'log',
      'marquee', 'timer', 'button', 'checkbox', 'link',
    ];
    return validRoles.includes(role);
  }

  /**
   * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} input
   * @returns {boolean}
   */
  hasAssociatedLabel(input) {
    const id = input.id;
    if (!id) return false;
    return !!document.querySelector(`label[for="${id}"]`);
  }
}

// ================================
// Intersection Observer Manager
// ================================

/**
 * Intersection observer management
 */
export class IntersectionManager {
  /**
   * @param {FeatureDetector} [featureDetector]
   */
  constructor(featureDetector = new FeatureDetector()) {
    this.featureDetector = featureDetector;
    this.observers = new Map();
  }

  /**
   * @param {HTMLElement} element
   * @param {(visible: boolean, entry: IntersectionObserverEntry|null) => void} callback
   * @param {Object} [options={}]
   * @returns {Function} unobserve function
   */
  observe(element, callback, options = {}) {
    if (!this.featureDetector.isSupported('intersectionObserver')) {
      // Fallback: assume always visible
      callback(true, null);
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          callback(entry.isIntersecting, entry);
        });
      },
      {
        threshold: options.threshold ?? 0,
        rootMargin: options.rootMargin ?? '0px',
      }
    );

    observer.observe(element);
    this.observers.set(element, observer);

    return () => this.unobserve(element);
  }

  /**
   * @param {HTMLElement} element
   */
  unobserve(element) {
    const observer = this.observers.get(element);
    if (observer) {
      observer.disconnect();
      this.observers.delete(element);
    }
  }

  clear() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
  }
}

// ================================
// CSS-in-JS Theme Manager
// ================================

/**
 * Dynamic theme management
 */
export class ThemeManager {
  /**
   * @param {import('./core.js').KernelConfig} config
   */
  constructor(config) {
    this.config = config;
    this.styleElement = null;
    this.currentTheme = {};
  }

  init() {
    if (!this.config.cssInJs) return;
    if (typeof document === 'undefined') return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'nyamo-ui-dynamic-styles';
    document.head.appendChild(this.styleElement);
  }

  /**
   * @param {Record<string, string>} theme
   */
  setTheme(theme) {
    if (!this.config.cssInJs) return;
    this.currentTheme = { ...this.currentTheme, ...theme };
    this.applyTheme();
  }

  applyTheme() {
    if (!this.styleElement) return;

    const cssVars = Object.entries(this.currentTheme)
      .map(([key, value]) => `--ny-${key}: ${value};`)
      .join('\n  ');

    this.styleElement.textContent = `:root {\n  ${cssVars}\n}`;
  }

  /**
   * @returns {Record<string, string>}
   */
  getTheme() {
    return { ...this.currentTheme };
  }

  destroy() {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }
}

// ================================
// Plugin System
// ================================

/**
 * Plugin management
 */
export class PluginManager {
  /**
   * @param {any} kernel - NyamoUIKernel instance (型循環回避のため any)
   */
  constructor(kernel) {
    this.kernel = kernel;
    this.plugins = new Map();
  }

  /**
   * @param {{name: string, install?: Function, uninstall?: Function}} plugin
   * @returns {PluginManager}
   */
  register(plugin) {
    if (!plugin.name) {
      throw new Error('Plugin must have a name');
    }

    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} already registered`);
    }

    if (typeof plugin.install === 'function') {
      plugin.install(this.kernel);
    }

    this.plugins.set(plugin.name, plugin);
    this.kernel.logger.log(`Plugin registered: ${plugin.name}`);

    return this;
  }

  /**
   * @param {string} name
   */
  unregister(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return;

    if (typeof plugin.uninstall === 'function') {
      plugin.uninstall(this.kernel);
    }

    this.plugins.delete(name);
    this.kernel.logger.log(`Plugin unregistered: ${name}`);
  }

  /**
   * @param {string} name
   * @returns {any}
   */
  get(name) {
    return this.plugins.get(name);
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.plugins.has(name);
  }

  /**
   * @returns {string[]}
   */
  list() {
    return Array.from(this.plugins.keys());
  }

  clear() {
    this.plugins.forEach((plugin, name) => {
      this.unregister(name);
    });
  }
}
