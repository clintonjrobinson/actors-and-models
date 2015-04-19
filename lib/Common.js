"use strict";

var ObjectID = require('mongodb').ObjectID;

var errors = require('./errors');
var Property = require('./Property');
var CONSTANTS = require('./constants');

if (!Object.assign) {
  Object.assign = require('object-assign');
}


class Common {
  constructor(properties) {
    this.__data = {};

    //Create a new instance, using the getters and setters.
    if (properties) {
      for (let property in properties) {
        //Why do we call __setter here and not use the setter directly?
        this.__setter(property, properties[property]);
      }
    }

    this.observe();
  }

  observe() {
    var self = this;
    self.__changes = self.__changes || {};

    Object.observe(self.__data, function(changes) {

      for (let change of changes) {
        switch (change.type) {
          case 'add':
          case 'update':
            self.__changes[change.name] = change.object[change.name];
            break;
        }
      }
    });
  }

  observeArray(toObserve, toUpdate) {
    toUpdate.__changes = toUpdate.__changes || {};

    Array.observe(toObserve, function(changes) {
      console.log(changes);
    })
  }

  /**
   * Generic getter, used by all getters
   * @param name
   * @returns {*}
   * @private
   */
  __getter(name) {
    return this.__data[name];
  }

  /**
   * Generic setter, used by all property setters in the model.
   * @param name
   * @param value
   * @param fromConstructor
   * @private
   */
  __setter(name, value) {
    var property = this.constructor.definition.properties[name];

    //Trying to set a property that doesn't exist
    if (!property) {
      //TODO: should we throw an error here? Data may go missing.
      return;
    }

    //subdocument
    //new - the whole subdoc is new
    //patch - patching specific parts of it

    //array of primitives
    //new - whole array is new
    //add - we are adding something into the array, but what position?
    //pull - we are pulling something from an array, doesn't matter what position

    //array of subdocuments
    //new - the whole array is new
    //add - we are adding something new into the array,
    //patch - we are patching one entry.
    //pull - we are removing or more entries

    this.__data[name] = property.cast(value);

    if (property.array) {
      this.observeArray(this.__data[name], this.__data[name]);
    }
  }

  /**
   * Validates this instance of this Model.  Passes thru to the the static validate method on the model.
   * @param method create, patch or update
   * @returns {*|Promise}
   */
  validate(context, method) {
    return this.constructor.validate(this, context, method);
  }

  /**
   * Returns if a property of this doc has changed.
   * @param name
   */
  hasChanged(name) {
    return this.constructor.hasChanged(this, name);
  }

  /**
   * Clone this instance
   * @returns {Common}
   */
  clone() {
    //TODO: this doesn't actually do a deep clone does it? Check to make sure.
    return new this.constructor(this.__data);
  }

  toJSON() {
    //Create a new object to return
    var ret = {};

    //Data contains the JSON data.  But could also contain nested Structures or Hydrated docs
    for (let property of this.constructor.properties({isSubDocument: false})) {
      if (this.__data[property.name]) {
        ret[property.name] = this.__data[property.name];
      }
    }

    for (let property of this.constructor.properties({isSubDocument: true})) {
      if (this.__data[property.name]) {
        if (property.isArray) {
          ret[property.name] = [];

          for (var i = 0; i < this.__data[property.name].length; i++) {
            ret[property.name][i] = this.__data[property.name][i].toJSON();
          }
        } else {
          ret[property.name] = this.__data[property.name].toJSON();
        }
      }
    }

    return ret;
  }

