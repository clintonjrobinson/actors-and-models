"use strict";

var ObjectID = require('mongodb').ObjectID;
var babel = require('babel');
var fs = require('fs');
var uglify = require('uglify-js');

var Common = require('./lib/Common');
var Document = require('./lib/Document');
var Structure = require('./lib/Structure');
var Projection = require('./lib/Projection');
var Property = require('./lib/Property');
var Validators = require('./lib/validators').Validators;
var errors = require('./lib/errors');
var CONSTANTS = require('./lib/constants');

var Types = require('./lib/Types');
var utils = require('./lib/utils');

var userDefinition = require('./models/User').User;

var opts;

exports = module.exports = Models;

function Models() {
}

Models.setOptions = function(_opts) {
  opts = _opts || {};

  opts.root = opts.root || __dirname;

  if (opts.mongo) {
    Models.setMongoConnection(opts.mongo);
  }
};

//TODO: Probably a better way to do this.
Models.setMongoConnection = function(mongo) {
  Models.mongo = mongo;
  Document.setMongoConnection(mongo);

  //Ensure that all the required users have been created.
  require('./lib/requiredUsers')(Models);
};


//TODO: Implement.  Allow new validation functions to be registered
Models.registerValidator = function() {

};

Models.api = function() {
  return function *(next) {

    this.enforcePost = function() {
      if (this.method !== 'POST') {
        throw new Error(`API call must be POST, you sent ${this.method}`);
      }
    };

    //First get setup some user helpers in the context
    this.user = (this.session && this.session.user) ? this.session.user : null;
    this.userId = this.user ? this.user._id : null;
    this.userGroups = this.user && this.user._groups ? this.user._groups : [];
    this.roles = (this.user && this.user.roles) ? this.user.roles : ['Anonymous'];

    if (/\/api\/v1\//.test(this.path)) {
      var call = this.path.replace(CONSTANTS.API_PREFIX, '').split('/');

      switch (call[0]) {
        case 'login':
        {
          let vars = {
            login: this.request.body.fields.login,
            password: Models.utils.hashPassword(this.request.body.fields.password)
          };

          let user = yield Models.models.User.get(global.systemContext, vars);

          this.session.user = user;
          this.body = Models.models.User.secureByAction(this, user, 'read');
          break;
        }
        case 'logout':
          this.session.user = null;
          this.body = {success:true};
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
          this.body = {user:this.user};
          break;

        case 'projection':  {
          let projection = Projection.projections[call[1]];

          if (!projection) {
            throw new Error('Invalid Projection.');
          }

          let query = (this.request.body && this.request.body.fields) || {};
          this.body = yield projection.fetch(this, query);
          break;
        }
        default:
        {
          let model = Document.models[call[0]];
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
                  if (action.indexOf(CONSTANTS.PROPERTY_API_IDENTIFIER) === 0) {
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
                      yield type.api[subAction].call(this, {id:id, model:model, propertyName: action.replace(CONSTANTS.PROPERTY_API_IDENTIFIER, ''), property:property, opts: opts});
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
  }
};

var clientJS;
Models.clientJS = function() {
  if (!clientJS) {
    var str = 'var ObjectID = String;\n'
    //TODO: refactor this later.  Could be a separate client side Types library
    str += `var utils = {
      union: ${utils.union},
      guid: ${utils.guid},
      RESERVED_WORDS: ${JSON.stringify(CONSTANTS.RESERVED_WORDS)},
      RESERVED_ROLES: ${JSON.stringify(CONSTANTS.RESERVED_ROLES)}
    };\n`;

    str += 'var errors = {';
    for (var error in errors) {
      str += `${error}: ${errors[error]},`;
    }
    str += '};\n';

    str += 'var Validators = {';
    for (var validator in Validators) {
      str += `${validator}: ${Validators[validator]},`;
    }
    str += '};\n';

    str += 'var Models = window.Models = {};\n';

    str += `Models.constants = ${JSON.stringify(Models.constants)};\n`;
    str += 'var Types = Models.Types = {';
    for (var type in Types) {
      str += `${type}: ${Types[type]},`;
    }
    str += '};\n';

    str += Models.Property.toString();
    str += `Models.Property = Property;\n`;
    str += Models.Common.toString();
    str += `Models.Common = Common;\n`;
    str += Models.Structure.toString();
    str += `Models.Structure = Structure;\n`;
    str += `Models.structures = {};\n`;
    str += 'var Extend;';

    for (let structure in Models.structures) {
      if (Models.structures[structure].def.extend) {
        str += `Extend = Models.structures.${Models.structures[structure].def.extend.name};`;
      } else {
        str += 'Extend = Structure;';
      }

      str += Models.structures[structure].toString();
      str += `Models.structures.${structure} = ${structure};\n`;
      //str += `Models.structures.${structure}._clientInit();\n`;
      str += `Extend.children = Extend.children || {};\n`;
      str += `Extend.children['${structure}'] = Models.structures.${structure};`;

    }

    str += Models.Document.toString();
    str += `Models.Document = Document;\n`;
    str += `Models.models = {};\n`;

    for (let model in Models.models) {
      if (Models.models[model].def.extend) {
        str += `Extend = Models.models.${Models.models[model].def.extend.name};`;
      } else {
        str += 'Extend = Document;';
      }

      str += Models.models[model].toString();
      str += `Models.models.${model} = ${model};\n`;
      //str += `Models.models.${model}._clientInit();`;
      str += `Extend.children = Extend.children || {};\n`;
      str += `Extend.children['${model}'] = Models.structures.${model};\n`;
    }

    str += `setTimeout(function() {
      for (var name in Models.structures) {
        Models.structures[name]._clientInit();
      }
    }, 10);`;

    str += `setTimeout(function() {
      for (var name in Models.models) {
        Models.models[name]._clientInit();
      }
    }, 10);`;

    clientJS = babel.transform(str).code;

    if (CONSTANTS.IS_PRODUCTION) {
      clientJS = uglify.minify(clientJS, {fromString: true}).code;
    }
  }

  return '(function() {\n' + clientJS + '\n})();';
};

Models.Property = Property;
Models.Common = Common;
Models.Document = Document;
Models.Structure = Structure;
Models.Projection = Projection;
Models.Types = Types;

Models.structure = Structure.registerDefinition;
Models.structures = Structure.structures;

Models.model = Document.registerDefinition;
Models.models = Document.models;

Models.projection = Projection.registerDefinition;
Models.projections = Projection.projections;

Models.utils = utils;

Models.model(userDefinition);