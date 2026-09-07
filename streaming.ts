// streaming.ts
// Episode + video-embed layer, backed by AnikotoAPI (https://anikotoapi.site).
// Free, no auth, rate-limited to 60 requests / 120s per IP.
//
// IMPORTANT: Anikoto uses its OWN id scheme (e.g. "black-clover-1"), not
// AniList/MAL ids. We resolve AniList → Anikoto by scanning the catalog
// (ani_id / mal_id / title) with pagination, then a search-API fallback.

const ANIKOTO_BASE = '/anikoto-api';
const ANIKOTO_SEARCH_BASE = '/anikoto-search-api';

export interface AnikotoAnimeSummary {
  id: string | number;
  title: string;
  ani_id?: string | number;
  mal_id?: string | number;
  [key: string]: unknown;
}

export interface AnikotoEmbedUrls {
  sub?: string;
  dub?: string;
}

export interface AnikotoEpisode {
  id: string | number;
  number: number;
  embed_url: AnikotoEmbedUrls;
  [key: string]: unknown;
}

export interface AnikotoSeries {
  id: string;
  title: string;
  episodes: AnikotoEpisode[];
  [key: string]: unknown;
}

interface AnikotoListResponse<T> {
  ok: boolean;
  data: T;
  error?: string;
}

interface VercelSearchResult {
  animeId: string;
  title: string;
  japaneseTitle?: string;
  type?: string;
}

async function anikotoFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${ANIKOTO_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`AnikotoAPI request failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as AnikotoListResponse<T>;
  if (!json.ok) {
    throw new Error(`AnikotoAPI error: ${json.error || 'Unknown error'}`);
  }
  return json.data;
}

/** Recently-updated anime — paginated catalog for id lookup. */
export async function fetchRecentAnime(page = 1, perPage = 100): Promise<AnikotoAnimeSummary[]> {
  return anikotoFetch<AnikotoAnimeSummary[]>(`/recent-anime?per_page=${perPage}&page=${page}`);
}

/** Full series detail + episode list (each with sub/dub embed URLs) for one Anikoto id. */
export async function fetchSeries(anikotoId: string): Promise<AnikotoSeries> {
  if (seriesCache.has(anikotoId)) return seriesCache.get(anikotoId)!;

  const raw = await anikotoFetch<{ anime: Record<string, unknown>; episodes: AnikotoEpisode[] }>(
    `/series/${encodeURIComponent(anikotoId)}`
  );

  const data: AnikotoSeries = {
    ...(raw.anime || {}),
    id: String(raw.anime?.id || anikotoId),
    title: String(raw.anime?.title || 'Unknown'),
    episodes: Array.isArray(raw.episodes) ? raw.episodes : [],
  };

  seriesCache.set(anikotoId, data);
  return data;
}

const anikotoIdCache = new Map<string, string | null>();
const seriesCache = new Map<string, AnikotoSeries>();

const MAX_CATALOG_PAGES = 20;
const CATALOG_PAGE_SIZE = 100;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickTitleMatch(candidates: AnikotoAnimeSummary[], anilistTitle: string) {
  const normalizedTarget = normalizeTitle(anilistTitle);
  const exactTitle = candidates.find((c) => normalizeTitle(c.title) === normalizedTarget);
  if (exactTitle) return exactTitle;

  return candidates.find(
    (c) =>
      normalizeTitle(c.title).includes(normalizedTarget) ||
      normalizedTarget.includes(normalizeTitle(c.title))
  );
}

async function findInCatalog(
  anilistId: number,
  anilistTitle: string
): Promise<AnikotoAnimeSummary | undefined> {
  const normalizedTarget = normalizeTitle(anilistTitle);

  for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
    const candidates = await fetchRecentAnime(page, CATALOG_PAGE_SIZE);
    if (candidates.length === 0) break;

    const byAniId = candidates.find((c) => String(c.ani_id) === String(anilistId));
    if (byAniId) return byAniId;

    const byMalId = candidates.find((c) => String(c.mal_id) === String(anilistId));
    if (byMalId) return byMalId;

    const titleMatch = pickTitleMatch(candidates, anilistTitle);
    if (titleMatch && normalizeTitle(titleMatch.title) === normalizedTarget) {
      return titleMatch;
    }

    if (candidates.length < CATALOG_PAGE_SIZE) break;
  }

  return undefined;
}

async function findViaSearchApi(anilistTitle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${ANIKOTO_SEARCH_BASE}/api/search?keyword=${encodeURIComponent(anilistTitle)}`
    );
    if (!res.ok) return null;

    const json = await res.json();
    const results = (json?.results?.data ?? []) as VercelSearchResult[];
    if (!Array.isArray(results) || results.length === 0) return null;

    const normalizedTarget = normalizeTitle(anilistTitle);
    const exact = results.find((r) => normalizeTitle(r.title) === normalizedTarget);
    const tvExact = results.find(
      (r) => normalizeTitle(r.title) === normalizedTarget && r.type === 'TV'
    );
    const best = tvExact || exact || results[0];

    return best?.animeId ? String(best.animeId) : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort match from an AniList title/id to an Anikoto id.
 * Scans paginated catalog, then falls back to keyword search.
 */
export async function findAnikotoId(anilistId: number, anilistTitle: string): Promise<string | null> {
  const cacheKey = `${anilistId}-${anilistTitle}`;
  if (anikotoIdCache.has(cacheKey)) return anikotoIdCache.get(cacheKey)!;

  let result: string | null = null;

  try {
    const catalogMatch = await findInCatalog(anilistId, anilistTitle);
    if (catalogMatch) {
      result = String(catalogMatch.id);
    } else {
      result = await findViaSearchApi(anilistTitle);
    }
  } catch {
    result = await findViaSearchApi(anilistTitle);
  }

  anikotoIdCache.set(cacheKey, result);
  return result;
}
