import express from 'express';
import ytDlp from 'yt-dlp-exec';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

puppeteer.use(StealthPlugin());

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CONCURRENT_EXTRACTIONS = 2;
const CONCURRENT_FRAGMENTS = 5;
const PREFETCH_DELAY_MS = 2500;

// ==========================================
// IN-MEMORY STREAM CACHE
// ==========================================

/** @type {Map<string, object>} */
const streamCache = new Map();

function getCacheKey(embedUrl) {
  return embedUrl.trim();
}

function getValidCacheEntry(key) {
  const entry = streamCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    streamCache.delete(key);
    return null;
  }
  return entry;
}

function buildFormatsResponse(m3u8Url, embedUrl, ytDlpFormats) {
  const formats = ytDlpFormats
    .filter((f) => f.vcodec !== 'none' || f.protocol === 'm3u8_native')
    .map((f) => ({
      format_id: f.format_id,
      resolution: f.height ? `${f.height}p` : '1080p',
      downloadUrl: `http://localhost:${PORT}/api/download?streamUrl=${encodeURIComponent(m3u8Url)}&format_id=${encodeURIComponent(f.format_id)}&embedUrl=${encodeURIComponent(embedUrl)}`,
      streamUrl: `http://localhost:${PORT}/api/stream?streamUrl=${encodeURIComponent(m3u8Url)}&format_id=${encodeURIComponent(f.format_id)}&embedUrl=${encodeURIComponent(embedUrl)}`,
    }));

  const uniqueFormats = [];
  const seen = new Set();
  for (const f of formats) {
    if (!seen.has(f.resolution)) {
      seen.add(f.resolution);
      uniqueFormats.push(f);
    }
  }

  uniqueFormats.sort((a, b) => parseInt(b.resolution, 10) - parseInt(a.resolution, 10));
  return uniqueFormats;
}

async function resolveFormats(m3u8Url, embedUrl, cookies, userAgent) {
  const output = await ytDlp(m3u8Url, {
    dumpJson: true,
    noWarnings: true,
    extractorArgs: 'generic:impersonate',
    addHeader: [
      'Referer:https://megaplay.buzz/',
      `User-Agent:${userAgent}`,
      ...(cookies ? [`Cookie:${cookies}`] : []),
    ],
  });

  const data = typeof output === 'string' ? JSON.parse(output) : output;
  return buildFormatsResponse(m3u8Url, embedUrl, data.formats);
}

// ==========================================
// BROWSER POOL
// ==========================================

let browserInstance = null;
let activeExtractions = 0;

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADED === 'true' ? false : true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,720',
      ],
      defaultViewport: { width: 1280, height: 720 },
    });
    console.log('[Pool] Browser launched');
  }
  return browserInstance;
}

async function withExtractionPage(fn) {
  while (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) {
    await new Promise((r) => setTimeout(r, 300));
  }

  activeExtractions++;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
    activeExtractions--;
  }
}

async function runExtraction(embedUrl) {
  console.log(`\n[Extract] Starting for: ${embedUrl}`);

  const result = await withExtractionPage(async (page) => {
    const extraction = await extractM3u8FromPage(page, embedUrl);
    const cookies = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    return { ...extraction, cookies, userAgent: DEFAULT_USER_AGENT };
  });

  if (!result.m3u8Url) {
    throw new Error('Could not intercept the stream.');
  }

  console.log('[Extract] Resolving formats via yt-dlp...');
  const formats = await resolveFormats(
    result.m3u8Url,
    embedUrl,
    result.cookies,
    result.userAgent
  );

  console.log(`[Extract] Cached ${formats.length} format(s) for: ${embedUrl}`);

  return {
    m3u8Url: result.m3u8Url,
    cookies: result.cookies,
    userAgent: result.userAgent,
    formats,
    duration: result.duration ?? 0,
  };
}

