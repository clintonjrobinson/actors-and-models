"use strict";

var utils = require('./utils');

function Guid(value) {
  return value
    ? value
    : utils.guid(6)
  ;
}

exports.Guid = Guid;

/**
 * Used to map JavaScript numbers to a decimal value.
 * @param value
 * @constructor
 */
function Decimal(value) {

}