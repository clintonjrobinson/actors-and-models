"use strict";
var babel = require('babel');
var uglify = require('uglify-js');

var clientJS;

exports = module.exports = function(Models) {
  return function () {
    if (!clientJS) {
      var str = 'var ObjectID = String;\n'
      //TODO: refactor this later.  Could be a separate client side Types library
      str += 'var utils = {';
      for (var util in Models.utils) {
        str += `${util}: ${Models.utils[util]},`;
      }
      str += '};\n';

      str += 'var errors = {';
      for (var error in Models.errors) {
        str += `${error}: ${Models.errors[error]},`;
      }
      str += '};\n';

      str += 'var Validators = {';
      for (var validator in Models.Validators) {
        str += `${validator}: ${Models.Validators[validator]},`;
      }
      str += '};\n';

      str += 'var Models = window.Models = {};\n';

      str += `Models.constants = ${JSON.stringify(Models.constants)};\n`;
      str += 'var Types = Models.Types = {';
      for (var type in Models.Types) {
        str += `${type}: ${Models.Types[type]},`;
      }
      str += '};\n';

      str += Models.Property.toString();
      str += `Models.Property = Property;\n`;
      str += Models.Common.toString();
      str += `Models.Common = Common;\n`;
      str += Models.Structure.toString();
      str += `Models.Structure = Structure;\n`;
      str += `Models.structures = {};\n`;
      str += 'var Extend;';

      for (let structure in Models.structures) {
        if (Models.structures[structure].def.extend) {
          str += `Extend = Models.structures.${Models.structures[structure].def.extend.name};`;
        } else {
          str += 'Extend = Structure;';
        }

        str += Models.structures[structure].toString();
        str += `Models.structures.${structure} = ${structure};\n`;
        //str += `Models.structures.${structure}._clientInit();\n`;
        str += `Extend.children = Extend.children || {};\n`;
        str += `Extend.children['${structure}'] = Models.structures.${structure};`;

      }

      str += Models.Document.toString();
      str += `Models.Document = Document;\n`;
      str += `Models.models = {};\n`;

      for (let model in Models.models) {
        if (Models.models[model].def.extend) {
          str += `Extend = Models.models.${Models.models[model].def.extend.name};`;
        } else {
          str += 'Extend = Document;';
        }

        str += Models.models[model].toString();
        str += `Models.models.${model} = ${model};\n`;
        //str += `Models.models.${model}._clientInit();`;
        str += `Extend.children = Extend.children || {};\n`;
        str += `Extend.children['${model}'] = Models.structures.${model};\n`;
      }

      str += `setTimeout(function() {
      for (var name in Models.structures) {
        Models.structures[name]._clientInit();
      }
    }, 10);`;

      str += `setTimeout(function() {
      for (var name in Models.models) {
        Models.models[name]._clientInit();
      }
    }, 10);`;

      clientJS = babel.transform(str).code;

      if (Models.constants.IS_PRODUCTION) {
        clientJS = uglify.minify(clientJS, {fromString: true}).code;
      }
    }

    return '(function() {\n' + clientJS + '\n})();';
  }
};