console.log("SVANSAI extension starting...");

const API_BASE_URL = "https://vansant-backend.onrender.com";

async function sendTabs() {
  try {
    const tabs = await chrome.tabs.query({});

    const filteredTabs = tabs
      .filter((tab) => tab.url && /^https?:/i.test(tab.url))
      .map((tab) => ({
        id: tab.id,
        title: tab.title || "",
        url: tab.url || "",
      }));

    const response = await fetch(`${API_BASE_URL}/browser/tabs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tabs: filteredTabs }),
    });

    console.log("POST /browser/tabs:", response.status, filteredTabs.length);
  } catch (err) {
    console.error("Extension error:", err);
  }
}

sendTabs();
setInterval(sendTabs, 5000);

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed → sending tabs");
  sendTabs();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Browser startup → sending tabs");
  sendTabs();
});

chrome.tabs.onCreated.addListener(sendTabs);
chrome.tabs.onUpdated.addListener(sendTabs);
chrome.tabs.onRemoved.addListener(sendTabs);
chrome.tabs.onActivated.addListener(sendTabs);