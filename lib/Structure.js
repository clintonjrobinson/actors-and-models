"use strict";

var Types = require('./Types');
var Common = require('./Common');
var Property = require('./Property');

class Structure extends Common {
  constructor (properties) {
    super(properties);

    //if there is no mini guid set, set one
    if (!properties._mg) {
      this.__data._mg = Types.MiniGuid();
    }
  }

  get _mg() {
    return this.__data._mg;
  }

  set _mg(value) {
    this.__data._mg = value;
  }
}

exports = module.exports = Structure;

Common.Structure = Structure;

Structure.middleware = {
  validate: function(fn) {}
};

Structure.isStructure = true;

Structure.definition = {
  properties: { }
};

Structure.definition.properties._mg = new Property({
  type: Types.MiniGuid,
  security: {
    update: []
  }
}, '_mg');


Structure.structures = {};

Structure.registerDefinition = function(definition) {
  Structure.structures[definition.name] = Common.registerDefinition(definition, false);
  return Structure.structures[definition.name];
};

