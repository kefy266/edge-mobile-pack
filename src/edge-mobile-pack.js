/**
 * EdgeMobilePack.js (v2.4.0)
 * All-In-One Mobile Compatibility, Responsive Layout & Offline-First
 * Suite for Modern Web Apps.
 *
 * Bundles:
 * - EdgeOffline: IndexedDB Outbox, Action Queue, Auto Replay, Status Monitor
 * - EdgeMobile: Touch Gestures, Viewport Keyboard Fix, Pull-To-Refresh, Bottom Dock
 * - EdgeTurn: Low-Latency Multi-STUN/TURN WebRTC Accelerator
 * - EdgeLayout: Breakpoint Ladder, Off-Canvas Drawer & Fluid Grids
 *
 * @license MIT
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./edge-offline', './edge-mobile', './edge-turn-accelerator', './edge-layout'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./edge-offline'),
      require('./edge-mobile'),
      require('./edge-turn-accelerator'),
      require('./edge-layout')
    );
  } else {
    root.EdgeMobilePack = factory(root.EdgeOffline, root.EdgeMobile, root.EdgeTurn, root.EdgeLayout);
  }
}(typeof self !== 'undefined' ? self : this, function (EdgeOffline, EdgeMobile, EdgeTurn, EdgeLayout) {
  'use strict';

  // Fallback to global objects if loaded sequentially via script tags
  const Offline = EdgeOffline || (typeof window !== 'undefined' ? window.EdgeOffline : null);
  const Mobile = EdgeMobile || (typeof window !== 'undefined' ? window.EdgeMobile : null);
  const Turn = EdgeTurn || (typeof window !== 'undefined' ? window.EdgeTurn : null);
  const Layout = EdgeLayout || (typeof window !== 'undefined' ? window.EdgeLayout : null);

  return {
    version: '2.4.0',
    Offline: Offline,
    Mobile: Mobile,
    Turn: Turn,
    Layout: Layout,
    init: function (config = {}) {
      if (Layout) {
        if (config.layout !== false) {
          Layout.enhance(config.layoutRoot || document.body);
        }
        if (config.drawer) {
          Layout.createDrawer(config.drawer);
        }
      }
      if (Mobile) {
        if (config.enablePullToRefresh) {
          Mobile.enablePullToRefresh(config.pullToRefreshContainer || document.body, config.onRefresh || function(){ location.reload(); });
        }
        if (config.bottomDockItems && config.bottomDockItems.length > 0) {
          Mobile.createDock(config.bottomDockItems, config.dockOptions || {});
        }
      }
      console.log('🚀 [EdgeMobilePack v2.4.0] Initialized with Layout, Offline & Touch Engine');
      return this;
    }
  };
}));
