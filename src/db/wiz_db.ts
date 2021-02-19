import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import md5 from 'md5';
import { EventEmitter } from 'events';
import removeMd from 'remove-markdown';
import trim from 'lodash/trim';
import isEqual from 'lodash/isEqual';
import intersection from 'lodash/intersection';
import Sqlite from './sqlite_db';
import * as paths from'../common/paths';
import * as share from 'wiznote-sdk-js-share';
import wiznoteSqlCommands from'./wiz_sql_commands';
import * as noteData from'./note_data';
import enc from'../common/enc';
import { highlightText } from'../utils/word';
import wizWrapper from '../wrapper';
import { assert } from 'console';
import {
  Note,
  LOCAL_STATUS_DOWNLOADED,
  LOCAL_STATUS_NEED_REDOWNLOAD,
  VERSION_INFO_CHANGED,
  VERSION_DATA_CHANGED,
  User,
} from '../common/interface';

const { WizInternalError, WizNotExistsError, WizInvalidParamError } = share.error;
const fs = wizWrapper.fs;

function isDataChanged(version: number) {
  return version === VERSION_DATA_CHANGED;
}

// function isInfoChanged(version) {
//   return version < 0;
// }

export interface TagInfo {
  wizName?: string,
  wizFull?: string,
  [index: string]: TagInfo | string | undefined,
}

export interface QueryNotesOptions {
  tags?: string | string[];
  trash?: boolean;
  starred?: boolean;
  archived?: boolean;
  onTop?: boolean;
  title?: string;
  searchText?: string;
  withText?: boolean;
  analysisTags?: boolean;
}

export interface CreateNoteOptions {
  guid?: string;
  type?: string;
  category?: string;
  markdown?: string;
  html?: string;
  tag?: string;
  images?: string[];
  title?: string;
  created?: number;
  modified?: number;
  fileType?: string | undefined | null;
  name?: string | undefined | null;
  seo?: string | undefined | null;
  url?: string | undefined | null;
  tags?: string | undefined | null;
  owner?: string | undefined | null;
}

class WizDb extends EventEmitter {
  _basePath: string;
  _sqlite: Sqlite;
  _kbGuid: string;
  _userGuid: string;
  _downloadNoteHandler?: (database: WizDb, noteGuid: string) => Promise<any>;

  constructor(userGuid: string, kbGuid: string, isPersonalKb: boolean) {
    super();
    const p = path.join(paths.getUsersData(), userGuid);
    const fileName = isPersonalKb ? 'index' : kbGuid;
    this._basePath = p;
    const dbPath = path.join(p, `${fileName}.db`);
    // console.log(dbPath);
    this._sqlite = new Sqlite(dbPath);
    this._kbGuid = kbGuid;
    this._userGuid = userGuid;
  }

  get userGuid() {
    return this._userGuid;
  }

  setDownloadNoteHandler(handler: (database: WizDb, noteGuid: string) => Promise<any>) {
    this._downloadNoteHandler = handler;
  }

  //
  async setMeta(key: string, value: string | number) {
    const now = new Date().valueOf();
    await this._sqlite.run(`INSERT INTO wiz_meta(key, value, updated) VALUES(?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=?, updated=?;`,
    [key, value, now, value, now]);
  }

  //
  async getMeta(key: string, defaultValue?: string | number): Promise<string | number | undefined> {
    const sql = `SELECT value FROM wiz_meta WHERE key=?`;
    const values = [key];
    const value = await this._sqlite.fieldValue(sql, values, 'value', false);
    if (value === null || value === undefined) {
      return defaultValue;
    }
    return value as string;
  }

  //
  async open() {
    await fs.ensureDir(this._basePath);
    await this._sqlite.open();
    await this._sqlite.update(wiznoteSqlCommands);
  }

  // close
  async close() {
    await this._sqlite.close();
    (this._sqlite as any) = null;
  }

