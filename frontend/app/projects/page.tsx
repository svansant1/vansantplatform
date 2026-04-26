"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ProjectConfig = {
  aiName: string;
  role: string;
  purpose: string;
  systemPrompt: string;
};

const defaultProject: ProjectConfig = {
  aiName: "SVANSAI",
  role: "AI Development Operating System",
  purpose:
    "SVANSAI is being built as the planning and intelligence layer that helps turn ideas into structured, buildable systems inside VansantPlatform.",
  systemPrompt:
    "You are SVANSAI, an evolving intelligence system designed to help users plan, build, debug, and secure projects.",
};

function saveProjectConfig(project: ProjectConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem("svansai-config", JSON.stringify(project));
  window.dispatchEvent(new Event("vp-storage-updated"));
}

export default function ProjectsPage() {
  const [project, setProject] = useState<ProjectConfig>(() => {
    if (typeof window === "undefined") return defaultProject;

    const savedConfig = localStorage.getItem("svansai-config");

    if (!savedConfig) return defaultProject;

    try {
      const parsed = JSON.parse(savedConfig);

      return {
        aiName: parsed.aiName || defaultProject.aiName,
        role: parsed.role || defaultProject.role,
        purpose: parsed.purpose || defaultProject.purpose,
        systemPrompt: parsed.systemPrompt || defaultProject.systemPrompt,
      };
    } catch (error) {
      console.error("Failed to parse project config:", error);
      return defaultProject;
    }
  });

  const [idea, setIdea] = useState("");
  const [status, setStatus] = useState("");

  const generatedPlan = useMemo(() => {
    if (!idea.trim()) return null;

    return {
      projectName: idea.trim(),
      architecture: [
        "Define the core user workflow",
        "Choose frontend, backend, data, and deployment structure",
        "Identify integrations and APIs",
        "Map security, debugging, and testing requirements",
      ],
      buildSteps: [
        "Create the project structure",
        "Open the project in Sandbox",
        "Build the first working version",
        "Run Debugger against the project",
        "Run Shield checks before release",
      ],
    };
  }, [idea]);

  const handleSave = () => {
    saveProjectConfig(project);
    setStatus("Project configuration saved.");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Projects</h1>
        <p className="mt-2 text-zinc-400">
          Create, plan, and manage AI-powered system builds using SVANSAI.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">{project.aiName}</h2>
              <p className="mt-1 text-sm text-zinc-400">{project.role}</p>
            </div>

            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-medium text-purple-300">
              Active
            </span>
          </div>

          <div className="mt-6 grid gap-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Project Name
              </label>
              <input
                type="text"
                value={project.aiName}
                onChange={(e) =>
                  setProject((prev) => ({ ...prev, aiName: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Project Role
              </label>
              <input
                type="text"
                value={project.role}
                onChange={(e) =>
                  setProject((prev) => ({ ...prev, role: e.target.value }))
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Purpose
              </label>
              <textarea
                value={project.purpose}
                onChange={(e) =>
                  setProject((prev) => ({ ...prev, purpose: e.target.value }))
                }
                className="min-h-[110px] w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Core System Prompt
              </label>
              <textarea
                value={project.systemPrompt}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    systemPrompt: e.target.value,
                  }))
                }
                className="min-h-[130px] w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
              />
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleSave}
              className="rounded-xl bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
            >
              Save Project
            </button>

            <Link
              href="/sandbox"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
            >
              Open in Sandbox
            </Link>
          </div>

          {status && <p className="mt-4 text-sm text-green-400">{status}</p>}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-white">Project Map-Out</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Enter a project idea and generate a high-level implementation path.
          </p>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Project Idea
            </label>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Example: Build an AI antivirus that scans the machine, explains threats, and connects to a desktop app."
              className="min-h-[140px] w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none"
            />
          </div>

          {!generatedPlan ? (
            <p className="mt-5 text-sm text-zinc-500">
              Enter a project idea to generate a starting architecture map.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm text-zinc-400">Project Name</p>
                <p className="mt-2 font-semibold text-white">
                  {generatedPlan.projectName}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm text-zinc-400">Architecture Path</p>
                <ul className="mt-3 list-disc pl-5 text-sm text-zinc-300">
                  {generatedPlan.architecture.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm text-zinc-400">Build Flow</p>
                <ul className="mt-3 list-disc pl-5 text-sm text-zinc-300">
                  {generatedPlan.buildSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>

              <Link
                href="/sandbox"
                className="inline-block rounded-xl bg-gradient-to-r from-purple-500 to-orange-400 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Continue to Sandbox
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
