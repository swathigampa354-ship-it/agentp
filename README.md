# TikTok Account Posting Agent Kit

This repository is a small TikTok-only control tool around the existing Taisly system.

It keeps the pieces needed for the current workflow:

- authenticate with Taisly,
- list connected TikTok accounts,
- connect/check a TikTok account when needed,
- inspect TikTok posting constraints,
- validate a local video payload,
- publish or schedule a TikTok video,
- check TikTok post history/status,
- expose the workflow through CLI, MCP, and the SDK/API client.

This is not the future custom scheduler/backend/database. Videos from GitHub and AI-led scheduling logic will be added later.

## Install

```bash
npm install
```

Run without installing globally:

```bash
node src/cli.js help
```

Start the local stdio MCP server:

```bash
node src/cli.js mcp
```

## Authentication

Use the existing Taisly browser setup flow:

```bash
node src/cli.js setup --agent local-agent
# Open the returned loginUrl and finish authentication.
node src/cli.js checkin --agent local-agent
node src/cli.js auth:status
```

Manual fallback:

```bash
export TAISLY_API_KEY="taisly_..."
```

Never print or commit API keys.

## CLI workflow

List connected TikTok accounts:

```bash
node src/cli.js accounts:list
```

Get the TikTok posting schema:

```bash
node src/cli.js schema
```

Connect a TikTok account:

```bash
node src/cli.js account:connect:start
# Open the returned connectUrl and finish authorization.
node src/cli.js account:connect:check
```

Validate a TikTok post:

```bash
node src/cli.js posts:validate \
  --video ./launch.mp4 \
  --accounts tiktok_account_id_1,tiktok_account_id_2 \
  --description "Launch day"
```

Publish now:

```bash
node src/cli.js posts:create \
  --video ./launch.mp4 \
  --accounts tiktok_account_id_1,tiktok_account_id_2 \
  --description "Launch day"
```

Schedule for later:

```bash
node src/cli.js posts:create \
  --video ./launch.mp4 \
  --accounts tiktok_account_id_1,tiktok_account_id_2 \
  --description "Launch day" \
  --scheduled "2026-06-14T09:00:00+07:00"
```

Check status/history:

```bash
node src/cli.js posts:list --page 1
node src/cli.js posts:status --id <historyId>
```

## JSON payload

```json
{
  "video": "./launch.mp4",
  "accounts": ["tiktok_account_id_1", "tiktok_account_id_2"],
  "description": "Launch day. Short demo, big update.",
  "scheduled": "2026-06-14T09:00:00+07:00"
}
```

```bash
node src/cli.js posts:validate --json ./campaign.json
node src/cli.js posts:create --json ./campaign.json
```

The `video` path must point to a real local file available to the agent. Supported local preflight extensions are `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.flv`, `.mpeg`, and `.mpg`.

## Final CLI command list

```text
setup --agent <agent>
checkin --agent <agent>
auth:status
accounts:list
schema
account:connect:start
account:connect:check
posts:validate
posts:create
posts:list
posts:status
mcp
```

## MCP tools

The local MCP server exposes only the tools needed for TikTok account posting:

- `taisly_agent_setup_start`
- `taisly_agent_checkin`
- `taisly_auth_status`
- `taisly_accounts_list`
- `taisly_schema`
- `taisly_account_connect_start`
- `taisly_account_connect_check`
- `taisly_posts_validate`
- `taisly_posts_create`
- `taisly_posts_status`
- `taisly_posts_list`

`taisly_posts_create` requires `confirmed: true`. Set it only after the user explicitly approves the TikTok account, video, caption, and schedule.

## What this fork is not

- It is not the future custom scheduler.
- It is not a replacement backend or database.
- It is not a browser automation worker.
- It is not a TikTok account/profile manager.
- It does not import videos from GitHub yet.
- It does not bypass TikTok rules, account permissions, authentication checks, or media validation.

## Safety workflow

Use this order for agent-controlled posting:

```text
auth -> list TikTok accounts -> TikTok schema -> validate -> confirm -> create -> status
```
