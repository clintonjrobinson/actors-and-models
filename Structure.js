"use strict";

var Types = require('./Types');
var Common = require('./Common');
var Property = require('./Property');

class Structure extends Common {
  get _mg() {
    return this.__data._mg;
  }

  set _mg(value) {
    if (this.__data._mg) {
      throw new Error('Cant change _id once set');
    }

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
  name: '_mg',
  type: Types.Guid,
  validators: {
    Required: true
  },
  security: {
    update: []
  }
});


Structure.structures = {};

Structure.registerDefinition = function(definition) {
  Structure.structures[definition.name] = Common.registerDefinition(definition, false);
  return Structure.structures[definition.name];
};

