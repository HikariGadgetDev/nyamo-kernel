// nyamo-ui/kernel.js

/**
 * Nyamo UI Kernel v3.4 - main entrypoint
 * - Wires core / state / infra / UI layers together
 * - Exposes public API as NyamoUIKernel + singleton NyamoUI
 */

import {
  DEFAULTS,
  FeatureDetector,
  Logger,
  EventEmitter,
} from './core.js';

import {
  StateManager,
  EventManager,
  FocusableCache,
} from './state.js';

import {
  PerformanceMonitor,
  ErrorReporter,
  ErrorBoundary,
  A11yChecker,
  ThemeManager,
  PluginManager,
  IntersectionManager,
} from './infra.js';

import {
  OverlayManager,
  LayerManager,
  DialogBuilder,
  SheetBuilder,
  ToastManager,
  LoaderBuilder,
  ConfirmBuilder,
} from './ui.js';

/**
 * Nyamo UI Kernel - Main class
 */
export class NyamoUIKernel extends EventEmitter {
  /**
   * @param {Object} [deps={}] - Dependency injection for testing
   * @param {import('./core.js').KernelConfig} [config={}] - Configuration options
   */
  constructor(deps = {}, config = {}) {
    super();

    this.version = DEFAULTS.VERSION;
    this.config = { ...DEFAULTS.CONFIG, ...config };

    // Dependency injection
    this.deps = {
      document: deps.document || (typeof document !== 'undefined' ? document : null),
      window: deps.window || (typeof window !== 'undefined' ? window : null),

      Logger: deps.Logger || Logger,
      StateManager: deps.StateManager || StateManager,
      EventManager: deps.EventManager || EventManager,
      ErrorBoundary: deps.ErrorBoundary || ErrorBoundary,
      IntersectionManager: deps.IntersectionManager || IntersectionManager,
      ThemeManager: deps.ThemeManager || ThemeManager,
      A11yChecker: deps.A11yChecker || A11yChecker,
      PluginManager: deps.PluginManager || PluginManager,
      FocusableCache: deps.FocusableCache || FocusableCache,
      PerformanceMonitor: deps.PerformanceMonitor || PerformanceMonitor,
      ErrorReporter: deps.ErrorReporter || ErrorReporter,
      FeatureDetector: deps.FeatureDetector || FeatureDetector,
    };

    // Core systems (FeatureDetector singleton)
    this.featureDetector = new this.deps.FeatureDetector();
    this.logger = new this.deps.Logger(this.config.debug);
    this.stateManager = new this.deps.StateManager(this.config, this.featureDetector);
    this.eventManager = new this.deps.EventManager();
    this.errorReporter = new this.deps.ErrorReporter(this.config, this.logger);
    this.errorBoundary = new this.deps.ErrorBoundary(this.logger, this.errorReporter);
    this.intersectionManager = new this.deps.IntersectionManager(this.featureDetector);
    this.themeManager = new this.deps.ThemeManager(this.config);
    this.a11yChecker = new this.deps.A11yChecker(this.logger, this.config);
    this.pluginManager = new this.deps.PluginManager(this);
    this.focusableCache = new this.deps.FocusableCache(this.featureDetector);
    this.performanceMonitor = new this.deps.PerformanceMonitor(
      this.config,
      this.logger,
      this.featureDetector
    );

    // safeMode → ErrorBoundary に反映
    this.errorBoundary.setSafeMode(this.config.safeMode);

    // UI managers (lazy init)
    this.overlayManager = null;
    this.layerManager = null;
    this.toastManager = null;
    this.dialogBuilder = null;
    this.sheetBuilder = null;
    this.loaderBuilder = null;
    this.confirmBuilder = null;

    this.boundHandlers = {
      overlayClick: this._handleOverlayClick.bind(this),
      keyDown: this._handleKeyDown.bind(this),
    };

    this.initialized = false;
    this._pendingConfirms = new Map();

    // state change forward
    this.stateManager.on(DEFAULTS.EVENTS.STATE_CHANGE, (data) => {
      this.emit(DEFAULTS.EVENTS.STATE_CHANGE, data);
    });
  }

  // ================================
  // Initialization
  // ================================

  /**
   * Initialize kernel
   * @returns {NyamoUIKernel} this
   */
  init() {
    if (this.initialized) {
      this.logger.log('Already initialized');
      return this;
    }

    if (!this.deps.document || this.deps.document.body == null) {
      this.logger.error('DOM is not ready. Delaying initialization.');
      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
      }
      return this;
    }

    this.performanceMonitor.mark('init');

