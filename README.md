# Network File Finder

A single-file DevTools Snippet that finds and downloads files requested by the current web page.

## Features

- Downloads PDFs, images, audio, direct video, and blob URLs.
- Detects HLS, DASH, MSE, and extensionless media requests.
- Supports HTTP range downloads and streams large files to disk when the File System Access API is available.
- Detects separate video and audio tracks, selects the best compatible pair, and remuxes them into one MP4 without re-encoding.
- Supports public YouTube videos through signed player URLs and clear SABR/UMP streams.
- Falls back to a progressive MP4 when separate YouTube tracks are unavailable, ensuring the file contains both video and audio.
- Uses real-time recording only as the final fallback.
- Shows exactly one **Download** button for each detected item.
- Bundles all required libraries; no CDN imports or runtime installation are needed.

## Usage

1. Open the target page in Chrome or Edge.
2. Open `DevTools -> Sources -> Snippets`.
3. Create a snippet and paste the contents of `network-file-finder.js`.
4. Run it with `Ctrl + Enter`.
5. For YouTube, run the snippet before playback, then play and seek once.
6. Click **Download** and choose the save location.

`network-file-finder.js` is the only file end users need.

## Development

```sh
npm install
npm run build
npm run check
```

Source code is in `src/network-file-finder.js`; the build creates the standalone `network-file-finder.js` snippet.

## Limitations

- Browser CORS rules may block some cross-origin resources.
- Manifest-only HLS/DASH streams are detected but are not always assembled.
- DRM, authentication, paywalls, PO-token requirements, and access controls are never bypassed.
- YouTube live or attestation-protected sessions may require the recording fallback or may not be downloadable.

Use this tool only for content you own or are authorized to download.

## License

MIT. Bundled third-party license notices are retained in the generated snippet.
