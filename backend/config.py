"""
Global MySQL Database Configuration.
Reads environment variables with fallback defaults to support both local execution and GitHub Actions.
"""
import os

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', 'HaionKala13!'),
    'database': os.getenv('DB_NAME', 'test_for_cards'),
}
