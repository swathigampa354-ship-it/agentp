import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readStoredCredential } from "./config.js";

export const DEFAULT_API_URL = "https://app.taisly.com/api/private";
export const SUPPORTED_ACCOUNT_TYPE = "TikTok";
const TIKTOK_CONNECT_SLUG = "tiktok";
const DEFAULT_HISTORY_PAGE = 1;
const VIDEO_MIME_BY_EXTENSION = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".flv": "video/x-flv",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
};
const SUPPORTED_VIDEO_EXTENSIONS = Object.keys(VIDEO_MIME_BY_EXTENSION);

export class Taisly {
  constructor(options = {}) {
    const storedCredential = readStoredCredential();
    this.apiKey =
      options.apiKey || process.env.TAISLY_API_KEY || storedCredential.apiKey;
    this.apiUrl = DEFAULT_API_URL;
  }

  requireApiKey() {
    if (!this.apiKey) {
      throw new TaislyError(
        "TAISLY_API_KEY_MISSING",
        "Run `taisly setup --agent <agent>`, set TAISLY_API_KEY, or pass apiKey to the Taisly client.",
      );
    }
  }

  async request(pathname, options = {}) {
    this.requireApiKey();

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers || {}),
    };

    const response = await fetch(`${this.apiUrl}${pathname}`, {
      ...options,
      headers,
    });
    const text = await response.text();
    const data = parseJson(text);

    if (!response.ok || data?.success === false) {
      throw new TaislyError(
        data?.message || `HTTP_${response.status}`,
        getRequestErrorMessage(data, response),
        data,
      );
    }

    return data;
  }

  async getAllAccounts() {
    const response = await this.request("/platform/platforms");
    return normalizeAccounts(response.data || []);
  }

  async getTikTokAccounts() {
    const accounts = await this.getAllAccounts();
    return accounts.filter(isTikTokAccount);
  }

  async assertTikTokAccountIds(accountIds) {
    const tikTokAccounts = await this.getTikTokAccounts();
    const allowedIds = new Set(tikTokAccounts.map((account) => account.id));
    const unsupportedIds = accountIds.filter((id) => !allowedIds.has(String(id)));

    if (unsupportedIds.length > 0) {
      throw new TaislyError(
        "TIKTOK_ACCOUNT_ID_REQUIRED",
        "Only connected TikTok account IDs are supported by this tool.",
        {
          unsupportedIds,
          supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
          tikTokAccountIds: tikTokAccounts.map((account) => account.id),
        },
      );
    }

    return tikTokAccounts.filter((account) => accountIds.includes(account.id));
  }

  auth = {
    status: async () => {
      const accounts = await this.getAllAccounts();
      const tikTokAccounts = accounts.filter(isTikTokAccount);

      return {
        success: true,
        authenticated: true,
        supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
        accountCount: tikTokAccounts.length,
        totalConnectedAccountCount: accounts.length,
      };
    },
  };

  accounts = {
    list: async () => {
      const accounts = await this.getAllAccounts();
      const tikTokAccounts = accounts.filter(isTikTokAccount);

      return {
        success: true,
        supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
        count: tikTokAccounts.length,
        totalConnectedAccountCount: accounts.length,
        data: tikTokAccounts,
      };
    },

    schema: async () => ({
      success: true,
      data: getTikTokSchema(),
    }),

    connectStart: async () => {
      const response = await this.request(
        `/agent/platform/connect/start?platform=${encodeURIComponent(
          TIKTOK_CONNECT_SLUG,
        )}`,
      );

      return {
        success: true,
        supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
        ...(response.data || {}),
      };
    },

    connectCheck: async () => {
      const response = await this.request(
        `/agent/platform/connect/check?platform=${encodeURIComponent(
          TIKTOK_CONNECT_SLUG,
        )}`,
      );

      return {
        success: true,
        supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
        ...(response.data || {}),
      };
    },
  };

  posts = {
    validate: async ({ video, accounts, description, scheduled }) => {
      if (!video) throw new TaislyError("VIDEO_REQUIRED", "Pass --video.");
      if (!description) {
        throw new TaislyError("DESCRIPTION_REQUIRED", "Pass --description.");
      }

      const accountIds = normalizeAccountIds(accounts);
      if (accountIds.length === 0) {
        throw new TaislyError("ACCOUNTS_REQUIRED", "Pass at least one TikTok account id.");
      }

      const fileInfo = await stat(video);
      if (!fileInfo.isFile()) {
        throw new TaislyError("VIDEO_NOT_FILE", "Video path must point to a file.");
      }

      const extension = path.extname(video).toLowerCase();
      if (!SUPPORTED_VIDEO_EXTENSIONS.includes(extension)) {
        throw new TaislyError(
          "UNSUPPORTED_VIDEO_EXTENSION",
          `Use one of these video extensions: ${SUPPORTED_VIDEO_EXTENSIONS.join(", ")}.`,
          { extension },
        );
      }

      const tikTokAccounts = await this.assertTikTokAccountIds(accountIds);

      return {
        success: true,
        supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
        data: {
          video,
          filename: path.basename(video),
          sizeBytes: fileInfo.size,
          sizeMb: Number((fileInfo.size / 1024 / 1024).toFixed(2)),
          accounts: accountIds,
          accountDetails: tikTokAccounts,
          descriptionLength: description.length,
          scheduled: scheduled ? normalizeScheduled(scheduled) : null,
        },
      };
    },

    create: async ({ video, accounts, description, scheduled, previewTime = 0 }) => {
      const validation = await this.posts.validate({
        video,
        accounts,
        description,
        scheduled,
      });
      const accountIds = validation.data.accounts;

      const form = new FormData();
      const bytes = await readFile(video);
      const filename = path.basename(video);
      const mimeType = getVideoMimeType(video);
      form.append("video", new Blob([bytes], { type: mimeType }), filename);
      form.append("platforms", JSON.stringify(accountIds));
      form.append("description", description);
      form.append("previewTime", String(previewTime));

      if (scheduled) {
        form.append("scheduled", normalizeScheduled(scheduled));
      }

      const response = await this.request("/post", {
        method: "POST",
        body: form,
      });

      return normalizePostCreateResponse(response);
    },

    status: async (historyId) => {
      if (!historyId) throw new TaislyError("POST_ID_REQUIRED", "Pass a post id.");

      const response = await this.request("/post/history?page=1");
      const tikTokHistory = filterPostHistoryForTikTok(response.data || []);
      const post = tikTokHistory.find((item) => item.id === historyId);

      if (!post) {
        throw new TaislyError(
          "POST_NOT_FOUND_IN_RECENT_TIKTOK_HISTORY",
          "Recent TikTok-only history did not include this id.",
          { historyId, supportedAccountType: SUPPORTED_ACCOUNT_TYPE },
        );
      }

      return {
        success: true,
        supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
        data: post,
      };
    },

    list: async ({ page = DEFAULT_HISTORY_PAGE, startTime, endTime } = {}) => {
      const params = new URLSearchParams({ page: String(page) });

      if (startTime) params.set("startTime", String(startTime));
      if (endTime) params.set("endTime", String(endTime));

      const response = await this.request(`/post/history?${params.toString()}`);
      const tikTokHistory = filterPostHistoryForTikTok(response.data || []);

      return {
        success: true,
        supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
        page: Number(page),
        count: tikTokHistory.length,
        data: tikTokHistory,
      };
    },
  };
}

