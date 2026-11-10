const ARK_PATTERN = /^ark:\/\d+\/[a-zA-Z0-9]+$/;

/**
 * @description Check whether a string is ARK-shaped (`ark:/<NAAN>/<name>`).
 * @param {string} value - Value to test.
 * @returns {boolean} True if the value looks like an ARK.
 */
export function isArk(value) {
  return typeof value === 'string' && ARK_PATTERN.test(value);
}

export default isArk;
