"use strict";

function tokens(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Rank only inspected assets. Model names supplied by a planner are not proof
// that a matching template exists in Studio.
function rankAssets(query, assets, limit = 24) {
  const words = new Set(tokens(query));
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const terms = new Set(tokens(`${asset.name} ${asset.tags || ""}`));
    const score = [...words].reduce((sum, word) => sum + (terms.has(word) ? 1 : 0), 0);
    return { ...asset, score };
  }).filter((asset) => asset.score > 0 && asset.partCount > 0)
    .sort((a, b) => b.score - a.score || String(a.path).localeCompare(String(b.path)))
    .slice(0, limit);
}

function resolveObjects(objects, assets) {
  return (objects || []).map((object) => {
    if (object.assetId) return object;
    const matches = (assets || []).filter((asset) => object.templatePath
      ? asset.path === object.templatePath
      : String(asset.name).toLowerCase() === String(object.template).toLowerCase());
    if (matches.length !== 1) throw new Error(`Reusable object "${object.template}" ${matches.length ? "is ambiguous; select its exact library path" : "was not found in the inspected library"}. No build was started.`);
    return { ...object, templatePath: matches[0].path };
  });
}

function validId(value) {
  const id = String(value || "");
  if (!/^[1-9][0-9]{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("Enter a valid Roblox numeric ID.");
  return id;
}

function createAssetBrowser({ fetchFn = fetch, getKey = async () => null } = {}) {
  async function get(url, headers = {}) {
    const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("Roblox denied access. Creator Store needs an Open Cloud key with creator-store-product:read; inventory browsing requires a public inventory.");
      throw new Error(`Roblox asset discovery failed (${response.status}). Try again later.`);
    }
    return response.json();
  }
  async function search({ source = "store", query = "", userId = "", cursor = "" } = {}) {
    const page = String(cursor).slice(0, 2000);
    if (source === "inventory") {
      const params = new URLSearchParams({ assetTypes: "Model", limit: "25", sortOrder: "Desc", cursor: page });
      const result = await get(`https://inventory.roblox.com/v2/users/${validId(userId)}/inventory?${params}`);
      const items = (result.data || []).map(item => ({ id: validId(item.assetId), name: String(item.name || "Model"), source, url: `https://create.roblox.com/store/asset/${validId(item.assetId)}` }));
      return { items: items.filter(item => item.name.toLowerCase().includes(String(query).toLowerCase())), cursor: result.nextPageCursor || "", note: "Search filters this inventory page. Use Next page to continue." };
    }
    if (source !== "store") throw new Error("Unknown asset source.");
    const key = await getKey();
    if (!key) throw new Error("Connect your Roblox Open Cloud key in Connections with creator-store-product:read access to search the Creator Store.");
    const params = new URLSearchParams({ searchCategoryType: "Model", query: String(query).slice(0, 200), maxPageSize: "25", maxPriceCents: "0", searchView: "Full", includeOnlyVerifiedCreators: "false" });
    if (page) params.set("pageToken", page);
    const result = await get(`https://apis.roblox.com/toolbox-service/v2/assets:search?${params}`, { "x-api-key": key });
    return { items: (result.creatorStoreAssets || []).map(item => ({ id: validId(item.asset.id), name: String(item.asset.name || "Model"), creator: String(item.creator?.name || ""), source, url: `https://create.roblox.com/store/asset/${validId(item.asset.id)}` })), cursor: result.nextPageToken || "", note: "Free model results. Studio checks whether this account can load each model." };
  }
  return { search };
}

module.exports = { rankAssets, resolveObjects, createAssetBrowser, validId };
