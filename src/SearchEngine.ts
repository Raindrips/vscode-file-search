/**
 * Search engine behind the file search view.
 *
 * The module deliberately has no dependency on the `vscode` module so that it
 * can be exercised from plain Node.js.
 */

export interface SearchableFile {
    /** File name, e.g. `index.ts`. */
    label: string;
    /** Folder part of the path relative to the workspace, `''` for workspace roots. */
    description: string;
    /**
     * Relative path of the file: `description` and `label` joined with `/`.
     * This is what `matchPath` searches against.
     */
    relPath: string;
}

/** Inclusive `[start, end]` character range. */
export type MatchRange = readonly [start: number, end: number];

export interface SearchOptions {
    /** Match the case of the query exactly. */
    caseSensitive: boolean;
    /** Treat the query as a JavaScript regular expression. */
    regex: boolean;
    /** Match against the relative path instead of the file name only. */
    matchPath: boolean;
}

export interface SearchMatch<T extends SearchableFile = SearchableFile> {
    item: T;
    /** Inclusive ranges to highlight inside `item.label`. */
    nameMatches: MatchRange[];
    /** Inclusive ranges to highlight inside `item.description`. */
    dirMatches: MatchRange[];
}

export interface SearchOutcome<T extends SearchableFile = SearchableFile> {
    matches: SearchMatch<T>[];
    /** `true` when more matches exist than the requested limit. */
    truncated: boolean;
    /** `true` when `options.regex` is set and the query is not a valid expression. */
    invalidRegex: boolean;
}

interface RawFuseMatch {
    key?: string;
    indices: ReadonlyArray<MatchRange>;
}

interface RawFuseResult<T> {
    item: T;
    refIndex: number;
    matches?: ReadonlyArray<RawFuseMatch>;
}

interface FuseInstance<T> {
    search(pattern: string): RawFuseResult<T>[];
    setCollection(items: readonly T[]): void;
    add(item: T): void;
    remove(predicate: (item: T, index: number) => boolean): void;
}

interface FuseConstructor {
    new <T>(list: readonly T[], options: Record<string, unknown>): FuseInstance<T>;
}

// fuse.js v6 is published as a CommonJS module whose `module.exports` is the
// constructor itself (there is no `default` export), hence the plain require.
const Fuse = require('fuse.js') as FuseConstructor;

export class SearchEngine<T extends SearchableFile> {
    private items: T[];
    private fuse: FuseInstance<T> | undefined;
    private fuseKey = '';

    constructor(items: T[] = []) {
        this.items = items;
    }

    get size(): number {
        return this.items.length;
    }

    setCollection(items: T[]): void {
        this.items = items;
        this.fuse?.setCollection(items);
    }

    add(item: T): void {
        this.items.push(item);
        this.fuse?.add(item);
    }

    remove(predicate: (item: T) => boolean): void {
        this.items = this.items.filter((item) => !predicate(item));
        this.fuse?.remove(predicate);
    }

    /**
     * @param query User query. An empty query always produces no matches; the
     * view shows its welcome state instead.
     * @param limit Maximum number of matches to return.
     */
    search(query: string, options: SearchOptions, limit: number): SearchOutcome<T> {
        const max = Math.max(1, Math.floor(limit));
        if (query.length === 0) {
            return { matches: [], truncated: false, invalidRegex: false };
        }
        return options.regex
            ? this.searchWithRegex(query, options, max)
            : this.searchFuzzy(query, options, max);
    }

    private searchFuzzy(query: string, options: SearchOptions, limit: number): SearchOutcome<T> {
        const results = this.ensureFuse(options).search(query);
        // Fuse treats a case difference as a small fuzzy error, so `isCaseSensitive`
        // alone still lets `file` match `File`. Filtering on a case-exact
        // subsequence makes the toggle mean what its label promises.
        const filtered = options.caseSensitive
            ? results.filter((result) =>
                  containsSubsequence(
                      options.matchPath ? result.item.relPath : result.item.label,
                      query,
                  ),
              )
            : results;
        const truncated = filtered.length > limit;
        const visible = truncated ? filtered.slice(0, limit) : filtered;
        const matches = visible.map((result) => {
            // Fuse's own ranges scatter across the whole value, so highlights are
            // derived from the query instead: substring first, then subsequence.
            const text = options.matchPath ? result.item.relPath : result.item.label;
            const ranges = highlightRanges(text, query, options.caseSensitive);
            return this.toSearchMatch(result.item, ranges, options.matchPath);
        });
        return { matches, truncated, invalidRegex: false };
    }

