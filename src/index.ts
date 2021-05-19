import assert from 'assert';
import i18next from 'i18next';
import * as i18n from './i18n';
import users from './user/users';
import * as globalSettings from './settings/global_settings';
import wizWrapper from './wrapper';
import { CreateNoteOptions, QueryNotesOptions } from './db/wiz_db';
import { SyncKbOptions } from './sync/sync_kb_task';
import * as utils from './utils';
import * as paths from './common/paths';
import * as request from './common/request';
import * as lockers from './common/lockers';

export * from './common/interface';

assert(wizWrapper, 'wizWrapper must be initialized before using wiznote sdk');

async function i18nInit(resources: any) {
  await i18n.i18nInit(resources);
}

function getCurrentLang() {
  return i18n.getCurrentLang();
}

async function getAllUsers() {
  const ret = await users.getUsers();
  return ret;
}

function getUserData(userGuid: string) {
  const ret = users.getUserData(userGuid);
  return ret;
}


async function getLink(userGuid: string, name: string) {
  const link = await users.getLink(userGuid, name);
  return link;
}

async function signUp(server: string, userId: string, password: string, options: {
  mergeLocalAccount?: boolean,
  noCheckExists?: boolean,
  autoLogin?: boolean,
} = {}) {
  const user = await users.signUp(server, userId, password, options);
  return user;
}

async function onlineLogin(server: string, userId: string, password: string, options: {
  mergeLocalAccount?: boolean,
  autoLogin?: boolean,
  noCheckExists?: boolean,
  noRetry?: boolean,
} = {}){
  const user = await users.onlineLogin(server, userId, password, options);
  return user;
}

async function getUserInfoFromServer(userGuid: string, token: string, options: {
  with_sns?: boolean,
}) {
  const user = await users.getUserInfoFromServer(userGuid, token, options);
  return user;
}

async function unbindSns(userGuid: string, token: string, options: {
  st: string,
}) {
  const result = await users.unbindSns(userGuid, token, options);
  return result;
}

async function changeAccount(userGuid: string, token: string, options: {
  password: string,
  userId: string,
  newUserId: string
}) {
  const result = await users.changeAccount(userGuid, token, options);
  return result;
}

async function changeUserDisplayName(userGuid: string, token: string, displayName: string) {
  const result = await users.changeDisplayName(userGuid, token, displayName);
  return result;
}

async function changeUserMobile(userGuid: string, token: string, mobile: string) {
  const result = await users.changeMobile(userGuid, token, mobile);
  return result;
}

async function changeUserPassword(userGuid: string, token: string, options: {
  newPwd: string,
  oldPwd: string,
}) {
  const result = await users.changePassword(userGuid, token, options);
  return result;
}

async function localLogin() {
  const user = await users.localLogin();
  return user;
}

async function logout(userGuid: string) {
  await users.logout(userGuid);
}

async function queryNotes(userGuid: string, kbGuid: string, start: number, count: number, options: QueryNotesOptions = {}) {
  const notes = await users.queryNotes(userGuid, kbGuid, start, count, options);
  return notes;
}

async function getAllTitles (userGuid: string, kbGuid: string) {
  return await users.getAllTitles(userGuid, kbGuid);
}

async function getNote(userGuid: string, kbGuid: string, noteGuid: string) {
  const result = await users.getNote(userGuid, kbGuid, noteGuid);
  return result;
}

async function getNoteMarkdown(userGuid: string, kbGuid: string, noteGuid: string) {
  const result = await users.getNoteMarkdown(userGuid, kbGuid, noteGuid);
  return result;
}

async function setNoteMarkdown(userGuid: string, kbGuid: string, noteGuid: string, markdown: string) {
  const result = await users.setNoteMarkdown(userGuid, kbGuid, noteGuid, markdown);
  return result;
}

async function getBackwardLinkedNotes(userGuid: string, kbGuid: string, title: string) {
  const result = await users.getBackwardLinkedNotes(userGuid, kbGuid, title);
  return result;
}

async function createNote(userGuid: string, kbGuid: string, note: CreateNoteOptions) {
  const result = await users.createNote(userGuid, kbGuid, note);
  return result;
}