export class TaislyError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "TaislyError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      ...(this.details?.agent ? { agent: this.details.agent } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

function getRequestErrorMessage(data, response) {
  if (data?.agent?.message) return data.agent.message;
  if (data?.error) return data.error;
  if (data?.detailMessage) return data.detailMessage;
  if (data?.message) return data.message;
  return response.statusText || "Taisly request failed";
}

export function getTikTokSchema() {
  return {
    accountType: SUPPORTED_ACCOUNT_TYPE,
    media: {
      type: "video",
      maxSizeMb: 500,
      recommendedDurationSeconds: { min: 3, max: 90 },
      recommendedAspectRatio: "9:16",
      recommendedMinResolution: "540x960",
    },
    fields: {
      description: {
        type: "string",
        required: true,
        maxLength: 2200,
      },
      scheduled: {
        type: "unix_ms_or_iso_datetime",
        required: false,
      },
    },
    notes: ["Keep captions concise and validate commercial/music rights."],
  };
}

export async function readJsonFile(filepath) {
  const content = await readFile(filepath, "utf8");
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new TaislyError(
      "INVALID_JSON_FILE",
      `Could not parse JSON file: ${filepath}`,
      { cause: error.message },
    );
  }
}

export function normalizeAccountIds(accounts) {
  if (!accounts) return [];
  if (Array.isArray(accounts)) return accounts.map(String).filter(Boolean);
  return String(accounts)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeScheduled(value) {
  if (!value) return "";
  if (/^\d+$/.test(String(value))) return String(value);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TaislyError(
      "INVALID_SCHEDULED_DATE",
      "Use an ISO date or Unix timestamp in milliseconds.",
    );
  }

  return String(date.getTime());
}

function normalizeAccounts(accounts) {
  return accounts.map((account) => ({
    ...account,
    id: String(account.id || account._id || ""),
    accountType: account.accountType || account.platform || account.identifier,
  }));
}

function isTikTokAccount(account) {
  const value = String(
    account?.accountType ||
      account?.platform ||
      account?.identifier ||
      account?.provider ||
      account?.type ||
      account?.slug ||
      "",
  )
    .trim()
    .toLowerCase();

  return value === TIKTOK_CONNECT_SLUG;
}

function filterPostHistoryForTikTok(history) {
  return history
    .map((post) => {
      const result = filterTikTokResults(post.result || []);
      return { ...post, result };
    })
    .filter((post) => post.result.length > 0);
}

function filterTikTokResults(results) {
  return results.filter(isTikTokAccount);
}

function normalizePostCreateResponse(response) {
  const historyId = response.historyId || response.id || response.data?.id;

  return {
    success: true,
    supportedAccountType: SUPPORTED_ACCOUNT_TYPE,
    historyId: historyId ? String(historyId) : undefined,
    scheduled: Boolean(response.scheduled),
    date: response.date,
    result: filterTikTokResults(response.result || []),
    raw: response,
  };
}

function getVideoMimeType(video) {
  return VIDEO_MIME_BY_EXTENSION[path.extname(video).toLowerCase()];
}

function parseJson(text) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (_) {
    return { success: false, message: "INVALID_JSON_RESPONSE", raw: text };
  }
}
