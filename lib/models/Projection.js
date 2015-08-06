"use strict";

var errors = require('../errors');
var crypto = require('crypto');

if (!Object.assign) {
  Object.assign = require('object-assign');
}

const MAX_RECORDS = 100;

var cache = {
  check: function(key, force) {
    if (!force && cache[key] && cache[key].expiry > Date.now()) {
      return cache[key].data;
    }

    if (cache[key]) {
      clearTimeout(cache[key].timer);
      delete cache[key].data;
      delete cache[key];
    }

    return null;
  },
  add: function (key, data, ttl) {
    ttl = ttl || 5000;

    cache.check(key, true);

    let timer = setTimeout(function(){
      cache.remove(key);
    }, ttl);

    cache[key] = {data: data, expiry: new Date(Date.now() + ttl), timer: timer};
  },
  remove: function(key) {
    return cache.check(key, true);
  }
};


function cast(ctx, obj, value, params) {
  //Primitive, don't call new
  if (obj.name === 'String' || obj.name === 'Number' || obj.name === 'Date' || obj.name === 'Boolean') {
    if (!value) return undefined;

    return obj(value);
  }

  //Anonymous function, assume we don't call new
  if (obj.name === '') {
    return obj(value, ctx, params);
  }

  if (!value) return undefined;
  //Named function, or not a Primitive.  Call new.
  return new obj(value, ctx);
}

class Projection {
  constructor(def) {
    this.def = def;
  }

  get maxResults() {
    return this.def.maxResults || MAX_RECORDS;
  }

  get get() {
    return !(this.def.get === false);
  }

  get post() {
    return !(this.def.post === false);
  }

  getHashKey(params) {
    let hashKey = this.def.name;
    //First get the arguments passed into fetch and process based on the definition
    if (this.def.cache) {
      for (let param in params) {
        //Generate a hash key for caching
        hashKey += `${params[param]}|`;
      }

      if (params.limit) {
        hashKey += `${params.limit}|`;
      }

      if (params.skip) {
        hashKey += `${params.skip}|`;
      }
    }

    return hashKey;
  }

  castParams(ctx, params) {
    var ret = {};
    //First get the arguments passed into fetch and process based on the definition
    for (let param in this.def.params) {
      ret[param] = cast(ctx, this.def.params[param], params[param], params);

      if (this.def.paramsRequired && params[param] === undefined) {
        throw new errors.MissingParametersError([param]);
      }
    }

    return ret;
  }

  *secure (ctx, params) {
    if (this.def.secure) {
      return yield this.def.secure.call(this, ctx, params);
    }

    return true;
  }

  *fetch (ctx, params, opts) {

    function inject(paramName, paramValue, parent) {
      for (let field in parent) {
        //If the field name is an argument, inject it
        if (field.indexOf('${' + paramName + '}') !== -1) {
          let replacement = field.replace('${' + paramName + '}', paramValue);
          parent[replacement] = parent[field];
          delete parent[field];
          field = replacement;
        }

        if (parent[field] === null) {
          //A null is a valid param
        } else if (parent[field].constructor === String && parent[field].indexOf('${' + paramName + '}') !== -1) {
          //If this field matches the param name, inject the param value here
          parent[field] = paramValue;

          if (paramValue === undefined) {
            delete parent[field];
          }
        } else if (typeof(parent[field]) === 'object' || Array.isArray(parent[field])) {
          //If this is a object or array, go recursive
          inject(paramName, paramValue, parent[field]);
        }
      }
    }

    //Is this running as the system context or not.
    ctx = this.def.runAsSystemContext ? Projection.systemContext : ctx;

    let ret;

    if (this.def.cache && (ret = cache.check(opts.hashKey))) {
      return ret;
    }

    ret = {};

    for (let name in this.def.fetch) {
      let fetch = this.def.fetch[name];

      //Is the query a Object or is it a function that returns an Object?
      let query = (fetch.query && fetch.query.constructor === Function)
        ? fetch.query(params)
        : JSON.parse(JSON.stringify(fetch.query))
      ;

      let options = fetch.options ? JSON.parse(JSON.stringify(fetch.options)) : {};

      Object.assign(options, opts);

      //For each param, we will inject the param value to create the query.
      for (let param in params) {
        inject(param, params[param], query);
      }

      options.json = true;

      console.log(this.def.name, opts.hashKey, query);

      if (this.def.directAccess) {
        let cursor = yield fetch.model.mongo.find(fetch.model.collectionName, query, options);
        ret[name] = yield cursor.toArray();
      } else {
        ret[name] = yield fetch.model.find(ctx, query, options);
      }
    }

    if (this.def.cache) {
      cache.add(opts.hashKey, ret, this.def.cache);
    }

    return ret;
  }
}

exports = module.exports = Projection;

Projection.projections = {};

Projection.OPTS = ['limit', 'skip', 'sort'];

Projection.registerDefinition = function(def) {
  Projection.projections[def.name] = new Projection(def);
  return Projection.projections[def.name];
};