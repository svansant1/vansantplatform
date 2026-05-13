"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";

type PlatformSettings = {
  platformName: string;
  ownerName: string;
  themeMode: string;
  defaultProjectName: string;
};

type ProjectConfig = {
  aiName: string;
};

type DashboardSnapshot = {
  settings: PlatformSettings;
  activeProjectName: string;
};

const defaultSettings: PlatformSettings = Object.freeze({
  platformName: "VansantPlatform",
  ownerName: "Shawn Vansant",
  themeMode: "Dark",
  defaultProjectName: "SVANSAI",
});

const defaultSnapshot: DashboardSnapshot = Object.freeze({
  settings: defaultSettings,
  activeProjectName: "SVANSAI",
});

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function freezeSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  return Object.freeze({
    settings: Object.freeze({
      platformName: snapshot.settings.platformName,
      ownerName: snapshot.settings.ownerName,
      themeMode: snapshot.settings.themeMode,
      defaultProjectName: snapshot.settings.defaultProjectName,
    }),
    activeProjectName: snapshot.activeProjectName,
  });
}

function areSnapshotsEqual(
  left: DashboardSnapshot,
  right: DashboardSnapshot,
): boolean {
  return (
    left.settings.platformName === right.settings.platformName &&
    left.settings.ownerName === right.settings.ownerName &&
    left.settings.themeMode === right.settings.themeMode &&
    left.settings.defaultProjectName === right.settings.defaultProjectName &&
    left.activeProjectName === right.activeProjectName
  );
}

function buildDashboardSnapshotFromStorage(): DashboardSnapshot {
  if (typeof window === "undefined") {
    return defaultSnapshot;
  }

  const parsedSettings = safeJsonParse<Partial<PlatformSettings>>(
    window.localStorage.getItem("vp-settings"),
    {},
  );

  const parsedConfig = safeJsonParse<Partial<ProjectConfig>>(
    window.localStorage.getItem("svansai-config"),
    {},
  );

  return freezeSnapshot({
    settings: {
      platformName: parsedSettings.platformName ?? defaultSettings.platformName,
      ownerName: parsedSettings.ownerName ?? defaultSettings.ownerName,
      themeMode: parsedSettings.themeMode ?? defaultSettings.themeMode,
      defaultProjectName:
        parsedSettings.defaultProjectName ?? defaultSettings.defaultProjectName,
    },
    activeProjectName: parsedConfig.aiName ?? defaultSnapshot.activeProjectName,
  });
}

let currentSnapshot: DashboardSnapshot =
  typeof window === "undefined"
    ? defaultSnapshot
    : buildDashboardSnapshotFromStorage();

function readDashboardSnapshot(): DashboardSnapshot {
  return currentSnapshot;
}

function syncDashboardSnapshotFromStorage(): boolean {
  const nextSnapshot = buildDashboardSnapshotFromStorage();

  if (areSnapshotsEqual(currentSnapshot, nextSnapshot)) {
    return false;
  }

  currentSnapshot = nextSnapshot;
  return true;
}

function subscribeToDashboardSnapshot(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStoreUpdate = () => {
    if (syncDashboardSnapshotFromStorage()) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStoreUpdate);
  window.addEventListener("vp-storage-updated", handleStoreUpdate);

  return () => {
    window.removeEventListener("storage", handleStoreUpdate);
    window.removeEventListener("vp-storage-updated", handleStoreUpdate);
  };
}

function useDashboardSnapshot(): DashboardSnapshot {
  return useSyncExternalStore(
    subscribeToDashboardSnapshot,
    readDashboardSnapshot,
    () => defaultSnapshot,
  );
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
      <p className="text-sm text-zinc-400">{title}</p>
      <h3 className="mt-2 text-2xl font-bold text-white">{value}</h3>
      <p className="mt-2 text-sm text-zinc-300">{subtitle}</p>
    </div>
  );
}

