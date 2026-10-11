export function mergePollSnapshots(existing = [], incoming = []) {
  const previous = Array.isArray(existing) ? existing : [];
  const polls = incoming.filter(block => block.type === 'poll');
  const pending = new Map(polls.map(block => [String(block.id), block]));
  const merged = previous.map(block => {
    if (block.type !== 'poll') return block;
    const next = pending.get(String(block.id));
    if (!next) return block;
    pending.delete(String(block.id));
    return Date.parse(block.captured_at) > Date.parse(next.captured_at) ? block : next;
  });
  return [...merged, ...pending.values()];
}
