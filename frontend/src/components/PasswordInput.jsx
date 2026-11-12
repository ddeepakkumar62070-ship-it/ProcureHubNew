import { useState } from 'react';

export default function PasswordInput({ id, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const inputId = id || inputProps.name;
  return (
    <span className="password-input-wrapper">
      <input {...inputProps} id={inputId} type={visible ? 'text' : 'password'} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={inputId}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
            <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.5 0 9 7 9 7a15.7 15.7 0 01-3.1 3.8M6.2 6.2C3.9 7.8 3 12 3 12s3.5 7 9 7a9.9 9.9 0 003.2-.5" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        )}
      </button>
    </span>
  );
}
