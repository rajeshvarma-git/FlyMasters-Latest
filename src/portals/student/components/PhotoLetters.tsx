import { useEffect, useState } from 'react';
import { apiUrl } from '@student/lib/apiBase';

/**
 * A word whose letters are each filled with a different famous campus photo
 * (Oxford, Toronto, Melbourne, Harvard …). Photos come from
 * GET /api/public/campus-photos (Wikipedia, cached server-side). Until they
 * load — or if they can't — each letter shows its own colour gradient, so the
 * word is always readable.
 */

const GRADIENTS = [
  'linear-gradient(135deg,#1d4ed8,#38bdf8)',
  'linear-gradient(135deg,#0f766e,#34d399)',
  'linear-gradient(135deg,#7c3aed,#f472b6)',
  'linear-gradient(135deg,#b45309,#fbbf24)',
  'linear-gradient(135deg,#be123c,#fb7185)',
  'linear-gradient(135deg,#0369a1,#22d3ee)',
  'linear-gradient(135deg,#4d7c0f,#a3e635)',
  'linear-gradient(135deg,#9333ea,#60a5fa)',
  'linear-gradient(135deg,#c2410c,#f97316)',
  'linear-gradient(135deg,#1e3a8a,#818cf8)',
];

type CampusPhoto = { name: string; image: string | null };

let photosPromise: Promise<CampusPhoto[]> | null = null;
function loadPhotos() {
  if (!photosPromise) {
    photosPromise = fetch(apiUrl('/api/public/campus-photos'))
      .then((r) => (r.ok ? r.json() : { photos: [] }))
      .then((d) => (Array.isArray(d.photos) ? d.photos : []))
      .catch(() => []);
  }
  return photosPromise;
}

export function PhotoLetters({ word, className = '', offset = 0 }: { word: string; className?: string; offset?: number }) {
  const [photos, setPhotos] = useState<CampusPhoto[]>([]);

  useEffect(() => {
    let alive = true;
    loadPhotos().then((p) => alive && setPhotos(p.filter((x) => x.image)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <span className={`inline-flex ${className}`} aria-label={word} role="text">
      {word.split('').map((ch, i) => {
        if (ch === ' ') return <span key={`sp-${i}`} aria-hidden="true" className="inline-block w-[0.32em]" />;
        const n = i + offset;
        const photo = photos.length ? photos[n % photos.length] : null;
        const gradient = GRADIENTS[n % GRADIENTS.length];
        return (
          <span
            key={`${ch}-${i}`}
            aria-hidden="true"
            title={photo?.name}
            className="photo-letter"
            style={{
              backgroundImage: photo?.image ? `url("${photo.image}"), ${gradient}` : gradient,
              animationDelay: `${n * 0.6}s`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
