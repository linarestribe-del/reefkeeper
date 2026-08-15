import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publisher = readFileSync('connector/observer-publisher.py', 'utf8');
const index = readFileSync('index.html', 'utf8');

assert.match(publisher, /PUBLISHER_VERSION = '2\.8\.5'/, 'Publisher version should be current.');
assert.match(publisher, /'allow_offline': False/, 'Return water-level safe mode should not mark the camera offline by default.');
assert.match(publisher, /'max_line_jump_percent': 12\.0/, 'Water-level detector should reject large edge flips.');
assert.match(publisher, /tracking_paused/, 'Water-level detector should have a tracking-paused state for ambiguous edges.');
assert.match(publisher, /Water-level tracking is disabled; return camera health uses image quality and scene stability\./, 'Disabled water-level tracking should be explicit and healthy.');
assert.match(publisher, /Water-level tracking paused because the detector jumped/, 'Large waterline jumps should pause tracking instead of producing a false urgent offline state.');
assert.match(publisher, /'status'\] = 'offline' if allow_offline else 'attention'/, 'Urgent water-level differences should not force offline unless explicitly allowed.');
assert.match(index, /Reef Keeper v4\.3\.73 Maintenance 9O/, 'App settings version should show 9N.2.');
assert.match(index, /Water-level learning is feed-mode aware; return timelapse support is active\./, 'Return chamber tools should describe feed-aware water-level learning.');

console.log('PASS observer-9m-return-water-level-reliability');
