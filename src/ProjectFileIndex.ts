import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { SearchEngine, SearchOptions, SearchOutcome, SearchableFile } from './SearchEngine';

export interface FileItem extends SearchableFile {
    /** Absolute path on disk. */
    fsPath: string;
}

export interface IndexState {
    /** `true` while the workspace is being scanned. */
    building: boolean;
    /** Number of indexed files. */
    fileCount: number;
}

const DEFAULT_INCLUDE = ['**/*'];
const DEFAULT_EXCLUDE = [
    // Dependencies and version-control metadata
    '**/node_modules/**',
    '**/bower_components/**',
    '**/.git/**',
    '**/.svn/**',
    '**/.hg/**',
    // IDE metadata
    '**/.idea/**',
    '**/.vs/**',
    // Python caches and virtual environments
    '**/__pycache__/**',
    '**/.pytest_cache/**',
    '**/.mypy_cache/**',
    '**/.ruff_cache/**',
    '**/.tox/**',
    '**/.venv/**',
    // JVM build caches
    '**/.gradle/**',
    // JS/TS framework and monorepo caches
    '**/.next/**',
    '**/.nuxt/**',
    '**/.svelte-kit/**',
    '**/.angular/**',
    '**/.turbo/**',
    '**/.nx/**',
    '**/.parcel-cache/**',
    // Package-manager metadata
    '**/.yarn/**',
    // Infrastructure state
    '**/.terraform/**',
    // Apple toolchain output
    '**/Pods/**',
    '**/DerivedData/**',
    // OS metadata files
    '**/.DS_Store',
    '**/Thumbs.db',
];

/**
 * Keeps an up-to-date list of the files in the workspace and answers file name
 * searches against it.
 */
export class ProjectFileIndex implements vscode.Disposable {
    private items: FileItem[] = [];
    private readonly paths = new Set<string>();
    private readonly engine = new SearchEngine<FileItem>();
    private watcher: vscode.FileSystemWatcher | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private include: string[] = DEFAULT_INCLUDE.slice();
    private exclude: string[] = DEFAULT_EXCLUDE.slice();
    private building = false;
    private started = false;
    private rebuildQueued = false;
    private changeTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly output: vscode.OutputChannel = vscode.window.createOutputChannel('File Search');
    private readonly changeEmitter = new vscode.EventEmitter<IndexState>();

    /** Fires when the index starts building, finishes, or changes on disk. */
    readonly onDidChange = this.changeEmitter.event;

