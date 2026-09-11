import re
with open("backend/populate_booster_ev_to_db.py", "r") as f:
    content = f.read()

old_code = """          # Calculate 100 samples from 5,000 simulations (average of each 50-increment bucket)
          bucket_size = max(1, len(s_arr) // 100)
          quantiles = [
              round(float(np.mean(s_arr[i * bucket_size : (i + 1) * bucket_size])), 2)
              for i in range(100)
          ]"""

new_code = """          # Calculate 100 quantiles from 5,000 simulations (exact 1% quantile buckets)
          n = len(s_arr)
          quantiles = [
              round(float(s_arr[min(n - 1, max(0, int((p / 100.0) * n) - 1))]), 2)
              for p in range(1, 101)
          ]"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("backend/populate_booster_ev_to_db.py", "w") as f:
        f.write(content)
    print("Success")
else:
    print("Could not find old_code")