    private searchWithRegex(query: string, options: SearchOptions, limit: number): SearchOutcome<T> {
        let regex: RegExp;
        try {
            regex = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
        } catch {
            return { matches: [], truncated: false, invalidRegex: true };
        }

        const found: SearchMatch<T>[] = [];
        for (const item of this.items) {
            const text = options.matchPath ? item.relPath : item.label;
            const scanned = scanRegex(regex, text);
            if (!scanned.matched) {
                continue;
            }
            found.push(this.toSearchMatch(item, scanned.ranges, options.matchPath));
        }

        found.sort(compareMatches);
        const truncated = found.length > limit;
        return {
            matches: truncated ? found.slice(0, limit) : found,
            truncated,
            invalidRegex: false,
        };
    }

    private toSearchMatch(item: T, ranges: readonly MatchRange[], matchPath: boolean): SearchMatch<T> {
        if (!matchPath) {
            return {
                item,
                nameMatches: normalizeRanges(ranges, item.label.length),
                dirMatches: [],
            };
        }
        const split = splitPathRanges(item, ranges);
        return { item, nameMatches: split.nameMatches, dirMatches: split.dirMatches };
    }

    /** Creates (or reuses) a Fuse instance for the given matching mode. */
    private ensureFuse(options: SearchOptions): FuseInstance<T> {
        const key = `${options.caseSensitive ? 'case' : 'nocase'}:${options.matchPath ? 'path' : 'name'}`;
        if (!this.fuse || this.fuseKey !== key) {
            this.fuse = new Fuse(this.items, {
                keys: [options.matchPath ? 'relPath' : 'label'],
                threshold: 0.35,
                ignoreLocation: true,
                minMatchCharLength: 1,
                isCaseSensitive: options.caseSensitive,
                shouldSort: true,
            });
            this.fuseKey = key;
        }
        return this.fuse;
    }
}

/**
 * Maps inclusive ranges expressed in `relPath` coordinates onto the file name
 * and its folder part.
 */
export function splitPathRanges(
    item: SearchableFile,
    ranges: readonly MatchRange[],
): { nameMatches: MatchRange[]; dirMatches: MatchRange[] } {
    const pathLength = item.relPath.length;
    const nameStart = pathLength - item.label.length;
    const dirLength = item.description.length;
    const nameMatches: MatchRange[] = [];
    const dirMatches: MatchRange[] = [];

    for (const [rawStart, rawEnd] of ranges) {
        const start = Math.max(0, rawStart);
        const end = Math.min(pathLength - 1, rawEnd);
        if (start > end) {
            continue;
        }
        if (end < nameStart) {
            // Entirely inside the folder part (the trailing `/` is dropped).
            const clippedEnd = Math.min(end, dirLength - 1);
            if (clippedEnd >= start) {
                dirMatches.push([start, clippedEnd]);
            }
        } else if (start >= nameStart) {
            nameMatches.push([start - nameStart, end - nameStart]);
        } else {
            // Straddles the `/` between folder and file name.
            const clippedEnd = Math.min(end, dirLength - 1);
            if (clippedEnd >= start) {
                dirMatches.push([start, clippedEnd]);
            }
            nameMatches.push([0, end - nameStart]);
        }
    }

    return {
        nameMatches: normalizeRanges(nameMatches, item.label.length),
        dirMatches: normalizeRanges(dirMatches, dirLength),
    };
}

