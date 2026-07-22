import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const css = fs.readFileSync('css/app.css', 'utf8');
const rootCss = fs.readFileSync('app.css', 'utf8');

assert.ok(
  html.includes('viewport-fit=cover'),
  'The mobile viewport must extend the reef background through the iPhone safe area.',
);
assert.ok(
  html.includes('apple-mobile-web-app-status-bar-style" content="black-translucent'),
  'The installed iPhone app must not reserve a solid status-bar strip.',
);

assert.ok(
  html.includes('<meta name="theme-color" content="#2f83b3">'),
  'The iPhone status area must have a reef-compatible fallback color.',
);
assert.match(css, /Maintenance 7B: paint the reef artwork[\s\S]*?html,[\s\S]*?body[\s\S]*?reef-background\.png/, 'The root canvas must paint the reef artwork used behind the iPhone status area.');
assert.match(css, /\.ocean-bg\s*\{[\s\S]*?background:\s*transparent !important;/, 'The decorative background layer must not restart the reef image below the status area.');
assert.equal(rootCss, css, 'Root and css/ stylesheet copies must remain synchronized.');

const contentOpen = html.indexOf('<div class="app-content">');
const header = html.indexOf('<div class="app-header"');
const home = html.indexOf('<!-- HOME PAGE -->');
const contentClose = html.indexOf('</div><!-- end app-content -->');
const bottomNav = html.indexOf('<div class="bottom-nav">');
assert.ok(contentOpen >= 0 && header > contentOpen && header < home, 'The Reef Keeper header must be the first scrollable app-content item.');
assert.ok(contentClose > header && bottomNav > contentClose, 'Bottom navigation must remain fixed outside the scroll container.');
assert.match(css, /\.app-header\s*\{[\s\S]*?env\(safe-area-inset-top, 0px\)/, 'Header padding must respect the iPhone safe area.');
assert.match(css, /\.app-content\s*\{[\s\S]*?scroll-padding-top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ 12px\)/, 'Scrollable content must preserve a safe-area offset for positioned answers.');
assert.match(css, /\.msg\s*\{[\s\S]*?scroll-margin-top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ 12px\)/, 'Chat messages must align below the translucent status bar.');

assert.equal((app.match(/function scrollChatMessageToTop\s*\(/g) || []).length, 1, 'One final-answer positioning helper is required.');
assert.ok(app.includes("message.scrollIntoView({ block: 'start', behavior: 'smooth' })"), 'Final answers must align at their beginning.');
assert.ok(app.includes("const answerMessage = appendMsg('ai', assistantAnswer"), 'Ask AI must retain the newly rendered answer element.');
assert.ok(app.includes('scrollChatMessageToTop(answerMessage);'), 'Successful Ask AI responses must scroll to the answer start.');
assert.ok(app.includes('scrollChatMessageToTop(errorMessage);'), 'Ask AI errors must also begin at the top of the visible response.');

const helperMatch = app.match(/function scrollChatMessageToTop\(message\) \{[\s\S]*?\n\}/);
assert.ok(helperMatch, 'Could not isolate the final-answer positioning helper.');

let scheduled = null;
let options = null;
const context = {
  requestAnimationFrame(callback) { scheduled = callback; },
  document: { querySelector() { return null; } },
};
vm.createContext(context);
vm.runInContext(`${helperMatch[0]}; this.scrollChatMessageToTop = scrollChatMessageToTop;`, context);
context.scrollChatMessageToTop({ scrollIntoView(value) { options = value; } });
assert.equal(typeof scheduled, 'function', 'Answer positioning must wait for the rendered DOM frame.');
scheduled();
assert.equal(options.block, 'start');
assert.equal(options.behavior, 'smooth');

console.log('Mobile status canvas, header, and Ask AI answer positioning checks passed.');
