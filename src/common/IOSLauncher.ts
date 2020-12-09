/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import childProcess from 'child_process';
import cli from 'cli-ux';
import util from 'util';
import { IOSDevice, IOSDeviceType } from './IOSTypes';
import { IOSUtils } from './IOSUtils';
import { IOSAppPreviewConfig, LaunchArgument } from './PreviewConfigFile';
import { PreviewUtils } from './PreviewUtils';
const exec = util.promisify(childProcess.exec);

export class IOSLauncher {
    private deviceName: string;

    constructor(deviceName: string) {
        this.deviceName = deviceName;
    }

    public async launchPreview(
        compName: string,
        projectDir: string,
        appBundlePath: string | undefined,
        targetApp: string,
        appConfig: IOSAppPreviewConfig | undefined
    ): Promise<boolean> {
        const spinner = cli.action;
        spinner.start(`Launching`, `Searching for device ${this.deviceName}`, {
            stdout: true
        });

        try {
            let currentDevice = await IOSUtils.getDevice(this.deviceName);
            if (!currentDevice || currentDevice.udid.length === 0) {
                spinner.start(
                    `Launching`,
                    `Device not found. Creating device ${this.deviceName}`,
                    {
                        stdout: true
                    }
                );
                const availableSimulators: IOSDevice[] = await IOSUtils.getSupportedSimulators();
                const supportedRuntimes: string[] = await IOSUtils.getSupportedRuntimes();
                await IOSUtils.createNewDevice(
                    this.deviceName,
                    availableSimulators[0].name.replace(/ /gi, '-'),
                    `iOS-${supportedRuntimes[0].replace(/\./gi, '-')}`
                );
                currentDevice = await IOSUtils.getDevice(this.deviceName);
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

            if (currentDevice.deviceType === IOSDeviceType.Simulator) {
                spinner.start(
                    `Launching`,
                    `Starting device ${currentDevice.name} (${currentDevice.udid})`,
                    {
                        stdout: true
                    }
                );
                await IOSUtils.launchSimulatorApp();

                spinner.start(
                    `Launching`,
                    `Waiting for device to boot: ${currentDevice.name} (${currentDevice.udid})`,
                    {
                        stdout: true
                    }
                );
                await IOSUtils.bootDevice(currentDevice.udid);
                await IOSUtils.waitUntilDeviceIsReady(currentDevice.udid);
            }

            const componentUrl = PreviewUtils.getComponentUrl(compName, false);
            if (PreviewUtils.isTargetingBrowser(targetApp)) {
                spinner.stop(`Opening Browser with url ${componentUrl}`);
                return IOSUtils.launchURLInBootedSimulator(
                    currentDevice.udid,
                    componentUrl
                );
            } else {
                const targetAppArguments: LaunchArgument[] =
                    (appConfig && appConfig.launch_arguments) || [];
                spinner.stop(`Launching App ${targetApp}`);
                return IOSUtils.launchAppOnDevice(
                    currentDevice,
                    componentUrl,
                    projectDir,
                    appBundlePath,
                    targetApp,
                    targetAppArguments
                );
            }
        } catch (error) {
            spinner.stop('Error encountered during launch');
            return Promise.reject(error);
        }
    }
}

// let launcher = new IOSLauncher('sfdxdevmobile-101');
// launcher
//     .launchNativeBrowser('http://salesforce.com')
//     .then((result) => {
//         console.log('Done!');
//     })
//     .catch((error) => {
//         console.log('Error!' + error);
//     });
