import logging
from datetime import datetime
from typing import Dict

import psutil

logger = logging.getLogger(__name__)


class SystemCollector:
    @staticmethod
    def collect() -> Dict:
        try:
            cpu_per_core = psutil.cpu_percent(interval=1, percpu=True)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")

            return {
                "timestamp": datetime.now().isoformat(),
                "system": {
                    "cpu": {
                        "percent_per_core": cpu_per_core,
                        "average": sum(cpu_per_core) / len(cpu_per_core),
                        "count": psutil.cpu_count(),
                    },
                    "memory": {
                        "total_gb": round(mem.total / 1024**3, 2),
                        "used_gb": round(mem.used / 1024**3, 2),
                        "percent": mem.percent,
                    },
                    "disk": {
                        "total_gb": round(disk.total / 1024**3, 2),
                        "used_gb": round(disk.used / 1024**3, 2),
                        "percent": disk.percent,
                    },
                },
                "app": {
                    "avg_response_time": 0,  # از backend metrics
                    "error_rate": 0,
                },
            }
        except Exception as exc:
            logger.error("System metrics collection failed: %s", exc)
            return {}
