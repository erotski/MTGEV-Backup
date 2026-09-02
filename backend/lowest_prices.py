import mysql.connector
from config import DB_CONFIG

def build_lowest_prices():
    mydb = mysql.connector.connect(**DB_CONFIG)
    mycursor = mydb.cursor(buffered=True)

    mycursor.execute("DROP TABLE IF EXISTS prices;")
    mycursor.execute("CREATE TABLE prices (id int AUTO_INCREMENT PRIMARY KEY, uuid VARCHAR(36), gametype TEXT, seller TEXT, cardfinish TEXT, sellertype TEXT, date VARCHAR(100), price FLOAT, name VARCHAR(200))")

    mycursor.execute("DROP TABLE IF EXISTS lowest_prices;")
    mycursor.execute("CREATE TABLE lowest_prices LIKE prices")
    mycursor.execute("CREATE INDEX idx_lowest_prices_name ON lowest_prices (name)")
    mydb.commit()

    # card_prices_today (from MTGJSON's AllPricesToday.sql dump) is already USD-normalized,
    # so prices/lowest_prices can be built with one INSERT...SELECT instead of parsing JSON.
    mycursor.execute(
        "INSERT INTO prices (uuid, gametype, seller, cardfinish, sellertype, date, price, name) "
        "SELECT cpt.uuid, 'paper', cpt.seller, cpt.card_finish, cpt.price_type, CURDATE(), cpt.price, c.name "
        "FROM card_prices_today cpt "
        "INNER JOIN cards c ON c.uuid = cpt.uuid "
        "WHERE cpt.price > 0"
    )
    mydb.commit()

    mycursor.execute(
        "INSERT INTO lowest_prices (uuid, seller, cardfinish, price, name) "
        "SELECT p.uuid, p.seller, p.cardfinish, p.price, p.name "
        "FROM prices p "
        "INNER JOIN ("
        " SELECT name, seller, MIN(price) AS MinPrice "
        " FROM prices "
        " WHERE sellertype = 'retail' AND gametype = 'paper' "
        " GROUP BY seller, name"
        ") t ON p.seller = t.seller AND p.price = t.MinPrice AND p.name = t.name"
    )
    mydb.commit()

    mycursor.close()
    mydb.close()
    print("[SUCCESS] Lowest prices computed and indexed successfully!")

if __name__ == '__main__':
    build_lowest_prices()
