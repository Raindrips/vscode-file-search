# Project File Search

[中文](https://github.com/Raindrips/vscode-file-search/blob/main/Readme.zh.md)

A fast, clean, workspace‑only file name searcher.  
It offers search functionality similar to `Ctrl+P`, but limits the search
to files within the current workspace.Features

- Search project files by name
- Configurable keybinding
- Configurable include/exclude patterns

## Why this extension?

VS Code’s built‑in Ctrl+P mixes:

- recently opened files
- files from other projects
- diff views
- temporary files

This extension provides a **pure project file searcher** that only shows
files inside the current workspace.

## Usage

Press `Ctrl+Alt+P` to open the file search panel. Or
run:projectFileSearch.search

## Configuration

Add these settings to your VS Code configuration:

```json
{
    "projectFileSearch.include": "**/*",
    "projectFileSearch.exclude": [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**"
    ]
}
```

`projectFileSearch.include` Glob pattern for included files.

`projectFileSearch.exclude` Glob patterns for excluded files.

## Release Notes

### 0.0.1

- QuickPick UI
- Workspace‑only file search
- Fuzzy search

### 0.1.0

- File catch index
- File system watcher
- Include/exclude configuration

### 0.1.1

- Modify the command key binding when.

## License

MIT License
