/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

// @ts-check

import LwcModuleProvider from '@lwrjs/lwc-module-provider';
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
    }

    /**
     * @param {import("@lwrjs/types").AbstractModuleId} moduleId
     * @returns {Promise<import("@lwrjs/types").ModuleEntry | undefined>}
     */
    getModuleEntry(moduleId) {
        // Resolve dependencies and create module relative to our plug-in path
        const newModuleId = { ...moduleId, importer: lwcDevMobilePath };

        if (newModuleId.specifier.startsWith(__nestedModulesNamespace)) {
            const [baseSpecifier, fileRelativePath] =
                moduleId.specifier.split('#'); // specifier can be relative path

            const directoryname = this.moduleMap.get(
                baseSpecifier.replace(__nestedModulesNamespace, '')
            );

            if (directoryname) {
                const name = newModuleId.specifier.replace(
                    __nestedModulesNamespace,
                    ''
                );
                const entry = path.join(
                    directoryname,
                    fileRelativePath || `${name}.js`
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
                `${rootDir}/${pkgPattern}/**/*/lwc/**/*.js`
            );
            const files = fastGlob.sync(sfdxSource);
            files.forEach((item) => {
                const data = path.parse(item);
                if (data.dir.endsWith(data.name)) {
                    // if directory name is same as file name then it's a component
                    map.set(data.name, data.dir);
                }
            });
        } catch {
            // ignore and continue
        }

        return map;
    }
}
