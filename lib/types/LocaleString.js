"use strict";

class LocaleString {
  constructor(raw, obj, property) {
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

  get length() {
    var length = 0;
    //Return the max length from all locales.
    for (var locale in this.raw) {
      length = Math.max(length, this.raw[locale].length);
    }

    return length;
  }

  static get isType() {return true;}
  static get hasValue() {return true;}
  //Does locale effect this type?
  static get isLocale() {return true;}
  static get cls() {return 'LocaleString';}
}

exports.LocaleString = LocaleString;
