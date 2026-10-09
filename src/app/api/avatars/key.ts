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