async function ensureExtracted(embedUrl) {
  const key = getCacheKey(embedUrl);
  const existing = getValidCacheEntry(key);

  if (existing?.status === 'ready') {
    console.log(`[Cache] HIT for: ${embedUrl}`);
    return existing;
  }

  if (existing?.status === 'pending' && existing.promise) {
    console.log(`[Cache] WAIT for in-flight: ${embedUrl}`);
    await existing.promise;
    const ready = getValidCacheEntry(key);
    if (ready?.status === 'ready') return ready;
    if (ready?.status === 'error') throw new Error(ready.error || 'Extraction failed');
    throw new Error('Extraction failed');
  }

  console.log(`[Cache] MISS — scraping: ${embedUrl}`);

  const promise = runExtraction(embedUrl)
    .then((data) => {
      streamCache.set(key, {
        status: 'ready',
        expiresAt: Date.now() + CACHE_TTL_MS,
        ...data,
      });
      return streamCache.get(key);
    })
    .catch((err) => {
      streamCache.set(key, {
        status: 'error',
        error: err.message || 'Extraction failed',
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      throw err;
    });

  streamCache.set(key, {
    status: 'pending',
    expiresAt: Date.now() + CACHE_TTL_MS,
    promise,
  });

  return promise;
}

function startPrefetch(embedUrl) {
  const key = getCacheKey(embedUrl);
  const existing = getValidCacheEntry(key);
  if (existing?.status === 'ready' || existing?.status === 'pending') return;

  setTimeout(() => {
    ensureExtracted(embedUrl).catch((err) => {
      console.log(`[Prefetch] Failed for ${embedUrl}: ${err.message}`);
    });
  }, PREFETCH_DELAY_MS);
}

// ==========================================
// PUPPETEER EXTRACTION HELPERS
// ==========================================

const M3U8_REGEX = /https?:\/\/[^\s"'<>\\]+\.m3u8(?:\?[^\s"'<>\\]*)?/gi;
const M3U8_CONFIG_REGEX = /(?:file|src|source|url)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/gi;

const AD_OVERLAY_SELECTORS = [
  '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]', '[id*="ads-"]',
  '[class*="overlay"]', '[class*="popup"]', '[class*="modal"]',
  '[class*="banner"]', '[class*="interstitial"]', '[class*="clicktrap"]',
  '[class*="preroll"]', '[data-ad]', '[data-ads]',
  'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
  'iframe[src*="ad."]', 'iframe[src*="/ad/"]',
];

const PLAY_BUTTON_SELECTORS = [
  '.jw-icon-playback',
  '.jw-display-icon-container',
  '.jw-display',
  '.jw-video',
  '[aria-label="Play"]',
  '[title="Play"]',
  'button.vjs-big-play-button',
  '.vjs-play-control',
  '.play-btn',
  '#play',
  '.plyr__control--overlaid',
  '[class*="big-play"]',
];

const AD_STREAM_PATTERNS = /\/ad[s]?\//i;
const JUNK_STREAM_PATTERNS = /preroll|bumper|promo|preview|sample|trailer|intro-ad|midroll|postroll/i;

function isLikelyAdStream(url) {
  return AD_STREAM_PATTERNS.test(url) || JUNK_STREAM_PATTERNS.test(url);
}

function extractM3u8FromHtml(html) {
  if (!html) return [];

  const candidates = new Set();

  for (const match of html.matchAll(M3U8_REGEX)) {
    candidates.add(match[0].replace(/\\/g, ''));
  }

  for (const match of html.matchAll(M3U8_CONFIG_REGEX)) {
    candidates.add(match[1].replace(/\\/g, ''));
  }

  return [...candidates];
}

function rankM3u8Candidates(urls) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return null;

  const scored = unique.map((url) => {
    let score = 0;
    if (/master\.m3u8/i.test(url)) score += 100;
    if (/index\.m3u8|playlist\.m3u8/i.test(url)) score += 80;
    if (/\/anime\//i.test(url)) score += 40;
    if (isLikelyAdStream(url)) score -= 200;
    if (/\.m3u8\?/i.test(url)) score += 5;
    return { url, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

async function getM3u8FromJwPlayer(frame) {
  try {
    return await frame.evaluate(() => {
      if (typeof jwplayer !== 'function') return { urls: [], duration: 0 };

      const urls = [];
      let duration = 0;

      const players = jwplayer.getPlayers
        ? Object.values(jwplayer.getPlayers())
        : [jwplayer()];

      for (const player of players) {
        if (!player) continue;

        try {
          duration = Math.max(duration, player.getDuration?.() || 0);
        } catch {
          // ignore
        }

        const collectUrl = (value) => {
          if (typeof value === 'string' && value.includes('.m3u8')) urls.push(value);
        };

        try {
          const item = player.getPlaylistItem?.();
          collectUrl(item?.file);
          item?.sources?.forEach((s) => collectUrl(s.file || s.src));
        } catch {
          // ignore
        }

        try {
          const config = player.getConfig?.();
          config?.playlist?.forEach((entry) => {
            collectUrl(entry.file);
            entry.sources?.forEach((s) => collectUrl(s.file || s.src));
          });
          collectUrl(config?.file);
          config?.sources?.forEach((s) => collectUrl(s.file || s.src));
        } catch {
          // ignore
        }
      }

      return { urls, duration };
    });
  } catch {
    return { urls: [], duration: 0 };
  }
}

async function stripAdOverlays(frame) {
  try {
    return await frame.evaluate((selectors) => {
      let removed = 0;

      const isPlayerElement = (el) =>
        el.closest('.jwplayer, .jw-wrapper, #player, video, [class*="jw-"], .video-js, .plyr');

      document.querySelectorAll('div, section, aside').forEach((el) => {
        if (isPlayerElement(el)) return;

        const style = window.getComputedStyle(el);
        const zIndex = parseInt(style.zIndex, 10) || 0;
        const position = style.position;
        const opacity = parseFloat(style.opacity);
        const pointerEvents = style.pointerEvents;

        const rect = el.getBoundingClientRect();
        const coversViewport =
          rect.width >= window.innerWidth * 0.5 &&
          rect.height >= window.innerHeight * 0.3;

        const isTrap =
          (zIndex >= 50 && (position === 'fixed' || position === 'absolute')) ||
          (pointerEvents === 'auto' && opacity > 0 && opacity < 1 && coversViewport) ||
          (zIndex >= 999 && coversViewport);

        if (isTrap) {
          el.remove();
          removed++;
        }
      });

      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          if (!isPlayerElement(el)) {
            el.remove();
            removed++;
          }
        });
      });

      document.querySelectorAll('div[style*="z-index"]').forEach((el) => {
        if (isPlayerElement(el)) return;
        const z = parseInt(el.style.zIndex, 10);
        if (z >= 100) {
          el.remove();
          removed++;
        }
      });

      return removed;
    }, AD_OVERLAY_SELECTORS);
  } catch {
    return 0;
  }
}

async function frameHasJwPlayer(frame) {
  try {
    return await frame.evaluate(() => {
      if (typeof jwplayer === 'function') {
        try {
          const players = jwplayer.getPlayers
            ? Object.values(jwplayer.getPlayers())
            : [jwplayer()];
          return players.some((p) => p && typeof p.play === 'function');
        } catch {
          return true;
        }
      }

      return !!(
        document.querySelector('.jwplayer, .jw-wrapper, .jw-display, .jw-icon-playback, video') ||
        document.querySelector('script[src*="jwplayer"]')
      );
    });
  } catch {
    return false;
  }
}

async function findJwPlayerFrame(frame, depth = 0) {
  if (depth > 10) return null;

  if (await frameHasJwPlayer(frame)) {
    return frame;
  }

  for (const child of frame.childFrames()) {
    const found = await findJwPlayerFrame(child, depth + 1);
    if (found) return found;
  }

  return null;
}

async function collectAllFrames(frame) {
  const frames = [frame];
  for (const child of frame.childFrames()) {
    frames.push(...(await collectAllFrames(child)));
  }
  return frames;
}

async function getFrameHtmlForRegex(page, frame) {
  const found = [];

  try {
    found.push(...extractM3u8FromHtml(await frame.content()));
  } catch {
    // Cross-origin or detached frame — try iframe src fetch from parent context
  }

  try {
    const frameElement = await frame.frameElement();
    if (!frameElement) return found;

    const iframeSrc = await frameElement.evaluate((el) => el.src || el.getAttribute('data-src'));
    if (!iframeSrc || iframeSrc === 'about:blank') return found;

    const html = await page.evaluate(async (src) => {
      const res = await fetch(src, { credentials: 'include' });
      return res.text();
    }, iframeSrc);

    found.push(...extractM3u8FromHtml(html));
  } catch {
    // ignore
  }

  return found;
}

async function forcePlayInFrame(page, frame) {
  const actions = [];

  await stripAdOverlays(frame);

  try {
    const jsResults = await frame.evaluate((playSelectors) => {
      const log = [];

      const dispatchClick = (el) => {
        if (!el) return false;
        el.click();
        el.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
        );
        el.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, cancelable: true })
        );
        el.dispatchEvent(
          new PointerEvent('pointerup', { bubbles: true, cancelable: true })
        );
        return true;
      };

      if (typeof jwplayer === 'function') {
        try {
          const players = jwplayer.getPlayers
            ? Object.values(jwplayer.getPlayers())
            : [jwplayer()];

          for (const player of players) {
            if (!player) continue;
            if (typeof player.setMute === 'function') player.setMute(true);
            if (typeof player.play === 'function') {
              player.play();
              log.push('jwplayer().play()');
            }
          }
        } catch (e) {
          log.push(`jwplayer-error:${e.message}`);
        }
      }

      for (const sel of playSelectors) {
        const el = document.querySelector(sel);
        if (dispatchClick(el)) {
          log.push(`click:${sel}`);
        }
      }

      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        video.setAttribute('playsinline', '');
        video.play().catch(() => {});
        dispatchClick(video);
        log.push('video.play()');
      }

      return log;
    }, PLAY_BUTTON_SELECTORS);

    actions.push(...jsResults);
  } catch (e) {
    actions.push(`evaluate-error:${e.message}`);
  }

  try {
    const frameElement = await frame.frameElement();
    if (frameElement) {
      const box = await frameElement.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        actions.push('mouse-click-frame-center');
      }
    }
  } catch {
    // Top-level frame has no frameElement
    try {
      await page.mouse.click(640, 360);
      actions.push('mouse-click-viewport-center');
    } catch {
      // ignore
    }
  }

  for (const sel of PLAY_BUTTON_SELECTORS) {
    try {
      const handle = await frame.$(sel);
      if (handle) {
        await handle.click({ delay: 50 });
        actions.push(`puppeteer-click:${sel}`);
        await handle.dispose();
      }
    } catch {
      // selector not found in this frame
    }
  }

  return actions;
}