  async updateAccount(userId: string, password: string, server: string, user: User) {
    await this.setMeta('userId', userId);
    await this.setMeta('password', enc.aes.encryptText(password, user.userGuid));
    await this.setMeta('server', server);
    await this.updateUserInfo(user);
  }

  async updateUserInfo(user: User) {
    // console.log(user);
    await this.setMeta('user', JSON.stringify(user));
    this.emit('userInfoChanged', user);
  }

  async getUserInfo() {
    const userText = await this.getMeta('user');
    if (!userText) {
      return null;
    }
    assert(typeof userText === 'string');
    const user = JSON.parse(userText as string);
    return user;
  }

  // account info
  async getAccountInfo() {
    const userText = await this.getMeta('user');
    if (!userText) {
      return null;
    }
    const user = JSON.parse(userText as string);
    user.server = await this.getMeta('server');
    try {
      const encryptedPassword = await this.getMeta('password');
      user.password = enc.aes.decryptText(`${encryptedPassword}`, user.userGuid);
    } catch (err) {
      console.error(err);
      user.password = '';
    }
    return user;
  }

  async getKbGuid() {
    if (this._kbGuid) {
      return this._kbGuid;
    }
    //
    const accountInfo = await this.getAccountInfo();
    return accountInfo.kbGuid;
  }

  async getServerUrl() {
    const accountInfo = await this.getAccountInfo();
    return accountInfo.kbServer;
  }

  async getObjectsVersion(objectType: string): Promise<number> {
    const version = await this.getMeta(`${objectType}_version`, 0);
    return version as number;
  }

  async setObjectsVersion(objectType: string, version: number) {
    await this.setMeta(`${objectType}_version`, version);
  }

  async _getNotes(sqlWhere: string, values?: any[]) {
    const sql = `select * from wiz_note ${sqlWhere}`;
    const notes = await this._sqlite.all(sql, values);
    const kbGuid = await this.getKbGuid();
    for (const note of notes) {
      note.fileType = note.file_type;
      note.attachmentCount = note.attachment_count;
      note.dataMd5 = note.data_md5;
      note.localStatus = note.local_status;
      note.onTop = note.on_top;
      note.lastSynced = note.last_synced;
      note.kbGuid = kbGuid;
      //
      delete note.file_type;
      delete note.attachment_count;
      delete note.data_md5;
      delete note.local_status;
      delete note.on_top;
      delete note.last_synced;
      //
    }
    return notes;
  }

  async getNote(guid: string) {
    const sqlWhere = `where guid=? and (deleted is null or deleted = 0)`;
    const values = [guid];
    const notes = await this._getNotes(sqlWhere, values);
    if (notes.length === 0) {
      return null;
    }
    return notes[0];
  }

  async getNotesGuidByTag(name: string) {
    const nameValue = `#${name}/$`;
    const sql = `select guid as guid from wiz_note where tags like ?`;
    const values = [
      nameValue,
    ];
    //
    const rows = await this._sqlite.all(sql, values);
    return rows.map((row) => row.guid);
  }

