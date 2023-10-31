/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

import { LwrServerUtils } from '../LwrServerUtils';

describe('LwrServerUtils Tests', () => {
    beforeEach(() => {});

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('startLwrServer', async () => {
        jest.spyOn(LwrServerUtils, 'doStartLwrApp').mockImplementation(() =>
            Promise.resolve(`${process.env.SERVER_PORT}`)
        );

        const port = await LwrServerUtils.startLwrServer(
            'force-app/main/default/lwc/helloWorld',
            '/LWC-Mobile-Samples/HelloWorld'
        );

        const num = Number(process.env.SERVER_PORT);
        expect(Number.isInteger(num)).toBe(true);
        expect(num >= LwrServerUtils.DEFAULT_SERVER_PORT).toBe(true);

        expect(port).toBe(process.env.SERVER_PORT);
        expect(process.env.ROOT_DIR).toBe('/LWC-Mobile-Samples/HelloWorld');
        expect(process.env.MODULES_DIR).toBe(
            '/LWC-Mobile-Samples/HelloWorld/force-app/main/default'
        );
        expect(process.env.ROOT_COMPONENT).toBe('lwc-helloWorld');
        expect(process.env.SERVICE_WORKER).toBe('true');
        expect(process.env.BEHIND_PROXY).toBe('true');
        expect(process.env.MODE).toBe('dev');
        expect(process.env.SERVER_IDLE_TIMEOUT_MINUTES).toBe(
            `${LwrServerUtils.DEFAULT_SERVER_IDLE_TIMEOUT_MINUTES}`
        );
    });
});
