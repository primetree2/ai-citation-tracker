"""Local-only smoke test for the explicit loopback launcher."""
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

root = Path(__file__).resolve().parent.parent
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
process = subprocess.Popen([sys.executable, str(root / 'runner/serve.py'), '--port', str(port), '--no-open'], cwd=root.parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    for _ in range(50):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/site/index.html', timeout=1) as response:
                content = response.read().decode()
                assert 'Watch this chat' in content
                assert 'chat-watcher.js' in content
                break
        except OSError:
            time.sleep(.1)
    else:
        raise RuntimeError('Local server did not start')
finally:
    process.terminate()
    stdout, stderr = process.communicate(timeout=5)
assert f'http://127.0.0.1:{port}/' in stdout, stdout
print('PASS explicit loopback launcher serves the project from any working directory')
