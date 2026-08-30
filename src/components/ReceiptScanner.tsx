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

  const runOCR = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true);
    setError(null);
    setStatusMessage('Scanning document...');
    let extractedText = '';
    let worker: any = null;
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
    } catch (e) {
      console.warn('OCR init failed', e);
    } finally {
      if (worker) {
        try { await worker.terminate(); } catch (e) { console.warn('worker terminate failed', e); }
      }
    }
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
    <div className="card p-5 relative overflow-hidden" id="receipt-scanner-root">
      <div className="rainbow-bar !h-1 !rounded-none absolute top-0 left-0 right-0 opacity-60" />
      <div className="absolute -top-10 -left-10 w-24 h-24 bg-[var(--ink)]/5 rounded-full blur-2xl pointer-events-none" />
      
      {/* Title Header — pill + gradient accents */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[var(--ink)] text-[var(--accent-fg)] flex items-center justify-center">
            <FileText size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider flex items-center gap-2">Receipt & Bill Scanner <span className="pill !py-0.5 !px-2 !text-[10px] mono">OCR</span></h4>
            <p className="eyebrow normal-case tracking-normal font-medium">Extract transaction info automatically from images</p>
          </div>
        </div>

        {imagePreview && (
          <button 
            onClick={handleClear}
            className="pill !py-1 !px-2 mono !text-[10px] flex items-center gap-1"
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
              ? 'border-[var(--ink)] bg-[var(--surface-2)] scale-[0.99]' 
              : 'border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={handleFileInputChange}
          />
          <UploadCloud size={28} className="text-[var(--ink-2)] mb-2.5 stroke-[1.5]" />
          <span className="text-xs font-semibold text-[var(--ink)]">Drag & drop your receipt or bill photo</span>
          <span className="text-[10px] text-[var(--ink-2)] mt-1">or click to choose image (JPG, PNG, WEBP)</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Image Preview Container */}
            <div className="md:col-span-5 relative bg-[var(--surface-2)] rounded-xl overflow-hidden border border-[var(--line)] flex items-center justify-center max-h-[220px]">
              <img 
                src={imagePreview} 
                alt="Receipt Preview" 
                className="max-h-[220px] w-auto object-contain"
              />
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[9px] mono text-white flex items-center gap-1 border border-white/10">
                <ImageIcon size={10} /> {mimeType.split('/').pop()?.toUpperCase()}
              </div>
            </div>

            {/* Analysis Action / Results Container */}
            <div className="md:col-span-7 flex flex-col justify-center">
              {!isAnalyzing && !scannedResult && !error && (
                <div className="text-center md:text-left py-2 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--ink)]">Document Image Ready</p>
                    <p className="text-[11px] text-[var(--ink-2)] leading-relaxed mt-0.5">
                      Ready to parse merchant, total amount, date, and category.
                    </p>
                  </div>

                  <button
                    onClick={runOCR}
                    className="w-full sm:w-auto py-2.5 px-5 text-xs flex items-center justify-center gap-2 shadow-sm rounded-full font-bold text-white"
                    style={{ background: 'var(--gradient-card-orange)' }}
                  >
                    <FileText size={13} />
                    Start OCR Scan
                  </button>
                </div>
              )}

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center text-center py-6 space-y-2.5">
                  <Loader2 size={26} className="text-[var(--ink)] animate-spin" />
                  <p className="text-xs font-semibold text-[var(--ink)]">{statusMessage || 'Processing document...'}</p>
                  <p className="text-[10px] text-[var(--ink-2)] italic max-w-xs">Reading numbers, dates, merchant & items</p>
                </div>
              )}

              {error && (
                <div className="p-3.5 bg-[var(--danger-bg)] border border-[var(--danger)]/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-[var(--danger)] font-semibold text-xs">
                    <AlertCircle size={14} />
                    <span>Scan Issue</span>
                  </div>
                  <p className="text-[10.5px] text-[var(--ink-2)] leading-relaxed">{error}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <button 
                      onClick={runOCR}
                      className="text-[10px] mono text-[var(--ink-2)] hover:text-[var(--ink)] underline cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {scannedResult && (
                <div className="space-y-3">
                  <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                        <CheckCircle2 size={13} className="stroke-[2.5]" />
                        <span>Extracted Details</span>
                      </div>
                      <span className="eyebrow flex items-center gap-1">
                        <Edit2 size={9} /> Editable fields below
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] mono">
                      <div>
                        <label className="eyebrow block mb-1">Merchant / Title</label>
                        <input
                          type="text"
                          value={scannedResult.title}
                          onChange={(e) => setScannedResult({ ...scannedResult, title: e.target.value })}
                          className="input text-xs font-medium py-1.5"
                        />
                      </div>

                      <div>
                        <label className="eyebrow block mb-1">Amount ({currency})</label>
                        <input
                          type="number"
                          step="0.01"
                          value={scannedResult.amount}
                          onChange={(e) => setScannedResult({ ...scannedResult, amount: parseFloat(e.target.value) || 0 })}
                          className="input text-xs font-bold py-1.5 text-emerald-600 dark:text-emerald-400"
                        />
                      </div>

                      <div>
                        <label className="eyebrow block mb-1">Date</label>
                        <input
                          type="date"
                          value={scannedResult.date}
                          onChange={(e) => setScannedResult({ ...scannedResult, date: e.target.value })}
                          className="input text-xs py-1.5"
                        />
                      </div>

                      <div>
                        <label className="eyebrow block mb-1">Category</label>
                        <input
                          type="text"
                          value={scannedResult.category}
                          onChange={(e) => setScannedResult({ ...scannedResult, category: e.target.value })}
                          className="input text-xs py-1.5"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="eyebrow block mb-1">Description / Notes</label>
                      <input
                        type="text"
                        value={scannedResult.description}
                        onChange={(e) => setScannedResult({ ...scannedResult, description: e.target.value })}
                        className="input text-xs py-1.5"
                      />
                    </div>
                  </div>

                  <button
                    onClick={applyToForm}
                    className="w-full py-2.5 text-xs flex items-center justify-center gap-1.5 rounded-full font-bold text-white"
                    style={{ background: 'var(--gradient-card-dark)', color: 'white' }}
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
