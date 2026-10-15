# syntax=docker/dockerfile:1
FROM denoland/deno:bin-2.9.7 AS deno

FROM node:24.22.0-bookworm-slim

ARG TARGETARCH
ARG YTDLP_VERSION=2026.08.19
# From https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/SHA2-256SUMS
ARG YTDLP_SHA256_AMD64=58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a
ARG YTDLP_SHA256_ARM64=b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp's standalone build, pinned and checksum-verified.
RUN set -eu; \
  case "$TARGETARCH" in \
    amd64) asset=yt-dlp_linux; sha="$YTDLP_SHA256_AMD64" ;; \
    arm64) asset=yt-dlp_linux_aarch64; sha="$YTDLP_SHA256_ARM64" ;; \
    *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
  esac; \
  curl -fsSL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${asset}"; \
  echo "${sha}  /usr/local/bin/yt-dlp" | sha256sum -c -; \
  chmod 755 /usr/local/bin/yt-dlp

# yt-dlp runs YouTube's player JavaScript in Deno's sandbox.
COPY --from=deno /deno /usr/local/bin/deno

WORKDIR /usr/src/yas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

ENV NODE_ENV=production \
    PORT=8080 \
    YAS_CACHE_DIR=/tmp/yas-cache \
    XDG_CACHE_HOME=/tmp/cache \
    DENO_DIR=/tmp/deno

# CLI downloads land in /downloads, which the unprivileged user can write to.
RUN mkdir /downloads && chown node:node /downloads
WORKDIR /downloads

# Run unprivileged; with a read-only root filesystem, only /tmp needs to be writable:
#   docker run --read-only --tmpfs /tmp -p 8080:8080 youtube-audio-server
USER node
EXPOSE 8080
ENTRYPOINT ["node", "/usr/src/yas/src/bin.js"]
