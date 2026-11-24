import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Fshirja e të dhënave – GameZone',
  description: 'Si ta fshish llogarinë dhe të dhënat në GameZone.',
};

export default function DataDeletionPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm font-bold text-mute hover:text-ink">← Kthehu te lojërat</Link>
      <h1 className="font-display font-bold text-3xl mt-4">Fshirja e të dhënave</h1>

      <div className="gz-panel rounded-3xl p-6 mt-6 space-y-5 text-[15px]">
        <section>
          <h2 className="font-display font-semibold text-xl mb-2">Fshije vetë, menjëherë</h2>
          <ol className="list-decimal pl-5 space-y-1 text-mute">
            <li>Hap GameZone dhe kyçu me të njëjtën llogari (email, Facebook ose Google).</li>
            <li>Prek foton/inicialet lart djathtas → <strong className="text-ink">Llogaria ime</strong>.</li>
            <li>Prek <strong className="text-ink">Fshi llogarinë</strong> dhe konfirmo me <strong className="text-ink">Po, fshije</strong>.</li>
          </ol>
          <p className="text-mute mt-2">Fshihen menjëherë: llogaria, emaili, emri, foto e profilit, tokens dhe vendet tua në dhoma. Nofka që mund të shfaqet ende në renditjen publike të fitoreve hiqet me kërkesë (shiko më poshtë).</p>
        </section>
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">Nëse nuk mund të kyçesh</h2>
          <p className="text-mute">Na shkruaj në faqen tonë në Facebook “GameZone” me emrin ose emailin e llogarisë, dhe i fshijmë të dhënat brenda 30 ditëve.</p>
        </section>
        <section>
          <h2 className="font-display font-semibold text-xl mb-1">Heqja e lidhjes me Facebook</h2>
          <p className="text-mute">Mund ta heqësh edhe nga Facebook-u: Cilësimet → Aplikacionet dhe faqet e internetit → GameZone → Hiqe.</p>
        </section>
        <section className="border-t border-white/10 pt-4">
          <h2 className="font-display font-semibold text-lg mb-1">In English — Data deletion instructions</h2>
          <p className="text-mute text-sm">Sign in to GameZone, open “Llogaria ime” (My account) from the top-right picture, tap “Fshi llogarinë” (Delete account) and confirm. Your account, email, name, profile picture and tokens are deleted immediately. If you cannot sign in, message our Facebook page “GameZone” and we will delete your data within 30 days.</p>
        </section>
      </div>
    </main>
  );
}
