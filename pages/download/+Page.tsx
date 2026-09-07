// pages/download/+Page.tsx
import React, { useEffect, useState } from 'react';

export default function DownloadPage() {
  const [meta, setMeta] = useState({ title: '', episode: '', embedUrl: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const embedUrl = params.get('embed') || '';
    const title = params.get('title') || 'Unknown Anime';
    const episode = params.get('ep') || 'Unknown';

    setMeta({ title, episode, embedUrl });

    if (!embedUrl) {
      setError('No embed video source provided.');
      setLoading(false);
      return;
    }

    // AUTOMATIC FETCH: Call your Node backend as soon as the page opens
    setLoading(true);
    fetch(`http://localhost:5000/api/extract-formats?url=${encodeURIComponent(embedUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to extract download options.');
        return res.json();
      })
      .then((data) => {
        if (data.formats && data.formats.length > 0) {
          const best = data.formats[0];
          const fileTitle = `${title} - Ep ${episode}`;
          window.location.href = `${best.downloadUrl}&title=${encodeURIComponent(fileTitle)}`;
        } else {
          setError('No downloadable resolutions found for this source.');
        }
      })
      .catch((err) => {
        setError(err.message || 'Error connecting to extraction server.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#111', borderRadius: '12px', padding: '32px', border: '1px solid #222', textAlign: 'center' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '8px', color: '#3b82f6' }}>
          Download
        </h1>
        <p style={{ color: '#9ca3af', marginBottom: '24px', fontSize: '14px' }}>
          {meta.title} — Episode {meta.episode}
        </p>

        {/* LOADING STATE */}
        {loading && (
          <div style={{ padding: '20px 0' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid #333', borderTop: '3px solid #3b82f6', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Preparing download…</p>
          </div>
        )}

        {/* ERROR STATE */}
        {error && !loading && (
          <div style={{ backgroundColor: '#2a1215', color: '#f87171', padding: '12px', borderRadius: '6px', fontSize: '14px', marginBottom: '16px' }}>
            {error}
          </div>
        )}
      </div>
    </main>
  );
}