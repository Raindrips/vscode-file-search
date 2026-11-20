import * as vscode from 'vscode';
import { FileSearchViewProvider } from './FileSearchViewProvider';
import { ProjectFileIndex } from './ProjectFileIndex';

export function activate(context: vscode.ExtensionContext): void {
    const index = new ProjectFileIndex();
    const provider = new FileSearchViewProvider(context.extensionUri, index, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(FileSearchViewProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.commands.registerCommand('projectFileSearch.search', () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                void vscode.window.showInformationMessage(
                    'File Search: open a folder before searching for files.',
                );
                return;
            }
            void vscode.commands.executeCommand('projectFileSearch.filesView.focus');
            provider.focusInput();
        }),
        vscode.commands.registerCommand('projectFileSearch.refresh', () => {
            void index.rebuild();
        }),
        provider,
        index,
    );

    // Indexing runs in the background so the extension host never blocks on it.
    void index.init();
}

export function deactivate(): void {
    // Nothing to clean up: every disposable is owned by the extension context.
}
