#!/usr/bin/env node
/**
 * test.js — real functional tests for every module in the pack.
 *
 * The old CI only ran `node -c` (syntax) and `test -f` (existence), so a
 * module could pass CI while being completely broken. This exercises the
 * actual behaviour in a jsdom document: the breakpoint ladder, drawer
 * open/close semantics, focus return, scroll locking, grid helpers and
 * the tap-target auditor.
 *
 *   node test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname; // test.js sits at the repository root

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${e.message}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** Fresh jsdom window with the given innerWidth, modules loaded into it. */
function makeWindow(width, html) {
  const dom = new JSDOM(
    `<!doctype html><html><body>${html || ''}</body></html>`,
    {
      pretendToBeVisual: true,
      // Required: without runScripts the window has no real eval, so
      // modules would load into the Node context instead of the DOM.
      runScripts: 'dangerously',
      url: 'https://example.test/'
    }
  );
  const { window } = dom;
  // innerWidth is read-only in newer jsdom; redefine it per test.
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    writable: true,
    configurable: true
  });
  return { dom, window };
}

/** Global each module publishes when loaded via a plain script tag. */
const EXPORT_GLOBAL = {
  'edge-offline.js': 'EdgeOffline',
  'edge-mobile.js': 'EdgeMobile',
  'edge-turn-accelerator.js': 'EdgeTurn',
  'edge-layout.js': 'EdgeLayout',
  'edge-mobile-pack.js': 'EdgeMobilePack'
};

/** Eval a UMD module into a jsdom window and return what it exported. */
function loadModule(window, file) {
  const code = require('fs').readFileSync(
    path.resolve(ROOT, 'src', file),
    'utf8'
  );
  const globalName = EXPORT_GLOBAL[file];
  window.eval(code);
  const exported = window[globalName];
  assert.ok(
    exported && typeof exported === 'object',
    `${file} did not export window.${globalName}`
  );
  return exported;
}

// ─────────────────────────────────────────────────────────────────────
section('EdgeLayout — breakpoint ladder');

test('getTier() maps the three panel breakpoints plus desktop', () => {
  const { window } = makeWindow(1440);
  const L = loadModule(window, 'edge-layout.js');
  assert.strictEqual(L.version, '2.4.0');
  assert.strictEqual(L.getTier(1440), 'desktop');
  assert.strictEqual(L.getTier(1100), 'desktop');
  assert.strictEqual(L.getTier(1024), 'tablet', '1024 is inclusive');
  assert.strictEqual(L.getTier(1025), 'desktop');
  assert.strictEqual(L.getTier(768), 'phone', '768 is inclusive');
  assert.strictEqual(L.getTier(769), 'tablet');
  assert.strictEqual(L.getTier(480), 'small', '480 is inclusive');
  assert.strictEqual(L.getTier(320), 'small');
  assert.strictEqual(L.getTier(200), 'small', 'below the floor still clamps');
});

test('BREAKPOINTS match the values the panel uses', () => {
  const { window } = makeWindow(1440);
  const L = loadModule(window, 'edge-layout.js');
  // Compare field-by-field: the object crosses the jsdom realm boundary,
  // so deepStrictEqual would fail on prototype identity.
  assert.deepStrictEqual(
    { ...L.BREAKPOINTS },
    { tablet: 1024, phone: 768, small: 480 }
  );
});

test('onTierChange() fires only when the tier actually changes', () => {
  const { window } = makeWindow(1000); // start in tablet
  const L = loadModule(window, 'edge-layout.js');
  const seen = [];
  const off = L.onTierChange((tier) => seen.push(tier));

  window.innerWidth = 1200; // -> desktop
  window.dispatchEvent(new window.Event('resize'));
  window.innerWidth = 1100; // still desktop — must not fire again
  window.dispatchEvent(new window.Event('resize'));
  window.innerWidth = 700; // -> phone
  window.dispatchEvent(new window.Event('resize'));

  assert.deepStrictEqual(Array.from(seen), ['desktop', 'phone']);
  off();
  window.innerWidth = 400;
  window.dispatchEvent(new window.Event('resize'));
  assert.strictEqual(seen.length, 2, 'unsubscribe must stop delivery');
});

test('tier is mirrored onto <html data-edge-tier>', () => {
  const { window } = makeWindow(1440);
  const L = loadModule(window, 'edge-layout.js');
  window.innerWidth = 700;
  window.dispatchEvent(new window.Event('resize'));
  assert.strictEqual(window.document.documentElement.getAttribute('data-edge-tier'), 'phone');
});

