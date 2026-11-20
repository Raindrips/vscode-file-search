import * as vscode from 'vscode';
import { FileItem, ProjectFileIndex } from './ProjectFileIndex';
import { SearchMatch, SearchOptions } from './SearchEngine';
import { getWebviewHtml } from './WebviewHtml';

interface PersistedState {
    query: string;
    options: SearchOptions;
}

interface ResultPayload {
    fsPath: string;
    relPath: string;
    name: string;
    dir: string;
    icon: string;
    color: string;
    nameMatches: ReadonlyArray<readonly [number, number]>;
    dirMatches: ReadonlyArray<readonly [number, number]>;
}

const STATE_KEY = 'fileSearch.state';
const DEFAULT_OPTIONS: SearchOptions = {
    caseSensitive: false,
    regex: false,
    matchPath: false,
};

const MAX_RESULTS_DEFAULT = 300;
const MIN_RESULTS = 10;
const MAX_RESULTS_CAP = 2000;

/**
 * Hosts the search webview. The webview owns the query and the toggles; the
 * extension owns the file index and answers `search` messages.
 */
export class FileSearchViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'projectFileSearch.filesView';

    private view: vscode.WebviewView | undefined;
    private ready = false;
    private lastQuery = '';
    private lastOptions: SearchOptions = { ...DEFAULT_OPTIONS };
    private saveTimer: ReturnType<typeof setTimeout> | undefined;
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly index: ProjectFileIndex,
        private readonly context: vscode.ExtensionContext,
    ) {
        const saved = context.workspaceState.get<PersistedState>(STATE_KEY);
        if (saved) {
            this.lastQuery = typeof saved.query === 'string' ? saved.query : '';
            this.lastOptions = normalizeOptions(saved.options);
        }
        this.disposables.push(
            this.index.onDidChange(() => this.scheduleRefresh()),
        );
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        this.ready = false;

        const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [mediaRoot],
        };
        webviewView.webview.html = getWebviewHtml({
            styleUri: webviewView.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'search.css')),
            scriptUri: webviewView.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'search.js')),
            cspSource: webviewView.webview.cspSource,
        });

        this.disposables.push(
            webviewView.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
            webviewView.onDidDispose(() => {
                if (this.view === webviewView) {
                    this.view = undefined;
                    this.ready = false;
                }
            }),
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible && this.ready) {
                    this.focusInput();
                }
            }),
        );
    }

    /** Moves keyboard focus into the search box. */
    focusInput(): void {
        if (!this.view || !this.ready) {
            // The webview focuses its input as soon as it reports `ready`.
            return;
        }
        void this.view.webview.postMessage({ type: 'focus' });
    }

    dispose(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = undefined;
        }
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
        this.flushState();
    }

    private handleMessage(raw: unknown): void {
        if (!raw || typeof raw !== 'object') {
            return;
        }
        const message = raw as Record<string, unknown>;
        switch (message.type) {
            case 'ready':
                this.handleReady();
                break;
            case 'search':
                this.handleSearch(message);
                break;
            case 'open':
                void this.openFile(message.fsPath, message.side);
                break;
            case 'reveal':
                void this.revealFile(message.fsPath);
                break;
            case 'copyPath':
                void this.copyPath(message.fsPath, message.absolute);
                break;
            case 'openSettings':
                void vscode.commands.executeCommand('workbench.action.openSettings', 'projectFileSearch');
                break;
            case 'dismiss':
                void vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
                break;
            default:
                break;
        }
    }

    private handleReady(): void {
        this.ready = true;
        if (!this.view) {
            return;
        }
        const state = this.index.state;
        void this.view.webview.postMessage({
            type: 'init',
            query: this.lastQuery,
            options: this.lastOptions,
            maxResults: this.getMaxResults(),
            indexing: state.building,
            fileCount: state.fileCount,
        });
        this.focusInput();
    }

    private handleSearch(message: Record<string, unknown>): void {
        this.lastQuery = typeof message.query === 'string' ? message.query : '';
        this.lastOptions = normalizeOptions(message.options);
        this.scheduleSave();
        this.postResults(
            typeof message.requestId === 'number' && Number.isFinite(message.requestId)
                ? message.requestId
                : 0,
        );
    }

    private postResults(requestId: number): void {
        if (!this.view || !this.ready) {
            return;
        }
        const limit = this.getMaxResults();
        const outcome = this.index.search(this.lastQuery, this.lastOptions, limit);
        const payload = {
            type: 'results',
            requestId,
            query: this.lastQuery,
            results: outcome.matches.map((match) => toPayload(match)),
            truncated: outcome.truncated,
            invalidRegex: outcome.invalidRegex,
            indexing: this.index.state.building,
            fileCount: this.index.state.fileCount,
            maxResults: limit,
        };
        void this.view.webview.postMessage(payload);
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            this.postResults(0);
        }, 180);
    }

    private scheduleSave(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = undefined;
            this.flushState();
        }, 300);
    }

    private flushState(): void {
        const state: PersistedState = {
            query: this.lastQuery,
            options: this.lastOptions,
        };
        void this.context.workspaceState.update(STATE_KEY, state);
    }

    private getMaxResults(): number {
        const value = vscode.workspace
            .getConfiguration('projectFileSearch')
            .get<number>('maxResults', MAX_RESULTS_DEFAULT);
        if (!Number.isFinite(value)) {
            return MAX_RESULTS_DEFAULT;
        }
        return Math.min(MAX_RESULTS_CAP, Math.max(MIN_RESULTS, Math.floor(value)));
    }

    private async openFile(rawPath: unknown, side: unknown): Promise<void> {
        if (typeof rawPath !== 'string' || rawPath.length === 0) {
            return;
        }
        const uri = vscode.Uri.file(rawPath);
        const options: vscode.TextDocumentShowOptions =
            side === true
                ? { viewColumn: vscode.ViewColumn.Beside, preview: false }
                : { preview: true };
        try {
            await vscode.commands.executeCommand('vscode.open', uri, options);
        } catch (error) {
            void vscode.window.showErrorMessage(
                `File Search: unable to open "${rawPath}". ${describeError(error)}`,
            );
        }
    }

    private async revealFile(rawPath: unknown): Promise<void> {
        if (typeof rawPath !== 'string' || rawPath.length === 0) {
            return;
        }
        try {
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(rawPath));
        } catch (error) {
            void vscode.window.showErrorMessage(
                `File Search: unable to reveal "${rawPath}". ${describeError(error)}`,
            );
        }
    }

    private async copyPath(rawPath: unknown, absolute: unknown): Promise<void> {
        if (typeof rawPath !== 'string' || rawPath.length === 0) {
            return;
        }
        const uri = vscode.Uri.file(rawPath);
        const text = absolute === true ? rawPath : vscode.workspace.asRelativePath(uri);
        await vscode.env.clipboard.writeText(text);
    }
}

function toPayload(match: SearchMatch<FileItem>): ResultPayload {
    const item = match.item;
    return {
        fsPath: item.fsPath,
        relPath: item.relPath,
        name: item.label,
        dir: item.description,
        icon: item.icon.kind,
        color: item.icon.color,
        nameMatches: match.nameMatches,
        dirMatches: match.dirMatches,
    };
}

function normalizeOptions(value: unknown): SearchOptions {
    const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    return {
        caseSensitive: source.caseSensitive === true,
        regex: source.regex === true,
        matchPath: source.matchPath === true,
    };
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
