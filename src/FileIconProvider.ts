import * as path from 'path';
import * as vscode from 'vscode';

/** Icon shape drawn in the webview; see `media/search.js`. */
export type FileIconKind =
    | 'code'
    | 'data'
    | 'config'
    | 'markdown'
    | 'html'
    | 'style'
    | 'image'
    | 'media'
    | 'font'
    | 'shell'
    | 'database'
    | 'pdf'
    | 'lock'
    | 'text'
    | 'diff'
    | 'archive'
    | 'file';

export interface FileIconInfo {
    kind: FileIconKind;
    /** Accent color of the file glyph. */
    color: string;
}

const FALLBACK: FileIconInfo = { kind: 'file', color: '#9aa0a6' };

const BY_FILE_NAME: Record<string, FileIconInfo> = {
    'dockerfile': { kind: 'code', color: '#4f9fd8' },
    'docker-compose.yml': { kind: 'config', color: '#4f9fd8' },
    'docker-compose.yaml': { kind: 'config', color: '#4f9fd8' },
    'makefile': { kind: 'shell', color: '#6bbf7b' },
    'cmakelists.txt': { kind: 'config', color: '#6bbf7b' },
    '.gitignore': { kind: 'config', color: '#e0a03b' },
    '.gitattributes': { kind: 'config', color: '#e0a03b' },
    '.gitmodules': { kind: 'config', color: '#e0a03b' },
    '.npmrc': { kind: 'config', color: '#d96c6c' },
    '.nvmrc': { kind: 'config', color: '#6bbf7b' },
    '.prettierrc': { kind: 'config', color: '#b18bd6' },
    '.prettierignore': { kind: 'config', color: '#b18bd6' },
    '.eslintrc': { kind: 'config', color: '#b18bd6' },
    '.eslintignore': { kind: 'config', color: '#b18bd6' },
    '.editorconfig': { kind: 'config', color: '#b18bd6' },
    '.babelrc': { kind: 'config', color: '#d9c05b' },
    'yarn.lock': { kind: 'lock', color: '#c9a227' },
    'package-lock.json': { kind: 'lock', color: '#c9a227' },
    'pnpm-lock.yaml': { kind: 'lock', color: '#c9a227' },
    'cargo.lock': { kind: 'lock', color: '#c9a227' },
    'go.sum': { kind: 'lock', color: '#c9a227' },
};

