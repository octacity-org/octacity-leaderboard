const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** Vector redraw of the official Octacity ship's wheel, traced from public/logo.png. */
export function Wheel(props: { turn: number; class?: string }) {
  return (
    <svg
      class={["wheel", props.class]}
      viewBox="0 0 200 200"
      aria-hidden="true"
      style={{ transform: `rotate(${props.turn * 45}deg)` }}
    >
      <g fill="none" stroke="currentColor" stroke-width="6.5">
        <circle cx="100" cy="100" r="50.5" />
        <circle cx="100" cy="100" r="9.5" />
        {ANGLES.map((angle) => (
          <g transform={`rotate(${angle} 100 100)`}>
            <line x1="100" y1="87.5" x2="100" y2="57.5" />
            <line x1="100" y1="50.5" x2="100" y2="22.5" stroke-linecap="round" />
          </g>
        ))}
      </g>
    </svg>
  );
}