  async queryNotes(start: number, count: number, options: QueryNotesOptions = {}): Promise<Note[]> {
    //
    const conditions = [];
    const values = [];
    if (options.tags) {
      let tags = options.tags;
      if (!Array.isArray(tags)) {
        tags = [tags];
      }
      tags.forEach((name) => {
        const nameValue = `%#${name}/%`;
        const condition = `tags like ?`;
        conditions.push(condition);
        values.push(nameValue);
      });
    }
    //
    if (options.trash) {
      conditions.push('trash=1');
    } else {
      conditions.push('(trash is null or trash = 0)');
    }
    //
    if (options.starred) {
      conditions.push('starred=1');
    }
    if (options.archived) {
      conditions.push('archived=1');
    }
    if (options.onTop) {
      conditions.push('onTop=1');
    }
    if (options.title) {
      conditions.push('title = ?');
      values.push(options.title);
    }
    //
    const sqlWhere = conditions.join(' and ');
    if (!options.searchText) {
      values.push(start, count);
      const notes = await this._getNotes(`where ${sqlWhere} order by modified desc limit ?, ?`, values);
      if (!options.withText) {
        notes.forEach((note) => {
          delete note.text;
          if (options.analysisTags) {
            note.tags = (note.tags?.split('|') ?? []).map((tag: string) => trim(tag, '#/'))
          }
        });
      }
      
      return notes;
    }
    //
    const sql = `select guid from wiz_note where ${sqlWhere}`;
    const categoryGuids = (await this._sqlite.all(sql, values)).map((row) => row.guid);
    //
    const { guids, rows } = await this.getNotesGuidBySearchText(options.searchText);
    const searchedGuid = guids;
    const searchResult = rows;
    //
    let resultsGuid = intersection(searchedGuid, categoryGuids);
    resultsGuid = resultsGuid.slice(start, start + count);
    //
    const notes = await this.getNotesByGuid(resultsGuid);
    //
    const noteMap = new Map();
    notes.forEach((note) => noteMap.set(note.guid, note));
    //
    const searchResultMap = new Map();
    searchResult.forEach((search) => searchResultMap.set(search.guid, search));
    //
    const result: Note[] = [];
    //
    resultsGuid.forEach((guid) => {
      const note = noteMap.get(guid);
      if (!note) {
        return;
      }
      //
      const search = searchResultMap.get(guid);
      note.highlight = {
        title: highlightText(search.title, options.searchText || '', {
          full: true,
        }),
        text: highlightText(search.text, options.searchText || ''),
      };
      //
      result.push(note);
    });
    //
    if (!options.withText) {
      result.forEach((note) => {
        delete note.text;
      });
    }
    //
    return result;
  }

  async getAllTitles(): Promise<string[]> {
    const sql = 'select title from wiz_note order by modified desc';
    const notes = await this._sqlite.all(sql);
    return notes.map((item) => item.title);
  }

  async getNotesByGuid(noteGuidArr: string[]) {
    const guidData = [noteGuidArr.map((guid) => `'${guid}'`).join(', ')];
    const sqlWhere = `where guid in (${guidData}) and (deleted is null or deleted = 0)`;
    const notes = await this._getNotes(sqlWhere, []);
    return notes;
  }

  async getModifiedNotes() {
    const sqlWhere = `where version < 0 and (deleted is null or deleted = 0)`;
    const notes = await this._getNotes(sqlWhere, []);
    return notes;
  }

  async getNextNeedToBeDownloadedNote(includeTrash?: boolean) {
    const sqlWhere = (includeTrash
      ? `where version >= 0 and (local_status=0 or local_status is null) limit 1`
      : `where version >= 0 and (local_status=0 or local_status is null) and (trash is null or trash = 0) limit 1`);
    const notes = await this._getNotes(sqlWhere, []);
    if (notes.length === 0) {
      return null;
    }
    return notes[0];
  }

  async getDeletedNotes() {
    const sqlWhere = `where deleted = 1`;
    const notes = await this._getNotes(sqlWhere, []);
    return notes;
  }

  async _changeTrashStatus(noteGuid: string, trash: number) {
    const note = await this.getNote(noteGuid);
    if (!note) {
      return null;
    }
    //
    const oldTags = await this.getAllTagsName();
    //
    let version = note.version;
    if (version !== VERSION_DATA_CHANGED) {
      version = VERSION_INFO_CHANGED;
    }
    //
    const sql = `update wiz_note set trash=?, deleted=0, version=? where guid=?`;
    const values = [trash, version, noteGuid];
    await this._sqlite.run(sql, values);
    //
    const newTags = await this.getAllTagsName();
    //
    if (!isEqual(oldTags, newTags)) {
      this.emit('tagsChanged');
    }
    note.version = version;
    note.trash = trash;
    return note;
  }