    try {
      // Performance monitoring
      this.performanceMonitor.init();

      // Theme
      this.themeManager.init();

      // Overlay
      this.overlayManager = new OverlayManager(
        this.config,
        this.boundHandlers.overlayClick,
        this.eventManager
      );
      this.overlayManager.create();

      // Layers
      this.layerManager = new LayerManager(
        this.overlayManager,
        this.logger,
        this.config,
        this.eventManager,
        this.stateManager,
        this.focusableCache
      );

      // Toasts
      this.toastManager = new ToastManager(
        this.logger,
        this.config,
        this.intersectionManager,
        this.stateManager
      );

      // Builders
      const closeCallback = () => this.close();
      this.dialogBuilder = new DialogBuilder(closeCallback, this.eventManager);
      this.sheetBuilder = new SheetBuilder();
      this.loaderBuilder = new LoaderBuilder();
      this.confirmBuilder = new ConfirmBuilder(
        this.dialogBuilder,
        closeCallback,
        this.featureDetector
      );

      // Global listeners
      this._attachGlobalListeners();

      // Forward layer events
      this.layerManager.on(DEFAULTS.EVENTS.DIALOG_OPEN, (data) =>
        this.emit(DEFAULTS.EVENTS.DIALOG_OPEN, data)
      );
      this.layerManager.on(DEFAULTS.EVENTS.DIALOG_CLOSE, (data) =>
        this.emit(DEFAULTS.EVENTS.DIALOG_CLOSE, data)
      );
      this.layerManager.on(DEFAULTS.EVENTS.SHEET_OPEN, (data) =>
        this.emit(DEFAULTS.EVENTS.SHEET_OPEN, data)
      );
      this.layerManager.on(DEFAULTS.EVENTS.SHEET_CLOSE, (data) =>
        this.emit(DEFAULTS.EVENTS.SHEET_CLOSE, data)
      );

      // Forward toast events
      this.toastManager.on(DEFAULTS.EVENTS.TOAST_SHOW, (data) =>
        this.emit(DEFAULTS.EVENTS.TOAST_SHOW, data)
      );
      this.toastManager.on(DEFAULTS.EVENTS.TOAST_HIDE, (data) =>
        this.emit(DEFAULTS.EVENTS.TOAST_HIDE, data)
      );

      this.initialized = true;
      this.performanceMonitor.measure('init');

      this.logger.log(`✨ Kernel initialized v${this.version}`);
      this.logger.log('Features:', this.featureDetector.getFeatures());
    } catch (err) {
      this.logger.error('Initialization failed:', err);
      this.errorBoundary.handleError(err, { method: 'init' });
      throw err;
    }

