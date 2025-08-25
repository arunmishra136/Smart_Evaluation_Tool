from fastapi import HTTPException
from services.evaluationService import evaluate_exam

def evaluate_exam_controller(pdf_url: str):
    try:
        result = evaluate_exam(pdf_url)
        return {
            "status": "success",
            "data": result,
            "message": "Document analyzed and evaluated successfully"
        }
    except Exception as e:
        print("Controller Error:", str(e))
        raise HTTPException(
            status_code=500,
            detail={
                "error": str(e),
                "message": "Failed to process document. Please check the URL and try again."
            }
        )
