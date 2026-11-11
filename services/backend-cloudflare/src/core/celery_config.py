"""
Cloudflare Workers native task runner and background job processing.
Provides an async-compatible task decorator and dispatcher with Celery-like interface (.delay, .apply_async)
that works natively with Cloudflare Workers' wait_until and standard asyncio.
"""

import asyncio
import inspect
from typing import Any, Callable, Dict, Optional

from core.logger import get_logger

logger = get_logger(__name__)

# In-memory registry for task execution tracking
_TASK_RESULTS: Dict[str, Dict[str, Any]] = {}
_TASK_COUNTER = 0


def _generate_task_id() -> str:
    global _TASK_COUNTER
    _TASK_COUNTER += 1
    return f"task_{_TASK_COUNTER}"


class AsyncResult:
    """Task execution result matching Celery's AsyncResult interface."""

    def __init__(self, task_id: str, app: Any = None):
        self.id = task_id
        self.app = app

    @property
    def info(self) -> Dict[str, Any]:
        return _TASK_RESULTS.get(self.id, {"status": "PENDING", "result": None})

    @property
    def state(self) -> str:
        return self.info.get("status", "PENDING")

    @property
    def result(self) -> Any:
        return self.info.get("result")

    def ready(self) -> bool:
        return self.state in ("SUCCESS", "FAILURE")

    def successful(self) -> bool:
        return self.state == "SUCCESS"

    def failed(self) -> bool:
        return self.state == "FAILURE"


class WorkerTask:
    """Wrapper around a callable to provide .delay() and .apply_async()."""

    def __init__(self, func: Callable, bind: bool = False, name: Optional[str] = None):
        self.func = func
        self.bind = bind
        self.name = name or func.__name__

    def __call__(self, *args, **kwargs):
        if self.bind:
            return self.func(self, *args, **kwargs)
        return self.func(*args, **kwargs)

    def delay(self, *args, **kwargs) -> AsyncResult:
        return self.apply_async(args=args, kwargs=kwargs)

    def apply_async(
        self,
        args: Optional[tuple] = None,
        kwargs: Optional[dict] = None,
        **options,
    ) -> AsyncResult:
        task_id = _generate_task_id()
        args = args or ()
        kwargs = kwargs or {}

        _TASK_RESULTS[task_id] = {"status": "PENDING", "result": None}

        async def _run():
            try:
                _TASK_RESULTS[task_id]["status"] = "STARTED"
                if self.bind:
                    call_args = (self, *args)
                else:
                    call_args = args

                if inspect.iscoroutinefunction(self.func):
                    res = await self.func(*call_args, **kwargs)
                else:
                    res = self.func(*call_args, **kwargs)

                _TASK_RESULTS[task_id] = {"status": "SUCCESS", "result": res}
            except Exception as exc:
                logger.exception(f"Error executing task {self.name} ({task_id}): {exc}")
                _TASK_RESULTS[task_id] = {"status": "FAILURE", "result": str(exc)}

        # Try to schedule via Cloudflare Workers wait_until or asyncio loop
        try:
            from workers import wait_until
            from pyodide.ffi import create_proxy

            fut = asyncio.ensure_future(_run())
            wait_until(create_proxy(fut))
        except Exception:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(_run())
            except RuntimeError:
                try:
                    asyncio.run(_run())
                except Exception:
                    pass

        return AsyncResult(task_id)


class WorkerTaskApp:
    """Application object providing @app.task() decorator matching Celery API."""

    def __init__(self):
        self.conf = {}

    def task(self, *args, **kwargs):
        bind = kwargs.get("bind", False)
        name = kwargs.get("name")

        def decorator(func: Callable) -> WorkerTask:
            return WorkerTask(func, bind=bind, name=name)

        if args and callable(args[0]):
            return decorator(args[0])
        return decorator

    def autodiscover_tasks(self, *args, **kwargs):
        pass


app = WorkerTaskApp()
