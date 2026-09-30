# Contributing

Thanks for helping improve Network File Finder.

## Before You Start

- Search existing issues before opening a new one.
- Open an issue before a large or behavior-changing pull request.
- Keep changes focused; broad rewrites are unlikely to be accepted.
- Do not add DRM, authentication, paywall, or access-control bypasses.
- Only test with content you own or are authorized to download.

## Development

Requirements: a current Node.js release and npm.

```sh
npm install
npm run build
npm run check
```

Edit `src/network-file-finder.js`. If the source changes, commit the regenerated standalone `network-file-finder.js` too.

## Testing

Test the built file as a Chrome or Edge DevTools Snippet. Confirm that:

- Each detected item has exactly one **Download** button.
- Direct PDF, image, audio, video, and blob downloads still work.
- Separate video and audio tracks produce one playable file with both tracks.
- Non-realtime download paths are attempted before recording.
- Large downloads are streamed when the browser supports it.

Run `npm run check` before submitting a pull request. Describe the sites and browser versions you tested, but do not include private URLs, cookies, tokens, or personal data.

## Pull Requests

- Explain the problem and the smallest solution used.
- Link related issues.
- Include test results and any remaining limitation.
- Disclose copied or adapted code and its source and license.
- Preserve third-party notices and avoid new runtime CDN dependencies.

By submitting a contribution, you agree that your contribution may be distributed under this project's license.
