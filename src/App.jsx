import { useState, useRef, useCallback } from 'react';
import Header from './components/Header';
import { detectFileType, convertFile } from './utils/converters';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function App() {
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [targetFormat, setTargetFormat] = useState(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback((selectedFile) => {
    const info = detectFileType(selectedFile);
    setFile(selectedFile);
    setFileInfo(info);
    setTargetFormat(info.outputFormats.length > 0 ? info.outputFormats[0].id : null);
    setResult(null);
    setError(null);
    setProgress(0);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleConvert = async () => {
    if (!file || !targetFormat) return;
    setConverting(true);
    setProgress(0);
    setError(null);
    setResult(null);
    try {
      const res = await convertFile(file, targetFormat, (p) => setProgress(Math.round(p)));
      setResult(res);
      setProgress(100);
    } catch (err) {
      console.error('Conversion failed:', err);
      setError(err.message || 'Conversion failed. Please try again.');
    } finally {
      setConverting(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setFileInfo(null);
    setTargetFormat(null);
    setResult(null);
    setError(null);
    setProgress(0);
  };

  return (
    <>
      <div className="app-bg"></div>
      <Header />

      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">⚡ 100% Client-Side • No Upload</div>
        <h1>
          Convert Any File,{' '}
          <span className="gradient-text">Instantly</span>
        </h1>
        <p>
          Drop your file below — we'll detect the format and show you all available conversion options.
          Everything runs in your browser — fast, private, and free.
        </p>
      </section>

      {/* Main Converter */}
      <div className="converter-section">
        <div className="converter-panel">

          {/* Drop Zone — always visible when no file */}
          {!file && (
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              id="drop-zone"
            >
              <div className="drop-zone-content">
                <div className="drop-zone-icon">📁</div>
                <h3>Drop your file here</h3>
                <p>or <span className="browse-btn">browse</span> to choose a file</p>
                <p className="supported-formats">
                  Supports: JPG, PNG, WEBP, PDF, DOCX, TXT, PPTX
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.pdf,.docx,.txt,.pptx"
                onChange={(e) => e.target.files.length > 0 && handleFile(e.target.files[0])}
                style={{ display: 'none' }}
                id="file-input"
              />
            </div>
          )}

          {/* File detected */}
          {file && fileInfo && (
            <>
              {/* Detected file card */}
              <div className="detected-file">
                <div className="detected-file-header">
                  <span className="detected-icon">{fileInfo.icon}</span>
                  <div className="detected-details">
                    <div className="detected-type">
                      Detected: <strong>{fileInfo.label}</strong>
                    </div>
                    <div className="detected-name">{file.name}</div>
                    <div className="detected-size">{formatFileSize(file.size)}</div>
                  </div>
                  <button className="change-file-btn" onClick={resetAll} title="Change file">
                    ✕
                  </button>
                </div>
              </div>

              {/* Output format selection */}
              {fileInfo.outputFormats.length > 0 ? (
                <div className="format-select-group">
                  <label>Convert to:</label>
                  <div className="format-options">
                    {fileInfo.outputFormats.map((fmt) => (
                      <button
                        key={fmt.id}
                        className={`format-option ${targetFormat === fmt.id ? 'active' : ''}`}
                        onClick={() => setTargetFormat(fmt.id)}
                      >
                        <span className="format-option-icon">{fmt.icon}</span>
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="error-message">
                  ⚠️ Sorry, no conversions are available for this file type.
                </div>
              )}

              {/* Convert Button */}
              {targetFormat && !result && (
                <button
                  className={`convert-btn ${converting ? 'converting' : ''}`}
                  onClick={handleConvert}
                  disabled={converting}
                  id="convert-button"
                >
                  {converting ? (
                    <>
                      <span className="spinner"></span>
                      Converting... {progress}%
                    </>
                  ) : (
                    <>
                      Convert {fileInfo.ext.toUpperCase()} → {targetFormat.toUpperCase()}
                    </>
                  )}
                </button>
              )}

              {/* Progress */}
              {converting && (
                <div className="progress-container">
                  <div className="progress-bar-wrapper">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="progress-text">
                    <span>Processing...</span>
                    <span>{progress}%</span>
                  </div>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className="result-section">
                  <div className="result-header">
                    <span className="check-icon">✅</span>
                    <h3>Conversion Complete!</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Your file <strong>{result.filename}</strong> has been downloaded successfully.
                    {result.pageCount > 1 && ` (${result.pageCount} pages converted)`}
                  </p>
                  <button className="convert-btn" onClick={resetAll}>
                    Convert Another File
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="error-message">⚠️ {error}</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Features */}
      <section className="section" id="features">
        <div className="section-header">
          <h2>Why ConvertFlow?</h2>
          <p>Built for speed, privacy, and simplicity</p>
        </div>
        <div className="conversion-grid">
          <div className="conversion-card" style={{ cursor: 'default' }}>
            <div className="card-content">
              <div className="card-icon">🔒</div>
              <h3>100% Private</h3>
              <p>Your files never leave your browser. No server, no uploads, no tracking.</p>
            </div>
          </div>
          <div className="conversion-card" style={{ cursor: 'default' }}>
            <div className="card-content">
              <div className="card-icon blue">⚡</div>
              <h3>Lightning Fast</h3>
              <p>Instant conversions powered by modern browser APIs. No waiting.</p>
            </div>
          </div>
          <div className="conversion-card" style={{ cursor: 'default' }}>
            <div className="card-content">
              <div className="card-icon cyan">🔄</div>
              <h3>Auto-Detect</h3>
              <p>Drop any file — we automatically detect it and show available formats.</p>
            </div>
          </div>
          <div className="conversion-card" style={{ cursor: 'default' }}>
            <div className="card-content">
              <div className="card-icon green">📱</div>
              <h3>Works Everywhere</h3>
              <p>Desktop, tablet, or phone — works on any modern browser.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>
          Built with ❤️ by <span className="gradient-text">ConvertFlow</span> • All conversions happen in your browser
        </p>
      </footer>
    </>
  );
}

export default App;
