const noop = () => {};

const Native = {
  setTag: noop,
  captureException: noop,
  captureMessage: noop,
};

module.exports = {
  init: noop,
  captureException: noop,
  captureMessage: noop,
  configureScope: noop,
  Native,
  withScope: (fn) => {
    if (typeof fn === 'function') {
      fn({ setTag: noop, setContext: noop, setUser: noop });
    }
  },
};
