import trim from 'lodash/trim';
import assert from 'assert';
import { error } from 'wiznote-sdk-js-share';
import AccountServer from '../sync/account_server';
import UserData from './user_data';
import * as dataStore from './data_store';
import * as globalSettings from '../settings/global_settings';
import downloadNoteData from '../sync/download_note_data';
import wizWrapper from '../wrapper';
import { SyncKbOptions } from '../sync/sync_kb_task';
import WizDb, { CreateNoteOptions, QueryNotesOptions } from '../db/wiz_db';
import { Note, User } from '../common/interface';

const { WizInternalError } = error;

class Users {
  _userMap: Map<string, UserData>;

  constructor() {
    this._userMap = new Map();
  }

  async getUsers() {
    const users = await dataStore.getUsers();
    return users;
  }

  async _processUser(user: User, options: {
    mergeLocalAccount?: boolean,
    autoLogin?: boolean,
  }, {
    server, userId, password, accountServer,
  }: {
    server: string,
    userId: string,
    password: string,
    accountServer: AccountServer,
  }) {
    const mergeLocalAccount = options.mergeLocalAccount;
    if (mergeLocalAccount) {
      const users = await this.getUsers();
      const localUser = users.find((elem) => elem.isLocalUser);
      if (!localUser) {
        throw new WizInternalError('no local user');
      }
      const existUser = users.find((elem) => elem.userGuid === user.userGuid);
      if (existUser) {
        throw new WizInternalError(`user ${user.userId} has already logged in`);
      }
      //
      await dataStore.copyLocalAccount(localUser, user);
      const db = await dataStore.openPersonalDb(user.userGuid, user.kbGuid);
      // //
      const userData = new UserData();
      await userData.setUser(user, db, accountServer);
      this._userMap.set(user.userGuid, userData);
      this.initEvents(user.userGuid, db);
      //
      await db.updateAccount(userId, password, server, user);
      //
      if (options && options.autoLogin) {
        globalSettings.setLastAccount(user.userGuid);
      } else {
        globalSettings.setLastAccount('');
      }
      //
      return user;
    }
    //
    let db: WizDb;
    if (this.getUserData(user.userGuid)) {
      db = await dataStore.getDb(user.kbGuid);
    } else {
      db = await dataStore.openPersonalDb(user.userGuid, user.kbGuid);
    }
    //
    const userData = new UserData();
    await userData.setUser(user, db, accountServer);
    await db.updateAccount(userId, password, server, user);
    //
    if (options && options.autoLogin) {
      globalSettings.setLastAccount(user.userGuid);
    } else {
      globalSettings.setLastAccount('');
    }
    //
    this._userMap.set(user.userGuid, userData);
    this.initEvents(user.userGuid, db);
    return user;
  }

  _processServer(server: string) {
    let result = trim(trim(server), '/');
    if (!result.startsWith('https://') && !result.startsWith('http://')) {
      result = `https://${result}`;
    }
    return result;
  }

  getLink(userGuid: string, name: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    userData.getLink(name);
  }

  async signUp(server: string, userId: string, password: string, options: {
    mergeLocalAccount?: boolean,
    noCheckExists?: boolean,
    autoLogin?: boolean,
  } = {}) {
    // eslint-disable-next-line no-param-reassign
    server = this._processServer(server);
    const as = new AccountServer();
    const user = await as.signUp(server, userId, password, options);
    //
    await this._processUser(user, options, {
      server, userId, password, accountServer: as,
    });
    //
    if (!options.mergeLocalAccount) {
      const userData = this.getUserData(user.userGuid);
      assert(userData);
      const db = await userData.getDb(user.kbGuid);
      assert(db);
      const note = await db.createGuideNote();
      userData.setSettings('lastNote', note.guid);
    }
    //
    return user;
  }

  async onlineLogin(server: string, userId: string, password: string, options: {
    mergeLocalAccount?: boolean,
    autoLogin?: boolean,
    noCheckExists?: boolean,
    noRetry?: boolean,
  } = {}) {
    // eslint-disable-next-line no-param-reassign
    server = this._processServer(server);
    //
    const as = new AccountServer();
    const user = await as.login(server, userId, password, options);
    //
    await this._processUser(user, options, {
      server, userId, password, accountServer: as,
    });
    return user;
  }

