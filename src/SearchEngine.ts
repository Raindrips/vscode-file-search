/**
 * Search engine behind the file search view.
 *
 * The module deliberately has no dependency on the `vscode` module so that it
 * can be exercised from plain Node.js. Fuzzy matching is implemented here
 * instead of relying on an external index.
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

interface Candidate<T> {
    item: T;
    score: number;
    order: number;
}

/** Orders candidates from best to worst. */
function isWorse<T extends SearchableFile>(a: Candidate<T>, b: Candidate<T>): boolean {
    if (a.score !== b.score) {
        return a.score < b.score;
    }
    if (a.item.label.length !== b.item.label.length) {
        return a.item.label.length > b.item.label.length;
    }
    if (a.item.relPath.length !== b.item.relPath.length) {
        return a.item.relPath.length > b.item.relPath.length;
    }
    return a.order > b.order;
}

function isBetter<T extends SearchableFile>(item: T, score: number, order: number, other: Candidate<T>): boolean {
    if (score !== other.score) {
        return score > other.score;
    }
    if (item.label.length !== other.item.label.length) {
        return item.label.length < other.item.label.length;
    }
    if (item.relPath.length !== other.item.relPath.length) {
        return item.relPath.length < other.item.relPath.length;
    }
    return order < other.order;
}

/** Bounded min-heap that keeps only the best `limit` candidates. */
class TopMatches<T extends SearchableFile> {
    private readonly heap: Candidate<T>[] = [];

    constructor(private readonly limit: number) {}

    push(item: T, score: number, order: number): void {
        if (this.limit <= 0) {
            return;
        }
        if (this.heap.length < this.limit) {
            this.heap.push({ item, score, order });
            this.siftUp(this.heap.length - 1);
            return;
        }
        if (!isBetter(item, score, order, this.heap[0])) {
            return;
        }
        this.heap[0] = { item, score, order };
        this.siftDown(0);
    }

    toArray(): Candidate<T>[] {
        return this.heap.slice().sort((a, b) => {
            if (isWorse(a, b)) {
                return 1;
            }
            if (isWorse(b, a)) {
                return -1;
            }
            return 0;
        });
    }

    private siftUp(start: number): void {
        let index = start;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!isWorse(this.heap[index], this.heap[parent])) {
                break;
            }
            [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
            index = parent;
        }
    }

    private siftDown(start: number): void {
        let index = start;
        const length = this.heap.length;
        for (;;) {
            const left = index * 2 + 1;
            const right = left + 1;
            let worst = index;
            if (left < length && isWorse(this.heap[left], this.heap[worst])) {
                worst = left;
            }
            if (right < length && isWorse(this.heap[right], this.heap[worst])) {
                worst = right;
            }
            if (worst === index) {
                return;
            }
            [this.heap[index], this.heap[worst]] = [this.heap[worst], this.heap[index]];
            index = worst;
        }
    }
}

export class SearchEngine<T extends SearchableFile> {
    private items: T[];
    private readonly lowerCache = new WeakMap<T, { label?: string; relPath?: string }>();

    constructor(items: T[] = []) {
        this.items = items;
    }

    get size(): number {
        return this.items.length;
    }

    setCollection(items: T[]): void {
        this.items = items;
    }

    add(item: T): void {
        this.items.push(item);
    }

