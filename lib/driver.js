/*
 * cylon-bb8 driver
 * http://cylonjs.com
 *
 * Copyright (c) 2015 Justin McGrew
 * Licensed under the MIT license.
*/

"use strict";

var Cylon = require("cylon");
var Sphero = require("hybridgroup-spheron");

var Logger = Cylon.Logger;

var BB8BLEService = "22bb746f2bb075542d6f726568705327",
    WakeMainProcessor = "22bb746f2bbf75542d6f726568705327",
    TXPower = "22bb746f2bb275542d6f726568705327",
    AntiDos = "22bb746f2bbd75542d6f726568705327",
    BB8RobotControlService = "22bb746f2ba075542d6f726568705327",
    Roll = "22bb746f2ba175542d6f726568705327",
    Notify = "22bb746f2ba675542d6f726568705327";

var Driver = module.exports = function Driver() {
  Driver.__super__.constructor.apply(this, arguments);

  this.commands = {
    wake: this.wake,
    set_tx_power: this.setTXPower,
    get_data: this.getData,
    setRGB: this.setRGB,
    roll: this.roll,
    stop: this.stop,
    set_raw_motor_values: this.setRawMotorValues,
    set_stabilization: this.setStabilization
  };

  // Raw Motor Commands for use with setRawMotorValues
  // Off (motor is open circuit)
  this.MotorOff = 0x00;

  // Forward
  this.MotorForward = 0x01;

  // Reverse
  this.MotorReverse = 0x02;

  // Brake (motor is shorted)
  this.MotorBrake = 0x03;

  // Ignore (motor mode and power is left unchanged)
  this.MotorIgnore = 0x04;

  this.heading = 0;
};

Cylon.Utils.subclass(Driver, Cylon.Driver);

Driver.prototype.start = function(callback) {
  callback();
};

Driver.prototype.halt = function(callback) {
  callback();
};

/**
 * Tells the BB8 to wake up
 *
 * @param {Function} callback function to be triggered when the BB8 is awake
 * @return {void}
 * @publish
 */
Driver.prototype.wake = function(callback) {
  this._writeServiceCharacteristic(
    BB8BLEService,
    WakeMainProcessor,
    1,
    callback
  );
};

/**
 * Sets the BLE transmit power for the BB8.
 *
 * Uses more battery, but gives longer range
 *
 * @param {Number} level power to set
 * @param {Function} callback function to call when done
 * @return {void}
 * @publish
 */
Driver.prototype.setTXPower = function(level, callback) {
  this._writeServiceCharacteristic(BB8BLEService, TXPower, level, callback);
};

/**
 * Sets the RGB color of BB8's built-in LED
 *
 * @param {Number} color color value to set
 * @param {Boolean} persist whether color should persist through power cycles
 * @param {Function} callback function to call when done
 * @return {void}
 * @publish
 */
Driver.prototype.setRGB = function(color, persist, callback) {
  var packet = Sphero.commands.api.setRGB(color, persist, {resetTimeout: true});
  this._writeServiceCharacteristic(BB8RobotControlService,
    Roll,
    packet,
    callback
  );
};

/**
 * Tells BB8 to roll in a particular speed and heading
 *
 * @param {Number} speed speed to roll at
 * @param {Number} heading heading to roll at
 * @param {Number} state roll state value
 * @param {Function} callback function to call when done
 * @return {void}
 * @publish
 */
Driver.prototype.roll = function(speed, heading, state, callback) {
  this.heading = heading;

  var packet = Sphero.commands.api.roll(
    speed,
    heading,
    state,
    { resetTimeout: true }
  );

  this._writeServiceCharacteristic(BB8RobotControlService,
    Roll,
    packet,
    callback
  );
};


/**
 * Tells BB8 to stop rolling
 *
 * @param {Function} callback function to call when done
 * @return {void}
 * @publish
 */
Driver.prototype.stop = function(callback) {
  this.roll(0, this.heading, 1, callback);
};

/**
 * Allows for direct control of both motors, rather than auto-control via the
 * stabilization system.
 *
 * Each motor (left and right) requires a mode (see below) and a power value
 * from 0-255. This command will disable stabilization if both modes aren't
 * "ignore" so you'll need to re-enable it via setStabilization() once you're
 * done.
 *
 * @param {Number} lm left motor mode
 * @param {Number} lp left motor power
 * @param {Number} rm right motor mode
 * @param {Number} rp right motor power
 * @param {Function} callback function to call when done
 * @return {void}
 * @publish
 */
Driver.prototype.setRawMotorValues = function(lm, lp, rm, rp, callback) {
  var packet = Sphero.commands.api.setRawMotorValues(
    lm, lp,
    rm, rp,
    { resetTimeout: true }
  );

  this._writeServiceCharacteristic(BB8RobotControlService,
    Roll,
    packet,
    callback
  );
};

/**
 * Used to enable/disable BB8's auto-stabilization
 *
 * Often used after setting raw motor commands.
 *
 * @param {Number} enable stabilization enable mode
 * @param {Function} callback function to call when done
 * @return {void}
 * @publish
 */
Driver.prototype.setStabilization = function(enable, callback) {
  var packet = Sphero.commands.api.setStabilization(
    enable,
    { resetTimeout: true }
  );

  this._writeServiceCharacteristic(BB8RobotControlService,
    Roll,
    packet,
    callback
  );
};

/**
 * Enables developer mode on the BB8.
 *
 * This is accomplished via sending a special string to the Anti-DoS service,
 * setting TX power to 7, and telling the Sphero to wake up.
 *
 * @param {Function} callback function to call when done
 * @return {void}
 * @publish
 */
Driver.prototype.devModeOn = function(callback) {
  var bb8 = this;

  Logger.info("Putting BB8 into dev mode.");
  Logger.debug("Sending anti-DoS string.");

  bb8.setAntiDos(function() {
    Logger.debug("Anti-DoS sent.");
    Logger.debug("Setting TX power to 7.");

    bb8.setTXPower(7, function() {
      Logger.debug("TX power sent.");
      Logger.debug("Sending wake.");

      bb8.wake(function(err, data) {
        Logger.debug("Wake sent.");
        callback(err, data);
      });
    });
  });
};

/**
 * Sends a special Anti-DoS string to the BB8.
 *
 * Used when enabling developer mode
 *
 * @param {Function} callback function to call when done
 * @return {void}
 */
Driver.prototype.setAntiDos = function(callback) {
  var str = "011i3";
  var bytes = [];

  for (var i = 0; i < str.length; ++i) {
    bytes.push(str.charCodeAt(i));
  }

  this._writeServiceCharacteristic(BB8BLEService, AntiDos, bytes, callback);
};

/**
 * Writes a service characteristic to the BB8.
 *
 * @param {Number} s service id
 * @param {Number} c characteristic id
 * @param {Number} value value to write
 * @param {Function} callback function to call when done
 * @return {void}
 */
Driver.prototype._writeServiceCharacteristic = function(s, c, value, callback) {
  this.connection.writeServiceCharacteristic(s, c, new Buffer(value),
    function(err, data) {
      if (typeof callback === "function") { callback(err, data); }
    }
  );
};