"""
models.py — In-memory storage for FCM device tokens.

Each user maps to a list of tokens so that one account can have
multiple devices registered simultaneously.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List


class TokenStore:
    """Thread-safe (asyncio-safe) in-memory FCM token registry."""

    def __init__(self) -> None:
        # { user_id: [token1, token2, ...] }
        self._store: Dict[str, List[str]] = defaultdict(list)

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    def save(self, user_id: str, token: str) -> None:
        """Persist *token* for *user_id*, avoiding duplicates."""
        tokens = self._store[user_id]
        if token not in tokens:
            tokens.append(token)

    def remove(self, user_id: str, token: str) -> None:
        """Remove a single stale token (e.g. FCM returned 404)."""
        try:
            self._store[user_id].remove(token)
        except ValueError:
            pass

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def get_tokens(self, user_id: str) -> List[str]:
        """Return all active tokens for *user_id* (empty list if none)."""
        return list(self._store.get(user_id, []))

    def all_tokens(self) -> List[str]:
        """Flatten every registered token — useful for broadcast."""
        return [t for tokens in self._store.values() for t in tokens]

    def user_count(self) -> int:
        return len(self._store)

    def token_count(self) -> int:
        return sum(len(v) for v in self._store.values())


# ---------------------------------------------------------------------------
# Module-level singleton — import this everywhere
# ---------------------------------------------------------------------------
token_store = TokenStore()
