# syntax=docker/dockerfile:1
# 网页部署版：前端打包后嵌进 Rust 服务，运行镜像里只有一个二进制。

FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM rust:1-bookworm AS server
WORKDIR /app
# 目录结构要和仓库一致：web-server 通过相对路径引用 src-tauri/src 和 dist
COPY src-tauri/src/server.rs src-tauri/src/state.rs ./src-tauri/src/
COPY web-server ./web-server
COPY --from=web /app/dist ./dist
WORKDIR /app/web-server
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/web-server/target \
    cargo build --release --locked \
    && cp target/release/physics-lab-web /usr/local/bin/physics-lab-web

FROM debian:bookworm-slim
COPY --from=server /usr/local/bin/physics-lab-web /usr/local/bin/physics-lab-web
ENV DATA_DIR=/data
# 留空时二维码使用老师打开教师页时的地址；需要固定地址时在 compose 里填写
ENV PUBLIC_HOST="home.jwy.life"
VOLUME /data
EXPOSE 3780
CMD ["physics-lab-web"]
