import os
import google.generativeai as genai
from services.azureService import analyze_document
from config.index import config

# Configure Gemini API
genai.configure(api_key=config["gemini_key"])

def create_prompt_template(document_analysis=None, extracted_text=None):
    prompt = f"""
You are an intelligent exam evaluation assistant. Your task is to evaluate student answers from the 
provided answer document based on the questions and their allocated marks from the question document.

Document Analysis:
{document_analysis if document_analysis else "N/A"}

Student's Answers:
{extracted_text if extracted_text else "N/A"}

--- INSTRUCTIONS ---
1. Extract the question, the marks allocated to it, and the student's answer. For multi-part questions (e.g., choices labeled (a), (b), etc.):
   - Extract each sub-question (e.g., part (a), part (b)) along with its allocated marks.
   - Extract the student's answer for each sub-question.
   - Identify if the question requires a diagram and note its presence or absence.
2. Compare the student's answer against the ideal answer (assume you know the ideal answer).
   - For textual answers, evaluate correctness, completeness, and clarity.
   - For diagrams, evaluate accuracy, labeling, and relevance.
3. Provide the following for each question:
   - For single-part questions:
     - A score out of the allocated marks.
     - Suggestions for improvement if the answer isn't perfect.
   - For multi-part questions:
     - Divide the total marks among subparts proportionally.
     - For each sub-question:
       - A score out of the allocated marks.
       - Suggestions for improvement.
       - Diagram evaluation (if applicable).
     - Handle unattempted sub-questions (assign 0, suggest attempting them).
4. At the end, calculate the overall score out of Total Marks and provide summary feedback.

--- RESPONSE FORMAT ---
===START===
Question {{number}} (Marks: {{allocated_marks}})::
[Extracted question]

Student Answer:
[Extracted student answer]

Evaluation:
Score: [Numeric score/{{allocated_marks}}]
Suggestion: [Suggestions or 'None']

If multi-part:
   - Sub-question (a):
     Student Answer: ...
     Evaluation:
       Score: ...
       Diagram Present: [Yes/No] (if required)
       Diagram Evaluation: ...
   - Sub-question (b): ...
     *Note:* [If any sub-question was not attempted]

Overall Score: [Total score/Total Marks]
Suggestion: [General feedback]
===END===
"""
    return prompt




def evaluate_exam(pdf_url: str):
    print(f"Processing exam from URL: {pdf_url}")

    # Step 1: Extract text from PDF via Azure (sync version)
    document_analysis = analyze_document(pdf_url)
    print("DEBUG - Azure returned:", document_analysis)

    extracted_text = document_analysis.get('extractedText', "")
    print(f"Extracted {len(extracted_text)} characters from document")
    print("\n--- Extracted Text Start ---\n")
    print(extracted_text)
    print("\n--- Extracted Text End ---\n")

    # Step 2: Create improved prompt
    prompt = create_prompt_template(document_analysis, extracted_text)

    # Step 3: Call Gemini API (sync)
    model = genai.GenerativeModel('gemini-2.5-flash')
    response = model.generate_content(prompt)  # <- synchronous method
    print("Response from AI: ", response.text)

    return {
        "text_response": response.text,
        "document_analysis": {
            "pages": document_analysis['pages'],
            "tables": document_analysis['tables'],
            "confidence": document_analysis['confidence'],
            "text_length": len(extracted_text)
        }
    }
