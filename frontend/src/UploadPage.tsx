import React, { useState, useRef, useEffect } from 'react';
import './EvaluationTool.css'
// Resolved the import error by using a CDN link for the ES module.
import { PDFDocument } from "pdf-lib";
import ReactMarkdown from 'react-markdown';
// Resolved the import error by using a CDN link for the ES module.
import jsPDF from "jspdf";
import Loader from "./Loader";

// --- Constants ---
const CLOUD_NAME = "doqn7ijwo";
const PDF_UPLOAD_PRESET = "pdfupload";
const MAX_PDF_SIZE = 10485760; // 10 MB

// --- TypeScript Interfaces ---
interface UserData {
  name: string;
  teacherId: number;
  subject: string;
}

interface ReportCardData {
  text_response: string;
}

interface SubQuestion {
  title: string; // e.g., Definition of human-made ecosystems
  allocated: number; // e.g., 1
  studentAnswer: string; // student's answer for the sub-part
  evaluation: string; // evaluator's feedback for the sub-part
  obtained: number; // score obtained for the sub-part
  total: number; // total possible for the sub-part
}

interface ParsedQuestion {
  questionNumber: number;
  marksTotal: number; // from header (Marks: X)
  prompt: string; // the full question text
  overallStudentAnswer: string; // top-level student's answer before Evaluation:
  subparts: SubQuestion[]; // parsed sub-questions
  overallObtained: number; // from "Overall Score" or sum(subparts)
  overallTotal: number; // from "Overall Score" or marksTotal
  overallSuggestion: string | null; // from "Suggestion:"
  attempted: boolean;
}

const EvaluationTool: React.FC = () => {
  // --- Component State ---
  const [questionPaper, setQuestionPaper] = useState<File | null>(null);
  const [answerSheet, setAnswerSheet] = useState<File | null>(null);
  const [reportCard, setReportCard] = useState<ReportCardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // parsed content & totals
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [totalObtained, setTotalObtained] = useState<number>(0);
  const [totalPossible, setTotalPossible] = useState<number>(0);

  // --- Refs for DOM Elements ---
  const questionPaperRef = useRef<HTMLInputElement | null>(null);
  const answerSheetRef = useRef<HTMLInputElement | null>(null);

  // --- Hardcoded User Data ---
  const userData: UserData = {
    name: 'Arun',
    teacherId: 2,
    subject: 'Science',
  };

  // --- Event Handlers ---
  const handleQuestionPaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setQuestionPaper(e.target.files[0]);
    }
  };

  const handleAnswerSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAnswerSheet(e.target.files[0]);
    }
  };

  // --- PDF Processing Functions ---
  const mergePDFs = async (pdf1: File, pdf2: File): Promise<Blob> => {
    const mergedPdf = await PDFDocument.create();

    const pdf1Bytes = await pdf1.arrayBuffer();
    const pdf2Bytes = await pdf2.arrayBuffer();

    const pdf1Doc = await PDFDocument.load(pdf1Bytes);
    const pdf2Doc = await PDFDocument.load(pdf2Bytes);

    const copiedPagesA = await mergedPdf.copyPages(pdf1Doc, pdf1Doc.getPageIndices());
    copiedPagesA.forEach((page) => mergedPdf.addPage(page));

    const copiedPagesB = await mergedPdf.copyPages(pdf2Doc, pdf2Doc.getPageIndices());
    copiedPagesB.forEach((page) => mergedPdf.addPage(page));

    const mergedPdfBytes = await mergedPdf.save();
    return new Blob([mergedPdfBytes], { type: 'application/pdf' });
  };

  const optimizePdf = async (pdfBlob: Blob): Promise<Blob> => {
    const pdfBytes = await pdfBlob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');

    const optimizedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
    return new Blob([optimizedPdfBytes], { type: 'application/pdf' });
  };

  // --- API Interaction Functions ---
  const uploadToCloudinary = async (mergedPdfBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append('file', mergedPdfBlob);
    formData.append('upload_preset', PDF_UPLOAD_PRESET);
    formData.append('folder', 'documents');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload?resource_type=raw`,
      { method: 'POST', body: formData }
    );
    const data = await response.json();
    if (response.ok && data.secure_url) return data.secure_url;
    throw new Error(data.error?.message || 'Failed to upload PDF to Cloudinary.');
  };

  const sendToBackend = async (pdfUrl: string): Promise<ReportCardData> => {
    const payload = { pdf_url: pdfUrl };
    const response = await fetch(`https://smart-evaluation-tool-rcpu.onrender.com/evaluation/evaluate-exam`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Backend evaluation failed.');
    return data.data;
  };

  // --- Parsing Logic (supports single- or multi-part questions) ---
