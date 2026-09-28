type NamedUser = { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined;
type NamedProfile = { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined;

/** "Rahul Verma" from the profile, then sign-up metadata, then the email's local part. */
export function studentDisplayName(user: NamedUser, profile: NamedProfile): string {
  const fromProfile =
    profile?.full_name?.trim() || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  if (fromProfile) return fromProfile;
  const meta = (user?.user_metadata || {}) as Record<string, unknown>;
  const fromMeta = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim();
  if (fromMeta) return fromMeta;
  return user?.email?.split('@')[0] || 'Student';
}

export function studentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || 'S').slice(0, 2);
  return letters.toUpperCase();
}
