// components/TrendingSidebar.tsx
import React from 'react';
import { AnimeItem, displayTitle, displayFormat } from '../services';

interface TrendingSidebarProps {
  items: AnimeItem[];
  titleLang?: 'english' | 'romaji';
}

export default function TrendingSidebar({ items, titleLang = 'english' }: TrendingSidebarProps) {
  return (
    <aside className="trending-sidebar">
      <h2 className="trending-sidebar__heading">🏆 Top Trending</h2>
      <ol className="trending-sidebar__list">
        {items.map((anime, i) => (
          <li key={anime.id} className="trending-sidebar__item">
            <span className="trending-sidebar__rank">{i + 1}</span>
            <img
              className="trending-sidebar__thumb"
              src={anime.coverImage.large}
              alt=""
              loading="lazy"
            />
            <div className="trending-sidebar__info">
              <a href={`/anime/${anime.id}`}>{displayTitle(anime, titleLang)}</a>
              <div className="badge-group">
                {anime.episodes != null && <span className="badge badge-cc">EP {anime.episodes}</span>}
                <span className="format-tag">{displayFormat(anime)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}