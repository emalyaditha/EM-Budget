import React, { useState, useRef } from 'react';
import { 
  Loader2, X, UploadCloud, CheckCircle2, 
  AlertCircle, ClipboardCopy, Image as ImageIcon, FileText, Edit2
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

  // OCR Recognition via Tesseract.js client worker & server fallback
  const runOCR = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true);
    setError(null);
    setStatusMessage('Scanning document...');

    let extractedText = '';
    let worker: any = null;

    // Strategy 1: Try Browser Tesseract Worker
    try {
      worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m && typeof m === 'object' && m.status) {
            const pct = typeof m.progress === 'number' ? ` (${Math.round(m.progress * 100)}%)` : '';
            setStatusMessage(`OCR: ${m.status}${pct}`);
          }
        },
      }).catch(() => null);

      if (worker) {
        setStatusMessage('Extracting text from image pixels...');
        const ret = await worker.recognize(imagePreview).catch(() => null);
        extractedText = ret?.data?.text || '';
      }
    } catch {
      // Browser worker initialization failed, proceed to server fallback
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // ignore termination errors
        }
      }
    }

    // Strategy 2: Fallback to Server-Side OCR Endpoint if client worker produced no text
    if (!extractedText.trim()) {
      try {
        setStatusMessage('Processing scan on OCR server...');
        const response = await fetch('/api/ocr/free-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imagePreview })
        });

        const resData = await response.json().catch(() => null);
        if (response.ok && resData?.success && resData?.text) {
          extractedText = resData.text;
        } else if (resData?.error) {
          throw new Error(resData.error);
        }
      } catch (srvErr: any) {
        console.warn('[Server OCR Fallback error]', srvErr);
      }
    }

    setIsAnalyzing(false);
    setStatusMessage('');

    if (extractedText.trim()) {
      const parsed = parseReceiptText(extractedText);
      setScannedResult(parsed);
      showToast('success', 'OCR Scan complete! Verify or tweak details below.');
    } else {
      const msg = 'No legible text found in image. Please try a clearer photo or enter transaction details manually.';
      setError(msg);
      showToast('error', msg);
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
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center border border-[var(--accent-primary)]/20 shadow-inner">
            <FileText size={18} className="text-[var(--accent-primary)]" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white font-sans uppercase tracking-wider">Receipt & Bill Scanner</h4>
            <p className="text-[10px] text-zinc-400 font-medium">Extract transaction info automatically from images</p>
          </div>
        </div>

        {imagePreview && (
          <button 
            onClick={handleClear}
            className="text-[10px] font-mono text-zinc-400 hover:text-rose-400 flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg transition-all cursor-pointer"
          >
            <X size={10} /> Clear
          </button>
        )}
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
                      Ready to parse merchant, total amount, date, and category.
                    </p>
                  </div>

                  <button
                    onClick={runOCR}
                    className="w-full sm:w-auto py-2.5 px-5 font-mono text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg bg-[var(--accent-primary)] hover:brightness-110 text-slate-950 font-bold"
                  >
                    <FileText size={13} />
                    Start OCR Scan
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
                    <button 
                      onClick={runOCR}
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
