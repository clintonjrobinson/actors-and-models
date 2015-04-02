"use strict";
var send = require('koa-send');

const FILE_PATH = './images/';
const DEFAULT_IMAGE_TYPE = 'image/jpeg';
const DEFAULT_IMAGE_SUFFIX = '.jpg';
const DEFAULT_QUALITY = 0.6;

function imageType(property) {
  return property.imageType || DEFAULT_IMAGE_TYPE;
}

function imageSuffix(property) {
  return property.imageType || DEFAULT_IMAGE_SUFFIX;
}

class Image {
  constructor(opts) {
  }
}

Image.api = {
  get: function *(opts) {
    if (!opts.model.canAccess(this, 'read') && opts.property.canRead(this.roles)) {
      throw new Error('Not authorized');
    }

    yield send(this, `${opts.opts.root}/images/${opts.model.name}/${opts.id}_${opts.propertyName.replace('.', '_')}${imageSuffix(opts.property)}`);
  },
  remove: function *(opts) {
    if (!opts.model.canAccess(this, 'update') && opts.property.canUpdate(this.roles)) {
      throw new Error('Not authorized');
    }

    this.enforcePost();
  },
  create: function *(opts) {
    if (!opts.model.canAccess(this, 'update') && opts.property.canUpdate(this.roles)) {
      throw new Error('Not authorized');
    }

    this.enforcePost();
  }
};

Image.isType = true;
Image.api.update = Image.api.create;

exports.Image = Image;
