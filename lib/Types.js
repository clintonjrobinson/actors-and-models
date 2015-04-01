"use strict";

var utils = require('./utils');

function MiniGuid(value) {
  return value
    ? value
    : utils.guid(6)
  ;
}
exports.MiniGuid = MiniGuid;

function Guid(value) {
  return value
    ? value
    : utils.guid()
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


class Image {
  constructor(img) {
  }

  static api (opts) {
    return new Promise(function(resolve, reject) {
      resolve(opts);
    });
  }
}
Image.hasApi = true;
exports.Image = Image;