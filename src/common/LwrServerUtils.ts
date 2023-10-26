/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { CommonUtils } from '@salesforce/lwc-dev-mobile-core/lib/common/CommonUtils';
import path from 'path';

/*const vpod_cli_direct = {
    ACCESS_TOKEN:
        '00Dx0000000BXRX!AREAQBCl5K.mRI6yP0UfOCZP7nElAV44reRfFd.DYL4.2EzTIBLSwJllXljstXv39xZRLTZt5ReWLZ6qMveXqHGM_MTbHZR0',
    INSTANCE_URL: 'https://corsa04-basic-2015849972.vpod.t.force.com',
    ID: 'https://corsa04-basic-2015849972.vpod.t.force.com/id/00Dx0000000BXRXEA4/005x0000000xNhqAAE',
    LOGIN_SERVER: 'https://corsa04-basic-2015849972.vpod.t.force.com'
};
const vpod_sfs_loginflow = {
    LOGIN_SERVER: 'https://corsa04-basic-2015849972.vpod.t.force.com',
    CLIENT_KEY: 'SfdcFieldServiceAndroid',
    CLIENT_SECRET: '14217314840576653',
    USERNAME: 'admin@fs.com', //'perfuser@lfs.com',
    PASSWORD: '123456'
};

const trailhead_cli_direct = {
    ACCESS_TOKEN:
        '00D8b0000038gP3!ARcAQMqAIg7_zg6foNSHLQjU0xbu7HQsNaPY8IIjaRsYtgdk8y8sZpWLHpHBiFIsNCChoXGtKokGstgpHEgYcW7rcKZLSApq',
    INSTANCE_URL:
        'https://brave-moose-6zrvpd-dev-ed.trailblaze.my.salesforce.com',
    ID: 'https://brave-moose-6zrvpd-dev-ed.trailblaze.my.salesforce.com/00D8b0000038gP3EAI/0058b00000I1g8fAAB',
    LOGIN_SERVER: 'https://login.salesforce.com'
};*/

/*export const nestedModulesNamespace = 'c/';
export let nestedModulesNamespaceAlias = '';*/

export class LwrServerUtils {
    public static DEFAULT_SERVER_PORT = 3000;

    public static async startLwrServer(
        componentName: string,
        projectDir: string,
        serverIdleTimeoutMinutes: number = 30
    ): Promise<string> {
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

        /*const parts = rootComp.split('/');
        nestedModulesNamespaceAlias = parts.length ? `${parts[0]}/` : '';*/

        // e.g: lwc-helloWorld
        const rootCompDashed = rootComp.replace(/\//gi, '-');

        process.env.ROOT_DIR = rootDirectory;
        process.env.MODULES_DIR = twoLevelUp;
        process.env.ROOT_COMPONENT = rootCompDashed;

        /*const src = vpod_cli_direct; //trailhead_cli_direct;

        process.env.LOGIN_SERVER = src.LOGIN_SERVER;

        process.env.ACCESS_TOKEN = src.ACCESS_TOKEN;
        process.env.INSTANCE_URL = src.INSTANCE_URL;
        process.env.ID = src.ID;*/

        /*process.env.CLIENT_KEY = src.CLIENT_KEY;
        process.env.CLIENT_SECRET = src.CLIENT_SECRET;
        process.env.USERNAME = src.USERNAME;
        process.env.PASSWORD = src.PASSWORD;*/

        /*console.log('--------------------------------------');
        console.log(`process.env.LOGIN_SERVER = ${process.env.LOGIN_SERVER}`);
        console.log(`process.env.ACCESS_TOKEN = ${process.env.ACCESS_TOKEN}`);
        console.log(`process.env.INSTANCE_URL = ${process.env.INSTANCE_URL}`);
        console.log(`process.env.ID = ${process.env.ID}`);
        console.log('--------------------------------------');*/

        //process.env.LDS_DIR = '';
        process.env.SERVICE_WORKER = 'true';
        process.env.BEHIND_PROXY = 'true';
        process.env.MODE = 'dev';
        process.env.SERVER_IDLE_TIMEOUT_MINUTES = `${serverIdleTimeoutMinutes}`;
        process.env.SERVER_PORT =
            LwrServerUtils.getNextAvailablePort().toString();

        // Need to import like this otherwise we get the following error:
        //     [ERR_REQUIRE_ESM]: require() of ES Module lwr-lightning-platform/src/index.mjs not supported.
        //      Instead change the require of lwr-lightning-platform/src/index.mjs to a dynamic import() which is available in all CommonJS modules.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore : ignore "Could not find a declaration file for module 'lwr-lightning-platform'"
        const lwrlp = await import('lwr-lightning-platform');
        const lwrConfig = await lwrlp.buildLwrConfig('harness');
        lwrConfig.moduleProviders.unshift(
            path.resolve(`${__dirname}/CustomLwcModuleProvider.mjs`)
        );

        const lwrApp = await lwrlp.createApp(lwrConfig);
        const runtimeConfig = lwrApp.getConfig();

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
}
