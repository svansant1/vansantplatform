"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import {
  AppWindow,
  BriefcaseBusiness,
  Bot,
  Boxes,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Code2,
  Database,
  FileCode2,
  FolderTree,
  Gamepad2,
  Globe2,
  GraduationCap,
  Layers3,
  ListChecks,
  MonitorCog,
  Paintbrush,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";

type ProjectConfig = {
  aiName: string;
  role: string;
  purpose: string;
  systemPrompt: string;
};

type ProjectType =
  | "web-app"
  | "full-stack-app"
  | "ai-app"
  | "desktop-app"
  | "mobile-app"
  | "game"
  | "api"
  | "automation"
  | "security-tool"
  | "browser-extension"
  | "business-launch"
  | "event-plan"
  | "research-project"
  | "education-plan"
  | "creative-project"
  | "operations-plan"
  | "product-design";

type ProjectTemplate = {
  type: ProjectType;
  label: string;
  summary: string;
  stack: string[];
  folders: BlueprintEntry[];
  files: BlueprintEntry[];
  features: string[];
  phases: BuildPhase[];
};

type BlueprintEntry = {
  path: string;
  purpose: string;
};

type BuildPhase = {
  title: string;
  steps: string[];
};

type DeepOutlineSection = {
  path: string;
  purpose: string;
  subfolders: BlueprintEntry[];
  starterMaterials: Array<BlueprintEntry & { prompts: string[] }>;
  firstSteps: string[];
};

type ProjectBlueprint = ProjectTemplate & {
  projectName: string;
  idea: string;
  confidence: string;
  outlineTree: string[];
  deepOutline: DeepOutlineSection[];
  nextActions: string[];
};

const defaultProject: ProjectConfig = {
  aiName: "SVANSAI",
  role: "AI Development Operating System",
  purpose:
    "SVANSAI is being built as the planning and intelligence layer that helps turn ideas into structured, buildable systems inside VansantPlatform.",
  systemPrompt:
    "You are SVANSAI, an evolving intelligence system designed to help users plan, build, debug, and secure projects.",
};

type CodingProjectType = Exclude<
  ProjectType,
  | "business-launch"
  | "event-plan"
  | "research-project"
  | "education-plan"
  | "creative-project"
  | "operations-plan"
  | "product-design"
>;

