import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GameZone - Lojëra Tavoline & Letra',
    short_name: 'GameZone',
    description: 'Yamb, Pishpirik, Shah 3D, UNO Shqip, Ludo dhe Rummy / Jol në kohë reale',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}