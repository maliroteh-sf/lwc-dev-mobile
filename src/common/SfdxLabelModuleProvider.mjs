/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

// @ts-check

import { hashContent } from '@lwrjs/shared-utils';
import { previewLogger } from './LwrServerUtils.js';
import { XMLParser } from 'fast-xml-parser';
import fastGlob from 'fast-glob';
import fs from 'fs';
import path from 'path';

const LABEL_PREFIX = '@salesforce/label/';

/**
 * Check whether the given id is a @salesforce/label scoped module id
 * @param {string} id
 * @returns {boolean}
 */
function isLabelScopedModule(id) {
    return id.startsWith(LABEL_PREFIX);
}

/**
 * Provider that resolves @salesforce/resourceUrl/xxx imports to the actual resource URL.
 *
 * As per the documentation at https://developer.salesforce.com/docs/platform/lwc/guide/create-resources.html
 * the local path for a static resource will be force-app/main/default/staticresources/...
 */
export default class SalesforceLabelProvider {
    name = 'sfdx-label-module-provider';
    version = '1';
    customLabelsMap = new Map();

    /**
     * @param {{}} options
     * @param {import("@lwrjs/types").ProviderContext} context
     */
    constructor(options, context) {
        this.customLabelsMap = this.generateSfdxLabelComponentsMap(
            context.config.rootDir
        );

        const files = Array.from(this.customLabelsMap.keys());
        previewLogger?.debug(
            '\n*************** SalesforceLabelProvider Processed Custom Label Files ***************\n' +
                JSON.stringify(files, null, '  ')
        );
    }

    /**
     * @param {import("@lwrjs/types").AbstractModuleId} moduleId
     * @returns {Promise<any>}
     */
    async getModuleEntry(moduleId) {
        if (isLabelScopedModule(moduleId.specifier)) {
            const matchedLabel = this.getLabelValueFromMap(moduleId.specifier);
            if (matchedLabel) {
                return Promise.resolve({
                    id: `${moduleId.specifier}|${this.version}`,
                    virtual: true, // ...because this is a server-generated module
                    entry: `<virtual>/${moduleId.specifier}${
                        path.extname(moduleId.specifier) ? '' : '.js'
                    }`,
                    specifier: moduleId.specifier,
                    version: this.version,
                    // Normally getModuleEntry would return an object of type import("@lwrjs/types").ModuleEntry
                    // but since we have already resolved the value for the label we would like to return that
                    // resolved value as well so that we don't need to resolve it again later. So instead, this
                    // method returns an object of type Any so that we can inject the entra field and use it later.
                    labelValue: matchedLabel
                });
            }
        }

        return Promise.resolve(undefined);
    }

    /**
     * @param {import("@lwrjs/types").AbstractModuleId} moduleId
     * @returns {Promise<import("@lwrjs/types").ModuleCompiled | undefined>}
     */
    async getModule(moduleId) {
        const moduleEntry = await this.getModuleEntry(moduleId);
        if (!moduleEntry || !moduleEntry.labelValue) {
            return Promise.resolve(undefined);
        }

        const originalSource = `export default "${moduleEntry.labelValue}";`;

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
     * Generates a map of all of the files containing custom labels as per the documentation
     * at https://developer.salesforce.com/docs/platform/lwc/guide/create-labels.html
     * @param {string} rootDir
     * @returns {Map}
     */
    generateSfdxLabelComponentsMap(rootDir) {
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
                `${rootDir}/${pkgPattern}/**/*.labels-meta.xml`
            );
            const files = fastGlob.sync(sfdxSource);
            const xmlParser = new XMLParser();
            files.forEach((item) => {
                try {
                    const xmlContent = fs.readFileSync(item, 'utf8');
                    const jsonObj = xmlParser.parse(xmlContent);
                    map.set(item.replace(`${rootDir}/`, ''), jsonObj);
                } catch {
                    // ignore and continue
                }
            });
        } catch {
            // ignore and continue
        }

        return map;
    }

    /**
     * Generates a map of all of the files containing custom labels as per the documentation
     * at https://developer.salesforce.com/docs/platform/lwc/guide/create-labels.html
     * @param {string} specifier
     * @returns {string | undefined}
     */
    getLabelValueFromMap(specifier) {
        const labelName = specifier?.split('/')[2]?.split('.')[1];
        if (labelName) {
            for (var item of this.customLabelsMap) {
                let labels = item[1].CustomLabels?.labels;
                if (!Array.isArray(labels)) {
                    labels = [labels];
                }

                const match = labels.find(
                    (item) => item.fullName === labelName
                );
                if (match) {
                    return match.value;
                }
            }
        }

        return undefined;
    }
}