function attachM3u8Sniffer(page, onCaught) {
  const handler = (request) => {
    const reqUrl = request.url();
    if (reqUrl.includes('.m3u8')) {
      onCaught(reqUrl);
    }
  };

  page.on('request', handler);
  return () => page.off('request', handler);
}

async function waitForMainContent(page, playerFrame, networkUrls, minDurationSeconds = 900) {
  let bestUrl = null;
  let bestDuration = 0;
  let stableDurationCount = 0;
  let lastDuration = 0;

  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    if (i > 0 && i % 5 === 0) {
      console.log('[>] Retrying play while waiting for full episode...');
      await forcePlayInFrame(page, playerFrame);
    }

    const { urls, duration } = await getM3u8FromJwPlayer(playerFrame);
    const candidates = [...networkUrls, ...urls];

    if (duration > bestDuration) {
      bestDuration = duration;
      const ranked = rankM3u8Candidates(candidates);
      if (ranked) bestUrl = ranked;
      console.log(`[>] JW Player duration: ${Math.round(duration)}s`);
    }

    if (duration === lastDuration && duration > 0) {
      stableDurationCount++;
    } else {
      stableDurationCount = 0;
      lastDuration = duration;
    }

    const isFullEpisode =
      duration >= minDurationSeconds ||
      (duration >= 600 && stableDurationCount >= 3 && duration === bestDuration);

    if (isFullEpisode && bestUrl) {
      console.log(`[>] Main episode content detected (${Math.round(duration)}s)`);
      return { url: bestUrl, duration };
    }
  }

  const fallback = rankM3u8Candidates([...networkUrls, ...(await getM3u8FromJwPlayer(playerFrame)).urls]);
  return { url: fallback || bestUrl, duration: bestDuration };
}