const BY_EXTENSION: Record<string, FileIconInfo> = {
    // Scripts and source code
    '.ts': { kind: 'code', color: '#4f9fd8' },
    '.tsx': { kind: 'code', color: '#4f9fd8' },
    '.mts': { kind: 'code', color: '#4f9fd8' },
    '.cts': { kind: 'code', color: '#4f9fd8' },
    '.js': { kind: 'code', color: '#d9c05b' },
    '.jsx': { kind: 'code', color: '#d9c05b' },
    '.mjs': { kind: 'code', color: '#d9c05b' },
    '.cjs': { kind: 'code', color: '#d9c05b' },
    '.vue': { kind: 'code', color: '#42b883' },
    '.svelte': { kind: 'code', color: '#e07b53' },
    '.py': { kind: 'code', color: '#4f9fd8' },
    '.pyi': { kind: 'code', color: '#4f9fd8' },
    '.go': { kind: 'code', color: '#4fc1e9' },
    '.rs': { kind: 'code', color: '#dea584' },
    '.java': { kind: 'code', color: '#d98c5f' },
    '.kt': { kind: 'code', color: '#b18bd6' },
    '.kts': { kind: 'code', color: '#b18bd6' },
    '.c': { kind: 'code', color: '#599eff' },
    '.h': { kind: 'code', color: '#599eff' },
    '.cpp': { kind: 'code', color: '#599eff' },
    '.hpp': { kind: 'code', color: '#599eff' },
    '.cc': { kind: 'code', color: '#599eff' },
    '.cxx': { kind: 'code', color: '#599eff' },
    '.cs': { kind: 'code', color: '#8b7fd6' },
    '.rb': { kind: 'code', color: '#d96c6c' },
    '.php': { kind: 'code', color: '#8b7fd6' },
    '.swift': { kind: 'code', color: '#e07b53' },
    '.r': { kind: 'code', color: '#4f9fd8' },
    '.lua': { kind: 'code', color: '#5b8fd6' },
    '.zig': { kind: 'code', color: '#d9a94b' },
    '.wasm': { kind: 'code', color: '#b18bd6' },

    // Data and configuration
    '.json': { kind: 'data', color: '#d9c05b' },
    '.jsonc': { kind: 'data', color: '#d9c05b' },
    '.json5': { kind: 'data', color: '#d9c05b' },
    '.xml': { kind: 'data', color: '#b18bd6' },
    '.yml': { kind: 'config', color: '#b18bd6' },
    '.yaml': { kind: 'config', color: '#b18bd6' },
    '.toml': { kind: 'config', color: '#b18bd6' },
    '.ini': { kind: 'config', color: '#b18bd6' },
    '.cfg': { kind: 'config', color: '#b18bd6' },
    '.conf': { kind: 'config', color: '#b18bd6' },
    '.properties': { kind: 'config', color: '#b18bd6' },

    // Markup and styles
    '.md': { kind: 'markdown', color: '#7cb7b7' },
    '.markdown': { kind: 'markdown', color: '#7cb7b7' },
    '.mdx': { kind: 'markdown', color: '#7cb7b7' },
    '.html': { kind: 'html', color: '#e07b53' },
    '.htm': { kind: 'html', color: '#e07b53' },
    '.css': { kind: 'style', color: '#c86fa8' },
    '.scss': { kind: 'style', color: '#c86fa8' },
    '.sass': { kind: 'style', color: '#c86fa8' },
    '.less': { kind: 'style', color: '#c86fa8' },

    // Shell and terminals
    '.sh': { kind: 'shell', color: '#6bbf7b' },
    '.bash': { kind: 'shell', color: '#6bbf7b' },
    '.zsh': { kind: 'shell', color: '#6bbf7b' },
    '.fish': { kind: 'shell', color: '#6bbf7b' },
    '.ps1': { kind: 'shell', color: '#6bbf7b' },
    '.bat': { kind: 'shell', color: '#6bbf7b' },
    '.cmd': { kind: 'shell', color: '#6bbf7b' },

    // Images, media and fonts
    '.png': { kind: 'image', color: '#7cb083' },
    '.jpg': { kind: 'image', color: '#7cb083' },
    '.jpeg': { kind: 'image', color: '#7cb083' },
    '.gif': { kind: 'image', color: '#7cb083' },
    '.ico': { kind: 'image', color: '#7cb083' },
    '.webp': { kind: 'image', color: '#7cb083' },
    '.bmp': { kind: 'image', color: '#7cb083' },
    '.avif': { kind: 'image', color: '#7cb083' },
    '.svg': { kind: 'image', color: '#e0a03b' },
    '.mp3': { kind: 'media', color: '#d98c5f' },
    '.wav': { kind: 'media', color: '#d98c5f' },
    '.ogg': { kind: 'media', color: '#d98c5f' },
    '.flac': { kind: 'media', color: '#d98c5f' },
    '.mp4': { kind: 'media', color: '#d98c5f' },
    '.webm': { kind: 'media', color: '#d98c5f' },
    '.avi': { kind: 'media', color: '#d98c5f' },
    '.mov': { kind: 'media', color: '#d98c5f' },
    '.ttf': { kind: 'font', color: '#b0b0b0' },
    '.otf': { kind: 'font', color: '#b0b0b0' },
    '.woff': { kind: 'font', color: '#b0b0b0' },
    '.woff2': { kind: 'font', color: '#b0b0b0' },
    '.eot': { kind: 'font', color: '#b0b0b0' },

    // Databases, protocols and documents
    '.sql': { kind: 'database', color: '#d4a15e' },
    '.proto': { kind: 'data', color: '#b18bd6' },
    '.graphql': { kind: 'data', color: '#e535ab' },
    '.gql': { kind: 'data', color: '#e535ab' },
    '.txt': { kind: 'text', color: '#9aa0a6' },
    '.log': { kind: 'text', color: '#9aa0a6' },
    '.pdf': { kind: 'pdf', color: '#d96c6c' },
    '.diff': { kind: 'diff', color: '#8fb573' },
    '.patch': { kind: 'diff', color: '#8fb573' },
    '.csv': { kind: 'data', color: '#7cb083' },
    '.tsv': { kind: 'data', color: '#7cb083' },

    // Archives and lock files
    '.zip': { kind: 'archive', color: '#c9a227' },
    '.tar': { kind: 'archive', color: '#c9a227' },
    '.gz': { kind: 'archive', color: '#c9a227' },
    '.7z': { kind: 'archive', color: '#c9a227' },
    '.rar': { kind: 'archive', color: '#c9a227' },
    '.jar': { kind: 'archive', color: '#c9a227' },
    '.vsix': { kind: 'archive', color: '#c9a227' },
    '.lock': { kind: 'lock', color: '#c9a227' },
};

export class FileIconProvider {
    /** Returns the icon shape and accent color used by the search webview. */
    static getIcon(uri: vscode.Uri): FileIconInfo {
        const fileName = path.basename(uri.fsPath).toLowerCase();

        const byName = BY_FILE_NAME[fileName];
        if (byName) {
            return byName;
        }
        if (fileName.startsWith('.env')) {
            return { kind: 'lock', color: '#c9a227' };
        }
        if (fileName.startsWith('readme')) {
            return { kind: 'markdown', color: '#7cb7b7' };
        }
        if (fileName.startsWith('license') || fileName.startsWith('licence')) {
            return { kind: 'text', color: '#b0b0b0' };
        }

        return BY_EXTENSION[path.extname(fileName)] ?? FALLBACK;
    }
}
