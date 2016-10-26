"use strict";
var send = require('koa-send');
var fs = require('fs');
var thunkify = require('thunkify');

var rename = thunkify(fs.rename);

const DEFAULT_IMAGE_TYPE = 'image/jpeg';
const IMG_SUFFIXES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif'
};

function generatePath(ctx, opts) {
  return `${ctx.app.Models.config.root}/images/${opts.model.cls}/${opts.id}_${opts.propertyName.replace('.', '_')}${IMG_SUFFIXES[opts.type]}`;
}

class Image {
  constructor(image, opts) {
    this._img = image;
  }

  get src() {
    return this._img ? this._img.src : undefined;
  }

  get height() {
    return this._img ? this._img.height : undefined;
  }

  get width() {
    return this._img ? this._img.width : undefined;
  }

  get type() {
    return this._img ? this._img.type : undefined;
  }

  get size() {
    return this._img ? this._img.size : undefined;
  }

  toJSON() {return Object.assign({}, this._img);}
  static get isType() {return true;}
  static get cls() {return 'Image';}
}

Image.api = {
  meta: function *(opts) {
    var canAccess = opts.model.canAccess(this, 'read');

    if (canAccess === false) {
      throw new this.app.Models.errors.NotAuthorizedError;
    }

    if (!opts.property.canRead(this.roles)) {
      throw new this.app.Models.errors.NotAuthorizedError;
    }

    var fields = {};
    fields[opts.propertyName] = 1;

    this.body = yield opts.model.mongo.findOne(opts.model.collectionName, {_id: opts.id}, {fields: fields});
  },

  get: function *(opts) {
    var canAccess = opts.model.canAccess(this, 'read');

    if (canAccess === false) {
      throw new this.app.Models.errors.NotAuthorizedError;
    }

    if (!opts.property.canRead(this.roles)) {
      throw new this.app.Models.errors.NotAuthorizedError;
    }

    var fields = {};
    fields[opts.propertyName] = 1;

    var metadata = yield opts.model.mongo.findOne(opts.model.collectionName, {_id: opts.id}, {fields: fields});

    if (!metadata) {
      throw new this.app.Models.errors.NotFoundError();
    }
    this.type = opts.type = this.app.Models.utils.getPropertyByPath(metadata, opts.propertyName + '.type');

    yield send(this, generatePath(this, opts));
  },
  remove: function *(opts) {
    if (!opts.model.canAccess(this, 'update') && !opts.property.canUpdate(this.roles)) {
      throw new Error('Not authorized');
    }
  },
  create: function *(opts) {
    var canAccess = opts.model.canAccess(this, 'update');

    if (canAccess === false) {
      throw new this.app.Models.errors.NOT_AUTHORIZED_ERROR;
    }

    if (!opts.property.canUpdate(this.roles)) {
      throw new this.app.Models.errors.NOT_AUTHORIZED_ERROR;
    }

    //Image doesn't care how many files you are sending to it, its going to grab the one that matches propertyName.

    if (!(this.request.files && this.request.files[opts.propertyName])) {
      throw new Error(`Invalid propertyName.  Expecting ${opts.propertyName}`);
    }

    var metadata = JSON.parse(this.request.fields.metadata);
    opts.type = metadata.type;

    var file = this.request.files[opts.propertyName];
    var result = yield rename(file.path, generatePath(this, opts));

    var update = {$set:{}};
    update.$set[opts.propertyName] = metadata;

    yield opts.model.mongo.findOneAndUpdate(opts.model.collectionName, {_id: opts.id}, update);
    this.body = metadata;
  }
};

Image.api.update = Image.api.create;

exports.Image = Image;