  async moveNoteToTrash(noteGuid: string) {
    const note = await this._changeTrashStatus(noteGuid, 1);
    if (!note) {
      return null;
    }
    this.emit('deleteNotes', [noteGuid], {
      permanentDelete: false,
    }, [note]);
    this.emit('modifyNote', note);
    return note;
  }


  async putBackFromTrash(noteGuid: string) {
    const note = await this._changeTrashStatus(noteGuid, 0);
    if (!note) {
      return null;
    }
    this.emit('putBackNotes', [noteGuid], [note]);
    this.emit('modifyNote', note);
    return note;
  }

  async deletedFromTrash(noteGuid: string) {
    //
    const note = await this.getNote(noteGuid);
    if (!note) {
      return;
    }
    this.emit('deleteNotes', [noteGuid], {
      permanentDelete: true,
    });
    note.trash = 1;
    note.deleted = 1;
    this.emit('modifyNote', note);
    //
    const sql = `update wiz_note set trash=1, deleted=1 where guid=?`;
    const values = [noteGuid];
    await this._sqlite.run(sql, values);
  }

  async permanentDeleteNotesByGuid(guids: string[]) {
    //
    const guidsSql = guids.map((guid) => `'${guid}'`).join(',');
    const sql = `delete from wiz_note where guid in (${guidsSql})`;
    const ret = await this._sqlite.run(sql);
    console.log(`deleted ${ret} notes`);
    return ret;
  }

  async setNoteVersion(noteGuid: string, version: number) {
    if (version >= 0) {
      const sql = `update wiz_note set version=?, last_synced=? where guid=?`;
      const now = new Date().valueOf();
      const values = [version, now, noteGuid];
      await this._sqlite.run(sql, values);
    } else {
      const sql = `update wiz_note set version=? where guid=?`;
      const values = [version, noteGuid];
      await this._sqlite.run(sql, values);
    }
    //
    const result = await this.getNote(noteGuid);
    return result;
  }

  async setNoteLocalStatus(noteGuid: string, status: number) {
    const sql = `update wiz_note set local_status=? where guid=?`;
    const values = [status, noteGuid];
    await this._sqlite.run(sql, values);
  }

  async setNoteText(noteGuid: string, text: string) {
    const sql = `update wiz_note set text=? where guid=?`;
    const values = [text, noteGuid];
    await this._sqlite.run(sql, values);
  }

  async syncNote(note: Note) {
    //
    const old = await this.getNote(note.guid);
    if (!old) {
      const sql = `insert into wiz_note(guid, title, category, 
        name, seo, url,
        tags, owner, type, file_type, 
        created, modified, encrypted, attachment_count,
        data_md5, version, local_status, abstract,
        starred, archived, on_top, trash) 
        values (?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )`;
      //
      const values = [note.guid, note.title, note.category || '/Lite/',
        note.name, note.seo, note.url,
        note.tags, note.owner, note.type, note.fileType,
        note.created, note.dataModified, note.encrypted, note.attachmentCount,
        note.dataMd5, note.version, 0, note.abstract,
        note.starred, note.archived, note.onTop, note.trash];
      //
      await this._sqlite.run(sql, values);
      return true;
    }
    //
    if (isDataChanged(old.version)) {
      console.error(`${old.title} has changed in local, should not be overwritten by server`);
      return false;
    }
    if (old.version === note.version) {
      // 避免用服务器的abstract（有延迟）覆盖本地的abstract
      console.log(`${note.title} not changed, skip.`);
      return false;
    }
    //
    const needRedownload = note.dataMd5 !== old.dataMd5;
    const localStatus = needRedownload ? LOCAL_STATUS_NEED_REDOWNLOAD : LOCAL_STATUS_DOWNLOADED;
    //
    const sql = `update wiz_note set title=?, category=?, name=?, seo=?,
      url=?,
      tags=?, owner=?, type=?, file_type=?, 
      created=?, modified=?, encrypted=?, attachment_count=?,
      data_md5=?, version=?, local_status=?, abstract=?,
      starred=?, archived=?, on_top=?, trash=?
      where guid=?`;
    const values = [note.title, note.category, note.name, note.seo,
      note.url,
      note.tags, note.owner, note.type, note.fileType,
      note.created, note.modified, note.encrypted, note.attachmentCount,
      note.dataMd5, note.version, localStatus, note.abstract,
      note.starred, note.archived, note.onTop, note.trash,
      note.guid];
    //
    await this._sqlite.run(sql, values);
    return true;
  }

