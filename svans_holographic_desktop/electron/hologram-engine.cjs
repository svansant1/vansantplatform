"use strict";

/**
 * Keyless online 3D asset resolver.
 *
 * Searches public, license-conscious model libraries for existing GLB assets,
 * validates every download, and caches accepted models locally. It never
 * scrapes arbitrary download sites and never contacts a paid generation API.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_MODEL_BYTES = 90 * 1024 * 1024;
const KHONOS_INDEX = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json";
const KHONOS_ROOT = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";
const SMITHSONIAN_SEARCH = "https://3d-api.si.edu/api/v1.0/content/file/search";
const STOP_WORDS = new Set(["a", "an", "and", "for", "from", "hologram", "holographic", "model", "of", "the", "with"]);

function normalizedTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token) && !/^\d{4}$/.test(token));
}

function relevance(subject, title) {
  const wanted = [...new Set(normalizedTokens(subject))];
  const offered = new Set(normalizedTokens(title));
  if (!wanted.length || !offered.size) return 0;
  const matches = wanted.filter((token) => offered.has(token)).length;
  const coverage = matches / wanted.length;
  const cleanSubject = wanted.join(" ");
  const cleanTitle = [...offered].join(" ");
  const phraseBonus = cleanTitle.includes(cleanSubject) || cleanSubject.includes(cleanTitle) ? 0.3 : 0;
  const startsWithSubject = cleanTitle.startsWith(cleanSubject) ? 0.25 : 0;
  const unrelatedWordPenalty = Math.max(0, offered.size - wanted.length) * 0.02;
  return coverage + phraseBonus + startsWithSubject - unrelatedWordPenalty;
}

function requestSignal(signal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

async function fetchJson(url, timeoutMs = 18_000, signal) {
  const response = await fetch(url, { signal: requestSignal(signal, timeoutMs) });
  if (!response.ok) throw new Error(`Library request failed (${response.status}).`);
  return response.json();
}

async function searchSmithsonian(subject, signal) {
  const url = `${SMITHSONIAN_SEARCH}?q=${encodeURIComponent(subject)}&file_type=glb&file_quality=Medium&rows=25`;
  const payload = await fetchJson(url, 18_000, signal);
  return (Array.isArray(payload?.rows) ? payload.rows : [])
    .map((row) => ({
      title: String(row?.title || "Smithsonian 3D object"),
      url: String(row?.content?.uri || ""),
      source: "Smithsonian Open Access",
      sourcePage: row?.content?.model_url ? `https://3d.si.edu/object/${String(row.content.model_url).replace(/^3d_package:/, "")}` : "https://3d.si.edu/",
      license: "Smithsonian Open Access",
      score: relevance(subject, row?.title),
    }))
    .filter((candidate) => candidate.url.startsWith("https://3d-api.si.edu/") && candidate.score >= 0.72);
}

async function permissiveKhronosLicense(name, signal) {
  try {
    const response = await fetch(`${KHONOS_ROOT}/${encodeURIComponent(name)}/README.md`, { signal: requestSignal(signal, 12_000) });
    if (!response.ok) return null;
    const readme = await response.text();
    const match = readme.match(/(?:Creative Commons (?:Attribution )?\d(?:\.\d)?|CC0|public domain|Apache License|MIT License)/i);
    return match?.[0] || null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

async function searchKhronos(subject, signal) {
  const index = await fetchJson(KHONOS_INDEX, 18_000, signal);
  const ranked = (Array.isArray(index) ? index : [])
    .filter((item) => item?.variants?.["glTF-Binary"])
    .map((item) => ({ item, score: relevance(subject, `${item.label || ""} ${(item.tags || []).join(" ")}`) }))
    .filter((candidate) => candidate.score >= 0.72)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
  const licensed = await Promise.all(ranked.map(async ({ item, score }) => {
    const license = await permissiveKhronosLicense(item.name, signal);
    if (!license) return null;
    const file = item.variants["glTF-Binary"];
    return {
      title: String(item.label || item.name),
      url: `${KHONOS_ROOT}/${encodeURIComponent(item.name)}/glTF-Binary/${encodeURIComponent(file)}`,
      source: "Khronos glTF Sample Assets",
      sourcePage: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${encodeURIComponent(item.name)}`,
      license,
      score,
    };
  }));
  return licensed.filter(Boolean);
}

async function fetchModelBuffer(url, signal) {
  const response = await fetch(url, { signal: requestSignal(signal, 60_000), redirect: "follow" });
  if (!response.ok) throw new Error(`Model download failed (${response.status}).`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_MODEL_BYTES) throw new Error("The matched model is too large for the hologram viewer.");
  return Buffer.from(await response.arrayBuffer());
}

function validateGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) throw new Error("The downloaded model is empty or incomplete.");
  if (buffer.length > MAX_MODEL_BYTES) throw new Error("The model is too large for the hologram viewer.");
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("The downloaded file is not a GLB model.");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("Only glTF 2.0 models are supported.");
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error("The model failed its integrity check.");
}

function createHologramEngine({ cacheDirectory } = {}) {
  const cacheRoot = cacheDirectory || path.join(process.cwd(), ".svans-hologram-cache");

  async function downloadCandidate(candidate, onProgress, signal) {
    signal?.throwIfAborted?.();
    const cacheName = `${crypto.createHash("sha256").update(candidate.url).digest("hex")}.glb`;
    const cachePath = path.join(cacheRoot, cacheName);
    try {
      const cached = fs.readFileSync(cachePath);
      validateGlb(cached);
      return { buffer: cached, cached: true };
    } catch {
      // Missing or invalid cache entries are downloaded again.
    }
    onProgress({ stage: "download", status: `DOWNLOADING FROM ${candidate.source.toUpperCase()}`, progress: 70 });
    const buffer = await fetchModelBuffer(candidate.url, signal);
    signal?.throwIfAborted?.();
    validateGlb(buffer);
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(cachePath, buffer);
    return { buffer, cached: false };
  }

  async function generate3D(subject, { onProgress = () => {}, signal } = {}) {
    const requestedSubject = String(subject || "").trim().slice(0, 180);
    if (!requestedSubject) throw new Error("A subject is required.");
    onProgress({ stage: "search", status: "SEARCHING VERIFIED 3D LIBRARIES", progress: 10 });
    signal?.throwIfAborted?.();
    const searches = await Promise.allSettled([searchSmithsonian(requestedSubject, signal), searchKhronos(requestedSubject, signal)]);
    signal?.throwIfAborted?.();
    const candidates = searches
      .flatMap((result) => result.status === "fulfilled" ? result.value : [])
      .sort((left, right) => right.score - left.score);
    if (!candidates.length) {
      return {
        available: false,
        reason: `No trustworthy, license-cleared 3D model matching “${requestedSubject}” was found online.`,
        searched: ["Smithsonian Open Access", "Khronos glTF Sample Assets"],
      };
    }
    onProgress({ stage: "verify", status: "VERIFYING LICENSE AND MODEL", progress: 45 });
    for (const candidate of candidates.slice(0, 5)) {
      try {
        const { buffer, cached } = await downloadCandidate(candidate, onProgress, signal);
        onProgress({ stage: "done", status: "VERIFIED MODEL READY", progress: 100 });
        return {
          available: true,
          glbBase64: buffer.toString("base64"),
          cached,
          title: candidate.title,
          source: candidate.source,
          sourcePage: candidate.sourcePage,
          license: candidate.license,
        };
      } catch (error) {
        if (signal?.aborted) throw error;
        // Try the next verified candidate rather than accepting a malformed file.
      }
    }
    return { available: false, reason: "Matching listings were found, but none passed the model safety and integrity checks." };
  }

  async function loadFromUrl(modelUrl) {
    const url = String(modelUrl || "").trim();
    if (!/^https:\/\//i.test(url)) throw new Error("A direct HTTPS URL to a GLB file is required.");
    const parsed = new URL(url);
    if (!["3d-api.si.edu", "raw.githubusercontent.com"].includes(parsed.hostname)) throw new Error("Direct loading is limited to approved 3D library hosts.");
    const candidate = { url, source: parsed.hostname };
    const { buffer, cached } = await downloadCandidate(candidate, () => {});
    return { available: true, glbBase64: buffer.toString("base64"), cached, sourceUrl: url };
  }

  return { generate3D, loadFromUrl };
}

module.exports = { createHologramEngine };
