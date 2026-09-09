// movies.ts
// Movie/TV data layer, backed by TMDB (The Movie Database).
//
// IMDb itself has no public developer API. TMDB is the standard free
// alternative: it has real trending/discover/genre endpoints (which
// IMDb-lookup services like OMDb do NOT have) plus a proper image CDN
// for posters/backdrops — what a Netflix-style browse page actually needs.
//
// Setup:
//   1. Get a free key: https://www.themoviedb.org/settings/api
//   2. Create a .env file at your project root:
//        VITE_TMDB_API_KEY=your_key_here
//   3. Restart `npm run dev` — Vite only reads .env on startup.
//
// Note: VITE_-prefixed env vars are bundled into client-side JS, so this
// key IS publicly visible once deployed (same tradeoff as the Anikoto
// CORS proxy note) — fine for now, but route it through your own backend
// before this goes to production if you want the key hidden.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;

export type MediaType = 'movie' | 'tv';

export interface Genre {
  id: number;
  name: string;
}

// TMDB's /movie endpoints use "title"/"release_date"; /tv endpoints use
// "name"/"first_air_date". Everything below is normalized into one shape
// so components never have to branch on media_type themselves.
export interface MediaItem {
  id: number;
  media_type: MediaType;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  genre_ids: number[];
}

export interface MediaDetail extends MediaItem {
  genres: Genre[];
  runtime?: number; // movies only
  number_of_seasons?: number; // tv only
  number_of_episodes?: number; // tv only
}

function assertApiKey() {
  if (!API_KEY) {
    throw new Error(
      'Missing TMDB API key — add VITE_TMDB_API_KEY=... to a .env file and restart the dev server.'
    );
  }
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  assertApiKey();
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', API_KEY!);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---------- Image helpers ----------
// TMDB never returns full image URLs, just a path — you build the URL
// yourself against their image CDN, choosing a size.

export function posterUrl(path: string | null, size: 'w185' | 'w342' | 'w500' = 'w342'): string | null {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size: 'w780' | 'w1280' | 'original' = 'w1280'): string | null {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

// ---------- Normalization ----------

function normalize(raw: any, fallbackType?: MediaType): MediaItem {
  const media_type: MediaType = raw.media_type ?? fallbackType ?? (raw.title ? 'movie' : 'tv');
  return {
    id: raw.id,
    media_type,
    title: raw.title ?? raw.name ?? 'Untitled',
    overview: raw.overview ?? '',
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    vote_average: raw.vote_average ?? 0,
    release_date: raw.release_date ?? raw.first_air_date ?? '',
    genre_ids: raw.genre_ids ?? (raw.genres ? raw.genres.map((g: Genre) => g.id) : []),
  };
}

// ---------- Public fetchers ----------

/** Mixed movies + TV, trending this week — for the browse-page hero. */
export async function fetchTrending(): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: any[] }>('/trending/all/week');
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalize(r));
}

export async function fetchPopularMovies(page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: any[] }>('/movie/popular', { page: String(page) });
  return data.results.map((r) => normalize(r, 'movie'));
}

export async function fetchPopularTV(page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: any[] }>('/tv/popular', { page: String(page) });
  return data.results.map((r) => normalize(r, 'tv'));
}

export async function fetchTopRatedMovies(page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: any[] }>('/movie/top_rated', { page: String(page) });
  return data.results.map((r) => normalize(r, 'movie'));
}

export async function fetchTopRatedTV(page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: any[] }>('/tv/top_rated', { page: String(page) });
  return data.results.map((r) => normalize(r, 'tv'));
}

export async function fetchByGenre(mediaType: MediaType, genreId: number, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: any[] }>(`/discover/${mediaType}`, {
    with_genres: String(genreId),
    page: String(page),
  });
  return data.results.map((r) => normalize(r, mediaType));
}

export async function fetchGenres(mediaType: MediaType): Promise<Genre[]> {
  const data = await tmdbFetch<{ genres: Genre[] }>(`/genre/${mediaType}/list`);
  return data.genres;
}

export async function searchMedia(query: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: any[] }>('/search/multi', { query });
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalize(r));
}

export async function fetchMediaDetail(mediaType: MediaType, id: number): Promise<MediaDetail> {
  const data = await tmdbFetch<any>(`/${mediaType}/${id}`);
  return {
    ...normalize(data, mediaType),
    genres: data.genres ?? [],
    runtime: data.runtime,
    number_of_seasons: data.number_of_seasons,
    number_of_episodes: data.number_of_episodes,
  };
}