self.addEventListener('install', e=>{
  e.waitUntil(caches.open('rd-v1').then(c=>c.addAll(['./','./index.html','./style.css','./main.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'])));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k.startsWith('rd-')&&k!=='rd-v1'?caches.delete(k):null))));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});