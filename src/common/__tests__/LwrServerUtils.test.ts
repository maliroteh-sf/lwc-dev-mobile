/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

import { LwrGlobalConfig, LwrRoute } from 'lwr';
import { CommonUtils } from '@salesforce/lwc-dev-mobile-core/lib/common/CommonUtils';
import { LwrServerUtils } from '../LwrServerUtils';
import path from 'path';
import os from 'os';

import { DirModuleRecord } from '@lwrjs/types';

const rootComp = 'lwc/helloWorld';
const pathToDefault = '/force-app/main/default';
const componentName = `${pathToDefault}/${rootComp}`;
const projectDir = '/LWC-Mobile-Samples/HelloWorld';
const serverPort = 5678;

describe('LwrServerUtils Tests', () => {
    const mockLwrConfig: LwrGlobalConfig = {
        rootDir: os.tmpdir(),
        cacheDir: path.join(os.tmpdir(), '__temporary_cache_to_be_deleted__'),
        lwc: {
            modules: [
                {
                    dir: '/LWC-Mobile-Samples/HelloWorld/force-app/main/default'
                }
            ]
        },
        routes: [
            {
                id: `lwc-helloWorld-${Date.now()}`,
                path: '/',
                rootComponent: 'lwc/helloWorld'
            }
        ]
    };

    beforeEach(() => {
        jest.spyOn(LwrServerUtils, 'getNextAvailablePort').mockImplementation(
            () => serverPort
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('getMergedLwrConfig without a user-provided config file', async () => {
        const config = LwrServerUtils.getMergedLwrConfig(
            componentName,
            projectDir
        );

        verifyDefaultConfig(config);
    });

    test('getMergedLwrConfig with a user-provided config file and no existing properties', async () => {
        jest.spyOn(CommonUtils, 'loadJsonFromFile').mockImplementation(() => {
            const jsonContent = '{}';
            return JSON.parse(jsonContent);
        });

        const config = LwrServerUtils.getMergedLwrConfig(
            componentName,
            projectDir
        );

        verifyDefaultConfig(config);
    });

    test('getMergedLwrConfig with a user-provided config file and existing properties', async () => {
        jest.spyOn(CommonUtils, 'loadJsonFromFile').mockImplementation(() => {
            const jsonContent = `{
                "port": 3456,
                "rootDir": "/path/to/my/rootdir",
                "cacheDir": "/path/to/my/cachedir",
                "lwc": { "modules": [{ "dir": "$rootDir/src/modules" }] },
                "moduleProviders": [
                    "@company/my-module-provider"
                ],
                "routes": [
                    {
                        "id": "example",
                        "path": "/my/path",
                        "rootComponent": "example/app"
                    }
                ]
            }`;
            return JSON.parse(jsonContent);
        });

        const config = LwrServerUtils.getMergedLwrConfig(
            componentName,
            projectDir
        );

        // port must be preserved from the user-provided config file
        expect(config.port).toBe(3456);

        // rootDir must be preserved from the user-provided config file
        expect(config.rootDir).toBe('/path/to/my/rootdir');

        // cacheDir must be preserved from the user-provided config file
        expect(config.cacheDir).toBe('/path/to/my/cachedir');

        // LWC module record should be added to the ones from the user-provided config file
        const insertedLwcModuleRecord = config.lwc?.modules[0] as
            | DirModuleRecord
            | undefined;
        const originalLwcModuleRecord = config.lwc?.modules[1] as
            | DirModuleRecord
            | undefined;
        expect(insertedLwcModuleRecord?.dir).toBe(
            path.resolve(`${projectDir}${pathToDefault}`)
        );
        expect(originalLwcModuleRecord?.dir).toBe('$rootDir/src/modules');

        // a default route should be added to the ones from the user-provided config file
        const defaultRoute = (config.routes && config.routes[0]) as LwrRoute;
        const originalRoute = (config.routes && config.routes[1]) as LwrRoute;
        expect(defaultRoute.rootComponent).toBe(rootComp);
        expect(defaultRoute.path).toBe('/');
        expect(originalRoute.rootComponent).toBe('example/app');
        expect(originalRoute.path).toBe('/my/path');
    });

    test('getNextAvailablePort returns the default port', async () => {
        jest.restoreAllMocks();
        jest.spyOn(CommonUtils, 'executeCommandSync').mockReturnValue('');
        const port = LwrServerUtils.getNextAvailablePort();
        expect(port).toBe(LwrServerUtils.DEFAULT_SERVER_PORT);
    });

    test('getNextAvailablePort returns next available port', async () => {
        jest.restoreAllMocks();
        jest.spyOn(CommonUtils, 'executeCommandSync').mockReturnValueOnce(
            'some results from lsof or netstat command'
        );
        const port = LwrServerUtils.getNextAvailablePort();
        expect(port).toBe(LwrServerUtils.DEFAULT_SERVER_PORT + 2);
    });

    test('Callback is invoked when server idle timeout is detected', async () => {
        jest.spyOn(LwrServerUtils, 'getMergedLwrConfig').mockReturnValue(
            mockLwrConfig
        );

        const mockProcessExit = jest.fn(() => {}) as never;
        jest.spyOn(process, 'exit').mockImplementation(mockProcessExit);

        await LwrServerUtils.startLwrServer(
            '/force-app/main/default/lwc/helloWorld',
            '/LWC-Mobile-Samples/HelloWorld/',
            0.002
        );
        await CommonUtils.delay(300); // wait for it to shut down
        expect(mockProcessExit).toHaveBeenCalled();
    });

    test('Starts the server and returns a valid port number', async () => {
        jest.spyOn(LwrServerUtils, 'getMergedLwrConfig').mockReturnValue(
            mockLwrConfig
        );

        const mockProcessExit = jest.fn(() => {}) as never;
        jest.spyOn(process, 'exit').mockImplementation(mockProcessExit);

        const portString = await LwrServerUtils.startLwrServer(
            '/force-app/main/default/lwc/helloWorld',
            '/LWC-Mobile-Samples/HelloWorld/',
            0.002
        );
        await CommonUtils.delay(300); // wait for it to shut down
        const portNumber = parseInt(portString, 10);
        expect(Number.isNaN(portNumber)).toBe(false);
    });

    function verifyDefaultConfig(config: LwrGlobalConfig) {
        // rootDir must be set to project dir
        expect(config.rootDir).toBe(projectDir);

        // LWC module record should be set to 2-level-up path
        const lwcModuleRecord = config.lwc?.modules[0] as
            | DirModuleRecord
            | undefined;
        expect(lwcModuleRecord?.dir).toBe(
            path.resolve(`${projectDir}${pathToDefault}`)
        );

        // a default route should be added at root level
        const defaultRoute = (config.routes && config.routes[0]) as LwrRoute;
        expect(defaultRoute.rootComponent).toBe(rootComp);
        expect(defaultRoute.path).toBe('/');

        // a server port should be set
        expect(config.port).toBe(serverPort);
    }
});