  /**
   * Creates a GeneratorFunction to iterate over the property definitions, filtering based on
   * options passed in.
   *
   * @param opts
   */
  static *properties(opts) {
    opts = opts || {noOpts: true};

    for (let name in this.definition.properties) {
      let property = this.definition.properties[name];
      let ret = true;

      if (!opts.noOpts) {
        if (opts.isSubDocument && !property.isSubDocument) ret = false;
        if (opts.isSubDocument === false && property.isSubDocument) ret = false;
        if (opts.isModel && !property.isModel) ret = false;
        if (opts.isModel === false && property.isModel) ret = false;
        if (opts.isStructure && !property.isStructure) ret = false;
        if (opts.isStructure === false && property.isStructure) ret = false;
        if (opts.isHydrated && !property.hydrate) ret = false;
        if (opts.isHydrated === false && !property.hydrate) ret = false;
        if (opts.isArray && !property.array) ret = false;
        if (opts.isArray === false && property.array) ret = false;
        if (opts.isReference && !property.isReference) ret = false;
        if (opts.isReference === false && property.isReference) ret = false;
        if (opts.hasValidators && !property.validators) ret = false;
        if (opts.hasValidators === false && property.validators) ret = false;
        if (opts.isRequired && !(property.validators && property.validators.Required)) ret = false;
        if (opts.isRequired === false && (property.validators && property.validators.Required)) ret = false;
      }

      if (ret) {
        yield property;
      }
    }
  }

  /**
   * Validates an entire document against its Model definition and returns a collection of Validation Results
   * @param doc The object to validate
   * @returns {boolean|Object}
   */
  static *validate(doc, context, method) {
    function runValidation(toValidate, method) {
      //Iterate thru all the properties definitions that have validators.
      for (let property of model.properties({hasValidators: true})) {

        validation.results[property.name] = property.validate(toValidate, method);

        //Any one invalid property will cause this result to be overall invalid.
        if (validation.results[property.name] !== true) {
          validation.valid = false;
        }
      }
    }

    var model = this;

    var validation = {
      valid: true,
      results: {}
    };

    //Default to a patch update
    method = method || 'patch';

    if (!doc) {
      throw new Error('Null or empty object passed in.');
    }

    if (doc.constructor !== this) {
      throw new Error(`Invalid Model passed in, was expecting ${this.name} but got ${doc.constructor}.`);
    }


    if (this.isStructure || method === 'create' || (method === 'update' && this.canPatchUpdate) || (method === 'patch' && this.canPatchUpdate)) {
      //This model is a Structure OR
      //This is a create, so we run full validation on it OR
      //This is a patch update, and we are allowed to patch this model! No need to pull the full doc.
      runValidation(doc, method);
    } else if ((method === 'update' && !this.canPatchUpdate) || (method === 'patch' && !this.canPatchUpdate)) {
      //If we cannot Patch Update this model, we need to pull the whole doc from the database, apply the patch, and then validate.
      let current = yield this.get(global.systemContext, doc._id);

      //Apply the patch update.
      this.patch(current, doc);

      runValidation(current, 'update');
    } else {
      //How did we get here?
      throw new Error(`Invalid Validation options passed in. ${method} ${this.canPatchUpdate}`);
    }

    if (!validation.valid) {
      throw new errors.ValidationError(validation);
    }

    return true;
  }

  /**
   * Secures an instance of a Model or Structure based on the security settings and the current
   * Users Role.
   * @param context
   * @param doc
   * @param action
   */
  static secureByAction(context, doc, action) {
    if (!doc || !doc.__data) {
      return;
    }

    var roles = this.getUserRoles(context, doc);

    //Look at the original Model definition
    for (let property of this.properties()) {

      let allowed = property.canAction(roles, action);

      if (!allowed) {
        delete doc.__data[property.name];
      } else if (allowed && property.isSubDocument) {
        if (property.isArray) {
          for (let i = 0; i < doc.__data[property.name].length; i++) {
            property.type.secureByAction(context, doc.__data[property.name][i], action);
          }
        } else {
          property.type.secureByAction(context, doc.__data[property.name], action);
        }
      }
    }

    return doc;
  }

  /**
   * Secure update
   * @param context
   * @param doc
   */
  static secureUpdate(context, doc) {
    this.secureByAction(context, doc, 'update');
  }

  /**
   * Secure create
   * @param context
   * @param doc
   */
  static secureCreate(context, doc) {
    this.secureByAction(context, doc, 'create');
  }