/** Clamps, sorts and merges inclusive ranges so highlighting stays simple. */
export function normalizeRanges(ranges: readonly MatchRange[], length: number): MatchRange[] {
    if (length <= 0) {
        return [];
    }
    const cleaned: MatchRange[] = [];
    for (const [rawStart, rawEnd] of ranges) {
        const start = Math.max(0, rawStart);
        const end = Math.min(length - 1, rawEnd);
        if (start <= end) {
            cleaned.push([start, end]);
        }
    }
    if (cleaned.length <= 1) {
        return cleaned;
    }
    cleaned.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: MatchRange[] = [];
    for (const range of cleaned) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1] + 1) {
            merged[merged.length - 1] = [last[0], Math.max(last[1], range[1])];
        } else {
            merged.push(range);
        }
    }
    return merged;
}

/** Case-exact in-order character match, used to enforce "Match Case" in fuzzy mode. */
function containsSubsequence(text: string, query: string): boolean {
    let cursor = 0;
    for (let index = 0; index < text.length && cursor < query.length; index += 1) {
        if (text[index] === query[cursor]) {
            cursor += 1;
        }
    }
    return cursor === query.length;
}

/**
 * Highlight ranges derived from the query itself. Fuse's own indices scatter
 * across the whole value, so an exact substring is preferred and a scattered
 * subsequence is used only when the fuzzy match has no exact run.
 */
function highlightRanges(text: string, query: string, caseSensitive: boolean): MatchRange[] {
    const exact = substringRanges(text, query, caseSensitive);
    if (exact.length > 0) {
        return exact;
    }
    return subsequenceRanges(text, query, caseSensitive);
}

/** Every exact occurrence of `query` in `text`, in inclusive coordinates. */
function substringRanges(text: string, query: string, caseSensitive: boolean): MatchRange[] {
    if (query.length === 0) {
        return [];
    }
    const haystack = caseSensitive ? text : text.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const ranges: MatchRange[] = [];
    let index = haystack.indexOf(needle);
    while (index !== -1 && ranges.length < 50) {
        ranges.push([index, index + needle.length - 1]);
        index = haystack.indexOf(needle, index + needle.length);
    }
    return ranges;
}

/** Scattered in-order matches, merged where the query hits adjacent characters. */
function subsequenceRanges(text: string, query: string, caseSensitive: boolean): MatchRange[] {
    if (query.length === 0) {
        return [];
    }
    const haystack = caseSensitive ? text : text.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const ranges: MatchRange[] = [];
    let cursor = 0;
    for (let index = 0; index < haystack.length && cursor < needle.length; index += 1) {
        if (haystack[index] !== needle[cursor]) {
            continue;
        }
        const last = ranges[ranges.length - 1];
        if (last && last[1] + 1 === index) {
            ranges[ranges.length - 1] = [last[0], index];
        } else {
            ranges.push([index, index]);
        }
        cursor += 1;
    }
    return cursor === needle.length ? ranges : [];
}

function scanRegex(regex: RegExp, text: string): { matched: boolean; ranges: MatchRange[] } {
    const ranges: MatchRange[] = [];
    let matched = false;
    regex.lastIndex = 0;
    let result: RegExpExecArray | null;
    while ((result = regex.exec(text)) !== null) {
        matched = true;
        if (result[0].length > 0) {
            ranges.push([result.index, result.index + result[0].length - 1]);
        } else {
            // Zero-length match: move forward so the loop terminates.
            regex.lastIndex = result.index + 1;
        }
        if (ranges.length >= 200) {
            break;
        }
    }
    return { matched, ranges };
}

function compareMatches<T extends SearchableFile>(a: SearchMatch<T>, b: SearchMatch<T>): number {
    const aInName = a.nameMatches.length > 0 ? 0 : 1;
    const bInName = b.nameMatches.length > 0 ? 0 : 1;
    if (aInName !== bInName) {
        return aInName - bInName;
    }
    if (a.item.label.length !== b.item.label.length) {
        return a.item.label.length - b.item.label.length;
    }
    return a.item.relPath.length - b.item.relPath.length;
}
