"use client"

import { useEffect, useId, useState, type KeyboardEvent } from "react"
import { canonicalBusinessCountry, filterCountries, countryName, type CountryOption } from "../lib/countries"
import styles from "./case-intake.module.css"

export type CountryComboboxAppearance = {
  combo?: string
  listbox?: string
  option?: string
  optionActive?: string
  optionEmpty?: string
  clear?: string
}

type CountryComboboxProps = {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  className?: string
  required?: boolean
  appearance?: CountryComboboxAppearance
  clearable?: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

export function CountryCombobox({
  id,
  name = "country",
  value,
  onChange,
  className,
  required,
  appearance,
  clearable = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: CountryComboboxProps) {
  const generatedId = useId()
  const inputId = id || generatedId
  const listId = `${inputId}-listbox`
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const options = filterCountries(editing ? query : "")
  const selectedName = countryName(canonicalBusinessCountry(value) ?? "")
  const display = editing ? query : (selectedName || value)
  const activeOption = open ? options[active] : undefined

  useEffect(() => {
    if (!open || !activeOption) return
    document.getElementById(`${inputId}-option-${activeOption.code}`)?.scrollIntoView?.({ block: "nearest" })
  }, [open, activeOption, inputId])

  function commit(code: string) {
    onChange(code)
    setEditing(false)
    setQuery("")
    setOpen(false)
  }

  function onInput(next: string) {
    setEditing(true)
    setQuery(next)
    setOpen(true)
    setActive(0)
    onChange(canonicalBusinessCountry(next) ?? next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setActive((current) => {
        if (!options.length) return 0
        if (event.key === "ArrowDown") return open ? Math.min(current + 1, options.length - 1) : 0
        return open ? Math.max(current - 1, 0) : options.length - 1
      })
      return
    }
    if (event.key === "Home" && open) {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === "End" && open) {
      event.preventDefault()
      setActive(Math.max(options.length - 1, 0))
      return
    }
    if (event.key === "Enter" && open && activeOption) {
      event.preventDefault()
      commit(activeOption.code)
      return
    }
    if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
      setEditing(false)
      setQuery("")
    }
  }

  const selectedCode = canonicalBusinessCountry(value)
  function clearCountry() {
    onChange("")
    setEditing(false)
    setQuery("")
    setOpen(false)
    setActive(0)
  }

  return (
    <div className={appearance?.combo ?? styles.combo}>
      <input
        id={inputId}
        name={name}
        role="combobox"
        className={className}
        required={required}
        value={display}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${inputId}-option-${activeOption.code}` : undefined}
        autoComplete="country-name"
        onChange={(event) => onInput(event.target.value)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          setEditing(false)
          setQuery("")
        }}
        onKeyDown={onKeyDown}
      />
      {clearable && selectedCode && !editing ? (
        <button type="button" className={appearance?.clear} onClick={clearCountry}>
          Clear country
        </button>
      ) : null}
      {open ? (
        <ul id={listId} role="listbox" aria-label="Countries" className={appearance?.listbox ?? styles.listbox}>
          {options.length ? options.map((country, index) => (
            <CountryOptionRow
              key={country.code}
              country={country}
              inputId={inputId}
              active={index === active}
              onSelect={commit}
              appearance={appearance}
            />
          )) : <li className={appearance?.optionEmpty ?? styles.countryOptionEmpty} role="presentation">No matching country</li>}
        </ul>
      ) : null}
    </div>
  )
}

function CountryOptionRow({
  country,
  inputId,
  active,
  onSelect,
  appearance,
}: {
  country: CountryOption
  inputId: string
  active: boolean
  onSelect: (code: string) => void
  appearance?: CountryComboboxAppearance
}) {
  return (
    <li
      id={`${inputId}-option-${country.code}`}
      role="option"
      aria-selected={active}
      className={active ? (appearance?.optionActive ?? styles.countryOptionActive) : (appearance?.option ?? styles.countryOption)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(country.code)}
    >
      {country.name}
    </li>
  )
}
