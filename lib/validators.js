"use strict";

exports = module.exports = {
  Required: function(value) {
    if (value === undefined || value === null || value === '' || (typeof(value) === 'number' && isNaN(value)) ||  value === Infinity) {
      return false;
    }

    return true;
  },
  Email: function(value) {
    //TODO: Implement the email validator.
    return true;
  },
  RegEx: function(value, regex) {
    return regex.test(value);
  },
  Min: function (value, min) {
    return value >= min;
  },
  Max: function (value, max) {
    return value <= max;
  },
  Length: function(value, len) {
    return value.length === len;
  },
  ArrayLength: function(value, len) {
    return value.length === len;
  },
  ArrayMinLength: function(value, len) {
    return value.length >= len;
  },
  ArrayMaxLength: function(value, len) {
    return value.length <= len;
  },
  MinLength: function(value, len) {
    return value.length >= len;
  },
  MaxLength: function(value, len) {
    return value.length <= len;
  },
  NoReservedRoles: function(value) {
    for (let role of ['System', 'Anonymous', 'Owner', 'Group']) {
      if (value.indexOf(role) !== -1) {
        return false;
      }
    }

    return true;
  },
  In: function(value, arr) {
    var tmp = Array.isArray(value) ? value : [value];

    for (let val of tmp) {
      if (arr.indexOf(val) === -1) {
        return false;
      }
    }

    return true;
  }
};