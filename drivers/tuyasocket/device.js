'use strict';

const TuyaBaseDevice = require('../tuyabasedevice');
const DataUtil = require('../../util/datautil');

const CAPABILITIES_SET_DEBOUNCE = 1000;

class TuyaSocketDevice extends TuyaBaseDevice {

    onInit() {
        this.initDevice(this.getData().id);
        this.setDeviceConfig(this.get_deviceConfig());
        this.log(`Tuya socket ${this.getName()} has been initialized`);
    }

    setDeviceConfig(deviceConfig) {
        if (deviceConfig != null) {
            console.log("set socket device config: " + JSON.stringify(deviceConfig));
            let statusArr = deviceConfig.status ? deviceConfig.status : [];
            this.correctMeasurePowerCapability(statusArr);
            let capabilities = this.getCustomCapabilities(DataUtil.getSubService(statusArr));
            this.updateCapabilities(statusArr);
            this.registerMultipleCapabilityListener(capabilities, async (values, options) => { return this._onMultipleCapabilityListener(values, options); }, CAPABILITIES_SET_DEBOUNCE);
        }
    }

    correctMeasurePowerCapability(statusArr) {
        for (var statusMap of statusArr) {
            switch (statusMap.code) {
                case "cur_power":
                    if (!this.hasCapability("measure_power")) {
                        this.homey.app.logToHomey("addCapability measure_power");
                        this.addCapability("measure_power");
                    }
                    break;
            }
        }
    }

    getCustomCapabilities(subcodes) {
        var capabilties = [];
        for (var code of subcodes) {
            let name;
            if (subcodes.length === 1) {
                name = "onoff";
                this.multiswitch = false;
            }
            else {
                name = "onoff." + code;
                this.multiswitch = true;
            }
            capabilties.push(name);
        }
        return capabilties;
    }

    _onMultipleCapabilityListener(valueObj, optsObj) {
        this.log("Socket Capabilities changed by Homey: " + JSON.stringify(valueObj));
        try {
            for (let key of Object.keys(valueObj)) {
                let value = valueObj[key];
                this.sendCommand(key, value);
            }
        } catch (ex) {
            this.homey.app.logToHomey(ex);
        }
    }

    updateCapabilities(statusArr) {
        this.log("Update socket capabilities from Tuya: " + JSON.stringify(statusArr));
        if (!statusArr) {
            return;
        }
        let subcodes = DataUtil.getSubService(statusArr);
        for (var subType of subcodes) {
            var status = statusArr.find(item => item.code === subType);
            if (!status) {
                continue;
            }
            let name;
            var value = status.value;
            if (!this.multiswitch) {
                name = "onoff";
                this.switchValue = status;
            }
            else {
                name = "onoff." + subType;
            }
            this.log(`Set socket capability ${name} with value ${value}`);
            this.setCapabilityValue(name, value).catch(this.error);
            this.triggerSocketChanged(subType, value);
        }
        for (var statusMap of statusArr) {
            if (statusMap.code === 'cur_power') {
                this.setCapabilityValue("measure_power", statusMap.value).catch(this.error);
            }
        }
    }

    triggerSocketChanged(name, value) {
        let tokens = {};
        let state = {
            socketid: name,
            state: value ? "On" : "Off"
        };
        this.driver.triggerSocketChanged(this, tokens, state);
    }

    sendCommand(name, value) {
        var param = this.getSendParam(name, value);
        this.homey.app.tuyaOpenApi.sendCommand(this.id, param).catch((error) => {
            this.log.error('[SET][%s] capabilities Error: %s', this.id, error);
        });
    }

    //get Command SendData
    getSendParam(name, value) {
        var code;
        const isOn = value ? true : false;
        if (name.indexOf(".") === -1) {
            code = this.switchValue.code;
        } else {
            code = name.split('.')[1];
        }
        value = isOn;
        this.log("update Tuya socket code " + code + ": " + JSON.stringify(value));
        return {
            "commands": [
                {
                    "code": code,
                    "value": value
                }
            ]
        };
    }
}

module.exports = TuyaSocketDevice;