"use strict";

var Types = require('../types');
var Common = require('./Common');
var Property = require('./Property');

class Structure extends Common {
  constructor (properties, locale, parent, property) {
    super(properties, locale, parent, property);
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

