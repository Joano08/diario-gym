/* Diario Gym — hace que la app abra sin internet.
   Guarda una copia de los archivos de la app en el celular y la usa siempre;
   cuando hay internet, revisa en segundo plano si hay una versión nueva. */
const CACHE = "diario-gym-v1";
const ARCHIVOS = [
  "./", "index.html", "estilos.css", "js/datos.js", "js/app.js", "manifest.webmanifest",
  "iconos/icono-192.png", "iconos/icono-512.png", "iconos/icono-maskable-512.png", "datos/programa.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/datos/historial.json")) return; /* solo se pide una vez, directo a internet */
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req, { ignoreSearch: true });
    const fresco = fetch(req, { cache: "no-cache" }).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    if (guardado) { e.waitUntil(fresco); return guardado; }
    const r = await fresco;
    if (r) return r;
    if (req.mode === "navigate") { const inicio = await cache.match("index.html"); if (inicio) return inicio; }
    return new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  })());
});
