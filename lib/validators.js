"use strict";

exports = module.exports = {
  Required: function(value) {
    if (value === undefined || value === null || value === '' || (typeof(value) === 'number' && isNaN(value)) ||  value === Infinity) {
      return false;
    }

    return true;
  },
  Email: function(value) {
    //We are not going to use a regex see http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address
    //Instead, check for a . and an @ and that is all.
    return (value.indexOf('@') > 0 && value.indexOf('.') !== -1);
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
    for (let role of ['System', 'Anonymous', 'Owner']) {
      if (value == role) {
        return false;
      }
    }

    if (value.indexOf('Group') === 0) {
      return false;
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