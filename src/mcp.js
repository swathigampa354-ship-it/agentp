import { createInterface } from "node:readline";
import { Taisly, TaislyError } from "./index.js";
import { checkinAgent, setupAgent } from "./setup.js";

const PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);
const SERVER_NAME = "taisly-agent-kit";
const SERVER_TITLE = "TikTok Account Posting Agent Kit";
const SERVER_VERSION = "0.2.8";

const JSON_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true,
};

const READ_ONLY_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const EXTERNAL_MUTATING_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
});

const TOOLS = [
  {
    name: "taisly_agent_setup_start",
    title: "Start Taisly Agent Setup",
    description:
      "Start browser-based Taisly authentication for an AI agent. Returns a loginUrl that the user must open and approve before checkin.",
    annotations: EXTERNAL_MUTATING_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Short agent slug, for example claude-code, codex, cursor, openclaw, or local-agent.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "taisly_agent_checkin",
    title: "Finish Taisly Agent Setup",
    description:
      "Finish setup after the user approves the loginUrl in the browser. Saves the local Taisly agent credential for later CLI and MCP calls.",
    annotations: EXTERNAL_MUTATING_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Short agent slug used with taisly_agent_setup_start.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "taisly_auth_status",
    title: "Taisly Auth Status",
    description: "Check whether the Taisly API key is valid and count connected TikTok accounts.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "taisly_accounts_list",
    title: "List TikTok Accounts",
    description: "List connected TikTok accounts available to this API key.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "taisly_schema",
    title: "Get TikTok Posting Schema",
    description: "Get local TikTok posting constraints before validating or creating a post.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "taisly_account_connect_start",
    title: "Start TikTok Account Connection",
    description:
      "Start browser-based connection for a TikTok account. Returns a connectUrl that the user must open and approve in the browser.",
    annotations: EXTERNAL_MUTATING_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "taisly_account_connect_check",
    title: "Check TikTok Account Connection",
    description:
      "Check whether a TikTok account connection started by taisly_account_connect_start has appeared in Taisly.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "taisly_posts_validate",
    title: "Validate TikTok Post",
    description: "Validate a local video path, TikTok account IDs, caption, and optional schedule before publishing.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        video: {
          type: "string",
          description: "Local video path available to the agent.",
        },
        accounts: {
          oneOf: [
            { type: "array", items: { type: "string" } },
            { type: "string" },
          ],
          description: "TikTok account IDs from taisly_accounts_list.",
        },
        description: {
          type: "string",
          description: "Post caption or description.",
        },
        scheduled: {
          type: "string",
          description: "Optional ISO datetime or Unix timestamp in milliseconds.",
        },
      },
      required: ["video", "accounts", "description"],
      additionalProperties: false,
    },
  },
  {
    name: "taisly_posts_create",
    title: "Create TikTok Post",
    description: "Publish or schedule a TikTok video post through Taisly after the user explicitly confirms the media, TikTok accounts, caption, and schedule.",
    annotations: EXTERNAL_MUTATING_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        video: {
          type: "string",
          description: "Local video path available to the agent.",
        },
        accounts: {
          oneOf: [
            { type: "array", items: { type: "string" } },
            { type: "string" },
          ],
          description: "TikTok account IDs from taisly_accounts_list.",
        },
        description: {
          type: "string",
          description: "Post caption or description.",
        },
        scheduled: {
          type: "string",
          description: "Optional ISO datetime or Unix timestamp in milliseconds.",
        },
        previewTime: {
          type: "number",
          description: "Optional preview timestamp used by the Taisly posting API.",
        },
        confirmed: {
          type: "boolean",
          description: "Must be true only after explicit user confirmation.",
        },
      },
      required: ["video", "accounts", "description", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "taisly_posts_status",
    title: "Get TikTok Post Status",
    description: "Fetch recent-history status for a Taisly post by historyId.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Taisly historyId returned by taisly_posts_create.",
        },
        historyId: {
          type: "string",
          description: "Alias for id.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "taisly_posts_list",
    title: "List TikTok Posts",
    description: "List recent TikTok post history for status checks and audits.",
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "History page number. Defaults to 1.",
        },
        startTime: {
          type: "string",
          description: "Optional start timestamp filter.",
        },
        endTime: {
          type: "string",
          description: "Optional end timestamp filter.",
        },
      },
      additionalProperties: false,
    },
  },
];

