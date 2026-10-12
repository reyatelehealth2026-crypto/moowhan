// App version: injected by Vite (`define.__APP_VERSION__`); plain Node (tests) falls back to a constant.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev'; // eslint-disable-line no-undef
