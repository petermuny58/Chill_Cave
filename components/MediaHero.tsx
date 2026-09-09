// components/MediaHero.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { MediaItem, backdropUrl } from '../movies';

export default function MediaHero({ slides, autoPlayMs = 8000 }: { slides: MediaItem[]; autoPlayMs?: number }) {
  const [index, setIndex] = useState(0);

  const goTo = useCallback(
    (i: number) => {
      if (slides.length === 0) return;
      setIndex(((i % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => goTo(index + 1), autoPlayMs);
    return () => clearInterval(t);
  }, [goTo, index, autoPlayMs, slides.length]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  if (slides.length === 0) {
    return <div className="hero-banner hero-banner--empty">Loading…</div>;
  }

  const item = slides[index];
  const backdrop = backdropUrl(item.backdrop_path, 'w1280');
  const year = item.release_date ? item.release_date.slice(0, 4) : '';
  // No streaming source is wired up for movies/TV yet — Play opens the
  // detail page for now, same stop as More Info, until one is added.
  const detailHref = `/browse/${item.media_type}/${item.id}`;

  return (
    <section
      className="hero-banner media-hero"
      style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
    >
      <div className="hero-banner__scrim" />
      <div className="hero-banner__content">
        <h1 className="hero-banner__title">{item.title}</h1>

        <div className="hero-banner__badges">
          {item.vote_average > 0 && (
            <span className="badge badge-dub">★ {item.vote_average.toFixed(1)}</span>
          )}
          <span className="hero-banner__type">{item.media_type === 'movie' ? 'Movie' : 'Series'}</span>
          {year && <span className="hero-banner__type">{year}</span>}
        </div>

        {item.overview && <p className="hero-banner__desc">{item.overview}</p>}

        <div className="hero-banner__actions">
          <a className="btn btn--watch" href={detailHref}>
            ▶ Play
          </a>
          <a className="btn btn--bookmark" href={detailHref} aria-label="More info">
            ℹ
          </a>
        </div>
      </div>
    </section>
  );
}