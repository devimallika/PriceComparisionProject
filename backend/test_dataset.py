import pandas as pd

file_path = "data/raw/product_price_data.csv"

df = pd.read_csv(file_path)

print("DATASET LOADED SUCCESSFULLY")
print()
print("First 5 rows:")
print(df.head())

print()
print("Dataset shape:")
print(df.shape)

print()
print("Column names:")
print(df.columns.tolist())

print()
print("Data types:")
print(df.dtypes)