/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { AbstractModuleId, ModuleEntry, ProviderContext } from '@lwrjs/types';
import { LwcModuleProviderOptions } from '@lwrjs/lwc-module-provider';
import LwcModuleProvider from '@lwrjs/lwc-module-provider';
import path from 'path';

// Path to the directory in our plug-in that contains the 'node_modules' folder.
// Override the rootDir to be this location and use it to resolve the modules that LWR requests.
const lwcDevMobilePath = path.resolve(`${__dirname}/../../`);

export default class CustomLwcModuleProvider extends LwcModuleProvider {
    name = 'custom-lwc-module-provider';

    constructor(
        options: LwcModuleProviderOptions | undefined,
        context: ProviderContext
    ) {
        // We need to create a new context b/c rootDir is a readonly property
        const newContext: ProviderContext = {
            ...context,
            config: {
                ...context.config,
                rootDir: lwcDevMobilePath
            }
        };

        // Initialize using the new context with a new rootDir value
        super(options, newContext);
    }

    async createModuleEntry(
        moduleId: AbstractModuleId
    ): Promise<ModuleEntry | undefined> {
        // Resolve dependencies and create module relative to our plug-in path
        const newModuleId = { ...moduleId, importer: lwcDevMobilePath };
        return super.createModuleEntry(newModuleId);
    }
}
