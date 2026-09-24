// Shared client-side logger.
//
// The browser has no structured-logging pipeline, so console is the only sink
// available for operational diagnostics. This module is the single sanctioned
// place where client code touches console: error/warn paths that must stay
// visible for support (sync failures, auth failures, storage failures) route
// through here, while debug/info noise is dropped at the call site. Keeping
// console access in one file means the no-console rule can stay enabled for
// the rest of src/ without losing production diagnostics.
/* eslint-disable no-console -- console is the sanctioned transport; see above */
export const logger = {
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
};
