import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

mongo_uri = os.getenv("MONGO_URI")

client = MongoClient(mongo_uri)

try:
    client.admin.command("ping")
    print("MONGODB CONNECTION SUCCESSFUL")
except Exception as e:
    print("MONGODB CONNECTION FAILED")
    print(e)
finally:
    client.close()