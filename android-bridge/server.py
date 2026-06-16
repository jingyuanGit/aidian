#!/usr/bin/env python3
"""
Android bridge server for aidian.

Run inside OperitAI terminal:
  pip3 install aiohttp
  python3 server.py [PORT]

Default port: 7869
The server prepends /sdcard/ to the vault folder name received from the client.
"""
import asyncio
import base64
import json
import os
import signal
import sys

from aiohttp import web, WSMsgType

PREFIX = '/sdcard'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 7869


async def health(request: web.Request) -> web.Response:
    return web.Response(
        text='{"status":"ok"}',
        content_type='application/json',
    )


async def spawn_ws(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    # First message must be the spawn request
    try:
        first = await ws.receive_json()
    except Exception:
        await ws.close(code=4000, message=b'expected json spawn message')
        return ws

    if first.get('type') != 'spawn':
        await ws.close(code=4000, message=b'expected spawn')
        return ws

    vault_path = first.get('vaultPath', '')
    # Strip leading slashes so os.path.join produces /sdcard/<name>
    cwd = os.path.join(PREFIX, vault_path.lstrip('/')) if vault_path else PREFIX
    cmd = first.get('cmd', 'claude')
    args = first.get('args', [])
    # Merge server environment with any client-provided overrides
    env = {**os.environ, **first.get('env', {})}

    print(f'[bridge] spawn: {cmd} {args} cwd={cwd}', flush=True)

    try:
        proc = await asyncio.create_subprocess_exec(
            cmd,
            *args,
            cwd=cwd,
            env=env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except Exception as exc:
        print(f'[bridge] spawn error: {exc}', flush=True)
        if not ws.closed:
            await ws.send_json({'type': 'exit', 'code': -1, 'error': str(exc)})
            await ws.close()
        return ws

    async def pump_stdout() -> None:
        assert proc.stdout is not None
        while True:
            chunk = await proc.stdout.read(4096)
            if not chunk:
                break
            if not ws.closed:
                await ws.send_json({
                    'type': 'stdout',
                    'data': base64.b64encode(chunk).decode(),
                })

    async def pump_stderr() -> None:
        assert proc.stderr is not None
        while True:
            chunk = await proc.stderr.read(4096)
            if not chunk:
                break
            if not ws.closed:
                await ws.send_json({
                    'type': 'stderr',
                    'data': base64.b64encode(chunk).decode(),
                })

    async def pump_ws() -> None:
        assert proc.stdin is not None
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except json.JSONDecodeError:
                    continue
                if data.get('type') == 'stdin':
                    raw = base64.b64decode(data['data'])
                    proc.stdin.write(raw)
                    await proc.stdin.drain()
                elif data.get('type') == 'stdin_end':
                    # SDK called stdin.end() — close pipe so claude processes the message
                    try:
                        proc.stdin.close()
                    except Exception:
                        pass
                elif data.get('type') == 'signal':
                    sig_name = data.get('signal', 'SIGTERM')
                    try:
                        sig = getattr(signal, sig_name)
                        proc.send_signal(sig)
                    except Exception as exc:
                        print(f'[bridge] signal error: {exc}', flush=True)
            elif msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
                break
        # WebSocket closed by client — terminate process
        try:
            proc.kill()
        except Exception:
            pass

    stdout_task = asyncio.ensure_future(pump_stdout())
    stderr_task = asyncio.ensure_future(pump_stderr())
    ws_task = asyncio.ensure_future(pump_ws())

    # Wait for process I/O to complete (stdout+stderr EOF = process exited)
    # or for the WebSocket to close (client disconnected).
    # We must NOT wait for pump_ws after I/O completes — that causes a deadlock
    # because the client is waiting for our exit message while we wait for it to close.
    await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)

    # I/O done (process exited). Cancel the ws reader — no more stdin needed.
    ws_task.cancel()
    try:
        await ws_task
    except (asyncio.CancelledError, Exception):
        pass

    code = await proc.wait()
    print(f'[bridge] process exited with code {code}', flush=True)
    if not ws.closed:
        await ws.send_json({'type': 'exit', 'code': code})
        await ws.close()

    return ws


app = web.Application()
app.router.add_get('/health', health)
app.router.add_get('/spawn', spawn_ws)

if __name__ == '__main__':
    print(f'[bridge] Android bridge listening on 0.0.0.0:{PORT}', flush=True)
    web.run_app(app, host='0.0.0.0', port=PORT, print=None)
