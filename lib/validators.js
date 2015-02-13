"use strict";

exports.Validators = {
  Required: function(value) {
    if (value === undefined || value === null || value === '' || isNaN(value) || value === Infinity) {
      return false;
    }

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
  MinLength: function(value, len) {
    return value.length >= len;
  },
  MaxLength: function(value, len) {
    return value.length <= len;
  }
};