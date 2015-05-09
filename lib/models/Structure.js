"use strict";

var Types = require('../types');
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

  static get def() {
    this.__def = this.__def || {
      properties: {
        _mg: new Property({
          type: Types.MiniGuid,
          security: {
            update: []
          }
        }, '_mg')
      }
    };

    return this.__def;
  }

  static set def(val) {
    this.__def = val;
  }
}

exports = module.exports = Structure;

Common.Structure = Structure;
Structure.structures = {};

Structure.registerDefinition = function(def) {
  Structure.structures[def.name] = Common.registerDefinition(def, false);
  return Structure.structures[def.name];
};

