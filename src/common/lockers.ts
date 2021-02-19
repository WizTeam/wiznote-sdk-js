import AwaitLocker from './await_lock';

class Lockers {
  _map: Map<string, AwaitLocker>;
  constructor() {
    this._map = new Map();
  }

  getLocker(key: string) {
    let locker = this._map.get(key);
    if (!locker) {
      locker = new AwaitLocker();
      this._map.set(key, locker);
    }
    return locker;
  }

  async lock(key: string, timeout?: number) {
    const locker = this.getLocker(key);
    await locker.acquireAsync(timeout);
  }

  release(key: string) {
    const locker = this.getLocker(key);
    locker.release();
  }

  isLocking(key: string) {
    if (!this._map.has(key)) {
      return false;
    }
    const locker = this.getLocker(key);
    return locker.acquired();
  }
}

const lockers = new Lockers();

export function getLocker(key: string) {
  return lockers.getLocker(key);
}

export function lock(key: string) {
  return lockers.lock(key);
}

export function release(key: string) {
  return lockers.release(key);
}

export function isLocking(key: string) {
  return lockers.isLocking(key);
}