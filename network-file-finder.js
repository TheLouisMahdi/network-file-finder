(() => {
  "use strict";

  const APP_ID = "__network_file_finder__";
  document.getElementById(APP_ID)?.remove();

  const EXTENSIONS = {
    PDF: /\.(pdf)(?:$|[?#])/i,
    IMAGE: /\.(png|jpe?g|webp|gif|svg|bmp|avif)(?:$|[?#])/i,
    VIDEO: /\.(mp4|webm|mov|mkv|m4v)(?:$|[?#])/i,
    STREAM: /\.(m3u8|mpd)(?:$|[?#])/i,
    AUDIO: /\.(mp3|m4a|aac|ogg|wav|flac)(?:$|[?#])/i
  };

  const files = new Map();

  function classify(url) {
    for (const [type, pattern] of Object.entries(EXTENSIONS)) {
      if (pattern.test(url)) return type;
    }
    return null;
  }

  function add(url) {
    if (!url || typeof url !== "string") return;

    try {
      const absolute = new URL(url, location.href).href;
      const type = classify(absolute);
      if (type) files.set(absolute, { type, url: absolute });
    } catch {}
  }

  function scan() {
    for (const entry of performance.getEntriesByType("resource")) {
      add(entry.name);
    }

    const sources = [
      ["a[href]", "href"],
      ["img[src]", "src"],
      ["video[src]", "src"],
      ["audio[src]", "src"],
      ["source[src]", "src"],
      ["iframe[src]", "src"]
    ];

    for (const [selector, attribute] of sources) {
      for (const element of document.querySelectorAll(selector)) {
        add(element.getAttribute(attribute));
      }
    }

    render();
  }

  function getFilename(url, type) {
    try {
      const pathname = new URL(url).pathname;
      const name = decodeURIComponent(pathname.split("/").pop() || "");
      if (name) return name;
    } catch {}

    const fallback = {
      PDF: "document.pdf",
      IMAGE: "image",
      VIDEO: "video",
      AUDIO: "audio",
      STREAM: "stream"
    };

    return fallback[type] || "download";
  }

  function saveBlob(blob, name) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
  }

  async function downloadFile(file, button) {
    const originalText = button.textContent;

    try {
      button.disabled = true;
      button.textContent = "Loading...";

      const response = await fetch(file.url, {
        credentials: "include",
        cache: "no-store"
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const contentRange = response.headers.get("content-range");
      const match = contentRange?.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);

      if (response.status === 206 && match) {
        const first = Number(match[1]);
        const last = Number(match[2]);
        const total = Number(match[3]);

        if (Number.isFinite(total) && (first !== 0 || last + 1 < total)) {
          const chunkSize = 4 * 1024 * 1024;
          const chunks = [];

          for (let start = 0; start < total; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, total - 1);
            button.textContent = `${Math.floor((start / total) * 100)}%`;

            const part = await fetch(file.url, {
              credentials: "include",
              cache: "no-store",
              headers: { Range: `bytes=${start}-${end}` }
            });

            if (!part.ok && part.status !== 206) {
              throw new Error(`Range request failed: ${part.status}`);
            }

            chunks.push(await part.arrayBuffer());
          }

          saveBlob(new Blob(chunks), getFilename(file.url, file.type));
          button.textContent = "Done";
          return;
        }
      }

      saveBlob(await response.blob(), getFilename(file.url, file.type));
      button.textContent = "Done";
    } catch (error) {
      console.error("[Network File Finder]", error);
      button.textContent = "Open URL";
      window.open(file.url, "_blank", "noopener,noreferrer");
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 2000);
    }
  }

  async function copyText(text, button) {
    const oldText = button.textContent;

    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      prompt("Copy URL:", text);
    }

    setTimeout(() => {
      button.textContent = oldText;
    }, 1200);
  }

  function exportJson() {
    const data = {
      page: location.href,
      capturedAt: new Date().toISOString(),
      files: [...files.values()]
    };

    saveBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      "network-files.json"
    );
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  const panel = document.createElement("div");
  panel.id = APP_ID;
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: min(560px, calc(100vw - 40px));
    max-height: 78vh;
    z-index: 2147483647;
    background: #111;
    color: #eee;
    border: 1px solid #444;
    border-radius: 10px;
    box-shadow: 0 10px 40px #0008;
    font: 13px/1.4 Arial, sans-serif;
    overflow: hidden;
  `;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px;background:#1c1c1c;border-bottom:1px solid #333">
      <strong style="flex:1">Network File Finder</strong>
      <button data-action="scan">Rescan</button>
      <button data-action="export">Export JSON</button>
      <button data-action="close" aria-label="Close">×</button>
    </div>
    <div data-role="status" style="padding:8px 10px;color:#aaa"></div>
    <div data-role="list" style="max-height:66vh;overflow:auto;padding:8px"></div>
  `;

  document.body.appendChild(panel);

  panel.querySelector('[data-action="close"]').onclick = () => panel.remove();
  panel.querySelector('[data-action="scan"]').onclick = scan;
  panel.querySelector('[data-action="export"]').onclick = exportJson;

  function render() {
    const list = panel.querySelector('[data-role="list"]');
    const status = panel.querySelector('[data-role="status"]');
    const data = [...files.values()];

    status.textContent = `${data.length} file(s) found`;
    list.replaceChildren();

    if (!data.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:20px;text-align:center;color:#888";
      empty.innerHTML =
        "No matching resources found yet.<br><br>Open or scroll the document/video, then press <b>Rescan</b>.";
      list.appendChild(empty);
      return;
    }

    data.forEach((file, index) => {
      const row = document.createElement("div");
      row.style.cssText =
        "padding:9px;margin-bottom:7px;border:1px solid #333;border-radius:7px;background:#181818";

      const name = getFilename(file.url, file.type);

      row.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <strong style="color:#ffca58">${index + 1}. ${file.type}</strong>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escapeHtml(name)}</span>
        </div>
        <div style="font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:7px">
          ${escapeHtml(file.url)}
        </div>
        <div style="display:flex;gap:6px">
          <button data-action="primary">${file.type === "STREAM" ? "Open" : "Download"}</button>
          <button data-action="copy">Copy URL</button>
          <button data-action="open">New Tab</button>
        </div>
      `;

      const primary = row.querySelector('[data-action="primary"]');
      primary.onclick = () => {
        if (file.type === "STREAM") {
          window.open(file.url, "_blank", "noopener,noreferrer");
        } else {
          downloadFile(file, primary);
        }
      };

      row.querySelector('[data-action="copy"]').onclick = event =>
        copyText(file.url, event.currentTarget);

      row.querySelector('[data-action="open"]').onclick = () =>
        window.open(file.url, "_blank", "noopener,noreferrer");

      list.appendChild(row);
    });
  }

  scan();

  try {
    const observer = new PerformanceObserver(scan);
    observer.observe({ type: "resource", buffered: true });
  } catch {}
})();