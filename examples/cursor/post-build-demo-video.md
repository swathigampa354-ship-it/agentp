# Cursor Recipe: Post A Build Demo Video To TikTok

Use this recipe when a developer asks Cursor to publish a build/demo video to TikTok after shipping a feature.

## Prompt Shape

```txt
Use this TikTok-only tool to post ./assets/build-demo.mp4 to my connected TikTok account.
Use a short caption that mentions the feature shipped today.
```

## Steps

1. Check that credentials are available.

```bash
taisly auth:status
```

2. List connected TikTok accounts and choose the requested destination.

```bash
taisly platforms:list
```

3. Create a JSON payload.

```json
{
  "video": "./assets/build-demo.mp4",
  "platforms": ["tiktok_platform_id"],
  "description": "Shipped today: a faster workflow for publishing TikTok videos."
}
```

4. Validate the payload.

```bash
taisly posts:validate --json ./campaign.json
```

5. Confirm with the developer before publishing.

6. Create the post.

```bash
taisly posts:create --json ./campaign.json
```

7. Save the returned `historyId` in the final response.

## Safety

- Do not use generated captions that imply unsupported product claims.
- Do not publish from a dirty build artifact unless the user confirms the exact file.
