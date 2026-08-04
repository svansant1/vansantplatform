import Image from "next/image";
import Link from "next/link";
import { VosOnlineLaunchButton } from "../vos/VosOnlineLaunchButton";

const features = [
  "VansantPlatform set as the home page",
  "Private SV Search with no external search provider",
  "Encrypted password saving and autofill controls",
  "Private local history with address-bar suggestions and management",
  "Persistent downloads history with open-file and show-in-folder controls",
  "DeVry and zyBooks LTI sign-in support across new tabs",
  "Dockable SVANSAI sidebar with a movable, modeless pop-out window",
  "Automatic highlight detection with USE NEW and CHECK controls",
  "Focused SVANSAI answers that follow your highlighted text and question",
  "SVANSAI available from the browser toolbar",
  "SV Shield protection running in the background",
  "SV Debugger diagnostics when browsing issues arise",
  "Compact pinned tabs with pin and unpin controls in the tab menu",
  "Drag tabs into separate windows or merge them back onto another tab bar",
  "Checks for Microsoft WebView2 and offers to install it when missing",
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
              <VosOnlineLaunchButton label="Try SV Browser Online" app="browser" />
              <a
                href="/downloads/SV-Browser-0.13.5-Windows-x64.exe"
                download="SV-Browser-0.13.5-Windows-x64.exe"
                className="rounded-2xl bg-gradient-to-r from-purple-600 to-orange-500 px-6 py-4 font-bold text-white transition hover:opacity-90"
              >
                Download for Windows (x64)
              </a>

              <a
                href="/downloads/SV-Browser-0.13.5-Windows-ARM64.exe"
                download="SV-Browser-0.13.5-Windows-ARM64.exe"
                className="rounded-2xl border border-purple-400/30 px-6 py-4 font-bold text-white transition hover:bg-purple-500/10"
              >
                Windows ARM64
              </a>

              <Link
                href="/dashboard"
                className="rounded-2xl border border-white/10 px-6 py-4 font-bold text-white transition hover:bg-white/10"
              >
                Back to Platform
              </Link>
            </div>

            <p className="mt-5 text-sm text-zinc-500">
              Version 0.13.5 · Windows 10/11 · Self-contained app
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

        <div className="mt-10 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-6">
          <h2 className="text-xl font-bold text-amber-100">
            Trouble opening SV Browser on another computer?
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
            <p>
              Most Intel and AMD computers should use the x64 download. Use
              ARM64 only when Windows Settings → System → About says the
              computer has an ARM-based processor.
            </p>
            <p>
              Because SV Browser is not yet signed with a public code-signing
              certificate, Microsoft Defender SmartScreen may show “Windows
              protected your PC.” Choose <strong>More info</strong>, verify the
              app name is SV Browser, and then choose <strong>Run anyway</strong>.
            </p>
            <p>
              Version 0.13.5 checks for Microsoft Edge WebView2 Runtime and
              offers to install it automatically. You can also install it
              directly from{` `}
              <a
                href="https://developer.microsoft.com/microsoft-edge/webview2/consumer/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-cyan-300 underline decoration-cyan-300/40 underline-offset-4"
              >
                Microsoft’s official WebView2 page
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
