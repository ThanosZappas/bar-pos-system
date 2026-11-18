import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { drawFrame, MAX_ZOOM, MIN_ZOOM, NO_FRAME, renderPhoto, type Frame } from '../lib/photo';

const SIDE = 320; // the frame on screen, CSS pixels

/**
 * Place a picture in the profile's square frame before it is saved: drag to move, scroll or the
 * slider to zoom, rotate by quarter turns, and straighten a slightly tilted photo.
 */
export function PhotoCropper({ image, onCancel, onDone }: { image: ImageBitmap; onCancel: () => void; onDone: (base64: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState<Frame>(NO_FRAME);
  const [turns, setTurns] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const shown: Frame = { ...frame, rotation: turns * 90 + tilt };

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = SIDE * ratio;
    c.height = SIDE * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawFrame(ctx, image, shown, SIDE);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.3)';
    ctx.lineWidth = 1;
    for (const i of [1, 2]) {
      ctx.beginPath();
      ctx.moveTo((SIDE / 3) * i, 0);
      ctx.lineTo((SIDE / 3) * i, SIDE);
      ctx.moveTo(0, (SIDE / 3) * i);
      ctx.lineTo(SIDE, (SIDE / 3) * i);
      ctx.stroke();
    }
  }, [image, frame, turns, tilt]);

  const zoomTo = (z: number) => setFrame((f) => ({ ...f, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) }));

  async function use() {
    setBusy(true);
    try {
      onDone(await renderPhoto(image, shown, SIDE));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="cropper-backdrop" role="dialog" aria-modal="true" aria-label={t('crop.title')}>
      <div class="cropper card">
        <h2 class="section-label">{t('crop.title')}</h2>
        <p class="field-hint">{t('crop.hint')}</p>
        <canvas
          ref={canvas}
          class="cropper-frame"
          style={{ width: `${SIDE}px`, height: `${SIDE}px` }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setFrame((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => {
            e.preventDefault();
            zoomTo(frame.zoom * Math.exp(-e.deltaY / 500));
          }}
        />
        <label class="field">
          <span class="field-label">{t('crop.zoom')}</span>
          <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={frame.zoom} onInput={(e) => zoomTo(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label class="field">
          <span class="field-label">{t('crop.straighten')}</span>
          <input type="range" min={-45} max={45} step={0.5} value={tilt} onInput={(e) => setTilt(Number((e.target as HTMLInputElement).value))} />
        </label>
        <span class="buttons">
          <button type="button" class="link" onClick={() => setTurns((n) => n - 1)}>{t('crop.rotateLeft')}</button>
          <button type="button" class="link" onClick={() => setTurns((n) => n + 1)}>{t('crop.rotateRight')}</button>
          <button type="button" class="link" onClick={() => { setFrame(NO_FRAME); setTurns(0); setTilt(0); }}>{t('crop.reset')}</button>
        </span>
        <span class="buttons">
          <button type="button" class="primary" disabled={busy} onClick={use}>{t('crop.use')}</button>
          <button type="button" class="link" onClick={onCancel}>{t('users.cancel')}</button>
        </span>
      </div>
    </div>
  );
}
