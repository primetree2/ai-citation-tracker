"""Compatibility bridge to the dashboard's single JavaScript parser."""
import json
import subprocess
import sys
from pathlib import Path

CLI = Path(__file__).with_name("parse.cjs")


def parse(raw):
    result = subprocess.run(["node", str(CLI), "-"], input=json.dumps(raw), text=True, capture_output=True)
    if result.returncode:
        raise ValueError(result.stderr.strip())
    return json.loads(result.stdout)["runs"][0]


def _legacy(raw):
    run = parse(raw)
    return run["queries"], run["sources"], run["cited"], run["warnings"]


chatgpt = _legacy
claude = _legacy

if __name__ == "__main__":
    result = subprocess.run(["node", str(CLI), *sys.argv[1:]])
    sys.exit(result.returncode)
