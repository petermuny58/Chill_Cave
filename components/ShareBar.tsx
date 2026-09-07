// components/ShareBar.tsx
import React, { useState } from 'react';

export default function ShareBar({ siteName = 'Anim Anime' }: { siteName?: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareData = {
      title: siteName,
      text: `Check out ${siteName}!`,
      url: window.location.origin,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* user cancelled the native share sheet, nothing to do */
      }
    } else {
      await navigator.clipboard.writeText(shareData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="share-bar">
      <div className="share-bar__left">
        <span className="share-bar__avatar" aria-hidden="true">📣</span>
        <div>
          <p className="share-bar__title">Enjoying {siteName}?</p>
          <p className="share-bar__subtitle">Share it and let others know!</p>
        </div>
      </div>
      <button type="button" className="share-bar__btn" onClick={handleShare}>
        {copied ? 'Link copied!' : 'Share'}
      </button>
    </div>
  );
}