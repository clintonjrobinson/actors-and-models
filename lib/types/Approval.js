"use strict";

function *approve(opts, isApproved) {
  if (!opts.model.canAccess(this, 'update') && opts.property.canUpdate(this.roles)) {
    throw new Error('Not authorized');
  }

  this.enforcePost();

  var approval = {
    user: new require('mongodb').DBRef('User', this.user._id),
    time: Date.now(),
    approved: isApproved
  };

  //do da update
  yield model.update()
}

class Approval {
  constructor(raw) {
    this.raw = raw;
  }

  get user() {
    return this.raw ? this.raw.user : undefined;
  }

  get time() {
    return this.raw ? this.raw.time : undefined;
  }

  get approved() {
    return this.raw ? this.raw.approved : undefined;
  }

  toJSON() {
    return this.raw;
  }
}

Approval.isType = true;

Approval.api = {
  approve: function *(opts) {
    yield* approve.call(this, opts, true);
  },
  reject: function *(opts) {
    yield* approve.call(this, opts, false);
  }
};

exports.Approval = Approval;
