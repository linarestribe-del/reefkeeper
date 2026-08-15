import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const publisher = readFileSync('connector/observer-publisher.py', 'utf8');
const trainer = readFileSync('connector/return-water-level-trainer.py', 'utf8');
const installer = readFileSync('connector/install-return-water-level-learning-1.1.sh', 'utf8');
const index = readFileSync('index.html', 'utf8');

assert.equal(pkg.version, '4.3.72');
assert.match(index, /Reef Keeper v4\.3\.72 Maintenance 9N\.2/);
assert.match(index, /Water-level learning is feed-mode aware; return timelapse support is active\./);
assert.match(publisher, /PUBLISHER_VERSION = '2\.8\.5'/);
assert.match(publisher, /baseline_nearest_edge/);
assert.match(publisher, /line_jump >= max_line_jump and candidate/);
assert.match(publisher, /feed_mode_high_tolerance/);
assert.match(publisher, /feed_mode_high_confirming/);
assert.match(publisher, /candidateEdges/);
assert.match(trainer, /TRAINER_VERSION = '1\.0\.1'/);
assert.match(trainer, /likelyFeedHighSampleCount/);
assert.match(trainer, /Recommended thresholds are based on the operating band after excluding likely return-pump-off\/feed-mode high-water samples/);
assert.match(installer, /PUBLISHER_VERSION = '2\.8\.5'/);
assert.match(installer, /TRAINER_VERSION = '1\.0\.1'/);
assert.match(installer, /9N\.1 FEED-AWARE WATER-LEVEL INSTALLED/);
assert.ok(existsSync('connector/install-return-water-level-learning-1.1.sh'));

console.log('PASS observer-9n1-feed-aware-water-level');
