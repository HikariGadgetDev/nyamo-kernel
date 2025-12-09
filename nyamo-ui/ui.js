// ================================
// Nyamo UI Kernel - ui.js
// UI Layer / Builders / Managers
// ================================

import {
  CLASSNAMES,
  DEFAULTS,
  Utils,
  FOCUSABLE_SELECTORS,
  EventEmitter,
} from './core.js';


// ================================
// OverlayManager
// ================================

export class OverlayManager {
  /**
   * @param {import('./core.js').KernelConfig} config
   * @param {(e: MouseEvent) => void} onClick
   * @param {any} eventBus
   */
  constructor(config, onClick, eventBus) {
    this.config = config;
    this.onClick = onClick;
    this.eventBus = eventBus;

    /** @type {HTMLElement | null} */
    this.el = null;
    this._boundClick = this._handleClick.bind(this);
  }

  create() {
    if (this.el || typeof document === 'undefined') return;

    this.el = Utils.createElement('div', CLASSNAMES.OVERLAY);
    this.el.addEventListener('click', this._boundClick);
    document.body.appendChild(this.el);
  }

  _handleClick(e) {
    if (typeof this.onClick === 'function') {
      this.onClick(e);
    }
  }

  getElement() {
    return this.el;
  }

  show() {
    if (!this.el) return;
    this.el.style.display = 'block';
    document.body.classList.add(CLASSNAMES.NO_SCROLL);
  }

  hide() {
    if (!this.el) return;
    this.el.style.display = 'none';
    document.body.classList.remove(CLASSNAMES.NO_SCROLL);
  }

  destroy() {
    if (!this.el) return;
    this.el.removeEventListener('click', this._boundClick);
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}


// ================================
// LayerManager
// ================================

export class LayerManager extends EventEmitter {
  /**
   * @param {OverlayManager} overlayManager
   * @param {import('./core.js').Logger} logger
   * @param {import('./core.js').KernelConfig} config
   * @param {any} eventBus
   * @param {any} stateManager
   * @param {any} focusableCache
   */
  constructor(overlayManager, logger, config, eventBus, stateManager, focusableCache) {
    super();
    this.overlayManager = overlayManager;
    this.logger = logger;
    this.config = config;
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    this.focusableCache = focusableCache;

    /** @type {{ element: HTMLElement; meta: any } | null} */
    this.activeLayer = null;
  }

  /**
   * @param {HTMLElement} element
   * @param {{ type?: 'dialog'|'sheet'|'loader'; onOpen?: Function; onClose?: Function; data?: any }} [meta={}]
   */
  open(element, meta = {}) {
    if (typeof document === 'undefined') return;

    // 既存レイヤーがあれば閉じる（P0 では単一レイヤーで十分）
    if (this.activeLayer) {
      this.close();
    }

    this.overlayManager.show();
    document.body.appendChild(element);
    this.activeLayer = { element, meta };

    // state 更新はざっくり
    if (this.stateManager && typeof this.stateManager.setState === 'function') {
      this.stateManager.setState({ activeLayerType: meta.type || null });
    }

    // フォーカス管理（最低限）
    this._focusFirst(element);

    // onOpen callback
    Utils.safeExecute(meta.onOpen, null, element, meta.data);

    // イベントブリッジ
    const t = meta.type;
    const E = DEFAULTS.EVENTS;
    if (t === 'dialog') {
      this.emit(E.DIALOG_OPEN, meta);
    } else if (t === 'sheet') {
      this.emit(E.SHEET_OPEN, meta);
    }

    return this;
  }

  close() {
    if (!this.activeLayer) return this;
    const { element, meta } = this.activeLayer;

    // DOM から削除
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }

    // overlay
    this.overlayManager.hide();

    // state
    if (this.stateManager && typeof this.stateManager.setState === 'function') {
      this.stateManager.setState({ activeLayerType: null });
    }

    // onClose callback
    Utils.safeExecute(meta.onClose, null);

    // イベントブリッジ
    const t = meta.type;
    const E = DEFAULTS.EVENTS;
    if (t === 'dialog') {
      this.emit(E.DIALOG_CLOSE, meta);
    } else if (t === 'sheet') {
      this.emit(E.SHEET_CLOSE, meta);
    }

    this.activeLayer = null;
    return this;
  }

