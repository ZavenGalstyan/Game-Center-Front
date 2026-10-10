import { forwardRef, useState, useRef, useEffect, useCallback } from "react";

/**
 * Custom Select component with styled dropdown.
 *
 * @param {object} props
 * @param {Array<{value: string, label: string}>} props.options
 * @param {string} [props.placeholder]
 * @param {"sm" | "md" | "lg"} [props.size="md"]
 * @param {boolean} [props.error=false]
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.fullWidth=false]
 * @param {string} [props.className]
 */
const Select = forwardRef(function Select(
  {
    options = [],
    placeholder,
    size = "md",
    error = false,
    disabled = false,
    fullWidth = false,
    className = "",
    value,
    onChange,
    id,
    required,
    ...rest
  },
  ref
) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [openDirection, setOpenDirection] = useState("down");
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  // Find the selected option
  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || placeholder || "";

  // Combine refs
  const setRefs = useCallback(
    (node) => {
      triggerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  // Calculate dropdown direction based on available space
  const calculateDirection = useCallback(() => {
    if (!triggerRef.current) return "down";
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = Math.min(options.length * 44, 264); // max-height

    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      return "up";
    }
    return "down";
  }, [options.length]);

  // Open dropdown
  const openDropdown = useCallback(() => {
    if (disabled) return;
    setOpenDirection(calculateDirection());
    setIsOpen(true);
    // Set focus to selected item or first item
    const selectedIdx = options.findIndex((opt) => opt.value === value);
    setFocusedIndex(selectedIdx >= 0 ? selectedIdx : 0);
  }, [disabled, calculateDirection, options, value]);

  // Close dropdown
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  // Handle option selection
  const selectOption = useCallback(
    (optionValue) => {
      if (onChange) {
        // Create a synthetic event
        const syntheticEvent = {
          target: { value: optionValue },
          currentTarget: { value: optionValue },
        };
        onChange(syntheticEvent);
      }
      closeDropdown();
    },
    [onChange, closeDropdown]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (disabled) return;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (isOpen) {
            if (focusedIndex >= 0 && focusedIndex < options.length) {
              selectOption(options[focusedIndex].value);
            }
          } else {
            openDropdown();
          }
          break;

        case "Escape":
          if (isOpen) {
            e.preventDefault();
            closeDropdown();
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else {
            setFocusedIndex((prev) =>
              prev < options.length - 1 ? prev + 1 : prev
            );
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (!isOpen) {
            openDropdown();
          } else {
            setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }
          break;

        case "Home":
          if (isOpen) {
            e.preventDefault();
            setFocusedIndex(0);
          }
          break;

        case "End":
          if (isOpen) {
            e.preventDefault();
            setFocusedIndex(options.length - 1);
          }
          break;

        case "Tab":
          if (isOpen) {
            closeDropdown();
          }
          break;

        default:
          break;
      }
    },
    [disabled, isOpen, focusedIndex, options, selectOption, openDropdown, closeDropdown]
  );

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listRef.current) {
      const focusedOption = listRef.current.children[focusedIndex];
      if (focusedOption) {
        focusedOption.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, focusedIndex]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, closeDropdown]);

  // Close on window scroll/resize
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => closeDropdown();
    const handleResize = () => closeDropdown();

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, closeDropdown]);

  const wrapperClasses = [
    "ui-select-wrapper",
    fullWidth && "ui-select-wrapper--block",
  ]
    .filter(Boolean)
    .join(" ");

  const triggerClasses = [
    "ui-select",
    `ui-select--${size}`,
    error && "ui-select--error",
    fullWidth && "ui-select--block",
    isOpen && "ui-select--open",
    disabled && "ui-select--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const listClasses = [
    "ui-select__dropdown",
    openDirection === "up" && "ui-select__dropdown--up",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={containerRef} className={wrapperClasses}>
      {/* Hidden native select for form submission */}
      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="ui-select__hidden"
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Custom trigger button */}
      <button
        ref={setRefs}
        type="button"
        className={triggerClasses}
        onClick={() => (isOpen ? closeDropdown() : openDropdown())}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={error}
        aria-labelledby={id ? `${id}-label` : undefined}
      >
        <span className={`ui-select__value ${!selectedOption ? "ui-select__placeholder" : ""}`}>
          {displayValue}
        </span>
        <svg
          className="ui-select__chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <ul
          ref={listRef}
          className={listClasses}
          role="listbox"
          aria-activedescendant={
            focusedIndex >= 0 ? `${id}-option-${focusedIndex}` : undefined
          }
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isFocused = idx === focusedIndex;

            return (
              <li
                key={opt.value}
                id={`${id}-option-${idx}`}
                role="option"
                aria-selected={isSelected}
                className={[
                  "ui-select__option",
                  isSelected && "ui-select__option--selected",
                  isFocused && "ui-select__option--focused",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => selectOption(opt.value)}
                onMouseEnter={() => setFocusedIndex(idx)}
              >
                <span className="ui-select__option-label">{opt.label}</span>
                {isSelected && (
                  <svg
                    className="ui-select__check"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default Select;
