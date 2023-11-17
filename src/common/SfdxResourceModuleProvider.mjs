/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

// @ts-check

// Based off of the code from https://git.soma.salesforce.com/communities/webruntime/blob/master/packages/%40communities-webruntime/services/src/salesforce-resource-url

import { hashContent } from '@lwrjs/shared-utils';
import fastGlob from 'fast-glob';
import path from 'path';

const RESOURCE_URL_PREFIX = '@salesforce/resourceUrl/';
const CONTENT_ASSET_URL_PREFIX = '@salesforce/contentAssetUrl/';

/**
 * Check whether the given id is a @salesforce/resourceUrl scoped module id
 * @param {string} id
 * @returns {boolean}
 */
function isResourceUrlScopedModule(id) {
    return (
        id.startsWith(RESOURCE_URL_PREFIX) ||
        id.startsWith(CONTENT_ASSET_URL_PREFIX)
    );
}

/**
 * Provider that resolves @salesforce/resourceUrl/xxx imports to the actual resource URL.
 *
 * As per the documentation at https://developer.salesforce.com/docs/platform/lwc/guide/create-resources.html
 * the local path for a static resource will be force-app/main/default/staticresources/...
 */
export default class SalesforceResourceProvider {
    name = 'sfdx-salesforce-resource-url-provider';
    version = '1';

    /**
     * @param {import("@lwrjs/types").AbstractModuleId} moduleId
     * @returns {Promise<import("@lwrjs/types").ModuleEntry | undefined>}
     */
    async getModuleEntry(moduleId) {
        if (isResourceUrlScopedModule(moduleId.specifier)) {
            return Promise.resolve({
                id: `${moduleId.specifier}|${this.version}`,
                virtual: true, // ...because this is a server-generated module
                entry: `<virtual>/${moduleId.specifier}${
                    path.extname(moduleId.specifier) ? '' : '.js'
                }`,
                specifier: moduleId.specifier,
                version: this.version
            });
        }

        return Promise.resolve(undefined);
    }

    /**
     * @param {import("@lwrjs/types").AbstractModuleId} moduleId
     * @returns {Promise<import("@lwrjs/types").ModuleCompiled | undefined>}
     */
    async getModule(moduleId) {
        const moduleEntry = await this.getModuleEntry(moduleId);
        if (!moduleEntry) {
            return Promise.resolve(undefined);
        }
        const isContentAsset = moduleId.specifier.startsWith(
            CONTENT_ASSET_URL_PREFIX
        );
        const name = moduleId.specifier.split('/')[2].split('.')[0];
        const filePath = isContentAsset
            ? this.getContentAssetFilePath(name)
            : this.getResourceFilePath(name);
        const originalSource = `export default "${filePath}";`;

        return Promise.resolve({
            id: moduleEntry.id,
            specifier: moduleId.specifier,
            namespace: moduleId.namespace,
            name: moduleId.name ?? moduleId.specifier,
            version: this.version,
            originalSource: originalSource,
            moduleEntry: moduleEntry,
            ownHash: hashContent(originalSource),
            compiledSource: originalSource
        });
    }

    /**
     * Given a content asset name, resolves it to a file path
     * @param {string} name
     * @returns {string}
     */
    getContentAssetFilePath(name) {
        // As per the LWC documentation at https://developer.salesforce.com/docs/platform/lwc/guide/create-content-assets.html
        // in a Salesforce DX project, content assets live in the /force-app/main/default/contentassets directory
        return this.getPath(name, 'force-app/main/default/contentassets');
    }

    /**
     * Given a resource name, resolves it to a file path
     * @param {string} name
     * @returns {string}
     */
    getResourceFilePath(name) {
        // As per the LWC documentation at https://developer.salesforce.com/docs/platform/lwc/guide/create-resources.html
        // in a Salesforce DX project, static resources live in the /force-app/main/default/staticresources directory
        return this.getPath(name, 'force-app/main/default/staticresources');
    }

    /**
     * Helper method used by getContentAssetFilePath and getResourceFilePath
     * @param {string} name
     * @param {string} folder
     * @returns {string}
     */
    getPath(name, folder) {
        const rootDir = path.resolve(process.env.ROOT_DIR ?? '');
        const pathInFolder = path.join(folder, name);
        const fullPath = path.normalize(path.resolve(rootDir, pathInFolder));
        const fileExtension = this.getFileExtension(fullPath);
        return `${pathInFolder}${fileExtension}`;
    }

    /**
     * Given the path to a file that does not contain file extension, resolves it to a file extension
     * @param {string} filePath
     * @returns {string}
     */
    getFileExtension(filePath) {
        try {
            const files = fastGlob.sync(
                [
                    `${filePath}.*`,
                    `!${filePath}.resource-meta.*`,
                    `!${filePath}.asset-meta.*`
                ],
                { onlyFiles: true }
            );
            if (files?.length > 0) {
                return path.extname(files[0]);
            }
        } catch {
            // ignore and continue
        }

        return '';
    }
}
