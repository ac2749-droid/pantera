"""Fill the local Meilisearch from foods.ndjson and save a search-only key to search/.env."""

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from search.settings import index_settings, words_settings
from search.vocabulary import vocabulary

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:7700"
INDEX = "foods"
WORDS = "words"
KEY_NAME = "pantera-search"
BATCH = 20_000
BUSY_STATUS = (408, 429, 502, 503, 504)
MAX_BUSY = 120  # status checks in a row that may fail while the server is busy indexing


class LoadError(Exception):
    pass


class Busy(LoadError):
    """No usable answer; asking again may work."""


class Meili:
    def __init__(self, url: str, key: str):
        self.url, self.key = url, key

    def request(self, method: str, path: str, body=None, content_type: str = "application/json"):
        data = body if body is None or isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.key}", "Content-Type": content_type}
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                return json.loads(res.read() or b"null")
        except urllib.error.HTTPError as e:
            kind = Busy if e.code in BUSY_STATUS else LoadError
            raise kind(f"{method} {path}: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:300]}") from e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            reason = getattr(e, "reason", e)
            raise Busy(f"Cannot reach Meilisearch at {self.url}: {reason}. Is start.ps1 running?") from e


def read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    return dict(line.split("=", 1) for line in lines if "=" in line and not line.startswith("#"))


def write_env(path: Path, values: dict[str, str]) -> None:
    path.write_text("".join(f"{k}={v}\n" for k, v in values.items()), encoding="utf-8")


def _batches(path: Path, size: int):
    batch = []
    with path.open("rb") as f:
        for line in f:
            if line.strip():
                batch.append(line.rstrip(b"\r\n") + b"\n")
            if len(batch) == size:
                yield batch
                batch = []
    if batch:
        yield batch


def _wait(meili, task: dict, pause: float, ignore: str | None = None) -> None:
    busy = 0
    while True:
        try:
            state = meili.request("GET", f"/tasks/{task['taskUid']}")
        except Busy:
            busy += 1
            if busy >= MAX_BUSY:
                raise
            time.sleep(pause)
            continue
        busy = 0
        if state["status"] == "succeeded":
            return
        if state["status"] in ("failed", "canceled"):
            error = state.get("error") or {}
            if ignore and error.get("code") == ignore:
                return
            raise LoadError(f"Task {task['taskUid']} {state['status']}: {error.get('code')} {error.get('message')}")
        time.sleep(pause)


def _rebuild(meili, index: str, settings: dict, batches, pause: float) -> int:
    """Recreate an index from scratch; indexes only ever hold data derived from the downloads."""
    _wait(meili, meili.request("DELETE", f"/indexes/{index}"), pause, ignore="index_not_found")
    _wait(meili, meili.request("POST", "/indexes", {"uid": index, "primaryKey": "id"}), pause)
    _wait(meili, meili.request("PATCH", f"/indexes/{index}/settings", settings), pause)
    sent = 0
    for batch in batches:
        task = meili.request("POST", f"/indexes/{index}/documents", b"".join(batch), "application/x-ndjson")
        _wait(meili, task, pause)
        sent += len(batch)
        print(f"{index}: indexed {sent}", flush=True)
    return sent


def _word_batches(ndjson: Path, size: int):
    batch = []
    for word in vocabulary(ndjson):
        batch.append(json.dumps(word, ensure_ascii=False).encode("utf-8") + b"\n")
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def _search_key(meili) -> str:
    wanted = [INDEX, WORDS]
    keys = meili.request("GET", "/keys?limit=100")["results"]
    for key in keys:
        if key.get("name") == KEY_NAME:
            if sorted(key.get("indexes") or []) == sorted(wanted):
                return key["key"]
            meili.request("DELETE", f"/keys/{key['uid']}")  # a key's indexes cannot be changed
    return meili.request("POST", "/keys", {
        "name": KEY_NAME, "description": "Search only", "actions": ["search"], "indexes": wanted, "expiresAt": None,
    })["key"]


def load(meili, ndjson: Path, batch_size: int = BATCH, pause: float = 1.0) -> dict:
    sent = _rebuild(meili, INDEX, index_settings(), _batches(ndjson, batch_size), pause)
    count = meili.request("GET", f"/indexes/{INDEX}/stats")["numberOfDocuments"]
    if count != sent:
        raise LoadError(f"Index holds {count} documents, expected {sent}")
    _rebuild(meili, WORDS, words_settings(), _word_batches(ndjson, batch_size), pause)
    key = _search_key(meili)
    size = meili.request("GET", "/stats")["databaseSize"]
    return {"documents": count, "databaseSize": size, "searchKey": key}


def main() -> int:
    env_path = ROOT / ".env"
    env = read_env(env_path)
    ndjson = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "foods.ndjson"
    if "MEILI_MASTER_KEY" not in env:
        print("No master key. Run search/start.ps1 first.", file=sys.stderr)
        return 1
    started = time.time()
    try:
        result = load(Meili(URL, env["MEILI_MASTER_KEY"]), ndjson)
    except (LoadError, OSError) as e:
        print(e, file=sys.stderr)
        return 1
    write_env(env_path, {**env, "MEILI_SEARCH_KEY": result["searchKey"]})
    print(f"{result['documents']} documents, database {result['databaseSize'] / 1e9:.2f} GB, "
          f"{(time.time() - started) / 60:.1f} minutes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
