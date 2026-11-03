// Provider-independent Chromium proxy configuration. Never accept proxy maps,
// credentials or fallback lists: a disconnected connector must not become DIRECT.
export function proxyArguments(env = process.env) {
  const server = env.ABB_PROXY_SERVER || '';
  const bypass = env.ABB_PROXY_BYPASS || '';
  if (!server) {
    if (bypass) throw new Error('ABB_PROXY_BYPASS requires ABB_PROXY_SERVER');
    return [];
  }
  if (!/^(https?|socks5):\/\/(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):[0-9]{1,5}$/.test(server)) {
    throw new Error('ABB_PROXY_SERVER must be a single http, https or socks5 host:port URL without credentials');
  }
  let parsed;
  try { parsed = new URL(server); } catch { throw new Error('Invalid ABB_PROXY_SERVER'); }
  const port = Number(server.slice(server.lastIndexOf(':') + 1));
  if (!parsed.hostname || port < 1 || port > 65535) throw new Error('Invalid proxy host or port');
  if (bypass.length > 2048 || !/^[a-zA-Z0-9.*_:;,\-\[\]/]*$/.test(bypass)) {
    throw new Error('Invalid ABB_PROXY_BYPASS hostname/IP rules');
  }
  return [
    `--proxy-server=${server}`,
    ...(bypass ? [`--proxy-bypass-list=${bypass}`] : []),
    '--disable-quic',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ];
}
