import wizWrapper from '../wrapper';
import path from 'path';

const app = wizWrapper.app;

export function getResourcesPath() {
  const resourcePath = app.getPath('res');
  return resourcePath;
}

export function getAppData() {
  return path.join(app.getPath('appData'), app.name);
}

export function getUsersData() {
  const p = path.join(getAppData(), 'users');
  return p;
}

export function getUserData(userGuid: string) {
  const p = path.join(getUsersData(), userGuid);
  return p;
}

export function getNoteData(userGuid: string, kbGuid: string, noteGuid: string) {
  const p = path.join(getUserData(userGuid), kbGuid, noteGuid);
  return p;
}

export function getNoteResources(userGuid: string, kbGuid: string, noteGuid: string) {
  const p = path.join(getNoteData(userGuid, kbGuid, noteGuid), 'index_files');
  return p;
}

export function getTempPath() {
  const base = app.getPath('temp');
  const rand = new Date().valueOf();
  const newTemp = path.join(base, `${rand}`);
  // TODO: check getTempPath
  // fs.ensureDirSync(newTemp);
  return newTemp;
}
