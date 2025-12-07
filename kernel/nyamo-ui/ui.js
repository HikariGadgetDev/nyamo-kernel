// nyamo-ui/ui.js

/**
 * UI layer:
 * - FocusTrap
 * - OverlayManager
 * - LayerManager
 * - DialogBuilder
 * - SheetBuilder
 * - ToastManager
 * - LoaderBuilder
 * - ConfirmBuilder
 */

import {
  DEFAULTS,
  CLASSNAMES,
  Utils,
  EventEmitter,
  FeatureDetector,
} from './core.js';
import { StateManager, EventManager, FocusableCache } from './state.js';
import { IntersectionManager } from './infra.js';

// ================================
// Focus Trap
// ================================

/**
 * Focus trap implementation
 */
export class FocusTrap {
  /**
   * @param {HTMLElement} element
   * @param {FocusableCache} focusableCache
   */
  constructor(element, focusableCache) {
    this.element = element;
    this.focusableCache = focusableCache;
    this.previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  activate() {
    if (!this.element || typeof document === 'undefined') return;
    const focusable = this.focusableCache.get(this.element);
    if (focusable.length > 0 && typeof focusable[0].focus === 'function') {
      try {
        focusable[0].focus();
      } catch {
        // ignore
      }
    }
    this.element.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate() {
    if (!this.element) return;
    this.element.removeEventListener('keydown', this.handleKeyDown);
    this.focusableCache.unobserve(this.element);

    if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
      try {
        this.previousFocus.focus();
      } catch {
        // element may have disappeared
      }
    }
  }

  /**
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    if (e.key !== 'Tab') return;
    const focusable = this.focusableCache.get(this.element);
    if (focusable.length === 0) return;

    const firstFocusable = focusable[0];
    const lastFocusable = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  }
}

// ================================
// Overlay Manager
// ================================

/**
 * Overlay management
 */
export class OverlayManager {
  /**
   * @param {import('./core.js').KernelConfig} config
   * @param {(e: MouseEvent) => void} onOverlayClick
   * @param {EventManager} eventManager
   */
  constructor(config, onOverlayClick, eventManager) {
    this.config = config;
    this.onOverlayClick = onOverlayClick;
    this.eventManager = eventManager;
    this.overlay = null;
    this.clickHandlerId = null;
  }

  /**
   * @returns {HTMLElement}
   */
  create() {
    if (this.overlay) return this.overlay;
    if (!Utils.isDOMReady()) {
      throw new Error('DOM is not ready. Cannot create overlay.');
    }

    this.overlay = Utils.createElement('div', [CLASSNAMES.OVERLAY], {
      id: 'ny-overlay',
      role: 'presentation',
      'aria-hidden': 'true',
    });

    document.body.appendChild(this.overlay);
    return this.overlay;
  }

  show() {
    if (!this.overlay) return;
    if (typeof document === 'undefined') return;

    requestAnimationFrame(() => {
      this.overlay.classList.add(CLASSNAMES.VISIBLE);
      this.overlay.setAttribute('aria-hidden', 'false');

      if (this.config.closeOnOverlayClick) {
        this.clickHandlerId = this.eventManager.register(
          this.overlay,
          'click',
          this.onOverlayClick
        );
      }
    });

    document.body.classList.add(CLASSNAMES.NO_SCROLL);
  }

  hide() {
    if (!this.overlay) return;
    if (typeof document === 'undefined') return;

    this.overlay.classList.remove(CLASSNAMES.VISIBLE);
    this.overlay.setAttribute('aria-hidden', 'true');

    if (this.clickHandlerId) {
      this.eventManager.unregister(this.clickHandlerId);
      this.clickHandlerId = null;
    }

    document.body.classList.remove(CLASSNAMES.NO_SCROLL);
  }

  destroy() {
    if (typeof document !== 'undefined') {
      document.body.classList.remove(CLASSNAMES.NO_SCROLL);
    }

    if (this.overlay) {
      this.eventManager.unregisterAll(this.overlay);
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return /** @type {HTMLElement|null} */ (this.overlay);
  }
}

// ================================
// Layer Manager
// ================================

/**
 * @typedef {Object} Layer
 * @property {HTMLElement} element
 * @property {string} id
 * @property {Function} [onOpen]
 * @property {Function} [onClose]
 * @property {Record<string, any>} data
 * @property {'dialog'|'sheet'} type
 */

/**
 * Layer (modal/sheet) management
 */
export class LayerManager extends EventEmitter {
  /**
   * @param {OverlayManager} overlayManager
   * @param {import('./core.js').Logger} logger
   * @param {import('./core.js').KernelConfig} config
   * @param {EventManager} eventManager
   * @param {StateManager} stateManager
   * @param {FocusableCache} focusableCache
   */
  constructor(overlayManager, logger, config, eventManager, stateManager, focusableCache) {
    super();
    this.overlayManager = overlayManager;
    this.logger = logger;
    this.config = config;
    this.eventManager = eventManager;
    this.stateManager = stateManager;
    this.focusableCache = focusableCache;
    this.focusTrap = null;
  }

  /**
   * @param {HTMLElement} element
   * @param {{ onOpen?: Function; onClose?: Function; data?: any; type?: 'dialog'|'sheet'; }} [callbacks={}]
   */
  open(element, callbacks = {}) {
    this.logger.log('Opening layer:', element);
    this.close();

    const layer = /** @type {Layer} */ ({
      element,
      id: Utils.generateId(),
      onOpen: callbacks.onOpen,
      onClose: callbacks.onClose,
      data: callbacks.data || {},
      type: callbacks.type || 'dialog',
    });

    this.stateManager.setState({ activeLayer: layer });

    const overlayEl = this.overlayManager.getElement();
    if (!overlayEl) {
      this.logger.error('Overlay element not found');
      return;
    }

    overlayEl.appendChild(element);
    this.overlayManager.show();

    if (this.config.focusTrap) {
      this.focusTrap = new FocusTrap(element, this.focusableCache);
      this.focusTrap.activate();
    }

    Utils.safeExecute(layer.onOpen, null, element);

    const eventName =
      layer.type === 'sheet' ? DEFAULTS.EVENTS.SHEET_OPEN : DEFAULTS.EVENTS.DIALOG_OPEN;
    this.emit(eventName, layer);
  }

  close() {
    const layer = /** @type {Layer|null} */ (this.stateManager.getState().activeLayer);
    if (!layer) return;

    this.logger.log('Closing layer:', layer.element);
    if (this.focusTrap) {
      this.focusTrap.deactivate();
      this.focusTrap = null;
    }

    Utils.safeExecute(layer.onClose, null, layer.element);

    if (layer.element?.parentNode) {
      this.eventManager.unregisterAll(layer.element);
      layer.element.remove();
    }

    this.overlayManager.hide();
    this.stateManager.setState({ activeLayer: null });

    const eventName =
      layer.type === 'sheet' ? DEFAULTS.EVENTS.SHEET_CLOSE : DEFAULTS.EVENTS.DIALOG_CLOSE;
    this.emit(eventName, layer);
  }

  /**
   * @returns {boolean}
   */
  hasActiveLayer() {
    return this.stateManager.getState().activeLayer !== null;
  }

  /**
   * @returns {Layer|null}
   */
  getActiveLayer() {
    return /** @type {Layer|null} */ (this.stateManager.getState().activeLayer);
  }
}

// ================================
// Dialog Builder
// ================================

/**
 * Dialog element builder
 */
export class DialogBuilder {
  /**
   * @param {Function} closeCallback
   * @param {EventManager} eventManager
   */
  constructor(closeCallback, eventManager) {
    this.closeCallback = closeCallback;
    this.eventManager = eventManager;
  }

  /**
   * @param {import('./core.js').DialogOptions} [options={}]
   * @returns {HTMLElement}
   */
  build(options = {}) {
    const {
      title = '',
      content = '',
      size = DEFAULTS.DIALOG.DEFAULT_SIZE,
      footer = null,
      showClose = true,
      allowHTML = false,
    } = options;

    const validSize = Utils.validateEnum(
      size,
      DEFAULTS.DIALOG.SIZES,
      DEFAULTS.DIALOG.DEFAULT_SIZE
    );

    const dialogAttrs = /** @type {Record<string, string>} */ ({
      role: 'dialog',
      'aria-modal': 'true',
    });

    if (title) {
      dialogAttrs['aria-labelledby'] = 'ny-dialog-title';
    }

    const dialog = Utils.createElement(
      'div',
      [CLASSNAMES.DIALOG, `ny-size-${validSize}`],
      dialogAttrs
    );

    const header = this._buildHeader(title, showClose);
    dialog.appendChild(header);

    const body = this._buildBody(content, allowHTML);
    dialog.appendChild(body);

    if (footer) {
      const footerEl = this._buildFooter(footer, allowHTML);
      dialog.appendChild(footerEl);
    }

    return dialog;
  }

  /**
   * @private
   * @param {string} title
   * @param {boolean} showClose
   * @returns {HTMLElement}
   */
  _buildHeader(title, showClose) {
    const header = Utils.createElement('header', ['ny-dialog-header']);
    const titleEl = Utils.createElement('h2', [], { id: 'ny-dialog-title' });

    // 安全: タイトルは常に textContent
    titleEl.textContent = title;
    header.appendChild(titleEl);

    if (showClose) {
      const closeBtn = this._createCloseButton();
      header.appendChild(closeBtn);
    }

    return header;
  }

  /**
   * @private
   * @param {import('./core.js').ContentInput} content
   * @param {boolean} allowHTML
   * @returns {HTMLElement}
   */
  _buildBody(content, allowHTML) {
    const body = Utils.createElement('div', ['ny-dialog-body']);
    Utils.appendContent(body, content, allowHTML);
    return body;
  }

  /**
   * @private
   * @param {import('./core.js').ContentInput} footer
   * @param {boolean} allowHTML
   * @returns {HTMLElement}
   */
  _buildFooter(footer, allowHTML) {
    const footerEl = Utils.createElement('footer', ['ny-dialog-footer']);
    Utils.appendContent(footerEl, footer, allowHTML);
    return footerEl;
  }

  /**
   * @private
   * @returns {HTMLElement}
   */
  _createCloseButton() {
    const btn = Utils.createElement(
      'button',
      [CLASSNAMES.CLOSE_BTN],
      {
        type: 'button',
        'aria-label': 'Close',
      }
    );
    btn.innerHTML = '×';
    this.eventManager.register(btn, 'click', this.closeCallback);
    return btn;
  }
}

// ================================
// Sheet Builder
// ================================

/**
 * Sheet element builder
 */
export class SheetBuilder {
  /**
   * @param {import('./core.js').SheetOptions} [options={}]
   * @returns {HTMLElement}
   */
  build(options = {}) {
    const {
      content = '',
      from = DEFAULTS.SHEET.DEFAULT_DIRECTION,
      allowHTML = false,
    } = options;

    const validDirection = Utils.validateEnum(
      from,
      DEFAULTS.SHEET.DIRECTIONS,
      DEFAULTS.SHEET.DEFAULT_DIRECTION
    );

    const sheet = Utils.createElement(
      'div',
      [CLASSNAMES.SHEET, `ny-from-${validDirection}`],
      {
        role: 'dialog',
        'aria-modal': 'true',
      }
    );

    Utils.appendContent(sheet, content, allowHTML);
    return sheet;
  }
}

// ================================
// Toast Manager
// ================================

/**
 * Toast notification manager
 */
export class ToastManager extends EventEmitter {
  /**
   * @param {import('./core.js').Logger} logger
   * @param {import('./core.js').KernelConfig} config
   * @param {IntersectionManager} intersectionManager
   * @param {StateManager} stateManager
   */
  constructor(logger, config, intersectionManager, stateManager) {
    super();
    this.logger = logger;
    this.config = config;
    this.intersectionManager = intersectionManager;
    this.stateManager = stateManager;
    this.queue = [];
  }

  /**
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} [type='info']
   * @param {number} [duration]
   */
  show(message, type = 'info', duration = DEFAULTS.TOAST.DURATION) {
    const validType = Utils.validateEnum(type, DEFAULTS.TOAST.TYPES, 'info');
    const state = this.stateManager.getState();
    const toasts = state.toasts || [];

    if (toasts.length >= this.config.maxToasts) {
      this.queue.push({ message, type: validType, duration });
      return;
    }

    this._createToast(message, validType, duration);
  }

  /**
   * @private
   * @param {string} message
   * @param {string} type
   * @param {number} duration
   */
  _createToast(message, type, duration) {
    if (!Utils.isDOMReady()) {
      this.logger.warn('DOM not ready, cannot create toast');
      return;
    }

    const toast = Utils.createElement(
      'div',
      [CLASSNAMES.TOAST, `ny-toast-${type}`],
      {
        role: 'status',
        'aria-live': 'polite',
      }
    );

    // 安全: トーストは常に textContent
    toast.textContent = message;
    document.body.appendChild(toast);

    const state = this.stateManager.getState();
    const toasts = state.toasts || [];
    toasts.push(toast);
    this.stateManager.setState({ toasts });

    this.intersectionManager.observe(toast, (isVisible) => {
      toast.style.animationPlayState = isVisible ? 'running' : 'paused';
    });

    Utils.doubleRAF(() => {
      toast.classList.add(CLASSNAMES.VISIBLE);
    });

    this.emit(DEFAULTS.EVENTS.TOAST_SHOW, { message, type });

    setTimeout(() => {
      this._hideToast(toast);
    }, duration);
  }

  /**
   * @private
   * @param {HTMLElement} toast
   */
  _hideToast(toast) {
    toast.classList.remove(CLASSNAMES.VISIBLE);

    setTimeout(() => {
      this.intersectionManager.unobserve(toast);
      if (toast.parentNode) {
        toast.remove();
      }

      const state = this.stateManager.getState();
      const toasts = state.toasts || [];
      const index = toasts.indexOf(toast);
      if (index > -1) {
        toasts.splice(index, 1);
        this.stateManager.setState({ toasts });
      }

      this.emit(DEFAULTS.EVENTS.TOAST_HIDE, { toast });

      if (this.queue.length > 0) {
        const next = this.queue.shift();
        this._createToast(next.message, next.type, next.duration);
      }
    }, DEFAULTS.TOAST.HIDE_DELAY);
  }

  clearAll() {
    const state = this.stateManager.getState();
    const toasts = state.toasts || [];
    toasts.forEach((toast) => {
      this.intersectionManager.unobserve(toast);
      if (toast.parentNode) {
        toast.remove();
      }
    });
    this.stateManager.setState({ toasts: [] });
    this.queue = [];
  }
}

// ================================
// Loader Builder
// ================================

/**
 * Loader element builder
 */
export class LoaderBuilder {
  /**
   * @param {string} [text='']
   * @returns {HTMLElement}
   */
  build(text = '') {
    const loader = Utils.createElement(
      'div',
      [CLASSNAMES.LOADER],
      {
        role: 'status',
        'aria-label': text || 'Loading',
        'aria-live': 'polite',
      }
    );

    const spinner = Utils.createElement('div', [CLASSNAMES.SPINNER]);
    loader.appendChild(spinner);

    if (text) {
      const textEl = Utils.createElement('div', ['ny-loader-text']);
      textEl.textContent = text;
      loader.appendChild(textEl);
    }

    return loader;
  }
}

// ================================
// Confirm Builder
// ================================

/**
 * Confirm dialog builder
 */
export class ConfirmBuilder {
  /**
   * @param {DialogBuilder} dialogBuilder
   * @param {Function} closeCallback
   * @param {FeatureDetector} [featureDetector]
   */
  constructor(dialogBuilder, closeCallback, featureDetector = new FeatureDetector()) {
    this.dialogBuilder = dialogBuilder;
    this.closeCallback = closeCallback;
    this.featureDetector = featureDetector;
    this.abortControllers = new Map();
  }

  /**
   * @param {import('./core.js').ConfirmOptions} [options={}]
   * @returns {{ element: HTMLElement; promise: Promise<boolean>; cancel: Function; controllerId: string; }}
   */
  build(options = {}) {
    const {
      title = 'Confirm',
      message = 'Are you sure?',
      confirmText = 'OK',
      cancelText = 'Cancel',
      onConfirm,
      onCancel,
    } = options;

    let abortController = null;
    const controllerId = Utils.generateId();

    if (this.featureDetector.isSupported('abortController')) {
      abortController = new AbortController();
      this.abortControllers.set(controllerId, abortController);
    }

    /** @type {(v: boolean) => void} */
    let resolvePromise;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        resolvePromise(false);
        this.closeCallback();
      });
    }

    const content = document.createElement('div');
    const messageP = document.createElement('p');
    messageP.style.cssText = 'margin: 0; line-height: 1.6;';
    messageP.textContent = message;
    content.appendChild(messageP);

    const footer = this._buildFooter({
      confirmText,
      cancelText,
      onConfirm: () => {
        Utils.safeExecute(onConfirm);
        resolvePromise(true);
        this.abortControllers.delete(controllerId);
      },
      onCancel: () => {
        Utils.safeExecute(onCancel);
        resolvePromise(false);
        this.abortControllers.delete(controllerId);
      },
    });

    const element = this.dialogBuilder.build({
      title,
      content,
      footer,
      size: 'sm',
      showClose: false,
      allowHTML: false,
    });

    return {
      element,
      promise,
      cancel: abortController ? () => abortController.abort() : () => {},
      controllerId,
    };
  }

