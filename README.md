# Network File Finder

A standalone browser DevTools snippet for finding and downloading files that a web page has already loaded.

Useful when a website's own **Download** or **Print** button is broken, but the browser has already requested the underlying PDF, image, audio, video, or stream manifest.

## Features

- Finds resources from the browser Performance API and common page elements.
- Detects PDF files, images, direct video files, audio files, HLS manifests (`.m3u8`), and DASH manifests (`.mpd`).
- Detects extensionless MSE/DASH-style audio and video track requests, including classic YouTube `videoplayback` URLs.
- Handles YouTube's current SABR/UMP delivery for clear on-demand videos by downloading separate H.264 video and AAC audio tracks.
- Selects the highest-resolution video and highest-bitrate matching audio source and remuxes them into one MP4 without re-encoding.
- Streams direct downloads and remuxed output to the File System Access API instead of buffering large files in memory.
- Supports HTTP `206 Partial Content` and byte-range downloads.
- Uses recording only if direct download/remuxing fails.
- Bundles Mediabunny and GoogleVideo into the distributable file; there are no CDN imports or runtime dependencies.
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
[Download]

2. VIDEO + AUDIO
1 video + 1 audio source(s)
[Download]
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

Detected URLs are classified by file extension and media metadata in their query parameters. Adaptive audio/video requests are grouped by content ID and inspected with the bundled Mediabunny demuxer before the best pair is selected.

On YouTube, the snippet uses the current page/player response and bundled player logic to resolve the browser-authorized media URLs. It prefers compatible separate H.264 video and AAC audio tracks and remuxes them into one MP4; clear SABR/UMP sessions are supported when YouTube does not require attestation. It does not generate PO tokens, decipher protected content, or bypass access controls.

For direct resources, the script uses `fetch()` with the current browser session. If a server responds with `206 Partial Content`, the script requests the remaining byte ranges. On Chromium, data is written directly to the chosen destination. Adaptive media packets are copied into a new MP4 container without decoding or re-encoding.

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
- Cross-origin restrictions may prevent JavaScript from reading some files directly.
- YouTube live streams and SABR sessions that demand attestation/PO tokens are not downloaded through the fast path; no token generation, DRM, authentication, or access-control bypass is attempted.
- If YouTube withholds a separate high-quality range, a playable progressive MP4 (when exposed) is used so the result still contains both video and audio.
- HLS/DASH manifests are detected, but manifest-only segmented streams without directly exposed media URLs are not assembled.
- Browsers without the File System Access API use an in-memory download fallback.
- DRM-protected media is not decrypted or bypassed.
- Authentication, paywalls, and access controls are not bypassed.

## Intended use

Use this tool only for content you own, are authorized to access, or are otherwise allowed to download.

This project is intended for debugging, recovery, development, testing, and legitimate file access when a website's normal download/print interface is broken.

## Project structure

```text
network-file-finder/
├── src/network-file-finder.js
├── network-file-finder.js
├── package.json
├── package-lock.json
├── README.md
├── LICENSE
└── .gitignore
```

## Requirements

- A modern browser with DevTools
- Tested primarily with Chromium-based browsers such as Microsoft Edge and Google Chrome

## Development

Install dependencies and rebuild the standalone snippet after editing the source:

```sh
npm install
npm run build
npm run check
```

`network-file-finder.js` is the only file end users need to paste into DevTools.

## License

Project code is MIT licensed. The bundled GoogleVideo code is MIT licensed. The bundled Mediabunny code is MPL-2.0 licensed. Their notices are retained in the generated snippet.
