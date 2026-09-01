# Codex Recipe: Post A Short Video To TikTok

Use this recipe when the user asks Codex to publish a short-form video to TikTok through this fork.

## Preconditions

- `TAISLY_API_KEY` is set in the local environment.
- The video file exists locally.
- The user has connected TikTok accounts in Taisly.

## Prompt Shape

```txt
Post ./launch.mp4 to my connected TikTok account with this caption:
"New product update is live."
Ask me to confirm the destination account before publishing.
```

## Steps For Codex

1. Check authentication.

```bash
taisly auth:status
```

2. List connected TikTok accounts.

```bash
taisly platforms:list
```

3. Ask the user to confirm the exact TikTok account ID.

4. Create a payload file.

```json
{
  "video": "./launch.mp4",
  "platforms": ["tiktok_platform_id"],
  "description": "New product update is live."
}
```

5. Validate before posting.

```bash
taisly posts:validate --json ./campaign.json
```

6. Publish only after confirmation.

```bash
taisly posts:create --json ./campaign.json
```

7. Store and report the returned `historyId`.

```bash
taisly posts:status --id <historyId>
```

## Safety

- Do not invent TikTok platform IDs.
- Do not post to every connected TikTok account unless the user explicitly asks.
- Do not print `TAISLY_API_KEY`.
