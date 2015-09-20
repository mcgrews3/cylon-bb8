"use strict";

var BB8 = require("./lib/driver");

module.exports = {
  drivers: ["bb8"],

  driver: function(opts) {
    return new BB8(opts);
  }
};