  async syncNoteData(noteGuid: string, html: string) {
    const kbGuid = await this.getKbGuid();
    await noteData.writeNoteHtml(this._userGuid, kbGuid, noteGuid, html);
    await this.setNoteLocalStatus(noteGuid, LOCAL_STATUS_DOWNLOADED);
    const markdown = noteData.getMarkdownFromHtml(html);
    await this.updateNoteLinks(noteGuid, markdown);
    const text = removeMd(markdown);
    await this.setNoteText(noteGuid, text);
  }

  async downloadNoteMarkdown(noteGuid: string) {
    if (this._downloadNoteHandler) {
      const kbGuid = await this.getKbGuid();
      const result = await this._downloadNoteHandler(this, noteGuid);
      await noteData.writeNoteHtml(this._userGuid, kbGuid, noteGuid, result.html);
      await this.setNoteLocalStatus(noteGuid, LOCAL_STATUS_DOWNLOADED);
      const markdown = noteData.getMarkdownFromHtml(result.html);
      const text = removeMd(markdown);
      await this.setNoteText(noteGuid, text);
      return markdown;
    }
    //
    throw new WizInternalError('no download note handler');
  }

  async getAllTagsName(): Promise<string[]> {
    const sql = `select distinct tags from wiz_note where (trash is null or trash = 0)`;
    const rows = await this._sqlite.all(sql, []);
    const nameSet = new Set<string>();
    rows.forEach((row) => {
      if (!row.tags) {
        return;
      }
      const tags = row.tags.split('|').map((tag: string) => trim(tag, '#/'));
      tags.forEach((tag: string) => nameSet.add(tag));
    });
    return Array.from(nameSet);
  }

  //
  async getAllTags() {
    //
    const allTags = await this.getAllTagsName();
    //
    const result: TagInfo = {};
    allTags.forEach((name) => {
      const tags = name.split('/');
      let parent = result;
      let fullPath = '';
      tags.forEach((tag: string) => {
        fullPath = fullPath ? `${fullPath}/${tag}` : tag;
        if (!parent[tag]) {
          parent[tag] = {
            wizName: tag,
            wizFull: fullPath,
          };
        }
        parent = parent[tag] as TagInfo;
      });
    });
    //
    return result;
  }

  async getAllLinks() {
    const sql = `select note_title as title, note_guid as noteGuid from wiz_note_links`;
    const rows = await this._sqlite.all(sql, []);
    return rows;
  }

  async getNoteTags(noteGuid: string) {
    const note = await this.getNote(noteGuid);
    if (!note) {
      throw new WizNotExistsError(`note ${noteGuid} does not exists`);
    }
    const tagsValue = note.tags || '';
    if (!tagsValue) {
      return [];
    }
    const tags = tagsValue.split('|');
    return tags.map((tag: string) => trim(tag, '#/'));
  }

  async getNoteLinks(noteGuid: string) {
    const sql = `select note_title as title from wiz_note_links where note_guid=?`;
    const values = [noteGuid];
    const rows = await this._sqlite.all(sql, values);
    return rows.map((row) => row.title).sort();
  }

  getNoteTagsFromMarkdown(markdown: string) {
    const tags = noteData.extractTagsFromMarkdown(markdown).sort();
    const tagsValue = tags.map((tag) => `#${tag}/`).join('|');
    return tagsValue;
  }

