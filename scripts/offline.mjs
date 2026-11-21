import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const assets = (await readdir('dist/assets')).map(name => 'assets/' + name)
const files = ['index.html', ...assets]
const hash = createHash('sha256')
hash.update(await readFile(new URL(import.meta.url)))
for (const file of files) hash.update(await readFile('dist/' + file))
const version = hash.digest('hex').slice(0, 16)
// Older service workers do not intercept this URL. It can load the current
// build even when a phone still has an incomplete cache from a prior release.
await writeFile('dist/fresh.html', await readFile('dist/index.html'))
await writeFile('dist/sw.js', `
const prefix = 'courtside:' + self.registration.scope + ':';
const cacheName = prefix + '${version}';
const urls = ${JSON.stringify(files)}.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  requestUrl.search = '';
  requestUrl.hash = '';
  const navigation = event.request.mode === 'navigate' &&
    [self.registration.scope, urls[0]].includes(requestUrl.href);
  if (!navigation && !urls.includes(event.request.url)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    if (!navigation) return (await cache.match(event.request)) ?? fetch(event.request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const current = await fetch(event.request, { cache: 'no-cache', signal: controller.signal });
      if (current.ok) return current;
    } catch {
      // Offline navigation falls back to the complete installed release.
    } finally {
      clearTimeout(timeout);
    }
    return (await cache.match(urls[0])) ?? new Response(
      'Courtside is unavailable offline. Reconnect and open the site again.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }));
});
`)