async function deleteNote(userGuid: string, kbGuid: string, noteGuid: string) {
  const result = await users.deleteNote(userGuid, kbGuid, noteGuid);
  return result;
}

async function putBackNote(userGuid: string, kbGuid: string, noteGuid: string) {
  const result = await users.putBackNote(userGuid, kbGuid, noteGuid);
  return result;
}

async function syncKb(userGuid: string, kbGuid: string, options?: SyncKbOptions) {
  const result = await users.syncKb(userGuid, kbGuid, options);
  return result;
}

async function addImageFromData(userGuid: string, kbGuid: string, noteGuid: string, data: any, options: {
  type?: {
    ext: string,
    mime?: string,
  }
}) {
  const result = await users.addImageFromData(userGuid, kbGuid, noteGuid, data, options);
  return result;
}


async function addImageFromUrl(userGuid: string, kbGuid: string, noteGuid: string, url: string) {
  const result = await users.addImageFromUrl(userGuid, kbGuid, noteGuid, url);
  return result;
}

function getSettings(key: string, defaultValue: string | number | Date) {
  return globalSettings.getSettings(key, defaultValue);
}

function setSettings(key: string, value: string | number | Date) {
  globalSettings.setSettings(key, value);
}

function getUserSettings(userGuid: string, key: string, defaultValue: string | number | Date) {
  return users.getSettings(userGuid, key, defaultValue);
}

function setUserSettings(userGuid: string, key: string, value: string | number | Date) {
  users.setSettings(userGuid, key, value);
}

async function getAllTags(userGuid: string, kbGuid: string) {
  const result = await users.getAllTags(userGuid, kbGuid);
  return result;
}

async function getAllLinks(userGuid: string, kbGuid: string) {
  const result = await users.getAllLinks(userGuid, kbGuid);
  return result;
}

async function renameTag(userGuid: string, kbGuid: string, from: string, to: string) {
  const result = await users.renameTag(userGuid, kbGuid, from, to);
  return result;
}

async function setNoteStarred(userGuid: string, kbGuid: string, noteGuid: string, starred: boolean) {
  const result = await users.setNoteStarred(userGuid, kbGuid, noteGuid, starred);
  return result;
}

async function hasNotesInTrash(userGuid: string, kbGuid: string) {
  const result = await users.hasNotesInTrash(userGuid, kbGuid);
  return result;
}

async function getUserInfo(userGuid: string) {
  const user = users.getUserInfo(userGuid);
  return user;
}


async function refreshUserInfo(userGuid: string) {
  const user = await users.refreshUserInfo(userGuid);
  return user;
}

function registerListener(userGuid: string, listener: any) {
  users.registerListener(userGuid, listener);
}

function unregisterListener(listener: string) {
  users.unregisterListener(listener);
}

async function downloadNoteResource(userGuid: string, kbGuid: string, noteGuid: string, resName: string) {
  await users.downloadNoteResource(userGuid, kbGuid, noteGuid, resName);
}

function emitEvent(userGuid: string, eventName: string, ...args: any[]) {
  users.emitEvent(userGuid, eventName, ...args);
}

const core = {
  paths,
  utils,
  request,
  lockers,
  i18next,
};

export {
  i18nInit,
  getCurrentLang,
  registerListener,
  unregisterListener,
  getAllUsers,
  getUserData,
  getUserInfo,
  signUp,
  onlineLogin,
  localLogin,
  logout,
  queryNotes,
  getLink,
  getNote,
  getNoteMarkdown,
  setNoteMarkdown,
  createNote,
  deleteNote,
  putBackNote,
  syncKb,
  getUserInfoFromServer,
  unbindSns,
  changeAccount,
  changeUserDisplayName,
  changeUserMobile,
  changeUserPassword,
  addImageFromData,
  addImageFromUrl,
  getSettings,
  setSettings,
  getUserSettings,
  setUserSettings,
  getAllTags,
  setNoteStarred,
  hasNotesInTrash,
  refreshUserInfo,
  downloadNoteResource,
  emitEvent,
  getAllTitles,
  getBackwardLinkedNotes,
  core,
}