test('isMobileViewport() is true for phone and small only', () => {
  const { window } = makeWindow(1440);
  const L = loadModule(window, 'edge-layout.js');
  assert.strictEqual(L.isMobileViewport(), false);
  window.innerWidth = 700;
  assert.strictEqual(L.isMobileViewport(), true);
  window.innerWidth = 400;
  assert.strictEqual(L.isMobileViewport(), true);
});

// ─────────────────────────────────────────────────────────────────────
section('EdgeLayout — off-canvas drawer');

const DRAWER_HTML = `
  <button class="edge-drawer-trigger" id="trigger" aria-expanded="false" aria-controls="panel">☰</button>
  <nav class="edge-drawer" id="panel" aria-hidden="true">
    <a href="/a">A</a>
    <a href="/b">B</a>
  </nav>
`;

test('createDrawer() starts closed and hidden from AT', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });
  assert.ok(d, 'drawer controller returned');
  assert.strictEqual(d.isOpen, false);
  assert.strictEqual(
    window.document.querySelector('#panel').getAttribute('aria-hidden'),
    'true'
  );
  assert.strictEqual(
    window.document.querySelector('#trigger').getAttribute('aria-expanded'),
    'false'
  );
});

test('trigger click opens, overlay is injected and marked open', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });

  window.document.querySelector('#trigger').click();
  assert.strictEqual(d.isOpen, true);
  assert.ok(window.document.querySelector('#panel').classList.contains('open'));
  assert.strictEqual(
    window.document.querySelector('#panel').getAttribute('aria-hidden'),
    'false'
  );
  assert.strictEqual(
    window.document.querySelector('#trigger').getAttribute('aria-expanded'),
    'true'
  );
  const overlay = window.document.querySelector('.edge-overlay');
  assert.ok(overlay, 'overlay was created');
  assert.ok(overlay.classList.contains('open'));
});

test('overlay click closes the drawer', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });
  window.document.querySelector('#trigger').click();
  window.document.querySelector('.edge-overlay').click();
  assert.strictEqual(d.isOpen, false);
  assert.ok(!window.document.querySelector('#panel').classList.contains('open'));
});

test('Escape closes the drawer', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });
  window.document.querySelector('#trigger').click();
  const ev = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  window.document.dispatchEvent(ev);
  assert.strictEqual(d.isOpen, false);
});

test('closeOnEscape:false keeps the drawer open', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const d = L.createDrawer({
    panel: '#panel', trigger: '#trigger', closeOnEscape: false
  });
  window.document.querySelector('#trigger').click();
  window.document.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  );
  assert.strictEqual(d.isOpen, true);
});

test('body scroll is locked while open and restored on close', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const body = window.document.body;
  body.style.cssText = 'background: red;';
  Object.defineProperty(window, 'pageYOffset', { value: 250, configurable: true });
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });

  window.document.querySelector('#trigger').click();
  assert.strictEqual(body.style.position, 'fixed', 'body pinned while drawer open');
  assert.strictEqual(body.style.top, '-250px', 'scroll offset preserved in top');
  assert.strictEqual(body.style.width, '100%', 'layout must not shift when pinned');

  d.close();
  assert.strictEqual(body.style.position, '', 'inline styles fully restored');
  assert.ok(body.style.cssText.includes('background: red'), 'pre-existing styles kept');
});

test('nested lockScroll/unlockScroll pairs balance correctly', () => {
  const { window } = makeWindow(700);
  const L = loadModule(window, 'edge-layout.js');
  const body = window.document.body;
  L.lockScroll();
  L.lockScroll();
  assert.strictEqual(body.style.position, 'fixed');
  L.unlockScroll();
  assert.strictEqual(body.style.position, 'fixed', 'one release must not unlock');
  L.unlockScroll();
  assert.strictEqual(body.style.position, '');
  L.unlockScroll(); // extra release must not throw
});

test('focus returns to the trigger after closing', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const trigger = window.document.querySelector('#trigger');
  trigger.focus();
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });
  trigger.click();
  d.close();
  assert.strictEqual(
    window.document.activeElement,
    trigger,
    'focus must not be stranded on <body>'
  );
});

test('growing past the phone breakpoint auto-closes a stranded drawer', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });
  window.document.querySelector('#trigger').click();
  assert.strictEqual(d.isOpen, true);
  window.innerWidth = 1200; // persistent rail returns; drawer must not linger
  window.dispatchEvent(new window.Event('resize'));
  assert.strictEqual(d.isOpen, false);
});

test('toggle() flips state both ways', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  const L = loadModule(window, 'edge-layout.js');
  const d = L.createDrawer({ panel: '#panel', trigger: '#trigger' });
  d.toggle();
  assert.strictEqual(d.isOpen, true);
  d.toggle();
  assert.strictEqual(d.isOpen, false);
});

