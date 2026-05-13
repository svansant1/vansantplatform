"use client";

import { useEffect } from "react";
import {
  ScanMode,
  ShieldSettings,
  useShield,
} from "../../components/shield/ShieldProvider";

export default function SettingsPage() {
  const { settings, loadSettings, updateSettings, loading } = useShield();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function set<K extends keyof ShieldSettings>(key: K, value: ShieldSettings[K]) {
    updateSettings({ [key]: value });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-purple-900/50 via-zinc-950 to-orange-950/40 p-6 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-purple-300">
          Protection Controls
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight">Settings</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300">
          Configure how Shield scans and filters. All settings persist locally
          and take effect on the next scan.
        </p>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-xl">
        <h3 className="text-xl font-bold">Scan Mode</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Controls the minimum risk threshold shown in findings.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {(
            [
              {
                id: "strict" as ScanMode,
                title: "Strict",
                desc: "High and critical findings only (score ≥ 55). Fewest false positives.",
              },
              {
                id: "balanced" as ScanMode,
                title: "Balanced",
                desc: "Medium, high, and critical findings (score ≥ 35). Recommended default.",
              },
              {
                id: "deep" as ScanMode,
                title: "Deep",
                desc: "All findings including low-risk (score ≥ 30). Best for detailed review.",
              },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              disabled={loading}
              onClick={() => set("scan_mode", mode.id)}
              className={`rounded-2xl border p-5 text-left transition disabled:opacity-50 ${
                settings.scan_mode === mode.id
                  ? "border-purple-500/60 bg-purple-500/15"
                  : "border-white/10 bg-black/30 hover:bg-white/5"
              }`}
            >
              <p className="font-bold">{mode.title}</p>
              <p className="mt-2 text-sm text-zinc-500">{mode.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 shadow-xl">
        <h3 className="text-xl font-bold">Review Behavior</h3>

        <div className="mt-5 space-y-4">
          <Toggle
            label="Show low-risk findings"
            description="Show score ≥ 30 items even in Strict or Balanced mode. Useful for deep investigation."
            checked={settings.show_low_risk}
            disabled={loading}
            onChange={(value) => set("show_low_risk", value)}
          />

          <Toggle
            label="Auto-quarantine critical findings"
            description="Automatically quarantine critical-scored files after a scan. Keep off until you have reviewed the restore flow."
            checked={settings.auto_quarantine}
            disabled={loading}
            onChange={(value) => set("auto_quarantine", value)}
          />
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-5">
      <div>
        <p className="font-bold">{label}</p>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`h-7 w-12 shrink-0 rounded-full p-1 transition disabled:opacity-50 ${
          checked ? "bg-purple-600" : "bg-zinc-700"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
