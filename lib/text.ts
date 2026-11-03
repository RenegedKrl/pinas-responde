// minúsculas + sem acento: "Análise" == "analise"
export function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function matchesKeyword(comment: string, keywords: string[]) {
  if (!keywords.length) return true;
  const c = normalize(comment);
  const words = c.split(/[^a-z0-9]+/).filter(Boolean);
  return keywords.some((k) => {
    const n = normalize(k);
    if (!n) return false;
    return n.includes(" ") ? c.includes(n) : words.includes(n);
  });
}

export function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}
