import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, X, UploadCloud, CheckCircle2, 
  AlertCircle, ClipboardCopy, Image as ImageIcon, Zap, FileText, Edit2
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { useNotifications } from '../context/NotificationContext';
import { parseReceiptText, ScannedTransaction } from '../utils/freeOcrParser';

interface ReceiptScannerProps {
  onScanSuccess: (data: {
    transactionType: 'income' | 'expense';
    title: string;
    amount: number;
    date: string;
    category: string;
    description: string;
    bankCharge?: number;
  }) => void;
  currency: string;
}

export default function ReceiptScanner({ onScanSuccess, currency }: ReceiptScannerProps) {
  const { showToast } = useNotifications();
  const [scanEngine, setScanEngine] = useState<'free-ocr' | 'gemini'>('free-ocr');
  const [dragActive, setDragActive] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [scannedResult, setScannedResult] = useState<ScannedTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Please upload an image file (PNG, JPG, WEBP).');
      return;
    }

    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        setImagePreview(e.target.result);
        setError(null);
        setScannedResult(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setImagePreview(null);
    setMimeType('');
    setScannedResult(null);
    setError(null);
    setIsAnalyzing(false);
    setStatusMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Free Local OCR via Tesseract.js
  const runFreeOCR = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true);
    setError(null);
    setStatusMessage('Initializing 100% Free Browser OCR Engine...');

    try {
      const worker = await createWorker('eng');
      setStatusMessage('Extracting text from document pixels...');
      const ret = await worker.recognize(imagePreview);
      await worker.terminate();

      const extractedText = ret.data.text;
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No legible text found in image. Please try a clearer photo or adjust values manually.');
      }

      setStatusMessage('Parsing amounts, date, merchant & category...');
      const parsed = parseReceiptText(extractedText);
      setScannedResult(parsed);
      showToast('success', '100% Free OCR Scan complete! Verify or tweak details below.');
    } catch (err: any) {
      console.error('[Free Local OCR Error]', err);
      const msg = err.message || 'Failed to scan image locally.';
      setError(msg);
      showToast('error', msg);
    } finally {
      setIsAnalyzing(false);
      setStatusMessage('');
    }
  };

  // Gemini Cloud AI Scan (Optional)
  const runGeminiScan = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true);
    setError(null);
    setStatusMessage('Connecting to Gemini Cloud AI...');

    try {
      const response = await fetch('/api/gemini/analyze-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: imagePreview,
          mimeType: mimeType
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setScannedResult(result.data);
        showToast('success', 'Gemini AI analysis complete! Verify details below.');
      } else {
        const errorMsg = result.error || 'Failed to analyze receipt with Gemini.';
        setError(errorMsg);
        showToast('error', errorMsg);
      }
    } catch (err: any) {
      console.error('[Receipt Analysis Client Error]', err);
      setError('Connection failed. Network or server error.');
      showToast('error', 'Network error reaching Gemini endpoint.');
    } finally {
      setIsAnalyzing(false);
      setStatusMessage('');
    }
  };

  const triggerAnalysis = () => {
    if (scanEngine === 'free-ocr') {
      runFreeOCR();
    } else {
      runGeminiScan();
    }
  };

  const applyToForm = () => {
    if (!scannedResult) return;
    onScanSuccess(scannedResult);
    showToast('success', 'Values applied to transaction ledger form!');
    handleClear();
  };

  return (
    <div className="bg-gradient-to-b from-zinc-900/60 to-black/80 border border-[var(--border-primary)] rounded-[24px] p-5 shadow-lg relative overflow-hidden" id="receipt-scanner-root">
      <div className="absolute -top-10 -left-10 w-24 h-24 bg-[var(--accent-primary)]/5 rounded-full blur-2xl pointer-events-none" />
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center border border-[var(--accent-primary)]/20 shadow-inner">
            <Zap size={18} className="text-[var(--accent-primary)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white font-sans uppercase tracking-wider">Receipt & Bill Scanner</h4>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">100% FREE</span>
            </div>
            <p className="text-[10px] text-zinc-400 font-medium">Extract transaction info locally or via cloud AI</p>
          </div>
        </div>

        {/* Engine Switcher */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setScanEngine('free-ocr')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
              scanEngine === 'free-ocr'
                ? 'bg-[var(--accent-primary)] text-slate-950 font-bold shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Zap size={11} />
            Free Local OCR
          </button>

          <button
            type="button"
            onClick={() => setScanEngine('gemini')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
              scanEngine === 'gemini'
                ? 'bg-purple-600 text-white font-bold shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles size={11} />
            Gemini AI
          </button>

          {imagePreview && (
            <button 
              onClick={handleClear}
              className="text-[10px] font-mono text-zinc-400 hover:text-rose-400 flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg transition-all cursor-pointer ml-1"
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Upload Zone / Preview Area */}
      {!imagePreview ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            dragActive 
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 scale-[0.99]' 
              : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/20'
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleFileInputChange}
          />
          <UploadCloud size={28} className="text-[var(--accent-primary)] mb-2.5 stroke-[1.5]" />
          <span className="text-xs font-semibold text-zinc-200">Drag & drop your receipt or bill photo</span>
          <span className="text-[10px] text-zinc-500 mt-1">or click to choose image (JPG, PNG, WEBP)</span>
          <div className="mt-3 flex items-center gap-2 text-[9.5px] font-mono text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <Zap size={10} /> Free mode works instantly with no sign-up or API key!
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Image Preview Container */}
            <div className="md:col-span-5 relative bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center max-h-[220px]">
              <img 
                src={imagePreview} 
                alt="Receipt Preview" 
                className="max-h-[220px] w-auto object-contain"
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/80 rounded text-[9px] font-mono text-zinc-400 flex items-center gap-1 border border-zinc-800">
                <ImageIcon size={10} /> {mimeType.split('/').pop()?.toUpperCase()}
              </div>
            </div>

            {/* Analysis Action / Results Container */}
            <div className="md:col-span-7 flex flex-col justify-center">
              {!isAnalyzing && !scannedResult && !error && (
                <div className="text-center md:text-left py-2 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Document Image Ready</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
                      {scanEngine === 'free-ocr' 
                        ? 'Using 100% Free Local Browser OCR. No external API key required!'
                        : 'Using Gemini Cloud AI vision model.'}
                    </p>
                  </div>

                  <button
                    onClick={triggerAnalysis}
                    className={`w-full sm:w-auto py-2.5 px-5 font-mono text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                      scanEngine === 'free-ocr'
                        ? 'bg-[var(--accent-primary)] hover:brightness-110 text-slate-950 font-bold'
                        : 'bg-purple-600 hover:bg-purple-500 text-white font-bold'
                    }`}
                  >
                    {scanEngine === 'free-ocr' ? <Zap size={13} /> : <Sparkles size={13} />}
                    Start {scanEngine === 'free-ocr' ? 'Free Local OCR' : 'Gemini AI'} Scan
                  </button>
                </div>
              )}

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center text-center py-6 space-y-2.5">
                  <Loader2 size={26} className="text-[var(--accent-primary)] animate-spin" />
                  <p className="text-xs font-semibold text-zinc-200">{statusMessage || 'Processing document...'}</p>
                  <p className="text-[10px] text-zinc-500 italic max-w-xs">Reading numbers, dates, merchant & items</p>
                </div>
              )}

              {error && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                    <AlertCircle size={14} />
                    <span>Scan Issue</span>
                  </div>
                  <p className="text-[10.5px] text-rose-300/90 leading-relaxed">{error}</p>

                  <div className="flex items-center gap-2 pt-1">
                    {scanEngine === 'gemini' && (
                      <button
                        onClick={() => {
                          setScanEngine('free-ocr');
                          setError(null);
                        }}
                        className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg hover:bg-emerald-500/30 transition cursor-pointer flex items-center gap-1"
                      >
                        <Zap size={10} /> Switch to Free Local OCR
                      </button>
                    )}
                    <button 
                      onClick={triggerAnalysis}
                      className="text-[10px] font-mono text-zinc-400 hover:text-white underline cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {scannedResult && (
                <div className="space-y-3">
                  <div className="bg-[#08080c] border border-emerald-950/80 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                        <CheckCircle2 size={13} className="stroke-[2.5]" />
                        <span>Extracted Details</span>
                      </div>
                      <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1">
                        <Edit2 size={9} /> Editable fields below
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div>
                        <label className="text-[9.5px] text-zinc-500 block">Merchant / Title</label>
                        <input
                          type="text"
                          value={scannedResult.title}
                          onChange={(e) => setScannedResult({ ...scannedResult, title: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-white text-xs font-medium focus:border-[var(--accent-primary)] outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[9.5px] text-zinc-500 block">Amount ({currency})</label>
                        <input
                          type="number"
                          step="0.01"
                          value={scannedResult.amount}
                          onChange={(e) => setScannedResult({ ...scannedResult, amount: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-emerald-400 font-bold text-xs focus:border-[var(--accent-primary)] outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[9.5px] text-zinc-500 block">Date</label>
                        <input
                          type="date"
                          value={scannedResult.date}
                          onChange={(e) => setScannedResult({ ...scannedResult, date: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 text-xs focus:border-[var(--accent-primary)] outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[9.5px] text-zinc-500 block">Category</label>
                        <input
                          type="text"
                          value={scannedResult.category}
                          onChange={(e) => setScannedResult({ ...scannedResult, category: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200 text-xs focus:border-[var(--accent-primary)] outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[9.5px] text-zinc-500 block">Description / Notes</label>
                      <input
                        type="text"
                        value={scannedResult.description}
                        onChange={(e) => setScannedResult({ ...scannedResult, description: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-300 text-xs focus:border-[var(--accent-primary)] outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={applyToForm}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <ClipboardCopy size={13} />
                    Auto-Fill Ledger Form
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
