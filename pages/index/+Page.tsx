// pages/index/+Page.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  fetchHeroCarousel,
  fetchLatestUpdates,
  fetchTopTrending,
  AnimeItem,
} from '../../services';
import { useTitleLang } from '../../context/TitleLangContext';
import HeroBanner from '../../components/HeroBanner';
import ShareBar from '../../components/ShareBar';
import AnimeCard from '../../components/AnimeCard';
import TrendingSidebar from '../../components/TrendingSidebar';
import ScheduleWidget from '../../components/ScheduleWidget';

type FilterKey = 'all' | 'tv' | 'movie' | 'china';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'tv', label: 'TV' },
  { key: 'movie', label: 'Movie' },
  { key: 'china', label: 'China' },
];

// AniList caps perPage at 50, so "100+" means multiple page fetches, not one big request.
const PAGE_SIZE = 50;

export default function Page() {
  const { titleLang } = useTitleLang();
  const [heroSlides, setHeroSlides] = useState<AnimeItem[]>([]);
  const [latest, setLatest] = useState<AnimeItem[]>([]);
  const [latestPage, setLatestPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [trending, setTrending] = useState<AnimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchHeroCarousel(8),
      fetchLatestUpdates(1, PAGE_SIZE),
      fetchLatestUpdates(2, PAGE_SIZE),
      fetchTopTrending(10),
    ])
      .then(([hero, page1, page2, top]) => {
        if (cancelled) return;
        setHeroSlides(hero);
        setLatest([...page1, ...page2]);
        setLatestPage(2);
        setTrending(top);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load anime data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = latestPage + 1;
      const more = await fetchLatestUpdates(nextPage, PAGE_SIZE);
      if (more.length === 0) {
        setHasMore(false);
      } else {
        setLatest((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...more.filter((a) => !seen.has(a.id))];
        });
        setLatestPage(nextPage);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredLatest = useMemo(() => {
    switch (filter) {
      case 'tv':
        return latest.filter((a) => a.format === 'TV');
      case 'movie':
        return latest.filter((a) => a.format === 'MOVIE');
      case 'china':
        return latest.filter((a) => a.countryOfOrigin === 'CN');
      default:
        return latest;
    }
  }, [latest, filter]);

  return (
    <main className="catalog-container">
        {loading ? (
          <div className="loading-state">Loading latest episodes…</div>
        ) : error ? (
          <div className="error-state">Couldn't reach AniList: {error}</div>
        ) : (
          <>
            <HeroBanner slides={heroSlides} titleLang={titleLang} />
            <ShareBar />

            <div className="content-grid">
              <section className="latest-updates">
                <div className="section-header">
                  <h2 className="section-title">LATEST UPDATES</h2>
                  <div className="filter-tabs">
                    {FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={filter === f.key ? 'is-active' : ''}
                        onClick={() => setFilter(f.key)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="anime-grid">
                  {filteredLatest.map((anime) => (
                    <AnimeCard key={anime.id} anime={anime} titleLang={titleLang} />
                  ))}
                </div>

                {hasMore && (
                  <div className="load-more">
                    <button
                      type="button"
                      className="btn btn--load-more"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Loading…' : `Load More (${latest.length} loaded)`}
                    </button>
                  </div>
                )}
              </section>

              <div className="sidebar-column">
                <TrendingSidebar items={trending} titleLang={titleLang} />
                <ScheduleWidget />
              </div>
            </div>
          </>
        )}
      </main>
  );
}