  async updateNoteTags(noteGuid: string, markdown: string) {
    //
    const tags = noteData.extractTagsFromMarkdown(markdown).sort();
    const oldTags = await this.getNoteTags(noteGuid);

    if (isEqual(tags, oldTags)) {
      return;
    }
    //
    const tagsValue = tags.map((tag) => `#${tag}/`).join('|');
    const sql = `update wiz_note set tags=? where guid=?`;
    const values = [tagsValue, noteGuid];
    await this._sqlite.run(sql, values);
    //
    this.emit('tagsChanged', noteGuid);
  }


  async updateNoteLinks(noteGuid: string, markdown: string) {
    //
    const links = noteData.extractLinksFromMarkdown(markdown).sort();
    const oldLinks = await this.getNoteLinks(noteGuid);

    if (isEqual(links, oldLinks)) {
      return;
    }
    //
    const deleteSql = `delete from wiz_note_links where note_guid=?`;
    const deleteValues = [noteGuid];
    await this._sqlite.run(deleteSql, deleteValues);
    //
    const insertSql = `insert into wiz_note_links (note_guid, note_title) values(?, ?)`;
    for (const title of links) {
      const insertValues = [noteGuid, title];
      await this._sqlite.run(insertSql, insertValues);
    }
    //
    this.emit('linksChanged', noteGuid);
  }

  //
  async renameTag(from: string, to: string) {
    //
    const notes = await this.getNotesGuidByTag(from);
    const options = {
      noModifyTime: true,
      noUpdateTags: true,
    };
    //
    let renamed = false;
    //
    for (const note of notes) {
      //
      const markdown = await this.getNoteMarkdown(note.guid);
      // TODO: #from/ or #from_(space) or #from\n(回车)
      const reg = new RegExp(`#${from}`, 'ig');
      const modifiedMarkdown = markdown.replace(reg, `#${to}`);
      if (markdown !== modifiedMarkdown) {
        await this.setNoteMarkdown(note.guid, modifiedMarkdown, options);
        renamed = true;
      }
    }
    //
    const tags = await this.getAllTagsName();
    for (const name of tags) {
      // TODO: 判断是否是标签开始
      if (name.startsWith(from)) {
        // const replaceTo = to + name.substr(from.length);
        // const sql = `update wiz_note_tags set tag_name=? where tag_name=?`;
        // const values = [replaceTo, name];
        // await this._sqlite.run(sql, values);
        // renamed = true;
      }
    }
    //
    if (!renamed) {
      return;
    }
    //
    this.emit('tagRenamed', {
      from,
      to,
    });
  }

  //
  async setNoteMarkdown(noteGuid: string, markdown: string, options: {
    noModifyTime?: boolean;
    noUpdateTags?: boolean;
    noUpdateLinks?: boolean;
  } = {}) {
    const note = await this.getNote(noteGuid);
    note.version = VERSION_DATA_CHANGED;
    note.localStatus = LOCAL_STATUS_DOWNLOADED;
    note.text = removeMd(markdown);
    const kbGuid = await this.getKbGuid();
    await noteData.writeNoteMarkdown(this._userGuid, kbGuid, noteGuid, markdown);
    const processed = await noteData.processNoteResources(this._userGuid, kbGuid, noteGuid);
    if (processed) {
      markdown = await noteData.readNoteMarkdown(this._userGuid, kbGuid, noteGuid);
    }
    note.dataMd5 = md5(markdown);
    if (options.noModifyTime) {
      // do nothing, using old time
    } else {
      note.modified = new Date();
    }
    //
    const { title, abstract } = noteData.extractNoteTitleAndAbstractFromText(note.text);
    if (title !== note.title) {
      await this.fixLinkedNotesMarkdown(noteGuid, note.title, title)
    }
    note.abstract = abstract;
    note.title = title;
   
    //
    const sql = `update wiz_note set title=?, version=?, local_status=?, data_md5=?, modified=?, abstract=?, text=? where guid=?`;
    const values = [note.title, note.version, note.localStatus, note.dataMd5,
      note.modified, note.abstract, note.text, noteGuid];
    await this._sqlite.run(sql, values);
    note.markdown = markdown;
    //
    this.emit('modifyNote', note);
    //
    if (options.noUpdateTags) {
      // do nothing
    } else {
      await this.updateNoteTags(noteGuid, markdown);
    }

    if (!options.noUpdateLinks) {
      await this.updateNoteLinks(noteGuid, markdown);
    }
    //
    return note;
  }

