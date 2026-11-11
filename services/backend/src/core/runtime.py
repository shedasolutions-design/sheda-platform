"""
Which runtime this process is in.

Cloudflare Python Workers run on Pyodide, CPython compiled to WebAssembly,
whose sys.platform is "emscripten". There is no greenlet there (so no
SQLAlchemy asyncio), no raw sockets for SMTP, and no shared memory between
instances. Code that has to behave differently checks ON_WORKERS.
"""

import sys

ON_WORKERS = sys.platform == "emscripten"
