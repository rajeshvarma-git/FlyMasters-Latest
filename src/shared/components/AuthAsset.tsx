import { useEffect, useState } from "react";

/**
 * Files of a university are only served to a signed-in session (and, to
 * students, only while published), so an <img src> cannot fetch them. These
 * helpers fetch with the session's token and show the result.
 */
type TokenSource = () => string | Promise<string>;

export async function fetchAssetBlob(url: string, getToken: TokenSource): Promise<Blob> {
  const token = await getToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error("File not available.");
  return response.blob();
}

export function AuthImage({ url, getToken, alt, className }: { url: string; getToken: TokenSource; alt: string; className?: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = "";
    let cancelled = false;
    setSrc("");
    setFailed(false);
    fetchAssetBlob(url, getToken)
      .then((blob) => {
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setSrc(revoked);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (failed) return <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-500 ${className || ""}`}>Image unavailable</div>;
  if (!src) return <div className={`animate-pulse bg-slate-100 ${className || ""}`} aria-label="Loading image" />;
  return <img src={src} alt={alt} className={className} />;
}

/** Opens a PDF in a new tab (fetched with the session token, then shown from a temporary local URL). */
export async function openAssetInTab(url: string, getToken: TokenSource) {
  const popup = window.open("", "_blank");
  try {
    const blob = await fetchAssetBlob(url, getToken);
    const local = URL.createObjectURL(blob);
    if (popup) popup.location.href = local;
    else window.location.href = local;
    window.setTimeout(() => URL.revokeObjectURL(local), 60_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