    remove(predicate: (item: T) => boolean): void {
        this.items = this.items.filter((item) => !predicate(item));
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
        const tokens = query.split(/\s+/).filter((token) => token.length > 0);
        if (tokens.length === 0) {
            return { matches: [], truncated: false, invalidRegex: false };
        }
        const normalizedTokens = tokens.map((token) =>
            options.caseSensitive ? token : token.toLowerCase(),
        );
        const top = new TopMatches<T>(limit);
        let matchCount = 0;
        let order = 0;

        for (const item of this.items) {
            const text = options.caseSensitive
                ? options.matchPath
                    ? item.relPath
                    : item.label
                : this.lowerText(item, options.matchPath);

            let score = 0;
            let matched = true;
            for (const token of normalizedTokens) {
                const tokenScore = scoreToken(text, token);
                if (tokenScore === null) {
                    matched = false;
                    break;
                }
                score += tokenScore;
            }
            if (!matched) {
                continue;
            }

            matchCount += 1;
            top.push(item, score, order);
            order += 1;
        }

        const matches = top.toArray().map(({ item }) => {
            const text = options.matchPath ? item.relPath : item.label;
            const ranges = collectHighlightRanges(text, tokens, options.caseSensitive);
            return this.toSearchMatch(item, ranges, options.matchPath);
        });

        return { matches, truncated: matchCount > limit, invalidRegex: false };
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

    /** Caches lowercased names and paths on first use, per matching mode. */
    private lowerText(item: T, matchPath: boolean): string {
        let cached = this.lowerCache.get(item);
        if (!cached) {
            cached = {};
            this.lowerCache.set(item, cached);
        }
        if (matchPath) {
            if (cached.relPath === undefined) {
                cached.relPath = item.relPath.toLowerCase();
            }
            return cached.relPath;
        }
        if (cached.label === undefined) {
            cached.label = item.label.toLowerCase();
        }
        return cached.label;
    }
}

/**
 * Scores one whitespace-separated query token against a name or path.
 * Returns `null` when the token is neither a substring nor a subsequence.
 */
function scoreToken(text: string, token: string): number | null {
    if (text.length === 0 || token.length === 0) {
        return null;
    }

    let best: number | null = null;
    let index = text.indexOf(token);
    let occurrences = 0;
    while (index !== -1 && occurrences < 20) {
        let score = 1200;
        if (index === 0) {
            score += 400;
        } else if (isSeparator(text.charCodeAt(index - 1))) {
            score += 200;
        }
        score -= Math.min(index, 100) * 2;
        score -= text.length * 0.05;
        if (best === null || score > best) {
            best = score;
        }
        occurrences += 1;
        index = text.indexOf(token, index + 1);
    }
    if (best !== null) {
        return best;
    }

    let cursor = 0;
    let first = -1;
    let last = -1;
    for (let position = 0; position < text.length && cursor < token.length; position += 1) {
        if (text.charCodeAt(position) !== token.charCodeAt(cursor)) {
            continue;
        }
        if (first < 0) {
            first = position;
        }
        last = position;
        cursor += 1;
    }
    if (cursor < token.length) {
        return null;
    }

    const span = last - first + 1;
    let score = 700 - (span - token.length) * 8 - first * 3 - (text.length - token.length) * 0.1;
    if (first === 0) {
        score += 150;
    } else if (isSeparator(text.charCodeAt(first - 1))) {
        score += 80;
    }
    return score > 1 ? score : 1;
}

function isSeparator(code: number): boolean {
    return (
        code === 47 || // /
        code === 92 || // \
        code === 45 || // -
        code === 95 || // _
        code === 46 || // .
        code === 32 || // space
        code === 40 || // (
        code === 41 || // )
        code === 91 || // [
        code === 93 || // ]
        code === 64 // @
    );
}

/** Combines the highlight ranges of every query token. */
function collectHighlightRanges(
    text: string,
    tokens: readonly string[],
    caseSensitive: boolean,
): MatchRange[] {
    if (tokens.length === 1) {
        return highlightRanges(text, tokens[0], caseSensitive);
    }
    const ranges: MatchRange[] = [];
    for (const token of tokens) {
        for (const range of highlightRanges(text, token, caseSensitive)) {
            ranges.push(range);
        }
    }
    return normalizeRanges(ranges, text.length);
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

/**
 * Highlight ranges derived from the query itself. An exact substring is
 * preferred and a scattered subsequence is used only when there is no exact run.
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
