import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import './globals.css';
import RadioPlayer from '../components/RadioPlayer';

const fredoka = Fredoka({ subsets: ['latin', 'latin-ext'], variable: '--font-fredoka', display: 'swap' });
const nunito = Nunito({ subsets: ['latin', 'latin-ext'], variable: '--font-nunito', display: 'swap' });

export const metadata: Metadata = {
  title: 'GameZone - Lojëra Online Multiplayer në Shqip',
  description: 'Luaj Yamb, Pishpirik, Vizato & Qëllo, UNO, Ludo dhe Rummy me shokë në kohë reale.',
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
        <script dangerouslySetInnerHTML={{ __html: "if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }" }} />
      </body>
    </html>
  );
}
