"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/**
 * Agent orchestrator — turns a goal into a sequence of steps and runs them
 * through the same action-engine.execute() dispatcher everything else in
 * SVANS already uses. It does not introduce a second permission system:
 * every step still passes through action-engine's own requirePermission()
 * checks, so a task can't do anything a manually-typed command couldn't.
 *
 * Safety posture, matching the rest of the app ("External actions: ASK
 * before execution" in the Shield panel):
 *   - Any step that posts/sends/messages externally, or touches process /
 *     session / admin control, ALWAYS pauses for owner approval — even for
 *     a scheduled task running while you're away. There is no "auto-approve
 *     everything" mode. That's deliberate: background automation should
 *     never be able to post on your behalf unattended.
 *   - Read-only steps (list/search/open/read/fetch/web_search/chat) run
 *     without a pause, same as if you'd typed the command yourself.
 */

const SENSITIVE_TYPES = new Set([
  "close_app",
  "lock_computer",
  "flush_dns",
  "emergency_stop",
]);

function isSensitiveStep(step) {
  if (step.requiresApproval) return true;
  if (String(step.type || "").startsWith("social:")) return true;
  return SENSITIVE_TYPES.has(step.type);
}

const ALLOWED_STEP_TYPES = [
  "list_directory", "open_folder", "search_files", "open_path",
  "list_processes", "list_apps", "launch_app", "close_app",
  "lock_computer", "flush_dns",
  "open_url", "read_file", "fetch_page", "web_search",
  "social:reddit.checkInbox", "social:x.postUpdate", "social:facebook.postToPage",
  "social:instagram.postImage", "social:threads.postText", "social:youtube.channelStats",
  "social:youtube.recentComments", "social:tiktok.postVideoFromUrl", "social:discord.sendMessage",
  "business:addLead", "business:updateLeadStatus", "business:listLeads",
  "business:logRevenue", "business:revenueSummary", "business:setKpi", "business:listKpis",
  "business:generateProposal", "business:listProposals", "business:summary",
  "chat", // ask the SVANS chat model something; result is stored, not executed as an action
  "notify", // no-op checkpoint that just surfaces a message to the owner
];

function createAgentOrchestrator({ actionEngine, chatFn, storagePath, onUpdate = () => {}, onAudit = () => {} }) {
  if (!actionEngine || typeof actionEngine.execute !== "function") {
    throw new Error("An actionEngine with execute() is required.");
  }
  if (typeof chatFn !== "function") {
    throw new Error("A chatFn(promptText) is required for task planning and 'chat' steps.");
  }

  let tasks = loadTasks();
  const runningTaskIds = new Set();

  function loadTasks() {
    try {
      const raw = fs.readFileSync(storagePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      fs.writeFileSync(storagePath, JSON.stringify(tasks, null, 2));
    } catch {
      // Best-effort persistence — an in-memory task can still finish this session even if the write fails.
    }
  }

  function findTask(taskId) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) throw new Error("No task found with that ID.");
    return task;
  }

  function touch(task) {
    task.updatedAt = new Date().toISOString();
    persist();
    onUpdate(task);
  }

  function audit(action, detail) {
    onAudit({ action, detail, timestamp: new Date().toISOString() });
  }

  // --- Planning: ask the model to break a goal into steps from the allowed registry ---
  async function planTask(goal, { runAt = null } = {}) {
    const trimmedGoal = String(goal || "").trim();
    if (!trimmedGoal) throw new Error("A goal is required to plan a task.");

    const planningPrompt = [
      `Break the following goal into a short ordered list of concrete steps SVANS can execute.`,
      `Goal: "${trimmedGoal}"`,
      ``,
      `Respond with ONLY a JSON array, no prose, no code fences. Each item must be:`,
      `{"type": one of ${JSON.stringify(ALLOWED_STEP_TYPES)}, "payload": {...appropriate fields...}, "description": "short human-readable summary of this step"}`,
      ``,
      `Rules: use "chat" for anything that's just asking a question or summarizing, with payload {"prompt": "..."}.`,
      `Use "notify" as a final step with payload {"message": "..."} to report back what was accomplished.`,
      `Keep it to 6 steps or fewer. Only use action types from the allowed list — never invent a new type.`,
    ].join("\n");

    const raw = await chatFn(planningPrompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    let steps;
    try {
      steps = JSON.parse(cleaned);
    } catch {
      throw new Error("The planner did not return valid step JSON. Try rephrasing the goal.");
    }
    if (!Array.isArray(steps) || !steps.length) throw new Error("The planner returned no steps.");

    const normalizedSteps = steps.slice(0, 10).map((entry) => {
      const type = String(entry?.type || "");
      if (!ALLOWED_STEP_TYPES.includes(type)) {
        throw new Error(`Planner produced an unsupported step type: "${type}".`);
      }
      return {
        id: crypto.randomUUID(),
        type,
        payload: entry?.payload && typeof entry.payload === "object" ? entry.payload : {},
        description: String(entry?.description || type).slice(0, 200),
        status: "pending", // pending | awaiting_approval | running | completed | failed | skipped
        result: null,
        error: null,
      };
    });

    const task = {
      id: crypto.randomUUID(),
      goal: trimmedGoal,
      steps: normalizedSteps,
      cursor: 0,
      status: runAt ? "scheduled" : "awaiting_start", // scheduled | awaiting_start | running | awaiting_approval | paused | completed | failed | cancelled
      runAt: runAt || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tasks.push(task);
    persist();
    audit("agent_task_planned", `${task.id} · ${trimmedGoal}`);
    onUpdate(task);
    return task;
  }

  // --- Execution loop ---
  async function runTask(taskId) {
    const task = findTask(taskId);
    if (runningTaskIds.has(taskId)) return task; // already running, don't double-drive it
    if (["completed", "cancelled"].includes(task.status)) return task;

    runningTaskIds.add(taskId);
    task.status = "running";
    touch(task);

    try {
      while (task.cursor < task.steps.length) {
        const step = task.steps[task.cursor];
        if (step.status === "skipped" || step.status === "completed") {
          task.cursor += 1;
          continue;
        }

        if (isSensitiveStep(step) && step.status !== "approved") {
          step.status = "awaiting_approval";
          task.status = "awaiting_approval";
          touch(task);
          runningTaskIds.delete(taskId);
          return task; // pause here until approveStep() is called
        }

        step.status = "running";
        touch(task);
        try {
          step.result = await runStep(step);
          step.status = "completed";
        } catch (error) {
          step.status = "failed";
          step.error = error instanceof Error ? error.message : String(error);
          task.status = "failed";
          touch(task);
          audit("agent_task_failed", `${task.id} · step ${task.cursor} · ${step.error}`);
          runningTaskIds.delete(taskId);
          return task;
        }
        task.cursor += 1;
        touch(task);
      }
      task.status = "completed";
      audit("agent_task_completed", task.id);
      touch(task);
    } finally {
      runningTaskIds.delete(taskId);
    }
    return task;
  }

  async function runStep(step) {
    if (step.type === "chat") {
      const reply = await chatFn(String(step.payload?.prompt || ""));
      return { message: reply };
    }
    if (step.type === "notify") {
      return { message: String(step.payload?.message || "Checkpoint reached.") };
    }
    return actionEngine.execute({ type: step.type, payload: step.payload });
  }

  async function approveStep(taskId) {
    const task = findTask(taskId);
    const step = task.steps[task.cursor];
    if (!step || step.status !== "awaiting_approval") throw new Error("No step is currently awaiting approval on this task.");
    step.status = "approved";
    audit("agent_step_approved", `${task.id} · ${step.description}`);
    touch(task);
    return runTask(taskId);
  }

  async function rejectStep(taskId, reason) {
    const task = findTask(taskId);
    const step = task.steps[task.cursor];
    if (!step || step.status !== "awaiting_approval") throw new Error("No step is currently awaiting approval on this task.");
    step.status = "skipped";
    step.error = String(reason || "Rejected by owner.");
    task.status = "paused";
    audit("agent_step_rejected", `${task.id} · ${step.description}`);
    task.cursor += 1;
    touch(task);
    return task;
  }

  function cancelTask(taskId) {
    const task = findTask(taskId);
    task.status = "cancelled";
    audit("agent_task_cancelled", task.id);
    touch(task);
    return task;
  }

  function listTasks() {
    return tasks.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  // Called periodically by main.cjs to start any scheduled tasks whose time has come.
  function tickScheduler() {
    const now = Date.now();
    for (const task of tasks) {
      if (task.status === "scheduled" && task.runAt && new Date(task.runAt).getTime() <= now) {
        task.status = "awaiting_start";
        void runTask(task.id);
      }
    }
  }

  return { planTask, runTask, approveStep, rejectStep, cancelTask, listTasks, tickScheduler };
}

module.exports = { createAgentOrchestrator, ALLOWED_STEP_TYPES };
