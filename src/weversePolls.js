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

function pollValue(value) {
  if (Array.isArray(value)) return value.map(pollValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value)
    .filter(key => key !== 'captured_at').sort().map(key => [key, pollValue(value[key])]));
  return value;
}

export function hasPollUpdates(existing = [], incoming = []) {
  const before = (Array.isArray(existing) ? existing : []).filter(block => block.type === 'poll');
  const after = mergePollSnapshots(existing, incoming).filter(block => block.type === 'poll');
  // Re-collecting an identical result is not a content update, even after the deadline.
  return JSON.stringify(pollValue(before)) !== JSON.stringify(pollValue(after));
}
