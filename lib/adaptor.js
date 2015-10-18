/*
 * cylon-bb8 adaptor
 * http://cylonjs.com
 *
 * Copyright (c) 2015 Justin McGrew
 * Licensed under the MIT license.
 */

"use strict";

var util = require("util"),
    EventEmitter = require("events").EventEmitter;
var async = require("async");
var Cylon = require("cylon");

var Logger = Cylon.Logger;

var ROBOT_NOTIFY =  "22bb746f2ba675542d6f726568705327";

var BB8Adaptor = module.exports = function BB8Adaptor(opts) {
    opts = opts || {};

    BB8Adaptor.__super__.constructor.apply(this, arguments);

    this.bleConnect = require("noble");

    this._services = [];
    this.uuid = opts.uuid;
    this.peripheral = null;
    this.isConnected = false;
    this.writeNotify = opts.writeNotify || true;
};

util.inherits(BB8Adaptor, EventEmitter);
Cylon.Utils.subclass(BB8Adaptor, Cylon.Adaptor);

BB8Adaptor.prototype.connect = function connect(callback) {
    Logger.debug("BB8Adaptor.connect");
    this.emit.bind(this, "connect");

    var ble = this.bleConnect;
    var self = this;

    ble.on("stateChange", function (state) {
        Logger.debug("BB8Adaptor.connect.stateChange", state);
        if (state === "poweredOn") {
            return ble.startScanning(this.uuid, false);
        }

        ble.stopScanning();
    });

    ble.on("discover", this.emit.bind(this, "discover"));

    ble.on("discover", function (peripheral) {
        if (peripheral.uuid === this.uuid) {
            ble.stopScanning();
            self.peripheral = peripheral;

            peripheral.connect(function (connectError) {
                if (connectError) {
                    Logger.error("BB8Adaptor.connect.error", connectError);
                    callback(connectError)
                }
                else {
                    var serviceList = [];

                    async.series(
                        [
                            function (seriesCallback) {
                                peripheral.discoverServices([], function (serviceError, services) {
                                    if (serviceError) {
                                        Logger.error("BB8Adaptor.connect.service.error", serviceError);
                                        seriesCallback(serviceError);
                                    }
                                    else {
                                        self.isConnected = true;
                                        serviceList = services;
                                        seriesCallback();
                                    }
                                });
                            },
                            function (seriesCallback) {
                                async.each(
                                    serviceList,
                                    function (service, serviceCallback) {
                                        service._characteristics = [];
                                        service.discoverCharacteristics([], function (charError, chars) {
                                            if (charError) {
                                                Logger.error("BB8Adaptor.connect.characteristic.error", charError);
                                                serviceCallback(charError);
                                            }
                                            else {
                                                service._characteristics = chars;
                                                serviceCallback();
                                            }
                                        });
                                    },
                                    function (eachError) {
                                        self._services = serviceList;
                                        seriesCallback(eachError);
                                    }
                                );
                            }
                        ],
                        function (seriesError) {
                            callback(seriesError, self);
                        }
                    );
                }
            });
        }
    }.bind(this));
};

BB8Adaptor.prototype.open = BB8Adaptor.prototype.connect;

BB8Adaptor.prototype.disconnect = function disconnect(callback) {
    Logger.debug("BB8Adaptor.disconnect");
    this.emit.bind(this, "disconnect");
    callback();
};

/*** BLE ***/

/**
 * Reads a service characteristic from the BLE peripheral.
 *
 * Triggers the provided callback when data is retrieved.
 *
 * @param {Number} serviceId ID of service to get details for
 * @param {Number} characteristicId ID of characteristic to get details for
 * @param {Function} callback function to be invoked with value
 * @return {void}
 * @publish
 */
BB8Adaptor.prototype.readServiceCharacteristic = function (serviceId, characteristicId, callback) {
    this.getCharacteristic(serviceId, characteristicId, function (err, c) {
        if (err) {
            return callback(err);
        }
        c.read(callback);
    });
};

/**
 * Writes a service characteristic value to the BLE peripheral.
 *
 * Triggers the provided callback when data is written.
 *
 * @param {Number} serviceId ID of service to get details for
 * @param {Number} characteristicId ID of characteristic to get details for
 * @param {Number} value value to write to the characteristic
 * @param {Function} callback function to be invoked when data is written
 * @return {void}
 * @publish
 */
BB8Adaptor.prototype.writeServiceCharacteristic = function (serviceId, characteristicId, value, callback) {
    var self = this;
    this.getCharacteristic(serviceId, characteristicId, function (err, c) {
        if (err) {
            return callback(err);
        }

        c.write(value, self.writeNotify, function () {
            callback(null);
        });
    });
};

/**
 * Changes a service characteristic's notification state on the BLE peripheral.
 *
 * Triggers the provided callback when data is written.
 *
 * @param {Number} serviceId ID of service to get details for
 * @param {Number} characteristicId ID of characteristic to get details for
 * @param {String} state notify state to write
 * @param {Function} callback function to be invoked when data is written
 * @return {void}
 * @publish
 */
BB8Adaptor.prototype.notifyServiceCharacteristic = function (serviceId, characteristicId, state, callback) {
    this.getCharacteristic(serviceId, characteristicId, function (err, c) {
        if (err) {
            return callback(err);
        }
        c.notify(state, function (error) {
            c.on("read", function (data, isNotification) {
                callback(error, data, isNotification);
            });
        });
    });
};

/**
 * Finds a BLE service characteristic
 *
 * Triggers the provided callback when the characteristic is found
 *
 * @param {Number} serviceId ID of service to look for
 * @param {Number} characteristicId ID of characteristic to look for
 * @param {Function} callback function to be invoked with requested
 * characteristic
 * @return {void}
 * @publish
 */
BB8Adaptor.prototype.getCharacteristic = function (serviceId, characteristicId, callback) {
    if (!this.isConnected) {
        callback("Not connected", null);
        return;
    }

    var p = this.peripheral;

    p.connect(function () {
        p.discoverServices([serviceId], function (serErr, services) {
            if (serErr) {
                return callback(serErr);
            }

            if (services.length > 0) {
                var s = services[0];

                s.discoverCharacteristics([characteristicId], function (charErr, characteristics) {
                    if (charErr) {
                        return callback(charErr);
                    }

                    var c = characteristics[0];
                    callback(null, c);
                });
            } else {
                callback("Characteristic not found", null);
            }
        });
    });
};
