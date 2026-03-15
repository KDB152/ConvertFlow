import { useState, useRef, useCallback } from 'react';
import { runConversion } from '../utils/converters';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function FileConverter({ conversion, onBack }) {
  const [files, setFiles] = useState([]);
  const [targetFormat, setTargetFormat] = useState(conversion.toFormats[0]);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles);
    if (conversion.multiple) {
      setFiles(prev => [...prev, ...fileArray]);
    } else {
      setFiles([fileArray[0]]);
    }
    setResult(null);
    setError(null);
  }, [conversion.multiple]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleConvert = async () => {
    if (files.length === 0) return;
    
    setConverting(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const res = await runConversion(
        conversion.id,
        files,
        targetFormat,
        (p) => setProgress(Math.round(p))
      );
      setResult(res);
      setProgress(100);
    } catch (err) {
      console.error('Conversion failed:', err);
      setError(err.message || 'Conversion failed. Please try again.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="converter-section">
      <div className="converter-panel">
        <div className="converter-title">
          <button className="back-btn" onClick={onBack} id="back-button">
            ← Back
          </button>
          <h2>{conversion.icon} {conversion.title}</h2>
        </div>

        {/* Drop Zone */}
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
            <h3>Drop your files here</h3>
            <p>or <span className="browse-btn">browse</span> to choose files</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
              Accepts: {conversion.fromFormats.map(f => f.toUpperCase()).join(', ')}
              {conversion.multiple && ' (multiple files supported)'}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={conversion.acceptTypes}
            multiple={conversion.multiple}
            onChange={(e) => e.target.files.length > 0 && handleFiles(e.target.files)}
            style={{ display: 'none' }}
            id="file-input"
          />
        </div>

        {/* Selected Files */}
        {files.map((file, index) => (
          <div className="file-info" key={`${file.name}-${index}`}>
            <div className="file-info-icon">📄</div>
            <div className="file-info-details">
              <div className="file-info-name">{file.name}</div>
              <div className="file-info-size">{formatFileSize(file.size)}</div>
            </div>
            <button
              className="file-info-remove"
              onClick={() => removeFile(index)}
              title="Remove file"
            >
              ✕
            </button>
          </div>
        ))}

        {/* Target Format Selection */}
        {conversion.toFormats.length > 1 && files.length > 0 && (
          <div className="format-select-group">
            <label>Convert to:</label>
            <div className="format-options">
              {conversion.toFormats.map((format) => (
                <button
                  key={format}
                  className={`format-option ${targetFormat === format ? 'active' : ''}`}
                  onClick={() => setTargetFormat(format)}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Convert Button */}
        {files.length > 0 && !result && (
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
              `Convert to ${targetFormat.toUpperCase()}`
            )}
          </button>
        )}

        {/* Progress Bar */}
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
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>
              Your file <strong>{result.filename}</strong> has been downloaded.
              {result.pageCount > 1 && ` (${result.pageCount} pages)`}
            </p>
            <button className="convert-btn" onClick={() => { setFiles([]); setResult(null); }}>
              Convert Another File
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
      </div>
    </div>
  );
}
