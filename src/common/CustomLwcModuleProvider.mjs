/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

// @ts-check

import LwcModuleProvider from '@lwrjs/lwc-module-provider';
import { previewLogger } from './LwrServerUtils.js';
import fastGlob from 'fast-glob';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Path to the directory in our plug-in that contains the 'node_modules' folder.
// Override the rootDir to be this location and use it to resolve the modules that LWR requests.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const lwcDevMobilePath = path.resolve(`${__dirname}/../../`);

const __nestedModulesNamespace = 'c/';

export default class CustomLwcModuleProvider extends LwcModuleProvider {
    name = 'custom-lwc-module-provider';
    version = '1';
    moduleMap = new Map();

    /**
     * @param {{}} options
     * @param {import("@lwrjs/types").ProviderContext} context
     */
    constructor(options, context) {
        const originalRootDir = context.config.rootDir;

        // We need to create a new context b/c rootDir is a readonly property
        const newContext = {
            ...context,
            config: {
                ...context.config,
                rootDir: lwcDevMobilePath
            }
        };

        // Initialize using the new context with a new rootDir value
        super(options, newContext);

        this.moduleMap = this.generateSfdxComponentsMap(originalRootDir);

        const obj = {};
        for (let [k, v] of this.moduleMap) {
            obj[k] = v;
        }

        previewLogger?.debug(
            '\n*************** CustomLwcModuleProvider In-Memory Module Map ***************\n' +
                JSON.stringify(obj, null, '  ')
        );
    }

    /**
     * @param {import("@lwrjs/types").AbstractModuleId} moduleId
     * @returns {Promise<import("@lwrjs/types").ModuleEntry | undefined>}
     */
    getModuleEntry(moduleId) {
        // Resolve dependencies and create module relative to our plug-in path
        const newModuleId = { ...moduleId, importer: lwcDevMobilePath };

        if (newModuleId.specifier.startsWith(__nestedModulesNamespace)) {
            const parts = moduleId.specifier.split('#'); // specifier can be relative path e.g: c/mycomponent#mycomponent.html
            const baseSpecifier = parts[0].replace(
                __nestedModulesNamespace,
                ''
            );
            const fileRelativePath = parts.length > 1 ? parts[1] : undefined;
            const directoryname = this.moduleMap.get(baseSpecifier);

            if (directoryname) {
                let name = newModuleId.specifier.replace(
                    __nestedModulesNamespace,
                    ''
                );

                if (!fileRelativePath && name.lastIndexOf('.') === -1) {
                    // Need to determine if this is a reference to a component with JS code or just a CSS component meant for CSS sharing.
                    // See https://developer.salesforce.com/docs/platform/lwc/guide/create-components-css-share.html
                    const fullPath = path.join(directoryname, name);
                    if (fs.existsSync(`${fullPath}.js`)) {
                        name = `${name}.js`;
                    } else if (fs.existsSync(`${fullPath}.css`)) {
                        name = `${name}.css`;
                    }
                }

                const entry = path.join(
                    directoryname,
                    fileRelativePath || name
                );
                if (entry) {
                    return Promise.resolve({
                        id: `${newModuleId.specifier}|${this.version}`, // used as part of the cache key for this module by the LWR Module Registry
                        entry: entry,
                        specifier: newModuleId.specifier,
                        version: this.version
                    });
                }
            }
        }

        return super.getModuleEntry(newModuleId);
    }

    /**
     * Based on the code for ComponentIndexer from
     * https://sourcegraph.com/github.com/forcedotcom/lightning-language-server/-/blob/packages/lwc-language-server/src/component-indexer.ts
     * @param {string} rootDir
     * @returns {Map}
     */
    generateSfdxComponentsMap(rootDir) {
        const map = new Map();

        try {
            const projectJson = JSON.parse(
                fs.readFileSync(path.join(rootDir, 'sfdx-project.json'), 'utf8')
            );
            const pkgDirs = projectJson.packageDirectories;
            const paths = pkgDirs.map((item) => item.path);
            const pkgPattern =
                paths.length === 1 ? paths[0] : `{${paths.join()}}`;
            const sfdxSource = path.normalize(
                `${rootDir}/${pkgPattern}/**/*/lwc/**/*.js-meta.xml`
            );
            const files = fastGlob.sync(sfdxSource);
            files.forEach((item) => {
                const data = path.parse(item);
                const name = data.name.replace('.js-meta', '');
                if (data.dir.endsWith(name)) {
                    // if directory name is same as file name then it's a component
                    map.set(name, data.dir);
                }
            });
        } catch {
            // ignore and continue
        }

        return map;
    }
}