  async localLogin() {
    //
    let createdGuideNote: Note | null = null;
    const getUser = async () => {
      //
      const users = await dataStore.getUsers();
      if (users.length === 0) {
        const disableCreateDefaultAccount = wizWrapper && wizWrapper.options?.disableCreateDefaultAccount;
        const createDefaultAccount = !disableCreateDefaultAccount;
        if (createDefaultAccount) {
          const { user, guideNote } = await dataStore.createDefaultAccount();
          createdGuideNote = guideNote;
          return user;
        }
      }
      //
      if (users.length === 1) {
        if (users[0].isLocalUser) {
          return users[0];
        }
      }
      //
      const userGuid = globalSettings.getLastAccount();
      if (!userGuid) {
        return null;
      }
      //
      const user = users.find((element) => element.userGuid === userGuid);
      return user;
    };
    //
    const user = await getUser();
    if (!user) {
      return null;
    }
    //
    const exists = this.getUserData(user.userGuid);
    if (exists) {
      return exists.user;
    }
    //
    const as = new AccountServer();
    assert(user.password);
    as.setCurrentUser(user, user.password, user.server);
    //
    const db = await dataStore.openPersonalDb(user.userGuid, user.kbGuid);
    //
    const userData = new UserData();
    await userData.setUser(user, db, as);
    this._userMap.set(user.userGuid, userData);
    this.initEvents(user.userGuid, db);
    //
    if (createdGuideNote) {
      const note = createdGuideNote as Note;
      userData.setSettings('lastNote', note.guid);
    }
    //
    return user;
  }

  getUserInfo(userGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const user = userData.user;
    //
    return user;
  }

  async refreshUserInfo(userGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const user = await userData.refreshUserInfo();
    return user;
  }

  async logout(userGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    assert(userData.user);
    await dataStore.closeDb(userData.user.kbGuid);
    globalSettings.setLastAccount('');
    this.emitEvent(userGuid, 'logout');
    this._userMap.delete(userGuid);
  }

