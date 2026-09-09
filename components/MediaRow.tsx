// components/MediaRow.tsx
import React, { useRef } from 'react';
import { MediaItem } from '../movies';
import MediaCard from './MediaCard';

interface MediaRowProps {
  title: string;
  items: MediaItem[];
}

export default function MediaRow({ title, items }: MediaRowProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    const track = trackRef.current;
    if (!track) return;
    const amount = track.clientWidth * 0.9;
    track.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="media-row">
      <h2 className="media-row__title">{title}</h2>
      <div className="media-row__viewport">
        <button
          type="button"
          className="media-row__nav media-row__nav--left"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          ‹
        </button>
        <div className="media-row__track" ref={trackRef}>
          {items.map((item) => (
            <div className="media-row__item" key={`${item.media_type}-${item.id}`}>
              <MediaCard item={item} />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="media-row__nav media-row__nav--right"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          ›
        </button>
      </div>
    </section>
  );
}