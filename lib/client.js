const babel = require('babel-core');
const uglify = require('uglify-js');

let clientJS;

exports = module.exports = function(Models) {

  if (clientJS) {
    return clientJS;
  }

  let str = 'var Models = window.Models = {};\n';
  //TODO: refactor this later.  Could be a separate client side Types library
  str += 'var utils = Models.utils = {';
  for (var util in Models.utils) {
    str += `${util}: ${Models.utils[util]},`;
  }
  str += '__end: true};\n';

  str += 'var errors = Models.errors ={';
  for (var error in Models.errors) {
    str += `${error}: ${Models.errors[error]},`;
  }
  str += '__end: true};\n';

  str += 'var Validators = Models.Validators = {';
  for (var validator in Models.Validators) {
    str += `${validator}: ${Models.Validators[validator]},`;
  }
  str += '__end: true};\n';

  str += `Models.constants = ${JSON.stringify(Models.constants)};\n`;
  str += 'var Types = Models.Types = {';
  for (var type in Models.Types) {
    str += `${type}: ${Models.Types[type]},`;
  }
  str += '__end: true};\n';
  str += 'var ObjectID = Models.Types.ObjectID = String;\n';
  str += 'var DBRef = Models.Types.DBRef;\n';

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
      str += `Extend = Models.structures.${
        Models.structures[structure].def.extend.name
      };`;
    } else {
      str += 'Extend = Structure;';
    }

    str += Models.structures[structure].toString();
    str += `; Models.structures.${structure} = ${structure};\n`;
    //str += `Models.structures.${structure}._clientInit();\n`;
    str += `Extend.children = Extend.children || {};\n`;
    str += `Extend.children['${structure}'] = Models.structures.${structure};`;
  }

  str += Models.Document.toString();
  str += `; Models.Document = Document;\n`;
  str += `Models.models = {};\n`;

  for (let model in Models.models) {
    if (Models.models[model].def.extend) {
      str += `Extend = Models.models.${Models.models[model].def.extend.name};`;
    } else {
      str += 'Extend = Document;';
    }

    str += Models.models[model].toString();
    str += `; Models.models.${model} = ${model};\n`;
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

  clientJS = str;
  clientJS = babel.transform(str, {
    compact: Models.constants.IS_PRODUCTION,
    presets: ['es2015'],
    plugins: ['transform-regenerator']
  }).code;

  clientJS = '(function() {\n' + clientJS + '\n})();';

  if (Models.constants.IS_PRODUCTION) {
    try {
      const result = uglify.minify(clientJS, {
        compress: { drop_console: true }
      });

      if (result.error) {
        console.error(result.error);
      } else {
        clientJS = result.code;
      }
    } catch (e) {
      console.error(e);
      console.error(e.stack);
    }
  }

  return clientJS;
};
