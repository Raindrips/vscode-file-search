import type * as vscode from 'vscode';

export interface WebviewHtmlAssets {
    /** Webview URI of `media/search.css`. */
    styleUri: vscode.Uri;
    /** Webview URI of `media/search.js`. */
    scriptUri: vscode.Uri;
    /** `webview.cspSource`, used to allow the local script and stylesheet. */
    cspSource: string;
}

/**
 * Static markup of the search view. All dynamic content is rendered by
 * `media/search.js`; this function only interpolates the webview URIs.
 */
export function getWebviewHtml(assets: WebviewHtmlAssets): string {
    const { styleUri, scriptUri, cspSource } = assets;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource}; script-src ${cspSource};">
<link rel="stylesheet" href="${styleUri}">
<title>File Search</title>
</head>
<body>
<div class="view">
    <div class="header">
        <div class="search-box">
            <span class="search-box-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="14" height="14">
                    <path d="M10.9 9.8a4.9 4.9 0 1 0-1.1 1.1l2.9 2.9a.78.78 0 1 0 1.1-1.1l-2.9-2.9ZM3.1 6.9a3.8 3.8 0 1 1 7.6 0 3.8 3.8 0 0 1-7.6 0Z" fill="currentColor"/>
                </svg>
            </span>
            <input id="query" class="search-input" type="text" role="combobox" aria-expanded="true"
                aria-controls="results" aria-autocomplete="list" aria-label="Search files by name"
                placeholder="Search files by name" spellcheck="false" autocomplete="off" autocapitalize="off">
            <button id="clear" class="input-button" type="button" title="Clear Search" aria-label="Clear search" hidden>
                <svg viewBox="0 0 16 16" width="12" height="12">
                    <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
        <div class="options" role="toolbar" aria-label="Search options">
            <button id="toggleCase" class="toggle" type="button" aria-pressed="false"
                title="Match Case (Alt+C)" aria-label="Match case">Aa</button>
            <button id="toggleRegex" class="toggle" type="button" aria-pressed="false"
                title="Use Regular Expression (Alt+R)" aria-label="Use regular expression">.*</button>
            <button id="togglePath" class="toggle" type="button" aria-pressed="false"
                title="Include Folder Names (Alt+P)" aria-label="Include folder names">
                <svg viewBox="0 0 16 16" width="14" height="14">
                    <path d="M1.9 3.9h4.2l1.1 1.4h6.9v6.8H1.9z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
                </svg>
            </button>
            <span class="spacer"></span>
        </div>
        <div id="status" class="status" aria-live="polite"></div>
    </div>
    <div id="results" class="results" role="listbox" aria-label="Search results" tabindex="0" hidden></div>
    <div id="welcome" class="welcome">
        <div class="welcome-art" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64">
                <circle cx="27" cy="27" r="14" fill="none" stroke="currentColor" stroke-width="2.4" opacity=".75"/>
                <path d="M37.6 37.6 48 48" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".75"/>
                <path d="M20 21h14M20 26h14M20 31h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".4"/>
            </svg>
        </div>
        <h2 class="welcome-title">Search files by name</h2>
        <p class="welcome-text">Type to filter every file in this workspace. File contents are never searched.</p>
        <div class="welcome-tips">
            <div class="tip"><span class="tip-keys"><kbd>Enter</kbd></span><span>Open the selected file</span></div>
            <div class="tip"><span class="tip-keys"><kbd>Alt</kbd><kbd>Enter</kbd></span><span>Open to the side</span></div>
            <div class="tip"><span class="tip-keys"><kbd>Alt</kbd><kbd>C</kbd></span><span>Match case</span></div>
            <div class="tip"><span class="tip-keys"><kbd>Alt</kbd><kbd>R</kbd></span><span>Regular expression</span></div>
            <div class="tip"><span class="tip-keys"><kbd>Alt</kbd><kbd>P</kbd></span><span>Search folder names too</span></div>
        </div>
        <p id="welcomeIndex" class="welcome-index"></p>
        <button id="openSettings" class="link-button" type="button">Open settings</button>
    </div>
    <div id="contextMenu" class="context-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-action="open">Open<span class="menu-shortcut">Enter</span></button>
        <button type="button" role="menuitem" data-action="openSide">Open to the Side<span class="menu-shortcut">Alt+Enter</span></button>
        <div class="menu-separator" role="separator"></div>
        <button type="button" role="menuitem" data-action="reveal">Reveal in Explorer</button>
        <button type="button" role="menuitem" data-action="copyRelative">Copy Relative Path</button>
        <button type="button" role="menuitem" data-action="copyAbsolute">Copy Absolute Path</button>
    </div>
</div>
<script src="${scriptUri}"></script>
</body>
</html>`;
}
