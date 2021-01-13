/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { Logger, Messages } from '@salesforce/core';
import chalk from 'chalk';
import cli from 'cli-ux';
import { performance, PerformanceObserver } from 'perf_hooks';
import { CommonUtils } from './CommonUtils';
import { PerformanceMarkers } from './PerformanceMarkers';
export type CheckRequirementsFunc = () => Promise<string | undefined>;

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

export interface Requirement {
    title: string;
    checkFunction: CheckRequirementsFunc;
    fulfilledMessage?: string;
    unfulfilledMessage?: string;
    supplementalMessage?: string;
    logger: Logger;
}

export interface SetupTestCase {
    title: string;
    testResult: string;
    message: string;
    hasPassed: boolean;
    supplementalMessage?: string;
    duration: number;
}

export interface SetupTestResult {
    hasMetAllRequirements: boolean;
    tests: SetupTestCase[];
}

export interface RequirementList {
    requirements: Requirement[];
    executeSetup(): Promise<SetupTestResult>;
}

export interface Launcher {
    launchNativeBrowser(url: string): Promise<void>;
}

export interface WrappedPromiseResult {
    message: string | undefined;
    status: string;
    duration: number;
    requirement: Requirement;
}

// This function wraps existing promises with the intention to allow the collection of promises
// to settle when used in conjunction with Promise.all(). Promise.all() by default executes until the first
// rejection. We are looking for the equivalent of Promise.allSettled() which is scheduled for ES2020.
// Once the functionality is  available  in the near future this function can be removed.
// See https://github.com/tc39/proposal-promise-allSettled
export function WrappedPromise(
    requirement: Requirement
): Promise<WrappedPromiseResult> {
    const promise = requirement.checkFunction();
    const perfMarker = PerformanceMarkers.getByName(
        PerformanceMarkers.REQUIREMENTS_MARKER_KEY
    )!;

    let stepDuration: number = 0;
    const obs = new PerformanceObserver((items) => {
        stepDuration = items.getEntries()[0].duration / 1000;
    });
    obs.observe({ entryTypes: ['measure'] });

    const start = `${perfMarker.startMarkName}_${requirement.title}`;
    const end = `${perfMarker.endMarkName}_${requirement.title}`;
    const step = `${perfMarker.name}_${requirement.title}`;

    performance.mark(start);
    return promise
        .then((v) => {
            performance.mark(end);
            performance.measure(step, start, end);
            return {
                duration: stepDuration,
                message: v,
                requirement,
                status: 'fulfilled'
            };
        })
        .catch((e) => {
            performance.mark(end);
            performance.measure(step, start, end);
            return {
                duration: stepDuration,
                message: e,
                requirement,
                status: 'rejected'
            };
        })
        .finally(() => {
            obs.disconnect();
        });
}

export abstract class BaseSetup implements RequirementList {
    public requirements: Requirement[];
    protected logger: Logger;
    protected setupMessages = Messages.loadMessages(
        '@salesforce/lwc-dev-mobile',
        'setup'
    );

    private perfMarker = PerformanceMarkers.getByName(
        PerformanceMarkers.REQUIREMENTS_MARKER_KEY
    )!;

    constructor(logger: Logger) {
        const messages = this.setupMessages;
        this.logger = logger;
        this.requirements = [
            {
                checkFunction: this.ensureLWCServerPluginInstalled,
                fulfilledMessage: `${messages.getMessage(
                    'common:reqs:serverplugin:fulfilledMessage'
                )}`,
                logger,
                title: `${messages.getMessage(
                    'common:reqs:serverplugin:title'
                )}`,
                unfulfilledMessage: `${messages.getMessage(
                    'common:reqs:serverplugin:unfulfilledMessage'
                )}`
            }
        ];
    }

    public async executeSetup(): Promise<SetupTestResult> {
        const allPromises: Array<Promise<any>> = [];
        this.requirements.forEach((requirement) =>
            allPromises.push(WrappedPromise(requirement))
        );

        return Promise.all(allPromises).then((results) => {
            const testResult: SetupTestResult = {
                hasMetAllRequirements: true,
                tests: []
            };
            let totalDuration: number = 0;
            results.forEach((result) => {
                totalDuration += result.duration;

                if (result.status === 'fulfilled') {
                    testResult.tests.push({
                        duration: result.duration,
                        hasPassed: true,
                        message: result.message,
                        supplementalMessage:
                            result.requirement.supplementalMessage,
                        testResult: this.setupMessages.getMessage('passed'),
                        title: result.requirement.title
                    });
                } else if (result.status === 'rejected') {
                    testResult.hasMetAllRequirements = false;
                    testResult.tests.push({
                        duration: result.duration,
                        hasPassed: false,
                        message: result.message,
                        supplementalMessage:
                            result.requirement.supplementalMessage,
                        testResult: this.setupMessages.getMessage('failed'),
                        title: result.requirement.title
                    });
                }
            });

            const setupMessage = `Setup (${totalDuration.toFixed(3)} sec)`;
            const tree = cli.tree();
            tree.insert(setupMessage);
            const rootNode = tree.nodes[setupMessage];
            testResult.tests.forEach((test) => {
                let lineItem = `${test.testResult}: ${
                    test.title
                } (${test.duration.toFixed(3)} sec)`;

                lineItem = test.hasPassed
                    ? chalk.bold.green(lineItem)
                    : chalk.bold.red(lineItem);

                rootNode.insert(lineItem);

                const message =
                    test.message && test.message.length > 0 ? test.message : '';
                const supplementalMessage =
                    test.supplementalMessage &&
                    test.supplementalMessage.length > 0
                        ? test.supplementalMessage
                        : '';
                const detailedMessage = `${message} ${supplementalMessage}`;

                if (detailedMessage.trim().length > 0) {
                    rootNode.nodes[lineItem].insert(detailedMessage);
                }
            });
            tree.display();
            return Promise.resolve(testResult);
        });
    }

    public async ensureLWCServerPluginInstalled(): Promise<string> {
        const requirement = CommonUtils.castAsRequirement(this);
        return new Promise<string>(async (resolve, reject) => {
            try {
                await CommonUtils.isLwcServerPluginInstalled();
                this.logger.info('sfdx server plugin detected.');
                resolve(requirement.fulfilledMessage);
            } catch {
                this.logger.info('sfdx server plugin was not detected.');
                try {
                    const command =
                        'sfdx plugins:install @salesforce/lwc-dev-server';
                    this.logger.info(
                        `Installing sfdx server plugin.... ${command}`
                    );
                    CommonUtils.executeCommandSync(command, [
                        'inherit',
                        'pipe',
                        'inherit'
                    ]);
                    this.logger.info('sfdx server plugin installed.');
                    resolve(requirement.fulfilledMessage);
                } catch (error) {
                    this.logger.error(
                        `sfdx server plugin installion failed. ${error}`
                    );
                    reject(new Error(requirement.unfulfilledMessage));
                }
            }
        });
    }

    public addRequirements(reqs: Requirement[]) {
        if (reqs) {
            this.requirements = this.requirements.concat(reqs);
        }
    }
}
