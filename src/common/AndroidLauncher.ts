/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import cli from 'cli-ux';
import androidConfig from '../config/androidconfig.json';
import { AndroidDeviceType } from './AndroidTypes';
import { AndroidSDKUtils } from './AndroidUtils';
import { AndroidAppPreviewConfig, LaunchArgument } from './PreviewConfigFile';
import { PreviewUtils } from './PreviewUtils';

export class AndroidLauncher {
    private deviceName: string;

    constructor(deviceName: string) {
        this.deviceName = deviceName;
    }

    public async launchPreview(
        compName: string,
        projectDir: string,
        appBundlePath: string | undefined,
        targetApp: string,
        appConfig: AndroidAppPreviewConfig | undefined
    ): Promise<boolean> {
        const spinner = cli.action;
        spinner.start(`Launching`, `Searching for device ${this.deviceName}`, {
            stdout: true
        });

        try {
            let currentDevice = await AndroidSDKUtils.getDevice(
                this.deviceName
            );

            if (!currentDevice || currentDevice.name.length === 0) {
                spinner.start(
                    `Launching`,
                    `Device not found. Creating device ${this.deviceName}`,
                    {
                        stdout: true
                    }
                );
                const preferredPack = await AndroidSDKUtils.findRequiredEmulatorImages();
                AndroidSDKUtils.createNewVirtualDevice(
                    this.deviceName,
                    preferredPack.platformEmulatorImage || 'default',
                    preferredPack.platformAPI,
                    androidConfig.supportedDevices[0],
                    preferredPack.abi
                );
                currentDevice = await AndroidSDKUtils.getDevice(
                    this.deviceName
                );
                if (!currentDevice) {
                    throw new Error(
                        `Unable to create device ${this.deviceName}`
                    );
                } else {
                    spinner.start(
                        `Launching`,
                        `Created device ${this.deviceName}`,
                        {
                            stdout: true
                        }
                    );
                }
            } else {
                spinner.start(`Launching`, `Found device ${this.deviceName}`, {
                    stdout: true
                });
            }

            if (currentDevice.deviceType === AndroidDeviceType.Emulator) {
                spinner.start(
                    `Launching`,
                    `Starting device ${currentDevice.name}`,
                    {
                        stdout: true
                    }
                );
                let requestedPort = await AndroidSDKUtils.getNextAndroidAdbPort();
                // need to incr by 2, one for console port and next for adb
                requestedPort =
                    requestedPort < androidConfig.defaultAdbPort
                        ? androidConfig.defaultAdbPort
                        : requestedPort + 2;
                const actualPort = await AndroidSDKUtils.startEmulator(
                    this.deviceName,
                    requestedPort
                );

                spinner.start(
                    `Launching`,
                    `Waiting for device to boot: ${currentDevice.name}`,
                    {
                        stdout: true
                    }
                );
                await AndroidSDKUtils.pollDeviceStatus(actualPort);
            }

            if (PreviewUtils.isTargetingBrowser(targetApp)) {
                const compPath = PreviewUtils.prefixRouteIfNeeded(compName);
                const url = `http://192.168.1.10:3333/lwc/preview/${compPath}`;
                spinner.stop(`Opening Browser with url ${url}`);
                return AndroidSDKUtils.launchURLIntent(url, currentDevice.name);
            } else {
                spinner.stop(`Launching App ${targetApp}`);

                const launchActivity = (appConfig && appConfig.activity) || '';

                const targetAppArguments: LaunchArgument[] =
                    (appConfig && appConfig.launch_arguments) || [];
                return AndroidSDKUtils.launchNativeApp(
                    compName,
                    projectDir,
                    appBundlePath,
                    targetApp,
                    targetAppArguments,
                    launchActivity,
                    currentDevice.name
                );
            }
        } catch (error) {
            spinner.stop('Error encountered during launch');
            return Promise.reject(error);
        }
    }
}

// let launcher = new AndroidLauncher('testemu7');
// launcher
//     .launchNativeBrowser('http://salesforce.com/')
//     .then((result) => {
//         console.log('Its all cool!');
//     })
//     .catch((error) => {
//         console.log(`uh oh! ${error}`);
//     });