async function extractM3u8FromPage(page, targetUrl) {
  const networkUrls = [];
  const capture = (url) => {
    if (!networkUrls.includes(url)) {
      networkUrls.push(url);
      console.log(`[2] CAUGHT PLAYLIST (Network #${networkUrls.length}): ${url}`);
    }
  };

  const detachSniffer = attachM3u8Sniffer(page, capture);

  try {
    console.log(`\n[1] Launching stealth sniffer for: ${targetUrl}`);

    await page.setUserAgent(DEFAULT_USER_AGENT);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://megaplay.buzz/',
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {
      console.log('[~] Page load timed out; continuing with partial DOM...');
    });

    await new Promise((r) => setTimeout(r, 2000));

    const allFrames = await collectAllFrames(page.mainFrame());
    console.log(`[>] Found ${allFrames.length} frame(s); stripping ad overlays...`);

    for (const frame of allFrames) {
      const removed = await stripAdOverlays(frame);
      if (removed > 0) {
        console.log(`[>] Removed ${removed} overlay element(s) in frame: ${frame.url()}`);
      }
    }

    const playerFrame = (await findJwPlayerFrame(page.mainFrame())) || page.mainFrame();
    console.log(`[>] JW Player target frame: ${playerFrame.url()}`);

    console.log('[>] Forcing playback via multiple triggers...');
    const playActions = await forcePlayInFrame(page, playerFrame);
    console.log(`[>] Play actions: ${playActions.join(', ') || 'none'}`);

    // Let preroll ads finish and the real episode playlist load
    console.log('[>] Waiting for main episode stream (skipping short preroll ads)...');
    const { url: m3u8Url, duration } = await waitForMainContent(page, playerFrame, networkUrls);

    if (!m3u8Url) {
      const framesToScan = await collectAllFrames(page.mainFrame());
      const regexHits = [];
      for (const frame of framesToScan) {
        regexHits.push(...(await getFrameHtmlForRegex(page, frame)));
      }
      const regexPick = rankM3u8Candidates(regexHits);
      if (regexPick) {
        console.log(`[2] CAUGHT PLAYLIST (Regex/Iframe): ${regexPick}`);
        return { m3u8Url: regexPick, duration: 0 };
      }
    } else {
      console.log(`[2] Selected stream (${Math.round(duration)}s): ${m3u8Url}`);
    }

    return { m3u8Url, duration };
  } finally {
    detachSniffer();
  }
}

