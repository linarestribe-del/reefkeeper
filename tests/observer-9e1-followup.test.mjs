import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const observer = fs.readFileSync('observer.js', 'utf8');
const alertsApi = fs.readFileSync('api/observer-alerts.js', 'utf8');
const filterUi = fs.readFileSync('filter-roll-status.js', 'utf8');
const filterEngine = fs.readFileSync('filter-roll-engine.js', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.equal(pkg.version, '4.3.55');
assert.match(html, /Reef Keeper v4\.3\.55 Maintenance 9F/);
assert.match(html, /id="observer-health-guidance" hidden/);
assert.match(html, /Reviewed removes an item from this inbox and stores it in history/);
assert.match(html, /maintenance-9f-observer-reliability/);

assert.match(observer, /const ALERT_CLEARED_KEY/);
assert.match(observer, /const sessionAlertIdSets = new Map\(\)/);
assert.match(observer, /sessionAlertIdSets\.set\(key, normalized\)/);
assert.match(observer, /showToast\('Moved to reviewed history'\)/);
assert.match(observer, /previousActive\.forEach\(key =>/);
assert.match(observer, /if \(cleared\.has\(key\) && reviewed\.has\(key\)\)/);
assert.doesNotMatch(observer, /!previousActive\.has\(key\) && reviewed\.has\(key\)/, 'A reviewed alert must not rearm merely because a prior-active cache is missing.');
assert.match(observer, /function isMaintenanceSceneAdvisory\(/);
assert.match(observer, /No exact image reset is required/);
assert.match(observer, /state = 'advisory'; label = 'Advisory'/);
assert.match(observer, /Expected sump-view variation · review only/);
assert.match(observer, /observer-health-guidance/);

assert.match(alertsApi, /Sump view changed after maintenance or equipment movement/);
assert.match(alertsApi, /no exact image match is required/);
assert.match(filterUi, /function actionableTrackingWarning\(/);
assert.match(filterUi, /current estimate remains anchored to the manual baseline/);
assert.match(filterUi, /wait for or troubleshoot the next scheduled measurement before planning replacement/);
assert.match(filterEngine, /const VERSION = '9F'/);
assert.match(css, /Maintenance 9E\.1 — reviewed-alert certainty and maintenance-scene advisory/);
assert.match(css, /observer-health-badge\.advisory/);
assert.match(css, /observer-health-guidance/);

console.log('Maintenance 9E.1 reviewed-alert and advisory follow-up tests passed.');
