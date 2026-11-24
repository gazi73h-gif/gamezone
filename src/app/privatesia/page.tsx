import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politika e privatësisë – GameZone',
  description: 'Si i përdor GameZone të dhënat e lojtarëve.',
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm font-bold text-mute hover:text-ink">← Kthehu te lojërat</Link>
      <h1 className="font-display font-bold text-3xl mt-4">Politika e privatësisë</h1>
      <p className="text-mute text-sm mt-1">Përditësuar më 25 nëntor 2026</p>

      <div className="gz-panel rounded-3xl p-6 mt-6 space-y-5 text-[15px]">
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">Çfarë të dhënash mbledhim</h2>
          <ul className="list-disc pl-5 space-y-1 text-mute">
            <li><strong className="text-ink">Pa llogari:</strong> vetëm nofkën që shkruan dhe një numër identifikimi të rastësishëm, të ruajtur në shfletuesin tënd.</li>
            <li><strong className="text-ink">Me llogari (email, Facebook ose Google):</strong> emailin, emrin dhe foton e profilit që na jep shërbimi me të cilin kyçesh.</li>
            <li><strong className="text-ink">Gjatë lojës:</strong> nofkën, tokens, fitoret dhe pikët në renditje, si dhe gjendjen e lojërave në dhomat ku luan.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">Pse i përdorim</h2>
          <p className="text-mute">Vetëm që të luash: të të njohim kur kthehesh, të ruajmë tokens dhe pikët, dhe të shfaqim emrin e foton tënde te lojtarët e tjerë në të njëjtën tavolinë dhe në renditje. Nuk i shesim dhe nuk i japim të dhënat për reklama.</p>
        </section>
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">Ku ruhen</h2>
          <p className="text-mute">Të dhënat ruhen te Supabase (databaza dhe kyçja) dhe faqja shërbehet nga Vercel. Nga Facebook-u/Google marrim vetëm emrin, emailin dhe foton e profilit — asnjë postim, shok apo të dhënë tjetër.</p>
        </section>
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">Fshirja e të dhënave</h2>
          <p className="text-mute">Mund ta fshish llogarinë kur të duash. Shiko <Link href="/fshirja-e-te-dhenave" className="underline text-ink">Fshirja e të dhënave</Link>.</p>
        </section>
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">Kontakti</h2>
          <p className="text-mute">Për çdo pyetje rreth të dhënave, na shkruaj në faqen tonë në Facebook “GameZone”.</p>
        </section>
        <section className="border-t border-white/10 pt-4">
          <h2 className="font-display font-semibold text-lg mb-1">In English</h2>
          <p className="text-mute text-sm">GameZone collects only what is needed to play: a nickname, and — if you sign in with email, Facebook or Google — your email, name and profile picture. We use them to keep your tokens and scores and to show your name and picture to other players. We do not sell or share your data. You can delete your account at any time: see “Fshirja e të dhënave” (Data deletion).</p>
        </section>
      </div>
    </main>
  );
}