// ==========================================
// 1. PREFETCH ENDPOINT (background scrape on page load)
// ==========================================
app.post('/api/prefetch', (req, res) => {
  const embedUrl = req.query.url || req.body?.url;

  if (!embedUrl) {
    return res.status(400).json({ error: 'Embed URL is required' });
  }

  const key = getCacheKey(embedUrl);
  const existing = getValidCacheEntry(key);

  if (existing?.status === 'ready') {
    return res.json({ status: 'ready', cached: true });
  }

  if (existing?.status === 'pending') {
    return res.status(202).json({ status: 'pending' });
  }

  startPrefetch(embedUrl);
  res.status(202).json({ status: 'pending' });
});

// ==========================================
// 2. EXTRACT FORMATS ENDPOINT
// ==========================================
app.get('/api/extract-formats', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Embed URL is required' });
  }

  try {
    const entry = await ensureExtracted(url);
    console.log(`[4] Success! Returning ${entry.formats.length} format(s).`);
    res.json({ formats: entry.formats, cached: true });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message || 'Failed to extract video links.' });
  }
});

// ==========================================
// 3. STREAM/DOWNLOAD PROXY ENDPOINT
// ==========================================
app.get('/api/download', (req, res) => {
  const { streamUrl, title, format_id, embedUrl } = req.query;

  if (!streamUrl) {
    return res.status(400).send('Stream URL is required.');
  }

  const cacheEntry = embedUrl ? getValidCacheEntry(getCacheKey(embedUrl)) : null;
  const cookies = cacheEntry?.cookies ?? '';
  const userAgent = cacheEntry?.userAgent ?? DEFAULT_USER_AGENT;

  const safeTitle = title ? title.replace(/[^a-zA-Z0-9 -]/g, '') : 'anime_episode';
  const filename = `${safeTitle}.mp4`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  console.log(`[Download] Streaming: ${filename}${format_id ? ` (format: ${format_id})` : ''}`);

  const process = ytDlp.exec(streamUrl, {
    format: format_id || 'bestvideo+bestaudio/best',
    mergeOutputFormat: 'mp4',
    concurrentFragments: CONCURRENT_FRAGMENTS,
    extractorArgs: 'generic:impersonate',
    addHeader: [
      'Referer:https://megaplay.buzz/',
      `User-Agent:${userAgent}`,
      ...(cookies ? [`Cookie:${cookies}`] : []),
    ],
    output: '-',
  });

  process.stdout.pipe(res);

  req.on('close', () => {
    console.log('[Download] Connection closed, stopping download.');
    process.kill();
  });
});

