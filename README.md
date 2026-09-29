# Network File Finder

A lightweight, dependency-free browser DevTools snippet for finding and downloading files that a web page has already loaded.

Useful when a website's own **Download** or **Print** button is broken, but the browser has already requested the underlying PDF, image, audio, video, or stream manifest.

## Features

- Finds resources from the browser Performance API and common page elements.
- Detects PDF files, images, direct video files, audio files, HLS manifests (`.m3u8`), and DASH manifests (`.mpd`).
- Downloads direct resources using the current browser session.
- Supports HTTP `206 Partial Content` and byte-range downloads.
- Includes Download, Copy URL, Open in new tab, Rescan, and Export JSON.
- No dependencies and no build step.
- Runs entirely in the browser.

## Usage

### Microsoft Edge / Google Chrome

1. Open the target web page.
2. Press `F12` to open DevTools.
3. Go to `Sources -> Snippets`.
4. Create a new snippet.
5. Copy the contents of `network-file-finder.js` into it.
6. Press `Ctrl + Enter`.
7. The **Network File Finder** panel will appear on the page.

If the resource is not visible yet, open or scroll through the document/media and press **Rescan**.

## Example

```text
1. PDF
document.pdf
[Download] [Copy URL] [New Tab]

2. IMAGE
preview.jpg
[Download] [Copy URL] [New Tab]

3. STREAM
master.m3u8
[Open] [Copy URL] [New Tab]
```

## How it works

The script checks resources exposed through:

- `performance.getEntriesByType("resource")`
- `<a href>`
- `<img src>`
- `<video src>`
- `<audio src>`
- `<source src>`
- `<iframe src>`

Detected URLs are classified by file extension.

For direct resources, the script uses `fetch()` with the current browser session. If a server responds with `206 Partial Content`, the script can request the required byte ranges and rebuild the file before downloading it.

## Supported resource types

| Type | Extensions |
|---|---|
| PDF | `.pdf` |
| Images | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`, `.bmp`, `.avif` |
| Video | `.mp4`, `.webm`, `.mov`, `.mkv`, `.m4v` |
| Audio | `.mp3`, `.m4a`, `.aac`, `.ogg`, `.wav`, `.flac` |
| HLS | `.m3u8` |
| DASH | `.mpd` |

## Limitations

- The resource must already be visible or accessible to the current page/session.
- Cross-origin restrictions may prevent JavaScript from downloading some files directly.
- In those cases, **Copy URL** or **New Tab** may still work.
- HLS/DASH manifests are detected, but stream segments are not merged automatically.
- DRM-protected media is not decrypted or bypassed.
- Authentication, paywalls, and access controls are not bypassed.

## Intended use

Use this tool only for content you own, are authorized to access, or are otherwise allowed to download.

This project is intended for debugging, recovery, development, testing, and legitimate file access when a website's normal download/print interface is broken.

## Project structure

```text
network-file-finder/
├── network-file-finder.js
├── README.md
├── LICENSE
└── .gitignore
```

## Requirements

- A modern browser with DevTools
- Tested primarily with Chromium-based browsers such as Microsoft Edge and Google Chrome

## Development

There is no build process. Edit `network-file-finder.js`, then run it directly from a browser DevTools snippet.

## License

MIT License.
