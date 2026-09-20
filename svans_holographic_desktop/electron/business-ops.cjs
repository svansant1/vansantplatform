"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/**
 * Business-ops layer — local CRM-shaped data: leads, a revenue log, KPI
 * targets, and proposal drafts. Everything here is local data manipulation;
 * nothing sends anything externally (that's what the social connectors and,
 * eventually, an email connector are for). Because of that it sits behind
 * the same "files"-tier trust level rather than "research"/"social" — it
 * doesn't leave the device on its own.
 *
 * Proposal drafting calls the same chat model already used elsewhere, via
 * an injected chatFn, so it doesn't need its own AI credentials.
 */

function createBusinessOps({ storagePath, chatFn }) {
  if (typeof chatFn !== "function") {
    throw new Error("A chatFn(promptText) is required for proposal drafting.");
  }

  let data = load();

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(storagePath, "utf8"));
      return {
        leads: Array.isArray(raw.leads) ? raw.leads : [],
        revenue: Array.isArray(raw.revenue) ? raw.revenue : [],
        kpis: Array.isArray(raw.kpis) ? raw.kpis : [],
        proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
      };
    } catch {
      return { leads: [], revenue: [], kpis: [], proposals: [] };
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 2));
  }

  // --- Leads ---
  function addLead(payload) {
    const name = String(payload?.name || "").trim();
    if (!name) throw new Error("A lead name is required.");
    const lead = {
      id: crypto.randomUUID(),
      name,
      source: String(payload?.source || "unspecified").trim(),
      status: "new", // new | contacted | qualified | won | lost
      value: Number(payload?.value) || 0,
      notes: String(payload?.notes || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.leads.unshift(lead);
    persist();
    return { message: `Added lead: ${name}.`, title: "LEAD ADDED", lines: [`${name} · ${lead.source}${lead.value ? ` · $${lead.value}` : ""}`], lead };
  }

  function updateLeadStatus(payload) {
    const id = String(payload?.id || "");
    const lead = data.leads.find((entry) => entry.id === id || entry.name.toLowerCase() === String(payload?.name || "").toLowerCase());
    if (!lead) throw new Error("No matching lead found.");
    const status = String(payload?.status || "").toLowerCase();
    if (!["new", "contacted", "qualified", "won", "lost"].includes(status)) {
      throw new Error("Status must be one of: new, contacted, qualified, won, lost.");
    }
    lead.status = status;
    lead.updatedAt = new Date().toISOString();
    persist();
    return { message: `${lead.name} moved to ${status}.`, title: "LEAD UPDATED", lines: [`${lead.name} → ${status}`], lead };
  }

  function listLeads() {
    const lines = data.leads.slice(0, 30).map((lead) => `${lead.name} · ${lead.status}${lead.value ? ` · $${lead.value}` : ""}`);
    return { message: data.leads.length ? `${data.leads.length} leads on file.` : "No leads on file yet.", title: "LEADS", lines, leads: data.leads };
  }

  // --- Revenue ---
  function logRevenue(payload) {
    const amount = Number(payload?.amount);
    if (!Number.isFinite(amount) || amount === 0) throw new Error("A nonzero revenue amount is required.");
    const entry = {
      id: crypto.randomUUID(),
      amount,
      source: String(payload?.source || "unspecified").trim(),
      category: String(payload?.category || "general").trim(),
      date: payload?.date ? new Date(payload.date).toISOString() : new Date().toISOString(),
      notes: String(payload?.notes || "").trim(),
    };
    data.revenue.unshift(entry);
    persist();
    return { message: `Logged $${amount} from ${entry.source}.`, title: "REVENUE LOGGED", lines: [`$${amount} · ${entry.source} · ${entry.category}`], entry };
  }

  function revenueSummary(payload) {
    const days = Number(payload?.days) > 0 ? Number(payload.days) : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const inWindow = data.revenue.filter((entry) => new Date(entry.date).getTime() >= cutoff);
    const total = inWindow.reduce((sum, entry) => sum + entry.amount, 0);
    const byCategory = {};
    for (const entry of inWindow) byCategory[entry.category] = (byCategory[entry.category] || 0) + entry.amount;
    const lines = [
      `Total (last ${days}d): $${total.toFixed(2)}`,
      ...Object.entries(byCategory).map(([category, sum]) => `${category}: $${sum.toFixed(2)}`),
    ];
    return { message: `$${total.toFixed(2)} in revenue over the last ${days} days.`, title: "REVENUE SUMMARY", lines, total, byCategory, days };
  }

  // --- KPIs ---
  function setKpi(payload) {
    const name = String(payload?.name || "").trim();
    if (!name) throw new Error("A KPI name is required.");
    const target = Number(payload?.target);
    const current = Number(payload?.current);
    let kpi = data.kpis.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!kpi) {
      kpi = { id: crypto.randomUUID(), name, target: 0, current: 0, unit: String(payload?.unit || "").trim() };
      data.kpis.push(kpi);
    }
    if (Number.isFinite(target)) kpi.target = target;
    if (Number.isFinite(current)) kpi.current = current;
    if (payload?.unit) kpi.unit = String(payload.unit).trim();
    kpi.updatedAt = new Date().toISOString();
    persist();
    const pct = kpi.target ? Math.round((kpi.current / kpi.target) * 100) : 0;
    return { message: `${kpi.name}: ${kpi.current}/${kpi.target}${kpi.unit ? ` ${kpi.unit}` : ""} (${pct}%).`, title: "KPI UPDATED", lines: [`${kpi.name}: ${pct}% of target`], kpi };
  }

  function listKpis() {
    const lines = data.kpis.map((kpi) => {
      const pct = kpi.target ? Math.round((kpi.current / kpi.target) * 100) : 0;
      return `${kpi.name}: ${kpi.current}/${kpi.target}${kpi.unit ? ` ${kpi.unit}` : ""} (${pct}%)`;
    });
    return { message: data.kpis.length ? `${data.kpis.length} KPIs tracked.` : "No KPIs set yet.", title: "KPI DASHBOARD", lines, kpis: data.kpis };
  }

  // --- Proposals (drafting only — sending is a future email-connector phase) ---
  async function generateProposal(payload) {
    const clientName = String(payload?.clientName || "").trim();
    const brief = String(payload?.brief || "").trim();
    if (!clientName || !brief) throw new Error("A client name and a brief description of the work are required.");
    const prompt = [
      `Draft a short, professional business proposal.`,
      `Client: ${clientName}`,
      `Scope/brief: ${brief}`,
      `Keep it to a few concise paragraphs: what's being proposed, rough scope, and a closing line inviting next steps. No placeholder brackets — write it as a finished draft.`,
    ].join("\n");
    const content = await chatFn(prompt);
    const proposal = {
      id: crypto.randomUUID(),
      clientName,
      brief,
      content,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    data.proposals.unshift(proposal);
    persist();
    return { message: `Drafted a proposal for ${clientName}.`, title: "PROPOSAL DRAFTED", lines: [content.slice(0, 400)], proposal };
  }

  function listProposals() {
    const lines = data.proposals.slice(0, 20).map((entry) => `${entry.clientName} · ${entry.status} · ${new Date(entry.createdAt).toLocaleDateString()}`);
    return { message: data.proposals.length ? `${data.proposals.length} proposals on file.` : "No proposals drafted yet.", title: "PROPOSALS", lines, proposals: data.proposals };
  }

  // --- Dashboard rollup ---
  function summary() {
    const openLeads = data.leads.filter((entry) => !["won", "lost"].includes(entry.status)).length;
    const wonLeads = data.leads.filter((entry) => entry.status === "won").length;
    const revenue30 = revenueSummary({ days: 30 });
    const lines = [
      `Open leads: ${openLeads}`,
      `Won leads: ${wonLeads}`,
      `Revenue (30d): $${revenue30.total.toFixed(2)}`,
      `KPIs tracked: ${data.kpis.length}`,
      `Proposals drafted: ${data.proposals.length}`,
    ];
    return { message: `${openLeads} open leads, $${revenue30.total.toFixed(2)} in the last 30 days.`, title: "BUSINESS SUMMARY", lines };
  }

  async function execute(action, payload) {
    switch (action) {
      case "addLead": return addLead(payload);
      case "updateLeadStatus": return updateLeadStatus(payload);
      case "listLeads": return listLeads();
      case "logRevenue": return logRevenue(payload);
      case "revenueSummary": return revenueSummary(payload);
      case "setKpi": return setKpi(payload);
      case "listKpis": return listKpis();
      case "generateProposal": return generateProposal(payload);
      case "listProposals": return listProposals();
      case "summary": return summary();
      default: throw new Error(`Unknown business action "${action}".`);
    }
  }

  return { execute };
}

module.exports = { createBusinessOps };
