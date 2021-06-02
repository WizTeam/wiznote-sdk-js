import { EventEmitter } from 'events';
import KnowledgeServer from './knowledge_server';
import * as noteData from '../db/note_data';
import * as lockers from '../common/lockers';
import WizDb from '../db/wiz_db';
import { User, Note, NoteResource } from '../common/interface';
import wizWrapper from '../wrapper';

const syncAllObjects = wizWrapper.options?.syncAllObjects;

const FLAGS_IN_TRASH = 'd';
const FLAGS_STARRED = 's';
const FLAGS_ARCHIVED = 'a';
const FLAGS_ON_TOP = 't';

export interface SyncKbOptions {
  downloadTrashNotes?: boolean,
  noWait?: boolean,
  waitDownload?: boolean,
  manual?: boolean,
  uploadOnly?: boolean,
  downloadFirst?: boolean,
  callback?: (data: { error: Error | null, type?: string, status?: string, note?: Note }) => void
}

class SyncKbTask extends EventEmitter {
  _kbGuid: string;
  _ks: KnowledgeServer;
  _db: WizDb;
  _user: User;
  _isRunning: boolean;
  _options: SyncKbOptions;

  constructor(user: User, serverUrl: string, kbGuid: string, db: WizDb, invalidTokenHandler: () => Promise<string | null>, options: SyncKbOptions = {}) {
    super();
    this._kbGuid = kbGuid;
    this._ks = new KnowledgeServer(user, kbGuid, serverUrl);
    this._db = db;
    this._user = user;
    this._isRunning = false;
    this._ks.setInvalidTokenHandler(invalidTokenHandler);
    this._options = options;
  }

  get kbGuid() {
    return this._kbGuid;
  }

  //
  async syncAll() {
    //
    try {
      this._isRunning = true;
      this.emit('start', this);
      this.reportStatus(null, 'sync', 'start');
      //
      const uploadOnly = this._options.uploadOnly;
      const downloadFirst = this._options.downloadFirst;
      const downloadObjects = !uploadOnly;

      let downloadedTagsCount = 0;
      let downloadedNotesCount = 0;
      let uploadedCount = 0;
      let failedNotes = [];
      //
      if (downloadFirst) {
        if (syncAllObjects) {
          downloadedTagsCount = await this.downloadTags();
        }
        // first login, download remote data first
        downloadedNotesCount = await this.downloadNotes();
        await this.uploadDeletedNotes();
        const uploadRet = await this.uploadNotes();
        failedNotes = uploadRet.failedNotes;
        uploadedCount = uploadRet.uploadedCount;
        //
      } else {
        //
        await this.uploadDeletedNotes();
        if (downloadObjects) {
          await this.downloadDeletedObjects();
        }
        //
        const uploadRet = await this.uploadNotes();
        failedNotes = uploadRet.failedNotes;
        uploadedCount = uploadRet.uploadedCount;
        if (downloadObjects) {
          if (syncAllObjects) {
            downloadedTagsCount = await this.downloadTags();
          }  
          downloadedNotesCount = await this.downloadNotes();
        }
      }
      //
      if (downloadObjects) {
        // 不需要等待
        if (this._options.waitDownload) {
          await this.downloadNotesData();
        } else {
          this.downloadNotesData();
        }
      }
      //
      this._isRunning = false;
      this.emit('finish', this, {
        uploadedCount,
        downloadedTagsCount,
        downloadedCount: downloadedNotesCount,
        failedNotes,
      }, this._options);
      //
      this.reportStatus(null, 'sync', 'done');
      //
    } catch (err) {
      this._isRunning = false;
      err.task = this;
      this.emit('error', this, err, this._options);
      this.reportStatus(err);
    }
  }

  async uploadNotes() {
    //
    const notes = await this._db.getModifiedNotes();
    //
    const uploadNote = async (note: Note) => {
      let flags = '';
      if (note.trash) {
        flags += FLAGS_IN_TRASH;
      }
      if (note.starred) {
        flags += FLAGS_STARRED;
      }
      if (note.archived) {
        flags += FLAGS_ARCHIVED;
      }
      if (note.onTop) {
        flags += FLAGS_ON_TOP;
      }
      note.author = flags;
      note.keywords = note.tags;
      note.protected = note.encrypted ? 1 : 0;
      delete note.tags;
      //
      if (!note.title) {
        note.title = '';
      }
      note.title = note.title.trim();
      if (!note.title.endsWith('.md')) {
        note.title += '.md';
      }
      //
      if (note.version === -2) {
        // data modified
        const kbGuid = await this._db.getKbGuid();
        note.html = await noteData.readNoteHtml(this._user.userGuid, kbGuid, note.guid);
        note.resources = noteData.getResourcesFromHtml(note.html);
      }
      //
      const version = await this._ks.uploadNote(note);
      note.version = version;
      note.lastSynced = new Date().valueOf();
      const resultNote = await this._db.setNoteVersion(note.guid, version);
      this.emit('uploadNote', this, resultNote);
    }
    //
    const failedNotes = [];
    for (const note of notes) {
      //
      try {
        this.reportStatus(null, 'uploadNote', '', note);
        await uploadNote(note);
      } catch (err) {
        //
        if (err.code === 'WizErrorInvalidPassword'
        || err.externCode === 'WizErrorPayedPersonalExpired'
        || err.externCode === 'WizErrorFreePersonalExpired') {
          throw err;
        }
        //
        if (err.externCode === 'WizErrorUploadNoteData') {
          note.version = -2;
          try {
            console.error(`should upload note data: ${note.title}`);
            await uploadNote(note);
            continue;
          } catch (err) {
            console.error(err);
          }
        }
        console.error(err);
        failedNotes.push(note.title);
      }
    }
    //
    const uploadedCount = notes.length - failedNotes.length;
    return {
      uploadedCount,
      failedNotes,
    };
  }

