import * as vscode from 'vscode';
import { ProjectFileIndex } from './ProjectFileIndex';

export async function activate(context: vscode.ExtensionContext) {

    const index = new ProjectFileIndex();
    await index.init();

    const disposable = vscode.commands.registerCommand('projectFileSearch.search', async () => {

        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Search project files...';

        quickPick.items = index.getAll().map(i => ({
            label: i.label,
            // detail: i.uri.fsPath
        }));

        quickPick.onDidChangeValue(value => {
            const results = index.search(value);
            quickPick.items = results.map(i => ({
                label: i.label,
                // detail: i.uri.fsPath
            }));
        });

        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            const file = index.getAll().find(i => i.label === selected.label);
            if (file) vscode.window.showTextDocument(file.uri);
            quickPick.hide();
        });

        quickPick.show();
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push({ dispose: () => index.dispose() });
}

export function deactivate() {}