  hasActiveLayer() {
    return !!this.activeLayer;
  }

  getActiveLayer() {
    return this.activeLayer;
  }

  _focusFirst(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const focusables = root.querySelectorAll(FOCUSABLE_SELECTORS);
    if (focusables && focusables.length > 0) {
      /** @type {HTMLElement} */ (focusables[0]).focus();
    }
  }
}


// ================================
// DialogBuilder
// ================================

export class DialogBuilder {
  /**
   * @param {Function} closeCallback
   * @param {any} eventBus
   * @param {import('./core.js').HTMLSanitizer} htmlSanitizer
   */
  constructor(closeCallback, eventBus, htmlSanitizer) {
    this.closeCallback = closeCallback;
    this.eventBus = eventBus;
    this.htmlSanitizer = htmlSanitizer;
  }

  /**
   * @param {{
   *   title?: string;
   *   content?: any;
   *   allowHTML?: boolean;
   *   onOpen?: Function;
   *   onClose?: Function;
   *   data?: any;
   * }} [options={}]
   * @returns {HTMLElement}
   */
  build(options = {}) {
    const { title = '', content = '', allowHTML = false } = options;

    const dialog = Utils.createElement('div', CLASSNAMES.DIALOG);

    // Header
    const header = Utils.createElement('div');
    const titleEl = Utils.createElement('h2', CLASSNAMES.DIALOG_TITLE, {
      text: title,
    });
    const closeBtn = Utils.createElement('button', CLASSNAMES.CLOSE_BTN, {
      type: 'button',
      'aria-label': 'Close dialog',
    });

    closeBtn.addEventListener('click', () => {
      if (typeof this.closeCallback === 'function') {
        this.closeCallback();
      }
      Utils.safeExecute(options.onClose, null);
    });

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Body
    const body = Utils.createElement('div', CLASSNAMES.DIALOG_BODY);
    Utils.appendContent(body, content, !!allowHTML, this.htmlSanitizer);

    dialog.appendChild(header);
    dialog.appendChild(body);

    return dialog;
  }
}


// ================================
// SheetBuilder
// ================================

export class SheetBuilder {
  /**
   * @param {import('./core.js').HTMLSanitizer} htmlSanitizer
   */
  constructor(htmlSanitizer) {
    this.htmlSanitizer = htmlSanitizer;
  }

  /**
   * @param {{
   *   content?: any;
   *   allowHTML?: boolean;
   *   from?: 'left'|'right'|'bottom';
   * }} [options={}]
   * @returns {HTMLElement}
   */
  build(options = {}) {
    const { content = '', allowHTML = false } = options;
    const from = Utils.validateEnum(
      options.from,
      DEFAULTS.SHEET.DIRECTIONS,
      DEFAULTS.SHEET.DEFAULT_DIRECTION,
    );

    /** @type {string[]} */
    const classes = [CLASSNAMES.SHEET];
    if (from === 'right') {
      classes.push(CLASSNAMES.SHEET_FROM_RIGHT);
    } else if (from === 'left') {
      classes.push(CLASSNAMES.SHEET_FROM_LEFT);
    } else if (from === 'bottom') {
      classes.push(CLASSNAMES.SHEET_FROM_BOTTOM);
    }

    const sheet = Utils.createElement('div', classes);
    Utils.appendContent(sheet, content, !!allowHTML, this.htmlSanitizer);
    return sheet;
  }
}


// ================================
// ToastManager
// ================================

export class ToastManager extends EventEmitter {
  /**
   * @param {import('./core.js').Logger} logger
   * @param {import('./core.js').KernelConfig} config
   * @param {any} intersectionManager
   * @param {any} stateManager
   */
  constructor(logger, config, intersectionManager, stateManager) {
    super();
    this.logger = logger;
    this.config = config;
    this.intersectionManager = intersectionManager;
    this.stateManager = stateManager;

    /** @type {HTMLElement | null} */
    this.container = null;
    /** @type {Set<number>} */
    this._timers = new Set();
  }

  _ensureContainer() {
    if (this.container || typeof document === 'undefined') return;
    this.container = Utils.createElement('div', CLASSNAMES.TOAST_CONTAINER);
    document.body.appendChild(this.container);
  }

