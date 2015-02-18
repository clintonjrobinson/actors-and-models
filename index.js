"use strict";

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

var ObjectID = require('mongodb').ObjectID;
var babel = require('babel');
var fs = require('fs');
var uglify = require('uglify-js');

var Common = require('./lib/Common');
var Document = require('./lib/Document');
var Structure = require('./lib/Structure');
var Property = require('./lib/Property');
var Validators = require('./lib/validators').Validators;

var Types = require('./lib/Types');
var utils = require('./lib/utils');

var userDefinition = require('./models/User').User;

exports = module.exports = Models;

function Models(model) {
  return Document.models[model];
}

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
    function enforcePost() {
      if (this.method !== 'POST') {
        throw new Error(`API call must be POST, you sent ${this.method}`);
      }
    }

    //First get setup some user helpers in the context
    this.user = (this.session && this.session.user) ? this.session.user : null;
    this.userId = this.user ? this.user._id : null;
    this.roles = (this.user && this.user.roles) ? this.user.roles : ['Anonymous'];

    if (/\/api\/v1\//.test(this.path)) {
      var call = this.path.replace('/api/v1/', '').split('/');

      switch (call[0]) {
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
          this.body = this.user;
          break;
        default:
        {
          let model = Document.models[call[0]];
          let query = (this.request.body && this.request.body.query) || {};
          let options = (this.request.body && this.request.body.options) || {};

          switch (call[1]) {
            case 'count':
              this.body = yield model.count(this, query, options);
              break;

            case 'find':
              this.body = yield model.find(this, query, options);
              break;

            case 'create':
              enforcePost.call(this);
              var obj = yield model.create(this, this.request.body);
              this.body = model.secureByAction(this, obj, 'read');
              break;

            default:
            {
              let id = call[1];
              let action = call[2];

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
                  this.body = yield model.get(this, id);
                  break;

                case 'remove':
                  this.body = yield model.remove(this, id);
                  break;

                case 'update':
                  enforcePost.call(this);
                  this.body = yield model.update(this, id, this.request.body);
                  break;

                default:
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
      RESERVED_WORDS: ${JSON.stringify(utils.RESERVED_WORDS)},
      RESERVED_ROLES: ${JSON.stringify(utils.RESERVED_ROLES)}
    };\n`;

    str += 'var Validators = {';
    for (var validator in Validators) {
      str += `${validator}: ${Validators[validator]},`;
    }
    str += '};\n';

    str += `var Types = {
      MiniGuid: ${Types.MiniGuid},
      Guid: ${Types.Guid}
    };\n`;

    str += 'var Models = window.Models = {};\n';
    str += Models.Property.toString();
    str += `Models.Property = Property;\n`;
    str += Models.Common.toString();
    str += `Models.Common = Common;\n`;
    str += Models.Structure.toString();
    str += `Models.Structure = Structure;\n`;
    str += `Models.structures = {};\n`;
    str += 'var Extend = Structure;';

    for (let structure in Models.structures) {
      str += Models.structures[structure].toString();
      str += `Models.structures.${structure} = ${structure};\n`;
      str += `Models.structures.${structure}._clientInit();`;
    }

    str += Models.Document.toString();
    str += `Models.Document = Document;\n`;
    str += `Models.models = {};\n`;
    str += 'Extend = Document;';
    for (let model in Models.models) {
      str += Models.models[model].toString();
      str += `Models.models.${model} = ${model};\n`;
      str += `Models.models.${model}._clientInit();`;
    }

    clientJS = babel.transform(str).code;

    if (IS_PRODUCTION) {
      clientJS = uglify.minify(clientJS, {fromString: true}).code;
    }
  }

  return '(function() {\n' + clientJS + '\n})();';
};

Models.Property = Property;
Models.Common = Common;
Models.Document = Document;
Models.Structure = Structure;
Models.Types = Types;
Models.structure = Structure.registerDefinition;
Models.structures = Structure.structures;
Models.model = Document.registerDefinition;
Models.models = Document.models;
Models.utils = utils;

Models.model(userDefinition);