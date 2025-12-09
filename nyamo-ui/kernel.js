// ================================
// Nyamo UI Kernel - kernel.js
// Runtime Kernel / UI Orchestrator
// ================================

import {
  DEFAULTS,
  Utils,
  EventEmitter,
  Logger,
  NyamoError,
  HTMLSanitizer,
  FeatureDetector,
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


// ================================
// KernelEventEmitter
// ================================

class KernelEventEmitter extends EventEmitter {}


// ================================
// Nyamo UI Kernel
// ================================

export class NyamoUIKernel extends KernelEventEmitter {
  /**
   * @param {Object} [deps={}] - DI for test stubs
   * @param {import('./core.js').KernelConfig} [config={}]
   */
  constructor(deps = {}, config = {}) {
    super();

    this.version = DEFAULTS.VERSION;

    // Deep-ish merge for config.shortcuts
    this.config = { ...DEFAULTS.CONFIG, ...config };
    this.config.shortcuts = {
      ...(DEFAULTS.CONFIG.shortcuts || {}),
      ...(config.shortcuts || {}),
    };

    this.eventBus = deps.eventBus || new EventEmitter();
    this.logger = deps.logger || new Logger(this.config.debug);

    // sanitize 設定を HTMLSanitizer に渡す
    this.htmlSanitizer =
      deps.htmlSanitizer || new HTMLSanitizer(config.sanitize || {});

    // -----------------------------------
    // Dependency Injection
    // -----------------------------------
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

    // -----------------------------------
    // Core systems
    // -----------------------------------
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
      this.featureDetector,
    );

    // safeMode 反映
    this.errorBoundary.setSafeMode(this.config.safeMode);

    // -----------------------------------
    // UI Systems（遅延初期化）
    // -----------------------------------
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

    // -----------------------------------
    // forward state events
    // -----------------------------------
    this.stateManager.on(DEFAULTS.EVENTS.STATE_CHANGE, (st) =>
      this.emit(DEFAULTS.EVENTS.STATE_CHANGE, st)
    );
  }


  // ================================
  // init()
  // ================================
  init() {
    if (this.initialized) {
      this.logger.log('Already initialized');
      return this;
    }

    const doc =
      this.deps.document || (typeof document !== 'undefined' ? document : null);

    if (!doc || !doc.body) {
      this.logger.error('DOM not ready; delaying init');
      if (doc && doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
      }
      return this;
    }

    this.performanceMonitor.mark('init');

    try {
      // Performance
      this.performanceMonitor.init();

      // Themes
      this.themeManager.init();

      // Overlay
      this.overlayManager = new OverlayManager(
        this.config,
        this.boundHandlers.overlayClick,
        this.eventManager,
      );
      this.overlayManager.create();

      // Layers
      this.layerManager = new LayerManager(
        this.overlayManager,
        this.logger,
        this.config,
        this.eventManager,
        this.stateManager,
        this.focusableCache,
      );

      // Toasts
      this.toastManager = new ToastManager(
        this.logger,
        this.config,
        this.intersectionManager,
        this.stateManager,
      );

      // Builders
      const closeCallback = () => this.close();

      // ★ sanitizer を Builder 群に渡す
      this.dialogBuilder = new DialogBuilder(
        closeCallback,
        this.eventManager,
        this.htmlSanitizer,
      );
      this.sheetBuilder = new SheetBuilder(this.htmlSanitizer);
      this.loaderBuilder = new LoaderBuilder(this.htmlSanitizer);
      this.confirmBuilder = new ConfirmBuilder(
        this.dialogBuilder,
        closeCallback,
        this.featureDetector,
        this.htmlSanitizer,
      );

      // Attach global listeners
      this._attachGlobalListeners();

      // Forward LayerManager events
      this._wireLayerEvents();

      // Forward Toast events
      this._wireToastEvents();

      this.initialized = true;
      this.performanceMonitor.measure('init');

      this.logger.log(`✨ Kernel initialized v${this.version}`);
    } catch (err) {
      this.logger.error('Init failed:', err);
      this.errorBoundary.handleError(err, { method: 'init' });
      throw err;
    }

    return this;
  }


  // ================================
  // Event wiring
  // ================================
  _wireLayerEvents() {
    if (!this.layerManager?.on) {
      this.logger.warn('LayerManager has no .on(); skip event bridge');
      return;
    }

    const map = DEFAULTS.EVENTS;
    this.layerManager.on(map.DIALOG_OPEN, (d) => this.emit(map.DIALOG_OPEN, d));
    this.layerManager.on(map.DIALOG_CLOSE, (d) => this.emit(map.DIALOG_CLOSE, d));
    this.layerManager.on(map.SHEET_OPEN, (d) => this.emit(map.SHEET_OPEN, d));
    this.layerManager.on(map.SHEET_CLOSE, (d) => this.emit(map.SHEET_CLOSE, d));

    if (map.CONFIRM_RESOLVE) {
      this.layerManager.on(map.CONFIRM_RESOLVE, (d) =>
        this.emit(map.CONFIRM_RESOLVE, d)
      );
    }
  }

  _wireToastEvents() {
    if (!this.toastManager?.on) {
      this.logger.warn('ToastManager has no .on(); skip toast event bridge');
      return;
    }
    const map = DEFAULTS.EVENTS;
    this.toastManager.on(map.TOAST_SHOW, (d) => this.emit(map.TOAST_SHOW, d));
    this.toastManager.on(map.TOAST_HIDE, (d) => this.emit(map.TOAST_HIDE, d));
  }


  // ================================
  // DOM listeners
  // ================================
  _attachGlobalListeners() {
    const doc = this.deps.document;
    if (!doc) return;

    if (this.config.closeOnEscape) {
      doc.addEventListener('keydown', this.boundHandlers.keyDown);
    }
  }

  _detachGlobalListeners() {
    const doc = this.deps.document;
    if (!doc) return;

    doc.removeEventListener('keydown', this.boundHandlers.keyDown);
  }


  // ================================
  // Event handlers
  // ================================
  _handleOverlayClick(e) {
    if (!this.overlayManager) return;
    if (e.target === this.overlayManager.getElement()) {
      this.close();
    }
  }

  _handleKeyDown(e) {
    const closeKey = this.config?.shortcuts?.closeKey ?? 'Escape';
    if (e.key === closeKey && this.layerManager?.hasActiveLayer()) {
      e.preventDefault();
      this.close();
    }
  }


  // ================================
  // Public API: Config
  // ================================
  setConfig(newConfig = {}) {
    const prevClose = this.config.closeOnEscape;

    this.config = {
      ...this.config,
      ...newConfig,
      shortcuts: {
        ...(this.config.shortcuts || {}),
        ...(newConfig.shortcuts || {}),
      },
    };

    this.logger.setDebug(this.config.debug);
    this.errorBoundary.setSafeMode(this.config.safeMode);

    // 更新後に listener を再構成
    if (this.initialized && prevClose !== this.config.closeOnEscape) {
      if (this.config.closeOnEscape) this._attachGlobalListeners();
      else this._detachGlobalListeners();
    }
    return this;
  }

  getConfig() {
    return {
      ...this.config,
      shortcuts: { ...(this.config.shortcuts || {}) },
    };
  }


  // ================================
  // Public API: Dialog
  // ================================
  dialog(options = {}) {
    return this.errorBoundary.wrap(() => {
      this.init();

      this.performanceMonitor.mark('dialog');
      const el = this.dialogBuilder.build(options);

      if (this.config.a11yChecks) this.a11yChecker.check(el);

      this.layerManager.open(el, {
        type: 'dialog',
        onOpen: options.onOpen,
        onClose: options.onClose,
        data: options.data || {},
      });

      this.performanceMonitor.measure('dialog');
      return this;
    })();
  }


  // ================================
  // Public API: Sheet
  // ================================
  sheet(options = {}) {
    return this.errorBoundary.wrap(() => {
      this.init();

      this.performanceMonitor.mark('sheet');
      const el = this.sheetBuilder.build(options);

      if (this.config.a11yChecks) this.a11yChecker.check(el);

      this.layerManager.open(el, {
        type: 'sheet',
        onOpen: options.onOpen,
        onClose: options.onClose,
        data: options.data || {},
      });

      this.performanceMonitor.measure('sheet');
      return this;
    })();
  }


  // ================================
  // Public API: Toast
  // ================================
  toast(message, type = 'info', duration = DEFAULTS.TOAST.DURATION) {
    return this.errorBoundary.wrap(() => {
      if (!this.toastManager) {
        this.toastManager = new ToastManager(
          this.logger,
          this.config,
          this.intersectionManager,
          this.stateManager,
        );
      }
      this.toastManager.show(message, type, duration);
      return this;
    })();
  }


  // ================================
  // Public API: Loader
  // ================================
  loader(show = true, text = '') {
    return this.errorBoundary.wrap(() => {
      this.init();

      if (show) {
        const el = this.loaderBuilder.build(text);
        this.layerManager.open(el, { type: 'dialog' });
        this.emit(DEFAULTS.EVENTS.LOADER_SHOW, { text });
      } else {
        this.close();
        this.emit(DEFAULTS.EVENTS.LOADER_HIDE, {});
      }

      return this;
    })();
  }


  // ================================
  // Public API: Confirm
  // ================================
  confirm(options = {}) {
    this.init();
    try {
      const { element, promise, cancel, controllerId } =
        this.confirmBuilder.build(options);

      this.layerManager.open(element, { type: 'dialog' });
      this._pendingConfirms.set(controllerId, { promise, cancel });

      promise.finally(() => this._pendingConfirms.delete(controllerId));

      return promise;
    } catch (err) {
      this.logger.error('Confirm failed:', err);
      this.errorBoundary.handleError(err, { method: 'confirm' });
      return Promise.reject(err);
    }
  }


  // ================================
  // Public API: Control
  // ================================
  close() {
    this.layerManager?.close();
    return this;
  }

  destroy() {
    this.logger.log('Destroying kernel...');

    try {
      this.close();

      this.toastManager?.clearAll?.();
      this.confirmBuilder?.cancelAll?.();
      this.overlayManager?.destroy?.();

      this.eventManager.clear();
      this.intersectionManager.clear();
      this.themeManager.destroy();
      this.pluginManager.clear();
      this.focusableCache.clear();
      this.performanceMonitor.clear();

      this._detachGlobalListeners();

      // flush pending state
      if (
        this.stateManager.scheduledUpdate &&
        this.featureDetector.isSupported('cancelIdleCallback')
      ) {
        cancelIdleCallback(this.stateManager.scheduledUpdate);
        this.stateManager.flushUpdates();
      }
      this.stateManager.clear();

      this.clear(); // EventEmitter

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
  // Public API: Status
  // ================================
  isInitialized() {
    return this.initialized;
  }

  hasActiveLayer() {
    return !!(this.layerManager?.hasActiveLayer && this.layerManager.hasActiveLayer());
  }

  getVersion() {
    return this.version;
  }

  getState() {
    return this.stateManager.getState();
  }

  getHistory() {
    return this.stateManager.getHistory();
  }


  // ================================
  // Public API: Utils
  // ================================
  clearToasts() {
    this.toastManager?.clearAll?.();
    return this;
  }

  checkSupport() {
    return this.featureDetector.getFeatures();
  }


  // ================================
  // Public API: Theme
  // ================================
  setTheme(th) {
    this.themeManager.setTheme(th);
    return this;
  }
  getTheme() {
    return this.themeManager.getTheme();
  }


  // ================================
  // Public API: Plugins
  // ================================
  use(plugin) {
    if (!this.config.enablePlugins) {
      this.logger.warn('Plugins disabled');
      return this;
    }
    this.pluginManager.register(plugin);
    return this;
  }

  unuse(name) {
    this.pluginManager.unregister(name);
    return this;
  }

  getPlugins() {
    return this.pluginManager.list();
  }


  // ================================
  // Public API: DevTools / Debug
  // ================================
  getErrors() {
    return this.errorBoundary.getErrors();
  }

  clearErrors() {
    this.errorBoundary.clearErrors();
    return this;
  }

  checkA11y(el) {
    if (!el && this.layerManager) {
      el = this.layerManager.getActiveLayer()?.element;
    }
    if (!el) {
      this.logger.warn('No element to check');
      return [];
    }
    return this.a11yChecker.check(el);
  }

  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  getMemoryInfo() {
    if (typeof performance === 'undefined' || !performance.memory) return null;

    const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = performance.memory;

    return {
      jsHeapSizeLimit,
      totalJSHeapSize,
      usedJSHeapSize,
      percentage: ((usedJSHeapSize / jsHeapSizeLimit) * 100).toFixed(2),
    };
  }

  exportSnapshot() {
    return {
      version: this.version,
      config: this.getConfig(),
      state: this.stateManager.getState(),
      history: this.stateManager.getHistory(),
      errors: this.errorBoundary.getErrors(),
      metrics: this.performanceMonitor.getMetrics(),
      features: this.featureDetector.getFeatures(),
      memory: this.getMemoryInfo(),
      timestamp: Date.now(),
    };
  }

  enableDevTools() {
    this.setConfig({ debug: true, performanceMonitoring: true });

    if (typeof window !== 'undefined') {
      window.__NYAMO_UI_DEVTOOLS__ = {
        kernel: this,
        snapshot: () => this.exportSnapshot(),
        inspect: () => console.table(this.exportSnapshot()),
      };
      this.logger.log('🔧 DevTools enabled');
    }

    return this;
  }
}


// ================================
// Singleton Export
// ================================

export const NyamoUI = new NyamoUIKernel();

if (typeof window !== 'undefined') {
  window.NyamoUI = NyamoUI;
}
