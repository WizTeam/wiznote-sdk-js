import crypto from 'crypto';
import assert from 'assert';
import fs from 'fs-extra';
import sqlite3 from 'sqlite3';
import os from 'os';
import path from 'path';

function getVersion() {
  return '0.0.1';
}

function getPath(name: string) {
  if (name === 'appData') {
    const home = os.homedir();
    const dataPath = path.join(home, 'markdown-notes');
    fs.ensureDirSync(dataPath);
    return dataPath;
  } else if (name === 'temp') {
    return os.tmpdir();
  } else if (name === 'res') {
    return path.join(__dirname, '../../test/resources');
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
  name: 'WizNote Lite',
};


class Store {
  _prefix: string;
  _map: Map<string, any>;

  constructor(prefix: string) {
    this._prefix = prefix;
    this._map = new Map(); // demo, should save to disk
  }

  _getKey(key: string) {
    if (!this._prefix) {
      return key;
    }
    return `${this._prefix}/${key}`;
  }

  set(key: string, value: any) {
    this._map.set(this._getKey(key), value);
  }

  get(key: string) {
    this._map.get(this._getKey(key));
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

const wizWrapper = {
  fs,
  app,
  sqlite3,
  Store,
  enc,
  options: {
    saveNoteAsMarkdown: true,
    disableCreateDefaultAccount: true,
    downloadResources: true,
  },
};

(global as any).wizWrapper = wizWrapper;
