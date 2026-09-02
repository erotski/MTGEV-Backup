import bz2
import os
import subprocess
import urllib.request
from tqdm import tqdm


def download_and_import_mtgjson(
    url: str = 'https://mtgjson.com/api/v5/AllPrintings.sql.bz2',
    db_name: str = 'mtgjson',
    user: str = 'root',
    password: str = 'your_password',
    host: str = 'localhost',
    port: int = 3306,
    chunk_size: int = 2 * 1024 * 1024,  # 2 MB buffer
):
    """Directly streams the remote MTGJSON .sql.bz2 download into MySQL without saving to disk."""
    print('=' * 65)
    print('MTGJSON Direct Streaming & Import')
    print(f'Source URL : {url}')
    print(f'Database   : {db_name} on {host}:{port} (User: {user})')
    print('=' * 65 + '\n')

    # Optimization headers for high-speed MySQL batch execution
    INIT_COMMANDS = (
        b'SET autocommit=0;\n'
        b'SET foreign_key_checks=0;\n'
        b'SET unique_checks=0;\n'
    )
    FINAL_COMMANDS = (
        b'\nCOMMIT;\n'
        b'SET unique_checks=1;\n'
        b'SET foreign_key_checks=1;\n'
        b'SET autocommit=1;\n'
    )

    env = os.environ.copy()
    env['MYSQL_PWD'] = password
    cmd = ['mysql', f'-h{host}', f'-P{port}', f'-u{user}', db_name]

    # Set up HTTP request with User-Agent header (recommended for MTGJSON)
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MTGJSON-Python-Importer'
        )
    }
    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req) as response:
            total_bytes = int(response.headers.get('Content-Length', 0))

            with subprocess.Popen(
                cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, env=env
            ) as process:
                # 1. Inject MySQL speed flags
                process.stdin.write(INIT_COMMANDS)

                decompressor = bz2.BZ2Decompressor()

                with tqdm(
                    total=total_bytes,
                    unit='B',
                    unit_scale=True,
                    unit_divisor=1024,
                    desc='Streaming MTGJSON',
                    ncols=85,
                    dynamic_ncols=False,
                    mininterval=0.5,
                ) as pbar:
                    while chunk := response.read(chunk_size):
                        pbar.update(len(chunk))

                        # Decompress and feed straight to MySQL
                        decompressed = decompressor.decompress(chunk)
                        if decompressed:
                            process.stdin.write(decompressed)

                # 2. Finalize transactions
                process.stdin.write(FINAL_COMMANDS)
                process.stdin.close()

                print(
                    '\n[INFO] Download finished. Finalizing database tables & indices...'
                )
                _, stderr = process.communicate()

                if process.returncode != 0:
                    raise RuntimeError(
                        f'MySQL error:\n{stderr.decode("utf-8", errors="replace")}'
                    )

        print('\n[SUCCESS] MTGJSON database successfully updated!')

    except Exception as e:
        print(f'\n[ERROR] Process failed:\n{e}')
        raise


if __name__ == '__main__':
    download_and_import_mtgjson(
        url='https://mtgjson.com/api/v5/AllPrintings.sql.bz2',
        db_name='test_for_cards',  # Name of your MTG database
        user='root',
        password='HaionKala13!',
        host='127.0.0.1',
        port=3306,
    )