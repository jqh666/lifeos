/* LifeOS Service Worker
 * - 应用外壳离线缓存（PWA，蓝图 8.2）
 * - Web Push 接收（VAPID，空载荷方案：推送到达后由页面拉取提醒清单）
 * - 通知点击聚焦/打开应用
 */
const CACHE = 'lifeos-shell-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await Promise.allSettled(SHELL.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SKIP_WAITING') self.skipWaiting()
  if (data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(
      self.registration.showNotification(data.title || 'LifeOS', {
        body: data.body || '',
        tag: data.tag || 'lifeos',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: { url: data.url || './' },
      }),
    )
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // AI 接口与代理不缓存
  if (url.pathname.includes('/chat') || url.search.includes('ai=')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put('./index.html', fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cache = await caches.open(CACHE)
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      try {
        const res = await fetch(req)
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone()).catch(() => {})
        }
        return res
      } catch {
        return hit || Response.error()
      }
    })(),
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'LifeOS', body: event.data ? event.data.text() : '有新的提醒' }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'LifeOS 提醒', {
      body: payload.body || '今日有复习或复盘待处理，点开查看清单',
      tag: payload.tag || 'lifeos-push',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: payload.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || './'
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })(),
  )
})
