import bz2
import os
import subprocess
import urllib.request
from tqdm import tqdm


from config import DB_CONFIG


def download_prices_today(
    url: str = 'https://mtgjson.com/api/v5/AllPricesToday.sql.bz2',
    host: str = DB_CONFIG['host'],
    user: str = DB_CONFIG['user'],
    password: str = DB_CONFIG['password'],
    database: str = DB_CONFIG['database'],
    port: int = DB_CONFIG['port'],
    chunk_size: int = 2 * 1024 * 1024,  # 2 MB buffer
):
    """Streams MTGJSON's AllPricesToday.sql.bz2 directly into MySQL (table `card_prices_today`)."""
    print('=' * 65)
    print('MTGJSON AllPricesToday Direct Streaming & Import')
    print(f'Source URL : {url}')
    print(f'Database   : {database} on {host}:{port} (User: {user})')
    print('=' * 65 + '\n')

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
    # --force: MTGJSON's dump occasionally has a broken statement (e.g. a
    # TEXT/BLOB column used in a key without a prefix length) buried deep in
    # the file; skip just that statement instead of aborting the whole import.
    cmd = ['mysql', f'-h{host}', f'-P{port}', f'-u{user}', '--force', database]

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
                process.stdin.write(INIT_COMMANDS)
                decompressor = bz2.BZ2Decompressor()

                with tqdm(
                    total=total_bytes,
                    unit='B',
                    unit_scale=True,
                    unit_divisor=1024,
                    desc='Streaming AllPricesToday',
                    ncols=85,
                    mininterval=0.5,
                ) as pbar:
                    while chunk := response.read(chunk_size):
                        pbar.update(len(chunk))
                        decompressed = decompressor.decompress(chunk)
                        if decompressed:
                            process.stdin.write(decompressed)

                process.stdin.write(FINAL_COMMANDS)
                process.stdin.close()

                print('\n[INFO] Finalizing and committing price tables...')
                _, stderr = process.communicate()

                if process.returncode != 0:
                    # --force lets mysql skip broken statements and keep going,
                    # but it can still exit non-zero after logging errors along
                    # the way. Warn instead of aborting the whole pipeline.
                    print(
                        '\n[WARN] mysql reported errors (some statements were'
                        ' skipped via --force):\n'
                        f'{stderr.decode("utf-8", errors="replace")}'
                    )

        print('\n[SUCCESS] card_prices_today updated!')

    except Exception as e:
        print(f'\n[ERROR] Price update failed:\n{e}')
        raise


if __name__ == '__main__':
    download_prices_today()
