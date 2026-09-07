// components/AnimeCard.tsx
import React from 'react';
import { AnimeItem, displayTitle, displayFormat } from '../services';

interface AnimeCardProps {
  anime: AnimeItem;
  titleLang?: 'english' | 'romaji';
}

export default function AnimeCard({ anime, titleLang = 'english' }: AnimeCardProps) {
  const title = displayTitle(anime, titleLang);
  const poster = anime.coverImage.large || anime.coverImage.extraLarge;

  return (
    <a className="anime-card" href={`/anime/${anime.id}`}>
      <div className="poster-wrapper">
        <img src={poster} alt={title} loading="lazy" />
      </div>
      <h3 className="anime-card-title">{title}</h3>
      <div className="anime-card-meta">
        <div className="badge-group">
          {anime.episodes != null && <span className="badge badge-cc">EP {anime.episodes}</span>}
          {anime.averageScore != null && <span className="badge badge-dub">★ {anime.averageScore}</span>}
        </div>
        <span className="format-tag">{displayFormat(anime)}</span>
      </div>
    </a>
  );
}