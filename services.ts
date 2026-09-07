// services.ts
// Data layer backed by the AniList GraphQL API (https://anilist.co/graphiql)
// Routed through the Vite dev-server proxy (see vite.config.ts) so the
// browser talks to same-origin '/anilist-api', avoiding CORS blocks.
const ANILIST_ENDPOINT = "/anilist-api";

// ---------- Types ----------

export interface AniListTitle {
  romaji: string;
  english: string | null;
}

export interface AniListCoverImage {
  extraLarge: string;
  large: string;
  color: string | null;
}

export interface AnimeItem {
  id: number;
  title: AniListTitle;
  description: string | null;
  coverImage: AniListCoverImage;
  bannerImage: string | null;
  episodes: number | null;
  format: string | null; // TV, MOVIE, OVA, ONA, SPECIAL...
  status: string | null; // RELEASING, FINISHED, NOT_YET_RELEASED...
  averageScore: number | null; // 0-100
  genres: string[];
  startDate: { year: number | null };
  countryOfOrigin: string | null; // "JP", "CN", "KR"...
}

export interface AiringScheduleEntry {
  id: number;
  airingAt: number; // unix seconds
  episode: number;
  media: AnimeItem;
}

interface AniListPageResponse {
  data: {
    Page: {
      media: AnimeItem[];
    };
  };
  errors?: { message: string }[];
}

interface AniListSchedulePageResponse {
  data: {
    Page: {
      airingSchedules: AiringScheduleEntry[];
    };
  };
  errors?: { message: string }[];
}

// ---------- Core fetch helper ----------

async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`AniList request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json as T;
}

// Shared fragment for the fields every card/hero slide needs
const MEDIA_FIELDS = `
  id
  title { romaji english }
  description(asHtml: false)
  coverImage { extraLarge large color }
  bannerImage
  episodes
  format
  status
  averageScore
  genres
  startDate { year }
  countryOfOrigin
`;

// ---------- Public fetchers ----------

/** For the hero carousel: a handful of currently-trending, currently-airing shows with banner art. */
export async function fetchHeroCarousel(count = 5): Promise<AnimeItem[]> {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(
          sort: TRENDING_DESC
          type: ANIME
          status: RELEASING
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const res = await anilistQuery<AniListPageResponse>(query, { perPage: count });
  return res.data.Page.media.filter((m) => m.bannerImage);
}

/** For the "Latest Updates" grid: currently-airing anime ordered by popularity. */
export async function fetchLatestUpdates(page = 1, perPage = 18): Promise<AnimeItem[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(
          sort: POPULARITY_DESC
          type: ANIME
          status: RELEASING
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const res = await anilistQuery<AniListPageResponse>(query, { page, perPage });
  return res.data.Page.media;
}

/** For the "Top Trending" sidebar: a ranked top-10 list. */
export async function fetchTopTrending(count = 10): Promise<AnimeItem[]> {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(sort: TRENDING_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const res = await anilistQuery<AniListPageResponse>(query, { perPage: count });
  return res.data.Page.media;
}

/** Free-text search, used by the search bar / filter. */
export async function searchAnime(term: string, perPage = 20, page = 1): Promise<AnimeItem[]> {
  const query = `
    query ($search: String, $perPage: Int, $page: Int) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const res = await anilistQuery<AniListPageResponse>(query, { search: term, perPage, page });
  return res.data.Page.media;
}

/** Airing schedule between two unix timestamps (seconds), for the weekly schedule widget. */
export async function fetchAiringSchedule(from: number, to: number): Promise<AiringScheduleEntry[]> {
  const query = `
    query ($from: Int, $to: Int) {
      Page(page: 1, perPage: 25) {
        airingSchedules(
          airingAt_greater: $from
          airingAt_lesser: $to
          sort: TIME
        ) {
          id
          airingAt
          episode
          media {
            ${MEDIA_FIELDS}
          }
        }
      }
    }
  `;
  const res = await anilistQuery<AniListSchedulePageResponse>(query, { from, to });
  return res.data.Page.airingSchedules;
}

/**
 * AniList has no dedicated "random anime" endpoint, so this approximates
 * one: grabs a random page of popular titles and returns a random entry
 * from it. Good enough for a shuffle button; not truly uniform-random
 * across AniList's whole catalog.
 */
export async function fetchRandomAnime(): Promise<AnimeItem | null> {
  const page = Math.floor(Math.random() * 20) + 1;
  const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 20) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const res = await anilistQuery<AniListPageResponse>(query, { page });
  const list = res.data.Page.media;
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export interface AnimeDetail extends AnimeItem {
  duration: number | null;
  studios: { nodes: { name: string }[] };
}

/** Full detail for a single anime's page — extra fields beyond the list/card fragment. */
export async function fetchAnimeById(id: number): Promise<AnimeDetail | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        duration
        studios(isMain: true) {
          nodes { name }
        }
      }
    }
  `;
  const res = await anilistQuery<{ data: { Media: AnimeDetail | null } }>(query, { id });
  return res.data.Media;
}

// ---------- Small display helpers ----------

/** Prefer the English title, fall back to romaji. Pass 'romaji' for the JP toggle. */
export function displayTitle(anime: AnimeItem, lang: "english" | "romaji" = "english"): string {
  if (lang === "romaji") return anime.title.romaji;
  return anime.title.english || anime.title.romaji;
}

export function displayFormat(anime: AnimeItem): string {
  return anime.format ?? "TV";
}