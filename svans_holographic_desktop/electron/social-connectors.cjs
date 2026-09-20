"use strict";

/**
 * Social connectors — official OAuth APIs only.
 *
 * Deliberately does NOT do session-cookie automation or headless-browser
 * scraping of a logged-in social account. That approach reliably violates
 * platform ToS and risks account suspension even for personal-use bots.
 * Every capability here is scoped to what an authorized OAuth app is
 * actually allowed to do.
 *
 * Tokens are never written to disk in plaintext. Pass in a `secretStore`
 * with get(key)/set(key, value) backed by Electron's safeStorage or an
 * OS keychain (e.g. the `keytar` package) — see main.cjs wiring notes.
 */

function createSocialConnectors({ secretStore }) {
  if (!secretStore || typeof secretStore.get !== "function") {
    throw new Error("A secretStore with get/set is required for social connectors.");
  }

  const platforms = {};

  function registerPlatform(name, handlers) {
    platforms[name] = handlers;
  }

  // --- Reddit: read saved posts / check inbox (OAuth "script" or "installed" app) ---
  registerPlatform("reddit", {
    async checkInbox() {
      const token = await secretStore.get("reddit:access_token");
      if (!token) throw new Error("Reddit is not connected. Authorize it in Settings first.");
      const response = await fetch("https://oauth.reddit.com/message/unread", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "SVANS-Desktop/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Reddit API error (${response.status}).`);
      const data = await response.json();
      const items = (data?.data?.children || []).map((entry) => ({
        author: entry.data.author,
        subject: entry.data.subject,
        body: entry.data.body?.slice(0, 280) || "",
      }));
      return {
        message: items.length ? `You have ${items.length} unread Reddit messages.` : "No unread Reddit messages.",
        title: "REDDIT INBOX",
        lines: items.map((entry) => `${entry.author}: ${entry.subject}`),
        items,
      };
    },
  });

  // --- X / Twitter: post a status update (OAuth 2.0 user context, tweet.write scope) ---
  registerPlatform("x", {
    async postUpdate(payload) {
      const token = await secretStore.get("x:access_token");
      if (!token) throw new Error("X is not connected. Authorize it in Settings first.");
      const text = String(payload?.text || "").trim();
      if (!text || text.length > 280) throw new Error("Post text must be 1–280 characters.");
      const response = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`X API error (${response.status}).`);
      const data = await response.json();
      return { message: "Posted.", title: "X POST SENT", lines: [text], id: data?.data?.id };
    },
  });

  // --- Facebook: post to a Page the owner manages (Graph API, Page Access Token) ---
  registerPlatform("facebook", {
    async postToPage(payload) {
      const token = await secretStore.get("facebook:page_access_token");
      const pageId = await secretStore.get("facebook:page_id");
      if (!token || !pageId) throw new Error("Facebook is not connected. Add a Page ID and Page Access Token in Settings first.");
      const message = String(payload?.text || "").trim();
      if (!message) throw new Error("Post text is required.");
      const response = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, access_token: token }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Facebook API error: ${data?.error?.message || response.status}.`);
      return { message: "Posted to your Facebook Page.", title: "FACEBOOK POST SENT", lines: [message], id: data?.id };
    },
  });

  // --- Instagram: post to a connected Business/Creator account (Graph API, two-step container) ---
  registerPlatform("instagram", {
    async postImage(payload) {
      const token = await secretStore.get("instagram:access_token");
      const igUserId = await secretStore.get("instagram:ig_user_id");
      if (!token || !igUserId) throw new Error("Instagram is not connected. Add your IG Business account ID and access token in Settings first.");
      const imageUrl = String(payload?.imageUrl || "").trim();
      const caption = String(payload?.caption || "").trim();
      if (!imageUrl) throw new Error("An image URL is required — Instagram's API only accepts hosted media, not local files.");
      const createResponse = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
        signal: AbortSignal.timeout(20_000),
      });
      const container = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !container?.id) throw new Error(`Instagram media container failed: ${container?.error?.message || createResponse.status}.`);
      const publishResponse = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
        signal: AbortSignal.timeout(20_000),
      });
      const published = await publishResponse.json().catch(() => ({}));
      if (!publishResponse.ok) throw new Error(`Instagram publish failed: ${published?.error?.message || publishResponse.status}.`);
      return { message: "Posted to Instagram.", title: "INSTAGRAM POST SENT", lines: [caption || imageUrl], id: published?.id };
    },
  });

  // --- Threads: text post (Meta Threads Graph API, graph.threads.net, two-step container) ---
  registerPlatform("threads", {
    async postText(payload) {
      const token = await secretStore.get("threads:access_token");
      const userId = await secretStore.get("threads:user_id");
      if (!token || !userId) throw new Error("Threads is not connected. Add your Threads user ID and access token in Settings first.");
      const text = String(payload?.text || "").trim();
      if (!text) throw new Error("Post text is required.");
      const createResponse = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads?media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${encodeURIComponent(token)}`,
        { method: "POST", signal: AbortSignal.timeout(20_000) },
      );
      const container = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !container?.id) throw new Error(`Threads container failed: ${container?.error?.message || createResponse.status}.`);
      const publishResponse = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${container.id}&access_token=${encodeURIComponent(token)}`,
        { method: "POST", signal: AbortSignal.timeout(20_000) },
      );
      const published = await publishResponse.json().catch(() => ({}));
      if (!publishResponse.ok) throw new Error(`Threads publish failed: ${published?.error?.message || publishResponse.status}.`);
      return { message: "Posted to Threads.", title: "THREADS POST SENT", lines: [text], id: published?.id };
    },
  });

  // --- YouTube: read-oriented (Data API v3) — channel stats + recent comments.
  // Video upload is intentionally not included here: it needs real multipart
  // file streaming, which belongs in its own module rather than a one-liner.
  registerPlatform("youtube", {
    async channelStats() {
      const token = await secretStore.get("youtube:access_token");
      if (!token) throw new Error("YouTube is not connected. Authorize it in Settings first.");
      const response = await fetch("https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`YouTube API error: ${data?.error?.message || response.status}.`);
      const channel = data?.items?.[0];
      if (!channel) throw new Error("No YouTube channel found for this account.");
      const stats = channel.statistics;
      return {
        message: `${channel.snippet.title}: ${stats.subscriberCount} subscribers, ${stats.viewCount} total views.`,
        title: "YOUTUBE CHANNEL STATS",
        lines: [`Subscribers: ${stats.subscriberCount}`, `Total views: ${stats.viewCount}`, `Videos: ${stats.videoCount}`],
        stats,
      };
    },
    async recentComments(payload) {
      const token = await secretStore.get("youtube:access_token");
      if (!token) throw new Error("YouTube is not connected. Authorize it in Settings first.");
      const videoId = String(payload?.videoId || "").trim();
      const url = videoId
        ? `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=10`
        : `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&allThreadsRelatedToChannelId=mine&maxResults=10`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`YouTube API error: ${data?.error?.message || response.status}.`);
      const comments = (data?.items || []).map((entry) => {
        const top = entry.snippet.topLevelComment.snippet;
        return { author: top.authorDisplayName, text: top.textDisplay };
      });
      return {
        message: comments.length ? `${comments.length} recent comments.` : "No recent comments found.",
        title: "YOUTUBE COMMENTS",
        lines: comments.map((entry) => `${entry.author}: ${entry.text}`),
        comments,
      };
    },
  });

  // --- TikTok: Content Posting API. Requires the video be hosted at a URL
  // (PULL_FROM_URL) — direct file upload needs chunked binary transfer and
  // is out of scope for this text-first connector. Unaudited apps only get
  // private-visibility posts until TikTok reviews the client — that's a
  // TikTok-side restriction, not a bug here.
  registerPlatform("tiktok", {
    async postVideoFromUrl(payload) {
      const token = await secretStore.get("tiktok:access_token");
      if (!token) throw new Error("TikTok is not connected. Authorize it in Settings first.");
      const videoUrl = String(payload?.videoUrl || "").trim();
      const title = String(payload?.title || "").trim();
      if (!videoUrl) throw new Error("A hosted video URL is required.");
      const response = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          post_info: { title, privacy_level: "SELF_ONLY", disable_duet: false, disable_comment: false, disable_stitch: false },
          source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error?.code !== "ok") throw new Error(`TikTok API error: ${data?.error?.message || response.status}.`);
      return {
        message: "Video submitted to TikTok (private visibility until your app is audited).",
        title: "TIKTOK POST SUBMITTED",
        lines: [title || videoUrl, `publish_id: ${data?.data?.publish_id}`],
        publishId: data?.data?.publish_id,
      };
    },
  });

  // --- Snapchat: there is no general-purpose server-side posting API for
  // regular accounts. Snap Kit's Creative Kit only opens Snapchat's own share
  // sheet client-side (the user still taps "send" themselves), and the
  // Marketing API is ads-only. Rather than fake a posting call that doesn't
  // exist, this connector is honest about the limitation.
  registerPlatform("snapchat", {
    async postUpdate() {
      throw new Error(
        "Snapchat doesn't offer a public API for posting to a personal account on your behalf — Snap Kit only opens their share sheet for the user to send manually, and the Marketing API is ads-only. There's no server-side equivalent to build a 'social' automation against here.",
      );
    },
  });

  // --- MySpace: no current public developer API exists to connect to.
  // Left as an explicit, honest stub rather than a fabricated integration.
  registerPlatform("myspace", {
    async postUpdate() {
      throw new Error("MySpace does not currently offer a public developer API, so there's nothing to connect this action to.");
    },
  });

  // --- Discord: send a message via a bot token to a channel the owner controls ---
  registerPlatform("discord", {
    async sendMessage(payload) {
      const token = await secretStore.get("discord:bot_token");
      if (!token) throw new Error("Discord is not connected. Add a bot token in Settings first.");
      const channelId = String(payload?.channelId || "").trim();
      const text = String(payload?.text || "").trim();
      if (!channelId || !text) throw new Error("A channel ID and message text are required.");
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.slice(0, 2000) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Discord API error (${response.status}).`);
      return { message: "Message sent.", title: "DISCORD MESSAGE SENT", lines: [text] };
    },
  });

  async function execute(action, payload) {
    const [platform, method] = String(action || "").split(".");
    const handlers = platforms[platform];
    if (!handlers || typeof handlers[method] !== "function") {
      throw new Error(`Unknown social action "${action}". Wire it up in social-connectors.cjs first.`);
    }
    return handlers[method](payload);
  }

  return { execute, registerPlatform };
}

module.exports = { createSocialConnectors };
