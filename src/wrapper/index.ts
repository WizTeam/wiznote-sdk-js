
export type StatResult = {
	name: string | undefined // The name of the item TODO: why is this not documented?
	path: string // The absolute path to the item
	size: number // Size in bytes
	mode: number // UNIX file mode
	ctime: number // Created date
	mtime: number // Last modified date
	originalFilepath: string // In case of content uri this is the pointed file path, otherwise is the same as path
	isFile: () => boolean // Is the file just a file?
	isDirectory: () => boolean // Is the file a directory?
};

export interface WizFs {
  ensureDir(pth: string, options?: any): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  copyDir(src: string, dest: string): Promise<void>;
  copy(src: string, dest: string, options?: { base64: boolean }): Promise<void>;
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

export interface WizStore {
  new (options?: WizStoreOptions): WizStore;
  set(key: string, value: string| undefined | null | number | Date | boolean): string;
  get(key: string): string| undefined | null | number | Date | boolean;
  delete(key: string): void;
}

export interface WizAesEncTools {
  encryptText(text: string, password: string): string;
  decryptText(text: string, password: string): string;
}

export interface WizEncTools {
  aes: WizAesEncTools,
};

export interface WizWrapperOptions {
  saveNoteAsMarkdown: boolean,
  disableCreateDefaultAccount: boolean,
  downloadResources: boolean,
};

export interface WizDatabase {
  new (dbPath: string, callback: (err?: Error) => void): WizDatabase;
  run(sql: string, values?: any[], callback?: (error: Error, result: any) => void): Promise<void>;
  all(sql: string, values?: any[], callback?: (error: Error, rows: any[]) => void): Promise<void>;
  close(callback: (err?: Error) => void): Promise<void>;
}

export interface WizWrapper {
  fs: WizFs,
  app: WizApp,
  sqlite3: {
    Database: WizDatabase,
  },
  Store: WizStore,
  enc: WizEncTools,
  options: WizWrapperOptions,
};

const wizWrapper: WizWrapper = (global as any).wizWrapper;
export default wizWrapper;
