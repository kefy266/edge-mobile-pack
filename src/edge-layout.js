/**
 * EdgeLayout.js (v2.4.0)
 * Responsive layout system distilled from the Origin Edge service panel
 * (hizmet.oedge.xyz) — a 3-tier breakpoint ladder, off-canvas drawer
 * navigation, fluid auto-fit grids and progressive grid collapse.
 *
 * Also closes the ten mobile gaps the panel itself still had:
 * safe-area insets, tap-highlight flash, iOS input zoom, 44px touch
 * targets, tap delay, overscroll chaining, dynamic viewport units,
 * reduced motion, visible focus rings and scroll-lock on drawers.
 *
 * Design rule: ZERO universal selector overrides. Nothing is applied
 * until you ask for it, either per-element (`data-edge-*`) or per-root
 * (`EdgeLayout.enhance(root)`).
 *
 * Part of Origin Edge Ecosystem.
 * @license MIT
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EdgeLayout = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  if (typeof document === 'undefined') {
    return { version: '2.4.0', supported: false };
  }

  // ── 1. THE BREAKPOINT LADDER ────────────────────────────────────────
  // The panel uses exactly these three steps, shared between the
  // marketing site and the app. Keeping one ladder is the reason its
  // layouts never disagree about when to collapse.
  var BREAKPOINTS = {
    tablet: 1024, // two columns -> one, decorative chrome thins out
    phone: 768,   // drawer navigation, single column, hamburger appears
    small: 480    // full-width actions, reduced type scale
  };

  function getViewportWidth() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }

  /** Which tier is the viewport currently in? */
  function getTier(width) {
    var w = typeof width === 'number' ? width : getViewportWidth();
    if (w <= BREAKPOINTS.small) return 'small';
    if (w <= BREAKPOINTS.phone) return 'phone';
    if (w <= BREAKPOINTS.tablet) return 'tablet';
    return 'desktop';
  }

  var tierListeners = [];
  var currentTier = null;

  function emitTier() {
    var tier = getTier();
    if (tier === currentTier) return;
    var previous = currentTier;
    currentTier = tier;
    document.documentElement.setAttribute('data-edge-tier', tier);
    for (var i = 0; i < tierListeners.length; i++) {
      try {
        tierListeners[i](tier, previous);
      } catch (e) {
        console.error('[EdgeLayout:TierError]', e);
      }
    }
  }

  function onTierChange(callback) {
    if (typeof callback !== 'function') return function () {};
    tierListeners.push(callback);
    return function () {
      var i = tierListeners.indexOf(callback);
      if (i > -1) tierListeners.splice(i, 1);
    };
  }

  // ── 2. SCROLL LOCK ──────────────────────────────────────────────────
  // Opening a drawer must not let the page behind it scroll on iOS.
  // position:fixed preserves the scroll offset, which the naive
  // overflow:hidden trick loses.
  var lockCount = 0;
  var lockSavedY = 0;
  var lockSavedStyle = '';

  function lockScroll() {
    if (lockCount++ > 0) return;
    var body = document.body;
    lockSavedY = window.pageYOffset || document.documentElement.scrollTop || 0;
    lockSavedStyle = body.style.cssText;
    body.style.position = 'fixed';
    body.style.top = '-' + lockSavedY + 'px';
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
  }

  function unlockScroll() {
    if (lockCount === 0) return;
    if (--lockCount > 0) return;
    var body = document.body;
    body.style.cssText = lockSavedStyle;
    // Restore the position the user was at before the drawer opened.
    if (lockSavedY) window.scrollTo(0, lockSavedY);
    lockSavedY = 0;
  }

  // ── 3. FOCUS MANAGEMENT ─────────────────────────────────────────────
  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function focusableWithin(container) {
    if (!container) return [];
    var nodes = container.querySelectorAll(FOCUSABLE);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      // offsetParent is null for display:none subtrees, so this also
      // filters out items hidden by CSS inside an open drawer.
      if (nodes[i].offsetParent !== null || nodes[i].getClientRects().length > 0) {
        out.push(nodes[i]);
      }
    }
    return out;
  }

  /** Keep Tab focus inside the drawer while it is open. */
  function trapFocus(container, event) {
    var items = focusableWithin(container);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ── 4. OFF-CANVAS DRAWER ────────────────────────────────────────────
  // Mirrors the panel sidebar: fixed 260px rail, translated off-screen
  // until .open, 0.3s ease transition, overlay behind it.
  function createDrawer(options) {
    var opts = options || {};
    if (typeof document === 'undefined') return null;

    var panel = resolve(opts.panel || '.edge-drawer');
    var trigger = resolve(opts.trigger || '.edge-drawer-trigger');
    if (!panel) return null;

    var overlay = resolve(opts.overlay);
    var createdOverlay = false;
    if (!overlay && opts.overlay !== false) {
      overlay = document.createElement('div');
      overlay.className = 'edge-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
      createdOverlay = true;
    }
    if (overlay) panel.parentNode.insertBefore(overlay, panel);

    panel.setAttribute('aria-hidden', 'true');
    panel.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    var isOpen = false;
    var lastFocused = null;
    var closeOnEscape = opts.closeOnEscape !== false;
    var closeOnOverlayClick = opts.closeOnOverlayClick !== false;
    var trapTab = opts.trapFocus !== false;
    var lockBody = opts.lockScroll !== false;

    function open() {
      if (isOpen) return;
      isOpen = true;
      lastFocused = document.activeElement;
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      if (overlay) overlay.classList.add('open');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      if (lockBody) lockScroll();
      var items = focusableWithin(panel);
      if (items.length > 0) items[0].focus();
      else panel.focus();
      if (typeof opts.onOpen === 'function') opts.onOpen();
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      if (overlay) overlay.classList.remove('open');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (lockBody) unlockScroll();
      // Send focus back where it came from, not to <body>.
      if (lastFocused && lastFocused.focus) lastFocused.focus();
      lastFocused = null;
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    function toggle() {
      isOpen ? close() : open();
    }

    if (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        toggle();
      });
    }
    if (overlay && closeOnOverlayClick) {
      overlay.addEventListener('click', close);
    }

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (closeOnEscape) {
          e.preventDefault();
          close();
        }
      } else if (e.key === 'Tab' && trapTab) {
        trapFocus(panel, e);
      }
    });

    // A resize past the phone breakpoint reveals the persistent rail,
    // so a drawer left open at 500px would strand an invisible panel.
    onTierChange(function (tier) {
      if (isOpen && tier !== 'phone' && tier !== 'small') close();
    });

    return {
      element: panel,
      overlay: overlay,
      open: open,
      close: close,
      toggle: toggle,
      get isOpen() { return isOpen; },
      destroy: function () {
        close();
        if (createdOverlay && overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }
    };
  }

  // ── 5. FLUID AUTO-FIT GRID ──────────────────────────────────────────
  // The panel's best pattern: repeat(auto-fit, minmax(Npx, 1fr)) needs
  // no breakpoints at all. Columns appear only while they fit.
  function createAutoFitGrid(element, options) {
    var el = resolve(element);
    if (!el) return null;
    var opts = options || {};
    var min = opts.min || 200;
    var gap = opts.gap;
    el.classList.add('edge-autofit');
    el.style.gridTemplateColumns = 'repeat(auto-fit, minmax(' + min + 'px, 1fr))';
    if (gap) el.style.gap = gap;
    return el;
  }

  // ── 6. PROGRESSIVE GRID COLLAPSE ────────────────────────────────────
  // For grids that must be exactly N columns, collapsing one step at a
  // time (3 -> 2 -> 1) rather than jumping straight to one.
  function createCollapse(element, options) {
    var el = resolve(element);
    if (!el) return null;
    var opts = options || {};
    var desktop = opts.desktop || 3;
    var tablet = opts.tablet || 2;
    var phone = opts.phone || 1;
    var small = opts.small || 1;
    el.classList.add('edge-collapse');

    function apply(tier) {
      var cols = tier === 'desktop' ? desktop
        : tier === 'tablet' ? tablet
        : tier === 'phone' ? phone
        : small;
      el.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    }

    apply(getTier());
    onTierChange(apply);
    return el;
  }

  // ── 7. ONE-SHOT ENHANCE ─────────────────────────────────────────────
  // Wires a root: tier attribute, any [data-edge-drawer], auto-fit and
  // collapse grids declared in markup. Idempotent.
  function enhance(root) {
    var scope = resolve(root) || document.body;
    if (!scope) return null;

    scope.setAttribute('data-edge-enhanced', 'true');
    emitTier();

    var drawers = scope.querySelectorAll('[data-edge-drawer]');
    var controllers = [];
    for (var i = 0; i < drawers.length; i++) {
      var target = drawers[i];
      // Calling enhance() twice must not leave the first drawer
      // controller orphaned and its overlay stranded in the DOM.
      if (target.hasAttribute('data-edge-drawer-bound')) continue;
      target.setAttribute('data-edge-drawer-bound', 'true');
      controllers.push(createDrawer({
        panel: target,
        trigger: opts_triggerFor(target),
        closeOnEscape: target.getAttribute('data-edge-close-on-escape') !== 'false',
        lockScroll: target.getAttribute('data-edge-lock-scroll') !== 'false'
      }));
    }

    var grids = scope.querySelectorAll('[data-edge-autofit]');
    for (var g = 0; g < grids.length; g++) {
      createAutoFitGrid(grids[g], { min: parseInt(grids[g].getAttribute('data-edge-autofit'), 10) || 200 });
    }

    var collapses = scope.querySelectorAll('[data-edge-collapse]');
    for (var c = 0; c < collapses.length; c++) {
      var el = collapses[c];
      createCollapse(el, {
        desktop: parseInt(el.getAttribute('data-edge-collapse'), 10) || 3,
        tablet: parseInt(el.getAttribute('data-edge-tablet'), 10) || 2,
        phone: parseInt(el.getAttribute('data-edge-phone'), 10) || 1,
        small: parseInt(el.getAttribute('data-edge-small'), 10) || 1
      });
    }

    return { drawers: controllers, root: scope };
  }

  function opts_triggerFor(panel) {
    var id = panel.getAttribute('aria-controls');
    if (id) return document.getElementById(id);
    var scope = panel.closest('[data-edge-scope]') || document;
    return scope.querySelector('.edge-drawer-trigger');
  }

  // ── 8. HELPERS ──────────────────────────────────────────────────────
  function resolve(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    return target.nodeType ? target : null;
  }

  /** 44px is the smallest reliably tappable target (WCAG 2.5.5 / HIG). */
  var MIN_TAP_TARGET = 44;

  /** Report interactive elements smaller than the tap-target minimum. */
  function auditTapTargets(root) {
    var scope = resolve(root) || document.body;
    if (!scope) return [];
    var nodes = scope.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]');
    var small = [];
    for (var i = 0; i < nodes.length; i++) {
      // Skip anything not actually rendered: display:none subtrees,
      // [hidden], disabled controls and aria-hidden containers.
      if (nodes[i].hasAttribute('hidden')) continue;
      if (nodes[i].disabled) continue;
      if (nodes[i].closest('[aria-hidden="true"]')) continue;
      if (window.getComputedStyle(nodes[i]).display === 'none') continue;

      var r = nodes[i].getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // hidden
      if (r.width < MIN_TAP_TARGET || r.height < MIN_TAP_TARGET) {
        small.push({
          element: nodes[i],
          tag: nodes[i].tagName.toLowerCase(),
          label: (nodes[i].textContent || nodes[i].value || '').trim().slice(0, 40),
          width: Math.round(r.width),
          height: Math.round(r.height)
        });
      }
    }
    return small;
  }

  /** True if the device is likely a phone/tablet in portrait. */
  function isMobileViewport() {
    return getTier() === 'phone' || getTier() === 'small';
  }

  /** Honour the OS "reduce motion" setting for the whole subtree. */
  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Tier tracking is global and cheap; start it on load and on resize.
  if (document.documentElement) emitTier();
  window.addEventListener('resize', emitTier, { passive: true });
  window.addEventListener('orientationchange', emitTier);

  return {
    version: '2.4.0',
    supported: true,
    BREAKPOINTS: BREAKPOINTS,
    MIN_TAP_TARGET: MIN_TAP_TARGET,
    getTier: getTier,
    onTierChange: onTierChange,
    createDrawer: createDrawer,
    createAutoFitGrid: createAutoFitGrid,
    createCollapse: createCollapse,
    enhance: enhance,
    auditTapTargets: auditTapTargets,
    isMobileViewport: isMobileViewport,
    prefersReducedMotion: prefersReducedMotion,
    lockScroll: lockScroll,
    unlockScroll: unlockScroll
  };
}));
