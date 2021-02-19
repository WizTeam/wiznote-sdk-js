import assert from 'assert';
import wizWrapper from '../wrapper';

const Store = wizWrapper.Store;

const store = new Store();

function setSettings(key: string, value: string | number | Date) {
  store.set(key, value);
}

function getSettings(key: string, defaultValue?: string | number | Date) {
  const value = store.get(key);
  if (value === undefined) {
    return defaultValue;
  }
  return value;
}

function setLastAccount(userGuid: string) {
  store.set('lastAccount', userGuid);
}

function getLastAccount(): string | undefined {
  const account = store.get('lastAccount');
  if (!account) {
    return undefined;
  }
  assert(typeof account === 'string');
  return account;
}

export {
  setSettings,
  getSettings,
  setLastAccount,
  getLastAccount,
};
