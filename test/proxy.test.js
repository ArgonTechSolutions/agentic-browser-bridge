import test from 'node:test';
import assert from 'node:assert/strict';
import {proxyArguments} from '../src/proxy.js';

test('proxy is opt-in and produces isolated arguments for supported protocols', () => {
  assert.deepEqual(proxyArguments({}), []);
  for (const server of ['http://connector:1055', 'https://proxy.example:443', 'socks5://[::1]:1080']) {
    const args = proxyArguments({ABB_PROXY_SERVER: server});
    assert.equal(args[0], `--proxy-server=${server}`);
    assert.ok(args.includes('--disable-quic'));
    assert.ok(args.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'));
    assert.ok(!args.some(arg => /direct:\/\//i.test(arg)));
  }
  assert.ok(proxyArguments({ABB_PROXY_SERVER: 'http://connector:1055', ABB_PROXY_BYPASS: '*.example.test;10.0.0.0/8'}).includes('--proxy-bypass-list=*.example.test;10.0.0.0/8'));
});

test('proxy config rejects credential disclosure, argument injection and direct fallbacks', () => {
  for (const server of ['http://user:secret@host:80', 'http://proxy:80,direct://', 'http=proxy:80', 'http://proxy:80/path', 'http://proxy:80\n--no-proxy-server', 'socks4://proxy:1080', 'http://host:0', 'http://host:65536', 'http://[:::]:90', 'http://host:80?x=y']) {
    assert.throws(() => proxyArguments({ABB_PROXY_SERVER: server}));
  }
  assert.throws(() => proxyArguments({ABB_PROXY_BYPASS: '*'}));
  assert.throws(() => proxyArguments({ABB_PROXY_SERVER: 'http://proxy:80', ABB_PROXY_BYPASS: '\n--no-proxy-server'}));
});
