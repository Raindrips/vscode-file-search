// @ts-check
/// <reference types="vscode" />

(function () {
    'use strict';

    const vscode = acquireVsCodeApi();

    /**
     * File glyphs keyed by the `FileIconKind` values sent from the extension.
     * Each icon is a 16x16 page outline plus a small kind-specific glyph.
     */
    function icon(glyph) {
        return (
            '<svg viewBox="0 0 16 16" aria-hidden="true">' +
            '<path class="file-outline" d="M3.5 1.5h5.4L12.5 5v9.5h-9z"/>' +
            '<path class="file-fold" d="M8.9 1.5V5h3.6"/>' +
            (glyph ? '<g class="file-glyph">' + glyph + '</g>' : '') +
            '</svg>'
        );
    }

    const ICONS = {
        code: icon('<path d="M6.2 9.5 4.7 11.3l1.5 1.8M9.8 9.5l1.5 1.8-1.5 1.8"/>'),
        data: icon('<path d="M5 9.4h6v4.2H5zM5 11.2h6M7.7 9.4v4.2"/>'),
        config: icon(
            '<circle cx="8" cy="11.4" r="1.4"/>' +
            '<path d="M8 9.1v.7M8 13v.7M5.7 11.4h.7M9.6 11.4h.7M6.4 9.8l.5.5M9.1 12.5l.5.5M9.6 9.8l-.5.5M6.9 12.5l-.5.5"/>',
        ),
        markdown: icon(
            '<path d="M5 9.4v3.6M5 13l1.3-1.5 1.3 1.5M5 9.4l1.3 1.5 1.3-1.5M9.2 9.4v3.2m0 0-1.1-1.1m1.1 1.1 1.1-1.1"/>',
        ),
        html: icon('<path d="M5.9 9.4 4.1 11.6l1.8 2.2M10.1 9.4l1.8 2.2-1.8 2.2M9.1 9.1 6.9 14.1"/>'),
        style: icon('<path d="M6.6 8.9 5.7 14M9.6 8.9 8.7 14M4.7 10.7h6.6M4.4 12.5h6.6"/>'),
        image: icon(
            '<circle cx="6" cy="10.2" r=".8"/>' +
            '<path d="M4.9 13.6 7 11.2l1.5 1.8 1.1-1.3 1.5 1.9z"/>',
        ),
        media: icon('<path d="M6.6 9.3v4.4l3.7-2.2z" fill="currentColor" stroke="none"/>'),
        font: icon('<path d="M5.7 13.8 7.9 9.1h.2l2.2 4.7M6.6 12.2h3"/>'),
        shell: icon('<path d="M5.1 9.6 7 11.6l-1.9 2M8.7 13.2h2.4"/>'),
        database: icon(
            '<ellipse cx="8" cy="9.9" rx="2.6" ry="1"/>' +
            '<path d="M5.4 9.9v3.4c0 .6 5.2.6 5.2 0V9.9M5.4 11.6c0 .6 5.2.6 5.2 0"/>',
        ),
        pdf: icon('<path d="M5.6 13.8V9.1h1.8a1.3 1.3 0 0 1 0 2.6H5.6v2.1"/>'),
        lock: icon(
            '<rect x="5.3" y="10.4" width="5.4" height="3.8" rx=".6"/>' +
            '<path d="M6.7 10.4V9.4a1.3 1.3 0 0 1 2.6 0v1"/>',
        ),
        text: icon('<path d="M5 9.4h6M5 11.1h6M5 12.8h6M5 14.2h3.2"/>'),
        diff: icon('<path d="M5 10h2.6M6.3 8.7v2.6M8.8 13.2h2.6"/>'),
        archive: icon('<path d="M5 9.9h6v3.7H5zM5 9.9l.6-1.1h4.8l.6 1.1M7.2 11.5h1.6"/>'),
        file: icon(''),
    };

    const els = {
        query: document.getElementById('query'),
        clear: document.getElementById('clear'),
        toggleCase: document.getElementById('toggleCase'),
        toggleRegex: document.getElementById('toggleRegex'),
        togglePath: document.getElementById('togglePath'),
        status: document.getElementById('status'),
        results: document.getElementById('results'),
        welcome: document.getElementById('welcome'),
        welcomeIndex: document.getElementById('welcomeIndex'),
        openSettings: document.getElementById('openSettings'),
        contextMenu: document.getElementById('contextMenu'),
    };

    const state = {
        query: '',
        options: { caseSensitive: false, regex: false, matchPath: false },
        results: [],
        rows: [],
        selected: -1,
        maxResults: 300,
        fileCount: 0,
        indexing: false,
        requestId: 0,
        searchTimer: 0,
        menuPath: null,
    };

    const PLACEHOLDERS = {
        plain: 'Search files by name',
        path: 'Search file and folder names',
        regex: 'Search files with a regular expression',
    };

    // ---------------------------------------------------------------- utils

    function normalizeKind(kind) {
        return typeof kind === 'string' && ICONS[kind] ? kind : 'file';
    }

    function plural(count, one, many) {
        return count === 1 ? '1 ' + one : count + ' ' + many;
    }

    function mergeRanges(ranges, length) {
        if (!Array.isArray(ranges) || ranges.length === 0 || length <= 0) {
            return [];
        }
        const clean = [];
        for (const range of ranges) {
            if (!Array.isArray(range) || range.length < 2) {
                continue;
            }
            const start = Math.max(0, Math.min(length, Number(range[0]) | 0));
            const end = Math.min(length - 1, Math.max(start, Number(range[1]) | 0));
            if (start <= end) {
                clean.push([start, end]);
            }
        }
        clean.sort(function (a, b) {
            return a[0] - b[0] || a[1] - b[1];
        });
        const merged = [];
        for (const range of clean) {
            const last = merged[merged.length - 1];
            if (last && range[0] <= last[1] + 1) {
                last[1] = Math.max(last[1], range[1]);
            } else {
                merged.push(range);
            }
        }
        return merged;
    }

    function appendHighlighted(parent, text, ranges) {
        const value = typeof text === 'string' ? text : '';
        const merged = mergeRanges(ranges, value.length);
        if (merged.length === 0) {
            parent.textContent = value;
            return;
        }
        let position = 0;
        for (const range of merged) {
            if (range[0] > position) {
                parent.appendChild(document.createTextNode(value.slice(position, range[0])));
            }
            const mark = document.createElement('mark');
            mark.textContent = value.slice(range[0], range[1] + 1);
            parent.appendChild(mark);
            position = range[1] + 1;
        }
        if (position < value.length) {
            parent.appendChild(document.createTextNode(value.slice(position)));
        }
    }

    function statusText(text) {
        const span = document.createElement('span');
        span.className = 'status-detail';
        span.textContent = text;
        els.status.appendChild(span);
    }

    function appendSpinner() {
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        els.status.appendChild(spinner);
    }

    // ------------------------------------------------------------- rendering

    function updatePlaceholder() {
        els.query.placeholder = state.options.regex
            ? PLACEHOLDERS.regex
            : state.options.matchPath
                ? PLACEHOLDERS.path
                : PLACEHOLDERS.plain;
    }

    function updateToggles() {
        els.toggleCase.setAttribute('aria-pressed', String(state.options.caseSensitive));
        els.toggleRegex.setAttribute('aria-pressed', String(state.options.regex));
        els.togglePath.setAttribute('aria-pressed', String(state.options.matchPath));
        updatePlaceholder();
    }

    function updateClearButton() {
        els.clear.hidden = els.query.value.length === 0;
    }

    function updateWelcomeIndex() {
        if (state.indexing) {
            els.welcomeIndex.textContent = 'Indexing workspace files…';
        } else if (state.fileCount > 0) {
            els.welcomeIndex.textContent = plural(state.fileCount, 'file', 'files') + ' indexed';
        } else {
            els.welcomeIndex.textContent = 'No files found in this workspace.';
        }
    }

    function updateStatus(invalidRegex, truncated) {
        els.status.textContent = '';
        els.status.classList.toggle('error', invalidRegex === true);

        if (invalidRegex === true) {
            statusText('Invalid regular expression.');
            return;
        }

        if (state.query.trim() === '') {
            if (state.indexing) {
                appendSpinner();
                statusText('Indexing workspace files…');
            } else {
                statusText(plural(state.fileCount, 'file', 'files') + ' indexed');
            }
            return;
        }

        const count = state.results.length;
        let label;
        if (count === 0) {
            label = 'No results';
        } else if (truncated) {
            label = 'First ' + plural(count, 'result', 'results');
        } else {
            label = plural(count, 'result', 'results');
        }
        statusText(label);
        if (state.indexing) {
            appendSpinner();
            statusText('Indexing…');
        }
    }

    function showWelcome() {
        els.results.hidden = true;
        els.results.replaceChildren();
        state.rows = [];
        els.welcome.hidden = false;
        els.query.removeAttribute('aria-activedescendant');
        updateWelcomeIndex();
        updateStatus(false, false);
    }

    function renderMessage(text, isError) {
        const row = document.createElement('div');
        row.className = 'message-row' + (isError ? ' error' : '');
        row.textContent = text;
        els.results.replaceChildren(row);
    }

    function buildRow(item, index) {
        const kind = normalizeKind(item.icon);
        const row = document.createElement('div');
        row.className = 'result';
        row.id = 'result-' + index;
        row.dataset.index = String(index);
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', index === state.selected ? 'true' : 'false');
        row.title = typeof item.relPath === 'string' ? item.relPath : '';
        if (index === state.selected) {
            row.classList.add('selected');
        }

        const iconEl = document.createElement('span');
        iconEl.className = 'file-icon icon-' + kind;
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.innerHTML = ICONS[kind];
        row.appendChild(iconEl);

        const labels = document.createElement('span');
        labels.className = 'file-labels';

        const nameEl = document.createElement('span');
        nameEl.className = 'file-name';
        appendHighlighted(nameEl, item.name, item.nameMatches);
        labels.appendChild(nameEl);

        if (typeof item.dir === 'string' && item.dir.length > 0) {
            const dirEl = document.createElement('span');
            dirEl.className = 'file-dir';
            appendHighlighted(dirEl, item.dir, item.dirMatches);
            labels.appendChild(dirEl);
        }

        row.appendChild(labels);

        row.addEventListener('click', function () {
            select(index, false);
            openItem(index, false);
        });
        row.addEventListener('contextmenu', function (event) {
            showMenu(event, index);
        });

        return row;
    }

    function renderResults(invalidRegex, truncated) {
        closeMenu(false);
        els.welcome.hidden = true;
        els.results.hidden = false;

        if (invalidRegex === true) {
            state.rows = [];
            els.query.removeAttribute('aria-activedescendant');
            renderMessage('Invalid regular expression.', true);
            return;
        }

        if (state.results.length === 0) {
            state.rows = [];
            els.query.removeAttribute('aria-activedescendant');
            renderMessage('No matching files.', false);
            return;
        }

        const fragment = document.createDocumentFragment();
        state.results.forEach(function (item, index) {
            fragment.appendChild(buildRow(item, index));
        });

        if (truncated) {
            const note = document.createElement('div');
            note.className = 'message-row';
            note.textContent = 'Showing the first ' + state.results.length + ' files. Refine the search to narrow the list.';
            fragment.appendChild(note);
        }

        els.results.replaceChildren(fragment);
        state.rows = Array.prototype.slice.call(els.results.querySelectorAll('.result'));

        if (state.selected >= 0) {
            els.query.setAttribute('aria-activedescendant', 'result-' + state.selected);
            const selectedRow = state.rows[state.selected];
            if (selectedRow) {
                selectedRow.scrollIntoView({ block: 'nearest' });
            }
        } else {
            els.query.removeAttribute('aria-activedescendant');
        }
    }

    function select(index, scroll) {
        if (index < 0 || index >= state.results.length) {
            return;
        }
        const previous = state.rows[state.selected];
        if (previous) {
            previous.classList.remove('selected');
            previous.setAttribute('aria-selected', 'false');
        }
        state.selected = index;
        const row = state.rows[index];
        if (row) {
            row.classList.add('selected');
            row.setAttribute('aria-selected', 'true');
            if (scroll) {
                row.scrollIntoView({ block: 'nearest' });
            }
        }
        els.query.setAttribute('aria-activedescendant', 'result-' + index);
    }

    function moveSelection(delta) {
        if (state.results.length === 0) {
            return;
        }
        const base = state.selected < 0 ? (delta > 0 ? -1 : 0) : state.selected;
        const next = Math.max(0, Math.min(state.results.length - 1, base + delta));
        select(next, true);
    }

    function openItem(index, side) {
        const item = state.results[index];
        if (!item) {
            return;
        }
        vscode.postMessage({ type: 'open', fsPath: item.fsPath, side: side === true });
    }

    function openSelected(side) {
        if (state.selected >= 0) {
            openItem(state.selected, side);
        }
    }

    // ----------------------------------------------------------------- menu

    function showMenu(event, index) {
        event.preventDefault();
        event.stopPropagation();
        select(index, false);
        const item = state.results[index];
        if (!item) {
            return;
        }
        state.menuPath = item.fsPath;
        els.contextMenu.hidden = false;
        els.contextMenu.style.left = '0px';
        els.contextMenu.style.top = '0px';
        const width = els.contextMenu.offsetWidth;
        const height = els.contextMenu.offsetHeight;
        const x = Math.max(4, Math.min(event.clientX, window.innerWidth - width - 4));
        const y = Math.max(4, Math.min(event.clientY, window.innerHeight - height - 4));
        els.contextMenu.style.left = x + 'px';
        els.contextMenu.style.top = y + 'px';
        const first = els.contextMenu.querySelector('button');
        if (first) {
            first.focus();
        }
    }

    function closeMenu(refocus) {
        if (els.contextMenu.hidden) {
            return;
        }
        els.contextMenu.hidden = true;
        state.menuPath = null;
        if (refocus) {
            els.query.focus();
        }
    }

    function runMenuAction(action) {
        const fsPath = state.menuPath;
        closeMenu(false);
        if (!fsPath) {
            return;
        }
        switch (action) {
            case 'open':
                vscode.postMessage({ type: 'open', fsPath: fsPath, side: false });
                break;
            case 'openSide':
                vscode.postMessage({ type: 'open', fsPath: fsPath, side: true });
                break;
            case 'reveal':
                vscode.postMessage({ type: 'reveal', fsPath: fsPath });
                els.query.focus();
                break;
            case 'copyRelative':
                vscode.postMessage({ type: 'copyPath', fsPath: fsPath, absolute: false });
                els.query.focus();
                break;
            case 'copyAbsolute':
                vscode.postMessage({ type: 'copyPath', fsPath: fsPath, absolute: true });
                els.query.focus();
                break;
            default:
                break;
        }
    }

    // ------------------------------------------------------------ searching

    function cancelScheduledSearch() {
        if (state.searchTimer) {
            clearTimeout(state.searchTimer);
            state.searchTimer = 0;
        }
    }

    function scheduleSearch(delay) {
        cancelScheduledSearch();
        state.searchTimer = setTimeout(function () {
            state.searchTimer = 0;
            runSearch();
        }, delay);
    }

    function runSearch() {
        state.requestId += 1;
        vscode.postMessage({
            type: 'search',
            query: state.query,
            options: {
                caseSensitive: state.options.caseSensitive,
                regex: state.options.regex,
                matchPath: state.options.matchPath,
            },
            requestId: state.requestId,
        });
    }

    function handleInput() {
        state.query = els.query.value;
        updateClearButton();
        if (state.query.trim() === '') {
            cancelScheduledSearch();
            state.requestId += 1;
            state.results = [];
            state.selected = -1;
            showWelcome();
            return;
        }
        scheduleSearch(85);
    }

    function clearSearch() {
        if (els.query.value.length === 0) {
            return;
        }
        els.query.value = '';
        state.query = '';
        updateClearButton();
        cancelScheduledSearch();
        state.requestId += 1;
        state.results = [];
        state.selected = -1;
        showWelcome();
        els.query.focus();
    }

    function toggleOption(name) {
        state.options[name] = !state.options[name];
        updateToggles();
        if (state.query.trim() === '') {
            return;
        }
        scheduleSearch(0);
    }

    function applyResults(message) {
        const matches = Array.isArray(message.results) ? message.results : [];
        state.maxResults = typeof message.maxResults === 'number' ? message.maxResults : state.maxResults;
        state.fileCount = typeof message.fileCount === 'number' ? message.fileCount : 0;
        state.indexing = message.indexing === true;

        if (state.query.trim() === '') {
            state.results = [];
            state.selected = -1;
            showWelcome();
            return;
        }

        state.results = matches;
        state.selected = matches.length > 0 ? 0 : -1;
        const invalidRegex = message.invalidRegex === true;
        const truncated = message.truncated === true;
        renderResults(invalidRegex, truncated);
        updateStatus(invalidRegex, truncated);
    }

    // ------------------------------------------------------------- messages

    window.addEventListener('message', function (event) {
        const message = event.data;
        if (!message || typeof message !== 'object') {
            return;
        }
        switch (message.type) {
            case 'init':
                onInit(message);
                break;
            case 'results':
                onResults(message);
                break;
            case 'focus':
                els.query.focus();
                els.query.select();
                break;
            default:
                break;
        }
    });

    function onInit(message) {
        const options = message.options && typeof message.options === 'object' ? message.options : {};
        state.options = {
            caseSensitive: options.caseSensitive === true,
            regex: options.regex === true,
            matchPath: options.matchPath === true,
        };
        state.fileCount = typeof message.fileCount === 'number' ? message.fileCount : 0;
        state.indexing = message.indexing === true;
        state.maxResults = typeof message.maxResults === 'number' ? message.maxResults : state.maxResults;
        state.query = typeof message.query === 'string' ? message.query : '';
        els.query.value = state.query;
        updateClearButton();
        updateToggles();

        if (state.query.trim() === '') {
            state.results = [];
            state.selected = -1;
            showWelcome();
        } else {
            runSearch();
        }
    }

    function onResults(message) {
        if (typeof message.requestId === 'number' && message.requestId !== 0) {
            if (message.requestId !== state.requestId) {
                return;
            }
        }
        if (typeof message.query === 'string' && message.query !== state.query) {
            return;
        }
        applyResults(message);
    }

    // ------------------------------------------------------------- keyboard

    function onDocumentKeyDown(event) {
        if (event.isComposing) {
            return;
        }

        if (!els.contextMenu.hidden && els.contextMenu.contains(event.target)) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMenu(true);
            }
            return;
        }

        if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            const code = event.code;
            if (code === 'KeyC' || code === 'KeyR' || code === 'KeyP') {
                event.preventDefault();
                toggleOption(
                    code === 'KeyC' ? 'caseSensitive' : code === 'KeyR' ? 'regex' : 'matchPath',
                );
                return;
            }
        }

        if (event.key === 'Escape') {
            if (els.query.value.length > 0) {
                event.preventDefault();
                clearSearch();
            } else {
                event.preventDefault();
                vscode.postMessage({ type: 'dismiss' });
            }
            return;
        }

        const target = event.target;
        const inSearchArea =
            target === els.query || target === els.results || target === document.body;
        if (!inSearchArea) {
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                if (state.results.length > 0) {
                    event.preventDefault();
                    moveSelection(1);
                }
                break;
            case 'ArrowUp':
                if (state.results.length > 0) {
                    event.preventDefault();
                    moveSelection(-1);
                }
                break;
            case 'PageDown':
                if (state.results.length > 0) {
                    event.preventDefault();
                    moveSelection(10);
                }
                break;
            case 'PageUp':
                if (state.results.length > 0) {
                    event.preventDefault();
                    moveSelection(-10);
                }
                break;
            case 'Enter':
                if (state.results.length > 0) {
                    event.preventDefault();
                    openSelected(event.altKey || event.ctrlKey || event.metaKey);
                }
                break;
            default:
                break;
        }
    }

    // --------------------------------------------------------------- wiring

    els.query.addEventListener('input', handleInput);
    els.clear.addEventListener('click', clearSearch);
    els.toggleCase.addEventListener('click', function () {
        toggleOption('caseSensitive');
        els.query.focus();
    });
    els.toggleRegex.addEventListener('click', function () {
        toggleOption('regex');
        els.query.focus();
    });
    els.togglePath.addEventListener('click', function () {
        toggleOption('matchPath');
        els.query.focus();
    });
    els.openSettings.addEventListener('click', function () {
        vscode.postMessage({ type: 'openSettings' });
    });

    els.contextMenu.addEventListener('click', function (event) {
        const button = event.target && event.target.closest
            ? event.target.closest('button[data-action]')
            : null;
        if (button) {
            runMenuAction(button.dataset.action);
        }
    });
    els.contextMenu.addEventListener('keydown', function (event) {
        const buttons = Array.prototype.slice.call(els.contextMenu.querySelectorAll('button'));
        const index = buttons.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (buttons.length === 0) {
                return;
            }
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = (index + step + buttons.length) % buttons.length;
            buttons[next].focus();
        }
    });

    document.addEventListener('keydown', onDocumentKeyDown);
    document.addEventListener('mousedown', function (event) {
        if (!els.contextMenu.hidden && !els.contextMenu.contains(event.target)) {
            closeMenu(false);
        }
    });
    els.results.addEventListener('scroll', function () {
        closeMenu(false);
    });
    window.addEventListener('blur', function () {
        closeMenu(false);
    });

    vscode.postMessage({ type: 'ready' });
})();
