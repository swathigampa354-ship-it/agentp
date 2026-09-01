# Claude Code Recipe: Schedule A TikTok Video Post

Use this recipe when the user asks Claude Code to schedule a short-form video to TikTok through this fork.

## Prompt Shape

```txt
Schedule ./demo.mp4 for tomorrow at 9 AM Bangkok time on my connected TikTok account.
Caption: "A quick demo of what shipped today."
```

## Steps

1. Discover connected TikTok accounts.

```bash
taisly platforms:list
```

2. Inspect TikTok constraints.

```bash
taisly platforms:schema --platform TikTok
```

3. Convert the requested time to an explicit ISO timestamp.

```json
{
  "video": "./demo.mp4",
  "platforms": ["tiktok_platform_id"],
  "description": "A quick demo of what shipped today.",
  "scheduled": "2026-06-14T09:00:00+07:00"
}
```

4. Validate and ask for confirmation.

```bash
taisly posts:validate --json ./campaign.json
```

5. Create the scheduled TikTok post after confirmation.

```bash
taisly posts:create --json ./campaign.json
```

6. Report the returned `historyId` and scheduled time.

## Safety

- Always show the exact TikTok account name/ID before scheduling.
- Do not silently change timezone.
- If the date is ambiguous, ask the user before creating the post.
