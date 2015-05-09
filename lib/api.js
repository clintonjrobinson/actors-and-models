"use strict";

exports = module.exports = function(Models) {
  Models.app.use(function *(next) {

    this.enforcePost = function () {
      if (this.method !== 'POST') {
        throw new Error(`API call must be POST, you sent ${this.method}`);
      }
    };

    if (this.path.indexOf(Models.constants.API_PREFIX) === 0) {
      var call = this.path.replace(Models.constants.API_PREFIX, '').split('/');

      switch (call[0]) {
        case 'login':
        {
          let vars = {
            login: this.request.body.fields.login,
            password: Models.utils.hashPassword(this.request.body.fields.password)
          };

          let user = yield Models.models.User.get(global.systemContext, vars);

          this.session.user = user;
          console.log('here 1');
          yield Models.auth.setup();
          console.log('here 2');

          this.body = Models.models.User.secureByAction(this, user, 'read');
          console.log('here 3');
          break;
        }
        case 'logout':
          this.session.user = null;
          yield Models.auth.setup();

          this.body = {success: true};
          break;
        case 'config.js':
          this.type = 'application/javascript';
          this.body = `window.App = window.App || {}; window.App.config = ${JSON.stringify(Models.config)};`;
          break;
        case 'models.js':
          this.type = 'application/javascript';
          this.body = Models.clientJS();
          break;
        case 'me':
          if (this.query.format === 'jsonp') {
            this.type = 'application/javascript';
            this.body = `var user = ${JSON.stringify(this.user)};`;
            break;
          }
          this.body = {user: this.user};
          break;

        case 'projection':
        {
          let projection = Models.Projection.projections[call[1]];

          if (!projection) {
            throw new Error('Invalid Projection.');
          }

          let query = (this.request.body && this.request.body.fields) || {};
          this.body = yield projection.fetch(this, query);
          break;
        }
        default:
        {
          let model = Models.Document.models[call[0]];
          let query = (this.request.body && this.request.body.fields && this.request.body.fields.query) || {};
          let options = (this.request.body && this.request.body.fields && this.request.body.fields.options) || {};
          let obj = (this.request.body && this.request.body.fields) || {};

          switch (call[1]) {
            case 'count':
              this.body = yield model.count(this, query, options);
              break;

            case 'find':
              options.json = true;

              this.body = yield model.find(this, query, options);
              break;

            case 'create':
            {
              this.enforcePost();
              let ret = yield model.create(this, obj);
              this.body = model.secureByAction(this, ret, 'read');
              break;
            }

            default:
            {
              let id = call[1];
              let action = call[2];
              let subAction = call[3];

              if (!id) {
                throw new Error('No ID provided');
              }

              try {
                id = new ObjectID(id);
              } catch (e) {
                throw new Error('Invalid ID supplied : ' + id);
              }

              switch (action) {
                case 'get':
                  this.body = yield model.get(this, id, options);
                  break;

                case 'remove':
                  this.body = yield model.remove(this, id);
                  break;

                case 'update':
                  this.enforcePost();
                  obj._id = id;
                  this.body = yield model.update(this, obj, {fromClient: true});
                  break;

                default:
                  //If this model has a special property defined, there may be an api call hurr
                  //Look for self.
                  if (action.indexOf(Models.constants.PROPERTY_API_IDENTIFIER) === 0) {
                    //The action will be passed in like this 'self.profile.image'
                    //So we will split up the command and find the property it may be referring to
                    var properties = action.split('.');
                    properties.shift();

                    let type = model;
                    let property;

                    for (let name of properties) {

                      if (type && type.def.properties[name]) {
                        property = type.def.properties[name];
                        type = property._type;
                      } else {
                        throw new Error('Unrecognized command: ' + action);
                      }
                    }

                    //This property type has a defined API
                    if (type && type.api && type.api[subAction]) {
                      //TODO: Roll a security check?
                      yield type.api[subAction].call(this, {
                        id: id,
                        model: model,
                        propertyName: action.replace(Models.constants.PROPERTY_API_IDENTIFIER, ''),
                        property: property,
                        opts: opts
                      });
                      return;
                    }
                  }

                  throw new Error('Unrecognized command: ' + action);
              }
            }
          }
        }
      }
    }

    yield next;
  });
};
