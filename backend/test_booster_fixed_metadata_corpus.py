import json
import tempfile
import unittest
from pathlib import Path

from sync_booster_fixed_metadata import build_overlay_from_corpus


class BoosterFixedMetadataCorpusTests(unittest.TestCase):
    def test_corpus_mode_includes_fixed_and_variable_sheet_names(self):
        payload = {
            "data": {
                "TST": {
                    "booster": {
                        "jumpstart": {
                            "sheets": {
                                "theme": {"fixed": True},
                                "rare": {"fixed": False},
                            }
                        }
                    }
                }
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "AllPrintings.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            overlay = build_overlay_from_corpus(path)

        self.assertEqual(overlay["fixedSheetCount"], 1)
        self.assertEqual(
            overlay["entries"]["TST:jumpstart"],
            {"fixedSheets": ["theme"], "sheetNames": ["rare", "theme"]},
        )


if __name__ == "__main__":
    unittest.main()