import mysql.connector
import json
from config import DB_CONFIG

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor(dictionary=True)
cursor.execute('SELECT quantiles FROM booster_ev_results WHERE set_code = "MH3" AND booster_name = "play" AND vendor = "tcgplayer" AND price_mode = "direct"')
row = cursor.fetchone()
if row and row['quantiles']:
    q = json.loads(row['quantiles'])
    print(f"Len: {len(q)}")
    print(f"Sample: {q[45:55]}")
    print(f"Sample 85-95: {q[85:95]}")
    
    seg = q[49:95]
    diffs = [round(seg[i+1] - seg[i], 2) for i in range(len(seg)-1)]
    print(f"Diffs: {diffs}")
else:
    print("No data found")
