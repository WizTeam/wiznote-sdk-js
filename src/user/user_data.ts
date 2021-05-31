import { EventEmitter } from 'events';
import assert from 'assert';
import path from 'path';
import * as UrlUtils from 'url';
import { v4 as uuidv4 } from 'uuid';
import i18next from 'i18next';
import imageType from 'image-type';
import isSvg from 'is-svg';
import debounce from 'lodash/debounce';
import SyncKbTask, { SyncKbOptions } from '../sync/sync_kb_task';
import { error } from 'wiznote-sdk-js-share';
import * as paths from '../common/paths';
import UserSettings from '../settings/user_settings';
import wizWrapper from '../wrapper';
import { User } from '../common/interface';
import WizDb from '../db/wiz_db';
import AccountServer from '../sync/account_server';

const { WizKnownError, WizInvalidParamError, WizInvalidPasswordError } = error;

const { fs } = wizWrapper;

class UserData extends EventEmitter {
  _user: User | null;
  _personalDb: WizDb | null;
  _as: AccountServer | null;
  _listeners: Set<any>;
  _isSyncing: boolean;
  _delayedSyncKb: (kbGuid: string, options: SyncKbOptions) => void;
  _userSettings: UserSettings | undefined;
  _refreshToken?: () => Promise<string>;

  constructor() {
    super();
    this._user = null;
    this._personalDb = null;
    this._as = null;
    this._listeners = new Set();
    this._isSyncing = false;
    this._delayedSyncKb = debounce(this._syncKbCore, 3 * 1000) as any; // delay 3 seconds
  }

  async setUser(user: User, personalDb: WizDb, accountServer: AccountServer): Promise<void> {
    this._user = user;
    this._personalDb = personalDb;
    this._as = accountServer;
    this._userSettings = new UserSettings(user.userGuid);
    assert(personalDb);
    //
    this._refreshToken = async () => {
      console.log(`refresh token`);
      const db = this._personalDb;
      assert(db);
      const account = await db.getAccountInfo();
      if (!account.password) {
        throw new WizInvalidPasswordError('no password');
      }
      try {
        assert(this._as);
        const newUser = await this._as.login(account.server, account.userId,
          account.password, {
            noRetry: true,
            noCheckExists: true,
          });
        console.log(`succeeded to refresh token`);
        await db.updateAccount(newUser.userId, account.password, account.server, newUser);
        return newUser.token;
      } catch (err) {
        if (err.code === 31001 || err.externCode === 'WizErrorInvalidPassword') {
          throw new WizInvalidPasswordError();
        }
        throw err;
      }
    };
    //
  }

  async refreshUserInfo(): Promise<User> {
    assert(this._user);
    if (this._user.isLocalUser) {
      throw new WizKnownError(i18next.t('messageNoAccount', 'No account'), 'WizErrorNoAccount');
    }
    const db = this._personalDb;
    assert(this._as);
    const newUser = await this._as.refreshUserInfo(this.token);
    this._user = newUser;
    assert(db);
    await db.updateUserInfo(newUser);
    return newUser;
  }

  getLink(name: string) {
    assert(this._as);
    this._as.getLink(name);
  }

  get userGuid() {
    assert(this._user, 'user has not initialized');
    return this._user.userGuid;
  }

  get user() {
    return this._user;
  }

  get token() {
    assert(this._user, 'user has not initialized');
    return this._user.token;
  }

  get accountServer() {
    assert(this._user, 'user has not initialized');
    return this._as;
  }

  async getDb(kbGuid: string) {
    assert(this._user);
    if (!kbGuid || kbGuid === this._user.kbGuid) {
      return this._personalDb;
    }
    //
    return null;
  }

  registerListener(listener: any) {
    this._listeners.add(listener);
  }

  unregisterListener(listener: any) {
    this._listeners.delete(listener);
  }

  get allListeners() {
    return this._listeners;
  }

