export type SiteAdapterContext = {
  url: string;
  visibleError?: string;
  statusCodes: number[];
  requestErrors: number;
  loginDetected: boolean;
  authRedirect: boolean;
};

export type SiteAdapterDiagnosis = {
  adapter: string;
  hypothesis: string;
  nextTest: string;
};

export function diagnoseKnownSite(context: SiteAdapterContext): SiteAdapterDiagnosis | null {
  let url: URL;
  try {
    url = new URL(context.url);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const visibleError = String(context.visibleError || "").toLowerCase();

  if (host === "chatgpt.com" || host.endsWith(".openai.com")) {
    if (/upstream connect|remote connection failure/.test(visibleError)) {
      return {
        adapter: "ChatGPT",
        hypothesis: "The ChatGPT web route or session handshake failed before the application loaded.",
        nextTest: "Compare a private-window session, verify status.openai.com, then refresh ChatGPT site data if the private session succeeds.",
      };
    }
    if (context.loginDetected || context.authRedirect) {
      return {
        adapter: "ChatGPT",
        hypothesis: "ChatGPT is in an authentication flow rather than a verified application session.",
        nextTest: "Confirm the expected sign-in method and test a clean authenticated session.",
      };
    }
    return {
      adapter: "ChatGPT",
      hypothesis: "Inspect response streaming, API requests, authentication, and WebSocket/request failures together.",
      nextTest: "Send a short test prompt while monitoring failed requests and response timing.",
    };
  }

  if (host.endsWith("microsoft.com") || host.endsWith("microsoftonline.com") || host.endsWith("office.com")) {
    return {
      adapter: "Microsoft 365",
      hypothesis: context.loginDetected || context.authRedirect
        ? "The Microsoft application is waiting on identity or organization authentication."
        : "The failure may involve Microsoft identity, application APIs, or organization policy.",
      nextTest: "Verify the signed-in Microsoft account, tenant access, and failed Microsoft API requests.",
    };
  }

  if (host.endsWith("instructure.com") || host.includes("devry")) {
    return {
      adapter: "Canvas/DeVry",
      hypothesis: "The course portal may be affected by session expiration, embedded-resource blocking, or course authorization.",
      nextTest: "Verify the portal session and compare the failing course resource with the dashboard in the same session.",
    };
  }

  if (host === "github.com" || host.endsWith(".github.com")) {
    const rateLimited = context.statusCodes.includes(429) || context.statusCodes.includes(403);
    return {
      adapter: "GitHub",
      hypothesis: rateLimited
        ? "GitHub may be rate-limiting the session or denying the requested resource."
        : "The failure may involve repository authorization, GitHub APIs, or blocked resources.",
      nextTest: "Check the failing HTTP status, signed-in account, repository permission, and GitHub status.",
    };
  }

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    return {
      adapter: "YouTube",
      hypothesis: "Playback failures commonly involve media requests, codecs, extensions, DRM, or network filtering.",
      nextTest: "Test the same video with extensions disabled and inspect media/request failures.",
    };
  }

  return null;
}
