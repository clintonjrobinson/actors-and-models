"use strict";

function *approve(opts, isApproved) {
  if (!opts.model.canAccess(this, 'update') && opts.property.canUpdate(this.roles)) {
    throw new Error('Not authorized');
  }

  this.enforcePost();

  var approval = {
    user: new model.mongo.ObjectID(this.user._id),
    time: Date.now(),
    approved: isApproved
  };

  var update = {$set:{}};
  update.$set[opts.propertyName] = approval;

  //do da update
  this.body = yield model.mongo.findAndModify(model.collectionName, {_id: new model.mongo.ObjectID(opts.id)}, update);
}

class Approval {
  constructor(raw) {
    //Init to empty so I dont have to check later
    this.raw = raw || {};
  }

  get user() {
    return this.raw.user;
  }

  get time() {
    return this.raw.time;
  }

  get approved() {
    return this.raw.approved;
  }

  toJSON() {
    return JSON.stringify(this.raw);
  }

  static get isType() {return true;}

  static get cls() {return 'Approval';}
}

Approval.api = {
  approve: function *(opts) {
    yield* approve.call(this, opts, true);
  },
  reject: function *(opts) {
    yield* approve.call(this, opts, false);
  }
};

exports.Approval = Approval;
