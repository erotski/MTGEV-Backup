"""Global MySQL database configuration from environment variables."""
import os

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': int(os.getenv('DB_PORT', '3306')),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'test_for_cards'),
}

AUDIT_ENABLED = os.getenv('AUDIT_ENABLED', 'false').strip().lower() in ('1', 'true', 'yes', 'on')
QUICK_TEST_SET = os.getenv('QUICK_TEST_SET', '').strip().upper() or None
AUDIT_OUTPUT_DIR = os.getenv('AUDIT_OUTPUT_DIR', 'backend/audit_output')
