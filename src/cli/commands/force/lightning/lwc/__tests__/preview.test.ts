/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
process.env['SFDX_ENV'] = 'test'; // run sfdx in test mode when running unit tests

import { Config } from '@oclif/core/lib/config';
import { Options } from '@oclif/core/lib/interfaces';
import { Logger, Messages, SfError } from '@salesforce/core';
import { AndroidLauncher } from '@salesforce/lwc-dev-mobile-core/lib/common/AndroidLauncher';
import { CommonUtils } from '@salesforce/lwc-dev-mobile-core/lib/common/CommonUtils';
import { IOSLauncher } from '@salesforce/lwc-dev-mobile-core/lib/common/IOSLauncher';
import { PreviewUtils } from '@salesforce/lwc-dev-mobile-core/lib/common/PreviewUtils';
import { RequirementProcessor } from '@salesforce/lwc-dev-mobile-core/lib/common/Requirements';
import fs from 'fs';
import { Preview } from '../preview';
import { LwrServerUtils } from '../../../../../../common/LwrServerUtils';

Messages.importMessagesDirectory(__dirname);

describe('Preview Tests', () => {
    const defaultServerPort = '3000';

    const sampleConfigFile = `
    {
        "apps": {
        "ios": [
            {
                "id": "com.salesforce.test",
                "name": "Test App",
                "get_app_bundle": "configure_ios_test_app.ts",
                "preview_server_enabled": true
            }
        ],
        "android": [
            {
                "id": "com.salesforce.test",
                "name": "Test App",
                "get_app_bundle": "configure_android_test_app.ts",
                "activity": ".MainActivity",
                "preview_server_enabled": true
            }
        ]
        }
    }
    `;

    const messages = Messages.loadMessages(
        '@salesforce/lwc-dev-mobile',
        'preview'
    );

    let passedSetupMock: jest.Mock<any, [], any>;
    let failedSetupMock: jest.Mock<any, [], any>;
    let iosLaunchPreview: jest.Mock<any, [], any>;
    let androidLaunchPreview: jest.Mock<any, [], any>;

    beforeEach(() => {
        passedSetupMock = jest.fn(() => {
            return Promise.resolve();
        });

        failedSetupMock = jest.fn(() => {
            return Promise.reject(new SfError('Mock Failure in tests!'));
        });

        iosLaunchPreview = jest.fn(() => Promise.resolve());
        androidLaunchPreview = jest.fn(() => Promise.resolve());

        passedSetupMock = jest.fn(() => {
            return Promise.resolve();
        });

        jest.spyOn(LwrServerUtils, 'startLwrServer').mockImplementation(() =>
            Promise.resolve(defaultServerPort)
        );

        jest.spyOn(RequirementProcessor, 'execute').mockImplementation(
            passedSetupMock
        );

        jest.spyOn(IOSLauncher.prototype, 'launchPreview').mockImplementation(
            iosLaunchPreview
        );

        jest.spyOn(
            AndroidLauncher.prototype,
            'launchPreview'
        ).mockImplementation(androidLaunchPreview);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('Validates component name flag', async () => {
        const preview = makePreview('', 'android', 'sfdxdebug');
        try {
            await preview.init();
            await preview.run();
        } catch (error) {
            expect((error as any).message).toBe(
                messages.getMessage(
                    'error:invalidComponentNameFlagsDescription'
                )
            );
        }
    });

    test('Checks that launch for target platform for Android is invoked', async () => {
        const preview = makePreview('compname', 'android', 'sfdxdebug');
        await preview.init();
        await preview.run();
        expect(androidLaunchPreview).toHaveBeenCalled();
    });

    test('Checks that launch for target platform for iOS is invoked', async () => {
        const preview = makePreview('compname', 'ios', 'sfdxdebug');
        await preview.init();
        await preview.run();
        expect(iosLaunchPreview).toHaveBeenCalled();
    });

    test('Checks that setup is invoked', async () => {
        const preview = makePreview('compname', 'android', 'sfdxdebug');
        await preview.init();
        await preview.run();
        expect(passedSetupMock).toHaveBeenCalled();
        expect(androidLaunchPreview).toHaveBeenCalled();
    });

    test('Preview should throw an error if setup fails', async () => {
        const preview = makePreview('compname', 'android', 'sfdxdebug');
        jest.spyOn(RequirementProcessor, 'execute').mockImplementationOnce(
            failedSetupMock
        );

        try {
            await preview.init();
            await preview.run();
        } catch (error) {
            expect(error instanceof SfError).toBeTruthy();
        }

        expect(failedSetupMock).toHaveBeenCalled();
    });

    test('Attempts to launch preview for native app', async () => {
        const preview = makePreview(
            'compname',
            'ios',
            'sfdxdebug',
            '/path/to/root',
            'myConfig.json',
            'com.salesforce.test'
        );

        jest.spyOn(fs, 'existsSync').mockReturnValue(true);

        jest.spyOn(
            PreviewUtils,
            'validateConfigFileWithSchema'
        ).mockReturnValue(
            Promise.resolve({ errorMessage: null, passed: true })
        );

        jest.spyOn(PreviewUtils, 'getAppBundlePath').mockReturnValue(
            '/path/to/app/bundle'
        );

        jest.spyOn(CommonUtils, 'loadJsonFromFile').mockReturnValue(
            JSON.parse(sampleConfigFile)
        );

        const appConfig = PreviewUtils.loadConfigFile(
            'myConfig.json'
        ).getAppConfig('ios', 'com.salesforce.test');

        await preview.init();
        await preview.run();
        expect(iosLaunchPreview).toHaveBeenCalledWith(
            'compname',
            '/path/to/root',
            '/path/to/app/bundle',
            'com.salesforce.test',
            appConfig,
            defaultServerPort
        );
    });

    test('Logger must be initialized and invoked', async () => {
        const logger = new Logger('test-preview');
        const loggerSpy = jest.spyOn(logger, 'info');
        jest.spyOn(Logger, 'child').mockReturnValue(Promise.resolve(logger));
        const preview = makePreview('compname', 'android', 'sfdxdebug');
        await preview.init();
        await preview.run();
        expect(loggerSpy).toHaveBeenCalled();
    });

    test('Messages folder should be loaded', async () => {
        expect.assertions(1);
        expect(Preview.description !== null).toBeTruthy();
    });

    function makePreview(
        componentName: string,
        platform: string,
        target: string,
        projectdir?: string,
        configfile?: string,
        targetapp?: string
    ): Preview {
        const args = ['-n', componentName, '-p', platform, '-t', target];

        if (projectdir) {
            args.push('-d');
            args.push(projectdir);
        }

        if (configfile) {
            args.push('-f');
            args.push(configfile);
        }

        if (targetapp) {
            args.push('-a');
            args.push(targetapp);
        }

        const preview = new Preview(args, new Config({} as Options));

        return preview;
    }
});
