export const nativeAdapters = {
  camera: { request() { return { granted: false, mock: true }; } },
  scanner: { start() { return { code: null, mock: true }; } },
  location: { read() { return { freshness: "unknown", mock: true }; } },
  maps: { open() { return { opened: false, mock: true }; } },
  notifications: { token() { return null; } },
  secureStorage: { get() { return null; } },
  database: { query() { return []; } },
  sync: { push() { return { accepted: false, mock: true }; } },
  auth: { session() { return { mock: true, actor: "DM-DRV-021" }; } },
  commands: { send() { return { delivered: false, mock: true }; } },
};
