/**
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

// Based off of https://git.soma.salesforce.com/communities/webruntime/blob/master/packages/%40communities-webruntime/client/src/modules/webruntime/formFactor/formFactor.js

function isMedium() {
    return (typeof window !== 'undefined' &&
        window.matchMedia('only screen and (min-width: 48em) and (max-width: 64em)').matches);
}
function isSmall() {
    return (typeof window !== 'undefined' &&
        window.matchMedia('only screen and (max-width: 47.9375em)').matches);
}
function getFormFactor() {
    if (isMedium())
        return 'Medium';
    if (isSmall())
        return 'Small';
    return 'Large';
}
const EVALUATED_FORM_FACTOR = getFormFactor();
export { EVALUATED_FORM_FACTOR as default, getFormFactor };
