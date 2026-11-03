FROM node:24-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/ArgonTechSolutions/agentic-browser-bridge" \
      org.opencontainers.image.title="Agentic Browser Bridge" \
      org.opencontainers.image.licenses="Apache-2.0"
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium xvfb x11vnc novnc openbox fonts-liberation fonts-noto-color-emoji \
    dbus-x11 tini ca-certificates && rm -rf /var/lib/apt/lists/*
RUN cp -aL /usr/share/novnc /opt/novnc
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY web ./web
COPY scripts/container-entrypoint.sh /usr/local/bin/abb-entrypoint
COPY scripts/browser-process.sh /usr/local/bin/abb-browser
RUN chmod 755 /usr/local/bin/abb-browser
COPY LICENSE NOTICE ./
RUN mkdir -p /data/profile /data/downloads && chown -R node:node /data /app
USER node
ENV HOME=/home/node DISPLAY=:99 ABB_LISTEN=0.0.0.0 ABB_SOCKET=/tmp/abb/control.sock ABB_MANAGED_BROWSER=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/api/status').then(r=>{if(r.status!==401)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/abb-entrypoint"]
