"use strict";

var BB8Driver = require("./lib/driver");
var BB8Adaptor = require("./lib/adaptor")

module.exports = {
  adaptors: ["bb8"],
  drivers: ["bb8"],

  adaptor: function(opts) {
    return new BB8Adaptor(opts);
  },
  driver: function(opts) {
    return new BB8Driver(opts);
  }
};