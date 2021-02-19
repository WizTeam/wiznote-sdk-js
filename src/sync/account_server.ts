import assert from 'assert';
import URL from 'url';
import * as WizRequest from '../common/request';
import { version, error} from 'wiznote-sdk-js-share';
import { User } from '../common/interface';

const versionUtils = version;
const { WizServerError } = error;

class AccountServer {
  _user?: User;
  _server?: string;
  _password?: string;
  // login
  async signUp(server: string, userId: string, password: string, options: {
    noCheckExists?: boolean,
  }) {
    //
    if (!options.noCheckExists) {
      assert(!this._user, 'User has already logged in');
    }
    await this.checkServerVersion(server);
    //
    const user = await WizRequest.standardRequest(Object.assign({
      method: 'post',
      url: `${server}/as/user/signup`,
      data: {
        userId,
        password,
        noGuideNote: true,
      },
    }, options));
    if (this._user) {
      Object.assign(this._user, user);
    } else {
      this._user = user;
    }
    this._server = server;
    this._password = password;
    return user;
  }

  get isOfficial() {
    assert(this._server);
    const url = URL.parse(this._server);
    if (url.hostname === 'as.wiz.cn') {
      return true;
    }
    return false;
  }

  get server() {
    return this._server;
  }

  get apiServer() {
    if (this.isOfficial) {
      return `https://api.wiz.cn`;
    }
    return this._server;
  }

  getLink(name: string) {
    const apiServer = this.apiServer;
    return `${apiServer}/?p=wiz&c=link&n=${name}`;
  }

  // login
  async login(server: string, userId: string, password: string, options: {
    noCheckExists?: boolean,
    noRetry?: boolean,
  }) {
    //
    if (!options.noCheckExists) {
      assert(!this._user, 'User has already logged in');
    }
    await this.checkServerVersion(server);
    //
    const user = await WizRequest.standardRequest(Object.assign({
      method: 'post',
      url: `${server}/as/user/login`,
      data: {
        userId,
        password,
      },
    }, options));
    if (this._user) {
      Object.assign(this._user, user);
    } else {
      this._user = user;
    }
    this._server = server;
    this._password = password;
    return user;
  }

  //
  get currentUser() {
    assert(this._user, 'User has not logged in');
    return this._user;
  }

  //
  setCurrentUser(user: User, password: string, server: string) {
    assert(!this._user, 'User has already logged in');
    this._user = user;
    this._server = server;
    this._password = password;
  }

  //
  async checkServerVersion(server: string) {
    const url = URL.parse(server);
    if (url.hostname === 'as.wiz.cn') {
      return;
    }
    try {
      const options = {
        url: `${server}/manage/server/version`,
      };
      const version = await WizRequest.standardRequest(options);
      if (versionUtils.compareVersion(version, '1.0.25') < 0) {
        throw new WizServerError('Server update needed', 'WizErrorUpdateServer');
      }
    } catch (err) {
      throw new WizServerError(err.message, 'WizErrorUnknownServerVersion');
    }
  }

  async refreshUserInfo(token: string) {
    const options = {
      url: `${this._server}/as/user/token`,
      method: 'post',
      data: {
        token,
      },
    };
    try {
      const user = await WizRequest.standardRequest(options);
      return user;
    } catch (err) {
      if (err.code === 301) {
        assert(this._server);
        assert(this._user);
        assert(this._password);
        const user = await this.login(this._server, this._user.userId, this._password, {
          noCheckExists: true,
        });
        return user;
      }
      throw err;
    }
  }

  _onTokenUpdated(token: string) {
    console.log('token updated');
    if (this._user) {
      this._user.token = token;
    }
  }
}

export default AccountServer;
