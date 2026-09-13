// pages/browse/+Page.tsx
import React, { useEffect, useState } from 'react';
import {
  fetchTrending,
  fetchPopularMovies,
  fetchPopularTV,
  fetchTopRatedMovies,
  fetchTopRatedTV,
  fetchByGenre,
  MediaItem,
} from '../../movies';
import MediaHero from '../../components/MediaHero';
import MediaRow from '../../components/MediaRow';
import FzDownloadSection from '../../components/FzDownloadSection';

// Stable, well-known TMDB genre ids — resolving these by name would just
// be an extra request for values that don't change.
const ACTION_MOVIES_GENRE = 28;
const COMEDY_MOVIES_GENRE = 35;

export default function Page() {
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [popularTV, setPopularTV] = useState<MediaItem[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<MediaItem[]>([]);
  const [topRatedTV, setTopRatedTV] = useState<MediaItem[]>([]);
  const [actionMovies, setActionMovies] = useState<MediaItem[]>([]);
  const [comedyMovies, setComedyMovies] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchTrending(),
      fetchPopularMovies(),
      fetchPopularTV(),
      fetchTopRatedMovies(),
      fetchTopRatedTV(),
      fetchByGenre('movie', ACTION_MOVIES_GENRE),
      fetchByGenre('movie', COMEDY_MOVIES_GENRE),
    ])
      .then(([trend, popMovies, popTV, topMovies, topTV, action, comedy]) => {
        if (cancelled) return;
        setTrending(trend);
        setPopularMovies(popMovies);
        setPopularTV(popTV);
        setTopRatedMovies(topMovies);
        setTopRatedTV(topTV);
        setActionMovies(action);
        setComedyMovies(comedy);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load movies & TV data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="catalog-container browse-page">
      {loading ? (
        <div className="loading-state">Loading movies &amp; series…</div>
      ) : error ? (
        <div className="error-state">Couldn't reach TMDB: {error}</div>
      ) : (
        <>
          <MediaHero slides={trending.slice(0, 8)} />
          
          <div style={{ padding: '0 24px' }}>
            <FzDownloadSection standalone={true} />
          </div>

          <div className="media-rows">
            <MediaRow title="Popular Movies" items={popularMovies} />
            <MediaRow title="Popular Series" items={popularTV} />
            <MediaRow title="Top Rated Movies" items={topRatedMovies} />
            <MediaRow title="Top Rated Series" items={topRatedTV} />
            <MediaRow title="Action Movies" items={actionMovies} />
            <MediaRow title="Comedy Movies" items={comedyMovies} />
          </div>
        </>
      )}
    </main>
  );
}