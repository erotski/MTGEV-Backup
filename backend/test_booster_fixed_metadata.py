import unittest

from sync_booster_fixed_metadata import extract_fixed_entries


class BoosterFixedMetadataTests(unittest.TestCase):
    def test_extracts_only_explicitly_fixed_sheets(self):
        document = {
            "data": {
                "booster": {
                    "jumpstart": {
                        "sheets": {
                            "infantry1": {"fixed": True},
                            "infantry1Foils": {"fixed": True},
                            "rareMythicWhite": {"fixed": False},
                        }
                    }
                }
            }
        }
        database_sheets = {
            ("BRO", "jumpstart"): {
                "infantry1",
                "infantry1Foils",
                "rareMythicWhite",
            }
        }

        entries, warnings = extract_fixed_entries("BRO", document, database_sheets)

        self.assertEqual(warnings, [])
        self.assertEqual(
            entries["BRO:jumpstart"]["fixedSheets"],
            ["infantry1", "infantry1Foils"],
        )
        self.assertEqual(
            entries["BRO:jumpstart"]["sheetNames"],
            ["infantry1", "infantry1Foils", "rareMythicWhite"],
        )

    def test_reports_sheet_identity_differences(self):
        document = {
            "data": {
                "booster": {
                    "jumpstart": {
                        "sheets": {
                            "theme": {"fixed": True},
                            "jsonOnly": {"fixed": True},
                        }
                    }
                }
            }
        }
        database_sheets = {("TST", "jumpstart"): {"theme", "sqlOnly"}}

        _, warnings = extract_fixed_entries("TST", document, database_sheets)

        self.assertEqual(len(warnings), 2)
        self.assertTrue(any("JSON sheets absent from SQL" in warning for warning in warnings))
        self.assertTrue(any("SQL sheets absent from JSON" in warning for warning in warnings))

    def test_records_booster_with_no_fixed_sheets(self):
        document = {
            "data": {
                "booster": {
                    "draft": {"sheets": {"rare": {"fixed": False}}}
                }
            }
        }
        database_sheets = {("TST", "draft"): {"rare"}}

        entries, warnings = extract_fixed_entries("TST", document, database_sheets)

        self.assertEqual(warnings, [])
        self.assertEqual(
            entries["TST:draft"],
            {"fixedSheets": [], "sheetNames": ["rare"]},
        )


if __name__ == "__main__":
    unittest.main()