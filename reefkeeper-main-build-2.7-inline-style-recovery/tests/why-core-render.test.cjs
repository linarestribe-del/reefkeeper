const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
function ok(c,m){if(!c) throw new Error(m)}
ok(html.includes('<details id="latest-ai-why-wrap"'), 'Native Why control missing');
ok(html.includes('<summary>Why?<span id="latest-ai-why-build">Build 2.7</span></summary>'), 'Visible Why summary missing');
ok(html.includes('latest-ai-why-panel'), 'Why panel missing');
ok(html.indexOf('<details id="latest-ai-why-wrap"') < html.indexOf('<div class="model-selector-wrap"'), 'Why control must appear before the Answer selector');
ok(!/#latest-ai-why-wrap\s*\{[^}]*display\s*:\s*none/is.test(html), 'Why control must never be hidden by CSS');
console.log('Why native-render regression passed.');
