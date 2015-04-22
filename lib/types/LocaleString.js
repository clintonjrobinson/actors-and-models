"use strict";

class LocaleString {
  constructor(raw) {
    //Init to empty so I dont have to check later
    this.raw = raw || {};
  }

  toJSON() {
    return JSON.stringify(this.raw);
  }

  static get isType() {return true;}
}

exports.LocaleString = LocaleString;
