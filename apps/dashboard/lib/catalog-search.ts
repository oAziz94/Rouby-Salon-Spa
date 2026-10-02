/**
 * Front-desk catalog search (spec v2 §3a).
 *
 * One query matches English names, Arabic names, aliases, category and variant
 * names. Word-start matches rank first, then substrings, then one-typo matches
 * for words of five letters or more. Arabic is matched insensitive to hamza
 * forms, ta-marbuta/ha, alef-maqsura/ya and tashkeel.
 */

const TASHKEEL = /[ً-ْٰـ]/g;

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(TASHKEEL, "")
    .replace(/[آأإٱ]/g, "ا") // آ أ إ ٱ → ا
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  const n = normalizeSearchText(input);
  return n ? n.split(" ") : [];
}

/** Levenshtein distance capped at 2 (enough for "one typo" checks). */
function editDistanceAtMost2(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > 2) return 3;
    prev.splice(0, prev.length, ...cur);
    cur = [];
  }
  return prev[b.length];
}

export type SearchableEntry = {
  /** Primary name (English). */
  name: string;
  nameAr?: string | null;
  aliases?: string[] | null;
  /** Extra terms such as category name or variant names. */
  extraTerms?: string[];
};

/**
 * Score an entry against a query. 0 = no match. Every query token must match
 * at least one term of the entry; higher is better.
 */
export function scoreEntry(entry: SearchableEntry, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 1;
  const primaryWords = tokenize(entry.name);
  const secondaryWords = [
    ...tokenize(entry.nameAr ?? ""),
    ...(entry.aliases ?? []).flatMap((a) => tokenize(a)),
  ];
  const extraWords = (entry.extraTerms ?? []).flatMap((t) => tokenize(t));
  const primaryJoined = primaryWords.join(" ");
  const secondaryJoined = secondaryWords.join(" ");

  let total = 0;
  for (const q of queryTokens) {
    let best = 0;
    // Whole-phrase prefix on the primary name is the strongest signal.
    if (primaryJoined.startsWith(q)) best = Math.max(best, 6);
    if (secondaryJoined.startsWith(q)) best = Math.max(best, 5);
    const check = (words: string[], base: number) => {
      for (const w of words) {
        if (w === q) best = Math.max(best, base + 2);
        else if (w.startsWith(q)) best = Math.max(best, base + 1);
        else if (q.length >= 3 && w.includes(q)) best = Math.max(best, base);
        else if (q.length >= 5 && w.length >= 5 && editDistanceAtMost2(w, q) <= 1) {
          best = Math.max(best, Math.max(1, base - 1));
        }
      }
    };
    check(primaryWords, 3);
    check(secondaryWords, 3);
    check(extraWords, 1);
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export function rankEntries<T extends SearchableEntry>(
  entries: T[],
  query: string,
  tieBreak?: (a: T, b: T) => number,
): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return entries.slice();
  return entries
    .map((e) => ({ e, s: scoreEntry(e, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (tieBreak ? tieBreak(a.e, b.e) : 0))
    .map((x) => x.e);
}
