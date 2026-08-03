import assert from 'node:assert/strict';
import fs from 'node:fs';

const observer = fs.readFileSync(new URL('../observer.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '4.3.65');
assert.match(observer, /CLOUD_PUBLISH_INTERVAL_MINUTES = 15/);
assert.match(observer, /PUBLISH_STALE_AFTER_MS = 25 \* 60_000/);
assert.match(observer, /CAPTURE_STALE_AFTER_MS = 25 \* 60_000/);
assert.match(observer, /dataSaverScheduleLabel/);
assert.match(observer, /Local capture every \$\{localMinutes\} min · cloud publish every \$\{CLOUD_PUBLISH_INTERVAL_MINUTES\} min/);
assert.match(observer, /data saver expects roughly \$\{CLOUD_PUBLISH_INTERVAL_MINUTES\}-minute cloud updates/);
assert.match(html, /Data saver schedule/);
assert.match(html, /Local capture every 5 min · cloud publish every 15 min/);

console.log('Observer 9H data saver wording tests passed.');
