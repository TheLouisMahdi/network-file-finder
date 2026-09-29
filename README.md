# Network File Finder

A small, dependency-free browser DevTools snippet that finds media and document resources already loaded by the current page.

It is useful when a site's own **Download** or **Print** button is broken, while the browser has already requested the underlying PDF, image, audio, video, or stream manifest.

## Features

- Finds resources from the browser Performance API and common DOM elements.
- Detects:
  - PDF
  - Images
  - Direct video files
  - Audio files
  - HLS/DASH manifests (`.m3u8`, `.mpd`)
- Downloads direct resources using the current browser session.
- Handles HTTP `206 Partial Content` responses by re-requesting byte ranges when needed.
- Copies or opens the original resource URL.
- Exports the discovered resource list as JSON.
- No dependencies and no build step.

## Usage

### Chrome / Edge DevTools Snippet

1. Open the target page.
2. Open DevTools (`F12`).
3. Go to **Sources → Snippets**.
4. Create a new snippet.
5. Paste the contents of `network-file-finder.js`.
6. Run it with `Ctrl + Enter`.
7. A small panel will appear on the page.
8. Open/scroll the document or media and press **Rescan** if necessary.

## Notes

The tool only works with resources that the current browser page can already see or access.

Cross-origin restrictions can prevent JavaScript from fetching some resources even when the browser itself has loaded them. In that case, **Open URL** or **Copy URL** may still be useful.

HLS/DASH manifests are listed, but this project does not merge stream segments or bypass DRM.

## Intended use

Use this tool for content you own, are authorized to access, or are otherwise allowed to download. It is not intended to bypass authentication, paywalls, DRM, or access controls.

## Supported browsers

Tested conceptually for Chromium-based browsers such as:

- Microsoft Edge
- Google Chrome

Other modern browsers may also work if their DevTools support snippets and the Performance API.

## Project structure

```text
network-file-finder/
├── network-file-finder.js
├── README.md
├── LICENSE
└── .gitignore
```

## License

MIT