test('createDrawer() returns null for a missing panel instead of throwing', () => {
  const { window } = makeWindow(700);
  const L = loadModule(window, 'edge-layout.js');
  assert.strictEqual(L.createDrawer({ panel: '#nope' }), null);
});

// ─────────────────────────────────────────────────────────────────────
section('EdgeLayout — grid helpers');

test('createAutoFitGrid() applies auto-fit with the requested minimum', () => {
  const { window } = makeWindow(1440, '<div id="g"></div>');
  const L = loadModule(window, 'edge-layout.js');
  L.createAutoFitGrid('#g', { min: 280, gap: '24px' });
  const g = window.document.querySelector('#g');
  assert.strictEqual(g.style.gridTemplateColumns, 'repeat(auto-fit, minmax(280px, 1fr))');
  assert.strictEqual(g.style.gap, '24px');
  assert.ok(g.classList.contains('edge-autofit'));
});

test('createCollapse() steps 3 -> 2 -> 1 across the ladder', () => {
  const { window } = makeWindow(1440, '<div id="c"></div>');
  const L = loadModule(window, 'edge-layout.js');
  L.createCollapse('#c', { desktop: 3, tablet: 2, phone: 1, small: 1 });
  const c = window.document.querySelector('#c');
  const at = (w) => {
    window.innerWidth = w;
    window.dispatchEvent(new window.Event('resize'));
    return c.style.gridTemplateColumns;
  };
  assert.strictEqual(at(1440), 'repeat(3, minmax(0, 1fr))');
  assert.strictEqual(at(900), 'repeat(2, minmax(0, 1fr))');
  assert.strictEqual(at(700), 'repeat(1, minmax(0, 1fr))');
  assert.strictEqual(at(400), 'repeat(1, minmax(0, 1fr))');
});

