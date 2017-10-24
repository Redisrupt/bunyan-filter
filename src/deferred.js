/**
 * return a Promise instance that will be rejected if a certain amount of time pass
 * and the promise is not fulfilled yet. The returned promise have to actually be
 * fulfilled from outside calling `promise.resolve` on the returned instance
 * (do not confuse it with Promise.resolve which is a static method of the Promise class)
 *
 * @param {Object} args           the args object
 * @param {String} [args.id]      the id of the deferred. Useful for debugging. If not specified
 *                                the default value is "anonymous deferred"
 * @param {Number} [args.timeout] The amount of time to wait for the fulfillment
 * @return {Promise}              a Promise instance that can be used as a deferred
 */
export const deferred = args => {
  args = args || {};

  const { timeout } = args;

  let resolve;
  let reject;
  let timeoutId;

  const promise = new Promise((resolver, rejector) => {
    resolve = resolver;
    reject = rejector;
  });

  promise.resolve = arg => {
    clearTimeout(timeoutId);
    resolve(arg);
  };

  promise.reject = arg => {
    clearTimeout(timeoutId);
    reject(arg);
  };

  if (typeof timeout === 'number') {
    const id = args.id || 'anonymous deferred';
    timeoutId = setTimeout(() => reject({ reason: `timeout (${timeout}) reached on "${id}"` }), timeout);
  }

  return promise;
};