  async updateMarkdownLinksTask(guids: string[], oldTitle: string, newTitle: string) {
    const reg = new RegExp(`[[${oldTitle}]]`.replace(/[.[*?+^$|()/]|\]|\\/g, '\\$&'), 'g');
    for (let i = 0; i < guids.length; i++) {
      const markdown = await this.getNoteMarkdown(guids[i]);
      await this.setNoteMarkdown(guids[i], markdown.replace(reg, `[[${newTitle}]]`), {
        noModifyTime: true,
        noUpdateTags: true,
      });
    }
  }

  async fixLinkedNotesMarkdown(guid: string, oldTitle: string, newTitle: string) {
    const selectNoteTitlesSql = 'select count(guid) as count from wiz_note where title = ? and guid != ?';
    const {count} = await this._sqlite.firstRow(selectNoteTitlesSql, [oldTitle, guid]);
    if (count === 0) {
      const sql = 'select note_guid as noteGuid from wiz_note_links where note_title = ?'
      const list = await this._sqlite.all(sql, [oldTitle]);
  
      this.updateMarkdownLinksTask(list.map(item => item.noteGuid), oldTitle, newTitle);
    }
  }

  async getNoteMarkdown(noteGuid: string) {
    const note = await this.getNote(noteGuid);
    const kbGuid = await this.getKbGuid();
    const exists = await noteData.noteDataExists(this._userGuid, kbGuid, noteGuid);
    if (note.localStatus === LOCAL_STATUS_NEED_REDOWNLOAD
      || !exists) {
      const markdown = await this.downloadNoteMarkdown(noteGuid);
      return markdown;
    }
    //
    const markdown = await noteData.readNoteMarkdown(this._userGuid, kbGuid, noteGuid);
    return markdown;
  }

