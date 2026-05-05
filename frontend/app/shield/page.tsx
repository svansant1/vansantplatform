import Link from "next/link";

export default function SvansShieldPage() {
  return (
    <main className="min-h-screen bg-[#050711] px-6 py-16 text-white">
      <section className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-purple-300">
          SVANS Shield
        </p>

        <h1 className="mt-4 text-5xl font-black">Download SVANS Shield</h1>

        <p className="mt-5 max-w-2xl text-zinc-300">
          SVANS Shield is a Windows desktop protection app for local folder
          scans, intelligent file review, threat explanations, and quarantine
          support.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <a
            href="/downloads/SVANS-Shield.exe"
            download
            className="rounded-2xl bg-purple-600 px-6 py-4 font-bold text-white transition hover:bg-purple-500"
          >
            Download for Windows
          </a>

          <Link
            href="/"
            className="rounded-2xl border border-white/10 px-6 py-4 font-bold text-white transition hover:bg-white/10"
          >
            Back to Platform
          </Link>
        </div>

        <p className="mt-6 text-sm text-zinc-500">
          Windows may show a Smart App Control warning until the installer is
          code-signed.
        </p>
      </section>
    </main>
  );
}
