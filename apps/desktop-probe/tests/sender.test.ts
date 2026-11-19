import { describe, expect, it } from 'vitest';
import { guardProbeInvoke } from '../src/sender.js';

describe('desktop storage invocation boundary', () => {
  it.each(['window', 'frame', 'url'])('rejects a wrong %s before writing', attack => {
    const webContents = {}, mainFrame = { url: 'file:///probe/index.html' };
    let writes = 0;
    const invoke = guardProbeInvoke({ webContents, mainFrame, page: mainFrame.url }, () => ++writes);
    const event = { sender: attack === 'window' ? {} : webContents, senderFrame: attack === 'frame' ? {} : mainFrame };
    if (attack === 'url') mainFrame.url = 'file:///other.html';
    expect(() => invoke(event)).toThrow('Unknown probe sender');
    expect(writes).toBe(0);
  });
  it('permits the expected main frame', () => {
    const webContents = {}, mainFrame = { url: 'file:///probe/index.html' };
    const invoke = guardProbeInvoke({ webContents, mainFrame, page: mainFrame.url }, () => 'stored');
    expect(invoke({ sender: webContents, senderFrame: mainFrame })).toBe('stored');
  });
});
