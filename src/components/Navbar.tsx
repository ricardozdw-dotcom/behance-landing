import { useRef, useState } from 'react'

const EGG_THRESHOLD = 3

export function Navbar() {
  const clicks = useRef(0)
  const timer = useRef(0)
  const [egg, setEgg] = useState(false)

  const onLogoClick = (event: React.MouseEvent) => {
    event.preventDefault()
    clicks.current += 1
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      clicks.current = 0
    }, 600)
    if (clicks.current >= EGG_THRESHOLD) {
      clicks.current = 0
      setEgg(true)
      window.setTimeout(() => setEgg(false), 1400)
    }
  }

  return (
    <header className="navbar" aria-label="Site header">
      <a
        className={`navbar-brand${egg ? ' is-egg' : ''}`}
        href="#"
        data-cursor=""
        onClick={onLogoClick}
      >
        <img
          className="navbar-logo"
          src={`${import.meta.env.BASE_URL}behance-mark.svg`}
          alt="Behance"
          width={116}
          height={26}
          draggable={false}
        />
        <span className="navbar-egg" aria-hidden="true" />
      </a>
    </header>
  )
}