  /**
   * Creates a field map based on the current Users role of what properties they can see of this
   * Document or Structure
   * TODO: Currently if a read is specified for Owner role on a property,
   *       it will not be returned because of secureRead.
   *
   *       We don't know if this user is an Owner of doc yet.
   *
   * @param context
   * @returns {{}}
   */
  static secureRead(context, fields) {
    var secure = {};

    //We are going to cache the secureRead field maps so we don't regenerate per role
    this.__secureRead = this.__secureRead || {};

    for (let role of context.roles) {
      let secureRole;

      //Cached copy exists
      if (this.__secureRead[role]) {
        secureRole = this.__secureRead[role];
      } else {
        secureRole = this.__secureRead[role] = {};

        //Create the field map for this role
        for (let property of this.properties()) {

          property.canRead(role)
            ? secureRole[property.name] = 1
            : delete secureRole[property.name]
          ;

          //If we have the determined the user can read this, and this is a subDocument, propogate
          //down the chain
          if (secureRole[property.name] && property.isSubDocument) {
            let subFields = property.type.secureRead(context);

            for (let subName in subFields) {
              secureRole[property.name + '.' + subName] = subFields[subName];
            }
          }
        }
      }

      //Merge the field map for this role with the master field map.
      Object.assign(secure, secureRole);
    }

    //If there is a passed in field map, only allow readable fields
    if (fields) {
      for (let field in fields) {
        if (!secure[field]) {
          delete fields[field];
        }
      }

      return fields;
    }

    return secure;
  }

  /**
   * Get roles from the context, and check if there is a Owner roll associated with this doc.
   * @param context
   * @param doc
   * @returns {[]}
   */
  static getUserRoles(context, doc) {
    return [].concat(context.roles, (this.hasOwner && doc && doc._owner && doc._owner === context.userId) ? ['Owner'] : []);
  }

  /**
   * Determines if a User role has access to this Model.
   * @param context
   * @param action
   * @param doc
   * @returns {boolean}
   */
  static canAccess(context, action, doc) {
    //By default, all Models are open to 'Anonymous' access
    var canAccess = true;

    //Security has been defined for this Model, remove canAccess
    //Now access must explicitly be set for this User role
    if (this.definition.secure && this.definition.secure[action]) {
      let secure = this.definition.secure[action];

      canAccess = false;

      for (let role of this.getUserRoles(context, doc)) {
        if (secure.indexOf(role) !== -1) {
          return true;
        }
      }
    }

    return canAccess;
  }

  static hasChanged(doc, name) {
    return doc.__changed[name] === true;
  }

  /**
   * Gets the delta of changes performed to this doc since creation, or since a reset.
   * @param doc
   */
  static delta(doc) {
    var ret = {};

    for (let property of this.properties({isSubDocument: false})) {
      if (doc.__changed[property.name]) {
        ret[property.name] = doc.__data[property.name];
      }
    }

    for (let property of this.properties({isSubDocument: true})) {
      if (doc.__data[property.name]) {
        if (property.isArray) {
          ret[property.name] = [];
          for (let i = 0; i < doc.__data[property.name].length; i++) {
            ret[property.name][i] = property.type.delta(doc.__data[property.name][i]);
          }
        } else {
          ret[property.name] = property.type.delta(doc.__data[property.name]);
        }
      }
    }

    if (this.isStructure) {
      ret._mg = doc._mg;
    }

    return ret;
  }

  /**
   * Apply a patch update to an instance of this model
   * @param doc
   * @param patch
   */
  static patch(doc, patch) {
    if (doc.constructor !== this || patch.constructor !== this) {
      throw new Error(`Cannot patch two different models.  Expecting ${this.name} but got ${doc.constructor.name} and ${patch.constructor.name}.`);
    }

    //TODO: in the future allow addToSet for arrays, or removeFromSet for arrays.
    //Get all the properties that are just simple ones first.
    for (let property of this.properties({isSubDocument: false})) {
      //If its not null, apply the patched property over.
      if (patch[property.name] !== undefined) {
        doc[property.name] = patch[property.name];
      }
    }

    //Now do all the subdocuments.
    for (let property of this.properties({isSubDocument: true})) {
      if (patch[property.name] !== undefined) {
        //Arrays are trickier.
        //If the doc already has this array set, we will need to merge the unique instances into the array.
        // We are going to overwrite the whole thing.
        if (property.isArray) {
          //TODO: no we arent
          doc[property.name] = patch[property.name];
        } else {
          if (!doc[property.name]) {
            //There is no object existing in the doc. First create a new instance
            doc[property.name] = new property.type(patch[property.name]);
          }

          //Patch the existing instance
          property.type.patch(doc[property.name], patch[property.name]);
        }
      }
    }
  }

