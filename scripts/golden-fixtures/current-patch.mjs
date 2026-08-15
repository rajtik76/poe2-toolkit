// Resolves the Path of Exile 2 patch version the CDN is currently serving.
//
// Pinning a version in config.json does not work for long: the patch CDN hosts
// only the patch the game is on right now, so yesterday's pin 404s. GGG exposes
// no HTTP endpoint for "what is current", but the patch server announces it over
// a tiny TCP protocol: connect, send the two-byte handshake [0x01, 0x07], and the
// reply embeds the CDN base URL in UTF-16LE, e.g.
// "https://patch-poe2.poecdn.com/4.5.4.10/". The version is that URL's path
// segment.
//
// Reply layout: the byte immediately before the URL is its length in UTF-16 code
// units, and the URL follows in UTF-16LE.

import { connect } from 'node:net';

const HOST = 'patch.pathofexile2.com';
const PORT = 13060;
const TIMEOUT_MS = 8000;
const HANDSHAKE = Buffer.from([0x01, 0x07]);

/** UTF-16LE "https://", the marker the URL always starts with. */
const MARKER = Buffer.from('https://', 'utf16le');

/**
 * Ask the patch server which version it is serving.
 *
 * @returns {Promise<string>} e.g. "4.5.4.10"
 */
export function currentPatch({ host = HOST, port = PORT, timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(value);
    };

    socket.setTimeout(timeout);
    socket.on('timeout', () => finish(new Error(`patch server timed out after ${timeout}ms`)));
    socket.on('error', (error) => finish(new Error(`patch server unreachable: ${error.message}`)));
    socket.on('connect', () => socket.write(HANDSHAKE));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      const start = buffer.indexOf(MARKER);

      // The length byte sits just before the URL, so a match at offset 0 means
      // we are looking at a truncated read, not a real header.
      if (start < 1) return;

      const length = buffer[start - 1] * 2; // UTF-16 code units -> bytes

      if (buffer.length < start + length) return;

      const url = buffer.subarray(start, start + length).toString('utf16le');
      const match = /\/(\d[\d.]*\d)\/?$/.exec(url);

      match
        ? finish(null, match[1])
        : finish(new Error(`could not parse version from "${url}"`));
    });

    socket.on('close', () => finish(new Error('patch server returned no version')));
  });
}

// Also usable straight from the shell: `node scripts/golden-fixtures/current-patch.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  currentPatch().then(
    (version) => console.log(version),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}
