import * as vscode from 'vscode';
import { FuseTool, FileItem } from './FuseTool';
import { minimatch } from 'minimatch';
import { FileIconProvider } from './FileIconProvider';

export class ProjectFileIndex {
    private items: FileItem[] = [];
    private fuseTool: FuseTool;
    private watcher: vscode.FileSystemWatcher | null = null;
    private initialized = false;

    private include: string;
    private exclude: string[];

    constructor() {
        // 支持用户自定义配置
        const config = vscode.workspace.getConfiguration(
            'projectFileSearch',
        );

        this.include = config.get<string>('include', '**/*');
        this.exclude = config.get<string[]>('exclude', [
            '**/node_modules/**',
            "**/.git/**",
        ]);

        this.fuseTool = new FuseTool([]);
    }

    async init() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        await this.buildIndex();
        this.setupWatcher();
        this.setupConfigListener();
    }

    private async buildIndex() {
        const excludeGlob = this.exclude.join(',');

        const uris = await vscode.workspace.findFiles(this.include, `{${this.exclude.join(',')}}`);

        this.items = uris.map((uri) => ({
            label: vscode.workspace.asRelativePath(uri),
            uri,
            iconPath: FileIconProvider.getIcon(uri)
        }));

        this.fuseTool.setCollection(this.items);
    }

    private setupWatcher() {
        this.watcher?.dispose();
        this.watcher = vscode.workspace.createFileSystemWatcher(this.include, false, false, false);

        this.watcher.onDidCreate((uri) => {
            if (this.shouldExclude(uri)) return;

            const item: FileItem = {
                label: vscode.workspace.asRelativePath(uri),
                uri,
            };

            this.items.push(item);
            this.fuseTool.add(item);
        });

        this.watcher.onDidDelete((uri) => {
            const label = vscode.workspace.asRelativePath(uri);
            this.items = this.items.filter((i) => i.label !== label);
            this.fuseTool.remove((doc) => doc.label === label);
        });

        this.watcher.onDidChange((uri) => {
            const label = vscode.workspace.asRelativePath(uri);
            const item = this.items.find((i) => i.label === label);
            if (!item) return;

            item.label = label;
            this.fuseTool.remove((doc) => doc.uri.fsPath === uri.fsPath);
            this.fuseTool.add(item);
        });
    }

    private setupConfigListener() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('projectFileSearch')) {
                const config = vscode.workspace.getConfiguration(
                    'projectFileSearch',
                );

                this.include = config.get<string>('include', '**/*');
                this.exclude = config.get<string[]>('exclude', [
                    '**/node_modules/**',
                ]);

                this.rebuild();
            }
        });
    }

    private async rebuild() {
        await this.buildIndex();
        this.setupWatcher();
    }

    private shouldExclude(uri: vscode.Uri): boolean {
        const relative = vscode.workspace.asRelativePath(uri);
        return this.exclude.some((pattern) =>
            minimatch(relative, pattern),
        );
    }

    search(query: string): FileItem[] {
        if (!query) return this.items;
        return this.fuseTool.search(query);
    }

    getAll(): FileItem[] {
        return this.items;
    }

    dispose() {
        this.watcher?.dispose();
    }
}
