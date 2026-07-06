import * as vscode from 'vscode';
import * as path from 'path';

export class FileIconProvider {

    /** 根据文件扩展名返回 VS Code 内置图标 */
    static getIcon(uri: vscode.Uri): vscode.ThemeIcon {
        const ext = path.extname(uri.fsPath).toLowerCase();

        switch (ext) {
            case '.ts':
            case '.tsx':
                return new vscode.ThemeIcon('symbol-file');
            case '.js':
            case '.jsx':
                return new vscode.ThemeIcon('symbol-file');
            case '.json':
                return new vscode.ThemeIcon('settings');
            case '.md':
                return new vscode.ThemeIcon('markdown');
            case '.html':
                return new vscode.ThemeIcon('symbol-key');
            case '.css':
            case '.scss':
                return new vscode.ThemeIcon('symbol-color');
            case '.png':
            case '.jpg':
            case '.jpeg':
            case '.gif':
                return new vscode.ThemeIcon('file-media');
            case '.svg':
                return new vscode.ThemeIcon('symbol-color');
            case '.yml':
            case '.yaml':
                return new vscode.ThemeIcon('symbol-key');
            case '.c':
            case '.cpp':
            case '.h':
                return new vscode.ThemeIcon('symbol-method');
            case '.py':
                return new vscode.ThemeIcon('symbol-function');
            case '.go':
                return new vscode.ThemeIcon('symbol-constant');
            case '.rs':
                return new vscode.ThemeIcon('symbol-namespace');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