const projectTemplates: Record<CodingProjectType, ProjectTemplate> = {
  "web-app": {
    type: "web-app",
    label: "Web App",
    summary:
      "A polished browser-based app with routes, reusable UI, client state, and a clear release path.",
    stack: ["Next.js", "React", "Tailwind CSS", "TypeScript", "Vercel"],
    folders: [
      {
        path: "app/",
        purpose:
          "Routes, pages, layouts, metadata, and server/client boundaries.",
      },
      {
        path: "components/",
        purpose:
          "Reusable UI pieces such as forms, cards, tables, and navigation.",
      },
      {
        path: "lib/",
        purpose:
          "Shared helpers, validators, API clients, and formatting utilities.",
      },
      {
        path: "public/",
        purpose:
          "Images, icons, downloads, and static assets served by the app.",
      },
    ],
    files: [
      {
        path: "app/page.tsx",
        purpose: "Primary screen and first working user flow.",
      },
      {
        path: "app/layout.tsx",
        purpose: "Global layout, metadata, providers, and shared shell.",
      },
      {
        path: "components/AppShell.tsx",
        purpose: "Page frame, navigation, and responsive structure.",
      },
      {
        path: "lib/project-data.ts",
        purpose: "Typed data and helper functions that drive the UI.",
      },
    ],
    features: [
      "Responsive first screen",
      "Reusable component library",
      "Loading, empty, and error states",
      "Deploy-ready build script",
    ],
    phases: [
      {
        title: "Shape The Experience",
        steps: [
          "Define the main user workflow and the first screen.",
          "Sketch the routes and shared layout.",
          "Choose the data that each screen needs.",
        ],
      },
      {
        title: "Build The App Surface",
        steps: [
          "Create the route files and shared components.",
          "Add real controls, forms, and states.",
          "Connect UI to local data or API helpers.",
        ],
      },
      {
        title: "Release And Review",
        steps: [
          "Run lint/build checks.",
          "Test desktop and mobile layouts.",
          "Prepare deployment settings and README instructions.",
        ],
      },
    ],
  },
  "full-stack-app": {
    type: "full-stack-app",
    label: "Full-Stack App",
    summary:
      "A complete product with frontend screens, backend routes, data storage, auth boundaries, and deployment steps.",
    stack: [
      "Next.js",
      "React",
      "API routes",
      "PostgreSQL",
      "Prisma",
      "TypeScript",
    ],
    folders: [
      {
        path: "app/",
        purpose: "Frontend pages, server routes, and product workflow screens.",
      },
      {
        path: "components/",
        purpose: "Shared interface elements and feature-specific UI blocks.",
      },
      {
        path: "lib/",
        purpose:
          "Database client, auth helpers, services, and validation logic.",
      },
      {
        path: "prisma/",
        purpose: "Database schema, migrations, and seed data.",
      },
      {
        path: "tests/",
        purpose: "Feature, API, and integration tests for important workflows.",
      },
    ],
    files: [
      {
        path: "app/api/health/route.ts",
        purpose: "Simple backend route to confirm the API is alive.",
      },
      {
        path: "lib/db.ts",
        purpose: "Central database connection used by backend routes.",
      },
      {
        path: "lib/validators.ts",
        purpose: "Input validation before data reaches the database.",
      },
      {
        path: "prisma/schema.prisma",
        purpose: "Database models and relationships.",
      },
    ],
    features: [
      "Frontend and backend workflow",
      "Database schema",
      "API validation",
      "Auth/security boundary plan",
      "Deployment checklist",
    ],
    phases: [
      {
        title: "Model The Product",
        steps: [
          "Define users, records, and permissions.",
          "Map the screens to backend API routes.",
          "Design the first database schema.",
        ],
      },
      {
        title: "Connect Frontend And Backend",
        steps: [
          "Build API routes and service helpers.",
          "Create UI forms and lists.",
          "Add validation, loading states, and error states.",
        ],
      },
      {
        title: "Harden The System",
        steps: [
          "Add tests for core actions.",
          "Review auth and data access rules.",
          "Run build checks and prepare deployment configuration.",
        ],
      },
    ],
  },
  "ai-app": {
    type: "ai-app",
    label: "AI App",
    summary:
      "An AI-powered product with prompt design, chat or task workflows, model calls, memory, and safety controls.",
    stack: [
      "Next.js",
      "OpenAI API",
      "React",
      "TypeScript",
      "Vector store optional",
    ],
    folders: [
      {
        path: "app/",
        purpose: "Chat, workflow, dashboard, and settings screens.",
      },
      {
        path: "app/api/ai/",
        purpose: "Server routes that call the AI provider securely.",
      },
      {
        path: "components/ai/",
        purpose:
          "Chat panels, response cards, prompt controls, and result views.",
      },
      {
        path: "lib/ai/",
        purpose:
          "Model client, prompt builders, context packing, and safety helpers.",
      },
      {
        path: "data/",
        purpose: "Seed knowledge, examples, or local test fixtures.",
      },
    ],
    files: [
      {
        path: "lib/ai/client.ts",
        purpose:
          "Creates the AI client and keeps provider details in one place.",
      },
      {
        path: "lib/ai/prompts.ts",
        purpose: "Stores system prompts, task prompts, and formatting rules.",
      },
      {
        path: "app/api/ai/route.ts",
        purpose:
          "Receives user input, builds context, and returns model output.",
      },
      {
        path: "components/ai/ConversationPanel.tsx",
        purpose: "Displays messages, streaming state, and user input.",
      },
    ],
    features: [
      "Prompt architecture",
      "Conversation or task workflow",
      "Context and memory strategy",
      "Safety guardrails",
      "Human approval for edits/actions",
    ],
    phases: [
      {
        title: "Design The Intelligence",
        steps: [
          "Define the assistant role, inputs, and outputs.",
          "Write the first system prompt and response format.",
          "Decide what context the assistant needs.",
        ],
      },
      {
        title: "Build The AI Loop",
        steps: [
          "Create the API route and model client.",
          "Build the chat or task UI.",
          "Add loading, retry, and failure states.",
        ],
      },
      {
        title: "Make It Trustworthy",
        steps: [
          "Add safety rules and approval points.",
          "Log useful request metadata.",
          "Test with realistic examples and edge cases.",
        ],
      },
    ],
  },
  "desktop-app": {
    type: "desktop-app",
    label: "Desktop App",
    summary:
      "A local desktop product with an app shell, secure preload bridge, renderer UI, and packaging path.",
    stack: ["Electron", "Vite", "React", "TypeScript", "Node.js"],
    folders: [
      {
        path: "src/main/",
        purpose:
          "Electron main process, windows, menus, file access, and IPC handlers.",
      },
      {
        path: "src/preload/",
        purpose:
          "Safe bridge between the renderer and local desktop capabilities.",
      },
      {
        path: "src/renderer/",
        purpose: "React interface, screens, panels, and app styling.",
      },
      {
        path: "assets/",
        purpose:
          "Icons, installers, app images, and desktop packaging resources.",
      },
      {
        path: "release/",
        purpose: "Built installers and packaged desktop outputs.",
      },
    ],
    files: [
      {
        path: "src/main/index.ts",
        purpose: "Creates the app window and registers desktop IPC actions.",
      },
      {
        path: "src/preload/index.ts",
        purpose:
          "Exposes safe APIs to the renderer without enabling Node in the UI.",
      },
      {
        path: "src/renderer/src/App.tsx",
        purpose: "Main desktop UI and user workflow.",
      },
      {
        path: "electron.vite.config.ts",
        purpose: "Build configuration for main, preload, and renderer bundles.",
      },
    ],
    features: [
      "Desktop window shell",
      "Secure IPC bridge",
      "Local file or system access plan",
      "Auto-update/package path",
      "Crash and error handling",
    ],
    phases: [
      {
        title: "Define Local Capabilities",
        steps: [
          "List what the app needs from the machine.",
          "Create safe IPC channels for those actions.",
          "Keep direct system access out of the renderer.",
        ],
      },
      {
        title: "Build The Desktop Workflow",
        steps: [
          "Create the main window and renderer layout.",
          "Wire UI actions through preload APIs.",
          "Add status, errors, and progress feedback.",
        ],
      },
      {
        title: "Package And Test",
        steps: [
          "Run dev and production builds.",
          "Test installed app behavior.",
          "Prepare installer assets and release notes.",
        ],
      },
    ],
  },
  "mobile-app": {
    type: "mobile-app",
    label: "Mobile App",
    summary:
      "A mobile-first application with screens, navigation, device-aware UI, and API integration.",
    stack: [
      "React Native",
      "Expo",
      "TypeScript",
      "API client",
      "SQLite optional",
    ],
    folders: [
      {
        path: "app/",
        purpose: "Mobile routes, tabs, stacks, and screen-level layouts.",
      },
      {
        path: "components/",
        purpose: "Reusable mobile UI components and controls.",
      },
      {
        path: "lib/",
        purpose:
          "API client, storage helpers, permissions, and formatting utilities.",
      },
      {
        path: "assets/",
        purpose: "Icons, splash art, images, fonts, and app store assets.",
      },
    ],
    files: [
      {
        path: "app/_layout.tsx",
        purpose: "Navigation shell and providers.",
      },
      {
        path: "app/index.tsx",
        purpose: "First mobile screen and primary user action.",
      },
      {
        path: "lib/api.ts",
        purpose: "Central API calls and request handling.",
      },
      {
        path: "app.json",
        purpose: "Expo app identity, permissions, and build settings.",
      },
    ],
    features: [
      "Mobile navigation",
      "Touch-friendly screens",
      "Offline/loading states",
      "Device permission plan",
      "Store-ready metadata",
    ],
    phases: [
      {
        title: "Plan The Mobile Flow",
        steps: [
          "Map the first 3 screens.",
          "Decide navigation style and core actions.",
          "List required device permissions.",
        ],
      },
      {
        title: "Build The Screens",
        steps: [
          "Create navigation and shared layout.",
          "Build touch-friendly components.",
          "Connect storage or backend APIs.",
        ],
      },
      {
        title: "Prepare For Devices",
        steps: [
          "Test on small and large viewports.",
          "Check permissions and offline behavior.",
          "Prepare app icon, splash screen, and builds.",
        ],
      },
    ],
  },
  game: {
    type: "game",
    label: "Game",
    summary:
      "A playable project with a game loop, scenes, input, assets, scoring, and release controls.",
    stack: ["Phaser", "TypeScript", "Vite", "Canvas/WebGL", "Asset pipeline"],
    folders: [
      {
        path: "src/scenes/",
        purpose: "Game scenes such as boot, menu, play, pause, and game over.",
      },
      {
        path: "src/entities/",
        purpose:
          "Player, enemies, items, projectiles, and interactive objects.",
      },
      {
        path: "src/systems/",
        purpose: "Physics, input, scoring, spawning, audio, and state systems.",
      },
      {
        path: "assets/",
        purpose: "Sprites, tilemaps, sounds, music, fonts, and UI art.",
      },
    ],
    files: [
      {
        path: "src/main.ts",
        purpose: "Creates the game instance and registers scenes.",
      },
      {
        path: "src/scenes/PlayScene.ts",
        purpose: "Core gameplay loop and level interaction.",
      },
      {
        path: "src/entities/Player.ts",
        purpose: "Player movement, input, collision, and animation.",
      },
      {
        path: "src/systems/ScoreSystem.ts",
        purpose: "Tracks score, win/loss conditions, and UI updates.",
      },
    ],
    features: [
      "Core gameplay loop",
      "Input and controls",
      "Scoring/win condition",
      "Asset loading",
      "Pause and restart flow",
    ],
    phases: [
      {
        title: "Prototype The Fun",
        steps: [
          "Define the player action and win/loss condition.",
          "Create one playable level or arena.",
          "Add placeholder assets and controls.",
        ],
      },
      {
        title: "Build Game Systems",
        steps: [
          "Add entities, collisions, and scoring.",
          "Add menus, restart, and pause states.",
          "Improve assets, sound, and feedback.",
        ],
      },
      {
        title: "Polish And Ship",
        steps: [
          "Balance difficulty and timing.",
          "Test performance in browser.",
          "Package a web build and add instructions.",
        ],
      },
    ],
  },
  api: {
    type: "api",
    label: "API / Backend",
    summary:
      "A backend service with routes, validation, storage, logging, and deployment boundaries.",
    stack: ["FastAPI", "Python", "Pydantic", "PostgreSQL or SQLite", "Pytest"],
    folders: [
      {
        path: "app/",
        purpose:
          "Backend package with routes, services, models, and app setup.",
      },
      {
        path: "app/routes/",
        purpose: "HTTP endpoints grouped by feature.",
      },
      {
        path: "app/services/",
        purpose: "Business logic kept separate from route handlers.",
      },
      {
        path: "tests/",
        purpose: "Unit and API tests for core behavior.",
      },
    ],
    files: [
      {
        path: "app/main.py",
        purpose: "Creates the FastAPI app and registers routes.",
      },
      {
        path: "app/routes/health.py",
        purpose: "Health endpoint for deployment and monitoring.",
      },
      {
        path: "app/models.py",
        purpose: "Request and response schemas.",
      },
      {
        path: "tests/test_health.py",
        purpose: "First test confirming the API starts and responds.",
      },
    ],
    features: [
      "Typed request/response models",
      "Health route",
      "Validation and errors",
      "Service layer",
      "Test coverage",
    ],
    phases: [
      {
        title: "Design The Contract",
        steps: [
          "List resources, routes, and response shapes.",
          "Define request validation models.",
          "Choose storage and environment variables.",
        ],
      },
      {
        title: "Build The Service",
        steps: [
          "Create routes and service functions.",
          "Add error handling and logging.",
          "Connect database or persistence.",
        ],
      },
      {
        title: "Verify The Backend",
        steps: [
          "Write API tests.",
          "Run local server checks.",
          "Document setup, routes, and deployment.",
        ],
      },
    ],
  },
  automation: {
    type: "automation",
    label: "Automation Tool",
    summary:
      "A scriptable tool that takes inputs, performs repeatable work, logs results, and can run on demand or schedule.",
    stack: [
      "Python",
      "Typer or argparse",
      "JSON/YAML config",
      "Logging",
      "Pytest",
    ],
    folders: [
      {
        path: "src/",
        purpose: "Automation package and reusable task modules.",
      },
      {
        path: "src/tasks/",
        purpose: "Individual automation tasks with clear inputs and outputs.",
      },
      {
        path: "config/",
        purpose: "Safe configuration examples and runtime settings.",
      },
      {
        path: "logs/",
        purpose: "Generated run logs and audit output.",
      },
      {
        path: "tests/",
        purpose: "Tests for parsing, task behavior, and failure handling.",
      },
    ],
    files: [
      {
        path: "src/main.py",
        purpose: "CLI entry point and task dispatcher.",
      },
      {
        path: "src/tasks/example_task.py",
        purpose: "First task implementation pattern.",
      },
      {
        path: "config/example.json",
        purpose: "Documented sample config without secrets.",
      },
      {
        path: "README.md",
        purpose: "Usage, commands, scheduling, and safety notes.",
      },
    ],
    features: [
      "CLI commands",
      "Config file support",
      "Logging and summaries",
      "Dry-run option",
      "Tests for repeatability",
    ],
    phases: [
      {
        title: "Define The Job",
        steps: [
          "Describe the repeated task and expected inputs.",
          "Choose CLI arguments and config format.",
          "Identify risky actions that need dry-run mode.",
        ],
      },
      {
        title: "Build The Runner",
        steps: [
          "Create the CLI entry point.",
          "Implement task modules and logging.",
          "Add validation before any action runs.",
        ],
      },
      {
        title: "Make It Reliable",
        steps: [
          "Add tests and sample configs.",
          "Document scheduling or manual run commands.",
          "Capture errors with clear recovery steps.",
        ],
      },
    ],
  },
  "security-tool": {
    type: "security-tool",
    label: "Security Tool",
    summary:
      "A security-focused system with scanning, findings, safe actions, reports, and careful approval boundaries.",
    stack: [
      "Python",
      "FastAPI optional",
      "Electron optional",
      "SQLite",
      "YARA optional",
    ],
    folders: [
      {
        path: "scanner/",
        purpose:
          "File, process, or system scan logic with isolated detection rules.",
      },
      {
        path: "reports/",
        purpose: "Generated scan summaries, findings, and exportable evidence.",
      },
      {
        path: "quarantine/",
        purpose: "Safe holding area metadata and restore workflow.",
      },
      {
        path: "ui/",
        purpose: "Dashboard or desktop interface for scans and findings.",
      },
      {
        path: "tests/",
        purpose: "Detection, false-positive, and restore-flow tests.",
      },
    ],
    files: [
      {
        path: "scanner/engine.py",
        purpose: "Coordinates scan targets, rules, and result collection.",
      },
      {
        path: "scanner/rules.py",
        purpose: "Detection rules and severity scoring.",
      },
      {
        path: "quarantine/store.py",
        purpose: "Moves, records, and restores quarantined files safely.",
      },
      {
        path: "reports/formatter.py",
        purpose: "Creates readable scan summaries for users.",
      },
    ],
    features: [
      "Scan workflow",
      "Severity scoring",
      "Quarantine and restore plan",
      "Report generation",
      "Approval before risky actions",
    ],
    phases: [
      {
        title: "Set Safety Boundaries",
        steps: [
          "Define what the tool can scan and what it cannot touch.",
          "Add dry-run and approval rules.",
          "Create severity levels and finding format.",
        ],
      },
      {
        title: "Build Detection Workflow",
        steps: [
          "Implement scanner engine and rules.",
          "Store findings and report output.",
          "Add quarantine metadata and restore logic.",
        ],
      },
      {
        title: "Validate Carefully",
        steps: [
          "Test with harmless sample files.",
          "Check false positives and restore behavior.",
          "Run security review before release.",
        ],
      },
    ],
  },
  "browser-extension": {
    type: "browser-extension",
    label: "Browser Extension",
    summary:
      "A browser add-on with manifest configuration, content scripts, background logic, and popup UI.",
    stack: [
      "Manifest V3",
      "TypeScript",
      "React optional",
      "Vite",
      "Chrome APIs",
    ],
    folders: [
      {
        path: "src/background/",
        purpose: "Background service worker and browser event handling.",
      },
      {
        path: "src/content/",
        purpose: "Scripts injected into matching web pages.",
      },
      {
        path: "src/popup/",
        purpose: "Extension popup UI and user controls.",
      },
      {
        path: "public/",
        purpose: "Manifest, icons, and static extension assets.",
      },
    ],
    files: [
      {
        path: "public/manifest.json",
        purpose: "Extension identity, permissions, matches, and entry points.",
      },
      {
        path: "src/background/index.ts",
        purpose: "Handles extension lifecycle and browser API events.",
      },
      {
        path: "src/content/index.ts",
        purpose: "Runs page-level behavior on allowed URLs.",
      },
      {
        path: "src/popup/App.tsx",
        purpose: "Popup controls and status display.",
      },
    ],
    features: [
      "Manifest permissions",
      "Popup controls",
      "Content script behavior",
      "Background worker",
      "Store packaging checklist",
    ],
    phases: [
      {
        title: "Define Extension Scope",
        steps: [
          "Choose matched sites and permissions.",
          "Decide what runs in the page versus background.",
          "Design the popup controls.",
        ],
      },
      {
        title: "Build Extension Parts",
        steps: [
          "Create manifest and assets.",
          "Implement content and background scripts.",
          "Wire popup actions to extension APIs.",
        ],
      },
      {
        title: "Package For Review",
        steps: [
          "Test permissions and install flow.",
          "Build the extension bundle.",
          "Prepare privacy notes and store listing materials.",
        ],
      },
    ],
  },
};