  async downloadNoteData(noteGuid: string) {
    const result = await this._ks.downloadNote(noteGuid);
    return result;
  }

  async uploadDeletedNotes() {
    const deletedNotes = await this._db.getDeletedNotes();
    if (deletedNotes.length === 0) {
      return;
    }
    //
    this.reportStatus(null, 'uploadDeletedObjects');
    // deletedGuid, created, modified, type, content, ext, tag, docGuid
    const deletedObjects = deletedNotes.map((note) => ({
      deletedGuid: note.guid,
      type: 'document',
      created: Date.now(),
    }));
    //
    await this._ks.uploadDeletedObjects(deletedObjects);
    await this._db.permanentDeleteNotesByGuid(deletedNotes.map((note) => note.guid));
  }

  async downloadDeletedObjects() {
    const startVersion = await this._db.getObjectsVersion('deleted');
    this.reportStatus(null, 'downloadDeletedObjects');

    await this._ks.downloadDeletedObjects(startVersion as number, async (objects, maxVersion) => {
      const noteGuids = [];
      for (const object of objects) {
        if (object.type === 'document') {
          const exists = await this._db.getNote(object.deletedGuid);
          if (exists) {
            exists.permanentDeleted = true;
            noteGuids.push(object.deletedGuid);
          }
        }
      }
      if (noteGuids.length > 0) {
        await this._db.permanentDeleteNotesByGuid(noteGuids);
      }
      //
      if (objects.length > 0) {
        await this._db.setObjectsVersion('deleted', maxVersion + 1);
      }
      //
    });
  }

  async downloadTags() {
    const startVersion = await this._db.getObjectsVersion('tag');
    //
    this.reportStatus(null, 'downloadTags');
    let tagCount = 0;
    await this._ks.downloadTags(startVersion as number, async (tags, maxVersion) => {
      console.log(tags);
      tagCount += tags.length;
    });
    return tagCount;
  }

  async downloadNotes() {
    const startVersion = await this._db.getObjectsVersion('note');
    //
    this.reportStatus(null, 'downloadNotesInfo');
    let noteCount = 0;
    await this._ks.downloadNotes(startVersion as number, async (notes, maxVersion) => {
      //
      // 避免用服务器的abstract（有延迟）覆盖本地的abstract
      const syncedNotes = [];
      for (const serverNote of notes) {
        //
        const note: any = { ...serverNote };
        note.guid = note.docGuid;
        note.abstract = note.abstractText;
        note.modified = note.dataModified;
        note.encrypted = note.protected ? 1 : 0;
        //
        note.tags = note.keywords;
        const flags = note.author;
        if (flags) {
          for (const flag of flags) {
            if (flag === FLAGS_IN_TRASH) {
              note.trash = true;
            } else if (flag === FLAGS_STARRED) {
              note.starred = true;
            } else if (flag === FLAGS_ARCHIVED) {
              note.archived = true;
            } else if (flag === FLAGS_ON_TOP) {
              note.onTop = true;
            }
          }
        }
        //
        if (!note.title) {
          note.title = '';
        }
        //
        note.title = note.title.trim();
        if (note.title.endsWith('.md') && note.type.startsWith('lite')) {
          note.title = note.title.substr(0, note.title.length - 3);
        }
        //
        const synced = await this._db.syncNote(note);
        if (synced) {
          syncedNotes.push(note);
        }
        noteCount++;
      }
      //
      if (notes.length > 0) {
        await this._db.setObjectsVersion('note', maxVersion + 1);
        this.emit('downloadNotes', this, syncedNotes);
        this._db.emit('tagsChanged');
      }
      //
    });
    //
    return noteCount;
  }

  reportStatus(error: Error | null, type?: string, status?: string, note?: Note) {
    if (this._options?.callback) {
      this._options.callback({
        error,
        type,
        status,
        note,
      });
    }
  }

  async downloadNotesData() {
    const lockerKey = `${this._kbGuid}/download_notes_data`;
    try {
      this.reportStatus(null, 'downloadNotesData', 'start');
      await lockers.lock(lockerKey);
      for (;;) {
        const note = await this._db.getNextNeedToBeDownloadedNote(this._options?.downloadTrashNotes);
        if (!note) {
          this.reportStatus(null, 'downloadNotesData', 'done');
          return;
        }
        //
        this.reportStatus(null, 'downloadNoteData', '', note);
        //
        const result = await this.downloadNoteData(note.guid);
        //
        if (wizWrapper.options?.downloadResources) {
          this.reportStatus(null, 'downloadNoteResources', '', note);
          await this.downloadNoteResources(note.guid, result.resources);
        }
        //
        await this._db.syncNoteData(note.guid, result.html);
      }
    } catch (err) {
      this.reportStatus(err, 'downloadNotesData');
    } finally {
      lockers.release(lockerKey);
    }
  }

  async downloadNoteResource(noteGuid: string, resName: string) {
    const data = await this._ks.downloadNoteResource(noteGuid, resName);
    await noteData.writeNoteResource(this._user.userGuid, this._kbGuid, noteGuid, resName, data);
  }

  async downloadNoteResources(noteGuid: string, resources: NoteResource[]) {
    if (!resources || resources.length === 0) {
      return;
    }
    const promises = resources.map((res) => this.downloadNoteResource(noteGuid, res.name));
    await Promise.all(promises);
  }
}

export default SyncKbTask;
