/* ==========================================================================
   SECOP II Hunter - Service Worker

   - HTML (navegacion):  RED PRIMERO. Si la app se actualiza en GitHub Pages,
                         el usuario ve la version nueva de inmediato. El cache
                         solo se usa como respaldo cuando no hay internet.
   - Librerias CDN:      CACHE PRIMERO. Son URLs con version fija (leaflet@1.9.4,
                         pdf.js/3.11.174, etc.), asi que nunca cambian.
   - APIs:               NUNCA se cachean (datos.gov.co, Apps Script, Groq).
                         Los datos de contratacion deben ser siempre frescos.

   Al cambiar VERSION se borran los caches viejos automaticamente.
   ========================================================================== */

const VERSION = 'secop-hunter-v1';
const CACHE_APP = VERSION + '-app';
const CACHE_CDN = VERSION + '-cdn';

const ARCHIVOS_BASE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

const NO_CACHEAR = [
  'datos.gov.co', 'script.google.com', 'script.googleusercontent.com',
  'api.groq.com', 'community.secop.gov.co',
  'allorigins.win', 'codetabs.com', 'corsproxy.io', 'cors.lol'
];

const CDN_CACHEABLE = [
  'unpkg.com', 'cdnjs.cloudflare.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'tile.openstreetmap.org'
];

function esNoCacheable(url){ return NO_CACHEAR.some(function(d){ return url.hostname.indexOf(d) >= 0; }); }
function esCdn(url){ return CDN_CACHEABLE.some(function(d){ return url.hostname.indexOf(d) >= 0; }); }

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_APP).then(function(cache){
      return Promise.all(ARCHIVOS_BASE.map(function(u){
        return cache.add(u).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(nombres){
      return Promise.all(nombres.map(function(n){
        if(n.indexOf(VERSION) !== 0) return caches.delete(n);
        return null;
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  const req = event.request;
  if(req.method !== 'GET') return;

  let url;
  try{ url = new URL(req.url); }catch(e){ return; }

  if(esNoCacheable(url)) return;

  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req).then(function(res){
        const copia = res.clone();
        caches.open(CACHE_APP).then(function(c){ c.put(req, copia); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(r){
          return r || caches.match('./index.html');
        }).then(function(r){
          return r || new Response(
            '<h1 style="font-family:sans-serif;padding:40px">Sin conexion</h1>' +
            '<p style="font-family:sans-serif;padding:0 40px">No hay internet y la app no esta guardada en cache todavia.</p>',
            {headers:{'Content-Type':'text/html; charset=utf-8'}}
          );
        });
      })
    );
    return;
  }

  if(esCdn(url)){
    event.respondWith(
      caches.match(req).then(function(cacheado){
        if(cacheado) return cacheado;
        return fetch(req).then(function(res){
          if(res && (res.status === 200 || res.type === 'opaque')){
            const copia = res.clone();
            caches.open(CACHE_CDN).then(function(c){ c.put(req, copia); });
          }
          return res;
        }).catch(function(){ return cacheado; });
      })
    );
    return;
  }

  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then(function(cacheado){
        const red = fetch(req).then(function(res){
          if(res && res.status === 200){
            const copia = res.clone();
            caches.open(CACHE_APP).then(function(c){ c.put(req, copia); });
          }
          return res;
        }).catch(function(){ return cacheado; });
        return cacheado || red;
      })
    );
  }
});

self.addEventListener('message', function(event){
  if(event.data === 'skipWaiting') self.skipWaiting();
});
