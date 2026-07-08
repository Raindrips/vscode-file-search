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
        const uris = await vscode.workspace.findFiles(this.include, `{${this.exclude.join(',')}}`);

        this.items = uris.map((uri) => {
            const relativePath = vscode.workspace.asRelativePath(uri);
            const lastSlash = relativePath.lastIndexOf('/');
            return {
                label: lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath,
                description: lastSlash >= 0 ? relativePath.slice(0, lastSlash) : '',
                uri,
                iconPath: FileIconProvider.getIcon(uri)
            };
        });

        this.fuseTool.setCollection(this.items);
    }

    private setupWatcher() {
        this.watcher?.dispose();
        this.watcher = vscode.workspace.createFileSystemWatcher(this.include, false, false, false);

        this.watcher.onDidCreate((uri) => {
            if (this.shouldExclude(uri)) return;

            const relativePath = vscode.workspace.asRelativePath(uri);
            const lastSlash = relativePath.lastIndexOf('/');
            const item: FileItem = {
                label: lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath,
                description: lastSlash >= 0 ? relativePath.slice(0, lastSlash) : '',
                uri,
                
            };

            this.items.push(item);
            this.fuseTool.add(item);
        });

        this.watcher.onDidDelete((uri) => {
            this.items = this.items.filter((i) => i.uri!.fsPath !== uri.fsPath);
            this.fuseTool.remove((doc) => doc.uri!.fsPath === uri.fsPath);
        });

        this.watcher.onDidChange((uri) => {
            const item = this.items.find((i) => i.uri!.fsPath === uri.fsPath);
            if (!item) return;

            this.fuseTool.remove((doc) => doc.uri!.fsPath === uri.fsPath);
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
