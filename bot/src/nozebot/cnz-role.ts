/** Match the same standalone CNZ marker as the weekly reward, never a Discord nickname. */
export function hasCnzMarker(rumbleName: string): boolean {
  return /(^|[^a-z0-9])CNZ([^a-z0-9]|$)/i.test(rumbleName);
}

export function cnzRoleChange(input: {
  username: string; usernameVerifiedAt?: string | null; hasRole: boolean;
}): 'add' | 'remove' | null {
  // Unknown/legacy names must not grant a role or revoke an existing one.
  const observed = Date.parse(input.usernameVerifiedAt ?? '');
  if (!Number.isFinite(observed) || observed > Date.now() + 30_000) return null;
  const eligible = hasCnzMarker(input.username);
  return eligible === input.hasRole ? null : eligible ? 'add' : 'remove';
}
