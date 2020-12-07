/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { Version } from './Common';
import { CommonUtils } from './CommonUtils';

export enum AndroidDeviceType {
    Emulator = 'Emulator',
    Device = 'Device'
}

export class AndroidPackages {
    public static parseRawPackagesString(
        rawStringInput: string
    ): AndroidPackages {
        const startIndx = rawStringInput
            .toLowerCase()
            .indexOf('installed packages:', 0);
        const endIndx = rawStringInput
            .toLowerCase()
            .indexOf('available packages:', startIndx);
        const rawString = rawStringInput.substring(startIndx, endIndx);
        const packages: AndroidPackages = new AndroidPackages();

        // Installed packages:
        const lines = rawString.split('\n');
        if (lines.length > 0) {
            let i = 0;
            for (; i < lines.length; i++) {
                if (lines[i].toLowerCase().indexOf('path') > -1) {
                    i = i + 2; // skip ---- and header
                    break; // start of installed packages
                }
            }

            for (; i < lines.length; i++) {
                const rawStringSplits: string[] = lines[i].split('|');
                if (rawStringSplits.length > 1) {
                    const path = rawStringSplits[0].trim();
                    if (
                        path.startsWith('platforms;android-') ||
                        path.startsWith('system-images;android-')
                    ) {
                        const pathName = path
                            .replace('platforms;', '')
                            .replace('system-images;', '');
                        let versionString = pathName.replace('android-', '');
                        if (versionString.indexOf(';') >= 0) {
                            versionString = versionString.substring(
                                0,
                                versionString.indexOf(';')
                            );
                        }
                        const version = Version.from(versionString);
                        const description = rawStringSplits[2].trim();
                        const locationOfPack =
                            rawStringSplits.length > 2
                                ? rawStringSplits[3].trim()
                                : '';
                        const pkg = new AndroidPackage(
                            pathName,
                            version,
                            description,
                            locationOfPack
                        );
                        if (path.startsWith('platforms;android-')) {
                            packages.platforms.push(pkg);
                        } else {
                            packages.systemImages.push(pkg);
                        }
                    }
                }

                if (lines[i].indexOf('Available Packages:') > -1) {
                    break;
                }
            }
        }
        return packages;
    }

    public platforms: AndroidPackage[];
    public systemImages: AndroidPackage[];

    constructor() {
        this.platforms = [];
        this.systemImages = [];
    }

    public isEmpty(): boolean {
        return this.platforms.length < 1 && this.systemImages.length < 1;
    }
}

// tslint:disable-next-line: max-classes-per-file
export class AndroidPackage {
    get platformAPI(): string {
        const tokens: string[] = this.path.split(';');
        return tokens.length > 0 ? tokens[0] : '';
    }

    get platformEmulatorImage(): string {
        const tokens: string[] = this.path.split(';');
        return tokens.length > 1 ? tokens[1] : '';
    }

    get abi(): string {
        const tokens: string[] = this.path.split(';');
        return tokens.length > 2 ? tokens[2] : '';
    }

    public path: string;
    public version: Version;
    public description: string;
    public location: string;

    constructor(
        path: string,
        version: Version,
        description: string,
        location: string
    ) {
        this.path = path;
        this.version = version;
        this.description = description;
        this.location = location;
    }
}

// tslint:disable-next-line: max-classes-per-file
export class AndroidDevice {
    public static parseRawString(
        emulatorsString: string,
        devicesString: string
    ): AndroidDevice[] {
        const allDevices: AndroidDevice[] = [];

        const devicesLines = devicesString.split('\n').filter((i) => i);
        devicesLines.shift();

        if (devicesLines) {
            for (const line of devicesLines) {
                const parsed = this.parseDeviceLine(line.trim());
                if (parsed != null) {
                    allDevices.push(parsed);
                }
            }
        }

        const avds = AndroidDevice.getAvdDefinitions(emulatorsString);
        for (const avd of avds) {
            const name = AndroidDevice.getValueForKey(avd, 'name:');
            const device = AndroidDevice.getValueForKey(avd, 'device:');
            const path = AndroidDevice.getValueForKey(avd, 'path:');
            const target = AndroidDevice.getValueForKey(avd, 'target:');
            const api = AndroidDevice.getValueForKey(avd, 'based on:');

            if (name && device && path && target && api) {
                allDevices.push(
                    new AndroidDevice(
                        name,
                        null,
                        device,
                        path,
                        target,
                        api,
                        AndroidDeviceType.Emulator
                    )
                );
            }
        }

        return allDevices;
    }

