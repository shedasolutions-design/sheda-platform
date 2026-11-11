"""Admin package.

This project uses FastAdmin registrations declared in `core.admin.fastadmin`.

Important: this package must remain import-safe because importing
`core.admin.seed` (or any `core.admin.*` module) executes this `__init__` first.
"""

# Optional side-effect import to ensure model admin registrations happen when the
# package is imported indirectly.
try:
    from . import admin as _fastadmin  # noqa: F401
except Exception:
    # Admin UI shouldn't prevent the API from starting.
    pass
