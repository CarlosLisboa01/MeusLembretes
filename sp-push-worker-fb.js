// Placeholder do Service Worker do SendPulse
// Substitua este arquivo pelo conteúdo oficial fornecido pelo SendPulse
// e mantenha o nome do arquivo exatamente como "sp-push-worker-fb.js" na raiz do site.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

importScripts('https://web.webpushs.com/sp-push-worker-fb.js?ver=2.0');
