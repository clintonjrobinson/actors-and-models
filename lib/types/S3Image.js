"use strict";

var aws = require('aws-sdk');

class S3Image {
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
  static get cls() {return 'S3Image';}
}

S3Image.api = {
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

  color: function *(opts) {

  },

  create: function *(opts) {
    var config = this.app.Models.config.aws;

    function getSignedUrl() {
      return new Promise(function(resolve, reject) {
        aws.config.update({accessKeyId: config.AWSAccessKeyID, secretAccessKey: config.AWSSecretKey});
        var s3 = new aws.S3();
        var params = {
          Bucket: config.bucket,
          Key: `${opts.id}.${opts.propertyName}`,
          Expires: 900,
          ContentType: opts.type,
          ACL: 'public-read'
        };

        s3.getSignedUrl('putObject', params , function(err, data) {
          if (err) {
            reject(err);
            return;
          }

          resolve(data);
        });
      })
    }

    var canAccess = opts.model.canAccess(this, 'update');

    if (canAccess === false) {
      throw new this.app.Models.errors.NotAuthorizedError();
    }

    if (!opts.property.canUpdate(this.roles)) {
      throw new this.app.Models.errors.NotAuthorizedError();
    }

    var metadata = this.request.body.fields.metadata;
    opts.type = metadata.type;

    var update = {$set:{}};
    update.$set[opts.propertyName] = metadata;

    yield opts.model.mongo.findOneAndUpdate(opts.model.collectionName, {_id: opts.id}, update);
    var data = yield getSignedUrl();
    this.body = {
      signed_request: data,
      url: `https://${config.bucket}.s3.amazonaws.com/${opts.id}.${opts.propertyName}`
    };
  }
};

S3Image.api.update = S3Image.api.create;

exports.S3Image = S3Image;
