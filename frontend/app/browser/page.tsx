import Image from "next/image";
import Link from "next/link";

const features = [
  "VansantPlatform set as the home page",
  "Private SV Search with no external search provider",
  "SVANSAI available from the browser toolbar",
  "SV Shield protection running in the background",
  "SV Debugger diagnostics when browsing issues arise",
  "Independent tabs with an in-tab close button",
];

export default function SvBrowserPage() {
  return (
    <main className="min-h-screen bg-[#050711] px-6 py-12 text-white">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl md:p-12">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-orange-300">
              Vansant Software
            </p>

            <h1 className="mt-4 text-5xl font-black">Download SV Browser</h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
              SV Browser is your dedicated Windows browser for VansantPlatform,
              with SVANSAI access and background Shield and Debugger support
              built into the browser experience.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="/downloads/SV-Browser.exe"
                download="SV Browser.exe"
                className="rounded-2xl bg-gradient-to-r from-purple-600 to-orange-500 px-6 py-4 font-bold text-white transition hover:opacity-90"
              >
                Download for Windows
              </a>

              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 px-6 py-4 font-bold text-white transition hover:bg-white/10"
              >
                Back to Platform
              </Link>
            </div>

            <p className="mt-5 text-sm text-zinc-500">
              Version 0.6.1 · Windows 10/11 · Self-contained app
            </p>
          </div>

          <div className="flex justify-center">
            <div className="rounded-[2rem] border border-purple-400/20 bg-black/30 p-7 shadow-[0_0_60px_rgba(168,85,247,0.25)]">
              <Image
                src="/sv-browser-logo.png"
                alt="SV Browser logo"
                width={220}
                height={220}
                priority
                className="h-auto w-full max-w-[220px]"
              />
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-2xl font-bold">Built for the Vansant ecosystem</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-zinc-300"
              >
                <span className="mr-2 text-emerald-400">✓</span>
                {feature}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-8 text-sm text-zinc-500">
          Windows may display a security warning until SV Browser is digitally
          code-signed.
        </p>
      </section>
    </main>
  );
}
