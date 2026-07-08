import Fuse = require('fuse.js');
import * as vscode from 'vscode';

type Fuse<T> = Fuse.default<T>;

export interface FileItem {
    label: string;
    uri: vscode.Uri;
    iconPath?: vscode.ThemeIcon 
    description:string
}

export class FuseTool {
    private fuse: Fuse<FileItem>;
    private items: FileItem[];

    constructor(items: FileItem[]) {
        this.items = items;
        //@ts-ignore
        this.fuse = new Fuse(items, {
            keys: ['label'],
            threshold: 0.3,
            ignoreLocation: true,
            minMatchCharLength: 2
        });
    }

    search(value: string): FileItem[] {
        if (!value) {
            return this.items;
        }
        return this.fuse.search(value).map((r) => r.item);
    }

    add(item: FileItem): void {
        this.items.push(item);
        this.fuse.add(item);
    }

    remove(predicate: (doc: FileItem) => boolean): void {
        this.items = this.items.filter(item => !predicate(item));
        //@ts-ignore
        this.fuse.remove(predicate);
    }

    setCollection(items: FileItem[]): void {
        this.items = items;
        this.fuse.setCollection(items);
    }
}
