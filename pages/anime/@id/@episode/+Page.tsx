// pages/anime/@id/@episode/+Page.tsx
import React, { useEffect, useState } from 'react';
import { usePageContext } from 'vike-react/usePageContext';
import { fetchAnimeById, displayTitle, AnimeDetail } from '../../../../services';
import { findAnikotoId, fetchSeries, AnikotoEpisode } from '../../../../streaming';

// Define the shape of the extracted format data
interface VideoFormat {
  format_id: string;
  resolution: string;
  downloadUrl: string;
}

export default function Page() {
  const pageContext = usePageContext();
  const anilistId = Number(pageContext.routeParams.id);
  const episodeNumber = Number(pageContext.routeParams.episode);

  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [episode, setEpisode] = useState<AnikotoEpisode | null>(null);
  const [audio, setAudio] = useState<'sub' | 'dub'>('sub');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New state variables for the dynamic download button
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAnimeById(anilistId)
      .then((data) => {
        if (cancelled) return null;
        if (!data) throw new Error('Title not found');
        setAnime(data);
        return findAnikotoId(data.id, displayTitle(data, 'romaji'));
      })
      .then((anikotoId) => {
        if (cancelled) return null;
        if (!anikotoId) throw new Error('No streaming source found for this title.');
        return fetchSeries(anikotoId);
      })
      .then((series) => {
        if (cancelled || !series) return;
        const episodesList = Array.isArray(series.episodes) ? series.episodes : [];
        const found = episodesList.find((e) => e.number === episodeNumber);
        if (!found) throw new Error(`Episode ${episodeNumber} isn't available.`);
        setEpisode(found);
        // Default to whichever audio track this episode actually has.
        if (!found.embed_url.sub && found.embed_url.dub) setAudio('dub');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this episode');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [anilistId, episodeNumber]);

  // Reset the download section if the user switches audio tracks or episodes
  useEffect(() => {
    setExtractError(null);
    setIsExtracting(false);
    setIsDownloading(false);
  }, [audio, episodeNumber]);

  // Silent background prefetch — warms the stream cache while the user watches
  useEffect(() => {
    if (!episode) return;
    const prefetchUrl = episode.embed_url[audio] ?? episode.embed_url.sub ?? episode.embed_url.dub;
    if (!prefetchUrl) return;

    fetch(`http://localhost:5000/api/prefetch?url=${encodeURIComponent(prefetchUrl)}`, {
      method: 'POST',
    }).catch(() => {});
  }, [episode, audio]);

  if (loading) {
    return <div className="loading-state">Loading player…</div>;
  }

  if (error || !anime || !episode) {
    return (
      <div className="error-state">
        {error ?? 'Something went wrong.'}{' '}
        <a href={`/anime/${anilistId}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
          Back to title
        </a>
      </div>
    );
  }

  // Active stream URL depends on chosen sub/dub audio option
  const embedUrl = episode.embed_url[audio] ?? episode.embed_url.sub ?? episode.embed_url.dub;
  const title = displayTitle(anime);

  const handleDownload = async () => {
    if (!embedUrl) return;

    setIsExtracting(true);
    setIsDownloading(false);
    setExtractError(null);

    try {
      const response = await fetch(`http://localhost:5000/api/extract-formats?url=${encodeURIComponent(embedUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract video links.');
      }

      const best = data.formats?.[0] as VideoFormat | undefined;
      if (!best?.downloadUrl) {
        throw new Error('No downloadable stream found.');
      }

      setIsExtracting(false);
      setIsDownloading(true);

      const fileTitle = `${title} - Ep ${episodeNumber} (${audio.toUpperCase()})`;
      window.location.href = `${best.downloadUrl}&title=${encodeURIComponent(fileTitle)}`;
    } catch (err) {
      console.error('Fetch error:', err);
      setExtractError(err instanceof Error ? err.message : 'Failed to connect to extraction server.');
      setIsExtracting(false);
      setIsDownloading(false);
    }
  };

  return (
    <main className="watch-page">
      <div className="watch-page__player">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            allowFullScreen
            frameBorder={0}
            title={`${title} — Episode ${episodeNumber}`}
          />
        ) : (
          <div className="error-state">No embed available for this episode.</div>
        )}
      </div>

      <div className="watch-page__meta">
        <a className="anime-detail__back" href={`/anime/${anime.id}`}>
          ‹ Back to {title}
        </a>
        <h1 className="watch-page__title">
          {title} — Episode {episodeNumber}
        </h1>

        <div className="watch-page__audio-toggle">
          {episode.embed_url.sub && (
            <button
              type="button"
              className={audio === 'sub' ? 'is-active' : ''}
              onClick={() => setAudio('sub')}
            >
              Sub
            </button>
          )}
          {episode.embed_url.dub && (
            <button
              type="button"
              className={audio === 'dub' ? 'is-active' : ''}
              onClick={() => setAudio('dub')}
            >
              Dub
            </button>
          )}
        </div>

        {/* ========================================== */}
        {/*        DYNAMIC DOWNLOAD SECTION            */}
        {/* ========================================== */}
        {embedUrl && (
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#1a1c23', borderRadius: '8px', border: '1px solid #2d3748', maxWidth: '400px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#e2e8f0', marginBottom: '12px', marginTop: 0 }}>
              Download
            </h3>

            {!isExtracting && !isDownloading && !extractError && (
              <button
                onClick={handleDownload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                ⬇ Download Episode ({audio.toUpperCase()})
              </button>
            )}

            {isExtracting && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                <div style={{
                  width: '20px', height: '20px', border: '3px solid #3b82f6',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ fontSize: '14px' }}>Preparing download…</span>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {isDownloading && !extractError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8' }}>
                <div style={{
                  width: '20px', height: '20px', border: '3px solid #22c55e',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ fontSize: '14px' }}>Download started — check your browser downloads.</span>
              </div>
            )}

            {extractError && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '6px' }}>
                <p style={{ color: '#fca5a5', fontSize: '14px', margin: '0 0 10px 0' }}>{extractError}</p>
                <button
                  onClick={handleDownload}
                  style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}