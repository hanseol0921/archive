export function photoDetailPath(id, isAdmin = false) {
  if (id == null || String(id).trim() === "") return null;
  const query = new URLSearchParams({ photo: String(id) });
  return `${isAdmin ? "/admin" : "/photos"}?${query}`;
}

export function reportTargetPath(report) {
  if (report.target_type === "photo") return photoDetailPath(report.target_id, true);
  return report.page_url || null;
}
