import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import './globals.css';
import RadioPlayer from '../components/RadioPlayer';
import { OnlinePresence } from '../lib/online';

const fredoka = Fredoka({ subsets: ['latin', 'latin-ext'], variable: '--font-fredoka', display: 'swap' });
const nunito = Nunito({ subsets: ['latin', 'latin-ext'], variable: '--font-nunito', display: 'swap' });

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://gamezone-hazel.vercel.app';
const DESCRIPTION = 'Luaj Ludo, Okey, Pishpirik, UNO, Yamb dhe Shah me shokët në kohë reale — falas, pa regjistrim, edhe në telefon.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'GameZone - Lojëra Online Multiplayer në Shqip',
  description: DESCRIPTION,
  openGraph: { title: 'GameZone 🎲 Luaj me shokët, kudo që janë', description: DESCRIPTION, siteName: 'GameZone', locale: 'sq_AL', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'GameZone 🎲 Luaj me shokët', description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#0d0a24',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sq" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
        <RadioPlayer />
        <OnlinePresence />
        <script dangerouslySetInnerHTML={{ __html: "if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }" }} />
      </body>
    </html>
  );
}
