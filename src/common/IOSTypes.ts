/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { CommonUtils } from './CommonUtils';

export enum IOSDeviceType {
    Simulator = 'Simulator',
    Device = 'Device'
}

export class IOSDevice {
    public static parseRawString(input: string): IOSDevice[] {
        const DEVICES_KEY = '== Devices ==';
        const SIMULATORS_KEY = '== Simulators ==';

        const devicesIdx = input.indexOf(DEVICES_KEY);
        const simsIdx = input.indexOf(SIMULATORS_KEY);

        let devicesInput = '';
        if (devicesIdx >= 0 && simsIdx >= devicesIdx + DEVICES_KEY.length) {
            devicesInput = input.substring(
                devicesIdx + DEVICES_KEY.length,
                simsIdx
            );
        }

        let simulatorsInput = '';
        if (simsIdx >= 0) {
            simulatorsInput = input.substring(simsIdx + SIMULATORS_KEY.length);
        }

        const devicesLines = devicesInput.split('\n').filter((i) => i);
        const simulatorsLines = simulatorsInput.split('\n').filter((i) => i);

        const allDevices: IOSDevice[] = [];

        for (const line of devicesLines) {
            const parsed = this.parseLine(line, IOSDeviceType.Device);
            if (parsed != null) {
                allDevices.push(parsed);
            }
        }

        for (const line of simulatorsLines) {
            const parsed = this.parseLine(line, IOSDeviceType.Simulator);
            if (parsed != null) {
                allDevices.push(parsed);
            }
        }

        return allDevices;
    }

    private static parseLine(
        input: string,
        type: IOSDeviceType
    ): IOSDevice | null {
        const udidIdx = input.lastIndexOf('(');
        const runtimeIdx =
            udidIdx >= 0 ? input.lastIndexOf('(', udidIdx - 1) : -1;

        if (runtimeIdx >= 0 && udidIdx > runtimeIdx) {
            const udid = input
                .substring(udidIdx + 1)
                .replace(')', '')
                .trim();

            const runtimeVersion = input
                .substring(runtimeIdx + 1, udidIdx)
                .replace(')', '')
                .trim();

            const name = input.substring(0, runtimeIdx).trim();

            if (type === IOSDeviceType.Device) {
                // we only support iPhone not other device types (iPad, watch, tv, ...)
                try {
                    const result = CommonUtils.executeCommand(
                        `ideviceinfo -u ${udid}`
                    );
                    const deviceProperties = result
                        .split('\n')
                        .filter((i) => i);
                    const deviceClass = IOSDevice.getValueForKey(
                        deviceProperties,
                        'DeviceClass:'
                    );

                    if (deviceClass && deviceClass.toLowerCase() === 'iphone') {
                        return new IOSDevice(name, udid, runtimeVersion, type);
                    }
                } catch {
                    // ignore and continue
                }
            } else {
                return new IOSDevice(name, udid, runtimeVersion, type);
            }
        }

        return null;
    }

    private static getValueForKey(array: string[], key: string): string | null {
        for (const item of array) {
            const trimmed = item.trim();

            if (trimmed.toLowerCase().startsWith(key.toLowerCase())) {
                const value = trimmed.substring(key.length).trim();
                return value;
            }
        }
        return null;
    }

    public name: string;
    public udid: string;
    public runtimeVersion: string;
    public deviceType: IOSDeviceType;

    constructor(
        name: string,
        udid: string,
        runtimeVersion: string,
        deviceType: IOSDeviceType
    ) {
        this.name = name;
        this.udid = udid;
        this.runtimeVersion = runtimeVersion;
        this.deviceType = deviceType;
    }

    public toString(): string {
        return `${this.name}, ${this.runtimeVersion}`;
    }
}