  /**
   * @private
   * @param {{ confirmText: string; cancelText: string; onConfirm: Function; onCancel: Function }} options
   * @returns {HTMLElement}
   */
  _buildFooter({ confirmText, cancelText, onConfirm, onCancel }) {
    const footer = document.createElement('div');

    const cancelBtn = this._createButton(cancelText, 'cancel');
    cancelBtn.onclick = () => {
      this.closeCallback();
      onCancel();
    };

    const confirmBtn = this._createButton(confirmText, 'confirm');
    confirmBtn.onclick = () => {
      this.closeCallback();
      onConfirm();
    };

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    return footer;
  }

  /**
   * @private
   * @param {string} text
   * @param {'confirm'|'cancel'} type
   * @returns {HTMLButtonElement}
   */
  _createButton(text, type) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.type = 'button';

    const baseStyle =
      'padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 0.95rem;';
    const confirmStyle =
      'border: none; background: #3b82f6; color: #fff; font-weight: 500;';
    const cancelStyle = 'border: 1px solid #ddd; background: #fff;';

    btn.style.cssText = `${baseStyle} ${type === 'confirm' ? confirmStyle : cancelStyle}`;

    btn.onmouseenter = () => {
      if (type === 'confirm') {
        btn.style.background = '#2563eb';
      } else {
        btn.style.background = '#f9fafb';
      }
    };

    btn.onmouseleave = () => {
      if (type === 'confirm') {
        btn.style.background = '#3b82f6';
      } else {
        btn.style.background = '#fff';
      }
    };

    return btn;
  }

  cancelAll() {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
  }
}
