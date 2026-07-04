import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_FILENAME = "config.json";

export function getConfigDir() {
  return (
    process.env.TAISLY_CONFIG_HOME ||
    path.join(os.homedir(), ".taisly")
  );
}

export function getConfigPath() {
  return path.join(getConfigDir(), CONFIG_FILENAME);
}

export function readConfig() {
  const filepath = getConfigPath();

  if (!existsSync(filepath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(filepath, "utf8"));
  } catch (_) {
    return {};
  }
}

export function readStoredCredential() {
  const config = readConfig();
  return {
    apiKey: config.apiKey,
  };
}

export function saveCredential({ apiKey }) {
  const config = readConfig();
  writeConfig({
    ...config,
    apiKey,
    updatedAt: new Date().toISOString(),
  });
}

export function savePendingSetup({ agent, checkinToken, loginUrl, expiresAt }) {
  const config = readConfig();
  const setup = {
    ...(config.setup || {}),
    [agent]: {
      agent,
      checkinToken,
      loginUrl,
      expiresAt,
      createdAt: new Date().toISOString(),
    },
  };

  writeConfig({
    ...config,
    setup,
    updatedAt: new Date().toISOString(),
  });
}

export function readPendingSetup(agent) {
  const config = readConfig();
  return config.setup?.[agent];
}

export function clearPendingSetup(agent) {
  const config = readConfig();

  if (!config.setup?.[agent]) return;

  const setup = { ...config.setup };
  delete setup[agent];

  writeConfig({
    ...config,
    setup,
    updatedAt: new Date().toISOString(),
  });
}

function writeConfig(config) {
  const dir = getConfigDir();
  const filepath = getConfigPath();

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(filepath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });

  try {
    chmodSync(dir, 0o700);
    chmodSync(filepath, 0o600);
  } catch (_) {
    // Best effort only; Windows and some filesystems do not support chmod.
  }
}