  async createNote(userGuid: string, kbGuid: string, note: CreateNoteOptions) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const newNote = await db.createNote(note);
    return newNote;
  }

  async deleteNote(userGuid: string, kbGuid: string, noteGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const note = await db.getNote(noteGuid);
    if (!note) {
      return;
    }
    if (note.trash) {
      await db.deletedFromTrash(noteGuid);
    } else {
      await db.moveNoteToTrash(noteGuid);
    }
  }

  async putBackNote(userGuid: string, kbGuid: string, noteGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const note = await db.getNote(noteGuid);
    if (!note) {
      return;
    }
    if (!note.trash) {
      return;
    }
    //
    await db.putBackFromTrash(noteGuid);
  }

  async syncKb(userGuid: string, kbGuid: string, options?: SyncKbOptions) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    await userData.syncKb(kbGuid, options);
  }

  async addImageFromData(userGuid: string, kbGuid: string, noteGuid: string, data: string, options: {
    type?: {
      ext: string,
      mime?: string,
    },
  }) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const ret = await userData.addImageFromData(kbGuid, noteGuid, data, options);
    return ret;
  }

  async addImageFromUrl(userGuid: string, kbGuid: string, noteGuid: string, url: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const ret = await userData.addImageFromUrl(kbGuid, noteGuid, url);
    return ret;
  }

  getUserData(userGuid: string): UserData | undefined {
    const userData = this._userMap.get(userGuid);
    return userData;
  }

  async queryNotes(userGuid: string, kbGuid: string, start: number, count: number, options: QueryNotesOptions = {}) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const notes = await db.queryNotes(start, count, options);
    return notes;
  }

  async getAllTitles (userGuid: string, kbGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const res = await db.getAllTitles();
    return res;
  }

  async getNote(userGuid: string, kbGuid: string, noteGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const note = await db.getNote(noteGuid);
    return note;
  }

  async getNoteMarkdown(userGuid: string, kbGuid: string, noteGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const markdown = await db.getNoteMarkdown(noteGuid);
    return markdown;
  }

  async setNoteMarkdown(userGuid: string, kbGuid: string, noteGuid: string, markdown: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    await db.setNoteMarkdown(noteGuid, markdown);
  }

  async getBackwardLinkedNotes(userGuid: string, kbGuid: string, title: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    return await db.getBackwardLinkedNotes(title);
  }

  async downloadNoteResource(userGuid: string, kbGuid: string, noteGuid: string, resName: string) {
    const userData = this.getUserData(userGuid);
    if (!userData) {
      return;
    }
    await userData.downloadNoteResource(kbGuid, noteGuid, resName);
  }

  async hasNotesInTrash(userGuid: string, kbGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const result = await db.hasNotesInTrash();
    return result;
  }

  async getAllTags(userGuid: string, kbGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const tags = await db.getAllTags();
    return tags;
  }

  async getAllLinks(userGuid: string, kbGuid: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    const tags = await db.getAllLinks();
    return tags;
  }

  async renameTag(userGuid: string, kbGuid: string, from: string, to: string) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    await db.renameTag(from, to);
  }

  async setNoteStarred(userGuid: string, kbGuid: string, noteGuid: string, starred: boolean) {
    //
    const userData = this.getUserData(userGuid);
    assert(userData);
    const db = await userData.getDb(kbGuid);
    assert(db);
    await db.setNoteStarred(noteGuid, starred);
  }

  getSettings(userGuid: string, key: string, defaultValue: string | number | Date) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    return userData.getSettings(key, defaultValue);
  }

  setSettings(userGuid: string, key: string, value: string | number | Date) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    userData.setSettings(key, value);
  }

  registerListener(userGuid: string, listener: any) {
    const userData = this.getUserData(userGuid);
    assert(userData);
    userData.registerListener(listener);
  }

  unregisterListener(listener: any) {
    for (const userGuid of Array.from(this._userMap.keys())) {
      const userData = this.getUserData(userGuid);
      assert(userData);
      userData.unregisterListener(listener);
    }
  }

  emitEvent(userGuid: string, eventName: string, ...args: any) {
    const userData = this.getUserData(userGuid);
    if (!userData) {
      console.error(`failed to get user data: ${userGuid}, ${new Error().stack}`);
      return;
    }
    const listeners = userData.allListeners;
    if (!listeners) {
      return;
    }
    //
    for (const listener of Array.from(listeners)) {
      listener.send(eventName, ...args);
    }
  }

  initEvents(userGuid: string, db: WizDb) {
    db.on('newNote', async (note) => {
      const kbGuid = await db.getKbGuid();
      this.emitEvent(userGuid, 'newNote', kbGuid, note);
      this.syncKb(userGuid, kbGuid, {
        uploadOnly: true,
      });
    });
    //
    db.on('modifyNote', async (note) => {
      const kbGuid = await db.getKbGuid();
      this.emitEvent(userGuid, 'modifyNote', kbGuid, note);
      this.syncKb(userGuid, kbGuid, {
        uploadOnly: true,
      });
    });
    db.on('deleteNotes', async (noteGuids, options) => {
      const kbGuid = await db.getKbGuid();
      this.emitEvent(userGuid, 'deleteNotes', kbGuid, noteGuids, options);
      if (!options.permanentDeleted) {
        this.syncKb(userGuid, kbGuid, {
          uploadOnly: true,
        });
      }
    });
    db.on('putBackNotes', async (noteGuids, options) => {
      const kbGuid = await db.getKbGuid();
      this.emitEvent(userGuid, 'putBackNotes', kbGuid, noteGuids, options);
      this.syncKb(userGuid, kbGuid, {
        uploadOnly: true,
      });
    });
    db.on('tagsChanged', async (noteGuid) => {
      const kbGuid = await db.getKbGuid();
      this.emitEvent(userGuid, 'tagsChanged', kbGuid, noteGuid);
    });
    db.on('tagRenamed', async (noteGuid, from, to) => {
      const kbGuid = await db.getKbGuid();
      this.emitEvent(userGuid, 'tagRenamed', kbGuid, noteGuid, from, to);
    });
    db.on('linksChanged', async (noteGuid) => {
      const kbGuid = await db.getKbGuid();
      this.emitEvent(userGuid, 'linksChanged', kbGuid, noteGuid);
    });
    db.on('userInfoChanged', async (user) => {
      this.emitEvent(userGuid, 'userInfoChanged', user);
    });
    //

    const userData = this.getUserData(userGuid);
    assert(userData);
    //
    userData.on('syncStart', (_userGuid, kbGuid) => {
      this.emitEvent(userGuid, 'syncStart', kbGuid);
    });

    userData.on('syncFinish', (_userGuid, kbGuid, ret, options) => {
      this.emitEvent(userGuid, 'syncFinish', kbGuid, ret, options);
    });

    userData.on('syncError', (_userGuid, kbGuid, err, options) => {
      const error = {
        code: err.code,
        externCode: err.externCode,
        message: err.message,
        returnCode: err.returnCode,
        returnMessage: err.returnMessage,
        stack: err.stack,
      };
      this.emitEvent(userGuid, 'syncFinish', kbGuid, { error }, options);
    });

    userData.on('downloadNotes', (_userGuid, kbGuid, downloadedNotes) => {
      this.emitEvent(userGuid, 'downloadNotes', kbGuid, downloadedNotes);
    });

    userData.on('uploadNote', (_userGuid, kbGuid, note) => {
      this.emitEvent(userGuid, 'uploadNote', kbGuid, note);
    });

    db.setDownloadNoteHandler(async (database: WizDb, noteGuid: string) => {
      assert(userData.user);
      assert(userData._refreshToken);
      const result = await downloadNoteData(userData.user,
        database, noteGuid, userData._refreshToken);
      return result;
    });
  }
}

const users = new Users();

export default users;
