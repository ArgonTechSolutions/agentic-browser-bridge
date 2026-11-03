#!/usr/bin/env python3
"""Write a Compose proxy override atomically, without shell/YAML interpolation."""
import ipaddress
import json
import os
import re
import sys
import tempfile
import urllib.parse


def configuration(server, bypass, network):
    if not re.fullmatch(r'(https?|socks5)://([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):[0-9]{1,5}', server):
        raise ValueError('Use one http, https or socks5 host:port URL without credentials')
    url = urllib.parse.urlsplit(server)
    if not url.hostname or not url.port or not 1 <= url.port <= 65535:
        raise ValueError('Invalid proxy host or port')
    if ':' in url.hostname:
        ipaddress.IPv6Address(url.hostname)
    if len(bypass) > 2048 or not re.fullmatch(r'[a-zA-Z0-9.*_:;,\-\[\]/]*', bypass):
        raise ValueError('Invalid bypass rules')
    workspace = {'environment': {'ABB_PROXY_SERVER': server, 'ABB_PROXY_BYPASS': bypass}}
    result = {'services': {'workspace': workspace}}
    if network:
        if not re.fullmatch(r'tsproxy-[0-9]+-[a-z][a-z0-9-]{0,31}_proxy', network):
            raise ValueError('Invalid connector network')
        workspace['networks'] = ['default', 'proxy-connector']
        result['networks'] = {'proxy-connector': {'external': True, 'name': network}}
    return result


if __name__ == '__main__':
    try:
        target, server, bypass, network = sys.argv[1:]
        data = configuration(server, bypass, network)
        with tempfile.NamedTemporaryFile(mode='w', dir=os.path.dirname(target), delete=False) as stream:
            temporary = stream.name
            json.dump(data, stream, indent=2)
            stream.write('\n')
        os.replace(temporary, target)
    except ValueError as error:
        sys.exit(str(error))