    /*
       When we run 'avdmanager list avd' it returns the results (along with any erros)
       as raw string in the following format:

        Available Android Virtual Devices:
            <device definition>
        ---------
            <device definition>
        ---------
            <device definition>

        The following Android Virtual Devices could not be loaded:
            <device error info>
        ---------
            <device error info>
        ---------
            <device error info>

       In the following method, we parse the raw string result and break it up into
       <device definition> chunks, and skip the <device error info> sections
    */
    private static getAvdDefinitions(rawString: string): string[][] {
        // get rid of the error sections (if any)
        const errIdx = rawString.indexOf('\n\n');
        const cleanedRawString =
            errIdx > 0 ? rawString.substring(0, errIdx - 1) : rawString;

        const lowerCasedRawString = cleanedRawString.toLowerCase();
        let position = 0;
        const results: string[][] = [];

        // now parse the device definition sections
        while (position !== -1) {
            const startIdx = lowerCasedRawString.indexOf('name:', position);
            let endIdx = -1;

            if (startIdx > -1) {
                const sepIdx = lowerCasedRawString.indexOf('---', startIdx);
                endIdx = sepIdx > -1 ? sepIdx - 1 : -1;

                let chunk =
                    endIdx > -1
                        ? cleanedRawString.substring(startIdx, endIdx)
                        : cleanedRawString.substring(startIdx);
                chunk = chunk.replace('Tag/ABI:', '\nTag/ABI:'); // put ABI info on a line of its own
                const split = chunk.split('\n');
                results.push(split);
            }

            position = endIdx;
        }

        return results;
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

    private static parseDeviceLine(input: string): AndroidDevice | null {
        if (input.toLowerCase().startsWith('emulator')) {
            return null;
        }

        const parts = input.split(' ').filter((i) => i);

        const name = parts[0];
        let displayName = AndroidDevice.getValueForKey(parts, 'model:') || '';
        const deviceName = AndroidDevice.getValueForKey(parts, 'device:') || '';
        const path = '';
        let target = '';
        let api = '';

        // attempt at getting more details about this device
        try {
            const result = CommonUtils.executeCommand(
                `adb -s ${name} shell getprop`
            );
            const deviceProperties = result.split('\n').filter((i) => i);

            let manufacturer = AndroidDevice.getValueForKey(
                deviceProperties,
                '[ro.product.manufacturer]:'
            );
            if (manufacturer != null && manufacturer.length > 2) {
                manufacturer = manufacturer.substring(
                    1,
                    manufacturer.length - 1
                );
                displayName = `${manufacturer} ${displayName}`;
            }

            let sdkVersion = AndroidDevice.getValueForKey(
                deviceProperties,
                '[ro.build.version.sdk]:'
            );
            if (sdkVersion != null && sdkVersion.length > 2) {
                sdkVersion = sdkVersion.substring(1, sdkVersion.length - 1);
                api = `API ${sdkVersion}`;
            }

            let buildDesc = AndroidDevice.getValueForKey(
                deviceProperties,
                '[ro.build.description]:'
            );
            if (buildDesc != null && buildDesc.length > 2) {
                buildDesc = buildDesc.substring(1, buildDesc.length - 1);
                const descParts = buildDesc.split(' ').filter((i) => i);
                if (descParts.length > 3) {
                    target = descParts[2];
                }
            }
        } catch {
            // ignore and continue
        }

        return new AndroidDevice(
            name,
            displayName,
            deviceName,
            path,
            target,
            api,
            AndroidDeviceType.Device
        );
    }

    public name: string;
    public displayName: string;
    public deviceName: string;
    public path: string;
    public target: string;
    public api: string;
    public deviceType: AndroidDeviceType;

    constructor(
        name: string,
        displayName: string | null,
        deviceName: string,
        path: string,
        target: string,
        api: string,
        deviceType: AndroidDeviceType
    ) {
        this.name = name;
        this.displayName =
            displayName != null ? displayName : name.replace(/_/gi, ' ').trim(); // eg. Pixel_XL --> Pixel XL
        this.deviceName = deviceName.replace(/\([^\(]*\)/, '').trim(); // eg. Nexus 5X (Google) --> Nexus 5X
        this.path = path.trim();
        this.target = target.replace(/\([^\(]*\)/, '').trim(); // eg. Google APIs (Google Inc.) --> Google APIs
        this.api = api.replace('Android', '').trim(); // eg. Android API 29 --> API 29
        this.deviceType = deviceType;
    }

    public toString(): string {
        return `${this.displayName}, ${this.deviceName}, ${this.api}`;
    }
}
