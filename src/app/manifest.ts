import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'GameZone - Lojëra Tavoline & Letra',
    short_name: 'GameZone',
    description: 'Yamb, Pishpirik, Shah 3D, UNO Shqip, Ludo dhe Rummy / Jol në kohë reale',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}