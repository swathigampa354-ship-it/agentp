import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readStoredCredential } from "./config.js";

export const DEFAULT_API_URL = "https://app.taisly.com/api/private";
export const ONLY_SUPPORTED_PLATFORM = "TikTok";
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

  async getAllPlatforms() {
    const response = await this.request("/platform/platforms");
    return normalizePlatforms(response.data || []);
  }

  async getTikTokPlatforms() {
    const platforms = await this.getAllPlatforms();
    return platforms.filter(isTikTokPlatform);
  }

  async assertTikTokPlatformIds(platformIds) {
    const tikTokPlatforms = await this.getTikTokPlatforms();
    const allowedIds = new Set(tikTokPlatforms.map((platform) => platform.id));
    const unsupportedIds = platformIds.filter((id) => !allowedIds.has(String(id)));

    if (unsupportedIds.length > 0) {
      throw new TaislyError(
        "TIKTOK_PLATFORM_ID_REQUIRED",
        "Only connected TikTok platform IDs are supported by this tool.",
        {
          unsupportedIds,
          supportedPlatform: ONLY_SUPPORTED_PLATFORM,
          tikTokPlatformIds: tikTokPlatforms.map((platform) => platform.id),
        },
      );
    }

    return tikTokPlatforms.filter((platform) => platformIds.includes(platform.id));
  }

  auth = {
    status: async () => {
      const platforms = await this.getAllPlatforms();
      const tikTokPlatforms = platforms.filter(isTikTokPlatform);

      return {
        success: true,
        authenticated: true,
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
        platformCount: tikTokPlatforms.length,
        totalConnectedPlatformCount: platforms.length,
      };
    },
  };

  platforms = {
    list: async () => {
      const platforms = await this.getAllPlatforms();
      const tikTokPlatforms = platforms.filter(isTikTokPlatform);

      return {
        success: true,
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
        count: tikTokPlatforms.length,
        totalConnectedPlatformCount: platforms.length,
        data: tikTokPlatforms,
      };
    },

    schema: async (platform) => ({
      success: true,
      data: getPlatformSchema(platform),
    }),

    connectStart: async ({ platform }) => {
      const platformKey = normalizeConnectPlatform(platform);
      const response = await this.request(
        `/agent/platform/connect/start?platform=${encodeURIComponent(
          platformKey,
        )}`,
      );

      return {
        success: true,
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
        ...(response.data || {}),
      };
    },

    connectCheck: async ({ platform }) => {
      const platformKey = normalizeConnectPlatform(platform);
      const response = await this.request(
        `/agent/platform/connect/check?platform=${encodeURIComponent(
          platformKey,
        )}`,
      );

      return {
        success: true,
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
        ...(response.data || {}),
      };
    },
  };

  posts = {
    validate: async ({ video, platforms, description, scheduled }) => {
      if (!video) throw new TaislyError("VIDEO_REQUIRED", "Pass --video.");
      if (!description) {
        throw new TaislyError("DESCRIPTION_REQUIRED", "Pass --description.");
      }

      const platformIds = normalizePlatformIds(platforms);
      if (platformIds.length === 0) {
        throw new TaislyError("PLATFORMS_REQUIRED", "Pass at least one TikTok platform id.");
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

      const tikTokPlatforms = await this.assertTikTokPlatformIds(platformIds);

      return {
        success: true,
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
        data: {
          video,
          filename: path.basename(video),
          sizeBytes: fileInfo.size,
          sizeMb: Number((fileInfo.size / 1024 / 1024).toFixed(2)),
          platforms: platformIds,
          platformDetails: tikTokPlatforms,
          descriptionLength: description.length,
          scheduled: scheduled ? normalizeScheduled(scheduled) : null,
        },
      };
    },

    create: async ({ video, platforms, description, scheduled, previewTime = 0 }) => {
      const validation = await this.posts.validate({
        video,
        platforms,
        description,
        scheduled,
      });
      const platformIds = validation.data.platforms;

      const form = new FormData();
      const bytes = await readFile(video);
      const filename = path.basename(video);
      const mimeType = getVideoMimeType(video);
      form.append("video", new Blob([bytes], { type: mimeType }), filename);
      form.append("platforms", JSON.stringify(platformIds));
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
          { historyId, supportedPlatform: ONLY_SUPPORTED_PLATFORM },
        );
      }

      return {
        success: true,
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
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
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
        page: Number(page),
        count: tikTokHistory.length,
        data: tikTokHistory,
      };
    },
  };

  reposts = {
    create: async ({ from, to }) => {
      if (!from) throw new TaislyError("REPOST_FROM_REQUIRED", "Pass --from with a TikTok platform id.");
      const toList = normalizePlatformIds(to);
      if (toList.length === 0) {
        throw new TaislyError("REPOST_TO_REQUIRED", "Pass at least one TikTok destination.");
      }

      await this.assertTikTokPlatformIds([String(from), ...toList]);

      return this.request("/repost/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: toList }),
      });
    },

    list: async () => {
      const response = await this.request("/reposts");
      const reposts = filterRepostsForTikTok(response.data || []);

      return {
        success: true,
        supportedPlatform: ONLY_SUPPORTED_PLATFORM,
        data: reposts,
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

export function getPlatformSchema(platform = ONLY_SUPPORTED_PLATFORM) {
  const normalized = String(platform || ONLY_SUPPORTED_PLATFORM).toLowerCase();

  if (normalized !== "tiktok") {
    throw new TaislyError(
      "UNSUPPORTED_PLATFORM",
      "Only TikTok is supported by this tool.",
      { requestedPlatform: platform, supportedPlatform: ONLY_SUPPORTED_PLATFORM },
    );
  }

  return {
    platform: ONLY_SUPPORTED_PLATFORM,
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

export function normalizePlatformIds(platforms) {
  if (!platforms) return [];
  if (Array.isArray(platforms)) return platforms.map(String).filter(Boolean);
  return String(platforms)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeConnectPlatform(platform) {
  const value = String(platform || "")
    .trim()
    .toLowerCase();

  if (!value) {
    throw new TaislyError("PLATFORM_REQUIRED", "Pass --platform tiktok.");
  }

  if (value !== "tiktok") {
    throw new TaislyError(
      "UNSUPPORTED_PLATFORM",
      "Only TikTok account connections are supported by this tool.",
      { requestedPlatform: platform, supportedPlatform: ONLY_SUPPORTED_PLATFORM },
    );
  }

  return value;
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

function normalizePlatforms(platforms) {
  return platforms.map((platform) => ({
    ...platform,
    id: String(platform.id || platform._id || ""),
    platform: platform.platform || platform.identifier,
  }));
}

function isTikTokPlatform(platform) {
  const value = String(platform?.platform || platform?.identifier || "")
    .trim()
    .toLowerCase();

  return value === "tiktok";
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
  return results.filter(isTikTokPlatform);
}

function filterRepostsForTikTok(reposts) {
  return reposts
    .map((repost) => ({
      ...repost,
      to: (repost.to || []).filter(isTikTokPlatform),
    }))
    .filter((repost) => isTikTokPlatform(repost.from) && repost.to.length > 0);
}

function normalizePostCreateResponse(response) {
  const historyId = response.historyId || response.id || response.data?.id;

  return {
    success: true,
    supportedPlatform: ONLY_SUPPORTED_PLATFORM,
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
