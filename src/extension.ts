import * as vscode from 'vscode';
import { FuseTool, FileItem as BaseFIleItem } from './FuseTool';

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
            const fuseTool = new FuseTool(items);

            // 3. QuickPick UI
            const quickPick = vscode.window.createQuickPick<FileItem>();
            quickPick.placeholder = 'Search project files...';
            quickPick.items = items;

            // 使用自带的模糊搜索
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;

            // 4. 输入时实时过滤
            quickPick.onDidChangeValue((value) => {
                const results = fuseTool.search(value);
                quickPick.items = results;
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
