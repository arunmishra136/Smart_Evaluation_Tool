from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Import your route modules
from routes import evaluationRoutes

load_dotenv()

app = FastAPI(docs_url="/docs", redoc_url="/redoc")

# CORS settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://smart-evaluation-tool-rcpu.onrender.com",
        "http://127.0.0.1:8000",
        ],  # not recommended for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Connect your routers
app.include_router(evaluationRoutes.router, prefix="/evaluation", tags=["Evaluation"])

@app.get("/")
def read_root():
    return {"message": "Hello, Fast"}