  //
  async createNote(orgNote: CreateNoteOptions = {}) {
    let note: any = { ...orgNote };
    if (!note.guid) {
      note.guid = uuidv4();
    }
    note.type = note.type || 'lite/markdown';
    note.category = '/Lite/';

    const now = new Date();
    note.created = now;
    note.modified = now;
    //
    const kbGuid = await this.getKbGuid();
    //
    if (note.type === 'lite/markdown') {
      if (note.markdown) {
        await noteData.writeNoteMarkdown(this._userGuid, kbGuid, note.guid, note.markdown);
        const processed = await noteData.processNoteResources(this._userGuid, kbGuid, note.guid);
        if (processed) {
          note.markdown = await noteData.readNoteMarkdown(this._userGuid, kbGuid, note.guid);
        }    
      } else if (note.html) {
        await noteData.writeNoteHtml(this._userGuid, kbGuid, note.guid, note.html);
        note.markdown = noteData.getMarkdownFromHtml(note.html);
      } else {
        note.markdown = await noteData.getMarkdownNoteTemplate();
        await noteData.writeNoteMarkdown(this._userGuid, kbGuid, note.guid, note.markdown);
      }
      //
      if (note.tag) {
        note.markdown += `\n#${note.tag}#\n`;
        note.tags = this.getNoteTagsFromMarkdown(note.markdown);
        await noteData.writeNoteMarkdown(this._userGuid, kbGuid, note.guid, note.markdown);
      }
      //
    } else {
      throw new WizInvalidParamError(`unknown note type: ${note.type}`);
    }
    //
    if (orgNote.images) {
      const resourcePath = paths.getNoteResources(this._userGuid, kbGuid, note.guid);
      await fs.ensureDir(resourcePath);
      for (const image of orgNote.images) {
        const imageName = path.basename(image);
        const newImagePath = path.join(resourcePath, imageName);
        await fs.copyFile(image, newImagePath);
      }
    }
    //
    note.text = removeMd(note.markdown);
    note.dataMd5 = md5(note.markdown);
    note.dataModified = now;
    note.attachmentCount = 0;
    note.fileType = note.fileType || '';
    note.name = note.name || '';
    note.seo = note.seo || '';
    note.url = note.url || '';
    note.encrypted = 0;
    note.version = VERSION_DATA_CHANGED;
    note.localStatus = LOCAL_STATUS_DOWNLOADED;
    //
    if (!note.title || !note.abstract) {
      const { title, abstract } = noteData.extractNoteTitleAndAbstractFromText(note.text);
      if (!note.title) {
        note.title = title;
      }
      if (!note.abstract) {
        note.abstract = abstract;
      }
    }
    //
    const sql = `insert into wiz_note(guid, title, category, 
      name, seo, url,
      tags, owner, type, file_type, 
      created, modified, encrypted, attachment_count,
      data_md5, version, local_status, abstract, text,
      starred, archived, on_top, trash
      ) 
      values (?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )`;
    //
    const {
      guid, title, category,
      name, seo, url,
      tags, owner, type, fileType,
      created, modified, encrypted, attachmentCount,
      dataMd5, version, localStatus, abstract, text,
      starred, archived, onTop, trash,
    } = note;
    //
    const values = [guid, title, category,
      name, seo, url,
      tags, owner, type, fileType,
      created, modified, encrypted, attachmentCount,
      dataMd5, version, localStatus, abstract, text,
      starred, archived, onTop, trash];
    //
    await this._sqlite.run(sql, values);
    await this.updateNoteTags(note.guid, note.markdown);
    //
    this.emit('newNote', note, this);
    //
    note.kbGuid = await this.getKbGuid();
    return note;
  }

  async getNotesGuidBySearchText(key: string) {
    const sql = `select guid, title, text from fts_note where fts_note match(?) ORDER BY bm25(fts_note, 1.0, 100.0, 1.0)`;
    const values = [key];
    const guidRows = await this._sqlite.all(sql, values);
    const guids = guidRows.map((row) => row.guid);
    return { guids, rows: guidRows };
  }

  async setNoteStarred(noteGuid: string, starred: boolean) {
    const note = await this.getNote(noteGuid);
    if (!note) {
      return;
    }
    //
    let version = note.version;
    if (version !== VERSION_DATA_CHANGED) {
      version = VERSION_INFO_CHANGED;
    }
    const starredValue = starred ? 1 : 0;
    const sql = `update wiz_note set starred=?, version=? where guid=?`;
    const values = [starredValue, version, noteGuid];
    await this._sqlite.run(sql, values);
    note.starred = starred;
    this.emit('modifyNote', note);
    //
  }

  async getBackwardLinkedNotes(title: string) {
    const sql = 'select note_guid as noteGuid from wiz_note_links where note_title = ?'
    const list = await this._sqlite.all(sql, [title]);
    const notes = await this.getNotesByGuid(list.map((item) => item.noteGuid))
    return notes;
  }

  async hasNotesInTrash() {
    const sql = `select * from wiz_note where trash=1 limit 1`;
    const rows = await this._sqlite.all(sql);
    return rows.length > 0;
  }

  async createGuideNote() {
    const { markdown, images } = await noteData.getGuideNoteData();
    const note = await this.createNote({
      markdown,
      images,
    });
    return note;
  }
}

export default WizDb;
