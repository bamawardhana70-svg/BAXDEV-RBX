FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# yt-dlp versi terbaru (YouTube sering berubah: rebuild image tiap beberapa minggu)
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp
# yt-dlp versi baru butuh JS runtime untuk YouTube
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno
WORKDIR /app
COPY server.mjs .
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
