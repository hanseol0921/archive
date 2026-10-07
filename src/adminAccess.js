// User IDs are public identifiers. Never put API secrets in this module.
export const ADMIN_USER_ID = "72d934cf-ddeb-49cb-8d57-51bc35da492c";
export function isArchiveAdmin(user) {
  return user?.id === ADMIN_USER_ID;
}
