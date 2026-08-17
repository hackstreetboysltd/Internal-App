"use client";

/**
 * Primary action button that disables and shows a spinner while work is in flight.
 */
export default function BusyButton({
  busy = false,
  busyLabel = "Saving…",
  children,
  disabled = false,
  type = "button",
  className,
  style,
  ...props
}) {
  const isBusy = Boolean(busy);
  return (
    <button
      type={type}
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      className={className}
      style={style}
      {...props}
    >
      {isBusy ? (
        <>
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
          {" "}
          {busyLabel}
        </>
      ) : children}
    </button>
  );
}
