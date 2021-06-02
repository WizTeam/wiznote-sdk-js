import crypto from 'crypto';
import assert from 'assert';
import fs from 'fs-extra';
import sqlite3 from 'sqlite3';
import os from 'os';
import path from 'path';
import { StatResult, WizStore, WizStoreOptions, WizWrapper } from '../src/wrapper';

function getVersion() {
  return '0.0.1';
}

function getPath(name: string) {
  if (name === 'appData') {
    const dataPath = path.join(__dirname, 'test-data');
    // const home = os.homedir();
    // const dataPath = path.join(home, 'markdown-notes');
    fs.ensureDirSync(dataPath);
    return dataPath;
  } else if (name === 'temp') {
    return os.tmpdir();
  } else if (name === 'res') {
    return path.join(__dirname, 'resources');
  } else {
    assert(false, `unknown path name: ${name}`);
  }
}

function getLocale() {
  return 'en';
}

const app = {
  getVersion,
  getPath,
  getLocale,
  name: 'WizNoteSDK',
};


class Store implements WizStore {
  _prefix: string;
  _map: Map<string, any>;

  constructor(options?: WizStoreOptions) {
    this._prefix = options?.name ?? '';
    this._map = new Map(); // demo, should save to disk
  }

  _getKey(key: string) {
    if (!this._prefix) {
      return key;
    }
    return `${this._prefix}/${key}`;
  }

  set(key: string, value: string| undefined | null | number | Date | boolean): void {
    this._map.set(this._getKey(key), value);
  }

  get(key: string): string | undefined | null | number | Date | boolean {
    return this._map.get(this._getKey(key));
  }

  delete(key: string) {
    this._map.delete(this._getKey(key));
  }
}


const aesAlgorithmCBC = 'aes-256-cbc';

const IV_LENGTH = 16;

function passwordToKey(password: string) {
  const key = crypto.createHash('sha256').update(String(password)).digest('base64').substr(0, 32);
  return key;
}

function encryptText(text: string, password: string) {
  if (!text) {
    return '';
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(aesAlgorithmCBC, passwordToKey(password), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const ivData = iv.toString('hex');
  const resultData = encrypted.toString('hex');
  return `${ivData}:${resultData}`;
}

function decryptText(text: string, password: string) {
  if (!text) {
    return '';
  }
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift() as any, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(aesAlgorithmCBC, passwordToKey(password), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

const enc = {
  aes: {
    encryptText,
    decryptText,
  },
};

class WizDatabase {
  _db: sqlite3.Database;

  constructor (dbPath: string, callback: (err: Error | null) => void) {
    this._db = new sqlite3.Database(dbPath, callback);
  }
  async run(sql: string, values?: any[], callback?: (error: Error | null, result: any) => void): Promise<void> {
    await this._db.run(sql, values, callback);
  }
  async all(sql: string, values?: any[], callback?: (error: Error | null, rows: any[]) => void): Promise<void> {
    await this._db.all(sql, values, callback);
  }
  async close(callback: (err: Error | null) => void): Promise<void> {
    await this._db.close(callback);
  }
}

const wizWrapper: WizWrapper = {
  fs: {
    ...fs,
    exists: (path: string) => {
      return fs.pathExists(path);
    },
    stat: async (pathLike: string) => {
      const statRet = await fs.stat(pathLike);
      return statRet;
    } 
  },
  app,
  sqlite3: {
    Database: WizDatabase,
  },
  Store,
  enc,
  options: {
    syncAllObjects: true,
    saveNoteAsMarkdown: false,
    disableCreateDefaultAccount: true,
    downloadResources: false,
  },
};

(global as any).wizWrapper = wizWrapper;
