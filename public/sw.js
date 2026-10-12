// Fecha: 2026-10-12
// Ruta: /public/sw.js
// Service worker de la PWA DNNS PDF
// Permite instalar la app, usarla sin conexión y detectar versiones nuevas
// Notas: CACHE_VERSION lo sube `npm run release` junto a package.json; cambiar este archivo
//        es lo que hace que el navegador detecte la versión nueva y muestre el banner.
//        Navegación: red primero (para enterarse de versiones nuevas). Estáticos: caché primero
//        (Vite les pone hash, así que una URL nunca cambia de contenido; incluye el .wasm de MuPDF).

const CACHE_VERSION = 'v0.7.0';
const NOMBRE_CACHE = `dnns-pdf-${CACHE_VERSION}`;
const PRECARGA = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (evento) => {
    // Sin skipWaiting aquí: la versión nueva espera a que el usuario pulse "Actualizar"
    evento.waitUntil(caches.open(NOMBRE_CACHE).then((cache) => cache.addAll(PRECARGA)));
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(nombres
            .filter((nombre) => nombre.startsWith('dnns-pdf-') && nombre !== NOMBRE_CACHE)
            .map((nombre) => caches.delete(nombre)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (evento) => {
    if (evento.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (evento) => {
    const peticion = evento.request;
    if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) {
        return;
    }
    if (peticion.mode === 'navigate') {
        evento.respondWith(redPrimero(peticion));
    } else {
        evento.respondWith(cachePrimero(peticion));
    }
});

async function redPrimero(peticion) {
    const cache = await caches.open(NOMBRE_CACHE);
    try {
        const respuesta = await fetch(peticion);
        if (respuesta.ok) {
            cache.put('./index.html', respuesta.clone());
        }
        return respuesta;
    } catch {
        return (await cache.match('./index.html')) || Response.error();
    }
}

async function cachePrimero(peticion) {
    const cache = await caches.open(NOMBRE_CACHE);
    const guardada = await cache.match(peticion);
    if (guardada) {
        return guardada;
    }
    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
        cache.put(peticion, respuesta.clone());
    }
    return respuesta;
}
