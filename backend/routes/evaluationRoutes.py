from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl
from controllers.evaluationController import evaluate_exam_controller

router = APIRouter()

class EvaluationRequest(BaseModel):
    pdf_url: HttpUrl

@router.post("/evaluate-exam")
def evaluate_exam_route(request: EvaluationRequest):
    try:
        return evaluate_exam_controller(str(request.pdf_url))  # pass as string directly
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