    constructor() {
        this.readConfiguration();
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (!this.started) {
                    return;
                }
                if (
                    event.affectsConfiguration('projectFileSearch.include') ||
                    event.affectsConfiguration('projectFileSearch.exclude')
                ) {
                    void this.rebuild();
                }
            }),
        );
    }

    get state(): IndexState {
        return { building: this.building, fileCount: this.items.length };
    }

    /**
     * Starts the initial index build on first demand (the view becomes visible).
     * Activation alone does not scan the workspace.
     */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        void this.init();
    }

    /** Builds the initial index. Never throws; failures are reported. */
    async init(): Promise<void> {
        await this.rebuild();
    }

    /** Rebuilds the index from scratch, watching the new configuration. */
    async rebuild(): Promise<void> {
        this.started = true;
        if (this.building) {
            this.rebuildQueued = true;
            return;
        }
        this.building = true;
        this.readConfiguration();
        this.setupWatcher();
        this.fireChange();

        try {
            const include = this.globOf(this.include) ?? '**/*';
            const exclude = this.globOf(this.exclude);
            const uris = await vscode.workspace.findFiles(include, exclude);
            const items = uris.map((uri) => this.createItem(uri));
            this.items = items;
            this.paths.clear();
            for (const item of items) {
                this.paths.add(item.fsPath);
            }
            this.engine.setCollection(items);
        } catch (error) {
            this.output.appendLine(`[error] Failed to index workspace files: ${describeError(error)}`);
            void vscode.window.showErrorMessage(
                'File Search: failed to index workspace files. See the "File Search" output channel for details.',
            );
        } finally {
            this.building = false;
            this.fireChange();
            if (this.rebuildQueued) {
                this.rebuildQueued = false;
                void this.rebuild();
            }
        }
    }

    search(query: string, options: SearchOptions, limit: number): SearchOutcome<FileItem> {
        return this.engine.search(query, options, limit);
    }

    dispose(): void {
        if (this.changeTimer) {
            clearTimeout(this.changeTimer);
            this.changeTimer = undefined;
        }
        this.watcher?.dispose();
        this.watcher = undefined;
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.changeEmitter.dispose();
        this.output.dispose();
    }

    private readConfiguration(): void {
        const config = vscode.workspace.getConfiguration('projectFileSearch');
        this.include = sanitizePatterns(config.get<string[]>('include', DEFAULT_INCLUDE), DEFAULT_INCLUDE);
        this.exclude = sanitizePatterns(config.get<string[]>('exclude', DEFAULT_EXCLUDE), []);
    }

    private setupWatcher(): void {
        this.watcher?.dispose();
        this.watcher = undefined;
        try {
            this.watcher = vscode.workspace.createFileSystemWatcher(
                this.globOf(this.include) ?? '**/*',
                false,
                true,
                false,
            );
        } catch (error) {
            this.output.appendLine(`[error] Failed to watch workspace files: ${describeError(error)}`);
            return;
        }
        this.watcher.onDidCreate((uri) => void this.handleCreate(uri));
        this.watcher.onDidDelete((uri) => this.handleDelete(uri));
    }

    private async handleCreate(uri: vscode.Uri): Promise<void> {
        if (this.shouldExclude(uri) || !this.matchesInclude(uri)) {
            return;
        }
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            // The watcher also reports directories; only files belong in the index.
            if ((stat.type & vscode.FileType.File) === 0) {
                return;
            }
        } catch {
            return;
        }
        if (this.paths.has(uri.fsPath)) {
            return;
        }
        const item = this.createItem(uri);
        this.items.push(item);
        this.paths.add(item.fsPath);
        this.engine.add(item);
        this.scheduleChange();
    }

    private handleDelete(uri: vscode.Uri): void {
        if (!this.paths.delete(uri.fsPath)) {
            return;
        }
        this.items = this.items.filter((item) => item.fsPath !== uri.fsPath);
        this.engine.remove((item) => item.fsPath === uri.fsPath);
        this.scheduleChange();
    }

    private createItem(uri: vscode.Uri): FileItem {
        const relPath = this.relativePath(uri);
        const slash = relPath.lastIndexOf('/');
        const label = slash >= 0 ? relPath.slice(slash + 1) : relPath;
        const description = slash >= 0 ? relPath.slice(0, slash) : '';
        return {
            label,
            description,
            relPath,
            fsPath: uri.fsPath,
        };
    }

    private relativePath(uri: vscode.Uri): string {
        return vscode.workspace.asRelativePath(uri).replace(/\\/g, '/');
    }

    private matchesInclude(uri: vscode.Uri): boolean {
        if (this.include.length === 0) {
            return true;
        }
        const relative = this.relativePath(uri);
        return this.include.some((pattern) => minimatch(relative, pattern, { dot: true }));
    }

    private shouldExclude(uri: vscode.Uri): boolean {
        if (this.exclude.length === 0) {
            return false;
        }
        const relative = this.relativePath(uri);
        return this.exclude.some((pattern) => minimatch(relative, pattern, { dot: true }));
    }

    private scheduleChange(): void {
        if (this.changeTimer) {
            clearTimeout(this.changeTimer);
        }
        this.changeTimer = setTimeout(() => {
            this.changeTimer = undefined;
            this.fireChange();
        }, 150);
    }

    private fireChange(): void {
        this.changeEmitter.fire({ building: this.building, fileCount: this.items.length });
    }

    /** Combines several glob patterns into one brace pattern. */
    private globOf(patterns: string[]): string | undefined {
        const cleaned = patterns.filter((pattern) => typeof pattern === 'string' && pattern.trim().length > 0);
        if (cleaned.length === 0) {
            return undefined;
        }
        return cleaned.length === 1 ? cleaned[0] : `{${cleaned.join(',')}}`;
    }
}

function sanitizePatterns(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) {
        return fallback.slice();
    }
    const patterns = value.filter(
        (pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0,
    );
    return fallback.length > 0 && patterns.length === 0 ? fallback.slice() : patterns;
}

function describeError(error: unknown): string {
    return error instanceof Error ? `${error.message}` : String(error);
}
