/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

import { Flags } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import {
    AndroidEnvironmentRequirements,
    AndroidLauncher,
    AndroidAppPreviewConfig,
    BaseCommand,
    CommandLineUtils,
    CommonUtils,
    CommandRequirements,
    FlagsConfigType,
    IOSEnvironmentRequirements,
    IOSLauncher,
    IOSAppPreviewConfig,
    PreviewUtils,
    RequirementProcessor
} from '@salesforce/lwc-dev-mobile-core';
import { LwrServerUtils } from '../../../../../common/LwrServerUtils';
import fs from 'fs';
import path from 'path';
import util from 'util';
import * as configSchema from './previewConfigurationSchema.json';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@salesforce/lwc-dev-mobile', 'preview');

export class Preview extends BaseCommand {
    protected _commandName = 'force:lightning:lwc:preview';

    public static readonly description =
        messages.getMessage('commandDescription');

    public static readonly examples = [
        `sfdx force:lightning:lwc:preview -p Desktop -n force-app/main/default/lwc/myComponent -d /path/to/project_root`,
        `sfdx force:lightning:lwc:preview -p iOS -t MySimulator -n force-app/main/default/lwc/myComponent -d /path/to/project_root`,
        `sfdx force:lightning:lwc:preview -p Android -t MyEmulator -n force-app/main/default/lwc/myComponent -d /path/to/project_root`
    ];

    private static createError(stringId: string, ...param: any[]): SfError {
        let msg = messages.getMessage(stringId);
        if (param.length > 0) {
            msg = util.format(msg, param);
        }
        return new SfError(msg, 'lwc-dev-mobile', Preview.examples);
    }

    public static readonly flags = {
        ...CommandLineUtils.createFlag(FlagsConfigType.Json, false),
        ...CommandLineUtils.createFlag(FlagsConfigType.LogLevel, false),
        ...CommandLineUtils.createFlag(FlagsConfigType.Platform, true, true),
        componentname: Flags.string({
            char: 'n',
            description: messages.getMessage('componentnameFlagDescription'),
            required: true
        }),
        configfile: Flags.string({
            char: 'f',
            description: messages.getMessage('configFileFlagDescription'),
            required: false,
            default: ''
        }),
        confighelp: Flags.boolean({
            default: false,
            description: messages.getMessage('configHelpFlagDescription'),
            required: false
        }),
        projectdir: Flags.string({
            char: 'd',
            description: messages.getMessage('projectDirFlagDescription'),
            required: false,
            default: process.cwd()
        }),
        target: Flags.string({
            char: 't',
            description: messages.getMessage('targetFlagDescription'),
            required: false,
            default: 'sfdxdebug'
        }),
        targetapp: Flags.string({
            char: 'a',
            description: messages.getMessage('targetAppFlagDescription'),
            required: false,
            default: PreviewUtils.BROWSER_TARGET_APP
        })
    };

    private deviceName = '';
    private componentName = '';
    private targetApp = '';
    private projectDir = '';
    private configFilePath = '';
    private appConfig:
        | IOSAppPreviewConfig
        | AndroidAppPreviewConfig
        | undefined;

    public async run(): Promise<void> {
        this.logger.info(
            `Preview command invoked for ${this.flagValues.platform}`
        );

        return this.validateInputParameters() // validate input
            .then(() => {
                if (this.flagValues.confighelp === true) {
                    const message = messages.getMessage(
                        'configFileHelpDescription'
                    );
                    console.log(`${message}`);
                    return Promise.resolve();
                } else {
                    return RequirementProcessor.execute(
                        this.commandRequirements
                    ).then(() => {
                        // then launch the preview if all validations have passed
                        this.logger.info(
                            'Setup requirements met, continuing with preview'
                        );
                        return this.launchPreview();
                    });
                }
            })
            .catch((error) => {
                this.logger.warn(
                    `Preview failed for ${this.flagValues.platform}.`
                );
                return Promise.reject(error);
            });
    }

    protected populateCommandRequirements(): void {
        if (CommandLineUtils.platformFlagIsDesktop(this.flagValues.platform)) {
            return;
        }

        const requirements: CommandRequirements = {};

        requirements.setup = CommandLineUtils.platformFlagIsAndroid(
            this.flagValues.platform
        )
            ? new AndroidEnvironmentRequirements(
                  this.logger,
                  this.flagValues.apilevel
              )
            : new IOSEnvironmentRequirements(this.logger);
        this._commandRequirements = requirements;
    }

