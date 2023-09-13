/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { CommonUtils } from '@salesforce/lwc-dev-mobile-core/lib/common/CommonUtils';
import { normalizeConfig } from '@lwrjs/config';
import { DirModuleRecord, ServiceConfig } from '@lwrjs/types';
import { createServer, LwrApp, LwrGlobalConfig, LwrRoute } from 'lwr';
import path from 'path';

export class LwrServerUtils {
    public static DEFAULT_SERVER_PORT = 3000;

    public static async startLwrServer(
        componentName: string,
        projectDir: string,
        serverTimeoutMinutes: number = 30
    ): Promise<string> {
        const lwrConfig = LwrServerUtils.getMergedLwrConfig(
            componentName,
            projectDir
        );
        const lwrApp = createServer(lwrConfig);

        const runtimeConfig = lwrApp.getConfig();
        const expressServer = lwrApp.getInternalServer<'express'>();

        return lwrApp
            .listen(() => {
                console.log(
                    `Listening on port ${runtimeConfig.port} in mode ${runtimeConfig.serverMode}`
                );

                let timer = LwrServerUtils.setShutDownTimer(
                    lwrApp,
                    serverTimeoutMinutes
                );
                // reset the timer every time a request is sent to the server
                expressServer.on('request', () => {
                    if (timer) {
                        clearTimeout(timer);
                    }
                    timer = LwrServerUtils.setShutDownTimer(
                        lwrApp,
                        serverTimeoutMinutes
                    );
                });
            })
            .then(() => {
                return Promise.resolve(`${runtimeConfig.port}`);
            });
    }

    public static getMergedLwrConfig(
        componentName: string,
        projectDir: string
    ): LwrGlobalConfig {
        const rootDirectory = path.resolve(projectDir);

        const modifiedModuleProviders: ServiceConfig[] =
            LwrServerUtils.getModifiedModuleProviders();

        // e.g: /LWC-Mobile-Samples/HelloWorld/force-app/main/default/lwc/helloWorld
        const componentFullPath = path.resolve(
            path.join(projectDir, componentName)
        );

        // e.g: /LWC-Mobile-Samples/HelloWorld/force-app/main/default
        const twoLevelUp = path.resolve(path.join(componentFullPath, '../../'));

        // e.g: lwc/helloWorld
        const rootComp = componentFullPath
            .replace(`${twoLevelUp}${path.sep}`, '')
            .replace(/\\/gi, '/');

        const lwcModuleRecord: DirModuleRecord = {
            dir: twoLevelUp
        };

        const defaultLwrRoute: LwrRoute = {
            id: `${rootComp.replace(/\//gi, '-')}-${Date.now()}`,
            path: '/',
            rootComponent: rootComp
        };

        let config: LwrGlobalConfig = {};
        try {
            // If the user has provided an LWR config file then take it and add our custom entries to it
            config = CommonUtils.loadJsonFromFile(
                path.resolve(path.join(projectDir, 'lwr.config.json'))
            ) as LwrGlobalConfig;
        } catch {
            // ignore and continue
        }

        if (!config.serverMode) {
            config.serverMode = 'dev'; // default to dev mode so that it watches files
        }

        if (!config.port) {
            config.port = LwrServerUtils.getNextAvailablePort();
        }

        if (!config.rootDir) {
            config.rootDir = rootDirectory;
        }

        if (!config.lwc) {
            config.lwc = {
                modules: [lwcModuleRecord]
            };
        } else if (!config.lwc.modules) {
            config.lwc.modules = [lwcModuleRecord];
        } else {
            config.lwc.modules.unshift(lwcModuleRecord);
        }

        if (!config.moduleProviders) {
            config.moduleProviders = modifiedModuleProviders;
        } else {
            config.moduleProviders.unshift(...modifiedModuleProviders);
        }

        if (!config.routes) {
            config.routes = [defaultLwrRoute];
        } else {
            config.routes.unshift(defaultLwrRoute);
        }

        return config;
    }

    public static getModifiedModuleProviders(): ServiceConfig[] {
        const defaultConfig = normalizeConfig(
            { ignoreLwrConfigFile: true },
            { skipCacheDirCreation: true }
        );
        const providers = defaultConfig.moduleProviders;
        providers.unshift([
            path.resolve(`${__dirname}/CustomLwcModuleProvider.js`),
            undefined
        ]);
        return providers;
    }

    /**
     * Return a port number to be used by LWR server.
     *
     * It starts with port 3000 and checks to see if it is in use or not. If it is in use
     * then we increment the port number by 2 and check if it is in use or not. This process
     * is repeated until a port that is not in use is found.
     *
     * @returns a port number
     */
    public static getNextAvailablePort(): number {
        let port = LwrServerUtils.DEFAULT_SERVER_PORT;
        let done = false;

        while (!done) {
            const cmd =
                process.platform === 'win32'
                    ? `netstat -an | find "LISTENING" | find ":${port}"`
                    : `lsof -i :${port}`;

            try {
                const result = CommonUtils.executeCommandSync(cmd);
                if (result.trim()) {
                    port = port + 2; // that port is in use so try another
                } else {
                    done = true;
                }
            } catch (error) {
                // On some platforms (like mac) if the command doesn't produce
                // any results then that is considered an error but in our case
                // that means the port is not in use and is ready for us to use.
                done = true;
            }
        }

        return port;
    }

    private static setShutDownTimer(lwrapp: LwrApp, timeoutMinutes: number) {
        return setTimeout(
            async () => {
                console.log(
                    `Server idle for ${timeoutMinutes} minutes... shutting down`
                );

                let exitCode = 0;
                try {
                    await lwrapp.close();
                } catch (error) {
                    console.error(
                        `Unable to gracefully shutdown the server - ${error}`
                    );
                    exitCode = 1;
                }

                process.exit(exitCode); // kill the process on server timeout
            },
            timeoutMinutes * 60 * 1000
        );
    }
}
