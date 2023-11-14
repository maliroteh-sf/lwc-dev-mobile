/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

import { Logger } from '@salesforce/core';
import { CommonUtils } from '@salesforce/lwc-dev-mobile-core';
import express from 'express';
import path from 'path';

export let previewLogger: Logger | undefined;

export class LwrServerUtils {
    public static DEFAULT_SERVER_PORT = 3000;
    public static DEFAULT_SERVER_IDLE_TIMEOUT_MINUTES = 15;

    public static async startLwrServer(
        logger: Logger,
        componentName: string,
        projectDir: string,
        serverIdleTimeoutMinutes: number = this
            .DEFAULT_SERVER_IDLE_TIMEOUT_MINUTES
    ): Promise<string> {
        previewLogger = logger;

        const rootDirectory = path.resolve(projectDir);

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

        // e.g: lwc-helloWorld
        const rootCompDashed = rootComp.replace(/\//gi, '-');

        process.env.ROOT_DIR = rootDirectory;
        process.env.MODULES_DIR = twoLevelUp;
        process.env.ROOT_COMPONENT = rootCompDashed;
        process.env.SERVICE_WORKER = 'true';
        process.env.BEHIND_PROXY = 'true';
        process.env.MODE = 'dev';
        process.env.SERVER_IDLE_TIMEOUT_MINUTES = `${serverIdleTimeoutMinutes}`;
        process.env.SERVER_PORT =
            LwrServerUtils.getNextAvailablePort().toString();

        previewLogger?.debug(
            '\n*** Attempting to preview LWC ***\n' +
                `componentName = ${componentName}\n` +
                `projectDir = ${projectDir}\n` +
                `componentFullPath = ${componentFullPath}\n` +
                `ROOT_DIR = ${process.env.ROOT_DIR}\n` +
                `MODULES_DIR = ${process.env.MODULES_DIR}\n` +
                `ROOT_COMPONENT = ${process.env.ROOT_COMPONENT}`
        );

        return LwrServerUtils.doStartLwrApp();
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

    // Helper method to launch an LWR app server (done this way so that we can more easily unit test LwrServerUtils).
    public static async doStartLwrApp(): Promise<string> {
        // Need to import like this otherwise we get the following error:
        //     [ERR_REQUIRE_ESM]: require() of ES Module lwr-lightning-platform/src/index.mjs not supported.
        //      Instead change the require of lwr-lightning-platform/src/index.mjs to a dynamic import() which is available in all CommonJS modules.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore : ignore "Could not find a declaration file for module 'lwr-lightning-platform'"
        const lwrlp = await import('lwr-lightning-platform');
        const lwrConfig = await lwrlp.buildLwrConfig('harness');
        lwrConfig.moduleProviders.unshift(
            path.resolve(`${__dirname}/ResourceModuleProvider.mjs`)
        );
        lwrConfig.moduleProviders.unshift(
            path.resolve(`${__dirname}/CustomLwcModuleProvider.mjs`)
        );

        const lwrApp = await lwrlp.createApp(lwrConfig);
        const runtimeConfig = lwrApp.getConfig();
        const expressServer = lwrApp.getInternalServer();

        // Files for static resources would be served from disk relative to project root dir
        expressServer.use(
            express.static(path.resolve(runtimeConfig.rootDir ?? ''))
        );

        previewLogger?.debug(
            '\n*************** In-Memory LWR Server Config ***************\n' +
                JSON.stringify(runtimeConfig, null, '  ')
        );

        return lwrApp
            .listen(() => {
                console.log(
                    `Listening on port ${runtimeConfig.port} in mode ${runtimeConfig.serverMode}`
                );
            })
            .then(() => {
                return Promise.resolve(`${runtimeConfig.port}`);
            });
    }
}
