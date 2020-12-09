/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { Logger } from '@salesforce/core';
import childProcess from 'child_process';
import cli from 'cli-ux';
import { Version } from '../common/Common';
import iOSConfig from '../config/iosconfig.json';
import { IOSDevice, IOSDeviceType } from './IOSTypes';
import { LaunchArgument } from './PreviewConfigFile';
import { PreviewUtils } from './PreviewUtils';

const XCRUN_CMD = '/usr/bin/xcrun';
const DEVICE_TYPE_PREFIX = 'com.apple.CoreSimulator.SimDeviceType';
const RUNTIME_TYPE_PREFIX = 'com.apple.CoreSimulator.SimRuntime';

const LOGGER_NAME = 'force:lightning:mobile:ios';

export class IOSUtils {
    public static async initializeLogger(): Promise<void> {
        IOSUtils.logger = await Logger.child(LOGGER_NAME);
        return Promise.resolve();
    }

    public static async bootDevice(udid: string): Promise<boolean> {
        const command = `${XCRUN_CMD} simctl boot ${udid}`;
        try {
            const { stdout } = await IOSUtils.executeCommand(command);
        } catch (error) {
            if (!IOSUtils.isDeviceAlreadyBootedError(error)) {
                return new Promise<boolean>((resolve, reject) => {
                    reject(
                        `The command '${command}' failed to execute ${error}`
                    );
                });
            }
        }
        return new Promise<boolean>((resolve, reject) => {
            resolve(true);
        });
    }

    public static async createNewDevice(
        simulatorName: string,
        deviceType: string,
        runtime: string
    ): Promise<string> {
        const command = `${XCRUN_CMD} simctl create ${simulatorName} ${DEVICE_TYPE_PREFIX}.${deviceType} ${RUNTIME_TYPE_PREFIX}.${runtime}`;
        try {
            const { stdout } = await IOSUtils.executeCommand(command);
            return new Promise<string>((resolve, reject) => {
                resolve(stdout.trim());
            });
        } catch (error) {
            return new Promise<string>((resolve, reject) => {
                reject(`The command '${command}' failed to execute ${error}`);
            });
        }
    }

    public static async getDevice(
        deviceName: string
    ): Promise<IOSDevice | null> {
        return new Promise(async (resolve, reject) => {
            try {
                const devices = await IOSUtils.getSupportedDevices();
                for (const device of devices) {
                    if (deviceName.match(device.name)) {
                        return resolve(device);
                    }
                }
            } catch (exception) {
                IOSUtils.logger.warn(exception);
            }

            IOSUtils.logger.info(`Unable to find device: ${deviceName}`);
            return resolve(null);
        });
    }

    public static async getSupportedSimulators(): Promise<IOSDevice[]> {
        const devices = await IOSUtils.getSupportedDevices();
        const simulators = devices.filter(
            (device) => device.deviceType === IOSDeviceType.Simulator
        );

        return Promise.resolve(simulators);
    }

    public static async executeCommand(
        command: string
    ): Promise<{ stdout: string; stderr: string }> {
        return new Promise<{ stdout: string; stderr: string }>(
            (resolve, reject) => {
                IOSUtils.logger.debug(`Executing command: '${command}'.`);
                childProcess.exec(command, (error, stdout, stderr) => {
                    if (error) {
                        IOSUtils.logger.error(
                            `Error executing command '${command}':`
                        );
                        IOSUtils.logger.error(`${error}`);
                        reject(error);
                    } else {
                        resolve({ stdout, stderr });
                    }
                });
            }
        );
    }

    public static async getSupportedDevices(): Promise<IOSDevice[]> {
        if (IOSUtils.supportedIOSDevices) {
            return Promise.resolve(IOSUtils.supportedIOSDevices);
        }

        const traceCmd = `${XCRUN_CMD} xctrace list devices`;
        try {
            const { stdout, stderr } = await IOSUtils.executeCommand(traceCmd);
            // for some odd reason, xctrace prints its output to stderr even though it is passing (not failing)
            const allDevices = IOSDevice.parseRawString(stdout + stderr);
            const minSupportedRuntimeIOS = Version.from(
                iOSConfig.minSupportedRuntimeIOS
            );

            IOSUtils.supportedIOSDevices = allDevices.filter((device) => {
                const deviceRuntimeVersion = Version.from(
                    device.runtimeVersion
                );

                if (deviceRuntimeVersion.sameOrNewer(minSupportedRuntimeIOS)) {
                    const name = device.name.toLowerCase();
                    // we don't support ipod, ipad, watch and tv
                    return (
                        !name.startsWith('ipod') &&
                        !name.startsWith('ipad') &&
                        !name.startsWith('apple watch') &&
                        !name.startsWith('apple tv')
                    );
                } else {
                    return false;
                }
            });

            return Promise.resolve(IOSUtils.supportedIOSDevices);
        } catch (error) {
            return Promise.reject(`The command '${traceCmd}' failed: ${error}`);
        }
    }

    public static async getSupportedRuntimes(): Promise<string[]> {
        const devices = await IOSUtils.getSupportedSimulators();
        const supportedRuntimes = devices.map((device) =>
            device.runtimeVersion.toString()
        );

        const unique = [...new Set(supportedRuntimes)];

        if (unique.length > 0) {
            return Promise.resolve(unique);
        } else {
            return Promise.reject();
        }
    }

