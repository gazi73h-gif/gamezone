import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import RadioPlayer from '../components/RadioPlayer';


const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GameZone - Lojëra Online Multiplayer në Shqip',
  description: 'Luaj Yamb, Pishpirik, Vizato & Qëllo, UNO, Ludo dhe Rummy me shokë në kohë reale.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sq">
      <body className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen antialiased`}>
        {children}
                <RadioPlayer />

      </body>
    </html>
  );
}
