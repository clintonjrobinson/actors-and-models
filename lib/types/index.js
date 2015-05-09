"use strict";

var utils = require('../utils');

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

exports.Image = require('./Image').Image;
exports.Approval = require('./Approval').Approval;
exports.LocaleString = require('./LocaleString').LocaleString;

exports.ObjectID = require('mongodb').ObjectID;
