"use strict";

var Types = require('./Types');
var Common = require('./Common');
var Property = require('./Property');

class Structure extends Common {
  constructor (properties) {
    super(properties);

    //TODO: Do we want to do this?
    //if there is no mini guid set, set one
    if (!properties || (properties && !properties._mg)) {
      this.__data._mg = Types.MiniGuid();
    }
  }

  get _mg () {
    return this.__getter('_mg');
  }

  set _mg (value) {
    this.__setter('_mg', value);
  }

  static get isModel() {
    return false;
  }

  static get isStructure() {
    return true;
  }

  static get definition() {
    this.__definition = this.__definition || {
      properties: {
        _mg: new Property({
          type: Types.MiniGuid,
          security: {
            update: []
          }
        }, '_mg')
      }
    };

    return this.__definition;
  }

  static set definition(val) {
    this.__definition = val;
  }
}

exports = module.exports = Structure;

Common.Structure = Structure;
Structure.structures = {};

Structure.registerDefinition = function(definition) {
  Structure.structures[definition.name] = Common.registerDefinition(definition, false);
  return Structure.structures[definition.name];
};