const universalProjectTemplates: Record<ProjectType, ProjectTemplate> = {
  ...projectTemplates,
  "business-launch": {
    type: "business-launch",
    label: "Business Launch",
    summary:
      "A business or service launch plan with audience, offer, operations, marketing, finances, and execution checkpoints.",
    stack: [
      "Offer strategy",
      "Market research",
      "Launch calendar",
      "Budget plan",
      "Sales materials",
    ],
    folders: [
      {
        path: "strategy/",
        purpose:
          "Business goals, audience definition, positioning, and success metrics.",
      },
      {
        path: "offer/",
        purpose:
          "Products, services, pricing, packages, and customer promises.",
      },
      {
        path: "marketing/",
        purpose:
          "Campaign plan, channels, content, launch messages, and promotion assets.",
      },
      {
        path: "operations/",
        purpose:
          "Daily process, tools, vendors, fulfillment, and customer support workflow.",
      },
      {
        path: "finance/",
        purpose:
          "Startup costs, revenue targets, pricing math, and basic cash tracking.",
      },
    ],
    files: [
      {
        path: "strategy/launch-brief.md",
        purpose:
          "One-page explanation of what is launching, who it serves, and why it matters.",
      },
      {
        path: "offer/pricing-plan.md",
        purpose: "Packages, pricing logic, discounts, and offer boundaries.",
      },
      {
        path: "marketing/content-calendar.md",
        purpose: "Launch posts, emails, videos, and promotion dates.",
      },
      {
        path: "finance/startup-budget.xlsx",
        purpose: "Estimated costs, revenue goals, and break-even planning.",
      },
    ],
    features: [
      "Clear target customer",
      "Defined offer and pricing",
      "Launch campaign",
      "Operational workflow",
      "Budget and success metrics",
    ],
    phases: [
      {
        title: "Clarify The Offer",
        steps: [
          "Define the customer, pain point, and promise.",
          "Choose the first offer and price range.",
          "List what must be ready before launch.",
        ],
      },
      {
        title: "Prepare The Launch",
        steps: [
          "Build sales materials and content calendar.",
          "Set up tools, payment flow, and support process.",
          "Create a launch checklist with owners and dates.",
        ],
      },
      {
        title: "Launch And Improve",
        steps: [
          "Run the campaign and track responses.",
          "Collect customer questions and objections.",
          "Adjust offer, messaging, and operations after the first results.",
        ],
      },
    ],
  },
  "event-plan": {
    type: "event-plan",
    label: "Event Plan",
    summary:
      "An event blueprint with goals, audience, venue/logistics, schedule, promotion, staffing, and follow-up.",
    stack: [
      "Run of show",
      "Guest list",
      "Venue/logistics",
      "Promotion plan",
      "Budget tracker",
    ],
    folders: [
      {
        path: "planning/",
        purpose: "Event goal, audience, theme, timeline, and decision log.",
      },
      {
        path: "logistics/",
        purpose:
          "Venue, equipment, food, travel, accessibility, and setup details.",
      },
      {
        path: "program/",
        purpose: "Agenda, speakers, activities, scripts, and run of show.",
      },
      {
        path: "promotion/",
        purpose:
          "Invites, registration copy, social posts, and reminder messages.",
      },
      {
        path: "follow-up/",
        purpose: "Survey, thank-you notes, photos, and post-event recap.",
      },
    ],
    files: [
      {
        path: "planning/event-brief.md",
        purpose:
          "Defines the event purpose, audience, date, and success measures.",
      },
      {
        path: "program/run-of-show.md",
        purpose: "Minute-by-minute schedule for the event team.",
      },
      {
        path: "logistics/vendor-checklist.md",
        purpose: "Tracks venue, food, equipment, signage, and staffing tasks.",
      },
      {
        path: "follow-up/survey-questions.md",
        purpose: "Collects feedback and next-step interest from attendees.",
      },
    ],
    features: [
      "Audience and purpose",
      "Run of show",
      "Logistics checklist",
      "Promotion timeline",
      "Post-event follow-up",
    ],
    phases: [
      {
        title: "Frame The Event",
        steps: [
          "Define the event goal and audience.",
          "Choose format, date, venue, and expected size.",
          "Create the first budget and timeline.",
        ],
      },
      {
        title: "Prepare Delivery",
        steps: [
          "Build the run of show.",
          "Confirm vendors, staffing, and materials.",
          "Send invites, reminders, and registration updates.",
        ],
      },
      {
        title: "Run And Follow Up",
        steps: [
          "Use the run of show during the event.",
          "Capture attendance, photos, questions, and issues.",
          "Send thank-you messages and collect feedback.",
        ],
      },
    ],
  },
  "research-project": {
    type: "research-project",
    label: "Research Project",
    summary:
      "A research plan with a question, sources, notes, analysis, evidence, and final report structure.",
    stack: [
      "Research question",
      "Source library",
      "Interview notes",
      "Analysis matrix",
      "Final report",
    ],
    folders: [
      {
        path: "question/",
        purpose: "Research objective, scope, assumptions, and key questions.",
      },
      {
        path: "sources/",
        purpose: "Articles, datasets, interviews, references, and citations.",
      },
      {
        path: "notes/",
        purpose: "Reading notes, observations, interview notes, and summaries.",
      },
      {
        path: "analysis/",
        purpose: "Themes, comparisons, evidence tables, and findings.",
      },
      {
        path: "report/",
        purpose: "Final recommendation, presentation, or written output.",
      },
    ],
    files: [
      {
        path: "question/research-brief.md",
        purpose:
          "Defines the question, why it matters, and what is in/out of scope.",
      },
      {
        path: "sources/source-log.xlsx",
        purpose:
          "Tracks each source, credibility, key points, and citation details.",
      },
      {
        path: "analysis/findings-matrix.md",
        purpose: "Connects evidence to themes, risks, and conclusions.",
      },
      {
        path: "report/final-report-outline.md",
        purpose:
          "Structures the final answer, recommendation, and evidence flow.",
      },
    ],
    features: [
      "Clear research question",
      "Source tracking",
      "Evidence matrix",
      "Findings and recommendations",
      "Final report outline",
    ],
    phases: [
      {
        title: "Define The Question",
        steps: [
          "Write the main question and sub-questions.",
          "Set scope, deadline, and expected output.",
          "Choose source types and quality standards.",
        ],
      },
      {
        title: "Collect And Analyze",
        steps: [
          "Gather sources and log citations.",
          "Take notes using a consistent format.",
          "Group evidence into findings and tensions.",
        ],
      },
      {
        title: "Synthesize The Answer",
        steps: [
          "Draft conclusions from evidence.",
          "Identify limitations and open questions.",
          "Prepare the report or presentation.",
        ],
      },
    ],
  },
  "education-plan": {
    type: "education-plan",
    label: "Education / Training",
    summary:
      "A learning or training plan with outcomes, lessons, activities, resources, assessments, and progress tracking.",
    stack: [
      "Learning outcomes",
      "Lesson plan",
      "Practice activities",
      "Assessment rubric",
      "Progress tracker",
    ],
    folders: [
      {
        path: "curriculum/",
        purpose:
          "Learning goals, lesson sequence, outcomes, and prerequisites.",
      },
      {
        path: "lessons/",
        purpose: "Lesson notes, examples, demos, and teaching scripts.",
      },
      {
        path: "activities/",
        purpose:
          "Exercises, assignments, labs, discussions, and practice tasks.",
      },
      {
        path: "assessment/",
        purpose: "Rubrics, quizzes, feedback forms, and progress checks.",
      },
      {
        path: "resources/",
        purpose:
          "Readings, videos, links, templates, and supporting materials.",
      },
    ],
    files: [
      {
        path: "curriculum/learning-path.md",
        purpose:
          "Maps the sequence from beginner understanding to final outcome.",
      },
      {
        path: "lessons/session-01.md",
        purpose: "First lesson plan with explanation, examples, and timing.",
      },
      {
        path: "activities/practice-set.md",
        purpose: "Exercises that help learners apply the concept.",
      },
      {
        path: "assessment/rubric.md",
        purpose:
          "Defines what good work looks like and how progress is judged.",
      },
    ],
    features: [
      "Learning outcomes",
      "Lesson sequence",
      "Practice activities",
      "Assessment plan",
      "Resource library",
    ],
    phases: [
      {
        title: "Design The Learning Path",
        steps: [
          "Define what learners should be able to do.",
          "Break the topic into sessions or modules.",
          "Choose examples and practice activities.",
        ],
      },
      {
        title: "Build The Materials",
        steps: [
          "Write lessons, activities, and resources.",
          "Create rubrics or checks for progress.",
          "Prepare support notes for common struggles.",
        ],
      },
      {
        title: "Teach And Iterate",
        steps: [
          "Run the training or self-study plan.",
          "Collect questions and performance gaps.",
          "Improve lessons and activities from feedback.",
        ],
      },
    ],
  },
  "creative-project": {
    type: "creative-project",
    label: "Creative / Media",
    summary:
      "A creative production plan with concept, story, assets, production schedule, review rounds, and publishing steps.",
    stack: [
      "Creative brief",
      "Moodboard",
      "Asset list",
      "Production schedule",
      "Publishing plan",
    ],
    folders: [
      {
        path: "brief/",
        purpose:
          "Concept, audience, tone, references, and creative constraints.",
      },
      {
        path: "assets/",
        purpose:
          "Images, video, audio, design files, copy, and source material.",
      },
      {
        path: "drafts/",
        purpose: "Working versions, scripts, sketches, edits, and rough cuts.",
      },
      {
        path: "reviews/",
        purpose: "Feedback notes, approval rounds, and revision decisions.",
      },
      {
        path: "final/",
        purpose: "Approved deliverables and publishing/export formats.",
      },
    ],
    files: [
      {
        path: "brief/creative-brief.md",
        purpose:
          "Explains the concept, audience, tone, and final deliverables.",
      },
      {
        path: "assets/asset-list.md",
        purpose: "Tracks needed visuals, audio, copy, rights, and owners.",
      },
      {
        path: "drafts/production-script.md",
        purpose: "Story, copy, shot list, or creative sequence.",
      },
      {
        path: "reviews/feedback-log.md",
        purpose: "Tracks feedback, decisions, and revision status.",
      },
    ],
    features: [
      "Creative brief",
      "Asset management",
      "Draft and review process",
      "Final deliverables",
      "Publishing checklist",
    ],
    phases: [
      {
        title: "Shape The Concept",
        steps: [
          "Define audience, tone, message, and deliverables.",
          "Gather references and creative constraints.",
          "Create an asset list and production schedule.",
        ],
      },
      {
        title: "Produce The Work",
        steps: [
          "Create drafts, scripts, designs, or cuts.",
          "Collect feedback in one review log.",
          "Revise toward the final deliverable.",
        ],
      },
      {
        title: "Publish And Archive",
        steps: [
          "Export final formats.",
          "Publish to the right channels.",
          "Archive source assets and lessons learned.",
        ],
      },
    ],
  },
  "operations-plan": {
    type: "operations-plan",
    label: "Operations / Process",
    summary:
      "A process-improvement blueprint with current-state mapping, SOPs, roles, tools, metrics, and rollout steps.",
    stack: [
      "Process map",
      "SOPs",
      "Role matrix",
      "Tool checklist",
      "Metrics dashboard",
    ],
    folders: [
      {
        path: "current-state/",
        purpose: "Existing process, pain points, bottlenecks, and risks.",
      },
      {
        path: "future-state/",
        purpose: "Improved workflow, decision points, and target experience.",
      },
      {
        path: "sops/",
        purpose: "Step-by-step operating procedures and handoff rules.",
      },
      {
        path: "training/",
        purpose: "Rollout materials, team guides, and adoption support.",
      },
      {
        path: "metrics/",
        purpose: "KPIs, tracking plan, review rhythm, and improvement log.",
      },
    ],
    files: [
      {
        path: "current-state/process-map.md",
        purpose: "Documents how the process works today.",
      },
      {
        path: "future-state/improvement-plan.md",
        purpose: "Defines the new process and why it is better.",
      },
      {
        path: "sops/main-sop.md",
        purpose: "Step-by-step procedure the team can follow.",
      },
      {
        path: "metrics/kpi-tracker.xlsx",
        purpose: "Tracks process performance before and after rollout.",
      },
    ],
    features: [
      "Current-state map",
      "Improved workflow",
      "SOP documentation",
      "Team rollout plan",
      "Metrics and feedback loop",
    ],
    phases: [
      {
        title: "Understand The Process",
        steps: [
          "Map the current workflow and handoffs.",
          "Identify delays, unclear ownership, and repeated errors.",
          "Choose measurable improvement goals.",
        ],
      },
      {
        title: "Design The Better Flow",
        steps: [
          "Create the future-state process.",
          "Write SOPs and role responsibilities.",
          "Prepare tools, templates, and training notes.",
        ],
      },
      {
        title: "Roll Out And Measure",
        steps: [
          "Pilot the process with a small group.",
          "Track metrics and friction points.",
          "Refine SOPs before broader rollout.",
        ],
      },
    ],
  },
  "product-design": {
    type: "product-design",
    label: "Product / Service Design",
    summary:
      "A product-design blueprint with user needs, requirements, user journeys, prototype plan, validation, and launch readiness.",
    stack: [
      "User research",
      "Requirements",
      "Journey map",
      "Prototype",
      "Validation plan",
    ],
    folders: [
      {
        path: "discovery/",
        purpose:
          "User needs, problem statement, market context, and assumptions.",
      },
      {
        path: "requirements/",
        purpose:
          "Must-have features, constraints, risks, and acceptance criteria.",
      },
      {
        path: "design/",
        purpose: "User journeys, wireframes, prototypes, and service flow.",
      },
      {
        path: "validation/",
        purpose: "User tests, feedback, experiments, and decision records.",
      },
      {
        path: "launch/",
        purpose: "Release plan, messaging, support plan, and success metrics.",
      },
    ],
    files: [
      {
        path: "discovery/problem-brief.md",
        purpose: "Defines the problem, users, constraints, and opportunity.",
      },
      {
        path: "requirements/mvp-scope.md",
        purpose:
          "Defines the smallest useful version and what is out of scope.",
      },
      {
        path: "design/user-journey.md",
        purpose:
          "Maps how users discover, use, and complete the product/service.",
      },
      {
        path: "validation/test-plan.md",
        purpose: "Plans how to test the idea before investing too much.",
      },
    ],
    features: [
      "Problem definition",
      "MVP scope",
      "User journey",
      "Prototype and validation",
      "Launch readiness",
    ],
    phases: [
      {
        title: "Discover The Need",
        steps: [
          "Define the user, problem, and desired outcome.",
          "List assumptions and what must be proven.",
          "Choose MVP boundaries.",
        ],
      },
      {
        title: "Design And Validate",
        steps: [
          "Map user journeys and core requirements.",
          "Create a prototype or service mockup.",
          "Test with target users and capture feedback.",
        ],
      },
      {
        title: "Prepare Launch",
        steps: [
          "Finalize scope and support workflow.",
          "Create launch messaging and success metrics.",
          "Plan iteration after first users or customers.",
        ],
      },
    ],
  },
};