    return this;
  }

  // ================================
  // Event Handling (private)
  // ================================

  _attachGlobalListeners() {
    if (this.config.closeOnEscape && typeof document !== 'undefined') {
      document.addEventListener('keydown', this.boundHandlers.keyDown);
    }
  }

  _detachGlobalListeners() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.boundHandlers.keyDown);
    }
  }

  /**
   * @param {MouseEvent} e
   * @private
   */
  _handleOverlayClick(e) {
    if (!this.overlayManager) return;
    if (e.target === this.overlayManager.getElement()) {
      this.close();
    }
  }

  /**
   * @param {KeyboardEvent} e
   * @private
   */
  _handleKeyDown(e) {
    if (e.key === 'Escape' && this.layerManager?.hasActiveLayer()) {
      e.preventDefault();
      this.close();
    }
  }

  // ================================
  // Public API - Configuration
  // ================================

  /**
   * @param {Partial<import('./core.js').KernelConfig>} [newConfig={}]
   * @returns {NyamoUIKernel}
   */
  setConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    this.logger.setDebug(this.config.debug);
    this.errorBoundary.setSafeMode(this.config.safeMode);
    return this;
  }

  /**
   * @returns {import('./core.js').KernelConfig}
   */
  getConfig() {
    return { ...this.config };
  }

  // ================================
  // Public API - Dialog
  // ================================

  /**
   * Open dialog
   * @param {import('./core.js').DialogOptions} [options={}]
   * @returns {NyamoUIKernel}
   */
  dialog(options = {}) {
    return this.errorBoundary.wrap(() => {
      this.init();
      this.performanceMonitor.mark('dialog');

      const element = this.dialogBuilder.build(options);

      if (this.config.a11yChecks) {
        this.a11yChecker.check(element);
      }

      this.layerManager.open(element, {
        onOpen: options.onOpen,
        onClose: options.onClose,
        type: 'dialog',
        data: options.data || {},
      });

      this.performanceMonitor.measure('dialog');
      return this;
    })();
  }

  // ================================
  // Public API - Sheet
  // ================================

  /**
   * Open sheet
   * @param {import('./core.js').SheetOptions} [options={}]
   * @returns {NyamoUIKernel}
   */
  sheet(options = {}) {
    return this.errorBoundary.wrap(() => {
      this.init();
      this.performanceMonitor.mark('sheet');

      const element = this.sheetBuilder.build(options);

      if (this.config.a11yChecks) {
        this.a11yChecker.check(element);
      }

      this.layerManager.open(element, {
        onOpen: options.onOpen,
        onClose: options.onClose,
        type: 'sheet',
        data: options.data || {},
      });

      this.performanceMonitor.measure('sheet');
      return this;
    })();
  }

  // ================================
  // Public API - Toast
  // ================================

  /**
   * Show toast notification
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} [type='info']
   * @param {number} [duration]
   * @returns {NyamoUIKernel}
   */
  toast(message, type = 'info', duration = DEFAULTS.TOAST.DURATION) {
    return this.errorBoundary.wrap(() => {
      // toast は init 済みを前提にしない（最小依存構成）
      if (!this.toastManager) {
        this.toastManager = new ToastManager(
          this.logger,
          this.config,
          this.intersectionManager,
          this.stateManager
        );
      }
      this.toastManager.show(message, type, duration);
      return this;
    })();
  }

  // ================================
  // Public API - Loader
  // ================================

  /**
   * Show/hide loader
   * @param {boolean} [show=true]
   * @param {string} [text='']
   * @returns {NyamoUIKernel}
   */
  loader(show = true, text = '') {
    return this.errorBoundary.wrap(() => {
      this.init();
      if (show) {
        const element = this.loaderBuilder.build(text);
        this.layerManager.open(element, { type: 'dialog' });
        this.emit(DEFAULTS.EVENTS.LOADER_SHOW, { text });
      } else {
        this.close();
        this.emit(DEFAULTS.EVENTS.LOADER_HIDE, {});
      }
      return this;
    })();
  }

  // ================================
  // Public API - Confirm
  // ================================

  /**
   * Show confirm dialog
   * @param {import('./core.js').ConfirmOptions} [options={}]
   * @returns {Promise<boolean>}
   */
  confirm(options = {}) {
    this.init();
    try {
      const { element, promise, cancel, controllerId } =
        this.confirmBuilder.build(options);

      this.layerManager.open(element, { type: 'dialog' });

      this._pendingConfirms.set(controllerId, { promise, cancel });

      promise.finally(() => {
        this._pendingConfirms.delete(controllerId);
      });

      return promise;
    } catch (err) {
      this.logger.error('Confirm dialog failed:', err);
      this.errorBoundary.handleError(err, { method: 'confirm' });
      return Promise.reject(err);
    }
  }

  // ================================
  // Public API - Control
  // ================================

  /**
   * Close active layer
   * @returns {NyamoUIKernel}
   */
  close() {
    if (this.layerManager) {
      this.layerManager.close();
    }
    return this;
  }

  /**
   * Destroy kernel and cleanup
   * @returns {NyamoUIKernel}
   */
  destroy() {
    this.logger.log('Destroying kernel...');

    try {
      // Close active layer
      this.close();

      if (this.toastManager) {
        this.toastManager.clearAll();
      }

      if (this.confirmBuilder) {
        this.confirmBuilder.cancelAll();
      }

      if (this.overlayManager) {
        this.overlayManager.destroy();
      }

      this.eventManager.clear();
      this.intersectionManager.clear();
      this.themeManager.destroy();
      this.pluginManager.clear();
      this.focusableCache.clear();
      this.performanceMonitor.clear();

      this._detachGlobalListeners();

      // Flush pending state updates
      if (
        this.stateManager.scheduledUpdate &&
        this.featureDetector.isSupported('cancelIdleCallback')
      ) {
        cancelIdleCallback(this.stateManager.scheduledUpdate);
        this.stateManager.flushUpdates();
      }

      this.stateManager.clear();
      this.clear(); // EventEmitter イベントクリア

      this.initialized = false;
      this._pendingConfirms.clear();

      this.logger.log('Kernel destroyed');
    } catch (err) {
      this.logger.error('Destroy failed:', err);
      this.errorBoundary.handleError(err, { method: 'destroy' });
    }

    return this;
  }

  // ================================
  // Public API - State & status
  // ================================

  /**
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * @returns {boolean}
   */
  hasActiveLayer() {
    return this.layerManager?.hasActiveLayer() || false;
  }

  /**
   * @returns {string}
   */
  getVersion() {
    return this.version;
  }

  /**
   * @returns {Object}
   */
  getState() {
    return this.stateManager.getState();
  }

  /**
   * @returns {Array<Object>}
   */
  getHistory() {
    return this.stateManager.getHistory();
  }

  // ================================
  // Public API - Utilities
  // ================================

  /**
   * Clear all toasts
   * @returns {NyamoUIKernel}
   */
  clearToasts() {
    if (this.toastManager) {
      this.toastManager.clearAll();
    }
    return this;
  }

  /**
   * Check browser feature support
   * @returns {import('./core.js').FeatureSupport}
   */
  checkSupport() {
    return this.featureDetector.getFeatures();
  }

  // ================================
  // Public API - Theme
  // ================================

  /**
   * @param {Record<string, string>} theme
   * @returns {NyamoUIKernel}
   */
  setTheme(theme) {
    this.themeManager.setTheme(theme);
    return this;
  }

  /**
   * @returns {Record<string, string>}
   */
  getTheme() {
    return this.themeManager.getTheme();
  }

  // ================================
  // Public API - Plugins
  // ================================

  /**
   * Register plugin
   * @param {Object} plugin
   * @returns {NyamoUIKernel}
   */
  use(plugin) {
    if (!this.config.enablePlugins) {
      this.logger.warn('Plugins are disabled');
      return this;
    }
    this.pluginManager.register(plugin);
    return this;
  }

  /**
   * Unregister plugin
   * @param {string} pluginName
   * @returns {NyamoUIKernel}
   */
  unuse(pluginName) {
    this.pluginManager.unregister(pluginName);
    return this;
  }

  /**
   * @returns {string[]}
   */
  getPlugins() {
    return this.pluginManager.list();
  }

  // ================================
  // Public API - Debug & Monitoring
  // ================================

  /**
   * @returns {Array<Object>}
   */
  getErrors() {
    return this.errorBoundary.getErrors();
  }

  /**
   * @returns {NyamoUIKernel}
   */
  clearErrors() {
    this.errorBoundary.clearErrors();
    return this;
  }

  /**
   * @param {HTMLElement} [element]
   * @returns {Array<Object>}
   */
  checkA11y(element) {
    if (!element && this.layerManager) {
      const layer = this.layerManager.getActiveLayer();
      if (layer) {
        element = layer.element;
      }
    }

    if (!element) {
      this.logger.warn('No element to check');
      return [];
    }

    return this.a11yChecker.check(element);
  }

  /**
   * @returns {Array<{name: string, duration: number, startTime: number}>}
   */
  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  /**
   * @returns {{jsHeapSizeLimit: number, totalJSHeapSize: number, usedJSHeapSize: number, percentage: string} | null}
   */
  getMemoryInfo() {
    if (typeof performance === 'undefined' || !performance.memory) {
      return null;
    }
    const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = performance.memory;
    return {
      jsHeapSizeLimit,
      totalJSHeapSize,
      usedJSHeapSize,
      percentage: ((usedJSHeapSize / jsHeapSizeLimit) * 100).toFixed(2),
    };
  }

  /**
   * @returns {Object}
   */
  exportSnapshot() {
    return {
      version: this.version,
      config: this.config,
      state: this.stateManager.getState(),
      history: this.stateManager.getHistory(),
      errors: this.errorBoundary.getErrors(),
      metrics: this.performanceMonitor.getMetrics(),
      features: this.featureDetector.getFeatures(),
      memory: this.getMemoryInfo(),
      timestamp: Date.now(),
    };
  }

  /**
   * Enable debug mode with DevTools integration
   * @returns {NyamoUIKernel}
   */
  enableDevTools() {
    this.setConfig({ debug: true, performanceMonitoring: true });

    if (typeof window !== 'undefined') {
      window.__NYAMO_UI_DEVTOOLS__ = {
        kernel: this,
        snapshot: () => this.exportSnapshot(),
        inspect: () => console.table(this.exportSnapshot()),
      };

      this.logger.log('🔧 DevTools enabled. Use window.__NYAMO_UI_DEVTOOLS__');
    }
    return this;
  }
}

// ================================
// Singleton Export & Auto-initialization
// ================================

export const NyamoUI = new NyamoUIKernel();

if (typeof window !== 'undefined') {
  window.NyamoUI = NyamoUI;

  // Dev 専用オプション（必要ならコメント解除）
  // if (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1') {
  //   NyamoUI.enableDevTools();
  // }
}