const TOOL_HANDLERS = {
  taisly_agent_setup_start: (_client, args) => setupAgent(args),
  taisly_agent_checkin: (_client, args) => checkinAgent(args),
  taisly_auth_status: (client) => client.auth.status(),
  taisly_accounts_list: (client) => client.accounts.list(),
  taisly_schema: (client) => client.accounts.schema(),
  taisly_account_connect_start: (client) => client.accounts.connectStart(),
  taisly_account_connect_check: (client) => client.accounts.connectCheck(),
  taisly_posts_validate: (client, args) =>
    client.posts.validate({
      video: args.video,
      accounts: args.accounts,
      description: args.description,
      scheduled: args.scheduled,
    }),
  taisly_posts_create: (client, args) => {
    if (args.confirmed !== true) {
      throw new TaislyError(
        "CONFIRMATION_REQUIRED",
        "Set confirmed to true only after the user explicitly approves the video, TikTok accounts, caption, and schedule.",
        { required: { confirmed: true } },
      );
    }

    return client.posts.create({
      video: args.video,
      accounts: args.accounts,
      description: args.description,
      scheduled: args.scheduled,
      previewTime: args.previewTime || 0,
    });
  },
  taisly_posts_status: (client, args) => client.posts.status(args.id || args.historyId),
  taisly_posts_list: (client, args) =>
    client.posts.list({
      page: args.page || 1,
      startTime: args.startTime,
      endTime: args.endTime,
    }),
};

export async function startMcpServer(options = {}) {
  const server = new TaislyMcpServer(options);
  await server.start();
}

class TaislyMcpServer {
  constructor({
    client = new Taisly(),
    input = process.stdin,
    output = process.stdout,
    error = process.stderr,
  } = {}) {
    this.client = client;
    this.input = input;
    this.output = output;
    this.error = error;
  }

  async start() {
    const lines = createInterface({
      input: this.input,
      crlfDelay: Infinity,
    });

    for await (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      try {
        const message = JSON.parse(line);
        await this.handleMessage(message);
      } catch (error) {
        this.sendError(null, -32700, "Parse error", error?.message);
      }
    }
  }

  async handleMessage(message) {
    if (Array.isArray(message)) {
      await Promise.all(message.map((item) => this.handleMessage(item)));
      return;
    }

    if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
      this.sendError(null, -32600, "Invalid Request");
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(message, "id")) {
      this.handleNotification(message);
      return;
    }

    try {
      const result = await this.handleRequest(message.method, message.params || {});
      this.send({ jsonrpc: "2.0", id: message.id, result });
    } catch (error) {
      this.sendError(
        message.id,
        error?.code || -32603,
        error?.message || "Internal error",
        error?.data,
      );
    }
  }

  handleNotification(message) {
    if (message.method === "notifications/initialized") return;
    if (message.method === "notifications/cancelled") return;
    this.error.write(`Taisly MCP ignored notification: ${message.method}\n`);
  }

  async handleRequest(method, params) {
    switch (method) {
      case "initialize":
        return this.initialize(params);
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS };
      case "tools/call":
        return this.callTool(params);
      default:
        throw {
          code: -32601,
          message: `Method not found: ${method}`,
        };
    }
  }

  initialize(params) {
    return {
      protocolVersion: negotiateProtocolVersion(params.protocolVersion),
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: SERVER_NAME,
        title: SERVER_TITLE,
        version: SERVER_VERSION,
      },
      instructions:
        "If Taisly is not connected yet, use taisly_agent_setup_start, send the user the returned loginUrl, wait for browser approval, then use taisly_agent_checkin. If a TikTok account is missing, use taisly_account_connect_start, send the user the returned connectUrl, wait for browser approval, then use taisly_account_connect_check. After setup, discover connected TikTok accounts, validate posts, ask for explicit user confirmation, then create and monitor TikTok posts.",
    };
  }

  async callTool(params) {
    const name = params.name;
    const args = normalizeArguments(params.arguments);
    const handler = TOOL_HANDLERS[name];

    if (!handler) {
      throw {
        code: -32602,
        message: `Unknown tool: ${name}`,
      };
    }

    try {
      const data = await handler(this.client, args);
      return toolResult(data);
    } catch (error) {
      return toolError(error);
    }
  }

  send(message) {
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  sendError(id, code, message, data) {
    this.send({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    });
  }
}

function negotiateProtocolVersion(requestedVersion) {
  if (SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)) {
    return requestedVersion;
  }

  return PROTOCOL_VERSION;
}

function normalizeArguments(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {};
  }

  return args;
}

function toolResult(data) {
  const structuredContent = toStructuredContent(data);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
    isError: false,
  };
}

function toolError(error) {
  const data =
    error instanceof TaislyError
      ? error.toJSON()
      : {
          success: false,
          code: "UNEXPECTED_ERROR",
          message: error?.message || "Unexpected error",
        };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: toStructuredContent(data),
    isError: true,
  };
}

function toStructuredContent(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data;
  }

  return {
    success: true,
    data,
  };
}

export const mcp = {
  protocolVersion: PROTOCOL_VERSION,
  serverName: SERVER_NAME,
  tools: TOOLS,
  outputSchema: JSON_OBJECT_SCHEMA,
};
