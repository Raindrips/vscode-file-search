# Project File Search

[中文](#项目文件搜索)

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

### 0.1.2

- Modify the command key binding when.

### 0.1.3

- add File Icon.

## License

MIT License

---

# 项目文件搜索

一个快速、简洁、仅限工作区的文件名搜索器。  
它提供类似 `Ctrl+P` 的搜索功能，但搜索范围严格限制在当前工作区内。

## 功能特性

- 按文件名搜索项目文件
- 可配置快捷键
- 可配置 include / exclude 模式

## 为什么需要这个扩展？

VS Code 内置的 Ctrl+P 会混合以下内容：

- 最近打开的文件
- 其他项目的文件
- diff 视图
- 临时文件

本扩展提供一个 **纯净的项目文件搜索器**，只显示当前工作区内的文件。

## 使用方法

按下 `Ctrl+Alt+P` 打开文件搜索面板。  
或运行命令：`projectFileSearch.search`

## 配置

在 VS Code 设置中加入以下内容：

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

`projectFileSearch.include`：用于包含文件的 Glob 模式。

`projectFileSearch.exclude`：用于排除文件的 Glob 模式。

## 更新日志

### 0.0.1

- QuickPick UI
- 仅限工作区的文件搜索
- 模糊搜索

### 0.1.0

- 文件缓存索引
- 文件系统监听
- include/exclude 配置支持

### 0.1.2

- 修改命令键绑定的 `when` 条件

### 0.1.3

- 添加文件图标

## 许可

MIT 协议