const parseExtractedInfo = (text: string): ParsedQuestion[] => {
  const out: ParsedQuestion[] = [];

  // Normalize newlines
  const normalized = text.replace(/\r\n?/g, '\n');

  // Split on each Question header
  const blocks = normalized.split(/(?=Question\s+\d+\s*\(Marks:\s*[0-9]+(?:\.[0-9]+)?\)\s*::)/i);

  for (const rawBlock of blocks) {
    const headerMatch = rawBlock.match(/Question\s+(\d+)\s*\(Marks:\s*([0-9]+(?:\.[0-9]+)?)\)\s*::/i);
    if (!headerMatch) continue;

    const questionNumber = parseInt(headerMatch[1], 10);
    const marksTotalFromHeader = parseFloat(headerMatch[2]);

    // Prompt
    let prompt = '';
    const promptMatch = rawBlock.match(/::\s*([\s\S]*?)\n\s*Student\s*Answer:/i);
    if (promptMatch) prompt = promptMatch[1].trim();

    // Overall student's answer (block level)
    let overallStudentAnswer = '';
    const overallAnsMatch = rawBlock.match(/Student\s*Answer:\s*([\s\S]*?)\n\s*Evaluation\s*:/i);
    if (overallAnsMatch) overallStudentAnswer = overallAnsMatch[1].trim();

    // Evaluation section for this block only (stop before Overall Score/Suggestion)
    let evalSection = '';
    const evalStartIdx = rawBlock.search(/\n\s*Evaluation\s*:/i);
    if (evalStartIdx !== -1) {
      const afterEval = rawBlock.slice(evalStartIdx).replace(/^\n?/, ''); // include "Evaluation:" line
      const overallIdx = afterEval.search(/\n\s*Overall\s*Score\s*:/i);
      const suggestionIdx = afterEval.search(/\n\s*Suggestion\s*:/i);
      let endRel = afterEval.length;
      if (overallIdx !== -1) endRel = Math.min(endRel, overallIdx);
      if (suggestionIdx !== -1) endRel = Math.min(endRel, suggestionIdx);
      evalSection = afterEval.slice(0, endRel);
    }

    // Try multi-part headers first (if your AI ever emits them)
    const subparts: SubQuestion[] = [];
    const headerRe = /(^[ \t]*[*-]\s*(.+?)\s*\(Allocated:\s*([0-9]+(?:\.[0-9]+)?)\s*mark[s]?\)\s*:\s*$)/gim;

    const headers: { idx: number; full: string; title: string; allocated: number }[] = [];
    let hm: RegExpExecArray | null;
    while ((hm = headerRe.exec(evalSection)) !== null) {
      headers.push({ idx: hm.index, full: hm[1], title: hm[2].trim(), allocated: parseFloat(hm[3]) });
    }

    if (headers.length > 0) {
      // Multi-part parsing
      for (let i = 0; i < headers.length; i++) {
        const start = headers[i].idx + headers[i].full.length;
        const end = i + 1 < headers.length ? headers[i + 1].idx : evalSection.length;
        const chunk = evalSection.slice(start, end);

        const saMatch = chunk.match(/Student\s*Answer\s*:\s*([\s\S]*?)\n\s*Evaluation\s*:/i);
        const evMatch = chunk.match(/Evaluation\s*:\s*([\s\S]*?)\n\s*Score\s*:/i);
        const scMatch = chunk.match(/Score\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|out of)\s*([0-9]+(?:\.[0-9]+)?)/i);

        const studentAnswer = (saMatch ? saMatch[1] : '').trim().replace(/^"|"$/g, '');
        const evaluation = (evMatch ? evMatch[1] : '').trim();
        const obtained = scMatch ? parseFloat(scMatch[1]) : 0;
        const total = scMatch ? parseFloat(scMatch[2]) : headers[i].allocated;

        subparts.push({
          title: headers[i].title,
          allocated: headers[i].allocated,
          studentAnswer,
          evaluation,
          obtained,
          total,
        });
      }
    } else {
      // Single-part fallback: parse the block's Evaluation section directly
      const saMatch = rawBlock.match(/Student\s*Answer\s*:\s*([\s\S]*?)\n\s*Evaluation\s*:/i);
      const evMatch = evalSection.match(/Evaluation\s*:\s*([\s\S]*?)(?:\n\s*Score\s*:|$)/i);
      const scMatch = evalSection.match(/Score\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|out of)\s*([0-9]+(?:\.[0-9]+)?)/i);

      subparts.push({
        title: 'Overall',
        allocated: scMatch ? parseFloat(scMatch[2]) : (isFinite(marksTotalFromHeader) ? marksTotalFromHeader : 0),
        studentAnswer: (saMatch ? saMatch[1] : overallStudentAnswer).trim(),
        evaluation: (evMatch ? evMatch[1] : '').trim(),
        obtained: scMatch ? parseFloat(scMatch[1]) : 0,
        total: scMatch ? parseFloat(scMatch[2]) : (isFinite(marksTotalFromHeader) ? marksTotalFromHeader : 0),
      });
    }

    // Per-question totals/obtained: from subparts or header, NOT from global "Overall Score"
    const overallObtained = subparts.reduce((s, p) => s + (isFinite(p.obtained) ? p.obtained : 0), 0);
    const overallTotal =
      isFinite(marksTotalFromHeader)
        ? marksTotalFromHeader
        : subparts.reduce((s, p) => s + (isFinite(p.total) ? p.total : 0), 0);

    // Suggestion (block-level, if present)
    const suggestionMatch = rawBlock.match(/Suggestion\s*:\s*([\s\S]*?)$/i);
    const overallSuggestion = suggestionMatch ? suggestionMatch[1].trim() : null;

    const attempted = overallObtained > 0 || subparts.some(p => p.obtained > 0) || !!overallStudentAnswer;

    out.push({
      questionNumber,
      marksTotal: marksTotalFromHeader,
      prompt,
      overallStudentAnswer,
      subparts,
      overallObtained,
      overallTotal,
      overallSuggestion,
      attempted,
    });
  }

  return out;
};


  // --- Effects ---
  useEffect(() => {
  if (reportCard && reportCard.text_response) {
    const parsed = parseExtractedInfo(reportCard.text_response);
    // shallow compare before setting
    setParsedQuestions(prev => {
      return JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed;
    });
  }
}, [reportCard]);


  useEffect(() => {
  const sumObtained = parsedQuestions.reduce((acc, q) => acc + (isFinite(q.overallObtained) ? q.overallObtained : 0), 0);
  const sumPossible = parsedQuestions.reduce((acc, q) => acc + (isFinite(q.overallTotal) ? q.overallTotal : (isFinite(q.marksTotal) ? q.marksTotal : 0)), 0);

  setTotalObtained(prev => prev === sumObtained ? prev : sumObtained);
  setTotalPossible(prev => prev === sumPossible ? prev : sumPossible);
}, [parsedQuestions]);


  // --- PDF Download ---
  const handleDownload = () => {
    const doc = new jsPDF();
    const pageWidth = 210; // A4 width in mm

    // Cover / Summary page
    doc.setFillColor(30, 144, 255);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('Report Card - Summary', pageWidth / 2, 18, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Name: ${userData.name || 'N/A'}`, 20, 35);
doc.text(`Teacher ID: ${userData.teacherId || 'N/A'}`, 20, 42);
doc.text(`Subject: ${userData.subject || 'N/A'}`, 20, 49);
doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 56);


    const tableStartY = 62;
    const colX = [20, 100, 140, 180]; // Q No | Obtained | Total | Status
    const rowH = 8;


    doc.setFillColor(173, 216, 230);
    doc.rect(15, tableStartY, 180, rowH, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text('Question', colX[0], tableStartY + 6);
    doc.text('Obtained', colX[1], tableStartY + 6);
    doc.text('Total', colX[2], tableStartY + 6);
    doc.text('Status', colX[3], tableStartY + 6);

    let y = tableStartY + rowH;
    parsedQuestions.forEach((q, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 245 : 255, 245, 245);
      doc.rect(15, y, 180, rowH, 'F');
      doc.setDrawColor(0);
      doc.rect(15, y, 180, rowH);
      doc.setTextColor(0, 0, 0);
      doc.text(`Q${q.questionNumber}`, colX[0], y + 6);
      doc.text(String(q.overallObtained), colX[1], y + 6);
      doc.text(String(q.overallTotal), colX[2], y + 6);
      doc.text(q.attempted ? 'Attempted' : 'Non-Attempted', colX[3], y + 6);
      y += rowH;
      if (y > 280) { doc.addPage(); y = 20; }
    });

    // Overall total
    const overallX = 15;
    const overallY = y + 5;
    doc.setFillColor(60, 179, 113);
    doc.rect(overallX, overallY, 90, rowH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(`Overall Score: ${totalObtained} / ${totalPossible}`, overallX + 2, overallY + rowH / 2 + 4);

    // Detailed pages per question
    parsedQuestions.forEach((q) => {
      doc.addPage();
      doc.setFillColor(30, 144, 255);
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text(`Question ${q.questionNumber} — ${q.overallObtained} / ${q.overallTotal}`, pageWidth / 2, 18, { align: 'center' });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      let dy = 35;
      doc.text('Prompt:', 15, dy); dy += 6;
      doc.setFontSize(11);
      const promptLines = doc.splitTextToSize(q.prompt || '-', 180);
      promptLines.forEach((line: string) => { doc.text(line, 20, dy); dy += 5; });

      if (q.overallStudentAnswer) {
        dy += 4; doc.setFontSize(12); doc.text("Student's Answer:", 15, dy); dy += 6; doc.setFontSize(11);
        const ansLines = doc.splitTextToSize(q.overallStudentAnswer, 180);
        ansLines.forEach((line: string) => { doc.text(line, 20, dy); dy += 5; });
      }

      // Subparts table header
      dy += 6;
      doc.setFontSize(12);
      doc.setFillColor(220, 220, 220);
      doc.rect(15, dy, 180, rowH, 'F');
      doc.setTextColor(0, 0, 0);
      doc.text('Part', 18, dy + 6);
      doc.text('Obtained', 95, dy + 6);
      doc.text('Total', 125, dy + 6);
      doc.text('Allocated', 155, dy + 6);
      dy += rowH;

      // Subparts rows
      q.subparts.forEach((p, i) => {
  // row
  doc.setFillColor(i % 2 === 0 ? 245 : 255, 245, 245);
  doc.rect(15, dy, 180, rowH, 'F');
  doc.setDrawColor(0);
  doc.rect(15, dy, 180, rowH);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);

  const partTitle = p.title || `Part ${i + 1}`;
  const titleLines = doc.splitTextToSize(partTitle, 70);
  doc.text(titleLines[0], 18, dy + 6);
  doc.text(String(p.obtained), 100, dy + 6);
  doc.text(String(p.total), 130, dy + 6);
  doc.text(String(p.allocated), 160, dy + 6);
  dy += rowH;

  // Student Answer & Feedback paragraphs
  if (p.studentAnswer) {
    const saLines = doc.splitTextToSize(`Student Answer: ${p.studentAnswer}`, 175);
    saLines.forEach((line: string) => {
      doc.text(line, 18, dy + 5);
      dy += 5;
    });
  }
  if (p.evaluation) {
    const evLines = doc.splitTextToSize(`Feedback: ${p.evaluation}`, 175);
    evLines.forEach((line: string) => {
      doc.text(line, 18, dy + 5);
      dy += 5;
    });
  }
  dy += 3;
  if (dy > 270) {
    doc.addPage();
    dy = 20;
  }
});

// Overall Suggestion
if (q.overallSuggestion) {
  dy += 6;
  doc.setFontSize(12);
  doc.text('Overall Feedback:', 15, dy);
  dy += 6;
  doc.setFontSize(11);
  const sugLines = doc.splitTextToSize(q.overallSuggestion, 180);
  sugLines.forEach((line: string) => {
    doc.text(line, 18, dy);
    dy += 5;
  });
}
});

// ✅ Save with template literal
doc.save(`Report_Card_${userData.name || 'Student'}.pdf`);
};

// --- Main evaluation submit ---
const handleEvaluate = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();

  if (!questionPaper || !answerSheet) {
    alert('Please upload both the Question Paper and Answer Sheet.');
    return;
  }

  try {
    setIsLoading(true);
    const merged = await mergePDFs(questionPaper, answerSheet);
    const optimized = await optimizePdf(merged);

    if (optimized.size > MAX_PDF_SIZE) {
      alert(`Optimized PDF is too large (${(optimized.size / (1024 * 1024)).toFixed(2)} MB). Max 10 MB.`);
      return;
    }

    const url = await uploadToCloudinary(optimized);
    const evaluationData = await sendToBackend(url);
    setReportCard(evaluationData);
  } catch (err: any) {
    console.error('Evaluation error:', err);
    alert(err.message || 'Evaluation failed.');
  } finally {
    setIsLoading(false);
    if (questionPaperRef.current) questionPaperRef.current.value = '';
    if (answerSheetRef.current) answerSheetRef.current.value = '';
    setQuestionPaper(null);
    setAnswerSheet(null);
  }
};


  // --- Render ---
  return (
    <div className="evaluation-tool">
      <h1 className="title">Evaluation Tool</h1>

      <form className="upload-form" onSubmit={handleEvaluate}>
        <label className="file-input">
          <input
            type="file"
            accept=".pdf"
            onChange={handleQuestionPaperUpload}
            ref={questionPaperRef}
            required
            disabled={isLoading}
          />
          <span>{questionPaper ? questionPaper.name : 'Upload Question Paper (PDF)'}</span>
        </label>

        <label className="file-input">
          <input
            type="file"
            accept=".pdf"
            onChange={handleAnswerSheetUpload}
            ref={answerSheetRef}
            required
            disabled={isLoading}
          />
          <span>{answerSheet ? answerSheet.name : 'Upload Answer Sheet (PDF)'}</span>
        </label>

        <button type="submit" className="btn" disabled={isLoading}>
          {isLoading ? 'Evaluating...' : 'Evaluate'}
        </button>
      </form>

      {isLoading && <Loader />}

      {reportCard && (
        <div className="report-card">
          {/* Summary Section */}
          <section className="card-section">
            <h2>Report Card — Summary</h2>
            <div className="user-info">
              <p><strong>Name:</strong> {userData.name || 'N/A'}</p>
              <p><strong>Teacher ID:</strong> {userData.teacherId || 'N/A'}</p>
              <p><strong>Subject:</strong> {userData.subject || 'N/A'}</p>
              <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
            </div>

            <table className="score-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Obtained</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedQuestions.map((q) => (
                  <tr key={q.questionNumber}>
                    <td>Q{q.questionNumber}</td>
                    <td>{q.overallObtained}</td>
                    <td>{q.overallTotal}</td>
                    <td>{q.attempted ? 'Attempted' : 'Non-Attempted'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="overall-score">
              <h3>Overall Score: {totalObtained} / {totalPossible}</h3>
            </div>
          </section>

          {/* Detailed Section per Question */}
          {parsedQuestions.map((q) => (
            <section className="card-section" key={q.questionNumber}>
              <h2>Question {q.questionNumber} — {q.overallObtained} / {q.overallTotal}</h2>

              {q.prompt && (
                <div className="question-prompt">
                  <h4>Question</h4>
                  <ReactMarkdown>{q.prompt}</ReactMarkdown>
                </div>
              )}

              {q.overallStudentAnswer && (
                <div className="student-answer">
                  <h4>Student's Answer (Overall)</h4>
                  <ReactMarkdown>{q.overallStudentAnswer}</ReactMarkdown>
                </div>
              )}

              {/* Sub-questions table */}
              {q.subparts.length > 0 && (
                <div className="subparts">
                  <h4>Sub-questions</h4>
                  <table className="score-table sub-table">
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th>Allocated</th>
                        <th>Obtained</th>
                        <th>Total</th>
                        <th>Student Answer</th>
                        <th>Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.subparts.map((p, idx) => (
                        <tr key={idx}>
                          <td>{p.title || `Part ${idx + 1}`}</td>
                          <td>{p.allocated}</td>
                          <td>{p.obtained}</td>
                          <td>{p.total}</td>
                          <td className="wrap"><ReactMarkdown>{p.studentAnswer || '-'}</ReactMarkdown></td>
                          <td className="wrap"><ReactMarkdown>{p.evaluation || '-'}</ReactMarkdown></td>
                        </tr>
                      ))}

                    </tbody>
                  </table>
                </div>
              )}

              {q.overallSuggestion && (
                <div className="overall-suggestion">
                  <h4>Overall Feedback</h4>
                  <ReactMarkdown>{q.overallSuggestion}</ReactMarkdown>
                </div>
              )}
            </section>
          ))}

          {/* Download Button */}
          <button className="btn download-btn" onClick={handleDownload}>
            Download Report Card (PDF)
          </button>
        </div>
      )}
    </div>
  );
};

export default EvaluationTool;