  /**
   * Resets a document, clears all the changes and delta.
   * @param doc
   */
  static reset(doc) {
    doc.__delta = {};
    doc.__changed = {};
  }

  /**
   * TODO CLIENTSIDE hack Remove this and refactor for more intelligent client side models
   * @param definition
   * @returns {*}
   */
  static serializeDefinition(definition) {
    var str = `{
      name: "${definition.name}",
      description: "${definition.description}",
      properties: {
      `;
        for (var property in definition.properties) {
          str += `${property}: ${Property.serialize(definition.properties[property])},`;
        }

        str += `}, `;

        if (property.secure) {
          str += `secure: ${JSON.stringify(property.secure)}`;
        }
      str += `
    }`;

    return str;
  }

  static _clientInit() {
    this.isClient = true;

    this.definition = {
      properties: {}
    };

    for (var property in this._definition.properties) {
      this.definition.properties[property] = new Property(this._definition.properties[property], property);
    }

    //Inherit the parents properties.
    Object.assign(this.definition.properties, this.__proto__.definition.properties);

    this.middleware = {};
    for (let hook of ['before', 'after']) {
      for (let method of ['Save', 'Create', 'Validate', 'Count', 'Find', 'Update']) {
        this.middleware[hook + method] = function *() {}
      }
    }
  }
}

exports = module.exports = Common;

Common.registerDefinition = function(definition, isModel) {
  //Holds the javascript class that we will return
  var cls;
  var Document = Common.Document;
  var Structure = Common.Structure;

  //If this definition doesn't extend a known definition, inherit from our base classes
  var Extend = definition.extend
    ? models[definition.extend]
    : isModel ? Document : Structure
  ;

  var str = `
    class ${definition.name} extends Extend {
      constructor (properties) {
        super(properties);
      }

      `;
      for (var property in definition.properties) {
        //Check to make sure that there are no reserved properties being set.
        if (CONSTANTS.RESERVED_WORDS.indexOf(property) !== -1) {
          throw new Error('Cannot use a reserved word as a property : ' + property);
        }

        str +=`
          get ${property} () {
            return this.__getter('${property}');
          }

          set ${property} (value) {
            this.__setter('${property}', value);
          }
        `;
      }

      str += `

      static get API_PREFIX() {
        return "${CONSTANTS.API_PREFIX}";
      }

      static get collectionName() {
        return "${definition.name}";
      }

      static get _definition() {
        return ${Common.serializeDefinition(definition)};
      }
    }

    cls = ${definition.name};

  `;

  eval(str);

  cls.definition = definition;

  for (var name in definition.properties) {
    //Check for self-referential data-type now and upate
    if (definition.properties[name].type === 'self' || definition.properties[name].type == cls.name) {
      definition.properties[name].type = cls;
    }

    definition.properties[name] = new Property(definition.properties[name], name);
  }

  //Inherit the parents properties.
  Object.assign(cls.definition.properties, Extend.definition.properties);

  if (isModel) {
    cls.middleware = {};

    //Setup middleware hooks, allows for cleaner code elsewhere.
    for (let hook of ['before', 'after']) {
      for (let method of ['Save', 'Create', 'Validate', 'Count', 'Find', 'Update']) {
        cls.middleware[hook + method] = (definition.middleware && definition.middleware[hook + method])
          ? definition.middleware[hook + method]
          : function *() {}
        ;
      }
    }
  }

  return cls;
};