import {
  ALL_FORMATS,
  CustomSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
  ReadableStreamSource,
  StreamTarget,
  UrlSource
} from "mediabunny";
import { SabrStream } from "googlevideo/sabr-stream";
import { Platform, Player } from "youtubei.js/web";

(() => {
  "use strict";

  const APP_ID = "__network_file_finder__";
  const INSTANCE_KEY = "__NETWORK_FILE_FINDER_INSTANCE__";
  const TEST_SINK_KEY = "__NETWORK_FILE_FINDER_TEST_SINK__";
  const CHUNK_SIZE = 4 * 1024 * 1024;

  globalThis[INSTANCE_KEY]?.destroy?.();
  document.getElementById(APP_ID)?.remove();

  const EXTENSIONS = {
    PDF: /\.(pdf)(?:$|[?#])/i,
    IMAGE: /\.(png|jpe?g|webp|gif|svg|bmp|avif)(?:$|[?#])/i,
    VIDEO: /\.(mp4|webm|mov|mkv|m4v)(?:$|[?#])/i,
    STREAM: /\.(m3u8|mpd)(?:$|[?#])/i,
    AUDIO: /\.(mp3|m4a|aac|ogg|wav|flac)(?:$|[?#])/i
  };

  const files = new Map();
  const adaptiveGroups = new Map();
  let youtubeItem = null;
  let observer = null;
  let scanTimer = 0;

  function classify(url, hint) {
    if (url.startsWith("blob:")) return "BLOB";
    for (const [type, pattern] of Object.entries(EXTENSIONS)) {
      if (pattern.test(url)) return type;
    }
    return hint || null;
  }

  function parseAdaptive(absolute) {
    try {
      const url = new URL(absolute);
      const mime = (url.searchParams.get("mime") || "").toLowerCase();
      const kind = mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : null;
      const looksAdaptive = Boolean(
        kind && (url.searchParams.has("itag") || /\/videoplayback(?:$|\/)/i.test(url.pathname))
      );
      if (!looksAdaptive) return null;

      for (const parameter of ["range", "rn", "rbuf", "sq", "ump", "srfvp", "alr"]) {
        url.searchParams.delete(parameter);
      }

      const duration = Number(url.searchParams.get("dur")) || 0;
      const contentLength = Number(url.searchParams.get("clen")) || 0;
      const bitrate = Number(url.searchParams.get("bitrate"))
        || (duration > 0 ? (contentLength * 8) / duration : 0);
      const contentId = url.searchParams.get("id") || url.searchParams.get("docid");
      const groupKey = contentId
        ? `${url.origin}${url.pathname}|${contentId}`
        : `${location.origin}${location.pathname}|${url.origin}${url.pathname}`;

      return {
        bitrate,
        contentLength,
        duration,
        groupKey,
        itag: url.searchParams.get("itag") || "",
        kind,
        mime: mime.split(";")[0],
        url: url.href
      };
    } catch {
      return null;
    }
  }

  function add(rawUrl, hint = null) {
    if (!rawUrl || typeof rawUrl !== "string") return;

    try {
      const absolute = new URL(rawUrl, location.href).href;
      const adaptive = parseAdaptive(absolute);
      if (adaptive) {
        let group = adaptiveGroups.get(adaptive.groupKey);
        if (!group) {
          group = {
            key: adaptive.groupKey,
            type: "ADAPTIVE",
            videos: new Map(),
            audios: new Map()
          };
          adaptiveGroups.set(adaptive.groupKey, group);
        }
        const target = adaptive.kind === "video" ? group.videos : group.audios;
        target.set(adaptive.url, adaptive);
        return;
      }

      const type = classify(absolute, hint);
      if (type) files.set(absolute, { type, url: absolute });
    } catch {}
  }

  function currentYouTubeResponse() {
    const playerResponse = document.getElementById("movie_player")?.getPlayerResponse?.();
    const configuredResponse = globalThis.ytplayer?.config?.args?.raw_player_response;
    const initialResponse = globalThis.ytInitialPlayerResponse;
    return [playerResponse, configuredResponse, initialResponse]
      .find(response => response?.streamingData?.serverAbrStreamingUrl);
  }

  function latestYouTubeSabrUrl() {
    return performance.getEntriesByType("resource")
      .map(entry => entry.name)
      .reverse()
      .find(url => /googlevideo\.com\/videoplayback/i.test(url)
        && /[?&]sabr=1(?:&|$)/.test(url)
        && /[?&]alr=yes(?:&|$)/.test(url));
  }

  function scanYouTube() {
    if (!/(^|\.)youtube\.com$/i.test(location.hostname)) {
      youtubeItem = null;
      return;
    }

    const response = currentYouTubeResponse();
    const formats = response?.streamingData?.adaptiveFormats || [];
    const ustreamerConfig = response?.playerConfig?.mediaCommonConfig
      ?.mediaUstreamerRequestConfig?.videoPlaybackUstreamerConfig;
    const hasProtectedFormats = formats.some(format =>
      format.isDrm || format.hasDrm || format.drmFamilies?.length || format.licenseInfos?.length
    );

    if (response?.playabilityStatus?.status !== "OK"
      || !response.streamingData?.serverAbrStreamingUrl
      || !ustreamerConfig
      || hasProtectedFormats) {
      youtubeItem = null;
      return;
    }

    youtubeItem = {
      type: "YOUTUBE",
      response,
      formats,
      sabrUrl: latestYouTubeSabrUrl() || response.streamingData.serverAbrStreamingUrl,
      ustreamerConfig,
      videoId: response.videoDetails?.videoId || new URL(location.href).searchParams.get("v") || "youtube"
    };
  }

  function scan() {
    for (const entry of performance.getEntriesByType("resource")) add(entry.name);

    const sources = [
      ["a[href]", "href", null],
      ["img[src]", "src", "IMAGE"],
      ["video[src]", "src", "VIDEO"],
      ["audio[src]", "src", "AUDIO"],
      ["source[src]", "src", null],
      ["iframe[src]", "src", null]
    ];

    for (const [selector, attribute, hint] of sources) {
      for (const element of document.querySelectorAll(selector)) {
        add(element.getAttribute(attribute), hint);
      }
    }

    scanYouTube();
    render();
  }

  function getFilename(url, type) {
    try {
      const pathname = new URL(url).pathname;
      const name = decodeURIComponent(pathname.split("/").pop() || "");
      if (name && name !== "videoplayback") return name;
    } catch {}

    return {
      PDF: "document.pdf",
      IMAGE: "image",
      VIDEO: "video.mp4",
      AUDIO: "audio",
      STREAM: "stream",
      BLOB: "media"
    }[type] || "download";
  }

  function safeTitle() {
    const title = (document.title || "video")
      .replace(/\s*[-|]\s*YouTube\s*$/i, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .trim();
    return (title || "video").slice(0, 120);
  }

  function itemName(item) {
    return item.type === "ADAPTIVE" || item.type === "YOUTUBE"
      ? `${safeTitle()}.mp4`
      : getFilename(item.url, item.type);
  }

  function itemMime(item) {
    return {
      PDF: "application/pdf",
      IMAGE: "image/*",
      VIDEO: "video/*",
      AUDIO: "audio/*",
      STREAM: "application/octet-stream",
      BLOB: "application/octet-stream",
      ADAPTIVE: "video/mp4",
      YOUTUBE: "video/mp4"
    }[item.type] || "application/octet-stream";
  }

  function extensionOf(name) {
    const match = name.match(/(\.[a-z0-9]{1,8})$/i);
    return match ? match[1] : ".bin";
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

  function requestUrl(input) {
    if (typeof input === "string") return new URL(input, location.href).href;
    if (input instanceof URL) return input.href;
    return input?.url || String(input);
  }

  async function fetchResource(input, init = {}) {
    let crossOrigin = false;
    try {
      crossOrigin = new URL(requestUrl(input), location.href).origin !== location.origin;
    } catch {}

    if (!crossOrigin) {
      return fetch(input, { ...init, credentials: "include" });
    }

    const response = await fetch(input, { ...init, credentials: "omit" });
    if (response.status !== 401 && response.status !== 403) return response;

    try {
      const authenticated = await fetch(input, { ...init, credentials: "include" });
      await response.body?.cancel().catch(() => {});
      return authenticated;
    } catch {
      return response;
    }
  }

  function memoryDestination(name, mime) {
    let sections = [];
    let length = 0;

    return {
      async openWritable() {
        sections = [];
        length = 0;
        return new WritableStream({
          write(chunk) {
            const data = chunk?.data instanceof Uint8Array ? chunk.data : chunk;
            const position = Number.isFinite(chunk?.position) ? chunk.position : length;
            const copy = data.slice();
            sections.push({ data: copy, position });
            length = Math.max(length, position + copy.byteLength);
          }
        });
      },
      async complete() {
        const bytes = new Uint8Array(length);
        for (const section of sections) bytes.set(section.data, section.position);
        saveBlob(new Blob([bytes], { type: mime }), name);
        sections = [];
      }
    };
  }

  async function reserveDestination(item) {
    const name = itemName(item);
    const mime = itemMime(item);
    const testSink = globalThis[TEST_SINK_KEY];

    if (typeof testSink === "function") {
      const supplied = await testSink({ mime, name });
      if (!supplied?.createWritable) throw new Error("The test sink did not provide createWritable().");
      return {
        openWritable: () => supplied.createWritable(),
        complete: () => supplied.complete?.(),
        abort: () => supplied.abort?.()
      };
    }

    if (typeof showSaveFilePicker === "function") {
      const handle = await showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "Downloaded file", accept: { [mime]: [extensionOf(name)] } }]
      });
      return {
        openWritable: () => handle.createWritable(),
        complete: async () => {},
        abort: async () => {}
      };
    }

    return memoryDestination(name, mime);
  }

  async function writeResponse(response, writer, start) {
    if (!response.body) {
      const data = new Uint8Array(await response.arrayBuffer());
      await writer.write({ type: "write", position: start, data });
      return data.byteLength;
    }

    const reader = response.body.getReader();
    let position = start;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write({ type: "write", position, data: value });
      position += value.byteLength;
    }
    return position - start;
  }

  async function downloadDirect(file, destination, button) {
    const writable = await destination.openWritable();
    const writer = writable.getWriter();

    try {
      const firstResponse = await fetchResource(file.url, {
        cache: "no-store",
        headers: { Range: "bytes=0-" }
      });
      if (!firstResponse.ok && firstResponse.status !== 206) {
        throw new Error(`${firstResponse.status} ${firstResponse.statusText}`);
      }

      const match = firstResponse.headers.get("content-range")
        ?.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);

      if (!match) {
        button.textContent = "Downloading...";
        await writeResponse(firstResponse, writer, 0);
      } else {
        const first = Number(match[1]);
        const last = Number(match[2]);
        const total = Number(match[3]);
        let next = 0;

        if (first === 0) {
          await writeResponse(firstResponse, writer, 0);
          next = last + 1;
        } else {
          await firstResponse.body?.cancel();
        }

        while (next < total) {
          const end = Math.min(next + CHUNK_SIZE - 1, total - 1);
          button.textContent = `${Math.floor((next / total) * 100)}%`;
          const response = await fetchResource(file.url, {
            cache: "no-store",
            headers: { Range: `bytes=${next}-${end}` }
          });
          if (!response.ok && response.status !== 206) {
            throw new Error(`Range request failed: ${response.status}`);
          }
          const range = response.headers.get("content-range")
            ?.match(/bytes\s+(\d+)-(\d+)\/(\d+)/i);
          const writeStart = range ? Number(range[1]) : next;
          if (writeStart !== next) throw new Error("Server returned an unexpected byte range.");
          const written = await writeResponse(response, writer, writeStart);
          next = range ? Number(range[2]) + 1 : next + written;
        }
      }

      await writer.close();
      await destination.complete();
    } catch (error) {
      await writer.abort(error).catch(() => {});
      throw error;
    }
  }

  async function downloadImage(file, button) {
    button.textContent = "Downloading...";
    const response = await fetchResource(file.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const blob = await response.blob();
    if (!blob.size) throw new Error("The server returned an empty image.");
    saveBlob(blob, itemName(file));
  }

  function candidateScore(candidate) {
    return candidate.bitrate || candidate.contentLength || 0;
  }

  async function inspectInput(input, candidate, streaming = false) {
    try {
      const track = candidate.kind === "video"
        ? await input.getPrimaryVideoTrack()
        : await input.getPrimaryAudioTrack();
      if (!track) throw new Error(`No ${candidate.kind} track found.`);

      const codec = await track.getCodec();
      const decoderConfig = await track.getDecoderConfig();
      if (!codec || !decoderConfig) throw new Error(`Unsupported ${candidate.kind} track metadata.`);

      const bitrate = streaming
        ? candidate.bitrate || 0
        : (await track.getAverageBitrate()) || candidate.bitrate || 0;
      const duration = candidate.duration || await track.computeDuration();
      const inspected = { candidate, codec, decoderConfig, duration, input, track, bitrate };

      if (candidate.kind === "video") {
        inspected.width = await track.getDisplayWidth();
        inspected.height = await track.getDisplayHeight();
        inspected.rotation = await track.getRotation();
      } else {
        inspected.channels = await track.getNumberOfChannels();
        inspected.sampleRate = await track.getSampleRate();
      }

      return inspected;
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  async function inspectCandidate(candidate) {
    const source = candidate.knownSize && candidate.contentLength > 0
      ? new CustomSource({
        getSize: () => candidate.contentLength,
        read: async (start, end) => {
          const response = await fetchResource(candidate.url, {
            cache: "no-store",
            headers: { Range: `bytes=${start}-${end - 1}` }
          });
          if (!response.ok && response.status !== 206) {
            throw new Error(`Range ${start}-${end - 1} failed: ${response.status}`);
          }
          if (!response.body) return new Uint8Array(await response.arrayBuffer());
          return response.body;
        },
        maxCacheSize: 8 * 1024 * 1024,
        prefetchProfile: "network"
      })
      : new UrlSource(candidate.url, {
        requestInit: { cache: "no-store" },
        fetchFn: fetchResource,
        maxCacheSize: 8 * 1024 * 1024,
        parallelism: 2
      });
    const input = new Input({
      source,
      formats: ALL_FORMATS
    });
    try {
      return await inspectInput(input, candidate);
    } catch (error) {
      throw new Error(`itag ${candidate.itag || "?"}, size ${candidate.contentLength || "?"}: ${error.message}`);
    }
  }

  async function inspectBest(candidates, kind) {
    const shortlist = [...candidates]
      .sort((a, b) => candidateScore(b) - candidateScore(a))
      .slice(0, 6);
    const results = await Promise.allSettled(shortlist.map(inspectCandidate));
    const usable = results.filter(result => result.status === "fulfilled").map(result => result.value);
    if (!usable.length) {
      const reason = results
        .filter(result => result.status === "rejected")
        .map(result => result.reason?.message || String(result.reason))
        .find(Boolean);
      throw new Error(`No usable ${kind} source could be read${reason ? `: ${reason}` : "."}`);
    }

    usable.sort((a, b) => {
      if (kind === "video") {
        const pixels = (b.width * b.height) - (a.width * a.height);
        if (pixels) return pixels;
      }
      return b.bitrate - a.bitrate;
    });

    for (const unused of usable.slice(1)) unused.input.dispose();
    return usable[0];
  }

  async function pipePackets(info, source, progress) {
    const sink = new EncodedPacketSink(info.track);
    let first = true;

    for await (const packet of sink.packets()) {
      await source.add(packet, first ? { decoderConfig: info.decoderConfig } : undefined);
      first = false;
      progress(Math.max(0, packet.timestamp + packet.duration), info.duration);
    }
    if (first) throw new Error(`The ${info.candidate.kind} track contained no packets.`);
    source.close();
  }

  async function muxInspected(video, audio, destination, button) {
    const durationDifference = Math.abs(video.duration - audio.duration);
    if (durationDifference > Math.max(3, Math.max(video.duration, audio.duration) * 0.05)) {
      video.input.dispose();
      audio.input.dispose();
      throw new Error("The best video and audio tracks do not describe the same media duration.");
    }

    const writable = await destination.openWritable();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(writable, { chunked: true, chunkSize: CHUNK_SIZE })
    });
    const videoSource = new EncodedVideoPacketSource(video.codec);
    const audioSource = new EncodedAudioPacketSource(audio.codec);
    output.addVideoTrack(videoSource, { rotation: video.rotation });
    output.addAudioTrack(audioSource);

    const current = { video: 0, audio: 0 };
    let lastUpdate = 0;
    const update = kind => (timestamp, duration) => {
      current[kind] = duration > 0 ? timestamp / duration : 0;
      if (performance.now() - lastUpdate > 250) {
        const percent = Math.max(0, Math.min(99, Math.floor(Math.min(current.video, current.audio) * 100)));
        button.textContent = `Muxing ${percent}%`;
        lastUpdate = performance.now();
      }
    };

    try {
      await output.start();
      await Promise.all([
        pipePackets(video, videoSource, update("video")),
        pipePackets(audio, audioSource, update("audio"))
      ]);
      await output.finalize();
      await destination.complete();
    } catch (error) {
      await output.cancel().catch(() => {});
      throw error;
    } finally {
      video.input.dispose();
      audio.input.dispose();
    }
  }

  async function muxAdaptive(group, destination, button) {
    if (!group.videos.size || !group.audios.size) {
      throw new Error("Both video and audio sources have not been detected yet.");
    }

    button.textContent = "Checking tracks...";
    const [video, audio] = await Promise.all([
      inspectBest(group.videos.values(), "video"),
      inspectBest(group.audios.values(), "audio")
    ]);
    await muxInspected(video, audio, destination, button);
  }

  function randomCpn() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const random = crypto.getRandomValues(new Uint8Array(16));
    return [...random].map(value => alphabet[value & 63]).join("");
  }

  function normalizedSabrFormats(formats) {
    return formats.map(format => ({
      ...format,
      approxDurationMs: Number(format.approxDurationMs || format.approx_duration_ms || 0),
      averageBitrate: Number(format.averageBitrate || format.average_bitrate || 0),
      bitrate: Number(format.bitrate || 0),
      contentLength: Number(format.contentLength || format.content_length || 0),
      lastModified: String(format.lastModified || format.last_modified_ms || ""),
      audioTrackId: format.audioTrack?.id || format.audioTrackId
    }));
  }

  function configureYouTubePlayerEvaluator() {
    if (configureYouTubePlayerEvaluator.configured) return;
    let policy = null;
    try {
      policy = globalThis.trustedTypes?.createPolicy(
        `network-file-finder-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
        { createScript: value => value }
      );
    } catch {}

    Platform.shim.eval = async data => {
      const source = `(()=>{${data.output}})()`;
      return globalThis.eval(policy ? policy.createScript(source) : source);
    };
    configureYouTubePlayerEvaluator.configured = true;
  }

  async function classicYouTubeGroup(item) {
    const apiKey = globalThis.ytcfg?.get?.("INNERTUBE_API_KEY");
    const baseContext = globalThis.ytcfg?.get?.("INNERTUBE_CONTEXT") || {};
    const playerUrl = globalThis.ytcfg?.get?.("PLAYER_JS_URL")
      || item.response?.assets?.js;
    const playerId = playerUrl?.match(/\/s\/player\/([^/]+)/)?.[1];
    if (!apiKey || !playerId) throw new Error("YouTube player configuration is unavailable.");

    const clientName = "TVHTML5_SIMPLY";
    const clientVersion = "1.0";
    const response = await fetch(`/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": "75",
        "X-YouTube-Client-Version": clientVersion
      },
      body: JSON.stringify({
        videoId: item.videoId,
        context: {
          ...baseContext,
          client: { ...baseContext.client, clientName, clientVersion }
        },
        playbackContext: {
          contentPlaybackContext: {
            signatureTimestamp: globalThis.ytcfg?.get?.("STS"),
            html5Preference: "HTML5_PREF_WANTS"
          }
        },
        contentCheckOk: true,
        racyCheckOk: true
      })
    });
    if (!response.ok) throw new Error(`YouTube player request failed: ${response.status}`);
    const playerResponse = await response.json();
    if (playerResponse.playabilityStatus?.status !== "OK") {
      throw new Error(playerResponse.playabilityStatus?.reason || "YouTube did not return playable formats.");
    }

    const formats = playerResponse.streamingData?.adaptiveFormats || [];
    const progressiveFormat = (playerResponse.streamingData?.formats || [])
      .filter(format => /video\/mp4/i.test(format.mimeType || "")
        && /avc1/i.test(format.mimeType || "")
        && /mp4a/i.test(format.mimeType || ""))
      .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
        || (b.bitrate || 0) - (a.bitrate || 0))[0];
    const videoFormats = formats
      .filter(format => /video\/mp4/i.test(format.mimeType || "")
        && /avc1/i.test(format.mimeType || "")
        && !format.audioQuality)
      .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
        || (b.bitrate || 0) - (a.bitrate || 0))
      .slice(0, 6);
    const audioFormats = formats
      .filter(format => /audio\/mp4/i.test(format.mimeType || "")
        && /mp4a/i.test(format.mimeType || "")
        && !format.isDrc)
      .sort((a, b) => Number(Boolean(b.audioTrack?.audioIsDefault)) - Number(Boolean(a.audioTrack?.audioIsDefault))
        || (b.bitrate || 0) - (a.bitrate || 0))
      .slice(0, 6);
    if (!videoFormats.length || !audioFormats.length) {
      throw new Error("YouTube did not expose compatible separate MP4 tracks.");
    }

    configureYouTubePlayerEvaluator();
    const player = await Player.create(null, globalThis.fetch.bind(globalThis), undefined, playerId);
    const progressive = progressiveFormat
      ? {
        url: await player.decipher(progressiveFormat.url, progressiveFormat.signatureCipher, progressiveFormat.cipher, new Map()),
        contentLength: Number(progressiveFormat.contentLength || 0),
        mime: (progressiveFormat.mimeType || "").split(";")[0]
      }
      : null;
    const decipher = async (format, kind) => ({
      kind,
      url: await player.decipher(format.url, format.signatureCipher, format.cipher, new Map()),
      bitrate: Number(format.averageBitrate || format.bitrate || 0),
      contentLength: Number(format.contentLength || 0),
      duration: Number(format.approxDurationMs || 0) / 1000,
      itag: String(format.itag || ""),
      knownSize: Number(format.contentLength || 0) > 0,
      mime: (format.mimeType || "").split(";")[0]
    });
    const [videos, audios] = await Promise.all([
      Promise.all(videoFormats.map(format => decipher(format, "video"))),
      Promise.all(audioFormats.map(format => decipher(format, "audio")))
    ]);
    return {
      type: "ADAPTIVE",
      progressive,
      videos: new Map(videos.map(candidate => [candidate.url, candidate])),
      audios: new Map(audios.map(candidate => [candidate.url, candidate]))
    };
  }

  async function muxYouTubeClassic(item, destination, button) {
    button.textContent = "Resolving YouTube tracks...";
    const group = await classicYouTubeGroup(item);
    if (group.progressive) {
      try {
        await muxAdaptive(group, destination, button);
        return;
      } catch (adaptiveError) {
        console.warn("[Network File Finder] Separate YouTube tracks were unavailable; using progressive MP4.", adaptiveError);
        await destination.abort?.();
      }
      button.textContent = "Downloading MP4...";
      const response = await fetchResource(group.progressive.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`YouTube MP4 request failed: ${response.status}`);
      const writable = await destination.openWritable();
      const writer = writable.getWriter();
      try {
        await writeResponse(response, writer, 0);
        await writer.close();
        await destination.complete();
      } catch (error) {
        await writer.abort(error).catch(() => {});
        throw error;
      }
      return;
    }
    await muxAdaptive(group, destination, button);
  }

  async function muxYouTubeSabr(item, destination, button) {
    const videoElement = document.querySelector("video");
    if (videoElement?.mediaKeys) throw new Error("DRM-protected media is not supported.");

    const current = currentYouTubeResponse() || item.response;
    const rawFormats = current?.streamingData?.adaptiveFormats || item.formats;
    if (rawFormats.some(format =>
      format.isDrm || format.hasDrm || format.drmFamilies?.length || format.licenseInfos?.length
    )) {
      throw new Error("DRM-protected media is not supported.");
    }

    const client = globalThis.ytcfg?.get?.("INNERTUBE_CONTEXT")?.client || {};
    const clientVersion = globalThis.ytcfg?.get?.("INNERTUBE_CONTEXT_CLIENT_VERSION")
      || client.clientVersion
      || "";
    const url = new URL(latestYouTubeSabrUrl()
      || current?.streamingData?.serverAbrStreamingUrl
      || item.sabrUrl);
    url.searchParams.delete("rn");
    url.searchParams.set("alr", "yes");
    if (clientVersion) url.searchParams.set("cver", clientVersion);
    if (!url.searchParams.has("cpn")) url.searchParams.set("cpn", randomCpn());

    const duration = Number(current?.videoDetails?.lengthSeconds || 0);
    const formats = normalizedSabrFormats(rawFormats);
    const sabr = new SabrStream({
      fetch: globalThis.fetch.bind(globalThis),
      serverAbrStreamingUrl: url.href,
      videoPlaybackUstreamerConfig: current?.playerConfig?.mediaCommonConfig
        ?.mediaUstreamerRequestConfig?.videoPlaybackUstreamerConfig || item.ustreamerConfig,
      clientInfo: {
        deviceMake: client.deviceMake,
        deviceModel: client.deviceModel,
        clientName: Number(globalThis.ytcfg?.get?.("INNERTUBE_CONTEXT_CLIENT_NAME")) || 1,
        clientVersion,
        osName: client.osName,
        osVersion: client.osVersion,
        acceptLanguage: client.hl,
        acceptRegion: client.gl,
        utcOffsetMinutes: String(-new Date().getTimezoneOffset()),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      durationMs: duration * 1000,
      formats
    });

    let protectedStream = false;
    sabr.on("streamProtectionStatusUpdate", status => {
      if ((status.status || 0) >= 2) protectedStream = true;
    });

    try {
      button.textContent = "Starting fast download...";
      const streams = await sabr.start({
        videoFormat: available => available
          .filter(format => /video\/mp4/i.test(format.mimeType || "")
            && /avc1/i.test(format.mimeType || ""))
          .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
            || (b.bitrate || 0) - (a.bitrate || 0))[0],
        audioFormat: available => available
          .filter(format => /audio\/mp4/i.test(format.mimeType || "")
            && /mp4a/i.test(format.mimeType || "")
            && !format.isDrc)
          .sort((a, b) => Number(Boolean(b.isOriginal)) - Number(Boolean(a.isOriginal))
            || (b.bitrate || 0) - (a.bitrate || 0))[0],
        maxRetries: 5,
        stallDetectionMs: 30000
      });

      const streamError = error => console.warn("[Network File Finder] SABR stream error", error);
      const videoInput = new Input({
        source: new ReadableStreamSource(streams.videoStream, {
          maxCacheSize: 8 * 1024 * 1024,
          handleUnhandledError: streamError
        }),
        formats: ALL_FORMATS
      });
      const audioInput = new Input({
        source: new ReadableStreamSource(streams.audioStream, {
          maxCacheSize: 8 * 1024 * 1024,
          handleUnhandledError: streamError
        }),
        formats: ALL_FORMATS
      });
      const selectedVideo = streams.selectedFormats.videoFormat;
      const selectedAudio = streams.selectedFormats.audioFormat;
      const [video, audio] = await Promise.all([
        inspectInput(videoInput, {
          kind: "video",
          bitrate: selectedVideo.bitrate,
          duration: selectedVideo.approxDurationMs / 1000
        }, true),
        inspectInput(audioInput, {
          kind: "audio",
          bitrate: selectedAudio.bitrate,
          duration: selectedAudio.approxDurationMs / 1000
        }, true)
      ]);
      if (protectedStream) throw new Error("YouTube requires stream attestation; it was not bypassed.");
      await muxInspected(video, audio, destination, button);
    } catch (error) {
      sabr.abort();
      throw error;
    }
  }

  async function muxYouTube(item, destination, button) {
    try {
      await muxYouTubeClassic(item, destination, button);
    } catch (classicError) {
      console.warn("[Network File Finder] Classic YouTube tracks failed; trying SABR.", classicError);
      await destination.abort?.();
      await muxYouTubeSabr(item, destination, button);
    }
  }

  function recordingMime() {
    const choices = [
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    return choices.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function recordFallback(destination, button) {
    const video = [...document.querySelectorAll("video")]
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
    if (!video) throw new Error("No video element is available for the recording fallback.");
    if (video.mediaKeys) throw new Error("DRM-protected media is not supported.");
    const capture = video.captureStream || video.mozCaptureStream;
    if (!capture) throw new Error("This browser does not support video captureStream().");
    const mimeType = recordingMime();
    if (!mimeType) throw new Error("This browser has no supported MediaRecorder video format.");

    const previousTime = video.currentTime;
    const wasPaused = video.paused;
    video.currentTime = 0;
    await video.play();
    const stream = capture.call(video);
    if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("The recording fallback did not expose both video and audio tracks.");
    }

    const writable = await destination.openWritable();
    const writer = writable.getWriter();
    const recorder = new MediaRecorder(stream, { mimeType });
    let writeChain = Promise.resolve();

    try {
      await new Promise((resolve, reject) => {
        recorder.ondataavailable = event => {
          if (event.data.size) {
            writeChain = writeChain.then(async () => {
              const data = new Uint8Array(await event.data.arrayBuffer());
              await writer.write(data);
            });
          }
        };
        recorder.onerror = event => reject(event.error || new Error("MediaRecorder failed."));
        recorder.onstop = resolve;
        video.addEventListener("ended", () => recorder.stop(), { once: true });
        button.textContent = "Recording fallback...";
        recorder.start(1000);
      });
      await writeChain;
      await writer.close();
      await destination.complete();
    } catch (error) {
      if (recorder.state !== "inactive") recorder.stop();
      await writer.abort(error).catch(() => {});
      throw error;
    } finally {
      stream.getTracks().forEach(track => track.stop());
      video.currentTime = Math.min(previousTime, video.duration || previousTime);
      if (wasPaused) video.pause();
    }
  }

  async function downloadItem(item, button) {
    const originalText = button.textContent;
    const errorElement = button.parentElement?.querySelector('[data-role="error"]');
    const destinationPromise = item.type === "IMAGE" ? null : reserveDestination(item);

    try {
      if (errorElement) errorElement.textContent = "";
      button.title = "";
      button.disabled = true;
      button.textContent = "Preparing...";

      if (item.type === "IMAGE") {
        await downloadImage(item, button);
        button.textContent = "Done";
        return;
      }

      const destination = await destinationPromise;

      if (item.type !== "ADAPTIVE" && item.type !== "YOUTUBE") {
        try {
          await downloadDirect(item, destination, button);
        } catch (directError) {
          if (!item.type.match(/^(VIDEO|BLOB)$/)) throw directError;
          console.warn("[Network File Finder] Direct download failed; using recording fallback.", directError);
          await destination.abort?.();
          await recordFallback(destination, button);
        }
      } else if (item.type === "ADAPTIVE") {
        try {
          await muxAdaptive(item, destination, button);
        } catch (muxError) {
          console.warn("[Network File Finder] Remux failed; using recording fallback.", muxError);
          await destination.abort?.();
          await recordFallback(destination, button);
        }
      } else {
        try {
          await muxYouTube(item, destination, button);
        } catch (muxError) {
          if (/DRM-protected/i.test(muxError?.message || "")) throw muxError;
          console.warn("[Network File Finder] YouTube remux failed; using recording fallback.", muxError);
          await destination.abort?.();
          await recordFallback(destination, button);
        }
      }

      button.textContent = "Done";
    } catch (error) {
      if (error?.name !== "AbortError") console.error("[Network File Finder]", error);
      const message = error?.message || String(error);
      if (errorElement && error?.name !== "AbortError") errorElement.textContent = message;
      button.title = error?.name === "AbortError" ? "" : message;
      button.textContent = error?.name === "AbortError" ? originalText : "Failed";
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 2500);
    }
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

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:10px;background:#1c1c1c;border-bottom:1px solid #333";
  const heading = document.createElement("strong");
  heading.style.flex = "1";
  heading.textContent = "Network File Finder";
  const scanButton = document.createElement("button");
  scanButton.dataset.action = "scan";
  scanButton.textContent = "Rescan";
  const closeButton = document.createElement("button");
  closeButton.dataset.action = "close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";
  header.append(heading, scanButton, closeButton);

  const statusElement = document.createElement("div");
  statusElement.dataset.role = "status";
  statusElement.style.cssText = "padding:8px 10px;color:#aaa";
  const listElement = document.createElement("div");
  listElement.dataset.role = "list";
  listElement.style.cssText = "max-height:66vh;overflow:auto;padding:8px";
  panel.append(header, statusElement, listElement);

  document.body.appendChild(panel);

  function destroy() {
    observer?.disconnect();
    clearTimeout(scanTimer);
    panel.remove();
    if (globalThis[INSTANCE_KEY]?.destroy === destroy) delete globalThis[INSTANCE_KEY];
  }

  globalThis[INSTANCE_KEY] = { destroy, scan };
  panel.querySelector('[data-action="close"]').onclick = destroy;
  panel.querySelector('[data-action="scan"]').onclick = scan;

  function render() {
    const list = panel.querySelector('[data-role="list"]');
    const status = panel.querySelector('[data-role="status"]');
    const adaptiveItems = [...adaptiveGroups.values()]
      .filter(group => group.videos.size)
      .sort((a, b) => {
        const duration = group => Math.max(
          0,
          ...[...group.videos.values(), ...group.audios.values()].map(candidate => candidate.duration || 0)
        );
        return duration(b) - duration(a);
      });
    const data = [...(youtubeItem ? [youtubeItem] : []), ...adaptiveItems, ...files.values()];

    status.textContent = `${data.length} item(s) found`;
    list.replaceChildren();

    if (!data.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:20px;text-align:center;color:#888";
      empty.append("No matching resources found yet.", document.createElement("br"), document.createElement("br"));
      empty.append("Start or seek the media, then press Rescan.");
      list.appendChild(empty);
      return;
    }

    data.forEach((item, index) => {
      const row = document.createElement("div");
      row.style.cssText =
        "padding:9px;margin-bottom:7px;border:1px solid #333;border-radius:7px;background:#181818";
      const adaptive = item.type === "ADAPTIVE";
      const youtube = item.type === "YOUTUBE";
      const name = adaptive
        ? `${item.videos.size} video + ${item.audios.size} audio source(s)`
        : itemName(item);
      const detail = adaptive || youtube
        ? "Best video and audio will be downloaded and remuxed without re-encoding"
        : item.url;

      const title = document.createElement("div");
      title.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:6px";
      const type = document.createElement("strong");
      type.style.color = "#ffca58";
      type.textContent = `${index + 1}. ${adaptive || youtube ? "VIDEO + AUDIO" : item.type}`;
      const label = document.createElement("span");
      label.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1";
      label.textContent = name;
      title.append(type, label);

      const description = document.createElement("div");
      description.style.cssText =
        "font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:7px";
      description.textContent = detail;
      const button = document.createElement("button");
      button.dataset.action = "download";
      button.textContent = "Download";
      const error = document.createElement("div");
      error.dataset.role = "error";
      error.style.cssText = "font-size:11px;color:#ff7777;margin-top:6px;overflow-wrap:anywhere";
      row.append(title, description, button, error);

      button.onclick = () => downloadItem(item, button);
      list.appendChild(row);
    });
  }

  scan();

  try {
    observer = new PerformanceObserver(() => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scan, 200);
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {}
})();
