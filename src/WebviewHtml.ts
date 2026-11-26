import * as fs from 'fs';
import type * as vscode from 'vscode';

export interface WebviewHtmlAssets {
    /** Webview URI of `media/search.css`. */
    styleUri: vscode.Uri;
    /** Webview URI of `media/search.js`. */
    scriptUri: vscode.Uri;
    /** `webview.cspSource`, used to allow the local script and stylesheet. */
    cspSource: string;
}

const PLACEHOLDER = /\{\{(cspSource|styleUri|scriptUri)\}\}/g;

/**
 * Loads the markup from `media/search.html` and fills in the webview URIs.
 *
 * The template is read from disk when the view is resolved; the file is small,
 * so no cache is kept and edits show up after a window reload.
 */
export function getWebviewHtml(htmlPath: string, assets: WebviewHtmlAssets): string {
    let template: string;
    try {
        template = fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
        throw new Error(
            `File Search: unable to read the webview template at "${htmlPath}". ${describeError(error)}`,
        );
    }

    const values: Record<string, string> = {
        cspSource: assets.cspSource,
        styleUri: assets.styleUri.toString(),
        scriptUri: assets.scriptUri.toString(),
    };

    return template.replace(PLACEHOLDER, (_match, name: string) => values[name] ?? '');
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
