import "server-only";

/**
 * One storage key per user, with no extension: the real content type lives on the `FileObject`
 * row, and `putFile` upserts on the key, so a new avatar replaces the old one instead of leaving
 * the previous extension behind as an orphan.
 */
export function avatarKey(userId: string): string {
  return `avatars/${userId}`;
}

/** What `User.image` holds: a same-origin URL whose `v` stamp changes when the avatar does. */
export function avatarUrl(userId: string, version: number): string {
  return `/api/avatars/${userId}?v=${String(version)}`;
}

/**
 * The original the person chose, kept so the framing can be adjusted later without asking them
 * to find the file again. Served only to its owner.
 */
export function avatarSourceKey(userId: string): string {
  return `avatars/${userId}/source`;
}

/** The owner-only URL the cropper reloads when someone reopens their avatar to adjust it. */
export function avatarSourceUrl(userId: string, version: number): string {
  return `/api/avatars/${userId}/source?v=${String(version)}`;
}