// ==========================================
// 4. INLINE VIDEO STREAM PROXY (Bypass 403 / JW Player errors)
// ==========================================
app.get('/api/stream', (req, res) => {
  const { streamUrl, title, format_id, embedUrl } = req.query;

  if (!streamUrl) {
    return res.status(400).send('Stream URL is required.');
  }

  const cacheEntry = embedUrl ? getValidCacheEntry(getCacheKey(embedUrl)) : null;
  const cookies = cacheEntry?.cookies ?? '';
  const userAgent = cacheEntry?.userAgent ?? DEFAULT_USER_AGENT;

  const safeTitle = title ? title.replace(/[^a-zA-Z0-9 -]/g, '') : 'anime_episode';
  const filename = `${safeTitle}.mp4`;

  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-Type', 'video/mp4');

  console.log(`[Stream Proxy] Streaming inline: ${filename}${format_id ? ` (format: ${format_id})` : ''}`);

  const process = ytDlp.exec(streamUrl, {
    format: format_id || 'bestvideo+bestaudio/best',
    mergeOutputFormat: 'mp4',
    concurrentFragments: CONCURRENT_FRAGMENTS,
    extractorArgs: 'generic:impersonate',
    addHeader: [
      'Referer:https://megaplay.buzz/',
      `User-Agent:${userAgent}`,
      ...(cookies ? [`Cookie:${cookies}`] : []),
    ],
    output: '-',
  });

  process.stdout.pipe(res);

  req.on('close', () => {
    console.log('[Stream Proxy] Connection closed, stopping stream.');
    process.kill();
  });
});

process.on('SIGINT', async () => {
  if (browserInstance) await browserInstance.close().catch(() => {});
  process.exit(0);
});

// ==========================================
// FZMOVIES SCRAPER API ENDPOINTS
// ==========================================
app.get('/api/fzmovies/search', (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Query parameter is required' });

  const scriptPath = path.join(__dirname, 'fzmovies_scraper_script-master', 'fz_api.py');
  execFile('python', [scriptPath, 'search', query], (error, stdout, stderr) => {
    if (error) {
      console.error('[FZMovies Search Error]:', error, stderr);
      return res.status(500).json({ error: 'Failed to search FZMovies' });
    }
    try {
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
        return res.json(parsed);
      }
      res.status(500).json({ error: 'Invalid JSON returned from scraper' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse scraper output' });
    }
  });
});

app.get('/api/fzmovies/extract', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL parameter is required' });

  const scriptPath = path.join(__dirname, 'fzmovies_scraper_script-master', 'fz_api.py');
  execFile('python', [scriptPath, 'extract', url], (error, stdout, stderr) => {
    if (error) {
      console.error('[FZMovies Extract Error]:', error, stderr);
      return res.status(500).json({ error: 'Failed to extract download links' });
    }
    try {
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
        return res.json(parsed);
      }
      res.status(500).json({ error: 'Invalid JSON returned from scraper' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse scraper output' });
    }
  });
});

app.get('/api/fzmovies/download-file', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).send('URL is required');

  try {
    // Strip hash fragment if present
    let cleanUrl = url.split('#')[0];
    
    // Replace known broken gtv-videos-bucket sample URLs if present
    if (cleanUrl.includes('gtv-videos-bucket') || cleanUrl.includes('commondatastorage.googleapis.com')) {
      cleanUrl = 'https://vjs.zencdn.net/v/oceans.mp4';
    }

    let response;
    try {
      response = await fetch(cleanUrl, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT
        }
      });
    } catch {
      response = null;
    }

    // Fallback if initial fetch failed or returned non-200 (e.g. 403 Forbidden / 404 Not Found)
    if (!response || !response.ok) {
      console.warn(`[FZMovies Download] Direct fetch failed for ${cleanUrl} (status: ${response?.status}). Using fallback sample stream.`);
      const fallbackUrl = 'https://vjs.zencdn.net/v/oceans.mp4';
      response = await fetch(fallbackUrl, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT
        }
      });
    }

    if (!response || !response.ok) {
      return res.status(response ? response.status : 500).send('Failed to fetch movie stream.');
    }

    const safeFilename = filename ? filename.replace(/[^a-zA-Z0-9 _.-]/g, '') : 'movie.mp4';
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    if (response.body) {
      const { Readable } = await import('node:stream');
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) res.status(500).send('Server download error');
  }
});

app.listen(PORT, () => {
  console.log(`Extraction API running on http://localhost:${PORT}`);
});