function MascotRoster() {
  const mascots = [
    {
      name: "Builder",
      role: "Project Planner",
      image: "/mascots/projects.png",
    },
    {
      name: "SVANSAI IDE",
      role: "Platform Brain",
      image: "/mascots/sandbox.png",
    },
    {
      name: "Debugger",
      role: "Issue Finder",
      image: "/mascots/debugger.png",
    },
    {
      name: "Shield",
      role: "Security Scanner",
      image: "/mascots/shield.png",
    },
    {
      name: "SVANS-AI",
      role: "AI Agent",
      image: "/mascots/sv-robot.png",
    },
  ];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <h2 className="text-xl font-semibold text-white">Platform Mascots</h2>

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(112px,1fr))] items-end justify-items-center gap-x-6 gap-y-6">
        {mascots.map((m) => (
          <div
            key={m.name}
            className="flex min-w-0 flex-col items-center text-center"
          >
            <Image
              src={m.image}
              alt={m.name}
              width={96}
              height={96}
              className="h-20 w-20 object-contain drop-shadow-[0_0_14px_rgba(168,85,247,0.45)] sm:h-24 sm:w-24"
            />
            <span className="mt-3 max-w-full text-sm font-medium text-zinc-100">
              {m.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  href,
  cta,
  mascotSrc,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
  mascotSrc: string;
}) {
  return (
    <div className="relative flex min-h-[200px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg transition hover:bg-zinc-900">
      {/* TEXT */}
      <div className="z-10 flex max-w-[70%] flex-col">
        <h3 className="text-xl font-semibold text-white">{title}</h3>

        <p className="mt-3 flex-1 text-sm leading-6 text-zinc-300">
          {description}
        </p>

        <Link
          href={href}
          className="mt-5 w-fit rounded-xl bg-gradient-to-r from-purple-500 to-orange-400 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {cta}
        </Link>
      </div>

      {/* MASCOT IMAGE */}
      <div className="pointer-events-none absolute bottom-4 right-10 flex h-28 w-28 items-center justify-center">
        <Image
          src={mascotSrc}
          alt={`${title} mascot`}
          width={112}
          height={112}
          className="max-h-full max-w-full object-contain opacity-90 mix-blend-screen drop-shadow-[0_0_18px_rgba(168,85,247,0.45)]"
        />
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg transition hover:bg-zinc-800">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-zinc-300">{description}</p>
      <Link
        href={href}
        className="mt-5 inline-block rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-950"
      >
        Open
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const { settings, activeProjectName } = useDashboardSnapshot();

  const [shieldThreatCount, setShieldThreatCount] = useState(0);
  const [shieldLastScan, setShieldLastScan] = useState("Never");
  const [shieldStatus, setShieldStatus] = useState("Idle");
  const [shieldCpuUsage, setShieldCpuUsage] = useState(0);
  const [shieldMemoryUsage, setShieldMemoryUsage] = useState(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.localStorage.getItem("vp-settings")
    ) {
      window.dispatchEvent(new Event("vp-storage-updated"));
    }
  }, []);

  const runShieldQuickScan = async () => {
    setShieldStatus("Scanning...");

    try {
      const res = await fetch("process.env.NEXT_PUBLIC_API_BASE_URL");
      const data = await res.json();

      if (data.ok) {
        setShieldThreatCount((data.threats || []).length);
        setShieldCpuUsage(data.cpu_usage || 0);
        setShieldMemoryUsage(data.memory || 0);
        setShieldLastScan("Just now");
        setShieldStatus("Complete");
      } else {
        setShieldStatus("Scan failed");
      }
    } catch {
      setShieldStatus("Offline");
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 shadow-lg">
        <h1 className="text-4xl font-bold">
          Welcome to{" "}
          <span className="text-purple-400">{settings.platformName}</span>
        </h1>
        <p className="mt-3 max-w-3xl text-zinc-400">
          Your AI development operating system for planning, building,
          debugging, and protecting projects through one connected workflow.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Owner: {settings.ownerName} · Theme: {settings.themeMode} · Default
          project: {settings.defaultProjectName}
        </p>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <StatCard
          title="Active Project"
          value={activeProjectName}
          subtitle="Current working system"
        />
        <StatCard
          title="Shield Status"
          value={shieldStatus}
          subtitle={`Last scan: ${shieldLastScan}`}
        />
      </section>

      <MascotRoster />

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Launch Actions</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            title="Create Project"
            description="Start planning a new project idea and generate the system map."
            href="/projects"
            cta="Open Projects"
            mascotSrc="/mascots/projects.png"
          />

          <ActionCard
            title="Open Sandbox"
            description="Jump into the IDE workspace to build and organize your code."
            href="/sandbox"
            cta="Open Sandbox"
            mascotSrc="/mascots/sandbox.png"
          />

          <ActionCard
            title="Run Debugger"
            description="Inspect issues across apps, files, sites, and system activity."
            href="/debugger"
            cta="Open Debugger"
            mascotSrc="/mascots/debugger.png"
          />

          <ActionCard
            title="Run Shield"
            description="Scan the machine, review suspicious findings, and quarantine threats."
            href="/shield"
            cta="Open Shield"
            mascotSrc="/mascots/shield.png"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
          <h2 className="text-2xl font-semibold text-white">System Status</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Quick visibility into Shield health before deeper work begins.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Threats Found</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {shieldThreatCount}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">CPU Load</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {shieldCpuUsage}%
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Memory Usage</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {shieldMemoryUsage}%
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Last Scan</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {shieldLastScan}
              </p>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={runShieldQuickScan}
              className="rounded-xl bg-purple-500 px-4 py-2 text-sm text-white hover:bg-purple-600"
            >
              Quick Scan
            </button>
            <Link
              href="/shield"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Open Shield
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
          <h2 className="text-2xl font-semibold text-white">Workflow</h2>
          <div className="mt-4 space-y-3 text-sm text-zinc-300">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              1. Start in{" "}
              <span className="font-semibold text-white">Projects</span> to map
              the idea
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              2. Move into{" "}
              <span className="font-semibold text-white">Sandbox</span> to build
              it
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              3. Use <span className="font-semibold text-white">Debugger</span>{" "}
              to inspect issues
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              4. Run <span className="font-semibold text-white">Shield</span> to
              secure the system
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Core Modules</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            title="Projects"
            description="Turn ideas into full system architecture using SVANSAI."
            href="/projects"
          />
          <ModuleCard
            title="Sandbox"
            description="Build and run projects in a VS Code-style environment."
            href="/sandbox"
          />
          <ModuleCard
            title="Debugger"
            description="Analyze and fix issues across apps and systems."
            href="/debugger"
          />
          <ModuleCard
            title="Shield"
            description="Scan and protect your system from threats."
            href="/shield"
          />
          <ModuleCard
            title="Settings"
            description="Manage platform preferences and configurations."
            href="/settings"
          />
        </div>
      </section>
    </div>
  );
}
