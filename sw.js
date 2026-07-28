// Service Worker — Al-Qur'an Digital Musholla An-Nur MPHS
// Tujuan: setelah surah pernah dibuka sekali, halaman & datanya tersimpan di perangkat
// sehingga load berikutnya jadi instan (ringan) dan tetap bisa diakses saat offline.

const VERSION = "v3";
const SHELL_CACHE = `mphs-quran-shell-${VERSION}`;
const DATA_CACHE = `mphs-quran-data-${VERSION}`;
const AUDIO_CACHE = `mphs-quran-audio-${VERSION}`;
const ALL_CACHES = [SHELL_CACHE, DATA_CACHE, AUDIO_CACHE];

// File halaman utama (app shell) yang langsung disimpan saat pertama kali dipasang
const SHELL_FILES = [
  "./quran.html",
  "./jadwal-sholat.html",
  "./tahlil-doa.html",
  "./maulid-barzanji.html",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_FILES).catch(() => {/* abaikan jika ada file yang gagal, tetap lanjut */})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // biarkan request non-GET lewat apa adanya

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 1) Audio murottal (mp3) dari CDN equran.id -> cache-first (hemat kuota, sekali unduh dipakai lagi)
  if (url.hostname.includes("equran.id") && /\.mp3(\?.*)?$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req, AUDIO_CACHE));
    return;
  }

  // 2) Data API (daftar surah, detail ayat, tafsir) -> stale-while-revalidate
  //    Tampilkan versi tersimpan secepatnya (biar ringan/instan), lalu perbarui di latar belakang.
  if (url.hostname.includes("equran.id") && url.pathname.includes("/api/")) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  // 3) File halaman sendiri (app shell, sama origin) -> cache-first, fallback jaringan
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // 4) Lainnya (misal font Google Fonts) -> coba jaringan dulu, simpan ke cache, fallback ke cache jika offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});

function cacheFirst(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
    })
  );
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
}
