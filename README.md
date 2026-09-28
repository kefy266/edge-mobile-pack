# 🚀 Edge Mobile Pack (`edge-mobile-pack`)

> **Responsive Layout System, Enterprise Mobile Compatibility, Low-Latency WebRTC STUN/TURN & Offline-First Background Sync Suite.**
> *Duyarlı Düzen Sistemi, Mobil Uyumluluk, Düşük Gecikmeli WebRTC Multi-STUN/TURN ve Çevrimdışı Senkronizasyon Paketi.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.4.0-indigo.svg)](package.json)
[![Zero Runtime Dependency](https://img.shields.io/badge/runtime%20deps-0-emerald.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-35%20passing-brightgreen.svg)](test.js)
[![Size](https://img.shields.io/badge/gzip-lightgrey.svg)](package.json)

---

## 🌟 Modules / Modüller

### 0. 🗂️ **EdgeLayout (`src/edge-layout.js`) — v2.4.0 ile eklendi**
* **3 Kademe Breakpoint Merdiveni:** `1024px` → `768px` → `480px`. `getTier()`, `onTierChange()` ve `<html data-edge-tier>` aynı merdiveni paylaşır, böylece düzenler ne zaman daralacağı konusunda anlaşamaz.
* **Off-Canvas Drawer:** Sabit ray, 0.3s geçiş, arkasında overlay. `Escape` ile kapanır, focus tuzağı, `aria-expanded`/`aria-hidden` senkronu, odak kapanışta tetiğe döner.
* **Scroll Kilidi:** `position: fixed` ile iOS'ta arka plan kaydırması engellenir ve kaydırma konumu **kaybolmaz** — `overflow: hidden` taklidinden iyi.
* **Fluid `auto-fit` Izgara:** `repeat(auto-fit, minmax(Npx, 1fr))` — hiç breakpoint gerektirmez, sadece sığdığı kadar sütun açar.
* **Kademeli Izgara Çöküşü:** 3 → 2 → 1, tek adımda 1'e düşmez. `minmax(0, 1fr)` kullanır (aşağıya bakın).
* **Dokunma Hedefi Denetleyici:** `auditTapTargets()` 44px'ten küçük etkileşimli öğeleri raporlar; gizli, devre dışı ve `aria-hidden` öğeleri yok sayar.

### 1. 📶 **EdgeOffline (`src/edge-offline.js`)**
* **IndexedDB Outbox Kuyruğu:** Çevrimdışıyken kullanıcı eylemleri öncelikli (`HIGH`/`NORMAL`/`LOW`) ve zaman damgalı olarak kuyruğa alınır.
* **Otomatik Tekrar Oynatma & Üstel Geri Çekilme:** Bağlantı dönünce kuyruk otomatik işlenir.
* **Ağ Kalitesi Tahmincisi:** Bağlantı tipi (4G/3G/2G/slow-2g), RTT ve downlink hızı.
* **Glassmorphism Durum Rozeti:** Çevrimdışı durum ve bekleyen öğe sayısı.

### 2. 📱 **EdgeMobile (`src/edge-mobile.js`)**
* **Dokunma Jest Motoru:** Kaydırma (`swipeleft`, `swiperight`, `swipeup`, `swipedown`), pinch ve pull-to-refresh tanıyıcıları.
* **Mobil Alt Dock:** Cam görünümlü, başparmak dostu gezinme çubuğu (`≤768px`).
* **Haptik Geri Bildirim:** `navigator.vibrate` ile dokunma geri bildirimi.
* **Safe-Area Desteği:** iPhone çentik, Dynamic Island ve home göstergesi için CSS değişkenleri.

### 3. ⚡ **EdgeTurn (`src/edge-turn-accelerator.js`)**
* **Multi-Node STUN/TURN Havuzu:** Google, Cloudflare, Mozilla ve Twilio küresel STUN düğümleri.
* **Max-Bundle ICE Hızlandırma:** 10 aday havuzu önceden toplanır; mobil CGNAT el sıkışması >3s'den **<150ms**'e iner.
* **Canlı P2P Gecikme Tahmincisi:** WebRTC veri kanalları üzerinden RTT nabzı.

---

## 📐 The Breakpoint Ladder / Kademe Merdiveni

Tek bir merdiven, tüm düzen kararları için. `EdgeLayout` bunu `<html data-edge-tier>` olarak da yansıtır, böylece CSS bunu okuyabilir:

| Kademe | Genişlik | Ne olur |
|:--|:--|:--|
| `desktop` | `> 1024px` | Ray kalıcı, tam düzen |
| `tablet` | `≤ 1024px` | Sabit ızgaralar tek sütuna iner |
| `phone` | `≤ 768px` | Drawer açılır, tek sütun, hamburger görünür |
| `small` | `≤ 480px` | Tam genişlik düğmeler, küçük tipografi |

```css
/* CSS tarafında: JS'e gerek yok */
@media (max-width: 768px) { /* ... */ }

html[data-edge-tier="phone"] .only-desktop { display: none; }
```

---

## 📦 Quick Start / Hızlı Başlangıç

### Via CDN / Script Tags:
```html
<!-- CSS: safe-area, drawer, dock, tap targets, iOS zoom fix -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/kefy266/edge-mobile-pack@main/src/edge-mobile-pack.css">

<!-- JS Modules (order matters for the unified entry) -->
<script src="https://cdn.jsdelivr.net/gh/kefy266/edge-mobile-pack@main/src/edge-offline.js"></script>
<script src="https://cdn.jsdelivr.net/gh/kefy266/edge-mobile-pack@main/src/edge-mobile.js"></script>
<script src="https://cdn.jsdelivr.net/gh/kefy266/edge-mobile-pack@main/src/edge-turn-accelerator.js"></script>
<script src="https://cdn.jsdelivr.net/gh/kefy266/edge-mobile-pack@main/src/edge-layout.js"></script>
<script src="https://cdn.jsdelivr.net/gh/kefy266/edge-mobile-pack@main/src/edge-mobile-pack.js"></script>
```

### Via npm:
```bash
npm install edge-mobile-pack
```
```javascript
const { Layout, Mobile, Offline, Turn } = require('edge-mobile-pack');
// or: import { Layout } from 'edge-mobile-pack/layout';
```

---

## 💻 Usage Examples / Kullanım Örnekleri

### 1. Responsive Drawer + Fluid Grids (tamamen bildirimsel)
```html
<button class="edge-drawer-trigger" aria-controls="nav">☰</button>
<nav class="edge-drawer" id="nav" data-edge-drawer aria-hidden="true">
  <a href="/">Ana Sayfa</a>
</nav>

<!-- breakpoint gerektirmez -->
<div data-edge-autofit="200"></div>
<!-- 3 → 2 → 1 kademeli -->
<div data-edge-collapse="3" data-edge-tablet="2" data-edge-phone="1"></div>

<script src="edge-layout.js"></script>
<script>EdgeLayout.enhance(document.body);</script>
```

### 2. Drawer'ı elle kontrol etmek
```javascript
const drawer = EdgeLayout.createDrawer({
  panel: '#nav',
  trigger: '#menu',
  closeOnEscape: true,   // varsayılan
  lockScroll: true,       // varsayılan
  trapFocus: true,        // varsayılan
  onOpen: () => console.log('açıldı'),
  onClose: () => console.log('kapandı')
});

drawer.open();
drawer.close();
drawer.isOpen; // boolean
```

### 3. Kademe değişimini dinlemek
```javascript
EdgeLayout.onTierChange((tier, previous) => {
  // tier: 'desktop' | 'tablet' | 'phone' | 'small'
  if (tier === 'phone') analytics.track('mobile_nav');
});
```

### 4. Dokunma hedefi denetimi
```javascript
const problems = EdgeLayout.auditTapTargets(document.body);
// [{ tag:'a', label:'Detay', width:32, height:28 }, ...]
```

### 5. Offline Action Queue (Çevrimdışı Kuyruk)
```javascript
EdgeOffline.registerHandler('SEND_MESSAGE', async (payload) =>
  await fetch('/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
);

await EdgeOffline.enqueue('SEND_MESSAGE', {
  recipient: 'user@oedge.xyz', text: 'Merhaba!', priority: 'HIGH'
});
```

### 6. Touch Gestures & Bottom Dock
```javascript
EdgeMobilePack.init({
  bottomDockItems: [
    { icon: '🏠', label: 'Ana Sayfa', href: '/' },
    { icon: '🛠️', label: 'Araçlar', href: '/tools' }
  ]
});

const gestures = EdgeMobile.createGestureManager('#card');
gestures.on('swiperight', () => console.log('sağa kaydırıldı'));
```

### 7. WebRTC Low-Latency Accelerator
```javascript
const accelerator = EdgeTurn.createAccelerator({
  iceCandidatePoolSize: 10, bundlePolicy: 'max-bundle'
});
const peer = accelerator.createPeer(true);
accelerator.on('latency', (rttMs) => console.log('P2P gecikme:', rttMs, 'ms'));
```

---

## ⚠️ The `minmax(0, 1fr)` Trap

CSS grid'de `1fr` aslında `minmax(auto, 1fr)` demektir ve `auto` sütunu
içeriğin min-content genişliğine kadar büyütür. Uzun bir kelime, bir URL
ya da sabit genişlikli bir çocuk öğe sütunu taşırır ve yatay kaydırma
çubuğu belirir.

```css
/* YANLIŞ — taşabilir */
grid-template-columns: 1fr 1fr;

/* DOĞRU — sütun gerçekten daralabilir */
grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
```

`EdgeLayout.createCollapse()` her zaman `minmax(0, 1fr)` üretir ve
`test.js` bunu geriye dönük olarak doğrular.

---

## ♿ Accessibility & Mobile Hygiene

Bu paket, çıkarıldığı panelde bulunmayan on boşluğu kapatır:

| Konu | Ne yapar |
|:--|:--|
| **44px dokunma hedefi** | `.edge-tap`, dock öğeleri, drawer tetiği; `auditTapTargets()` ile denetim |
| **iOS input yakınlaştırması** | `.edge-form` altında `font-size: 16px` — odaklanınca sayfa zıplamaz |
| **Tap-highlight parlaması** | `-webkit-tap-highlight-color: transparent` + `:active` geri bildirimi |
| **300ms dokunma gecikmesi** | `touch-action: manipulation` |
| **Safe-area** | `env(safe-area-inset-*)` + `viewport-fit=cover` rehberi |
| **Dinamik viewport** | `.edge-viewport` → `100dvh` (çubuk gizlenince zıplamaz) |
| **Scroll zinciri** | `overscroll-behavior: contain` — çekerek yenileme sayfayı taşırmaz |
| **Hareket duyarlılığı** | `prefers-reduced-motion: reduce` — geçişler kapanır |
| **Koyu mod** | `prefers-color-scheme` ile panel yüzeyleri |
| **Klavye odağı** | `:focus-visible` halkası, görünür ve yüksek kontrastlı |

Hiçbir kural evrensel seçici kullanmaz. Tüm davranış opt-in'dir.

---

## 📂 Project Structure / Proje Yapısı

```
edge-mobile-pack/
├── src/
│   ├── edge-offline.js           # IndexedDB Outbox, Sync Queue & Network Quality
│   ├── edge-mobile.js            # Touch Gestures, Haptics & Bottom Dock
│   ├── edge-turn-accelerator.js  # WebRTC Low-Latency Multi-STUN/TURN Engine
│   ├── edge-layout.js            # Breakpoint Ladder, Drawer & Fluid Grids  ← YENİ
│   ├── edge-mobile-pack.js       # Unified suite entry point
│   └── edge-mobile-pack.css      # Tokens, safe-area, drawer, dock, a11y
├── dist/                         # Gerçek minify edilmiş paketler
├── examples/
│   ├── index.html                # EdgeOffline / EdgeMobile / EdgeTurn playground
│   ├── layout.html               # EdgeLayout responsive demo  ← YENİ
│   └── pwa-service-worker.js     # Ready-to-use PWA Service Worker
├── scripts/build.js              # Minify + senkronizasyon denetimi  ← YENİ
├── test.js                       # 35 fonksiyonel test (jsdom)        ← YENİ
├── package.json
└── README.md
```

---

## 🛠️ Development / Geliştirme

```bash
npm install
npm run build     # src/ -> dist/ minify
npm test          # 35 test
npm run size      # bundle boyut raporu
node scripts/build.js --check   # CI: dist/ senkron mu? (yazmaz)
```

`dist/*.min.js` dosyaları artık **gerçekten** minify edilir ve CI,
`dist/` kaynakla senkron değilse ya da bir dosya küçülmediyse
build'i başarısız kılar.

---

## 📄 License

MIT License © 2026 Origin Edge & kefe3.
Bu kütüphane açık kaynaklı olup ticari ve bireysel tüm projelerde özgürce kullanılabilir.
