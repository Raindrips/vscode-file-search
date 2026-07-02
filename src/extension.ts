import * as vscode from 'vscode';
import Fuse = require('fuse.js');

interface FileItem extends vscode.QuickPickItem {
    uri: vscode.Uri;
}

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'projectFileSearch.search',
        async () => {
            // 1. 扫描项目文件
            const uris = await vscode.workspace.findFiles(
                '**/*',
                '**/node_modules/**',
            );

            const items: FileItem[] = uris.map((uri) => ({
                label: vscode.workspace.asRelativePath(uri),
                uri,
            }));

            // 2. 模糊搜索引擎
            const fuse = new Fuse(items, {
                keys: ['label'],
                threshold: 0.4,
                ignoreLocation: true
            });

            // 3. QuickPick UI
            const quickPick = vscode.window.createQuickPick<FileItem>();
            quickPick.placeholder = 'Search project files...';
            quickPick.items = items;

            // 使用自带的模糊搜索
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;

            // 4. 输入时实时过滤
            quickPick.onDidChangeValue((value) => {
                // quickPick.items = items;

                if (!value) {
                    quickPick.items = items;
                } else {
                    const results = fuse.search(value).map((r) => r.item);
                    quickPick.items = results;
                }
            });

            // 5. 打开文件
            quickPick.onDidAccept(() => {
                const item = quickPick.selectedItems[0];
                vscode.window.showTextDocument(item.uri);
                quickPick.hide();
            });

            quickPick.show();
        },
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