const typeOptions = Object.values(universalProjectTemplates);

const exampleIdea =
  "Plan a community tech workshop that teaches beginners how to build a simple website, includes promotion, lesson materials, event logistics, and follow-up resources.";

function saveProjectConfig(project: ProjectConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem("svansai-config", JSON.stringify(project));
  window.dispatchEvent(new Event("vp-storage-updated"));
}

function saveProjectBlueprint(blueprint: ProjectBlueprint) {
  if (typeof window === "undefined") return;
  localStorage.setItem("vp-project-blueprint", JSON.stringify(blueprint));
  window.dispatchEvent(new Event("vp-storage-updated"));
}

function scoreIdea(idea: string, keywords: string[]): number {
  const normalized = idea.toLowerCase();
  return keywords.reduce(
    (score, keyword) => score + (normalized.includes(keyword) ? 1 : 0),
    0,
  );
}

function detectProjectType(idea: string): ProjectType {
  const scores: Array<{ type: ProjectType; score: number }> = [
    {
      type: "security-tool",
      score: scoreIdea(idea, [
        "antivirus",
        "scan",
        "scanner",
        "threat",
        "malware",
        "quarantine",
        "security",
        "shield",
      ]),
    },
    {
      type: "desktop-app",
      score: scoreIdea(idea, [
        "desktop",
        "electron",
        "installer",
        "local app",
        "windows app",
        "tray",
      ]),
    },
    {
      type: "ai-app",
      score: scoreIdea(idea, [
        "ai",
        "assistant",
        "chatbot",
        "agent",
        "prompt",
        "model",
        "copilot",
      ]),
    },
    {
      type: "game",
      score: scoreIdea(idea, [
        "game",
        "player",
        "level",
        "score",
        "enemy",
        "phaser",
        "unity",
      ]),
    },
    {
      type: "mobile-app",
      score: scoreIdea(idea, [
        "mobile",
        "ios",
        "android",
        "react native",
        "expo",
        "phone",
      ]),
    },
    {
      type: "browser-extension",
      score: scoreIdea(idea, [
        "extension",
        "browser",
        "chrome",
        "content script",
        "web extension",
      ]),
    },
    {
      type: "automation",
      score: scoreIdea(idea, [
        "automation",
        "script",
        "automate",
        "scheduled",
        "batch",
        "workflow",
      ]),
    },
    {
      type: "api",
      score: scoreIdea(idea, [
        "api",
        "backend",
        "server",
        "endpoint",
        "fastapi",
        "rest",
      ]),
    },
    {
      type: "full-stack-app",
      score: scoreIdea(idea, [
        "full stack",
        "database",
        "auth",
        "dashboard",
        "saas",
        "users",
        "admin",
      ]),
    },
    {
      type: "web-app",
      score: scoreIdea(idea, [
        "website",
        "web app",
        "landing",
        "portal",
        "frontend",
        "site",
      ]),
    },
    {
      type: "business-launch",
      score: scoreIdea(idea, [
        "business",
        "launch",
        "startup",
        "service",
        "sales",
        "pricing",
        "customer",
      ]),
    },
    {
      type: "event-plan",
      score: scoreIdea(idea, [
        "event",
        "workshop",
        "conference",
        "party",
        "meetup",
        "attendees",
        "venue",
      ]),
    },
    {
      type: "research-project",
      score: scoreIdea(idea, [
        "research",
        "study",
        "report",
        "sources",
        "analysis",
        "survey",
        "evidence",
      ]),
    },
    {
      type: "education-plan",
      score: scoreIdea(idea, [
        "teach",
        "training",
        "course",
        "lesson",
        "curriculum",
        "students",
        "learn",
      ]),
    },
    {
      type: "creative-project",
      score: scoreIdea(idea, [
        "creative",
        "video",
        "podcast",
        "campaign",
        "design",
        "brand",
        "content",
      ]),
    },
    {
      type: "operations-plan",
      score: scoreIdea(idea, [
        "process",
        "operations",
        "workflow",
        "sop",
        "team",
        "procedure",
        "systemize",
      ]),
    },
    {
      type: "product-design",
      score: scoreIdea(idea, [
        "product",
        "service design",
        "prototype",
        "mvp",
        "user journey",
        "requirements",
      ]),
    },
  ];

  const best = scores.sort((left, right) => right.score - left.score)[0];

  if (!best || best.score === 0) return "web-app";

  if (
    best.type === "security-tool" &&
    scoreIdea(idea, ["desktop", "app"]) > 0
  ) {
    return "security-tool";
  }

  return best.type;
}

