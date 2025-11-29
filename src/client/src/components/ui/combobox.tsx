/**
 * Combobox component with autocomplete
 * Simple input with dropdown suggestions
 */

import * as React from "react"
import { Input } from "./input"
import { cn } from "@/lib/utils"

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options?: string[]  // Static options OR results from async search
  onSearch?: (query: string) => void  // Async search callback
  placeholder?: string
  className?: string
  id?: string
  required?: boolean
  autoFocus?: boolean
  onEnter?: () => void
}

export function Combobox({
  value,
  onChange,
  options = [],
  onSearch,
  placeholder,
  className,
  id,
  required,
  autoFocus,
  onEnter,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [filteredOptions, setFilteredOptions] = React.useState<string[]>([])
  const justSelectedRef = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  // Update filtered options when options change (for async search results)
  React.useEffect(() => {
    if (onSearch) {
      // For async search, show options as-is from parent
      setFilteredOptions(options)
      setIsOpen(options.length > 0 && value.length > 0)
    }
  }, [options, onSearch, value])

  // Filter options based on input value or trigger search
  React.useEffect(() => {
    // Don't open if we just selected an option
    if (justSelectedRef.current) {
      justSelectedRef.current = false
      return
    }

    if (!value) {
      setFilteredOptions([])
      setIsOpen(false)
      return
    }

    // Don't show dropdown if value exactly matches an option (user selected it)
    const exactMatch = options.some(option => option.toLowerCase() === value.toLowerCase())
    if (exactMatch) {
      setIsOpen(false)
      return
    }

    // Use onSearch callback if provided, otherwise filter locally
    if (onSearch) {
      onSearch(value)
    } else {
      const filtered = options.filter(option =>
        option.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredOptions(filtered)
      setIsOpen(filtered.length > 0)
    }
  }, [value, options, onSearch])

  // Handle click outside to close dropdown
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelect = (option: string) => {
    justSelectedRef.current = true
    setIsOpen(false)
    onChange(option)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'Enter' && onEnter) {
      e.preventDefault()
      onEnter()
    }
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Input
        ref={inputRef}
        id={id}
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full h-9 text-sm"
        required={required}
        autoFocus={autoFocus}
      />
      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          )}
        >
          {filteredOptions.map((option, index) => (
            <div
              key={index}
              className={cn(
                "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              )}
              onClick={() => handleSelect(option)}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
