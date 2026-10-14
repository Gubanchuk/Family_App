import type { PointerEvent, ReactNode, Ref } from 'react';
import type { Overlay } from './types';
import { inkOn } from './inkOn';

export function OverlayView({ o, selected, onPointerDown }: { o: Overlay; selected?: boolean; onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void }) {
  const style = { left: `${o.x * 100}%`, top: `${o.y * 100}%`, transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`, fontSize: `${o.scale * 100}cqw` };
  if (o.type === 'emoji') return <div className={`sf-item emoji${selected ? ' on' : ''}`} style={style} onPointerDown={onPointerDown}>{o.char}</div>;
  const plate = o.style === 'box' ? { background: o.color, color: inkOn(o.color) } : { color: o.color };
  return <div className={`sf-item t-${o.style}${selected ? ' on' : ''}`} style={{ ...style, ...plate }} onPointerDown={onPointerDown}>{o.text}</div>;
}

// Always 9:16, so captions sit in the same place on every phone. The picture fits inside whole;
// for a photo the free space is filled with a blurred copy of it.
export default function StoryFrame({ kind, src, overlays, videoRef, onReady, children }: {
  kind: 'photo' | 'video'; src: string | null; overlays: Overlay[]; videoRef?: Ref<HTMLVideoElement>; onReady?: () => void; children?: ReactNode;
}) {
  return (
    <div className="sf">
      {src && kind === 'photo' ? (
        <>
          <img className="sf-bg" src={src} alt="" aria-hidden="true" />
          <img className="sf-media" data-testid="story-media" src={src} alt="" onLoad={onReady} />
        </>
      ) : null}
      {src && kind === 'video' ? <video className="sf-media" data-testid="story-media" ref={videoRef} src={src} playsInline preload="auto" onLoadedData={onReady} /> : null}
      {overlays.map((o) => <OverlayView key={o.id} o={o} />)}
      {children}
    </div>
  );
}
