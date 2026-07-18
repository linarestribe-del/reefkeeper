const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync(new URL('../index.html', `file://${__filename}`).pathname, 'utf8');
assert(html.includes('<details id="latest-ai-why-wrap"'), 'Why must use native details');
assert(html.includes('<summary>Why?<span id="latest-ai-why-build">Build 2.6</span></summary>'), 'Visible Build 2.6 Why summary missing');
assert(!/#latest-ai-why-wrap\s*\{[^}]*display\s*:\s*none/is.test(html), 'Why wrapper must not be hidden');
assert(html.includes('app-build-2-6.js'), 'Build 2.6 JS reference missing');
assert(html.includes('css/app-build-2-6.css'), 'Build 2.6 CSS reference missing');
console.log('Native Why tests passed.');
