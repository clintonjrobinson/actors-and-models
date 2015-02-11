"use strict";

var Document = require('./Document');
var Structure = require('./Structure');
var Types = require('./Types');
var ObjectID = require('mongodb').ObjectID;

exports = module.exports = Models;

function Models(model) {
  return Document.models[model];
}

//TODO: Probably a better way to do this.
//Probably model should be a part of our Mongo lib, refactor this later.
Models.setMongoConnection = function(_mongo) {
  Document.setMongoConnection(_mongo);
};

Models.api = function() {
  return function *(next) {

    if (/\/api\/v1\//.test(this.path)) {
      var call = this.path.replace('/api/v1/', '').split('/');
      var model = call[0];

      switch (call[1]) {
        case 'count':
          this.body = yield Document.models[model].count(this, this.request.body)
          break;
        case 'find':
          this.body = yield Document.models[model].find(this, this.request.body);
          break;
        default: {
          let id = call[1];
          let action = call[2];

          if (!id) {
            throw new Error('No ID provided');
          }

          try {
            id = new ObjectID(id);
          } catch(e) {
            throw new Error('Invalid ID supplied : ' + id);
          }

          switch (action) {
            case 'get':
              var doc = yield Document.models[model].get(this, id);

              this.body = doc;
              break;

            case 'remove':
              this.body = yield Document.models[model].remove(this, id);
              break;

            case 'update':
              if (this.method !== 'POST') {
                throw new Error('Updates must be POSTS.  You sent a ' + this.method);
              }

              this.body = yield Document.models[model].update(this, id, this.request.body);

              break;

            default:
              throw new Error('Unrecognized command: ' + action);
          }
        }
      }
    }

    yield next;
  }
};

Models.Types = Types;
Models.structure = Structure.registerDefinition;
Models.model = Document.registerDefinition;