function slugifyProjectName(idea: string): string {
  const cleaned = idea
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(
      /\b(build|create|make|an|a|the|with|that|for|to|and|app|application|tool|project)\b/g,
      "",
    )
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-");

  return cleaned || "new-project";
}

function createRootedEntries(
  projectName: string,
  entries: BlueprintEntry[],
): BlueprintEntry[] {
  return entries.map((entry) => ({
    ...entry,
    path: `${projectName}/${entry.path}`,
  }));
}

function makeDisplayName(pathValue: string): string {
  return pathValue.replace(/\/$/, "").split("/").pop() || pathValue;
}

function buildOutlineTree(
  projectName: string,
  folders: BlueprintEntry[],
  files: BlueprintEntry[],
): string[] {
  const lines = [`${projectName}/`];

  for (const folder of folders) {
    lines.push(`  ${makeDisplayName(folder.path)}/`);
    lines.push("    notes/");
    lines.push("    drafts/");
    lines.push("    final/");

    const folderFiles = files.filter((file) =>
      file.path.startsWith(folder.path),
    );
    for (const file of folderFiles) {
      lines.push(`    ${makeDisplayName(file.path)}`);
    }
  }

  const looseFiles = files.filter(
    (file) => !folders.some((folder) => file.path.startsWith(folder.path)),
  );

  for (const file of looseFiles) {
    lines.push(`  ${makeDisplayName(file.path)}`);
  }

  return lines;
}

