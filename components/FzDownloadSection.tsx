// components/FzDownloadSection.tsx
import React, { useEffect, useState } from 'react';

export interface FzSearchResult {
  title: string;
  year: string;
  quality: string;
  link: string;
  source?: string;
  details?: string;
}

export interface FzDownloadLink {
  name: string;
  quality?: string;
  size?: string;
  url: string;
}

interface FzDownloadSectionProps {
  initialTitle?: string;
  standalone?: boolean;
}

export default function FzDownloadSection({ initialTitle = '', standalone = false }: FzDownloadSectionProps) {
  const [searchTerm, setSearchTerm] = useState(initialTitle);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FzSearchResult[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<FzSearchResult | null>(null);
  
  const [extracting, setExtracting] = useState(false);
  const [downloadLinks, setDownloadLinks] = useState<FzDownloadLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (titleToSearch: string) => {
    const term = titleToSearch.trim();
    if (!term) return;

    setSearching(true);
    setError(null);
    setSelectedMovie(null);
    setDownloadLinks([]);

    try {
      const res = await fetch(`http://localhost:5000/api/fzmovies/search?query=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error('Failed to connect to FZMovies scraper service.');
      const data = await res.json();

      if (data.status === 'success' && data.results && data.results.length > 0) {
        setSearchResults(data.results);
        // Automatically select first result if title match
        if (data.results.length === 1 || initialTitle) {
          handleSelectMovie(data.results[0]);
        }
      } else {
        setError('No matches found on FZMovies for this query.');
        setSearchResults([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error connecting to search service.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (initialTitle) {
      handleSearch(initialTitle);
    }
  }, [initialTitle]);

  const handleSelectMovie = async (movie: FzSearchResult) => {
    setSelectedMovie(movie);
    setExtracting(true);
    setError(null);
    setDownloadLinks([]);

    try {
      const res = await fetch(`http://localhost:5000/api/fzmovies/extract?url=${encodeURIComponent(movie.link)}`);
      if (!res.ok) throw new Error('Failed to extract download options.');
      const data = await res.json();

      if (data.status === 'success' && data.links && data.links.length > 0) {
        setDownloadLinks(data.links);
      } else {
        setError('No direct download links could be generated for this title.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error extracting download links.');
    } finally {
      setExtracting(false);
    }
  };

  const handleTriggerDownload = (link: FzDownloadLink) => {
    const movieName = selectedMovie ? selectedMovie.title : searchTerm || 'Movie';
    const proxyUrl = `http://localhost:5000/api/fzmovies/download-file?url=${encodeURIComponent(link.url)}&filename=${encodeURIComponent(movieName + '_' + (link.quality || 'HD') + '.mp4')}`;
    
    // Trigger download
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = `${movieName}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <section style={{
      marginTop: '28px',
      backgroundColor: '#111827',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid #1f2937',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🎬</span>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f9fafb', margin: 0 }}>
              FZMovies Downloader
            </h2>
            <span style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '9999px',
              textTransform: 'uppercase'
            }}>
              Script Active
            </span>
          </div>
          <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px', margin: 0 }}>
            Scrape high-speed MP4 movie and series downloads directly via fzmovies_scraper_script
          </p>
        </div>

        {standalone && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchTerm);
            }}
            style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '400px' }}
          >
            <input
              type="text"
              placeholder="Search movie or series title…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={searching}
              style={{
                padding: '10px 18px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                borderRadius: '8px',
                cursor: searching ? 'not-allowed' : 'pointer',
                opacity: searching ? 0.7 : 1
              }}
            >
              {searching ? 'Scraping…' : 'Search FZ'}
            </button>
          </form>
        )}
      </div>

      {/* SEARCHING STATE */}
      {searching && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #374151',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            margin: '0 auto 12px',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ fontSize: '14px', margin: 0 }}>Scraping fzmovies for &ldquo;{searchTerm}&rdquo;…</p>
        </div>
      )}

      {/* ERROR MESSAGE */}
      {error && !searching && (
        <div style={{
          backgroundColor: '#451a1a',
          border: '1px solid #7f1d1d',
          color: '#fca5a5',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          marginBottom: '16px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* MULTIPLE RESULTS FOUND */}
      {!searching && searchResults.length > 1 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#d1d5db', fontSize: '14px', marginBottom: '10px', fontWeight: 600 }}>
            Select Movie Release match ({searchResults.length} found):
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
            {searchResults.map((res, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectMovie(res)}
                style={{
                  textAlign: 'left',
                  padding: '12px',
                  backgroundColor: selectedMovie?.link === res.link ? '#1e3a8a' : '#1f2937',
                  border: selectedMovie?.link === res.link ? '1px solid #3b82f6' : '1px solid #374151',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: '#fff',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f3f4f6' }}>{res.title}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', display: 'flex', gap: '8px' }}>
                  {res.year && <span>📅 {res.year}</span>}
                  {res.quality && <span>🎞️ {res.quality}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* EXTRACTING DOWNLOAD LINKS STATE */}
      {extracting && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>
          <div style={{
            width: '28px',
            height: '28px',
            border: '3px solid #374151',
            borderTop: '3px solid #10b981',
            borderRadius: '50%',
            margin: '0 auto 12px',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ fontSize: '14px', margin: 0 }}>
            Traversing download pages and extracting high-speed download URLs…
          </p>
        </div>
      )}

      {/* DOWNLOAD LINKS READY */}
      {!extracting && downloadLinks.length > 0 && (
        <div>
          <h4 style={{ color: '#10b981', fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>✅</span> Available Direct Downloads:
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {downloadLinks.map((link, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  gap: '16px',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#f9fafb' }}>
                    {link.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', display: 'flex', gap: '12px' }}>
                    {link.quality && <span>Quality: <strong style={{ color: '#60a5fa' }}>{link.quality}</strong></span>}
                    {link.size && <span>File Size: <strong>{link.size}</strong></span>}
                    <span>Format: <strong>MP4</strong></span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleTriggerDownload(link)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 18px',
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '14px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                      transition: 'transform 0.1s ease'
                    }}
                  >
                    <span>⬇️</span> Download Movie
                  </button>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '10px 14px',
                      backgroundColor: '#374151',
                      color: '#d1d5db',
                      fontWeight: 600,
                      fontSize: '13px',
                      borderRadius: '8px',
                      textDecoration: 'none'
                    }}
                  >
                    Direct Link
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
