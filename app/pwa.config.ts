export const manifest = {
  name: 'Семейный помощник',
  short_name: 'Помощник',
  lang: 'ru',
  start_url: '/',
  display: 'standalone' as const,
  background_color: '#F3F0FB',
  theme_color: '#C92A62',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
