import path from 'path';
import { error } from 'wiznote-sdk-js-share';
import mime from 'mime-types';
import ServerBase from './server_base';
import * as paths from '../common/paths';
import wizWrapper from '../wrapper';
import { User, Note, ServerNote, DeleteObject } from '../common/interface';

const { WizNotExistsError } = error;

const { fs } = wizWrapper;

class KnowledgeServer extends ServerBase {
  _kbGuid: string;
  _serverUrl: string;
  _user: User;
  FormData: any;

  constructor(user: User, kbGuid: string, serverUrl: string) {
    super();
    this._kbGuid = kbGuid;
    this._serverUrl = serverUrl;
    this._user = user;
  }

  _onTokenUpdated(token: string) {
    console.log('token updated');
    this._user.token = token;
  }
  //
  static _getMaxVersion(objects: {
    version: number,
  }[], start: number) {
    let max = start;
    objects.forEach((element) => {
      max = Math.max(start, element.version);
    });
    return max;
  }

  //
  async uploadNote(note: Note) {
    //
    const kbGuid = this._kbGuid;
    const resourcePath = paths.getNoteResources(this._user.userGuid, kbGuid, note.guid);
    //
    const uploadNoteResource = async (key: string, resName: string, isLast: boolean) => {
      //
      const resPath = path.join(resourcePath, resName);
      if (! await fs.exists(resPath)) {
        throw new WizNotExistsError(`resource ${resName} does not exists`);
      }
      //
      if (!this.FormData) {
        this.FormData = require('form-data'); // browserify compatible. May throw if FormData is not supported natively.        
      }
      const formData = new this.FormData();
      formData.append('kbGuid', kbGuid);
      formData.append('docGuid', note.guid);
      formData.append('key', key);
      formData.append('objType', 'resource');
      formData.append('objId', resName);
      formData.append('isLast', isLast ? 1 : 0);
      //
      let useAppPost = false;
      if (fs.createReadStream) {
        formData.append('data', fs.createReadStream(resPath), {
          filename: resName,
        });
      } else {
        useAppPost = true;
        const type = mime.lookup(resName);
        formData.append('data', {
          path: resPath,
          type, 
          filename: resName,
       });
      }
      //
      let customHeaders = {};
      if (formData.getHeaders) {
        customHeaders = formData.getHeaders();
      }
      //
      const headers = {
        ...customHeaders,
      };
      const result = await this.request({
        token: this._user.token,
        method: 'post',
        url: `${this._serverUrl}/ks/object/upload/${this._kbGuid}/${note.guid}?`,
        headers,
        data: formData,
        useAppPost,
        returnFullResult: true,
      });
      //
      return result;
    };
    //
    //
    const data = JSON.parse(JSON.stringify(note));
    data.docGuid = note.guid;
    data.kbGuid = this._kbGuid;
    data.infoModified = data.created;
    data.dataModified = data.modified;

    // add size property to resource
    if (data.resources) {
      for (const resource of data.resources) {
        const { size } = await fs.stat(path.join(resourcePath, resource.name));
        resource.size = size;
      }
    }
    //
    const result = await this.request({
      token: this._user.token,
      method: 'post',
      url: `${this._serverUrl}/ks/note/upload/${this._kbGuid}/${note.guid}`,
      data,
      returnFullResult: true,
    });
    //
    const resources = result.resources;
    if (resources && resources.length > 0) {
      for (let i = 0; i < resources.length; i++) {
        const isLast = i === resources.length - 1;
        const resName = resources[i];
        const ret = await uploadNoteResource(result.key, resName, isLast);
        if (isLast) {
          return ret.version;
        }
      }
    }
    //
    return result.version;
  }

  async downloadNoteResource(noteGuid: string, resName: string) {
    const data = await this.request({
      token: this._user.token,
      method: 'get',
      url: `${this._serverUrl}/ks/object/download/${this._kbGuid}/${noteGuid}?objType=resource&objId=${encodeURIComponent(resName)}`,
      responseType: 'arraybuffer',
      returnFullResult: true,
    });
    return data;
  }

  async downloadNote(noteGuid: string) {
    const result = await this.request({
      token: this._user.token,
      method: 'get',
      url: `${this._serverUrl}/ks/note/download/${this._kbGuid}/${noteGuid}?downloadData=1`,
      returnFullResult: true,
    });
    return result;
  }

  //
  async downloadNotes(startVersion: number, callback: (notes: ServerNote[], maxVersion: number) => Promise<void>) {
    //
    let start = startVersion;
    const count = 100;
    //
    for (;;) {
      const notes = await this.request({
        token: this._user.token,
        method: 'get',
        url: `${this._serverUrl}/ks/note/list/version/${this._kbGuid}?version=${start}&count=${count}&type=lite&withAbstract=true`,
      });
      //
      const maxVersion = KnowledgeServer._getMaxVersion(notes, start);
      await callback(notes, maxVersion);
      //
      if (notes.length < count) {
        break;
      }
      //
      start = maxVersion;
    }
  }

  async downloadDeletedObjects(startVersion: number, callback: (objects: DeleteObject[], maxVersion: number) => Promise<void>) {
    //
    let start = startVersion;
    const count = 100;
    //
    for (;;) {
      const objects = await this.request({
        token: this._user.token,
        method: 'get',
        url: `${this._serverUrl}/ks/deleted/list/version/${this._kbGuid}?version=${start}&count=${count}`,
      });
      //
      const maxVersion = KnowledgeServer._getMaxVersion(objects, start);
      await callback(objects, maxVersion);
      //
      if (objects.length < count) {
        break;
      }
      //
      start = maxVersion;
    }
  }

  //
  async uploadDeletedObjects(objects: DeleteObject[]): Promise<number> {
    //
    const result = await this.request({
      token: this._user.token,
      method: 'post',
      url: `${this._serverUrl}/ks/deleted/upload/${this._kbGuid}`,
      data: objects,
      returnFullResult: true,
    });
    //
    return result.version;
  }
}

export default KnowledgeServer;
