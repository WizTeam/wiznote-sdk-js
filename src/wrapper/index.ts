import assert from "assert";

export type StatResult = {
	size: number // Size in bytes
	isFile: () => boolean // Is the file just a file?
	isDirectory: () => boolean // Is the file a directory?
};

export interface WizFs {
  ensureDir(pth: string, options?: any): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  copy(src: string, dest: string): Promise<void>;
  readFile(filepath: string, encodingOrOptions?: any): Promise<any>;
  readdir(dirpath: string): Promise<string[]>;
  writeFile(dirpath: string, data: any, options?: any): Promise<void>;
  stat(filepath: string): Promise<StatResult>;
  exists(filepath: string): Promise<boolean>;
  existsSync(filepath: string): boolean;
  createReadStream?: (path: string, options?: any) => any;
};

export interface WizApp {
  getVersion(): string;
  getPath(name: string): string;
  getLocale(): string,
  name: string,
  doStandardPost?: (options: any) => any;
};

export interface WizStoreOptions {
  name: string;
}

export class WizStore {
  constructor(options?: WizStoreOptions) {}
  set(key: string, value: string| undefined | null | number | Date | boolean): void { assert(false); }
  get(key: string): string| undefined | null | number | Date | boolean { assert(false); }
  delete(key: string): void {}
}

type ConstructorWizStore<T> = {
  new (options?: WizStoreOptions): T;
} 

export interface WizAesEncTools {
  encryptText(text: string, password: string): string;
  decryptText(text: string, password: string): string;
}

export interface WizEncTools {
  aes: WizAesEncTools,
};

export interface WizWrapperOptions {
  syncAllObjects: boolean,
  saveNoteAsMarkdown: boolean,
  disableCreateDefaultAccount: boolean,
  downloadResources: boolean,
};

export class WizDatabase {
  constructor (dbPath: string, callback: (err: Error | null) => void) {}
  async run(sql: string, values?: any[], callback?: (error: Error | null, result: any) => void): Promise<void> { assert(false); }
  async all(sql: string, values?: any[], callback?: (error: Error | null, rows: any[]) => void): Promise<void> { assert(false); }
  async close(callback: (err: Error | null) => void): Promise<void> {}
}

// type ConstructorDatabase<T> = {
//   new (dbPath: string, callback: (err: Error | null) => void): T;
// } 

export interface WizWrapper {
  fs: WizFs,
  app: WizApp,
  sqlite3: {
    Database: typeof WizDatabase,
  },
  Store: typeof WizStore,
  enc: WizEncTools,
  options: WizWrapperOptions,
};

const wizWrapper: WizWrapper = (global as any).wizWrapper;
export default wizWrapper;
