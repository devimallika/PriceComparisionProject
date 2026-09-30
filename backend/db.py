import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(MONGO_URI)

db = client["price_comparison_db"]

products_collection = db["products"]
price_history_collection = db["price_history"]

print("MongoDB database connection ready")