function createSubfolderIdeas(folder: BlueprintEntry): BlueprintEntry[] {
  const basePath = folder.path;

  return [
    {
      path: `${basePath}notes/`,
      purpose:
        "Keep rough thoughts, questions, examples, links, and anything you are still figuring out.",
    },
    {
      path: `${basePath}drafts/`,
      purpose:
        "Keep first versions here so you can experiment without worrying about making it perfect.",
    },
    {
      path: `${basePath}final/`,
      purpose:
        "Keep the approved or ready-to-use version here once this section is cleaned up.",
    },
  ];
}

function createStarterPrompts(
  entry: BlueprintEntry,
  projectType: ProjectType,
): string[] {
  const name = makeDisplayName(entry.path);
  const basePrompts = [
    `What is ${name} supposed to help me decide, explain, build, or track?`,
    "What information do I already know, and what still needs to be figured out?",
    "What would make this good enough for a first version?",
  ];

  if (projectType === "game") {
    return [
      ...basePrompts,
      "What does the player do in the first 30 seconds?",
      "What should be fun, surprising, or rewarding about this part?",
    ];
  }

  if (projectType === "business-launch") {
    return [
      ...basePrompts,
      "Who is this for, and what problem does it solve for them?",
      "What is the simplest version I can launch first?",
    ];
  }

  if (projectType === "event-plan") {
    return [
      ...basePrompts,
      "Who needs this before, during, and after the event?",
      "What can go wrong, and what backup plan should I have?",
    ];
  }

  if (projectType === "research-project") {
    return [
      ...basePrompts,
      "What evidence supports this, and where did it come from?",
      "What conclusion can I safely make from the information I have?",
    ];
  }

  return [
    ...basePrompts,
    "Who will use or review this part?",
    "What is the next action after this is complete?",
  ];
}

