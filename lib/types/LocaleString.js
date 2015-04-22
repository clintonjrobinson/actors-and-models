"use strict";

class LocaleString {
  constructor(raw, obj) {
    this.raw = {};

    //TODO: externalize default locale
    this.locale = obj ? obj.__locale : 'en';

    //If this is just a string, not an object.  Set to current locale
    if (raw && raw.constructor === String) {
      this.value = raw;
    } else {
      this.raw = raw || {};
    }
  }

  setLocale(locale) {
    this.locale = locale;
  }

  get value() {
    return this.raw[this.locale];
  }

  set value(value) {
    this.raw[this.locale] = value;
  }

  toJSON() {
    return this.raw;
  }

  static get isType() {return true;}
  //Does locale effect this type?
  static get isLocale() {return true;}
}

exports.LocaleString = LocaleString;
