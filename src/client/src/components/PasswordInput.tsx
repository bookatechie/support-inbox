/**
 * Password Input with Generate Button
 * Reusable password input field with password generation
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { validatePassword, type PasswordValidation, generateStrongPassword } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Sparkles, Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  onValidationChange?: (validation: PasswordValidation | null) => void;
}

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder = '••••••••',
  required = false,
  disabled = false,
  autoComplete = 'new-password',
  onValidationChange,
}: PasswordInputProps) {
  const [validation, setValidation] = useState<PasswordValidation | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (value) {
      const result = validatePassword(value);
      setValidation(result);
      onValidationChange?.(result);
    } else {
      setValidation(null);
      onValidationChange?.(null);
    }
  }, [value]);

  const handleGenerate = async () => {
    const newPassword = generateStrongPassword();
    onChange(newPassword);
    setShowPassword(true); // Show the generated password

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(newPassword);
    } catch (err) {
      console.error('Failed to copy password:', err);
    }
  };

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            name={id}
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete}
            required={required}
            disabled={disabled}
            className={validation && !validation.isValid ? 'border-destructive pr-10' : 'pr-10'}
            data-lpignore="true"
            data-form-type="other"
          />
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={disabled}
          className="flex-shrink-0 w-10 h-10 p-0"
          title="Generate password"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>
      {validation && validation.errors.length > 0 && (
        <p className="text-xs text-destructive mt-1">
          {validation.errors.join(', ')}
        </p>
      )}
    </div>
  );
}