function buildDeepOutline(
  type: ProjectType,
  folders: BlueprintEntry[],
  files: BlueprintEntry[],
): DeepOutlineSection[] {
  return folders.map((folder) => {
    const starterMaterials = files
      .filter((file) => file.path.startsWith(folder.path))
      .map((file) => ({
        ...file,
        prompts: createStarterPrompts(file, type),
      }));

    return {
      path: folder.path,
      purpose: folder.purpose,
      subfolders: createSubfolderIdeas(folder),
      starterMaterials,
      firstSteps: [
        `Open ${makeDisplayName(folder.path)} and write a short note explaining what this section is responsible for.`,
        "Add any examples, links, sketches, screenshots, or references that help explain the idea.",
        "Create the starter material listed below, even if the first version is only bullet points.",
        "Move the clean version into the final folder when this section is ready to use.",
      ],
    };
  });
}

function getTemplateForIdea(type: ProjectType, idea: string): ProjectTemplate {
  if (type === "game" && /\broblox\b/i.test(idea)) {
    return {
      ...universalProjectTemplates.game,
      label: "Roblox Game",
      summary:
        "A Roblox game plan with a clear game idea, maps, scripts, assets, testing, and publishing steps inside Roblox Studio.",
      stack: [
        "Roblox Studio",
        "Luau scripting",
        "Game design notes",
        "Asset list",
        "Playtesting checklist",
      ],
      folders: [
        {
          path: "game-design/",
          purpose:
            "The plain-English plan for the game: objective, rules, player actions, rewards, and win/loss conditions.",
        },
        {
          path: "maps-and-levels/",
          purpose:
            "Ideas for worlds, rooms, stages, obstacle paths, spawn points, and places players explore.",
        },
        {
          path: "scripts/",
          purpose:
            "Roblox Luau scripts for player actions, scoring, checkpoints, shop logic, enemies, or events.",
        },
        {
          path: "assets/",
          purpose:
            "Models, images, sounds, music, UI art, icons, and any items used in the Roblox experience.",
        },
        {
          path: "testing-and-publishing/",
          purpose:
            "Playtest notes, bugs, balancing changes, thumbnails, description, and publish checklist.",
        },
      ],
      files: [
        {
          path: "game-design/game-idea.md",
          purpose:
            "Explains what the player does, why it is fun, and what the main goal is.",
        },
        {
          path: "maps-and-levels/level-layout.md",
          purpose:
            "Sketches the first map or stage in words before building it in Roblox Studio.",
        },
        {
          path: "scripts/script-plan.md",
          purpose: "Lists the scripts needed and what each one should control.",
        },
        {
          path: "testing-and-publishing/playtest-checklist.md",
          purpose:
            "Tracks what to test before publishing, including bugs, difficulty, and player confusion.",
        },
      ],
      features: [
        "Clear player goal",
        "First playable map",
        "Basic scripts and interactions",
        "Reward or scoring system",
        "Playtest and publish checklist",
      ],
      phases: [
        {
          title: "Plan The Game",
          steps: [
            "Write what the player does in one sentence.",
            "Choose the first map, obstacle path, or activity.",
            "List the parts, scripts, and assets needed for the first version.",
          ],
        },
        {
          title: "Build The First Playable Version",
          steps: [
            "Create the map layout in Roblox Studio.",
            "Add player spawn, checkpoints, rewards, and basic scripts.",
            "Test the game from a new player's point of view.",
          ],
        },
        {
          title: "Polish And Publish",
          steps: [
            "Fix confusing spots and balance difficulty.",
            "Add thumbnail, title, description, and simple instructions.",
            "Publish privately first, playtest, then release publicly.",
          ],
        },
      ],
    };
  }

  return universalProjectTemplates[type];
}

function buildBlueprint(
  idea: string,
  forcedType: ProjectType | "auto",
): ProjectBlueprint {
  const projectName = slugifyProjectName(idea);
  const detectedType = detectProjectType(idea);
  const type = forcedType === "auto" ? detectedType : forcedType;
  const template = getTemplateForIdea(type, idea);
  const isAuto = forcedType === "auto";
  const folders = createRootedEntries(projectName, template.folders);
  const files = createRootedEntries(projectName, template.files);

  return {
    ...template,
    idea: idea.trim(),
    projectName,
    confidence: isAuto
      ? `Auto-detected as ${universalProjectTemplates[detectedType].label}`
      : `Manually set to ${template.label}`,
    folders,
    files,
    outlineTree: buildOutlineTree(projectName, folders, files),
    deepOutline: buildDeepOutline(type, folders, files),
    nextActions: [
      "Review the suggested toolkit and remove anything the project does not need.",
      "Create the workspace structure and first planning documents.",
      "Complete the first usable version before adding advanced extras.",
      "Review the plan, risks, timeline, and success measures before launch.",
    ],
  };
}

function getTypeIcon(type: ProjectType) {
  switch (type) {
    case "ai-app":
      return BrainCircuit;
    case "api":
      return TerminalSquare;
    case "automation":
      return Workflow;
    case "browser-extension":
      return Globe2;
    case "business-launch":
      return BriefcaseBusiness;
    case "creative-project":
      return Paintbrush;
    case "desktop-app":
      return MonitorCog;
    case "education-plan":
      return GraduationCap;
    case "event-plan":
      return CalendarDays;
    case "full-stack-app":
      return Database;
    case "game":
      return Gamepad2;
    case "mobile-app":
      return Smartphone;
    case "operations-plan":
      return Workflow;
    case "product-design":
      return Boxes;
    case "research-project":
      return SearchCheck;
    case "security-tool":
      return ShieldCheck;
    default:
      return AppWindow;
  }
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Sparkles;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-purple-300">
        <Icon size={18} />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
    </div>
  );
}

function BlueprintCard({
  entry,
  icon: Icon,
}: {
  entry: BlueprintEntry;
  icon: typeof FolderTree;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icon size={16} className="text-orange-300" />
        <span className="break-all">{entry.path}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{entry.purpose}</p>
    </div>
  );
}

