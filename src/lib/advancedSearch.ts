import { docsForRecord } from "../data/documents";
import type { RegisterView } from "../data/registers";
import type { ProjectRecord } from "./types";

/**
 * Full-text super-search (deterministic, evidence-first — no LLM).
 * Searches record IDs (full + partial fragments like "IN" or "8" in
 * "AFO-IN-000008"), titles/metadata AND indexed document content
 * (explicitly tagged notes + reference rows via listRecords fields).
 *
 * Query language:
 * - space = AND, `OR` / `|` = OR, `-term` or `NOT term` = exclude
 * - `"quoted phrase"` = exact substring
 * - unquoted terms = case-insensitive substring; short tokens (<=2 chars
 *   or single digits) match IDs/codes only so "IN" does not match every
 *   "pending"/"timber" sentence.
 */

export interface SearchClause {
  include: string[];
  exclude: string[];
}

export interface SearchHit {
  record: ProjectRecord;
  score: number;
}

function extractPhrases(query: string): { phrases: string[]; rest: string } {
  const phrases: string[] = [];
  const rest = query.replace(/"([^"]+)"/g, (_match, inner: string) => {
    const value = String(inner).trim().toLowerCase();
    if (value !== "") phrases.push(value);
    return " ";
  });
  return { phrases, rest };
}

function cleanToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[-–—"'“”‘’([{<]+|[-–—"'“”‘’)\]}>.,;:!?]+$/g, "")
    .trim();
}

/** Split a query into OR groups of AND terms with exclusions. */
export function parseBooleanQuery(query: string): SearchClause[] {
  const { phrases, rest } = extractPhrases(query);
  const tokens = rest
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token !== "")
    .flatMap((token) => {
      if (/^\|+$/.test(token)) return ["OR"];
      // Keep ID shapes whole (AFO-IN-000008); split stray pipes only.
      if (token.includes("|")) return token.split("|").flatMap((part) => (part === "" ? ["OR"] : [part]));
      return [token];
    });

  const groups: string[][] = [[]];
  for (const token of tokens) {
    if (/^or$/i.test(token)) {
      groups.push([]);
    } else {
      groups[groups.length - 1]?.push(token);
    }
  }
  // Quoted phrases are AND-ed into every OR group.
  return groups
    .map((group) => {
      const include: string[] = [];
      const exclude: string[] = [];
      const terms = [...group, ...phrases];
      for (let i = 0; i < terms.length; i++) {
        const raw = terms[i] ?? "";
        if (/^not$/i.test(raw)) {
          const next = terms[i + 1];
          if (next !== undefined && next !== "") {
            const cleaned = cleanToken(next);
            if (cleaned !== "") exclude.push(cleaned);
          }
          i += 1;
          continue;
        }
        if (raw.startsWith("-") && raw.length > 1) {
          const cleaned = cleanToken(raw.slice(1));
          if (cleaned !== "") exclude.push(cleaned);
          continue;
        }
        const cleaned = cleanToken(raw);
        if (cleaned !== "") include.push(cleaned);
      }
      return { include, exclude };
    })
    .filter((clause) => clause.include.length > 0 || clause.exclude.length > 0);
}

/** Enough substance to count as a search (len>=2, a digit, or a phrase). */
export function queryHasSubstance(query: string): boolean {
  const { phrases, rest } = extractPhrases(query);
  if (phrases.length > 0) return true;
  const tokens = rest
    .split(/[\s,;]+/)
    .map(cleanToken)
    .filter((token) => token !== "" && !/^or$/i.test(token) && !/^not$/i.test(token) && token !== "-");
  return tokens.some((token) => token.length >= 2 || /\d/.test(token));
}

function idParts(id: string): string[] {
  return id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part !== "");
}

/** Score a single term against a record; 0 = no match. */
export function matchTerm(
  record: ProjectRecord,
  haystack: string,
  term: string
): number {
  const idLower = record.id.toLowerCase();
  const parts = idParts(record.id);
  const isPhrase = term.includes(" ");
  if (isPhrase) {
    if (haystack.includes(term)) return 5;
    if (idLower.includes(term.replace(/\s+/g, ""))) return 4;
    return 0;
  }
  // Short/digit fragments match IDs/codes only — never free prose.
  if (term.length <= 2 && !/\d/.test(term)) {
    if (parts.includes(term)) return 6;
    if (idLower.includes(term)) return 4;
    const codeFields = [
      record.fields["revision"] ?? "",
      record.fields["discipline"] ?? "",
      record.fields["mailType"] ?? ""
    ]
      .join(" ")
      .toLowerCase();
    if (codeFields !== "" && codeFields.includes(term)) return 3;
    return 0;
  }
  if (term.length === 1) {
    // Single digits match ID substrings only (e.g. "8" in "AFO-IN-000008").
    if (/\d/.test(term) && idLower.includes(term)) return 4;
    return 0;
  }
  if (idLower === term) return 10;
  if (parts.includes(term)) return 6;
  if (idLower.includes(term)) return 4;
  if (haystack.includes(term)) {
    const headline = [
      record.fields["title"] ?? "",
      record.fields["subject"] ?? "",
      record.fields["description"] ?? "",
      record.fields["activity"] ?? "",
      record.fields["material"] ?? ""
    ]
      .join(" ")
      .toLowerCase();
    if (headline.includes(term)) return 3;
    return 2;
  }
  return 0;
}

function haystackFor(record: ProjectRecord): string {
  const docs = docsForRecord(record.id)
    .map((doc) => `${doc.title} ${doc.text}`)
    .join(" ");
  return [
    record.id,
    record.status,
    record.location ?? "",
    record.sourceRef,
    Object.values(record.fields).join(" "),
    docs
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Full-text search over the scoped view. Returns matches with score > 0,
 * best first. Empty query or no substance -> [].
 */
export function advancedSearch(view: RegisterView, query: string): SearchHit[] {
  const clauses = parseBooleanQuery(query);
  if (clauses.length === 0) return [];
  const records = view.listRecords();
  const haystacks = new Map<string, string>();
  const keyOf = (record: ProjectRecord): string =>
    `${record.kind}‖${record.id.toUpperCase()}‖${(record.fields["revision"] ?? "").toUpperCase()}`;
  for (const record of records) haystacks.set(keyOf(record), haystackFor(record));

  const hits: SearchHit[] = [];
  for (const record of records) {
    const haystack = haystacks.get(keyOf(record)) ?? "";
    let best = 0;
    for (const clause of clauses) {
      if (clause.include.length === 0) continue;
      let excluded = false;
      for (const term of clause.exclude) {
        if (matchTerm(record, haystack, term) > 0) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;
      let total = 0;
      let matched = true;
      for (const term of clause.include) {
        const score = matchTerm(record, haystack, term);
        if (score <= 0) {
          matched = false;
          break;
        }
        total += score;
      }
      if (matched && total > best) best = total;
    }
    if (best > 0) hits.push({ record, score: best });
  }
  return hits.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
}
