console.log("SVANSAI extension starting...");

async function sendTabs() {
  try {
    const tabs = await chrome.tabs.query({});

    console.log("Raw tabs:", tabs);

    const filteredTabs = tabs
      .filter((tab) => tab.url && /^https?:/i.test(tab.url))
      .map((tab) => ({
        id: tab.id,
        title: tab.title || "",
        url: tab.url || "",
      }));

    console.log("Filtered tabs:", filteredTabs);

    const response = await fetch("http://127.0.0.1:8001/browser/tabs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tabs: filteredTabs }),
    });

    console.log("POST status:", response.status);
  } catch (err) {
    console.error("Extension error:", err);
  }
}

sendTabs();
setInterval(sendTabs, 5000);