function FolderOutlineBreakdown({
  blueprint,
}: {
  blueprint: ProjectBlueprint;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
      <SectionTitle
        icon={FolderTree}
        title="Outline Breakdown"
        subtitle="Plain-English instructions for how to use each folder and what to create first."
      />

      <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white">
            How to start this project
          </h3>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-zinc-300">
            <li>
              <span className="font-semibold text-white">
                1. Make one main folder:
              </span>{" "}
              use{" "}
              <span className="font-mono text-orange-200">
                {blueprint.projectName}/
              </span>{" "}
              as the home base so every note, asset, file, and decision stays
              together.
            </li>
            <li>
              <span className="font-semibold text-white">
                2. Add the sections shown in the folder tree:
              </span>{" "}
              each one has a job, so the project stays organized as it grows.
            </li>
            <li>
              <span className="font-semibold text-white">
                3. Fill the starter materials:
              </span>{" "}
              answer the prompts below in rough bullet points first.
            </li>
            <li>
              <span className="font-semibold text-white">
                4. Clean up later:
              </span>{" "}
              move polished work into each section&apos;s final folder.
            </li>
          </ol>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-white">
            Deep outline by section
          </h3>
          <div className="mt-3 space-y-4">
            {blueprint.deepOutline.map((section) => (
              <div
                key={section.path}
                className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
              >
                <p className="font-mono text-sm font-semibold text-orange-200">
                  {section.path}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {section.purpose}
                </p>

                <div className="mt-4 rounded-lg bg-zinc-900 p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Folder breakdown
                  </p>
                  <div className="mt-3 space-y-3">
                    {section.subfolders.map((subfolder) => (
                      <div key={subfolder.path}>
                        <p className="font-mono text-sm text-zinc-100">
                          {makeDisplayName(subfolder.path)}/
                        </p>
                        <p className="mt-1 text-sm leading-6 text-zinc-400">
                          {subfolder.purpose}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-zinc-900 p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    First steps
                  </p>
                  <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                    {section.firstSteps.map((step, index) => (
                      <li key={step}>
                        <span className="font-semibold text-white">
                          {index + 1}.
                        </span>{" "}
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-3 rounded-lg bg-zinc-900 p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Starter material prompts
                  </p>
                  {section.starterMaterials.length === 0 ? (
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      Start with a short overview note, a checklist, and a final
                      version once this section is ready.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {section.starterMaterials.map((material) => (
                        <div
                          key={material.path}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"
                        >
                          <p className="font-mono text-sm text-zinc-100">
                            {makeDisplayName(material.path)}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-zinc-400">
                            {material.purpose}
                          </p>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                            {material.prompts.map((prompt) => (
                              <li key={prompt} className="flex gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-300" />
                                {prompt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderTreePanel({ blueprint }: { blueprint: ProjectBlueprint }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
      <SectionTitle
        icon={FolderTree}
        title="Deep Folder Tree"
        subtitle="The actual folder and material layout to create."
      />
      <pre className="mt-5 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-black p-5 font-mono text-sm leading-7 text-zinc-200">
        {blueprint.outlineTree.join("\n")}
      </pre>
    </div>
  );
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
  const [selectedType, setSelectedType] = useState<ProjectType | "auto">(
    "auto",
  );
  const [status, setStatus] = useState("");

  const generatedPlan = useMemo(() => {
    if (!idea.trim()) return null;
    return buildBlueprint(idea, selectedType);
  }, [idea, selectedType]);

  const handleSave = () => {
    saveProjectConfig(project);
    setStatus("Project configuration saved.");
  };

  const handleSaveBlueprint = () => {
    if (!generatedPlan) return;
    saveProjectBlueprint(generatedPlan);
    setStatus("Project blueprint saved for Sandbox.");
  };

  const activeTypeIcon = generatedPlan ? getTypeIcon(generatedPlan.type) : Bot;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 shadow-lg">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-sm text-purple-200">
              <Sparkles size={16} />
              Project Architect
            </div>
            <h1 className="text-4xl font-bold text-white">Projects</h1>
            <p className="mt-3 max-w-3xl text-zinc-400">
              Turn a rough idea into a practical blueprint with project type,
              toolkit, structure, key materials, phases, and handoff guidance.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">
                Architect
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {project.aiName}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">
                Blueprint
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {generatedPlan ? generatedPlan.label : "Waiting"}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">
                Output
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                Plan + Steps
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
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
                  Project Architect Name
                </label>
                <input
                  type="text"
                  value={project.aiName}
                  onChange={(event) =>
                    setProject((prev) => ({
                      ...prev,
                      aiName: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Architect Role
                </label>
                <input
                  type="text"
                  value={project.role}
                  onChange={(event) =>
                    setProject((prev) => ({
                      ...prev,
                      role: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Planning Purpose
                </label>
                <textarea
                  value={project.purpose}
                  onChange={(event) =>
                    setProject((prev) => ({
                      ...prev,
                      purpose: event.target.value,
                    }))
                  }
                  className="min-h-[110px] w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Core System Prompt
                </label>
                <textarea
                  value={project.systemPrompt}
                  onChange={(event) =>
                    setProject((prev) => ({
                      ...prev,
                      systemPrompt: event.target.value,
                    }))
                  }
                  className="min-h-[130px] w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={handleSave}
                className="rounded-xl bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
              >
                Save Architect
              </button>

              <Link
                href="/sandbox"
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
              >
                Open Sandbox
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
            <SectionTitle
              icon={ClipboardList}
              title="Project Request"
              subtitle="Describe anything you want to create, organize, launch, teach, research, improve, or build."
            />

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Project Idea
              </label>
              <textarea
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="Example: Plan a community workshop, launch a business, organize research, build an app, design a product, create a media project, or improve a team process."
                className="min-h-[180px] w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-purple-500"
              />
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Project Type
              </label>
              <select
                value={selectedType}
                onChange={(event) =>
                  setSelectedType(event.target.value as ProjectType | "auto")
                }
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-purple-500"
              >
                <option value="auto">Auto-detect best fit</option>
                {typeOptions.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIdea(exampleIdea)}
                className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
              >
                Load Example
              </button>
              <button
                type="button"
                onClick={handleSaveBlueprint}
                disabled={!generatedPlan}
                className="rounded-xl bg-gradient-to-r from-purple-500 to-orange-400 px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Blueprint
              </button>
            </div>

            {status && <p className="mt-4 text-sm text-green-400">{status}</p>}
          </div>

          {generatedPlan && (
            <FolderOutlineBreakdown blueprint={generatedPlan} />
          )}
        </section>

        <section className="space-y-6">
          {!generatedPlan ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center shadow-lg">
              <Sparkles className="mx-auto text-purple-300" size={34} />
              <h2 className="mt-4 text-2xl font-semibold text-white">
                Describe a project to generate a blueprint
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
                The output will include project type, toolkit, workspace
                structure, key materials, checklist, and project phases.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-sm text-orange-200">
                      {React.createElement(activeTypeIcon, { size: 16 })}
                      {generatedPlan.confidence}
                    </div>
                    <h2 className="text-3xl font-bold text-white">
                      {generatedPlan.projectName}
                    </h2>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                      {generatedPlan.summary}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/sandbox"
                      onClick={handleSaveBlueprint}
                      className="inline-flex items-center gap-2 rounded-xl bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
                    >
                      <Rocket size={16} />
                      Send To Sandbox
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
                  <SectionTitle
                    icon={Layers3}
                    title="Recommended Toolkit"
                    subtitle="Methods, tools, documents, and resources for this type of project."
                  />
                  <div className="mt-5 flex flex-wrap gap-2">
                    {generatedPlan.stack.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
                  <SectionTitle
                    icon={ListChecks}
                    title="Success Checklist"
                    subtitle="Handle these before polishing advanced extras."
                  />
                  <div className="mt-5 space-y-3">
                    {generatedPlan.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300"
                      >
                        <CheckCircle2
                          size={17}
                          className="mt-0.5 shrink-0 text-green-300"
                        />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
                <SectionTitle
                  icon={FolderTree}
                  title="Suggested Project Structure"
                  subtitle="Workspace sections the project should start with, plus why each one exists."
                />
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {generatedPlan.folders.map((folder) => (
                    <BlueprintCard
                      key={folder.path}
                      entry={folder}
                      icon={FolderTree}
                    />
                  ))}
                </div>
              </div>

              <FolderTreePanel blueprint={generatedPlan} />

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
                <SectionTitle
                  icon={FileCode2}
                  title="Starter Materials"
                  subtitle="Key documents, files, assets, or deliverables that give the project a working spine."
                />
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {generatedPlan.files.map((file) => (
                    <BlueprintCard key={file.path} entry={file} icon={Code2} />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
                <SectionTitle
                  icon={Boxes}
                  title="Project Phases"
                  subtitle="A step-by-step path from idea to finished outcome."
                />
                <div className="mt-5 grid gap-4">
                  {generatedPlan.phases.map((phase, index) => (
                    <div
                      key={phase.title}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 text-sm font-bold text-white">
                          {index + 1}
                        </span>
                        <h3 className="font-semibold text-white">
                          {phase.title}
                        </h3>
                      </div>
                      <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-300">
                        {phase.steps.map((step) => (
                          <li key={step} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-300" />
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-lg">
                <SectionTitle
                  icon={Rocket}
                  title="Next Actions"
                  subtitle="Use this list to move the plan into the build workflow."
                />
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {generatedPlan.nextActions.map((action) => (
                    <div
                      key={action}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm leading-6 text-zinc-300"
                    >
                      {action}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
