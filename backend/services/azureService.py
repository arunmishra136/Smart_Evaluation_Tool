# services/azure_doc.py
import os
import time
import requests
from dotenv import load_dotenv

# Load env variables
load_dotenv()

AZURE_ENDPOINT = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
AZURE_KEY = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")

def analyze_document(document_url: str):
    try:
        print(f"Analyzing document from URL: {document_url}")

        # Step 0: Download PDF content
        pdf_response = requests.get(document_url)
        if pdf_response.status_code != 200:
            raise Exception(f"Failed to download PDF: {pdf_response.status_code}")

        file_data = pdf_response.content
        print(f"Downloaded PDF, size: {len(file_data)} bytes")

        # Step 1: Submit PDF for analysis
        analyze_url = f"{AZURE_ENDPOINT}formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31"

        headers = {
            "Ocp-Apim-Subscription-Key": AZURE_KEY,
            "Content-Type": "application/pdf"
        }

        print("Submitting PDF for analysis...")
        response = requests.post(analyze_url, headers=headers, data=file_data)

        if response.status_code != 202:
            raise Exception(f"Submit failed: {response.status_code} - {response.text}")

        # Step 2: Get operation location
        operation_location = response.headers.get("operation-location")
        if not operation_location:
            raise Exception("No operation-location header found")

        print("Submitted. Waiting for result...")

        # Step 3: Poll for results
        while True:
            time.sleep(1)  # wait 1 second
            result_response = requests.get(operation_location, headers={
                "Ocp-Apim-Subscription-Key": AZURE_KEY
            })

            result = result_response.json()
            status = result.get("status")
            print(f"Analysis status: {status}")

            if status == "succeeded":
                print("✅ Analysis completed successfully")

                analyze_result = result.get("analyzeResult", {})
                extractedText = analyze_result.get("content", "")
                pages = analyze_result.get("pages", [])
                tables = analyze_result.get("tables", [])

                # Calculate average confidence
                total_confidence = 0
                line_count = 0
                for page in pages:
                    for line in page.get("lines", []):
                        total_confidence += line.get("confidence", 0)
                        line_count += 1
                avg_confidence = total_confidence / line_count if line_count > 0 else 0

                return {
                    "extractedText": extractedText,
                    "pages": len(pages),
                    "tables": len(tables),
                    "confidence": avg_confidence
                }

            elif status == "failed":
                raise Exception("❌ Analysis failed")
            # Otherwise keep polling

    except Exception as e:
        print("Azure Document Analysis Error:", str(e))
        raise Exception(f"Document analysis failed: {str(e)}")
