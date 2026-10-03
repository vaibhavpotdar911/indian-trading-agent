"""Gemini & LLM Quota / Rate Limit Tracker.

Tracks requests per minute (RPM), tokens per minute (TPM), daily requests (RPD),
and active 429 rate-limit cooldown timers.
"""

import time
import threading
from typing import Dict, List, Any


class QuotaTracker:
    """Thread-safe tracker for LLM API rate limits and token usage windows."""

    # Default limits for Gemini Free Tier (Google GenAI)
    DEFAULT_GEMINI_LIMITS = {
        "rpm": 15,          # Requests Per Minute
        "tpm": 1_000_000,   # Tokens Per Minute
        "rpd": 1_500,       # Requests Per Day
    }

    def __init__(self):
        self._lock = threading.Lock()
        self.call_history: List[Dict[str, Any]] = []
        self.last_429_time: float = 0
        self.last_429_cooldown_seconds: int = 30

    def record_call(self, provider: str, model: str, prompt_tokens: int = 0, completion_tokens: int = 0):
        """Record an LLM call with its timestamp and token count."""
        now = time.time()
        total_tokens = prompt_tokens + completion_tokens
        with self._lock:
            self.call_history.append({
                "timestamp": now,
                "provider": provider,
                "model": model,
                "tokens": total_tokens,
            })
            # Keep history under 24 hours
            cutoff = now - 86400
            self.call_history = [c for c in self.call_history if c["timestamp"] > cutoff]

    def record_429(self, provider: str, cooldown_seconds: int = 30):
        """Record a 429 Resource Exhausted rate limit event."""
        with self._lock:
            self.last_429_time = time.time()
            self.last_429_cooldown_seconds = cooldown_seconds

    def get_status(self, provider: str = "google", model: str = "gemini-3.8-flash") -> Dict[str, Any]:
        """Calculate live RPM, TPM, RPD, and readiness status."""
        now = time.time()
        one_min_ago = now - 60
        start_of_day = now - 86400

        with self._lock:
            recent_calls = [c for c in self.call_history if c["timestamp"] > one_min_ago]
            today_calls = [c for c in self.call_history if c["timestamp"] > start_of_day]

            rpm_used = len(recent_calls)
            tpm_used = sum(c["tokens"] for c in recent_calls)
            rpd_used = len(today_calls)

            limits = self.DEFAULT_GEMINI_LIMITS
            rpm_limit = limits["rpm"]
            tpm_limit = limits["tpm"]
            rpd_limit = limits["rpd"]

            # Calculate cooldown remaining
            cooldown_remaining = 0
            if self.last_429_time > 0:
                elapsed_since_429 = now - self.last_429_time
                if elapsed_since_429 < self.last_429_cooldown_seconds:
                    cooldown_remaining = int(self.last_429_cooldown_seconds - elapsed_since_429)

            # Determine overall status
            status = "ready"
            status_message = "Ready for new analysis"

            if cooldown_remaining > 0:
                status = "cooldown"
                status_message = f"Rate limit cooling down ({cooldown_remaining}s remaining)"
            elif rpm_used >= rpm_limit:
                status = "cooldown"
                # Find when the oldest call in the 1-min window expires
                oldest_in_min = min(c["timestamp"] for c in recent_calls)
                wait_sec = max(1, int(60 - (now - oldest_in_min)))
                cooldown_remaining = wait_sec
                status_message = f"RPM limit reached ({rpm_used}/{rpm_limit}). Ready in {wait_sec}s"
            elif tpm_used >= tpm_limit * 0.9:
                status = "warning"
                status_message = f"High token usage ({tpm_used:,} / {tpm_limit:,} TPM)"
            elif rpm_used >= rpm_limit - 3:
                status = "warning"
                status_message = f"Approaching rate limit ({rpm_used}/{rpm_limit} RPM)"

            return {
                "provider": provider,
                "model": model,
                "status": status,
                "status_message": status_message,
                "can_trigger": status == "ready" or status == "warning",
                "rpm_used": rpm_used,
                "rpm_limit": rpm_limit,
                "tpm_used": tpm_used,
                "tpm_limit": tpm_limit,
                "rpd_used": rpd_used,
                "rpd_limit": rpd_limit,
                "cooldown_seconds": cooldown_remaining,
                "last_429_timestamp": self.last_429_time if self.last_429_time > 0 else None,
            }


# Global singleton
quota_tracker = QuotaTracker()
