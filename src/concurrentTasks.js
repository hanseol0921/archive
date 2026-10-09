// Stop scheduling on failure, but settle every active task before rollback.
export async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  let failure;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await worker(items[index], index); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
  }));
  if (failed) throw failure;
  return results;
}
