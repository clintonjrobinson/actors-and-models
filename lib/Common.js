"use strict";

var ObjectID = require('mongodb').ObjectID;
var DBRef = require('mongodb').DBRef;

var Property = require('./Property');
var Validators = require('./validators').Validators;
const RESERVED_WORDS = require('./utils').RESERVED_WORDS;

if (!Object.assign) {
  Object.assign = require('object-assign');
}

class Common {
  constructor (properties) {
    this.__data = {};
    this.__changes = {};

    //Create a new instance, using the getters and setters.
    if (properties) {
      for (var property in properties) {
        if (property === '_id') {
          this._id = properties._id;
          continue;
        }

        this.__setter(property, properties[property]);
      }
    }
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
   * @private
   */
  __setter(name, value) {

    var property = this.constructor.definition.properties[name];

    //Trying to set a property that doesn't exist
    if (!property) {
      //TODO: should we throw an error here? Data may go missing.
      return;
    }

    //TODO: track changes to create a delta when saving, updating etc.
    this.__data[name] = property.cast(value);
  }

  /**
   * Validates this instance of this Model.  Passes thru to the the static validate method on the model.
   * @param method create, patch or update
   * @returns {*|Promise}
   */
  validate (method) {
    return this.constructor.validate(this, method);
  }

  /**
   * Validates one property of this model and returns the Validation Result
   * @param doc the object to validate
   * @param property a string of the property name to validate
   * @param method create, update or patch
   * @returns {*} a Validation Result object
   */
  static validateProperty(doc, property, method) {
    //Early exit. No validators? Then this field is valid by default.
    if (!property.validators) {
      return true;
    }

    //We will start by assuming this is valid.  If any one fails, this will be false.
    var valid = true;
    var result = {};

    //Required is a special valdiator.
    //If a field is not required, it can be null and therefore passes validation, since null is valid.
    //Also, if the method is an Patch update, a field is not required for patch updates, because the required
    //field may already be set in the databse, so null is valid.
    if (property.validators.Required && (method === 'create' || method === 'update')) {
      result.Required = Validators.Required(doc[property]);

      //If there is no value in this field (ie. Required failed). then exit early. No need to run other validators.
      if (!result.Required) {
        return result;
      }
    } else {
      //If there is no Required validator set. Then we are going to use this Validator to check if a value is set.
      //If there is no value set, we can't run the rest of the validators (because there is no value).
      //However, this field is valid, because if it is not required a non-value is valid.

      //If this is a Patch update.  Then even though the field may be Required, it is not required at this moment
      if (!Validators.Required(doc[property])) {
        return true;
      }
    }

    for (var validatorName in property.validators) {
      //Handled above
      if (validatorName === 'Required') {
        continue;
      }

      var validator = Validators[validatorName];

      //If the validatorName does not match a registered function in Validators, it is either a custom function
      //or a string representing a custom function that has not been compiled yet.
      if (!validator) {
        //This is a custom function definition.
        if (typeof(property.validators[validatorName]) === 'function') {
          result[validatorName] = property.validators[validatorName](doc);
        } else if (typeof(property.validators[validatorName]) === 'string') {
          //Compile the function.
          //TODO: compile the validator function.
        } else {
          throw new Error(`${this.name}.${property.name} has invalid validator ${validatorName}.`);
        }
      } else {
        //Run the validator, passing in the value set in the property definition.
        result[validatorName] = validator(doc[property], property.validators[validatorName]);
      }

      if (result[validatorName] === false) {
        valid = false;
      }
    }

    //We don't care about the validation results if the property is valid.
    return valid ? true : result;
  }

  /**
   * Validates an entire document against its Model definition and returns a collection of Validation Results
   * @param doc The object to validate
   * @returns {Promise}
   */
  static validate(doc, method) {
    var model = this;
    var validation = {
      valid: false,
      results: {}
    };

    //Default to a patch update
    method = method || 'patch';

    if (!doc) {
      return Promise.reject(new Error('Null or empty object passed in.'))
    }

    if (doc.constructor !== this) {
      return Promise.reject(new Error(`Invalid Model passed in, was expecting ${this.name} but got ${doc.constructor}.`));
    }

    return new Promise(function(reject, resolve) {
      function runValidation(toValidate, method) {
        //Iterate thru all the properties definitions and look for validators.
        for (let name in model.definition.properties) {
          let property = model.definition.properties[name];

          validation.results[name] = model.validateProperty(toValidate, property, method);

          //Any one invalid property will cause this result to be overall invalid.
          if (validation.results[name] !== true) {
            validation.valid = false;
          }
        }

        validation.valid
          ? resolve(validation)
          : reject(validation)
        ;
      }

      if (model.isStructure || method === 'create' || (method === 'patch' && model.canPatchUpdate)) {
        //This model is a Structure OR
        //This is a create, so we run full validation on it OR
        //This is a patch update, and we are allowed to patch this model! No need to pull the full doc.
        runValidation(doc, method);
      } else if (method === 'patch' && !model.canPatchUpdate) {
        //If we cannot Patch Update this model, we need to pull the whole doc from the database, apply the patch, and then validate.
        model
          .get(doc._id)
          .then(function(current) {
            //Create a clone of the doc from the database.
            var final = current.clone();

            //Apply the patch update.
            model.patch(final, doc);

            runValidation(final, 'update');
          })
          .catch(reject)
        ;

        return;
      } else {
        //How did we get here?
        throw new Error('Invalid Validation options passed in.');
      }
    });
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
    for (let name in this.definition.properties) {
      let property = this.definition.properties[name];
      let allowed = property.canAction(roles, action);

      if (!allowed) {
        delete doc.__data[name];
      }

      //If this type is a Model or Structure, propagate down the chain
      if (allowed && property.isSubDocument) {
        if (property.isArray) {
          for (let i=0; i<this.__data[name].length; i++) {
            property.type.secureWrite(context, doc.__data[name][i], action);
          }
        } else {
          property.type.secureWrite(context, doc.__data[name], action);
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
  static secureUpdate (context, doc) {
    this.secureByAction(context, doc, 'update');
  }

  /**
   * Secure create
   * @param context
   * @param doc
   */
  static secureCreate (context, doc) {
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
  static secureRead (context) {
    var secure = {};

    //We are going to cache the secureRead field maps so we don't regenerate per role
    this.__secureRead = this.__secureRead || {};

    var roles = this.getUserRoles(context);

    for (let i=0; i<roles.length; i++) {
      let role = roles[i];
      let secureRole;

      //Cached copy exists
      if (this.__secureRead[role]) {
        secureRole = this.__secureRead[role];
      } else {
        secureRole = this.__secureRead[role] = {};

        //Create the field map for this role
        for (let name in this.definition.properties) {
          let property = this.definition.properties[name];

          property.canRead(role)
            ? secureRole[name] = 1
            : delete secureRole[name]
          ;

          //If we have the determined the user can read this, and this is a subDocument, propogate
          //down the chain
          if (secureRole[name] && property.isSubDocument) {
            let subFields = property.type.secureRead(context);

            for (let subName in subFields) {
              secureRole[name + '.' + subName] = subFields[subName];
            }
          }
        }
      }

      //Merge the field map for this role with the master field map.
      Object.assign(secure, secureRole);
    }

    return secure;
  }

  /**
   * Get which User roles are associated with this Context.  If here are none,
   * then this is an Anonymous session
   * @param context
   * @param doc
   * @returns {[string]}
   */
  static getUserRoles(context, doc) {
    //Is there a user in the session?
    var user = this.getUser(context);
    //If there isn't, this is an Anoymous role.
    var roles = user && user.roles ? user.roles : ['Anonymous'];

    //If a doc is passed in, we will also check the special meta-role Owner.  If the user in
    //the session is named as _owner on the doc.  They have the Owner role at this moment.
    if (this.hasOwner && doc && doc._owner) {
      if (doc._owner === user._id) {
        roles.push['Owner'];
      }
    }

    return roles;
  }

  /**
   * Helper method to get a user from the session of the context.
   * @param context
   */
  static getUser(context) {
    return context && context.session && context.session.user ? context.session.user : null;
  }

  /**
   * Determines if a User role has access to this Model.
   * @param context
   * @param action
   * @param doc
   * @returns {boolean}
   */
  static hasAccess(context, action, doc) {
    //By default, all Models are open to 'Anonymous' access
    var hasAccess = true;

    //Security has been defined for this Model, remove hasAccess
    //Now access must explicitly be set for this User role
    if (this.definition.secure && this.definition.secure[action]) {
      let roles = this.definition.secure[action];

      hasAccess = false;

      this.getUserRoles(context, doc).map(function(role) {
        if (roles.indexOf(role) !== -1) {
          hasAccess = true;
        }
      });
    }

    return hasAccess;
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
    var data = patch.toJSON();

    for (var property in data) {
      doc[property] = data[property]
    }
  }

  clone() {
    //TODO: this doesn't actually do a deep clone does it? Check to make sure.
    return new this.constructor(this.__data);
  }

  toJSON() {
    return this.__data;
  }
}

exports = module.exports = Common;

Common.Validators = Validators;

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
        if (RESERVED_WORDS.indexOf(property) !== -1) {
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
    }

    cls = ${definition.name};
  `;

  eval(str);

  cls.definition = definition;
  cls.hydrations = [];

  for (var name in definition.properties) {
    definition.properties[name] = new Property(definition.properties[name], name);

    //Remember possible hydration points for later
    if (definition.properties[name].isReference) {
      cls.hydrations.push(name);
    }
  }

  //Inherit the parents propeties.
  Object.assign(cls.definition.properties, Extend.definition.properties);

  if (isModel) {
    //Set the mongo collection name
    cls.collectionName = definition.name;

    cls.middleware = {};

    //Setup middleware hooks, allows for cleaner code elsewhere.
    ['before', 'after'].map(function (hook) {
      ['Save', 'Create', 'Validate', 'Count', 'Find', 'Update'].map(function (method) {
        if (definition.middleware && definition.middleware[hook + method]) {
          cls.middleware[hook + method] = definition.middleware[hook + method];
        } else {
          cls.middleware[hook + method] = function *() {};
        }
      })
    });

  }

  return cls;
};