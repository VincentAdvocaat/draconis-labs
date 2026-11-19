/** The real Electron event objects are compared by identity, before any storage call. */
export function assertProbeSender(event: {
  sender: unknown;
  senderFrame: unknown;
}, expected: { webContents: unknown; mainFrame: { url: string }; page: string }) {
  if (event.sender !== expected.webContents || event.senderFrame !== expected.mainFrame || expected.mainFrame.url !== expected.page) {
    throw new Error('Unknown probe sender');
  }
}

export function guardProbeInvoke<T extends unknown[], R>(
  expected: { webContents: unknown; mainFrame: { url: string }; page: string },
  operation: (...args: T) => R,
) {
  return (event: { sender: unknown; senderFrame: unknown }, ...args: T): R => {
    assertProbeSender(event, expected);
    return operation(...args);
  };
}
