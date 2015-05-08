"use strict";

var ObjectID = require('mongodb').ObjectID;

exports.User = {
  name: 'User',
  description: 'User model.',
  ownerSecurity: true,
  middleware: {
    beforeSave: function *() {
      //Hash that password!
      if (this.password) {
        this.password = require('../lib/utils').hashPassword(this.password);
      }
    },
    afterCreate: function *() {
      var User = this.constructor;
      User.mongo.findOneAndUpdate(User.collectionName, {_id: this._id}, {$set:{_owner: this._id}});
      //A user is its own owner. Mindbomb.
      this._owner = this._id;
    }
  },
  properties: {
    _owner: {
      type: ObjectID
    },
    groups: {
      type: ObjectID,
      array: true,
      validators: {
        MaxLength: 12
      }
    },
    login: {
      type: String,
      validators: {
        Required: true
      },
      secure: {
        read: ['System', 'Admin', 'Owner'],
        update: ['System']
      }
    },
    password: {
      type: String,
      validators: {
        Required: true,
        MinLength: 6
      },
      secure: {
        read: ['System'],
        update: ['System', 'Admin', 'Owner']
      }
    },
    guid: {
      type: String,
      secure: {
        read: ['System'],
        update: ['System']
      }
    },
    source: {
      type: String,
      secure: {
        read: ['System', 'Admin', 'Owner'],
        update: ['System']
      }
    },
    status: {
      type: String,
      secure: {
        read: ['System', 'Admin', 'Owner'],
        update: ['System', 'Admin']
      }
    },
    name: {
      type: String,
      validators: {
        Required: true
      }
    },
    lastLogin: {
      type: Date,
      secure: {
        update: ['System']
      }
    },
    roles: {
      type: String,
      array: true,
      validators: {
        Required: true,
        NoReservedRoles: true
      },
      secure: {
        update: ['System', 'Admin']
      }
    },
    settings: {
      type: Object,
      secure: {
        read: ['System', 'Admin', 'Owner']
      }
    },
    picture: {
      type: String,
      secure: {
        update: ['System', 'Admin', 'Owner']
      }
    },
    email: {
      type: String,
      validators: {
        Email: true
      }
    },
    OAuth: {
      type: Object,
      array: true,
      secure: {
        read: ['System'],
        update: ['System']
      }
    }
  },
  secure: {
    create: ['System', 'Admin'],
    update: ['System', 'Admin', 'Owner'],
    remove: ['System', 'Admin']
  }
};