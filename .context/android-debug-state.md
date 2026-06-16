# Android Bridge Debug State (2026-06-16)

## 项目目标
在 Android 上通过 WebSocket 桥接让 aidian (Obsidian 插件) 连接到 OperitAI 里的 Claude Code CLI。

## 架构
```
Obsidian (aidian 插件)
  ↓ WebSocket (ws://localhost:7869/spawn)
android-bridge/server.py (Python aiohttp, 在 OperitAI 里运行)
  ↓ subprocess stdin/stdout
claude CLI
```

## 设备信息
- 设备: OPPO Pad Mini (OPD2515), Android 16
- WebView: Chrome 149
- OperitAI SSH: root@192.168.8.157 -p 2222
- ADB 已连接 (设备 ID: 6feb9ee8)
- ADB forward: tcp:9222 → localabstract:webview_devtools_remote_<PID>

## 当前状态

### 已完成
1. **androidBridgeSpawn.ts** - BridgeWritable.end() 发送 `end_called` 事件，ws 转发 `{type:'stdin_end'}` 到 bridge
2. **server.py** - 处理 `stdin_end` 关闭 proc.stdin，修复了 asyncio 死锁 (先等 stdout/stderr EOF，再取消 pump_ws)
3. **patch-mobile.js readline stub** - 从简单 dummy 改为功能性实现，修复了 `'\n'` → `'\\n'` 的 SyntaxError
4. `node --check main.js` 通过，`new Function(code)` 通过，`compileScript` 通过
5. **2026-06-16 SyntaxError 已修复** - 根因是 `split('\\n')` 在 patch-mobile.js template literal 中生成了 `split('\n')`，但 Obsidian 的 eval 机制将其中的 `\n` 解释为真实换行符，导致字符串字面量换行 → SyntaxError。修复方案：改用 `String.fromCharCode(10)` 替代 `'\n'`。

### 已解决: 插件 SyntaxError
**根因**: patch-mobile.js 的 readline stub 中 `split('\\n')` 和 os.EOL 中的 `'\\n'`，经 template literal 处理后生成 `'\n'`。虽然 raw 字节正确（`5c 6e`），但 Obsidian 的插件 eval 路径会将 `\n` 转换为真实换行（0x0A），导致单引号字符串跨行 → SyntaxError。
**修复**: 在 patch-mobile.js 中将 `'\\n'` 全部替换为 `String.fromCharCode(10)`。
**部署路径修正**: vault 实际路径是 `/storage/emulated/0/jy-note/`，不是 `/sdcard/obsidian/aidian/`。

## 关键文件

### scripts/patch-mobile.js (已修改)
- readline stub 改为功能性实现 (支持 stream 读取)
- buf.split('\\n') ← 关键修复，模板字面量里要用 \\n 不是 \n

### src/providers/claude/runtime/androidBridgeSpawn.ts (已修改)
- BridgeWritable.end() 发送 'end_called' 事件
- ws.onopen 里监听 'end_called' 并发送 {type:'stdin_end'} 到 bridge

### android-bridge/server.py (已修改，已复制到 aidian/android-bridge/)
- 处理 stdin_end 消息 → 关闭 proc.stdin
- 修复 asyncio 死锁：先等 stdout+stderr EOF，再取消 ws 读取

## SDK 关键细节
- claude CLI 总是以 `--input-format stream-json` 启动
- stdin 消息格式: `{"type":"user","session_id":"","message":{"role":"user","content":[...]},"parent_tool_use_id":null}`
- SDK 在发送消息后调用 `processStdin.end()` → 触发 BridgeWritable.end() → 发送 stdin_end 到 bridge → bridge 关闭 proc.stdin → claude 开始处理
- SDK 用 `readline.createInterface({input: processStdout})` 读取 claude 的输出，async-iterate 每行 JSON

## 部署步骤
```bash
# 在 Mac 上:
cd /Users/chenjingyuan/projects/ai/obsidian-askai-android/aidian
npm run build && node scripts/patch-mobile.js

# 推送到正确 vault 路径 (/storage/emulated/0/jy-note/)
adb push main.js /storage/emulated/0/jy-note/.obsidian/plugins/aidian/main.js
adb push manifest.json /storage/emulated/0/jy-note/.obsidian/plugins/aidian/manifest.json
adb push styles.css /storage/emulated/0/jy-note/.obsidian/plugins/aidian/styles.css

# 查找 Obsidian PID 并设置 CDP:
adb shell ps -ef | grep obsidian
adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>

# 在 OperitAI 里:
pip3 install aiohttp
python3 ~/android-bridge/server.py
# 或者如果代码在 vault 里:
python3 /storage/emulated/0/jy-note/android-bridge/server.py
```

## 下一步
1. 通过 `chrome://inspect/#devices` 直连 DevTools 调试 SyntaxError 根因
2. 尝试: 在 DevTools console 直接 eval 插件代码来获得精确错误信息
3. 考虑简化 readline stub，看是否是特定代码模式触发 WebView 的 bug
4. 或者: 直接在 DevTools 的 Sources 面板查看插件加载时的错误
