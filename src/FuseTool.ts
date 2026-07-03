import Fuse = require('fuse.js');
type Fuse<T> = Fuse.default<T>;

export interface FileItem {
    label: string;
    uri: any;
}

export class FuseTool {
    private fuse: Fuse<FileItem>;
    private items: FileItem[];

    constructor(items: FileItem[]) {
        this.items = items;
        //@ts-ignore
        this.fuse = new Fuse(items, {
            keys: ['label'],
            threshold: 0.4,
            ignoreLocation: true,
        });
    }

    search(value: string): FileItem[] {
        if (!value) {
            return this.items;
        }
        return this.fuse.search(value).map((r) => r.item);
    }
}
