# 质量与体积

给物理老师公开课用的桌面程序，课题是「探究物质的质量与体积的关系」。应用名是「质量与体积」，窗口标题是完整课题名。

老师双击客户端后，程序在局域网里提供页面。学生用平板浏览器扫码填写，不需要安装。

技术栈：Tauri 2、Vue 3、Vite、TypeScript、Tailwind。

## 老师怎么用

1. 打开「质量与体积」。
2. 把窗口上的二维码给学生扫。已经加入的组会实时显示。
3. 分组数量不限，至少 1 组，可以改组名。每组可以增删数据行。
4. 选一组描点，再生成过原点的拟合直线。也可以看所有组的图像，或把各组叠在一张汇总图上。

数据保存在应用数据目录的 `state.json` 里，关掉再打开还在。

第一次打开未签名的 Mac 包，如果系统拦住，右键这个 App，选「打开」。

## 学生怎么加入

平板和老师的电脑连同一个局域网，用浏览器扫教师窗口上的二维码。二维码用的是当前页面自己的地址，学生页在 `/s`。

- 开发时，教师窗口打开 `http://localhost:5174`，学生页是 `http://<局域网 IP>:5174/s`。
- 正式包里，教师窗口打开 `http://127.0.0.1:<端口>/`。服务启动时会打印学生页地址，端口从 3780 起。

## 开发

```bash
npm install
npm run tauri dev
```

Vite 监听 5174（`vite.config.ts` 里 `strictPort: true`，`host: true`）。

## 安装包

本机打包：

```bash
npm run tauri build
```

这台 Apple Silicon 上已经打出的包在 `src-tauri/target/release/bundle/`：

- `macos/质量与体积.app`
- `dmg/质量与体积_0.1.0_aarch64.dmg`

`target` 是本地构建产物，不用放进仓库。

仓库：[github.com/jiangwenyang/mass-volume](https://github.com/jiangwenyang/mass-volume)。推到 `main`，或在 GitHub 上手动运行「构建安装包」，会在 Apple Silicon、Intel Mac 和 Windows 上打包。到该次 Actions 运行底部的 Artifacts 下载。只有推送 `v*` 标签才会发 GitHub Release。
