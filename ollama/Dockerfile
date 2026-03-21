FROM debian:bookworm-slim AS ollama-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl gawk grep sed findutils tar zstd \
    && curl -fsSL https://ollama.com/install.sh | bash \
    && rm -rf /var/lib/apt/lists/*

FROM ollama-base

ARG TTYD_VERSION=1.7.7
# Tự động nhận diện kiến trúc (amd64 hoặc arm64)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini socat openssl openssh-client nodejs npm iputils-ping passwd \
    && ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then TTY_ARCH="x86_64"; else TTY_ARCH="aarch64"; fi && \
    curl -fsSL -o /usr/local/bin/ttyd https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTY_ARCH} \
    && chmod +x /usr/local/bin/ttyd \
    && rm -rf /var/lib/apt/lists/*

COPY autologin.sh /autologin.sh
COPY init-users.sh /init-users.sh
COPY start.sh /start.sh
RUN chmod +x /autologin.sh /init-users.sh /start.sh

# Thiết lập biến môi trường
ENV TINI_KILL_PROCESS_GROUP=1
ENV OLLAMA_HOST=0.0.0.0
ENV WEBTTY_USER=ollama
ENV WEBTTY_PASSWORD=1324

EXPOSE 11434 7681 4040

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/start.sh"]
