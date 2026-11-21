import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const assets = (await readdir('dist/assets')).map(name => 'assets/' + name)
const files = ['index.html', ...assets]
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile('dist/' + file))
const version = hash.digest('hex').slice(0, 16)
await writeFile('dist/sw.js', `
const prefix = 'courtside:' + self.registration.scope + ':';
const cacheName = prefix + '${version}';
const urls = ${JSON.stringify(files)}.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(urls)));
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
    return (await cache.match(navigation ? urls[0] : event.request)) ?? fetch(event.request);
  }));
});
`)
