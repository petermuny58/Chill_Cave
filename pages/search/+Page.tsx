import React, { useEffect, useState } from 'react';
import { usePageContext } from 'vike-react/usePageContext';
import { searchAnime, AnimeItem } from '../../services';
import { useTitleLang } from '../../context/TitleLangContext';
import AnimeCard from '../../components/AnimeCard';

const PAGE_SIZE = 24;

export default function SearchPage() {
  const pageContext = usePageContext();
  const { titleLang } = useTitleLang();
  const query = (pageContext.urlParsed.search.q as string | undefined)?.trim() ?? '';

  const [results, setResults] = useState<AnimeItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);

    searchAnime(query, PAGE_SIZE, 1)
      .then((items) => {
        if (cancelled) return;
        setResults(items);
        setHasMore(items.length === PAGE_SIZE);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Search failed');
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const handleLoadMore = async () => {
    if (!query || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const more = await searchAnime(query, PAGE_SIZE, nextPage);
      setResults((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...more.filter((a) => !seen.has(a.id))];
      });
      setPage(nextPage);
      setHasMore(more.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="catalog-container search-page">
      <div className="search-page__header">
        <h1 className="section-title">Search</h1>
        {query.length >= 2 && !loading && !error && (
          <p className="search-page__count">
            {results.length === 0
              ? `No results for "${query}"`
              : `${results.length}${hasMore ? '+' : ''} result${results.length === 1 ? '' : 's'} for "${query}"`}
          </p>
        )}
      </div>

      {query.length < 2 ? (
        <p className="search-page__hint">Type at least 2 characters in the search bar above.</p>
      ) : loading ? (
        <div className="loading-state">Searching…</div>
      ) : error ? (
        <div className="error-state">Couldn't search AniList: {error}</div>
      ) : results.length === 0 ? (
        <div className="search-page__empty">
          <p>No anime found for &ldquo;{query}&rdquo;.</p>
          <a href="/" className="search-page__home-link">Browse trending anime</a>
        </div>
      ) : (
        <>
          <div className="anime-grid">
            {results.map((anime) => (
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
                {loadingMore ? 'Loading…' : 'Load more results'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