    public static async waitUntilDeviceIsReady(udid: string): Promise<boolean> {
        const command = `${XCRUN_CMD} simctl bootstatus "${udid}"`;
        try {
            const { stdout } = await IOSUtils.executeCommand(command);
            return new Promise<boolean>((resolve, reject) => {
                resolve(true);
            });
        } catch (error) {
            return new Promise<boolean>((resolve, reject) => {
                reject(`The command '${command}' failed to execute ${error}`);
            });
        }
    }

    public static async launchSimulatorApp(): Promise<boolean> {
        const command = `open -a Simulator`;
        return new Promise(async (resolve, reject) => {
            try {
                const { stdout } = await IOSUtils.executeCommand(command);
                resolve(true);
            } catch (error) {
                reject(`The command '${command}' failed to execute ${error}`);
            }
        });
    }

    public static async launchURLInBootedSimulator(
        udid: string,
        componentUrl: string
    ): Promise<boolean> {
        const command = `${XCRUN_CMD} simctl openurl "${udid}" ${componentUrl}`;
        try {
            const { stdout } = await IOSUtils.executeCommand(command);
            return new Promise<boolean>((resolve, reject) => {
                resolve(true);
            });
        } catch (error) {
            return new Promise<boolean>((resolve, reject) => {
                reject(`The command '${command}' failed to execute: ${error}`);
            });
        }
    }

    public static async launchAppOnDevice(
        device: IOSDevice,
        componentUrl: string,
        projectDir: string,
        appBundlePath: string | undefined,
        targetApp: string,
        targetAppArguments: LaunchArgument[]
    ): Promise<boolean> {
        if (appBundlePath && appBundlePath.trim().length > 0) {
            const installCommand =
                device.deviceType === IOSDeviceType.Simulator
                    ? `${XCRUN_CMD} simctl install ${
                          device.udid
                      } '${appBundlePath.trim()}'`
                    : `ideviceinstaller -u ${
                          device.udid
                      } -i '${appBundlePath.trim()}'`;

            try {
                IOSUtils.logger.info(
                    `Installing app ${appBundlePath.trim()} to ${
                        device.name
                    } (${device.udid})`
                );
                cli.action.start(
                    'Launching',
                    `* Installing app ${appBundlePath.trim()} to ${
                        device.name
                    } (${device.udid})`
                );
                await IOSUtils.executeCommand(installCommand);
                cli.action.start('Launching', `* Installing done`);
            } catch (error) {
                cli.action.start(
                    'Launching',
                    `* Installing error: The command '${installCommand}' failed to execute: ${error}`
                );
                return Promise.reject(
                    `The command '${installCommand}' failed to execute: ${error}`
                );
            }
        }

        const launchArgs: string[] = [
            `${PreviewUtils.COMPONENT_NAME_ARG_PREFIX}=${componentUrl}`,
            `${PreviewUtils.PROJECT_DIR_ARG_PREFIX}=${projectDir}`
        ];
        targetAppArguments.forEach((arg) => {
            launchArgs.push(`${arg.name}=${arg.value}`);
        });

        if (device.deviceType === IOSDeviceType.Simulator) {
            // attempt at terminating the app first (in case it is already running) and then try to launch it again with new arguments.
            // if we hit issues with terminating, just ignore and continue.
            const terminateCommand = `${XCRUN_CMD} simctl terminate "${device.udid}" ${targetApp}`;
            try {
                IOSUtils.logger.info(
                    `Terminating app ${targetApp} on ${device.name} (${device.udid})`
                );
                await IOSUtils.executeCommand(terminateCommand);
            } catch {
                // ignore and continue
            }
        }

        const launchCommand =
            device.deviceType === IOSDeviceType.Simulator
                ? `${XCRUN_CMD} simctl launch "${
                      device.udid
                  }" '${targetApp}' ${launchArgs.join(' ')}`
                : `xcrun xctrace record --device '${
                      device.udid
                  }' --template 'Logging' --output ~/app_execution.trace --append-run --launch -- '${targetApp}' ${launchArgs.join(
                      ' '
                  )}`;

        cli.action.start(
            'Launching',
            `* Launching app ${targetApp} on ${device.name} (${device.udid})`
        );
        IOSUtils.logger.info(
            `Launching app ${targetApp} on ${device.name} (${device.udid})`
        );

        return IOSUtils.executeCommand(launchCommand)
            .then(() => Promise.resolve(true))
            .catch((error) => {
                cli.action.start(
                    'Launching',
                    `* Launching error: The command '${launchCommand}' failed to execute: ${error}`
                );
                return Promise.reject(
                    `The command '${launchCommand}' failed to execute: ${error}`
                );
            })
            .finally(async () => {
                try {
                    // clean up leftover trace files (if any)
                    await IOSUtils.executeCommand(
                        'rm -R ~/app_execution.trace'
                    );
                } catch {
                    // ignore and continue
                }
            });
    }

    public static clearCaches() {
        IOSUtils.supportedIOSDevices = undefined;
    }

    private static supportedIOSDevices: IOSDevice[] | undefined;
    private static logger: Logger = new Logger(LOGGER_NAME);

    private static isDeviceAlreadyBootedError(error: Error): boolean {
        return error.message
            ? error.message.toLowerCase().match('state: booted') !== null
            : false;
    }
}

// IOSUtils.getSupportedDevices()
//     .then((runtimeDevices) => {
//         console.log(`runtimeDevices: ${runtimeDevices}`);
//     })
//     .catch((error) => {
//         console.log(error);
//     });
