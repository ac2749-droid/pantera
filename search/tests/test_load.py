import json
import tempfile
import unittest
from pathlib import Path

from search.load import Busy, LoadError, Meili, load, read_env, write_env


class FakeMeili:
    def __init__(self, count=3, fail_documents=False, keys=()):
        self.calls, self.tasks, self.keys = [], 0, list(keys)
        self.count, self.fail_documents = count, fail_documents

    def request(self, method, path, body=None, content_type="application/json"):
        self.calls.append((method, path, body, content_type))
        if path.startswith("/tasks/"):
            if self.fail_documents and self.last_write.endswith("/documents"):
                return {"status": "failed", "error": {"code": "bad_document", "message": "nope"}}
            if self.last_write.startswith("/indexes/") and self.last_method == "DELETE":
                return {"status": "failed", "error": {"code": "index_not_found", "message": "none"}}
            return {"status": "succeeded"}
        if path == "/keys?limit=100":
            return {"results": self.keys}
        if path == "/keys":
            return {"key": "new-search-key"}
        if path.startswith("/keys/"):
            return None
        if path == "/indexes/foods/stats":
            return {"numberOfDocuments": self.count}
        if path == "/stats":
            return {"databaseSize": 1234}
        self.tasks += 1
        self.last_write, self.last_method = path, method
        return {"taskUid": self.tasks}


class Load(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.file = Path(tmp.name) / "foods.ndjson"
        self.file.write_text("".join(json.dumps({"id": f"a{i}", "name": "Crème"}) + "\n" for i in range(3)),
                             encoding="utf-8")
        self.env = Path(tmp.name) / ".env"

    def test_loads_in_batches_and_returns_a_search_only_key(self):
        meili = FakeMeili()
        result = load(meili, self.file, batch_size=2, pause=0)
        self.assertEqual(result, {"documents": 3, "databaseSize": 1234, "searchKey": "new-search-key"})
        writes = [(m, p) for m, p, _, _ in meili.calls if m != "GET"]
        self.assertEqual(writes, [("DELETE", "/indexes/foods"), ("POST", "/indexes"),
                                  ("PATCH", "/indexes/foods/settings"), ("POST", "/indexes/foods/documents"),
                                  ("POST", "/indexes/foods/documents"), ("DELETE", "/indexes/words"),
                                  ("POST", "/indexes"), ("PATCH", "/indexes/words/settings"),
                                  ("POST", "/indexes/words/documents"), ("POST", "/keys")])
        words = next(b for _, p, b, _ in meili.calls if p == "/indexes/words/documents")
        self.assertIn(b'"creme"', words)
        docs = [(b, t) for _, p, b, t in meili.calls if p == "/indexes/foods/documents"]
        self.assertEqual([b.count(b"\n") for b, _ in docs], [2, 1])
        self.assertEqual({t for _, t in docs}, {"application/x-ndjson"})
        key = next(b for m, p, b, _ in meili.calls if (m, p) == ("POST", "/keys"))
        self.assertEqual((key["actions"], key["indexes"], key["expiresAt"]), (["search"], ["foods", "words"], None))

    def test_reuses_the_existing_search_key(self):
        meili = FakeMeili(keys=[{"name": "pantera-search", "key": "old-key", "uid": "u1",
                                 "indexes": ["foods", "words"]}])
        self.assertEqual(load(meili, self.file, pause=0)["searchKey"], "old-key")

    def test_replaces_a_search_key_that_cannot_read_every_index(self):
        meili = FakeMeili(keys=[{"name": "pantera-search", "key": "old-key", "uid": "u1", "indexes": ["foods"]}])
        self.assertEqual(load(meili, self.file, pause=0)["searchKey"], "new-search-key")
        self.assertIn(("DELETE", "/keys/u1"), [(m, p) for m, p, _, _ in meili.calls])

    def test_failed_task_raises(self):
        with self.assertRaisesRegex(LoadError, "bad_document"):
            load(FakeMeili(fail_documents=True), self.file, pause=0)

    def test_count_mismatch_raises(self):
        with self.assertRaisesRegex(LoadError, "2 documents"):
            load(FakeMeili(count=2), self.file, pause=0)

    def test_keeps_waiting_when_a_status_check_times_out(self):
        class Slow(FakeMeili):
            busy = 3

            def request(self, method, path, body=None, content_type="application/json"):
                if path.startswith("/tasks/") and self.busy:
                    self.busy -= 1
                    raise Busy("GET /tasks/1: HTTP 408")
                return super().request(method, path, body, content_type)

        self.assertEqual(load(Slow(), self.file, pause=0)["documents"], 3)

    def test_gives_up_on_a_server_that_never_answers(self):
        class Gone(FakeMeili):
            def request(self, method, path, body=None, content_type="application/json"):
                if path.startswith("/tasks/"):
                    raise Busy("Cannot reach Meilisearch")
                return super().request(method, path, body, content_type)

        with self.assertRaisesRegex(LoadError, "Cannot reach"):
            load(Gone(), self.file, pause=0)

    def test_a_request_to_a_closed_port_is_reported_as_retryable(self):
        with self.assertRaises(Busy):
            Meili("http://127.0.0.1:9", "k").request("GET", "/tasks/1")

    def test_env_round_trip(self):
        self.assertEqual(read_env(self.env), {})
        write_env(self.env, {"A": "1", "B": "x=y"})
        self.assertEqual(read_env(self.env), {"A": "1", "B": "x=y"})


if __name__ == "__main__":
    unittest.main()
