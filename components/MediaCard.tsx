// components/MediaCard.tsx
import React from 'react';
import { MediaItem, posterUrl } from '../movies';

export default function MediaCard({ item }: { item: MediaItem }) {
  const poster = posterUrl(item.poster_path, 'w342');
  const year = item.release_date ? item.release_date.slice(0, 4) : '';

  return (
    <a className="media-card" href={`/browse/${item.media_type}/${item.id}`}>
      <div className="media-card__poster-wrapper">
        {poster ? (
          <img src={poster} alt={item.title} loading="lazy" />
        ) : (
          <div className="media-card__poster-fallback">{item.title}</div>
        )}
        <div className="media-card__overlay">
          <span className="media-card__title">{item.title}</span>
          <div className="media-card__meta">
            {item.vote_average > 0 && (
              <span className="media-card__rating">★ {item.vote_average.toFixed(1)}</span>
            )}
            {year && <span className="media-card__year">{year}</span>}
            <span className="media-card__type">{item.media_type === 'movie' ? 'Movie' : 'Series'}</span>
          </div>
        </div>
      </div>
    </a>
  );
}