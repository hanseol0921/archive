// Preserve the existing navigation order until an administrator saves a custom order.
export const DEFAULT_TAB_ORDER = ['home', 'photos', 'videos', 'dm', 'comments', 'statistics', 'diary', 'guestbook', 'posts', 'settings'];
export function normalizeTabOrder(value) {
  const saved = Array.isArray(value) ? value.filter(id => DEFAULT_TAB_ORDER.includes(id)) : [];
  return [...new Set([...saved, ...DEFAULT_TAB_ORDER])];
}
export function moveTab(order, id, direction) {
  const next = normalizeTabOrder(order);
  const index = next.indexOf(id);
  const destination = index + direction;
  if (index < 0 || ![-1, 1].includes(direction) || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