    private async validateInputParameters(): Promise<void> {
        this.deviceName = (this.flagValues.target as string).trim();
        this.componentName = (this.flagValues.componentname as string).trim();
        this.targetApp = (this.flagValues.targetapp as string).trim();

        this.projectDir = CommonUtils.resolveUserHomePath(
            (this.flagValues.projectdir as string).trim()
        );

        const configFileName = CommonUtils.resolveUserHomePath(
            (this.flagValues.configfile as string).trim()
        );

        this.configFilePath = path.normalize(
            path.resolve(this.projectDir, configFileName)
        );

        const hasConfigFile =
            configFileName.length > 0 && fs.existsSync(this.configFilePath);

        const isBrowserTargetApp = PreviewUtils.isTargetingBrowser(
            this.targetApp
        );

        this.logger.debug('Validating Preview command inputs.');

        if (
            CommandLineUtils.platformFlagIsDesktop(this.flagValues.target) &&
            !isBrowserTargetApp
        ) {
            return Promise.reject(
                Preview.createError('error:invalidTargetAppForDesktop')
            );
        }

        // check if user provided a config file when targetapp=browser
        // and warn them that the config file will be ignored.
        if (isBrowserTargetApp && hasConfigFile) {
            this.logger.warn(
                messages.getMessage('ignoringConfigFileFlagDescription')
            );
        }

        if (this.componentName.length === 0) {
            return Promise.reject(
                Preview.createError(
                    'error:invalidComponentNameFlagsDescription'
                )
            );
        }

        if (isBrowserTargetApp === false && hasConfigFile === false) {
            return Promise.reject(
                Preview.createError(
                    'error:invalidConfigFile:missingDescription',
                    this.configFilePath
                )
            );
        }

        if (isBrowserTargetApp === false && hasConfigFile === true) {
            // 1. validate config file against schema
            const validationResult =
                await PreviewUtils.validateConfigFileWithSchema(
                    this.configFilePath,
                    configSchema
                );
            if (validationResult.passed === false) {
                return Promise.reject(
                    Preview.createError(
                        'error:invalidConfigFile:genericDescription',
                        this.configFilePath,
                        validationResult.errorMessage
                    )
                );
            }

            // 2. validate that a matching app configuration is included in the config file
            const configFileContent = PreviewUtils.loadConfigFile(
                this.configFilePath
            );
            this.appConfig = configFileContent.getAppConfig(
                this.flagValues.platform,
                this.targetApp
            );
            if (this.appConfig === undefined) {
                const errMsg = messages.getMessage(
                    'error:invalidConfigFile:missingAppConfigDescription',
                    [this.targetApp, this.flagValues.platform]
                );
                return Promise.reject(
                    Preview.createError(
                        'error:invalidConfigFile:genericDescription',
                        this.configFilePath,
                        errMsg
                    )
                );
            }
        }

        return Promise.resolve();
    }

    private async launchPreview(): Promise<void> {
        // At this point all of the inputs/parameters have been verified and parsed so we can just use them.

        let appBundlePath: string | undefined;

        if (
            PreviewUtils.isTargetingBrowser(this.targetApp) === false &&
            this.appConfig
        ) {
            try {
                CommonUtils.startCliAction(
                    messages.getMessage('previewAction'),
                    messages.getMessage('previewFetchAppBundleStatus')
                );
                appBundlePath = PreviewUtils.getAppBundlePath(
                    path.dirname(this.configFilePath),
                    this.appConfig
                );
            } catch (error) {
                CommonUtils.stopCliAction(
                    messages.getMessage('previewFetchAppBundleFailureStatus')
                );
                return Promise.reject(error);
            }
        }

        if (CommandLineUtils.platformFlagIsDesktop(this.flagValues.platform)) {
            return this.launchDesktop(this.componentName, this.projectDir);
        } else if (
            CommandLineUtils.platformFlagIsIOS(this.flagValues.platform)
        ) {
            const config =
                this.appConfig && (this.appConfig as IOSAppPreviewConfig);
            return this.launchIOS(
                this.deviceName,
                this.componentName,
                this.projectDir,
                appBundlePath,
                this.targetApp,
                config
            );
        } else {
            const config =
                this.appConfig && (this.appConfig as AndroidAppPreviewConfig);
            return this.launchAndroid(
                this.deviceName,
                this.componentName,
                this.projectDir,
                appBundlePath,
                this.targetApp,
                config
            );
        }
    }

    private async launchDesktop(
        componentName: string,
        projectDir: string
    ): Promise<void> {
        return LwrServerUtils.startLwrServer(componentName, projectDir).then(
            (serverPort) =>
                CommonUtils.launchUrlInDesktopBrowser(
                    `http://localhost:${serverPort}`
                )
        );
    }

    private async launchIOS(
        deviceName: string,
        componentName: string,
        projectDir: string,
        appBundlePath: string | undefined,
        targetApp: string,
        appConfig: IOSAppPreviewConfig | undefined
    ): Promise<void> {
        const launcher = new IOSLauncher(deviceName);

        return LwrServerUtils.startLwrServer(componentName, projectDir).then(
            (serverPort) =>
                launcher.launchPreview(
                    componentName,
                    projectDir,
                    appBundlePath,
                    targetApp,
                    appConfig,
                    serverPort,
                    true
                )
        );
    }

    private async launchAndroid(
        deviceName: string,
        componentName: string,
        projectDir: string,
        appBundlePath: string | undefined,
        targetApp: string,
        appConfig: AndroidAppPreviewConfig | undefined
    ): Promise<void> {
        const launcher = new AndroidLauncher(deviceName);

        return LwrServerUtils.startLwrServer(componentName, projectDir).then(
            (serverPort) =>
                launcher.launchPreview(
                    componentName,
                    projectDir,
                    appBundlePath,
                    targetApp,
                    appConfig,
                    serverPort,
                    true
                )
        );
    }
}
