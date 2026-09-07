// components/Header.tsx
import React, { useEffect, useRef, useState } from 'react';
import { searchAnime, fetchRandomAnime, displayTitle, AnimeItem } from '../services';
import { useTitleLang } from '../context/TitleLangContext';

export default function Header() {
  const { titleLang, toggleTitleLang } = useTitleLang();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnimeItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const t = setTimeout(() => {
      searchAnime(query.trim(), 8)
        .then((items) => {
          setResults(items);
          setActiveIndex(-1);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const goToSearch = (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setOpen(false);
    window.location.href = `/search?q=${encodeURIComponent(trimmed)}`;
  };

  const handleShuffle = async () => {
    setShuffling(true);
    try {
      const anime = await fetchRandomAnime();
      if (anime) window.location.href = `/anime/${anime.id}`;
    } finally {
      setShuffling(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        window.location.href = `/anime/${results[activeIndex].id}`;
      } else {
        goToSearch(query);
      }
      return;
    }

    if (!open || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <header className="site-header">
      <button type="button" className="site-header__hamburger" aria-label="Menu">
        <span />
        <span />
        <span />
      </button>

      <a href="/" className="site-header__logo">
        <span className="site-header__logo-a">Anim</span>
        <span className="site-header__logo-b">Anime</span>
      </a>

      <form
        className="site-header__search"
        ref={boxRef}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goToSearch(query);
        }}
      >
        <span className="site-header__search-icon" aria-hidden="true">
          🔍︎
        </span>
        <input
          ref={inputRef}
          type="search"
          name="q"
          placeholder="Search anime…"
          value={query}
          autoComplete="off"
          aria-label="Search anime"
          aria-expanded={showDropdown}
          aria-controls="search-suggestions"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="site-header__search-submit" aria-label="Search">
          Search
        </button>

        {showDropdown && (
          <div id="search-suggestions" className="site-header__dropdown-panel">
            {searching ? (
              <p className="site-header__dropdown-status">Searching…</p>
            ) : results.length === 0 ? (
              <p className="site-header__dropdown-status">No results found</p>
            ) : (
              <ul className="site-header__dropdown">
                {results.map((a, index) => (
                  <li key={a.id}>
                    <a
                      href={`/anime/${a.id}`}
                      className={index === activeIndex ? 'is-active' : ''}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <img src={a.coverImage.large} alt="" />
                      <span className="site-header__dropdown-title">{displayTitle(a, titleLang)}</span>
                      {a.averageScore != null && (
                        <span className="site-header__dropdown-score">★ {a.averageScore}</span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {!searching && results.length > 0 && (
              <button
                type="button"
                className="site-header__dropdown-all"
                onClick={() => goToSearch(query)}
              >
                See all results for &ldquo;{query.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </form>

      <button
        type="button"
        className={`site-header__icon-btn ${shuffling ? 'is-spinning' : ''}`}
        onClick={handleShuffle}
        aria-label="Random anime"
        title="Random anime"
      >
        🔀︎
      </button>

      <button
        type="button"
        className="site-header__lang-toggle"
        onClick={toggleTitleLang}
        aria-label="Toggle title language"
      >
        <span className={titleLang === 'english' ? 'is-active' : ''}>EN</span>
        <span className={titleLang === 'romaji' ? 'is-active' : ''}>JP</span>
      </button>

      <button type="button" className="site-header__avatar" aria-label="Account">
        👤
      </button>
    </header>
  );
}
