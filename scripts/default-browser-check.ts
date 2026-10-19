import assert from 'node:assert/strict';
import {defaultBrowserSupported,defaultBrowserText,incomingLink,linksInArguments} from '../agent/app/index.ts';

// Only the installed Mac and Windows apps register; Dev, Linux and the Store package never do.
assert.equal(defaultBrowserSupported({channel:'release',platform:'darwin'}),true);
assert.equal(defaultBrowserSupported({channel:'release',platform:'win32'}),true);
assert.equal(defaultBrowserSupported({channel:'release',platform:'win32',windowsStore:true}),false);
assert.equal(defaultBrowserSupported({channel:'dev',platform:'darwin'}),false);
assert.equal(defaultBrowserSupported({channel:'release',platform:'linux'}),false);

// https pages open in the World; http, local servers and links with a password go to the previous browser.
assert.deepEqual(incomingLink('https://us.posthog.com/project/1'),{to:'world',url:'https://us.posthog.com/project/1'});
assert.deepEqual(incomingLink('http://localhost:3000/'),{to:'previous',url:'http://localhost:3000/'});
assert.deepEqual(incomingLink('https://alex:secret@example.com/'),{to:'previous',url:'https://alex:secret@example.com/'});
for(const value of ['mailto:alex@example.com','file:///etc/hosts','javascript:alert(1)','not a link','',null])assert.equal(incomingLink(value),null);

// Windows hands the link as an argument; switches and the executable are not links.
assert.deepEqual(linksInArguments(['C:\\Worldlet\\Worldlet.exe','--opened-at-login','https://example.com/a','HTTP://example.com/b']),['https://example.com/a','HTTP://example.com/b']);
assert.deepEqual(linksInArguments(['https://example.com/exe-path-is-never-a-link']),[]);

// Each status says what happens next, and where.
assert.match(defaultBrowserText('off','win32'),/Windows Settings/);
assert.match(defaultBrowserText('off','darwin'),/Mac asks/);
assert.match(defaultBrowserText('on','darwin'),/previous browser/);
assert.match(defaultBrowserText('unsupported'),/installed Worldlet app/);
console.log('default browser check passed');
