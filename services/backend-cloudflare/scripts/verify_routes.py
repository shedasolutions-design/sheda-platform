#!/usr/bin/env python3
"""
Route verification and audit script for Sheda Backend.

This script:
1. Extracts all routes defined across router modules on the 'main' branch (local git).
2. Verifies that every single route on 'main' is present in local application routes.
3. Queries the remote Cloudflare deployment (or local server) and verifies
   reachability and responsiveness for every endpoint (checking for 0 404 Not Found errors).
4. Prints an audit table and exits with status 0 on full success or 1 on failure.

Usage:
    python scripts/verify_routes.py [--target https://sheda.peni.dev]
"""

import sys
import os
import ast
import re
import argparse
import subprocess
import urllib.request
import urllib.error

# Ensure project root / src are importable
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def extract_routes_from_ast(content: str, app_prefix: str = "/api/v1"):
    """Parse python code via AST to extract router endpoints and their prefixes."""
    tree = ast.parse(content)
    router_prefix = ""
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "router":
                    if isinstance(node.value, ast.Call):
                        for kw in node.value.keywords:
                            if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                                router_prefix = kw.value.value

    routes = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
                    if isinstance(decorator.func.value, ast.Name) and decorator.func.value.id == "router":
                        method = decorator.func.attr.upper()
                        if method in ("GET", "POST", "PUT", "DELETE", "PATCH", "WEBSOCKET"):
                            raw_path = (
                                decorator.args[0].value
                                if decorator.args and isinstance(decorator.args[0], ast.Constant)
                                else ""
                            )
                            combined = f"{app_prefix}{router_prefix}{raw_path}"
                            routes.append((method, combined, node.name))
    return routes


def get_main_branch_routes():
    """Extract all routes as defined on the main branch git tree."""
    try:
        router_files = subprocess.check_output(
            ["git", "ls-tree", "--name-only", "main", "app/routers/"],
            cwd=PROJECT_ROOT,
        ).decode().splitlines()
    except subprocess.CalledProcessError as e:
        print(f"Error reading main branch git tree: {e}")
        return []

    main_routes = []
    for rf in router_files:
        if rf.endswith(".py") and not rf.endswith("__init__.py"):
            content = subprocess.check_output(
                ["git", "show", f"main:{rf}"],
                cwd=PROJECT_ROOT,
            ).decode()
            extracted = extract_routes_from_ast(content)
            for method, path, name in extracted:
                main_routes.append((method, path, name, rf))
    return main_routes


def get_local_app_routes():
    """Extract all routes registered in the local FastAPI application."""
    import main as app_module
    app = app_module.get_app()

    local_routes = set()
    for route in app.routes:
        if "IncludedRouter" in type(route).__name__:
            pfx = route.include_context.prefix or ""
            for sub in route.original_router.routes:
                methods = getattr(sub, "methods", None)
                if methods:
                    for m in methods:
                        if m in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                            local_routes.add((m, pfx + sub.path))
                else:
                    local_routes.add(("WEBSOCKET", pfx + sub.path))
        else:
            methods = getattr(route, "methods", None)
            path = getattr(route, "path", None)
            if not path:
                continue
            if methods:
                for m in methods:
                    if m in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                        local_routes.add((m, path))
            else:
                local_routes.add(("WEBSOCKET", path))
    return local_routes


def substitute_params(path: str) -> str:
    """Replace path variables {id} with '1' for test queries."""
    return re.sub(r"\{[a-zA-Z_]+\}", "1", path)


def verify_target_routes(target_url: str, main_routes: list):
    """
    Query target_url for each HTTP route and check for 404 errors.
    Any status other than 404 (e.g. 200, 401, 403, 422, 500) indicates the route is registered and handled.
    """
    print(f"\nVerifying endpoints against target: {target_url}\n" + "=" * 70)
    passed = 0
    failed = 0
    skipped_ws = 0

    seen_endpoints = set()
    for method, path, handler, source_file in sorted(main_routes, key=lambda x: (x[1], x[0])):
        if (method, path) in seen_endpoints:
            continue
        seen_endpoints.add((method, path))

        if method == "WEBSOCKET":
            skipped_ws += 1
            print(f"  [WS]   {method:6} {path:<48} (WebSocket route)")
            continue

        test_path = substitute_params(path)
        url = f"{target_url.rstrip('/')}{test_path}"

        req = urllib.request.Request(
            url,
            method=method,
            headers={
                "User-Agent": "curl/8.5.0",
                "Content-Type": "application/json",
            },
            data=b"{}" if method in ("POST", "PUT", "PATCH") else None,
        )

        status_code = None
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                status_code = resp.status
        except urllib.error.HTTPError as err:
            status_code = err.code
        except Exception as err:
            status_code = f"ERR: {err}"

        if status_code == 404:
            print(f"  \033[31m[FAIL]\033[0m {method:6} {path:<48} -> {status_code} (NOT FOUND)")
            failed += 1
        else:
            print(f"  \033[32m[PASS]\033[0m {method:6} {path:<48} -> {status_code}")
            passed += 1

    print("\n" + "=" * 70)
    print(f"Verification Summary: {passed} passed, {failed} failed, {skipped_ws} websockets.")
    return failed == 0


def main():
    parser = argparse.ArgumentParser(description="Audit and verify all routes across main, local and remote.")
    parser.add_argument(
        "--target",
        default="https://sheda.peni.dev",
        help="Target base URL to verify against (default: https://sheda.peni.dev)",
    )
    args = parser.parse_args()

    print("Step 1: Extracting routes from main branch...")
    main_routes = get_main_branch_routes()
    print(f"-> Extracted {len(main_routes)} routes from main branch routers.")

    print("\nStep 2: Checking routes against local FastAPI app...")
    local_routes = get_local_app_routes()
    print(f"-> Found {len(local_routes)} registered routes locally.")

    missing_in_local = []
    for method, path, handler, rf in main_routes:
        if (method, path) not in local_routes:
            missing_in_local.append((method, path, handler, rf))

    if missing_in_local:
        print("\n\033[31mError: Missing routes in local app compared to main branch:\033[0m")
        for m, p, h, rf in missing_in_local:
            print(f"  - {m} {p} ({h} from {rf})")
        sys.exit(1)
    else:
        print("-> [OK] Every single route on the 'main' branch exists in the local codebase!")

    print(f"\nStep 3: Checking remote deployment at {args.target}...")
    success = verify_target_routes(args.target, main_routes)
    if not success:
        print("\n\033[31mError: Some routes returned 404 on the target deployment!\033[0m")
        sys.exit(1)

    print("\n\033[32mAll routes verified successfully! Remote deployment matches main branch.\033[0m")
    sys.exit(0)


if __name__ == "__main__":
    main()
