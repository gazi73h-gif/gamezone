import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Statistikat · GameZone',
  robots: { index: false, follow: false }, // faqe private: mos e shfaq në Google
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
