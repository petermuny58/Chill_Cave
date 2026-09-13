// pages/browse/@type/@id/+Page.tsx
import React, { useEffect, useState } from 'react';
import { usePageContext } from 'vike-react/usePageContext';
import { fetchMediaDetail, backdropUrl, posterUrl, MediaDetail, MediaType } from '../../../../movies';
import FzDownloadSection from '../../../../components/FzDownloadSection';

export default function Page() {
  const pageContext = usePageContext();
  const mediaType = pageContext.routeParams.type as MediaType;
  const id = Number(pageContext.routeParams.id);

  const [item, setItem] = useState<MediaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMediaDetail(mediaType, id)
      .then((data) => {
        if (!cancelled) setItem(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this title');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, id]);

  if (loading) {
    return <div className="loading-state">Loading…</div>;
  }

  if (error || !item) {
    return (
      <div className="error-state">
        Couldn't load this title{error ? `: ${error}` : ''}.{' '}
        <a href="/browse" style={{ color: 'inherit', textDecoration: 'underline' }}>
          Back to Movies &amp; TV
        </a>
      </div>
    );
  }

  const backdrop = backdropUrl(item.backdrop_path, 'w1280');
  const poster = posterUrl(item.poster_path, 'w500');
  const year = item.release_date ? item.release_date.slice(0, 4) : '—';

  return (
    <main className="media-detail">
      <div
        className="media-detail__banner"
        style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
      >
        <div className="media-detail__banner-scrim" />
      </div>

      <div className="media-detail__body">
        {poster && <img className="media-detail__poster" src={poster} alt={item.title} />}

        <div className="media-detail__info">
          <a className="media-detail__back" href="/browse">
            ‹ Back
          </a>
          <h1 className="media-detail__title">{item.title}</h1>

          <div className="media-detail__badges">
            {item.vote_average > 0 && (
              <span className="badge badge-dub">★ {item.vote_average.toFixed(1)}</span>
            )}
            <span className="hero-banner__type">{item.media_type === 'movie' ? 'Movie' : 'Series'}</span>
            {item.runtime != null && <span className="hero-banner__type">{item.runtime} min</span>}
            {item.number_of_seasons != null && (
              <span className="hero-banner__type">
                {item.number_of_seasons} season{item.number_of_seasons === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {item.genres.length > 0 && (
            <div className="media-detail__genres">
              {item.genres.map((g) => (
                <span key={g.id} className="media-detail__genre">
                  {g.name}
                </span>
              ))}
            </div>
          )}

          <p className="media-detail__description">{item.overview || 'No description available.'}</p>

          <div className="media-detail__meta">
            <div>
              <span className="hero-banner__stat-label">Release</span>
              <span className="hero-banner__stat-value">{year}</span>
            </div>
          </div>

          <FzDownloadSection initialTitle={item.title} />
        </div>
      </div>
    </main>
  );
}