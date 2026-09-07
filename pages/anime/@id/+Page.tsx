// pages/anime/@id/+Page.tsx
import React, { useEffect, useState } from 'react';
import { usePageContext } from 'vike-react/usePageContext';
import { fetchAnimeById, displayTitle, displayFormat, AnimeDetail } from '../../../services';
import { findAnikotoId, fetchSeries, AnikotoEpisode } from '../../../streaming';

function cleanDescription(html: string | null): string {
  if (!html) return 'No description available.';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export default function Page() {
  const pageContext = usePageContext();
  const id = Number(pageContext.routeParams.id);

  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [episodes, setEpisodes] = useState<AnikotoEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAnimeById(id)
      .then((data) => {
        if (!cancelled) setAnime(data);
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
  }, [id]);

  useEffect(() => {
    if (!anime) return;
    let cancelled = false;
    setEpisodesLoading(true);
    setEpisodesError(null);

    findAnikotoId(anime.id, displayTitle(anime, 'romaji'))
      .then((anikotoId) => {
        if (cancelled) return null;
        if (!anikotoId) {
          setEpisodesError('No streaming source found for this title.');
          return null;
        }
        return fetchSeries(anikotoId);
      })
      .then((series) => {
        if (cancelled || !series) return;
        setEpisodes(Array.isArray(series.episodes) ? series.episodes : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setEpisodesError(err instanceof Error ? err.message : 'Failed to load episodes');
        }
      })
      .finally(() => {
        if (!cancelled) setEpisodesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [anime]);

  if (loading) {
    return <div className="loading-state">Loading…</div>;
  }

  if (error || !anime) {
    return (
      <div className="error-state">
        Couldn't load this title{error ? `: ${error}` : ''}.{' '}
        <a href="/" style={{ color: 'inherit', textDecoration: 'underline' }}>
          Back home
        </a>
      </div>
    );
  }

  const title = displayTitle(anime);
  const description = cleanDescription(anime.description);
  const studio = anime.studios.nodes[0]?.name;

  return (
    <main className="anime-detail">
      <div
        className="anime-detail__banner"
        style={{ backgroundImage: `url(${anime.bannerImage ?? anime.coverImage.extraLarge})` }}
      >
        <div className="anime-detail__banner-scrim" />
      </div>

      <div className="anime-detail__body">
        <img className="anime-detail__poster" src={anime.coverImage.extraLarge} alt={title} />

        <div className="anime-detail__info">
          <a className="anime-detail__back" href="/">
            ‹ Back
          </a>
          <h1 className="anime-detail__title">{title}</h1>
          {anime.title.english && anime.title.romaji !== anime.title.english && (
            <p className="anime-detail__subtitle">{anime.title.romaji}</p>
          )}

          <div className="anime-detail__badges">
            {anime.episodes != null && <span className="badge badge-cc">EP {anime.episodes}</span>}
            {anime.averageScore != null && (
              <span className="badge badge-dub">★ {anime.averageScore}%</span>
            )}
            <span className="hero-banner__type">{displayFormat(anime)}</span>
            {anime.duration != null && (
              <span className="hero-banner__type">{anime.duration} min/ep</span>
            )}
          </div>

          {anime.genres.length > 0 && (
            <div className="anime-detail__genres">
              {anime.genres.map((g) => (
                <span key={g} className="anime-detail__genre">
                  {g}
                </span>
              ))}
            </div>
          )}

          <p className="anime-detail__description">{description}</p>

          <div className="anime-detail__meta">
            <div>
              <span className="hero-banner__stat-label">Status</span>
              <span className="hero-banner__stat-value">{anime.status ?? '—'}</span>
            </div>
            <div>
              <span className="hero-banner__stat-label">Release</span>
              <span className="hero-banner__stat-value">{anime.startDate.year ?? '—'}</span>
            </div>
            {studio && (
              <div>
                <span className="hero-banner__stat-label">Studio</span>
                <span className="hero-banner__stat-value">{studio}</span>
              </div>
            )}
          </div>

          {/* ----- NEW EPISODE GRID WITH DOWNLOAD BUTTONS ----- */}
          <div className="anime-detail__episodes">
            <h2 className="section-title">Episodes</h2>
            {episodesLoading ? (
              <p className="loading-state">Loading episodes…</p>
            ) : episodesError ? (
              <p className="error-state">{episodesError}</p>
            ) : (
              <div className="episode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                {episodes.map((ep) => {
                  // Grab whichever embed URL is available (Sub first, then Dub)
                  const embedUrl = ep.embed_url?.sub || ep.embed_url?.dub || '';

                  return (
                    <div 
                      key={ep.id} 
                      className="episode-card" 
                      style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#1a1a1a', padding: '8px', borderRadius: '6px' }}
                    >
                      {/* Click to Watch / Stream */}
                      <a
                        className="episode-chip"
                        href={`/anime/${anime.id}/${ep.number}`}
                        style={{ fontWeight: 'bold', color: '#fff', textAlign: 'center' }}
                      >
                        EP {ep.number}
                      </a>

                      {/* Click to Download */}
                      {embedUrl ? (
                        <a
                          href={`/download?title=${encodeURIComponent(title)}&ep=${ep.number}&embed=${encodeURIComponent(embedUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '12px', color: '#3b82f6', textAlign: 'center', textDecoration: 'underline' }}
                        >
                          ⬇ Download
                        </a>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>No Stream</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* ------------------------------------------------ */}

        </div>
      </div>
    </main>
  );
}