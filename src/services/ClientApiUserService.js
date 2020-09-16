import utils from '../utils';
import UserService from './UserService';
import TokenActions from '../actions/TokenActions';
import context from '../context';

export default class ClientApiUserService extends UserService {
  tokens = {
    access_token: null,
    refresh_token: null
  };

  constructor(endpoints) {
    let defaultEndpoints = {
      oauthToken: '/oauth/token',
      oauthRevoke: '/oauth/revoke'
    };

    super(utils.mergeObjects(defaultEndpoints, endpoints || {}), true);
  }

  setToken(type, token) {
    this.tokens[type] = Promise.resolve(token);
  }

  getToken(type) {
    return this.tokens[type] || Promise.resolve();
  }

  _setFormContentTypeHeader(headers) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  _setAuthorizationHeader(headers) {
    return this
      .getToken('access_token')
      .then((accessToken) => {
        if (accessToken) {
          headers['Authorization'] = 'Bearer ' + accessToken;
        }
      });
  }

  _makeFormRequest(method, path, body, headers, callback) {
    headers = headers || {};

    this._setFormContentTypeHeader(headers);

    return this._makeRequest(method, path, body, headers, callback);
  }

  _makeRequest(method, path, body, headers, callback) {
    headers = headers || {};

    let waitFor = Promise.resolve();

    if (path === '/me') {
      waitFor = this._setAuthorizationHeader(headers);
    }

    waitFor.then(() => {
      super._makeRequest(method, path, body, headers, callback);
    });
  }

  me(callback) {
    this.getToken('access_token').then((accessToken) => {
      if (!accessToken) {
        return callback(new Error('The \'me\' endpoint requires an access token to be present.'));
      }

      super.me((err, result) => {
        if (err) {
          if (err.type === 'invalid_client' && err.status === 400) {
            TokenActions.set('access_token', null);
            TokenActions.set('refresh_token', null);
          }
          return callback(err);
        }

        callback(null, result);
      });
    });
  }

  _wrapOAuthResponse(callback) {
    return (err, result) => {
      if (err) {
        return callback(err);
      }

      if (result.error) {
        let newError = new Error(result.message);
        newError.type = result.error;
        return callback(newError);
      }

      callback(null, result);
    };
  }

  authenticate(oauthGrantBody, callback) {
    this._makeFormRequest('post', this.endpoints.oauthToken, oauthGrantBody, null, (err, result) => {
      if (err) {
        return callback(err);
      }

      TokenActions.set('access_token', result.access_token, () => {
        TokenActions.set('refresh_token', result.refresh_token, () => {
          callback(null, result);
        });
      });
    })
  }

  login(options, callback) {
    let oauthGrantBody = {
      grant_type: 'password',
      username: options.login,
      password: options.password
    };

    this.authenticate(oauthGrantBody, callback);
  }

  refreshToken(token, callback) {
    let newOptions = {
      grant_type: 'refresh_token',
      refresh_token: token
    };

    this._makeFormRequest('post', this.endpoints.oauthToken, newOptions, null, (err, result) => {
      if (err) {
        return callback(err);
      }

      callback(null, result);
    });
  }

  logout(callback) {
    this.getToken('refresh_token').then((token) => {
      let options = {
        token: token,
        token_type_hint: 'refresh_token'
      };

      this._makeFormRequest('post', this.endpoints.oauthRevoke, options, null, (err, result) => {
        if (err) {
          return callback(err);
        }

        TokenActions.set('access_token', null);
        TokenActions.set('refresh_token', null);

        callback(null, result);
      });
    });
  }
}
