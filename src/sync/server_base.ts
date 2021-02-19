import * as WizRequest from '../common/request';

class ServerBase {
  _invalidTokenHandler?:  () => Promise<string | null>;

  constructor() {
  }

  setInvalidTokenHandler(handler: () => Promise<string | null>) {
    this._invalidTokenHandler = handler;
  }

  async refreshToken() {
    if (this._invalidTokenHandler) {
      const token = await this._invalidTokenHandler();
      if (token) {
        this._onTokenUpdated(token);
      }
      return token;
    }
    return null;
  }

  _onTokenUpdated(token: string) {
  }

  async request(options: {
    // axios options
    url: string,
    method: string,
    token: string,
    noRetry?: boolean,
    responseType?: string,
    data?: any,
    headers?: {
      [index: string]: string,
    },
    // ext options
    returnFullResult?: boolean,
    useAppPost?: boolean,
  }) {
    try {
      const ret = await WizRequest.standardRequest(options);
      return ret;
    } catch (err) {
      if (err.code !== 301) {
        throw err;
        // invalid token
      }
      if (options.noRetry) {
        throw err;
      }
      const token = await this.refreshToken();
      if (!token) {
        throw err;
      }
      //
      const newOptions = Object.assign(options, { token });
      const ret = await WizRequest.standardRequest(newOptions);
      return ret;
    }
  }
}

export default ServerBase;
