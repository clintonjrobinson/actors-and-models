"use strict";
var ObjectID = require('mongodb').ObjectID;
var DBRef = require('mongodb').DBRef;
var Property = require('./Property');

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

  __setter(name, value) {

    var property = this.constructor.definition.properties[name];

    //Trying to set a property that doesn't exist
    if (!property) {
      return;
    }

    //TODO: track changes to create a delta when saving, updating etc.

    this.__data[name] = property.cast(value);
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

    var roles = self.getUserRoles(context);

    //Look at the original Model definition
    for (let name in this.definition.properties) {
      let property = this.definition.properties[name];
      let allowed = property.canAction(roles, action);

      if (!allowed) {
        delete this.__data[name];
      }

      //If this type is a Model or Structure, propagate down the chain
      if (allowed && property.isSubDocument) {
        if (property.isArray) {
          for (let i=0; i<this.__data[name].length; i++) {
            property.type.secureWrite(context, this.__data[name][i], action);
          }
        } else {
          property.type.secureWrite(context, this.__data[name], action);
        }
      }
    }
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
   * @returns {command.roles|*|Object[]}
   */
  static getUserRoles(context) {
    return context && context.session && context.session.user
      ? context.session.user.roles
      : ['Anonymous']
      ;
  }

  /**
   * Determines if a User role has access to this Model.
   * @param context
   * @param action
   * @returns {boolean}
   */
  static hasAccess(context, action) {
    //By default, all Models are open to 'Anonymous' access
    var hasAccess = true;

    //Security has been defined for this Model, remove hasAccess
    //Now access must explicitly be set for this User role
    if (this.definition.secure && this.definition.secure[action]) {
      let roles = this.definition.secure[action];

      hasAccess = false;

      this.getUserRoles(context).map(function(role) {
        if (roles.indexOf(role) !== -1) {
          hasAccess = true;
        }
      });
    }

    return hasAccess;
  }

  toJSON() {
    return this.__data;
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
    cls.collectionName = 'Type.' + definition.name;
  }

  return cls;
};