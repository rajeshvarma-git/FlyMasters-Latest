const PUBLIC_BUCKETS = new Set(['website_media', 'travel-packages', 'test-prep-media']);
export function publicMediaPath(bucket: string, path: string) {
  if (!PUBLIC_BUCKETS.has(bucket)) return path;
  const prefix = `public-media/${bucket}/`;
  return path.startsWith(prefix) ? path : prefix + path.replace(/^\/+/, '');
}
export function isPublicMediaPath(path: string) {
  const parts = path.split('/');
  return parts[0] === 'public-media' && PUBLIC_BUCKETS.has(parts[1]) && parts.length > 2
    && parts.every((part) => part !== '..' && part !== '.' && part !== '');
}

export function allowedPublicMediaType(mime: string) {
  return /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|audio\/(mpeg|ogg|mp4)|application\/pdf)$/.test(mime);
}
