import * as vscode from 'vscode';
import * as path from 'path';

export class FileIconProvider {

    /** 根据文件扩展名返回 VS Code 内置图标 */
    static getIcon(uri: vscode.Uri): vscode.ThemeIcon {
        const ext = path.extname(uri.fsPath).toLowerCase();
        const fileName = path.basename(uri.fsPath).toLowerCase();

        // 特殊文件名匹配
        switch (fileName) {
            case 'dockerfile':
            case 'docker-compose.yml':
            case 'docker-compose.yaml':
                return new vscode.ThemeIcon('symbol-key');
            case '.gitignore':
            case '.gitattributes':
                return new vscode.ThemeIcon('source-control');
            case '.env':
            case '.env.local':
            case '.env.development':
            case '.env.production':
                return new vscode.ThemeIcon('lock');
            case 'license':
            case 'license.md':
            case 'licence':
                return new vscode.ThemeIcon('law');
            case 'makefile':
            case 'cmakelists.txt':
                return new vscode.ThemeIcon('terminal');
            case 'readme.md':
            case 'readme':
                return new vscode.ThemeIcon('book');
        }

        // 扩展名匹配
        switch (ext) {
            // TypeScript / JavaScript
            case '.ts':
            case '.tsx':
                return new vscode.ThemeIcon('symbol-file');
            case '.js':
            case '.jsx':
                return new vscode.ThemeIcon('symbol-file');
            case '.mjs':
            case '.cjs':
                return new vscode.ThemeIcon('symbol-file');
            case '.vue':
                return new vscode.ThemeIcon('symbol-file');
            case '.svelte':
                return new vscode.ThemeIcon('symbol-file');

            // 数据 / 配置
            case '.json':
            case '.jsonc':
                return new vscode.ThemeIcon('settings');
            case '.xml':
                return new vscode.ThemeIcon('symbol-key');
            case '.toml':
            case '.ini':
            case '.cfg':
                return new vscode.ThemeIcon('settings');
            case '.env':
                return new vscode.ThemeIcon('lock');

            // 标记语言
            case '.md':
                return new vscode.ThemeIcon('markdown');
            case '.html':
            case '.htm':
                return new vscode.ThemeIcon('symbol-key');
            case '.yml':
            case '.yaml':
                return new vscode.ThemeIcon('symbol-key');

            // 样式
            case '.css':
            case '.scss':
            case '.sass':
            case '.less':
            case '.svg':
                return new vscode.ThemeIcon('symbol-color');

            // 图片 / 媒体
            case '.png':
            case '.jpg':
            case '.jpeg':
            case '.gif':
            case '.ico':
            case '.webp':
            case '.bmp':
            case '.avif':
                return new vscode.ThemeIcon('file-media');
            case '.mp3':
            case '.wav':
            case '.ogg':
            case '.flac':
                return new vscode.ThemeIcon('file-media');
            case '.mp4':
            case '.webm':
            case '.avi':
            case '.mov':
                return new vscode.ThemeIcon('file-media');
            case '.ttf':
            case '.otf':
            case '.woff':
            case '.woff2':
            case '.eot':
                return new vscode.ThemeIcon('symbol-text');

            // C / C++
            case '.c':
            case '.cpp':
            case '.h':
            case '.hpp':
            case '.cc':
            case '.cxx':
                return new vscode.ThemeIcon('symbol-method');

            // 其他语言
            case '.py':
            case '.pyi':
                return new vscode.ThemeIcon('symbol-function');
            case '.go':
                return new vscode.ThemeIcon('symbol-constant');
            case '.rs':
                return new vscode.ThemeIcon('symbol-namespace');
            case '.java':
            case '.kt':
            case '.kts':
                return new vscode.ThemeIcon('symbol-method');
            case '.rb':
                return new vscode.ThemeIcon('symbol-color');
            case '.php':
                return new vscode.ThemeIcon('symbol-method');
            case '.swift':
                return new vscode.ThemeIcon('symbol-method');
            case '.cs':
                return new vscode.ThemeIcon('symbol-method');
            case '.r':
                return new vscode.ThemeIcon('symbol-function');
            case '.lua':
                return new vscode.ThemeIcon('symbol-function');
            case '.zig':
                return new vscode.ThemeIcon('symbol-constant');

            // Shell / 脚本
            case '.sh':
            case '.bash':
            case '.zsh':
            case '.fish':
            case '.ps1':
            case '.bat':
            case '.cmd':
                return new vscode.ThemeIcon('terminal');

            // 数据库
            case '.sql':
                return new vscode.ThemeIcon('database');

            // 协议
            case '.proto':
                return new vscode.ThemeIcon('symbol-interface');
            case '.graphql':
            case '.gql':
                return new vscode.ThemeIcon('symbol-interface');

            // 构建 / 包管理
            case '.lock':
                return new vscode.ThemeIcon('lock');

            // WebAssembly
            case '.wasm':
                return new vscode.ThemeIcon('symbol-constant');

            // 其他
            case '.txt':
                return new vscode.ThemeIcon('file-text');
            case '.log':
                return new vscode.ThemeIcon('list-flat');
            case '.diff':
            case '.patch':
                return new vscode.ThemeIcon('diff');
            case '.pdf':
                return new vscode.ThemeIcon('file-pdf');

            default:
                return new vscode.ThemeIcon('file');
        }
    }
}
