import pathlib

path = pathlib.Path('frontend/src/dashboard/project/components/Gallery/GalleryTrigger.tsx')
text = path.read_text()
anchor = "interface GalleryTriggerProps {\r\n  galleries: Gallery[];\r\n  onOpenModal: () => void;\r\n}\r\n\r\n"
hook = "const useCompactGalleryLayout = () => {\r\n  const query = '(max-width: 768px)';\r\n  const [isCompact, setIsCompact] = React.useState(() => {\r\n    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {\r\n      return false;\r\n    }\r\n\r\n    return window.matchMedia(query).matches;\r\n  });\r\n\r\n  React.useEffect(() => {\r\n    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {\r\n      return undefined;\r\n    }\r\n\r\n    const mediaQuery = window.matchMedia(query);\r\n\r\n    const updateMatches = (event: MediaQueryList | MediaQueryListEvent) => {\r\n      setIsCompact(event.matches);\r\n    };\r\n\r\n    updateMatches(mediaQuery);\r\n\r\n    if (typeof mediaQuery.addEventListener === 'function') {\r\n      mediaQuery.addEventListener('change', updateMatches);\r\n      return () => mediaQuery.removeEventListener('change', updateMatches);\r\n    }\r\n\r\n    const legacyListener = (event: MediaQueryListEvent) => updateMatches(event);\r\n    mediaQuery.addListener(legacyListener);\r\n    return () => mediaQuery.removeListener(legacyListener);\r\n  }, [query]);\r\n\r\n  return isCompact;\r\n};\r\n\r\n"

if anchor not in text:
  raise SystemExit('anchor not found')

if hook.strip() in text:
  raise SystemExit('hook already inserted')

text = text.replace(anchor, anchor + hook)
path.write_text(text)
