from dotenv import load_dotenv
import os

# Load variables from .env
load_dotenv()

config = {
    "supabase_url": os.getenv("SUPABASE_URL"),
    "supabase_key": os.getenv("SUPABASE_KEY"),
    "jwt_secret": os.getenv("JWT_SECRET"),
    "gemini_key": os.getenv("GOOGLE_API_KEY"),
    "azure": {
        "endpoint": os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"),
        "key": os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
    }
}
