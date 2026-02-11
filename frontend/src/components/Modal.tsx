import { type ReactNode } from "react";
import { LuX } from "react-icons/lu";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function Modal({ isOpen, onClose, title, children, maxWidth = "md" }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h3 className="text-xl font-bold text-neutral-950">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 bg-primary-100 hover:bg-primary-200 rounded-lg transition-colors"
          >
            <LuX className="w-5 h-5 text-neutral" />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}

interface ModalSectionProps {
  title?: string;
  children: ReactNode;
}

export function ModalSection({ title, children }: ModalSectionProps) {
  return (
    <div className="space-y-4">
      {title && (
        <h4 className="text-sm font-medium text-neutral-950 mt-4">{title}</h4>
      )}
      {children}
    </div>
  );
}

interface ModalInputProps {
  type?: "text" | "email" | "password" | "tel" | "number";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  pattern?: string;
  title?: string;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email";
}

export function ModalInput({
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  minLength,
  maxLength,
  disabled,
  className = "",
  pattern,
  title,
  inputMode,
}: ModalInputProps) {
  // For phone fields, only allow numbers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === "tel") {
      // Only allow digits, plus sign, and common phone characters
      const value = e.target.value.replace(/[^0-9+\-()\s]/g, "");
      onChange(value);
    } else {
      onChange(e.target.value);
    }
  };

  return (
    <input
      type={type}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      maxLength={maxLength}
      disabled={disabled}
      pattern={pattern}
      title={title}
      inputMode={type === "tel" ? "tel" : inputMode}
      className={`w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 placeholder:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary transition-all ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    />
  );
}

interface ModalSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  className?: string;
}

export function ModalSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled,
  className = "",
}: ModalSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-900 appearance-none focus:outline-none focus:ring-2 focus:ring-primary transition-all ${!value ? "text-neutral-900" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="w-5 h-5 text-neutral-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

interface ModalToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

export function ModalToggle({ label, checked, onChange, description }: ModalToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm font-medium text-neutral">{label}</span>
        {description && (
          <span className="text-sm text-neutral-900 ml-2">{description}</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-neutral-100"
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-1" : "translate-x-[-1.25rem]"
          }`}
        />
      </button>
    </div>
  );
}

interface ModalButtonsProps {
  onCancel: () => void;
  onSubmit?: () => void;
  cancelText?: string;
  submitText?: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}

export function ModalButtons({
  onCancel,
  onSubmit,
  cancelText = "Cancel",
  submitText = "Add",
  loading = false,
  loadingText = "Loading...",
  disabled = false,
  type = "submit",
}: ModalButtonsProps) {
  return (
    <div className="flex gap-3 mt-6">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 px-4 py-3.5 border-2 border-primary text-primary rounded-xl font-semibold hover:bg-neutral-100 transition-colors"
      >
        {cancelText}
      </button>
      <button
        type={type}
        onClick={type === "button" ? onSubmit : undefined}
        disabled={loading || disabled}
        className="flex-1 px-4 py-3.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? loadingText : submitText}
      </button>
    </div>
  );
}

interface ModalErrorProps {
  message: string | null;
}

export function ModalError({ message }: ModalErrorProps) {
  if (!message) return null;
  
  return (
    <div className="bg-negative-200 border border-negative-950 rounded-xl p-4 flex items-center gap-3">
      <div className="w-5 h-5 rounded-full bg-negative flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">!</span>
      </div>
      <p className="text-sm text-negative-950">{message}</p>
    </div>
  );
}
