// components/HeroBanner.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { AnimeItem, displayTitle, displayFormat } from '../services';

interface HeroBannerProps {
  slides: AnimeItem[];
  autoPlayMs?: number;
  titleLang?: 'english' | 'romaji';
}

export default function HeroBanner({ slides, autoPlayMs = 7000, titleLang = 'english' }: HeroBannerProps) {
  const [index, setIndex] = useState(0);
  const [bookmarked, setBookmarked] = useState<Set<number>>(new Set());

  const goTo = useCallback(
    (i: number) => {
      if (slides.length === 0) return;
      setIndex(((i % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(next, autoPlayMs);
    return () => clearInterval(t);
  }, [next, autoPlayMs, slides.length]);

  // Guard against index drifting out of range if a re-fetch shortens the list
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  if (slides.length === 0) {
    return <div className="hero-banner hero-banner--empty">Loading featured anime…</div>;
  }

  const anime = slides[index];
  const title = displayTitle(anime, titleLang);
  const year = anime.startDate.year ?? '—';
  const score = anime.averageScore ? `${anime.averageScore}%` : 'N/A';

  const toggleBookmark = (id: number) => {
    setBookmarked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <section
      className="hero-banner"
      style={{ backgroundImage: `url(${anime.bannerImage ?? anime.coverImage.extraLarge})` }}
    >
      <div className="hero-banner__scrim" />

      <div className="hero-banner__content">
        <h1 className="hero-banner__title">{title}</h1>

        <div className="hero-banner__badges">
          {anime.episodes != null && <span className="badge badge-cc">EP {anime.episodes}</span>}
          {anime.averageScore != null && <span className="badge badge-dub">★ {score}</span>}
          <span className="hero-banner__type">{displayFormat(anime)}</span>
        </div>

        {anime.description && (
          <p className="hero-banner__desc">
            {anime.description.replace(/<[^>]+>/g, '').slice(0, 180)}
            {anime.description.length > 180 ? '…' : ''}
          </p>
        )}

        <div className="hero-banner__stats">
          <div>
            <span className="hero-banner__stat-label">Score</span>
            <span className="hero-banner__stat-value">{score}</span>
          </div>
          <div>
            <span className="hero-banner__stat-label">Release</span>
            <span className="hero-banner__stat-value">{year}</span>
          </div>
          <div>
            <span className="hero-banner__stat-label">Format</span>
            <span className="hero-banner__stat-value">{displayFormat(anime)}</span>
          </div>
        </div>

        <div className="hero-banner__actions">
          <a className="btn btn--watch" href={`/anime/${anime.id}`}>
            WATCH NOW
          </a>
          <button
            type="button"
            className={`btn btn--bookmark ${bookmarked.has(anime.id) ? 'is-active' : ''}`}
            onClick={() => toggleBookmark(anime.id)}
            aria-label="Bookmark"
          >
            ⚑
          </button>
        </div>
      </div>

      {slides.length > 1 && (
        <div className="hero-banner__nav">
          <button type="button" onClick={prev} aria-label="Previous slide">
            ‹
          </button>
          <span className="hero-banner__counter">
            {index + 1} / {slides.length}
          </span>
          <button type="button" onClick={next} aria-label="Next slide">
            ›
          </button>
        </div>
      )}
    </section>
  );
}