---
name: tiktok-only-social-media-posting
description: TikTok-only short-form video publishing from AI agents through Taisly.
version: 0.2.8-tiktok-only
metadata:
  publicName: TikTok-only Social Media Posting Skill
  requirements:
    binaries:
      - taisly
    envVars:
      - TAISLY_API_KEY
---

# TikTok-only Social Media Posting Skill

Use this skill when a user asks an AI agent to publish, schedule, inspect, or retry short-form video posting through this TikTok-only fork.

This fork supports **TikTok only**. Do not select, connect, validate, publish, schedule, or manage any other social platform.

## Safety Rules

- List connected TikTok accounts before taking action.
- Use exact TikTok platform IDs returned by `taisly platforms:list`.
- Never invent platform IDs.
- Never expose or print `TAISLY_API_KEY`.
- Validate the video, caption, destination TikTok account, and schedule before creating a post.
- Ask for explicit confirmation before publishing or scheduling a live TikTok post unless the user has already provided exact video, TikTok account, caption, and schedule.
- Save the returned `historyId` so status can be checked later.
- Do not retry a create call blindly after a timeout; check history first.
- Do not bypass TikTok rules, account permissions, authentication checks, or media validation.

## Environment

Prefer the browser setup flow:

```bash
taisly setup --agent <agent-slug>
taisly checkin --agent <agent-slug>
taisly auth:status
```

Manual fallback:

```bash
export TAISLY_API_KEY="taisly_..."
```

## Commands

```bash
taisly auth:status
taisly setup --agent <agent-slug>
taisly checkin --agent <agent-slug>
taisly platforms:list
taisly integrations:list
taisly platforms:schema --platform TikTok
taisly platforms:connect:start --platform tiktok
taisly platforms:connect:check --platform tiktok
taisly posts:validate --video ./video.mp4 --platforms tiktok_platform_id_1,tiktok_platform_id_2 --description "Caption"
taisly posts:create --video ./video.mp4 --platforms tiktok_platform_id_1,tiktok_platform_id_2 --description "Caption" --scheduled "2026-06-14T09:00:00+07:00"
taisly posts:create --json ./campaign.json
taisly posts:list --page 1
taisly posts:status --id <historyId>
taisly reposts:list
taisly reposts:create --from <tiktok_platform_id> --to <tiktok_platform_id_1,tiktok_platform_id_2>
taisly mcp
```

All commands return JSON.

## MCP Tools

When the MCP server is connected, use these tools instead of shell commands:

- `taisly_agent_setup_start`
- `taisly_agent_checkin`
- `taisly_auth_status`
- `taisly_platforms_list`
- `taisly_platform_schema`
- `taisly_platform_connect_start`
- `taisly_platform_connect_check`
- `taisly_posts_validate`
- `taisly_posts_create`
- `taisly_posts_status`
- `taisly_posts_list`
- `taisly_reposts_list`
- `taisly_reposts_create`

`taisly_posts_create` requires `confirmed: true`. Set it only after explicit user approval.

## Recommended Agent Workflow

1. Run `taisly auth:status`.
2. Run `taisly platforms:list`.
3. Match the user's requested TikTok accounts to exact IDs.
4. If a TikTok account is missing and a connect tool is available, run `taisly platforms:connect:start --platform tiktok`, give the user the returned `connectUrl`, wait for browser approval, then run `taisly platforms:connect:check --platform tiktok`.
5. Run `taisly platforms:schema --platform TikTok`.
6. Run `taisly posts:validate`.
7. Show the final TikTok account, video, caption, and schedule.
8. Run `taisly posts:create` only after confirmation.
9. Report the returned `historyId`, scheduled date, and initial status.
10. Use `taisly posts:status --id <historyId>` or `taisly posts:list --page 1` for follow-up.

## Error Handling

- `TAISLY_API_KEY_MISSING`: ask the user to run setup or provide an API key through the environment.
- `SETUP_SESSION_MISSING`: run `taisly setup --agent <agent-slug>`, ask the user to open the returned login URL, then run `taisly checkin --agent <agent-slug>`.
- `PLATFORMS_REQUIRED`: ask which connected TikTok accounts should receive the post.
- `TIKTOK_PLATFORM_ID_REQUIRED`: ask the user to choose IDs from `taisly platforms:list`.
- `VIDEO_REQUIRED`: ask for a local video path.
- `LIMIT`: tell the user the current plan limit has been reached. Use `agent.message` and `agent.paymentLinks` when present, ask them to upgrade in Taisly before retrying, and do not open or use payment links without explicit confirmation.
- `POST_NOT_FOUND_IN_RECENT_TIKTOK_HISTORY`: tell the user the TikTok post was not found in recent history and ask them to check Taisly History if needed.

## What Not To Do

- Do not post to every connected TikTok account unless the user explicitly asks.
- Do not publish without confirmation.
- Do not print secrets.
- Do not create, connect, validate, or manage any non-TikTok platform.
