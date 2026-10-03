/**
 * A reading tagged onto an object in the scene (inside drei's `<Html>`): the
 * object carries the number, the card does not (Selorm's mock review, 28 Sep).
 * Liquid glass like the HUD's; shown only inside a room cut.
 */
/** `stack` is a two-line tag (a name over a reading): squarer corners, centred. */
export default function SceneTag({ children, small, dark, wide, stack, testid }: { children: React.ReactNode; small?: boolean; dark?: boolean; wide?: boolean; stack?: boolean; testid?: string }) {
  return (
    <span
      className={`lg ${dark ? 'lg-dark' : ''}`}
      data-testid={testid}
      style={{
        display: 'inline-block',
        whiteSpace: 'nowrap',
        padding: small ? '3px 9px' : wide ? '6px 14px' : '5px 12px',
        borderRadius: stack ? 12 : 999,
        textAlign: stack ? 'center' : undefined,
        lineHeight: stack ? 1.25 : undefined,
        font: `900 ${small ? 11 : wide ? 13.5 : 13}px Nunito, ui-rounded, system-ui, sans-serif`,
        color: dark ? '#F6F2E8' : '#2A2823',
        boxShadow: '0 8px 20px -10px rgba(40,26,10,.6)',
      }}
    >
      {children}
    </span>
  )
}
