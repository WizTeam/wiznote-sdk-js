import wizWrapper, { WizStore } from '../wrapper';

const Store = wizWrapper.Store;

class UserSettings {
  _store: WizStore;
  constructor(userGuid: string) {
    this._store = new Store({
      name: userGuid,
    });
  }

  setSettings(key: string, value: string | number | Date | boolean) {
    if (value === undefined || value === null) {
      this._store.delete(key);
      return;
    }
    this._store.set(key, value);
  }

  getSettings(key: string, defaultValue: string | number | Date) {
    const value = this._store.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    return value;
  }
}

export default UserSettings;
