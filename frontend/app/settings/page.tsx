"use client";

import { useState } from "react";

type PlatformSettings = {
  platformName: string;
  ownerName: string;
  themeMode: string;
  defaultProjectName: string;
};

const defaultSettings: PlatformSettings = {
  platformName: "VansantPlatform",
  ownerName: "Shawn Vansant",
  themeMode: "Dark",
  defaultProjectName: "SVANSAI",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(() => {
    if (typeof window === "undefined") return defaultSettings;

    const savedSettings = localStorage.getItem("vp-settings");
    if (!savedSettings) return defaultSettings;

    try {
      const parsed = JSON.parse(savedSettings);
      return {
        platformName: parsed.platformName || defaultSettings.platformName,
        ownerName: parsed.ownerName || defaultSettings.ownerName,
        themeMode: parsed.themeMode || defaultSettings.themeMode,
        defaultProjectName:
          parsed.defaultProjectName || defaultSettings.defaultProjectName,
      };
    } catch (error) {
      console.error("Failed to parse settings:", error);
      return defaultSettings;
    }
  });

  const [status, setStatus] = useState("");

  const handleChange = (field: keyof PlatformSettings, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = () => {
    localStorage.setItem("vp-settings", JSON.stringify(settings));
    window.dispatchEvent(new Event("vp-storage-updated"));
    setStatus("Settings saved successfully.");
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    localStorage.setItem("vp-settings", JSON.stringify(defaultSettings));
    window.dispatchEvent(new Event("vp-storage-updated"));
    setStatus("Settings reset to default values.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-zinc-400">
          Control platform preferences, naming, and workspace defaults.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Platform Name
            </label>
            <input
              type="text"
              value={settings.platformName}
              onChange={(e) => handleChange("platformName", e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Owner Name
            </label>
            <input
              type="text"
              value={settings.ownerName}
              onChange={(e) => handleChange("ownerName", e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Theme Mode
            </label>
            <input
              type="text"
              value={settings.themeMode}
              onChange={(e) => handleChange("themeMode", e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Default Project Name
            </label>
            <input
              type="text"
              value={settings.defaultProjectName}
              onChange={(e) =>
                handleChange("defaultProjectName", e.target.value)
              }
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            className="rounded-xl bg-purple-500 px-5 py-3 text-sm font-medium text-white hover:bg-purple-600"
          >
            Save Settings
          </button>

          <button
            onClick={handleReset}
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
          >
            Reset
          </button>
        </div>

        {status && <p className="mt-4 text-sm text-green-400">{status}</p>}
      </div>
    </div>
  );
}
