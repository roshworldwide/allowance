// Fixed ambient layers behind every page: slow aurora, film grain and a vignette. CSS-only
// (transform animations on three blurred blobs), so it costs nothing on the main thread.
export function Ambient() {
  return (
    <>
      <div className="aurora" aria-hidden>
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />
    </>
  );
}
