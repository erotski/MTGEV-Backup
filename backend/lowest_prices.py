import mysql.connector
from config import DB_CONFIG

def build_lowest_prices():
    mydb = mysql.connector.connect(**DB_CONFIG)
    mycursor = mydb.cursor(buffered=True)

    print("[INFO] Indexing prices table from MTGJSON...")
    try:
        mycursor.execute("CREATE INDEX idx_prices_uuid ON prices (uuid);")
    except Exception:
        pass
    try:
        mycursor.execute("CREATE INDEX idx_prices_source_type ON prices (source(10), priceType(10), provider(20));")
    except Exception:
        pass
    mydb.commit()

    print("[INFO] Building lowest_prices table...")
    mycursor.execute("DROP TABLE IF EXISTS lowest_prices;")
    mycursor.execute("""
        CREATE TABLE lowest_prices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid VARCHAR(36),
            name VARCHAR(255),
            seller VARCHAR(50),
            cardfinish VARCHAR(50),
            price FLOAT,
            INDEX idx_lowest_prices_name (name(100)),
            INDEX idx_lowest_prices_uuid (uuid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    mydb.commit()

    print("[INFO] Computing minimum prices per card name & provider...")
    mycursor.execute("DROP TABLE IF EXISTS tmp_min_prices;")
    mycursor.execute("""
        CREATE TEMPORARY TABLE tmp_min_prices AS
        SELECT c.name, p.provider AS seller, p.finish AS cardfinish, MIN(p.price) AS min_price
        FROM prices p
        INNER JOIN cards c ON c.uuid = p.uuid
        WHERE (p.source = 'paper' OR p.source IS NULL)
          AND (p.priceType = 'retail' OR p.priceType IS NULL)
          AND p.price > 0
        GROUP BY c.name, p.provider, p.finish;
    """)
    mycursor.execute("CREATE INDEX idx_tmp_min ON tmp_min_prices (name(100), seller(20), cardfinish(20));")
    mydb.commit()

    print("[INFO] Populating lowest_prices...")
    mycursor.execute("""
        INSERT INTO lowest_prices (uuid, name, seller, cardfinish, price)
        SELECT p.uuid, t.name, t.seller, t.cardfinish, t.min_price
        FROM tmp_min_prices t
        INNER JOIN cards c ON c.name = t.name
        INNER JOIN prices p ON p.uuid = c.uuid 
                           AND p.provider = t.seller 
                           AND p.finish = t.cardfinish 
                           AND p.price = t.min_price
        GROUP BY t.name, t.seller, t.cardfinish, p.uuid, t.min_price;
    """)
    mydb.commit()

    mycursor.close()
    mydb.close()
    print("[SUCCESS] Lowest prices computed and indexed successfully!")

if __name__ == '__main__':
    build_lowest_prices()

