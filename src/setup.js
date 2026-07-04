import { TaislyError } from "./index.js";
import {
  clearPendingSetup,
  readPendingSetup,
  saveCredential,
  savePendingSetup,
} from "./config.js";

const PUBLIC_API_URL = "https://app.taisly.com/api";

export async function setupAgent(options = {}) {
  const agent = getAgent(options);
  const data = await setupRequest("/agent/setup/start", { agent });
  const setup = data.data || {};
  const setupAgentName = setup.agent || agent;

  savePendingSetup({
    agent: setupAgentName,
    checkinToken: setup.checkinToken,
    loginUrl: setup.loginUrl,
    expiresAt: setup.expiresAt,
  });

  return {
    success: true,
    agent: setupAgentName,
    loginUrl: setup.loginUrl,
    expiresAt: setup.expiresAt,
    next: `Open the loginUrl, finish authentication, then run: taisly checkin --agent ${setupAgentName}`,
  };
}

export async function checkinAgent(options = {}) {
  const agent = getAgent(options);
  const pendingSetup = options.checkinToken
    ? {
        agent,
        checkinToken: options.checkinToken,
      }
    : readPendingSetup(agent);

  if (!pendingSetup?.checkinToken) {
    throw new TaislyError(
      "SETUP_SESSION_MISSING",
      `Run taisly setup --agent ${agent} before checkin.`,
    );
  }

  const data = await setupRequest("/agent/setup/checkin", {
    checkinToken: pendingSetup.checkinToken,
  });
  const result = data.data || {};

  if (result.status === "connected" && result.apiKey) {
    saveCredential({ apiKey: result.apiKey });
    clearPendingSetup(agent);

    return {
      success: true,
      connected: true,
      status: "connected",
      agent: result.agent || agent,
      keyPrefix: result.keyPrefix,
      message: "Taisly is connected and ready.",
    };
  }

  if (result.status === "pending") {
    return {
      success: true,
      connected: false,
      status: "pending",
      agent: result.agent || agent,
      loginUrl: pendingSetup.loginUrl,
      message: "Finish authentication in the browser, then run checkin again.",
    };
  }

  if (result.status === "redeemed") {
    clearPendingSetup(agent);
    return {
      success: true,
      connected: false,
      status: "redeemed",
      agent: result.agent || agent,
      message: `This setup session was already used. Run taisly setup --agent ${agent} again if this machine is not connected.`,
    };
  }

  return {
    success: true,
    connected: false,
    status: result.status || "unknown",
    agent: result.agent || agent,
  };
}

export function getAgent(options = {}) {
  const value = String(options.agent || options.agentId || options._?.[0] || "local-agent")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);

  return value || "local-agent";
}

async function setupRequest(pathname, body) {
  const response = await fetch(`${PUBLIC_API_URL}${pathname}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok || data?.success === false) {
    throw new TaislyError(
      data?.code || data?.message || `HTTP_${response.status}`,
      data?.message || response.statusText || "Taisly setup failed.",
      data,
    );
  }

  return data;
}

function parseJson(text) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (_) {
    return { success: false, message: "INVALID_JSON_RESPONSE", raw: text };
  }
}