  /**
   * @param {string} message
   * @param {string} type
   * @param {number} duration
   */
  show(message, type = 'info', duration = DEFAULTS.TOAST.DURATION) {
    this._ensureContainer();
    if (!this.container) return;

    const toast = Utils.createElement('div', CLASSNAMES.TOAST);
    toast.textContent = String(message);

    // type クラス（最低限 success / error だけ付ける）
    if (type === 'success') {
      toast.classList.add(CLASSNAMES.TOAST_SUCCESS);
    } else if (type === 'error') {
      toast.classList.add(CLASSNAMES.TOAST_ERROR);
    }

    this.container.appendChild(toast);

    // maxToasts を強制（P0: デフォルト 2）
    const max =
      typeof this.config.maxToasts === 'number'
        ? this.config.maxToasts
        : DEFAULTS.TOAST.MAX_VISIBLE;

    while (this.container.children.length > max) {
      const first = this.container.firstElementChild;
      if (first) {
        this.container.removeChild(first);
      } else {
        break;
      }
    }

    // 自動クローズ
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, duration);
    this._timers.add(timer);

    this.emit(DEFAULTS.EVENTS.TOAST_SHOW, { message, type });
  }

  clearAll() {
    if (!this.container) return;
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    for (const t of this._timers) {
      clearTimeout(t);
    }
    this._timers.clear();
  }
}


// ================================
// LoaderBuilder
// ================================

export class LoaderBuilder {
  /**
   * @param {import('./core.js').HTMLSanitizer} htmlSanitizer
   */
  constructor(htmlSanitizer) {
    this.htmlSanitizer = htmlSanitizer;
  }

  /**
   * @param {string} [text='']
   * @returns {HTMLElement}
   */
  build(text = '') {
    const root = Utils.createElement('div', CLASSNAMES.LOADER);
    const spinner = Utils.createElement('div', CLASSNAMES.SPINNER);
    root.appendChild(spinner);

    if (text) {
      const label = Utils.createElement('div', null, { text });
      root.appendChild(label);
    }

    return root;
  }
}


// ================================
// ConfirmBuilder
// ================================

export class ConfirmBuilder {
  /**
   * @param {DialogBuilder} dialogBuilder
   * @param {Function} closeCallback
   * @param {any} featureDetector
   * @param {import('./core.js').HTMLSanitizer} htmlSanitizer
   */
  constructor(dialogBuilder, closeCallback, featureDetector, htmlSanitizer) {
    this.dialogBuilder = dialogBuilder;
    this.closeCallback = closeCallback;
    this.featureDetector = featureDetector;
    this.htmlSanitizer = htmlSanitizer;
  }

  /**
   * @param {{
   *   title?: string;
   *   content?: any;
   *   allowHTML?: boolean;
   *   okLabel?: string;
   *   cancelLabel?: string;
   * }} [options={}]
   */
  build(options = {}) {
    const {
      title = '',
      content = '',
      allowHTML = false,
      okLabel = 'OK',
      cancelLabel = 'Cancel',
    } = options;

    // ベース dialog を作る
    const dialog = this.dialogBuilder.build({
      title,
      content,
      allowHTML,
    });

    // フッターにボタンを足す
    const footer = Utils.createElement('div');
    const okBtn = Utils.createElement('button', null, {
      type: 'button',
      text: okLabel,
    });
    const cancelBtn = Utils.createElement('button', null, {
      type: 'button',
      text: cancelLabel,
    });

    footer.appendChild(okBtn);
    footer.appendChild(cancelBtn);
    dialog.appendChild(footer);

    let settled = false;
    let resolveFn;
    let rejectFn;

    const promise = new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const controllerId = Utils.generateId();

    const closeAll = () => {
      if (typeof this.closeCallback === 'function') {
        this.closeCallback();
      }
    };

    okBtn.addEventListener('click', () => {
      if (settled) return;
      settled = true;
      resolveFn(true);
      closeAll();
    });

    cancelBtn.addEventListener('click', () => {
      if (settled) return;
      settled = true;
      resolveFn(false);
      closeAll();
    });

    const cancel = () => {
      if (settled) return;
      settled = true;
      rejectFn(new Error('Confirm cancelled'));
      closeAll();
    };

    return {
      element: dialog,
      promise,
      cancel,
      controllerId,
    };
  }

  cancelAll() {
    // v3.4 の P0 では特に管理不要。必要ならここでグローバル cancel を管理する
  }
}
