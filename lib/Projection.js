"use strict";

var errors = require('./errors');
var crypto = require('crypto');

if (!Object.assign) {
  Object.assign = require('object-assign');
}

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


function cast(obj, value) {
  //Primitive, don't call new
  if (obj.name === 'String' || obj.name === 'Number' || obj.name === 'Date') {
    return obj(value);
  }

  //Anonymous function, assume we don't call new
  if (obj.name === '') {
    return obj(value);
  }

  //Named function, or not a Primitive.  Call new.
  return new obj(value);
}

class Projection {
  constructor(def) {
    this.def = def;
  }

  *fetch (ctx, inParams) {
    var params = {};

    function inject(paramName, paramValue, parent) {
      for (let field in parent) {
        //If the field name is an argument, inject it
        if (field.indexOf('${' + paramName + '}') !== -1) {
          let replacement = field.replace('${' + paramName + '}', paramValue);
          parent[replacement] = parent[field];
          delete parent[field];
          field = replacement;
        }

        //If this field matches the param name, inject the param value here
        if (parent[field].constructor === String && parent[field].indexOf('${' + paramName + '}') !== -1) {
          parent[field] = paramValue;
        } else if (typeof(parent[field]) === 'object' || Array.isArray(parent[field])) {
          //If this is a object or array, go recursive
          inject(paramName, paramValue, parent[field]);
        }
      }
    }

    //Is this running as the system context or not.
    ctx = this.def.runAsSystemContext ? global.systemContext : ctx;

    let hashKey = '';
    //First get the arguments passed into fetch and process based on the definition
    for (let param in this.def.params) {
      //TODO: Not all params will be created using new.  Could just be a function call?
      //Is anonymous function? Then call.
      //Is named function? Then use new
      //Is known type? (String, Number, Date) Then call.
      params[param] = cast(this.def.params[param], inParams[param]);

      if (this.def.cache) {
        //Generate a hash key for caching
        hashKey += `${param}:${params[param]}|`;
      }
    }

    let ret;

    if (this.def.cache && (ret = cache.check(hashKey))) {
      return ret;
    }

    ret = {};

    for (let name in this.def.fetch) {
      let fetch = this.def.fetch[name];

      //Is the query a Object or is it a function that returns an Object?
      let query = (fetch.query && fetch.query.constructor === Function)
        ? fetch.query(inParams)
        : JSON.parse(JSON.stringify(fetch.query))
      ;

      //For each param, we will inject the param value to create the query.
      for (let param in params) {
        inject(param, params[param], query);
      }

      ret[name] = yield fetch.model.find(ctx, query, options);
    }

    if (this.def.cache) {
      cache.add(hashKey, ret, this.def.cache);
    }

    return ret;
  }
}

exports = module.exports = Projection;


Projection.projections = {};


Projection.registerDefinition = function(def) {
  Projection.projections[def.name] = new Projection(def);
  return Projection.projections[def.name];
};