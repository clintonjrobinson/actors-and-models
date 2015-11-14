"use strict";

exports = module.exports = function(Models) {
  Models.structure({
    name: 'GeoJSON',
    properties : {
      type: {
        type: String,
        validators: {
          Required: true,
          In: Models.constants.GEOJSON_TYPES
        }
      },
      coordinates: {
        type: Number,
        array: true,
        validators: {
          Required: true,
          ArrayMinLength: 2
        }
      }
    }
  });
};