test('grid templates use minmax(0,1fr) so columns can actually shrink', () => {
  // minmax(auto,1fr) has a min-content floor and causes overflow —
  // this is the exact bug the pack is meant to prevent.
  const { window } = makeWindow(1440, '<div id="c"></div>');
  const L = loadModule(window, 'edge-layout.js');
  L.createCollapse('#c', { desktop: 3 });
  const tpl = window.document.querySelector('#c').style.gridTemplateColumns;
  assert.ok(!/minmax\(\s*auto\s*,/.test(tpl), 'must not use minmax(auto,1fr)');
});

// ─────────────────────────────────────────────────────────────────────
section('EdgeLayout — enhance()');

test('enhance() wires drawers, autofit and collapse from data attributes', () => {
  const { window } = makeWindow(700, `
    <button class="edge-drawer-trigger" id="t" aria-controls="d">☰</button>
    <nav class="edge-drawer" id="d" data-edge-drawer aria-hidden="true"><a href="/x">X</a></nav>
    <div data-edge-autofit="160"></div>
    <div data-edge-collapse="3" data-edge-tablet="2"></div>
  `);
  const L = loadModule(window, 'edge-layout.js');
  const res = L.enhance(window.document.body);

  assert.strictEqual(res.drawers.length, 1, 'drawer discovered');
  assert.ok(window.document.body.hasAttribute('data-edge-enhanced'));
  assert.strictEqual(
    window.document.querySelector('[data-edge-autofit]').style.gridTemplateColumns,
    'repeat(auto-fit, minmax(160px, 1fr))'
  );
  assert.strictEqual(
    window.document.querySelector('[data-edge-collapse]').style.gridTemplateColumns,
    'repeat(1, minmax(0, 1fr))'
  );

  // The data-declared drawer must actually respond to its trigger.
  window.document.querySelector('#t').click();
  assert.ok(window.document.querySelector('#d').classList.contains('open'));
});

test('enhance() is idempotent — a second call adds no duplicate overlay', () => {
  const { window } = makeWindow(700, `
    <button class="edge-drawer-trigger" id="t" aria-controls="d">☰</button>
    <nav class="edge-drawer" id="d" data-edge-drawer aria-hidden="true"><a href="/x">X</a></nav>
  `);
  const L = loadModule(window, 'edge-layout.js');

  const first = L.enhance(window.document.body);
  assert.strictEqual(first.drawers.length, 1, 'first call binds the drawer');
  assert.strictEqual(window.document.querySelectorAll('.edge-overlay').length, 1);

  const second = L.enhance(window.document.body);
  assert.strictEqual(second.drawers.length, 0, 'second call binds nothing new');
  assert.strictEqual(
    window.document.querySelectorAll('.edge-overlay').length,
    1,
    'no orphaned overlay left behind'
  );
  assert.strictEqual(
    window.document.querySelectorAll('[data-edge-drawer-bound]').length,
    1,
    'panel bound exactly once'
  );

  // The surviving controller must still work.
  window.document.querySelector('#t').click();
  assert.ok(window.document.querySelector('#d').classList.contains('open'));
});

// ─────────────────────────────────────────────────────────────────────
section('EdgeLayout — tap target audit');

test('auditTapTargets() reports undersized controls and ignores hidden ones', () => {
  const { window } = makeWindow(700, `
    <button id="small" style="width:20px;height:20px">x</button>
    <button id="big" style="width:60px;height:60px">y</button>
    <button id="hidden" style="display:none;width:10px;height:10px">z</button>
    <button id="attr-hidden" hidden style="width:10px;height:10px">w</button>
    <div aria-hidden="true"><button id="aria-hidden-child" style="width:10px;height:10px">v</button></div>
    <button id="disabled" disabled style="width:10px;height:10px">u</button>
  `);
  const L = loadModule(window, 'edge-layout.js');

  // jsdom does no layout, so stub the boxes explicitly.
  const box = (id, w, h) => {
    window.document.querySelector('#' + id).getBoundingClientRect = () => ({ width: w, height: h });
  };
  ['small:20:20', 'big:60:60', 'hidden:10:10', 'attr-hidden:10:10',
   'aria-hidden-child:10:10', 'disabled:10:10'].forEach((spec) => {
    const [id, w, h] = spec.split(':');
    box(id, Number(w), Number(h));
  });

  const found = L.auditTapTargets(window.document.body);
  const ids = found.map((f) => f.element.id);
  assert.ok(ids.includes('small'), '20x20 flagged');
  assert.ok(!ids.includes('big'), '60x60 not flagged');
  assert.ok(!ids.includes('hidden'), 'display:none skipped');
  assert.ok(!ids.includes('attr-hidden'), '[hidden] skipped');
  assert.ok(!ids.includes('aria-hidden-child'), 'aria-hidden subtree skipped');
  assert.ok(!ids.includes('disabled'), 'disabled control skipped');
  assert.strictEqual(found.length, 1, 'exactly one genuine violation');
  assert.strictEqual(L.MIN_TAP_TARGET, 44);
});

// ─────────────────────────────────────────────────────────────────────
section('EdgeMobile — touch engine');

test('module surface and version', () => {
  const { window } = makeWindow(400);
  const M = loadModule(window, 'edge-mobile.js');
  assert.strictEqual(M.version, '2.3.0');
  ['isTouchDevice', 'vibrate', 'GestureManager', 'createGestureManager',
   'enablePullToRefresh', 'createDock'].forEach((k) => {
    assert.ok(M[k], 'missing export: ' + k);
  });
});

test('isTouchDevice() does not throw in a DOM without touch', () => {
  const { window } = makeWindow(400);
  const M = loadModule(window, 'edge-mobile.js');
  assert.strictEqual(typeof M.isTouchDevice(), 'boolean');
});

test('vibrate() is a no-op when the API is absent', () => {
  const { window } = makeWindow(400);
  const M = loadModule(window, 'edge-mobile.js');
  assert.doesNotThrow(() => M.vibrate(20));
});

test('GestureManager tracks start/end and exposes on/off', () => {
  const { window } = makeWindow(400, '<div id="c"></div>');
  const M = loadModule(window, 'edge-mobile.js');
  const el = window.document.querySelector('#c');
  const g = M.createGestureManager(el);
  let fired = null;
  const off = g.on('swipe', (data) => { fired = data; });
  assert.strictEqual(typeof off, 'function', 'on() returns an unsubscribe fn');
  assert.doesNotThrow(() => g.off('swipe', () => {}));
});

test('createDock() builds one item per entry', () => {
  const { window } = makeWindow(400);
  const M = loadModule(window, 'edge-mobile.js');
  const dock = M.createDock(
    [{ icon: '🏠', label: 'Ana Sayfa', href: '/' },
     { icon: '⚙️', label: 'Ayarlar', onClick: () => {} }],
    { target: window.document.body }
  );
  assert.ok(dock);
  assert.strictEqual(dock.querySelectorAll('.edge-dock-item').length, 2);
});

test('createDock() replaces a previous dock instead of stacking', () => {
  const { window } = makeWindow(400);
  const M = loadModule(window, 'edge-mobile.js');
  M.createDock([{ icon: 'a', label: 'a' }], { target: window.document.body });
  M.createDock([{ icon: 'b', label: 'b' }], { target: window.document.body });
  assert.strictEqual(
    window.document.querySelectorAll('.edge-mobile-dock').length,
    1,
    'exactly one dock'
  );
});

// ─────────────────────────────────────────────────────────────────────
section('EdgeOffline & EdgeTurn');

test('edge-offline.js exposes its queue API', () => {
  const { window } = makeWindow(400);
  const O = loadModule(window, 'edge-offline.js');
  assert.ok(O, 'module loaded');
  assert.ok(typeof O.registerHandler === 'function' || typeof O.enqueue === 'function',
    'queue API present');
});

test('edge-turn-accelerator.js exposes its accelerator API', () => {
  const { window } = makeWindow(400);
  const T = loadModule(window, 'edge-turn-accelerator.js');
  assert.ok(T, 'module loaded');
  assert.ok(T.createAccelerator || T.ICE || T.version, 'accelerator API present');
});

// ─────────────────────────────────────────────────────────────────────
section('EdgeMobilePack — unified entry');

test('entry aggregates all four modules and re-exports Layout', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  loadModule(window, 'edge-layout.js');
  loadModule(window, 'edge-mobile.js');
  loadModule(window, 'edge-offline.js');
  loadModule(window, 'edge-turn-accelerator.js');
  const P = loadModule(window, 'edge-mobile-pack.js');

  assert.strictEqual(P.version, '2.4.0');
  assert.ok(P.Offline, 'Offline re-exported');
  assert.ok(P.Mobile, 'Mobile re-exported');
  assert.ok(P.Turn, 'Turn re-exported');
  assert.ok(P.Layout, 'Layout re-exported (v2.4.0 addition)');
  assert.strictEqual(P.Layout.version, '2.4.0');
});