  async addImageFromData(kbGuid: string, noteGuid: string, data: any, options: {
    type?: {
      ext: string,
      mime?: string,
    },
  }) {
    //
    let type;
    if (options && options.type) {
      type = options.type;
    } else {
      type = imageType(data);
    }
    if (!type) {
      try {
        const enc = new TextDecoder('utf-8');
        const str = enc.decode(data);
        if (isSvg(str)) {
          type = {
            mime: 'image/svg+xml',
            ext: 'svg'
          };
        } else {
          throw new WizInvalidParamError('Unknown image type');
        }
      } catch (err) {
        throw new WizInvalidParamError('Unknown image type');
      }
    }
    const resourcePath = paths.getNoteResources(this.userGuid, kbGuid, noteGuid);
    await fs.ensureDir(resourcePath);
    const guid = uuidv4();
    const newName = `${guid}.${type.ext}`;
    const imageName = path.join(resourcePath, newName);
    //
    function toBuffer(ab: ArrayBuffer) {
      const buf = Buffer.alloc(ab.byteLength);
      const view = new Uint8Array(ab);
      for (let i = 0; i < buf.length; ++i) {
        buf[i] = view[i];
      }
      return buf;
    }
    if (data.byteLength) {
      // eslint-disable-next-line no-param-reassign
      data = toBuffer(data);
    }
    //
    await fs.writeFile(imageName, data, options);
    return `index_files/${newName}`;
  }

  async addImageFromUrl(kbGuid: string, noteGuid: string, url: string) {
    console.log(url);
    const resourcePath = paths.getNoteResources(this.userGuid, kbGuid, noteGuid);
    await fs.ensureDir(resourcePath);
    const u = new UrlUtils.URL(url);
    if (u.protocol === 'file' || u.protocol === 'file:') {
      let file;
      if ((UrlUtils as any).fileURLToPath) {
        file = (UrlUtils as any).fileURLToPath(u);
      } else {
        file = (u as any).path;
      }
      if (file.startsWith(resourcePath)) {
        const imageName = path.basename(file);
        return `index_files/${imageName}`;
      }
      //
      const guid = uuidv4();
      const ext = path.extname(file);
      const newName = guid + ext;
      const imagePath = path.join(resourcePath, newName);
      await fs.copyFile(file, imagePath);
      return `index_files/${newName}`;
    }
    return url;
  }

  async syncKb(kbGuid: string, options: SyncKbOptions = {}) {
    assert(this._user);
    if (this._user.isLocalUser) {
      if (options.manual) {
        throw new WizKnownError(i18next.t('messageNoAccount', 'No account'), 'WizErrorNoAccount');
      }
      return;
    }
    //
    if (this._isSyncing) {
      this.emit('syncStart', this.userGuid, kbGuid);
    }
    //
    if (options.manual || options.noWait) {
      await this._syncKbCore(kbGuid, options);
      return;
    }

    //
    console.log(`request sync`);
    this._delayedSyncKb(kbGuid, options);
  }

  //
  async _syncKbCore(kbGuid: string, options: SyncKbOptions = {}): Promise<void> {
    //
    if (this._isSyncing) {
      return;
    }
    //
    try {
      this._isSyncing = true;
      console.log(`start syncing...`);
      const db = await this.getDb(kbGuid);
      assert(db);
      const server = await db.getServerUrl();
      assert(this._user);
      assert(this._refreshToken);
      const syncTask = new SyncKbTask(this._user, server, kbGuid, db, this._refreshToken, options);
      //
      syncTask.on('start', (task) => {
        this.emit('syncStart', this.userGuid, task.kbGuid);
      });

      syncTask.on('finish', (task, ret, syncOptions) => {
        this.emit('syncFinish', this.userGuid, task.kbGuid, ret, syncOptions);
      });

      syncTask.on('error', (task, err, syncOptions) => {
        this.emit('syncError', this.userGuid, task.kbGuid, err, syncOptions);
      });

      syncTask.on('downloadNotes', (task, notes) => {
        this.emit('downloadNotes', this.userGuid, task.kbGuid, notes);
      });

      syncTask.on('uploadNote', (task, note) => {
        this.emit('uploadNote', this.userGuid, task.kbGuid, note);
      });
      //
      await syncTask.syncAll();
    } catch (err) {
      console.error(err);
    } finally {
      this._isSyncing = false;
      console.log(`sync done`);
    }
  }

  async downloadNoteResource(kbGuid: string, noteGuid: string, resName: string) {
    const db = await this.getDb(kbGuid);
    assert(db);
    assert(this._user);
    assert(this._refreshToken);
    const server = await db.getServerUrl();
    let kb = kbGuid;
    if (!kb) {
      kb = await db.getKbGuid();
    }
    const syncTask = new SyncKbTask(this._user, server, kb, db, this._refreshToken);
    await syncTask.downloadNoteResource(noteGuid, resName);
  }

  getSettings(key: string, defaultValue: string | number | Date) {
    assert(this._userSettings);
    return this._userSettings.getSettings(key, defaultValue);
  }

  setSettings(key: string, value: string | number | Date) {
    assert(this._userSettings);
    this._userSettings.setSettings(key, value);
  }
}

export default UserData;
