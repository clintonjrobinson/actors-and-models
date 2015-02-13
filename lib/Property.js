"use strict";

var ObjectID = require('mongodb').ObjectID;
var DBRef = require('mongodb').DBRef;

/**
 * Defines a property that a Structure or Document can have
 */
class Property {
  constructor(def, name) {
    if (!def.type) {
      throw new Error('Type is required for Property definition');
    }

    this._type = def.type;
    this._hydrate = def.hydrate ? true : false;
    this._array = def.array ? true : false;
    this._validators = def.validators || {};
    this._secure = def.secure || null;
    this._name = def.name || name;
  }

  /**
   * Casts an value being set to the Type as defined by the property definition.
   * @param property
   * @param value
   * @returns {*}
   */
  cast (value) {
    function subcast(value) {
      //If the value being set is already in the type we expect, just set it
      if (value !== undefined && value !== null && value.constructor !== this._type) {
        //Determine what the type of this property is, it will determine how it is initialized
        if (this._type === String || this._type === Number) {
          return value;
        } else if (this.isSubDocument) {
          return new this._type(value);
        } else if (this.isReference) {
          if (value.constructor === DBRef) {
            return value;
          } else {
            //TODO: probably some more logic needed here to create a DB ref
            return new DBRef(value);
          }
        } else if (this._type === ObjectID) {
          return new ObjectID(value.toString());
        }
        else {
          return this._type(value);
        }
      } else {
        return value;
      }
    }

    //If this is an array, we need to init all the entries of the array.
    if (this.array && Array.isArray(value)) {
      var arr = [];
      for (let i=0; i<value.length; i++) {
        arr.push(subcast.call(this, value[i]));
      }

      return arr;
    } else {
      return subcast.call(this, value);
    }
  }

  get name() {
    return this._name;
  }

  get secure() {
    return this._secure;
  }

  get validators() {
    return this._validators;
  }

  get hydrate() {
    return this._hydrate;
  }

  get type() {
    return this._type;
  }

  get array() {
    return this._array;
  }

  get isArray() {
    return this._array;
  }

  get isSubDocument() {
    return (this._type.isModel && this.hydrate) || this._type.isStructure;
  }

  get isReference() {
    return (this._type.isModel && !this.hydrate);
  }

  canRead(roles) {
    return this.canAction(roles, 'read');
  }

  canUpdate(roles) {
    return this.canAction(roles, 'update');
  }

  canAction(roles, action) {
    //If security has been set for this property
    if (this.secure && this.secure[action]) {
      roles = Array.isArray(roles) ? roles : [roles];

      //Since security has been set, we are not allowed to access this, yet...

      //For all the Roles this User has
      for (let i = 0; i < roles.length; i++) {
        let role = roles[i];

        //If any of their roles are mentioned, they can update, so short circuit
        if (this.secure[action].indexOf(role) !== -1) {
          return true;
        }
      }

      return false;
    } else {
      return true;
    }
  }
}


exports = module.exports = Property;