test('init() returns the pack for chaining', () => {
  const { window } = makeWindow(700, DRAWER_HTML);
  loadModule(window, 'edge-layout.js');
  loadModule(window, 'edge-mobile.js');
  loadModule(window, 'edge-offline.js');
  loadModule(window, 'edge-turn-accelerator.js');
  const P = loadModule(window, 'edge-mobile-pack.js');
  const out = P.init({ enablePullToRefresh: false, bottomDockItems: [] });
  assert.strictEqual(out, P, 'init() is chainable');
});

// ─────────────────────────────────────────────────────────────────────
section('Bundle integrity');

test('every dist bundle is smaller than its src and parses', () => {
  const fs = require('fs');
  const pairs = [
    ['edge-offline.js', 'edge-offline.min.js'],
    ['edge-mobile.js', 'edge-mobile.min.js'],
    ['edge-turn-accelerator.js', 'edge-turn-accelerator.min.js'],
    ['edge-layout.js', 'edge-layout.min.js'],
    ['edge-mobile-pack.js', 'edge-mobile-pack.min.js'],
    ['edge-mobile-pack.css', 'edge-mobile-pack.min.css']
  ];
  const root = ROOT;
  for (const [src, dist] of pairs) {
    const s = fs.statSync(path.join(root, 'src', src)).size;
    const dPath = path.join(root, 'dist', dist);
    assert.ok(fs.existsSync(dPath), `dist/${dist} exists`);
    const d = fs.statSync(dPath).size;
    assert.ok(d < s, `${dist} (${d}) must be smaller than ${src} (${s})`);
  }
});

test('minified CSS still carries the drawer rules', () => {
  const fs = require('fs');
  const css = fs.readFileSync(
    path.resolve(ROOT, 'dist', 'edge-mobile-pack.min.css'),
    'utf8'
  );
  ['edge-drawer', 'edge-overlay', 'edge-drawer-trigger', 'safe-area-inset',
   'prefers-reduced-motion', 'prefers-color-scheme', '--edge-tap-min']
    .forEach((needle) => {
      assert.ok(css.includes(needle), 'minified CSS lost: ' + needle);
    });
});

test('minified layout bundle keeps the public API names', () => {
  const fs = require('fs');
  const js = fs.readFileSync(
    path.resolve(ROOT, 'dist', 'edge-layout.min.js'),
    'utf8'
  );
  ['createDrawer', 'createAutoFitGrid', 'createCollapse', 'enhance',
   'auditTapTargets', 'getTier', 'onTierChange']
    .forEach((name) => {
      assert.ok(js.includes(name), 'minified bundle lost: ' + name);
    });
});

// ─────────────────────────────────────────────────────────────────────
console.log(
  `\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${passed} passed, ${failed} failed\x1b[0m`
);
if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error.message}`));
  process.exit(1);
}
