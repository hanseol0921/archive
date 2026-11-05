export function postInDateRange(post, start, end) {
  if (!start && !end) return true;
  let date = post.date;
  if (post.posted_at) {
    const time = Date.parse(post.posted_at);
    if (Number.isFinite(time)) date = new Date(time + 9 * 3600000).toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return false;
  return (!start || date >= start) && (!end || date <= end);
}
