export function matchesVideoContent(query, ...values) {
  const terms = String(query || "").normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = values.flat(Infinity).map((value) => String(value ?? "")).join(" ").normalize("NFKC").toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}
